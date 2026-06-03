import assert from 'assert';
import fs from 'fs';
import {
  metersToSceneUnits,
  resolveSelectedSatelliteObserverDistance,
  selectedSatelliteCameraFrame
} from '../js/sceneFrame.js';
import { EARTH_SCENE_RADIUS } from '../js/SatelliteConstantLoader.js';
import { modelScaleToSceneUnits } from '../js/satelliteModelLoader.js';

function objMaxDiameter(path) {
  const text = fs.readFileSync(path, 'utf8');
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let vertices = 0;

  for (const line of text.split(/\r?\n/)) {
    const match = /^v\s+([-0-9.eE]+)\s+([-0-9.eE]+)\s+([-0-9.eE]+)/.exec(line);
    if (!match) continue;
    const values = [Number(match[1]), Number(match[2]), Number(match[3])];
    values.forEach((value, index) => {
      min[index] = Math.min(min[index], value);
      max[index] = Math.max(max[index], value);
    });
    vertices += 1;
  }

  assert(vertices > 0, `${path} contains OBJ vertices`);
  const size = max.map((value, index) => value - min[index]);
  return Math.max(...size);
}

function run() {
  const starlinkRawDiameter = objMaxDiameter('obj/starlink_V1.obj');
  assert(starlinkRawDiameter > 0, 'Starlink OBJ has nonzero raw bounds');

  const starlinkSceneDiameter = starlinkRawDiameter * modelScaleToSceneUnits('m');
  assert(starlinkSceneDiameter > 0, 'Starlink model has nonzero scene bounds after scaling');

  const detailedNear = metersToSceneUnits(1);
  const physical100m = metersToSceneUnits(100);
  const distance = resolveSelectedSatelliteObserverDistance({
    requestedMeters: 100,
    modelDiameterSceneUnits: starlinkSceneDiameter,
    cameraNearSceneUnits: detailedNear,
    earthRadiusSceneUnits: EARTH_SCENE_RADIUS,
    earthContextDistanceSceneUnits: 0
  });

  assert.strictEqual(distance.requestedMeters, 100, 'selected model uses a 100 m target');
  assert(distance.physicalDistanceSceneUnits === physical100m, '100 m conversion is preserved');
  assert(distance.observerDistanceSceneUnits >= physical100m, 'observer distance never goes inside 100 m target');
  assert(
    distance.observerDistanceSceneUnits < EARTH_SCENE_RADIUS * 0.035,
    'detailed model framing does not use the old Earth-radius fallback distance'
  );
  assert(
    distance.observerDistanceSceneUnits >= starlinkSceneDiameter * 2.5,
    'visual fallback keeps the Starlink model large enough to inspect'
  );

  const satPos = { x: EARTH_SCENE_RADIUS + 0.55, y: 0, z: 0 };
  const frame = selectedSatelliteCameraFrame(satPos, {
    requestedMeters: 100,
    modelDiameterSceneUnits: starlinkSceneDiameter,
    cameraNearSceneUnits: detailedNear,
    earthRadiusSceneUnits: EARTH_SCENE_RADIUS,
    earthContextDistanceSceneUnits: 0
  });
  assert(frame, 'selected camera frame is available for Starlink visual check');
  assert(frame.position.x > satPos.x, 'camera is placed outward from Earth through the selected model');
  assert.strictEqual(frame.requestedMeters, 100);

  console.log('modelVisualFraming tests passed');
}

run();
