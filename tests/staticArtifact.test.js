import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REQUIRED_STATIC_RUNTIME_PATHS,
  assertRequiredStaticRuntimePaths,
  buildStaticArtifact,
  readStrictTrackedJson,
  validateStaticJsonRevisionPair,
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

function trackedCatalogRevision(chunks, historyChunks, coverageRevision) {
  const material = [...chunks, ...historyChunks].map(descriptor => ({
    path: descriptor.path,
    sha256: descriptor.sha256
  }));
  const body = Buffer.from(JSON.stringify({
    chunks: material,
    coverage_revision: coverageRevision
  }), 'utf8');
  return `sha256:${crypto.createHash('sha256').update(body).digest('hex')}`;
}

function trackedCoverageRevision(rowAccounting, expected, quarantineSha256) {
  const body = Buffer.from(JSON.stringify({
    row_accounting: rowAccounting,
    expected,
    quarantine_sha256: quarantineSha256
  }), 'utf8');
  return `sha256:${crypto.createHash('sha256').update(body).digest('hex')}`;
}

function rebindTrackedRevisions(manifest, metadata) {
  const rowAccounting = Object.fromEntries(
    ['received', 'accepted', 'quarantined', 'duplicates', 'issues']
      .map(key => [key, manifest.counts[key]])
  );
  const coverageRevision = trackedCoverageRevision(
    rowAccounting,
    manifest.counts.expected,
    manifest.quarantine.sha256
  );
  const catalogRevision = trackedCatalogRevision(
    manifest.chunks,
    manifest.history_chunks,
    coverageRevision
  );
  manifest.coverage_revision = coverageRevision;
  manifest.catalog_revision = catalogRevision;
  metadata.coverage_revision = coverageRevision;
  metadata.catalog_revision = catalogRevision;
  metadata.dataset_hash = catalogRevision;
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
    id: `${scope.toLowerCase()}-${objectType.toLowerCase().replaceAll('_', '-')}`,
    path: relative,
    count: records.length,
    bytes: body.length,
    sha256: `sha256:${digest}`,
    scope,
    object_type: objectType
  };
}

