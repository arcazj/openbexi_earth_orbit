import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deploymentRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openbexi-worker-deploy-'));

try {
  await fs.cp(path.join(projectRoot, 'js'), path.join(deploymentRoot, 'js'), { recursive: true });
  await fs.cp(path.join(projectRoot, 'vendor'), path.join(deploymentRoot, 'vendor'), { recursive: true });
  await fs.copyFile(path.join(projectRoot, 'index.html'), path.join(deploymentRoot, 'index.html'));
  await fs.copyFile(
    path.join(projectRoot, 'display_satellite.html'),
    path.join(deploymentRoot, 'display_satellite.html')
  );
  await fs.writeFile(path.join(deploymentRoot, 'package.json'), '{"type":"module"}\n', 'utf8');

  await assert.rejects(
    fs.access(path.join(deploymentRoot, 'node_modules')),
    'clean static deployment fixture must not contain node_modules'
  );

  const stagedWorker = path.join(deploymentRoot, 'js', 'conjunction', 'conjunctionWorker.js');
  const workerSource = await fs.readFile(stagedWorker, 'utf8');
  const clientSource = await fs.readFile(
    path.join(deploymentRoot, 'js', 'conjunction', 'conjunctionWorkerClient.js'),
    'utf8'
  );
  const vendoredModulePath = 'vendor/satellite.js/6.0.2/satellite.es.js';
  assert(workerSource.includes(vendoredModulePath), 'Worker defaults to the vendored satellite.js module');
  assert(clientSource.includes(vendoredModulePath), 'Worker client sends the vendored satellite.js module URL');
  assert(!workerSource.includes('node_modules'), 'Worker source has no node_modules dependency');
  assert(!clientSource.includes('node_modules'), 'Worker client has no node_modules dependency');

  for (const htmlFile of ['index.html', 'display_satellite.html']) {
    const html = await fs.readFile(path.join(deploymentRoot, htmlFile), 'utf8');
    assert(html.includes('./vendor/three/0.184.0/build/three.module.js'));
    assert(html.includes('./vendor/three/0.184.0/examples/jsm/'));
    assert(html.includes('./vendor/satellite.js/6.0.2/satellite.min.js') || htmlFile === 'display_satellite.html');
    assert(!html.includes('node_modules'), `${htmlFile} has no generated-package runtime dependency`);
  }

  const workerModule = await import(`${pathToFileURL(stagedWorker).href}?clean-static-deployment=1`);
  assert(
    workerModule.DEFAULT_SATELLITE_MODULE_URL.endsWith('/vendor/satellite.js/6.0.2/satellite.es.js'),
    'Worker resolves its default satellite.js URL inside the static deployment'
  );

  const satellite = await workerModule.loadSatelliteLibrary();
  assert.strictEqual(typeof satellite.twoline2satrec, 'function');
  assert.strictEqual(typeof satellite.propagate, 'function');

  const satrec = satellite.twoline2satrec(
    '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753',
    '2 00005  34.2682 331.5174 1849677 331.7664  19.3264 10.82419157413667'
  );
  const propagated = satellite.propagate(satrec, new Date('2000-06-27T18:50:19.733568Z'));
  assert(Number.isFinite(propagated.position?.x), 'vendored module propagates a published Vallado vector');

  const threeModulePath = path.join(
    deploymentRoot,
    'vendor',
    'three',
    '0.184.0',
    'build',
    'three.module.js'
  );
  const THREE = await import(`${pathToFileURL(threeModulePath).href}?clean-static-deployment=1`);
  const scene = new THREE.Scene();
  scene.add(new THREE.Object3D());
  assert.strictEqual(scene.children.length, 1, 'vendored Three.js module executes from the clean fixture');

  console.log('staticWorkerDeployment tests passed');
} finally {
  await fs.rm(deploymentRoot, { recursive: true, force: true });
}
