import {
    assertConjunctionEvent,
    assertScreeningResult,
    normalizeComputationProvenance,
    normalizeDatasetProvenance,
    normalizeScreeningRequest
} from '../domain/contracts.js';
import {
    canonicalPairKey,
    conjunctionEventId,
    stableFingerprint
} from '../domain/objectIdentity.js';
import {
    CAPABILITY,
    CAPABILITY_MATURITY,
    DEFAULT_TLE_FRESHNESS_POLICY,
    DOMAIN_SCHEMA_VERSION,
    ORBIT_CLASS,
    REFERENCE_FRAME,
    TIME_SCALE,
    freshnessStatus,
    normalizeUtcInstant
} from '../domain/orbitalPolicy.js';
import { createTlePropagationService } from '../orbit/propagationService.js';

export const CONJUNCTION_SCREENING_ALGORITHM = 'openbexi-selected-object-catalog-screening';
export const CONJUNCTION_SCREENING_VERSION = '2.0.0';
export const CONJUNCTION_CONFIGURATION_VERSION = '2.0.0';
export const COLOCATED_MISS_DISTANCE_KM = 0.001;
export const COLOCATED_RELATIVE_SPEED_KM_S = 0.000001;

const EARTH_MU_KM3_S2 = 398600.8;
const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;
const MAX_CATALOG_ERROR_DETAILS = 100;
const MAX_CATALOG_OBJECTS = 100_000;
const MAX_SCREENING_HORIZON_SECONDS = 24 * 60 * 60;
const MAX_SCREENING_GRID_POINTS = 100_000;
export const MAX_ESTIMATED_COARSE_PROPAGATIONS = 500_000;
const NUMERIC_DISTANCE_EPSILON_KM = 1e-9;

export const DEFAULT_MAX_RELATIVE_ACCELERATION_KM_S2 =
    2 * EARTH_MU_KM3_S2 / (EARTH_EQUATORIAL_RADIUS_KM ** 2) * 1.25;

export const DEFAULT_SCREENING_CONFIGURATION = Object.freeze({
    screening_radius_km: 10,
    horizon_seconds: 24 * 60 * 60,
    coarse_step_seconds: 60,
    refinement_tolerance_seconds: 0.1,
    refinement_subdivisions: 16,
    max_results: 500,
    max_refinement_iterations: 64,
    max_relative_acceleration_km_s2: DEFAULT_MAX_RELATIVE_ACCELERATION_KM_S2,
    coarse_padding_km: 0,
    yield_every_operations: 256
});

export class ScreeningError extends Error {
    constructor(code, message, details = null) {
        super(message);
        this.name = 'ScreeningError';
        this.code = code;
        this.details = details;
    }
}

export class ScreeningCancelledError extends ScreeningError {
    constructor(message = 'Conjunction screening was cancelled.') {
        super('SCREENING_CANCELLED', message);
        this.name = 'ScreeningCancelledError';
    }
}

function hashValue(value) {
    return `fnv1a64:${stableFingerprint(value)}`;
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.keys(value).sort().map(key => [key, stableValue(value[key])])
    );
}

function stableJson(value) {
    return JSON.stringify(stableValue(value));
}

function vectorSubtract(left, right) {
    return {
        x: left.x - right.x,
        y: left.y - right.y,
        z: left.z - right.z
    };
}

function vectorAddScaled(base, delta, scale) {
    return {
        x: base.x + delta.x * scale,
        y: base.y + delta.y * scale,
        z: base.z + delta.z * scale
    };
}

function vectorDot(left, right) {
    return left.x * right.x + left.y * right.y + left.z * right.z;
}

function vectorMagnitude(value) {
    return Math.hypot(value.x, value.y, value.z);
}

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

function finitePositive(value, fallback, label) {
    const numeric = Number(value ?? fallback);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new ScreeningError('INVALID_SCREENING_CONFIGURATION', `${label} must be greater than zero.`);
    }
    return numeric;
}

function finiteNonNegative(value, fallback, label) {
    const numeric = Number(value ?? fallback);
    if (!Number.isFinite(numeric) || numeric < 0) {
        throw new ScreeningError('INVALID_SCREENING_CONFIGURATION', `${label} must not be negative.`);
    }
    return numeric;
}

function integerPositive(value, fallback, label) {
    const numeric = finitePositive(value, fallback, label);
    if (!Number.isInteger(numeric)) {
        throw new ScreeningError('INVALID_SCREENING_CONFIGURATION', `${label} must be an integer.`);
    }
    return numeric;
}

function integerLimited(value, fallback, label, maximum) {
    const numeric = integerPositive(value, fallback, label);
    if (numeric > maximum) {
        throw new ScreeningError(
            'INVALID_SCREENING_CONFIGURATION',
            `${label} must not exceed ${maximum}.`
        );
    }
    return numeric;
}

function optionValue(options, snakeKey, camelKey) {
    return options?.[snakeKey] ?? options?.[camelKey];
}

