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
    'starlink_v3.glb',
    'oneweb.glb',
    'o3b.glb',
    'o3b_mpower.glb',
    'qianfan',
    'iridium',
    'cubesat',
    'ISS.glb',
    'SSL_1300.glb'
  ];
  const modelIds = new Set(manifest.models.map((model) => model.id));
  expectedIds.forEach((id) => assert(modelIds.has(id), `manifest includes ${id}`));

  assert.strictEqual(modelIds.size, manifest.models.length, 'display satellite manifest IDs are unique');

  const v3 = manifest.models.find(model => model.id === 'starlink_v3.glb');
  const bytes = fs.readFileSync(path.join(manifest.basePath, v3.files.glb));
  assert.strictEqual(bytes.toString('ascii', 0, 4), 'glTF');
  assert.strictEqual(bytes.readUInt32LE(4), 2);
  assert.strictEqual(bytes.readUInt32LE(8), bytes.length, 'complete V3 GLB');
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert(gltf.buffers.every(buffer => !buffer.uri), 'V3 geometry is embedded');
  assert(gltf.images.length > 0 && gltf.images.every(image =>
    !image.uri && gltf.bufferViews[image.bufferView]), 'V3 textures are embedded');
  const preview = gltf.nodes.find(node => node.name === 'OpenBEXIPreview');
  assert.strictEqual(gltf.cameras[preview?.camera]?.type, 'perspective', 'V3 provides its opening view');

  const classic = manifest.models.find(model => model.id === 'o3b.glb');
  const classicBytes = fs.readFileSync(path.join(manifest.basePath, classic.files.glb));
  const classicGltf = JSON.parse(classicBytes.toString('utf8', 20, 20 + classicBytes.readUInt32LE(12)));
  const classicPreview = classicGltf.nodes.find(node => node.name === 'OpenBEXIPreview');
  assert.strictEqual(classicGltf.cameras[classicPreview?.camera]?.type, 'perspective', 'Classic provides its payload view');
  const reflectors = classicGltf.nodes.filter(node => /^Ka reflector \d+$/.test(node.name));
  assert.strictEqual(reflectors.length, 12, 'Classic has twelve separately mounted reflectors');
  const panelCounts = classicGltf.nodes.filter(node => /solar wing$/.test(node.name))
    .map(wing => wing.children.filter(index => /^Solar panel \d+$/.test(classicGltf.nodes[index].name)).length);
  assert.deepStrictEqual(panelCounts, [3, 3], 'Classic has three solar panels on each wing');
  const classicMetadata = JSON.parse(read('json/satellites/O3b.json'))['0'];
  assert.strictEqual(classicMetadata.orbit.altitude, 8063000, 'Classic uses its nominal MEO altitude in metres');

  for (const [id, axis, extent] of [['qianfan', 0, 10], ['iridium', 0, 9.4], ['cubesat', 2, 0.3405]]) {
    const entry = manifest.models.find(model => model.id === id);
    const obj = read(path.join(manifest.basePath, entry.files.obj));
    const mtl = read(path.join(manifest.basePath, entry.files.mtl));
    assert(obj.split('\n').includes(`mtllib ${path.basename(entry.files.mtl)}`), `${id} references its material library`);
    const values = obj.split('\n').filter(line => line.startsWith('v '))
      .map(line => Number(line.split(/\s+/)[axis + 1]));
    assert(Math.abs(Math.max(...values) - Math.min(...values) - extent) < 0.0001, `${id} physical extent in metres`);
    const maps = new Set([...mtl.matchAll(/^map_Kd (.+)$/gm)].map(match => match[1].trim()));
    assert.deepStrictEqual(maps, new Set(entry.textures.map(texture => path.posix.relative(path.posix.dirname(entry.files.mtl), texture.path))), `${id} texture manifest`);
    assert.strictEqual(JSON.parse(read(`json/satellites/${id}.json`))['0'].meta.geometry.obj_units, 'm');
  }

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
  for (const loader of ['GLTFLoader', 'MTLLoader', 'OBJLoader']) {
    assert(read('js/spacecraftMesh.js').includes(loader), `shared model loader includes ${loader}`);
  }

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
    'starlink_v3.glb',
    'o3b.glb',
    'o3b_mpower.glb',
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
