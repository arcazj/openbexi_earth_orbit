import assert from 'node:assert/strict';
import {
  sceneCoordinatesFromEciKm,
  sceneCoordinatesToEciKm,
  sceneToEciVector
} from '../js/sceneFrame.js';

const eci = { x: 1234.5, y: -6789.25, z: 4321.75 };
const scene = sceneCoordinatesFromEciKm(eci);
const restored = sceneCoordinatesToEciKm(scene);

assert.deepEqual(restored, eci, 'scene/ECI axis swap and scaling round-trip exactly');

const output = { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
assert.strictEqual(sceneToEciVector(output, scene), output, 'inverse conversion updates a caller-owned vector');
assert.deepEqual({ x: output.x, y: output.y, z: output.z }, eci);
assert.throws(
  () => sceneCoordinatesToEciKm(scene, 0),
  /finite non-zero/,
  'invalid scene scales fail explicitly'
);

console.log('Scene frame round-trip tests passed');