export function normalizeScreeningConfiguration(options = {}, startMs) {
    const screeningRadius = finitePositive(
        optionValue(options, 'screening_radius_km', 'screeningRadiusKm'),
        DEFAULT_SCREENING_CONFIGURATION.screening_radius_km,
        'screening radius'
    );
    const coarseStep = finitePositive(
        optionValue(options, 'coarse_step_seconds', 'coarseStepSeconds'),
        DEFAULT_SCREENING_CONFIGURATION.coarse_step_seconds,
        'coarse step'
    );
    const refinementTolerance = finitePositive(
        optionValue(options, 'refinement_tolerance_seconds', 'refinementToleranceSeconds'),
        DEFAULT_SCREENING_CONFIGURATION.refinement_tolerance_seconds,
        'refinement tolerance'
    );
    if (coarseStep < 0.001 || refinementTolerance < 0.001) {
        throw new ScreeningError(
            'INVALID_SCREENING_CONFIGURATION',
            'coarse step and refinement tolerance must be at least one millisecond.'
        );
    }
    if (refinementTolerance > coarseStep) {
        throw new ScreeningError(
            'INVALID_SCREENING_CONFIGURATION',
            'refinement tolerance must not exceed the coarse step.'
        );
    }

    const explicitEnd = optionValue(options, 'end_time', 'endTime');
    let endMs;
    let horizonSeconds;
    if (explicitEnd !== undefined && explicitEnd !== null) {
        endMs = Date.parse(normalizeUtcInstant(explicitEnd, 'screening end time'));
        horizonSeconds = (endMs - startMs) / 1000;
    } else {
        horizonSeconds = finitePositive(
            optionValue(options, 'horizon_seconds', 'horizonSeconds'),
            DEFAULT_SCREENING_CONFIGURATION.horizon_seconds,
            'screening horizon'
        );
        endMs = startMs + horizonSeconds * 1000;
    }
    if (!Number.isFinite(endMs) || endMs <= startMs) {
        throw new ScreeningError('INVALID_SCREENING_WINDOW', 'Screening end time must be later than start time.');
    }
    if (horizonSeconds > MAX_SCREENING_HORIZON_SECONDS) {
        throw new ScreeningError(
            'SCREENING_RESOURCE_LIMIT_EXCEEDED',
            `Screening horizon must not exceed ${MAX_SCREENING_HORIZON_SECONDS} seconds.`
        );
    }
    if (Math.ceil(horizonSeconds / coarseStep) + 1 > MAX_SCREENING_GRID_POINTS) {
        throw new ScreeningError(
            'SCREENING_RESOURCE_LIMIT_EXCEEDED',
            `Screening time grid must not exceed ${MAX_SCREENING_GRID_POINTS} points.`
        );
    }

    return Object.freeze({
        configuration_version: CONJUNCTION_CONFIGURATION_VERSION,
        screening_radius_km: screeningRadius,
        horizon_seconds: horizonSeconds,
        coarse_step_seconds: coarseStep,
        refinement_tolerance_seconds: refinementTolerance,
        refinement_subdivisions: integerLimited(
            optionValue(options, 'refinement_subdivisions', 'refinementSubdivisions'),
            DEFAULT_SCREENING_CONFIGURATION.refinement_subdivisions,
            'refinement subdivisions',
            128
        ),
        max_results: integerLimited(
            optionValue(options, 'max_results', 'maxResults'),
            DEFAULT_SCREENING_CONFIGURATION.max_results,
            'maximum result count',
            10_000
        ),
        max_refinement_iterations: integerLimited(
            optionValue(options, 'max_refinement_iterations', 'maxRefinementIterations'),
            DEFAULT_SCREENING_CONFIGURATION.max_refinement_iterations,
            'maximum refinement iterations',
            512
        ),
        max_relative_acceleration_km_s2: finiteNonNegative(
            optionValue(options, 'max_relative_acceleration_km_s2', 'maxRelativeAccelerationKmS2'),
            DEFAULT_SCREENING_CONFIGURATION.max_relative_acceleration_km_s2,
            'maximum relative acceleration'
        ),
        coarse_padding_km: finiteNonNegative(
            optionValue(options, 'coarse_padding_km', 'coarsePaddingKm'),
            DEFAULT_SCREENING_CONFIGURATION.coarse_padding_km,
            'coarse padding'
        ),
        yield_every_operations: integerPositive(
            optionValue(options, 'yield_every_operations', 'yieldEveryOperations'),
            DEFAULT_SCREENING_CONFIGURATION.yield_every_operations,
            'yield interval'
        ),
        start_time: new Date(startMs).toISOString(),
        end_time: new Date(endMs).toISOString()
    });
}

export function createScreeningTimeGrid(startMs, endMs, stepSeconds) {
    const stepMs = stepSeconds * 1000;
    const times = [startMs];
    for (let time = startMs + stepMs; time < endMs; time += stepMs) times.push(time);
    if (times.at(-1) !== endMs) times.push(endMs);
    return times;
}

export function curvatureSafetyMarginKm(durationSeconds, maxRelativeAccelerationKmS2) {
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
        throw new TypeError('durationSeconds must be finite and non-negative.');
    }
    if (!Number.isFinite(maxRelativeAccelerationKmS2) || maxRelativeAccelerationKmS2 < 0) {
        throw new TypeError('maxRelativeAccelerationKmS2 must be finite and non-negative.');
    }
    return maxRelativeAccelerationKmS2 * durationSeconds * durationSeconds / 8;
}

export function closestPointOnRelativeSegment(startRelativeKm, endRelativeKm) {
    const delta = vectorSubtract(endRelativeKm, startRelativeKm);
    const denominator = vectorDot(delta, delta);
    const fraction = denominator > 0
        ? clamp(-vectorDot(startRelativeKm, delta) / denominator, 0, 1)
        : 0;
    const relative_position_km = vectorAddScaled(startRelativeKm, delta, fraction);
    return Object.freeze({
        fraction,
        relative_position_km,
        distance_km: vectorMagnitude(relative_position_km)
    });
}

function relativeState(primaryState, secondaryState) {
    const relativePosition = vectorSubtract(secondaryState.position_km, primaryState.position_km);
    const relativeVelocity = vectorSubtract(secondaryState.velocity_km_s, primaryState.velocity_km_s);
    return {
        primary_state: primaryState,
        secondary_state: secondaryState,
        relative_position_km: relativePosition,
        relative_velocity_km_s: relativeVelocity,
        distance_squared_km2: vectorDot(relativePosition, relativePosition)
    };
}

