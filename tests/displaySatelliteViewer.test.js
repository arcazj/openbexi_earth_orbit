import assert from 'assert';
import fs from 'fs';
import path from 'path';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assertFileExists(filePath, label) {
  assert(fs.existsSync(filePath), `${label} exists: ${filePath}`);
}

function run() {
  const html = read('display_satellite.html');
  const manifest = JSON.parse(read('json/display_satellite_models.json'));

  assert.strictEqual(manifest.schemaVersion, 1, 'display satellite manifest schema version is 1');
  assert.strictEqual(manifest.basePath, 'obj/', 'display satellite manifest uses obj/ as the base path');
  assert(Array.isArray(manifest.models), 'display satellite manifest models is an array');
  assert(manifest.models.length >= 6, 'display satellite manifest includes the configured model set');

  const expectedIds = [
    'starlink_V1',
    'generic',
    'o3b',
    'o3b_mpower_hd',
    'ISS.glb',
    'International Space Station (ISS) (A).glb',
    'ISS_High_definition',
    'SSL_1300.glb',
    'Hubble Space Telescope (A).glb',
    'Hubble Space Telescope (B).glb'
  ];
  const modelIds = new Set(manifest.models.map((model) => model.id));
  expectedIds.forEach((id) => assert(modelIds.has(id), `manifest includes ${id}`));

  const excludedTopLevelAssets = new Set([
    'oneweb.obj',
    'oneweb.mtl'
  ]);
  const topLevelObjFiles = fs.readdirSync(manifest.basePath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  topLevelObjFiles
    .filter((file) => file.toLowerCase().endsWith('.glb'))
    .forEach((glbFile) => {
      assert(
        manifest.models.some((model) => model.type === 'glb' && model.files?.glb === glbFile),
        `manifest includes top-level GLB ${glbFile}`
      );
    });

  topLevelObjFiles
    .filter((file) => file.toLowerCase().endsWith('.obj') && !excludedTopLevelAssets.has(file))
    .forEach((objFile) => {
      const mtlFile = objFile.replace(/\.obj$/i, '.mtl');
      assert(topLevelObjFiles.includes(mtlFile), `${objFile} has a matching ${mtlFile}`);
      assert(
        manifest.models.some((model) => model.type === 'obj-mtl' && model.files?.obj === objFile && model.files?.mtl === mtlFile),
        `manifest includes top-level OBJ/MTL ${objFile}`
      );
    });

  manifest.models.forEach((model) => {
    assert(['obj-mtl', 'glb', 'glb-group'].includes(model.type), `${model.id} uses a supported type`);
    assert(model.files && typeof model.files === 'object', `${model.id} declares files`);

    if (model.type === 'glb') {
      assert(model.files.glb, `${model.id} declares a GLB file`);
      assertFileExists(path.join(manifest.basePath, model.files.glb), `${model.id} GLB file`);
    } else if (model.type === 'glb-group') {
      assert(Array.isArray(model.files.glbs), `${model.id} declares GLB component files`);
      assert(model.files.glbs.length > 0, `${model.id} includes GLB component files`);
      model.files.glbs.forEach((glbFile) => {
        assertFileExists(path.join(manifest.basePath, glbFile), `${model.id} GLB component ${glbFile}`);
      });
    } else {
      assert(model.files.obj, `${model.id} declares an OBJ file`);
      assert(model.files.mtl, `${model.id} declares an MTL file`);
      assertFileExists(path.join(manifest.basePath, model.files.obj), `${model.id} OBJ file`);
      assertFileExists(path.join(manifest.basePath, model.files.mtl), `${model.id} MTL file`);
    }

    (model.textures || [])
      .filter((texture) => texture.required !== false)
      .forEach((texture) => {
        assertFileExists(path.join(manifest.basePath, texture.path), `${model.id} required texture`);
      });
  });

  [
    'DISPLAY_MODEL_MANIFEST_URL',
    'loadModelManifest',
    'renderModelList',
    'updateDiagnostics',
    'collectObjectDiagnostics',
    'fitCameraToObject',
    'normalizeModelForDisplay',
    'loadGlbGroup',
    'setWireframeMode',
    'createLoadingManager',
    'LoadingManager',
    'GLTFLoader',
    'MTLLoader',
    'OBJLoader',
    'modelSearchInput',
    'modelList',
    'modelCount',
    'customModelInput',
    'loadCustomBtn',
    'diagnosticsGrid',
    'copyDiagnosticsBtn',
    'originalDiameter',
    'displayScale',
    'normalizedForDisplay'
  ].forEach((needle) => {
    assert(html.includes(needle), `display_satellite.html includes ${needle}`);
  });

  const mpowerObj = read(path.join(manifest.basePath, 'o3b_mpower_hd.obj'));
  const mpowerMtl = read(path.join(manifest.basePath, 'o3b_mpower_hd.mtl'));
  assert(mpowerObj.includes('mtllib o3b_mpower_hd.mtl'), 'O3b mPOWER HD OBJ links its material library');
  assert(mpowerObj.includes('g BroadTriangularYokePlate_'), 'O3b mPOWER HD OBJ includes broad triangular yoke plates');
  assert(mpowerObj.includes('g YokeCutoutLongSlot_'), 'O3b mPOWER HD OBJ includes apparent yoke cutouts');
  assert(mpowerObj.includes('g GoldKaBandDish_'), 'O3b mPOWER HD OBJ includes gold antenna dishes');
  assert(mpowerObj.includes('g SolarCellLongGrid_'), 'O3b mPOWER HD OBJ includes solar cell grid detail');
  assert(mpowerObj.includes('g LongSideCylinderAssembly_'), 'O3b mPOWER HD OBJ includes long side cylinder assemblies');
  assert(mpowerObj.includes('g SideBlackRadiatorPanel'), 'O3b mPOWER HD OBJ includes the black side radiator panel');
  assert(mpowerObj.includes('g EdgeTileStrip_'), 'O3b mPOWER HD OBJ includes edge tile strip detail');
  assert(mpowerObj.includes('g UndersideDiagonalTruss_'), 'O3b mPOWER HD OBJ includes underside truss detail');
  assert(mpowerMtl.includes('newmtl gold_antenna'), 'O3b mPOWER HD MTL includes gold antenna material');
  assert(mpowerMtl.includes('newmtl negative_cutout'), 'O3b mPOWER HD MTL includes yoke cutout material');
  assert(mpowerMtl.includes('newmtl edge_tile_warm'), 'O3b mPOWER HD MTL includes edge tile materials');
  assert(mpowerMtl.includes('newmtl solar_orange_bright'), 'O3b mPOWER HD MTL includes orange solar-grid material');

  [
    'starlink_spacex_satellite.glb',
    'international_space_station_iss.glb',
    'Landsat8.glb',
    'Landsat4and5.glb',
    'Cloud-Aerosol Lidar and Infrared Pathfinder Satellite (CALIPSO).glb',
    'o3b.glb',
    'oneweb',
    'Aqua.glb',
    'Aura.glb'
  ].forEach((missingAsset) => {
    assert(!html.includes(missingAsset), `display_satellite.html does not hard-code unavailable ${missingAsset}`);
    assert(!JSON.stringify(manifest).includes(missingAsset), `manifest does not list unavailable ${missingAsset}`);
  });

  console.log('displaySatelliteViewer tests passed');
}

run();
