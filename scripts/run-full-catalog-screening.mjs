import { createHash, randomUUID } from 'node:crypto';
import {
    link,
    lstat,
    open,
    readFile,
    realpath,
    stat,
    unlink
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import * as satellite from 'satellite.js';

import { screenFullCatalog } from '../js/conjunction/fullCatalogScreening.js';
import { adaptOrbitalSource } from '../js/domain/orbitalSourceAdapters.js';
import {
    ORBITAL_SOURCE_FORMAT,
    V21_SCHEMA_VERSION,
    normalizeScreeningJobRequest
} from '../js/domain/v21Contracts.js';
import { createMultiFormatPropagationService } from '../js/orbit/multiFormatPropagationService.js';
import { createTlePropagationService } from '../js/orbit/propagationService.js';

const MAX_ENVELOPE_BYTES = 2 * 1024 * 1024;
const MAX_CATALOG_BYTES = 100 * 1024 * 1024;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const SHA256_PATTERN = /^sha256:([a-f0-9]{64})$/;
const JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const JSON_SOURCE_FORMATS = new Set([
    ORBITAL_SOURCE_FORMAT.TLE_JSON,
    ORBITAL_SOURCE_FORMAT.CCSDS_OMM_JSON,
    ORBITAL_SOURCE_FORMAT.PROVIDER_EPHEMERIS_JSON
]);

class RunnerError extends Error {
    constructor(code, message, stage = 'RUNNER_VALIDATION') {
        super(message);
        this.name = 'RunnerError';
        this.code = code;
        this.stage = stage;
    }
}

function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value, label, maximum = 500) {
    if (typeof value !== 'string') {
        throw new RunnerError('RUNNER_ENVELOPE_INVALID', `${label} must be a string.`);
    }
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum || /[\r\n\0]/.test(normalized)) {
        throw new RunnerError(
            'RUNNER_ENVELOPE_INVALID',
            `${label} must contain 1 to ${maximum} safe characters.`
        );
    }
    return normalized;
}

function optionalText(value, label, maximum = 2_000) {
    if (value === undefined || value === null) return null;
    return requiredText(value, label, maximum);
}

function parseArguments(argv) {
    const values = new Map();
    const allowed = new Set(['--input', '--output', '--runtime-root']);
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!allowed.has(key) || value === undefined || value.startsWith('--') || values.has(key)) {
            throw new RunnerError(
                'RUNNER_ARGUMENT_INVALID',
                'Expected exactly one --input, --output, and --runtime-root argument.',
                'ARGUMENTS'
            );
        }
        values.set(key, value);
    }
    if (values.size !== allowed.size || argv.length !== allowed.size * 2) {
        throw new RunnerError(
            'RUNNER_ARGUMENT_INVALID',
            'Expected exactly one --input, --output, and --runtime-root argument.',
            'ARGUMENTS'
        );
    }
    return {
        input: values.get('--input'),
        output: values.get('--output'),
        runtimeRoot: values.get('--runtime-root')
    };
}

function isWithinRoot(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function lexicalPathWithinRoot(root, supplied, label) {
    const value = requiredText(supplied, label, 4_096);
    const candidate = path.resolve(path.isAbsolute(value) ? value : path.join(root, value));
    if (!isWithinRoot(root, candidate)) {
        throw new RunnerError('RUNNER_PATH_OUTSIDE_RUNTIME', `${label} must remain inside the runtime root.`, 'PATH');
    }
    return candidate;
}

async function existingPathWithinRoot(root, supplied, label) {
    const candidate = lexicalPathWithinRoot(root, supplied, label);
    let resolved;
    try {
        resolved = await realpath(candidate);
    } catch {
        throw new RunnerError('RUNNER_PATH_MISSING', `${label} does not exist.`, 'PATH');
    }
    if (!isWithinRoot(root, resolved)) {
        throw new RunnerError('RUNNER_PATH_OUTSIDE_RUNTIME', `${label} must remain inside the runtime root.`, 'PATH');
    }
    return resolved;
}

async function outputPathWithinRoot(root, supplied) {
    const candidate = lexicalPathWithinRoot(root, supplied, 'output path');
    const parent = path.dirname(candidate);
    let resolvedParent;
    try {
        resolvedParent = await realpath(parent);
    } catch {
        throw new RunnerError('RUNNER_OUTPUT_DIRECTORY_MISSING', 'The output directory does not exist.', 'PATH');
    }
    if (!isWithinRoot(root, resolvedParent)) {
        throw new RunnerError('RUNNER_PATH_OUTSIDE_RUNTIME', 'output path must remain inside the runtime root.', 'PATH');
    }
    return path.join(resolvedParent, path.basename(candidate));
}

async function readBounded(filePath, maximumBytes, code, label) {
    let details;
    try {
        details = await stat(filePath);
    } catch {
        throw new RunnerError(code, `${label} is unavailable.`, 'READ_INPUT');
    }
    if (!details.isFile() || details.size < 2 || details.size > maximumBytes) {
        throw new RunnerError(
            code,
            `${label} must be a regular file containing 2 to ${maximumBytes} bytes.`,
            'READ_INPUT'
        );
    }
    let bytes;
    try {
        bytes = await readFile(filePath);
    } catch {
        throw new RunnerError(code, `${label} could not be read.`, 'READ_INPUT');
    }
    if (bytes.length < 2 || bytes.length > maximumBytes) {
        throw new RunnerError(code, `${label} changed outside its supported size bound.`, 'READ_INPUT');
    }
    return bytes;
}

function decodeUtf8(bytes, code, label) {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        throw new RunnerError(code, `${label} must be valid UTF-8.`, 'PARSE_INPUT');
    }
}