function defaultYieldControl() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function normalizeRunInput(request, propagationService) {
    if (!request?.primary) {
        throw new ScreeningError('MISSING_PRIMARY_OBJECT', 'A selected primary catalog object is required.');
    }
    if (!Array.isArray(request.catalog)) {
        throw new ScreeningError('INVALID_CATALOG', 'catalog must be an array.');
    }
    if (request.catalog.length > MAX_CATALOG_OBJECTS) {
        throw new ScreeningError(
            'SCREENING_RESOURCE_LIMIT_EXCEEDED',
            `catalog must not exceed ${MAX_CATALOG_OBJECTS} objects.`
        );
    }

    const startInput = request.options?.start_time ?? request.options?.startTime ??
        request.start_time ?? request.startTime;
    const startTime = normalizeUtcInstant(startInput, 'screening start time');
    const startMs = Date.parse(startTime);
    const configuration = normalizeScreeningConfiguration(request.options ?? {}, startMs);
    const estimatedGridPoints = Math.ceil(
        configuration.horizon_seconds / configuration.coarse_step_seconds
    ) + 1;
    const estimatedCoarsePropagations = request.catalog.length * estimatedGridPoints;
    if (estimatedCoarsePropagations > MAX_ESTIMATED_COARSE_PROPAGATIONS) {
        throw new ScreeningError(
            'SCREENING_RESOURCE_LIMIT_EXCEEDED',
            `Estimated catalog propagation work (${estimatedCoarsePropagations.toLocaleString('en-US')}) exceeds the v2.0 preview limit of ${MAX_ESTIMATED_COARSE_PROPAGATIONS.toLocaleString('en-US')}; shorten the duration or increase the coarse step.`
        );
    }
    const primaryResult = propagationService.prepareObject(request.primary);
    if (!primaryResult.ok) {
        throw new ScreeningError('PRIMARY_PREPARATION_FAILED', primaryResult.error.message, primaryResult.error);
    }

    const catalogMaterial = request.catalog.map(record => {
        const line1 = record?.element_set?.line1 ?? record?.tle_line1 ?? record?.tleLine1 ?? '';
        const line2 = record?.element_set?.line2 ?? record?.tle_line2 ?? record?.tleLine2 ?? '';
        const id = record?.object_id ?? record?.norad_id ?? record?.NORAD_CAT_ID ?? '';
        return [String(id), String(line1), String(line2)].join('|');
    }).sort();
    const datasetId = String(request.dataset_id ?? request.datasetId ??
        request.primary?.provenance?.dataset_id ?? 'dataset:inline-catalog');
    const datasetHash = String(request.dataset_hash ?? request.datasetHash ??
        request.primary?.provenance?.dataset_hash ?? hashValue(catalogMaterial.join('\n')));
    if (
        (primaryResult.value.dataset_id && primaryResult.value.dataset_id !== datasetId) ||
        (primaryResult.value.dataset_hash && primaryResult.value.dataset_hash !== datasetHash)
    ) {
        throw new ScreeningError(
            'DATASET_PROVENANCE_MISMATCH',
            'The supplied dataset identity does not match the primary element-set provenance.'
        );
    }
    const requestId = String(request.request_id ?? request.requestId ?? `screen:${stableFingerprint([
        primaryResult.value.object_id,
        configuration.start_time,
        configuration.end_time,
        datasetHash,
        stableJson(configuration)
    ].join('\n'))}`);
    const requestedAt = normalizeUtcInstant(
        request.requested_at ?? request.requestedAt ?? configuration.start_time,
        'requested_at'
    );
    const suppliedDatasetProvenance = request.dataset_provenance ?? request.datasetProvenance ??
        request.primary?.provenance ?? {};
    const suppliedSourceStatus = String(suppliedDatasetProvenance.source_status ?? '').toUpperCase();
    const sourceStatus = ['COMPLETE', 'PARTIAL', 'DEGRADED'].includes(suppliedSourceStatus)
        ? suppliedSourceStatus
        : 'DEGRADED';
    const hasSuppliedRetrievalTime = Object.prototype.hasOwnProperty.call(
        suppliedDatasetProvenance,
        'retrieved_at'
    );
    let datasetProvenance;
    try {
        datasetProvenance = normalizeDatasetProvenance({
            schema_version: suppliedDatasetProvenance.schema_version ?? DOMAIN_SCHEMA_VERSION,
            source_id: suppliedDatasetProvenance.source_id ?? primaryResult.value.source_id ?? 'inline-catalog',
            provider: suppliedDatasetProvenance.provider ?? 'Unspecified inline catalog',
            retrieved_at: hasSuppliedRetrievalTime ? suppliedDatasetProvenance.retrieved_at : requestedAt,
            dataset_id: datasetId,
            dataset_hash: datasetHash,
            source_uri: suppliedDatasetProvenance.source_uri ?? null,
            source_status: sourceStatus,
            partial_update: sourceStatus === 'PARTIAL'
                ? true
                : suppliedDatasetProvenance.partial_update === true,
            license_id: suppliedDatasetProvenance.license_id ?? null
        });
    } catch (error) {
        throw new ScreeningError('INVALID_DATASET_PROVENANCE', error.message, {
            issues: error.issues ?? []
        });
    }
    let screeningRequest;
    try {
        screeningRequest = normalizeScreeningRequest({
            schema_version: request.schema_version ?? DOMAIN_SCHEMA_VERSION,
            request_id: requestId,
            capability: request.capability ?? CAPABILITY.SELECTED_OBJECT_SCREENING,
            maturity: request.maturity ?? CAPABILITY_MATURITY.EXPERIMENTAL,
            requested_at: requestedAt,
            primary_object_id: request.primary_object_id ?? request.primaryObjectId ?? primaryResult.value.object_id,
            candidate_object_ids: request.candidate_object_ids ?? request.candidateObjectIds ?? null,
            dataset_id: datasetId,
            dataset_hash: datasetHash,
            dataset_provenance: datasetProvenance,
            start_time: request.start_time ?? request.startTime ?? configuration.start_time,
            end_time: request.end_time ?? request.endTime ?? configuration.end_time,
            time_scale: request.time_scale ?? request.timeScale ?? TIME_SCALE.UTC,
            frame: request.frame ?? REFERENCE_FRAME.TEME,
            configuration: request.configuration ?? configuration
        });
    } catch (error) {
        throw new ScreeningError('INVALID_SCREENING_REQUEST', error.message, {
            contract: error.contractKind ?? 'ScreeningRequest',
            issues: error.issues ?? []
        });
    }
    if (screeningRequest.primary_object_id !== primaryResult.value.object_id) {
        throw new ScreeningError('PRIMARY_IDENTITY_MISMATCH', 'primary_object_id must identify the supplied primary object.');
    }
    if (
        screeningRequest.start_time !== configuration.start_time ||
        screeningRequest.end_time !== configuration.end_time ||
        stableJson(screeningRequest.configuration) !== stableJson(configuration)
    ) {
        throw new ScreeningError(
            'SCREENING_REQUEST_CONFIGURATION_MISMATCH',
            'The typed request window and configuration must match the execution options.'
        );
    }

    return {
        primary: primaryResult.value,
        catalog: request.catalog,
        configuration,
        dataset_id: datasetId,
        dataset_hash: datasetHash,
        request_id: requestId,
        requested_at: requestedAt,
        request: screeningRequest,
        dataset_provenance: datasetProvenance
    };
}

function computationProvenance(run, inputElementSetIds) {
    const algorithmName = run.algorithm_name ?? CONJUNCTION_SCREENING_ALGORITHM;
    const algorithmVersion = run.algorithm_version ?? CONJUNCTION_SCREENING_VERSION;
    const algorithmConfiguration = {
        ...run.configuration,
        algorithm: algorithmName,
        algorithm_version: algorithmVersion
    };
    return normalizeComputationProvenance({
        dataset_id: run.dataset_id,
        dataset_hash: run.dataset_hash,
        generated_at: run.requested_at,
        algorithm: {
            name: algorithmName,
            version: algorithmVersion,
            configuration_hash: hashValue(stableJson(algorithmConfiguration))
        },
        input_element_set_ids: [...new Set(inputElementSetIds)].sort()
    });
}

