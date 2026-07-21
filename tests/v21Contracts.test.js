import assert from 'node:assert/strict';
import { reconcileCatalogLifecycle } from '../js/domain/catalogLifecycle.js';
import {
    FULL_CATALOG_CONFIGURATION_VERSION,
    SCREENING_JOB_STATE,
    V21_CONTRACT_SCHEMAS,
    V21_SCHEMA_VERSION,
    assertScreeningJobTransition,
    isTerminalScreeningJobState,
    normalizeFullCatalogConfiguration,
    normalizeScreeningJobRequest,
    stableV21Json,
    v21Hash
} from '../js/domain/v21Contracts.js';

const START = '2026-07-20T00:00:00.000Z';

const configuration = normalizeFullCatalogConfiguration({ start_time: START });
assert.strictEqual(configuration.configuration_version, FULL_CATALOG_CONFIGURATION_VERSION);
assert.strictEqual(configuration.coarse_step_seconds, 60);
assert.strictEqual(configuration.end_time, '2026-07-20T01:00:00.000Z');
assert(Object.isFrozen(configuration));

const request = normalizeScreeningJobRequest({
    schema_version: V21_SCHEMA_VERSION,
    catalog_scope: { object_types: ['debris', 'payload'] },
    configuration: { start_time: START, horizon_seconds: 600, coarse_step_seconds: 30 }
});
assert.strictEqual(request.capability, 'FULL_CATALOG_SCREENING');
assert.deepStrictEqual(request.catalog_scope.object_types, ['DEBRIS', 'PAYLOAD']);
assert.strictEqual(request.maturity, 'Experimental');
assert.strictEqual(request.safety_class, 'non-operational');
assert.match(request.request_hash, /^fnv1a64:[0-9a-f]{16}$/);
assert.strictEqual(
    v21Hash({ b: 2, a: 1 }),
    v21Hash({ a: 1, b: 2 }),
    'request hashing must be independent of object property insertion order'
);
assert.strictEqual(stableV21Json({ b: 2, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":2}');

assert.throws(
    () => normalizeFullCatalogConfiguration({ start_time: START, horizon_seconds: 30 }),
    /horizon_seconds/
);
assert.throws(
    () => normalizeFullCatalogConfiguration({
        start_time: START,
        horizon_seconds: 21_600,
        coarse_step_seconds: 10
    }),
    /721 synchronized/
);
assert.throws(
    () => normalizeFullCatalogConfiguration({
        start_time: START,
        max_candidates: 10,
        max_persisted_candidates: 11
    }),
    /max_persisted_candidates/
);
assert.throws(
    () => normalizeScreeningJobRequest({
        schema_version: '2.2.0',
        configuration: { start_time: START }
    }),
    /schema_version/
);
assert.throws(
    () => normalizeScreeningJobRequest({
        catalog_scope: { object_types: ['ALIEN'] },
        configuration: { start_time: START }
    }),
    /unsupported values/
);

assert.strictEqual(
    assertScreeningJobTransition(SCREENING_JOB_STATE.QUEUED, SCREENING_JOB_STATE.RUNNING),
    SCREENING_JOB_STATE.RUNNING
);
assert.strictEqual(
    assertScreeningJobTransition(SCREENING_JOB_STATE.RUNNING, SCREENING_JOB_STATE.QUEUED),
    SCREENING_JOB_STATE.QUEUED,
    'restart recovery may requeue an interrupted running attempt'
);
assert.throws(
    () => assertScreeningJobTransition(SCREENING_JOB_STATE.SUCCEEDED, SCREENING_JOB_STATE.RUNNING),
    /cannot transition/
);
assert.strictEqual(isTerminalScreeningJobState('SUCCEEDED'), true);
assert.strictEqual(isTerminalScreeningJobState('RUNNING'), false);
assert.strictEqual(V21_CONTRACT_SCHEMAS.ScreeningJobRequest.properties.schema_version.const, '2.1.0');

function catalogObject(id, overrides = {}) {
    return {
        object_id: `obx:norad:${id}`,
        name: overrides.name ?? `OBJECT ${id}`,
        norad_id: id,
        international_designator: overrides.international_designator ?? `2026-${id}A`,
        object_type: overrides.object_type ?? 'PAYLOAD',
        orbit_class: overrides.orbit_class ?? 'LEO',
        lifecycle_status: overrides.lifecycle_status ?? 'ACTIVE',
        element_set: {
            element_set_id: overrides.element_set_id ?? `elset:tle:${id}:one`,
            epoch: overrides.epoch ?? START
        }
    };
}

const first = reconcileCatalogLifecycle({
    revision_id: 'catalog:one',
    observed_at: START,
    current: [catalogObject('100'), catalogObject('200', { name: 'SAME NAME' })]
});
assert.strictEqual(first.counts.NEW, 2);

const second = reconcileCatalogLifecycle({
    previous: first.observations,
    revision_id: 'catalog:two',
    observed_at: '2026-07-20T01:00:00.000Z',
    current: [
        catalogObject('100', { element_set_id: 'elset:tle:100:two' }),
        catalogObject('300', { name: 'SAME NAME' })
    ]
});
assert.strictEqual(second.counts.UPDATED, 1);
assert.strictEqual(second.counts.NEW, 1);
assert.strictEqual(second.counts.ABSENT, 1);
assert.strictEqual(
    second.observations.find(item => item.object_id === 'obx:norad:300').transition,
    'NEW',
    'similar names must never merge distinct identities'
);

const third = reconcileCatalogLifecycle({
    previous: second.observations,
    revision_id: 'catalog:three',
    observed_at: '2026-07-20T02:00:00.000Z',
    current: [
        catalogObject('100', { element_set_id: 'elset:tle:100:two' }),
        catalogObject('200', { name: 'SAME NAME' }),
        catalogObject('300', { lifecycle_status: 'DECAYED' })
    ]
});
assert.strictEqual(third.counts.UNCHANGED, 1);
assert.strictEqual(third.counts.REAPPEARED, 1);
assert.strictEqual(third.counts.DECAYED, 1);
assert.strictEqual(
    third.observations.find(item => item.object_id === 'obx:norad:200').first_seen_revision_id,
    'catalog:one'
);

console.log('v2.1 contract and catalog lifecycle tests passed');
