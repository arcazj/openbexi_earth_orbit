import assert from 'assert';
import fs from 'fs';
import {
  SELECTED_MODEL_VIEWPORT_MAX_FRACTION,
  SELECTED_MODEL_VIEWPORT_MIN_FRACTION,
  metersToSceneUnits,
  resolveSelectedSatelliteObserverDistance,
  resolveSelectedModelVisualScale,
  selectedSatelliteCameraFrame,
  selectedModelViewportHeightFraction
} from '../js/sceneFrame.js';
import { EARTH_SCENE_RADIUS, KM_TO_SCENE_UNITS } from '../js/SatelliteConstantLoader.js';
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
  assert.strictEqual(modelScaleToSceneUnits('m', 1), metersToSceneUnits(1), '1 model meter maps to one scene meter before visual scale');
  assert.strictEqual(modelScaleToSceneUnits('cm', 1), metersToSceneUnits(0.01), 'centimeter model units convert through meters');
  assert.strictEqual(modelScaleToSceneUnits('km', 1), KM_TO_SCENE_UNITS, 'kilometer model units still map to scene kilometers');

  const modelLoaderSource = fs.readFileSync('js/satelliteModelLoader.js', 'utf8');
  assert(modelLoaderSource.includes('export function centerModelGeometryAtRoot'), 'model loader exposes root-preserving geometry centering');
  assert(modelLoaderSource.includes('child.position.sub(localCenter)'), 'model centering offsets child geometry');
  assert(modelLoaderSource.includes('root.position.copy(rootPositionBefore)'), 'model centering preserves root position');
  assert(!modelLoaderSource.includes('root.position.sub(c)'), 'model centering no longer moves the root position');
  assert(modelLoaderSource.includes("method: 'child-offset-root-preserved'"), 'model centering diagnostic records root-preserving method');

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
    earthContextDistanceSceneUnits: 0,
    preservePhysicalDistance: true
  });

  assert.strictEqual(distance.requestedMeters, 100, 'selected model uses a 100 m target');
  assert(distance.physicalDistanceSceneUnits === physical100m, '100 m conversion is preserved');
  assert.strictEqual(distance.observerDistanceSceneUnits, physical100m, 'observer eye remains exactly 100 m from selected model target');
  assert(distance.preservePhysicalDistance, 'selected model framing explicitly preserves physical distance');
  assert(!distance.approximationUsed, 'selected model framing does not move the observer farther away');
  assert(
    distance.observerDistanceSceneUnits < EARTH_SCENE_RADIUS * 0.035,
    'detailed model framing does not use the old Earth-radius fallback distance'
  );

  const visualFit = resolveSelectedModelVisualScale({
    modelDiameterSceneUnits: starlinkSceneDiameter,
    observerDistanceSceneUnits: physical100m,
    cameraFovDeg: 45
  });
  const fittedDiameter = starlinkSceneDiameter * visualFit.scaleMultiplier;
  const fittedViewportFraction = selectedModelViewportHeightFraction({
    modelDiameterSceneUnits: fittedDiameter,
    observerDistanceSceneUnits: physical100m,
    cameraFovDeg: 45
  });
  assert(
    fittedViewportFraction >= SELECTED_MODEL_VIEWPORT_MIN_FRACTION &&
      fittedViewportFraction <= SELECTED_MODEL_VIEWPORT_MAX_FRACTION,
    'Starlink visual fit keeps the model large enough to inspect at 100 m'
  );

  const satPos = { x: EARTH_SCENE_RADIUS + 0.55, y: 0, z: 0 };
  const frame = selectedSatelliteCameraFrame(satPos, {
    requestedMeters: 100,
    modelDiameterSceneUnits: fittedDiameter,
    cameraNearSceneUnits: detailedNear,
    earthRadiusSceneUnits: EARTH_SCENE_RADIUS,
    earthContextDistanceSceneUnits: 0,
    preservePhysicalDistance: true
  });
  assert(frame, 'selected camera frame is available for Starlink visual check');
  assert(frame.position.x > satPos.x, 'camera is placed outward from Earth through the selected model');
  assert.strictEqual(frame.requestedMeters, 100);
  assert.strictEqual(frame.observerDistanceSceneUnits, physical100m, 'camera frame uses the converted 100 m observer distance');

  const cameraToTargetDistance = frame.observerDistanceSceneUnits;
  assert(cameraToTargetDistance > detailedNear, 'selected model target is in front of the near clipping plane');
  assert(cameraToTargetDistance < 1000, 'selected model target is inside the far clipping plane');
  assert.strictEqual(frame.target.y, satPos.y, 'selected model target is vertically centered in the camera frame');
  assert.strictEqual(frame.target.z, satPos.z, 'selected model target is horizontally centered in the camera frame');

  const projectedViewportHeight = selectedModelViewportHeightFraction({
    modelDiameterSceneUnits: fittedDiameter,
    observerDistanceSceneUnits: cameraToTargetDistance,
    cameraFovDeg: 45
  });
  assert(
    projectedViewportHeight >= SELECTED_MODEL_VIEWPORT_MIN_FRACTION &&
      projectedViewportHeight <= SELECTED_MODEL_VIEWPORT_MAX_FRACTION,
    'satellite-visibility test projects the selected model inside the viewport at inspectable size'
  );
  assert(
    projectedViewportHeight / 2 < 1,
    'satellite-visibility test keeps the projected Starlink bounds on screen'
  );

  console.log('modelVisualFraming tests passed');
}

run();
