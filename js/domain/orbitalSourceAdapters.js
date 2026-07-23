import { validateTlePair } from './catalogValidation.js';
import { normalizeDatasetProvenance } from './contracts.js';
import {
    catalogObjectId,
    elementSetId,
    normalizeInternationalDesignator,
    normalizeNoradId,
    stableFingerprint
} from './objectIdentity.js';
import {
    LIFECYCLE_STATUS,
    OBJECT_TYPE,
    ORBIT_CLASS,
    REFERENCE_FRAME,
    TIME_SCALE,
    normalizeLifecycleStatus,
    normalizeObjectType,
    normalizeOrbitClass,
    normalizeUtcInstant
} from './orbitalPolicy.js';
import { ORBITAL_SOURCE_FORMAT, V21_SCHEMA_VERSION } from './v21Contracts.js';

export const ORBITAL_SOURCE_ADAPTER_VERSION = '2.1.0';

export const ORBITAL_SOURCE_LIMITS = Object.freeze({
    max_input_bytes: 32 * 1024 * 1024,
    max_records: 100_000,
    max_kvn_lines: 250_000,
    max_line_bytes: 16_384,
    max_ephemeris_samples: 20_000,
    max_satcat_records: 200_000
});

export const ORBITAL_SOURCE_ERROR_CODE = Object.freeze({
    FORMAT_REQUIRED: 'ORBITAL_SOURCE_FORMAT_REQUIRED',
    FORMAT_UNSUPPORTED: 'ORBITAL_SOURCE_FORMAT_UNSUPPORTED',
    INPUT_INVALID: 'ORBITAL_SOURCE_INPUT_INVALID',
    INPUT_TOO_LARGE: 'ORBITAL_SOURCE_INPUT_TOO_LARGE',
    RECORD_LIMIT_EXCEEDED: 'ORBITAL_SOURCE_RECORD_LIMIT_EXCEEDED',
    RECORD_MALFORMED: 'ORBITAL_SOURCE_RECORD_MALFORMED',
    KVN_MALFORMED: 'ORBITAL_SOURCE_KVN_MALFORMED',
    DUPLICATE_FIELD: 'ORBITAL_SOURCE_DUPLICATE_FIELD',
    IDENTITY_AMBIGUOUS: 'ORBITAL_SOURCE_IDENTITY_AMBIGUOUS',
    METADATA_REQUIRED: 'ORBITAL_SOURCE_METADATA_REQUIRED',
    FRAME_UNSUPPORTED: 'ORBITAL_SOURCE_FRAME_UNSUPPORTED',
    TIME_SCALE_UNSUPPORTED: 'ORBITAL_SOURCE_TIME_SCALE_UNSUPPORTED',
    UNITS_UNSUPPORTED: 'ORBITAL_SOURCE_UNITS_UNSUPPORTED',
    THEORY_UNSUPPORTED: 'ORBITAL_SOURCE_THEORY_UNSUPPORTED',
    SAMPLE_INVALID: 'ORBITAL_SOURCE_SAMPLE_INVALID',
    SAMPLE_ORDER_INVALID: 'ORBITAL_SOURCE_SAMPLE_ORDER_INVALID',
    SATCAT_AMBIGUOUS: 'ORBITAL_SOURCE_SATCAT_AMBIGUOUS',
    SATCAT_CONFLICT: 'ORBITAL_SOURCE_SATCAT_CONFLICT'
});

export class OrbitalSourceAdapterError extends TypeError {
    constructor(code, message, path = '$') {
        super(message);
        this.name = 'OrbitalSourceAdapterError';
        this.code = code;
        this.path = path;
    }
}

const SUPPORTED_TABULATED_FRAMES = new Set([
    REFERENCE_FRAME.TEME,
    REFERENCE_FRAME.GCRF,
    REFERENCE_FRAME.ITRF
]);

const OMM_REQUIRED_NUMBERS = Object.freeze({
    MEAN_MOTION: { minimum: Number.MIN_VALUE, maximum: 25 },
    ECCENTRICITY: { minimum: 0, maximum: 1, exclusiveMaximum: true },
    INCLINATION: { minimum: 0, maximum: 180 },
    RA_OF_ASC_NODE: {},
    ARG_OF_PERICENTER: {},
    MEAN_ANOMALY: {},
    BSTAR: {},
    MEAN_MOTION_DOT: {},
    MEAN_MOTION_DDOT: {}
});

function fail(code, message, path = '$') {
    throw new OrbitalSourceAdapterError(code, message, path);
}

function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
}

function cloneJsonValue(value, path = '$', ancestors = new WeakSet(), depth = 0) {
    if (depth > 32) fail(ORBITAL_SOURCE_ERROR_CODE.INPUT_INVALID, 'JSON nesting exceeds 32 levels.', path);
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) fail(ORBITAL_SOURCE_ERROR_CODE.INPUT_INVALID, 'JSON numbers must be finite.', path);
        return value;
    }
    if (!value || typeof value !== 'object') {
        fail(ORBITAL_SOURCE_ERROR_CODE.INPUT_INVALID, 'Input must contain JSON-compatible values.', path);
    }
    if (ancestors.has(value)) fail(ORBITAL_SOURCE_ERROR_CODE.INPUT_INVALID, 'Cyclic JSON input is not supported.', path);
    ancestors.add(value);
    let clone;
    if (Array.isArray(value)) {
        clone = value.map((item, index) => cloneJsonValue(item, `${path}[${index}]`, ancestors, depth + 1));
    } else {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            fail(ORBITAL_SOURCE_ERROR_CODE.INPUT_INVALID, 'Input records must be plain JSON objects.', path);
        }
        clone = {};
        for (const [key, item] of Object.entries(value)) {
            clone[key] = cloneJsonValue(item, `${path}.${key}`, ancestors, depth + 1);
        }
    }
    ancestors.delete(value);
    return clone;
}

