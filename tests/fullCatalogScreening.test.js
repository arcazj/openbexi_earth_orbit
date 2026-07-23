import assert from 'node:assert/strict';
import {
    normalizeStateVector,
    validateConjunctionEvent
} from '../js/domain/contracts.js';
import {
    canonicalPairKey
} from '../js/domain/objectIdentity.js';
import {
    ScreeningCancelledError,
    closestPointOnRelativeSegment,
    curvatureSafetyMarginKm
} from '../js/conjunction/conjunctionScreening.js';
import {
    FULL_CATALOG_CONFIGURATION_VERSION,
    FULL_CATALOG_SCREENING_ALGORITHM,
    FULL_CATALOG_SCREENING_VERSION,
    screenFullCatalog
} from '../js/conjunction/fullCatalogScreening.js';

const START = '2026-07-19T00:00:00.000Z';
const START_MS = Date.parse(START);
const DATASET_ID = 'dataset:full-catalog-synthetic';
const DATASET_HASH = 'test:full-catalog-synthetic';

function addScaled(base, velocity, seconds) {
    return {
        x: base.x + velocity.x * seconds,
        y: base.y + velocity.y * seconds,
        z: base.z + velocity.z * seconds
    };
}

function syntheticObject(id, name, stateAt, options = {}) {
    return {
        object_id: `obx:norad:${id}`,
        norad_id: String(id),
        name,
        stateAt,
        failAt: options.failAt ?? null,
        element_epoch_utc: START,
        element_set_id: `elset:synthetic:${id}`,
        quality_flags: [...(options.quality_flags ?? [])]
    };
}

function linearObject(id, position, velocity, options = {}) {
    return syntheticObject(id, `OBJECT-${id}`, seconds => ({
        position_km: addScaled(position, velocity, seconds),
        velocity_km_s: { ...velocity }
    }), options);
}

function syntheticPropagationService() {
    return {
        prepareObject(record) {
            return {
                ok: true,
                value: {
                    ...record,
                    object_name: record.name,
                    dataset_id: DATASET_ID,
                    dataset_hash: DATASET_HASH,
                    source_id: 'full-catalog-test',
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
                        dataset_id: DATASET_ID,
                        dataset_hash: DATASET_HASH,
                        generated_at: timestamp,
                        algorithm: {
                            name: 'analytic synthetic propagation',
                            version: '1.0.0',
                            configuration_hash: 'test:analytic-synthetic-propagation'
                        },
                        input_element_set_ids: [prepared.element_set_id]
                    },
                    quality_flags: ['SYNTHETIC_TEST_STATE']
                })
            };
        }
    };
}

function fullRequest(catalog, optionOverrides = {}, requestId = 'full-screen:test') {
    return {
        request_id: requestId,
        requested_at: START,
        start_time: START,
        time_scale: 'UTC',
        frame: 'TEME',
        dataset_id: DATASET_ID,
        dataset_hash: DATASET_HASH,
        dataset_provenance: {
            schema_version: '2.0.0',
            source_id: 'full-catalog-test',
            provider: 'OpenBEXI analytic test fixture',
            retrieved_at: START,
            dataset_id: DATASET_ID,
            dataset_hash: DATASET_HASH,
            source_uri: null,
            source_status: 'COMPLETE',
            partial_update: false,
            license_id: 'MIT'
        },
        catalog,
        options: {
            horizon_seconds: 20,
            coarse_step_seconds: 10,
            screening_radius_km: 1,
            refinement_tolerance_seconds: 0.001,
            refinement_subdivisions: 16,
            max_refinement_iterations: 64,
            max_relative_acceleration_km_s2: 0,
            coarse_padding_km: 0,
            yield_every_operations: 1_000,
            max_results: 1_000,
            spatial_cell_size_km: 10,
            max_cells_per_object: 512,
            max_cell_memberships_per_slab: 100_000,
            max_spatial_pair_checks_per_slab: 100_000,
            max_candidate_intervals: 100_000,
            max_detected_events: 10_000,
            ...optionOverrides
        }
    };
}

function deterministicRuntime(overrides = {}) {
    return {
        propagationService: syntheticPropagationService(),
        now: () => new Date(START),
        yieldControl: async () => {},
        ...overrides
    };
}

