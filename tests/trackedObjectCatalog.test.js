import assert from 'node:assert/strict';
import {
  TRACKED_OBJECT_VISUALS,
  TRACKED_OBJECT_TYPE,
  TRACKED_POSITION_FILTER,
  TRACKED_RCS_FILTER,
  buildTrackedFacetOptions,
  buildTrackedCatalogCounts,
  createTrackedObjectCatalogLoader,
  isHistoricalTrackedRecord,
  isTrackedCatalogMember,
  isTrackedRecordPropagatable,
  mergeTrackedCatalogRecords,
  normalizeTrackedFacets,
  normalizeTrackedObjectTypeSelection,
  restoreOrbitalRecordsAfterTrackedOverlay,
  toggleTrackedObjectTypeSelection,
  trackedObjectMatchesFilters,
  trackedObjectMatchesFacets,
  trackedObjectRcsBand,
  trackedObjectVisual,
  trackedObjectType
} from '../js/trackedObjectCatalog.js';

const payload = {
  norad_id: '25544',
  satellite_name: 'ISS (ZARYA)',
  object_type: 'PAY',
  orbit_class: 'LEO',
  lifecycle_status: 'ACTIVE',
  rcs_m2: 399.5,
  has_current_elements: true,
  propagation_status: 'CURRENT_ELEMENTS'
};
const smallDebris = {
  norad_id: 'A1234',
  satellite_name: 'TRACKED FRAGMENT',
  object_type: 'DEB',
  orbit_class: 'LEO',
  lifecycle_status: 'ACTIVE',
  international_designator: '1999-025ABC',
  launch_date: '1999-05-10',
  launch_site: 'AFETR',
  owner_code: 'US',
  ops_status_code: '+',
  rcs_m2: 0.0001,
  has_current_elements: false,
  propagation_status: 'NO_CURRENT_ELEMENTS',
  unavailable_reason: 'Provider has no current GP element set.'
};
const missingRcsDebris = {
  norad_id: '600001',
  satellite_name: 'TRACKED OBJECT',
  object_type: 'DEBRIS',
  orbit_class: 'GEO',
  lifecycle_status: 'ACTIVE',
  rcs_m2: null,
  has_current_elements: false
};
const rocketBody = {
  norad_id: '40000',
  satellite_name: 'UPPER STAGE',
  object_type: 'R/B',
  orbit_class: 'LEO',
  lifecycle_status: 'ACTIVE',
  has_current_elements: false
};
const meoDebris = {
  ...smallDebris,
  norad_id: '610001',
  orbit_class: 'MEO'
};
const decayed = {
  norad_id: '123',
  satellite_name: 'HISTORICAL DEBRIS',
  object_type: 'DEBRIS',
  orbit_class: 'UNKNOWN',
  lifecycle_status: 'DECAYED',
  decay_date: '1961-01-01',
  has_current_elements: false
};

assert.equal(trackedObjectType(smallDebris), TRACKED_OBJECT_TYPE.DEBRIS);
assert.equal(trackedObjectType(rocketBody), TRACKED_OBJECT_TYPE.ROCKET_BODY, 'rocket bodies remain separate from debris');
assert.equal(
  trackedObjectType({ object_type: 'TBA', satellite_name: 'UNVERIFIED DEB FRAGMENT' }),
  TRACKED_OBJECT_TYPE.UNKNOWN,
  'an unrecognized declared type remains unknown instead of borrowing a debris classification from its name'
);
assert.equal(
  trackedObjectVisual({ object_type: 'TBA', satellite_name: 'UNVERIFIED DEB FRAGMENT' }),
  TRACKED_OBJECT_VISUALS.UNKNOWN,
  'red is reserved for an authoritative debris classification'
);
assert.equal(
  trackedObjectVisual({ object_type: ' ', satellite_name: 'LEGACY DEBRIS FRAGMENT' }),
  TRACKED_OBJECT_VISUALS.UNKNOWN,
  'a name alone cannot assign the authoritative debris color'
);
assert.deepEqual(normalizeTrackedObjectTypeSelection('ALL'), ['ALL']);
assert.deepEqual(
  toggleTrackedObjectTypeSelection(['DEBRIS'], 'ROCKET_BODY'),
  ['DEBRIS', 'ROCKET_BODY'],
  'object types form a union within their independent dimension'
);

