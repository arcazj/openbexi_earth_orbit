import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REQUIRED_STATIC_RUNTIME_PATHS,
  assertRequiredStaticRuntimePaths,
  buildStaticArtifact,
  validateTrackedStaticCatalog,
  validateTrackedStaticLineage
} from '../scripts/build-static.mjs';

function filesUnder(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(target));
    if (entry.isFile()) files.push(target);
  }
  return files;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function normalized(relative) {
  return relative.replaceAll('\\', '/');
}

function contentAddressedTrackedChunk(root, scope, objectType, records) {
  const payload = { schema_version: '2.3.0', scope, object_type: objectType, records };
  const body = Buffer.from(JSON.stringify(payload));
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  const suffix = `${scope.toLowerCase()}-${objectType.toLowerCase().replaceAll('_', '-')}`;
  const relative = `json/tracked/chunks/${digest}-${suffix}.json`;
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  return {
    path: relative,
    count: records.length,
    bytes: body.length,
    sha256: `sha256:${digest}`,
    scope,
    object_type: objectType
  };
}

function localModuleSpecifiers(source) {
  const matches = source.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.\.?\/[^'"]+)['"]/g);
  return [...matches].map(match => match[1]);
}

const cleanCloneBuild = buildStaticArtifact({ includeOptional: false });
assert(
  fs.existsSync(path.join(cleanCloneBuild.outputRoot, 'json', 'gp', 'GP.meta.json')),
  'the GP provenance sidecar is a required part of the packaged catalog'
);
assert.throws(
  () => assertRequiredStaticRuntimePaths(REQUIRED_STATIC_RUNTIME_PATHS.filter(path => path !== 'json/gp/GP.json')),
  /json\/gp\/GP\.json/,
  'the static build fails closed when the primary GP catalog is absent'
);
assert.throws(
  () => assertRequiredStaticRuntimePaths(REQUIRED_STATIC_RUNTIME_PATHS.filter(path => path !== 'json/tracked/TRACKED.manifest.json')),
  /json\/tracked\/TRACKED\.manifest\.json/,
  'the static build fails closed when the tracked-object manifest is absent'
);
assert.throws(
  () => assertRequiredStaticRuntimePaths(REQUIRED_STATIC_RUNTIME_PATHS.filter(path => path !== 'vendor/three/0.184.0/build/three.module.js')),
  /vendor\/three\/0\.184\.0\/build\/three\.module\.js/,
  'the static build fails closed when a packaged dependency is absent'
);
const firstBuild = buildStaticArtifact();
const firstManifestText = fs.readFileSync(path.join(firstBuild.outputRoot, 'asset-manifest.json'), 'utf8');
const secondBuild = buildStaticArtifact();
const secondManifestText = fs.readFileSync(path.join(secondBuild.outputRoot, 'asset-manifest.json'), 'utf8');
assert.strictEqual(secondManifestText, firstManifestText, 'static artifact manifest is deterministic across builds');

const outputRoot = secondBuild.outputRoot;
assert(
  fs.readFileSync(path.join(outputRoot, 'index.html'), 'utf8')
    .includes('<meta name="openbexi-deployment-mode" content="static">'),
  'curated artifact declares static mode and avoids nonexistent API probes'
);
assert(
  fs.readFileSync(path.join(outputRoot, 'index.html'), 'utf8')
    .includes('<meta name="openbexi-dependency-policy" content="packaged-only">'),
  'curated artifact declares its packaged-only dependency policy'
);
const outputFiles = filesUnder(outputRoot).map(file => normalized(path.relative(outputRoot, file))).sort();
const forbiddenTopLevel = new Set([
  '.git', '.github', 'node_modules', 'release', 'scripts', 'tests', 'tests_browser', 'tests_python', 'validation'
]);
for (const relative of outputFiles) {
  const segments = relative.split('/');
  const base = segments.at(-1).toLowerCase();
  assert(!forbiddenTopLevel.has(segments[0].toLowerCase()), `artifact exposes forbidden tree: ${relative}`);
  assert(!relative.toLowerCase().startsWith('json/ops/'), `artifact exposes operational data: ${relative}`);
  assert.notStrictEqual(base, 'roadmap.md', `artifact exposes roadmap: ${relative}`);
  assert(!base.startsWith('prompt'), `artifact exposes prompt material: ${relative}`);
  assert(!base.includes('.bak-') && !base.endsWith('.tmp') && !base.endsWith('~'), `artifact exposes backup/temp file: ${relative}`);
}
for (const forbiddenFile of [
  'package.json',
  'package-lock.json',
  'server.py',
  'ROADMAP.md',
  'PROMPT_IMPLEMENT_ROADMAP_V2.md',
  'release/version.json',
  'json/ops/example.json',
  'tests/runAll.js'
]) {
  assert(!outputFiles.includes(forbiddenFile), `artifact exposes source-only file: ${forbiddenFile}`);
}

const artifactManifest = JSON.parse(secondManifestText);
assert.strictEqual(artifactManifest.version, JSON.parse(fs.readFileSync('release/version.json', 'utf8')).version);
assert.strictEqual(artifactManifest.entrypoint, 'index.html');
assert.deepStrictEqual(
  artifactManifest.files.map(file => file.path),
  [...artifactManifest.files.map(file => file.path)].sort(),
  'artifact file records are sorted'
);
assert.strictEqual(artifactManifest.fileCount, artifactManifest.files.length);
for (const record of artifactManifest.files) {
  const file = path.join(outputRoot, ...record.path.split('/'));
  assert(fs.existsSync(file), `manifest file exists: ${record.path}`);
  assert.strictEqual(fs.statSync(file).size, record.bytes, `manifest byte count matches: ${record.path}`);
  assert.strictEqual(sha256(file), record.sha256, `manifest hash matches: ${record.path}`);
}

const manifestPaths = new Set(artifactManifest.files.map(file => file.path));
assert(manifestPaths.has('.nojekyll'), 'artifact disables Jekyll path rewriting');
assert(manifestPaths.has('vendor/satellite.js/6.0.2/satellite.es.js'));
assert(manifestPaths.has('vendor/three/0.184.0/build/three.module.js'));
assert(manifestPaths.has('json/gp/GP.json'), 'artifact packages the primary GP catalog');
assert(manifestPaths.has('json/gp/GP.meta.json'), 'artifact packages GP provenance beside the catalog');
assert(manifestPaths.has('json/launches/launches.json'), 'artifact packages the SATCAT-backed launch timeline');
assert(manifestPaths.has('json/launches/launches.meta.json'), 'artifact packages launch provenance beside the timeline');
assert(manifestPaths.has('json/decayed/decayed.meta.json'), 'artifact packages decay provenance beside the timeline');
assert(manifestPaths.has('json/tracked/TRACKED.manifest.json'), 'artifact packages the tracked-object publication pointer');
assert(manifestPaths.has('json/tracked/TRACKED.meta.json'), 'artifact packages tracked-object provenance');
assert(manifestPaths.has('json/tle/TLE.json'), 'artifact retains the TLE compatibility catalog');
assert(manifestPaths.has('json/tle/TLE.meta.json'), 'artifact retains TLE provenance for fallback');
assert(manifestPaths.has('js/domain/orbitalSourceAdapters.js'), 'artifact packages the OMM adapter');
assert(manifestPaths.has('js/domain/v21Contracts.js'), 'artifact packages OMM runtime contracts');
assert(manifestPaths.has('js/orbit/multiFormatPropagationService.js'), 'artifact packages multi-format propagation');
assert(manifestPaths.has('js/orbit/satelliteMotionInterpolator.js'), 'artifact packages smooth satellite motion');
assert(!manifestPaths.has('js/satelliteCategoryFilter.js'), 'artifact excludes the deprecated v2.2 category compatibility module');
assert(manifestPaths.has('js/simulationClock.js'), 'artifact packages the authoritative simulation clock');
assert(manifestPaths.has('js/trackedObjectCatalog.js'), 'artifact packages the lazy tracked-object loader');
assert(!manifestPaths.has('vendor/satellite.js/6.0.2/manifest.json'));
assert(!manifestPaths.has('vendor/three/0.184.0/manifest.json'));

const trackedManifest = JSON.parse(
  fs.readFileSync(path.join(outputRoot, 'json', 'tracked', 'TRACKED.manifest.json'), 'utf8')
);
const trackedMetadata = JSON.parse(
  fs.readFileSync(path.join(outputRoot, 'json', 'tracked', 'TRACKED.meta.json'), 'utf8')
);
const gpMetadata = JSON.parse(
  fs.readFileSync(path.join(outputRoot, 'json', 'gp', 'GP.meta.json'), 'utf8')
);
const gpCatalogPath = path.join(outputRoot, 'json', 'gp', 'GP.json');
validateTrackedStaticLineage({ trackedManifest, trackedMetadata, gpMetadata, gpCatalogPath });
const absentCatalogRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbexi-tracked-absent-'));
try {
  const currentDescriptor = contentAddressedTrackedChunk(
    absentCatalogRoot,
    'CURRENT',
    'PAYLOAD',
    [{ norad_id: '100001', object_type: 'PAYLOAD', catalog_membership_status: 'PRESENT', decay_date: null }]
  );
  const absentDescriptor = contentAddressedTrackedChunk(
    absentCatalogRoot,
    'HISTORICAL',
    'DEBRIS',
    [{ norad_id: '100002', object_type: 'DEBRIS', catalog_membership_status: 'ABSENT', decay_date: null }]
  );
  const absentManifest = {
    schema_version: '2.3.0',
    catalog_revision: `sha256:${'1'.repeat(64)}`,
    provider_completeness_claim: false,
    counts: {
      current: 1,
      historical: 0,
      absent: 1,
      history_total: 1,
      total: 2,
      propagatable: 1,
      metadata_only: 1,
      current_propagatable: 1,
      current_metadata_only: 0
    },
    invariants: {
      provider_coverage_holds: true,
      catalog_partition_holds: true,
      current_chunk_count_holds: true,
      history_chunk_count_holds: true
    },
    chunks: [currentDescriptor],
    history_chunks: [absentDescriptor],
    quarantine: null
  };
  assert.doesNotThrow(
    () => validateTrackedStaticCatalog(absentManifest, () => {}, absentCatalogRoot),
    'tracked static validation accepts a valid ABSENT history partition'
  );
} finally {
  fs.rmSync(absentCatalogRoot, { recursive: true, force: true });
}
assert.throws(
  () => validateTrackedStaticLineage({
    trackedManifest: {
      ...trackedManifest,
      provenance: { ...trackedManifest.provenance, gp_revision: `sha256:${'0'.repeat(64)}` }
    },
    trackedMetadata,
    gpMetadata,
    gpCatalogPath
  }),
  /GP lineage does not match/,
  'the static build rejects a tracked catalog derived from a different GP snapshot'
);
assert.throws(
  () => validateTrackedStaticLineage({
    trackedManifest,
    trackedMetadata,
    gpMetadata: { ...gpMetadata, dataset_hash: `sha256:${'0'.repeat(64)}` },
    gpCatalogPath
  }),
  /GP catalog bytes and metadata revisions do not match/,
  'the static build rejects GP catalog and metadata hash drift'
);
assert.throws(
  () => validateTrackedStaticLineage({
    trackedManifest,
    trackedMetadata: { ...trackedMetadata, source_gp_groups: ['unrelated-group'] },
    gpMetadata,
    gpCatalogPath
  }),
  /GP source-group lineage does not match/,
  'the static build rejects tracked source-group provenance drift'
);
assert.throws(
  () => validateTrackedStaticLineage({
    trackedManifest,
    trackedMetadata: { ...trackedMetadata, dataset_hash: `sha256:${'0'.repeat(64)}` },
    gpMetadata,
    gpCatalogPath
  }),
  /manifest and metadata revisions are inconsistent/,
  'the static build rejects tracked metadata self-hash drift'
);
assert.throws(
  () => validateTrackedStaticLineage({
    trackedManifest,
    trackedMetadata: {
      ...trackedMetadata,
      counts: { ...trackedMetadata.counts, metadata_only: trackedMetadata.counts.metadata_only + 1 }
    },
    gpMetadata,
    gpCatalogPath
  }),
  /Metadata tracked catalog counts are inconsistent|manifest and metadata counts are inconsistent/,
  'the static build rejects tracked manifest and metadata availability-count drift'
);
assert.throws(
  () => validateTrackedStaticCatalog(
    { ...trackedManifest, chunks: [{ ...trackedManifest.chunks[0], path: '../outside.json' }] },
    () => {}
  ),
  /local content-addressed chunk/,
  'tracked static validation rejects traversal paths before reading them'
);
assert.throws(
  () => validateTrackedStaticCatalog(
    { ...trackedManifest, chunks: [{ ...trackedManifest.chunks[0], sha256: `sha256:${'0'.repeat(64)}` }] },
    () => {}
  ),
  /local content-addressed chunk/,
  'tracked static validation binds the digest to the content-addressed filename'
);
assert.throws(
  () => validateTrackedStaticCatalog(
    { ...trackedManifest, counts: { ...trackedManifest.counts, current: trackedManifest.counts.current + 1 } },
    () => {}
  ),
  /counts do not match/,
  'tracked static validation rejects manifest/chunk count drift'
);
assert.throws(
  () => validateTrackedStaticCatalog(
    {
      ...trackedManifest,
      counts: { ...trackedManifest.counts, metadata_only: trackedManifest.counts.metadata_only + 1 }
    },
    () => {}
  ),
  /Manifest tracked catalog counts are inconsistent/,
  'tracked static validation rejects availability partition drift'
);
assert.throws(
  () => validateTrackedStaticCatalog(
    {
      ...trackedManifest,
      chunks: [
        { ...trackedManifest.chunks[0], object_type: 'DEBRIS' },
        ...trackedManifest.chunks.slice(1)
      ]
    },
    () => {}
  ),
  /taxonomy does not match/,
  'tracked static validation rejects descriptor and payload taxonomy drift'
);
assert.throws(
  () => validateTrackedStaticCatalog(
    {
      ...trackedManifest,
      chunks: trackedManifest.chunks.slice(1),
      history_chunks: [trackedManifest.chunks[0], ...(trackedManifest.history_chunks ?? [])]
    },
    () => {}
  ),
  /taxonomy does not match/,
  'tracked static validation rejects current and historical partition drift'
);
const trackedDescriptors = [
  ...(trackedManifest.chunks ?? []),
  ...(trackedManifest.history_chunks ?? []),
  ...(trackedManifest.quarantine ? [trackedManifest.quarantine] : [])
];
const referencedTrackedPaths = new Set(trackedDescriptors.map(descriptor => descriptor.path));
assert(referencedTrackedPaths.size > 0, 'tracked manifest references content-addressed chunks');
for (const relative of referencedTrackedPaths) {
  assert(manifestPaths.has(relative), `artifact packages tracked manifest reference: ${relative}`);
}
assert.deepStrictEqual(
  outputFiles.filter(relative => relative.startsWith('json/tracked/chunks/')).sort(),
  [...referencedTrackedPaths].sort(),
  'artifact excludes unreferenced retained tracked chunks'
);

for (const relative of outputFiles.filter(file => /\.(?:css|html|js|mjs)$/i.test(file))) {
  const file = path.join(outputRoot, ...relative.split('/'));
  const source = fs.readFileSync(file, 'utf8');
  assert(!source.includes('/node_modules/'), `${relative} contains a node_modules runtime URL`);
  assert(!source.includes('https://unpkg.com/'), `${relative} contains an unpkg runtime URL`);
  assert(!source.includes('raw.githubusercontent.com/'), `${relative} contains a mutable raw-GitHub runtime URL`);
  assert(!source.includes('placehold.co'), `${relative} contains a remote placeholder fallback`);
  assert(!source.includes('PROMPT_History.md'), `${relative} contains a source-only prompt-history URL`);
  for (const specifier of localModuleSpecifiers(source)) {
    const importedUrl = new URL(specifier, `https://static.invalid/${relative}`);
    const importedPath = decodeURIComponent(importedUrl.pathname.replace(/^\//, ''));
    assert(fs.existsSync(path.join(outputRoot, ...importedPath.split('/'))), `${relative} imports missing ${specifier}`);
  }
}

for (const htmlFile of ['index.html', 'markdown_viewer.html', 'swagger.html']) {
  const html = fs.readFileSync(path.join(outputRoot, htmlFile), 'utf8');
  const localAttributes = html.matchAll(/(?:src|href)=["'](?!https?:|#|mailto:)([^"'?]+)(?:\?[^"']*)?["']/gi);
  for (const match of localAttributes) {
    const referenced = match[1];
    if (!referenced || referenced.startsWith('data:') || referenced.includes('${')) continue;
    const targetUrl = new URL(referenced, `https://static.invalid/${htmlFile}`);
    const targetPath = decodeURIComponent(targetUrl.pathname.replace(/^\//, ''));
    assert(fs.existsSync(path.join(outputRoot, ...targetPath.split('/'))), `${htmlFile} references missing ${referenced}`);
  }
}

console.log('staticArtifact tests passed');
