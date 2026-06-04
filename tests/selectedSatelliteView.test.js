import assert from 'assert';
import * as THREE from 'three';
import {
  SELECTED_SATELLITE_EARTH_FACING_AXIS,
  metersToSceneUnits,
  nadirDirectionScene,
  nadirPointingQuaternion,
  selectedSatelliteObliqueCameraUp,
  selectedSatelliteObliqueObserverDirection,
  selectedCameraFrameKeepsEarthInView,
  resolveSelectedSatelliteObserverDistance,
  selectedSatelliteCameraFrame,
  selectedSatelliteOrbitalFrame,
  selectedSatelliteOrbitalFrameQuaternion
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

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function length(v) {
  return Math.sqrt(dot(v, v));
}

function normalized(v) {
  const len = length(v);
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function run() {
  nearlyEqual(metersToSceneUnits(100), 0.1 * KM_TO_SCENE_UNITS);
  nearlyEqual(metersToSceneUnits(75), 0.075 * KM_TO_SCENE_UNITS);

  const closeDistance = resolveSelectedSatelliteObserverDistance({
    requestedMeters: 90,
    modelDiameterSceneUnits: 0.25,
    cameraNearSceneUnits: 0.1,
    earthRadiusSceneUnits: EARTH_SCENE_RADIUS,
    preservePhysicalDistance: true
  });
  assert(closeDistance.physicalDistanceSceneUnits > 0, 'physical 90 m scene distance is positive');
  nearlyEqual(
    closeDistance.observerDistanceSceneUnits,
    closeDistance.physicalDistanceSceneUnits,
    1e-15
  );
  assert(closeDistance.preservePhysicalDistance, 'selected model framing preserves the physical eye distance');
  assert(closeDistance.readableFallbackSuppressed, 'readability fallback is suppressed instead of moving the observer farther away');

  const satPos = { x: EARTH_SCENE_RADIUS + 1, y: 0, z: 0 };
  const frame = selectedSatelliteCameraFrame(satPos, {
    requestedMeters: 90,
    modelDiameterSceneUnits: 0.25,
    cameraNearSceneUnits: 0.1,
    earthRadiusSceneUnits: EARTH_SCENE_RADIUS,
    preservePhysicalDistance: true
  });
  assert(frame, 'selected-satellite camera frame is created');
  vectorClose(frame.target, satPos);
  assert(frame.position.x > satPos.x, 'camera is placed outward from Earth through the satellite');
  nearlyEqual(frame.observerDistanceSceneUnits, metersToSceneUnits(90), 1e-15);
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

  const orbitalSatPos = { x: EARTH_SCENE_RADIUS + 0.55, y: 0, z: 0 };
  const orbitalVelocity = { x: 0.2, y: 0, z: 7.5 };
  const orbitalFrame = selectedSatelliteOrbitalFrame(orbitalSatPos, orbitalVelocity);
  assert(orbitalFrame, 'Starlink orbital frame is available from position and velocity');
  vectorClose(orbitalFrame.zAxis, { x: -1, y: 0, z: 0 }, 1e-12);
  vectorClose(orbitalFrame.xAxis, { x: 0, y: 0, z: 1 }, 1e-12);
  vectorClose(orbitalFrame.yAxis, { x: 0, y: 1, z: 0 }, 1e-12);
  vectorClose(normalized(cross(orbitalFrame.xAxis, orbitalFrame.yAxis)), orbitalFrame.zAxis, 1e-12);
  assert(orbitalFrame.isRightHanded, 'Starlink orbital frame is right-handed');

  const starlinkQ = selectedSatelliteOrbitalFrameQuaternion(
    new THREE.Quaternion(),
    orbitalSatPos,
    orbitalVelocity
  );
  assert(starlinkQ, 'Starlink orbital-frame quaternion is available');
  vectorClose(rotateVectorByQuaternion({ x: 1, y: 0, z: 0 }, starlinkQ), orbitalFrame.xAxis, 1e-12);
  vectorClose(rotateVectorByQuaternion({ x: 0, y: 0, z: 1 }, starlinkQ), orbitalFrame.zAxis, 1e-12);

  const starlinkYawBias = selectedSatelliteOrbitalFrameQuaternion(
    new THREE.Quaternion(),
    orbitalSatPos,
    orbitalVelocity,
    { yawDeg: 45 }
  );
  vectorClose(
    rotateVectorByQuaternion({ x: 0, y: 0, z: 1 }, starlinkYawBias),
    orbitalFrame.zAxis,
    1e-12
  );

  const issQ = selectedSatelliteOrbitalFrameQuaternion(
    new THREE.Quaternion(),
    orbitalSatPos,
    orbitalVelocity,
    {
      calibrationYawDeg: 0,
      calibrationPitchDeg: 0,
      calibrationRollDeg: 0
    }
  );
  assert(issQ, 'ISS orbital-frame quaternion is available');
  vectorClose(rotateVectorByQuaternion({ x: 1, y: 0, z: 0 }, issQ), orbitalFrame.xAxis, 1e-12);
  vectorClose(rotateVectorByQuaternion({ x: 0, y: 1, z: 0 }, issQ), orbitalFrame.yAxis, 1e-12);
  vectorClose(rotateVectorByQuaternion({ x: 0, y: 0, z: 1 }, issQ), orbitalFrame.zAxis, 1e-12);

  const observerDirection = selectedSatelliteObliqueObserverDirection(orbitalFrame);
  assert(observerDirection, 'Starlink oblique observer direction is available');
  const antiNadir = { x: -orbitalFrame.zAxis.x, y: -orbitalFrame.zAxis.y, z: -orbitalFrame.zAxis.z };
  assert(dot(observerDirection, antiNadir) < 0.98, 'Starlink observer is not the old pure radial observer');
  assert(Math.abs(dot(observerDirection, orbitalFrame.xAxis)) > 0.05, 'Starlink observer has a velocity-axis component');
  assert(Math.abs(dot(observerDirection, orbitalFrame.yAxis)) > 0.05, 'Starlink observer has a cross-track component');

  const obliqueFrame = selectedSatelliteCameraFrame(orbitalSatPos, {
    requestedMeters: 100,
    cameraNearSceneUnits: metersToSceneUnits(1),
    earthRadiusSceneUnits: EARTH_SCENE_RADIUS,
    earthContextDistanceSceneUnits: 0,
    preservePhysicalDistance: true,
    observerDirectionScene: observerDirection
  });
  assert(obliqueFrame, 'Starlink oblique camera frame is available');
  nearlyEqual(obliqueFrame.observerDistanceSceneUnits, metersToSceneUnits(100), 1e-15);
  assert(dot(obliqueFrame.observerDirection, antiNadir) < 0.98, 'camera frame stores oblique observer direction');
  assert(
    selectedCameraFrameKeepsEarthInView(obliqueFrame, {
      earthRadiusSceneUnits: EARTH_SCENE_RADIUS,
      cameraFovDeg: 45
    }),
    'Starlink oblique selected-satellite view still keeps Earth visible behind the satellite'
  );

  assert(
    selectedCameraFrameKeepsEarthInView(frame, {
      earthRadiusSceneUnits: EARTH_SCENE_RADIUS,
      cameraFovDeg: 45
    }),
    'radial selected-satellite view keeps Earth visible behind the satellite'
  );

  const cameraUp = selectedSatelliteObliqueCameraUp(orbitalFrame, observerDirection);
  assert(cameraUp, 'Starlink oblique camera-up vector is available');
  nearlyEqual(dot(cameraUp, observerDirection), 0, 1e-12);
  assert(dot(cameraUp, orbitalFrame.zAxis) < 0, 'nadir projects downward in the reference-style camera view');
  const viewForward = normalized({
    x: -observerDirection.x,
    y: -observerDirection.y,
    z: -observerDirection.z
  });
  const screenRight = normalized(cross(viewForward, cameraUp));
  assert(dot(screenRight, orbitalFrame.xAxis) > 0, 'velocity projects toward screen right in the reference-style camera view');

  console.log('selectedSatelliteView tests passed');
}

run();
