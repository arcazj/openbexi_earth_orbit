import { createTlePropagationService } from '../orbit/propagationService.js';
import {
    canonicalPairKey,
    stableFingerprint
} from '../domain/objectIdentity.js';
import {
    normalizeComputationProvenance,
    normalizeDatasetProvenance
} from '../domain/contracts.js';
import {
    CAPABILITY_MATURITY,
    DOMAIN_SCHEMA_VERSION,
    REFERENCE_FRAME,
    TIME_SCALE,
    normalizeUtcInstant
} from '../domain/orbitalPolicy.js';
import {
    ScreeningCancelledError,
    ScreeningError,
    closestPointOnRelativeSegment,
    curvatureSafetyMarginKm,
    deduplicatePairEvents,
    normalizeScreeningConfiguration,
    preferredElementSet,
    screenConjunctionPairInterval,
    createScreeningTimeGrid
} from './conjunctionScreening.js';

export const FULL_CATALOG_SCREENING_ALGORITHM = 'openbexi-full-catalog-spatial-screening';
export const FULL_CATALOG_SCREENING_VERSION = '2.1.0';
export const FULL_CATALOG_CONFIGURATION_VERSION = '2.1.0';
export const FULL_CATALOG_PARTITION_VERSION = '1.0.0';

const MAX_CATALOG_OBJECTS = 100_000;
const MAX_ERROR_DETAILS = 100;
const NUMERIC_DISTANCE_EPSILON_KM = 1e-9;

export const DEFAULT_FULL_CATALOG_CONFIGURATION = Object.freeze({
    spatial_cell_size_km: 1_000,
    max_cells_per_object: 512,
    max_cell_memberships_per_slab: 2_000_000,
    max_spatial_pair_checks_per_slab: 5_000_000,
    max_candidate_intervals: 250_000,
    max_detected_events: 10_000
});

function defaultYieldControl() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function stableJson(value) {
    return JSON.stringify(stableValue(value));
}

function hashValue(value) {
    return `fnv1a64:${stableFingerprint(value)}`;
}

function optionValue(options, snakeKey, camelKey) {
    return options?.[snakeKey] ?? options?.[camelKey];
}

function finitePositive(value, fallback, label) {
    const numeric = value === undefined || value === null || value === '' ? fallback : Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new ScreeningError('INVALID_FULL_CATALOG_CONFIGURATION', `${label} must be a positive finite number.`);
    }
    return numeric;
}

function boundedInteger(value, fallback, label, maximum) {
    const numeric = value === undefined || value === null || value === '' ? fallback : Number(value);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > maximum) {
        throw new ScreeningError(
            'INVALID_FULL_CATALOG_CONFIGURATION',
            `${label} must be an integer from 1 through ${maximum}.`
        );
    }
    return numeric;
}

function normalizeFullConfiguration(options, startMs) {
    const screening = normalizeScreeningConfiguration(options, startMs);
    return Object.freeze({
        ...screening,
        configuration_version: FULL_CATALOG_CONFIGURATION_VERSION,
        spatial_cell_size_km: finitePositive(
            optionValue(options, 'spatial_cell_size_km', 'spatialCellSizeKm'),
            DEFAULT_FULL_CATALOG_CONFIGURATION.spatial_cell_size_km,
            'spatial cell size'
        ),
        max_cells_per_object: boundedInteger(
            optionValue(options, 'max_cells_per_object', 'maxCellsPerObject'),
            DEFAULT_FULL_CATALOG_CONFIGURATION.max_cells_per_object,
            'maximum cells per object',
            1_000_000
        ),
        max_cell_memberships_per_slab: boundedInteger(
            optionValue(options, 'max_cell_memberships_per_slab', 'maxCellMembershipsPerSlab'),
            DEFAULT_FULL_CATALOG_CONFIGURATION.max_cell_memberships_per_slab,
            'maximum cell memberships per slab',
            100_000_000
        ),
        max_spatial_pair_checks_per_slab: boundedInteger(
            optionValue(options, 'max_spatial_pair_checks_per_slab', 'maxSpatialPairChecksPerSlab'),
            DEFAULT_FULL_CATALOG_CONFIGURATION.max_spatial_pair_checks_per_slab,
            'maximum spatial pair checks per slab',
            1_000_000_000
        ),
        max_candidate_intervals: boundedInteger(
            optionValue(options, 'max_candidate_intervals', 'maxCandidateIntervals'),
            DEFAULT_FULL_CATALOG_CONFIGURATION.max_candidate_intervals,
            'maximum candidate intervals',
            10_000_000
        ),
        max_detected_events: boundedInteger(
            optionValue(options, 'max_detected_events', 'maxDetectedEvents'),
            DEFAULT_FULL_CATALOG_CONFIGURATION.max_detected_events,
            'maximum detected events',
            1_000_000
        )
    });
}

function catalogMaterial(record) {
    const line1 = record?.element_set?.line1 ?? record?.elementSet?.line1 ??
        record?.tle_line1 ?? record?.tleLine1 ?? record?.line1 ?? '';
    const line2 = record?.element_set?.line2 ?? record?.elementSet?.line2 ??
        record?.tle_line2 ?? record?.tleLine2 ?? record?.line2 ?? '';
    const id = record?.object_id ?? record?.objectId ?? record?.norad_id ?? record?.NORAD_CAT_ID ?? '';
    return [String(id), String(line1), String(line2)].join('|');
}

