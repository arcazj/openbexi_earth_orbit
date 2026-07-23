import {
    canonicalPairKey,
    catalogObjectId,
    conjunctionEventId,
    isInternalObjectId
} from './objectIdentity.js';
import {
    CAPABILITY,
    CAPABILITY_MATURITY,
    DOMAIN_SCHEMA_VERSION,
    LIFECYCLE_STATUS,
    OBJECT_TYPE,
    ORBIT_CLASS,
    REFERENCE_FRAME,
    TIME_SCALE,
    assertSupportedFrame,
    normalizeUtcInstant
} from './orbitalPolicy.js';

export const CONTRACT_KIND = Object.freeze({
    DATASET_PROVENANCE: 'DatasetProvenance',
    COMPUTATION_PROVENANCE: 'ComputationProvenance',
    CATALOG_OBJECT: 'CatalogObject',
    STATE_VECTOR: 'StateVector',
    SCREENING_REQUEST: 'ScreeningRequest',
    CONJUNCTION_EVENT: 'ConjunctionEvent',
    SCREENING_RESULT: 'ScreeningResult'
});

const JSON_SCHEMA_DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const SCHEMA_BASE = 'https://openbexi.example/schemas/v2';
const HASH_PATTERN = '^[a-z0-9][a-z0-9_-]*:[A-Za-z0-9+/_=-]+$';
const INTERNAL_ID_PATTERN = '^obx:(norad|cospar|provider):[a-z0-9._:-]+$';
const ISO_TIMESTAMP_PATTERN = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$';

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
}

const vectorSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['x', 'y', 'z'],
    properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' }
    }
};

const datasetHashSchema = { type: 'string', pattern: HASH_PATTERN };
const timestampSchema = { type: 'string', pattern: ISO_TIMESTAMP_PATTERN };
const objectIdSchema = { type: 'string', pattern: INTERNAL_ID_PATTERN };
const fullScreeningConfigurationSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
        'configuration_version', 'screening_radius_km', 'horizon_seconds',
        'coarse_step_seconds', 'refinement_tolerance_seconds', 'refinement_subdivisions',
        'max_results', 'max_refinement_iterations', 'max_relative_acceleration_km_s2',
        'coarse_padding_km', 'yield_every_operations', 'start_time', 'end_time'
    ],
    properties: {
        configuration_version: { type: 'string', minLength: 1 },
        screening_radius_km: { type: 'number', exclusiveMinimum: 0 },
        horizon_seconds: { type: 'number', exclusiveMinimum: 0 },
        coarse_step_seconds: { type: 'number', exclusiveMinimum: 0 },
        refinement_tolerance_seconds: { type: 'number', exclusiveMinimum: 0 },
        refinement_subdivisions: { type: 'integer', minimum: 1 },
        max_results: { type: 'integer', minimum: 1 },
        max_refinement_iterations: { type: 'integer', minimum: 1 },
        max_relative_acceleration_km_s2: { type: 'number', minimum: 0 },
        coarse_padding_km: { type: 'number', minimum: 0 },
        yield_every_operations: { type: 'integer', minimum: 1 },
        start_time: timestampSchema,
        end_time: timestampSchema
    }
};

