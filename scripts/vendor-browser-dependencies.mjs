import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEPENDENCIES = Object.freeze([
  {
    packageName: 'satellite.js',
    files: [
      { source: 'dist/satellite.es.js', target: 'satellite.es.js' },
      { source: 'dist/satellite.min.js', target: 'satellite.min.js' },
      { source: 'LICENSE.md', target: 'LICENSE.md' }
    ],
    module: 'satellite.es.js',
    exports: ['gstime', 'propagate', 'twoline2satrec']
  },
  {
    packageName: 'three',
    files: [
      { source: 'build/three.core.js', target: 'build/three.core.js' },
      { source: 'build/three.module.js', target: 'build/three.module.js' },
      { source: 'examples/jsm/controls/OrbitControls.js', target: 'examples/jsm/controls/OrbitControls.js' },
      { source: 'examples/jsm/loaders/GLTFLoader.js', target: 'examples/jsm/loaders/GLTFLoader.js' },
      { source: 'examples/jsm/loaders/MTLLoader.js', target: 'examples/jsm/loaders/MTLLoader.js' },
      { source: 'examples/jsm/loaders/OBJLoader.js', target: 'examples/jsm/loaders/OBJLoader.js' },
      { source: 'examples/jsm/renderers/CSS2DRenderer.js', target: 'examples/jsm/renderers/CSS2DRenderer.js' },
      { source: 'examples/jsm/utils/BufferGeometryUtils.js', target: 'examples/jsm/utils/BufferGeometryUtils.js' },
      { source: 'examples/jsm/utils/SkeletonUtils.js', target: 'examples/jsm/utils/SkeletonUtils.js' },
      { source: 'LICENSE', target: 'LICENSE' }
    ],
    module: 'build/three.module.js',
    exports: ['Scene', 'Vector3', 'WebGLRenderer']
  }
]);
const MANIFEST_FILE = 'manifest.json';
const syncMode = process.argv.includes('--sync');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function fail(message) {
  console.error(`Vendored browser dependency: ${message}`);
  process.exitCode = 1;
}

function filesUnder(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(target));
    if (entry.isFile()) files.push(target);
  }
  return files;
}

const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');

