import assert from 'assert';
import fs from 'fs';
import * as THREE from 'three';
import {
  classifyOrbitByPeriodMinutes,
  getOrbitDurationMinutes,
  isUsableOrbitPosition,
  nearestPointDistanceToOrbitSegments,
  isScenePointOccludedByEarth,
  splitOrbitSegmentsByEarthOcclusion
} from '../js/satelliteTLELoader.js';

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
  assert(indexHtml.includes('isUsableOrbitPosition(pv?.position)'), 'sprite update loop rejects invalid propagated positions');
  assert(indexHtml.includes('s.propagationInvalid = true'), 'invalid propagated sprites are flagged');
  assert(indexHtml.includes('s.mesh.visible = false'), 'invalid propagated sprites are hidden instead of frozen');

  console.log('Satellite orbit occlusion tests passed');
}

run();