export const DOMAIN_SCHEMAS = deepFreeze({
    [CONTRACT_KIND.DATASET_PROVENANCE]: {
        $schema: JSON_SCHEMA_DRAFT,
        $id: `${SCHEMA_BASE}/dataset-provenance.schema.json`,
        title: CONTRACT_KIND.DATASET_PROVENANCE,
        type: 'object',
        additionalProperties: false,
        required: [
            'schema_version', 'source_id', 'provider', 'retrieved_at', 'dataset_id',
            'dataset_hash', 'source_uri', 'source_status', 'partial_update', 'license_id'
        ],
        properties: {
            schema_version: { const: DOMAIN_SCHEMA_VERSION },
            source_id: { type: 'string', minLength: 1 },
            provider: { type: 'string', minLength: 1 },
            retrieved_at: { type: ['string', 'null'], format: 'date-time' },
            dataset_id: { type: 'string', minLength: 1 },
            dataset_hash: datasetHashSchema,
            source_uri: { type: ['string', 'null'] },
            source_status: { enum: ['COMPLETE', 'PARTIAL', 'DEGRADED'] },
            partial_update: { type: 'boolean' },
            license_id: { type: ['string', 'null'] }
        }
    },
    [CONTRACT_KIND.COMPUTATION_PROVENANCE]: {
        $schema: JSON_SCHEMA_DRAFT,
        $id: `${SCHEMA_BASE}/computation-provenance.schema.json`,
        title: CONTRACT_KIND.COMPUTATION_PROVENANCE,
        type: 'object',
        additionalProperties: false,
        required: ['schema_version', 'dataset_id', 'dataset_hash', 'generated_at', 'algorithm', 'input_element_set_ids'],
        properties: {
            schema_version: { const: DOMAIN_SCHEMA_VERSION },
            dataset_id: { type: 'string', minLength: 1 },
            dataset_hash: datasetHashSchema,
            generated_at: timestampSchema,
            algorithm: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'version', 'configuration_hash'],
                properties: {
                    name: { type: 'string', minLength: 1 },
                    version: { type: 'string', minLength: 1 },
                    configuration_hash: datasetHashSchema
                }
            },
            input_element_set_ids: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true }
        }
    },
    [CONTRACT_KIND.CATALOG_OBJECT]: {
        $schema: JSON_SCHEMA_DRAFT,
        $id: `${SCHEMA_BASE}/catalog-object.schema.json`,
        title: CONTRACT_KIND.CATALOG_OBJECT,
        type: 'object',
        additionalProperties: false,
        required: [
            'schema_version', 'object_id', 'name', 'norad_id', 'international_designator',
            'object_type', 'orbit_class', 'lifecycle_status', 'identity', 'element_set',
            'provenance', 'covariance', 'hard_body_radius_km', 'quality_flags'
        ],
        properties: {
            schema_version: { const: DOMAIN_SCHEMA_VERSION },
            object_id: objectIdSchema,
            name: { type: 'string', minLength: 1 },
            norad_id: { type: ['string', 'null'] },
            international_designator: { type: ['string', 'null'] },
            object_type: { enum: Object.values(OBJECT_TYPE) },
            orbit_class: { enum: Object.values(ORBIT_CLASS) },
            lifecycle_status: { enum: Object.values(LIFECYCLE_STATUS) },
            identity: {
                type: 'object',
                additionalProperties: false,
                required: ['object_id', 'scheme', 'confidence', 'provisional', 'evidence'],
                properties: {
                    object_id: objectIdSchema,
                    scheme: { enum: ['NORAD', 'COSPAR', 'PROVIDER'] },
                    confidence: { enum: ['AUTHORITATIVE', 'PROVIDER_ASSERTED', 'MANUAL', 'PROVISIONAL'] },
                    provisional: { type: 'boolean' },
                    evidence: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['kind', 'value', 'source_id'],
                            properties: {
                                kind: { enum: ['NORAD_CATALOG_ID', 'INTERNATIONAL_DESIGNATOR', 'PROVIDER_OBJECT_ID'] },
                                value: { type: 'string', minLength: 1 },
                                source_id: { type: ['string', 'null'] }
                            }
                        }
                    }
                }
            },
            element_set: {
                type: 'object',
                additionalProperties: false,
                required: ['element_set_id', 'object_id', 'format', 'epoch', 'time_scale', 'native_frame', 'line1', 'line2', 'provenance'],
                properties: {
                    element_set_id: { type: 'string', minLength: 1 },
                    object_id: objectIdSchema,
                    format: { enum: ['TLE', 'OMM', 'OEM', 'OPM', 'PROVIDER_EPHEMERIS'] },
                    epoch: timestampSchema,
                    time_scale: { enum: Object.values(TIME_SCALE) },
                    native_frame: { enum: Object.values(REFERENCE_FRAME) },
                    line1: { type: ['string', 'null'] },
                    line2: { type: ['string', 'null'] },
                    provenance: { $ref: `${SCHEMA_BASE}/dataset-provenance.schema.json` }
                }
            },
            provenance: { $ref: `${SCHEMA_BASE}/dataset-provenance.schema.json` },
            covariance: { type: ['object', 'null'] },
            hard_body_radius_km: { type: ['number', 'null'], minimum: 0 },
            quality_flags: { type: 'array', items: { type: 'string' }, uniqueItems: true }
        }
    },
    [CONTRACT_KIND.STATE_VECTOR]: {
        $schema: JSON_SCHEMA_DRAFT,
        $id: `${SCHEMA_BASE}/state-vector.schema.json`,
        title: CONTRACT_KIND.STATE_VECTOR,
        type: 'object',
        additionalProperties: false,
        required: [
            'schema_version', 'object_id', 'element_set_id', 'timestamp', 'time_scale', 'frame',
            'position_km', 'velocity_km_s', 'units', 'provenance', 'quality_flags'
        ],
        properties: {
            schema_version: { const: DOMAIN_SCHEMA_VERSION },
            object_id: objectIdSchema,
            element_set_id: { type: 'string', minLength: 1 },
            timestamp: timestampSchema,
            time_scale: { const: TIME_SCALE.UTC },
            frame: { enum: Object.values(REFERENCE_FRAME) },
            position_km: vectorSchema,
            velocity_km_s: vectorSchema,
            units: {
                type: 'object',
                additionalProperties: false,
                required: ['position', 'velocity'],
                properties: { position: { const: 'km' }, velocity: { const: 'km/s' } }
            },
            provenance: { $ref: `${SCHEMA_BASE}/computation-provenance.schema.json` },
            quality_flags: { type: 'array', items: { type: 'string' }, uniqueItems: true }
        }
    },
    [CONTRACT_KIND.SCREENING_REQUEST]: {
        $schema: JSON_SCHEMA_DRAFT,
        $id: `${SCHEMA_BASE}/screening-request.schema.json`,
        title: CONTRACT_KIND.SCREENING_REQUEST,
        type: 'object',
        additionalProperties: false,
        required: [
            'schema_version', 'request_id', 'capability', 'maturity', 'requested_at',
            'primary_object_id', 'candidate_object_ids', 'dataset_id', 'dataset_hash', 'dataset_provenance',
            'start_time', 'end_time', 'time_scale', 'frame', 'configuration'
        ],
        properties: {
            schema_version: { const: DOMAIN_SCHEMA_VERSION },
            request_id: { type: 'string', minLength: 1 },
            capability: { const: CAPABILITY.SELECTED_OBJECT_SCREENING },
            maturity: { const: CAPABILITY_MATURITY.EXPERIMENTAL },
            requested_at: timestampSchema,
            primary_object_id: objectIdSchema,
            candidate_object_ids: { type: ['array', 'null'], items: objectIdSchema, uniqueItems: true },
            dataset_id: { type: 'string', minLength: 1 },
            dataset_hash: datasetHashSchema,
            dataset_provenance: { $ref: `${SCHEMA_BASE}/dataset-provenance.schema.json` },
            start_time: timestampSchema,
            end_time: timestampSchema,
            time_scale: { const: TIME_SCALE.UTC },
            frame: { const: REFERENCE_FRAME.TEME },
            configuration: fullScreeningConfigurationSchema
        }
    },
    [CONTRACT_KIND.CONJUNCTION_EVENT]: {
        $schema: JSON_SCHEMA_DRAFT,
        $id: `${SCHEMA_BASE}/conjunction-event.schema.json`,
        title: CONTRACT_KIND.CONJUNCTION_EVENT,
        type: 'object',
        additionalProperties: false,
        required: [
            'schema_version', 'event_id', 'request_id', 'pair_key', 'primary_object_id',
            'secondary_object_id', 'primary_name', 'secondary_name', 'tca', 'time_scale', 'frame',
            'primary_state', 'secondary_state', 'miss_distance_km',
            'relative_position_km', 'relative_velocity_km_s', 'relative_speed_km_s',
            'screening_radius_km', 'collision_probability', 'collision_probability_method',
            'covariance_status', 'hard_body_radius_km', 'primary_element_set',
            'secondary_element_set', 'maturity', 'dataset_provenance', 'provenance', 'quality_flags', 'analysis'
        ],
        properties: {
            schema_version: { const: DOMAIN_SCHEMA_VERSION },
            event_id: { type: 'string', minLength: 1 },
            request_id: { type: 'string', minLength: 1 },
            pair_key: { type: 'string', minLength: 1 },
            primary_object_id: objectIdSchema,
            secondary_object_id: objectIdSchema,
            primary_name: { type: 'string', minLength: 1 },
            secondary_name: { type: 'string', minLength: 1 },
            tca: timestampSchema,
            time_scale: { const: TIME_SCALE.UTC },
            frame: { const: REFERENCE_FRAME.TEME },
            primary_state: { $ref: `${SCHEMA_BASE}/state-vector.schema.json` },
            secondary_state: { $ref: `${SCHEMA_BASE}/state-vector.schema.json` },
            miss_distance_km: { type: 'number', minimum: 0 },
            relative_position_km: vectorSchema,
            relative_velocity_km_s: vectorSchema,
            relative_speed_km_s: { type: 'number', minimum: 0 },
            screening_radius_km: { type: 'number', exclusiveMinimum: 0 },
            collision_probability: { type: ['number', 'null'], minimum: 0, maximum: 1 },
            collision_probability_method: { type: ['string', 'null'] },
            covariance_status: { enum: ['UNAVAILABLE', 'INVALID', 'VALIDATED'] },
            hard_body_radius_km: { type: ['number', 'null'], minimum: 0 },
            primary_element_set: {
                type: 'object',
                additionalProperties: false,
                required: ['element_set_id', 'epoch', 'age_days'],
                properties: {
                    element_set_id: { type: 'string', minLength: 1 },
                    epoch: timestampSchema,
                    age_days: { type: 'number' }
                }
            },
            secondary_element_set: {
                type: 'object',
                additionalProperties: false,
                required: ['element_set_id', 'epoch', 'age_days'],
                properties: {
                    element_set_id: { type: 'string', minLength: 1 },
                    epoch: timestampSchema,
                    age_days: { type: 'number' }
                }
            },
            maturity: { const: CAPABILITY_MATURITY.EXPERIMENTAL },
            dataset_provenance: { $ref: `${SCHEMA_BASE}/dataset-provenance.schema.json` },
            provenance: { $ref: `${SCHEMA_BASE}/computation-provenance.schema.json` },
            quality_flags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
            analysis: {
                type: ['object', 'null'],
                additionalProperties: false,
                properties: {
                    coarse_interval_start: timestampSchema,
                    coarse_interval_end: timestampSchema,
                    coarse_miss_distance_km: { type: 'number', minimum: 0 },
                    broad_phase_margin_km: { type: 'number', minimum: 0 },
                    refinement_iterations: { type: 'integer', minimum: 0 },
                    refinement_converged: { type: 'boolean' },
                    boundary_event: { type: 'boolean' }
                }
            }
        }
    },
    [CONTRACT_KIND.SCREENING_RESULT]: {
        $schema: JSON_SCHEMA_DRAFT,
        $id: `${SCHEMA_BASE}/screening-result.schema.json`,
        title: CONTRACT_KIND.SCREENING_RESULT,
        type: 'object',
        additionalProperties: false,
        required: [
            'schema_version', 'request_id', 'status', 'started_at', 'completed_at',
            'maturity', 'request', 'configuration', 'events', 'statistics', 'errors',
            'dataset_provenance', 'provenance', 'quality_flags'
        ],
        properties: {
            schema_version: { const: DOMAIN_SCHEMA_VERSION },
            request_id: { type: 'string', minLength: 1 },
            status: { enum: ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'] },
            started_at: timestampSchema,
            completed_at: { anyOf: [timestampSchema, { type: 'null' }] },
            maturity: { const: CAPABILITY_MATURITY.EXPERIMENTAL },
            request: { $ref: `${SCHEMA_BASE}/screening-request.schema.json` },
            configuration: fullScreeningConfigurationSchema,
            events: { type: 'array', items: { $ref: `${SCHEMA_BASE}/conjunction-event.schema.json` } },
            statistics: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'catalog_objects', 'candidates_examined', 'events_refined', 'propagation_failures',
                    'self_pairs_skipped', 'coarse_intervals_tested', 'coarse_candidates', 'events_detected',
                    'events_reported', 'events_truncated', 'truncated_error_count'
                ],
                properties: {
                    catalog_objects: { type: 'integer', minimum: 0 },
                    candidates_examined: { type: 'integer', minimum: 0 },
                    events_refined: { type: 'integer', minimum: 0 },
                    propagation_failures: { type: 'integer', minimum: 0 },
                    self_pairs_skipped: { type: 'integer', minimum: 0 },
                    coarse_intervals_tested: { type: 'integer', minimum: 0 },
                    coarse_candidates: { type: 'integer', minimum: 0 },
                    events_detected: { type: 'integer', minimum: 0 },
                    events_reported: { type: 'integer', minimum: 0 },
                    events_truncated: { type: 'integer', minimum: 0 },
                    truncated_error_count: { type: 'integer', minimum: 0 }
                }
            },
            errors: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: [
                        'code', 'message', 'stage', 'object_id', 'element_set_id', 'timestamp',
                        'propagator_error_code', 'recoverable', 'role', 'catalog_index', 'refinement'
                    ],
                    properties: {
                        code: { type: 'string', minLength: 1 },
                        message: { type: 'string', minLength: 1 },
                        stage: { type: 'string', minLength: 1 },
                        object_id: { type: ['string', 'null'] },
                        element_set_id: { type: ['string', 'null'] },
                        timestamp: { type: ['string', 'null'] },
                        propagator_error_code: { type: ['number', 'string', 'null'] },
                        recoverable: { type: 'boolean' },
                        role: { enum: ['PRIMARY', 'SECONDARY'] },
                        catalog_index: { type: ['integer', 'null'], minimum: 0 },
                        refinement: { type: 'boolean' }
                    }
                }
            },
            dataset_provenance: { $ref: `${SCHEMA_BASE}/dataset-provenance.schema.json` },
            provenance: { $ref: `${SCHEMA_BASE}/computation-provenance.schema.json` },
            quality_flags: { type: 'array', items: { type: 'string' }, uniqueItems: true }
        }
    }
});

/** @typedef {{path: string, code: string, message: string, severity: 'error'|'warning'}} ValidationIssue */
/** @template T @typedef {{valid: boolean, value: T, issues: readonly ValidationIssue[], errors: readonly ValidationIssue[], warnings: readonly ValidationIssue[]}} ValidationResult */
/** @typedef {{x: number, y: number, z: number}} CartesianVector */
/** @typedef {{schema_version: string, source_id: string, provider: string, retrieved_at: string|null, dataset_id: string, dataset_hash: string, source_uri: string|null, source_status: string, partial_update: boolean, license_id: string|null}} DatasetProvenance */
/** @typedef {{schema_version: string, object_id: string, element_set_id: string, timestamp: string, time_scale: string, frame: string, position_km: CartesianVector, velocity_km_s: CartesianVector, units: {position: 'km', velocity: 'km/s'}, provenance: object, quality_flags: string[]}} StateVector */

export class ContractValidationError extends TypeError {
    constructor(contractKind, issues) {
        const errors = issues.filter(issue => issue.severity === 'error');
        const summary = errors.slice(0, 3).map(issue => `${issue.path} ${issue.message}`).join('; ');
        super(`${contractKind} validation failed${summary ? `: ${summary}` : '.'}`);
        this.name = 'ContractValidationError';
        this.contractKind = contractKind;
        this.issues = issues;
    }
}

function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function issue(issues, path, code, message, severity = 'error') {
    issues.push(Object.freeze({ path, code, message, severity }));
}

