import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { attestStaticDeployment } from '../scripts/attest-static-deployment.mjs';
import { buildStaticArtifact } from '../scripts/build-static.mjs';
import { rehearseStaticRollback } from '../scripts/rehearse-static-rollback.mjs';
import { verifyPagesArtifactArchive } from '../scripts/verify-pages-artifact.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TREE_SCRIPT = path.join(ROOT, 'scripts', 'check-release-tree.mjs');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, ...options.env }
  });
  if (options.expectFailure) {
    assert.notStrictEqual(result.status, 0, `${command} ${args.join(' ')} unexpectedly passed`);
  } else {
    assert.strictEqual(result.status, 0, `${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

function write(root, relative, value) {
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
  return target;
}

function filesUnder(root, relative = '') {
  const directory = path.join(root, ...relative.split('/').filter(Boolean));
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...filesUnder(root, child));
    if (entry.isFile()) files.push(child);
  }
  return files;
}

function artifactByteSnapshot(root) {
  return filesUnder(root)
    .sort()
    .map(relative => {
      const body = fs.readFileSync(path.join(root, ...relative.split('/')));
      return `${relative}\0${body.length}\0${sha256(body)}`;
    })
    .join('\n');
}

function tarPathFields(relative) {
  if (Buffer.byteLength(relative) <= 100) return { name: relative, prefix: '' };
  const separator = relative.lastIndexOf('/');
  const prefix = relative.slice(0, separator);
  const name = relative.slice(separator + 1);
  assert(separator > 0 && Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100, `fixture tar path fits ustar: ${relative}`);
  return { name, prefix };
}

function writeTarField(header, offset, length, value) {
  const body = Buffer.from(value, 'utf8');
  assert(body.length <= length, `fixture tar field fits ${length} bytes`);
  body.copy(header, offset);
}

function tarHeader(relative, size, type = '0') {
  const header = Buffer.alloc(512);
  const { name, prefix } = tarPathFields(relative);
  writeTarField(header, 0, 100, name);
  writeTarField(header, 100, 8, '0000644\0');
  writeTarField(header, 108, 8, '0000000\0');
  writeTarField(header, 116, 8, '0000000\0');
  writeTarField(header, 124, 12, `${size.toString(8).padStart(11, '0')}\0`);
  writeTarField(header, 136, 12, '00000000000\0');
  header.fill(0x20, 148, 156);
  writeTarField(header, 156, 1, type);
  writeTarField(header, 257, 6, 'ustar\0');
  writeTarField(header, 263, 2, '00');
  if (prefix) writeTarField(header, 345, 155, prefix);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeTarField(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
  return header;
}

function createTarArchive(target, entries) {
  const blocks = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.body ?? '');
    blocks.push(tarHeader(entry.path, body.length, entry.type ?? '0'));
    blocks.push(body);
    const padding = (512 - (body.length % 512)) % 512;
    if (padding) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  fs.writeFileSync(target, Buffer.concat(blocks));
  return target;
}

function writeAssetManifest(root) {
  const files = filesUnder(root)
    .filter(relative => relative !== 'asset-manifest.json')
    .sort()
    .map(relative => {
      const body = fs.readFileSync(path.join(root, ...relative.split('/')));
      return { path: relative, bytes: body.length, sha256: sha256(body) };
    });
  const manifest = {
    schemaVersion: 1,
    application: 'openbexi_orbit',
    version: 'fixture',
    entrypoint: 'index.html',
    fileCount: files.length,
    totalBytes: files.reduce((sum, descriptor) => sum + descriptor.bytes, 0),
    files
  };
  write(root, 'asset-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function createArtifactFixture(root) {
  write(root, '.nojekyll', '');
  write(root, 'index.html', '<!doctype html><title>fixture</title>\n');
  write(
    root,
    'js/releaseVersion.js',
    'export const RELEASE_FEATURE_FLAGS = Object.freeze({"experimental_tracked_object_catalog": Object.freeze({"enabled":true,"scope":"browser"})});\n'
  );
  write(root, 'json/gp/GP.json', '[{"NORAD_CAT_ID":"10001"}]\n');
  write(root, 'json/gp/GP.meta.json', '{"source_status":"VERIFIED_SNAPSHOT"}\n');

  const chunkPayload = Buffer.from(JSON.stringify({
    schema_version: '2.3.0',
    scope: 'CURRENT',
    object_type: 'DEBRIS',
    records: [{ norad_id: '10001', object_type: 'DEBRIS' }]
  }));
  const chunkHash = sha256(chunkPayload);
  const chunkPath = `json/tracked/chunks/${chunkHash}-current-debris.json`;
  write(root, chunkPath, chunkPayload);
  const revision = `sha256:${'a'.repeat(64)}`;
  const trackedManifest = {
    schema_version: '2.3.0',
    catalog_revision: revision,
    chunks: [{
      path: chunkPath,
      count: 1,
      bytes: chunkPayload.length,
      sha256: `sha256:${chunkHash}`,
      scope: 'CURRENT',
      object_type: 'DEBRIS'
    }],
    history_chunks: []
  };
  write(root, 'json/tracked/TRACKED.manifest.json', `${JSON.stringify(trackedManifest)}\n`);
  write(root, 'json/tracked/TRACKED.meta.json', `${JSON.stringify({ catalog_revision: revision, dataset_hash: revision })}\n`);
  writeAssetManifest(root);
}

function assertImmutableActionPins(workflow, expectedMajors) {
  const uses = [...workflow.matchAll(/^\s*-?\s*uses:\s+([a-z0-9_.-]+\/[a-z0-9_.-]+)@([^\s#]+)(?:\s+#\s+(v\d+\.\d+\.\d+))?\s*$/gmi)];
  assert(uses.length > 0, 'workflow declares external GitHub Actions');
  for (const [, action, reference, version] of uses) {
    assert.match(reference, /^[a-f0-9]{40}$/, `${action} must be pinned to an immutable commit SHA`);
    assert.match(version ?? '', /^v\d+\.\d+\.\d+$/, `${action} pin must document its exact release version`);
    const expectedMajor = expectedMajors[action];
    assert(expectedMajor, `unexpected external action without a reviewed release line: ${action}`);
    assert.strictEqual(Number(version.slice(1).split('.')[0]), expectedMajor, `${action} uses an unexpected release major`);
  }
  for (const action of Object.keys(expectedMajors)) {
    assert(uses.some(match => match[1] === action), `workflow is missing ${action}`);
  }
}

let loopbackFetchCount = 0;
async function withLoopbackOnlyFetch(operation) {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, options) => {
    const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert(['127.0.0.1', '::1', '[::1]', 'localhost'].includes(target.hostname), `test attempted external fetch: ${target.origin}`);
    loopbackFetchCount += 1;
    return nativeFetch(input, options);
  };
  try {
    return await operation();
  } finally {
    globalThis.fetch = nativeFetch;
  }
}

async function startArtifactServer(root, state) {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '');
    const target = path.resolve(root, ...pathname.split('/'));
    if (!pathname || !target.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(target)) {
      response.writeHead(404, { 'Cache-Control': 'no-store' }).end();
      return;
    }
    let body = fs.readFileSync(target);
    if (state.corruptPath === pathname) {
      body = Buffer.from(body);
      body[0] ^= 0xff;
    }
    if (state.oversizePath === pathname) body = Buffer.concat([body, Buffer.from('oversize')]);
    response.writeHead(200, {
      'Content-Length': body.length,
      'Cache-Control': pathname.includes('/chunks/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      ETag: `"${sha256(body)}"`
    });
    response.end(body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'openbexi-release-engineering-'));
try {
  const repository = path.join(temporary, 'repository');
  fs.mkdirSync(repository);
  run('git', ['init', '--quiet'], { cwd: repository });
  run('git', ['config', 'user.name', 'Release Test'], { cwd: repository });
  run('git', ['config', 'user.email', 'release-test@example.invalid'], { cwd: repository });
  write(repository, '.gitattributes', '* text=auto eol=lf\n');
  write(repository, 'sample.txt', 'exact bytes\n');
  run('git', ['add', '.'], { cwd: repository });
  run('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: repository });

  const treeReport = path.join(temporary, 'tree-report.json');
  run(process.execPath, [TREE_SCRIPT, '--root', repository, '--tree', 'HEAD', '--require-clean', '--output', treeReport]);
  const parsedTreeReport = JSON.parse(fs.readFileSync(treeReport, 'utf8'));
  assert.strictEqual(parsedTreeReport.rawWorktreeMatches, true);
  assert.strictEqual(parsedTreeReport.resolvedCommitOid, run('git', ['rev-parse', 'HEAD'], { cwd: repository }).stdout.trim());

  write(repository, 'sample.txt', Buffer.from('exact bytes\r\n'));
  const lineEndingFailure = run(process.execPath, [TREE_SCRIPT, '--root', repository, '--tree', 'HEAD'], { expectFailure: true });
  assert.match(lineEndingFailure.stderr, /sample\.txt \(byte mismatch\)/);

  write(repository, 'sample.txt', 'staged bytes\n');
  run('git', ['add', 'sample.txt'], { cwd: repository });
  run(process.execPath, [TREE_SCRIPT, '--root', repository, '--index']);
  const commitFailure = run(process.execPath, [TREE_SCRIPT, '--root', repository, '--tree', 'HEAD'], { expectFailure: true });
  assert.match(commitFailure.stderr, /sample\.txt \(byte mismatch\)/);

  const strictRepository = path.join(temporary, 'strict-static-repository');
  fs.mkdirSync(strictRepository);
  run('git', ['init', '--quiet'], { cwd: strictRepository });
  run('git', ['config', 'user.name', 'Release Test'], { cwd: strictRepository });
  run('git', ['config', 'user.email', 'release-test@example.invalid'], { cwd: strictRepository });
  write(strictRepository, '.gitignore', 'dist/\ncss/ignored-release.css\n');
  write(
    strictRepository,
    'index.html',
    '<meta name="openbexi-deployment-mode" content="server-capable">\n' +
      '<meta name="openbexi-dependency-policy" content="packaged-first-with-cdn-fallback">\n'
  );
  write(strictRepository, 'css/tracked.css', 'body { color: black; }\n');
  write(strictRepository, 'release/version.json', '{"version":"fixture"}\n');
  write(strictRepository, 'release/static-artifact.json', `${JSON.stringify({
    schemaVersion: 1,
    outputDirectory: 'dist',
    entrypoint: 'index.html',
    files: ['index.html'],
    trees: [{ path: 'css', extensions: ['.css'] }],
    vendorManifests: []
  }, null, 2)}\n`);
  run('git', ['add', '.'], { cwd: strictRepository });
  run('git', ['commit', '--quiet', '-m', 'strict static fixture'], { cwd: strictRepository });
  const strictCommit = run('git', ['rev-parse', 'HEAD'], { cwd: strictRepository }).stdout.trim();
  const strictManifestText = fs.readFileSync(path.join(strictRepository, 'release', 'static-artifact.json'), 'utf8');
  const strictVersionText = fs.readFileSync(path.join(strictRepository, 'release', 'version.json'), 'utf8');

  const strictBuild = buildStaticArtifact({
    root: strictRepository,
    releaseTree: strictCommit,
    requiredRuntimePaths: ['index.html']
  });
  assert(
    strictBuild.artifactManifest.files.some(file => file.path === 'css/tracked.css'),
    'strict build includes a committed recursively collected CSS input'
  );
  write(strictRepository, 'css/ignored-release.css', 'body { color: red; }\n');
  write(strictRepository, 'css/tracked.css', 'body { color: blue; }\n');
  write(strictRepository, 'release/version.json', '{"version":"mutated-before-read"}\n');
  write(strictRepository, 'release/static-artifact.json', `${JSON.stringify({
    schemaVersion: 1,
    outputDirectory: 'dist',
    entrypoint: 'index.html',
    files: ['index.html', 'css/ignored-release.css'],
    trees: [],
    vendorManifests: []
  }, null, 2)}\n`);
  const preReadAttackBuild = buildStaticArtifact({
    root: strictRepository,
    releaseTree: strictCommit,
    requiredRuntimePaths: ['index.html']
  });
  assert.strictEqual(
    fs.readFileSync(path.join(preReadAttackBuild.outputRoot, 'css', 'tracked.css'), 'utf8'),
    'body { color: black; }\n',
    'strict build derives recursively collected inputs and bytes from the immutable commit snapshot'
  );
  assert(
    !preReadAttackBuild.artifactManifest.files.some(file => file.path === 'css/ignored-release.css'),
    'strict build excludes an ignored matching-extension worktree file'
  );
  assert.strictEqual(
    preReadAttackBuild.artifactManifest.version,
    'fixture',
    'strict build ignores alternate valid worktree release metadata supplied before snapshot validation'
  );
  write(strictRepository, 'css/tracked.css', 'body { color: black; }\n');
  write(strictRepository, 'release/version.json', strictVersionText);
  write(strictRepository, 'release/static-artifact.json', strictManifestText);
  const immutableBuild = buildStaticArtifact({
    root: strictRepository,
    releaseTree: strictCommit,
    requiredRuntimePaths: ['index.html'],
    beforeMaterialize: () => {
      write(strictRepository, 'css/tracked.css', 'body { color: blue; }\n');
      write(strictRepository, 'release/version.json', '{"version":"mutated"}\n');
      write(strictRepository, 'release/static-artifact.json', '{"schemaVersion":999}\n');
    }
  });
  assert.strictEqual(
    fs.readFileSync(path.join(immutableBuild.outputRoot, 'css', 'tracked.css'), 'utf8'),
    'body { color: black; }\n',
    'strict build materializes the selected Git blob after a worktree mutation between validation and copy'
  );
  assert.strictEqual(
    immutableBuild.artifactManifest.version,
    'fixture',
    'strict build captures verified release metadata before a late worktree mutation'
  );

  const artifact = path.join(temporary, 'artifact');
  fs.mkdirSync(artifact);
  createArtifactFixture(artifact);
  const localAttestation = await attestStaticDeployment({ artifactRoot: artifact, commit: 'fixture' });
  assert.strictEqual(localAttestation.verification.localExact, true);
  assert.strictEqual(localAttestation.verification.remoteExact, false);
  write(artifact, 'unexpected.txt', 'must not deploy\n');
  await assert.rejects(
    attestStaticDeployment({ artifactRoot: artifact, commit: 'fixture' }),
    /Static artifact file set drifted/
  );
  fs.rmSync(path.join(artifact, 'unexpected.txt'));

  const archiveEntries = filesUnder(artifact).sort().map(relative => ({
    path: relative,
    body: fs.readFileSync(path.join(artifact, ...relative.split('/')))
  }));
  const pagesArchive = createTarArchive(path.join(temporary, 'artifact.tar'), archiveEntries);
  const pagesEvidencePath = path.join(temporary, 'pages-artifact-verification.json');
  const pagesEvidence = verifyPagesArtifactArchive({
    archivePath: pagesArchive,
    manifestPath: path.join(artifact, 'asset-manifest.json'),
    extractRoot: path.join(temporary, 'pages-extracted'),
    artifactId: '12345',
    commit: 'a'.repeat(40),
    output: pagesEvidencePath
  });
  assert.strictEqual(pagesEvidence.verification.extractedExact, true);
  assert.strictEqual(pagesEvidence.archive.sha256, sha256(fs.readFileSync(pagesArchive)));
  assert.strictEqual(JSON.parse(fs.readFileSync(pagesEvidencePath, 'utf8')).artifactId, '12345');
  const protectedExtractRoot = path.join(temporary, 'protected-extract-root');
  write(protectedExtractRoot, 'keep.txt', 'keep\n');
  assert.throws(
    () => verifyPagesArtifactArchive({
      archivePath: pagesArchive,
      manifestPath: path.join(artifact, 'asset-manifest.json'),
      extractRoot: protectedExtractRoot
    }),
    /extraction root must not already exist/,
    'Pages archive verifier refuses to replace an existing extraction root'
  );
  assert.strictEqual(fs.readFileSync(path.join(protectedExtractRoot, 'keep.txt'), 'utf8'), 'keep\n');

  const extraArchive = createTarArchive(path.join(temporary, 'artifact-extra.tar'), [
    ...archiveEntries,
    { path: 'unexpected.txt', body: 'must not deploy\n' }
  ]);
  assert.throws(
    () => verifyPagesArtifactArchive({
      archivePath: extraArchive,
      manifestPath: path.join(artifact, 'asset-manifest.json'),
      extractRoot: path.join(temporary, 'pages-extra')
    }),
    /unexpected or duplicate file: unexpected\.txt/,
    'downloaded Pages archive rejects files outside the exact asset closure'
  );
  const driftedArchive = createTarArchive(path.join(temporary, 'artifact-drifted.tar'), archiveEntries.map(entry => (
    entry.path === 'index.html' ? { ...entry, body: '<!doctype html><title>drifted</title>\n' } : entry
  )));
  assert.throws(
    () => verifyPagesArtifactArchive({
      archivePath: driftedArchive,
      manifestPath: path.join(artifact, 'asset-manifest.json'),
      extractRoot: path.join(temporary, 'pages-drifted')
    }),
    /Static artifact bytes drifted: index\.html/,
    'downloaded Pages archive rejects bytes that differ from the asset manifest'
  );
  const linkedArchive = createTarArchive(path.join(temporary, 'artifact-linked.tar'), [
    { path: 'index.html', body: '', type: '2' }
  ]);
  assert.throws(
    () => verifyPagesArtifactArchive({
      archivePath: linkedArchive,
      manifestPath: path.join(artifact, 'asset-manifest.json'),
      extractRoot: path.join(temporary, 'pages-linked')
    }),
    /non-regular entry \(2\)/,
    'downloaded Pages archive rejects symbolic-link entries'
  );

  const serverState = { corruptPath: null, oversizePath: null };
  const server = await startArtifactServer(artifact, serverState);
  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/`;
    const remoteAttestation = await withLoopbackOnlyFetch(() => attestStaticDeployment({
      manifestPath: path.join(artifact, 'asset-manifest.json'),
      baseUrl,
      commit: 'fixture',
      attempts: 1,
      concurrency: 2,
      timeoutMs: 2_000
    }));
    assert.strictEqual(remoteAttestation.verification.remoteExact, true);
    assert.strictEqual(remoteAttestation.verification.remote.verifiedFiles, remoteAttestation.artifact.fileCount);

    serverState.oversizePath = 'index.html';
    await assert.rejects(
      withLoopbackOnlyFetch(() => attestStaticDeployment({
        manifestPath: path.join(artifact, 'asset-manifest.json'),
        baseUrl,
        commit: 'fixture',
        attempts: 1,
        concurrency: 2,
        timeoutMs: 2_000
      })),
      /response exceeds the expected/
    );
    serverState.oversizePath = null;
    serverState.corruptPath = 'index.html';
    await assert.rejects(
      withLoopbackOnlyFetch(() => attestStaticDeployment({
        manifestPath: path.join(artifact, 'asset-manifest.json'),
        baseUrl,
        commit: 'fixture',
        attempts: 1,
        concurrency: 2,
        timeoutMs: 2_000
      })),
      /Deployment verification failed for index\.html/
    );
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  const artifactBeforeRollback = artifactByteSnapshot(artifact);
  const rollback = await withLoopbackOnlyFetch(() => rehearseStaticRollback({ artifactRoot: artifact }));
  assert.strictEqual(
    artifactByteSnapshot(artifact),
    artifactBeforeRollback,
    'rollback rehearsal does not mutate any deployment artifact bytes'
  );
  assert.strictEqual(rollback.passed, true);
  assert.strictEqual(rollback.corruptCandidate.readyStatus, 503);
  assert.strictEqual(rollback.gpOnly.trackedStatus, 404);
  assert.strictEqual(rollback.gpOnly.featureEnabled, false);
  assert.strictEqual(rollback.restoredTracked.pointerCacheControl, 'no-cache');
  assert.strictEqual(rollback.restoredTracked.chunkCacheControl, 'public, max-age=31536000, immutable');
  assert.strictEqual(rollback.restoredTracked.conditionalChunkStatus, 304);
  assert.strictEqual(rollback.restoredTracked.staleFeatureEtagInvalidated, true);
  assert(loopbackFetchCount > 0, 'release tests exercise only disposable loopback HTTP servers');

  const packageMetadata = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.strictEqual(packageMetadata.scripts['check:release-tree'], 'node scripts/check-release-tree.mjs');
  assert.strictEqual(packageMetadata.scripts['attest:deployment'], 'node scripts/attest-static-deployment.mjs');
  assert.strictEqual(packageMetadata.scripts['rehearse:rollback'], 'node scripts/rehearse-static-rollback.mjs');

  const ci = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  assertImmutableActionPins(ci, {
    'actions/checkout': 7,
    'actions/setup-node': 7,
    'actions/setup-python': 7,
    'actions/upload-artifact': 7
  });
  assert.match(ci, /check:release-tree -- --tree HEAD --require-clean/);

  const pages = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'pages.yml'), 'utf8');
  assertImmutableActionPins(pages, {
    'actions/attest': 4,
    'actions/checkout': 7,
    'actions/configure-pages': 6,
    'actions/deploy-pages': 5,
    'actions/download-artifact': 8,
    'actions/setup-node': 7,
    'actions/setup-python': 7,
    'actions/upload-artifact': 7,
    'actions/upload-pages-artifact': 5
  });
  assert.match(pages, /environment:\s*\n\s+name: github-pages/);
  assert.match(pages, /pages: write/);
  assert.match(pages, /id-token: write/);
  assert.match(pages, /path: dist\n\s+include-hidden-files: true/);
  assert.match(pages, /post-deploy-attestation\.json/);
  assert.match(pages, /ref: \$\{\{ inputs\.commit_sha \}\}/);
  assert.match(pages, /RESOLVED_OID="\$\(git rev-parse --verify "\$REQUESTED_SHA\^\{commit\}"\)"/);
  assert.match(pages, /source_oid: \$\{\{ steps\.confirm\.outputs\.oid \}\}/);
  assert.match(pages, /--tree "\$\{\{ steps\.confirm\.outputs\.oid \}\}"/);
  assert.match(pages, /npm run check:artifact -- --release-tree "\$\{\{ steps\.confirm\.outputs\.oid \}\}"/);
  assert(!/--(?:tree|release-tree) HEAD/.test(pages), 'post-confirmation release operations never use movable HEAD');
  assert(!/github\.sha/i.test(pages), 'Pages evidence and release operations use the confirmed commit output');
  assert(!/upload-pages-artifact@[\s\S]{0,160}path:\s*\./.test(pages), 'Pages upload must never publish the source root');
  assert.match(pages, /id: upload-pages/);
  assert.match(pages, /pages_artifact_id: \$\{\{ steps\.upload-pages\.outputs\.artifact_id \}\}/);
  assert.match(pages, /artifact-ids: \$\{\{ needs\.build\.outputs\.pages_artifact_id \}\}/);
  assert.match(pages, /node scripts\/verify-pages-artifact\.mjs/);
  assert.match(pages, /subject-path: artifacts\/pages-upload\/artifact\.tar/);
  const sbomStep = pages.indexOf('      - name: Generate release SBOM');
  const finalBuildStep = pages.indexOf('      - name: Build immutable commit snapshot');
  const rollbackStep = pages.indexOf('      - name: Rehearse disposable rollback');
  const finalAttestationStep = pages.indexOf('      - name: Verify exact artifact');
  const preserveManifestStep = pages.indexOf('      - name: Preserve asset manifest');
  const uploadEvidenceStep = pages.indexOf('      - name: Upload release evidence');
  assert(
    sbomStep < finalBuildStep && finalBuildStep < rollbackStep && rollbackStep < finalAttestationStep &&
      finalAttestationStep < preserveManifestStep && preserveManifestStep < uploadEvidenceStep,
    'validation precedes strict rebuild, rollback, final attestation, and upload'
  );
  const validationJob = pages.slice(pages.indexOf('  validate:'), pages.indexOf('  build:'));
  const buildJob = pages.slice(pages.indexOf('  build:'), pages.indexOf('  verify-pages-artifact:'));
  const uploadedArtifactVerifierJob = pages.slice(pages.indexOf('  verify-pages-artifact:'), pages.indexOf('  attest-artifact:'));
  const artifactSigningJob = pages.slice(pages.indexOf('  attest-artifact:'), pages.indexOf('  deploy:'));
  const deployJob = pages.slice(pages.indexOf('  deploy:'), pages.indexOf('  verify-deployment:'));
  const verifyJob = pages.slice(pages.indexOf('  verify-deployment:'), pages.indexOf('  attest-deployment:'));
  const deploymentSigningJob = pages.slice(pages.indexOf('  attest-deployment:'));
  const confirmationStep = validationJob.indexOf('      - name: Confirm requested commit');
  const preConfirmationJob = validationJob.slice(0, confirmationStep);
  assert(confirmationStep > 0, 'validation job confirms the requested commit');
  assert.deepEqual(
    [...preConfirmationJob.matchAll(/^\s+- uses: ([^\s]+)/gm)].map((match) => match[1]),
    ['actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'],
    'exact checkout is the only action allowed before commit confirmation'
  );
  assert(
    !/actions\/setup-(?:node|python)|^\s+run:/m.test(preConfirmationJob),
    'validation initializes no runtime and executes no command before commit confirmation'
  );
  assert.match(buildJob, /needs: validate/);
  assert.match(buildJob, /ref: \$\{\{ needs\.validate\.outputs\.source_oid \}\}/);
  assert.match(buildJob, /node scripts\/build-static\.mjs --release-tree "\$\{\{ needs\.validate\.outputs\.source_oid \}\}"/);
  const immutableBuildCommand = buildJob.indexOf('run: node scripts/build-static.mjs');
  const preBuildJob = buildJob.slice(0, immutableBuildCommand);
  assert(immutableBuildCommand > 0, 'fresh build job invokes the strict stdlib builder');
  assert.match(
    preBuildJob,
    /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020[\s\S]*node-version: 22/,
    'fresh exact-OID build pins the tested Node 22 toolchain before running the builder'
  );
  assert.deepEqual(
    [...preBuildJob.matchAll(/^\s+- uses: ([^\s]+)/gm)].map((match) => match[1]),
    [
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'
    ],
    'only exact checkout and pinned Node setup actions may precede the deployment build'
  );
  assert(
    !/actions\/download-artifact|npm (?:ci|run)|^\s+run:/m.test(preBuildJob),
    'fresh exact-OID checkout executes no mutation-capable command before the deployment build'
  );
  assert.match(validationJob, /npm ci/);
  assert.match(validationJob, /npm run test:unit/);
  assert(!/id-token: write|attestations: write|artifact-metadata: write/.test(buildJob), 'build job must not have signing permissions');
  assert(!/id-token: write|attestations: write|artifact-metadata: write/.test(uploadedArtifactVerifierJob), 'uploaded artifact verifier must not have signing permissions');
  assert(!/id-token: write|attestations: write|artifact-metadata: write/.test(verifyJob), 'remote verifier must not have signing permissions');
  assert.match(deployJob, /- verify-pages-artifact/);
  for (const signingJob of [artifactSigningJob, deploymentSigningJob]) {
    assert(!/actions\/checkout|\n\s+run:/.test(signingJob), 'signing jobs must execute only pinned evidence actions');
  }

  const dependabot = fs.readFileSync(path.join(ROOT, '.github', 'dependabot.yml'), 'utf8');
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /patterns:\s*\n\s+- actions\/\*/);

  const deploymentPolicy = JSON.parse(fs.readFileSync(path.join(ROOT, 'release', 'pages-deployment.json'), 'utf8'));
  assert.strictEqual(deploymentPolicy.artifactDirectory, 'dist');
  assert.strictEqual(deploymentPolicy.controls.requireEnvironmentProtection, true);
  assert.strictEqual(deploymentPolicy.controls.exactResolvedCommitBinding, true);
  assert.strictEqual(deploymentPolicy.controls.commitSnapshotBuild, true);
  assert.strictEqual(deploymentPolicy.controls.freshBuildJobAfterValidation, true);
  assert.strictEqual(deploymentPolicy.controls.uploadedPagesArchiveVerification, true);
  assert.strictEqual(deploymentPolicy.controls.uploadedPagesArchiveAttestation, true);
  assert.strictEqual(deploymentPolicy.controls.directArchivedArtifactRollback, false);
  assert.strictEqual(deploymentPolicy.controls.postDeployExactVerification, true);
  assert.strictEqual(deploymentPolicy.rollbackStrategy, 'reviewed-master-revert');

  const rollbackGuide = fs.readFileSync(path.join(ROOT, 'docs', 'engineering', 'ROLLBACK_V2_3_2.md'), 'utf8');
  assert.match(rollbackGuide, /reviewed Git revert|Review and test the complete revert/);
  assert.match(rollbackGuide, /does not retain or accept an older `dist\/` artifact/);
  assert(!/redeploy a previously archived verified `dist\/` artifact/.test(rollbackGuide));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log('releaseEngineering tests passed');