assert.equal(trackedObjectMatchesFilters(smallDebris, {
  orbitSelection: ['LEO'],
  objectTypeSelection: ['DEBRIS']
}), true, 'orbit and object-type dimensions intersect');
assert.equal(trackedObjectMatchesFilters(meoDebris, {
  orbitSelection: ['MEO'],
  objectTypeSelection: ['DEBRIS']
}), true, 'MEO debris remains MEO in the orbit dimension and debris in the object-type dimension');
assert.equal(trackedObjectMatchesFilters(meoDebris, {
  orbitSelection: ['GEO'],
  objectTypeSelection: ['DEBRIS']
}), false, 'selecting MEO cannot leak GEO membership through object taxonomy');
assert.equal(trackedObjectMatchesFilters(missingRcsDebris, {
  orbitSelection: ['ALL'],
  objectTypeSelection: ['DEBRIS']
}), true, 'Debris includes tracked debris across orbit classes regardless of missing RCS');
assert.equal(trackedObjectMatchesFilters(rocketBody, {
  orbitSelection: ['ALL'],
  objectTypeSelection: ['DEBRIS']
}), false, 'Debris does not silently absorb separately classified rocket bodies');
assert.equal(trackedObjectMatchesFilters(decayed, {
  orbitSelection: ['ALL'],
  objectTypeSelection: ['ALL']
}), false, 'historical objects are excluded by default');
assert.equal(trackedObjectMatchesFilters(decayed, {
  orbitSelection: ['ALL'],
  objectTypeSelection: ['ALL'],
  includeHistorical: true
}), true, 'historical objects are available through an explicit lifecycle control');
assert.equal(isHistoricalTrackedRecord(decayed), true);
assert.equal(isTrackedRecordPropagatable(smallDebris), false, 'metadata-only records never become renderable');
assert.equal(trackedObjectVisual(smallDebris), TRACKED_OBJECT_VISUALS.DEBRIS);
assert.equal(trackedObjectVisual(smallDebris, { selected: true }), TRACKED_OBJECT_VISUALS.SELECTED);
assert.equal(trackedObjectVisual({ ...smallDebris, isSelected: true }), TRACKED_OBJECT_VISUALS.DEBRIS,
  'the cacheable base visual is type-only; renderers apply selected styling separately');
assert.equal(trackedObjectVisual(smallDebris).color, '#ff3b30', 'debris has one canonical red presentation color');
assert.equal(trackedObjectRcsBand(smallDebris), TRACKED_RCS_FILTER.LT_0_01);
assert.equal(trackedObjectRcsBand(missingRcsDebris), TRACKED_RCS_FILTER.UNKNOWN);
for (const [rcs_m2, expected] of [
  [0, TRACKED_RCS_FILTER.LT_0_01],
  [0.01, TRACKED_RCS_FILTER.FROM_0_01_TO_0_1],
  [0.1, TRACKED_RCS_FILTER.FROM_0_1_TO_1],
  [1, TRACKED_RCS_FILTER.GTE_1],
  ['  ', TRACKED_RCS_FILTER.UNKNOWN],
  [Number.NaN, TRACKED_RCS_FILTER.UNKNOWN],
  [Number.POSITIVE_INFINITY, TRACKED_RCS_FILTER.UNKNOWN],
  [-0.01, TRACKED_RCS_FILTER.UNKNOWN]
]) {
  assert.equal(trackedObjectRcsBand({ rcs_m2 }), expected, `RCS ${String(rcs_m2)} uses the documented half-open band`);
}

