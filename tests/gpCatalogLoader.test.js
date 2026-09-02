import assert from 'node:assert/strict';
import * as satellite from 'satellite.js';
import * as THREE from 'three';
import {
    GLOBE_DETAILED_ICON_LIMIT,
    GLOBE_DETAILED_ICON_SIZE_PX,
    getSatellitePointCloudDiagnostics,
    globePointMarkerMode,
    pickSatellitePoint,
    satellitePointClientPosition,
    satellites,
    setupTLESatellites,
    syncSatellitePointCloud,
    validateGpCatalogForDisplay
} from '../js/satelliteTLELoader.js';

assert.equal(GLOBE_DETAILED_ICON_LIMIT, 500, 'the Globe icon-density boundary is explicit');
assert.equal(GLOBE_DETAILED_ICON_SIZE_PX, 16, 'detailed Globe artwork has a legible fixed screen size');
assert.equal(globePointMarkerMode(499), 'detailed', 'fewer than 500 drawn objects retain detailed icon sprites');
assert.equal(globePointMarkerMode(500), 'density', '500 drawn objects switch to the scalable density style');

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
const markerMap = scene.children[0].material.map;
assert.equal(markerMap?.name, 'openbexiCanonicalPointMarker',
    'detailed point markers use the canonical white mask instead of a colored icon texture');
const markerPixels = markerMap.image.data;
for (let offset = 0; offset < markerPixels.length; offset += 4) {
    if (markerPixels[offset + 3] === 0) continue;
    assert.deepEqual(Array.from(markerPixels.slice(offset, offset + 3)), [255, 255, 255],
        'the point sprite cannot tint canonical object-type or selection colors');
}
const pointIconShader = { fragmentShader: '#include <map_particle_fragment>' };
scene.children[0].material.onBeforeCompile(pointIconShader);
assert.match(pointIconShader.fragmentShader, /diffuseColor\.a \*= texture2D\( map, openbexiPointIconUv \)\.a/,
    'the detailed marker shader samples only the icon alpha silhouette');
assert.doesNotMatch(pointIconShader.fragmentShader, /diffuseColor \*= texture2D/,
    'the icon RGB cannot multiply authoritative per-vertex marker colors');
assert.deepEqual(
    {
        source: getSatellitePointCloudDiagnostics().detailedMarkerSource,
        asset: getSatellitePointCloudDiagnostics().detailedMarkerAssetPath,
        alphaTint: getSatellitePointCloudDiagnostics().detailedMarkerUsesAlphaTint
    },
    { source: 'procedural-fallback', asset: null, alphaTint: true },
    'map-less injected materials use the explicit procedural fallback and alpha-only tint path'
);
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
satellites[0].object_type = 'DEBRIS';
satellites[0].isSelected = false;
syncSatellitePointCloud(satellites);
const debrisColor = Array.from(scene.children[0].geometry.getAttribute('color').array.slice(0, 3));
assert(Math.abs(debrisColor[0] - 1) < 1e-6 && debrisColor[1] < 0.1 && debrisColor[2] < 0.05,
    'a positioned debris marker is uploaded in the canonical red palette');
assert.equal(getSatellitePointCloudDiagnostics(satellites).debrisDrawnCount, 1,
    'point-cloud diagnostics report rendered debris independently of selection color');
