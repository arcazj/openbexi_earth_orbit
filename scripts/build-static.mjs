import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_MANIFEST = path.join(ROOT, 'release', 'static-artifact.json');
const RELEASE_METADATA = path.join(ROOT, 'release', 'version.json');
const TRACKED_MANIFEST_PATH = 'json/tracked/TRACKED.manifest.json';
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
  'js/domain/orbitalSourceAdapters.js',
  'js/domain/v21Contracts.js',
  'js/orbit/multiFormatPropagationService.js',
  'js/orbit/satelliteMotionInterpolator.js',
  'js/simulationClock.js',
  'js/trackedObjectCatalog.js',
  'json/decayed/decayed.meta.json',
  'json/gp/GP.json',
  'json/gp/GP.meta.json',
  'json/launches/launches.json',
  'json/launches/launches.meta.json',
  'json/tracked/TRACKED.manifest.json',
  'json/tracked/TRACKED.meta.json',
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

function trackedChunkDescriptors(manifest) {
  const current = Array.isArray(manifest?.chunks) ? manifest.chunks : [];
  const history = Array.isArray(manifest?.history_chunks) ? manifest.history_chunks : [];
  const quarantine = manifest?.quarantine && typeof manifest.quarantine === 'object'
    ? [manifest.quarantine]
    : [];
  return { current, history, quarantine, all: [...current, ...history, ...quarantine] };
}

function trackedCountSummary(payload, label) {
  const counts = payload?.counts;
  const current = counts?.current;
  const history = counts?.history_total;
  const historical = counts?.historical;
  const absent = counts?.absent;
  const total = counts?.total;
  const propagatable = counts?.propagatable;
  const metadataOnly = counts?.metadata_only;
  const currentPropagatable = counts?.current_propagatable;
  const currentMetadataOnly = counts?.current_metadata_only;
  const values = [current, historical, absent, history, total, propagatable, metadataOnly, currentPropagatable, currentMetadataOnly];
  if (!values.every(value => Number.isInteger(value) && value >= 0) ||
      historical > history || absent > history || total !== current + history || total !== propagatable + metadataOnly ||
      current !== currentPropagatable + currentMetadataOnly) {
    throw new Error(`${label} tracked catalog counts are inconsistent.`);
  }
  return Object.freeze(values);
}