function exactJsonCopy(value) {
    return deepFreeze(cloneJsonValue(value));
}

function inputText(input) {
    if (typeof input === 'string') return input;
    try {
        return JSON.stringify(cloneJsonValue(input));
    } catch (error) {
        if (error instanceof OrbitalSourceAdapterError) throw error;
        fail(ORBITAL_SOURCE_ERROR_CODE.INPUT_INVALID, `Input cannot be serialized as JSON: ${error.message}`);
    }
}

function byteLength(value) {
    return new TextEncoder().encode(value).byteLength;
}

function mergedLimits(overrides = {}) {
    if (!isRecord(overrides)) fail(ORBITAL_SOURCE_ERROR_CODE.INPUT_INVALID, 'limits must be an object.', '$.limits');
    const limits = { ...ORBITAL_SOURCE_LIMITS };
    for (const key of Object.keys(limits)) {
        if (overrides[key] === undefined) continue;
        const value = Number(overrides[key]);
        if (!Number.isInteger(value) || value < 1) {
            fail(ORBITAL_SOURCE_ERROR_CODE.INPUT_INVALID, `${key} must be a positive integer.`, `$.limits.${key}`);
        }
        limits[key] = value;
    }
    return Object.freeze(limits);
}

function enforceInputBound(input, limits) {
    const bytes = byteLength(inputText(input));
    if (bytes > limits.max_input_bytes) {
        fail(
            ORBITAL_SOURCE_ERROR_CODE.INPUT_TOO_LARGE,
            `Orbital source contains ${bytes} bytes; maximum is ${limits.max_input_bytes}.`
        );
    }
    return bytes;
}

function text(value, label, path = '$') {
    const normalized = String(value ?? '').trim();
    if (!normalized) fail(ORBITAL_SOURCE_ERROR_CODE.METADATA_REQUIRED, `${label} is required.`, path);
    return normalized;
}

function first(record, keys) {
    for (const key of keys) {
        if (record?.[key] !== undefined && record?.[key] !== null && String(record[key]).trim()) {
            return record[key];
        }
    }
    return undefined;
}

function sourceHash(input) {
    return `fnv1a64:${stableFingerprint(inputText(input))}`;
}

function normalizeSourceProvenance(source, input) {
    if (!isRecord(source)) {
        fail(ORBITAL_SOURCE_ERROR_CODE.METADATA_REQUIRED, 'Explicit source metadata is required.', '$.source');
    }
    const sourceId = text(source.source_id ?? source.sourceId, 'source_id', '$.source.source_id');
    const provider = text(source.provider, 'provider', '$.source.provider');
    try {
        return normalizeDatasetProvenance({
            source_id: sourceId,
            provider,
            retrieved_at: source.retrieved_at ?? source.retrievedAt ?? null,
            dataset_id: source.dataset_id ?? source.datasetId ?? `dataset:${sourceId}`,
            dataset_hash: source.dataset_hash ?? source.datasetHash ?? sourceHash(input),
            source_uri: source.source_uri ?? source.sourceUri ?? null,
            source_status: source.source_status ?? source.sourceStatus ?? 'COMPLETE',
            partial_update: source.partial_update ?? source.partialUpdate ?? false,
            license_id: source.license_id ?? source.licenseId ?? null
        });
    } catch (error) {
        fail(ORBITAL_SOURCE_ERROR_CODE.METADATA_REQUIRED, error.message, '$.source');
    }
}

function normalizeCcsdsUtc(value, label) {
    const raw = text(value, label);
    const explicit = /(Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
    try {
        return normalizeUtcInstant(explicit, label);
    } catch (error) {
        fail(ORBITAL_SOURCE_ERROR_CODE.RECORD_MALFORMED, error.message);
    }
}

function normalizeFrame(value, { omm = false } = {}) {
    const frame = text(value, 'reference frame').toUpperCase();
    const allowed = omm ? new Set([REFERENCE_FRAME.TEME]) : SUPPORTED_TABULATED_FRAMES;
    if (!allowed.has(frame)) {
        fail(
            ORBITAL_SOURCE_ERROR_CODE.FRAME_UNSUPPORTED,
            `Reference frame ${frame} is unsupported; no frame conversion is performed.`
        );
    }
    return frame;
}

function requireUtc(value) {
    const timeScale = text(value, 'time system').toUpperCase();
    if (timeScale !== TIME_SCALE.UTC) {
        fail(
            ORBITAL_SOURCE_ERROR_CODE.TIME_SCALE_UNSUPPORTED,
            `Time system ${timeScale} is unsupported; no time-scale conversion is performed.`
        );
    }
    return timeScale;
}

function identityFor(record, provenance, { noradId = null, internationalDesignator = null } = {}) {
    const explicitObjectId = first(record, ['object_id', 'objectId']);
    const providerObjectId = first(record, ['provider_object_id', 'providerObjectId']) ??
        first(record, ['OBJECT_ID', 'object_id', 'objectId']);
    try {
        return catalogObjectId({
            object_id: explicitObjectId,
            norad_id: noradId,
            international_designator: internationalDesignator,
            provider: provenance.source_id,
            provider_object_id: providerObjectId
        });
    } catch (error) {
        fail(ORBITAL_SOURCE_ERROR_CODE.IDENTITY_AMBIGUOUS, error.message, '$.object_id');
    }
}

function normalizedInternationalDesignator(value) {
    if (value === undefined || value === null || !String(value).trim()) return null;
    try {
        return normalizeInternationalDesignator(value);
    } catch (error) {
        fail(ORBITAL_SOURCE_ERROR_CODE.IDENTITY_AMBIGUOUS, error.message, '$.international_designator');
    }
}

function finiteNumber(value, label, path, { minimum = null, maximum = null, exclusiveMaximum = false } = {}) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        fail(ORBITAL_SOURCE_ERROR_CODE.RECORD_MALFORMED, `${label} must be a finite number.`, path);
    }
    if (minimum !== null && number < minimum) {
        fail(ORBITAL_SOURCE_ERROR_CODE.RECORD_MALFORMED, `${label} must be at least ${minimum}.`, path);
    }
    if (maximum !== null && (exclusiveMaximum ? number >= maximum : number > maximum)) {
        fail(
            ORBITAL_SOURCE_ERROR_CODE.RECORD_MALFORMED,
            `${label} must be ${exclusiveMaximum ? 'less than' : 'at most'} ${maximum}.`,
            path
        );
    }
    return number;
}

