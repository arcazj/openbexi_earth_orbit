import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readArtifactManifest, verifyLocalArtifact } from './attest-static-deployment.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRACKED_FLAG_PATTERN = /(\"experimental_tracked_object_catalog\"\s*:\s*Object\.freeze\(\{\"enabled\"\s*:\s*)(true|false)/;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizedPath(value) {
  const normalized = decodeURIComponent(String(value || '').split('?', 1)[0]).replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').includes('..') || /[\0\r\n]/.test(normalized)) return null;
  return normalized;
}

function filesUnder(root, relative = '') {
  const directory = path.join(root, ...relative.split('/').filter(Boolean));
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Rollback artifact contains a symbolic link: ${child}.`);
    if (entry.isDirectory()) files.push(...filesUnder(root, child));
    if (entry.isFile()) files.push(child);
  }
  return files;
}

function linkedCopy(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Rollback source contains a symbolic link: ${from}.`);
    if (entry.isDirectory()) {
      linkedCopy(from, to);
    } else if (entry.isFile()) {
      try {
        fs.linkSync(from, to);
      } catch (error) {
        if (!['EXDEV', 'EPERM', 'EACCES'].includes(error?.code)) throw error;
        fs.copyFileSync(from, to);
      }
    }
  }
}

function writeAssetManifest(root, version) {
  const descriptors = filesUnder(root)
    .filter(relative => relative !== 'asset-manifest.json')
    .sort()
    .map(relative => {
      const body = fs.readFileSync(path.join(root, ...relative.split('/')));
      return { path: relative, bytes: body.length, sha256: sha256(body) };
    });
  const manifest = {
    schemaVersion: 1,
    application: 'openbexi_orbit',
    version,
    entrypoint: 'index.html',
    fileCount: descriptors.length,
    totalBytes: descriptors.reduce((sum, item) => sum + item.bytes, 0),
    files: descriptors
  };
  fs.writeFileSync(path.join(root, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function trackedDescriptors(manifest) {
  return [
    ...(Array.isArray(manifest?.chunks) ? manifest.chunks : []),
    ...(Array.isArray(manifest?.history_chunks) ? manifest.history_chunks : []),
    ...(manifest?.quarantine?.path ? [manifest.quarantine] : [])
  ];
}

function trackedFlag(root) {
  const source = fs.readFileSync(path.join(root, 'js', 'releaseVersion.js'), 'utf8');
  const match = TRACKED_FLAG_PATTERN.exec(source);
  if (!match) throw new Error('Static release metadata does not declare the tracked-object feature flag.');
  return match[2] === 'true';
}

export function validateRollbackArtifact(root) {
  const manifestRecord = readArtifactManifest(path.join(root, 'asset-manifest.json'));
  verifyLocalArtifact(root, manifestRecord);
  const gpPath = path.join(root, 'json', 'gp', 'GP.json');
  const gpMetadataPath = path.join(root, 'json', 'gp', 'GP.meta.json');
  if (!fs.existsSync(gpPath) || !fs.existsSync(gpMetadataPath)) throw new Error('Rollback artifact is missing the GP fallback.');
  const gpCatalog = JSON.parse(fs.readFileSync(gpPath, 'utf8'));
  const gpMetadata = JSON.parse(fs.readFileSync(gpMetadataPath, 'utf8'));
  if (!Array.isArray(gpCatalog) || gpCatalog.length === 0 || !gpMetadata || typeof gpMetadata !== 'object') {
    throw new Error('Rollback artifact has an unusable GP fallback.');
  }
  const enabled = trackedFlag(root);
  if (!enabled) {
    if ([...manifestRecord.paths].some(relative => relative.startsWith('json/tracked/'))) {
      throw new Error('GP-only rollback artifact still publishes tracked-object files.');
    }
    return Object.freeze({ ready: true, mode: 'gp-only', trackedRevision: null, manifestSha256: manifestRecord.sha256 });
  }
  const trackedManifestPath = path.join(root, 'json', 'tracked', 'TRACKED.manifest.json');
  const trackedMetadataPath = path.join(root, 'json', 'tracked', 'TRACKED.meta.json');
  const trackedManifest = JSON.parse(fs.readFileSync(trackedManifestPath, 'utf8'));
  const trackedMetadata = JSON.parse(fs.readFileSync(trackedMetadataPath, 'utf8'));
  const revision = String(trackedManifest.catalog_revision ?? '');
  if (!/^sha256:[a-f0-9]{64}$/.test(revision) ||
      trackedMetadata.catalog_revision !== revision || trackedMetadata.dataset_hash !== revision) {
    throw new Error('Rollback tracked manifest and metadata revisions disagree.');
  }
  const descriptors = trackedDescriptors(trackedManifest);
  const descriptorPaths = new Set();
  for (const descriptor of descriptors) {
    const relative = String(descriptor.path ?? '').replaceAll('\\', '/');
    const expectedHash = String(descriptor.sha256 ?? '').replace(/^sha256:/, '');
    if (!/^json\/tracked\/chunks\/[a-f0-9]{64}-[a-z0-9-]+\.json$/.test(relative) ||
        !/^[a-f0-9]{64}$/.test(expectedHash) || !path.posix.basename(relative).startsWith(expectedHash) ||
        descriptorPaths.has(relative) || !manifestRecord.paths.has(relative)) {
      throw new Error(`Rollback tracked chunk is not a unique content-addressed artifact: ${relative}.`);
    }
    descriptorPaths.add(relative);
    const body = fs.readFileSync(path.join(root, ...relative.split('/')));
    if (body.length !== Number(descriptor.bytes) || sha256(body) !== expectedHash) {
      throw new Error(`Rollback tracked chunk bytes drifted: ${relative}.`);
    }
    const payload = JSON.parse(body.toString('utf8'));
    const records = Array.isArray(payload) ? payload : payload.records;
    if (!Array.isArray(records) || records.length !== Number(descriptor.count)) {
      throw new Error(`Rollback tracked chunk count drifted: ${relative}.`);
    }
    if (descriptor.scope && (payload.scope !== descriptor.scope || payload.object_type !== descriptor.object_type)) {
      throw new Error(`Rollback tracked chunk taxonomy drifted: ${relative}.`);
    }
  }
  const publishedChunks = [...manifestRecord.paths].filter(relative => relative.startsWith('json/tracked/chunks/'));
  if (publishedChunks.length !== descriptorPaths.size || publishedChunks.some(relative => !descriptorPaths.has(relative))) {
    throw new Error('Rollback tracked artifact contains chunks outside its publication closure.');
  }
  return Object.freeze({ ready: true, mode: 'tracked', trackedRevision: revision, manifestSha256: manifestRecord.sha256 });
}

function createGpOnlyArtifact(priorRoot, outputRoot) {
  linkedCopy(priorRoot, outputRoot);
  fs.rmSync(path.join(outputRoot, 'json', 'tracked'), { recursive: true, force: true });
  const releaseModule = path.join(outputRoot, 'js', 'releaseVersion.js');
  const source = fs.readFileSync(releaseModule, 'utf8');
  if (!TRACKED_FLAG_PATTERN.test(source)) throw new Error('Cannot disable the tracked-object feature in rollback metadata.');
  fs.rmSync(releaseModule, { force: true });
  fs.writeFileSync(releaseModule, source.replace(TRACKED_FLAG_PATTERN, '$1false'), 'utf8');
  fs.rmSync(path.join(outputRoot, 'asset-manifest.json'), { force: true });
  const version = readArtifactManifest(path.join(priorRoot, 'asset-manifest.json')).manifest.version;
  writeAssetManifest(outputRoot, version);
  return validateRollbackArtifact(outputRoot);
}

function createBrokenTrackedArtifact(priorRoot, outputRoot) {
  linkedCopy(priorRoot, outputRoot);
  const manifest = JSON.parse(fs.readFileSync(path.join(outputRoot, 'json', 'tracked', 'TRACKED.manifest.json'), 'utf8'));
  const descriptor = trackedDescriptors(manifest)[0];
  if (!descriptor) throw new Error('Rollback rehearsal requires at least one referenced tracked chunk.');
  const chunk = path.join(outputRoot, ...descriptor.path.split('/'));
  fs.rmSync(chunk, { force: true });
  fs.writeFileSync(chunk, '{"corrupt":true}\n', 'utf8');
  return descriptor.path;
}

function cacheControl(relative, status) {
  if (status >= 400 || relative.startsWith('health/')) return 'no-store';
  if (/^json\/tracked\/chunks\/[a-f0-9]{64}-/.test(relative)) return 'public, max-age=31536000, immutable';
  return 'no-cache';
}

function startDisposableServer(pointerPath, slots, healthBySlot) {
  const server = http.createServer((request, response) => {
    const slotName = JSON.parse(fs.readFileSync(pointerPath, 'utf8')).slot;
    const root = slots.get(slotName);
    const health = healthBySlot.get(slotName);
    const relative = normalizedPath(request.url);
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
      response.statusCode = status;
      response.setHeader('Content-Type', type);
      response.setHeader('Content-Length', bytes.length);
      response.setHeader('Cache-Control', cacheControl(relative ?? '', status));
      response.end(request.method === 'HEAD' ? undefined : bytes);
    };
    if (relative === 'health/live') {
      send(200, JSON.stringify({ status: 'live', slot: slotName }));
      return;
    }
    if (relative === 'health/ready') {
      send(health.ready ? 200 : 503, JSON.stringify({ status: health.ready ? 'ready' : 'unavailable', slot: slotName, mode: health.mode }));
      return;
    }
    if (!relative || !root) {
      send(404, JSON.stringify({ status: 404 }));
      return;
    }
    if (!health.ready && relative.startsWith('json/tracked/')) {
      send(503, JSON.stringify({ code: 'TRACKED_CATALOG_UNAVAILABLE' }), 'application/problem+json; charset=utf-8');
      return;
    }
    const target = path.resolve(root, ...relative.split('/'));
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      send(404, JSON.stringify({ status: 404 }));
      return;
    }
    const body = fs.readFileSync(target);
    const etag = `"${sha256(body)}"`;
    if (request.headers['if-none-match'] === etag) {
      response.statusCode = 304;
      response.setHeader('ETag', etag);
      response.setHeader('Cache-Control', cacheControl(relative, 304));
      response.end();
      return;
    }
    response.statusCode = 200;
    response.setHeader('Content-Length', body.length);
    response.setHeader('ETag', etag);
    response.setHeader('Cache-Control', cacheControl(relative, 200));
    response.end(request.method === 'HEAD' ? undefined : body);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function get(baseUrl, relative, headers = {}) {
  const response = await fetch(new URL(relative, baseUrl), { headers, cache: 'no-store' });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: Buffer.from(await response.arrayBuffer())
  };
}

export async function rehearseStaticRollback({ artifactRoot, output = null } = {}) {
  const priorRoot = path.resolve(artifactRoot ?? path.join(PROJECT_ROOT, 'dist'));
  const priorHealth = validateRollbackArtifact(priorRoot);
  if (priorHealth.mode !== 'tracked') throw new Error('Rollback rehearsal baseline must be a coherent tracked artifact.');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'openbexi-rollback-'));
  let server;
  try {
    const gpOnlyRoot = path.join(temporary, 'gp-only');
    const brokenRoot = path.join(temporary, 'broken');
    const gpOnlyHealth = createGpOnlyArtifact(priorRoot, gpOnlyRoot);
    const brokenChunk = createBrokenTrackedArtifact(priorRoot, brokenRoot);
    let brokenHealth;
    try {
      validateRollbackArtifact(brokenRoot);
      throw new Error('Corrupt tracked candidate unexpectedly passed validation.');
    } catch (error) {
      brokenHealth = { ready: false, mode: 'tracked-invalid', error: error.message };
    }
    const slots = new Map([['prior', priorRoot], ['gp-only', gpOnlyRoot], ['broken', brokenRoot]]);
    const healthBySlot = new Map([['prior', priorHealth], ['gp-only', gpOnlyHealth], ['broken', brokenHealth]]);
    const pointer = path.join(temporary, 'active-slot.json');
    const promote = slot => {
      const next = `${pointer}.next`;
      fs.writeFileSync(next, `${JSON.stringify({ slot })}\n`, 'utf8');
      fs.renameSync(next, pointer);
    };
    promote('broken');
    server = await startDisposableServer(pointer, slots, healthBySlot);
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/`;

    const brokenLive = await get(baseUrl, 'health/live');
    const brokenReady = await get(baseUrl, 'health/ready');
    const brokenTracked = await get(baseUrl, 'json/tracked/TRACKED.manifest.json');
    if (brokenLive.status !== 200 || brokenReady.status !== 503 || brokenTracked.status !== 503 ||
        brokenReady.headers['cache-control'] !== 'no-store' || brokenTracked.headers['cache-control'] !== 'no-store') {
      throw new Error('Broken tracked deployment did not fail health and tracked access closed.');
    }

    promote('gp-only');
    const gpReady = await get(baseUrl, 'health/ready');
    const gpModule = await get(baseUrl, 'js/releaseVersion.js');
    const gpCatalog = await get(baseUrl, 'json/gp/GP.json');
    const gpTracked = await get(baseUrl, 'json/tracked/TRACKED.manifest.json');
    if (gpReady.status !== 200 || gpCatalog.status !== 200 || gpTracked.status !== 404 ||
        gpModule.status !== 200 || !TRACKED_FLAG_PATTERN.test(gpModule.body.toString('utf8')) ||
        TRACKED_FLAG_PATTERN.exec(gpModule.body.toString('utf8'))?.[2] !== 'false' ||
        gpModule.headers['cache-control'] !== 'no-cache' || gpTracked.headers['cache-control'] !== 'no-store') {
      throw new Error('GP-only rollback path did not become ready with tracked loading disabled.');
    }
    const gpModuleEtag = gpModule.headers.etag;

    promote('prior');
    const restoredReady = await get(baseUrl, 'health/ready');
    const restoredModule = await get(baseUrl, 'js/releaseVersion.js', { 'If-None-Match': gpModuleEtag });
    const restoredManifest = await get(baseUrl, 'json/tracked/TRACKED.manifest.json');
    const manifest = JSON.parse(restoredManifest.body.toString('utf8'));
    const descriptor = trackedDescriptors(manifest)[0];
    const restoredChunk = await get(baseUrl, descriptor.path);
    const cachedChunk = await get(baseUrl, descriptor.path, { 'If-None-Match': restoredChunk.headers.etag });
    if (restoredReady.status !== 200 || restoredModule.status !== 200 || restoredModule.headers.etag === gpModuleEtag ||
        restoredManifest.status !== 200 || manifest.catalog_revision !== priorHealth.trackedRevision ||
        restoredManifest.headers['cache-control'] !== 'no-cache' || restoredChunk.status !== 200 ||
        restoredChunk.headers['cache-control'] !== 'public, max-age=31536000, immutable' || cachedChunk.status !== 304) {
      throw new Error('Prior tracked closure, cache transition, or readiness did not recover.');
    }

    const evidence = {
      schemaVersion: 1,
      kind: 'openbexi-static-rollback-rehearsal',
      baselineManifestSha256: priorHealth.manifestSha256,
      baselineTrackedRevision: priorHealth.trackedRevision,
      corruptCandidate: { chunk: brokenChunk, liveStatus: 200, readyStatus: 503, trackedStatus: 503 },
      gpOnly: { readyStatus: 200, trackedStatus: 404, featureEnabled: false, manifestSha256: gpOnlyHealth.manifestSha256 },
      restoredTracked: {
        readyStatus: 200,
        trackedRevision: priorHealth.trackedRevision,
        pointerCacheControl: restoredManifest.headers['cache-control'],
        chunkCacheControl: restoredChunk.headers['cache-control'],
        conditionalChunkStatus: cachedChunk.status,
        staleFeatureEtagInvalidated: true
      },
      disposable: true,
      passed: true,
      rehearsedAt: new Date().toISOString()
    };
    if (output) {
      const target = path.resolve(output);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    }
    return Object.freeze(evidence);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--artifact-root') options.artifactRoot = argv[++index];
    else if (argument === '--output') options.output = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

const invokedFile = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedFile === import.meta.url) {
  try {
    const evidence = await rehearseStaticRollback(parseArguments(process.argv.slice(2)));
    console.log(`Rollback rehearsal passed: GP-only fallback and ${evidence.baselineTrackedRevision} restored.`);
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
}
