import assert from 'assert';
import fs from 'fs';
import * as THREE from 'three';
import {
  classifyOrbitByPeriodMinutes,
  generateOrbitScenePointSegments,
  getOrbitDurationMinutes,
  getOrbitRefreshIntervalMillis,
  getOrbitSampleCount,
  isUsableOrbitPosition,
  nearestPointDistanceToOrbitSegments,
  isScenePointOccludedByEarth,
  refreshOrbitTrajectoryIfNeeded,
  splitOrbitSegmentsByEarthOcclusion,
  updateOrbitTrajectory
} from '../js/satelliteTLELoader.js';

function closeTo(actual, expected, tolerance, message) {
  assert(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
}

function makeCircularSatelliteLib(recordedTimes = [], invalidSampleIndexes = new Set()) {
  return {
    propagate(satrec, date) {
      const callIndex = recordedTimes.length;
      recordedTimes.push(new Date(date));
      if (invalidSampleIndexes.has(callIndex)) {
        return { position: { x: NaN, y: 0, z: 0 } };
      }
      const elapsedMinutes = (date.getTime() - Date.parse('2026-06-14T00:00:00Z')) / 60_000;
      const angle = elapsedMinutes / satrec.periodMinutes * 2 * Math.PI;
      return {
        position: {
          x: 7000 * Math.cos(angle),
          y: 7000 * Math.sin(angle),
          z: 0
        }
      };
    }
  };
}

function run() {
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const tleLoader = fs.readFileSync('js/satelliteTLELoader.js', 'utf8');

  const cameraPosition = new THREE.Vector3(0, 0, 20);
  const earthRadius = 5;

  assert.strictEqual(
    isScenePointOccludedByEarth(new THREE.Vector3(0, 0, 8), cameraPosition, earthRadius, 0),
    false,
    'front-side orbit point is visible'
  );
  assert.strictEqual(
    isScenePointOccludedByEarth(new THREE.Vector3(0, 0, -8), cameraPosition, earthRadius, 0),
    true,
    'behind-Earth orbit point is occluded'
  );
  assert.strictEqual(
    isScenePointOccludedByEarth(new THREE.Vector3(8, 0, 0), cameraPosition, earthRadius, 0),
    false,
    'side orbit point outside Earth silhouette is visible'
  );

  const visibleSegments = splitOrbitSegmentsByEarthOcclusion([
    [
      new THREE.Vector3(-8, 0, 0),
      new THREE.Vector3(0, 0, 8),
      new THREE.Vector3(8, 0, 0),
      new THREE.Vector3(0, 0, -8),
      new THREE.Vector3(-8, 0, 0)
    ]
  ], cameraPosition, earthRadius);

  assert(visibleSegments.length >= 1, 'visible orbit segments are generated');
  assert(
    visibleSegments.flat().every(point => !isScenePointOccludedByEarth(point, cameraPosition, earthRadius, 0)),
    'visible orbit segments exclude behind-Earth points'
  );
  assert(tleLoader.includes('depthTest: true'), 'selected orbit material is depth tested');
  assert(!tleLoader.includes('depthTest: false'), 'selected orbit material does not force foreground rendering');
  assert(tleLoader.includes('splitOrbitSegmentsByEarthOcclusion'), 'selected orbit uses explicit Earth occlusion splitting');
  assert(indexHtml.includes('refreshSelectedOrbitOcclusion(camera'), 'index refreshes selected orbit occlusion from camera state');
  assert(indexHtml.includes('earthMat.depthWrite = true'), 'Earth material writes depth for orbit occlusion');
  assert.strictEqual(isUsableOrbitPosition({ x: 7000, y: 0, z: 0 }), true, 'finite above-Earth propagation is usable');
  assert.strictEqual(isUsableOrbitPosition({ x: 10, y: 0, z: 0 }), false, 'below-Earth propagation is rejected');
  assert.strictEqual(isUsableOrbitPosition({ x: NaN, y: 0, z: 0 }), false, 'non-finite propagation is rejected');
  const nearestOrbitPoint = nearestPointDistanceToOrbitSegments(
    new THREE.Vector3(2.05, 0, 0),
    [[new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0), new THREE.Vector3(4, 0, 0)]]
  );
  assert(nearestOrbitPoint, 'nearest orbit point diagnostic is available');
  assert(Math.abs(nearestOrbitPoint.distanceSceneUnits - 0.05) < 1e-12, 'nearest orbit point distance is measured in scene units');
  assert.strictEqual(nearestOrbitPoint.pointIndex, 1, 'nearest orbit point index is reported');
  const heoSatrec = { no: (2 * Math.PI) / 720, ecco: 0.68, inclo: 63.4 * Math.PI / 180 };
  assert.strictEqual(classifyOrbitByPeriodMinutes(720, heoSatrec), 'HEO', 'Molniya-like period/eccentricity/inclination classifies as HEO');
  assert(Math.abs(getOrbitDurationMinutes(heoSatrec) - 720) < 1e-9, 'HEO orbit duration renders one full orbit');
  const leoSatrec = { no: (2 * Math.PI) / 95, periodMinutes: 95, ecco: 0.0001, inclo: 53 * Math.PI / 180 };
  const meoSatrec = { no: (2 * Math.PI) / 720, periodMinutes: 720, ecco: 0.01, inclo: 55 * Math.PI / 180 };
  const geoSatrec = { no: (2 * Math.PI) / 1436, periodMinutes: 1436, ecco: 0.0001, inclo: 0.1 * Math.PI / 180 };
  closeTo(getOrbitDurationMinutes(leoSatrec), 95, 1e-9, 'LEO orbit duration is one period, not a multi-revolution trail');
  closeTo(getOrbitDurationMinutes(meoSatrec), 720, 1e-9, 'MEO orbit duration is one period, not two periods');
  closeTo(getOrbitDurationMinutes(geoSatrec), 1436, 1e-9, 'GEO orbit duration is one period');
  closeTo(getOrbitDurationMinutes({ no: 0 }), 96, 1e-9, 'invalid mean motion uses documented fallback period');
  assert.strictEqual(getOrbitSampleCount(95), 96, 'LEO sampling uses the smooth lower bound');
  assert.strictEqual(getOrbitSampleCount(1436), 359, 'GEO sampling adapts to period length without excessive points');
  assert(getOrbitSampleCount(100000) <= 720, 'orbit sampling is bounded for very long periods');
  assert.strictEqual(getOrbitRefreshIntervalMillis(95, 96), 60_000, 'LEO orbit refresh is bounded to a stable minimum interval');

  const startDate = new Date('2026-06-14T00:00:00Z');
  const sampledTimes = [];
  const sampledSegments = generateOrbitScenePointSegments(leoSatrec, startDate, {
    satelliteLib: makeCircularSatelliteLib(sampledTimes),
    numPoints: 12
  });
  assert.strictEqual(sampledSegments.length, 1, 'valid one-period orbit renders as one segment');
  assert.strictEqual(sampledSegments[0].length, 13, 'inclusive one-period orbit has sample count plus first point');
  assert.strictEqual(sampledTimes[0].toISOString(), startDate.toISOString(), 'first orbit sample is the current simulation date');
  assert.strictEqual(
    sampledTimes.at(-1).toISOString(),
    new Date(startDate.getTime() + 95 * 60_000).toISOString(),
    'last orbit sample is exactly one orbital period after the simulation date'
  );

  const invalidTimes = [];
  const splitSegments = generateOrbitScenePointSegments(leoSatrec, startDate, {
    satelliteLib: makeCircularSatelliteLib(invalidTimes, new Set([4])),
    numPoints: 12
  });
  assert(splitSegments.length > 1, 'invalid propagation sample splits orbit segments');
  assert.strictEqual(
    splitSegments.reduce((total, segment) => total + segment.length, 0),
    12,
    'invalid propagation sample is skipped instead of replaced with a fabricated point'
  );

  const scene = new THREE.Scene();
  const satData = { satrec: leoSatrec, norad_id: '25544', satellite_name: 'ISS TEST' };
  const firstOrbit = updateOrbitTrajectory(scene, { showOrbit: true, simDate: startDate }, satData, {
    satelliteLib: makeCircularSatelliteLib([])
  });
  const unchangedOrbit = refreshOrbitTrajectoryIfNeeded(scene, {
    showOrbit: true,
    simDate: new Date(startDate.getTime() + 30_000)
  }, satData, {
    satelliteLib: makeCircularSatelliteLib([])
  });
  assert.strictEqual(unchangedOrbit, firstOrbit, 'orbit geometry remains stable while Time x is frozen or below refresh threshold');
  const refreshedOrbit = refreshOrbitTrajectoryIfNeeded(scene, {
    showOrbit: true,
    simDate: new Date(startDate.getTime() + 61_000)
  }, satData, {
    satelliteLib: makeCircularSatelliteLib([])
  });
  assert.notStrictEqual(refreshedOrbit, firstOrbit, 'stale Time x orbit geometry is replaced');
  assert.strictEqual(
    scene.children.filter(child => child.name === 'selectedOrbitTrajectoryRoot').length,
    1,
    'orbit refresh replaces the existing one-revolution path instead of accumulating duplicate roots'
  );
  assert(indexHtml.includes('isUsableOrbitPosition(pv?.position)'), 'sprite update loop rejects invalid propagated positions');
  assert(indexHtml.includes('s.propagationInvalid = true'), 'invalid propagated sprites are flagged');
  assert(indexHtml.includes('s.mesh.visible = false'), 'invalid propagated sprites are hidden instead of frozen');

  console.log('Satellite orbit occlusion tests passed');
}

run();