function sourceClassifications(record) {
    return {
        object_type: normalizeObjectType(first(record, ['object_type', 'objectType', 'OBJECT_TYPE'])),
        lifecycle_status: normalizeLifecycleStatus(first(record, [
            'lifecycle_status', 'lifecycleStatus', 'operational_status', 'operationalStatus'
        ])),
        orbit_class: normalizeOrbitClass(first(record, ['orbit_class', 'orbitClass', 'ORBIT_CLASS', 'type']))
    };
}

function normalizedRecord({
    sourceFormat,
    objectId,
    name,
    noradId,
    internationalDesignator,
    classifications,
    elementSet,
    provenance,
    originalRecord,
    qualityFlags = []
}) {
    const flags = new Set(qualityFlags);
    if (classifications.object_type === OBJECT_TYPE.UNKNOWN) flags.add('OBJECT_TYPE_UNKNOWN');
    if (classifications.lifecycle_status === LIFECYCLE_STATUS.UNKNOWN) flags.add('LIFECYCLE_STATUS_UNKNOWN');
    return deepFreeze({
        schema_version: V21_SCHEMA_VERSION,
        adapter_version: ORBITAL_SOURCE_ADAPTER_VERSION,
        source_format: sourceFormat,
        object_id: objectId,
        name: String(name ?? '').trim() || objectId,
        norad_id: noradId,
        international_designator: internationalDesignator,
        object_type: classifications.object_type,
        orbit_class: classifications.orbit_class,
        lifecycle_status: classifications.lifecycle_status,
        element_set: elementSet,
        provenance,
        original_record: originalRecord,
        satcat_enrichment: null,
        quality_flags: [...flags].sort()
    });
}

function jsonRecords(input, label, limits) {
    let records;
    if (Array.isArray(input)) {
        records = input;
    } else if (isRecord(input) && Object.prototype.hasOwnProperty.call(input, 'records')) {
        if (Object.keys(input).some(key => ['tle_line1', 'tle_line2', 'EPOCH', 'MEAN_MOTION'].includes(key))) {
            fail(ORBITAL_SOURCE_ERROR_CODE.INPUT_INVALID, `${label} wrapper is ambiguous with a source record.`);
        }
        records = input.records;
    } else {
        records = [input];
    }
    if (!Array.isArray(records) || records.length === 0) {
        fail(ORBITAL_SOURCE_ERROR_CODE.INPUT_INVALID, `${label} must contain at least one record.`);
    }
    if (records.length > limits.max_records) {
        fail(
            ORBITAL_SOURCE_ERROR_CODE.RECORD_LIMIT_EXCEEDED,
            `${label} contains ${records.length} records; maximum is ${limits.max_records}.`
        );
    }
    records.forEach((record, index) => {
        if (!isRecord(record)) {
            fail(ORBITAL_SOURCE_ERROR_CODE.RECORD_MALFORMED, `${label} record must be an object.`, `$.records[${index}]`);
        }
    });
    return records;
}

function parseTleRecord(record, provenance) {
    const originalRecord = exactJsonCopy(record);
    const line1 = first(record, ['tle_line1', 'tleLine1', 'TLE_LINE1', 'line1']);
    const line2 = first(record, ['tle_line2', 'tleLine2', 'TLE_LINE2', 'line2']);
    const expectedNorad = first(record, ['norad_id', 'noradId', 'NORAD_CAT_ID']);
    const result = validateTlePair(line1, line2, { expected_norad_id: expectedNorad });
    if (!result.valid) {
        const detail = result.errors.map(issue => `${issue.code}: ${issue.message}`).join('; ');
        fail(ORBITAL_SOURCE_ERROR_CODE.RECORD_MALFORMED, `Invalid TLE record: ${detail}`);
    }
    const tle = result.value;
    const suppliedDesignator = normalizedInternationalDesignator(first(record, [
        'international_designator', 'internationalDesignator', 'OBJECT_ID'
    ]));
    if (suppliedDesignator && tle.international_designator && suppliedDesignator !== tle.international_designator) {
        fail(
            ORBITAL_SOURCE_ERROR_CODE.IDENTITY_AMBIGUOUS,
            `International designator ${suppliedDesignator} conflicts with TLE ${tle.international_designator}.`
        );
    }
    const objectId = identityFor(record, provenance, {
        noradId: tle.norad_id,
        internationalDesignator: suppliedDesignator ?? tle.international_designator
    });
    const setId = elementSetId({ object_id: objectId, format: 'TLE', line1: tle.line1, line2: tle.line2 });
    const classifications = sourceClassifications(record);
    return normalizedRecord({
        sourceFormat: ORBITAL_SOURCE_FORMAT.TLE_JSON,
        objectId,
        name: first(record, ['name', 'satellite_name', 'object_name', 'OBJECT_NAME']),
        noradId: tle.norad_id,
        internationalDesignator: suppliedDesignator ?? tle.international_designator,
        classifications,
        provenance,
        originalRecord,
        qualityFlags: ['TLE_SGP4_EXPERIMENTAL', 'TEME_FRAME_EXPLICIT'],
        elementSet: deepFreeze({
            element_set_id: setId,
            object_id: objectId,
            format: 'TLE',
            epoch: tle.epoch,
            time_scale: TIME_SCALE.UTC,
            native_frame: REFERENCE_FRAME.TEME,
            propagation_theory: 'SGP4',
            units: Object.freeze({ position: 'km', velocity: 'km/s' }),
            line1: tle.line1,
            line2: tle.line2,
            omm: null,
            states: null,
            interpolation: null,
            provenance
        })
    });
}

