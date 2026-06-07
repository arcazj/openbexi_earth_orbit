import assert from 'assert';
import fs from 'fs';
import {
  EARTH_ORBIT_RADIUS_KM,
  MARS_ORBIT_RADIUS_KM,
  MARS_MEAN_RADIUS_KM,
  MARS_TEXTURE_URL,
  getApproximateMarsEciKm,
  getApproximateMarsScenePosition
} from '../js/MarsFrameLoader.js';
import { KM_TO_SCENE_UNITS } from '../js/SatelliteConstantLoader.js';

function length(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function run() {
  assert.strictEqual(MARS_TEXTURE_URL, 'textures/March.jpg', 'Mars uses the required local March.jpg texture');
  assert(fs.existsSync(MARS_TEXTURE_URL), 'textures/March.jpg exists in the workspace');
  const marsLoader = fs.readFileSync('js/MarsFrameLoader.js', 'utf8');
  assert(marsLoader.includes('onTextureLoadProgress'), 'Mars texture load progress callbacks are supported');
  assert(marsLoader.includes('onTextureLoadError'), 'Mars texture load error callbacks are supported');
  assert(MARS_MEAN_RADIUS_KM > 3000 && MARS_MEAN_RADIUS_KM < 4000, 'Mars radius is plausible');

  const eci = getApproximateMarsEciKm(new Date('2026-06-07T00:00:00Z'));
  ['x', 'y', 'z'].forEach(axis => {
    assert(Number.isFinite(eci[axis]), `Mars ECI ${axis} is finite`);
  });
  const distanceKm = length(eci);
  assert(
    distanceKm >= Math.abs(MARS_ORBIT_RADIUS_KM - EARTH_ORBIT_RADIUS_KM) &&
      distanceKm <= MARS_ORBIT_RADIUS_KM + EARTH_ORBIT_RADIUS_KM,
    'Mars simplified Earth-relative distance is within circular orbit bounds'
  );

  const scene = getApproximateMarsScenePosition(new Date('2026-06-07T00:00:00Z'));
  assert(Math.abs(scene.x - eci.x * KM_TO_SCENE_UNITS) < 1e-9, 'Mars scene x uses shared km-to-scene scale');
  assert(Math.abs(scene.y - eci.z * KM_TO_SCENE_UNITS) < 1e-9, 'Mars scene y uses shared ECI z axis');
  assert(Math.abs(scene.z - eci.y * KM_TO_SCENE_UNITS) < 1e-9, 'Mars scene z uses shared ECI y axis');

  console.log('Mars frame tests passed');
}

run();