function elementAgeDays(prepared, tcaMs) {
    if (!prepared.element_epoch_utc) return 0;
    return (tcaMs - Date.parse(prepared.element_epoch_utc)) / 86_400_000;
}

function preparedFreshness(prepared, timeMs) {
    if (!prepared.element_epoch_utc) {
        return { status: 'UNUSABLE', age_days: null, max_age_days: null };
    }
    return freshnessStatus(
        prepared.element_epoch_utc,
        Object.values(ORBIT_CLASS).includes(prepared.orbit_class) ? prepared.orbit_class : ORBIT_CLASS.UNKNOWN,
        new Date(timeMs),
        DEFAULT_TLE_FRESHNESS_POLICY
    );
}

function participantFreshnessFlags(prepared, timeMs, participant) {
    const status = preparedFreshness(prepared, timeMs).status;
    if (status === 'STALE') return [`${participant}_TLE_STALE_AT_TCA`];
    if (status === 'FUTURE') return [`${participant}_TLE_EPOCH_AFTER_TCA`];
    if (status === 'UNUSABLE') return [`${participant}_TLE_EPOCH_UNAVAILABLE`];
    return [];
}

function collectWindowFreshnessFlags(target, prepared, startMs, endMs) {
    for (const status of [
        preparedFreshness(prepared, startMs).status,
        preparedFreshness(prepared, endMs).status
    ]) {
        if (status === 'STALE') target.add('STALE_INPUTS_AT_SCREEN_TIME');
        if (status === 'FUTURE') target.add('FUTURE_EPOCH_INPUTS_AT_SCREEN_TIME');
        if (status === 'UNUSABLE') target.add('MISSING_ELEMENT_EPOCH_INPUTS');
    }
}

export function preferredElementSet(candidate, current) {
    const candidateEpoch = Date.parse(candidate.element_epoch_utc ?? '');
    const currentEpoch = Date.parse(current.element_epoch_utc ?? '');
    const candidateTime = Number.isFinite(candidateEpoch) ? candidateEpoch : Number.NEGATIVE_INFINITY;
    const currentTime = Number.isFinite(currentEpoch) ? currentEpoch : Number.NEGATIVE_INFINITY;
    if (candidateTime !== currentTime) return candidateTime > currentTime;

    const candidateKey = [
        candidate.element_set_id,
        candidate.line1,
        candidate.line2,
        candidate.object_name,
        ...(candidate.input_quality_flags ?? [])
    ].join('\n');
    const currentKey = [
        current.element_set_id,
        current.line1,
        current.line2,
        current.object_name,
        ...(current.input_quality_flags ?? [])
    ].join('\n');
    return candidateKey.localeCompare(currentKey) < 0;
}

function buildEvent(run, secondary, refined, coarse) {
    const tca = new Date(refined.time_ms).toISOString();
    const pairKey = canonicalPairKey(run.primary.object_id, secondary.object_id);
    const missDistanceKm = Math.sqrt(refined.relative.distance_squared_km2);
    const relativeSpeedKmS = vectorMagnitude(refined.relative.relative_velocity_km_s);
    const commonTle = !!run.primary.line1 && !!run.primary.line2 &&
        run.primary.line1 === secondary.line1 && run.primary.line2 === secondary.line2;
    const colocatedGeometry = missDistanceKm <= COLOCATED_MISS_DISTANCE_KM &&
        relativeSpeedKmS <= COLOCATED_RELATIVE_SPEED_KM_S;
    const qualityFlags = Object.freeze([...new Set([
        'ACCELERATION_BOUND_COARSE_SCREEN',
        'COLLISION_PROBABILITY_UNAVAILABLE',
        'SAME_TIME_TEME_STATES',
        'SUBDIVIDED_LOCAL_MINIMUM_SEARCH',
        'TLE_SGP4_SCREENING_ONLY',
        ...(!refined.converged ? ['REFINEMENT_NOT_CONVERGED'] : []),
        ...(commonTle || colocatedGeometry ? ['COLOCATED_OR_COMMON_TLE_GEOMETRY'] : []),
        ...(run.dataset_provenance.source_status === 'PARTIAL' || run.dataset_provenance.partial_update
            ? ['PARTIAL_SOURCE_DATASET'] : []),
        ...(run.dataset_provenance.source_status === 'DEGRADED' ? ['DEGRADED_SOURCE_DATASET'] : []),
        ...participantFreshnessFlags(run.primary, refined.time_ms, 'PRIMARY'),
        ...participantFreshnessFlags(secondary, refined.time_ms, 'SECONDARY'),
        ...(run.primary.input_quality_flags ?? []).map(flag => `PRIMARY_${flag}`),
        ...(secondary.input_quality_flags ?? []).map(flag => `SECONDARY_${flag}`),
        ...(run.event_quality_flags ?? [])
    ])].sort());
    const provenance = computationProvenance(run, [
        run.primary.element_set_id,
        secondary.element_set_id
    ]);

    const event = {
        schema_version: DOMAIN_SCHEMA_VERSION,
        event_id: conjunctionEventId({
            first_object_id: run.primary.object_id,
            second_object_id: secondary.object_id,
            tca,
            request_id: run.request_id
        }),
        request_id: run.request_id,
        pair_key: pairKey,
        primary_object_id: run.primary.object_id,
        secondary_object_id: secondary.object_id,
        primary_name: run.primary.object_name,
        secondary_name: secondary.object_name,
        tca,
        time_scale: TIME_SCALE.UTC,
        frame: REFERENCE_FRAME.TEME,
        primary_state: refined.relative.primary_state,
        secondary_state: refined.relative.secondary_state,
        miss_distance_km: missDistanceKm,
        relative_position_km: refined.relative.relative_position_km,
        relative_velocity_km_s: refined.relative.relative_velocity_km_s,
        relative_speed_km_s: relativeSpeedKmS,
        screening_radius_km: run.configuration.screening_radius_km,
        collision_probability: null,
        collision_probability_method: null,
        covariance_status: 'UNAVAILABLE',
        hard_body_radius_km: null,
        primary_element_set: {
            element_set_id: run.primary.element_set_id,
            epoch: run.primary.element_epoch_utc ?? run.configuration.start_time,
            age_days: elementAgeDays(run.primary, refined.time_ms)
        },
        secondary_element_set: {
            element_set_id: secondary.element_set_id,
            epoch: secondary.element_epoch_utc ?? run.configuration.start_time,
            age_days: elementAgeDays(secondary, refined.time_ms)
        },
        maturity: CAPABILITY_MATURITY.EXPERIMENTAL,
        dataset_provenance: run.dataset_provenance,
        provenance,
        quality_flags: qualityFlags,
        analysis: Object.freeze({
            coarse_interval_start: new Date(coarse.interval_start_ms).toISOString(),
            coarse_interval_end: new Date(coarse.interval_end_ms).toISOString(),
            coarse_miss_distance_km: coarse.chord.distance_km,
            broad_phase_margin_km: coarse.curvature_margin_km + run.configuration.coarse_padding_km,
            refinement_iterations: refined.iterations,
            refinement_converged: refined.converged,
            boundary_event: Math.abs(refined.time_ms - Date.parse(run.configuration.start_time)) <= 1 ||
                Math.abs(refined.time_ms - Date.parse(run.configuration.end_time)) <= 1
        })
    };
    assertConjunctionEvent(event);
    return Object.freeze(event);
}