function uppercaseRecord(record) {
    const output = {};
    for (const [rawKey, value] of Object.entries(record)) {
        const key = String(rawKey).trim().toUpperCase();
        if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
            fail(ORBITAL_SOURCE_ERROR_CODE.RECORD_MALFORMED, `Invalid CCSDS field name: ${rawKey}.`);
        }
        if (Object.prototype.hasOwnProperty.call(output, key)) {
            fail(ORBITAL_SOURCE_ERROR_CODE.DUPLICATE_FIELD, `Duplicate CCSDS field ${key}.`);
        }
        output[key] = value;
    }
    return output;
}

function canonicalOmmFields(record) {
    const fields = uppercaseRecord(record);
    const version = text(fields.CCSDS_OMM_VERS, 'CCSDS_OMM_VERS', '$.CCSDS_OMM_VERS');
    if (!/^2(?:\.\d+)?$/.test(version)) {
        fail(ORBITAL_SOURCE_ERROR_CODE.RECORD_MALFORMED, `Unsupported CCSDS OMM version ${version}.`);
    }
    if (text(fields.CENTER_NAME, 'CENTER_NAME').toUpperCase() !== 'EARTH') {
        fail(ORBITAL_SOURCE_ERROR_CODE.RECORD_MALFORMED, 'Only Earth-centered OMM records are supported.');
    }
    const frame = normalizeFrame(fields.REF_FRAME, { omm: true });
    const timeScale = requireUtc(fields.TIME_SYSTEM);
    const theory = text(fields.MEAN_ELEMENT_THEORY, 'MEAN_ELEMENT_THEORY').toUpperCase();
    if (theory !== 'SGP4') {
        fail(ORBITAL_SOURCE_ERROR_CODE.THEORY_UNSUPPORTED, `OMM theory ${theory} is unsupported.`);
    }
    if (fields.EPHEMERIS_TYPE !== undefined && Number(fields.EPHEMERIS_TYPE) !== 0) {
        fail(ORBITAL_SOURCE_ERROR_CODE.THEORY_UNSUPPORTED, 'Only OMM ephemeris type 0 is supported.');
    }
    let noradId;
    try {
        noradId = normalizeNoradId(fields.NORAD_CAT_ID);
    } catch (error) {
        fail(ORBITAL_SOURCE_ERROR_CODE.IDENTITY_AMBIGUOUS, error.message, '$.NORAD_CAT_ID');
    }
    const epoch = normalizeCcsdsUtc(fields.EPOCH, 'OMM EPOCH');
    const canonical = { ...fields, NORAD_CAT_ID: noradId, EPOCH: epoch };
    for (const [key, range] of Object.entries(OMM_REQUIRED_NUMBERS)) {
        canonical[key] = finiteNumber(fields[key], key, `$.${key}`, range);
    }
    canonical.EPHEMERIS_TYPE = 0;
    return deepFreeze({ fields: canonical, frame, timeScale, theory, epoch, noradId });
}

function parseOmmRecord(record, provenance, sourceFormat, originalRecord) {
    const omm = canonicalOmmFields(record);
    const internationalDesignator = normalizedInternationalDesignator(omm.fields.OBJECT_ID);
    const objectId = identityFor(omm.fields, provenance, {
        noradId: omm.noradId,
        internationalDesignator
    });
    const rawFingerprint = `fnv1a64:${stableFingerprint(inputText(originalRecord))}`;
    const setId = elementSetId({
        object_id: objectId,
        format: 'OMM',
        source_record_id: rawFingerprint
    });
    return normalizedRecord({
        sourceFormat,
        objectId,
        name: omm.fields.OBJECT_NAME,
        noradId: omm.noradId,
        internationalDesignator,
        classifications: sourceClassifications(omm.fields),
        provenance,
        originalRecord,
        qualityFlags: ['OMM_SGP4_EXPERIMENTAL', 'TEME_FRAME_EXPLICIT'],
        elementSet: deepFreeze({
            element_set_id: setId,
            object_id: objectId,
            format: 'OMM',
            epoch: omm.epoch,
            time_scale: omm.timeScale,
            native_frame: omm.frame,
            propagation_theory: omm.theory,
            units: Object.freeze({ position: 'km', velocity: 'km/s' }),
            line1: null,
            line2: null,
            omm: omm.fields,
            states: null,
            interpolation: null,
            provenance
        })
    });
}

function kvnLines(input, limits) {
    if (typeof input !== 'string') {
        fail(ORBITAL_SOURCE_ERROR_CODE.INPUT_INVALID, 'CCSDS KVN input must be a string.');
    }
    const lines = input.replace(/^\uFEFF/, '').split(/\r?\n/);
    if (lines.length > limits.max_kvn_lines) {
        fail(
            ORBITAL_SOURCE_ERROR_CODE.RECORD_LIMIT_EXCEEDED,
            `KVN input contains ${lines.length} lines; maximum is ${limits.max_kvn_lines}.`
        );
    }
    lines.forEach((line, index) => {
        if (byteLength(line) > limits.max_line_bytes) {
            fail(
                ORBITAL_SOURCE_ERROR_CODE.INPUT_TOO_LARGE,
                `KVN line ${index + 1} exceeds ${limits.max_line_bytes} bytes.`,
                `$[${index}]`
            );
        }
    });
    return lines;
}

