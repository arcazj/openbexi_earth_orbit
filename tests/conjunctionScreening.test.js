import assert from 'node:assert/strict';
import {
    normalizeStateVector,
    validateConjunctionEvent,
    validateScreeningResult
} from '../js/domain/contracts.js';
import {
    ScreeningCancelledError,
    curvatureSafetyMarginKm,
    screenSelectedObjectAgainstCatalog
} from '../js/conjunction/conjunctionScreening.js';

const START = '2026-07-19T00:00:00.000Z';
const START_MS = Date.parse(START);
const BASE_POSITION = Object.freeze({ x: 7000, y: 0, z: 0 });

function add(left, right) {
    return {
        x: left.x + right.x,
        y: left.y + right.y,
        z: left.z + right.z
    };
}

function negate(vector) {
    const invert = value => value === 0 ? 0 : -value;
    return { x: invert(vector.x), y: invert(vector.y), z: invert(vector.z) };
}

function syntheticObject(noradId, name, stateAt, options = {}) {
    return {
        object_id: `obx:norad:${noradId}`,
        norad_id: String(noradId),
        name,
        stateAt,
        failAt: options.failAt ?? null,
        prepareError: options.prepareError ?? null,
        quality_flags: [...(options.quality_flags ?? [])],
        element_epoch_utc: options.element_epoch_utc ?? START,
        element_set_id: options.element_set_id ?? `elset:synthetic:${noradId}`
    };
}

function relativeObject(noradId, name, relativeAt, options = {}) {
    return syntheticObject(noradId, name, seconds => {
        const relative = relativeAt(seconds);
        return {
            position_km: add(BASE_POSITION, relative.position_km),
            velocity_km_s: relative.velocity_km_s
        };
    }, options);
}

function syntheticPropagationService() {
    return {
        prepareObject(record) {
            if (record.prepareError) {
                return {
                    ok: false,
                    error: {
                        code: 'SYNTHETIC_PREPARATION_FAILURE',
                        message: record.prepareError,
                        object_id: record.object_id
                    }
                };
            }
            return {
                ok: true,
                value: {
                    ...record,
                    object_name: record.name,
                    element_set_id: record.element_set_id,
                    element_epoch_utc: record.element_epoch_utc,
                    dataset_id: 'dataset:synthetic',
                    dataset_hash: 'test:synthetic-dataset',
                    input_quality_flags: [...(record.quality_flags ?? [])]
                }
            };
        },
        propagate(prepared, instant) {
            const timestamp = new Date(instant).toISOString();
            const seconds = (Date.parse(timestamp) - START_MS) / 1000;
            if (prepared.failAt?.(seconds)) {
                return {
                    ok: false,
                    error: {
                        code: 'SYNTHETIC_PROPAGATION_FAILURE',
                        message: 'Synthetic state unavailable.',
                        object_id: prepared.object_id,
                        element_set_id: prepared.element_set_id,
                        timestamp
                    }
                };
            }
            const state = prepared.stateAt(seconds);
            return {
                ok: true,
                value: normalizeStateVector({
                    object_id: prepared.object_id,
                    element_set_id: prepared.element_set_id,
                    timestamp,
                    time_scale: 'UTC',
                    frame: 'TEME',
                    position_km: state.position_km,
                    velocity_km_s: state.velocity_km_s,
                    provenance: {
                        dataset_id: 'dataset:synthetic',
                        dataset_hash: 'test:synthetic-dataset',
                        generated_at: timestamp,
                        algorithm: {
                            name: 'deterministic synthetic state model',
                            version: '1.0.0',
                            configuration_hash: 'test:synthetic-state-model'
                        },
                        input_element_set_ids: [prepared.element_set_id]
                    },
                    quality_flags: [
                        'SYNTHETIC_TEST_STATE',
                        ...(prepared.input_quality_flags ?? [])
                    ].sort()
                })
            };
        }
    };
}