const positionedDebris = {
  ...smallDebris,
  norad_id: 'A1236',
  rcs_m2: 0.05,
  has_current_elements: true,
  metadata_only: false,
  propagation_status: 'CURRENT_ELEMENTS'
};
assert.equal(trackedObjectMatchesFacets(positionedDebris, {
  position: [TRACKED_POSITION_FILTER.POSITIONED],
  rcs: [TRACKED_RCS_FILTER.FROM_0_01_TO_0_1],
  owner: ['us'],
  launchSite: ['afetr'],
  status: ['+'],
  launchYearFrom: 1998,
  launchYearTo: 2000,
  designator: '1999-025'
}), true, 'authoritative debris facets intersect without treating RCS as size or mass');
assert.equal(trackedObjectMatchesFacets(positionedDebris, {
  position: [TRACKED_POSITION_FILTER.METADATA_ONLY]
}), false);
assert.equal(trackedObjectMatchesFacets({ ...positionedDebris, object_id: 'obx:norad:A1236', international_designator: null }, {
  designator: 'OBX:NORAD'
}), false, 'internal object identifiers cannot satisfy the international-designator facet');
assert.deepEqual(normalizeTrackedFacets({ launchYearFrom: 2020, launchYearTo: 1990 }), {
  position: ['ALL'],
  rcs: ['ALL'],
  owner: [],
  launchSite: [],
  status: [],
  launchYearFrom: 1990,
  launchYearTo: 2020,
  designator: ''
});
const facetOptions = buildTrackedFacetOptions([smallDebris, positionedDebris, missingRcsDebris], {});
assert.equal(facetOptions.launchYear.find(entry => entry.value === 1999)?.count, 2,
  'numeric launch years are counted and sorted without a string-only comparator');
assert.equal(facetOptions.position.find(entry => entry.value === 'POSITIONED')?.count, 1);
assert.equal(facetOptions.position.find(entry => entry.value === 'METADATA_ONLY')?.count, 2);
assert.equal(facetOptions.rcs.find(entry => entry.value === 'UNKNOWN')?.count, 1);
for (const key of ['owner', 'launchSite', 'status']) {
  assert.equal(facetOptions[key].reduce((sum, entry) => sum + entry.count, 0), 3,
    `${key} options account for records with missing categorical metadata`);
  assert.equal(facetOptions[key].find(entry => entry.value === 'UNKNOWN')?.count, 1,
    `${key} exposes missing metadata as an explicit UNKNOWN bucket`);
}
assert.deepEqual(buildTrackedFacetOptions([{
  ...smallDebris,
  ops_status_code: null,
  data_status_code: 'NEA'
}], {}).status, [{ value: 'UNKNOWN', count: 1 }],
  'the operational-status facet does not mix in the separate data-status vocabulary');

const orbital = {
  ...payload,
  source: 'CELESTRAK_GP',
  mesh: { visible: true },
  satrec: {},
  motionPositionReady: true,
  element_set: { format: 'OMM', omm: { NORAD_CAT_ID: '25544' } }
};
const merged = mergeTrackedCatalogRecords([orbital], [
  {
    ...payload,
    rcs_m2: 402,
    company: 'NASA',
    owner: 'US',
    owner_code: 'US',
    launch_site: 'AFETR',
    ops_status_code: '+',
    data_status_code: 'OK',
    source: 'CELESTRAK_SATCAT',
    observation_status: 'CHANGED',
    element_reference: { catalog: 'json/gp/GP.json', norad_id: '25544' }
  },
  smallDebris,
  missingRcsDebris,
  decayed
], { preserveOrbitalReferences: true });
assert.equal(merged.length, 4);
assert.equal(merged[0], orbital, 'orbital display records retain their scene identity');
assert.equal(orbital.rcs_m2, 402, 'authoritative tracked metadata enriches an orbital display record');
assert.equal(orbital.source, 'CELESTRAK_GP', 'tracked metadata does not overwrite orbital propagation provenance');
assert.equal(orbital.tracked_catalog_source, 'CELESTRAK_SATCAT');
assert.equal(orbital.observation_status, 'CHANGED');
assert.equal(orbital.owner_code, 'US');
assert.equal(orbital.launch_site, 'AFETR');
assert.equal(orbital.ops_status_code, '+');
assert.deepEqual(orbital.element_reference, { catalog: 'json/gp/GP.json', norad_id: '25544' });
assert.equal(orbital.metadata_only, false);
assert.equal(isTrackedCatalogMember(orbital), true, 'an exact GP/SATCAT join is counted as tracked');
assert.equal(orbital.tracked_catalog_suppressed, false);
assert.equal(isTrackedRecordPropagatable(orbital), true, 'an authoritative current-element join keeps the GP orbit');
assert.equal(merged.find(record => record.norad_id === 'A1234').metadata_only, true);
assert.equal(isTrackedCatalogMember(merged.find(record => record.norad_id === 'A1234')), true);