function explicitDatasetIdentity(record) {
    const provenance = record?.provenance ?? record?.element_set?.provenance ?? record?.elementSet?.provenance;
    if (!provenance || typeof provenance !== 'object') return null;
    const datasetId = provenance.dataset_id ?? provenance.datasetId;
    const datasetHash = provenance.dataset_hash ?? provenance.datasetHash;
    return datasetId || datasetHash ? {
        dataset_id: datasetId == null ? null : String(datasetId),
        dataset_hash: datasetHash == null ? null : String(datasetHash)
    } : null;
}

function normalizeRunInput(request) {
    if (!Array.isArray(request?.catalog) || request.catalog.length < 2) {
        throw new ScreeningError('INVALID_CATALOG', 'Full-catalog screening requires at least two catalog records.');
    }
    if (request.catalog.length > MAX_CATALOG_OBJECTS) {
        throw new ScreeningError(
            'SCREENING_RESOURCE_LIMIT_EXCEEDED',
            `catalog must not exceed ${MAX_CATALOG_OBJECTS} objects.`
        );
    }

    const startTime = normalizeUtcInstant(
        request.start_time ?? request.startTime ?? request.options?.start_time ?? request.options?.startTime,
        'screening start time'
    );
    const startMs = Date.parse(startTime);
    const suppliedOptions = request.options ?? request.configuration ?? {};
    const options = {
        ...suppliedOptions,
        start_time: startTime,
        ...(optionValue(suppliedOptions, 'end_time', 'endTime') == null &&
            (request.end_time ?? request.endTime) != null
            ? { end_time: request.end_time ?? request.endTime }
            : {})
    };
    const configuration = normalizeFullConfiguration(options, startMs);
    const frame = String(request.frame ?? REFERENCE_FRAME.TEME).trim().toUpperCase();
    const timeScale = String(request.time_scale ?? request.timeScale ?? TIME_SCALE.UTC).trim().toUpperCase();
    if (frame !== REFERENCE_FRAME.TEME || timeScale !== TIME_SCALE.UTC) {
        throw new ScreeningError(
            'FULL_CATALOG_FRAME_OR_TIME_UNSUPPORTED',
            'Full-catalog TLE screening supports only UTC timestamps in the TEME frame.'
        );
    }

    const material = request.catalog.map(catalogMaterial).sort().join('\n');
    const suppliedProvenance = request.dataset_provenance ?? request.datasetProvenance ?? {};
    const datasetId = String(
        request.dataset_id ?? request.datasetId ?? suppliedProvenance.dataset_id ?? 'dataset:inline-catalog'
    );
    const datasetHash = String(
        request.dataset_hash ?? request.datasetHash ?? suppliedProvenance.dataset_hash ?? hashValue(material)
    );
    const requestedAt = normalizeUtcInstant(
        request.requested_at ?? request.requestedAt ?? configuration.start_time,
        'requested_at'
    );
    const suppliedStatus = String(suppliedProvenance.source_status ?? '').toUpperCase();
    const sourceStatus = ['COMPLETE', 'PARTIAL', 'DEGRADED'].includes(suppliedStatus)
        ? suppliedStatus
        : 'DEGRADED';
    const datasetProvenance = normalizeDatasetProvenance({
        schema_version: suppliedProvenance.schema_version ?? DOMAIN_SCHEMA_VERSION,
        source_id: suppliedProvenance.source_id ?? 'inline-catalog',
        provider: suppliedProvenance.provider ?? 'Unspecified inline catalog',
        retrieved_at: Object.prototype.hasOwnProperty.call(suppliedProvenance, 'retrieved_at')
            ? suppliedProvenance.retrieved_at
            : requestedAt,
        dataset_id: datasetId,
        dataset_hash: datasetHash,
        source_uri: suppliedProvenance.source_uri ?? null,
        source_status: sourceStatus,
        partial_update: sourceStatus === 'PARTIAL' ? true : suppliedProvenance.partial_update === true,
        license_id: suppliedProvenance.license_id ?? null
    });
    const requestId = String(request.request_id ?? request.requestId ?? `full-screen:${stableFingerprint(stableJson({
        dataset_hash: datasetHash,
        start_time: configuration.start_time,
        end_time: configuration.end_time,
        configuration
    }))}`);

    return Object.freeze({
        catalog: request.catalog,
        configuration,
        dataset_id: datasetId,
        dataset_hash: datasetHash,
        dataset_provenance: datasetProvenance,
        request_id: requestId,
        requested_at: requestedAt,
        frame,
        time_scale: timeScale
    });
}

function vectorSubtract(left, right) {
    return {
        x: left.x - right.x,
        y: left.y - right.y,
        z: left.z - right.z
    };
}

function relativeState(primaryState, secondaryState) {
    const relativePosition = vectorSubtract(secondaryState.position_km, primaryState.position_km);
    const relativeVelocity = vectorSubtract(secondaryState.velocity_km_s, primaryState.velocity_km_s);
    return {
        primary_state: primaryState,
        secondary_state: secondaryState,
        relative_position_km: relativePosition,
        relative_velocity_km_s: relativeVelocity,
        distance_squared_km2: relativePosition.x ** 2 + relativePosition.y ** 2 + relativePosition.z ** 2
    };
}

function vectorMagnitude(vector) {
    return Math.hypot(vector.x, vector.y, vector.z);
}

