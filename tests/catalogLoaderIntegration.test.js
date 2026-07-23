import assert from 'node:assert/strict';
import * as satellite from 'satellite.js';
import * as THREE from 'three';
import {
  activeCatalogQualitySummary,
  activeCatalogValidationSnapshot,
  buildTleDatasetProvenance,
  computeTleDatasetHash,
  getActiveCatalogQualitySummary,
  getActiveCatalogValidationSnapshot,
  getLastCatalogQualitySummary,
  getLastCatalogValidationSnapshot,
  resolveCatalogRuntimePolicy,
  satellites,
  setupTLESatellites,
  validateTleCatalogForDisplay
} from '../js/satelliteTLELoader.js';

const line1 = '1 44714U 19074B   26193.55886833  .00056372  00000+0  87819-3 0  9996';
const line2 = '2 44714  53.1517 306.9551 0004043 312.7639  47.3031 15.53348743368159';
const sgp4InvalidLine1 = '1 44715U 19074C   26193.55886833  .00056372  00000+0  87819-3 0  9997';
const sgp4InvalidLine2 = '2 44715  53.1517 306.9551 9999999 312.7639  47.3031 15.53348743368152';
const malformedBstarLine1 = '1 44715U 19074C   26193.55886833  .00056372  00000+0  ABCDE-F 0  9991';
const valid44715Line2 = '2 44715  53.1517 306.9551 0004043 312.7639  47.3031 15.53348743368150';
const metadata = Object.freeze({
  fetched_at: '2026-07-12T20:42:52.500147Z',
  last_success_at: '2026-07-12T20:42:52.500147Z',
  last_status: 'ok',
  source_urls: ['https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle'],
  counts: { rejected: 0 }
});
const incrementalMetadata = Object.freeze({
  ...metadata,
  mode: 'incremental',
  counts: { rejected: 0, fetched: 1, total: 2 }
});

function validRecord(overrides = {}) {
  return {
    company: 'Original Display Company',
    satellite_name: 'Original Display Name',
    norad_id: '44714',
    object_type: 'PAYLOAD',
    orbit_class: 'LEO',
    lifecycle_status: 'ACTIVE',
    launch_date: '2019-11-11',
    inclination_deg: 53.1517,
    eccentricity: 0.0004043,
    mean_motion_rev_per_day: 15.53348743,
    tle_line1: line1,
    tle_line2: line2,
    ...overrides
  };
}