export function validateTrackedStaticCatalog(manifest, addInput, catalogRoot = ROOT) {
  if (!manifest || typeof manifest !== 'object' || !/^2\.3(?:\.|$)/.test(String(manifest.schema_version ?? ''))) {
    throw new Error('Tracked static catalog manifest must use the Version 2.3 schema.');
  }
  if (manifest.provider_completeness_claim !== false) {
    throw new Error('Tracked static catalog must not claim provider-universe completeness.');
  }

  const descriptors = trackedChunkDescriptors(manifest);
  if (descriptors.current.length === 0 || descriptors.all.length === 0) {
    throw new Error('Tracked static catalog manifest must reference current content-addressed chunks.');
  }
  const paths = new Set();
  const catalogIds = new Set();
  let currentCount = 0;
  let historyCount = 0;
  let historicalCount = 0;
  let absentCount = 0;
  for (const [index, descriptor] of descriptors.all.entries()) {
    if (!descriptor || typeof descriptor !== 'object') {
      throw new Error(`Tracked static catalog descriptor ${index} is invalid.`);
    }
    const relative = normalizedRelative(descriptor.path ?? '');
    const expectedHash = String(descriptor.sha256 ?? '').toLowerCase().replace(/^sha256:/, '');
    if (!/^json\/tracked\/chunks\/[a-f0-9]{64}-[a-z0-9-]+\.json$/.test(relative) ||
        !/^[a-f0-9]{64}$/.test(expectedHash) || !path.posix.basename(relative).startsWith(expectedHash)) {
      throw new Error(`Tracked static catalog descriptor is not a local content-addressed chunk: ${relative || '<missing>'}.`);
    }
    if (paths.has(relative)) throw new Error(`Tracked static catalog repeats chunk path: ${relative}.`);
    paths.add(relative);
    addInput(relative);

    const { resolved } = resolveInside(catalogRoot, relative, 'Tracked static catalog chunk');
    const body = fs.readFileSync(resolved);
    if (body.length !== Number(descriptor.bytes) || sha256(resolved) !== expectedHash) {
      throw new Error(`Tracked static catalog chunk bytes or SHA-256 do not match: ${relative}.`);
    }
    let payload;
    try {
      payload = JSON.parse(body.toString('utf8'));
    } catch {
      throw new Error(`Tracked static catalog chunk is not valid JSON: ${relative}.`);
    }
    const records = Array.isArray(payload) ? payload : payload?.records;
    if (!Array.isArray(records) || records.length !== Number(descriptor.count)) {
      throw new Error(`Tracked static catalog chunk record count does not match: ${relative}.`);
    }
    const isCurrentDescriptor = descriptors.current.includes(descriptor);
    const isHistoryDescriptor = descriptors.history.includes(descriptor);
    if (isCurrentDescriptor || isHistoryDescriptor) {
      const expectedScope = isCurrentDescriptor ? 'CURRENT' : 'HISTORICAL';
      const expectedType = String(descriptor.object_type ?? '');
      if (payload?.scope !== expectedScope || !expectedType || payload?.object_type !== expectedType) {
        throw new Error(`Tracked static catalog chunk taxonomy does not match its descriptor: ${relative}.`);
      }
      for (const record of records) {
        const noradId = String(record?.norad_id ?? '');
        const recordIsCurrent = record?.catalog_membership_status === 'PRESENT' && !record?.decay_date;
        if (!noradId || catalogIds.has(noradId) || record?.object_type !== expectedType ||
            recordIsCurrent !== isCurrentDescriptor) {
          throw new Error(`Tracked static catalog record violates identity, type, or scope partition: ${relative}.`);
        }
        catalogIds.add(noradId);
        if (isHistoryDescriptor && record?.decay_date) historicalCount += 1;
        if (isHistoryDescriptor && record?.catalog_membership_status === 'ABSENT') absentCount += 1;
      }
    }
    if (isCurrentDescriptor) currentCount += records.length;
    if (isHistoryDescriptor) historyCount += records.length;
  }

  const declaredCurrent = Number(manifest.counts?.current);
  const declaredHistory = Number(manifest.counts?.history_total);
  const declaredHistorical = Number(manifest.counts?.historical);
  const declaredAbsent = Number(manifest.counts?.absent);
  const declaredTotal = Number(manifest.counts?.total);
  if (!Number.isInteger(declaredCurrent) || declaredCurrent !== currentCount ||
      !Number.isInteger(declaredHistory) || declaredHistory !== historyCount ||
      !Number.isInteger(declaredHistorical) || declaredHistorical !== historicalCount ||
      !Number.isInteger(declaredAbsent) || declaredAbsent !== absentCount ||
      !Number.isInteger(declaredTotal) || declaredTotal !== currentCount + historyCount) {
    throw new Error('Tracked static catalog manifest counts do not match its referenced chunks.');
  }
  trackedCountSummary(manifest, 'Manifest');
  if (manifest.invariants?.provider_coverage_holds !== true ||
      manifest.invariants?.catalog_partition_holds !== true ||
      manifest.invariants?.current_chunk_count_holds !== true ||
      manifest.invariants?.history_chunk_count_holds !== true) {
    throw new Error('Tracked static catalog manifest invariants are not satisfied.');
  }
  return Object.freeze({ paths: Object.freeze([...paths]), currentCount, historyCount });
}