function passesKinematicSanityCheck(startState, endState, intervalSeconds, accelerationBoundKmS2) {
    const displacementResidual = {
        x: endState.position_km.x - startState.position_km.x - startState.velocity_km_s.x * intervalSeconds,
        y: endState.position_km.y - startState.position_km.y - startState.velocity_km_s.y * intervalSeconds,
        z: endState.position_km.z - startState.position_km.z - startState.velocity_km_s.z * intervalSeconds
    };
    const reverseResidual = {
        x: startState.position_km.x - endState.position_km.x + endState.velocity_km_s.x * intervalSeconds,
        y: startState.position_km.y - endState.position_km.y + endState.velocity_km_s.y * intervalSeconds,
        z: startState.position_km.z - endState.position_km.z + endState.velocity_km_s.z * intervalSeconds
    };
    const velocityChange = vectorSubtract(endState.velocity_km_s, startState.velocity_km_s);
    const positionAllowance = accelerationBoundKmS2 * intervalSeconds ** 2 / 2 + 1e-6;
    const velocityAllowance = accelerationBoundKmS2 * intervalSeconds + 1e-9;
    return vectorMagnitude(displacementResidual) <= positionAllowance &&
        vectorMagnitude(reverseResidual) <= positionAllowance &&
        vectorMagnitude(velocityChange) <= velocityAllowance;
}

function pairCount(objectCount) {
    return objectCount * (objectCount - 1) / 2;
}

function cellCompare(left, right) {
    return left.x - right.x || left.y - right.y || left.z - right.z;
}

function cellKey(x, y, z) {
    return `${x},${y},${z}`;
}

function boxesOverlap(left, right) {
    return left.minimum[0] <= right.maximum[0] && right.minimum[0] <= left.maximum[0] &&
        left.minimum[1] <= right.maximum[1] && right.minimum[1] <= left.maximum[1] &&
        left.minimum[2] <= right.maximum[2] && right.minimum[2] <= left.maximum[2];
}

function isOwnerCell(cell, left, right) {
    return cell.x === Math.max(left.cell_minimum[0], right.cell_minimum[0]) &&
        cell.y === Math.max(left.cell_minimum[1], right.cell_minimum[1]) &&
        cell.z === Math.max(left.cell_minimum[2], right.cell_minimum[2]);
}

export function createSweptAabb({
    objectIndex,
    startState,
    endState,
    intervalSeconds,
    configuration
}) {
    // Split the relative curvature/radius allowance evenly so any admissible
    // pair has overlapping boxes without assuming either object owns the motion.
    const objectCurvatureMargin = curvatureSafetyMarginKm(
        intervalSeconds,
        configuration.max_relative_acceleration_km_s2 / 2
    );
    const expansionKm = objectCurvatureMargin +
        (configuration.screening_radius_km + configuration.coarse_padding_km) / 2 +
        NUMERIC_DISTANCE_EPSILON_KM;
    const start = startState.position_km;
    const end = endState.position_km;
    const startVector = [start.x, start.y, start.z];
    const endVector = [end.x, end.y, end.z];
    const minimum = startVector.map((value, axis) => Math.min(value, endVector[axis]) - expansionKm);
    const maximum = startVector.map((value, axis) => Math.max(value, endVector[axis]) + expansionKm);
    const cellMinimum = minimum.map(value => Math.floor(value / configuration.spatial_cell_size_km));
    const cellMaximum = maximum.map(value => Math.floor(value / configuration.spatial_cell_size_km));
    const cellCount = cellMinimum.reduce(
        (count, value, axis) => count * (cellMaximum[axis] - value + 1),
        1
    );
    return Object.freeze({
        object_index: objectIndex,
        minimum: Object.freeze(minimum),
        maximum: Object.freeze(maximum),
        cell_minimum: Object.freeze(cellMinimum),
        cell_maximum: Object.freeze(cellMaximum),
        cell_count: cellCount,
        expansion_km: expansionKm,
        object_curvature_margin_km: objectCurvatureMargin
    });
}

function candidateRecord(run, intervalIndex, first, second, broadCandidate, refinement, ownerCell) {
    const pairKey = canonicalPairKey(first.object_id, second.object_id);
    const intervalStart = new Date(broadCandidate.interval_start_ms).toISOString();
    const intervalEnd = new Date(broadCandidate.interval_end_ms).toISOString();
    const candidateId = `candidate:${stableFingerprint([
        run.request_id,
        intervalIndex,
        pairKey,
        intervalStart,
        intervalEnd
    ].join('\n'))}`;
    return Object.freeze({
        candidate_id: candidateId,
        partition_id: `${run.request_id}:slab:${String(intervalIndex).padStart(6, '0')}`,
        interval_index: intervalIndex,
        pair_key: pairKey,
        primary_object_id: first.object_id,
        secondary_object_id: second.object_id,
        primary_element_set_id: first.element_set_id,
        secondary_element_set_id: second.element_set_id,
        interval_start: intervalStart,
        interval_end: intervalEnd,
        time_scale: TIME_SCALE.UTC,
        frame: REFERENCE_FRAME.TEME,
        spatial_owner_cell: Object.freeze({ ...ownerCell }),
        chord_fraction: broadCandidate.chord.fraction,
        coarse_miss_distance_km: broadCandidate.chord.distance_km,
        broad_phase_margin_km: broadCandidate.curvature_margin_km + run.configuration.coarse_padding_km,
        candidate_threshold_km: broadCandidate.candidate_threshold_km,
        refinement_status: refinement?.status ?? 'NOT_RUN',
        event_ids: Object.freeze([...(refinement?.event_ids ?? [])])
    });
}