async function refineTca({
    intervalStartMs,
    intervalEndMs,
    evaluateAt,
    toleranceSeconds,
    maxIterations,
    initialFraction = 0.5,
    checkCancellation
}) {
    const cache = new Map();
    let evaluations = 0;
    const evaluate = async rawTime => {
        checkCancellation();
        const timeMs = Math.round(clamp(rawTime, intervalStartMs, intervalEndMs));
        if (cache.has(timeMs)) return cache.get(timeMs);
        const relative = await evaluateAt(timeMs);
        const result = relative ? { time_ms: timeMs, relative } : null;
        cache.set(timeMs, result);
        evaluations += 1;
        return result;
    };
    const chooseBetter = (left, right) => {
        if (!left) return right;
        if (!right) return left;
        if (right.relative.distance_squared_km2 < left.relative.distance_squared_km2) return right;
        if (right.relative.distance_squared_km2 === left.relative.distance_squared_km2 && right.time_ms < left.time_ms) {
            return right;
        }
        return left;
    };

    let best = null;
    best = chooseBetter(best, await evaluate(intervalStartMs));
    best = chooseBetter(best, await evaluate(intervalEndMs));
    best = chooseBetter(best, await evaluate(
        intervalStartMs + (intervalEndMs - intervalStartMs) * clamp(initialFraction, 0, 1)
    ));

    const goldenRatio = (Math.sqrt(5) - 1) / 2;
    let left = intervalStartMs;
    let right = intervalEndMs;
    let x1 = right - goldenRatio * (right - left);
    let x2 = left + goldenRatio * (right - left);
    let f1 = await evaluate(x1);
    let f2 = await evaluate(x2);
    best = chooseBetter(best, f1);
    best = chooseBetter(best, f2);
    let iterations = 0;
    const toleranceMs = toleranceSeconds * 1000;

    while (right - left > toleranceMs && iterations < maxIterations) {
        checkCancellation();
        const d1 = f1?.relative.distance_squared_km2 ?? Number.POSITIVE_INFINITY;
        const d2 = f2?.relative.distance_squared_km2 ?? Number.POSITIVE_INFINITY;
        if (d1 <= d2) {
            right = x2;
            x2 = x1;
            f2 = f1;
            x1 = right - goldenRatio * (right - left);
            f1 = await evaluate(x1);
            best = chooseBetter(best, f1);
        } else {
            left = x1;
            x1 = x2;
            f1 = f2;
            x2 = left + goldenRatio * (right - left);
            f2 = await evaluate(x2);
            best = chooseBetter(best, f2);
        }
        iterations += 1;
    }

    best = chooseBetter(best, await evaluate((left + right) / 2));
    return best ? {
        ...best,
        iterations,
        evaluations,
        converged: right - left <= toleranceMs
    } : null;
}

function nearlyEqualDistanceSquared(left, right) {
    const scale = Math.max(1, Math.abs(left), Math.abs(right));
    return Math.abs(left - right) <= scale * 1e-12;
}

function localMinimumBrackets(samples, {
    eligibleStartMs = samples[0]?.time_ms,
    eligibleEndMs = samples.at(-1)?.time_ms,
    includeEligibleEnd = true,
    screenStartMs = eligibleStartMs,
    screenEndMs = eligibleEndMs
} = {}) {
    if (samples.length < 2) return [];
    const distances = samples.map(sample => sample.relative.distance_squared_km2);
    const minima = [];
    const lastIndex = samples.length - 1;

    for (let runStart = 0; runStart <= lastIndex;) {
        let runEnd = runStart;
        while (
            runEnd < lastIndex &&
            nearlyEqualDistanceSquared(distances[runEnd], distances[runEnd + 1])
        ) {
            runEnd += 1;
        }

        const representativeDistance = distances[runStart];
        const leftDistance = runStart > 0 ? distances[runStart - 1] : null;
        const rightDistance = runEnd < lastIndex ? distances[runEnd + 1] : null;
        const touchesScreenStart = samples[runStart].time_ms === screenStartMs;
        const touchesScreenEnd = samples[runEnd].time_ms === screenEndMs;
        const lowerThanLeft = leftDistance !== null && representativeDistance < leftDistance &&
            !nearlyEqualDistanceSquared(representativeDistance, leftDistance);
        const lowerThanRight = rightDistance !== null && representativeDistance < rightDistance &&
            !nearlyEqualDistanceSquared(representativeDistance, rightDistance);
        const noHigherThanLeft = leftDistance === null ? touchesScreenStart :
            representativeDistance <= leftDistance || nearlyEqualDistanceSquared(representativeDistance, leftDistance);
        const noHigherThanRight = rightDistance === null ? touchesScreenEnd :
            representativeDistance <= rightDistance || nearlyEqualDistanceSquared(representativeDistance, rightDistance);
        const isBoundaryMinimum = (touchesScreenStart && (rightDistance === null || noHigherThanRight)) ||
            (touchesScreenEnd && lowerThanLeft);
        const isInteriorMinimum = noHigherThanLeft && noHigherThanRight &&
            (lowerThanLeft || lowerThanRight);

        if (isBoundaryMinimum || isInteriorMinimum) {
            const index = touchesScreenStart ? runStart : runStart;
            const timeMs = samples[index].time_ms;
            const insideEligibleInterval = timeMs >= eligibleStartMs &&
                (timeMs < eligibleEndMs || (includeEligibleEnd && timeMs === eligibleEndMs));
            if (insideEligibleInterval) minima.push({ runStart, runEnd, index });
        }
        runStart = runEnd + 1;
    }

    return minima.map(({ runStart, runEnd, index }) => ({
        interval_start_ms: samples[Math.max(0, runStart - 1)].time_ms,
        interval_end_ms: samples[Math.min(lastIndex, runEnd + 1)].time_ms,
        initial_fraction: samples[index].time_ms === samples[Math.max(0, runStart - 1)].time_ms
            ? 0
            : samples[index].time_ms === samples[Math.min(lastIndex, runEnd + 1)].time_ms
                ? 1
                : (samples[index].time_ms - samples[Math.max(0, runStart - 1)].time_ms) /
                    Math.max(1, samples[Math.min(lastIndex, runEnd + 1)].time_ms -
                        samples[Math.max(0, runStart - 1)].time_ms)
    }));
}

