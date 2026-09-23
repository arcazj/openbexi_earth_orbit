import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import crypto from 'node:crypto';
import path from 'node:path';

const EPOCH = '2026-08-23T00:00:00Z';
const LIGHTWEIGHT_DETAILED_MODEL_FIXTURE = path.resolve('obj/starlink_v2.glb');
const TRACKED_OBJECT_TYPES = Object.freeze([
  'PAYLOAD', 'DEBRIS', 'ROCKET_BODY', 'MISSION_RELATED', 'UNKNOWN'
]);

function boxesIntersect(left, right) {
  return left.x < right.x + right.width && left.x + left.width > right.x &&
    left.y < right.y + right.height && left.y + left.height > right.y;
}

function ommRecord({
  noradId,
  name,
  orbitClass,
  objectType = 'PAYLOAD',
  company,
  meanMotion,
  eccentricity = 0.001,
  inclination = 45,
  bstar = 0.00008,
  meanMotionDot = 0.00005
}) {
  const suffix = String(Number(noradId) - 110000).padStart(3, '0');
  const objectId = `2026-${suffix}A`;
  return {
    company,
    satellite_name: name,
    norad_id: String(noradId),
    object_id: objectId,
    international_designator: objectId,
    object_type: objectType,
    lifecycle_status: 'ACTIVE',
    orbit_class: orbitClass,
    type: orbitClass,
    inclination_deg: inclination,
    eccentricity,
    mean_motion: meanMotion,
    launch_date: '2026-08-20',
    source_format: 'CCSDS_OMM_JSON',
    tle_line1: null,
    tle_line2: null,
    element_set: {
      format: 'OMM',
      epoch: EPOCH,
      time_scale: 'UTC',
      native_frame: 'TEME',
      propagation_theory: 'SGP4',
      omm: {
        CCSDS_OMM_VERS: '2.0',
        OBJECT_NAME: name,
        OBJECT_ID: objectId,
        OBJECT_TYPE: objectType,
        CENTER_NAME: 'EARTH',
        REF_FRAME: 'TEME',
        TIME_SYSTEM: 'UTC',
        MEAN_ELEMENT_THEORY: 'SGP4',
        EPOCH,
        MEAN_MOTION: meanMotion,
        ECCENTRICITY: eccentricity,
        INCLINATION: inclination,
        RA_OF_ASC_NODE: 120.25,
        ARG_OF_PERICENTER: 80.5,
        MEAN_ANOMALY: 15.75,
        EPHEMERIS_TYPE: 0,
        NORAD_CAT_ID: String(noradId),
        ELEMENT_SET_NO: 1,
        REV_AT_EPOCH: 10,
        BSTAR: bstar,
        MEAN_MOTION_DOT: meanMotionDot,
        MEAN_MOTION_DDOT: 0
      }
    }
  };
}

function categoryCatalog() {
  return [
    ommRecord({
      noradId: '110001', name: 'DUPLICATE GP NAME', orbitClass: 'GEO', company: 'GEO OPS',
      meanMotion: 1.0027, eccentricity: 0.0001, inclination: 0.1
    }),
    ommRecord({
      noradId: '110002', name: 'DUPLICATE GP NAME', orbitClass: 'MEO', company: 'MEO OPS',
      meanMotion: 2.05, eccentricity: 0.01, inclination: 55
    }),
    ommRecord({
      noradId: '110003', name: 'ISS (ZARYA)', orbitClass: 'LEO', company: 'LEO OPS',
      meanMotion: 15.1, eccentricity: 0.0004, inclination: 53.1
    }),
    ommRecord({
      noradId: '110004', name: 'HEO FIXTURE', orbitClass: 'HEO', company: 'HEO OPS',
      meanMotion: 1, eccentricity: 0.95, inclination: 63.4, bstar: 0.01, meanMotionDot: 0.1
    }),
    ommRecord({
      noradId: '110005', name: 'NEUTRAL OBJECT', orbitClass: 'LEO', objectType: 'DEBRIS',
      company: 'DEBRIS OPS', meanMotion: 14.8, eccentricity: 0.01, inclination: 71
    }),
    ommRecord({
      noradId: '110006', name: 'UNKNOWN ORBIT FIXTURE', orbitClass: 'UNKNOWN', company: 'OTHER OPS',
      meanMotion: 3.2, eccentricity: 0.02, inclination: 32
    }),
    ommRecord({
      noradId: '110007', name: 'STARLINK RS-44 & BREEZE-KM R/B', orbitClass: 'LEO', objectType: 'PAYLOAD',
      company: 'LEO OPS', meanMotion: 14.9, eccentricity: 0.002, inclination: 82.5
    }),
    ommRecord({
      noradId: '110008', name: 'GPS BIIR-2', orbitClass: 'MEO', company: 'GEO',
      meanMotion: 2.0056, eccentricity: 0.01, inclination: 55
    }),
    ommRecord({
      noradId: '110009', name: 'GOES 19', orbitClass: 'GEO', company: 'NOAA',
      meanMotion: 1.0027, eccentricity: 0.0001, inclination: 0.1
    })
  ];
}

function gpMetadata(revision, count = 9) {
  return {
    catalog_revision: revision,
    fetched_at: EPOCH,
    last_success_at: EPOCH,
    last_status: 'ok',
    source_status: 'COMPLETE',
    partial_update: false,
    source_urls: ['https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'],
    counts: { records: count, rejected: 0 }
  };
}

function staticMetadata(revision, count = 0) {
  return {
    schema_version: '2.2.0',
    catalog_revision: revision,
    built_at: EPOCH,
    last_status: 'ok',
    counts: { records: count }
  };
}

function trackedObjectTypeCounts(records) {
  const counts = Object.fromEntries(TRACKED_OBJECT_TYPES.map(type => [type, 0]));
  for (const record of records) counts[record.object_type] += 1;
  return counts;
}

function canonicalizeTrackedFixture(state) {
  const aliases = {};
  const recordsFor = descriptor => {
    const currentFilename = String(descriptor.path || '').split('/').pop();
    const logicalFilename = `${descriptor.id}.json`;
    const payload = state.trackedChunks[logicalFilename] ?? state.trackedChunks[currentFilename];
    if (!payload || !Array.isArray(payload.records)) {
      throw new Error(`Missing tracked fixture payload for ${descriptor.id}`);
    }
    return { logicalFilename, payload };
  };
  const address = descriptor => {
    const { logicalFilename, payload } = recordsFor(descriptor);
    const body = JSON.stringify(payload);
    const digest = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
    const suffix = descriptor.id.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const filename = `${digest}-${suffix}.json`;
    aliases[filename] = logicalFilename;
    Object.assign(descriptor, {
      path: `json/tracked/chunks/${filename}`,
      count: payload.records.length,
      bytes: Buffer.byteLength(body, 'utf8'),
      sha256: `sha256:${digest}`
    });
    return payload.records;
  };

  const currentRecords = state.trackedManifest.chunks.flatMap(address);
  const historyRecords = state.trackedManifest.history_chunks.flatMap(address);
  const allRecords = [...currentRecords, ...historyRecords];
  const propagatable = allRecords.filter(record => record.has_current_elements === true).length;
  const currentPropagatable = currentRecords.filter(record => record.has_current_elements === true).length;
  const quarantinePayload = { schema_version: '2.3.0', records: [] };
  const quarantineBody = JSON.stringify(quarantinePayload);
  const quarantineDigest = crypto.createHash('sha256').update(quarantineBody, 'utf8').digest('hex');

  state.trackedManifest.counts = {
    total: allRecords.length,
    current: currentRecords.length,
    historical: allRecords.filter(record => record.decay_date !== null).length,
    absent: allRecords.filter(record => record.catalog_membership_status === 'ABSENT').length,
    history_total: historyRecords.length,
    propagatable,
    metadata_only: allRecords.length - propagatable,
    current_propagatable: currentPropagatable,
    current_metadata_only: currentRecords.length - currentPropagatable,
    object_types: trackedObjectTypeCounts(allRecords),
    current_object_types: trackedObjectTypeCounts(currentRecords),
    quarantined: 0
  };
  state.trackedManifest.quarantine = {
    path: `json/tracked/chunks/${quarantineDigest}-quarantine.json`,
    count: 0,
    bytes: Buffer.byteLength(quarantineBody, 'utf8'),
    sha256: `sha256:${quarantineDigest}`
  };
  state.trackedChunkAliases = aliases;
}

function emptyTrackedFixture(revision = 'sha256:filter-tracked-empty') {
  return {
    trackedManifest: {
      schema_version: '2.3.0',
      catalog_revision: revision,
      generated_at: EPOCH,
      default_membership: 'CURRENT',
      counts: { total: 0, current: 0, historical: 0, history_total: 0, quarantined: 0 },
      chunks: [],
      history_chunks: [],
      quarantine: { count: 0 }
    },
    trackedChunks: {},
    trackedManifestRequests: 0,
    trackedChunkRequests: []
  };
}

function trackedMetadataRecord(record, overrides = {}) {
  return {
    norad_id: String(record.norad_id),
    satellite_name: record.satellite_name,
    international_designator: record.international_designator,
    object_type: record.object_type,
    orbit_class: record.orbit_class,
    lifecycle_status: 'ACTIVE',
    observation_status: 'OBSERVED',
    catalog_membership_status: 'PRESENT',
    decay_date: null,
    company: record.company,
    owner: record.company,
    rcs_m2: 1,
    rcs_status: 'PUBLISHED',
    has_current_elements: false,
    metadata_only: true,
    propagation_status: 'NO_CURRENT_ELEMENTS',
    unavailable_reason: 'NOT_AVAILABLE_IN_CONFIGURED_GP_SNAPSHOT',
    ...overrides
  };
}

function trackedOrbitalRecord(record, overrides = {}) {
  return trackedMetadataRecord(record, {
    has_current_elements: true,
    metadata_only: false,
    propagation_status: 'CURRENT_ELEMENTS',
    unavailable_reason: null,
    element_reference: { catalog: 'fixture:gp', norad_id: String(record.norad_id) },
    ...overrides
  });
}

function populatedTrackedFixture() {
  const gp = categoryCatalog();
  const payloadRecords = gp
    .filter(record => record.object_type === 'PAYLOAD')
    .map(record => trackedOrbitalRecord(record));
  const debrisRecords = [
    trackedOrbitalRecord(gp.find(record => record.norad_id === '110005'), {
      rcs_m2: 0.08,
      rcs_status: 'PUBLISHED',
      launch_date: '2020-01-15',
      launch_site: 'AFETR',
      owner: 'US',
      owner_code: 'US',
      ops_status_code: '+'
    }),
    trackedMetadataRecord({
      norad_id: '620004',
      satellite_name: 'TINY TRACKED FRAGMENT',
      international_designator: '2026-099A',
      object_type: 'DEBRIS',
      orbit_class: 'LEO',
      company: 'TEST RANGE'
    }, {
      rcs_m2: 0.000001,
      rcs_status: 'PUBLISHED',
      launch_date: '2026-06-10',
      launch_site: 'AFETR',
      owner: 'US',
      owner_code: 'US',
      ops_status_code: '+'
    }),
    trackedMetadataRecord({
      norad_id: '620001',
      satellite_name: 'UNSIZED TRACKED FRAGMENT',
      international_designator: '2026-099B',
      object_type: 'DEBRIS',
      orbit_class: 'GEO',
      company: 'TEST RANGE'
    }, {
      rcs_m2: null,
      rcs_status: 'MISSING',
      launch_date: '2024-03-20',
      launch_site: 'CSG',
      owner: 'EU',
      owner_code: 'EU',
      ops_status_code: '-'
    })
  ];
  const rocketRecords = [trackedMetadataRecord({
    norad_id: '620002',
    satellite_name: 'TRACKED UPPER STAGE',
    international_designator: '2026-099C',
    object_type: 'ROCKET_BODY',
    orbit_class: 'MEO',
    company: 'TEST RANGE'
  })];
  const historicalDebris = [trackedMetadataRecord({
    norad_id: '620003',
    satellite_name: 'DECAYED TRACKED FRAGMENT',
    international_designator: '1961-001A',
    object_type: 'DEBRIS',
    orbit_class: 'UNKNOWN',
    company: 'TEST RANGE'
  }, {
    lifecycle_status: 'DECAYED',
    decay_date: '1961-02-01',
    rcs_m2: null,
    rcs_status: 'MISSING'
  })];
  const descriptors = [
    { id: 'current-payload', path: 'json/tracked/chunks/current-payload.json', scope: 'CURRENT', object_type: 'PAYLOAD', count: payloadRecords.length },
    { id: 'current-debris', path: 'json/tracked/chunks/current-debris.json', scope: 'CURRENT', object_type: 'DEBRIS', count: debrisRecords.length },
    { id: 'current-rocket-body', path: 'json/tracked/chunks/current-rocket-body.json', scope: 'CURRENT', object_type: 'ROCKET_BODY', count: rocketRecords.length },
    { id: 'current-mission-related', path: 'json/tracked/chunks/current-mission-related.json', scope: 'CURRENT', object_type: 'MISSION_RELATED', count: 0 },
    { id: 'current-unknown', path: 'json/tracked/chunks/current-unknown.json', scope: 'CURRENT', object_type: 'UNKNOWN', count: 0 }
  ];
  const historyDescriptors = [
    { id: 'historical-debris', path: 'json/tracked/chunks/historical-debris.json', scope: 'HISTORICAL', object_type: 'DEBRIS', count: historicalDebris.length }
  ];
  const chunks = {
    'current-payload.json': { schema_version: '2.3.0', scope: 'CURRENT', object_type: 'PAYLOAD', records: payloadRecords },
    'current-debris.json': { schema_version: '2.3.0', scope: 'CURRENT', object_type: 'DEBRIS', records: debrisRecords },
    'current-rocket-body.json': { schema_version: '2.3.0', scope: 'CURRENT', object_type: 'ROCKET_BODY', records: rocketRecords },
    'current-mission-related.json': { schema_version: '2.3.0', scope: 'CURRENT', object_type: 'MISSION_RELATED', records: [] },
    'current-unknown.json': { schema_version: '2.3.0', scope: 'CURRENT', object_type: 'UNKNOWN', records: [] },
    'historical-debris.json': { schema_version: '2.3.0', scope: 'HISTORICAL', object_type: 'DEBRIS', records: historicalDebris }
  };
  const current = descriptors.reduce((sum, descriptor) => sum + descriptor.count, 0);
  const historical = historyDescriptors.reduce((sum, descriptor) => sum + descriptor.count, 0);
  return {
    trackedManifest: {
      schema_version: '2.3.0',
      catalog_revision: 'sha256:filter-tracked-populated',
      generated_at: EPOCH,
      default_membership: 'CURRENT',
      counts: {
        total: current + historical,
        current,
        historical,
        history_total: historical,
        quarantined: 0
      },
      chunks: descriptors,
      history_chunks: historyDescriptors,
      quarantine: { count: 0 }
    },
    trackedChunks: chunks,
    trackedManifestRequests: 0,
    trackedChunkRequests: [],
    trackedChunkGates: {}
  };
}