satellites[0].isSelected = true;
syncSatellitePointCloud(satellites);
assert.deepEqual(
    Array.from(scene.children[0].geometry.getAttribute('color').array.slice(0, 3)),
    [1, 1, 1],
    'selection uses a white marker so it is distinguishable from red debris'
);
assert.equal(getSatellitePointCloudDiagnostics(satellites).selectedDrawnCount, 1);
const pickingCamera = new THREE.PerspectiveCamera(45, 2, 0.1, 100);
pickingCamera.position.set(0, 0, 30);
pickingCamera.lookAt(0, 0, 0);
pickingCamera.updateProjectionMatrix();
pickingCamera.updateMatrixWorld(true);
const projectedPoint = satellites[0].mesh.position.clone().project(pickingCamera);
const pickingRect = { left: 100, top: 50, width: 800, height: 400 };
const pickedSatellite = pickSatellitePoint(pickingCamera, {
    clientX: pickingRect.left + (projectedPoint.x + 1) * pickingRect.width / 2,
    clientY: pickingRect.top + (1 - projectedPoint.y) * pickingRect.height / 2,
    rect: pickingRect
});
assert.equal(pickedSatellite, satellites[0], 'Globe picking resolves the exact rendered record');
const nearOverlappingRecord = {
    norad_id: '900000010',
    satellite_name: 'NEAR OVERLAPPING MARKER',
    object_type: 'PAYLOAD',
    isSelected: false,
    motionPositionReady: true,
    mesh: { visible: true, position: new THREE.Vector3(0, 0, 10) }
};
const farOverlappingRecord = {
    norad_id: '900000011',
    satellite_name: 'FAR OVERLAPPING MARKER',
    object_type: 'PAYLOAD',
    isSelected: false,
    motionPositionReady: true,
    mesh: { visible: true, position: new THREE.Vector3(0, 0, 8) }
};
syncSatellitePointCloud([nearOverlappingRecord, farOverlappingRecord]);
const overlappingPoint = satellitePointClientPosition(pickingCamera, nearOverlappingRecord, pickingRect);
assert.equal(
    pickSatellitePoint(pickingCamera, {
        clientX: overlappingPoint.x,
        clientY: overlappingPoint.y,
        rect: pickingRect
    }),
    nearOverlappingRecord,
    'Globe picking resolves overlapping markers to the visually nearest rendered point'
);
syncSatellitePointCloud(satellites);
assert.equal(pickSatellitePoint(pickingCamera, {
    clientX: pickingRect.left,
    clientY: pickingRect.top,
    rect: pickingRect
}, { maxDistancePx: 4 }), null, 'Globe picking ignores clicks outside the marker hit radius');
assert.equal(satellitePointClientPosition(pickingCamera, {
    ...satellites[0],
    mesh: { ...satellites[0].mesh, position: new THREE.Vector3(0, 0, -8), visible: true }
}, pickingRect, { occluderRadius: 6.378137 }), null,
'Globe picking cannot select a projected record through the Earth');

const selectedFirstDebris = {
    norad_id: '900000001',
    satellite_name: 'SELECTED FIRST DEBRIS',
    object_type: 'DEBRIS',
    isSelected: true,
    motionPositionReady: true,
    mesh: {
        visible: true,
        position: new THREE.Vector3(9, 2, 3)
    }
};
syncSatellitePointCloud([selectedFirstDebris]);
assert.deepEqual(
    Array.from(scene.children[0].geometry.getAttribute('color').array.slice(0, 3)),
    [1, 1, 1],
    'a selected-first debris record starts with the white selection color'
);
assert.equal(getSatellitePointCloudDiagnostics([selectedFirstDebris]).debrisDrawnCount, 1,
    'selected-first diagnostics retain the authoritative debris type');
selectedFirstDebris.isSelected = false;
syncSatellitePointCloud([selectedFirstDebris]);
const deselectedFirstColor = Array.from(scene.children[0].geometry.getAttribute('color').array.slice(0, 3));
assert(Math.abs(deselectedFirstColor[0] - 1) < 1e-6 && deselectedFirstColor[1] < 0.1 && deselectedFirstColor[2] < 0.05,
    'deselecting a selected-first record restores the cached debris-red base color');
assert.equal(getSatellitePointCloudDiagnostics([selectedFirstDebris]).selectedDrawnCount, 0);

let markerMapDisposeCount = 0;
const disposeMarkerMap = markerMap.dispose.bind(markerMap);
markerMap.dispose = () => {
    markerMapDisposeCount += 1;
    disposeMarkerMap();
};
scene.children[0].material.map = null;

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
assert.equal(markerMapDisposeCount, 1,
    'catalog replacement disposes the owned marker mask even when dense mode cleared material.map');
assert.deepEqual(firstChunkSnapshot, [{
    noradId: '100002',
    visible: false,
    positionReady: false
}], 'the priority category is materialized first without rendering origin markers');
assert.deepEqual(satellites.map(record => record.norad_id), ['100002', '100001']);
assert.equal(scene.children.length, 1, 'multiple catalog records still use one point-cloud scene object');

