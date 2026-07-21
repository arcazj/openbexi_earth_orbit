import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as satellite from 'satellite.js';

import { screenFullCatalog } from '../js/conjunction/fullCatalogScreening.js';
import { parseTleJson } from '../js/domain/orbitalSourceAdapters.js';
import { createTlePropagationService } from '../js/orbit/propagationService.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CATALOG = path.join(ROOT, 'json', 'tle', 'TLE.json');
const DEFAULT_META = path.join(ROOT, 'json', 'tle', 'TLE.meta.json');
const RELEASE = JSON.parse(await readFile(path.join(ROOT, 'release', 'version.json'), 'utf8'));

function fail(message) {
    throw new TypeError(`Full-catalog benchmark: ${message}`);
}

function parseInteger(value, name, minimum, maximum) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
        fail(`${name} must be an integer from ${minimum} through ${maximum}.`);
    }
    return parsed;
}

function parseNumber(value, name, minimum, maximum) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
        fail(`${name} must be a number from ${minimum} through ${maximum}.`);
    }
    return parsed;
}

function parseArguments(argv) {
    const values = new Map();
    const booleanFlags = new Set(['--help']);
    const allowed = new Set([
        '--catalog', '--meta', '--output', '--limit', '--start-time', '--horizon-seconds',
        '--coarse-step-seconds', '--screening-radius-km', '--help'
    ]);
    for (let index = 0; index < argv.length; index += 1) {
        const key = argv[index];
        if (!allowed.has(key) || values.has(key)) fail(`unsupported or duplicate argument ${key}.`);
        if (booleanFlags.has(key)) {
            values.set(key, true);
            continue;
        }
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) fail(`${key} requires a value.`);
        values.set(key, value);
        index += 1;
    }
    return {
        help: values.has('--help'),
        catalog: path.resolve(values.get('--catalog') ?? DEFAULT_CATALOG),
        meta: path.resolve(values.get('--meta') ?? DEFAULT_META),
        output: values.has('--output') ? path.resolve(values.get('--output')) : null,
        limit: values.has('--limit') ? parseInteger(values.get('--limit'), '--limit', 2, 100_000) : null,
        startTime: values.get('--start-time') ?? '2026-07-20T12:00:00.000Z',
        horizonSeconds: parseInteger(values.get('--horizon-seconds') ?? 60, '--horizon-seconds', 1, 86_400),
        coarseStepSeconds: parseInteger(values.get('--coarse-step-seconds') ?? 60, '--coarse-step-seconds', 1, 3_600),
        screeningRadiusKm: parseNumber(values.get('--screening-radius-km') ?? 10, '--screening-radius-km', 0.001, 10_000)
    };
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function round(value, digits = 3) {
    if (!Number.isFinite(value)) return null;
    return Number(value.toFixed(digits));
}

function ratio(numerator, denominator) {
    return denominator > 0 ? numerator / denominator : 0;
}

function gitState() {
    const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
    const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
    return {
        head_revision: revision.status === 0 ? revision.stdout.trim() : null,
        working_tree_dirty: dirty.status === 0 ? dirty.stdout.trim().length > 0 : null
    };
}

function memorySnapshot() {
    const usage = process.memoryUsage();
    return {
        rss_bytes: usage.rss,
        heap_used_bytes: usage.heapUsed,
        heap_total_bytes: usage.heapTotal,
        external_bytes: usage.external
    };
}

async function writeAtomic(filePath, content) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, filePath);
}

function usage() {
    return `Usage: node scripts/benchmark-full-catalog.mjs [options]\n\n` +
        `  --catalog PATH                TLE JSON catalog (default: json/tle/TLE.json)\n` +
        `  --meta PATH                   source metadata JSON\n` +
        `  --output PATH                 write the JSON report atomically\n` +
        `  --limit COUNT                 deterministically use the first COUNT objects\n` +
        `  --start-time ISO              screening start (default: 2026-07-20T12:00:00.000Z)\n` +
        `  --horizon-seconds COUNT       horizon (default: 60)\n` +
        `  --coarse-step-seconds COUNT   slab size (default: 60)\n` +
        `  --screening-radius-km NUMBER  event radius (default: 10)\n`;
}