function finalize(value, issues) {
    const frozenIssues = Object.freeze([...issues]);
    const errors = Object.freeze(frozenIssues.filter(item => item.severity === 'error'));
    const warnings = Object.freeze(frozenIssues.filter(item => item.severity === 'warning'));
    return Object.freeze({ valid: errors.length === 0, value, issues: frozenIssues, errors, warnings });
}

function mergeIssues(target, result, prefix) {
    result.issues.forEach(item => {
        const suffix = item.path === '$' ? '' : item.path.slice(1);
        issue(target, `${prefix}${suffix}`, item.code, item.message, item.severity);
    });
}

function requireRecord(value, issues, path) {
    if (!isRecord(value)) {
        issue(issues, path, 'TYPE_OBJECT_REQUIRED', 'must be an object.');
        return false;
    }
    return true;
}

function rejectUnknownProperties(value, allowed, issues, path) {
    if (!isRecord(value)) return;
    const allowedSet = new Set(allowed);
    Object.keys(value).forEach(key => {
        if (!allowedSet.has(key)) {
            issue(issues, `${path}.${key}`, 'UNKNOWN_PROPERTY', 'is not defined by this contract.');
        }
    });
}

function requireString(value, issues, path, { nullable = false } = {}) {
    if (nullable && value === null) return true;
    if (typeof value !== 'string' || !value.trim()) {
        issue(issues, path, 'TYPE_NONEMPTY_STRING_REQUIRED', 'must be a non-empty string.');
        return false;
    }
    return true;
}

function requireBoolean(value, issues, path) {
    if (typeof value !== 'boolean') {
        issue(issues, path, 'TYPE_BOOLEAN_REQUIRED', 'must be a boolean.');
        return false;
    }
    return true;
}

function requireFinite(value, issues, path, { minimum = null, exclusiveMinimum = false, nullable = false } = {}) {
    if (nullable && value === null) return true;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        issue(issues, path, 'FINITE_NUMBER_REQUIRED', 'must be a finite number.');
        return false;
    }
    if (minimum !== null && (exclusiveMinimum ? value <= minimum : value < minimum)) {
        issue(issues, path, 'NUMBER_OUT_OF_RANGE', `must be ${exclusiveMinimum ? 'greater than' : 'at least'} ${minimum}.`);
        return false;
    }
    return true;
}

function requireEnum(value, allowed, issues, path) {
    if (!allowed.includes(value)) {
        issue(issues, path, 'ENUM_VALUE_REQUIRED', `must be one of: ${allowed.join(', ')}.`);
        return false;
    }
    return true;
}

function validateSchemaVersion(value, issues, path = '$.schema_version') {
    if (value !== DOMAIN_SCHEMA_VERSION) {
        issue(issues, path, 'SCHEMA_VERSION_UNSUPPORTED', `must equal ${DOMAIN_SCHEMA_VERSION}.`);
    }
}

function validateTimestamp(value, issues, path) {
    try {
        normalizeUtcInstant(value, path);
        return true;
    } catch (error) {
        issue(issues, path, 'UTC_TIMESTAMP_INVALID', error.message);
        return false;
    }
}

function validateHash(value, issues, path) {
    if (!requireString(value, issues, path)) return false;
    if (!/^[a-z0-9][a-z0-9_-]*:[A-Za-z0-9+/_=-]+$/.test(value)) {
        issue(issues, path, 'HASH_FORMAT_INVALID', 'must include an algorithm prefix and encoded digest.');
        return false;
    }
    return true;
}

function validateObjectId(value, issues, path) {
    if (!requireString(value, issues, path)) return false;
    if (!isInternalObjectId(value)) {
        issue(issues, path, 'OBJECT_ID_INVALID', 'must be a canonical obx object identifier.');
        return false;
    }
    return true;
}

function validateStringArray(value, issues, path, { nullable = false } = {}) {
    if (nullable && value === null) return true;
    if (!Array.isArray(value)) {
        issue(issues, path, 'TYPE_ARRAY_REQUIRED', 'must be an array.');
        return false;
    }
    const seen = new Set();
    value.forEach((item, index) => {
        if (!requireString(item, issues, `${path}[${index}]`)) return;
        if (seen.has(item)) issue(issues, `${path}[${index}]`, 'DUPLICATE_ARRAY_VALUE', 'must be unique.');
        seen.add(item);
    });
    return true;
}

function validateVector(value, issues, path) {
    if (!requireRecord(value, issues, path)) return false;
    rejectUnknownProperties(value, ['x', 'y', 'z'], issues, path);
    const issueCount = issues.length;
    ['x', 'y', 'z'].forEach(axis => requireFinite(value[axis], issues, `${path}.${axis}`));
    return issues.length === issueCount;
}

function vectorMagnitude(vector) {
    return Math.hypot(vector.x, vector.y, vector.z);
}

function vectorDifference(minuend, subtrahend) {
    return {
        x: minuend.x - subtrahend.x,
        y: minuend.y - subtrahend.y,
        z: minuend.z - subtrahend.z
    };
}

function vectorsApproximatelyEqual(left, right) {
    return ['x', 'y', 'z'].every(axis => approximatelyEqual(left[axis], right[axis]));
}

function approximatelyEqual(left, right) {
    return Math.abs(left - right) <= Math.max(1e-9, Math.max(Math.abs(left), Math.abs(right)) * 1e-7);
}

export function validateDatasetProvenance(value) {
    const issues = [];
    if (!requireRecord(value, issues, '$')) return finalize(value, issues);
    rejectUnknownProperties(value, [
        'schema_version', 'source_id', 'provider', 'retrieved_at', 'dataset_id', 'dataset_hash',
        'source_uri', 'source_status', 'partial_update', 'license_id'
    ], issues, '$');
    validateSchemaVersion(value.schema_version, issues);
    requireString(value.source_id, issues, '$.source_id');
    requireString(value.provider, issues, '$.provider');
    if (value.retrieved_at !== null) validateTimestamp(value.retrieved_at, issues, '$.retrieved_at');
    requireString(value.dataset_id, issues, '$.dataset_id');
    validateHash(value.dataset_hash, issues, '$.dataset_hash');
    if (value.source_uri !== null) requireString(value.source_uri, issues, '$.source_uri');
    requireEnum(value.source_status, ['COMPLETE', 'PARTIAL', 'DEGRADED'], issues, '$.source_status');
    requireBoolean(value.partial_update, issues, '$.partial_update');
    if (value.license_id !== null) requireString(value.license_id, issues, '$.license_id');
    if (value.source_status === 'PARTIAL' && value.partial_update !== true) {
        issue(issues, '$.partial_update', 'PARTIAL_STATUS_MISMATCH', 'must be true when source_status is PARTIAL.');
    }
    return finalize(value, issues);
}

export function normalizeDatasetProvenance(input = {}) {
    const normalized = {
        schema_version: input.schema_version ?? DOMAIN_SCHEMA_VERSION,
        source_id: String(input.source_id ?? '').trim(),
        provider: String(input.provider ?? '').trim(),
        retrieved_at: input.retrieved_at == null ? null : normalizeUtcInstant(input.retrieved_at, 'retrieved_at'),
        dataset_id: String(input.dataset_id ?? '').trim(),
        dataset_hash: String(input.dataset_hash ?? '').trim(),
        source_uri: input.source_uri == null ? null : String(input.source_uri).trim(),
        source_status: String(input.source_status ?? '').trim().toUpperCase(),
        partial_update: input.partial_update,
        license_id: input.license_id == null ? null : String(input.license_id).trim()
    };
    assertDatasetProvenance(normalized);
    return deepFreeze(normalized);
}

export function assertDatasetProvenance(value) {
    return assertContractResult(CONTRACT_KIND.DATASET_PROVENANCE, validateDatasetProvenance(value));
}

export function validateComputationProvenance(value) {
    const issues = [];
    if (!requireRecord(value, issues, '$')) return finalize(value, issues);
    rejectUnknownProperties(value, [
        'schema_version', 'dataset_id', 'dataset_hash', 'generated_at', 'algorithm', 'input_element_set_ids'
    ], issues, '$');
    validateSchemaVersion(value.schema_version, issues);
    requireString(value.dataset_id, issues, '$.dataset_id');
    validateHash(value.dataset_hash, issues, '$.dataset_hash');
    validateTimestamp(value.generated_at, issues, '$.generated_at');
    if (requireRecord(value.algorithm, issues, '$.algorithm')) {
        rejectUnknownProperties(value.algorithm, ['name', 'version', 'configuration_hash'], issues, '$.algorithm');
        requireString(value.algorithm.name, issues, '$.algorithm.name');
        requireString(value.algorithm.version, issues, '$.algorithm.version');
        validateHash(value.algorithm.configuration_hash, issues, '$.algorithm.configuration_hash');
    }
    validateStringArray(value.input_element_set_ids, issues, '$.input_element_set_ids');
    return finalize(value, issues);
}

export function normalizeComputationProvenance(input = {}) {
    const algorithm = input.algorithm ?? {};
    const normalized = {
        schema_version: input.schema_version ?? DOMAIN_SCHEMA_VERSION,
        dataset_id: String(input.dataset_id ?? '').trim(),
        dataset_hash: String(input.dataset_hash ?? '').trim(),
        generated_at: normalizeUtcInstant(input.generated_at, 'generated_at'),
        algorithm: {
            name: String(algorithm.name ?? '').trim(),
            version: String(algorithm.version ?? '').trim(),
            configuration_hash: String(algorithm.configuration_hash ?? '').trim()
        },
        input_element_set_ids: [...(input.input_element_set_ids ?? [])].map(String)
    };
    assertComputationProvenance(normalized);
    return deepFreeze(normalized);
}

export function assertComputationProvenance(value) {
    return assertContractResult(CONTRACT_KIND.COMPUTATION_PROVENANCE, validateComputationProvenance(value));
}