function contentAddressedQuarantineChunk(root, records = []) {
  const payload = { schema_version: '2.3.0', records };
  const body = Buffer.from(JSON.stringify(payload));
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  const relative = `json/tracked/chunks/${digest}-quarantine.json`;
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  return {
    path: relative,
    count: records.length,
    bytes: body.length,
    sha256: `sha256:${digest}`
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
const strictNumberRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbexi-tracked-numbers-'));
try {
  const invalidVectors = [
    ['fractional', Buffer.from('{"unexpected":1.0}'), /canonical nonnegative safe-integer/],
    ['negative-zero', Buffer.from('{"unexpected":-0}'), /canonical nonnegative safe-integer|non-finite or unsafe/],
    ['exponent', Buffer.from('{"unexpected":1e400}'), /canonical nonnegative safe-integer|non-finite or unsafe/],
    ['unsafe', Buffer.from('{"unexpected":9007199254740993}'), /canonical nonnegative safe-integer|non-finite or unsafe/],
    ['nan', Buffer.from('{"unexpected":NaN}'), /Unexpected token|not valid JSON/i],
    ['infinity', Buffer.from('{"unexpected":Infinity}'), /Unexpected token|not valid JSON/i],
    ['duplicate-key', Buffer.from('{"unexpected":1,"unexpected":2}'), /duplicate(?: JSON)? object key/i],
    ['invalid-utf8', Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0x80, 0x22, 0x7d]), /valid UTF-8/],
    ['utf8-bom', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{}')]), /BOM-free UTF-8/],
    ['utf16', Buffer.from('\ufeff{}', 'utf16le'), /BOM-free UTF-8/],
    ['lone-surrogate', Buffer.from('{"unexpected":"\\ud800"}'), /Unicode scalar/]
  ];
  for (const [name, body, expected] of invalidVectors) {
    const file = path.join(strictNumberRoot, `${name}.json`);
    fs.writeFileSync(file, body);
    assert.throws(
      () => readStrictTrackedJson(file),
      expected,
      `the static build rejects noncanonical tracked JSON bytes: ${name}`
    );
  }
} finally {
  fs.rmSync(strictNumberRoot, { recursive: true, force: true });
}
const gpMetadata = JSON.parse(
  fs.readFileSync(path.join(outputRoot, 'json', 'gp', 'GP.meta.json'), 'utf8')
);
const gpCatalogPath = path.join(outputRoot, 'json', 'gp', 'GP.json');
validateTrackedStaticLineage({ trackedManifest, trackedMetadata, gpMetadata, gpCatalogPath });
const revisionPairRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbexi-static-revision-pair-'));
try {
  const launchSource = fs.readFileSync(path.join(outputRoot, 'json', 'launches', 'launches.json'));
  const rewrittenLaunch = Buffer.concat([launchSource, Buffer.from('\n')]);
  const rewrittenLaunchPath = path.join(revisionPairRoot, 'launches.json');
  fs.writeFileSync(rewrittenLaunchPath, rewrittenLaunch);
  const rawRevision = `sha256:${crypto.createHash('sha256').update(rewrittenLaunch).digest('hex')}`;
  assert.throws(
    () => validateStaticJsonRevisionPair(
      rewrittenLaunchPath,
      { catalog_revision: rawRevision, dataset_hash: rawRevision },
      'launch'
    ),
    /producer-canonical metadata revision/,
    'a raw-only non-GP rewrite cannot forge a matching static revision pair'
  );

  const duplicateKeyPath = path.join(revisionPairRoot, 'duplicate-key.json');
  const duplicateKeyBody = Buffer.from('{"unexpected":1,"unexpected":2}');
  fs.writeFileSync(duplicateKeyPath, duplicateKeyBody);
  const duplicateKeyRevision = `sha256:${crypto.createHash('sha256').update(duplicateKeyBody).digest('hex')}`;
  assert.throws(
    () => validateStaticJsonRevisionPair(
      duplicateKeyPath,
      { catalog_revision: duplicateKeyRevision, dataset_hash: duplicateKeyRevision },
      'generic'
    ),
    /duplicate(?: JSON)? object key/i,
    'generic static revision pairs reject duplicate JSON object keys'
  );

  const gpSource = fs.readFileSync(gpCatalogPath, 'utf8');
  const surrogateGp = `${gpSource.slice(0, -1)},{"unexpected":"\\ud800"}]`;
  const surrogateGpPath = path.join(revisionPairRoot, 'GP.json');
  fs.writeFileSync(surrogateGpPath, surrogateGp);
  const surrogateRevision = `sha256:${crypto.createHash('sha256').update(surrogateGp).digest('hex')}`;
  assert.throws(
    () => validateStaticJsonRevisionPair(
      surrogateGpPath,
      { catalog_revision: surrogateRevision, dataset_hash: surrogateRevision },
      'GP'
    ),
    /Unicode scalar/,
    'escaped lone surrogates cannot enter a statically packaged core catalog'
  );
} finally {
  fs.rmSync(revisionPairRoot, { recursive: true, force: true });
}
const reorderedCoverageMetadata = structuredClone(trackedMetadata);
reorderedCoverageMetadata.coverage = Object.fromEntries(
  Object.entries(reorderedCoverageMetadata.coverage).reverse()
);
assert.doesNotThrow(
  () => validateTrackedStaticLineage({
    trackedManifest,
    trackedMetadata: reorderedCoverageMetadata,
    gpMetadata,
    gpCatalogPath
  }),
  'tracked coverage objects compare semantically without depending on key order'
);
const absentCatalogRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbexi-tracked-absent-'));
try {
  const validCurrentRecord = {
    norad_id: '100001',
    object_type: 'PAYLOAD',
    lifecycle_status: 'ACTIVE',
    observation_status: 'OBSERVED',
    catalog_membership_status: 'PRESENT',
    decay_date: null,
    has_current_elements: true,
    metadata_only: false
  };
  const validHistoricalRecord = {
    norad_id: '100002',
    object_type: 'DEBRIS',
    lifecycle_status: 'ABSENT',
    observation_status: 'ABSENT',
    catalog_membership_status: 'ABSENT',
    decay_date: null,
    has_current_elements: false,
    metadata_only: true
  };
  const currentDescriptor = contentAddressedTrackedChunk(
    absentCatalogRoot,
    'CURRENT',
    'PAYLOAD',
    [validCurrentRecord]
  );
  const absentDescriptor = contentAddressedTrackedChunk(
    absentCatalogRoot,
    'HISTORICAL',
    'DEBRIS',
    [validHistoricalRecord]
  );
  const quarantineDescriptor = contentAddressedQuarantineChunk(absentCatalogRoot);
  const rowAccounting = {
    received: 2,
    accepted: 2,
    quarantined: 0,
    duplicates: 0,
    issues: 0
  };
  const coverageRevision = trackedCoverageRevision(rowAccounting, 2, quarantineDescriptor.sha256);
  const absentManifest = {
    schema_version: '2.3.0',
    catalog_revision: trackedCatalogRevision([currentDescriptor], [absentDescriptor], coverageRevision),
    coverage_revision: coverageRevision,
    provider_completeness_claim: false,
    counts: {
      expected: 2,
      expected_provider_records: null,
      ...rowAccounting,
      current: 1,
      historical: 0,
      absent: 1,
      history_total: 1,
      total: 2,
      propagatable: 1,
      metadata_only: 1,
      current_propagatable: 1,
      current_metadata_only: 0,
      object_types: { PAYLOAD: 1, DEBRIS: 1, ROCKET_BODY: 0, MISSION_RELATED: 0, UNKNOWN: 0 },
      current_object_types: { PAYLOAD: 1, DEBRIS: 0, ROCKET_BODY: 0, MISSION_RELATED: 0, UNKNOWN: 0 }
    },
    coverage: {
      expected: 2,
      expected_provider_records: null,
      received: 2,
      accepted: 2,
      quarantined: 0,
      duplicates: 0,
      complete_source_snapshot: true,
      provider_completeness_claim: false,
      invariant: 'received == accepted + quarantined + duplicates',
      invariant_holds: true,
      expected_matches_received: true
    },
    invariants: {
      provider_coverage_holds: true,
      catalog_partition_holds: true,
      current_chunk_count_holds: true,
      history_chunk_count_holds: true
    },
    chunks: [currentDescriptor],
    history_chunks: [absentDescriptor],
    quarantine: quarantineDescriptor
  };
  assert.doesNotThrow(
    () => validateTrackedStaticCatalog(absentManifest, () => {}, absentCatalogRoot),
    'tracked static validation accepts a valid ABSENT history partition'
  );
  const recordCases = [
    ['boolean-id', record => { record.norad_id = true; }],
    ['object-id', record => { record.norad_id = { id: '100001' }; }],
    ['leading-zero-id', record => { record.norad_id = '0100001'; }],
    ['lifecycle-scope', record => { record.lifecycle_status = 'DECAYED'; }],
    ['observation-scope', record => { record.observation_status = 'ABSENT'; }],
    ['non-string-date', record => { record.decay_date = []; }],
    ['invalid-date', record => { record.decay_date = '2026-02-31'; }],
    ['historical-current-elements', record => {
      record.lifecycle_status = 'DECAYED';
      record.decay_date = '2026-01-01';
      record.has_current_elements = true;
      record.metadata_only = false;
    }]
  ];
  for (const [label, mutate] of recordCases) {
    const record = structuredClone(validCurrentRecord);
    mutate(record);
    const descriptor = contentAddressedTrackedChunk(
      absentCatalogRoot,
      'CURRENT',
      'PAYLOAD',
      [record]
    );
    const candidate = {
      ...absentManifest,
      chunks: [descriptor],
      catalog_revision: trackedCatalogRevision(
        [descriptor],
        absentManifest.history_chunks,
        absentManifest.coverage_revision
      )
    };
    assert.throws(
      () => validateTrackedStaticCatalog(candidate, () => {}, absentCatalogRoot),
      /record violates identity, type, or scope partition/,
      `static tracked validation rejects a self-consistently rehashed ${label}`
    );
  }

  const duplicateDescriptor = contentAddressedTrackedChunk(
    absentCatalogRoot,
    'CURRENT',
    'PAYLOAD',
    [validCurrentRecord, { ...validCurrentRecord }]
  );
  const duplicateManifest = structuredClone(absentManifest);
  duplicateManifest.chunks = [duplicateDescriptor];
  duplicateManifest.counts.current = 2;
  duplicateManifest.counts.total = 3;
  duplicateManifest.counts.propagatable = 2;
  duplicateManifest.counts.current_propagatable = 2;
  duplicateManifest.counts.object_types.PAYLOAD = 2;
  duplicateManifest.counts.current_object_types.PAYLOAD = 2;
  duplicateManifest.catalog_revision = trackedCatalogRevision(
    duplicateManifest.chunks,
    duplicateManifest.history_chunks,
    duplicateManifest.coverage_revision
  );
  assert.throws(
    () => validateTrackedStaticCatalog(duplicateManifest, () => {}, absentCatalogRoot),
    /record violates identity, type, or scope partition/,
    'static tracked validation rejects duplicate NORAD identities after all hashes are rebound'
  );

  const availabilityManifest = structuredClone(absentManifest);
  availabilityManifest.counts.propagatable = 0;
  availabilityManifest.counts.metadata_only = 2;
  availabilityManifest.counts.current_propagatable = 0;
  availabilityManifest.counts.current_metadata_only = 1;
  assert.throws(
    () => validateTrackedStaticCatalog(availabilityManifest, () => {}, absentCatalogRoot),
    /manifest counts do not match its referenced chunks/,
    'static tracked validation derives availability counts from records'
  );
  const booleanTypeManifest = structuredClone(absentManifest);
  booleanTypeManifest.counts.object_types.ROCKET_BODY = false;
  booleanTypeManifest.counts.current_object_types.ROCKET_BODY = false;
  assert.throws(
    () => validateTrackedStaticCatalog(booleanTypeManifest, () => {}, absentCatalogRoot),
    /manifest counts do not match its referenced chunks/,
    'static tracked validation does not equate boolean false with a zero type count'
  );
  const nonstandardChunkBody = Buffer.from(
    '{"schema_version":"2.3.0","scope":"CURRENT","object_type":"PAYLOAD",' +
    '"records":[{"norad_id":"100001","object_type":"PAYLOAD",' +
    '"catalog_membership_status":"PRESENT","decay_date":null}],"unexpected":NaN}'
  );
  const nonstandardChunkDigest = crypto.createHash('sha256').update(nonstandardChunkBody).digest('hex');
  const nonstandardChunkRelative =
    `json/tracked/chunks/${nonstandardChunkDigest}-current-payload.json`;
  const nonstandardChunkPath = path.join(absentCatalogRoot, ...nonstandardChunkRelative.split('/'));
  fs.writeFileSync(nonstandardChunkPath, nonstandardChunkBody);
  const nonstandardDescriptor = {
    ...currentDescriptor,
    path: nonstandardChunkRelative,
    bytes: nonstandardChunkBody.length,
    sha256: `sha256:${nonstandardChunkDigest}`
  };
  const nonstandardManifest = {
    ...absentManifest,
    chunks: [nonstandardDescriptor],
    catalog_revision: trackedCatalogRevision(
      [nonstandardDescriptor],
      absentManifest.history_chunks,
      absentManifest.coverage_revision
    )
  };
  assert.throws(
    () => validateTrackedStaticCatalog(nonstandardManifest, () => {}, absentCatalogRoot),
    /chunk is not valid JSON/,
    'tracked static validation rejects non-standard constants in content-addressed chunks'
  );
  const overflowChunkBody = Buffer.from(
    '{"schema_version":"2.3.0","scope":"CURRENT","object_type":"PAYLOAD",' +
    '"records":[' + JSON.stringify(validCurrentRecord) + '],"unexpected":1e400}'
  );
  const overflowDigest = crypto.createHash('sha256').update(overflowChunkBody).digest('hex');
  const overflowRelative = `json/tracked/chunks/${overflowDigest}-current-payload.json`;
  fs.writeFileSync(path.join(absentCatalogRoot, ...overflowRelative.split('/')), overflowChunkBody);
  const overflowDescriptor = {
    ...currentDescriptor,
    path: overflowRelative,
    bytes: overflowChunkBody.length,
    sha256: `sha256:${overflowDigest}`
  };
  assert.throws(
    () => validateTrackedStaticCatalog({
      ...absentManifest,
      chunks: [overflowDescriptor],
      catalog_revision: trackedCatalogRevision(
        [overflowDescriptor], absentManifest.history_chunks, absentManifest.coverage_revision
      )
    }, () => {}, absentCatalogRoot),
    /chunk is not valid JSON/,
    'tracked static validation rejects finite-syntax numeric overflow in a chunk'
  );

  assert.throws(
    () => validateTrackedStaticCatalog({
      ...absentManifest,
      quarantine: { ...absentManifest.quarantine, path: '' }
    }, () => {}, absentCatalogRoot),
    /local content-addressed chunk/,
    'tracked static validation requires a quarantine descriptor path'
  );
  const malformedQuarantineBody = Buffer.from('[]');
  const malformedQuarantineDigest = crypto.createHash('sha256').update(malformedQuarantineBody).digest('hex');
  const malformedQuarantineRelative =
    `json/tracked/chunks/${malformedQuarantineDigest}-quarantine.json`;
  fs.writeFileSync(
    path.join(absentCatalogRoot, ...malformedQuarantineRelative.split('/')),
    malformedQuarantineBody
  );
  const malformedQuarantine = {
    path: malformedQuarantineRelative,
    count: 0,
    bytes: malformedQuarantineBody.length,
    sha256: `sha256:${malformedQuarantineDigest}`
  };
  const malformedQuarantineManifest = structuredClone(absentManifest);
  malformedQuarantineManifest.quarantine = malformedQuarantine;
  const malformedCoverageRevision = trackedCoverageRevision(
    rowAccounting,
    2,
    malformedQuarantine.sha256
  );
  malformedQuarantineManifest.coverage_revision = malformedCoverageRevision;
  malformedQuarantineManifest.catalog_revision = trackedCatalogRevision(
    malformedQuarantineManifest.chunks,
    malformedQuarantineManifest.history_chunks,
    malformedCoverageRevision
  );
  assert.throws(
    () => validateTrackedStaticCatalog(malformedQuarantineManifest, () => {}, absentCatalogRoot),
    /chunk record count does not match/,
    'tracked static validation rejects a non-object quarantine payload'
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
    trackedManifest: { ...trackedManifest, catalog_revision: `sha256:${'0'.repeat(64)}` },
    trackedMetadata: {
      ...trackedMetadata,
      catalog_revision: `sha256:${'0'.repeat(64)}`,
      dataset_hash: `sha256:${'0'.repeat(64)}`
    },
    gpMetadata,
    gpCatalogPath
  }),
  /manifest and metadata revisions are inconsistent/,
  'the static build recomputes the tracked catalog revision instead of trusting matching declarations'
);
{
  const forgedCoverageRevision = `sha256:${'0'.repeat(64)}`;
  const forgedCatalogRevision = trackedCatalogRevision(
    trackedManifest.chunks,
    trackedManifest.history_chunks,
    forgedCoverageRevision
  );
  assert.throws(
    () => validateTrackedStaticLineage({
      trackedManifest: {
        ...trackedManifest,
        coverage_revision: forgedCoverageRevision,
        catalog_revision: forgedCatalogRevision
      },
      trackedMetadata: {
        ...trackedMetadata,
        coverage_revision: forgedCoverageRevision,
        catalog_revision: forgedCatalogRevision,
        dataset_hash: forgedCatalogRevision
      },
      gpMetadata,
      gpCatalogPath
    }),
    /revision inputs are invalid|coverage_revision does not match/,
    'the static build recomputes coverage_revision instead of trusting matching declarations'
  );
}
{
  const impossibleManifest = structuredClone(trackedManifest);
  const impossibleMetadata = structuredClone(trackedMetadata);
  impossibleManifest.counts.issues = 9;
  impossibleMetadata.counts.issues = 9;
  rebindTrackedRevisions(impossibleManifest, impossibleMetadata);
  assert.throws(
    () => validateTrackedStaticLineage({
      trackedManifest: impossibleManifest,
      trackedMetadata: impossibleMetadata,
      gpMetadata,
      gpCatalogPath
    }),
    /issue accounting does not match quarantine evidence/,
    'the static build rejects self-consistently rehashed impossible issue accounting'
  );
}
assert.throws(
  () => validateTrackedStaticLineage({
    trackedManifest,
    trackedMetadata: {
      ...trackedMetadata,
      counts: { ...trackedMetadata.counts, issues: trackedMetadata.counts.issues + 1 }
    },
    gpMetadata,
    gpCatalogPath
  }),
  /metadata row accounting are inconsistent/,
  'the static build binds metadata row accounting to the tracked manifest'
);
{
  const forgedManifest = structuredClone(trackedManifest);
  const forgedMetadata = structuredClone(trackedMetadata);
  forgedManifest.counts.expected_provider_records = 123;
  forgedManifest.coverage.expected_provider_records = 123;
  forgedMetadata.counts.expected_provider_records = 123;
  forgedMetadata.coverage.expected_provider_records = 123;
  assert.throws(
    () => validateTrackedStaticLineage({
      trackedManifest: forgedManifest,
      trackedMetadata: forgedMetadata,
      gpMetadata,
      gpCatalogPath
    }),
    /expected provider-record count must be null/,
    'the static build rejects an unsigned provider expected-count claim'
  );
}
{
  const unsafeManifest = structuredClone(trackedManifest);
  const unsafeMetadata = structuredClone(trackedMetadata);
  const unsafe = Number.MAX_SAFE_INTEGER + 1;
  unsafeManifest.counts.expected = unsafe;
  unsafeManifest.coverage.expected = unsafe;
  unsafeMetadata.counts.expected = unsafe;
  unsafeMetadata.coverage.expected = unsafe;
  assert.throws(
    () => validateTrackedStaticLineage({
      trackedManifest: unsafeManifest,
      trackedMetadata: unsafeMetadata,
      gpMetadata,
      gpCatalogPath
    }),
    /expected coverage count is invalid/,
    'the static validator rejects parsed tracked integers outside the safe range'
  );
}
{
  const falseCompleteManifest = structuredClone(trackedManifest);
  const falseCompleteMetadata = structuredClone(trackedMetadata);
  falseCompleteManifest.counts.expected = null;
  falseCompleteMetadata.counts.expected = null;
  falseCompleteManifest.coverage.expected = null;
  falseCompleteManifest.coverage.expected_matches_received = null;
  falseCompleteMetadata.coverage = structuredClone(falseCompleteManifest.coverage);
  rebindTrackedRevisions(falseCompleteManifest, falseCompleteMetadata);
  assert.throws(
    () => validateTrackedStaticLineage({
      trackedManifest: falseCompleteManifest,
      trackedMetadata: falseCompleteMetadata,
      gpMetadata,
      gpCatalogPath
    }),
    /coverage invariants are inconsistent/,
    'the static build rejects a complete-snapshot claim without a verified expected-record match'
  );
}
assert.throws(
  () => validateTrackedStaticLineage({
    trackedManifest,
    trackedMetadata: {
      ...trackedMetadata,
      source_status: 'PARTIAL',
      last_reconciled_catalog_revision: null
    },
    gpMetadata,
    gpCatalogPath
  }),
  /complete-snapshot claim is not backed by reconciled metadata/,
  'the static build rejects a complete manifest paired with unverified reconciliation metadata'
);
for (const [label, value] of [
  ['missing', undefined],
  ['non-ISO numeric', '0'],
  ['impossible-date', '2026-02-31T12:00:00Z']
]) {
  const metadata = { ...trackedMetadata };
  if (value === undefined) {
    delete metadata.last_reconciled_at;
  } else {
    metadata.last_reconciled_at = value;
  }
  assert.throws(
    () => validateTrackedStaticLineage({
      trackedManifest,
      trackedMetadata: metadata,
      gpMetadata,
      gpCatalogPath
    }),
    /complete-snapshot claim is not backed by reconciled metadata/,
    `the static build rejects ${label} complete-snapshot reconciliation timestamps`
  );
}
assert.throws(
  () => validateTrackedStaticLineage({
    trackedManifest,
    trackedMetadata: {
      ...trackedMetadata,
      coverage_revision: `sha256:${'0'.repeat(64)}`
    },
    gpMetadata,
    gpCatalogPath
  }),
  /coverage revisions are inconsistent/,
  'the static build binds tracked metadata to the manifest coverage revision'
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
    { ...trackedManifest, chunks: [{ ...trackedManifest.chunks[0], path: 'json/tracked/chunks/current-payload.json' }] },
    () => {}
  ),
  /local content-addressed chunk/,
  'tracked static validation rejects a generic chunk filename'
);
assert.throws(
  () => validateTrackedStaticCatalog(
    {
      ...trackedManifest,
      chunks: [{
        ...trackedManifest.chunks[0],
        path: `json/tracked/chunks/${'0'.repeat(64)}-current-payload.json`
      }]
    },
    () => {}
  ),
  /local content-addressed chunk/,
  'tracked static validation rejects a filename digest that differs from its descriptor'
);
for (const digest of [
  trackedManifest.chunks[0].sha256.replace(/^sha256:/, ''),
  trackedManifest.chunks[0].sha256.toUpperCase()
]) {
  assert.throws(
    () => validateTrackedStaticCatalog(
      { ...trackedManifest, chunks: [{ ...trackedManifest.chunks[0], sha256: digest }] },
      () => {}
    ),
    /local content-addressed chunk/,
    'tracked static validation requires exact lowercase sha256: descriptor syntax'
  );
}
assert.throws(
  () => validateTrackedStaticCatalog(
    {
      ...trackedManifest,
      chunks: trackedManifest.chunks.map((descriptor, index) => ({
        ...descriptor,
        id: index === 1 ? trackedManifest.chunks[0].id : descriptor.id
      }))
    },
    () => {}
  ),
  /descriptor ids must be nonempty and unique/,
  'tracked static validation rejects duplicate descriptor ids'
);
assert.throws(
  () => validateTrackedStaticCatalog(
    {
      ...trackedManifest,
      chunks: [{ ...trackedManifest.chunks[0], scope: 'HISTORICAL' }, ...trackedManifest.chunks.slice(1)]
    },
    () => {}
  ),
  /descriptor taxonomy is invalid/,
  'tracked static validation requires collection-consistent descriptor scope'
);
assert.throws(
  () => validateTrackedStaticCatalog(
    {
      ...trackedManifest,
      chunks: [{ ...trackedManifest.chunks[0], object_type: 'NOT_A_TRACKED_TYPE' }, ...trackedManifest.chunks.slice(1)]
    },
    () => {}
  ),
  /descriptor taxonomy is invalid/,
  'tracked static validation rejects unknown descriptor object types'
);
assert.throws(
  () => validateTrackedStaticCatalog(
    {
      ...trackedManifest,
      chunks: [trackedManifest.chunks[1], trackedManifest.chunks[0], ...trackedManifest.chunks.slice(2)]
    },
    () => {}
  ),
  /catalog_revision does not match its descriptor closure/,
  'tracked static validation binds catalog_revision to current-then-history descriptor order'
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
  /tracked (?:static catalog manifest|catalog) counts (?:are inconsistent|do not match)/i,
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
  /descriptor taxonomy is invalid|taxonomy does not match/,
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