function relativeAt(first, second, seconds) {
    const firstState = first.stateAt(seconds);
    const secondState = second.stateAt(seconds);
    return {
        position_km: {
            x: secondState.position_km.x - firstState.position_km.x,
            y: secondState.position_km.y - firstState.position_km.y,
            z: secondState.position_km.z - firstState.position_km.z
        },
        velocity_km_s: {
            x: secondState.velocity_km_s.x - firstState.velocity_km_s.x,
            y: secondState.velocity_km_s.y - firstState.velocity_km_s.y,
            z: secondState.velocity_km_s.z - firstState.velocity_km_s.z
        }
    };
}

function bruteForceChordCandidates(catalog, configuration) {
    const expected = [];
    const slabCount = Math.ceil(configuration.horizon_seconds / configuration.coarse_step_seconds);
    for (let intervalIndex = 0; intervalIndex < slabCount; intervalIndex += 1) {
        const startSeconds = intervalIndex * configuration.coarse_step_seconds;
        const endSeconds = Math.min(configuration.horizon_seconds, (intervalIndex + 1) * configuration.coarse_step_seconds);
        const curvatureMargin = curvatureSafetyMarginKm(
            endSeconds - startSeconds,
            configuration.max_relative_acceleration_km_s2
        );
        const threshold = configuration.screening_radius_km + curvatureMargin + configuration.coarse_padding_km;
        for (let firstIndex = 0; firstIndex < catalog.length; firstIndex += 1) {
            for (let secondIndex = firstIndex + 1; secondIndex < catalog.length; secondIndex += 1) {
                const start = relativeAt(catalog[firstIndex], catalog[secondIndex], startSeconds).position_km;
                const end = relativeAt(catalog[firstIndex], catalog[secondIndex], endSeconds).position_km;
                const chord = closestPointOnRelativeSegment(start, end);
                if (chord.distance_km <= threshold + 1e-9) {
                    expected.push(`${intervalIndex}|${canonicalPairKey(
                        catalog[firstIndex].object_id,
                        catalog[secondIndex].object_id
                    )}`);
                }
            }
        }
    }
    return expected.sort();
}

function analyticLinearEventPairs(catalog, horizonSeconds, screeningRadiusKm) {
    const expected = [];
    for (let firstIndex = 0; firstIndex < catalog.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < catalog.length; secondIndex += 1) {
            const relative = relativeAt(catalog[firstIndex], catalog[secondIndex], 0);
            const position = relative.position_km;
            const velocity = relative.velocity_km_s;
            const speedSquared = velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2;
            const unconstrained = speedSquared === 0 ? 0 : -(
                position.x * velocity.x + position.y * velocity.y + position.z * velocity.z
            ) / speedSquared;
            const tca = Math.max(0, Math.min(horizonSeconds, unconstrained));
            const distance = Math.hypot(
                position.x + velocity.x * tca,
                position.y + velocity.y * tca,
                position.z + velocity.z * tca
            );
            if (distance <= screeningRadiusKm + 1e-9) {
                expected.push(canonicalPairKey(catalog[firstIndex].object_id, catalog[secondIndex].object_id));
            }
        }
    }
    return expected.sort();
}