export async function screenConjunctionPairInterval({
    run,
    secondary,
    intervalStartMs,
    intervalEndMs,
    includeIntervalEnd = false,
    screenStartMs,
    screenEndMs,
    primaryStart,
    primaryEnd,
    secondaryStart,
    secondaryEnd,
    evaluateAt,
    checkCancellation = () => {}
}) {
    if (!primaryStart?.ok || !primaryEnd?.ok || !secondaryStart?.ok || !secondaryEnd?.ok) {
        return Object.freeze({
            coarse_intervals_tested: 0,
            coarse_candidates: 0,
            events_refined: 0,
            incomplete_refinements: 0,
            candidate: null,
            events: Object.freeze([])
        });
    }

    const relativeStart = vectorSubtract(
        secondaryStart.value.position_km,
        primaryStart.value.position_km
    );
    const relativeEnd = vectorSubtract(
        secondaryEnd.value.position_km,
        primaryEnd.value.position_km
    );
    const chord = closestPointOnRelativeSegment(relativeStart, relativeEnd);
    const intervalSeconds = (intervalEndMs - intervalStartMs) / 1000;
    const curvatureMargin = curvatureSafetyMarginKm(
        intervalSeconds,
        run.configuration.max_relative_acceleration_km_s2
    );
    const candidateThreshold = run.configuration.screening_radius_km +
        curvatureMargin + run.configuration.coarse_padding_km;
    if (chord.distance_km > candidateThreshold + NUMERIC_DISTANCE_EPSILON_KM) {
        return Object.freeze({
            coarse_intervals_tested: 1,
            coarse_candidates: 0,
            events_refined: 0,
            incomplete_refinements: 0,
            candidate: null,
            events: Object.freeze([])
        });
    }

    const candidate = Object.freeze({
        interval_start_ms: intervalStartMs,
        interval_end_ms: intervalEndMs,
        chord,
        curvature_margin_km: curvatureMargin,
        candidate_threshold_km: candidateThreshold
    });
    const sampleTimes = new Set();
    for (let sampleIndex = 0; sampleIndex <= run.configuration.refinement_subdivisions; sampleIndex += 1) {
        sampleTimes.add(Math.round(
            intervalStartMs + (intervalEndMs - intervalStartMs) *
                sampleIndex / run.configuration.refinement_subdivisions
        ));
    }
    const neighborStepMs = Math.max(1, Math.round(
        (intervalEndMs - intervalStartMs) / run.configuration.refinement_subdivisions
    ));
    sampleTimes.add(Math.max(screenStartMs, intervalStartMs - neighborStepMs));
    sampleTimes.add(Math.min(screenEndMs, intervalEndMs + neighborStepMs));
    const refinementSamples = [];
    let samplesComplete = true;
    for (const timeMs of [...sampleTimes].sort((left, right) => left - right)) {
        const relative = await evaluateAt(timeMs);
        if (!relative) {
            samplesComplete = false;
            break;
        }
        refinementSamples.push({ time_ms: timeMs, relative });
    }
    if (!samplesComplete || refinementSamples.length < 2) {
        return Object.freeze({
            coarse_intervals_tested: 1,
            coarse_candidates: 1,
            events_refined: 0,
            incomplete_refinements: 1,
            candidate,
            events: Object.freeze([])
        });
    }

    const events = [];
    let eventsRefined = 0;
    let incompleteRefinements = 0;
    const brackets = localMinimumBrackets(refinementSamples, {
        eligibleStartMs: intervalStartMs,
        eligibleEndMs: intervalEndMs,
        includeEligibleEnd: includeIntervalEnd,
        screenStartMs,
        screenEndMs
    });
    for (const bracket of brackets) {
        const refined = await refineTca({
            intervalStartMs: bracket.interval_start_ms,
            intervalEndMs: bracket.interval_end_ms,
            evaluateAt,
            toleranceSeconds: run.configuration.refinement_tolerance_seconds,
            maxIterations: run.configuration.max_refinement_iterations,
            initialFraction: bracket.initial_fraction,
            checkCancellation
        });
        eventsRefined += 1;
        if (!refined) {
            incompleteRefinements += 1;
            continue;
        }
        const missDistanceKm = Math.sqrt(refined.relative.distance_squared_km2);
        if (missDistanceKm > run.configuration.screening_radius_km + NUMERIC_DISTANCE_EPSILON_KM) continue;
        events.push(buildEvent(run, secondary, refined, candidate));
    }

    return Object.freeze({
        coarse_intervals_tested: 1,
        coarse_candidates: 1,
        events_refined: eventsRefined,
        incomplete_refinements: incompleteRefinements,
        candidate,
        events: Object.freeze(events)
    });
}

export function deduplicatePairEvents(events, refinementToleranceSeconds) {
    const sorted = [...events].sort((left, right) =>
        Date.parse(left.tca) - Date.parse(right.tca) ||
        left.miss_distance_km - right.miss_distance_km ||
        left.event_id.localeCompare(right.event_id)
    );
    const deduplicated = [];
    const toleranceMs = Math.max(1, refinementToleranceSeconds * 1000);

    for (const event of sorted) {
        const previous = deduplicated.at(-1);
        const bracketsOverlap = previous &&
            Date.parse(previous.analysis?.coarse_interval_end) >=
                Date.parse(event.analysis?.coarse_interval_start) &&
            Date.parse(event.analysis?.coarse_interval_end) >=
                Date.parse(previous.analysis?.coarse_interval_start);
        const sameRefinedMinimum = previous && bracketsOverlap &&
            Date.parse(event.tca) - Date.parse(previous.tca) <= toleranceMs;
        if (sameRefinedMinimum) {
            if (event.miss_distance_km < previous.miss_distance_km) {
                deduplicated[deduplicated.length - 1] = event;
            }
        } else {
            deduplicated.push(event);
        }
    }
    return deduplicated;
}