function parseKvnFields(input, limits) {
    const output = {};
    for (const [index, rawLine] of kvnLines(input, limits).entries()) {
        const line = rawLine.trim();
        if (!line || line.startsWith('COMMENT')) continue;
        const separator = line.indexOf('=');
        if (separator <= 0) {
            fail(ORBITAL_SOURCE_ERROR_CODE.KVN_MALFORMED, `KVN line ${index + 1} must contain key = value.`);
        }
        const key = line.slice(0, separator).trim().toUpperCase();
        const value = line.slice(separator + 1).trim();
        if (!/^[A-Z][A-Z0-9_]*$/.test(key) || !value) {
            fail(ORBITAL_SOURCE_ERROR_CODE.KVN_MALFORMED, `KVN line ${index + 1} is malformed.`);
        }
        if (Object.prototype.hasOwnProperty.call(output, key)) {
            fail(ORBITAL_SOURCE_ERROR_CODE.DUPLICATE_FIELD, `Duplicate KVN field ${key}.`);
        }
        output[key] = value;
    }
    return output;
}

function vector(value, label) {
    const components = Array.isArray(value)
        ? value
        : [value?.x, value?.y, value?.z];
    if (components.length !== 3) {
        fail(ORBITAL_SOURCE_ERROR_CODE.SAMPLE_INVALID, `${label} must contain exactly three components.`);
    }
    return deepFreeze({
        x: finiteNumber(components[0], `${label}.x`, `${label}.x`),
        y: finiteNumber(components[1], `${label}.y`, `${label}.y`),
        z: finiteNumber(components[2], `${label}.z`, `${label}.z`)
    });
}

function normalizeSamples(samples, limits, { timeScale, frame }) {
    if (!Array.isArray(samples) || samples.length < 2) {
        fail(ORBITAL_SOURCE_ERROR_CODE.SAMPLE_INVALID, 'At least two ephemeris samples are required.');
    }
    if (samples.length > limits.max_ephemeris_samples) {
        fail(
            ORBITAL_SOURCE_ERROR_CODE.RECORD_LIMIT_EXCEEDED,
            `Ephemeris contains ${samples.length} samples; maximum is ${limits.max_ephemeris_samples}.`
        );
    }
    let priorTime = -Infinity;
    return deepFreeze(samples.map((sample, index) => {
        if (!isRecord(sample)) {
            fail(ORBITAL_SOURCE_ERROR_CODE.SAMPLE_INVALID, 'Ephemeris samples must be objects.', `$.states[${index}]`);
        }
        const timestamp = normalizeCcsdsUtc(
            sample.timestamp ?? sample.epoch ?? sample.time,
            `state sample ${index} timestamp`
        );
        const currentTime = Date.parse(timestamp);
        if (currentTime <= priorTime) {
            fail(
                ORBITAL_SOURCE_ERROR_CODE.SAMPLE_ORDER_INVALID,
                'Ephemeris sample timestamps must be strictly increasing.',
                `$.states[${index}].timestamp`
            );
        }
        priorTime = currentTime;
        return deepFreeze({
            timestamp,
            time_scale: timeScale,
            frame,
            position_km: vector(sample.position_km ?? sample.positionKm ?? sample.position, `states[${index}].position_km`),
            velocity_km_s: vector(sample.velocity_km_s ?? sample.velocityKmS ?? sample.velocity, `states[${index}].velocity_km_s`),
            units: Object.freeze({ position: 'km', velocity: 'km/s' })
        });
    }));
}

function tabulatedRecord({
    sourceFormat,
    record,
    provenance,
    originalRecord,
    frame,
    timeScale,
    samples,
    sourceInterpolation = null
}) {
    const noradRaw = first(record, ['norad_id', 'noradId', 'NORAD_CAT_ID']);
    let noradId = null;
    if (noradRaw !== undefined) {
        try {
            noradId = normalizeNoradId(noradRaw);
        } catch (error) {
            fail(ORBITAL_SOURCE_ERROR_CODE.IDENTITY_AMBIGUOUS, error.message);
        }
    }
    const designator = normalizedInternationalDesignator(first(record, [
        'international_designator', 'internationalDesignator', 'OBJECT_ID'
    ]));
    const objectId = identityFor(record, provenance, { noradId, internationalDesignator: designator });
    const rawFingerprint = `fnv1a64:${stableFingerprint(inputText(originalRecord))}`;
    const format = sourceFormat === ORBITAL_SOURCE_FORMAT.CCSDS_OEM_KVN ? 'OEM' : 'PROVIDER_EPHEMERIS';
    const setId = elementSetId({ object_id: objectId, format, source_record_id: rawFingerprint });
    const qualityFlags = ['TABULATED_STATE_INTERPOLATION', 'NO_EXTRAPOLATION'];
    if (sourceInterpolation && sourceInterpolation !== 'LINEAR') {
        qualityFlags.push('SOURCE_INTERPOLATION_REPLACED_BY_BOUNDED_LINEAR');
    }
    return normalizedRecord({
        sourceFormat,
        objectId,
        name: first(record, ['name', 'object_name', 'objectName', 'OBJECT_NAME']),
        noradId,
        internationalDesignator: designator,
        classifications: sourceClassifications(record),
        provenance,
        originalRecord,
        qualityFlags,
        elementSet: deepFreeze({
            element_set_id: setId,
            object_id: objectId,
            format,
            epoch: samples[0].timestamp,
            time_scale: timeScale,
            native_frame: frame,
            propagation_theory: 'TABULATED',
            units: Object.freeze({ position: 'km', velocity: 'km/s' }),
            line1: null,
            line2: null,
            omm: null,
            states: samples,
            interpolation: Object.freeze({
                method: 'LINEAR_POSITION_AND_VELOCITY',
                extrapolation: 'REJECT',
                source_method: sourceInterpolation
            }),
            provenance
        })
    });
}