const [gpOnlyDebris] = mergeTrackedCatalogRecords([{
  ...positionedDebris,
  norad_id: '799999',
  mesh: { visible: true },
  satrec: {}
}], [], { preserveOrbitalReferences: true });
assert.equal(isTrackedCatalogMember(gpOnlyDebris), false,
  'a GP-only object remains renderable without entering SATCAT-scoped counts or facets');
assert.equal(isTrackedRecordPropagatable(gpOnlyDebris), true);

for (const rcsStatus of ['MISSING', 'INVALID']) {
  const staleRcsOrbital = {
    ...orbital,
    norad_id: `70000${rcsStatus === 'MISSING' ? '1' : '2'}`,
    rcs_m2: 1,
    rcs: 1,
    mesh: { visible: true },
    satrec: {}
  };
  const [clearedRcs] = mergeTrackedCatalogRecords([staleRcsOrbital], [{
    ...payload,
    norad_id: staleRcsOrbital.norad_id,
    rcs_m2: null,
    rcs_status: rcsStatus
  }], { preserveOrbitalReferences: true });
  assert.equal(clearedRcs.rcs_m2, null, `${rcsStatus} clears a stale numeric RCS value`);
  assert.equal(clearedRcs.rcs, null, `${rcsStatus} clears a stale legacy RCS value`);
  assert.equal(trackedObjectRcsBand(clearedRcs), TRACKED_RCS_FILTER.UNKNOWN);
}

const [clearedFacetMetadata] = mergeTrackedCatalogRecords([{
  ...orbital,
  norad_id: '700003',
  owner: 'STALE OWNER',
  owner_code: 'STALE',
  launch_site: 'STALE SITE',
  ops_status_code: '+',
  data_status_code: 'STALE'
}], [{
  ...payload,
  norad_id: '700003',
  owner: null,
  owner_code: null,
  launch_site: null,
  ops_status_code: null,
  data_status_code: null
}], { preserveOrbitalReferences: true });
for (const key of ['owner', 'owner_code', 'launch_site', 'ops_status_code', 'data_status_code']) {
  assert.equal(clearedFacetMetadata[key], null, `${key} does not retain stale metadata across reconciliation`);
}

const currentJoinOrbital = {
  ...orbital,
  norad_id: '25545',
  satellite_name: 'CURRENT GP JOIN',
  mesh: { visible: true },
  satrec: {}
};
const [currentJoin] = mergeTrackedCatalogRecords([currentJoinOrbital], [{
  ...payload,
  norad_id: '25545',
  satellite_name: 'CURRENT SATCAT METADATA',
  has_current_elements: false,
  metadata_only: true,
  propagation_status: 'NO_CURRENT_ELEMENTS',
  unavailable_reason: 'NOT_AVAILABLE_IN_CONFIGURED_GP_SNAPSHOT'
}], { preserveOrbitalReferences: true });
assert.equal(currentJoin, currentJoinOrbital);
assert.equal(currentJoin.mesh.visible, true, 'the scene reference is retained so the view can hide it coherently');
assert.equal(currentJoin.has_current_elements, false);
assert.equal(currentJoin.metadata_only, true);
assert.equal(currentJoin.propagation_status, 'NO_CURRENT_ELEMENTS');
assert.equal(currentJoin.unavailable_reason, 'NOT_AVAILABLE_IN_CONFIGURED_GP_SNAPSHOT');
assert.equal(currentJoin.tracked_catalog_suppressed, true);
assert.equal(
  isTrackedRecordPropagatable(currentJoin),
  false,
  'an authoritative current metadata-only record suppresses a stale same-NORAD GP orbit'
);