const linearCatalog = [
    linearObject('100', { x: 7000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    linearObject('101', { x: 6990, y: 0.5, z: 0 }, { x: 1, y: 0, z: 0 }),
    linearObject('102', { x: 7010, y: -0.5, z: 0 }, { x: -1, y: 0, z: 0 }),
    linearObject('103', { x: 7000, y: 30, z: 0 }, { x: 0, y: 0, z: 0 }),
    linearObject('104', { x: 7030, y: 30, z: 30 }, { x: 0.2, y: 0, z: 0 }),
    linearObject('105', { x: 6960, y: -25, z: 15 }, { x: -0.1, y: 0.1, z: 0 })
];

const persistedPartitions = [];
const linearResult = await screenFullCatalog(
    fullRequest(linearCatalog),
    deterministicRuntime({ onCandidatePartition: partition => persistedPartitions.push(JSON.parse(JSON.stringify(partition))) })
);
assert.strictEqual(linearResult.status, 'COMPLETED');
assert.strictEqual(linearResult.configuration.configuration_version, FULL_CATALOG_CONFIGURATION_VERSION);
assert.strictEqual(linearResult.provenance.algorithm.name, FULL_CATALOG_SCREENING_ALGORITHM);
assert.strictEqual(linearResult.provenance.algorithm.version, FULL_CATALOG_SCREENING_VERSION);
assert.deepStrictEqual(
    linearResult.candidates.map(candidate => `${candidate.interval_index}|${candidate.pair_key}`).sort(),
    bruteForceChordCandidates(linearCatalog, linearResult.configuration),
    'spatial hashing must retain every pair admitted by brute-force chord screening'
);
assert.deepStrictEqual(
    [...new Set(linearResult.events.map(event => event.pair_key))].sort(),
    analyticLinearEventPairs(
        linearCatalog,
        linearResult.configuration.horizon_seconds,
        linearResult.configuration.screening_radius_km
    ),
    'full-catalog events must match closed-form linear closest approaches'
);
linearResult.events.forEach(event => assert.strictEqual(validateConjunctionEvent(event).valid, true));
assert.deepStrictEqual(persistedPartitions, JSON.parse(JSON.stringify(linearResult.candidate_partitions)));
assert.strictEqual(linearResult.candidates.length, linearResult.statistics.candidates_persisted);

const boundaryPairKey = canonicalPairKey('obx:norad:100', 'obx:norad:101');
const boundaryEvents = linearResult.events.filter(event => event.pair_key === boundaryPairKey);
assert.strictEqual(boundaryEvents.length, 1, 'a minimum on a shared slab boundary is emitted once');
assert.strictEqual(boundaryEvents[0].tca, '2026-07-19T00:00:10.000Z');
assert.strictEqual(
    linearResult.candidates.filter(candidate => candidate.pair_key === boundaryPairKey).length,
    2,
    'the candidate can persist in both adjacent slabs while event ownership remains unique'
);

const reversedResult = await screenFullCatalog(
    fullRequest([...linearCatalog].reverse()),
    deterministicRuntime()
);
assert.deepStrictEqual(reversedResult, linearResult, 'catalog input order must not change deterministic output');

const curvedPrimary = linearObject('200', { x: 7000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
const curvedSecondary = syntheticObject('201', 'CURVED-201', seconds => ({
    position_km: {
        x: 7000 + seconds - 5,
        y: 1 + 0.08 * ((seconds - 5) ** 2),
        z: 0
    },
    velocity_km_s: { x: 1, y: 0.16 * (seconds - 5), z: 0 }
}));
const curvedResult = await screenFullCatalog(
    fullRequest([curvedPrimary, curvedSecondary], {
        horizon_seconds: 10,
        coarse_step_seconds: 10,
        screening_radius_km: 1,
        max_relative_acceleration_km_s2: 0.32,
        spatial_cell_size_km: 2
    }, 'full-screen:curved'),
    deterministicRuntime()
);
assert.strictEqual(curvedResult.status, 'COMPLETED');
assert.strictEqual(curvedResult.candidates.length, 1);
assert.strictEqual(curvedResult.events.length, 1);
assert(Math.abs(curvedResult.events[0].miss_distance_km - 1) < 1e-7);
assert(Math.abs(curvedResult.candidates[0].broad_phase_margin_km - 4) < 1e-9);

const opposingCurvedCatalog = [
    syntheticObject('210', 'OPPOSING-CURVE-210', seconds => ({
        position_km: { x: 7000, y: -0.12 * ((seconds - 5) ** 2), z: 0 },
        velocity_km_s: { x: 0, y: -0.24 * (seconds - 5), z: 0 }
    })),
    syntheticObject('211', 'OPPOSING-CURVE-211', seconds => ({
        position_km: { x: 7000, y: 0.12 * ((seconds - 5) ** 2), z: 0 },
        velocity_km_s: { x: 0, y: 0.24 * (seconds - 5), z: 0 }
    }))
];
assert.strictEqual(
    Math.hypot(
        relativeAt(opposingCurvedCatalog[0], opposingCurvedCatalog[1], 5).position_km.x,
        relativeAt(opposingCurvedCatalog[0], opposingCurvedCatalog[1], 5).position_km.y,
        relativeAt(opposingCurvedCatalog[0], opposingCurvedCatalog[1], 5).position_km.z
    ),
    0,
    'the opposing curves intersect at the slab midpoint'
);
const opposingCurvedResult = await screenFullCatalog(
    fullRequest(opposingCurvedCatalog, {
        horizon_seconds: 10,
        coarse_step_seconds: 10,
        screening_radius_km: 1,
        max_relative_acceleration_km_s2: 0.32,
        spatial_cell_size_km: 2
    }, 'full-screen:opposing-curves'),
    deterministicRuntime()
);
assert.strictEqual(opposingCurvedResult.status, 'PARTIAL');
assert.strictEqual(opposingCurvedResult.statistics.motion_bound_violations, 2);
assert.strictEqual(opposingCurvedResult.statistics.pair_intervals_screened, 0);
assert.strictEqual(opposingCurvedResult.statistics.pair_intervals_unscreened, 1);
assert.strictEqual(opposingCurvedResult.candidates.length, 0);
assert.strictEqual(opposingCurvedResult.events.length, 0);
assert(opposingCurvedResult.quality_flags.includes('KINEMATIC_BOUND_VIOLATION'));
assert(opposingCurvedResult.quality_flags.includes('INCOMPLETE_PAIR_INTERVAL_COVERAGE'));

let cancelled = false;
await assert.rejects(
    screenFullCatalog(
        fullRequest(linearCatalog, { yield_every_operations: 1 }, 'full-screen:cancelled'),
        deterministicRuntime({
            isCancelled: () => cancelled,
            yieldControl: async () => { cancelled = true; }
        })
    ),
    error => error instanceof ScreeningCancelledError
);

const denseCatalog = Array.from({ length: 20 }, (_, index) => linearObject(
    String(300 + index),
    { x: 7000, y: 0, z: 0 },
    { x: index * 0.0001, y: 0, z: 0 }
));
const denseResult = await screenFullCatalog(
    fullRequest(denseCatalog, {
        horizon_seconds: 10,
        coarse_step_seconds: 10,
        spatial_cell_size_km: 100,
        max_spatial_pair_checks_per_slab: 10
    }, 'full-screen:dense-cap'),
    deterministicRuntime()
);
assert.strictEqual(denseResult.status, 'PARTIAL');
assert.strictEqual(denseResult.resource_limit_reason, 'MAX_SPATIAL_PAIR_CHECKS_PER_SLAB_EXCEEDED');
assert.strictEqual(denseResult.statistics.spatial_pair_checks, 10);
assert(denseResult.statistics.spatial_pair_checks < denseResult.statistics.catalog_pairs);
assert.strictEqual(denseResult.statistics.pair_intervals_screened, 0);
assert(denseResult.quality_flags.includes('INCOMPLETE_BROAD_PHASE_COVERAGE'));
assert(denseResult.quality_flags.includes('RESOURCE_LIMIT_APPLIED'));
assert.strictEqual(denseResult.candidate_partitions[0].status, 'PARTIAL');

const sparseCatalog = Array.from({ length: 100 }, (_, index) => linearObject(
    String(500 + index),
    { x: 7000 + index * 100, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 }
));
const sparseResult = await screenFullCatalog(
    fullRequest(sparseCatalog, {
        horizon_seconds: 10,
        coarse_step_seconds: 10,
        spatial_cell_size_km: 10
    }, 'full-screen:sparse'),
    deterministicRuntime()
);
assert.strictEqual(sparseResult.status, 'COMPLETED');
assert.strictEqual(sparseResult.statistics.catalog_pairs, 4_950);
assert.strictEqual(sparseResult.statistics.spatial_pair_checks, 0);
assert.strictEqual(sparseResult.candidates.length, 0);
assert.strictEqual(sparseResult.statistics.pair_intervals_screened, 4_950);

const failingObject = linearObject(
    '900',
    { x: 7000, y: 20, z: 0 },
    { x: 0, y: 0, z: 0 },
    { failAt: seconds => seconds === 10 }
);
const failureResult = await screenFullCatalog(
    fullRequest([linearCatalog[0], linearCatalog[1], failingObject], {
        horizon_seconds: 10,
        coarse_step_seconds: 10
    }, 'full-screen:propagation-partial'),
    deterministicRuntime()
);
assert.strictEqual(failureResult.status, 'PARTIAL');
assert(failureResult.statistics.pair_intervals_unscreened > 0);
assert(failureResult.quality_flags.includes('INCOMPLETE_PROPAGATION_COVERAGE'));
assert(failureResult.quality_flags.includes('INCOMPLETE_PAIR_INTERVAL_COVERAGE'));

console.log('fullCatalogScreening tests passed');