function validateElementSet(value, issues, path, expectedObjectId) {
    if (!requireRecord(value, issues, path)) return;
    rejectUnknownProperties(value, [
        'element_set_id', 'object_id', 'format', 'epoch', 'time_scale', 'native_frame', 'line1', 'line2', 'provenance'
    ], issues, path);
    requireString(value.element_set_id, issues, `${path}.element_set_id`);
    validateObjectId(value.object_id, issues, `${path}.object_id`);
    if (value.object_id !== expectedObjectId) {
        issue(issues, `${path}.object_id`, 'ELEMENT_OBJECT_ID_MISMATCH', 'must match the catalog object identifier.');
    }
    requireEnum(value.format, ['TLE', 'OMM', 'OEM', 'OPM', 'PROVIDER_EPHEMERIS'], issues, `${path}.format`);
    validateTimestamp(value.epoch, issues, `${path}.epoch`);
    requireEnum(value.time_scale, Object.values(TIME_SCALE), issues, `${path}.time_scale`);
    requireEnum(value.native_frame, Object.values(REFERENCE_FRAME), issues, `${path}.native_frame`);
    if (value.format === 'TLE') {
        requireString(value.line1, issues, `${path}.line1`);
        requireString(value.line2, issues, `${path}.line2`);
        if (value.time_scale !== TIME_SCALE.UTC) {
            issue(issues, `${path}.time_scale`, 'TLE_TIME_SCALE_INVALID', 'TLE epochs must use UTC in the v2.0 contract.');
        }
        if (value.native_frame !== REFERENCE_FRAME.TEME) {
            issue(issues, `${path}.native_frame`, 'TLE_FRAME_INVALID', 'SGP4 TLE states must be identified as TEME.');
        }
    }
    const provenanceResult = validateDatasetProvenance(value.provenance);
    mergeIssues(issues, provenanceResult, `${path}.provenance`);
}

export function validateCatalogObject(value) {
    const issues = [];
    if (!requireRecord(value, issues, '$')) return finalize(value, issues);
    rejectUnknownProperties(value, [
        'schema_version', 'object_id', 'name', 'norad_id', 'international_designator', 'object_type',
        'orbit_class', 'lifecycle_status', 'identity', 'element_set', 'provenance', 'covariance',
        'hard_body_radius_km', 'quality_flags'
    ], issues, '$');
    validateSchemaVersion(value.schema_version, issues);
    validateObjectId(value.object_id, issues, '$.object_id');
    requireString(value.name, issues, '$.name');
    requireString(value.norad_id, issues, '$.norad_id', { nullable: true });
    requireString(value.international_designator, issues, '$.international_designator', { nullable: true });
    requireEnum(value.object_type, Object.values(OBJECT_TYPE), issues, '$.object_type');
    requireEnum(value.orbit_class, Object.values(ORBIT_CLASS), issues, '$.orbit_class');
    requireEnum(value.lifecycle_status, Object.values(LIFECYCLE_STATUS), issues, '$.lifecycle_status');
    if (requireRecord(value.identity, issues, '$.identity')) {
        rejectUnknownProperties(value.identity, ['object_id', 'scheme', 'confidence', 'provisional', 'evidence'], issues, '$.identity');
        if (value.identity.object_id !== value.object_id) {
            issue(issues, '$.identity.object_id', 'IDENTITY_OBJECT_ID_MISMATCH', 'must match object_id.');
        }
        if (!Array.isArray(value.identity.evidence)) {
            issue(issues, '$.identity.evidence', 'IDENTITY_EVIDENCE_REQUIRED', 'must be an array.');
        } else {
            value.identity.evidence.forEach((evidence, index) => {
                const path = `$.identity.evidence[${index}]`;
                if (!requireRecord(evidence, issues, path)) return;
                rejectUnknownProperties(evidence, ['kind', 'value', 'source_id'], issues, path);
                requireEnum(evidence.kind, ['NORAD_CATALOG_ID', 'INTERNATIONAL_DESIGNATOR', 'PROVIDER_OBJECT_ID'], issues, `${path}.kind`);
                requireString(evidence.value, issues, `${path}.value`);
                requireString(evidence.source_id, issues, `${path}.source_id`, { nullable: true });
            });
        }
        requireEnum(value.identity.scheme, ['NORAD', 'COSPAR', 'PROVIDER'], issues, '$.identity.scheme');
        requireEnum(value.identity.confidence, ['AUTHORITATIVE', 'PROVIDER_ASSERTED', 'MANUAL', 'PROVISIONAL'], issues, '$.identity.confidence');
        requireBoolean(value.identity.provisional, issues, '$.identity.provisional');
    }
    validateElementSet(value.element_set, issues, '$.element_set', value.object_id);
    const provenanceResult = validateDatasetProvenance(value.provenance);
    mergeIssues(issues, provenanceResult, '$.provenance');
    if (
        provenanceResult.valid && isRecord(value.element_set?.provenance) &&
        (value.element_set.provenance.dataset_id !== value.provenance.dataset_id ||
            value.element_set.provenance.dataset_hash !== value.provenance.dataset_hash)
    ) {
        issue(issues, '$.element_set.provenance', 'ELEMENT_PROVENANCE_MISMATCH', 'must identify the catalog dataset.');
    }
    if (value.covariance !== null && !isRecord(value.covariance)) {
        issue(issues, '$.covariance', 'COVARIANCE_OBJECT_OR_NULL_REQUIRED', 'must be an object or null.');
    }
    requireFinite(value.hard_body_radius_km, issues, '$.hard_body_radius_km', { minimum: 0, nullable: true });
    validateStringArray(value.quality_flags, issues, '$.quality_flags');
    return finalize(value, issues);
}

export function assertCatalogObject(value) {
    return assertContractResult(CONTRACT_KIND.CATALOG_OBJECT, validateCatalogObject(value));
}

export function validateStateVector(value) {
    const issues = [];
    if (!requireRecord(value, issues, '$')) return finalize(value, issues);
    rejectUnknownProperties(value, [
        'schema_version', 'object_id', 'element_set_id', 'timestamp', 'time_scale', 'frame',
        'position_km', 'velocity_km_s', 'units', 'provenance', 'quality_flags'
    ], issues, '$');
    validateSchemaVersion(value.schema_version, issues);
    validateObjectId(value.object_id, issues, '$.object_id');
    requireString(value.element_set_id, issues, '$.element_set_id');
    validateTimestamp(value.timestamp, issues, '$.timestamp');
    requireEnum(value.time_scale, [TIME_SCALE.UTC], issues, '$.time_scale');
    requireEnum(value.frame, Object.values(REFERENCE_FRAME), issues, '$.frame');
    validateVector(value.position_km, issues, '$.position_km');
    validateVector(value.velocity_km_s, issues, '$.velocity_km_s');
    if (requireRecord(value.units, issues, '$.units')) {
        rejectUnknownProperties(value.units, ['position', 'velocity'], issues, '$.units');
        if (value.units.position !== 'km') issue(issues, '$.units.position', 'POSITION_UNIT_INVALID', 'must be km.');
        if (value.units.velocity !== 'km/s') issue(issues, '$.units.velocity', 'VELOCITY_UNIT_INVALID', 'must be km/s.');
    }
    const provenanceResult = validateComputationProvenance(value.provenance);
    mergeIssues(issues, provenanceResult, '$.provenance');
    if (provenanceResult.valid && !value.provenance.input_element_set_ids.includes(value.element_set_id)) {
        issue(issues, '$.provenance.input_element_set_ids', 'STATE_ELEMENT_SET_PROVENANCE_MISSING', 'must include element_set_id.');
    }
    validateStringArray(value.quality_flags, issues, '$.quality_flags');
    return finalize(value, issues);
}

export function normalizeStateVector(input = {}) {
    const normalized = {
        schema_version: input.schema_version ?? DOMAIN_SCHEMA_VERSION,
        object_id: catalogObjectId({ object_id: input.object_id ?? input.objectId }),
        element_set_id: String(input.element_set_id ?? input.elementSetId ?? '').trim(),
        timestamp: normalizeUtcInstant(input.timestamp ?? input.time, 'state timestamp'),
        time_scale: String(input.time_scale ?? input.timeScale ?? '').trim().toUpperCase(),
        frame: String(input.frame ?? '').trim().toUpperCase(),
        position_km: normalizeVector(input.position_km ?? input.positionKm),
        velocity_km_s: normalizeVector(input.velocity_km_s ?? input.velocityKmS),
        units: { position: input.units?.position ?? 'km', velocity: input.units?.velocity ?? 'km/s' },
        provenance: normalizeComputationProvenance(input.provenance),
        quality_flags: [...(input.quality_flags ?? input.qualityFlags ?? [])].map(String)
    };
    assertStateVector(normalized);
    return deepFreeze(normalized);
}