export async function screenSelectedObjectAgainstCatalog(request, runtime = {}) {
    const propagationService = runtime.propagationService ?? createTlePropagationService({
        satelliteLib: runtime.satelliteLib
    });
    const run = normalizeRunInput(request, propagationService);
    const startedAt = normalizeUtcInstant(runtime.now?.() ?? new Date(), 'screening start timestamp');
    const isCancelled = runtime.isCancelled ?? (() => false);
    const yieldControl = runtime.yieldControl ?? defaultYieldControl;
    const onProgress = typeof runtime.onProgress === 'function' ? runtime.onProgress : () => {};
    let operationCount = 0;

    const checkCancellation = () => {
        if (isCancelled()) throw new ScreeningCancelledError();
    };
    const maybeYield = async () => {
        operationCount += 1;
        if (operationCount % run.configuration.yield_every_operations === 0) {
            await yieldControl();
            checkCancellation();
        }
    };
    const propagate = async (prepared, timeMs) => {
        checkCancellation();
        const result = propagationService.propagate(prepared, new Date(timeMs));
        await maybeYield();
        return result;
    };

    const startMs = Date.parse(run.configuration.start_time);
    const endMs = Date.parse(run.configuration.end_time);
    const gridTimes = createScreeningTimeGrid(startMs, endMs, run.configuration.coarse_step_seconds);
    const primaryGrid = new Map();
    const objectErrors = [];
    let truncatedErrorCount = 0;
    let propagationFailures = 0;
    const recordError = (error, context) => {
        propagationFailures += 1;
        if (objectErrors.length < MAX_CATALOG_ERROR_DETAILS) {
            objectErrors.push(Object.freeze({
                code: String(error?.code ?? 'PROPAGATION_FAILED'),
                message: String(error?.message ?? 'Propagation failed.'),
                stage: String(error?.stage ?? 'PROPAGATION'),
                object_id: error?.object_id == null ? null : String(error.object_id),
                element_set_id: error?.element_set_id == null ? null : String(error.element_set_id),
                timestamp: error?.timestamp == null ? null : String(error.timestamp),
                propagator_error_code: error?.propagator_error_code ?? null,
                recoverable: error?.recoverable !== false,
                role: context.role,
                catalog_index: context.catalog_index ?? null,
                refinement: context.refinement === true
            }));
        } else {
            truncatedErrorCount += 1;
        }
    };

    onProgress(Object.freeze({ stage: 'PROPAGATING_PRIMARY', completed: 0, total: gridTimes.length, fraction: 0 }));
    for (let index = 0; index < gridTimes.length; index += 1) {
        const timeMs = gridTimes[index];
        const result = await propagate(run.primary, timeMs);
        primaryGrid.set(timeMs, result);
        if (!result.ok) recordError(result.error, { role: 'PRIMARY' });
        onProgress(Object.freeze({
            stage: 'PROPAGATING_PRIMARY',
            completed: index + 1,
            total: gridTimes.length,
            fraction: (index + 1) / gridTimes.length
        }));
    }

    let candidatesExamined = 0;
    let selfPairsSkipped = 0;
    let coarseIntervalsTested = 0;
    let coarseCandidates = 0;
    let eventsRefined = 0;
    let incompleteRefinements = 0;
    let duplicateCatalogObjectsSkipped = 0;
    const events = [];
    const screenedElementSetIds = new Set([run.primary.element_set_id]);
    const screenedInputQualityFlags = new Set(run.primary.input_quality_flags ?? []);
    const screeningTimeQualityFlags = new Set();
    collectWindowFreshnessFlags(screeningTimeQualityFlags, run.primary, startMs, endMs);

    const preparedByObjectId = new Map();
    onProgress(Object.freeze({
        stage: 'PREPARING_CATALOG',
        completed: 0,
        total: run.catalog.length,
        fraction: 0
    }));
    for (let catalogIndex = 0; catalogIndex < run.catalog.length; catalogIndex += 1) {
        checkCancellation();
        const rawSecondary = run.catalog[catalogIndex];
        const secondaryResult = propagationService.prepareObject(rawSecondary);
        if (!secondaryResult.ok) {
            recordError(secondaryResult.error, { role: 'SECONDARY', catalog_index: catalogIndex });
        } else if (secondaryResult.value.object_id === run.primary.object_id) {
            selfPairsSkipped += 1;
        } else if (
            (secondaryResult.value.dataset_id && secondaryResult.value.dataset_id !== run.dataset_id) ||
            (secondaryResult.value.dataset_hash && secondaryResult.value.dataset_hash !== run.dataset_hash)
        ) {
            recordError({
                code: 'DATASET_PROVENANCE_MISMATCH',
                message: 'Catalog object provenance does not match the screening dataset.',
                stage: 'PREPARE',
                object_id: secondaryResult.value.object_id,
                element_set_id: secondaryResult.value.element_set_id,
                recoverable: true
            }, { role: 'SECONDARY', catalog_index: catalogIndex });
        } else {
            const secondary = secondaryResult.value;
            const existing = preparedByObjectId.get(secondary.object_id);
            if (!existing) {
                preparedByObjectId.set(secondary.object_id, { secondary, catalog_index: catalogIndex });
            } else {
                duplicateCatalogObjectsSkipped += 1;
                if (preferredElementSet(secondary, existing.secondary)) {
                    preparedByObjectId.set(secondary.object_id, { secondary, catalog_index: catalogIndex });
                }
            }
        }
        onProgress(Object.freeze({
            stage: 'PREPARING_CATALOG',
            completed: catalogIndex + 1,
            total: run.catalog.length,
            fraction: (catalogIndex + 1) / Math.max(1, run.catalog.length)
        }));
        await maybeYield();
    }

    const preparedCatalog = [...preparedByObjectId.values()].sort((left, right) =>
        left.secondary.object_id.localeCompare(right.secondary.object_id) ||
        left.secondary.element_set_id.localeCompare(right.secondary.element_set_id)
    );
    for (let preparedIndex = 0; preparedIndex < preparedCatalog.length; preparedIndex += 1) {
        checkCancellation();
        const { secondary, catalog_index: catalogIndex } = preparedCatalog[preparedIndex];
        screenedElementSetIds.add(secondary.element_set_id);
        for (const flag of secondary.input_quality_flags ?? []) screenedInputQualityFlags.add(flag);
        collectWindowFreshnessFlags(screeningTimeQualityFlags, secondary, startMs, endMs);
        candidatesExamined += 1;

        const secondaryGrid = new Map();
        for (const timeMs of gridTimes) {
            const result = await propagate(secondary, timeMs);
            secondaryGrid.set(timeMs, result);
            if (!result.ok) recordError(result.error, {
                role: 'SECONDARY',
                catalog_index: catalogIndex
            });
        }

        const relativeEvaluationCache = new Map();
        const evaluateAt = async timeMs => {
            if (relativeEvaluationCache.has(timeMs)) return relativeEvaluationCache.get(timeMs);
            const primaryResult = primaryGrid.get(timeMs) ?? await propagate(run.primary, timeMs);
            const candidateResult = secondaryGrid.get(timeMs) ?? await propagate(secondary, timeMs);
            if (!primaryResult.ok || !candidateResult.ok) {
                if (!primaryResult.ok) recordError(primaryResult.error, { role: 'PRIMARY', refinement: true });
                if (!candidateResult.ok) recordError(candidateResult.error, {
                    role: 'SECONDARY', catalog_index: catalogIndex, refinement: true
                });
                relativeEvaluationCache.set(timeMs, null);
                return null;
            }
            const relative = relativeState(primaryResult.value, candidateResult.value);
            relativeEvaluationCache.set(timeMs, relative);
            return relative;
        };

        const pairEvents = [];
        for (let intervalIndex = 0; intervalIndex < gridTimes.length - 1; intervalIndex += 1) {
            const intervalStartMs = gridTimes[intervalIndex];
            const intervalEndMs = gridTimes[intervalIndex + 1];
            const primaryStart = primaryGrid.get(intervalStartMs);
            const primaryEnd = primaryGrid.get(intervalEndMs);
            const secondaryStart = secondaryGrid.get(intervalStartMs);
            const secondaryEnd = secondaryGrid.get(intervalEndMs);
            const intervalResult = await screenConjunctionPairInterval({
                run,
                secondary,
                intervalStartMs,
                intervalEndMs,
                includeIntervalEnd: intervalIndex === gridTimes.length - 2,
                screenStartMs: startMs,
                screenEndMs: endMs,
                primaryStart,
                primaryEnd,
                secondaryStart,
                secondaryEnd,
                evaluateAt,
                checkCancellation
            });
            coarseIntervalsTested += intervalResult.coarse_intervals_tested;
            coarseCandidates += intervalResult.coarse_candidates;
            eventsRefined += intervalResult.events_refined;
            incompleteRefinements += intervalResult.incomplete_refinements;
            pairEvents.push(...intervalResult.events);
        }

        events.push(...deduplicatePairEvents(
            pairEvents,
            run.configuration.refinement_tolerance_seconds
        ));
        onProgress(Object.freeze({
            stage: 'SCREENING_CATALOG',
            completed: preparedIndex + 1,
            total: preparedCatalog.length,
            fraction: (preparedIndex + 1) / Math.max(1, preparedCatalog.length),
            events_found: events.length
        }));
        await maybeYield();
    }

    events.sort((left, right) =>
        Date.parse(left.tca) - Date.parse(right.tca) ||
        left.pair_key.localeCompare(right.pair_key) ||
        left.event_id.localeCompare(right.event_id)
    );
    const detectedEventCount = events.length;
    const reportedEvents = events.slice(0, run.configuration.max_results);
    const truncatedEventCount = detectedEventCount - reportedEvents.length;
    objectErrors.sort((left, right) =>
        String(left.object_id ?? '').localeCompare(String(right.object_id ?? '')) ||
        String(left.timestamp ?? '').localeCompare(String(right.timestamp ?? '')) ||
        left.code.localeCompare(right.code)
    );

    const completedAt = normalizeUtcInstant(runtime.now?.() ?? new Date(), 'screening completion timestamp');
    const runProvenance = computationProvenance(run, [...screenedElementSetIds]);
    const qualityFlags = [
        'COLLISION_PROBABILITY_UNAVAILABLE',
        'SELECTED_OBJECT_VS_CATALOG',
        'TLE_SGP4_SCREENING_ONLY'
    ];
    if (propagationFailures > 0) qualityFlags.push('INCOMPLETE_PROPAGATION_COVERAGE');
    if (truncatedEventCount > 0) qualityFlags.push('RESULT_LIMIT_APPLIED');
    if (events.some(event => event.analysis?.refinement_converged === false)) {
        qualityFlags.push('REFINEMENT_NOT_CONVERGED');
    }
    if (incompleteRefinements > 0) qualityFlags.push('INCOMPLETE_REFINEMENT_COVERAGE');
    if (events.some(event => event.quality_flags.includes('COLOCATED_OR_COMMON_TLE_GEOMETRY'))) {
        qualityFlags.push('COLOCATED_OR_COMMON_TLE_GEOMETRY_PRESENT');
    }
    if (duplicateCatalogObjectsSkipped > 0) qualityFlags.push('DUPLICATE_CATALOG_OBJECTS_SKIPPED');
    if (screenedInputQualityFlags.has('TLE_STALE')) qualityFlags.push('STALE_INPUTS_SCREENED');
    if (screenedInputQualityFlags.has('SOURCE_DATA_DEGRADED')) qualityFlags.push('DEGRADED_INPUTS_SCREENED');
    if (run.dataset_provenance.source_status === 'PARTIAL' || run.dataset_provenance.partial_update) {
        qualityFlags.push('PARTIAL_SOURCE_DATASET');
    }
    if (run.dataset_provenance.source_status === 'DEGRADED') qualityFlags.push('DEGRADED_SOURCE_DATASET');
    qualityFlags.push(...screeningTimeQualityFlags);

    const result = {
        schema_version: DOMAIN_SCHEMA_VERSION,
        request_id: run.request_id,
        status: propagationFailures > 0 ||
            run.dataset_provenance.source_status !== 'COMPLETE' ||
            run.dataset_provenance.partial_update
            ? 'PARTIAL'
            : 'COMPLETED',
        started_at: startedAt,
        completed_at: completedAt,
        maturity: CAPABILITY_MATURITY.EXPERIMENTAL,
        request: run.request,
        configuration: run.configuration,
        events: reportedEvents,
        statistics: {
            catalog_objects: run.catalog.length,
            candidates_examined: candidatesExamined,
            events_refined: eventsRefined,
            propagation_failures: propagationFailures,
            self_pairs_skipped: selfPairsSkipped,
            coarse_intervals_tested: coarseIntervalsTested,
            coarse_candidates: coarseCandidates,
            events_detected: detectedEventCount,
            events_reported: reportedEvents.length,
            events_truncated: truncatedEventCount,
            truncated_error_count: truncatedErrorCount
        },
        errors: objectErrors,
        dataset_provenance: run.dataset_provenance,
        provenance: runProvenance,
        quality_flags: qualityFlags.sort()
    };
    assertScreeningResult(result);
    onProgress(Object.freeze({ stage: 'COMPLETE', completed: run.catalog.length, total: run.catalog.length, fraction: 1 }));
    return Object.freeze(result);
}
