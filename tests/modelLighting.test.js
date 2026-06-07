import assert from 'assert';
import fs from 'fs';

function numberConstant(source, name) {
  const match = new RegExp(`const ${name} = ([0-9.]+);`).exec(source);
  assert(match, `${name} is declared`);
  return Number(match[1]);
}

function run() {
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const modelLoader = fs.readFileSync('js/satelliteModelLoader.js', 'utf8');

  assert(
    numberConstant(indexHtml, 'SUN_LIGHT_INTENSITY') > numberConstant(indexHtml, 'SELECTED_MODEL_FILL_LIGHT_INTENSITY'),
    'Sun light is the dominant selected-model light source'
  );
  assert(
    numberConstant(indexHtml, 'SELECTED_MODEL_FILL_LIGHT_INTENSITY') <= 0.08,
    'selected model camera fill is only a minimal fallback and cannot wash out Starlink panels'
  );
  assert.strictEqual(
    numberConstant(indexHtml, 'SELECTED_MODEL_FILL_LIGHT_DECAY'),
    0,
    'selected model fill light uses non-physical decay so small scene distances do not explode brightness'
  );
  assert(
    numberConstant(indexHtml, 'SCENE_TONE_MAPPING_EXPOSURE') <= 1,
    'main renderer exposure compresses highlights instead of amplifying them'
  );
  assert(indexHtml.includes('renderer.outputColorSpace = THREE.SRGBColorSpace'), 'main renderer uses sRGB output color');
  assert(indexHtml.includes('renderer.toneMapping = THREE.ACESFilmicToneMapping'), 'main renderer uses filmic highlight compression');
  assert(indexHtml.includes('selectedModelEarthAlbedoLight = new THREE.DirectionalLight'), 'selected models get a directional Earth albedo light');
  assert(indexHtml.includes('selectedModelEarthAlbedoLight.name = \'selectedModelEarthAlbedoLight\''), 'Earth albedo light is named for debugging');
  assert(indexHtml.includes('function updateSelectedModelLighting'), 'selected model lighting updates each frame');
  assert(indexHtml.includes('sunSceneVectorFromJD(jDay, 1)'), 'Earth albedo is modulated from current Sun direction');
  assert(indexHtml.includes('SELECTED_MODEL_EARTH_ALBEDO_INTENSITY'), 'Earth albedo intensity is controlled by a named constant');

  const animateStart = indexHtml.indexOf('function animate()');
  const dayNightUpdate = indexHtml.indexOf('drawDayNight3D(scene, earthMesh, SIM_DATE', animateStart);
  const renderCall = indexHtml.indexOf('renderer.render(scene, camera);', animateStart);
  assert(dayNightUpdate > animateStart && dayNightUpdate < renderCall, 'Sun lighting updates before rendering');
  assert(indexHtml.includes('sunIntensity: SUN_LIGHT_INTENSITY'), 'main renderer passes configured Sun intensity to drawDayNight3D');

  assert(modelLoader.includes('function currentRenderer()'), 'model loader resolves renderer dynamically after index initializes it');
  assert(!modelLoader.includes('const renderer = appWindow.renderer || null'), 'model loader no longer captures a null renderer at module load');
  assert(modelLoader.includes('texture.colorSpace = THREE.SRGBColorSpace'), 'diffuse model textures are decoded as sRGB');
  assert(modelLoader.includes('SELECTED_VIEW_MAX_SPECULAR_CHANNEL'), 'selected model materials clamp high MTL specular values');
  assert(
    modelLoader.includes('material.shininess = Math.min(material.shininess, SELECTED_VIEW_MAX_SHININESS)'),
    'selected model materials clamp high MTL shininess values'
  );
  assert(
    modelLoader.includes('material.roughness = Math.max(material.roughness, SELECTED_VIEW_MIN_ROUGHNESS)'),
    'selected model materials keep enough roughness to prevent white clipping'
  );

  console.log('modelLighting tests passed');
}

run();