function partitionEnvelope(run, intervalIndex, intervalStartMs, intervalEndMs, status, candidates, reason = null) {
    const partitionId = `${run.request_id}:slab:${String(intervalIndex).padStart(6, '0')}`;
    const sortedCandidates = [...candidates].sort((left, right) =>
        left.pair_key.localeCompare(right.pair_key) || left.candidate_id.localeCompare(right.candidate_id)
    );
    const candidateHash = hashValue(stableJson(sortedCandidates));
    return Object.freeze({
        partition_version: FULL_CATALOG_PARTITION_VERSION,
        partition_id: partitionId,
        interval_index: intervalIndex,
        interval_start: new Date(intervalStartMs).toISOString(),
        interval_end: new Date(intervalEndMs).toISOString(),
        status,
        reason,
        dataset_id: run.dataset_id,
        dataset_hash: run.dataset_hash,
        algorithm: FULL_CATALOG_SCREENING_ALGORITHM,
        algorithm_version: FULL_CATALOG_SCREENING_VERSION,
        configuration_hash: hashValue(stableJson(run.configuration)),
        candidate_count: sortedCandidates.length,
        candidate_hash: candidateHash,
        candidates: Object.freeze(sortedCandidates)
    });
}

function normalizeError(error, context) {
    return Object.freeze({
        code: String(error?.code ?? 'PROPAGATION_FAILED'),
        message: String(error?.message ?? 'Propagation failed.'),
        stage: String(error?.stage ?? context.stage ?? 'PROPAGATION'),
        object_id: error?.object_id == null ? context.object_id ?? null : String(error.object_id),
        element_set_id: error?.element_set_id == null ? context.element_set_id ?? null : String(error.element_set_id),
        timestamp: error?.timestamp == null ? context.timestamp ?? null : String(error.timestamp),
        propagator_error_code: error?.propagator_error_code ?? null,
        recoverable: error?.recoverable !== false,
        catalog_index: context.catalog_index ?? null,
        interval_index: context.interval_index ?? null,
        refinement: context.refinement === true
    });
}