const primary = syntheticObject('100', 'PRIMARY', () => ({
    position_km: BASE_POSITION,
    velocity_km_s: { x: 0, y: 0, z: 0 }
}));
const propagationService = syntheticPropagationService();

function screeningRequest(primaryObject, catalog, optionOverrides = {}, requestId = 'screen:test') {
    return {
        request_id: requestId,
        requested_at: START,
        dataset_id: 'dataset:synthetic',
        dataset_hash: 'test:synthetic-dataset',
        dataset_provenance: {
            schema_version: '2.0.0',
            source_id: 'synthetic-test-catalog',
            provider: 'OpenBEXI test fixture',
            retrieved_at: START,
            dataset_id: 'dataset:synthetic',
            dataset_hash: 'test:synthetic-dataset',
            source_uri: null,
            source_status: 'COMPLETE',
            partial_update: false,
            license_id: 'MIT'
        },
        primary: primaryObject,
        catalog,
        options: {
            start_time: START,
            horizon_seconds: 10,
            coarse_step_seconds: 10,
            screening_radius_km: 2,
            refinement_tolerance_seconds: 0.001,
            max_refinement_iterations: 64,
            max_relative_acceleration_km_s2: 0,
            yield_every_operations: 1000,
            max_results: 500,
            ...optionOverrides
        }
    };
}

function deterministicRuntime(overrides = {}) {
    return {
        propagationService,
        now: () => new Date(START),
        yieldControl: async () => {},
        ...overrides
    };
}

const linearSecondary = relativeObject('200', 'LINEAR', seconds => ({
    position_km: { x: -10 + 2 * seconds, y: 1, z: 0 },
    velocity_km_s: { x: 2, y: 0, z: 0 }
}));
const progressUpdates = [];
const linearResult = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [primary, linearSecondary]),
    deterministicRuntime({ onProgress: progress => progressUpdates.push(progress) })
);
assert.strictEqual(validateScreeningResult(linearResult).valid, true);
assert.strictEqual(linearResult.status, 'COMPLETED');
assert.strictEqual(linearResult.events.length, 1);
assert.strictEqual(linearResult.statistics.self_pairs_skipped, 1);
assert.strictEqual(linearResult.statistics.candidates_examined, 1);
assert.strictEqual(progressUpdates[0].stage, 'PROPAGATING_PRIMARY');
assert.strictEqual(progressUpdates.at(-1).stage, 'COMPLETE');

const linearEvent = linearResult.events[0];
assert.strictEqual(validateConjunctionEvent(linearEvent).valid, true);
assert(Math.abs(Date.parse(linearEvent.tca) - (START_MS + 5000)) <= 1);
assert(Math.abs(linearEvent.miss_distance_km - 1) < 1e-9);
assert(Math.abs(linearEvent.relative_speed_km_s - 2) < 1e-9);
assert.strictEqual(linearEvent.primary_name, 'PRIMARY');
assert.strictEqual(linearEvent.secondary_name, 'LINEAR');
assert.strictEqual(linearEvent.primary_state.timestamp, linearEvent.tca);
assert.strictEqual(linearEvent.secondary_state.timestamp, linearEvent.tca);
assert.strictEqual(linearEvent.primary_state.frame, 'TEME');
assert.strictEqual(linearEvent.analysis.refinement_converged, true);
assert.strictEqual('tca_utc' in linearEvent, false);
assert.deepStrictEqual(
    linearResult.provenance.input_element_set_ids,
    ['elset:synthetic:100', 'elset:synthetic:200']
);