function parseOemRecord(input, provenance, limits) {
    const lines = kvnLines(input, limits);
    const header = {};
    const metadata = {};
    const samples = [];
    let section = 'HEADER';
    let metadataBlocks = 0;
    let covarianceSeen = false;
    for (const [index, rawLine] of lines.entries()) {
        const line = rawLine.trim();
        if (!line || line.startsWith('COMMENT')) continue;
        const marker = line.toUpperCase();
        if (marker === 'META_START') {
            metadataBlocks += 1;
            if (metadataBlocks > 1 || section !== 'HEADER') {
                fail(ORBITAL_SOURCE_ERROR_CODE.KVN_MALFORMED, 'Only one OEM metadata segment is supported.');
            }
            section = 'META';
            continue;
        }
        if (marker === 'META_STOP') {
            if (section !== 'META') fail(ORBITAL_SOURCE_ERROR_CODE.KVN_MALFORMED, 'OEM META_STOP is out of order.');
            section = 'DATA';
            continue;
        }
        if (marker === 'DATA_START' || marker === 'DATA_STOP') continue;
        if (marker.includes('COVARIANCE_START') || marker.includes('COVARIANCE_STOP')) {
            covarianceSeen = true;
            continue;
        }
        if (covarianceSeen) {
            fail(ORBITAL_SOURCE_ERROR_CODE.KVN_MALFORMED, 'OEM covariance blocks are not supported by this adapter.');
        }
        if (section === 'DATA' && !line.includes('=')) {
            const tokens = line.split(/\s+/);
            if (tokens.length !== 7) {
                fail(
                    ORBITAL_SOURCE_ERROR_CODE.SAMPLE_INVALID,
                    `OEM state line ${index + 1} must contain a timestamp and six numeric components.`
                );
            }
            samples.push({
                timestamp: tokens[0],
                position_km: tokens.slice(1, 4).map(Number),
                velocity_km_s: tokens.slice(4, 7).map(Number)
            });
            continue;
        }
        const separator = line.indexOf('=');
        if (separator <= 0) {
            fail(ORBITAL_SOURCE_ERROR_CODE.KVN_MALFORMED, `OEM line ${index + 1} is malformed.`);
        }
        const key = line.slice(0, separator).trim().toUpperCase();
        const value = line.slice(separator + 1).trim();
        const target = section === 'META' ? metadata : header;
        if (!/^[A-Z][A-Z0-9_]*$/.test(key) || !value) {
            fail(ORBITAL_SOURCE_ERROR_CODE.KVN_MALFORMED, `OEM line ${index + 1} is malformed.`);
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
            fail(ORBITAL_SOURCE_ERROR_CODE.DUPLICATE_FIELD, `Duplicate OEM field ${key}.`);
        }
        target[key] = value;
    }
    if (metadataBlocks !== 1 || section === 'META') {
        fail(ORBITAL_SOURCE_ERROR_CODE.KVN_MALFORMED, 'OEM requires one complete META_START/META_STOP segment.');
    }
    const version = text(header.CCSDS_OEM_VERS, 'CCSDS_OEM_VERS');
    if (!/^2(?:\.\d+)?$/.test(version)) {
        fail(ORBITAL_SOURCE_ERROR_CODE.RECORD_MALFORMED, `Unsupported CCSDS OEM version ${version}.`);
    }
    if (text(metadata.CENTER_NAME, 'CENTER_NAME').toUpperCase() !== 'EARTH') {
        fail(ORBITAL_SOURCE_ERROR_CODE.RECORD_MALFORMED, 'Only Earth-centered OEM records are supported.');
    }
    const frame = normalizeFrame(metadata.REF_FRAME);
    const timeScale = requireUtc(metadata.TIME_SYSTEM);
    const normalizedSamples = normalizeSamples(samples, limits, { timeScale, frame });
    if (metadata.START_TIME && normalizeCcsdsUtc(metadata.START_TIME, 'START_TIME') !== normalizedSamples[0].timestamp) {
        fail(ORBITAL_SOURCE_ERROR_CODE.SAMPLE_INVALID, 'OEM START_TIME must equal the first retained sample.');
    }
    if (metadata.STOP_TIME && normalizeCcsdsUtc(metadata.STOP_TIME, 'STOP_TIME') !== normalizedSamples.at(-1).timestamp) {
        fail(ORBITAL_SOURCE_ERROR_CODE.SAMPLE_INVALID, 'OEM STOP_TIME must equal the last retained sample.');
    }
    return tabulatedRecord({
        sourceFormat: ORBITAL_SOURCE_FORMAT.CCSDS_OEM_KVN,
        record: metadata,
        provenance,
        originalRecord: input,
        frame,
        timeScale,
        samples: normalizedSamples,
        sourceInterpolation: metadata.INTERPOLATION?.toUpperCase() ?? null
    });
}

function requireProviderUnits(units) {
    if (!isRecord(units)) {
        fail(ORBITAL_SOURCE_ERROR_CODE.UNITS_UNSUPPORTED, 'Provider ephemeris must declare position and velocity units.');
    }
    const position = String(units.position ?? '').trim().toLowerCase();
    const velocity = String(units.velocity ?? '').trim().toLowerCase();
    if (position !== 'km' || !['km/s', 'km/sec'].includes(velocity)) {
        fail(
            ORBITAL_SOURCE_ERROR_CODE.UNITS_UNSUPPORTED,
            `Unsupported provider units ${position || '(missing)'}/${velocity || '(missing)'}; no unit conversion is performed.`
        );
    }
}