const staleHistoricalOrbital = {
  ...payload,
  norad_id: '123',
  satellite_name: 'STALE GP OBJECT',
  lifecycle_status: 'ACTIVE',
  source: 'CELESTRAK_GP',
  mesh: { visible: true },
  satrec: {},
  motionPositionReady: true,
  element_set: { format: 'OMM', omm: { NORAD_CAT_ID: '123' } }
};
const [suppressedHistorical] = mergeTrackedCatalogRecords([staleHistoricalOrbital], [decayed], {
  preserveOrbitalReferences: true
});
assert.equal(suppressedHistorical, staleHistoricalOrbital);
assert.equal(suppressedHistorical.mesh.visible, true, 'the scene reference is retained so the view can hide it coherently');
assert.equal(suppressedHistorical.metadata_only, true);
assert.equal(suppressedHistorical.tracked_catalog_suppressed, true);
assert.equal(isTrackedRecordPropagatable(suppressedHistorical), false, 'historical SATCAT state suppresses stale GP propagation');
const [reappearedCurrent] = mergeTrackedCatalogRecords([suppressedHistorical], [{
  ...payload,
  norad_id: '123',
  satellite_name: 'REAPPEARED CURRENT OBJECT',
  lifecycle_status: 'ACTIVE',
  decay_date: null,
  has_current_elements: true,
  metadata_only: false,
  propagation_status: 'CURRENT_ELEMENTS',
  element_reference: { catalog: 'json/gp/GP.json', norad_id: '123' }
}], { preserveOrbitalReferences: true });
assert.equal(reappearedCurrent, staleHistoricalOrbital);
assert.equal(reappearedCurrent.lifecycle_status, 'ACTIVE');
assert.equal(reappearedCurrent.decay_date, undefined,
  'a successive current overlay starts from the GP baseline instead of retaining historical decay data');
assert.equal(reappearedCurrent.tracked_catalog_suppressed, false);
assert.equal(isTrackedRecordPropagatable(reappearedCurrent), true,
  'a same-NORAD object that reappears with current elements renders again');
restoreOrbitalRecordsAfterTrackedOverlay([suppressedHistorical]);
assert.equal(suppressedHistorical.object_type, payload.object_type,
  'dropping a tracked overlay restores the original GP object type');
assert.equal(suppressedHistorical.lifecycle_status, 'ACTIVE',
  'dropping a tracked overlay restores the original GP lifecycle');
assert.equal(suppressedHistorical.metadata_only, undefined,
  'overlay-only availability fields are removed from the GP baseline');
assert.equal(suppressedHistorical.tracked_catalog_suppressed, undefined);
assert.equal(isTrackedRecordPropagatable(suppressedHistorical), true,
  'the restored GP record can render again after lineage failover');

const absentRecord = {
  ...smallDebris,
  norad_id: 'A1235',
  lifecycle_status: 'UNKNOWN',
  catalog_membership_status: 'ABSENT',
  observation_status: 'ABSENT'
};
assert.equal(isHistoricalTrackedRecord(absentRecord), true, 'ABSENT reconciliation records remain in history only');
const current = merged.filter(record => !isHistoricalTrackedRecord(record));
const counts = buildTrackedCatalogCounts(merged, current, { quarantineCount: 2 });
assert.deepEqual(counts, {
  total: 4,
  current_tracked: 3,
  historical_tracked: 1,
  filtered: 3,
  propagatable: 1,
  metadata_only: 2,
  render_ready: 1,
  quarantine: 2
});

