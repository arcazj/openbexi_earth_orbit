import { stableFingerprint } from './objectIdentity.js';
import { LIFECYCLE_STATUS, OBJECT_TYPE, normalizeUtcInstant } from './orbitalPolicy.js';

export const V21_SCHEMA_VERSION = '2.1.0';
export const FULL_CATALOG_CONFIGURATION_VERSION = '2.1.0';

export const SCREENING_JOB_STATE = Object.freeze({
    QUEUED: 'QUEUED',
    RUNNING: 'RUNNING',
    CANCEL_REQUESTED: 'CANCEL_REQUESTED',
    CANCELLED: 'CANCELLED',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
    TIMED_OUT: 'TIMED_OUT'
});

export const TERMINAL_SCREENING_JOB_STATES = Object.freeze([
    SCREENING_JOB_STATE.CANCELLED,
    SCREENING_JOB_STATE.SUCCEEDED,
    SCREENING_JOB_STATE.FAILED,
    SCREENING_JOB_STATE.TIMED_OUT
]);

export const ORBITAL_SOURCE_FORMAT = Object.freeze({
    TLE_JSON: 'TLE_JSON',
    CCSDS_OMM_JSON: 'CCSDS_OMM_JSON',
    CCSDS_OMM_KVN: 'CCSDS_OMM_KVN',
    CCSDS_OEM_KVN: 'CCSDS_OEM_KVN',
    PROVIDER_EPHEMERIS_JSON: 'PROVIDER_EPHEMERIS_JSON'
});

export const DEFAULT_FULL_CATALOG_CONFIGURATION = Object.freeze({
    configuration_version: FULL_CATALOG_CONFIGURATION_VERSION,
    horizon_seconds: 3600,
    coarse_step_seconds: 60,
    screening_radius_km: 10,
    refinement_tolerance_seconds: 1,
    refinement_subdivisions: 8,
    max_refinement_iterations: 64,
    max_relative_acceleration_km_s2: 0.024516625,
    coarse_padding_km: 0,
    spatial_cell_size_km: 1000,
    max_cells_per_object: 512,
    max_cell_memberships_per_slab: 2_000_000,
    max_spatial_pair_checks_per_slab: 5_000_000,
    max_candidate_intervals: 250_000,
    max_detected_events: 10_000,
    max_persisted_candidates: 100_000,
    max_results: 5000,
    yield_every_operations: 2000,
    timeout_seconds: 1800,
    max_attempts: 2
});

const LIMITS = Object.freeze({
    horizon_seconds: [60, 21_600],
    coarse_step_seconds: [10, 900],
    screening_radius_km: [0.001, 1000],
    refinement_tolerance_seconds: [0.01, 10],
    refinement_subdivisions: [2, 32],
    max_refinement_iterations: [8, 128],
    max_relative_acceleration_km_s2: [0, 0.1],
    coarse_padding_km: [0, 1000],
    spatial_cell_size_km: [50, 5000],
    max_cells_per_object: [1, 512],
    max_cell_memberships_per_slab: [1000, 10_000_000],
    max_spatial_pair_checks_per_slab: [1000, 10_000_000],
    max_candidate_intervals: [1, 500_000],
    max_detected_events: [1, 100_000],
    max_persisted_candidates: [1, 100_000],
    max_results: [1, 10_000],
    yield_every_operations: [100, 1_000_000],
    timeout_seconds: [10, 7200],
    max_attempts: [1, 3]
});

const INTEGER_KEYS = new Set([
    'refinement_subdivisions', 'max_refinement_iterations', 'max_cells_per_object',
    'max_cell_memberships_per_slab', 'max_spatial_pair_checks_per_slab',
    'max_candidate_intervals', 'max_detected_events', 'max_persisted_candidates', 'max_results',
    'yield_every_operations', 'timeout_seconds', 'max_attempts'
]);