export function validateTrackedStaticLineage({
  trackedManifest,
  trackedMetadata,
  gpMetadata,
  gpCatalogPath
}) {
  const gpCatalogRevision = String(gpMetadata?.catalog_revision ?? '');
  const gpDatasetHash = String(gpMetadata?.dataset_hash ?? '');
  const trackedManifestGpRevision = String(trackedManifest?.provenance?.gp_revision ?? '');
  const trackedMetadataGpRevision = String(trackedMetadata?.source_gp_revision ?? '');
  const trackedManifestGpGroups = trackedManifest?.provenance?.gp_source_groups;
  const trackedMetadataGpGroups = trackedMetadata?.source_gp_groups;
  const gpCatalogGroups = gpMetadata?.catalog_source_groups;
  const trackedManifestSatcatRevision = String(trackedManifest?.provenance?.satcat_revision ?? '');
  const trackedMetadataSatcatRevision = String(trackedMetadata?.source_satcat_revision ?? '');
  const trackedRevision = String(trackedManifest?.catalog_revision ?? '');
  const trackedMetadataRevision = String(trackedMetadata?.catalog_revision ?? '');
  const trackedMetadataHash = String(trackedMetadata?.dataset_hash ?? '');

  if (!trackedRevision || trackedMetadataRevision !== trackedRevision || trackedMetadataHash !== trackedRevision) {
    throw new Error('Tracked static catalog manifest and metadata revisions are inconsistent.');
  }
  if (JSON.stringify(trackedCountSummary(trackedManifest, 'Manifest')) !==
      JSON.stringify(trackedCountSummary(trackedMetadata, 'Metadata'))) {
    throw new Error('Tracked static catalog manifest and metadata counts are inconsistent.');
  }

  if (!/^sha256:[a-f0-9]{64}$/.test(gpCatalogRevision) ||
      gpDatasetHash !== gpCatalogRevision ||
      `sha256:${sha256(gpCatalogPath)}` !== gpCatalogRevision) {
    throw new Error('Packaged GP catalog bytes and metadata revisions do not match.');
  }
  if (trackedManifestGpRevision !== gpCatalogRevision ||
      trackedMetadataGpRevision !== gpCatalogRevision) {
    throw new Error('Tracked static catalog GP lineage does not match the packaged GP snapshot.');
  }
  if (!Array.isArray(trackedManifestGpGroups) ||
      !Array.isArray(trackedMetadataGpGroups) ||
      !Array.isArray(gpCatalogGroups) ||
      JSON.stringify(trackedManifestGpGroups) !== JSON.stringify(trackedMetadataGpGroups) ||
      JSON.stringify(trackedManifestGpGroups) !== JSON.stringify(gpCatalogGroups)) {
    throw new Error('Tracked static catalog GP source-group lineage does not match the packaged GP metadata.');
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(trackedManifestSatcatRevision) ||
      trackedMetadataSatcatRevision !== trackedManifestSatcatRevision) {
    throw new Error('Tracked static catalog SATCAT lineage does not match its metadata.');
  }
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

  if (inputs.has(TRACKED_MANIFEST_PATH)) {
    const trackedManifest = readJson(inputs.get(TRACKED_MANIFEST_PATH));
    const trackedMetadataPath = inputs.get('json/tracked/TRACKED.meta.json');
    if (!trackedMetadataPath) throw new Error('Tracked static catalog provenance metadata is missing.');
    const trackedMetadata = readJson(trackedMetadataPath);
    if (!trackedManifest.catalog_revision || trackedMetadata.catalog_revision !== trackedManifest.catalog_revision) {
      throw new Error('Tracked static catalog manifest and metadata revisions do not match.');
    }
    const gpCatalogPath = inputs.get('json/gp/GP.json');
    const gpMetadataPath = inputs.get('json/gp/GP.meta.json');
    if (!gpCatalogPath || !gpMetadataPath) {
      throw new Error('Tracked static catalog requires the packaged GP snapshot and metadata.');
    }
    validateTrackedStaticLineage({
      trackedManifest,
      trackedMetadata,
      gpMetadata: readJson(gpMetadataPath),
      gpCatalogPath
    });
    validateTrackedStaticCatalog(trackedManifest, add);
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