export async function screenFullCatalog(request, runtime = {}) {
    const propagationService = runtime.propagationService ?? createTlePropagationService({
        satelliteLib: runtime.satelliteLib
    });
    const run = normalizeRunInput(request);
    const startedAt = normalizeUtcInstant(runtime.now?.() ?? new Date(), 'screening start timestamp');
    const isCancelled = runtime.isCancelled ?? (() => false);
    const yieldControl = runtime.yieldControl ?? defaultYieldControl;
    const onProgress = typeof runtime.onProgress === 'function' ? runtime.onProgress : () => {};
    const onCandidatePartition = typeof runtime.onCandidatePartition === 'function'
        ? runtime.onCandidatePartition
        : () => {};
    let operationCount = 0;
    const checkCancellation = () => {
        if (isCancelled()) throw new ScreeningCancelledError('Full-catalog screening was cancelled.');
    };
    const maybeYield = async () => {
        operationCount += 1;
        if (operationCount % run.configuration.yield_every_operations === 0) {
            await yieldControl();
            checkCancellation();
        }
    };

    const errors = [];
    let truncatedErrorCount = 0;
    let propagationFailures = 0;
    const recordError = (error, context = {}) => {
        propagationFailures += context.propagation === false ? 0 : 1;
        if (errors.length < MAX_ERROR_DETAILS) errors.push(normalizeError(error, context));
        else truncatedErrorCount += 1;
    };

    const preparedByObjectId = new Map();
    let duplicateCatalogObjectsSkipped = 0;
    onProgress(Object.freeze({
        stage: 'PREPARING_CATALOG',
        completed: 0,
        total: run.catalog.length,
        fraction: 0
    }));
    for (let catalogIndex = 0; catalogIndex < run.catalog.length; catalogIndex += 1) {
        checkCancellation();
        const raw = run.catalog[catalogIndex];
        const preparedResult = propagationService.prepareObject(raw);
        if (!preparedResult.ok) {
            recordError(preparedResult.error, { stage: 'PREPARE', catalog_index: catalogIndex });
        } else {
            const explicitIdentity = explicitDatasetIdentity(raw);
            if (
                (explicitIdentity?.dataset_id && explicitIdentity.dataset_id !== run.dataset_id) ||
                (explicitIdentity?.dataset_hash && explicitIdentity.dataset_hash !== run.dataset_hash)
            ) {
                recordError({
                    code: 'DATASET_PROVENANCE_MISMATCH',
                    message: 'Catalog object provenance does not match the full-catalog screening dataset.',
                    stage: 'PREPARE',
                    object_id: preparedResult.value.object_id,
                    element_set_id: preparedResult.value.element_set_id,
                    recoverable: true
                }, { stage: 'PREPARE', catalog_index: catalogIndex, propagation: false });
            } else {
                const prepared = Object.freeze({
                    ...preparedResult.value,
                    dataset_id: run.dataset_id,
                    dataset_hash: run.dataset_hash,
                    source_id: run.dataset_provenance.source_id
                });
                const existing = preparedByObjectId.get(prepared.object_id);
                if (!existing) {
                    preparedByObjectId.set(prepared.object_id, { prepared, catalog_index: catalogIndex });
                } else {
                    duplicateCatalogObjectsSkipped += 1;
                    if (preferredElementSet(prepared, existing.prepared)) {
                        preparedByObjectId.set(prepared.object_id, { prepared, catalog_index: catalogIndex });
                    }
                }
            }
        }
        onProgress(Object.freeze({
            stage: 'PREPARING_CATALOG',
            completed: catalogIndex + 1,
            total: run.catalog.length,
            fraction: (catalogIndex + 1) / run.catalog.length
        }));
        await maybeYield();
    }

    const preparedCatalog = [...preparedByObjectId.values()].sort((left, right) =>
        left.prepared.object_id.localeCompare(right.prepared.object_id) ||
        left.prepared.element_set_id.localeCompare(right.prepared.element_set_id)
    );
    const objects = preparedCatalog.map(item => item.prepared);
    if (objects.length < 2) {
        throw new ScreeningError(
            'INSUFFICIENT_PREPARED_CATALOG',
            'Fewer than two catalog objects could be prepared for full-catalog screening.'
        );
    }

    const startMs = Date.parse(run.configuration.start_time);
    const endMs = Date.parse(run.configuration.end_time);
    const gridTimes = createScreeningTimeGrid(startMs, endMs, run.configuration.coarse_step_seconds);
    const totalCatalogPairs = pairCount(objects.length);
    const totalPairIntervals = totalCatalogPairs * (gridTimes.length - 1);
    const statistics = {
        catalog_records: run.catalog.length,
        catalog_objects: objects.length,
        catalog_pairs: totalCatalogPairs,
        time_slabs: gridTimes.length - 1,
        broad_phase_slabs_completed: 0,
        candidate_partitions_completed: 0,
        candidate_partitions_partial: 0,
        object_state_attempts: 0,
        propagation_failures: propagationFailures,
        pair_intervals_total: totalPairIntervals,
        pair_intervals_with_valid_endpoints: 0,
        pair_intervals_screened: 0,
        pair_intervals_unscreened: totalPairIntervals,
        spatial_cells: 0,
        spatial_cell_memberships: 0,
        spatial_pair_checks: 0,
        canonical_pair_checks: 0,
        aabb_candidates: 0,
        coarse_candidates: 0,
        candidates_persisted: 0,
        events_refined: 0,
        incomplete_refinements: 0,
        events_detected: 0,
        events_reported: 0,
        events_truncated: 0,
        motion_bound_violations: 0,
        duplicate_catalog_objects_skipped: duplicateCatalogObjectsSkipped,
        truncated_error_count: 0
    };
    const qualityFlags = new Set([
        'ACCELERATION_BOUND_COARSE_SCREEN',
        'COLLISION_PROBABILITY_UNAVAILABLE',
        'FULL_CATALOG_SNAPSHOT_SCREEN',
        'PERSISTABLE_CANDIDATE_PARTITIONS',
        'TLE_SGP4_SCREENING_ONLY'
    ]);
    if (duplicateCatalogObjectsSkipped > 0) qualityFlags.add('DUPLICATE_CATALOG_OBJECTS_SKIPPED');
    if (run.dataset_provenance.source_status === 'PARTIAL' || run.dataset_provenance.partial_update) {
        qualityFlags.add('PARTIAL_SOURCE_DATASET');
    }
    if (run.dataset_provenance.source_status === 'DEGRADED') qualityFlags.add('DEGRADED_SOURCE_DATASET');

    const propagateObject = async (prepared, timeMs, context = {}) => {
        checkCancellation();
        statistics.object_state_attempts += 1;
        const result = propagationService.propagate(prepared, new Date(timeMs));
        if (!result.ok) {
            recordError(result.error, {
                ...context,
                object_id: prepared.object_id,
                element_set_id: prepared.element_set_id,
                timestamp: new Date(timeMs).toISOString()
            });
            statistics.propagation_failures = propagationFailures;
        }
        await maybeYield();
        return result;
    };
    const propagateGridTime = async (timeMs, intervalIndex) => {
        const states = new Array(objects.length);
        for (let index = 0; index < objects.length; index += 1) {
            states[index] = await propagateObject(objects[index], timeMs, { interval_index: intervalIndex });
        }
        return states;
    };

    const candidatePartitions = [];
    const rawEventsByPair = new Map();
    let rawEventCount = 0;
    let resourceLimitReason = null;
    let previousStates = await propagateGridTime(gridTimes[0], 0);

    for (let intervalIndex = 0; intervalIndex < gridTimes.length - 1; intervalIndex += 1) {
        checkCancellation();
        const intervalStartMs = gridTimes[intervalIndex];
        const intervalEndMs = gridTimes[intervalIndex + 1];
        onProgress(Object.freeze({
            stage: 'PROPAGATING_SLAB',
            completed: intervalIndex,
            total: gridTimes.length - 1,
            fraction: intervalIndex / Math.max(1, gridTimes.length - 1)
        }));
        const nextStates = await propagateGridTime(intervalEndMs, intervalIndex);
        const intervalSeconds = (intervalEndMs - intervalStartMs) / 1000;
        // Swept AABBs split the relative acceleration budget evenly between
        // objects, so endpoint validation must enforce that same envelope.
        const objectAccelerationBoundKmS2 = run.configuration.max_relative_acceleration_km_s2 / 2;
        const eligibleIndices = [];
        for (let objectIndex = 0; objectIndex < objects.length; objectIndex += 1) {
            if (!previousStates[objectIndex]?.ok || !nextStates[objectIndex]?.ok) continue;
            if (!passesKinematicSanityCheck(
                previousStates[objectIndex].value,
                nextStates[objectIndex].value,
                intervalSeconds,
                objectAccelerationBoundKmS2
            )) {
                statistics.motion_bound_violations += 1;
                recordError({
                    code: 'KINEMATIC_BOUND_VIOLATION',
                    message: 'Endpoint position/velocity changes exceed the configured acceleration sanity envelope.',
                    stage: 'BROAD_PHASE',
                    object_id: objects[objectIndex].object_id,
                    element_set_id: objects[objectIndex].element_set_id,
                    recoverable: true
                }, {
                    stage: 'BROAD_PHASE',
                    object_id: objects[objectIndex].object_id,
                    element_set_id: objects[objectIndex].element_set_id,
                    timestamp: new Date(intervalEndMs).toISOString(),
                    interval_index: intervalIndex,
                    propagation: false
                });
                continue;
            }
            eligibleIndices.push(objectIndex);
        }
        const boxes = [];
        let membershipCount = 0;
        let slabResourceReason = null;
        for (const objectIndex of eligibleIndices) {
            const box = createSweptAabb({
                objectIndex,
                startState: previousStates[objectIndex].value,
                endState: nextStates[objectIndex].value,
                intervalSeconds,
                configuration: run.configuration
            });
            if (!Number.isSafeInteger(box.cell_count) || box.cell_count > run.configuration.max_cells_per_object) {
                slabResourceReason = 'MAX_CELLS_PER_OBJECT_EXCEEDED';
                break;
            }
            membershipCount += box.cell_count;
            if (membershipCount > run.configuration.max_cell_memberships_per_slab) {
                slabResourceReason = 'MAX_CELL_MEMBERSHIPS_PER_SLAB_EXCEEDED';
                break;
            }
            boxes.push(box);
        }
        const eligiblePairIntervals = pairCount(eligibleIndices.length);
        statistics.pair_intervals_with_valid_endpoints += eligiblePairIntervals;

        const cells = new Map();
        if (!slabResourceReason) {
            for (const box of boxes) {
                for (let x = box.cell_minimum[0]; x <= box.cell_maximum[0]; x += 1) {
                    for (let y = box.cell_minimum[1]; y <= box.cell_maximum[1]; y += 1) {
                        for (let z = box.cell_minimum[2]; z <= box.cell_maximum[2]; z += 1) {
                            const key = cellKey(x, y, z);
                            let cell = cells.get(key);
                            if (!cell) {
                                cell = { x, y, z, members: [] };
                                cells.set(key, cell);
                            }
                            cell.members.push(box.object_index);
                        }
                    }
                }
                await maybeYield();
            }
        }

        const boxByObjectIndex = new Map(boxes.map(box => [box.object_index, box]));
        const broadCandidates = [];
        let slabSpatialPairChecks = 0;
        if (!slabResourceReason) {
            const orderedCells = [...cells.values()].sort(cellCompare);
            statistics.spatial_cells += orderedCells.length;
            statistics.spatial_cell_memberships += membershipCount;
            onProgress(Object.freeze({
                stage: 'SCREENING_SLAB',
                completed: intervalIndex,
                total: gridTimes.length - 1,
                fraction: intervalIndex / Math.max(1, gridTimes.length - 1)
            }));
            outerCells:
            for (const cell of orderedCells) {
                for (let leftOffset = 0; leftOffset < cell.members.length; leftOffset += 1) {
                    for (let rightOffset = leftOffset + 1; rightOffset < cell.members.length; rightOffset += 1) {
                        if (slabSpatialPairChecks >= run.configuration.max_spatial_pair_checks_per_slab) {
                            slabResourceReason = 'MAX_SPATIAL_PAIR_CHECKS_PER_SLAB_EXCEEDED';
                            break outerCells;
                        }
                        slabSpatialPairChecks += 1;
                        statistics.spatial_pair_checks += 1;
                        const firstIndex = cell.members[leftOffset];
                        const secondIndex = cell.members[rightOffset];
                        const firstBox = boxByObjectIndex.get(firstIndex);
                        const secondBox = boxByObjectIndex.get(secondIndex);
                        if (!isOwnerCell(cell, firstBox, secondBox)) continue;
                        statistics.canonical_pair_checks += 1;
                        if (!boxesOverlap(firstBox, secondBox)) continue;
                        statistics.aabb_candidates += 1;

                        const relativeStart = vectorSubtract(
                            previousStates[secondIndex].value.position_km,
                            previousStates[firstIndex].value.position_km
                        );
                        const relativeEnd = vectorSubtract(
                            nextStates[secondIndex].value.position_km,
                            nextStates[firstIndex].value.position_km
                        );
                        const chord = closestPointOnRelativeSegment(relativeStart, relativeEnd);
                        const curvatureMargin = curvatureSafetyMarginKm(
                            intervalSeconds,
                            run.configuration.max_relative_acceleration_km_s2
                        );
                        const candidateThreshold = run.configuration.screening_radius_km +
                            curvatureMargin + run.configuration.coarse_padding_km;
                        if (chord.distance_km > candidateThreshold + NUMERIC_DISTANCE_EPSILON_KM) continue;
                        if (statistics.coarse_candidates >= run.configuration.max_candidate_intervals) {
                            slabResourceReason = 'MAX_CANDIDATE_INTERVALS_EXCEEDED';
                            break outerCells;
                        }
                        statistics.coarse_candidates += 1;
                        broadCandidates.push({
                            first_index: firstIndex,
                            second_index: secondIndex,
                            owner_cell: { x: cell.x, y: cell.y, z: cell.z },
                            interval_start_ms: intervalStartMs,
                            interval_end_ms: intervalEndMs,
                            chord,
                            curvature_margin_km: curvatureMargin,
                            candidate_threshold_km: candidateThreshold,
                            pair_key: canonicalPairKey(objects[firstIndex].object_id, objects[secondIndex].object_id)
                        });
                    }
                }
                await maybeYield();
            }
        }
        broadCandidates.sort((left, right) =>
            left.pair_key.localeCompare(right.pair_key) || left.first_index - right.first_index ||
            left.second_index - right.second_index
        );

        if (!slabResourceReason) {
            statistics.broad_phase_slabs_completed += 1;
            statistics.pair_intervals_screened += eligiblePairIntervals;
        }

        const persistedCandidates = [];
        let partitionIncomplete = !!slabResourceReason || eligibleIndices.length !== objects.length;
        let partitionReason = slabResourceReason ??
            (eligibleIndices.length !== objects.length ? 'INCOMPLETE_ENDPOINT_COVERAGE' : null);
        if (!slabResourceReason) {
            onProgress(Object.freeze({
                stage: 'REFINING_SLAB',
                completed: intervalIndex,
                total: gridTimes.length - 1,
                fraction: intervalIndex / Math.max(1, gridTimes.length - 1),
                candidates: broadCandidates.length
            }));
            for (const broadCandidate of broadCandidates) {
                checkCancellation();
                const first = objects[broadCandidate.first_index];
                const second = objects[broadCandidate.second_index];
                const pairRun = {
                    ...run,
                    primary: first,
                    algorithm_name: FULL_CATALOG_SCREENING_ALGORITHM,
                    algorithm_version: FULL_CATALOG_SCREENING_VERSION,
                    event_quality_flags: ['FULL_CATALOG_SNAPSHOT_SCREEN']
                };
                const evaluationCache = new Map();
                const evaluateAt = async timeMs => {
                    if (evaluationCache.has(timeMs)) return evaluationCache.get(timeMs);
                    const firstState = timeMs === intervalStartMs
                        ? previousStates[broadCandidate.first_index]
                        : timeMs === intervalEndMs
                            ? nextStates[broadCandidate.first_index]
                            : await propagateObject(first, timeMs, { interval_index: intervalIndex, refinement: true });
                    const secondState = timeMs === intervalStartMs
                        ? previousStates[broadCandidate.second_index]
                        : timeMs === intervalEndMs
                            ? nextStates[broadCandidate.second_index]
                            : await propagateObject(second, timeMs, { interval_index: intervalIndex, refinement: true });
                    const relative = firstState?.ok && secondState?.ok
                        ? relativeState(firstState.value, secondState.value)
                        : null;
                    evaluationCache.set(timeMs, relative);
                    return relative;
                };
                const intervalResult = await screenConjunctionPairInterval({
                    run: pairRun,
                    secondary: second,
                    intervalStartMs,
                    intervalEndMs,
                    includeIntervalEnd: intervalIndex === gridTimes.length - 2,
                    screenStartMs: startMs,
                    screenEndMs: endMs,
                    primaryStart: previousStates[broadCandidate.first_index],
                    primaryEnd: nextStates[broadCandidate.first_index],
                    secondaryStart: previousStates[broadCandidate.second_index],
                    secondaryEnd: nextStates[broadCandidate.second_index],
                    evaluateAt,
                    checkCancellation
                });
                statistics.events_refined += intervalResult.events_refined;
                statistics.incomplete_refinements += intervalResult.incomplete_refinements;
                if (intervalResult.incomplete_refinements > 0) {
                    partitionIncomplete = true;
                    partitionReason ??= 'INCOMPLETE_REFINEMENT_COVERAGE';
                }
                const eventIds = [];
                for (const event of intervalResult.events) {
                    if (rawEventCount >= run.configuration.max_detected_events) {
                        slabResourceReason = 'MAX_DETECTED_EVENTS_EXCEEDED';
                        partitionReason = slabResourceReason;
                        partitionIncomplete = true;
                        break;
                    }
                    rawEventCount += 1;
                    eventIds.push(event.event_id);
                    const pairEvents = rawEventsByPair.get(event.pair_key) ?? [];
                    pairEvents.push(event);
                    rawEventsByPair.set(event.pair_key, pairEvents);
                }
                persistedCandidates.push(candidateRecord(
                    run,
                    intervalIndex,
                    first,
                    second,
                    broadCandidate,
                    {
                        status: intervalResult.incomplete_refinements > 0 ? 'INCOMPLETE' : 'COMPLETED',
                        event_ids: eventIds
                    },
                    broadCandidate.owner_cell
                ));
                if (slabResourceReason) break;
                await maybeYield();
            }
        }
        if (slabResourceReason && persistedCandidates.length < broadCandidates.length) {
            for (let index = persistedCandidates.length; index < broadCandidates.length; index += 1) {
                const broadCandidate = broadCandidates[index];
                persistedCandidates.push(candidateRecord(
                    run,
                    intervalIndex,
                    objects[broadCandidate.first_index],
                    objects[broadCandidate.second_index],
                    broadCandidate,
                    null,
                    broadCandidate.owner_cell
                ));
            }
        }
        const partitionStatus = partitionIncomplete || slabResourceReason ? 'PARTIAL' : 'COMPLETED';
        const partition = partitionEnvelope(
            run,
            intervalIndex,
            intervalStartMs,
            intervalEndMs,
            partitionStatus,
            persistedCandidates,
            partitionReason
        );
        candidatePartitions.push(partition);
        statistics.candidates_persisted += partition.candidate_count;
        if (partitionStatus === 'COMPLETED') statistics.candidate_partitions_completed += 1;
        else statistics.candidate_partitions_partial += 1;
        await onCandidatePartition(partition);

        previousStates = nextStates;
        if (slabResourceReason) {
            resourceLimitReason = slabResourceReason;
            if (slabResourceReason === 'MAX_DETECTED_EVENTS_EXCEEDED') {
                qualityFlags.add('INCOMPLETE_REFINEMENT_COVERAGE');
            } else {
                qualityFlags.add('INCOMPLETE_BROAD_PHASE_COVERAGE');
            }
            qualityFlags.add('RESOURCE_LIMIT_APPLIED');
            break;
        }
        onProgress(Object.freeze({
            stage: 'SCREENING_SLAB',
            completed: intervalIndex + 1,
            total: gridTimes.length - 1,
            fraction: (intervalIndex + 1) / (gridTimes.length - 1)
        }));
    }

    if (propagationFailures > 0) qualityFlags.add('INCOMPLETE_PROPAGATION_COVERAGE');
    if (statistics.motion_bound_violations > 0) qualityFlags.add('KINEMATIC_BOUND_VIOLATION');
    if (statistics.incomplete_refinements > 0) qualityFlags.add('INCOMPLETE_REFINEMENT_COVERAGE');
    statistics.pair_intervals_unscreened = Math.max(
        0,
        statistics.pair_intervals_total - statistics.pair_intervals_screened
    );
    if (statistics.pair_intervals_unscreened > 0) qualityFlags.add('INCOMPLETE_PAIR_INTERVAL_COVERAGE');

    const events = [];
    for (const pairKey of [...rawEventsByPair.keys()].sort()) {
        events.push(...deduplicatePairEvents(
            rawEventsByPair.get(pairKey),
            run.configuration.refinement_tolerance_seconds
        ));
    }
    events.sort((left, right) =>
        Date.parse(left.tca) - Date.parse(right.tca) ||
        left.pair_key.localeCompare(right.pair_key) ||
        left.event_id.localeCompare(right.event_id)
    );
    const detectedEventCount = events.length;
    const reportedEvents = events.slice(0, run.configuration.max_results);
    const truncatedEventCount = detectedEventCount - reportedEvents.length;
    if (truncatedEventCount > 0) qualityFlags.add('RESULT_LIMIT_APPLIED');
    statistics.events_detected = detectedEventCount;
    statistics.events_reported = reportedEvents.length;
    statistics.events_truncated = truncatedEventCount;
    statistics.propagation_failures = propagationFailures;
    statistics.truncated_error_count = truncatedErrorCount;
    errors.sort((left, right) =>
        String(left.object_id ?? '').localeCompare(String(right.object_id ?? '')) ||
        String(left.timestamp ?? '').localeCompare(String(right.timestamp ?? '')) ||
        left.code.localeCompare(right.code)
    );

    const completedAt = normalizeUtcInstant(runtime.now?.() ?? new Date(), 'screening completion timestamp');
    const provenance = normalizeComputationProvenance({
        dataset_id: run.dataset_id,
        dataset_hash: run.dataset_hash,
        generated_at: run.requested_at,
        algorithm: {
            name: FULL_CATALOG_SCREENING_ALGORITHM,
            version: FULL_CATALOG_SCREENING_VERSION,
            configuration_hash: hashValue(stableJson(run.configuration))
        },
        input_element_set_ids: objects.map(object => object.element_set_id).sort()
    });
    const incomplete = propagationFailures > 0 || statistics.pair_intervals_unscreened > 0 || resourceLimitReason ||
        statistics.incomplete_refinements > 0 ||
        run.dataset_provenance.source_status !== 'COMPLETE' || run.dataset_provenance.partial_update;
    const status = incomplete ? 'PARTIAL' : 'COMPLETED';
    const candidates = candidatePartitions.flatMap(partition => partition.candidates);
    const result = Object.freeze({
        schema_version: DOMAIN_SCHEMA_VERSION,
        request_id: run.request_id,
        capability: 'FULL_CATALOG_SCREENING',
        status,
        started_at: startedAt,
        completed_at: completedAt,
        maturity: CAPABILITY_MATURITY.EXPERIMENTAL,
        request: Object.freeze({
            schema_version: DOMAIN_SCHEMA_VERSION,
            request_id: run.request_id,
            requested_at: run.requested_at,
            dataset_id: run.dataset_id,
            dataset_hash: run.dataset_hash,
            start_time: run.configuration.start_time,
            end_time: run.configuration.end_time,
            time_scale: run.time_scale,
            frame: run.frame
        }),
        configuration: run.configuration,
        candidates: Object.freeze(candidates),
        candidate_partitions: Object.freeze(candidatePartitions),
        events: Object.freeze(reportedEvents),
        statistics: Object.freeze(statistics),
        errors: Object.freeze(errors),
        dataset_provenance: run.dataset_provenance,
        provenance,
        resource_limit_reason: resourceLimitReason,
        quality_flags: Object.freeze([...qualityFlags].sort())
    });
    onProgress(Object.freeze({
        stage: status,
        completed: statistics.broad_phase_slabs_completed,
        total: statistics.time_slabs,
        fraction: statistics.broad_phase_slabs_completed / Math.max(1, statistics.time_slabs)
    }));
    return result;
}