const stalePrimary = syntheticObject('101', 'STALE PRIMARY', () => ({
    position_km: BASE_POSITION,
    velocity_km_s: { x: 0, y: 0, z: 0 }
}), { quality_flags: ['TLE_STALE'] });
const degradedSecondary = relativeObject('202', 'DEGRADED SECONDARY', seconds => ({
    position_km: { x: -10 + 2 * seconds, y: 1, z: 0 },
    velocity_km_s: { x: 2, y: 0, z: 0 }
}), { quality_flags: ['SOURCE_DATA_DEGRADED'] });
const degradedResult = await screenSelectedObjectAgainstCatalog(
    screeningRequest(stalePrimary, [degradedSecondary], {}, 'screen:degraded-input'),
    deterministicRuntime()
);
assert.strictEqual(degradedResult.events.length, 1);
assert(degradedResult.events[0].quality_flags.includes('PRIMARY_TLE_STALE'));
assert(degradedResult.events[0].quality_flags.includes('SECONDARY_SOURCE_DATA_DEGRADED'));
assert(degradedResult.events[0].primary_state.quality_flags.includes('TLE_STALE'));
assert(degradedResult.events[0].secondary_state.quality_flags.includes('SOURCE_DATA_DEGRADED'));
assert(degradedResult.quality_flags.includes('STALE_INPUTS_SCREENED'));
assert(degradedResult.quality_flags.includes('DEGRADED_INPUTS_SCREENED'));

const boundarySecondary = relativeObject('203', 'WINDOW-BOUNDARY', seconds => ({
    position_km: { x: seconds, y: 0.5, z: 0 },
    velocity_km_s: { x: 1, y: 0, z: 0 }
}));
const boundaryResult = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [boundarySecondary], { screening_radius_km: 1 }, 'screen:boundary'),
    deterministicRuntime()
);
assert.strictEqual(boundaryResult.events.length, 1);
assert.strictEqual(boundaryResult.events[0].tca, START);
assert.strictEqual(boundaryResult.events[0].analysis.boundary_event, true);

// A sustained in-radius, monotonically decreasing pass spans three coarse
// intervals but has only one minimum at the screening-window boundary.
const monotonicSecondary = relativeObject('207', 'MULTI-INTERVAL MONOTONIC', seconds => ({
    position_km: { x: -30 + seconds, y: 0.25, z: 0 },
    velocity_km_s: { x: 1, y: 0, z: 0 }
}));
const monotonicResult = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [monotonicSecondary], {
        horizon_seconds: 30,
        coarse_step_seconds: 10,
        screening_radius_km: 100
    }, 'screen:multi-interval-monotonic'),
    deterministicRuntime()
);
assert.strictEqual(monotonicResult.events.length, 1);
assert.strictEqual(monotonicResult.events[0].tca, '2026-07-19T00:00:30.000Z');
assert.strictEqual(monotonicResult.events[0].analysis.boundary_event, true);

const nonConvergedResult = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [linearSecondary], {
        max_refinement_iterations: 1
    }, 'screen:non-converged'),
    deterministicRuntime()
);
assert.strictEqual(nonConvergedResult.events.length, 1);
assert.strictEqual(nonConvergedResult.events[0].analysis.refinement_converged, false);
assert(nonConvergedResult.events[0].quality_flags.includes('REFINEMENT_NOT_CONVERGED'));
assert(nonConvergedResult.quality_flags.includes('REFINEMENT_NOT_CONVERGED'));

const slowSecondary = relativeObject('204', 'SLOW-ENCOUNTER', seconds => ({
    position_km: { x: -0.005 + 0.001 * seconds, y: 0.1, z: 0 },
    velocity_km_s: { x: 0.001, y: 0, z: 0 }
}));
const slowResult = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [slowSecondary], { screening_radius_km: 0.2 }, 'screen:slow'),
    deterministicRuntime()
);
assert.strictEqual(slowResult.events.length, 1);
assert(Math.abs(slowResult.events[0].relative_speed_km_s - 0.001) < 1e-12);

const colocatedSecondary = relativeObject('206', 'COLOCATED TEST GEOMETRY', () => ({
    position_km: { x: 0, y: 0, z: 0 },
    velocity_km_s: { x: 0, y: 0, z: 0 }
}));
const colocatedResult = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [colocatedSecondary], {
        horizon_seconds: 30,
        coarse_step_seconds: 10,
        screening_radius_km: 1
    }, 'screen:colocated'),
    deterministicRuntime()
);
assert.strictEqual(colocatedResult.events.length, 1);
assert.strictEqual(colocatedResult.events[0].miss_distance_km, 0);
assert.strictEqual(colocatedResult.events[0].relative_speed_km_s, 0);
assert(colocatedResult.events[0].quality_flags.includes('COLOCATED_OR_COMMON_TLE_GEOMETRY'));
assert(colocatedResult.quality_flags.includes('COLOCATED_OR_COMMON_TLE_GEOMETRY_PRESENT'));