for (const dependency of DEPENDENCIES) {
  const { packageName, files } = dependency;
  const version = packageJson.dependencies?.[packageName];
  const lockEntry = packageLock.packages?.[`node_modules/${packageName}`];
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
    throw new Error(`${packageName} must use an exact semantic version in package.json.`);
  }
  if (lockEntry?.version !== version || !lockEntry.integrity) {
    throw new Error(`${packageName}@${version} must match package-lock.json with npm integrity metadata.`);
  }

  const sourceRoot = path.resolve('node_modules', packageName);
  const targetRoot = path.resolve('vendor', packageName, version);
  const targetManifest = path.join(targetRoot, MANIFEST_FILE);

  if (syncMode) {
    if (!fs.existsSync(sourceRoot)) {
      throw new Error(`Run npm ci before syncing ${packageName}@${version}.`);
    }

    fs.mkdirSync(targetRoot, { recursive: true });
    const hashes = {};
    for (const file of files) {
      const source = path.join(sourceRoot, file.source);
      const target = path.join(targetRoot, file.target);
      if (!fs.existsSync(source)) throw new Error(`Installed ${packageName} package is missing ${file.source}.`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      hashes[file.target] = sha256(target);
    }

    const manifest = {
      schemaVersion: 1,
      package: packageName,
      version,
      source: `npm:${packageName}@${version}`,
      npmIntegrity: lockEntry.integrity,
      license: lockEntry.license || 'MIT',
      files: hashes
    };
    fs.writeFileSync(targetManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`Synced ${packageName}@${version} browser artifacts to ${path.relative('.', targetRoot)}.`);
    continue;
  }

  if (!fs.existsSync(targetManifest)) {
    fail(`${path.relative('.', targetManifest)} is missing; run npm run vendor:browser.`);
    continue;
  }

  const manifest = readJson(targetManifest);
  if (manifest.package !== packageName) fail(`${packageName} manifest package is incorrect.`);
  if (manifest.version !== version) fail(`${packageName} manifest version ${manifest.version} does not match ${version}.`);
  if (manifest.npmIntegrity !== lockEntry.integrity) fail(`${packageName} manifest npm integrity does not match package-lock.json.`);
  if (manifest.license !== (lockEntry.license || 'MIT')) fail(`${packageName} manifest license does not match package-lock.json.`);

  const expectedNames = files.map(file => file.target).sort();
  const manifestNames = Object.keys(manifest.files || {}).sort();
  if (JSON.stringify(manifestNames) !== JSON.stringify(expectedNames)) {
    fail(`${packageName} manifest must contain exactly: ${expectedNames.join(', ')}.`);
  }

  for (const file of files) {
    const target = path.join(targetRoot, file.target);
    if (!fs.existsSync(target)) {
      fail(`${path.relative('.', target)} is missing.`);
      continue;
    }
    const actualHash = sha256(target);
    if (manifest.files?.[file.target] !== actualHash) {
      fail(`${packageName}/${file.target} does not match its committed SHA-256.`);
    }

    const installedSource = path.join(sourceRoot, file.source);
    if (fs.existsSync(installedSource) && sha256(installedSource) !== actualHash) {
      fail(`${packageName}/${file.target} differs from installed ${packageName}@${version}.`);
    }
  }

  for (const file of files.filter(candidate => candidate.target.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(targetRoot, file.target), 'utf8');
    const relativeImports = source.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.\.?\/[^'"]+\.js)['"]/g);
    for (const match of relativeImports) {
      const resolvedImport = path.resolve(path.dirname(path.join(targetRoot, file.target)), match[1]);
      if (!resolvedImport.startsWith(`${targetRoot}${path.sep}`) || !fs.existsSync(resolvedImport)) {
        fail(`${packageName}/${file.target} has an unshipped relative import: ${match[1]}.`);
      }
    }
  }

  if (packageName === 'three') {
    const applicationSources = [
      path.resolve('index.html'),
      path.resolve('display_satellite.html'),
      ...filesUnder(path.resolve('js')).filter(file => file.endsWith('.js'))
    ];
    for (const applicationFile of applicationSources) {
      const source = fs.readFileSync(applicationFile, 'utf8');
      const addonImports = source.matchAll(/['"]three\/addons\/([^'"]+\.js)['"]/g);
      for (const match of addonImports) {
        const vendoredAddon = `examples/jsm/${match[1]}`;
        if (!manifest.files?.[vendoredAddon]) {
          fail(`${path.relative('.', applicationFile)} imports unshipped Three.js addon ${match[1]}.`);
        }
      }
    }
  }

  if (!process.exitCode) {
    const moduleUrl = `${pathToFileURL(path.join(targetRoot, dependency.module)).href}?integrity-check=${manifest.files[dependency.module]}`;
    const moduleNamespace = await import(moduleUrl);
    for (const api of dependency.exports) {
      if (typeof moduleNamespace[api] !== 'function') {
        fail(`${packageName}/${dependency.module} does not export ${api}.`);
      }
    }
  }
}

const runtimeReferences = [
  {
    packageName: 'satellite.js',
    files: ['index.html', 'js/conjunction/conjunctionWorker.js', 'js/conjunction/conjunctionWorkerClient.js']
  },
  {
    packageName: 'three',
    files: ['index.html', 'display_satellite.html']
  }
];
for (const runtime of runtimeReferences) {
  const expectedVersion = packageJson.dependencies[runtime.packageName];
  const expectedFragment = `vendor/${runtime.packageName}/${expectedVersion}/`;
  const escapedPackageName = runtime.packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const vendoredVersionPattern = new RegExp(`vendor/${escapedPackageName}/([^/'"]+)/`, 'g');
  for (const file of runtime.files) {
    const source = fs.readFileSync(file, 'utf8');
    if (source.includes(`node_modules/${runtime.packageName}`)) {
      fail(`${file} still references node_modules/${runtime.packageName}.`);
    }
    if (!source.includes(expectedFragment)) {
      fail(`${file} does not reference vendored ${runtime.packageName}@${expectedVersion}.`);
    }
    for (const match of source.matchAll(vendoredVersionPattern)) {
      if (match[1] !== expectedVersion) {
        fail(`${file} references stale vendored ${runtime.packageName}@${match[1]}.`);
      }
    }
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log(syncMode
  ? 'Vendored browser dependency synchronization complete.'
  : 'Vendored browser dependencies passed integrity, installed-byte, API, and runtime-reference checks.');
