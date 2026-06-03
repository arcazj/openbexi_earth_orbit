import assert from 'assert';
import * as THREE from 'three';
import {
  SELECTED_SATELLITE_EARTH_FACING_AXIS,
  metersToSceneUnits,
  nadirDirectionScene,
  nadirPointingQuaternion,
  resolveSelectedSatelliteObserverDistance,
  selectedSatelliteCameraFrame
} from '../js/sceneFrame.js';
import { EARTH_SCENE_RADIUS, KM_TO_SCENE_UNITS } from '../js/SatelliteConstantLoader.js';

function nearlyEqual(a, b, tolerance = 1e-12) {
  assert(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
}

function vectorClose(actual, expected, tolerance = 1e-12) {
  nearlyEqual(actual.x, expected.x, tolerance);
  nearlyEqual(actual.y, expected.y, tolerance);
  nearlyEqual(actual.z, expected.z, tolerance);
}

function rotateVectorByQuaternion(v, q) {
  const x = v.x;
  const y = v.y;
  const z = v.z;
  const qx = q.x || 0;
  const qy = q.y || 0;
  const qz = q.z || 0;
  const qw = q.w ?? 1;

  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;

  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx
  };
}

function run() {
  nearlyEqual(metersToSceneUnits(100), 0.1 * KM_TO_SCENE_UNITS);
  nearlyEqual(metersToSceneUnits(75), 0.075 * KM_TO_SCENE_UNITS);

  const closeDistance = resolveSelectedSatelliteObserverDistance({
    requestedMeters: 90,
    modelDiameterSceneUnits: 0.25,
    cameraNearSceneUnits: 0.1,
    earthRadiusSceneUnits: EARTH_SCENE_RADIUS
  });
  assert(closeDistance.physicalDistanceSceneUnits > 0, 'physical 90 m scene distance is positive');
  assert(
    closeDistance.observerDistanceSceneUnits >= closeDistance.physicalDistanceSceneUnits,
    'observer distance never goes below physical target'
  );
  assert(closeDistance.approximationUsed, 'visual fallback is documented when literal 90 m would clip');

  const satPos = { x: EARTH_SCENE_RADIUS + 1, y: 0, z: 0 };
  const frame = selectedSatelliteCameraFrame(satPos, {
    requestedMeters: 90,
    modelDiameterSceneUnits: 0.25,
    cameraNearSceneUnits: 0.1,
    earthRadiusSceneUnits: EARTH_SCENE_RADIUS
  });
  assert(frame, 'selected-satellite camera frame is created');
  vectorClose(frame.target, satPos);
  assert(frame.position.x > satPos.x, 'camera is placed outward from Earth through the satellite');
  nearlyEqual(frame.position.y, satPos.y);
  nearlyEqual(frame.position.z, satPos.z);

  const nadir = nadirDirectionScene(satPos);
  vectorClose(nadir, { x: -1, y: 0, z: 0 });

  const q = nadirPointingQuaternion(new THREE.Quaternion(), satPos);
  const earthFacingAxis = rotateVectorByQuaternion(SELECTED_SATELLITE_EARTH_FACING_AXIS, q);
  vectorClose(earthFacingAxis, nadir, 1e-12);

  const yawOnly = nadirPointingQuaternion(new THREE.Quaternion(), satPos, { yawDeg: 45 });
  const yawAxis = rotateVectorByQuaternion({ x: 0, y: 0, z: 1 }, yawOnly);
  vectorClose(yawAxis, nadir, 1e-12);

  console.log('selectedSatelliteView tests passed');
}

run();