function response(payload, ok = true, status = 200) {
  return { ok, status, json: async () => structuredClone(payload) };
}

const manifest = {
  schema_version: '2.3.0',
  counts: { total: 4, current: 3, history: 1 },
  chunks: [
    { id: 'payload-0', path: 'chunks/payload-0.json', object_type: 'PAYLOAD', count: 1 },
    { id: 'debris-0', path: 'chunks/debris-0.json', object_type: 'DEBRIS', count: 2 }
  ],
  history_chunks: [
    { id: 'history-debris-0', path: 'chunks/history-debris-0.json', object_type: 'DEBRIS', count: 1 }
  ]
};
const chunkPayloads = {
  'json/tracked/chunks/payload-0.json': {
    schema_version: '2.3.0', scope: 'CURRENT', object_type: 'PAYLOAD', records: [payload]
  },
  'json/tracked/chunks/debris-0.json': {
    schema_version: '2.3.0', scope: 'CURRENT', object_type: 'DEBRIS', records: [smallDebris, missingRcsDebris]
  },
  'json/tracked/chunks/history-debris-0.json': {
    schema_version: '2.3.0', scope: 'HISTORICAL', object_type: 'DEBRIS', records: [decayed]
  }
};
const requestedUrls = [];
const loader = createTrackedObjectCatalogLoader({
  fetchImpl: async url => {
    requestedUrls.push(url);
    if (url.endsWith('TRACKED.manifest.json')) return response(manifest);
    return response(chunkPayloads[url]);
  }
});
const manifestOnly = await loader.readManifest();
assert.equal(manifestOnly.counts.current, 3, 'manifest counts are available without loading catalog chunks');
assert.deepEqual(requestedUrls, ['json/tracked/TRACKED.manifest.json']);
let snapshot = await loader.load({ objectTypes: ['DEBRIS'] });
assert.equal(snapshot.state, 'ready', 'the requested debris scope is ready without fetching unrelated payload chunks');
assert.equal(snapshot.records.length, 2);
const debrisCoverage = loader.coverage();
assert.equal('records' in debrisCoverage, false, 'coverage checks do not clone or expose the loaded record array');
assert.deepEqual(debrisCoverage.loaded_chunk_ids, ['debris-0']);
assert(requestedUrls.includes('json/tracked/chunks/debris-0.json'));
assert(!requestedUrls.includes('json/tracked/chunks/payload-0.json'), 'a debris request does not fetch the payload chunk');
snapshot = await loader.loadAll();
assert.equal(snapshot.state, 'ready');
assert.equal(snapshot.records.length, 3);
assert(!requestedUrls.includes('json/tracked/chunks/history-debris-0.json'), 'normal ALL does not fetch decayed history');
snapshot = await loader.loadAll({ includeHistorical: true });
assert.equal(snapshot.records.length, 4, 'history chunks load only after explicit opt-in');
assert(requestedUrls.includes('json/tracked/chunks/history-debris-0.json'));
assert(snapshot.records.every(isTrackedCatalogMember), 'every validated chunk record carries tracked-catalog membership');
const clearedSnapshot = loader.clear();
assert.equal(clearedSnapshot.state, 'idle');
assert.equal(clearedSnapshot.manifest, null);
assert.equal(clearedSnapshot.records.length, 0, 'lineage reset removes the stale tracked overlay atomically');

let failReload = false;
const lkgLoader = createTrackedObjectCatalogLoader({
  fetchImpl: async url => {
    if (failReload) return response({}, false, 503);
    if (url.endsWith('TRACKED.manifest.json')) return response(manifest);
    return response(chunkPayloads[url]);
  }
});
await lkgLoader.loadAll();
failReload = true;
await assert.rejects(() => lkgLoader.reloadAll(), /failed/);
assert.equal(lkgLoader.snapshot().records.length, 3, 'failed transactional reload preserves the last known good snapshot');
assert.equal(lkgLoader.snapshot().state, 'stale');