function normalizeVector(value = {}) {
    return { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
}

export function assertStateVector(value) {
    return assertContractResult(CONTRACT_KIND.STATE_VECTOR, validateStateVector(value));
}

function validateScreeningConfiguration(value, issues, path) {
    if (!requireRecord(value, issues, path)) return;
    rejectUnknownProperties(value, ['screening_radius_km', 'coarse_step_seconds', 'refinement_tolerance_seconds'], issues, path);
    const radiusValid = requireFinite(value.screening_radius_km, issues, `${path}.screening_radius_km`, { minimum: 0, exclusiveMinimum: true });
    const stepValid = requireFinite(value.coarse_step_seconds, issues, `${path}.coarse_step_seconds`, { minimum: 0, exclusiveMinimum: true });
    const toleranceValid = requireFinite(value.refinement_tolerance_seconds, issues, `${path}.refinement_tolerance_seconds`, { minimum: 0, exclusiveMinimum: true });
    if (stepValid && toleranceValid && value.refinement_tolerance_seconds > value.coarse_step_seconds) {
        issue(issues, `${path}.refinement_tolerance_seconds`, 'REFINEMENT_TOLERANCE_TOO_LARGE', 'must not exceed the coarse step.');
    }
    if (radiusValid && value.screening_radius_km > 100_000) {
        issue(issues, `${path}.screening_radius_km`, 'SCREENING_RADIUS_EXTREME', 'is unusually large for close-approach screening.', 'warning');
    }
}

function validateFullScreeningConfiguration(value, issues, path) {
    if (!requireRecord(value, issues, path)) return;
    const keys = [
        'configuration_version', 'screening_radius_km', 'horizon_seconds',
        'coarse_step_seconds', 'refinement_tolerance_seconds', 'refinement_subdivisions',
        'max_results', 'max_refinement_iterations', 'max_relative_acceleration_km_s2',
        'coarse_padding_km', 'yield_every_operations', 'start_time', 'end_time'
    ];
    rejectUnknownProperties(value, keys, issues, path);
    requireString(value.configuration_version, issues, `${path}.configuration_version`);
    [
        'screening_radius_km', 'horizon_seconds', 'coarse_step_seconds',
        'refinement_tolerance_seconds'
    ].forEach(key => requireFinite(value[key], issues, `${path}.${key}`, {
        minimum: 0,
        exclusiveMinimum: true
    }));
    ['max_relative_acceleration_km_s2', 'coarse_padding_km'].forEach(key => {
        requireFinite(value[key], issues, `${path}.${key}`, { minimum: 0 });
    });
    ['refinement_subdivisions', 'max_results', 'max_refinement_iterations', 'yield_every_operations'].forEach(key => {
        const valid = requireFinite(value[key], issues, `${path}.${key}`, {
            minimum: 0,
            exclusiveMinimum: true
        });
        if (valid && !Number.isInteger(value[key])) {
            issue(issues, `${path}.${key}`, 'INTEGER_REQUIRED', 'must be an integer.');
        }
    });
    const startValid = validateTimestamp(value.start_time, issues, `${path}.start_time`);
    const endValid = validateTimestamp(value.end_time, issues, `${path}.end_time`);
    if (startValid && endValid && Date.parse(value.end_time) <= Date.parse(value.start_time)) {
        issue(issues, `${path}.end_time`, 'SCREENING_WINDOW_INVALID', 'must be later than start_time.');
    }
    if (
        Number.isFinite(value.refinement_tolerance_seconds) &&
        Number.isFinite(value.coarse_step_seconds) &&
        value.refinement_tolerance_seconds > value.coarse_step_seconds
    ) {
        issue(issues, `${path}.refinement_tolerance_seconds`, 'REFINEMENT_TOLERANCE_TOO_LARGE', 'must not exceed the coarse step.');
    }
}

export function validateScreeningRequest(value) {
    const issues = [];
    if (!requireRecord(value, issues, '$')) return finalize(value, issues);
    rejectUnknownProperties(value, [
        'schema_version', 'request_id', 'capability', 'maturity', 'requested_at', 'primary_object_id',
        'candidate_object_ids', 'dataset_id', 'dataset_hash', 'dataset_provenance', 'start_time', 'end_time', 'time_scale',
        'frame', 'configuration'
    ], issues, '$');
    validateSchemaVersion(value.schema_version, issues);
    requireString(value.request_id, issues, '$.request_id');
    requireEnum(value.capability, [CAPABILITY.SELECTED_OBJECT_SCREENING], issues, '$.capability');
    requireEnum(value.maturity, [CAPABILITY_MATURITY.EXPERIMENTAL], issues, '$.maturity');
    validateTimestamp(value.requested_at, issues, '$.requested_at');
    validateObjectId(value.primary_object_id, issues, '$.primary_object_id');
    validateStringArray(value.candidate_object_ids, issues, '$.candidate_object_ids', { nullable: true });
    if (Array.isArray(value.candidate_object_ids)) {
        value.candidate_object_ids.forEach((candidate, index) => {
            validateObjectId(candidate, issues, `$.candidate_object_ids[${index}]`);
            if (candidate === value.primary_object_id) {
                issue(issues, `$.candidate_object_ids[${index}]`, 'SCREENING_SELF_PAIR', 'must not include the primary object.');
            }
        });
    }
    requireString(value.dataset_id, issues, '$.dataset_id');
    validateHash(value.dataset_hash, issues, '$.dataset_hash');
    const datasetProvenanceResult = validateDatasetProvenance(value.dataset_provenance);
    mergeIssues(issues, datasetProvenanceResult, '$.dataset_provenance');
    if (
        datasetProvenanceResult.valid &&
        (value.dataset_provenance.dataset_id !== value.dataset_id ||
            value.dataset_provenance.dataset_hash !== value.dataset_hash)
    ) {
        issue(issues, '$.dataset_provenance', 'REQUEST_DATASET_PROVENANCE_MISMATCH', 'must match dataset_id and dataset_hash.');
    }
    const startValid = validateTimestamp(value.start_time, issues, '$.start_time');
    const endValid = validateTimestamp(value.end_time, issues, '$.end_time');
    if (startValid && endValid && Date.parse(value.end_time) <= Date.parse(value.start_time)) {
        issue(issues, '$.end_time', 'SCREENING_WINDOW_INVALID', 'must be later than start_time.');
    }
    requireEnum(value.time_scale, [TIME_SCALE.UTC], issues, '$.time_scale');
    try {
        assertSupportedFrame(value.frame, CAPABILITY.SELECTED_OBJECT_SCREENING);
    } catch (error) {
        issue(issues, '$.frame', 'SCREENING_FRAME_UNSUPPORTED', error.message);
    }
    validateFullScreeningConfiguration(value.configuration, issues, '$.configuration');
    return finalize(value, issues);
}

export function normalizeScreeningRequest(input = {}) {
    const configuration = input.configuration ?? {};
    const normalized = {
        schema_version: input.schema_version ?? DOMAIN_SCHEMA_VERSION,
        request_id: String(input.request_id ?? input.requestId ?? '').trim(),
        capability: input.capability ?? CAPABILITY.SELECTED_OBJECT_SCREENING,
        maturity: input.maturity ?? CAPABILITY_MATURITY.EXPERIMENTAL,
        requested_at: normalizeUtcInstant(input.requested_at ?? input.requestedAt, 'requested_at'),
        primary_object_id: catalogObjectId({ object_id: input.primary_object_id ?? input.primaryObjectId }),
        candidate_object_ids: input.candidate_object_ids == null && input.candidateObjectIds == null
            ? null
            : [...(input.candidate_object_ids ?? input.candidateObjectIds)].map(item => catalogObjectId({ object_id: item })),
        dataset_id: String(input.dataset_id ?? input.datasetId ?? '').trim(),
        dataset_hash: String(input.dataset_hash ?? input.datasetHash ?? '').trim(),
        dataset_provenance: normalizeDatasetProvenance(input.dataset_provenance ?? input.datasetProvenance),
        start_time: normalizeUtcInstant(input.start_time ?? input.startTime, 'start_time'),
        end_time: normalizeUtcInstant(input.end_time ?? input.endTime, 'end_time'),
        time_scale: String(input.time_scale ?? input.timeScale ?? '').trim().toUpperCase(),
        frame: String(input.frame ?? '').trim().toUpperCase(),
        configuration: {
            configuration_version: String(configuration.configuration_version ?? configuration.configurationVersion ?? '').trim(),
            screening_radius_km: Number(configuration.screening_radius_km ?? configuration.screeningRadiusKm),
            horizon_seconds: Number(configuration.horizon_seconds ?? configuration.horizonSeconds),
            coarse_step_seconds: Number(configuration.coarse_step_seconds ?? configuration.coarseStepSeconds),
            refinement_tolerance_seconds: Number(configuration.refinement_tolerance_seconds ?? configuration.refinementToleranceSeconds),
            refinement_subdivisions: Number(configuration.refinement_subdivisions ?? configuration.refinementSubdivisions),
            max_results: Number(configuration.max_results ?? configuration.maxResults),
            max_refinement_iterations: Number(configuration.max_refinement_iterations ?? configuration.maxRefinementIterations),
            max_relative_acceleration_km_s2: Number(configuration.max_relative_acceleration_km_s2 ?? configuration.maxRelativeAccelerationKmS2),
            coarse_padding_km: Number(configuration.coarse_padding_km ?? configuration.coarsePaddingKm),
            yield_every_operations: Number(configuration.yield_every_operations ?? configuration.yieldEveryOperations),
            start_time: normalizeUtcInstant(configuration.start_time ?? configuration.startTime, 'configuration start_time'),
            end_time: normalizeUtcInstant(configuration.end_time ?? configuration.endTime, 'configuration end_time')
        }
    };
    assertScreeningRequest(normalized);
    return deepFreeze(normalized);
}

export function assertScreeningRequest(value) {
    return assertContractResult(CONTRACT_KIND.SCREENING_REQUEST, validateScreeningRequest(value));
}

function validateEventElementSet(value, issues, path) {
    if (!requireRecord(value, issues, path)) return;
    rejectUnknownProperties(value, ['element_set_id', 'epoch', 'age_days'], issues, path);
    requireString(value.element_set_id, issues, `${path}.element_set_id`);
    validateTimestamp(value.epoch, issues, `${path}.epoch`);
    requireFinite(value.age_days, issues, `${path}.age_days`);
}

export function validateConjunctionEvent(value, options = {}) {
    const { allow_collision_probability = false } = options;
    const issues = [];
    if (!requireRecord(value, issues, '$')) return finalize(value, issues);
    rejectUnknownProperties(value, [
        'schema_version', 'event_id', 'request_id', 'pair_key', 'primary_object_id', 'secondary_object_id',
        'primary_name', 'secondary_name', 'tca', 'time_scale', 'frame', 'primary_state', 'secondary_state',
        'miss_distance_km', 'relative_position_km', 'relative_velocity_km_s', 'relative_speed_km_s',
        'screening_radius_km', 'collision_probability', 'collision_probability_method', 'covariance_status',
        'hard_body_radius_km', 'primary_element_set', 'secondary_element_set', 'maturity', 'dataset_provenance', 'provenance',
        'quality_flags', 'analysis'
    ], issues, '$');
    validateSchemaVersion(value.schema_version, issues);
    requireString(value.event_id, issues, '$.event_id');
    const requestIdValid = requireString(value.request_id, issues, '$.request_id');
    validateObjectId(value.primary_object_id, issues, '$.primary_object_id');
    validateObjectId(value.secondary_object_id, issues, '$.secondary_object_id');
    requireString(value.primary_name, issues, '$.primary_name');
    requireString(value.secondary_name, issues, '$.secondary_name');
    if (value.primary_object_id === value.secondary_object_id) {
        issue(issues, '$.secondary_object_id', 'CONJUNCTION_SELF_PAIR', 'must differ from primary_object_id.');
    } else if (isInternalObjectId(value.primary_object_id) && isInternalObjectId(value.secondary_object_id)) {
        const expectedPairKey = canonicalPairKey(value.primary_object_id, value.secondary_object_id);
        if (value.pair_key !== expectedPairKey) {
            issue(issues, '$.pair_key', 'PAIR_KEY_INVALID', `must equal ${expectedPairKey}.`);
        }
    }
    const tcaValid = validateTimestamp(value.tca, issues, '$.tca');
    if (
        tcaValid && requestIdValid &&
        isInternalObjectId(value.primary_object_id) && isInternalObjectId(value.secondary_object_id)
    ) {
        const expectedEventId = conjunctionEventId({
            first_object_id: value.primary_object_id,
            second_object_id: value.secondary_object_id,
            tca: normalizeUtcInstant(value.tca, 'tca'),
            request_id: value.request_id
        });
        if (value.event_id !== expectedEventId) {
            issue(issues, '$.event_id', 'EVENT_ID_INVALID', `must equal ${expectedEventId}.`);
        }
    }
    requireEnum(value.time_scale, [TIME_SCALE.UTC], issues, '$.time_scale');
    try {
        assertSupportedFrame(value.frame, CAPABILITY.SELECTED_OBJECT_SCREENING);
    } catch (error) {
        issue(issues, '$.frame', 'EVENT_FRAME_UNSUPPORTED', error.message);
    }
    const primaryStateResult = validateStateVector(value.primary_state);
    const secondaryStateResult = validateStateVector(value.secondary_state);
    mergeIssues(issues, primaryStateResult, '$.primary_state');
    mergeIssues(issues, secondaryStateResult, '$.secondary_state');
    if (primaryStateResult.valid && secondaryStateResult.valid) {
        if (value.primary_state.object_id !== value.primary_object_id) {
            issue(issues, '$.primary_state.object_id', 'PRIMARY_STATE_OBJECT_MISMATCH', 'must match primary_object_id.');
        }
        if (value.secondary_state.object_id !== value.secondary_object_id) {
            issue(issues, '$.secondary_state.object_id', 'SECONDARY_STATE_OBJECT_MISMATCH', 'must match secondary_object_id.');
        }
        if (tcaValid && Date.parse(value.primary_state.timestamp) !== Date.parse(value.tca)) {
            issue(issues, '$.primary_state.timestamp', 'PRIMARY_STATE_TIME_MISMATCH', 'must equal TCA.');
        }
        if (tcaValid && Date.parse(value.secondary_state.timestamp) !== Date.parse(value.tca)) {
            issue(issues, '$.secondary_state.timestamp', 'SECONDARY_STATE_TIME_MISMATCH', 'must equal TCA.');
        }
        if (value.primary_state.timestamp !== value.secondary_state.timestamp) {
            issue(issues, '$.secondary_state.timestamp', 'STATE_TIME_MISMATCH', 'both states must use the same instant.');
        }
        if (value.primary_state.frame !== value.frame || value.secondary_state.frame !== value.frame) {
            issue(issues, '$.frame', 'STATE_FRAME_MISMATCH', 'both states must use the event frame.');
        }
        if (value.primary_state.time_scale !== value.time_scale || value.secondary_state.time_scale !== value.time_scale) {
            issue(issues, '$.time_scale', 'STATE_TIME_SCALE_MISMATCH', 'both states must use the event time scale.');
        }
    }
    const missValid = requireFinite(value.miss_distance_km, issues, '$.miss_distance_km', { minimum: 0 });
    const relativePositionValid = validateVector(value.relative_position_km, issues, '$.relative_position_km');
    const relativeVelocityValid = validateVector(value.relative_velocity_km_s, issues, '$.relative_velocity_km_s');
    const relativeSpeedValid = requireFinite(value.relative_speed_km_s, issues, '$.relative_speed_km_s', { minimum: 0 });
    requireFinite(value.screening_radius_km, issues, '$.screening_radius_km', { minimum: 0, exclusiveMinimum: true });
    if (missValid && relativePositionValid && !approximatelyEqual(vectorMagnitude(value.relative_position_km), value.miss_distance_km)) {
        issue(issues, '$.miss_distance_km', 'MISS_DISTANCE_VECTOR_MISMATCH', 'must match the relative-position magnitude.');
    }
    if (relativeVelocityValid && relativeSpeedValid && !approximatelyEqual(vectorMagnitude(value.relative_velocity_km_s), value.relative_speed_km_s)) {
        issue(issues, '$.relative_speed_km_s', 'RELATIVE_SPEED_VECTOR_MISMATCH', 'must match the relative-velocity magnitude.');
    }
    if (primaryStateResult.valid && secondaryStateResult.valid && relativePositionValid) {
        const expectedRelativePosition = vectorDifference(value.secondary_state.position_km, value.primary_state.position_km);
        if (!vectorsApproximatelyEqual(expectedRelativePosition, value.relative_position_km)) {
            issue(issues, '$.relative_position_km', 'RELATIVE_POSITION_STATE_MISMATCH', 'must equal secondary position minus primary position.');
        }
    }
    if (primaryStateResult.valid && secondaryStateResult.valid && relativeVelocityValid) {
        const expectedRelativeVelocity = vectorDifference(value.secondary_state.velocity_km_s, value.primary_state.velocity_km_s);
        if (!vectorsApproximatelyEqual(expectedRelativeVelocity, value.relative_velocity_km_s)) {
            issue(issues, '$.relative_velocity_km_s', 'RELATIVE_VELOCITY_STATE_MISMATCH', 'must equal secondary velocity minus primary velocity.');
        }
    }
    requireFinite(value.collision_probability, issues, '$.collision_probability', { minimum: 0, nullable: true });
    if (typeof value.collision_probability === 'number' && value.collision_probability > 1) {
        issue(issues, '$.collision_probability', 'PROBABILITY_OUT_OF_RANGE', 'must not exceed 1.');
    }
    if (!allow_collision_probability && value.collision_probability !== null) {
        issue(issues, '$.collision_probability', 'PC_UNAVAILABLE_IN_V2', 'must be null for v2.0 TLE-based screening.');
    }
    if (value.collision_probability === null && value.collision_probability_method !== null) {
        issue(issues, '$.collision_probability_method', 'PC_METHOD_WITHOUT_PC', 'must be null when collision probability is unavailable.');
    }
    if (value.collision_probability !== null && !requireString(value.collision_probability_method, issues, '$.collision_probability_method')) {
        // requireString records the issue.
    }
    requireEnum(value.covariance_status, ['UNAVAILABLE', 'INVALID', 'VALIDATED'], issues, '$.covariance_status');
    requireFinite(value.hard_body_radius_km, issues, '$.hard_body_radius_km', { minimum: 0, nullable: true });
    if (value.collision_probability !== null && (value.covariance_status !== 'VALIDATED' || value.hard_body_radius_km === null)) {
        issue(issues, '$.collision_probability', 'PC_INPUTS_INCOMPLETE', 'requires validated covariance and a sourced hard-body radius.');
    }
    validateEventElementSet(value.primary_element_set, issues, '$.primary_element_set');
    validateEventElementSet(value.secondary_element_set, issues, '$.secondary_element_set');
    if (primaryStateResult.valid && value.primary_element_set?.element_set_id !== value.primary_state.element_set_id) {
        issue(issues, '$.primary_element_set.element_set_id', 'PRIMARY_ELEMENT_SET_MISMATCH', 'must match primary_state.element_set_id.');
    }
    if (secondaryStateResult.valid && value.secondary_element_set?.element_set_id !== value.secondary_state.element_set_id) {
        issue(issues, '$.secondary_element_set.element_set_id', 'SECONDARY_ELEMENT_SET_MISMATCH', 'must match secondary_state.element_set_id.');
    }
    requireEnum(value.maturity, [CAPABILITY_MATURITY.EXPERIMENTAL], issues, '$.maturity');
    const datasetProvenanceResult = validateDatasetProvenance(value.dataset_provenance);
    mergeIssues(issues, datasetProvenanceResult, '$.dataset_provenance');
    const provenanceResult = validateComputationProvenance(value.provenance);
    mergeIssues(issues, provenanceResult, '$.provenance');
    if (provenanceResult.valid) {
        if (
            datasetProvenanceResult.valid &&
            (value.dataset_provenance.dataset_id !== value.provenance.dataset_id ||
                value.dataset_provenance.dataset_hash !== value.provenance.dataset_hash)
        ) {
            issue(issues, '$.dataset_provenance', 'EVENT_DATASET_PROVENANCE_MISMATCH', 'must match computation provenance.');
        }
        const provenanceElementSets = new Set(value.provenance.input_element_set_ids);
        if (!provenanceElementSets.has(value.primary_element_set?.element_set_id)) {
            issue(issues, '$.provenance.input_element_set_ids', 'PRIMARY_ELEMENT_SET_PROVENANCE_MISSING', 'must include the primary element set.');
        }
        if (!provenanceElementSets.has(value.secondary_element_set?.element_set_id)) {
            issue(issues, '$.provenance.input_element_set_ids', 'SECONDARY_ELEMENT_SET_PROVENANCE_MISSING', 'must include the secondary element set.');
        }
        for (const [label, state, stateResult] of [
            ['primary', value.primary_state, primaryStateResult],
            ['secondary', value.secondary_state, secondaryStateResult]
        ]) {
            if (
                stateResult.valid &&
                (state.provenance.dataset_id !== value.provenance.dataset_id ||
                    state.provenance.dataset_hash !== value.provenance.dataset_hash)
            ) {
                issue(
                    issues,
                    `$.${label}_state.provenance`,
                    'STATE_EVENT_DATASET_PROVENANCE_MISMATCH',
                    'must match the event dataset identity.'
                );
            }
        }
    }
    validateStringArray(value.quality_flags, issues, '$.quality_flags');
    validateEventAnalysis(value.analysis, issues, '$.analysis');
    return finalize(value, issues);
}

export function normalizeConjunctionEvent(input = {}, options = {}) {
    const primaryObjectId = catalogObjectId({ object_id: input.primary_object_id ?? input.primaryObjectId });
    const secondaryObjectId = catalogObjectId({ object_id: input.secondary_object_id ?? input.secondaryObjectId });
    const tca = normalizeUtcInstant(input.tca, 'tca');
    const primaryState = normalizeStateVector(input.primary_state ?? input.primaryState);
    const secondaryState = normalizeStateVector(input.secondary_state ?? input.secondaryState);
    const relativePosition = normalizeVector(
        input.relative_position_km ?? input.relativePositionKm ??
        vectorDifference(secondaryState.position_km, primaryState.position_km)
    );
    const relativeVelocity = normalizeVector(
        input.relative_velocity_km_s ?? input.relativeVelocityKmS ??
        vectorDifference(secondaryState.velocity_km_s, primaryState.velocity_km_s)
    );
    const requestId = String(input.request_id ?? input.requestId ?? '').trim();
    const normalized = {
        schema_version: input.schema_version ?? DOMAIN_SCHEMA_VERSION,
        event_id: String(input.event_id ?? input.eventId ?? conjunctionEventId({
            first_object_id: primaryObjectId,
            second_object_id: secondaryObjectId,
            tca,
            request_id: requestId
        })).trim(),
        request_id: requestId,
        pair_key: canonicalPairKey(primaryObjectId, secondaryObjectId),
        primary_object_id: primaryObjectId,
        secondary_object_id: secondaryObjectId,
        primary_name: String(input.primary_name ?? input.primaryName ?? '').trim(),
        secondary_name: String(input.secondary_name ?? input.secondaryName ?? '').trim(),
        tca,
        time_scale: String(input.time_scale ?? input.timeScale ?? '').trim().toUpperCase(),
        frame: String(input.frame ?? '').trim().toUpperCase(),
        primary_state: primaryState,
        secondary_state: secondaryState,
        miss_distance_km: Number(input.miss_distance_km ?? input.missDistanceKm ?? vectorMagnitude(relativePosition)),
        relative_position_km: relativePosition,
        relative_velocity_km_s: relativeVelocity,
        relative_speed_km_s: Number(input.relative_speed_km_s ?? input.relativeSpeedKmS ?? vectorMagnitude(relativeVelocity)),
        screening_radius_km: Number(input.screening_radius_km ?? input.screeningRadiusKm),
        collision_probability: input.collision_probability ?? input.collisionProbability ?? null,
        collision_probability_method: input.collision_probability_method ?? input.collisionProbabilityMethod ?? null,
        covariance_status: input.covariance_status ?? input.covarianceStatus ?? 'UNAVAILABLE',
        hard_body_radius_km: input.hard_body_radius_km ?? input.hardBodyRadiusKm ?? null,
        primary_element_set: normalizeEventElementSet(input.primary_element_set ?? input.primaryElementSet),
        secondary_element_set: normalizeEventElementSet(input.secondary_element_set ?? input.secondaryElementSet),
        maturity: input.maturity ?? CAPABILITY_MATURITY.EXPERIMENTAL,
        dataset_provenance: normalizeDatasetProvenance(input.dataset_provenance ?? input.datasetProvenance),
        provenance: normalizeComputationProvenance(input.provenance),
        quality_flags: [...(input.quality_flags ?? input.qualityFlags ?? [])].map(String),
        analysis: normalizeEventAnalysis(input.analysis ?? null)
    };
    assertConjunctionEvent(normalized, options);
    return deepFreeze(normalized);
}

function normalizeEventElementSet(input = {}) {
    return {
        element_set_id: String(input.element_set_id ?? input.elementSetId ?? '').trim(),
        epoch: normalizeUtcInstant(input.epoch, 'element-set epoch'),
        age_days: Number(input.age_days ?? input.ageDays)
    };
}

function validateEventAnalysis(value, issues, path) {
    if (value === null) return;
    if (!requireRecord(value, issues, path)) return;
    rejectUnknownProperties(value, [
        'coarse_interval_start', 'coarse_interval_end', 'coarse_miss_distance_km',
        'broad_phase_margin_km', 'refinement_iterations', 'refinement_converged', 'boundary_event'
    ], issues, path);
    const timestampKeys = ['coarse_interval_start', 'coarse_interval_end'];
    timestampKeys.forEach(key => {
        if (value[key] !== undefined) validateTimestamp(value[key], issues, `${path}.${key}`);
    });
    ['coarse_miss_distance_km', 'broad_phase_margin_km'].forEach(key => {
        if (value[key] !== undefined) requireFinite(value[key], issues, `${path}.${key}`, { minimum: 0 });
    });
    if (value.refinement_iterations !== undefined) {
        const valid = requireFinite(value.refinement_iterations, issues, `${path}.refinement_iterations`, { minimum: 0 });
        if (valid && !Number.isInteger(value.refinement_iterations)) {
            issue(issues, `${path}.refinement_iterations`, 'INTEGER_REQUIRED', 'must be an integer.');
        }
    }
    ['refinement_converged', 'boundary_event'].forEach(key => {
        if (value[key] !== undefined) requireBoolean(value[key], issues, `${path}.${key}`);
    });
    if (
        value.coarse_interval_start !== undefined &&
        value.coarse_interval_end !== undefined &&
        Date.parse(value.coarse_interval_end) < Date.parse(value.coarse_interval_start)
    ) {
        issue(issues, `${path}.coarse_interval_end`, 'COARSE_INTERVAL_INVALID', 'must not precede coarse_interval_start.');
    }
}

function normalizeEventAnalysis(input) {
    if (input === null || input === undefined) return null;
    return {
        ...(input.coarse_interval_start === undefined ? {} : {
            coarse_interval_start: normalizeUtcInstant(input.coarse_interval_start, 'coarse_interval_start')
        }),
        ...(input.coarse_interval_end === undefined ? {} : {
            coarse_interval_end: normalizeUtcInstant(input.coarse_interval_end, 'coarse_interval_end')
        }),
        ...(input.coarse_miss_distance_km === undefined ? {} : {
            coarse_miss_distance_km: Number(input.coarse_miss_distance_km)
        }),
        ...(input.broad_phase_margin_km === undefined ? {} : {
            broad_phase_margin_km: Number(input.broad_phase_margin_km)
        }),
        ...(input.refinement_iterations === undefined ? {} : {
            refinement_iterations: Number(input.refinement_iterations)
        }),
        ...(input.refinement_converged === undefined ? {} : {
            refinement_converged: input.refinement_converged
        }),
        ...(input.boundary_event === undefined ? {} : {
            boundary_event: input.boundary_event
        })
    };
}

export function assertConjunctionEvent(value, options = {}) {
    return assertContractResult(CONTRACT_KIND.CONJUNCTION_EVENT, validateConjunctionEvent(value, options));
}

export function validateScreeningResult(value) {
    const issues = [];
    if (!requireRecord(value, issues, '$')) return finalize(value, issues);
    rejectUnknownProperties(value, [
        'schema_version', 'request_id', 'status', 'started_at', 'completed_at', 'maturity',
        'request', 'configuration', 'events', 'statistics', 'errors', 'dataset_provenance', 'provenance', 'quality_flags'
    ], issues, '$');
    validateSchemaVersion(value.schema_version, issues);
    requireString(value.request_id, issues, '$.request_id');
    requireEnum(value.status, ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'], issues, '$.status');
    const startedValid = validateTimestamp(value.started_at, issues, '$.started_at');
    let completedValid = true;
    if (value.completed_at === null) {
        if (['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(value.status)) {
            issue(issues, '$.completed_at', 'COMPLETION_TIME_REQUIRED', 'is required for a terminal result.');
            completedValid = false;
        }
    } else {
        completedValid = validateTimestamp(value.completed_at, issues, '$.completed_at');
    }
    if (startedValid && completedValid && value.completed_at && Date.parse(value.completed_at) < Date.parse(value.started_at)) {
        issue(issues, '$.completed_at', 'RESULT_TIME_ORDER_INVALID', 'must not precede started_at.');
    }
    requireEnum(value.maturity, [CAPABILITY_MATURITY.EXPERIMENTAL], issues, '$.maturity');
    const requestResult = validateScreeningRequest(value.request);
    mergeIssues(issues, requestResult, '$.request');
    if (requestResult.valid && value.request.request_id !== value.request_id) {
        issue(issues, '$.request.request_id', 'RESULT_REQUEST_ID_MISMATCH', 'must match request_id.');
    }
    validateFullScreeningConfiguration(value.configuration, issues, '$.configuration');
    if (requestResult.valid && isRecord(value.configuration)) {
        const requestConfiguration = value.request.configuration;
        for (const key of [
            'configuration_version', 'screening_radius_km', 'horizon_seconds', 'coarse_step_seconds',
            'refinement_tolerance_seconds', 'refinement_subdivisions', 'max_results',
            'max_refinement_iterations', 'max_relative_acceleration_km_s2', 'coarse_padding_km',
            'yield_every_operations', 'start_time', 'end_time'
        ]) {
            if (requestConfiguration[key] !== value.configuration[key]) {
                issue(issues, `$.configuration.${key}`, 'RESULT_CONFIGURATION_MISMATCH', 'must match the validated request.');
            }
        }
    }
    if (!Array.isArray(value.events)) {
        issue(issues, '$.events', 'TYPE_ARRAY_REQUIRED', 'must be an array.');
    } else {
        const eventIds = new Set();
        value.events.forEach((event, index) => {
            const result = validateConjunctionEvent(event);
            mergeIssues(issues, result, `$.events[${index}]`);
            if (event?.request_id !== value.request_id) {
                issue(issues, `$.events[${index}].request_id`, 'EVENT_REQUEST_ID_MISMATCH', 'must match the result request_id.');
            }
            if (
                result.valid &&
                (event.provenance.dataset_id !== value.provenance?.dataset_id ||
                    event.provenance.dataset_hash !== value.provenance?.dataset_hash)
            ) {
                issue(issues, `$.events[${index}].provenance`, 'EVENT_DATASET_PROVENANCE_MISMATCH', 'must match the result dataset.');
            }
            if (eventIds.has(event?.event_id)) {
                issue(issues, `$.events[${index}].event_id`, 'DUPLICATE_EVENT_ID', 'must be unique within the result.');
            }
            eventIds.add(event?.event_id);
        });
    }
    if (requireRecord(value.statistics, issues, '$.statistics')) {
        rejectUnknownProperties(value.statistics, [
            'catalog_objects', 'candidates_examined', 'events_refined', 'propagation_failures',
            'self_pairs_skipped', 'coarse_intervals_tested', 'coarse_candidates', 'events_detected',
            'events_reported', 'events_truncated', 'truncated_error_count'
        ], issues, '$.statistics');
        [
            'catalog_objects', 'candidates_examined', 'events_refined', 'propagation_failures',
            'self_pairs_skipped', 'coarse_intervals_tested', 'coarse_candidates', 'events_detected',
            'events_reported', 'events_truncated', 'truncated_error_count'
        ].forEach(key => {
            const valid = requireFinite(value.statistics[key], issues, `$.statistics.${key}`, { minimum: 0 });
            if (valid && !Number.isInteger(value.statistics[key])) {
                issue(issues, `$.statistics.${key}`, 'INTEGER_REQUIRED', 'must be an integer.');
            }
        });
        if (Number.isInteger(value.statistics.events_reported) && Array.isArray(value.events) && value.statistics.events_reported !== value.events.length) {
            issue(issues, '$.statistics.events_reported', 'REPORTED_EVENT_COUNT_MISMATCH', 'must equal events.length.');
        }
        if (
            Number.isInteger(value.statistics.events_detected) && Number.isInteger(value.statistics.events_reported) &&
            Number.isInteger(value.statistics.events_truncated) &&
            value.statistics.events_detected !== value.statistics.events_reported + value.statistics.events_truncated
        ) {
            issue(issues, '$.statistics.events_truncated', 'TRUNCATED_EVENT_COUNT_MISMATCH', 'must equal events_detected minus events_reported.');
        }
    }
    if (!Array.isArray(value.errors)) {
        issue(issues, '$.errors', 'TYPE_ARRAY_REQUIRED', 'must be an array.');
    } else {
        value.errors.forEach((error, index) => {
            const path = `$.errors[${index}]`;
            if (!requireRecord(error, issues, path)) return;
            rejectUnknownProperties(error, [
                'code', 'message', 'stage', 'object_id', 'element_set_id', 'timestamp',
                'propagator_error_code', 'recoverable', 'role', 'catalog_index', 'refinement'
            ], issues, path);
            requireString(error.code, issues, `${path}.code`);
            requireString(error.message, issues, `${path}.message`);
            requireString(error.stage, issues, `${path}.stage`);
            requireString(error.object_id, issues, `${path}.object_id`, { nullable: true });
            requireString(error.element_set_id, issues, `${path}.element_set_id`, { nullable: true });
            if (error.timestamp !== null) validateTimestamp(error.timestamp, issues, `${path}.timestamp`);
            if (
                error.propagator_error_code !== null &&
                typeof error.propagator_error_code !== 'number' &&
                typeof error.propagator_error_code !== 'string'
            ) {
                issue(issues, `${path}.propagator_error_code`, 'TYPE_SCALAR_REQUIRED', 'must be a number, string, or null.');
            }
            requireBoolean(error.recoverable, issues, `${path}.recoverable`);
            requireEnum(error.role, ['PRIMARY', 'SECONDARY'], issues, `${path}.role`);
            if (error.catalog_index !== null) {
                const valid = requireFinite(error.catalog_index, issues, `${path}.catalog_index`, { minimum: 0 });
                if (valid && !Number.isInteger(error.catalog_index)) {
                    issue(issues, `${path}.catalog_index`, 'INTEGER_REQUIRED', 'must be an integer.');
                }
            }
            requireBoolean(error.refinement, issues, `${path}.refinement`);
        });
    }
    const datasetProvenanceResult = validateDatasetProvenance(value.dataset_provenance);
    mergeIssues(issues, datasetProvenanceResult, '$.dataset_provenance');
    const provenanceResult = validateComputationProvenance(value.provenance);
    mergeIssues(issues, provenanceResult, '$.provenance');
    if (
        requestResult.valid && provenanceResult.valid &&
        (value.request.dataset_id !== value.provenance.dataset_id ||
            value.request.dataset_hash !== value.provenance.dataset_hash)
    ) {
        issue(issues, '$.provenance', 'RESULT_DATASET_PROVENANCE_MISMATCH', 'must match the validated request dataset.');
    }
    if (
        datasetProvenanceResult.valid && provenanceResult.valid &&
        (value.dataset_provenance.dataset_id !== value.provenance.dataset_id ||
            value.dataset_provenance.dataset_hash !== value.provenance.dataset_hash)
    ) {
        issue(issues, '$.dataset_provenance', 'RESULT_DATASET_PROVENANCE_MISMATCH', 'must match computation provenance.');
    }
    validateStringArray(value.quality_flags, issues, '$.quality_flags');
    return finalize(value, issues);
}

export function normalizeScreeningResult(input = {}, options = {}) {
    const statistics = input.statistics ?? {};
    const normalized = {
        schema_version: input.schema_version ?? DOMAIN_SCHEMA_VERSION,
        request_id: String(input.request_id ?? input.requestId ?? '').trim(),
        status: String(input.status ?? '').trim().toUpperCase(),
        started_at: normalizeUtcInstant(input.started_at ?? input.startedAt, 'started_at'),
        completed_at: input.completed_at == null && input.completedAt == null
            ? null
            : normalizeUtcInstant(input.completed_at ?? input.completedAt, 'completed_at'),
        maturity: input.maturity ?? CAPABILITY_MATURITY.EXPERIMENTAL,
        request: normalizeScreeningRequest(input.request),
        configuration: {
            ...(input.configuration ?? {})
        },
        events: [...(input.events ?? [])].map(event => normalizeConjunctionEvent(event, options)),
        statistics: {
            catalog_objects: Number(statistics.catalog_objects ?? statistics.catalogObjects),
            candidates_examined: Number(statistics.candidates_examined ?? statistics.candidatesExamined),
            events_refined: Number(statistics.events_refined ?? statistics.eventsRefined),
            propagation_failures: Number(statistics.propagation_failures ?? statistics.propagationFailures),
            self_pairs_skipped: Number(statistics.self_pairs_skipped ?? statistics.selfPairsSkipped),
            coarse_intervals_tested: Number(statistics.coarse_intervals_tested ?? statistics.coarseIntervalsTested),
            coarse_candidates: Number(statistics.coarse_candidates ?? statistics.coarseCandidates),
            events_detected: Number(statistics.events_detected ?? statistics.eventsDetected),
            events_reported: Number(statistics.events_reported ?? statistics.eventsReported),
            events_truncated: Number(statistics.events_truncated ?? statistics.eventsTruncated),
            truncated_error_count: Number(statistics.truncated_error_count ?? statistics.truncatedErrorCount)
        },
        errors: [...(input.errors ?? [])].map(error => ({
            code: String(error.code ?? '').trim(),
            message: String(error.message ?? '').trim(),
            stage: String(error.stage ?? '').trim(),
            object_id: error.object_id == null ? null : String(error.object_id),
            element_set_id: error.element_set_id == null ? null : String(error.element_set_id),
            timestamp: error.timestamp == null ? null : normalizeUtcInstant(error.timestamp, 'error timestamp'),
            propagator_error_code: error.propagator_error_code ?? null,
            recoverable: error.recoverable === true,
            role: String(error.role ?? '').trim().toUpperCase(),
            catalog_index: error.catalog_index == null ? null : Number(error.catalog_index),
            refinement: error.refinement === true
        })),
        dataset_provenance: normalizeDatasetProvenance(input.dataset_provenance ?? input.datasetProvenance),
        provenance: normalizeComputationProvenance(input.provenance),
        quality_flags: [...(input.quality_flags ?? input.qualityFlags ?? [])].map(String)
    };
    assertScreeningResult(normalized);
    return deepFreeze(normalized);
}

export function assertScreeningResult(value) {
    return assertContractResult(CONTRACT_KIND.SCREENING_RESULT, validateScreeningResult(value));
}

export function validateContract(contractKind, value, options = {}) {
    switch (contractKind) {
        case CONTRACT_KIND.DATASET_PROVENANCE: return validateDatasetProvenance(value);
        case CONTRACT_KIND.COMPUTATION_PROVENANCE: return validateComputationProvenance(value);
        case CONTRACT_KIND.CATALOG_OBJECT: return validateCatalogObject(value);
        case CONTRACT_KIND.STATE_VECTOR: return validateStateVector(value);
        case CONTRACT_KIND.SCREENING_REQUEST: return validateScreeningRequest(value);
        case CONTRACT_KIND.CONJUNCTION_EVENT: return validateConjunctionEvent(value, options);
        case CONTRACT_KIND.SCREENING_RESULT: return validateScreeningResult(value);
        default: throw new TypeError(`Unknown contract kind: ${contractKind}`);
    }
}

function assertContractResult(contractKind, result) {
    if (!result.valid) throw new ContractValidationError(contractKind, result.issues);
    return result.value;
}