function parseJson(bytes, code, label) {
    const text = decodeUtf8(bytes, code, label);
    try {
        return JSON.parse(text);
    } catch {
        throw new RunnerError(code, `${label} must contain valid JSON.`, 'PARSE_INPUT');
    }
}

function sha256(bytes) {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function validateCatalogRevision(value) {
    if (!isRecord(value)) {
        throw new RunnerError('RUNNER_ENVELOPE_INVALID', 'catalog_revision must be an object.');
    }
    const datasetHash = requiredText(value.dataset_hash, 'catalog_revision.dataset_hash', 80).toLowerCase();
    const digestMatch = datasetHash.match(SHA256_PATTERN);
    if (!digestMatch) {
        throw new RunnerError(
            'RUNNER_ENVELOPE_INVALID',
            'catalog_revision.dataset_hash must be a SHA-256 content digest.'
        );
    }
    const revisionId = requiredText(value.revision_id, 'catalog_revision.revision_id', 100);
    if (revisionId !== `catalog:sha256:${digestMatch[1]}`) {
        throw new RunnerError(
            'CATALOG_REVISION_IDENTITY_MISMATCH',
            'catalog_revision.revision_id must identify the immutable snapshot digest.'
        );
    }
    const sourceFormat = requiredText(value.source_format, 'catalog_revision.source_format', 60).toUpperCase();
    if (!Object.values(ORBITAL_SOURCE_FORMAT).includes(sourceFormat)) {
        throw new RunnerError('CATALOG_FORMAT_UNSUPPORTED', 'The catalog source format is unsupported.');
    }
    const sourceStatus = requiredText(
        value.source_status ?? 'DEGRADED',
        'catalog_revision.source_status',
        20
    ).toUpperCase();
    if (!['COMPLETE', 'PARTIAL', 'DEGRADED'].includes(sourceStatus)) {
        throw new RunnerError('RUNNER_ENVELOPE_INVALID', 'catalog_revision.source_status is invalid.');
    }
    let objectCount = null;
    if (value.object_count !== undefined && value.object_count !== null) {
        objectCount = Number(value.object_count);
        if (!Number.isInteger(objectCount) || objectCount < 1 || objectCount > 100_000) {
            throw new RunnerError(
                'RUNNER_ENVELOPE_INVALID',
                'catalog_revision.object_count must be an integer from 1 through 100000.'
            );
        }
    }
    return Object.freeze({
        revision_id: revisionId,
        snapshot_path: requiredText(value.snapshot_path, 'catalog_revision.snapshot_path', 4_096),
        source_format: sourceFormat,
        source_id: requiredText(value.source_id, 'catalog_revision.source_id', 200),
        provider: requiredText(value.provider, 'catalog_revision.provider', 300),
        dataset_id: requiredText(value.dataset_id, 'catalog_revision.dataset_id', 300),
        dataset_hash: datasetHash,
        source_status: sourceStatus,
        retrieved_at: optionalText(value.retrieved_at, 'catalog_revision.retrieved_at', 100),
        source_uri: optionalText(value.source_uri, 'catalog_revision.source_uri'),
        license_id: optionalText(value.license_id, 'catalog_revision.license_id', 300),
        object_count: objectCount
    });
}

function validateEnvelope(value) {
    if (!isRecord(value) || String(value.schema_version ?? '') !== V21_SCHEMA_VERSION) {
        throw new RunnerError(
            'RUNNER_ENVELOPE_INVALID',
            `The runner envelope must use schema_version ${V21_SCHEMA_VERSION}.`
        );
    }
    const jobId = requiredText(value.job_id, 'job_id', 200);
    if (!JOB_ID_PATTERN.test(jobId)) {
        throw new RunnerError('RUNNER_ENVELOPE_INVALID', 'job_id contains unsupported characters.');
    }
    const catalogRevision = validateCatalogRevision(value.catalog_revision);
    if (!isRecord(value.request)) {
        throw new RunnerError('RUNNER_ENVELOPE_INVALID', 'request must be an object.');
    }
    if (value.request.capability !== undefined && value.request.capability !== 'FULL_CATALOG_SCREENING') {
        throw new RunnerError('RUNNER_ENVELOPE_INVALID', 'request.capability must be FULL_CATALOG_SCREENING.');
    }
    let request;
    try {
        request = normalizeScreeningJobRequest(value.request);
    } catch (error) {
        throw new RunnerError('SCREENING_REQUEST_INVALID', error?.message ?? 'The screening request is invalid.');
    }
    if (value.request.request_hash !== undefined && value.request.request_hash !== request.request_hash) {
        throw new RunnerError('SCREENING_REQUEST_HASH_MISMATCH', 'request.request_hash does not match its content.');
    }
    if (request.catalog_revision_id !== catalogRevision.revision_id) {
        throw new RunnerError(
            'CATALOG_REVISION_IDENTITY_MISMATCH',
            'The screening request and catalog snapshot identify different revisions.'
        );
    }
    return Object.freeze({ job_id: jobId, catalog_revision: catalogRevision, request });
}

function sourceInput(bytes, format) {
    const text = decodeUtf8(bytes, 'CATALOG_ENCODING_INVALID', 'Catalog snapshot');
    if (!JSON_SOURCE_FORMATS.has(format)) return text;
    try {
        return JSON.parse(text);
    } catch {
        throw new RunnerError('CATALOG_JSON_INVALID', 'Catalog snapshot must contain valid JSON.', 'ADAPT_CATALOG');
    }
}

function adaptCatalog(bytes, revision) {
    const source = {
        source_id: revision.source_id,
        provider: revision.provider,
        retrieved_at: revision.retrieved_at,
        dataset_id: revision.dataset_id,
        dataset_hash: revision.dataset_hash,
        source_uri: revision.source_uri,
        source_status: revision.source_status,
        partial_update: revision.source_status === 'PARTIAL',
        license_id: revision.license_id
    };
    let adapted;
    try {
        adapted = adaptOrbitalSource(sourceInput(bytes, revision.source_format), {
            format: revision.source_format,
            source,
            limits: { max_input_bytes: MAX_CATALOG_BYTES }
        });
    } catch (error) {
        if (error instanceof RunnerError) throw error;
        throw new RunnerError(
            error?.code ?? 'CATALOG_ADAPTATION_FAILED',
            error?.message ?? 'Catalog adaptation failed.',
            'ADAPT_CATALOG'
        );
    }
    if (revision.object_count !== null && adapted.record_count !== revision.object_count) {
        throw new RunnerError(
            'CATALOG_RECORD_COUNT_MISMATCH',
            'The adapted catalog count does not match the immutable revision metadata.',
            'ADAPT_CATALOG'
        );
    }
    return adapted;
}

function applyCatalogScope(records, scope) {
    const objectIds = scope.object_ids === null ? null : new Set(scope.object_ids);
    const objectTypes = new Set(scope.object_types);
    const lifecycleStatuses = new Set(scope.lifecycle_statuses);
    const selected = records.filter(record =>
        (objectIds === null || objectIds.has(record.object_id)) &&
        objectTypes.has(record.object_type) &&
        lifecycleStatuses.has(record.lifecycle_status)
    );
    if (selected.length < 2) {
        throw new RunnerError(
            'CATALOG_SCOPE_INSUFFICIENT',
            'Catalog scope must select at least two propagatable objects.',
            'APPLY_SCOPE'
        );
    }
    const unsupportedFrame = selected.find(record =>
        String(record?.element_set?.native_frame ?? '').toUpperCase() !== 'TEME'
    );
    if (unsupportedFrame) {
        throw new RunnerError(
            'CATALOG_FRAME_UNSUPPORTED',
            'Full-catalog screening currently requires every selected source record to use TEME.',
            'APPLY_SCOPE'
        );
    }
    return selected;
}

function engineConfiguration(configuration) {
    return Object.freeze({
        ...configuration,
        spatial_cell_size_km: configuration.spatial_cell_size_km ?? configuration.spatial_cell_km,
        max_spatial_pair_checks_per_slab:
            configuration.max_spatial_pair_checks_per_slab ?? configuration.max_pair_checks,
        max_candidate_intervals: configuration.max_candidate_intervals ?? configuration.max_candidates
    });
}

function relativePrivatePath(root, filePath) {
    return path.relative(root, filePath).split(path.sep).join('/');
}

async function atomicWriteImmutable(filePath, bytes) {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    let handle;
    try {
        handle = await open(temporaryPath, 'wx', 0o600);
        await handle.writeFile(bytes);
        await handle.sync();
        await handle.close();
        handle = null;
        try {
            await link(temporaryPath, filePath);
        } catch (error) {
            if (error?.code !== 'EEXIST') throw error;
            const existingInfo = await lstat(filePath);
            if (!existingInfo.isFile() || existingInfo.isSymbolicLink()) {
                throw new RunnerError(
                    'OUTPUT_IMMUTABILITY_CONFLICT',
                    'The result destination already exists and is not an immutable regular file.',
                    'WRITE_RESULT'
                );
            }
            const existing = await readFile(filePath);
            if (!existing.equals(bytes)) {
                throw new RunnerError(
                    'OUTPUT_IMMUTABILITY_CONFLICT',
                    'The result destination already contains different content.',
                    'WRITE_RESULT'
                );
            }
        }
    } catch (error) {
        if (error instanceof RunnerError) throw error;
        throw new RunnerError('RESULT_WRITE_FAILED', 'The result artifact could not be written.', 'WRITE_RESULT');
    } finally {
        if (handle) await handle.close().catch(() => {});
        await unlink(temporaryPath).catch(() => {});
    }
}

function sanitizeMessage(value) {
    const oneLine = String(value ?? 'The screening runner failed.')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/[\x00-\x1f\x7f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return (oneLine || 'The screening runner failed.').slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function sanitizeCode(value) {
    const code = String(value ?? '').trim().toUpperCase();
    return /^[A-Z][A-Z0-9_]{0,79}$/.test(code) ? code : 'RUNNER_FAILED';
}

function emit(value) {
    process.stdout.write(`${JSON.stringify(value)}\n`);
}

function overallProgress(progress) {
    const stage = String(progress?.stage ?? 'RUNNING');
    const stageFraction = Math.max(0, Math.min(1, Number(progress?.fraction) || 0));
    if (stage === 'PREPARING_CATALOG') return 0.05 + 0.15 * stageFraction;
    if (['PROPAGATING_SLAB', 'SCREENING_SLAB', 'REFINING_SLAB'].includes(stage)) {
        const total = Math.max(1, Number(progress?.total) || 1);
        const completed = Math.max(0, Number(progress?.completed) || 0);
        const offset = stage === 'PROPAGATING_SLAB' ? 0 : stage === 'SCREENING_SLAB' ? 0.25 : 0.5;
        return 0.2 + 0.78 * Math.min(1, (completed + offset) / total);
    }
    if (stage === 'COMPLETED' || stage === 'PARTIAL') return 0.99;
    return stageFraction;
}

let reportedJobId = null;

async function execute(argv) {
    const args = parseArguments(argv);
    let runtimeRoot;
    try {
        runtimeRoot = await realpath(path.resolve(args.runtimeRoot));
        const rootInfo = await stat(runtimeRoot);
        if (!rootInfo.isDirectory()) throw new Error('not a directory');
    } catch {
        throw new RunnerError('RUNTIME_ROOT_INVALID', 'The runtime root must be an existing directory.', 'PATH');
    }

    const inputPath = await existingPathWithinRoot(runtimeRoot, args.input, 'input path');
    const outputPath = await outputPathWithinRoot(runtimeRoot, args.output);
    const envelopeBytes = await readBounded(
        inputPath,
        MAX_ENVELOPE_BYTES,
        'RUNNER_ENVELOPE_UNAVAILABLE',
        'Runner envelope'
    );
    const envelope = validateEnvelope(parseJson(
        envelopeBytes,
        'RUNNER_ENVELOPE_INVALID',
        'Runner envelope'
    ));
    reportedJobId = envelope.job_id;
    const snapshotPath = await existingPathWithinRoot(
        runtimeRoot,
        envelope.catalog_revision.snapshot_path,
        'catalog snapshot path'
    );
    const catalogBytes = await readBounded(
        snapshotPath,
        MAX_CATALOG_BYTES,
        'CATALOG_SNAPSHOT_UNAVAILABLE',
        'Catalog snapshot'
    );
    if (sha256(catalogBytes) !== envelope.catalog_revision.dataset_hash) {
        throw new RunnerError(
            'CATALOG_CHECKSUM_MISMATCH',
            'Catalog snapshot content does not match the immutable revision digest.',
            'VERIFY_CATALOG'
        );
    }

    let progressSequence = 0;
    let lastProgressFraction = 0;
    const emitProgress = progress => {
        progressSequence += 1;
        const fraction = Math.max(lastProgressFraction, overallProgress(progress));
        lastProgressFraction = fraction;
        emit({
            schema_version: V21_SCHEMA_VERSION,
            type: 'progress',
            job_id: envelope.job_id,
            sequence: progressSequence,
            progress: {
                ...progress,
                stage_fraction: progress.fraction,
                fraction
            }
        });
    };
    emitProgress({ stage: 'ADAPTING_CATALOG', completed: 0, total: 1, fraction: 0 });
    const adapted = adaptCatalog(catalogBytes, envelope.catalog_revision);
    const catalog = applyCatalogScope(adapted.records, envelope.request.catalog_scope);
    emitProgress({
        stage: 'CATALOG_READY',
        completed: adapted.record_count,
        total: adapted.record_count,
        fraction: 0.05,
        scoped_record_count: catalog.length
    });

    const propagationService = envelope.catalog_revision.source_format === ORBITAL_SOURCE_FORMAT.TLE_JSON
        ? createTlePropagationService({ satelliteLib: satellite })
        : createMultiFormatPropagationService({
            satelliteLib: satellite,
            allowedTabulatedFrames: ['TEME']
        });
    const result = await screenFullCatalog({
        request_id: envelope.job_id,
        requested_at: envelope.request.configuration.start_time,
        start_time: envelope.request.configuration.start_time,
        time_scale: 'UTC',
        frame: 'TEME',
        dataset_id: envelope.catalog_revision.dataset_id,
        dataset_hash: envelope.catalog_revision.dataset_hash,
        dataset_provenance: adapted.provenance,
        catalog,
        options: engineConfiguration(envelope.request.configuration)
    }, {
        propagationService,
        onProgress: emitProgress
    });

    const artifact = {
        ...result,
        catalog_revision_id: envelope.catalog_revision.revision_id,
        snapshot_identity: {
            revision_id: envelope.catalog_revision.revision_id,
            dataset_id: envelope.catalog_revision.dataset_id,
            dataset_hash: envelope.catalog_revision.dataset_hash,
            source_format: envelope.catalog_revision.source_format,
            source_record_count: adapted.record_count,
            scoped_record_count: catalog.length,
            request_hash: envelope.request.request_hash
        }
    };
    const resultBytes = Buffer.from(`${JSON.stringify(artifact)}\n`, 'utf8');
    await atomicWriteImmutable(outputPath, resultBytes);
    emit({
        schema_version: V21_SCHEMA_VERSION,
        type: 'result',
        job_id: envelope.job_id,
        output_path: relativePrivatePath(runtimeRoot, outputPath),
        result_sha256: sha256(resultBytes),
        byte_length: resultBytes.length,
        scientific_status: result.status
    });
}

try {
    await execute(process.argv.slice(2));
} catch (error) {
    emit({
        schema_version: V21_SCHEMA_VERSION,
        type: 'error',
        job_id: reportedJobId,
        error: {
            code: sanitizeCode(error?.code),
            message: sanitizeMessage(error?.message),
            stage: sanitizeCode(error?.stage ?? 'RUNNER'),
            recoverable: false
        }
    });
    process.exitCode = 1;
}