const futureEpochSecondary = relativeObject('208', 'FUTURE EPOCH', seconds => ({
    position_km: { x: -10 + 2 * seconds, y: 1, z: 0 },
    velocity_km_s: { x: 2, y: 0, z: 0 }
}), { element_epoch_utc: '2026-07-20T00:00:00.000Z' });
const futureEpochResult = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [futureEpochSecondary], {}, 'screen:future-epoch'),
    deterministicRuntime()
);
assert.strictEqual(futureEpochResult.events.length, 1);
assert(futureEpochResult.events[0].secondary_element_set.age_days < 0);
assert(futureEpochResult.events[0].quality_flags.includes('SECONDARY_TLE_EPOCH_AFTER_TCA'));
assert(futureEpochResult.quality_flags.includes('FUTURE_EPOCH_INPUTS_AT_SCREEN_TIME'));

const staleAtScreenTimeResult = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [colocatedSecondary], {
        start_time: '2026-08-19T00:00:00.000Z',
        horizon_seconds: 10,
        screening_radius_km: 1
    }, 'screen:stale-at-screen-time'),
    deterministicRuntime()
);
assert.strictEqual(staleAtScreenTimeResult.events.length, 1);
assert(staleAtScreenTimeResult.events[0].quality_flags.includes('PRIMARY_TLE_STALE_AT_TCA'));
assert(staleAtScreenTimeResult.quality_flags.includes('STALE_INPUTS_AT_SCREEN_TIME'));

const duplicateTrajectory = seconds => ({
    position_km: { x: -10 + 2 * seconds, y: 1, z: 0 },
    velocity_km_s: { x: 2, y: 0, z: 0 }
});
const olderDuplicate = relativeObject('205', 'OLDER ELEMENT SET', duplicateTrajectory, {
    element_epoch_utc: '2026-07-18T00:00:00.000Z',
    element_set_id: 'elset:synthetic:205:old',
    quality_flags: ['TLE_STALE']
});
const currentDuplicate = relativeObject('205', 'CURRENT ELEMENT SET', duplicateTrajectory, {
    element_epoch_utc: START,
    element_set_id: 'elset:synthetic:205:current'
});
const duplicateForward = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [olderDuplicate, currentDuplicate], {}, 'screen:duplicate'),
    deterministicRuntime()
);
const duplicateReverse = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [currentDuplicate, olderDuplicate], {}, 'screen:duplicate'),
    deterministicRuntime()
);
for (const duplicateResult of [duplicateForward, duplicateReverse]) {
    assert.strictEqual(duplicateResult.events.length, 1);
    assert.strictEqual(duplicateResult.statistics.candidates_examined, 1);
    assert.strictEqual(duplicateResult.events[0].secondary_name, 'CURRENT ELEMENT SET');
    assert.strictEqual(
        duplicateResult.events[0].secondary_element_set.element_set_id,
        'elset:synthetic:205:current'
    );
    assert(duplicateResult.quality_flags.includes('DUPLICATE_CATALOG_OBJECTS_SKIPPED'));
}
assert.strictEqual(duplicateForward.events[0].event_id, duplicateReverse.events[0].event_id);