function densePositionedDebrisFixture(count = 1001) {
  const gpCatalog = Array.from({ length: count }, (_, index) => {
    const noradId = String(80000 + index);
    const launchNumber = String(Math.floor(index / (26 * 26)) + 1).padStart(3, '0');
    const pieceIndex = index % (26 * 26);
    const piece = String.fromCharCode(65 + Math.floor(pieceIndex / 26)) +
      String.fromCharCode(65 + (pieceIndex % 26));
    const designator = `2026-${launchNumber}${piece}`;
    const record = ommRecord({
      noradId,
      name: `DENSE DEBRIS ${noradId}`,
      orbitClass: 'LEO',
      objectType: 'DEBRIS',
      company: 'DENSITY FIXTURE',
      meanMotion: 14.5 + (index % 20) * 0.01,
      eccentricity: 0.001 + (index % 10) * 0.0001,
      inclination: 40 + (index % 50) * 0.5
    });
    record.object_id = designator;
    record.international_designator = designator;
    record.element_set.omm.OBJECT_ID = designator;
    record.element_set.omm.RA_OF_ASC_NODE = index % 360;
    record.element_set.omm.MEAN_ANOMALY = (index * 7) % 360;
    return record;
  });
  const debrisRecords = gpCatalog.map((record, index) => trackedOrbitalRecord(record, {
    rcs_m2: index % 5 === 0 ? null : 0.001 + (index % 100) / 100,
    rcs_status: index % 5 === 0 ? 'MISSING' : 'PUBLISHED',
    launch_date: '2026-08-20',
    launch_site: index % 2 ? 'AFETR' : 'CSG',
    owner: index % 2 ? 'US' : 'EU',
    owner_code: index % 2 ? 'US' : 'EU',
    ops_status_code: '+'
  }));
  const descriptor = {
    id: 'current-debris',
    path: 'json/tracked/chunks/current-debris.json',
    scope: 'CURRENT',
    object_type: 'DEBRIS',
    count: debrisRecords.length
  };
  return {
    gpCatalog,
    trackedManifest: {
      schema_version: '2.3.1',
      catalog_revision: 'sha256:dense-positioned-debris',
      generated_at: EPOCH,
      default_membership: 'CURRENT',
      counts: { total: count, current: count, historical: 0, history_total: 0, quarantined: 0 },
      chunks: [descriptor],
      history_chunks: [],
      quarantine: { count: 0 }
    },
    trackedChunks: {
      'current-debris.json': {
        schema_version: '2.3.1',
        scope: 'CURRENT',
        object_type: 'DEBRIS',
        records: debrisRecords
      }
    },
    trackedManifestRequests: 0,
    trackedChunkRequests: [],
    trackedChunkGates: {}
  };
}

function staleGpHistoricalOverlapFixture() {
  const fixture = populatedTrackedFixture();
  const currentDebrisDescriptor = fixture.trackedManifest.chunks
    .find(descriptor => descriptor.id === 'current-debris');
  const historyDebrisDescriptor = fixture.trackedManifest.history_chunks
    .find(descriptor => descriptor.id === 'historical-debris');
  const currentDebris = fixture.trackedChunks['current-debris.json'];
  const historyDebris = fixture.trackedChunks['historical-debris.json'];
  currentDebris.records = currentDebris.records.filter(record => record.norad_id !== '110005');
  currentDebrisDescriptor.count = currentDebris.records.length;
  historyDebris.records.push(trackedMetadataRecord(
    categoryCatalog().find(record => record.norad_id === '110005'),
    {
      lifecycle_status: 'DECAYED',
      catalog_membership_status: 'ABSENT',
      observation_status: 'ABSENT',
      decay_date: '2026-08-29',
      has_current_elements: false,
      metadata_only: true,
      propagation_status: 'NO_CURRENT_ELEMENTS',
      unavailable_reason: 'OBJECT_IS_HISTORICAL'
    }
  ));
  historyDebrisDescriptor.count = historyDebris.records.length;
  fixture.trackedManifest.counts.current -= 1;
  fixture.trackedManifest.counts.historical += 1;
  fixture.trackedManifest.counts.history_total += 1;
  return fixture;
}

function historicalDebrisOverlayOnPayloadFixture() {
  const fixture = populatedTrackedFixture();
  const noradId = '110003';
  const currentPayloadDescriptor = fixture.trackedManifest.chunks
    .find(descriptor => descriptor.id === 'current-payload');
  const historyDebrisDescriptor = fixture.trackedManifest.history_chunks
    .find(descriptor => descriptor.id === 'historical-debris');
  const currentPayload = fixture.trackedChunks['current-payload.json'];
  const historyDebris = fixture.trackedChunks['historical-debris.json'];
  currentPayload.records = currentPayload.records.filter(record => record.norad_id !== noradId);
  currentPayloadDescriptor.count = currentPayload.records.length;
  historyDebris.records.push(trackedMetadataRecord({
    ...categoryCatalog().find(record => record.norad_id === noradId),
    object_type: 'DEBRIS'
  }, {
    lifecycle_status: 'DECAYED',
    catalog_membership_status: 'ABSENT',
    observation_status: 'ABSENT',
    decay_date: '2026-08-29',
    has_current_elements: false,
    metadata_only: true,
    propagation_status: 'NO_CURRENT_ELEMENTS',
    unavailable_reason: 'OBJECT_IS_HISTORICAL'
  }));
  historyDebrisDescriptor.count = historyDebris.records.length;
  fixture.trackedManifest.counts.current -= 1;
  fixture.trackedManifest.counts.historical += 1;
  fixture.trackedManifest.counts.history_total += 1;
  return fixture;
}

function staleGpCurrentUnavailablePayloadOverlapFixture() {
  const fixture = populatedTrackedFixture();
  const noradId = '110003';
  const currentPayload = fixture.trackedChunks['current-payload.json'];
  const currentRecord = currentPayload.records.find(record => record.norad_id === noradId);
  Object.assign(currentRecord, {
    lifecycle_status: 'ACTIVE',
    catalog_membership_status: 'PRESENT',
    observation_status: 'CHANGED',
    has_current_elements: false,
    metadata_only: true,
    propagation_status: 'NO_CURRENT_ELEMENTS',
    unavailable_reason: 'CURRENT_CATALOG_HAS_NO_VALIDATED_ELEMENTS'
  });
  fixture.trackedManifest.catalog_revision = 'sha256:filter-tracked-current-unavailable-transition';
  return fixture;
}

function fixtureState(trackedFixture = emptyTrackedFixture()) {
  return {
    gpCatalog: categoryCatalog(),
    gpMetadata: gpMetadata('sha256:filter-gp-one'),
    launchCatalog: [{
      norad_id: '119001',
      satellite_name: 'LAYERING LAUNCH',
      object_id: '2026-090A',
      object_type: 'PAYLOAD',
      launch_date: '2026-08-20',
      launch_site: 'AFETR'
    }],
    launchMetadata: staticMetadata('sha256:filter-launch-one', 1),
    decayCatalog: {},
    decayMetadata: staticMetadata('sha256:filter-decay-one'),
    decayCatalogRequests: 0,
    decayMetadataRequests: 0,
    ...trackedFixture
  };
}

async function routeJson(page, patterns, payload) {
  for (const pattern of patterns) {
    await page.route(pattern, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(typeof payload === 'function' ? payload(route.request()) : payload)
    }));
  }
}

async function routeTrackedCatalog(page, state) {
  const serveManifest = async route => {
    state.trackedManifestRequests += 1;
    if (state.trackedManifestGate) await state.trackedManifestGate;
    canonicalizeTrackedFixture(state);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(state.trackedManifest)
    });
  };
  await page.route('**/json/tracked/TRACKED.manifest.json', serveManifest);
  await page.route('**/api/tracked-objects/manifest', serveManifest);
  await page.route(/\/(?:json\/tracked\/chunks|api\/tracked-objects\/chunks)\/[^/?#]+\.json(?:[?#].*)?$/, async route => {
    const filename = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop());
    const logicalFilename = state.trackedChunkAliases?.[filename] ?? filename;
    state.trackedChunkRequests.push(logicalFilename);
    const gate = state.trackedChunkGates?.[logicalFilename];
    if (gate) await gate;
    const failureStatus = Number(state.trackedChunkFailures?.[logicalFilename]);
    if (Number.isInteger(failureStatus) && failureStatus >= 400) {
      await route.fulfill({
        status: failureStatus,
        contentType: 'application/json',
        body: JSON.stringify({ error: `Fixture rejected ${logicalFilename}` })
      });
      return;
    }
    const payload = state.trackedChunks[logicalFilename];
    if (!payload) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
}

function monitorBrowserErrors(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

function unexpectedConsoleErrors(messages) {
  return messages.filter(message => !/^Failed to load resource: the server responded with a status of 503 /.test(message));
}

async function bootFilterFixture(page, state, url = '/index.html', options = {}) {
  await page.route('**/node_modules/**', route => route.abort('blockedbyclient'));
  await page.route('**/obj/ISS.glb', route => route.fulfill({
    contentType: 'model/gltf-binary',
    path: LIGHTWEIGHT_DETAILED_MODEL_FIXTURE
  }));
  await page.route('**/api/health', route => route.fulfill({
    status: state.serverHealth?.status === 'ok' ? 200 : 503,
    contentType: 'application/json',
    body: JSON.stringify(state.serverHealth ?? { status: 'offline' })
  }));
  await page.route('**/api/version', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ version: '2.3.1' })
  }));
  await page.route('**/api/data-update-status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(state.dataUpdateStatus ?? { data_revision: 'fixture:no-live-status' })
  }));
  await routeJson(page, ['**/json/gp/GP.json', '**/api/gp', '**/api/satellites'], () => state.gpCatalog);
  await routeJson(page, ['**/json/gp/GP.meta.json', '**/api/gp-metadata'], () => state.gpMetadata);
  await routeJson(page, ['**/json/launches/launches.json', '**/api/launches'], () => state.launchCatalog);
  await routeJson(page, ['**/json/launches/launches.meta.json'], () => state.launchMetadata);
  await routeJson(page, ['**/json/decayed/decayed.json', '**/api/decayed'], () => {
    state.decayCatalogRequests += 1;
    return state.decayCatalog;
  });
  await routeJson(page, ['**/json/decayed/decayed.meta.json'], () => {
    state.decayMetadataRequests += 1;
    return state.decayMetadata;
  });
  await routeTrackedCatalog(page, state);

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    window.openbexiStartupPerformance?.summary().some(entry => entry.name === 'first-interactive-ui') &&
    typeof window.openbexiSimulation?.snapshot === 'function' &&
    typeof window.openbexiServerConnection?.checkForDataUpdates === 'function'
  ));
  await expect(page.locator('#satelliteSearchInput')).toBeEnabled();
  await expect(page.locator('#launchTimelineToggle')).toBeEnabled();
  await expect.poll(() => state.decayCatalogRequests).toBeGreaterThan(0);
  if (state.serverHealth?.status !== 'ok') {
    await expect.poll(() => state.decayMetadataRequests).toBeGreaterThan(0);
  }
  if (options.checkForDataUpdates !== false) {
    await page.evaluate(() => window.openbexiServerConnection.checkForDataUpdates());
  }
  if (!state.trackedManifestGate && options.waitForTrackedCatalog !== false) {
    await expect.poll(() => state.trackedManifestRequests).toBeGreaterThan(0);
    await expect.poll(() => page.locator('#trackedCatalogStatus').getAttribute('data-state'))
      .not.toBe('loading');
  }
}

async function pressedCategories(page) {
  return page.locator('#orbitTypeFilter [data-orbit-filter]').evaluateAll(buttons => buttons
    .filter(button => button.getAttribute('aria-pressed') === 'true')
    .map(button => button.dataset.orbitFilter));
}

async function pressedObjectTypes(page) {
  return page.locator('#objectTypeFilter [data-object-type-filter]').evaluateAll(buttons => buttons
    .filter(button => button.getAttribute('aria-pressed') === 'true')
    .map(button => button.dataset.objectTypeFilter));
}

async function visibleNoradIds(page) {
  await expect.poll(() => page.evaluate(async () => {
    const diagnostics = (await import('/js/satelliteTLELoader.js')).getSatellitePointCloudDiagnostics();
    const snapshot = window.openbexiSimulation.snapshot();
    const visible = [...snapshot.visibleNoradIds].sort();
    const uploaded = [...diagnostics.uploadedNoradIds].sort();
    const rendered = [...uploaded];
    if (snapshot.selectedDetailedModelVisible && snapshot.selectedNoradId) rendered.push(snapshot.selectedNoradId);
    return diagnostics.drawnCount === snapshot.drawnNoradIds.length &&
      diagnostics.matchedPositionCount === diagnostics.drawnCount &&
      JSON.stringify(uploaded) === JSON.stringify([...snapshot.drawnNoradIds].sort()) &&
      JSON.stringify(rendered.sort()) === JSON.stringify(visible);
  })).toBe(true);
  return page.evaluate(() => [...window.openbexiSimulation.snapshot().visibleNoradIds].sort());
}

async function clickCategory(page, category) {
  await page.locator(`#orbitTypeFilter [data-orbit-filter="${category}"]`).click();
}

async function clickObjectType(page, objectType) {
  await page.locator(`#objectTypeFilter [data-object-type-filter="${objectType}"]`).click();
}