async function run() {
  assert.deepEqual(resolveCatalogRuntimePolicy({
    deploymentMode: 'static',
    allowRemoteCatalogFallback: true
  }), {
    deployment_mode: 'static',
    packaged_catalog_required: true,
    allow_remote_catalog_fallback: false
  }, 'static mode cannot opt back into a remote catalog fallback');
  assert.equal(resolveCatalogRuntimePolicy({
    deploymentMode: 'server-capable',
    allowRemoteCatalogFallback: true
  }).allow_remote_catalog_fallback, true, 'source development mode may explicitly allow remote fallback');

  const satelliteLib = {
    twoline2satrec: satellite.twoline2satrec,
    propagate: () => ({ position: { x: 7000, y: 0, z: 0 } })
  };
  const first = validRecord();
  const second = validRecord({
    norad_id: '44715',
    tle_line1: '1 44715U 19074C   26193.55886833  .00056372  00000+0  87819-3 0  9995',
    tle_line2: '2 44715  53.1517 306.9551 0004043 312.7639  47.3031 15.53348743368150'
  });
  const hashForward = await computeTleDatasetHash([first, second]);
  const hashReverse = await computeTleDatasetHash([second, first]);
  assert.equal(hashForward, hashReverse, 'dataset hash is independent of source row order');
  assert.match(hashForward, /^(sha256:[a-f0-9]{64}|fnv1a64:[a-f0-9]{16})$/);

  const provenance = await buildTleDatasetProvenance([first], metadata, {
    reference_time: '2026-07-19T00:00:00Z'
  });
  assert.equal(provenance.source_status, 'COMPLETE');
  assert.equal(provenance.partial_update, false);
  assert.equal(provenance.provider, 'CelesTrak');
  assert.equal(provenance.retrieved_at, '2026-07-12T20:42:52.500Z');

  const provenanceWithoutMetadata = await buildTleDatasetProvenance([first], null, {
    reference_time: '2026-07-19T00:00:00Z'
  });
  assert.equal(provenanceWithoutMetadata.retrieved_at, null);
  assert.equal(provenanceWithoutMetadata.source_status, 'DEGRADED');
  assert.match(provenance.dataset_id, /^tle-catalog:/);

  const incrementalProvenance = await buildTleDatasetProvenance([first], incrementalMetadata, {
    reference_time: '2026-07-19T00:00:00Z'
  });
  assert.equal(incrementalProvenance.source_status, 'PARTIAL');
  assert.equal(incrementalProvenance.partial_update, true);

  const degradedProvenance = await buildTleDatasetProvenance([first], null, {
    reference_time: '2026-07-19T00:00:00Z'
  });
  assert.equal(degradedProvenance.source_status, 'DEGRADED');

  const corrupt = validRecord({
    satellite_name: 'CORRUPT ROW',
    norad_id: '44718',
    inclination_deg: 53.1549,
    eccentricity: 0.0004464,
    mean_motion_rev_per_day: 15.53737374,
    tle_line1: '1 44718U 19074F   26193.54942377  .00054437  00000+0  83659-3 0  9990',
    tle_line2: '2 44718  53.1549 307.2201 0004464 316.0938  43.9717 15.53737374368144'
  });
  const validated = await validateTleCatalogForDisplay([first, corrupt], metadata, {
    reference_time: '2026-07-19T00:00:00Z'
  });
  assert.equal(validated.result.valid, true, 'a partially usable catalog remains loadable');
  assert.equal(validated.snapshot.status, 'PARTIAL');
  assert.equal(validated.records.length, 1);
  assert.equal(validated.records[0].company, first.company, 'original display metadata is preserved');
  assert.equal(first.catalogObject, undefined, 'source input is not mutated');
  assert.equal(validated.records[0].catalogObject.object_id, 'obx:norad:44714');
  assert.equal(validated.snapshot.quarantine.length, 1);
  assert(validated.snapshot.quarantine[0].reason_codes.includes('TLE_CHECKSUM_MISMATCH'));

  const sgp4Invalid = validRecord({
    satellite_name: 'SGP4 INVALID ROW',
    norad_id: '44715',
    eccentricity: 0.9999999,
    tle_line1: sgp4InvalidLine1,
    tle_line2: sgp4InvalidLine2
  });
  const parseabilityValidated = await validateTleCatalogForDisplay([first, sgp4Invalid], metadata, {
    reference_time: '2026-07-19T00:00:00Z',
    satelliteLib
  });
  assert.equal(parseabilityValidated.result.valid, true, 'a catalog with one parseable row remains loadable');
  assert.equal(parseabilityValidated.snapshot.status, 'PARTIAL');
  assert.equal(parseabilityValidated.records.length, 1);
  assert.equal(parseabilityValidated.snapshot.quality.quarantined_records, 1);
  assert(parseabilityValidated.snapshot.quarantine[0].reason_codes.includes('TLE_SGP4_INITIALIZATION_FAILED'));

  const malformedBstar = validRecord({
    satellite_name: 'MALFORMED BSTAR ROW',
    norad_id: '44715',
    tle_line1: malformedBstarLine1,
    tle_line2: valid44715Line2
  });
  const strictLine1Validated = await validateTleCatalogForDisplay([first, malformedBstar], metadata, {
    reference_time: '2026-07-19T00:00:00Z',
    satelliteLib
  });
  assert.equal(strictLine1Validated.result.valid, true);
  assert.equal(strictLine1Validated.snapshot.status, 'PARTIAL');
  assert.equal(strictLine1Validated.records.length, 1);
  assert(strictLine1Validated.snapshot.quarantine[0].reason_codes.includes('TLE_BSTAR_INVALID'));

  const scene = new THREE.Scene();
  const loaded = await setupTLESatellites(scene, {
    tleDataOverride: [first, corrupt, sgp4Invalid],
    tleMetaOverride: metadata,
    tleDataSource: 'integration fixture',
    referenceTime: '2026-07-19T00:00:00Z',
    satelliteMaterialOverride: new THREE.SpriteMaterial({ color: 0xffffff }),
    satelliteLib
  });
  assert.equal(loaded.length, 1);
  assert.equal(satellites.length, 1);
  assert.equal(scene.children.length, 1, 'only an accepted row creates a sprite');
  assert.equal(satellites[0].satellite_name, first.satellite_name);
  assert.equal(satellites[0].company, first.company);
  assert.equal(satellites[0].object_id, 'obx:norad:44714');
  assert.equal(satellites[0].object_type, 'PAYLOAD');
  assert.equal(satellites[0].orbit_class, 'LEO');
  assert.equal(satellites[0].lifecycle_status, 'ACTIVE');
  assert.equal(satellites[0].element_set.element_set_id, satellites[0].catalogObject.element_set.element_set_id);
  assert.equal(satellites[0].provenance.dataset_hash, satellites[0].catalogObject.provenance.dataset_hash);
  assert.equal(activeCatalogValidationSnapshot.status, 'PARTIAL');
  assert.equal(activeCatalogQualitySummary.accepted_records, 1);
  assert.equal(getActiveCatalogValidationSnapshot(), activeCatalogValidationSnapshot);
  assert.equal(getActiveCatalogQualitySummary(), activeCatalogQualitySummary);
  assert.equal(getActiveCatalogQualitySummary().quarantined_records, 2);

  const emptyAfterValidation = await setupTLESatellites(scene, {
    tleDataOverride: [corrupt],
    tleMetaOverride: metadata,
    tleDataSource: 'integration fixture',
    referenceTime: '2026-07-19T00:00:00Z',
    satelliteMaterialOverride: new THREE.SpriteMaterial({ color: 0xffffff }),
    satelliteLib
  });
  assert.equal(emptyAfterValidation.length, 1);
  assert.equal(scene.children.length, 1, 'a fully quarantined reload preserves the last usable catalog atomically');
  assert.equal(getActiveCatalogValidationSnapshot().status, 'PARTIAL');
  assert.equal(getActiveCatalogQualitySummary().accepted_records, 1);
  assert.equal(getLastCatalogValidationSnapshot().status, 'INVALID');
  assert.equal(getLastCatalogQualitySummary().quarantined_records, 1);

  const parseInvalidAfterValidation = await setupTLESatellites(scene, {
    tleDataOverride: [sgp4Invalid],
    tleMetaOverride: metadata,
    tleDataSource: 'integration fixture',
    referenceTime: '2026-07-19T00:00:00Z',
    satelliteMaterialOverride: new THREE.SpriteMaterial({ color: 0xffffff }),
    satelliteLib
  });
  assert.equal(parseInvalidAfterValidation.length, 1);
  assert.equal(scene.children.length, 1, 'an SGP4-invalid reload preserves the last usable catalog atomically');
  assert(getLastCatalogValidationSnapshot().quarantine[0].reason_codes.includes('TLE_SGP4_INITIALIZATION_FAILED'));
}

await run();
console.log('catalog loader integration tests passed');