// The endpoint chord misses the report radius, but the acceleration-bound margin
// conservatively admits the interval containing the curved interior pass.
const curvedSecondary = relativeObject('201', 'CURVED', seconds => ({
    position_km: {
        x: seconds - 5,
        y: 1 + 0.16 * ((seconds - 5) ** 2),
        z: 0
    },
    velocity_km_s: { x: 1, y: 0.32 * (seconds - 5), z: 0 }
}));
const curvedResult = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [curvedSecondary], { max_relative_acceleration_km_s2: 0.32 }, 'screen:curved'),
    deterministicRuntime()
);
assert.strictEqual(curvedResult.events.length, 1);
assert(Math.abs(curvedResult.events[0].miss_distance_km - 1) < 1e-7);
assert(Math.abs(curvedResult.events[0].analysis.coarse_miss_distance_km - 5) < 1e-9);
assert(Math.abs(curvedResult.events[0].analysis.broad_phase_margin_km - 4) < 1e-9);
assert.strictEqual(curvatureSafetyMarginKm(10, 0.32), 4);

const unsafeZeroMarginResult = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [curvedSecondary], { max_relative_acceleration_km_s2: 0 }, 'screen:no-margin'),
    deterministicRuntime()
);
assert.strictEqual(unsafeZeroMarginResult.events.length, 0);
assert.strictEqual(unsafeZeroMarginResult.statistics.coarse_candidates, 0);

// Compare threshold inclusion with a dense deterministic oracle.
const thresholdModels = [
    { id: '210', miss: 0.5 },
    { id: '211', miss: 2 },
    { id: '212', miss: 2.001 }
];
const thresholdObjects = thresholdModels.map(model => relativeObject(model.id, `THRESHOLD-${model.id}`, seconds => ({
    position_km: { x: -10 + 2 * seconds, y: model.miss, z: 0 },
    velocity_km_s: { x: 2, y: 0, z: 0 }
})));
const denseOracleIds = thresholdModels.filter(model => {
    let minimum = Number.POSITIVE_INFINITY;
    for (let index = 0; index <= 10_000; index += 1) {
        const seconds = index / 1000;
        minimum = Math.min(minimum, Math.hypot(-10 + 2 * seconds, model.miss));
    }
    return minimum <= 2;
}).map(model => `obx:norad:${model.id}`).sort();
const thresholdResult = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, thresholdObjects, {}, 'screen:threshold'),
    deterministicRuntime()
);
assert.deepStrictEqual(
    thresholdResult.events.map(event => event.secondary_object_id).sort(),
    denseOracleIds
);
assert(thresholdResult.events.some(event => Math.abs(event.miss_distance_km - 2) < 1e-9));

const cappedForward = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, thresholdObjects, { max_results: 1 }, 'screen:capped'),
    deterministicRuntime()
);
const cappedReverse = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [...thresholdObjects].reverse(), { max_results: 1 }, 'screen:capped'),
    deterministicRuntime()
);
assert.strictEqual(cappedForward.statistics.events_detected, 2);
assert.strictEqual(cappedForward.statistics.events_reported, 1);
assert.strictEqual(cappedForward.statistics.events_truncated, 1);
assert(cappedForward.quality_flags.includes('RESULT_LIMIT_APPLIED'));
assert.strictEqual(cappedForward.events[0].event_id, cappedReverse.events[0].event_id);
await assert.rejects(
    screenSelectedObjectAgainstCatalog(
        screeningRequest(primary, thresholdObjects, { max_results: 1.5 }, 'screen:bad-limit'),
        deterministicRuntime()
    ),
    error => error?.code === 'INVALID_SCREENING_CONFIGURATION'
);
await assert.rejects(
    screenSelectedObjectAgainstCatalog({
        ...screeningRequest(primary, [linearSecondary], {}, 'screen:bad-dataset'),
        dataset_hash: 'test:different-dataset'
    }, deterministicRuntime()),
    error => error?.code === 'DATASET_PROVENANCE_MISMATCH'
);
await assert.rejects(
    screenSelectedObjectAgainstCatalog(
        screeningRequest(primary, Array(10).fill(linearSecondary), {
            horizon_seconds: 24 * 60 * 60,
            coarse_step_seconds: 1
        }, 'screen:resource-limit'),
        deterministicRuntime()
    ),
    error => error?.code === 'SCREENING_RESOURCE_LIMIT_EXCEEDED'
);