async function main() {
    const args = parseArguments(process.argv.slice(2));
    if (args.help) {
        process.stdout.write(usage());
        return;
    }
    if (!Number.isFinite(Date.parse(args.startTime))) fail('--start-time must be an ISO 8601 instant.');
    if (args.coarseStepSeconds > args.horizonSeconds) {
        fail('--coarse-step-seconds cannot exceed --horizon-seconds.');
    }

    const [catalogBytes, metaBytes] = await Promise.all([readFile(args.catalog), readFile(args.meta)]);
    const sourceMeta = JSON.parse(metaBytes.toString('utf8'));
    const catalogInput = JSON.parse(catalogBytes.toString('utf8'));
    const sourceDigest = sha256(catalogBytes);
    const source = {
        source_id: 'celestrak-active-and-recent-local-snapshot',
        provider: 'CelesTrak snapshot maintained by OpenBEXI Earth Orbit',
        retrieved_at: sourceMeta.fetched_at ?? null,
        dataset_id: `dataset:sha256:${sourceDigest}`,
        dataset_hash: `sha256:${sourceDigest}`,
        source_uri: null,
        source_status: sourceMeta.last_status === 'ok' ? 'COMPLETE' : 'DEGRADED',
        partial_update: sourceMeta.mode === 'incremental',
        license_id: 'licensing-review-pending'
    };
    const adapted = parseTleJson(catalogInput, {
        source,
        limits: { max_input_bytes: 100 * 1024 * 1024 }
    });
    const catalog = [...adapted.records]
        .sort((left, right) => left.object_id.localeCompare(right.object_id))
        .slice(0, args.limit ?? adapted.records.length);

    const configuration = {
        horizon_seconds: args.horizonSeconds,
        coarse_step_seconds: args.coarseStepSeconds,
        screening_radius_km: args.screeningRadiusKm,
        refinement_tolerance_seconds: 0.25,
        refinement_subdivisions: 8,
        max_refinement_iterations: 48,
        max_relative_acceleration_km_s2: 0.024516625,
        coarse_padding_km: 0,
        spatial_cell_size_km: 250,
        max_cells_per_object: 512,
        max_cell_memberships_per_slab: 5_000_000,
        max_spatial_pair_checks_per_slab: 5_000_000,
        max_candidate_intervals: 250_000,
        max_persisted_candidates: 100_000,
        max_results: 10_000,
        max_detected_events: 50_000,
        yield_every_operations: 2_000
    };
    const request = {
        request_id: `benchmark:${RELEASE.version}:${sourceDigest.slice(0, 16)}:${catalog.length}`,
        requested_at: args.startTime,
        start_time: args.startTime,
        time_scale: 'UTC',
        frame: 'TEME',
        dataset_id: source.dataset_id,
        dataset_hash: source.dataset_hash,
        dataset_provenance: adapted.provenance,
        catalog,
        options: configuration
    };

    if (globalThis.gc) globalThis.gc();
    const before = memorySnapshot();
    let peak = { ...before };
    const sampleMemory = () => {
        const sample = memorySnapshot();
        for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], sample[key]);
    };
    const started = process.hrtime.bigint();
    const result = await screenFullCatalog(request, {
        propagationService: createTlePropagationService({ satelliteLib: satellite }),
        now: () => new Date(args.startTime),
        onProgress: sampleMemory,
        yieldControl: async () => {
            sampleMemory();
            await new Promise(resolve => setImmediate(resolve));
        }
    });
    const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
    sampleMemory();
    const after = memorySnapshot();
    const statistics = result.statistics;
    const resultBytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
    const report = {
        schema_version: '1.0.0',
        evidence_class: 'development-performance-observation',
        scientific_maturity: 'experimental',
        safety_class: 'non-operational',
        accuracy_claim: false,
        generated_at: new Date().toISOString(),
        application_version: RELEASE.version,
        publication_state: RELEASE.publicationState,
        source: {
            catalog_path: path.relative(ROOT, args.catalog).split(path.sep).join('/'),
            metadata_path: path.relative(ROOT, args.meta).split(path.sep).join('/'),
            catalog_sha256: sourceDigest,
            fetched_at: sourceMeta.fetched_at ?? null,
            source_record_count: adapted.record_count,
            selected_record_count: catalog.length
        },
        configuration,
        environment: {
            platform: process.platform,
            operating_system: `${os.type()} ${os.release()}`,
            architecture: process.arch,
            cpu_model: os.cpus()[0]?.model ?? null,
            logical_cpu_count: os.cpus().length,
            total_memory_bytes: os.totalmem(),
            node_version: process.version,
            ...gitState()
        },
        measurement: {
            wall_time_seconds: round(durationSeconds, 6),
            objects_per_second: round(catalog.length / durationSeconds),
            pair_intervals_per_second: round(statistics.pair_intervals_total / durationSeconds),
            result_bytes: resultBytes,
            memory_before: before,
            memory_after: after,
            memory_peak_observed: peak,
            peak_rss_increase_bytes: Math.max(0, peak.rss_bytes - before.rss_bytes),
            peak_heap_used_increase_bytes: Math.max(0, peak.heap_used_bytes - before.heap_used_bytes)
        },
        reduction: {
            spatial_checks_per_pair_interval: round(ratio(
                statistics.spatial_pair_checks,
                statistics.pair_intervals_with_valid_endpoints
            ), 9),
            spatial_check_reduction_fraction: round(1 - ratio(
                statistics.spatial_pair_checks,
                statistics.pair_intervals_with_valid_endpoints
            ), 9),
            coarse_candidates_per_valid_pair_interval: round(ratio(
                statistics.coarse_candidates,
                statistics.pair_intervals_with_valid_endpoints
            ), 12),
            coarse_candidate_reduction_fraction: round(1 - ratio(
                statistics.coarse_candidates,
                statistics.pair_intervals_with_valid_endpoints
            ), 12)
        },
        result: {
            status: result.status,
            quality_flags: result.quality_flags,
            statistics,
            candidate_count: result.candidates.length,
            event_count: result.events.length,
            error_count: result.errors.length
        },
        interpretation: {
            recall_evidence: 'tests/fullCatalogScreening.test.js compares broad-phase candidates with a deterministic brute-force chord oracle.',
            limitations: [
                'This is one local wall-clock observation, not a portable performance guarantee.',
                'A PARTIAL result is expected when source records fail propagation or violate configured motion bounds; unscreened intervals are reported explicitly.',
                'The run does not validate collision probability, covariance handling, or operational decision quality.',
                'The source snapshot licensing and independent scientific review gates remain open.'
            ]
        }
    };
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (args.output) await writeAtomic(args.output, serialized);
    process.stdout.write(serialized);
}

main().catch(error => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
});