const TRANSITIONS = Object.freeze({
    QUEUED: new Set(['RUNNING', 'CANCEL_REQUESTED', 'CANCELLED', 'FAILED']),
    RUNNING: new Set(['QUEUED', 'CANCEL_REQUESTED', 'SUCCEEDED', 'FAILED', 'TIMED_OUT']),
    CANCEL_REQUESTED: new Set(['CANCELLED', 'FAILED', 'TIMED_OUT']),
    CANCELLED: new Set(),
    SUCCEEDED: new Set(),
    FAILED: new Set(['QUEUED']),
    TIMED_OUT: new Set(['QUEUED'])
});

function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

export function stableV21Json(value) {
    return JSON.stringify(stableValue(value));
}

export function v21Hash(value) {
    return `fnv1a64:${stableFingerprint(stableV21Json(value))}`;
}

function inputValue(input, snakeKey) {
    if (Object.prototype.hasOwnProperty.call(input, snakeKey)) return input[snakeKey];
    const legacyAliases = {
        spatial_cell_size_km: 'spatial_cell_km',
        max_spatial_pair_checks_per_slab: 'max_pair_checks',
        max_candidate_intervals: 'max_candidates'
    };
    const legacyKey = legacyAliases[snakeKey];
    if (legacyKey && Object.prototype.hasOwnProperty.call(input, legacyKey)) return input[legacyKey];
    const camelKey = snakeKey.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    return input[camelKey];
}

function boundedNumber(input, key) {
    const supplied = inputValue(input, key);
    const value = supplied === undefined || supplied === null
        ? DEFAULT_FULL_CATALOG_CONFIGURATION[key]
        : Number(supplied);
    const [minimum, maximum] = LIMITS[key];
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
        throw new TypeError(`${key} must be between ${minimum} and ${maximum}.`);
    }
    if (INTEGER_KEYS.has(key) && !Number.isInteger(value)) {
        throw new TypeError(`${key} must be an integer.`);
    }
    return value;
}

export function normalizeFullCatalogConfiguration(input = {}) {
    if (!isRecord(input)) throw new TypeError('configuration must be an object.');
    const startTime = normalizeUtcInstant(inputValue(input, 'start_time'), 'full-catalog screening start_time');
    const values = Object.fromEntries(Object.keys(LIMITS).map(key => [key, boundedNumber(input, key)]));
    if (values.coarse_step_seconds > values.horizon_seconds) {
        throw new TypeError('coarse_step_seconds must not exceed horizon_seconds.');
    }
    if (values.refinement_tolerance_seconds > values.coarse_step_seconds) {
        throw new TypeError('refinement_tolerance_seconds must not exceed coarse_step_seconds.');
    }
    if (values.max_persisted_candidates > values.max_candidate_intervals) {
        throw new TypeError('max_persisted_candidates must not exceed max_candidate_intervals.');
    }
    if (Math.ceil(values.horizon_seconds / values.coarse_step_seconds) + 1 > 721) {
        throw new TypeError('configuration must not exceed 721 synchronized coarse-grid points.');
    }
    return deepFreeze({
        configuration_version: FULL_CATALOG_CONFIGURATION_VERSION,
        ...values,
        start_time: startTime,
        end_time: new Date(Date.parse(startTime) + values.horizon_seconds * 1000).toISOString()
    });
}

function uniqueAllowed(values, allowedValues, label) {
    if (!Array.isArray(values) || values.length === 0) {
        throw new TypeError(`${label} must be a non-empty array.`);
    }
    const normalized = [...new Set(values.map(value => String(value).trim().toUpperCase()))].sort();
    const allowed = new Set(allowedValues);
    const invalid = normalized.filter(value => !allowed.has(value));
    if (invalid.length) throw new TypeError(`${label} contains unsupported values: ${invalid.join(', ')}.`);
    return normalized;
}

