import assert from 'node:assert/strict';
import * as satellite from 'satellite.js';
import * as THREE from 'three';
import {
    satellites,
    setupTLESatellites,
    syncSatellitePointCloud,
    validateGpCatalogForDisplay
} from '../js/satelliteTLELoader.js';

const metadata = Object.freeze({
    fetched_at: '2026-08-22T12:00:00Z',
    last_success_at: '2026-08-22T12:00:00Z',
    last_status: 'ok',
    source_urls: ['https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'],
    counts: { rejected: 0 }
});

function ommRecord(noradId, epoch, overrides = {}) {
    return {
        satellite_name: `OMM ${noradId}`,
        norad_id: String(noradId),
        object_id: '2026-100A',
        object_type: 'PAYLOAD',
        lifecycle_status: 'ACTIVE',
        orbit_class: 'LEO',
        launch_date: '2026-08-20',
        source_format: 'CCSDS_OMM_JSON',
        tle_line1: null,
        tle_line2: null,
        element_set: {
            format: 'OMM',
            epoch,
            time_scale: 'UTC',
            native_frame: 'TEME',
            propagation_theory: 'SGP4',
            omm: {
                CCSDS_OMM_VERS: '2.0',
                OBJECT_NAME: `OMM ${noradId}`,
                OBJECT_ID: '2026-100A',
                CENTER_NAME: 'EARTH',
                REF_FRAME: 'TEME',
                TIME_SYSTEM: 'UTC',
                MEAN_ELEMENT_THEORY: 'SGP4',
                EPOCH: epoch,
                MEAN_MOTION: 15.5,
                ECCENTRICITY: 0.0004,
                INCLINATION: 53.1,
                RA_OF_ASC_NODE: 307.2,
                ARG_OF_PERICENTER: 316.1,
                MEAN_ANOMALY: 44.0,
                EPHEMERIS_TYPE: 0,
                NORAD_CAT_ID: String(noradId),
                ELEMENT_SET_NO: 1,
                REV_AT_EPOCH: 10,
                BSTAR: 0.00008,
                MEAN_MOTION_DOT: 0.0005,
                MEAN_MOTION_DDOT: 0
            }
        },
        ...overrides
    };
}

const tle = {
    satellite_name: 'TLE 44714',
    norad_id: '44714',
    object_type: 'PAYLOAD',
    orbit_class: 'LEO',
    lifecycle_status: 'ACTIVE',
    launch_date: '2019-11-11',
    tle_line1: '1 44714U 19074B   26193.55886833  .00056372  00000+0  87819-3 0  9996',
    tle_line2: '2 44714  53.1517 306.9551 0004043 312.7639  47.3031 15.53348743368159'
};

const newest = ommRecord('100001', '2026-08-22T10:00:00Z');
const older = ommRecord('100001', '2026-08-21T10:00:00Z');
const nineDigit = ommRecord('123456789', '2026-08-22T09:00:00Z', { object_id: '2026-101A' });
for (const key of ['CCSDS_OMM_VERS', 'CENTER_NAME', 'REF_FRAME', 'TIME_SYSTEM', 'MEAN_ELEMENT_THEORY']) {
    delete nineDigit.element_set.omm[key];
}
const validation = await validateGpCatalogForDisplay([tle, older, newest, nineDigit], metadata, {
    satelliteLib: satellite,
    reference_time: '2026-08-22T12:00:00Z'
});

assert.equal(validation.result.valid, true);
assert.equal(validation.records.length, 3, 'mixed catalog keeps TLE and newest OMM per NORAD ID');
assert.equal(validation.records.find(record => record.norad_id === '100001').catalogObject.element_set.epoch, '2026-08-22T10:00:00.000Z');
assert.equal(validation.records.find(record => record.norad_id === '123456789').catalogObject.norad_id, '123456789');
assert.equal(validation.records.find(record => record.norad_id === '123456789').catalogObject.element_set.omm.REF_FRAME, 'TEME');
assert(validation.snapshot.quarantine.some(item => item.reason_codes.includes('DUPLICATE_OBJECT_ID')));
assert.deepEqual(validation.quality.by_format, { TLE: 1, OMM: 2 });

const classifiedMeo = ommRecord('100010', '2026-08-22T08:00:00Z', {
    orbit_class: 'MEO',
    lifecycle_status: 'ACTIVE'
});
classifiedMeo.element_set.omm.MEAN_MOTION = 2.0056;
classifiedMeo.element_set.omm.INCLINATION = 55;
const classifiedGeo = ommRecord('100011', '2026-08-22T08:30:00Z', {
    object_type: 'ROCKET_BODY',
    orbit_class: 'GEO',
    lifecycle_status: 'RETIRED'
});
classifiedGeo.element_set.omm.MEAN_MOTION = 1.0027;
classifiedGeo.element_set.omm.INCLINATION = 0.1;
classifiedGeo.element_set.omm.OBJECT_TYPE = 'UNKNOWN';
const classifiedSource = [classifiedMeo, classifiedGeo];
const classifiedSourceBeforeValidation = structuredClone(classifiedSource);
const classifiedValidation = await validateGpCatalogForDisplay(classifiedSource, metadata, {
    satelliteLib: satellite,
    reference_time: '2026-08-22T12:00:00Z'
});
const meoCatalogObject = classifiedValidation.records.find(record => record.norad_id === '100010').catalogObject;
const geoCatalogObject = classifiedValidation.records.find(record => record.norad_id === '100011').catalogObject;
assert.equal(meoCatalogObject.orbit_class, 'MEO', 'GP display classification reaches the canonical OMM consumer');
assert.equal(geoCatalogObject.orbit_class, 'GEO', 'GEO classification survives OMM canonicalization');
assert.deepEqual(
    classifiedValidation.snapshot.objects.map(record => record.orbit_class),
    ['MEO', 'GEO'],
    'canonical snapshot consumers retain validated GP orbit classes'
);
assert.equal(geoCatalogObject.object_type, 'ROCKET_BODY', 'known display object type fills an unknown OMM classification');
assert.equal(geoCatalogObject.lifecycle_status, 'RETIRED', 'known display lifecycle fills the canonical consumer object');
assert(!geoCatalogObject.quality_flags.includes('OBJECT_TYPE_UNKNOWN'));
assert(!geoCatalogObject.quality_flags.includes('LIFECYCLE_STATUS_UNKNOWN'));
assert(Object.isFrozen(geoCatalogObject));
assert.deepEqual(classifiedSource, classifiedSourceBeforeValidation, 'GP validation does not mutate source records');
assert.equal(classifiedGeo.catalogObject, undefined);