function parseProviderRecord(record, provenance, limits) {
    const originalRecord = exactJsonCopy(record);
    const frame = normalizeFrame(record.frame ?? record.reference_frame ?? record.referenceFrame);
    const timeScale = requireUtc(record.time_scale ?? record.timeScale);
    requireProviderUnits(record.units);
    const interpolation = String(record.interpolation ?? 'LINEAR').trim().toUpperCase();
    if (interpolation !== 'LINEAR') {
        fail(
            ORBITAL_SOURCE_ERROR_CODE.THEORY_UNSUPPORTED,
            `Provider interpolation ${interpolation} is unsupported; only bounded LINEAR interpolation is allowed.`
        );
    }
    const samples = normalizeSamples(record.states ?? record.samples, limits, { timeScale, frame });
    return tabulatedRecord({
        sourceFormat: ORBITAL_SOURCE_FORMAT.PROVIDER_EPHEMERIS_JSON,
        record,
        provenance,
        originalRecord,
        frame,
        timeScale,
        samples,
        sourceInterpolation: interpolation
    });
}

function satcatLifecycle(record) {
    if (String(first(record, ['DECAY_DATE', 'decay_date']) ?? '').trim()) return LIFECYCLE_STATUS.DECAYED;
    const explicit = normalizeLifecycleStatus(first(record, ['lifecycle_status', 'LIFECYCLE_STATUS']));
    if (explicit !== LIFECYCLE_STATUS.UNKNOWN) return explicit;
    const code = String(first(record, ['OPS_STATUS_CODE', 'ops_status_code']) ?? '').trim().toUpperCase();
    if (['+', 'P', 'B', 'S', 'X'].includes(code)) return LIFECYCLE_STATUS.ACTIVE;
    if (['-', 'N'].includes(code)) return LIFECYCLE_STATUS.INACTIVE;
    if (code === 'D') return LIFECYCLE_STATUS.DECAYED;
    return LIFECYCLE_STATUS.UNKNOWN;
}

function satcatKeys(record) {
    const keys = [];
    const norad = first(record, ['NORAD_CAT_ID', 'norad_id', 'noradId']);
    if (norad !== undefined) {
        try {
            keys.push(`norad:${normalizeNoradId(norad)}`);
        } catch (error) {
            fail(ORBITAL_SOURCE_ERROR_CODE.SATCAT_AMBIGUOUS, error.message);
        }
    }
    const designator = first(record, ['OBJECT_ID', 'international_designator', 'internationalDesignator']);
    if (designator !== undefined && String(designator).trim()) {
        try {
            keys.push(`cospar:${normalizeInternationalDesignator(designator)}`);
        } catch (error) {
            fail(ORBITAL_SOURCE_ERROR_CODE.SATCAT_AMBIGUOUS, error.message);
        }
    }
    if (!keys.length) {
        fail(ORBITAL_SOURCE_ERROR_CODE.SATCAT_AMBIGUOUS, 'SATCAT enrichment records require NORAD_CAT_ID or OBJECT_ID.');
    }
    return keys;
}

export function createSatcatEnrichmentIndex(records, options = {}) {
    const limits = mergedLimits(options.limits);
    if (!Array.isArray(records)) {
        fail(ORBITAL_SOURCE_ERROR_CODE.INPUT_INVALID, 'SATCAT enrichment must be an array.');
    }
    if (records.length > limits.max_satcat_records) {
        fail(
            ORBITAL_SOURCE_ERROR_CODE.RECORD_LIMIT_EXCEEDED,
            `SATCAT enrichment contains ${records.length} rows; maximum is ${limits.max_satcat_records}.`
        );
    }
    const byKey = new Map();
    records.forEach((record, index) => {
        if (!isRecord(record)) {
            fail(ORBITAL_SOURCE_ERROR_CODE.RECORD_MALFORMED, 'SATCAT row must be an object.', `$.satcat[${index}]`);
        }
        const entry = deepFreeze({
            object_type: normalizeObjectType(first(record, ['OBJECT_TYPE', 'object_type', 'objectType'])),
            lifecycle_status: satcatLifecycle(record),
            original_record: exactJsonCopy(record)
        });
        for (const key of satcatKeys(record)) {
            if (byKey.has(key)) {
                fail(ORBITAL_SOURCE_ERROR_CODE.SATCAT_AMBIGUOUS, `SATCAT identifier ${key} is duplicated.`);
            }
            byKey.set(key, entry);
        }
    });
    return Object.freeze({
        size: records.length,
        find(record) {
            const matches = new Set();
            if (record.norad_id) matches.add(byKey.get(`norad:${record.norad_id}`));
            if (record.international_designator) matches.add(byKey.get(`cospar:${record.international_designator}`));
            matches.delete(undefined);
            if (matches.size > 1) {
                fail(
                    ORBITAL_SOURCE_ERROR_CODE.SATCAT_AMBIGUOUS,
                    `Object ${record.object_id} matches different SATCAT rows by NORAD and international designator.`
                );
            }
            return [...matches][0] ?? null;
        }
    });
}

