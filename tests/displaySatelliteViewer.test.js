import assert from 'assert';
import fs from 'fs';
import path from 'path';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assertFileExists(filePath, label) {
  assert(fs.existsSync(filePath), `${label} exists: ${filePath}`);
}

function listFilesRecursive(rootDir) {
  const files = [];
  fs.readdirSync(rootDir, { withFileTypes: true }).forEach((entry) => {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  });
  return files;
}

function manifestRelativePath(rootDir, filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function run() {
  const html = read('display_satellite.html');
  const serverPy = read('server.py');
  const manifest = JSON.parse(read('json/display_satellite_models.json'));

  assert.strictEqual(manifest.schemaVersion, 1, 'display satellite manifest schema version is 1');
  assert.strictEqual(manifest.basePath, 'obj/', 'display satellite manifest uses obj/ as the base path');
  assert(Array.isArray(manifest.models), 'display satellite manifest models is an array');
  assert(manifest.models.length >= 4, 'display satellite manifest includes the configured model set');

  const expectedIds = [
    'starlink_V1',
    'starlink_v2.glb',
    'oneweb.glb',
    'o3b.glb',
    'ISS.glb',
    'SSL_1300.glb'
  ];
  const modelIds = new Set(manifest.models.map((model) => model.id));
  expectedIds.forEach((id) => assert(modelIds.has(id), `manifest includes ${id}`));

  assert.strictEqual(modelIds.size, manifest.models.length, 'display satellite manifest IDs are unique');

  const objRoot = manifest.basePath.replace(/\/$/, '');
  const assetFiles = listFilesRecursive(objRoot).map((filePath) => manifestRelativePath(objRoot, filePath));

  assetFiles
    .filter((file) => file.toLowerCase().endsWith('.glb'))
    .forEach((glbFile) => {
      assert(
        manifest.models.some((model) => model.type === 'glb' && model.files?.glb === glbFile),
        `manifest includes GLB ${glbFile}`
      );
    });

  assetFiles
    .filter((file) => file.toLowerCase().endsWith('.obj'))
    .forEach((objFile) => {
      const mtlFile = objFile.replace(/\.obj$/i, '.mtl');
      assert(assetFiles.includes(mtlFile), `${objFile} has a matching ${mtlFile}`);
      assert(
        manifest.models.some((model) => model.type === 'obj-mtl' && model.files?.obj === objFile && model.files?.mtl === mtlFile),
        `manifest includes OBJ/MTL ${objFile}`
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
    'DISPLAY_MODEL_API_URL',
    'loadModelManifest',
    'fetchModelManifest',
    'renderModelList',
    'updateDiagnostics',
    'collectObjectDiagnostics',
    'fitCameraToObject',
    'normalizeModelForDisplay',
    'textureHasImage',
    'removeBrokenTextureMaps',
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

  [
    '/api/display-satellite-models',
    '_display_satellite_model_manifest',
    'KNOWN_DISPLAY_MODEL_METADATA',
    'rglob("*.glb")',
    'rglob("*.obj")',
    'with_suffix(".mtl")'
  ].forEach((needle) => {
    assert(serverPy.includes(needle), `server.py includes ${needle}`);
  });

  [
    'starlink_V1.obj',
    'starlink_V1.mtl',
    'starlink_v2.glb',
    'o3b.glb',
    'oneweb.glb',
    'ISS.glb',
    'SSL_1300.glb'
  ].forEach((availableAsset) => {
    assert(JSON.stringify(manifest).includes(availableAsset), `manifest lists available ${availableAsset}`);
  });

  [
    'oneweb.obj',
    'oneweb.mtl',
    'o3b.obj',
    'o3b.mtl',
    'o3b_mpower_hd.obj',
    'o3b_mpower_hd.mtl'
  ].forEach((missingAsset) => {
    assert(!JSON.stringify(manifest).includes(missingAsset), `manifest does not list missing ${missingAsset}`);
  });

  console.log('displaySatelliteViewer tests passed');
}

run();