async function expectCatalogCount(page, filtered, total = 9, { partial = false } = {}) {
  const count = page.locator('#satelliteCountDisplay');
  await expect(count).toHaveText(partial
    ? `${filtered} loaded / ${total} tracked`
    : `${filtered} / ${total}`);
  const filteredPhrase = `${filtered} loaded object${filtered === 1 ? '' : 's'} ` +
    `${filtered === 1 ? 'matches' : 'match'} active filters`;
  const ariaLabel = await count.getAttribute('aria-label');
  expect(ariaLabel).toContain(`${filteredPhrase} out of ${total} `);
  if (partial) {
    expect(ariaLabel).toBe(
      `${filteredPhrase} out of ${total} tracked catalog object${total === 1 ? '' : 's'} declared; loaded coverage is incomplete.`
    );
  } else {
    expect(ariaLabel).toMatch(new RegExp(
      ` out of ${total} (?:loaded object${total === 1 ? '' : 's'}|tracked catalog object${total === 1 ? '' : 's'} declared)\\.$`
    ));
  }
}

async function globeWebglColorCounts(page) {
  return page.locator('body > canvas:not(#mercatorCanvas)').first().evaluate(element => {
    const gl = element.getContext('webgl2') || element.getContext('webgl');
    if (!gl) throw new Error('Globe WebGL context is unavailable');
    gl.finish();
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels
    );
    let red = 0;
    let white = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const alpha = pixels[index + 3];
      if (alpha > 120 && r > 210 && g < 115 && b < 105 && r > g * 1.8 && r > b * 1.8) red += 1;
      if (alpha > 180 && r > 180 && g > 180 && b > 180 && Math.max(r, g, b) - Math.min(r, g, b) < 20) {
        white += 1;
      }
    }
    return { red, white, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
  });
}

async function detailedSatelliteArtworkProbe(page) {
  return page.evaluate(async () => {
    const THREE = await import('three');
    const { applyPointIconAlphaShader } = await import('/js/satelliteTLELoader.js');
    const texture = await new THREE.TextureLoader().loadAsync('/icons/ob_satellite.png');
    const image = texture.image;
    await image.decode?.();

    const canvasSize = 256;
    const markerSize = 192;
    const markerOffset = (canvasSize - markerSize) / 2;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(canvasSize, canvasSize, false);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 2;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const colorAttribute = new THREE.Float32BufferAttribute([1, 0.04, 0.02], 3);
    geometry.setAttribute('color', colorAttribute);
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      map: texture,
      size: markerSize,
      sizeAttenuation: false,
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false,
      vertexColors: true
    });
    applyPointIconAlphaShader(material);
    scene.add(new THREE.Points(geometry, material));

    const capture = mode => {
      renderer.render(scene, camera);
      const gl = renderer.getContext();
      gl.finish();
      const pixels = new Uint8Array(canvasSize * canvasSize * 4);
      gl.readPixels(0, 0, canvasSize, canvasSize, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const mask = new Uint8Array(canvasSize * canvasSize);
      let authoritativePixels = 0;
      for (let y = 0; y < canvasSize; y += 1) {
        const sourceY = canvasSize - 1 - y;
        for (let x = 0; x < canvasSize; x += 1) {
          const sourceOffset = (sourceY * canvasSize + x) * 4;
          const targetOffset = y * canvasSize + x;
          const r = pixels[sourceOffset];
          const g = pixels[sourceOffset + 1];
          const b = pixels[sourceOffset + 2];
          const alpha = pixels[sourceOffset + 3];
          mask[targetOffset] = alpha > 32 ? 1 : 0;
          if (mode === 'red' && alpha > 128 && r > 180 && g < 80 && b < 70) authoritativePixels += 1;
          if (mode === 'white' && alpha > 128 && r > 180 && g > 180 && b > 180 &&
              Math.max(r, g, b) - Math.min(r, g, b) < 8) authoritativePixels += 1;
        }
      }
      return { mask, authoritativePixels };
    };

    const red = capture('red');
    colorAttribute.setXYZ(0, 1, 1, 1);
    colorAttribute.needsUpdate = true;
    const white = capture('white');

    const referenceCanvas = document.createElement('canvas');
    referenceCanvas.width = canvasSize;
    referenceCanvas.height = canvasSize;
    const referenceContext = referenceCanvas.getContext('2d', { willReadFrequently: true });
    referenceContext.drawImage(image, markerOffset, markerOffset, markerSize, markerSize);
    const referencePixels = referenceContext.getImageData(0, 0, canvasSize, canvasSize).data;
    const referenceMask = new Uint8Array(canvasSize * canvasSize);
    const flippedReferenceMask = new Uint8Array(canvasSize * canvasSize);
    const circleMask = new Uint8Array(canvasSize * canvasSize);
    const radius = markerSize / 2;
    const center = canvasSize / 2;
    for (let y = 0; y < canvasSize; y += 1) {
      for (let x = 0; x < canvasSize; x += 1) {
        const offset = y * canvasSize + x;
        referenceMask[offset] = referencePixels[offset * 4 + 3] > 32 ? 1 : 0;
        const flippedOffset = (canvasSize - 1 - y) * canvasSize + x;
        flippedReferenceMask[offset] = referencePixels[flippedOffset * 4 + 3] > 32 ? 1 : 0;
        circleMask[offset] = Math.hypot(x + 0.5 - center, y + 0.5 - center) <= radius ? 1 : 0;
      }
    }
    const iou = (left, right) => {
      let intersection = 0;
      let union = 0;
      for (let index = 0; index < left.length; index += 1) {
        if (left[index] && right[index]) intersection += 1;
        if (left[index] || right[index]) union += 1;
      }
      return union ? intersection / union : 0;
    };
    const result = {
      decodedWidth: image.naturalWidth || image.width,
      decodedHeight: image.naturalHeight || image.height,
      pngAlphaIou: iou(red.mask, referenceMask),
      pngAlphaFlippedIou: iou(red.mask, flippedReferenceMask),
      circleIou: iou(referenceMask, circleMask),
      selectionMaskIou: iou(red.mask, white.mask),
      redPixels: red.authoritativePixels,
      whitePixels: white.authoritativePixels
    };
    geometry.dispose();
    material.dispose();
    texture.dispose();
    renderer.dispose();
    return result;
  });
}

async function liveDetailedMarkerProbe(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector('body > canvas:not(#mercatorCanvas)');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    if (!gl) throw new Error('Globe WebGL context is unavailable');
    const waitForFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
    const readFrame = () => {
      gl.finish();
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(
        0,
        0,
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels
      );
      return pixels;
    };
    window.openbexiSimulation.setRate(0);
    await waitForFrame();
    const { satellites, syncSatellitePointCloud, getSatellitePointCloudDiagnostics } =
      await import('/js/satelliteTLELoader.js');
    const target = satellites.find(record => record.object_type === 'DEBRIS');
    if (!target) throw new Error('A positioned debris record is required for the live icon probe');
    satellites.forEach(record => {
      record.mesh.visible = false;
      record.isSelected = false;
    });
    const setTargetState = selected => {
      target.mesh.position.set(0, 3.3, 6.6);
      target.mesh.visible = true;
      target.motionPositionReady = true;
      target.propagationInvalid = false;
      target.isSelected = selected;
      syncSatellitePointCloud(satellites);
    };
    setTargetState(false);
    await waitForFrame();
    const redFrame = readFrame();
    target.mesh.visible = false;
    syncSatellitePointCloud(satellites);
    await waitForFrame();
    const baselineFrame = readFrame();
    setTargetState(true);
    await waitForFrame();
    const whiteFrame = readFrame();
    const pixelCount = gl.drawingBufferWidth * gl.drawingBufferHeight;
    const redMask = new Uint8Array(pixelCount);
    const whiteMask = new Uint8Array(pixelCount);
    let redPixels = 0;
    let whitePixels = 0;
    for (let index = 0; index < pixelCount; index += 1) {
      const offset = index * 4;
      const redDifference = Math.max(
        Math.abs(redFrame[offset] - baselineFrame[offset]),
        Math.abs(redFrame[offset + 1] - baselineFrame[offset + 1]),
        Math.abs(redFrame[offset + 2] - baselineFrame[offset + 2])
      );
      const whiteDifference = Math.max(
        Math.abs(whiteFrame[offset] - baselineFrame[offset]),
        Math.abs(whiteFrame[offset + 1] - baselineFrame[offset + 1]),
        Math.abs(whiteFrame[offset + 2] - baselineFrame[offset + 2])
      );
      if (redDifference > 18) redMask[index] = 1;
      if (whiteDifference > 18) whiteMask[index] = 1;
      if (redFrame[offset] > 180 && redFrame[offset + 1] < 90 && redFrame[offset + 2] < 80) redPixels += 1;
      if (whiteFrame[offset] > 200 && whiteFrame[offset + 1] > 200 && whiteFrame[offset + 2] > 200 &&
          Math.max(whiteFrame[offset], whiteFrame[offset + 1], whiteFrame[offset + 2]) -
          Math.min(whiteFrame[offset], whiteFrame[offset + 1], whiteFrame[offset + 2]) < 12) whitePixels += 1;
    }
    const bounds = mask => {
      let minX = gl.drawingBufferWidth;
      let maxX = -1;
      let minY = gl.drawingBufferHeight;
      let maxY = -1;
      let count = 0;
      for (let index = 0; index < mask.length; index += 1) {
        if (!mask[index]) continue;
        const x = index % gl.drawingBufferWidth;
        const y = Math.floor(index / gl.drawingBufferWidth);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        count += 1;
      }
      const width = maxX >= minX ? maxX - minX + 1 : 0;
      const height = maxY >= minY ? maxY - minY + 1 : 0;
      return { width, height, count, occupancy: width && height ? count / (width * height) : 0 };
    };
    let intersection = 0;
    let union = 0;
    for (let index = 0; index < pixelCount; index += 1) {
      if (redMask[index] && whiteMask[index]) intersection += 1;
      if (redMask[index] || whiteMask[index]) union += 1;
    }
    const diagnostics = getSatellitePointCloudDiagnostics(satellites);
    const result = {
      ...bounds(redMask),
      selectionMaskIou: union ? intersection / union : 0,
      redPixels,
      whitePixels,
      pointSize: diagnostics.pointSize,
      pointSizeAttenuation: diagnostics.pointSizeAttenuation,
      markerMode: diagnostics.markerMode
    };
    target.isSelected = false;
    return result;
  });
}

async function selectSatellite(page, noradId) {
  const search = page.locator('#satelliteSearchInput');
  await search.fill(noradId);
  const option = page.locator(`#satelliteSearchResults [data-norad-id="${noradId}"]`);
  await expect(option).toBeVisible();
  await option.click();
  await page.waitForFunction(id => window.openbexiSimulation.snapshot().selectedNoradId === id, noradId);
}

async function setCheckbox(page, selector, checked) {
  const checkbox = page.locator(selector);
  if (await checkbox.isChecked() !== checked) {
    const label = checkbox.locator('xpath=ancestor::label[1]');
    const labelIsInViewport = await label.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 &&
        bounds.bottom > 0 && bounds.right > 0 &&
        bounds.top < window.innerHeight && bounds.left < window.innerWidth;
    });
    if (labelIsInViewport) await label.click();
    else await checkbox.evaluate(element => element.click());
  }
  if (checked) await expect(page.locator(selector)).toBeChecked();
  else await expect(page.locator(selector)).not.toBeChecked();
}

async function openDetails(page, selector) {
  const details = page.locator(selector);
  if (!await details.evaluate(element => element.open)) {
    await details.locator('summary').click();
  }
}