const thresholdCatalog = Array.from({ length: 500 }, (_, index) => {
    const record = ommRecord(String(200000 + index), '2026-08-22T11:00:00Z', {
        object_id: `2026-${String(index + 1).padStart(3, '0')}A`,
        orbit_class: 'LEO'
    });
    record.element_set.omm.OBJECT_ID = record.object_id;
    return record;
});
const thresholdIconTexture = new THREE.DataTexture(
    new Uint8Array([24, 128, 240, 255]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
);
thresholdIconTexture.name = 'openbexiSatelliteIconFixture';
thresholdIconTexture.userData.openbexiAssetPath = 'icons/ob_satellite.png';
thresholdIconTexture.userData.openbexiResolvedUrl = 'icons/ob_satellite.png';
let injectedIconDisposeCount = 0;
const disposeInjectedIcon = thresholdIconTexture.dispose.bind(thresholdIconTexture);
thresholdIconTexture.dispose = () => {
    injectedIconDisposeCount += 1;
    disposeInjectedIcon();
};
const thresholdSourceMaterial = new THREE.SpriteMaterial({ map: thresholdIconTexture, color: 0xffffff });
thresholdSourceMaterial.userData.openbexiPointMarkerSource = 'asset';
thresholdSourceMaterial.userData.openbexiIconAssetPath = 'icons/ob_satellite.png';
await setupTLESatellites(scene, {
    gpDataOverride: thresholdCatalog,
    gpMetaOverride: metadata,
    gpDataSource: 'Globe icon threshold integration fixture',
    referenceTime: '2026-08-22T12:00:00Z',
    satelliteMaterialOverride: thresholdSourceMaterial,
    satelliteLib: satellite
});
satellites.forEach((record, index) => {
    record.mesh.position.set(8 + index * 0.001, 1, 2);
    record.mesh.visible = true;
    record.motionPositionReady = true;
});
syncSatellitePointCloud(satellites);
const densityDiagnostics = getSatellitePointCloudDiagnostics(satellites);
assert.equal(densityDiagnostics.markerMode, 'density',
    'exactly 500 render-ready Globe records use density mode');
assert.deepEqual(
    {
        source: densityDiagnostics.detailedMarkerSource,
        asset: densityDiagnostics.detailedMarkerAssetPath,
        resolvedUrl: densityDiagnostics.detailedMarkerResolvedUrl,
        alphaTint: densityDiagnostics.detailedMarkerUsesAlphaTint
    },
    {
        source: 'asset',
        asset: 'icons/ob_satellite.png',
        resolvedUrl: 'icons/ob_satellite.png',
        alphaTint: true
    },
    'density mode retains diagnostics for the real detailed icon ready to be restored'
);
assert.equal(scene.children[0].material.map, null, 'density mode removes the detailed icon texture');
assert.equal(scene.children[0].material.size, 0.025, 'density mode uses the compact point size');
assert.equal(scene.children[0].material.sizeAttenuation, true,
    'density mode restores perspective attenuation for scalable spatial points');

satellites[499].mesh.visible = false;
syncSatellitePointCloud(satellites);
assert.equal(getSatellitePointCloudDiagnostics(satellites).markerMode, 'detailed',
    'dropping from 500 to 499 render-ready records restores detailed icons');
assert.equal(scene.children[0].material.map, scene.children[0].userData.iconMap,
    'the same live point layer restores its detailed icon texture');
assert.equal(scene.children[0].material.map, thresholdIconTexture,
    '499 render-ready records restore the actual satellite artwork rather than a procedural circle');
assert.equal(getSatellitePointCloudDiagnostics(satellites).detailedMarkerTextureUuid,
    densityDiagnostics.detailedMarkerTextureUuid, 'the 500-to-499 transition reuses the same live icon texture');
assert.equal(scene.children[0].material.size, 16, 'the detailed icon screen size is restored');
assert.equal(scene.children[0].material.sizeAttenuation, false,
    'detailed icon artwork remains legible independently of camera distance');

satellites[499].mesh.visible = true;
syncSatellitePointCloud(satellites);
assert.equal(getSatellitePointCloudDiagnostics(satellites).markerMode, 'density',
    're-admitting the 500th render-ready record returns to density mode');
satellites[499].mesh.visible = false;
syncSatellitePointCloud(satellites);
assert.equal(scene.children[0].material.map, thresholdIconTexture,
    'a second density-to-detailed transition restores the same icon without disposing it');
assert.equal(scene.children[0].material.size, 16);
assert.equal(scene.children[0].material.sizeAttenuation, false);

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
assert.equal(injectedIconDisposeCount, 0,
    'catalog replacement leaves an injected shared icon texture under caller ownership');

const failedIconTexture = new THREE.DataTexture(
    new Uint8Array([90, 120, 200, 255]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
);
let failedIconDisposeCount = 0;
const disposeFailedIcon = failedIconTexture.dispose.bind(failedIconTexture);
failedIconTexture.dispose = () => {
    failedIconDisposeCount += 1;
    disposeFailedIcon();
};
let rejectIconLoad = null;
const failingIconLoader = {
    load(_url, _onLoad, _onProgress, onError) {
        rejectIconLoad = onError;
        return failedIconTexture;
    }
};
await setupTLESatellites(scene, {
    gpDataOverride: thresholdCatalog,
    gpMetaOverride: metadata,
    gpDataSource: 'failed icon integration fixture',
    referenceTime: '2026-08-22T12:00:00Z',
    satelliteIconTextureLoader: failingIconLoader,
    satelliteLib: satellite
});
satellites.forEach((record, index) => {
    record.mesh.position.set(8 + index * 0.001, 1, 2);
    record.mesh.visible = true;
    record.motionPositionReady = true;
});
syncSatellitePointCloud(satellites);
const failedAssetDiagnostics = getSatellitePointCloudDiagnostics(satellites);
assert.deepEqual(
    [failedAssetDiagnostics.markerMode, failedAssetDiagnostics.detailedMarkerSource,
        failedAssetDiagnostics.detailedMarkerAssetPath],
    ['density', 'asset', 'icons/ob_satellite.png'],
    'density mode retains the configured local icon before a load failure'
);
rejectIconLoad(new Error('injected icon load failure'));
const fallbackAfterFailure = scene.children[0].userData.iconMap;
const denseFallbackDiagnostics = getSatellitePointCloudDiagnostics(satellites);
assert.notEqual(fallbackAfterFailure, failedIconTexture,
    'a failed icon request is removed from the live point layer');
assert.equal(scene.children[0].material.map, null,
    'a load failure does not leave density mode or attach a detailed texture at 500 records');
assert.equal(scene.children[0].material.sizeAttenuation, true);
assert.deepEqual(
    [denseFallbackDiagnostics.markerMode, denseFallbackDiagnostics.detailedMarkerSource,
        denseFallbackDiagnostics.detailedMarkerAssetPath],
    ['density', 'procedural-fallback', null],
    'load-failure diagnostics distinguish the procedural fallback from the requested asset'
);
assert.equal(failedIconDisposeCount, 1, 'the failed owned icon texture is disposed exactly once');
satellites[499].mesh.visible = false;
syncSatellitePointCloud(satellites);
const detailedFallbackDiagnostics = getSatellitePointCloudDiagnostics(satellites);
assert.equal(scene.children[0].material.map, fallbackAfterFailure,
    'dropping from 500 to 499 restores the procedural fallback after an asset failure');
assert.equal(scene.children[0].material.size, 16);
assert.equal(scene.children[0].material.sizeAttenuation, false);
assert.deepEqual(
    [detailedFallbackDiagnostics.markerMode, detailedFallbackDiagnostics.detailedMarkerTextureUuid],
    ['detailed', denseFallbackDiagnostics.detailedMarkerTextureUuid],
    'the density-to-detailed transition retains the same fallback texture identity'
);
let failureFallbackDisposeCount = 0;
const disposeFailureFallback = fallbackAfterFailure.dispose.bind(fallbackAfterFailure);
fallbackAfterFailure.dispose = () => {
    failureFallbackDisposeCount += 1;
    disposeFailureFallback();
};
await setupTLESatellites(scene, {
    gpDataOverride: [newest],
    gpMetaOverride: metadata,
    gpDataSource: 'post-icon-failure replacement fixture',
    referenceTime: '2026-08-22T12:00:00Z',
    satelliteMaterialOverride: new THREE.SpriteMaterial({ color: 0xffffff }),
    satelliteLib: satellite
});
assert.equal(failedIconDisposeCount, 1, 'catalog replacement does not dispose the failed icon twice');
assert.equal(failureFallbackDisposeCount, 1,
    'catalog replacement disposes the owned load-failure fallback exactly once');

console.log('GP mixed catalog loader tests passed');