export function normalizeCatalogScope(input = {}) {
    if (!isRecord(input)) throw new TypeError('catalog_scope must be an object.');
    let objectIds = null;
    if (input.object_ids !== undefined && input.object_ids !== null) {
        if (!Array.isArray(input.object_ids) || input.object_ids.length === 0 || input.object_ids.length > 25_000) {
            throw new TypeError('catalog_scope.object_ids must contain 1 to 25,000 identifiers when supplied.');
        }
        objectIds = [...new Set(input.object_ids.map(value => String(value).trim()).filter(Boolean))].sort();
        if (!objectIds.length) throw new TypeError('catalog_scope.object_ids must contain identifiers.');
    }
    return deepFreeze({
        object_types: uniqueAllowed(
            input.object_types ?? Object.values(OBJECT_TYPE),
            Object.values(OBJECT_TYPE),
            'catalog_scope.object_types'
        ),
        lifecycle_statuses: uniqueAllowed(
            input.lifecycle_statuses ?? [
                LIFECYCLE_STATUS.ACTIVE,
                LIFECYCLE_STATUS.INACTIVE,
                LIFECYCLE_STATUS.UNKNOWN
            ],
            Object.values(LIFECYCLE_STATUS),
            'catalog_scope.lifecycle_statuses'
        ),
        object_ids: objectIds
    });
}

export function normalizeScreeningJobRequest(input = {}) {
    if (!isRecord(input)) throw new TypeError('screening job request must be an object.');
    if (String(input.schema_version ?? V21_SCHEMA_VERSION) !== V21_SCHEMA_VERSION) {
        throw new TypeError(`schema_version must equal ${V21_SCHEMA_VERSION}.`);
    }
    const catalogRevisionId = String(input.catalog_revision_id ?? 'current').trim();
    if (!catalogRevisionId || catalogRevisionId.length > 200) {
        throw new TypeError('catalog_revision_id must contain 1 to 200 characters.');
    }
    const normalized = {
        schema_version: V21_SCHEMA_VERSION,
        capability: 'FULL_CATALOG_SCREENING',
        maturity: 'Experimental',
        safety_class: 'non-operational',
        catalog_revision_id: catalogRevisionId,
        catalog_scope: normalizeCatalogScope(input.catalog_scope ?? {}),
        configuration: normalizeFullCatalogConfiguration(input.configuration ?? input)
    };
    return deepFreeze({ ...normalized, request_hash: v21Hash(normalized) });
}

export function assertScreeningJobTransition(fromState, toState) {
    const from = String(fromState ?? '').toUpperCase();
    const to = String(toState ?? '').toUpperCase();
    if (!Object.values(SCREENING_JOB_STATE).includes(from)) {
        throw new TypeError(`Unknown screening job state: ${fromState}.`);
    }
    if (!Object.values(SCREENING_JOB_STATE).includes(to)) {
        throw new TypeError(`Unknown screening job state: ${toState}.`);
    }
    if (!TRANSITIONS[from].has(to)) {
        throw new TypeError(`Screening job state cannot transition from ${from} to ${to}.`);
    }
    return to;
}

export function isTerminalScreeningJobState(state) {
    return TERMINAL_SCREENING_JOB_STATES.includes(String(state ?? '').toUpperCase());
}

export const V21_CONTRACT_SCHEMAS = deepFreeze({
    ScreeningJobRequest: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://openbexi.example/schemas/v2.1/screening-job-request.schema.json',
        type: 'object',
        additionalProperties: false,
        required: ['schema_version', 'catalog_revision_id', 'catalog_scope', 'configuration'],
        properties: {
            schema_version: { const: V21_SCHEMA_VERSION },
            catalog_revision_id: { type: 'string', minLength: 1, maxLength: 200 },
            catalog_scope: { type: 'object' },
            configuration: { type: 'object' }
        }
    },
    ScreeningJob: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://openbexi.example/schemas/v2.1/screening-job.schema.json',
        type: 'object',
        required: [
            'schema_version', 'job_id', 'state', 'request_hash', 'catalog_revision_id',
            'created_at', 'updated_at', 'attempt_count', 'max_attempts', 'progress'
        ],
        properties: {
            schema_version: { const: V21_SCHEMA_VERSION },
            job_id: { type: 'string', pattern: '^job:[a-z0-9-]+$' },
            state: { enum: Object.values(SCREENING_JOB_STATE) },
            request_hash: { type: 'string' },
            catalog_revision_id: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            attempt_count: { type: 'integer', minimum: 0 },
            max_attempts: { type: 'integer', minimum: 1, maximum: 3 },
            progress: { type: 'number', minimum: 0, maximum: 1 }
        }
    }
});