function applySatcat(record, index) {
    if (!index) return record;
    const match = index.find(record);
    if (!match) return record;
    if (
        record.object_type !== OBJECT_TYPE.UNKNOWN &&
        match.object_type !== OBJECT_TYPE.UNKNOWN &&
        record.object_type !== match.object_type
    ) {
        fail(
            ORBITAL_SOURCE_ERROR_CODE.SATCAT_CONFLICT,
            `Object type ${record.object_type} conflicts with SATCAT ${match.object_type} for ${record.object_id}.`
        );
    }
    if (
        record.lifecycle_status !== LIFECYCLE_STATUS.UNKNOWN &&
        match.lifecycle_status !== LIFECYCLE_STATUS.UNKNOWN &&
        record.lifecycle_status !== match.lifecycle_status
    ) {
        fail(
            ORBITAL_SOURCE_ERROR_CODE.SATCAT_CONFLICT,
            `Lifecycle ${record.lifecycle_status} conflicts with SATCAT ${match.lifecycle_status} for ${record.object_id}.`
        );
    }
    const objectType = record.object_type === OBJECT_TYPE.UNKNOWN ? match.object_type : record.object_type;
    const lifecycle = record.lifecycle_status === LIFECYCLE_STATUS.UNKNOWN
        ? match.lifecycle_status
        : record.lifecycle_status;
    const flags = new Set(record.quality_flags);
    flags.delete('OBJECT_TYPE_UNKNOWN');
    flags.delete('LIFECYCLE_STATUS_UNKNOWN');
    if (objectType === OBJECT_TYPE.UNKNOWN) flags.add('OBJECT_TYPE_UNKNOWN');
    if (lifecycle === LIFECYCLE_STATUS.UNKNOWN) flags.add('LIFECYCLE_STATUS_UNKNOWN');
    if (objectType !== record.object_type) flags.add('SATCAT_OBJECT_TYPE_ENRICHED');
    if (lifecycle !== record.lifecycle_status) flags.add('SATCAT_LIFECYCLE_ENRICHED');
    return deepFreeze({
        ...record,
        object_type: objectType,
        lifecycle_status: lifecycle,
        satcat_enrichment: match,
        quality_flags: [...flags].sort()
    });
}

function ensureUniqueObjects(records) {
    const seen = new Set();
    for (const record of records) {
        if (seen.has(record.object_id)) {
            fail(
                ORBITAL_SOURCE_ERROR_CODE.IDENTITY_AMBIGUOUS,
                `Orbital source contains duplicate object identity ${record.object_id}.`
            );
        }
        seen.add(record.object_id);
    }
}

export function adaptOrbitalSource(input, options = {}) {
    const format = String(options.format ?? '').trim().toUpperCase();
    if (!format) fail(ORBITAL_SOURCE_ERROR_CODE.FORMAT_REQUIRED, 'An explicit orbital source format is required.');
    if (!Object.values(ORBITAL_SOURCE_FORMAT).includes(format)) {
        fail(ORBITAL_SOURCE_ERROR_CODE.FORMAT_UNSUPPORTED, `Unsupported orbital source format ${format}.`);
    }
    const limits = mergedLimits(options.limits);
    const inputBytes = enforceInputBound(input, limits);
    const provenance = normalizeSourceProvenance(options.source ?? options.provenance, input);
    let records;
    switch (format) {
        case ORBITAL_SOURCE_FORMAT.TLE_JSON:
            records = jsonRecords(input, 'TLE JSON', limits).map(record => parseTleRecord(record, provenance));
            break;
        case ORBITAL_SOURCE_FORMAT.CCSDS_OMM_JSON:
            records = jsonRecords(input, 'CCSDS OMM JSON', limits).map(record => parseOmmRecord(
                record,
                provenance,
                ORBITAL_SOURCE_FORMAT.CCSDS_OMM_JSON,
                exactJsonCopy(record)
            ));
            break;
        case ORBITAL_SOURCE_FORMAT.CCSDS_OMM_KVN: {
            const fields = parseKvnFields(input, limits);
            records = [parseOmmRecord(fields, provenance, ORBITAL_SOURCE_FORMAT.CCSDS_OMM_KVN, input)];
            break;
        }
        case ORBITAL_SOURCE_FORMAT.CCSDS_OEM_KVN:
            records = [parseOemRecord(input, provenance, limits)];
            break;
        case ORBITAL_SOURCE_FORMAT.PROVIDER_EPHEMERIS_JSON:
            records = jsonRecords(input, 'provider ephemeris JSON', limits).map(record =>
                parseProviderRecord(record, provenance, limits));
            break;
        default:
            fail(ORBITAL_SOURCE_ERROR_CODE.FORMAT_UNSUPPORTED, `Unsupported orbital source format ${format}.`);
    }
    const satcatIndex = options.satcat_index ?? (
        options.satcat_records ? createSatcatEnrichmentIndex(options.satcat_records, { limits }) : null
    );
    const enriched = records.map(record => applySatcat(record, satcatIndex));
    ensureUniqueObjects(enriched);
    return deepFreeze({
        schema_version: V21_SCHEMA_VERSION,
        adapter_version: ORBITAL_SOURCE_ADAPTER_VERSION,
        source_format: format,
        input_bytes: inputBytes,
        record_count: enriched.length,
        provenance,
        records: enriched
    });
}

export function parseTleJson(input, options = {}) {
    return adaptOrbitalSource(input, { ...options, format: ORBITAL_SOURCE_FORMAT.TLE_JSON });
}

export function parseCcsdsOmmJson(input, options = {}) {
    return adaptOrbitalSource(input, { ...options, format: ORBITAL_SOURCE_FORMAT.CCSDS_OMM_JSON });
}

export function parseCcsdsOmmKvn(input, options = {}) {
    return adaptOrbitalSource(input, { ...options, format: ORBITAL_SOURCE_FORMAT.CCSDS_OMM_KVN });
}

export function parseCcsdsOemKvn(input, options = {}) {
    return adaptOrbitalSource(input, { ...options, format: ORBITAL_SOURCE_FORMAT.CCSDS_OEM_KVN });
}

export function parseProviderEphemeris(input, options = {}) {
    return adaptOrbitalSource(input, { ...options, format: ORBITAL_SOURCE_FORMAT.PROVIDER_EPHEMERIS_JSON });
}
