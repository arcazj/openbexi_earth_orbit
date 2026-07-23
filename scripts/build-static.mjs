import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_MANIFEST = path.join(ROOT, 'release', 'static-artifact.json');
const RELEASE_METADATA = path.join(ROOT, 'release', 'version.json');
const STATIC_RUNTIME_REPLACEMENTS = Object.freeze(new Map([
  ['https://unpkg.com/three@0.184.0/build/three.module.js', './vendor/three/0.184.0/build/three.module.js'],
  ['https://unpkg.com/three@0.184.0/examples/jsm/', './vendor/three/0.184.0/examples/jsm/'],
  ['https://unpkg.com/satellite.js@6.0.2/dist/satellite.min.js', './vendor/satellite.js/6.0.2/satellite.min.js'],
  ['https://raw.githubusercontent.com/arcazj/openbexi_earth_orbit/master/', './']
]));
const FORBIDDEN_TOP_LEVEL = new Set([
  '.git',
  '.github',
  'node_modules',
  'release',
  'scripts',
  'tests',
  'tests_browser',
  'tests_python',
  'validation'
]);
export const REQUIRED_STATIC_RUNTIME_PATHS = Object.freeze([
  'index.html',
  'js/dependencyBootstrap.js',
  'json/tle/TLE.json',
  'json/tle/TLE.meta.json',
  'vendor/satellite.js/6.0.2/satellite.es.js',
  'vendor/satellite.js/6.0.2/satellite.min.js',
  'vendor/three/0.184.0/build/three.module.js',
  'vendor/three/0.184.0/examples/jsm/controls/OrbitControls.js'
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizedRelative(file) {
  return String(file).replaceAll('\\', '/').replace(/^\.\//, '');
}

function resolveInside(root, relative, label) {
  const normalized = normalizedRelative(relative);
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`${label} must be a repository-relative path: ${relative}`);
  }
  const resolved = path.resolve(root, ...normalized.split('/'));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} escapes its root: ${relative}`);
  }
  return { normalized, resolved };
}

function isForbidden(relative) {
  const normalized = normalizedRelative(relative);
  const segments = normalized.split('/');
  const base = segments.at(-1).toLowerCase();
  return FORBIDDEN_TOP_LEVEL.has(segments[0].toLowerCase())
    || normalized.toLowerCase().startsWith('json/ops/')
    || base === 'roadmap.md'
    || base.startsWith('prompt')
    || base.includes('.bak-')
    || base.endsWith('.tmp')
    || base.endsWith('~');
}

function filesUnder(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Static artifact input cannot be a symbolic link: ${path.relative(ROOT, target)}`);
    if (entry.isDirectory()) files.push(...filesUnder(target));
    if (entry.isFile()) files.push(target);
  }
  return files;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function collectInputs(manifest, { includeOptional = true } = {}) {
  const inputs = new Map();
  const add = relative => {
    const { normalized, resolved } = resolveInside(ROOT, relative, 'Static artifact input');
    if (isForbidden(normalized)) throw new Error(`Static artifact manifest includes forbidden content: ${normalized}`);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error(`Static artifact input is missing: ${normalized}`);
    }
    const real = fs.realpathSync(resolved);
    if (real !== ROOT && !real.startsWith(`${ROOT}${path.sep}`)) {
      throw new Error(`Static artifact input resolves outside the repository: ${normalized}`);
    }
    inputs.set(normalized, resolved);
  };

  for (const file of manifest.files || []) add(file);
  if (includeOptional) {
    for (const file of manifest.optionalFiles || []) {
      const { resolved } = resolveInside(ROOT, file, 'Optional static artifact input');
      if (fs.existsSync(resolved)) add(file);
    }
  }

  for (const tree of manifest.trees || []) {
    const { normalized: treePath, resolved: treeRoot } = resolveInside(ROOT, tree.path, 'Static artifact tree');
    if (isForbidden(`${treePath}/placeholder`)) throw new Error(`Static artifact tree is forbidden: ${treePath}`);
    if (!fs.existsSync(treeRoot) || !fs.statSync(treeRoot).isDirectory()) {
      throw new Error(`Static artifact tree is missing: ${treePath}`);
    }
    const extensions = new Set((tree.extensions || []).map(value => String(value).toLowerCase()));
    const excluded = new Set((tree.exclude || []).map(normalizedRelative));
    for (const file of filesUnder(treeRoot)) {
      const relativeToTree = normalizedRelative(path.relative(treeRoot, file));
      if (extensions.has(path.extname(file).toLowerCase()) && !excluded.has(relativeToTree)) {
        add(path.relative(ROOT, file));
      }
    }
  }

  for (const vendorManifestPath of manifest.vendorManifests || []) {
    const { normalized, resolved } = resolveInside(ROOT, vendorManifestPath, 'Vendor manifest');
    if (!fs.existsSync(resolved)) throw new Error(`Vendor manifest is missing: ${normalized}`);
    const vendorManifest = readJson(resolved);
    const vendorRoot = path.dirname(resolved);
    for (const relative of Object.keys(vendorManifest.files || {}).sort()) {
      const vendorFile = path.resolve(vendorRoot, ...normalizedRelative(relative).split('/'));
      add(path.relative(ROOT, vendorFile));
    }
  }

  return [...inputs.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function assertRequiredStaticRuntimePaths(paths) {
  const available = new Set([...paths].map(normalizedRelative));
  const missing = REQUIRED_STATIC_RUNTIME_PATHS.filter(relative => !available.has(relative));
  if (missing.length > 0) {
    throw new Error(`Static artifact is missing required packaged runtime files: ${missing.join(', ')}.`);
  }
}

export function buildStaticArtifact({ includeOptional = true } = {}) {
  const manifest = readJson(SOURCE_MANIFEST);
  if (manifest.schemaVersion !== 1) throw new Error('Static artifact manifest schemaVersion must be 1.');
  const { normalized: outputName, resolved: outputRoot } = resolveInside(ROOT, manifest.outputDirectory, 'Output directory');
  const expectedOutput = path.join(ROOT, 'dist');
  if (outputRoot !== expectedOutput || path.dirname(outputRoot) !== ROOT) {
    throw new Error(`Static artifact output must resolve exactly to ${expectedOutput}.`);
  }

  const inputs = collectInputs(manifest, { includeOptional });
  assertRequiredStaticRuntimePaths(inputs.map(([relative]) => relative));
  if (!inputs.some(([relative]) => relative === manifest.entrypoint)) {
    throw new Error(`Static artifact entrypoint is not included: ${manifest.entrypoint}`);
  }

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  for (const [relative, source] of inputs) {
    const target = path.join(outputRoot, ...relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  const staticIndex = path.join(outputRoot, manifest.entrypoint);
  const serverCapableMarker = '<meta name="openbexi-deployment-mode" content="server-capable">';
  const staticMarker = '<meta name="openbexi-deployment-mode" content="static">';
  const sourceDependencyMarker = '<meta name="openbexi-dependency-policy" content="packaged-first-with-cdn-fallback">';
  const packagedDependencyMarker = '<meta name="openbexi-dependency-policy" content="packaged-only">';
  const indexSource = fs.readFileSync(staticIndex, 'utf8');
  if (!indexSource.includes(serverCapableMarker)) {
    throw new Error('Static artifact entrypoint is missing the deployment-mode marker.');
  }
  if (!indexSource.includes(sourceDependencyMarker)) {
    throw new Error('Static artifact entrypoint is missing the source dependency-policy marker.');
  }
  fs.writeFileSync(
    staticIndex,
    indexSource
      .replace(serverCapableMarker, staticMarker),
    'utf8'
  );
  for (const runtimeFile of filesUnder(outputRoot).filter(file => /\.(?:html|js|mjs)$/i.test(file))) {
    let source = fs.readFileSync(runtimeFile, 'utf8');
    source = source.replaceAll(sourceDependencyMarker, packagedDependencyMarker);
    for (const [remote, packaged] of STATIC_RUNTIME_REPLACEMENTS) source = source.replaceAll(remote, packaged);
    fs.writeFileSync(runtimeFile, source, 'utf8');
  }
  fs.writeFileSync(path.join(outputRoot, '.nojekyll'), '', 'utf8');

  const builtFiles = filesUnder(outputRoot)
    .map(file => normalizedRelative(path.relative(outputRoot, file)))
    .filter(relative => relative !== 'asset-manifest.json')
    .sort();
  for (const relative of builtFiles) {
    if (isForbidden(relative)) throw new Error(`Built static artifact contains forbidden content: ${relative}`);
  }

  const files = builtFiles.map(relative => {
    const file = path.join(outputRoot, ...relative.split('/'));
    return {
      path: relative,
      bytes: fs.statSync(file).size,
      sha256: sha256(file)
    };
  });
  const release = readJson(RELEASE_METADATA);
  const artifactManifest = {
    schemaVersion: 1,
    application: 'openbexi_orbit',
    version: release.version,
    entrypoint: manifest.entrypoint,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files
  };
  fs.writeFileSync(
    path.join(outputRoot, 'asset-manifest.json'),
    `${JSON.stringify(artifactManifest, null, 2)}\n`,
    'utf8'
  );
  console.log(`Built ${outputName}: ${artifactManifest.fileCount} files, ${artifactManifest.totalBytes} bytes.`);
  return Object.freeze({ outputRoot, artifactManifest });
}

const invokedFile = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedFile === import.meta.url) buildStaticArtifact();