// Swapping primary/secondary preserves the canonical pair and event identity.
const forwardPair = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [linearSecondary], {}, 'screen:pair-order'),
    deterministicRuntime()
);
const reversePair = await screenSelectedObjectAgainstCatalog(
    screeningRequest(linearSecondary, [primary], {}, 'screen:pair-order'),
    deterministicRuntime()
);
assert.strictEqual(forwardPair.events[0].pair_key, reversePair.events[0].pair_key);
assert.strictEqual(forwardPair.events[0].event_id, reversePair.events[0].event_id);
assert.deepStrictEqual(
    forwardPair.events[0].relative_position_km,
    negate(reversePair.events[0].relative_position_km)
);
assert.deepStrictEqual(
    forwardPair.events[0].relative_velocity_km_s,
    negate(reversePair.events[0].relative_velocity_km_s)
);

// Distinct minima inside one coarse bracket must both be discovered and must
// survive deduplication even when their TCAs are close together.
const doubleMinimum = relativeObject('220', 'DOUBLE-MINIMUM', seconds => ({
    position_km: { x: (seconds - 9) * (seconds - 11), y: 0, z: 0 },
    velocity_km_s: { x: 2 * seconds - 20, y: 0, z: 0 }
}));
const doubleMinimumResult = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [doubleMinimum], {
        horizon_seconds: 20,
        coarse_step_seconds: 20,
        screening_radius_km: 0.01,
        max_relative_acceleration_km_s2: 2,
        refinement_subdivisions: 16
    }, 'screen:double-minimum'),
    deterministicRuntime()
);
assert.strictEqual(doubleMinimumResult.events.length, 2);
assert(Math.abs(Date.parse(doubleMinimumResult.events[0].tca) - (START_MS + 9000)) <= 2);
assert(Math.abs(Date.parse(doubleMinimumResult.events[1].tca) - (START_MS + 11000)) <= 2);

const failingSecondary = relativeObject('230', 'FAILING', seconds => ({
    position_km: { x: seconds, y: 0, z: 0 },
    velocity_km_s: { x: 1, y: 0, z: 0 }
}), { failAt: seconds => seconds === 10 });
const partialResult = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [failingSecondary], {}, 'screen:partial'),
    deterministicRuntime()
);
assert.strictEqual(partialResult.status, 'PARTIAL');
assert.strictEqual(partialResult.events.length, 0);
assert.strictEqual(partialResult.statistics.propagation_failures, 1);
assert(partialResult.quality_flags.includes('INCOMPLETE_PROPAGATION_COVERAGE'));

const interiorFailure = relativeObject('231', 'REFINEMENT FAILURE', seconds => ({
    position_km: { x: -10 + 2 * seconds, y: 1, z: 0 },
    velocity_km_s: { x: 2, y: 0, z: 0 }
}), { failAt: seconds => seconds === 5 });
const incompleteRefinementResult = await screenSelectedObjectAgainstCatalog(
    screeningRequest(primary, [interiorFailure], {}, 'screen:incomplete-refinement'),
    deterministicRuntime()
);
assert.strictEqual(incompleteRefinementResult.status, 'PARTIAL');
assert.strictEqual(incompleteRefinementResult.events.length, 0);
assert(incompleteRefinementResult.quality_flags.includes('INCOMPLETE_PROPAGATION_COVERAGE'));
assert(incompleteRefinementResult.quality_flags.includes('INCOMPLETE_REFINEMENT_COVERAGE'));

let cancellationRequested = false;
await assert.rejects(
    screenSelectedObjectAgainstCatalog(
        screeningRequest(primary, [linearSecondary], { yield_every_operations: 1 }, 'screen:cancel'),
        deterministicRuntime({
            yieldControl: async () => { cancellationRequested = true; },
            isCancelled: () => cancellationRequested
        })
    ),
    error => error instanceof ScreeningCancelledError && error.code === 'SCREENING_CANCELLED'
);

console.log('conjunctionScreening tests passed');