test('category unions, dependent tags, counts, selection, and GP revisions stay coherent', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The full filter transition matrix runs once on desktop Chromium.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState();
  await bootFilterFixture(page, state);

  expect(await pressedCategories(page)).toEqual(['MEO']);
  expect(await pressedObjectTypes(page)).toEqual(['ALL']);
  await expectCatalogCount(page, 2);
  expect(await visibleNoradIds(page)).toEqual(['110002', '110008']);
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().orbitTypeFilter)).toEqual(['MEO']);
  await expect(page.locator('#selectFirstStarlinkButton')).toBeDisabled();
  await expect(page.locator('#selectIssButton')).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Geosynchronous group', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'GEO', exact: true })).toHaveCount(0);
  await setCheckbox(page, '#companyFilter input[value="GEO"]', true);
  expect(await pressedCategories(page)).toEqual(['MEO']);
  await expectCatalogCount(page, 1);
  expect(await visibleNoradIds(page)).toEqual(['110008']);
  await setCheckbox(page, '#companyFilter input[value="ALL COMPANY"]', true);
  await expectCatalogCount(page, 2);
  expect(await visibleNoradIds(page)).toEqual(['110002', '110008']);
  await selectSatellite(page, '110002');
  await page.waitForFunction(() => {
    const position = window.openbexiSimulation.snapshot().selectedPosition;
    return Array.isArray(position) && Math.hypot(...position) > 6.4;
  });
  expect(await page.evaluate(() => Math.hypot(...window.openbexiSimulation.snapshot().selectedPosition))).toBeGreaterThan(6.4);
  await setCheckbox(page, '#showOnlySelectedSatellite', false);

  await clickCategory(page, 'GEO');
  expect(await pressedCategories(page)).toEqual(['GEO', 'MEO']);
  await expectCatalogCount(page, 4);
  expect(await visibleNoradIds(page)).toEqual(['110001', '110002', '110008', '110009']);

  await clickObjectType(page, 'DEBRIS');
  expect(await pressedCategories(page)).toEqual(['GEO', 'MEO']);
  expect(await pressedObjectTypes(page)).toEqual(['DEBRIS']);
  await expectCatalogCount(page, 0);
  expect(await visibleNoradIds(page)).toEqual([]);
  await clickCategory(page, 'ALL');
  await expectCatalogCount(page, 1);
  expect(await visibleNoradIds(page)).toEqual(['110005']);
  await clickObjectType(page, 'ALL');
  expect(await pressedObjectTypes(page)).toEqual(['ALL']);
  await expectCatalogCount(page, 9);

  const allInteractionLatency = await page.locator('#orbitTypeFilter [data-orbit-filter="ALL"]').evaluate(button => {
    const startedAt = performance.now();
    button.click();
    const handlerMs = performance.now() - startedAt;
    return new Promise(resolve => requestAnimationFrame(() => resolve({
      handlerMs,
      settledMs: performance.now() - startedAt
    })));
  });
  expect(allInteractionLatency.handlerMs).toBeLessThan(200);
  expect(allInteractionLatency.settledMs).toBeLessThan(500);
  expect(await pressedCategories(page)).toEqual(['ALL']);
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().orbitTypeFilter)).toEqual(['ALL']);
  await expectCatalogCount(page, 9);
  await expect(page.locator('#satelliteSelect option')).toHaveCount(1);
  await expect(page.locator('#satelliteSelect')).toHaveValue('None');
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().selectedNoradId)).toBeNull();

  await clickCategory(page, 'LEO');
  expect(await pressedCategories(page)).toEqual(['LEO']);
  await expectCatalogCount(page, 3);
  expect(await visibleNoradIds(page)).toEqual(['110003', '110005', '110007']);
  await expect(page.locator('#selectFirstStarlinkButton')).toBeEnabled();
  await expect(page.locator('#selectIssButton')).toBeEnabled();
  await page.locator('#selectFirstStarlinkButton').click();
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().selectedNoradId === '110007');
  expect(await pressedCategories(page)).toEqual(['LEO']);
  await page.locator('#selectIssButton').click();
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().selectedNoradId === '110003');
  expect(await pressedCategories(page)).toEqual(['LEO']);
  await page.waitForFunction(
    () => window.openbexiSimulation.snapshot().selectedDetailedModelVisible,
    null,
    { timeout: 45_000 }
  );
  await setCheckbox(page, '#showOnlySelectedSatellite', false);
  await page.evaluate(() => new Promise(resolve => {
    let remainingFrames = 5;
    const waitForFrame = () => {
      remainingFrames -= 1;
      if (remainingFrames <= 0) resolve();
      else requestAnimationFrame(waitForFrame);
    };
    requestAnimationFrame(waitForFrame);
  }));
  expect(await page.evaluate(() => window.openbexiSimulation.markerState('110003'))).toMatchObject({
    filterVisible: true,
    visible: false
  });

  await clickObjectType(page, 'DEBRIS');
  expect(await pressedCategories(page)).toEqual(['LEO']);
  expect(await pressedObjectTypes(page)).toEqual(['DEBRIS']);
  await expectCatalogCount(page, 1);
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().selectedNoradId === null);
  expect(await visibleNoradIds(page)).toEqual(['110005']);
  await clickCategory(page, 'ALL');
  expect(await pressedCategories(page)).toEqual(['ALL']);
  expect(await pressedObjectTypes(page)).toEqual(['DEBRIS']);
  await clickObjectType(page, 'ALL');
  expect(await pressedCategories(page)).toEqual(['ALL']);
  expect(await pressedObjectTypes(page)).toEqual(['ALL']);

  await selectSatellite(page, '110002');
  expect(await page.evaluate(() => document.querySelector('#satelliteSelect').value)).toBe('110002');
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().selectedNoradId)).toBe('110002');
  await expect(page.locator('#satelliteSelect option')).toHaveCount(2);
  await expect(page.locator('#satelliteSelect option:checked')).toHaveAttribute('data-norad-id', '110002');

  const heoButton = page.locator('#orbitTypeFilter [data-orbit-filter="HEO"]');
  await expect(heoButton).toHaveText('HRO');
  await heoButton.click();
  expect(await pressedCategories(page)).toEqual(['HEO']);
  expect(await visibleNoradIds(page)).toEqual(['110004']);
  await clickCategory(page, 'OTHER');
  expect(await pressedCategories(page)).toEqual(['HEO', 'OTHER']);
  expect(await visibleNoradIds(page)).toEqual(['110004', '110006']);
  await clickCategory(page, 'HEO');
  expect(await pressedCategories(page)).toEqual(['OTHER']);
  expect(await visibleNoradIds(page)).toEqual(['110006']);
  await clickCategory(page, 'OTHER');
  expect(await pressedCategories(page)).toEqual(['ALL']);

  const search = page.locator('#satelliteSearchInput');
  await search.fill('BREEZE');
  await expect(page.locator('#satelliteSearchResults [data-norad-id="110007"]')).toBeVisible();
  await expect(page.locator('#satelliteCountDisplay')).toHaveText('1 search | 9 / 9');
  await expect(page.locator('#satelliteCountDisplay')).toHaveAttribute(
    'aria-label',
    '1 loaded object matches the search query; 9 loaded objects match active filters out of 9 loaded objects.'
  );
  await page.locator('#satelliteSearchClear').click();
  await expectCatalogCount(page, 9);

  await clickCategory(page, 'LEO');
  const leoTag = page.getByRole('checkbox', { name: 'LEO OPS' });
  await setCheckbox(page, '#companyFilter input[value="LEO OPS"]', true);
  await expect(page.getByRole('checkbox', { name: 'All tags' })).not.toBeChecked();
  await clickCategory(page, 'GEO');
  await clickCategory(page, 'LEO');
  expect(await pressedCategories(page)).toEqual(['GEO']);
  await expect(page.getByRole('checkbox', { name: 'All tags' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'LEO OPS' })).toHaveCount(0);
  await expectCatalogCount(page, 2);

  await clickCategory(page, 'ALL');
  await selectSatellite(page, '110003');
  const detailPanel = page.locator('#selectedSatelliteDetailPanel');
  const canonicalDetails = detailPanel.locator('.selected-satellite-data-section');
  const ommDetails = detailPanel.locator('.selected-satellite-omm-section');
  await expect(detailPanel).toBeHidden();
  await page.locator('#menuToggleBtn').click();
  await expect(detailPanel).toBeVisible();
  await expect(detailPanel.locator('.selected-satellite-detail-header strong')).toHaveText('ISS (ZARYA)');
  await expect(detailPanel.getByText('ISS (ZARYA)', { exact: true })).toHaveCount(1);
  await expect(canonicalDetails.locator('th', { hasText: /^Name$/ })).toHaveCount(0);
  await expect(canonicalDetails.locator('th', { hasText: /^International designator$/ })).toHaveCount(1);
  await expect(canonicalDetails.locator('th', { hasText: /^Object ID$/ })).toHaveCount(0);
  await expect(detailPanel.locator('td', { hasText: /^2026-003A$/ })).toHaveCount(1);
  for (const absentLabel of ['Launch site', 'Decay status', 'Decay date', 'App satellite id']) {
    await expect(canonicalDetails.locator('th', { hasText: new RegExp(`^${absentLabel}$`) })).toHaveCount(0);
  }
  await expect(detailPanel.locator('td', { hasText: /^110003$/ })).toHaveCount(1);
  await expect(detailPanel.locator('td', { hasText: /^53\.1$/ })).toHaveCount(1);
  await expect(detailPanel.locator('td', { hasText: /^0\.0004$/ })).toHaveCount(1);
  await expect(detailPanel.locator('td', { hasText: /^15\.1$/ })).toHaveCount(1);
  for (const key of ['OBJECT_NAME', 'OBJECT_ID', 'NORAD_CAT_ID', 'EPOCH', 'INCLINATION', 'ECCENTRICITY', 'MEAN_MOTION']) {
    await expect(ommDetails.locator('th', { hasText: new RegExp(`^${key}$`) })).toHaveCount(0);
  }
  await expect(ommDetails).toContainText('RA_OF_ASC_NODE');
  await expect(ommDetails).toContainText('BSTAR');

  await page.locator('#menuToggleBtn').click();
  await setCheckbox(page, '#showOrbitToggle', true);
  await clickCategory(page, 'LEO');
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().selectedNoradId)).toBe('110003');
  await expect(page.locator('#showOrbitToggle')).toBeChecked();
  await expect(detailPanel).toBeHidden();
  await clickCategory(page, 'GEO');
  await clickCategory(page, 'LEO');
  expect(await pressedCategories(page)).toEqual(['GEO']);
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().selectedNoradId === null);
  await expect(detailPanel).toBeHidden();
  await expect(detailPanel).toBeEmpty();
  await expect(page.locator('#selectedSatelliteControls')).toBeHidden();
  await expect(page.locator('#showOnlySelectedSatellite')).not.toBeChecked();
  await expect(page.locator('#showOrbitToggle')).toBeChecked();
  await expect(search).toHaveValue('');
  expect(await visibleNoradIds(page)).toEqual(['110001', '110009']);
  await expectCatalogCount(page, 2);

  await selectSatellite(page, '110001');
  const geoTag = page.getByRole('checkbox', { name: 'GEO OPS' });
  await setCheckbox(page, '#companyFilter input[value="GEO OPS"]', true);
  const selectedMeshBefore = await page.evaluate(() => window.openbexiSimulation.snapshot().selectedMeshUuid);
  state.gpCatalog = state.gpCatalog.map(record => record.norad_id === '110001'
    ? { ...record, satellite_name: 'GEO FIXTURE REVISION' }
    : record);
  state.gpMetadata = gpMetadata('sha256:filter-gp-two');
  const firstRefresh = await page.evaluate(() => window.openbexiServerConnection.checkForDataUpdates());
  expect(firstRefresh.changed).toBe(true);
  await page.waitForFunction(() => document.querySelector('#selectedSatelliteDetailPanel')?.textContent.includes('GEO FIXTURE REVISION'));
  expect(await pressedCategories(page)).toEqual(['GEO']);
  await expect(page.getByRole('checkbox', { name: 'GEO OPS' })).toBeChecked();
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().selectedNoradId)).toBe('110001');
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().selectedMeshUuid)).not.toBe(selectedMeshBefore);
  await expectCatalogCount(page, 1);

  state.gpCatalog = state.gpCatalog.map(record => record.norad_id === '110001'
    ? { ...record, orbit_class: 'MEO', type: 'MEO', company: 'MEO OPS' }
    : record);
  state.gpMetadata = gpMetadata('sha256:filter-gp-three');
  const secondRefresh = await page.evaluate(() => window.openbexiServerConnection.checkForDataUpdates());
  expect(secondRefresh.changed).toBe(true);
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().selectedNoradId === null);
  expect(await pressedCategories(page)).toEqual(['GEO']);
  await expect(page.getByRole('checkbox', { name: 'All tags' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'GEO OPS' })).toHaveCount(0);
  await expect(detailPanel).toBeHidden();
  await expect(search).toHaveValue('');
  expect(await visibleNoradIds(page)).toEqual(['110009']);
  await expectCatalogCount(page, 1);

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('server lineage incoherence drops a stale tracked overlay and coherent recovery reapplies it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The live catalog lineage boundary runs once on desktop Chromium.');
  test.setTimeout(180_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState(historicalDebrisOverlayOnPayloadFixture());
  const orbitalRevision = state.gpMetadata.catalog_revision;
  const trackedRevision = state.trackedManifest.catalog_revision;
  state.serverHealth = { status: 'ok' };
  state.dataUpdateStatus = {
    data_revision: 'fixture:lineage-coherent-1',
    orbital_revision: orbitalRevision,
    gp_revision: orbitalRevision,
    tracked_revision: trackedRevision,
    tracked_pointer_valid: true,
    tracked_source_revision_match: true,
    tracked_revision_match: true
  };

  await bootFilterFixture(page, state);
  await clickObjectType(page, 'DEBRIS');
  await clickCategory(page, 'ALL');
  await setCheckbox(page, '#includeHistoricalTrackedObjects', true);
  await expectCatalogCount(page, 5, 13);
  expect(await page.evaluate(() => window.openbexiSimulation.markerState('110003'))).toMatchObject({
    filterVisible: false,
    visible: false
  });
  await expect(page.locator('#trackedDebrisFacetSummary')).toHaveText(
    '5 matches | 1 positioned | 4 position unavailable'
  );

  state.dataUpdateStatus = {
    data_revision: 'fixture:lineage-incoherent-2',
    orbital_revision: orbitalRevision,
    gp_revision: orbitalRevision,
    tracked_pointer_valid: false,
    tracked_source_revision_match: false,
    tracked_revision_match: false
  };
  const refresh = await page.evaluate(() => window.openbexiServerConnection.checkForDataUpdates());
  expect(refresh.changed).toBe(true);
  await page.waitForFunction(() => document.querySelector('#trackedCatalogStatus')?.dataset.state === 'lineage-error');

  await expect(page.locator('#trackedCatalogStatus')).toContainText('using GP data only');
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().trackedCatalogLineageBlocked)).toBe(true);
  await expectCatalogCount(page, 1, 9);
  expect(await visibleNoradIds(page)).toEqual(['110005']);
  await expect(page.locator('#trackedDebrisFacetSummary')).toHaveText(
    '0 matches | 0 positioned | 0 position unavailable'
  );
  await expect(page.locator('#trackedCountTotal')).toHaveText('0');
  await expect(page.locator('#trackedCountFiltered')).toHaveText('0');
  await expect(page.locator('#trackedCountPropagatable')).toHaveText('0');
  await expect(page.locator('#trackedCountMetadataOnly')).toHaveText('0');
  await expect(page.locator('#satelliteSearchInput')).toHaveValue('');
  await page.locator('#satelliteSearchInput').fill('620004');
  await expect(page.locator('#satelliteSearchResults [data-norad-id="620004"]')).toHaveCount(0);
  await page.locator('#satelliteSearchClear').click();
  await clickObjectType(page, 'ALL');
  await expectCatalogCount(page, 9, 9);
  expect(await visibleNoradIds(page)).toContain('110003');
  const restoredGp = await page.evaluate(async () => {
    const { satellites } = await import('/js/satelliteTLELoader.js');
    const record = satellites.find(candidate => candidate.norad_id === '110003');
    return {
      objectType: record?.object_type,
      lifecycle: record?.lifecycle_status,
      metadataOnly: record?.metadata_only ?? null,
      suppressed: record?.tracked_catalog_suppressed ?? null,
      visible: record?.mesh?.visible === true
    };
  });
  expect(restoredGp).toEqual({
    objectType: 'PAYLOAD',
    lifecycle: 'ACTIVE',
    metadataOnly: false,
    suppressed: null,
    visible: true
  });
  await page.locator('#satelliteSearchInput').fill('ISS (ZARYA)');
  await expect(page.locator('#satelliteSearchResults [data-norad-id="110003"]')).toBeVisible();
  await page.locator('#satelliteSearchClear').click();

  state.dataUpdateStatus = {
    data_revision: 'fixture:lineage-coherent-3',
    orbital_revision: orbitalRevision,
    gp_revision: orbitalRevision,
    tracked_revision: trackedRevision,
    tracked_pointer_valid: true,
    tracked_source_revision_match: true,
    tracked_revision_match: true
  };
  const recovery = await page.evaluate(() => window.openbexiServerConnection.checkForDataUpdates());
  expect(recovery.changed).toBe(true);
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().trackedCatalogState === 'ready');
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().trackedCatalogLineageBlocked)).toBe(false);
  await clickObjectType(page, 'DEBRIS');
  await expectCatalogCount(page, 5, 13);
  expect(await visibleNoradIds(page)).toEqual(['110005']);
  expect(await page.evaluate(() => window.openbexiSimulation.markerState('110003'))).toMatchObject({
    filterVisible: false,
    visible: false
  });
  const recoveredOverlay = await page.evaluate(async () => {
    const { satellites } = await import('/js/satelliteTLELoader.js');
    const record = satellites.find(candidate => candidate.norad_id === '110003');
    return {
      objectType: record?.object_type,
      lifecycle: record?.lifecycle_status,
      metadataOnly: record?.metadata_only,
      member: record?.tracked_catalog_member
    };
  });
  expect(recoveredOverlay).toEqual({
    objectType: 'DEBRIS',
    lifecycle: 'DECAYED',
    metadataOnly: true,
    member: true
  });

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('tracked catalog keeps orbit and object taxonomy independent and metadata-only objects off the globe', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The tracked-catalog browser matrix runs once on desktop Chromium.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState(populatedTrackedFixture());
  let releaseManifest;
  state.trackedManifestGate = new Promise(resolve => { releaseManifest = resolve; });

  await bootFilterFixture(page, state, '/index.html', { checkForDataUpdates: false });

  expect(await pressedCategories(page)).toEqual(['MEO']);
  expect(await pressedObjectTypes(page)).toEqual(['ALL']);
  await expectCatalogCount(page, 2, 9);
  expect(await visibleNoradIds(page)).toEqual(['110002', '110008']);
  expect(await page.evaluate(() => window.openbexiSimulation.markerState('110001')?.visible)).toBe(false);

  releaseManifest();
  await expect(page.locator('#trackedCatalogStatus')).toHaveAttribute('data-state', 'manifest');
  await expect(page.locator('#trackedCatalogStatus')).toContainText('current tracked records available on demand');
  expect(state.trackedChunkRequests).toEqual([]);
  await expectCatalogCount(page, 2, 12, { partial: true });
  const searchToLoadCatalog = page.locator('#satelliteSearchInput');
  await searchToLoadCatalog.fill('catalog warmup');
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().trackedCatalogState === 'ready');
  await page.locator('#satelliteSearchClear').click();
  await expectCatalogCount(page, 3, 12);
  expect(await visibleNoradIds(page)).toEqual(['110002', '110008']);
  await expect(page.locator('#trackedCountTotal')).toHaveText('12');
  await expect(page.locator('#trackedCountFiltered')).toHaveText('3');
  await expect(page.locator('#trackedCountCurrent')).toHaveText('12');
  await expect(page.locator('#trackedCountHistorical')).toHaveText('1');
  await expect(page.locator('#trackedCountPropagatable')).toHaveText('2');
  await expect(page.locator('#trackedCountMetadataOnly')).toHaveText('1');
  await expect(page.locator('#trackedCountRenderReady')).toHaveText('2');
  await expect(page.locator('#trackedCountQuarantine')).toHaveText('0');
  await expect(page.locator('#conjunctionCatalogSummary')).toContainText('3 metadata-only excluded');

  await clickCategory(page, 'GEO');
  expect(await pressedCategories(page)).toEqual(['GEO', 'MEO']);
  await expectCatalogCount(page, 6, 12);
  expect(await visibleNoradIds(page)).toEqual(['110001', '110002', '110008', '110009']);

  await clickCategory(page, 'ALL');
  await expectCatalogCount(page, 12, 12);
  expect(await visibleNoradIds(page)).toEqual([
    '110001', '110002', '110003', '110004', '110005', '110006', '110007', '110008', '110009'
  ]);

  await clickObjectType(page, 'DEBRIS');
  expect(await pressedObjectTypes(page)).toEqual(['DEBRIS']);
  await expectCatalogCount(page, 3, 12);
  expect(await visibleNoradIds(page)).toEqual(['110005']);
  await expect(page.locator('#satelliteAccordionHeader')).toContainText('Tracked Objects - Matches');
  await expect(page.locator('#trackedDebrisFacets')).toBeVisible();
  await expect(page.locator('#trackedDebrisFacetSummary')).toHaveText(
    '3 matches | 1 positioned | 2 position unavailable'
  );
  await expect(page.locator('#trackedCoverageHud')).toBeVisible();
  await expect(page.locator('#trackedCoverageHud')).toHaveAttribute('data-state', 'partial');
  await expect(page.locator('#trackedCoverageMatched')).toHaveText('3');
  await expect(page.locator('#trackedCoveragePositioned')).toHaveText('1');
  await expect(page.locator('#trackedCoverageUnavailable')).toHaveText('2');
  await expect(page.locator('#trackedCoverageHud')).toHaveAttribute(
    'aria-label',
    /3 tracked objects match active filters; 1 positioned; 2 position unavailable/
  );
  await expect(page.locator('#trackedCountFiltered')).toHaveText('3');
  await expect(page.locator('#trackedCountPropagatable')).toHaveText('1');
  await expect(page.locator('#trackedCountMetadataOnly')).toHaveText('2');
  await expect(page.locator('#trackedCatalogCounts dt')).toContainText([
    'Tracked', 'Matches', 'Current', 'History', 'Positioned', 'Position unavailable', 'Visible', 'Quarantine'
  ]);
  await expect(page.locator('#trackedObjectLegend')).toContainText('Payload');
  await expect(page.locator('#trackedObjectLegend')).toContainText('Debris');
  await expect(page.locator('#trackedObjectLegend')).toContainText('Selected');
  const globeDebrisDiagnostics = await page.evaluate(async () => {
    const diagnostics = (await import('/js/satelliteTLELoader.js')).getSatellitePointCloudDiagnostics();
    return {
      debrisDrawnCount: diagnostics.debrisDrawnCount,
      debrisTypeCount: diagnostics.objectTypeMarkerCounts.Debris || 0
    };
  });
  expect(globeDebrisDiagnostics).toEqual({ debrisDrawnCount: 1, debrisTypeCount: 1 });
  await page.evaluate(epoch => window.openbexiSimulation.setTime(epoch), EPOCH);
  await expect.poll(() => page.evaluate(() => window.openbexiSimulation.markerClientPosition('110005')))
    .not.toBeNull();
  const globeTarget = await page.evaluate(() => window.openbexiSimulation.markerClientPosition('110005'));
  expect(globeTarget).not.toBeNull();
  await page.mouse.click(globeTarget.x, globeTarget.y);
  await expect.poll(() => page.evaluate(() => window.openbexiSimulation.snapshot().selectedNoradId))
    .toBe('110005');
  await page.evaluate(() => {
    const select = document.querySelector('#satelliteSelect');
    select.value = 'None';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.openbexiSimulation.snapshot().selectedNoradId))
    .toBeNull();
  await page.evaluate(() => window.openbexiSimulation.setTime('2026-08-23T00:24:00.000Z'));
  await setCheckbox(page, '#viewMercatorToggle', true);
  await expect.poll(() => page.locator('#mercatorCanvas').getAttribute('data-debris-marker-count')).toBe('1');
  await expect(page.locator('#mercatorCanvas')).toHaveAttribute('data-marker-mode', 'detailed');
  const redMercatorPixels = await page.locator('#mercatorCanvas').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 220 && pixels[index + 1] < 105 && pixels[index + 2] < 95 && pixels[index + 3] > 120) {
        count += 1;
      }
    }
    return count;
  });
  expect(redMercatorPixels).toBeGreaterThan(0);
  await page.locator('#openTrackedResults').click();
  await expect(page.locator('#trackedResultsDrawer')).toBeVisible();
  await expect(page.locator('#trackedResultsCount')).toHaveText('3 results');
  await page.locator('#trackedResultsTabs [data-result-mode="UNAVAILABLE"]').click();
  await expect(page.locator('#trackedResultsCount')).toHaveText('2 results');
  await expect(page.locator('#trackedResultsRows')).toContainText('TINY TRACKED FRAGMENT');
  const resultAccessibility = await new AxeBuilder({ page })
    .include('#trackedResultsDrawer')
    .analyze();
  expect(resultAccessibility.violations.filter(violation =>
    ['serious', 'critical'].includes(violation.impact)
  )).toEqual([]);
  await page.locator('#trackedResultsViewport').press('ArrowDown');
  await page.locator('#trackedResultsViewport').press('Enter');
  await expect(page.locator('#trackedResultsDrawer')).toBeHidden();
  expect((await page.evaluate(() => window.openbexiSimulation.snapshot())).selectedNoradId).toBe('620004');
  await expect(page.locator('#selectedSatelliteDetailPanel')).toContainText('Position unavailable.');

  const mercatorTarget = await page.locator('#mercatorCanvas').evaluate(async canvas => {
    const { getMercatorMarkerDiagnostics } = await import('/js/mercatorMapLoader.js');
    const target = getMercatorMarkerDiagnostics().find(item => item.noradId === '110005');
    if (!target) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + target.x * rect.width / canvas.width,
      y: rect.top + target.y * rect.height / canvas.height
    };
  });
  expect(mercatorTarget).not.toBeNull();
  await page.mouse.click(mercatorTarget.x, mercatorTarget.y);
  await expect.poll(() => page.evaluate(() => window.openbexiSimulation.snapshot().selectedNoradId))
    .toBe('110005');
  await expect(page.locator('#mercatorCanvas')).toHaveAttribute('data-selected-marker-norad-id', '110005');
  await expect(page.locator('#mercatorCanvas')).toHaveAttribute('data-selected-marker-rendered', 'true');
  await setCheckbox(page, '#showOnlySelectedSatellite', false);

  await setCheckbox(page, '#trackedPositionFacet input[value="METADATA_ONLY"]', true);
  await expectCatalogCount(page, 2, 12);
  expect(await visibleNoradIds(page)).toEqual([]);
  await expect.poll(() => page.locator('#mercatorCanvas').getAttribute('data-debris-marker-count')).toBe('0');
  await expect(page.locator('#trackedDebrisFacetSummary')).toHaveText(
    '2 matches | 0 positioned | 2 position unavailable'
  );
  await setCheckbox(page, '#trackedPositionFacet input[value="ALL"]', true);
  await expectCatalogCount(page, 3, 12);
  expect(await visibleNoradIds(page)).toEqual(['110005']);

  await openDetails(page, '[data-tracked-facet="rcs"]');
  await expect(page.locator('#trackedRcsFacet')).toContainText('All radar cross-section records');
  await setCheckbox(page, '#trackedRcsFacet input[value="LT_0_01"]', true);
  await expectCatalogCount(page, 1, 12);
  expect(await visibleNoradIds(page)).toEqual([]);
  await expect(page.locator('#trackedDebrisFacetSummary')).toHaveText(
    '1 match | 0 positioned | 1 position unavailable'
  );
  await page.locator('#resetTrackedDebrisFacets').click();
  await expectCatalogCount(page, 3, 12);

  await page.locator('#trackedLaunchYearFrom').selectOption('2024');
  await expectCatalogCount(page, 2, 12);
  expect(await visibleNoradIds(page)).toEqual([]);
  await openDetails(page, '[data-tracked-facet="owner"]');
  await setCheckbox(page, '#trackedOwnerFacet input[value="US"]', true);
  await expectCatalogCount(page, 1, 12);
  await expect(page.locator('#trackedLaunchYearFrom')).toHaveValue('2024');
  await page.locator('#resetTrackedDebrisFacets').click();
  await openDetails(page, '[data-tracked-facet="owner"]');
  await setCheckbox(page, '#trackedOwnerFacet input[value="US"]', true);
  await expectCatalogCount(page, 2, 12);
  expect(await visibleNoradIds(page)).toEqual(['110005']);
  await setCheckbox(page, '#trackedPositionFacet input[value="POSITIONED"]', true);
  await expectCatalogCount(page, 1, 12);
  expect(await visibleNoradIds(page)).toEqual(['110005']);
  await expect(page.locator('#trackedDebrisFacetSummary')).toHaveText(
    '1 match | 1 positioned | 0 position unavailable'
  );
  await page.locator('#resetFiltersButton').click();
  expect(await pressedCategories(page)).toEqual(['MEO']);
  expect(await pressedObjectTypes(page)).toEqual(['ALL']);
  await expect(page.locator('#trackedDebrisFacets')).toBeHidden();
  await clickCategory(page, 'ALL');
  await clickCategory(page, 'LEO');
  await clickObjectType(page, 'DEBRIS');
  await expect(page.locator('#trackedDebrisFacets')).toBeVisible();
  await expectCatalogCount(page, 2, 12);
  expect(await visibleNoradIds(page)).toEqual(['110005']);
  await clickCategory(page, 'ALL');
  await expectCatalogCount(page, 3, 12);
  await expect(page.locator('#trackedPositionFacet input[value="ALL"]')).toBeChecked();
  await openDetails(page, '[data-tracked-facet="owner"]');
  await expect(page.locator('#trackedOwnerFacet input[value="ALL"]')).toBeChecked();
  await openDetails(page, '[data-tracked-facet="rcs"]');
  const facetAccessibility = await new AxeBuilder({ page })
    .include('#trackedDebrisFacets')
    .analyze();
  expect(facetAccessibility.violations.filter(violation =>
    ['serious', 'critical'].includes(violation.impact)
  )).toEqual([]);

  const search = page.locator('#satelliteSearchInput');
  await search.fill('620004');
  const tinyDebris = page.locator('#satelliteSearchResults [data-norad-id="620004"]');
  await expect(tinyDebris).toBeVisible();
  await expect(tinyDebris.locator('.satellite-search-badges')).toContainText('Debris');
  await expect(tinyDebris.locator('.satellite-search-badges')).toContainText('Metadata only');
  await page.locator('#satelliteSearchClear').click();
  await search.fill('620001');
  await expect(page.locator('#satelliteSearchResults [data-norad-id="620001"]')).toBeVisible();
  await page.locator('#satelliteSearchClear').click();

  await selectSatellite(page, '620004');
  const metadataSnapshot = await page.evaluate(() => window.openbexiSimulation.snapshot());
  expect(metadataSnapshot.selectedNoradId).toBe('620004');
  expect(metadataSnapshot.selectedMeshUuid).toBeNull();
  expect(metadataSnapshot.selectedPosition).toBeNull();
  expect(await page.evaluate(() => window.openbexiSimulation.markerState('620004'))).toBeNull();
  await expect(page.locator('#selectedSatelliteControls')).toBeHidden();
  for (const selector of [
    '#showYPRToggle',
    '#showFootprintCheckbox',
    '#showOnlySelectedSatellite',
    '#showOrbitFrameToggle',
    '#showOrbitToggle',
    '#yawSlider',
    '#pitchSlider',
    '#rollSlider'
  ]) {
    await expect(page.locator(selector)).toBeDisabled();
  }
  await expect(page.locator('#conjunctionRunButton')).toBeDisabled();
  const details = page.locator('#selectedSatelliteDetailPanel');
  await expect(details).toContainText('Position unavailable.');
  await expect(details).toContainText('0.000001');
  await expect(details).toContainText('PUBLISHED');
  await expect(details).toContainText('NOT_AVAILABLE_IN_CONFIGURED_GP_SNAPSHOT');

  await setCheckbox(page, '#includeHistoricalTrackedObjects', true);
  await page.waitForFunction(() => document.querySelector('#satelliteCountDisplay')?.textContent === '4 / 13');
  await expect(page.locator('#trackedCountTotal')).toHaveText('13');
  await search.fill('620003');
  const historicalResult = page.locator('#satelliteSearchResults [data-norad-id="620003"]');
  await expect(historicalResult).toBeVisible();
  await expect(historicalResult.locator('.satellite-search-badges')).toContainText('Historical');
  await expect(historicalResult.locator('.satellite-search-badges')).toContainText('Metadata only');
  const categoricalAccounting = await page.evaluate(() => Object.fromEntries(
    ['trackedOwnerFacet', 'trackedLaunchSiteFacet', 'trackedStatusFacet'].map(id => {
      const options = [...document.querySelectorAll(`#${id} .tracked-facet-option`)];
      const countFor = option => Number(/\(([\d,]+)\)$/.exec(option.textContent.trim())?.[1].replaceAll(',', '') || 0);
      return [id, {
        all: countFor(options.find(option => option.querySelector('input')?.value === 'ALL')),
        sum: options
          .filter(option => option.querySelector('input')?.value !== 'ALL')
          .reduce((sum, option) => sum + countFor(option), 0),
        values: options.map(option => option.querySelector('input')?.value)
      }];
    })
  ));
  for (const accounting of Object.values(categoricalAccounting)) {
    expect(accounting.all).toBe(4);
    expect(accounting.sum).toBe(4);
  }
  expect(categoricalAccounting.trackedLaunchSiteFacet.values).toContain('UNKNOWN');
  expect(categoricalAccounting.trackedStatusFacet.values).toContain('UNKNOWN');

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('tracked coverage and virtualized results remain usable on a narrow viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'The narrow catalog workflow runs once on mobile Chromium.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState(populatedTrackedFixture());

  await bootFilterFixture(page, state, '/index.html', { checkForDataUpdates: false });
  await clickCategory(page, 'ALL');
  await clickObjectType(page, 'DEBRIS');
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().trackedCatalogState === 'ready');
  await expect(page.locator('#trackedCoverageHud')).toBeVisible();
  await expect(page.locator('#trackedCoverageMatched')).toHaveText('3');
  const [mobileHudBox, mobileControlsBox, mobileMenuToggleBox, mobileTimeWarpBox] = await Promise.all([
    page.locator('#trackedCoverageHud').boundingBox(),
    page.locator('#controlsContainer').boundingBox(),
    page.locator('#menuToggleBtn').boundingBox(),
    page.locator('#timeWarpBox').boundingBox()
  ]);
  expect(mobileHudBox).not.toBeNull();
  expect(mobileControlsBox).not.toBeNull();
  expect(mobileMenuToggleBox).not.toBeNull();
  expect(mobileTimeWarpBox).not.toBeNull();
  expect(boxesIntersect(mobileHudBox, mobileControlsBox)).toBe(false);
  expect(boxesIntersect(mobileHudBox, mobileMenuToggleBox)).toBe(false);
  expect(
    boxesIntersect(mobileHudBox, mobileTimeWarpBox),
    `mobile HUD/time controls overlap: ${JSON.stringify({ mobileHudBox, mobileTimeWarpBox })}`
  ).toBe(false);
  await page.locator('#openTrackedResults').click();
  const drawer = page.locator('#trackedResultsDrawer');
  await expect(drawer).toBeVisible();
  const [drawerBox, viewport] = await Promise.all([
    drawer.boundingBox(),
    page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  ]);
  expect(drawerBox).not.toBeNull();
  expect(drawerBox.x).toBeGreaterThanOrEqual(0);
  expect(drawerBox.y).toBeGreaterThanOrEqual(0);
  expect(drawerBox.x + drawerBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(drawerBox.y + drawerBox.height).toBeLessThanOrEqual(viewport.height + 1);
  await page.locator('#trackedResultsTabs [data-result-mode="UNAVAILABLE"]').click();
  await expect(page.locator('#trackedResultsCount')).toHaveText('2 results');
  await page.locator('#trackedResultsViewport').press('Escape');
  await expect(drawer).toBeHidden();

  await page.setViewportSize({ width: 768, height: 900 });
  const [tabletHudBox, tabletControlsBox, tabletMenuToggleBox, tabletTimeWarpBox] = await Promise.all([
    page.locator('#trackedCoverageHud').boundingBox(),
    page.locator('#controlsContainer').boundingBox(),
    page.locator('#menuToggleBtn').boundingBox(),
    page.locator('#timeWarpBox').boundingBox()
  ]);
  expect(tabletHudBox).not.toBeNull();
  expect(tabletControlsBox).not.toBeNull();
  expect(tabletMenuToggleBox).not.toBeNull();
  expect(tabletTimeWarpBox).not.toBeNull();
  expect(boxesIntersect(tabletHudBox, tabletControlsBox)).toBe(false);
  expect(boxesIntersect(tabletHudBox, tabletMenuToggleBox)).toBe(false);
  expect(boxesIntersect(tabletHudBox, tabletTimeWarpBox)).toBe(false);
  await page.locator('#openTrackedResults').click();
  const tabletDrawerBox = await drawer.boundingBox();
  expect(tabletDrawerBox).not.toBeNull();
  expect(tabletDrawerBox.x).toBeLessThanOrEqual(9);
  expect(tabletDrawerBox.width).toBeGreaterThanOrEqual(750);
  expect(tabletDrawerBox.x + tabletDrawerBox.width).toBeLessThanOrEqual(769);
  await page.locator('#trackedResultsViewport').press('Escape');
  await expect(drawer).toBeHidden();

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.locator('#openTrackedResults').click();
  await page.locator('#trackedResultsTabs [data-result-mode="POSITIONED"]').click();
  await page.locator('#trackedResultsRows .tracked-results-row').first().click();
  const [menuToggleBox, timeWarpBox] = await Promise.all([
    page.locator('#menuToggleBtn').boundingBox(),
    page.locator('#timeWarpBox').boundingBox()
  ]);
  expect(menuToggleBox).not.toBeNull();
  expect(timeWarpBox).not.toBeNull();
  expect(
    menuToggleBox.x + menuToggleBox.width <= timeWarpBox.x ||
    timeWarpBox.x + timeWarpBox.width <= menuToggleBox.x ||
    menuToggleBox.y + menuToggleBox.height <= timeWarpBox.y ||
    timeWarpBox.y + timeWarpBox.height <= menuToggleBox.y
  ).toBe(true);
  await page.locator('#menuToggleBtn').click();
  const detailPanel = page.locator('#selectedSatelliteDetailPanel');
  await expect(detailPanel).toBeVisible();
  const [desktopHudBox, detailBox, hiddenMenuToggleBox, desktopTimeWarpBox] = await Promise.all([
    page.locator('#trackedCoverageHud').boundingBox(),
    detailPanel.boundingBox(),
    page.locator('#menuToggleBtn').boundingBox(),
    page.locator('#timeWarpBox').boundingBox()
  ]);
  expect(desktopHudBox).not.toBeNull();
  expect(detailBox).not.toBeNull();
  expect(hiddenMenuToggleBox).not.toBeNull();
  expect(desktopTimeWarpBox).not.toBeNull();
  expect(boxesIntersect(desktopHudBox, detailBox)).toBe(false);
  expect(boxesIntersect(desktopHudBox, hiddenMenuToggleBox)).toBe(false);
  expect(boxesIntersect(desktopHudBox, desktopTimeWarpBox)).toBe(false);

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('GP-only debris remains orbital data without entering SATCAT-scoped debris results', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The GP/SATCAT accounting boundary runs once on desktop Chromium.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState(populatedTrackedFixture());
  state.gpCatalog.push(ommRecord({
    noradId: '110010',
    name: 'GP ONLY DEBRIS',
    orbitClass: 'LEO',
    objectType: 'DEBRIS',
    company: 'ORBITAL ONLY',
    meanMotion: 14.8,
    inclination: 51.6
  }));
  state.gpMetadata = gpMetadata('sha256:gp-only-debris', state.gpCatalog.length);

  await bootFilterFixture(page, state, '/index.html', { checkForDataUpdates: false });
  await clickCategory(page, 'LEO');
  expect(await visibleNoradIds(page)).toContain('110010');
  await clickObjectType(page, 'DEBRIS');
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().trackedCatalogState === 'ready');
  expect(await visibleNoradIds(page)).toEqual(['110005']);
  await clickCategory(page, 'ALL');
  await expectCatalogCount(page, 3, 12);
  expect(await visibleNoradIds(page)).toEqual(['110005']);
  await expect(page.locator('#trackedDebrisFacetSummary')).toHaveText(
    '3 matches | 1 positioned | 2 position unavailable'
  );
  await expect(page.locator('#trackedCountFiltered')).toHaveText('3');
  await expect(page.locator('#trackedCountPropagatable')).toHaveText('1');
  await expect(page.locator('#trackedCountMetadataOnly')).toHaveText('2');
  await expect.poll(async () => page.evaluate(async () => {
    const diagnostics = (await import('/js/satelliteTLELoader.js')).getSatellitePointCloudDiagnostics();
    return diagnostics.objectTypeMarkerCounts.Debris || 0;
  })).toBe(1);

  await openDetails(page, '[data-tracked-facet="owner"]');
  const ownerAccounting = await page.locator('#trackedOwnerFacet .tracked-facet-option').evaluateAll(options => {
    const countFor = option => Number(/\(([\d,]+)\)$/.exec(option.textContent.trim())?.[1].replaceAll(',', '') || 0);
    return {
      all: countFor(options.find(option => option.querySelector('input')?.value === 'ALL')),
      sum: options
        .filter(option => option.querySelector('input')?.value !== 'ALL')
        .reduce((sum, option) => sum + countFor(option), 0)
    };
  });
  expect(ownerAccounting).toEqual({ all: 3, sum: 3 });
  await setCheckbox(page, '#trackedOwnerFacet input[value="US"]', true);
  await expectCatalogCount(page, 2, 12);
  expect(await visibleNoradIds(page)).toEqual(['110005']);

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('detailed Globe markers render canonical debris red and selected white', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The detailed WebGL color path runs once on desktop Chromium.');
  test.setTimeout(180_000);
  const browserErrors = monitorBrowserErrors(page);
  const satelliteIconRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/icons/ob_satellite.png')) {
      satelliteIconRequests.push(request.url());
    }
  });
  const fixture = densePositionedDebrisFixture(500);
  fixture.trackedChunks['current-debris.json'].records.forEach((record, index) => {
    record.owner = index < 499 ? 'US' : 'EU';
    record.owner_code = record.owner;
  });
  const state = fixtureState(fixture);
  state.gpCatalog = fixture.gpCatalog;
  state.gpMetadata = gpMetadata('sha256:detailed-positioned-debris', fixture.gpCatalog.length);

  await bootFilterFixture(page, state);
  await setCheckbox(page, '#showDayNightToggle', false);
  await clickObjectType(page, 'DEBRIS');
  await clickCategory(page, 'ALL');
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().trackedCatalogState === 'ready');
  await expectCatalogCount(page, 500, 500);
  await expect.poll(async () => page.evaluate(async () => {
    const diagnostics = (await import('/js/satelliteTLELoader.js')).getSatellitePointCloudDiagnostics();
    return {
      mode: diagnostics.markerMode,
      source: diagnostics.detailedMarkerSource,
      asset: diagnostics.detailedMarkerAssetPath,
      resolvedUrl: diagnostics.detailedMarkerResolvedUrl,
      alphaTint: diagnostics.detailedMarkerUsesAlphaTint,
      ready: diagnostics.detailedMarkerReady,
      width: diagnostics.detailedMarkerWidth,
      height: diagnostics.detailedMarkerHeight,
      pointSize: diagnostics.pointSize,
      pointSizeAttenuation: diagnostics.pointSizeAttenuation
    };
  }), { timeout: 60_000 }).toEqual({
    mode: 'density',
    source: 'asset',
    asset: 'icons/ob_satellite.png',
    resolvedUrl: 'icons/ob_satellite.png',
    alphaTint: true,
    ready: true,
    width: 512,
    height: 512,
    pointSize: 0.025,
    pointSizeAttenuation: true
  });
  await expect.poll(() => satelliteIconRequests.length).toBeGreaterThan(0);
  const appOrigin = new URL(page.url()).origin;
  expect(satelliteIconRequests.every(url => new URL(url).origin === appOrigin)).toBe(true);
  const detailedTextureUuid = await page.evaluate(async () => (
    (await import('/js/satelliteTLELoader.js')).getSatellitePointCloudDiagnostics().detailedMarkerTextureUuid
  ));
  expect(detailedTextureUuid).toMatch(/^[0-9a-f-]{36}$/i);
  const artworkProbe = await detailedSatelliteArtworkProbe(page);
  expect(artworkProbe).toMatchObject({
    decodedWidth: 512,
    decodedHeight: 512
  });
  expect(artworkProbe.pngAlphaIou).toBeGreaterThan(0.98);
  expect(artworkProbe.pngAlphaFlippedIou).toBeLessThan(0.5);
  expect(artworkProbe.circleIou).toBeLessThan(0.7);
  expect(artworkProbe.selectionMaskIou).toBeGreaterThan(0.99);
  expect(artworkProbe.redPixels).toBeGreaterThan(1_000);
  expect(artworkProbe.whitePixels).toBeGreaterThan(1_000);
  await setCheckbox(page, '#trackedOwnerFacet input[value="US"]', true);
  await expectCatalogCount(page, 499, 500);
  await expect.poll(async () => page.evaluate(async () => {
    const diagnostics = (await import('/js/satelliteTLELoader.js')).getSatellitePointCloudDiagnostics();
    return [
      diagnostics.markerMode,
      diagnostics.debrisDrawnCount,
      diagnostics.selectedDrawnCount,
      diagnostics.detailedMarkerSource,
      diagnostics.detailedMarkerAssetPath,
      diagnostics.detailedMarkerTextureUuid,
      diagnostics.pointSize,
      diagnostics.pointSizeAttenuation
    ];
  }), { timeout: 60_000 }).toEqual([
    'detailed', 499, 0, 'asset', 'icons/ob_satellite.png', detailedTextureUuid, 16, false
  ]);

  await expect.poll(async () => (await globeWebglColorCounts(page)).red, { timeout: 60_000 })
    .toBeGreaterThan(20);
  const unselected = await globeWebglColorCounts(page);
  await page.evaluate(async () => {
    const { satellites } = await import('/js/satelliteTLELoader.js');
    satellites.forEach(record => { record.isSelected = record.object_type === 'DEBRIS'; });
  });
  await expect.poll(async () => page.evaluate(async () => (
    (await import('/js/satelliteTLELoader.js')).getSatellitePointCloudDiagnostics().selectedDrawnCount
  )), { timeout: 60_000 }).toBe(499);
  const selected = await globeWebglColorCounts(page);
  expect(selected.red).toBeLessThan(unselected.red);
  expect(selected.white).toBeGreaterThan(unselected.white + 20);

  await page.evaluate(async () => {
    const { satellites } = await import('/js/satelliteTLELoader.js');
    satellites.forEach(record => { record.isSelected = false; });
  });
  await expect.poll(async () => page.evaluate(async () => (
    (await import('/js/satelliteTLELoader.js')).getSatellitePointCloudDiagnostics().selectedDrawnCount
  )), { timeout: 60_000 }).toBe(0);
  const restored = await globeWebglColorCounts(page);
  expect(restored.red).toBeGreaterThan(selected.red);

  const liveSprite = await liveDetailedMarkerProbe(page);
  console.log(`[v231-globe-icon-evidence] ${JSON.stringify({ artworkProbe, liveSprite })}`);
  expect(liveSprite.markerMode).toBe('detailed');
  expect(liveSprite.pointSize).toBe(16);
  expect(liveSprite.pointSizeAttenuation).toBe(false);
  expect(liveSprite.width).toBeGreaterThanOrEqual(14);
  expect(liveSprite.height).toBeGreaterThanOrEqual(14);
  expect(liveSprite.occupancy).toBeLessThan(0.7);
  expect(liveSprite.selectionMaskIou).toBeGreaterThan(0.9);
  expect(liveSprite.redPixels).toBeGreaterThan(20);
  expect(liveSprite.whitePixels).toBeGreaterThan(20);

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('dense positioned debris stays red, batched, and selection remains distinct', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The dense debris rendering path runs once on desktop Chromium.');
  test.setTimeout(180_000);
  const browserErrors = monitorBrowserErrors(page);
  const fixture = densePositionedDebrisFixture();
  const state = fixtureState(fixture);
  state.gpCatalog = fixture.gpCatalog;
  state.gpMetadata = gpMetadata('sha256:dense-positioned-debris', fixture.gpCatalog.length);

  await bootFilterFixture(page, state);
  await clickObjectType(page, 'DEBRIS');
  await clickCategory(page, 'ALL');
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().trackedCatalogState === 'ready');
  await expectCatalogCount(page, 1001, 1001);
  await expect(page.locator('#trackedDebrisFacetSummary')).toHaveText(
    '1,001 matches | 1,001 positioned | 0 position unavailable'
  );

  await expect.poll(async () => page.evaluate(async () => {
    const diagnostics = (await import('/js/satelliteTLELoader.js')).getSatellitePointCloudDiagnostics();
    return {
      count: diagnostics.debrisDrawnCount,
      selected: diagnostics.selectedDrawnCount,
      mode: diagnostics.markerMode
    };
  }), { timeout: 60_000 }).toEqual({ count: 1001, selected: 0, mode: 'density' });

  await selectSatellite(page, '80000');
  await setCheckbox(page, '#showOnlySelectedSatellite', false);
  await setCheckbox(page, '#showDayNightToggle', false);
  await setCheckbox(page, '#viewMercatorToggle', true);
  const canvas = page.locator('#mercatorCanvas');
  await expect.poll(() => canvas.getAttribute('data-debris-marker-count'), { timeout: 60_000 }).toBe('1001');
  await expect(canvas).toHaveAttribute('data-rendered-marker-count', '1001');
  await expect(canvas).toHaveAttribute('data-marker-mode', 'density');
  await expect(canvas).toHaveAttribute('data-object-type-marker-counts', '{"Debris":1001}');
  await expect(canvas).toHaveAttribute('data-selected-marker-norad-id', '80000');
  await expect(canvas).toHaveAttribute('data-selected-marker-rendered', 'true');
  const densityPixels = await canvas.evaluate(element => {
    const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
    let red = 0;
    let white = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 220 && pixels[index + 1] < 105 && pixels[index + 2] < 95 && pixels[index + 3] > 120) {
        red += 1;
      }
      if (pixels[index] > 240 && pixels[index + 1] > 240 && pixels[index + 2] > 240 && pixels[index + 3] > 180) {
        white += 1;
      }
    }
    return { red, white };
  });
  expect(densityPixels.red).toBeGreaterThan(25);
  expect(densityPixels.white).toBeGreaterThan(0);

  await selectSatellite(page, '80001');
  await setCheckbox(page, '#showOnlySelectedSatellite', false);
  await expect(canvas).toHaveAttribute('data-marker-mode', 'density');
  await expect(canvas).toHaveAttribute('data-selected-marker-norad-id', '80001');
  await expect(canvas).toHaveAttribute('data-selected-marker-rendered', 'true');
  await page.locator('#trackedDesignatorFacet').fill('2026-001AA');
  await expectCatalogCount(page, 1, 1001);
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().selectedNoradId === null);
  await expect(canvas).toHaveAttribute('data-marker-mode', 'detailed');
  await expect(canvas).toHaveAttribute('data-debris-marker-count', '1');
  await expect(canvas).toHaveAttribute('data-object-type-marker-counts', '{"Debris":1}');
  await expect(canvas).toHaveAttribute('data-selected-marker-norad-id', '');
  await expect(canvas).toHaveAttribute('data-selected-marker-rendered', 'false');
  const deselectedPixels = await canvas.evaluate(element => {
    const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
    let red = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 220 && pixels[index + 1] < 105 && pixels[index + 2] < 95 && pixels[index + 3] > 120) {
        red += 1;
      }
    }
    return red;
  });
  expect(deselectedPixels).toBeGreaterThan(0);
  await expect(page.locator('#trackedCountMetadataOnly')).toHaveText('0');

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('widening a lazy debris selection labels the union as loaded until all tracked chunks arrive', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The lazy catalog coverage transition runs once on desktop Chromium.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState(populatedTrackedFixture());

  await bootFilterFixture(page, state, '/index.html', { checkForDataUpdates: false });
  await clickObjectType(page, 'DEBRIS');
  await clickCategory(page, 'ALL');
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().trackedCatalogState === 'ready');
  expect(state.trackedChunkRequests).toEqual(['current-debris.json']);
  await expectCatalogCount(page, 3, 12);
  await expect(page.locator('#satelliteCountDisplay')).toHaveAttribute(
    'aria-label',
    '3 loaded objects match active filters out of 12 tracked catalog objects declared.'
  );

  const releases = [];
  for (const filename of [
    'current-payload.json',
    'current-rocket-body.json',
    'current-mission-related.json',
    'current-unknown.json'
  ]) {
    state.trackedChunkGates[filename] = new Promise(resolve => releases.push(resolve));
  }
  await clickObjectType(page, 'ALL');
  await expectCatalogCount(page, 11, 12, { partial: true });
  await expect.poll(() => state.trackedChunkRequests.includes('current-payload.json')).toBe(true);

  releases.forEach(resolve => resolve());
  await expect.poll(() => state.trackedChunkRequests.includes('current-unknown.json')).toBe(true);
  await expectCatalogCount(page, 12, 12);

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('a failed tracked debris chunk falls back to eligible GP debris', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The tracked-chunk failover boundary runs once on desktop Chromium.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState(populatedTrackedFixture());
  state.trackedChunkFailures = { 'current-debris.json': 503 };

  await bootFilterFixture(page, state, '/index.html', { checkForDataUpdates: false });
  await clickObjectType(page, 'DEBRIS');
  await clickCategory(page, 'ALL');
  await expect(page.locator('#trackedCatalogStatus')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#trackedCatalogStatus')).toContainText('using the orbital catalog');
  expect(state.trackedChunkRequests.length).toBeGreaterThan(0);
  expect(new Set(state.trackedChunkRequests)).toEqual(new Set(['current-debris.json']));
  await expectCatalogCount(page, 1, 12, { partial: true });
  expect(await visibleNoradIds(page)).toEqual(['110005']);
  await expect.poll(async () => page.evaluate(async () => {
    const diagnostics = (await import('/js/satelliteTLELoader.js')).getSatellitePointCloudDiagnostics();
    return diagnostics.objectTypeMarkerCounts.Debris || 0;
  })).toBe(1);
  expect(await page.evaluate(() => window.openbexiSimulation.markerState('110005'))).toMatchObject({
    filterVisible: true,
    visible: true
  });

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('rapid tracked-object filter changes cannot commit a stale chunk request', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The async filter race runs once on desktop Chromium.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState(populatedTrackedFixture());
  let releaseDebris;
  state.trackedChunkGates['current-debris.json'] = new Promise(resolve => { releaseDebris = resolve; });

  await bootFilterFixture(page, state, '/index.html', { checkForDataUpdates: false });
  await expect(page.locator('#trackedCatalogStatus')).toHaveAttribute('data-state', 'manifest');
  await clickObjectType(page, 'DEBRIS');
  expect(await pressedCategories(page)).toEqual(['MEO']);
  expect(await pressedObjectTypes(page)).toEqual(['DEBRIS']);

  await expect.poll(() => state.trackedChunkRequests.includes('current-debris.json')).toBe(true);

  await clickObjectType(page, 'PAYLOAD');
  await clickObjectType(page, 'DEBRIS');
  expect(await pressedObjectTypes(page)).toEqual(['PAYLOAD']);
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().trackedCatalogState === 'ready');
  await expect.poll(() => state.trackedChunkRequests.filter(name => name === 'current-payload.json').length)
    .toBeGreaterThan(0);
  await clickCategory(page, 'ALL');
  expect(await pressedCategories(page)).toEqual(['ALL']);

  releaseDebris();
  await page.waitForTimeout(250);
  expect(await pressedObjectTypes(page)).toEqual(['PAYLOAD']);
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().objectTypeFilter)).toEqual(['PAYLOAD']);
  await expectCatalogCount(page, 8, 12);
  expect(await visibleNoradIds(page)).toEqual([
    '110001', '110002', '110003', '110004', '110006', '110007', '110008', '110009'
  ]);
  expect(state.trackedChunkRequests).not.toContain('current-mission-related.json');
  expect(state.trackedChunkRequests).not.toContain('current-unknown.json');

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('historical SATCAT state suppresses a retained same-NORAD GP marker and commands', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The stale-GP reconciliation boundary runs once on desktop Chromium.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState(staleGpHistoricalOverlapFixture());

  await bootFilterFixture(page, state);
  await clickObjectType(page, 'DEBRIS');
  await clickCategory(page, 'ALL');
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().trackedCatalogState === 'ready');
  await expectCatalogCount(page, 2, 11);
  expect(await visibleNoradIds(page)).toEqual([]);

  await setCheckbox(page, '#includeHistoricalTrackedObjects', true);
  await page.waitForFunction(() => document.querySelector('#satelliteCountDisplay')?.textContent === '4 / 13');
  expect(await visibleNoradIds(page)).toEqual([]);
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().drawnNoradIds)).not.toContain('110005');
  expect(await page.evaluate(() => window.openbexiSimulation.markerState('110005'))).toMatchObject({
    filterVisible: false,
    visible: false
  });

  await selectSatellite(page, '110005');
  const snapshot = await page.evaluate(() => window.openbexiSimulation.snapshot());
  expect(snapshot.selectedNoradId).toBe('110005');
  expect(snapshot.selectedMeshUuid).toBeNull();
  expect(snapshot.selectedPosition).toBeNull();
  await expect(page.locator('#selectedSatelliteControls')).toBeHidden();
  for (const selector of [
    '#showYPRToggle',
    '#showFootprintCheckbox',
    '#showOnlySelectedSatellite',
    '#showOrbitFrameToggle',
    '#showOrbitToggle',
    '#yawSlider',
    '#pitchSlider',
    '#rollSlider'
  ]) {
    await expect(page.locator(selector)).toBeDisabled();
  }
  await expect(page.locator('#conjunctionRunButton')).toBeDisabled();
  await expect(page.locator('#selectedSatelliteDetailPanel')).toContainText('OBJECT_IS_HISTORICAL');

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('a selected GP model is demoted when current tracked metadata denies orbital elements', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The live current-element authority boundary runs once on desktop Chromium.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState(populatedTrackedFixture());

  await bootFilterFixture(page, state);
  await clickCategory(page, 'ALL');
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().trackedCatalogState === 'ready');
  await setCheckbox(page, '#includeHistoricalTrackedObjects', true);
  await page.waitForFunction(() => document.querySelector('#satelliteCountDisplay')?.textContent === '13 / 13');

  await selectSatellite(page, '110003');
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().selectedDetailedModelVisible === true);
  await setCheckbox(page, '#showOrbitToggle', true);
  await expect.poll(() => page.evaluate(() => window.openbexiSimulation.snapshot().selectedOrbitGeometryCount)).toBe(1);
  await expect(page.locator('#showOnlySelectedSatellite')).toBeChecked();

  const unavailableFixture = staleGpCurrentUnavailablePayloadOverlapFixture();
  state.trackedManifest = unavailableFixture.trackedManifest;
  state.trackedChunks = unavailableFixture.trackedChunks;
  state.trackedChunkGates = unavailableFixture.trackedChunkGates;
  const refresh = await page.evaluate(() => window.openbexiServerConnection.checkForDataUpdates());
  expect(refresh.changed).toBe(true);
  await page.waitForFunction(() => (
    document.querySelector('#selectedSatelliteDetailPanel')
      ?.textContent.includes('CURRENT_CATALOG_HAS_NO_VALIDATED_ELEMENTS')
  ));

  const snapshot = await page.evaluate(() => window.openbexiSimulation.snapshot());
  expect(snapshot.selectedNoradId).toBe('110003');
  expect(snapshot.selectedMeshUuid).toBeNull();
  expect(snapshot.selectedPosition).toBeNull();
  expect(snapshot.selectedDetailedModelVisible).toBe(false);
  expect(snapshot.selectedOrbitGeometryCount).toBe(0);
  expect(snapshot.visibleNoradIds).not.toContain('110003');
  expect(snapshot.drawnNoradIds).not.toContain('110003');
  expect(await visibleNoradIds(page)).not.toContain('110003');
  expect(await page.evaluate(() => window.openbexiSimulation.markerState('110003'))).toMatchObject({
    filterVisible: false,
    visible: false
  });
  await expect(page.locator('#showOnlySelectedSatellite')).not.toBeChecked();
  await expect(page.locator('#selectedSatelliteControls')).toBeHidden();
  for (const selector of [
    '#showYPRToggle',
    '#showFootprintCheckbox',
    '#showOnlySelectedSatellite',
    '#showOrbitFrameToggle',
    '#showOrbitToggle',
    '#yawSlider',
    '#pitchSlider',
    '#rollSlider'
  ]) {
    await expect(page.locator(selector)).toBeDisabled();
  }
  await expect(page.locator('#conjunctionRunButton')).toBeDisabled();
  await expect(page.locator('#selectedSatelliteDetailPanel')).toContainText('No current orbital elements');
  await expect(page.locator('#selectedSatelliteDetailPanel')).not.toContainText('OBJECT_IS_HISTORICAL');

  await setCheckbox(page, '#viewMercatorToggle', true);
  const mercatorCanvas = page.locator('#mercatorCanvas');
  await expect(mercatorCanvas).toHaveAttribute('data-selected-marker-norad-id', '110003');
  await expect(mercatorCanvas).toHaveAttribute('data-selected-marker-rendered', 'false');
  await expect(mercatorCanvas).toHaveAttribute('data-rendered-marker-count', '8');
  await expect(mercatorCanvas).toHaveAttribute('data-debris-marker-count', '1');
  await expect.poll(() => page.evaluate(async () => (
    (await import('/js/mercatorMapLoader.js')).groundTrackOptions.points.length
  ))).toBe(0);

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('shared category and tag filters restore as the same visible catalog', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Share-state restoration is covered once on desktop Chromium.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState();
  const sharedUrl = '/index.html?share=1&view3D=1&mercator=0&orbit=LEO&objects=PAYLOAD&tags=LEO%20OPS';
  await bootFilterFixture(page, state, sharedUrl);

  expect(await pressedCategories(page)).toEqual(['LEO']);
  expect(await pressedObjectTypes(page)).toEqual(['PAYLOAD']);
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().orbitTypeFilter))
    .toEqual(['LEO']);
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().objectTypeFilter))
    .toEqual(['PAYLOAD']);
  await expect(page.getByRole('checkbox', { name: 'LEO OPS' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'All tags' })).not.toBeChecked();
  expect(await visibleNoradIds(page)).toEqual(['110003', '110007']);
  await expectCatalogCount(page, 2);
  expect(new URL(page.url()).searchParams.has('debris')).toBe(false);

  const secondDocumentDecayCatalogBaseline = state.decayCatalogRequests;
  const secondDocumentDecayMetadataBaseline = state.decayMetadataRequests;
  await page.goto('/index.html?share=1&view3D=1&mercator=0&orbit=MEO&tags=GEO', {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForFunction(() => (
    window.openbexiStartupPerformance?.summary().some(entry => entry.name === 'first-interactive-ui') &&
    typeof window.openbexiSimulation?.snapshot === 'function'
  ));
  await expect.poll(() => state.decayCatalogRequests).toBeGreaterThan(secondDocumentDecayCatalogBaseline);
  await expect.poll(() => state.decayMetadataRequests).toBeGreaterThan(secondDocumentDecayMetadataBaseline);
  await expect(page.locator('#reentryTimelineToggle')).toBeEnabled();
  expect(await pressedCategories(page)).toEqual(['MEO']);
  expect(await pressedObjectTypes(page)).toEqual(['ALL']);
  await expect(page.getByRole('checkbox', { name: 'Geosynchronous group', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'GEO', exact: true })).toHaveCount(0);
  expect(await visibleNoradIds(page)).toEqual(['110008']);
  await expectCatalogCount(page, 1);
  expect(new URL(page.url()).searchParams.get('tags')).toBe('GEO');

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('known MEO and GEO markers have finite orbital radii and invalid selection is absent from Mercator', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Marker propagation diagnostics are covered once on desktop Chromium.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState();
  await bootFilterFixture(page, state);

  await page.waitForFunction(() => {
    const marker = window.openbexiSimulation.markerState('110008');
    return marker?.visible && Number.isFinite(marker.radius) && marker.radius > 20 && marker.radius < 35;
  });
  await clickCategory(page, 'GEO');
  await page.waitForFunction(() => {
    const marker = window.openbexiSimulation.markerState('110009');
    return marker?.visible && Number.isFinite(marker.radius) && marker.radius > 35 && marker.radius < 50;
  });
  const knownMarkers = await page.evaluate(() => ({
    gps: window.openbexiSimulation.markerState('110008'),
    goes: window.openbexiSimulation.markerState('110009')
  }));
  expect(knownMarkers.gps.position.every(Number.isFinite)).toBe(true);
  expect(knownMarkers.gps.propagationInvalid).toBe(false);
  expect(knownMarkers.goes.position.every(Number.isFinite)).toBe(true);
  expect(knownMarkers.goes.propagationInvalid).toBe(false);

  await clickCategory(page, 'ALL');
  await clickCategory(page, 'HEO');
  await selectSatellite(page, '110004');
  await setCheckbox(page, '#viewMercatorToggle', true);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#mercatorCanvas');
    return canvas?.dataset.selectedMarkerNoradId === '110004' &&
      canvas.dataset.selectedMarkerRendered === 'true';
  });

  await page.evaluate(() => window.openbexiSimulation.setTime('2029-05-19T00:00:00.000Z'));
  await page.waitForFunction(() => window.openbexiSimulation.markerState('110004')?.propagationInvalid === true);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#mercatorCanvas');
    return canvas?.dataset.selectedMarkerNoradId === '110004' &&
      canvas.dataset.selectedMarkerRendered === 'false' &&
      canvas.dataset.renderedMarkerCount === '0';
  });

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('Mercator overlay and fullscreen stay above operational panels with accessible exits', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState();
  await bootFilterFixture(page, state);

  await selectSatellite(page, '110002');
  const detailPanel = page.locator('#selectedSatelliteDetailPanel');
  await page.locator('#timelinesAccordionHeader').click();
  await setCheckbox(page, '#launchTimelineToggle', true);
  await expect(page.locator('.timeline-hud:visible')).toBeVisible();
  await setCheckbox(page, '#view3DToggle', true);
  await setCheckbox(page, '#viewMercatorToggle', true);
  const menuConstrainedLayout = await page.evaluate(() => matchMedia('(max-width: 1280px)').matches);
  if (menuConstrainedLayout) {
    await page.locator('#menuToggleBtn').click();
    await expect(page.locator('#controlsContainer')).toHaveClass(/menu-hidden/);
  }
  await expect(detailPanel).toBeVisible();
  await expect(detailPanel).toContainText('DUPLICATE GP NAME');
  const mercator = page.locator('#mercatorContainer');
  await expect(mercator).toHaveClass(/globe-overlay/);
  await expect(mercator).toBeVisible();
  const globeCanvasPaint = await page.locator('body > canvas:not(#mercatorCanvas)').first().evaluate(element => {
    const gl = element.getContext('webgl2') || element.getContext('webgl');
    if (!gl) return 0;
    const pixel = new Uint8Array(4);
    let painted = 0;
    for (let y = 1; y <= 5; y += 1) for (let x = 1; x <= 5; x += 1) {
      gl.readPixels(Math.floor(gl.drawingBufferWidth * x / 6), Math.floor(gl.drawingBufferHeight * y / 6), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      if (pixel[3] > 0 && pixel[0] + pixel[1] + pixel[2] > 12) painted += 1;
    }
    return painted;
  });
  expect(globeCanvasPaint).toBeGreaterThan(0);
  const mercatorPaint = await page.locator('#mercatorCanvas').evaluate(element => {
    const context = element.getContext('2d');
    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    let painted = 0;
    for (let offset = 3; offset < pixels.length; offset += 16) {
      if (pixels[offset] > 0) painted += 1;
    }
    return painted;
  });
  expect(mercatorPaint).toBeGreaterThan(0);
  await testInfo.attach(`mercator-overlay-${testInfo.project.name}`, {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png'
  });

  const assertMercatorLayer = async expectedClass => {
    const layer = await page.evaluate((className) => {
      const map = document.querySelector('#mercatorContainer');
      const timeline = [...document.querySelectorAll('.timeline-hud')]
        .find(element => getComputedStyle(element).display !== 'none');
      const details = document.querySelector('#selectedSatelliteDetailPanel');
      const controls = document.querySelector('#controlsContainer');
      const timeControls = document.querySelector('#timeWarpBox');
      const rect = map.getBoundingClientRect();
      const timelineRect = timeline.getBoundingClientRect();
      const overlapLeft = Math.max(rect.left, timelineRect.left);
      const overlapRight = Math.min(rect.right, timelineRect.right);
      const overlapTop = Math.max(rect.top, timelineRect.top);
      const overlapBottom = Math.min(rect.bottom, timelineRect.bottom);
      const x = overlapRight > overlapLeft ? overlapRight - 10 : rect.right - 10;
      const y = overlapBottom > overlapTop
        ? overlapTop + ((overlapBottom - overlapTop) / 2)
        : rect.top + (rect.height * 0.7);
      const topElement = document.elementFromPoint(x, y);
      const detailRect = details.getBoundingClientRect();
      const detailOverlapLeft = Math.max(rect.left, detailRect.left);
      const detailOverlapRight = Math.min(rect.right, detailRect.right);
      const detailOverlapTop = Math.max(rect.top, detailRect.top);
      const detailOverlapBottom = Math.min(rect.bottom, detailRect.bottom);
      const overlapsDetails = detailOverlapRight > detailOverlapLeft && detailOverlapBottom > detailOverlapTop;
      const detailTopElement = overlapsDetails
        ? document.elementFromPoint(
          detailOverlapLeft + ((detailOverlapRight - detailOverlapLeft) / 2),
          detailOverlapTop + ((detailOverlapBottom - detailOverlapTop) / 2)
        )
        : null;
      return {
        hasClass: map.classList.contains(className),
        mapZ: Number(getComputedStyle(map).zIndex),
        timelineZ: Number(getComputedStyle(timeline).zIndex),
        detailsZ: Number(getComputedStyle(details).zIndex),
        controlsZ: Number(getComputedStyle(controls).zIndex),
        timeControlsZ: Number(getComputedStyle(timeControls).zIndex),
        detailsVisible: !details.hidden && getComputedStyle(details).display !== 'none',
        overlapsDetails,
        detailTopIsMercator: overlapsDetails ? !!detailTopElement?.closest('#mercatorContainer') : null,
        topIsMercator: !!topElement?.closest('#mercatorContainer')
      };
    }, expectedClass);
    expect(layer.hasClass).toBe(true);
    expect(layer.mapZ).toBeGreaterThan(layer.timelineZ);
    expect(layer.mapZ).toBeGreaterThan(layer.detailsZ);
    expect(layer.detailsVisible).toBe(true);
    if (layer.overlapsDetails) expect(layer.detailTopIsMercator).toBe(true);
    if (expectedClass === 'globe-overlay') {
      expect(layer.mapZ).toBeGreaterThan(layer.controlsZ);
      expect(layer.mapZ).toBeGreaterThan(layer.timeControlsZ);
    } else {
      expect(layer.controlsZ).toBeGreaterThan(layer.mapZ);
      expect(layer.timeControlsZ).toBeGreaterThan(layer.mapZ);
    }
    expect(layer.topIsMercator).toBe(true);
  };

  await assertMercatorLayer('globe-overlay');
  await setCheckbox(page, '#view3DToggle', false);
  await expect(mercator).toHaveClass(/fullscreen/);
  await assertMercatorLayer('fullscreen');
  const exitButton = page.getByRole('button', { name: 'Exit full-screen Mercator map' });
  await expect(exitButton).toBeVisible();
  if (menuConstrainedLayout) {
    await page.locator('#menuToggleBtn').click();
    await expect(page.locator('#controlsContainer')).not.toHaveClass(/menu-hidden/);
  }
  await page.locator('#serverStatusButton').click();
  await expect(page.locator('#serverStatusPanel')).toBeVisible();
  await page.locator('#serverStatusButton').click();
  await expect(page.locator('#serverStatusPanel')).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(mercator).toHaveClass(/globe-overlay/);
  await expect(page.locator('#view3DToggle')).toBeChecked();

  await setCheckbox(page, '#view3DToggle', false);
  await expect(exitButton).toBeVisible();
  await exitButton.click();
  await expect(mercator).toHaveClass(/globe-overlay/);
  await expect(page.locator('#view3DToggle')).toBeChecked();
  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});
