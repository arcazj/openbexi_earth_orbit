import assert from 'assert';
import * as THREE from 'three';
import {
  conjunctionStateVector,
  createConjunctionVisualization,
  statePositionKm
} from '../js/conjunction/conjunctionVisualization.js';
import { KM_TO_SCENE_UNITS } from '../js/SatelliteConstantLoader.js';

const scene = new THREE.Scene();
const event = {
  primary_state: {
    position_km: { x: 7000, y: 10, z: 20 },
    velocity_km_s: { x: 0, y: 7.5, z: 0 }
  },
  secondary_state: {
    position_km: { x: 7000, y: 12, z: 23 },
    velocity_km_s: { x: 0, y: 7.4, z: 0 }
  }
};

assert.strictEqual(conjunctionStateVector(event, 'primary'), event.primary_state);
assert.deepStrictEqual(statePositionKm(event.secondary_state), event.secondary_state.position_km);

const layer = createConjunctionVisualization(scene);
assert(scene.children.includes(layer.group));
assert.strictEqual(layer.showEvent(event, {
  primary: [event.primary_state, { ...event.primary_state, position_km: { x: 7001, y: 11, z: 21 } }],
  secondary: [event.secondary_state, { ...event.secondary_state, position_km: { x: 7001, y: 13, z: 24 } }]
}), true);
assert.strictEqual(layer.group.visible, true);

const primaryMarker = layer.group.getObjectByName('conjunction-primary-marker');
const connector = layer.group.getObjectByName('conjunction-miss-distance-connector');
assert(primaryMarker, 'primary marker is created');
assert(connector, 'miss-distance connector is created');
assert(Math.abs(primaryMarker.position.x - 7000 * KM_TO_SCENE_UNITS) < 1e-12);
assert(Math.abs(primaryMarker.position.y - 20 * KM_TO_SCENE_UNITS) < 1e-12);
assert(Math.abs(primaryMarker.position.z - 10 * KM_TO_SCENE_UNITS) < 1e-12);
assert.strictEqual(connector.geometry.getAttribute('position').count, 2);

assert.strictEqual(layer.updateStates({ position_km: { x: NaN, y: 0, z: 0 } }, event.secondary_state), false);
assert.strictEqual(primaryMarker.visible, false);

layer.clear();
assert.strictEqual(layer.group.visible, false);
layer.dispose();
assert(!scene.children.includes(layer.group));

console.log('conjunctionVisualization tests passed');
