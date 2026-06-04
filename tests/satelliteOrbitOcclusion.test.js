import assert from 'assert';
import fs from 'fs';
import * as THREE from 'three';
import {
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

  console.log('Satellite orbit occlusion tests passed');
}

run();