const malformed = structuredClone(newest);
malformed.element_set.omm.MEAN_MOTION = 'not-a-number';
const malformedValidation = await validateGpCatalogForDisplay([newest, malformed], metadata, {
    satelliteLib: satellite,
    reference_time: '2026-08-22T12:00:00Z'
});
assert.equal(malformedValidation.records.length, 1, 'malformed OMM is quarantined without discarding valid records');
assert(malformedValidation.snapshot.quarantine.some(item => item.format === 'OMM'));

const scene = new THREE.Scene();
await setupTLESatellites(scene, {
    gpDataOverride: [newest],
    gpMetaOverride: metadata,
    gpDataSource: 'OMM integration fixture',
    referenceTime: '2026-08-22T12:00:00Z',
    satelliteMaterialOverride: new THREE.SpriteMaterial({ color: 0xffffff }),
    satelliteLib: satellite
});
assert.equal(satellites.length, 1);
assert.equal(satellites[0].norad_id, '100001');
assert.equal(satellites[0].element_set.format, 'OMM');
assert.equal(satellites[0].orbitType, 'LEO', 'normalized GP orbit class survives OMM canonicalization');
assert.equal(satellites[0].tle_line1, null, 'OMM is not converted into a synthetic TLE');
assert(Number.isFinite(satellite.propagate(satellites[0].satrec, new Date(newest.element_set.epoch)).position.x));
assert.equal(scene.children.length, 1, 'OMM-only satellite renders as a selectable marker layer');
assert.equal(satellites[0].mesh.visible, false, 'a catalog marker stays hidden until motion sampling commits a position');
assert.equal(satellites[0].motionPositionReady, false);
assert.equal(scene.children[0].type, 'Points', 'catalog markers share one batched Three.js draw layer');
satellites[0].mesh.position.set(8, 1, 2);
satellites[0].mesh.visible = true;
satellites[0].motionPositionReady = true;
assert.equal(syncSatellitePointCloud(satellites), 1);
assert.equal(scene.children[0].geometry.drawRange.count, 1);
assert.deepEqual(
    Array.from(scene.children[0].geometry.getAttribute('position').array.slice(0, 3)),
    [8, 1, 2],
    'the point cloud consumes the committed proxy position'
);

const priorityRecord = ommRecord('100002', '2026-08-22T11:00:00Z', {
    object_id: '2026-102A',
    orbit_class: 'MEO'
});
priorityRecord.element_set.omm.OBJECT_ID = '2026-102A';
let firstChunkSnapshot = null;
await setupTLESatellites(scene, {
    gpDataOverride: [newest, priorityRecord],
    gpMetaOverride: metadata,
    gpDataSource: 'priority integration fixture',
    referenceTime: '2026-08-22T12:00:00Z',
    satelliteMaterialOverride: new THREE.SpriteMaterial({ color: 0xffffff }),
    satelliteLib: satellite,
    chunkSize: 1,
    schedulerOptions: { windowObj: null, setTimeoutFn: callback => (callback(), 1) },
    priorityRecordPredicate: record => record.norad_id === '100002',
    onCatalogChunk: ({ processed, loadedSatellites }) => {
        if (processed === 1) {
            firstChunkSnapshot = loadedSatellites.map(record => ({
                noradId: record.norad_id,
                visible: record.mesh.visible,
                positionReady: record.motionPositionReady
            }));
        }
    }
});
assert.deepEqual(firstChunkSnapshot, [{
    noradId: '100002',
    visible: false,
    positionReady: false
}], 'the priority category is materialized first without rendering origin markers');
assert.deepEqual(satellites.map(record => record.norad_id), ['100002', '100001']);
assert.equal(scene.children.length, 1, 'multiple catalog records still use one point-cloud scene object');

const unusableGp = structuredClone(newest);
unusableGp.element_set.omm.MEAN_MOTION = 'not-a-number';
await setupTLESatellites(scene, {
    gpDataOverride: [unusableGp],
    gpMetaOverride: metadata,
    gpDataSource: 'unusable GP fixture',
    tleDataOverride: [tle],
    tleMetaOverride: metadata,
    tleDataSource: 'legacy TLE fallback fixture',
    referenceTime: '2026-08-22T12:00:00Z',
    satelliteMaterialOverride: new THREE.SpriteMaterial({ color: 0xffffff }),
    satelliteLib: satellite
});
assert.equal(satellites.length, 1);
assert.equal(satellites[0].norad_id, '44714', 'all-quarantined GP data falls back to usable TLE data');
assert.equal(satellites[0].element_set.format, 'TLE');
assert.equal(scene.children.length, 1, 'fallback replaces the scene only after TLE validation succeeds');

console.log('GP mixed catalog loader tests passed');