let releaseDebris;
const debrisGate = new Promise(resolve => { releaseDebris = resolve; });
const raceRequestedUrls = [];
const raceLoader = createTrackedObjectCatalogLoader({
  fetchImpl: async url => {
    raceRequestedUrls.push(url);
    if (url.endsWith('TRACKED.manifest.json')) return response(manifest);
    if (url.includes('debris-0')) await debrisGate;
    return response(chunkPayloads[url]);
  }
});
const staleDebrisRequest = raceLoader.load({ objectTypes: ['DEBRIS'] });
const currentPayloadRequest = raceLoader.load({ objectTypes: ['PAYLOAD'] });
const payloadSnapshot = await currentPayloadRequest;
releaseDebris();
const debrisSnapshot = await staleDebrisRequest;
assert.equal(payloadSnapshot.records.length, 1);
assert.equal(payloadSnapshot.records[0].object_type, 'PAYLOAD');
assert.equal(debrisSnapshot.stale_request, true, 'an older async filter load is marked stale');
assert(!raceRequestedUrls.some(url => url.includes('debris-0')), 'a superseded request stops before fetching its chunk');
assert.deepEqual(
  raceLoader.snapshot().records.map(record => record.object_type),
  ['PAYLOAD'],
  'a late stale response cannot overwrite the current filter generation'
);

await assert.rejects(
  () => createTrackedObjectCatalogLoader({
    fetchImpl: async url => response(url.endsWith('TRACKED.manifest.json') ? {
      ...manifest,
      counts: { total: 1 },
      chunks: [{ id: 'external', path: 'https://example.test/chunk.json', object_type: 'DEBRIS', count: 1 }]
    } : {})
  }).loadAll(),
  /local relative path/,
  'manifest chunks cannot escape the packaged or same-server catalog boundary'
);

await assert.rejects(
  () => createTrackedObjectCatalogLoader({
    fetchImpl: async url => response(url.endsWith('TRACKED.manifest.json') ? {
      schema_version: '2.3.0',
      counts: { total: 1, current: 1, history: 0 },
      chunks: [{ id: 'wrong-type', path: 'chunks/wrong-type.json', object_type: 'DEBRIS', count: 1 }],
      history_chunks: []
    } : {
      schema_version: '2.3.0',
      scope: 'CURRENT',
      object_type: 'DEBRIS',
      records: [{ ...payload, object_type: 'PAYLOAD' }]
    })
  }).loadAll(),
  /record 0 object_type does not match its descriptor/,
  'a descriptor/content object-type mismatch rejects the whole chunk'
);

await assert.rejects(
  () => createTrackedObjectCatalogLoader({
    fetchImpl: async url => response(url.endsWith('TRACKED.manifest.json') ? {
      ...manifest,
      counts: { total: 1, current: 1, history: 0 },
      chunks: [{ id: 'encoded-traversal', path: 'chunks/%2e%2e/private.json', object_type: 'DEBRIS', count: 1 }],
      history_chunks: []
    } : {})
  }).loadAll(),
  /local relative path/,
  'percent-encoded paths cannot escape the local tracked-catalog boundary'
);

await assert.rejects(
  () => createTrackedObjectCatalogLoader({
    fetchImpl: async url => response(url.endsWith('TRACKED.manifest.json') ? {
      schema_version: '2.3.0',
      counts: { total: 1, current: 1, history: 0 },
      chunks: [{ id: 'wrong-scope', path: 'chunks/wrong-scope.json', object_type: 'DEBRIS', count: 1 }],
      history_chunks: []
    } : {
      schema_version: '2.3.0',
      object_type: 'DEBRIS',
      scope: 'CURRENT',
      records: [decayed]
    })
  }).loadAll(),
  /lifecycle does not match its current scope/,
  'a history record in a current chunk rejects the whole chunk'
);

console.log('tracked object catalog tests passed');
