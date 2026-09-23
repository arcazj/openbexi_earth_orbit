import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MANIFEST = path.join(PROJECT_ROOT, 'dist', 'asset-manifest.json');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function normalizeArtifactPath(value) {
  const normalized = String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..') || /[?#\0]/.test(normalized)) {
    throw new Error(`Unsafe static artifact path: ${value}`);
  }
  return normalized;
}

export function readArtifactManifest(manifestPath = DEFAULT_MANIFEST) {
  const body = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(body.toString('utf8'));
  if (manifest.schemaVersion !== 1 || manifest.application !== 'openbexi_orbit' ||
      !Array.isArray(manifest.files) || !Number.isInteger(manifest.fileCount) ||
      !Number.isInteger(manifest.totalBytes) || manifest.fileCount < 1 || manifest.totalBytes < 0 ||
      manifest.fileCount !== manifest.files.length || typeof manifest.version !== 'string') {
    throw new Error('Static asset manifest has an invalid release contract.');
  }
  const paths = new Set();
  let totalBytes = 0;
  for (const descriptor of manifest.files) {
    const relative = normalizeArtifactPath(descriptor?.path);
    if (relative !== descriptor.path || relative === 'asset-manifest.json') {
      throw new Error(`Static asset manifest path is not canonical: ${descriptor?.path}.`);
    }
    if (paths.has(relative)) throw new Error(`Static asset manifest repeats ${relative}.`);
    if (!Number.isInteger(descriptor?.bytes) || descriptor.bytes < 0 || !/^[a-f0-9]{64}$/.test(descriptor?.sha256 ?? '')) {
      throw new Error(`Static asset manifest descriptor is invalid: ${relative}.`);
    }
    paths.add(relative);
    totalBytes += descriptor.bytes;
  }
  if (totalBytes !== manifest.totalBytes) throw new Error('Static asset manifest totalBytes is inconsistent.');
  const entrypoint = normalizeArtifactPath(manifest.entrypoint);
  if (entrypoint !== manifest.entrypoint || !paths.has(entrypoint) || !paths.has('.nojekyll')) {
    throw new Error('Static asset manifest is missing its canonical entrypoint or .nojekyll marker.');
  }
  return Object.freeze({ manifest, body, sha256: sha256(body), paths });
}

function filesUnder(root, relative = '') {
  const directory = path.join(root, ...relative.split('/').filter(Boolean));
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Static artifact contains a symbolic link: ${child}.`);
    if (entry.isDirectory()) files.push(...filesUnder(root, child));
    if (entry.isFile()) files.push(child);
  }
  return files;
}

export function verifyLocalArtifact(artifactRoot, manifestRecord = null) {
  const root = path.resolve(artifactRoot);
  const record = manifestRecord ?? readArtifactManifest(path.join(root, 'asset-manifest.json'));
  const embeddedManifest = fs.readFileSync(path.join(root, 'asset-manifest.json'));
  if (embeddedManifest.length !== record.body.length || sha256(embeddedManifest) !== record.sha256) {
    throw new Error('Static artifact embedded manifest bytes drifted.');
  }
  const actualPaths = filesUnder(root);
  const expectedPaths = new Set([...record.paths, 'asset-manifest.json']);
  const extras = actualPaths.filter(relative => !expectedPaths.has(relative));
  const missing = [...expectedPaths].filter(relative => !actualPaths.includes(relative));
  if (extras.length || missing.length) {
    throw new Error(`Static artifact file set drifted (missing: ${missing.join(', ') || 'none'}; extra: ${extras.join(', ') || 'none'}).`);
  }
  for (const descriptor of record.manifest.files) {
    const file = path.join(root, ...descriptor.path.split('/'));
    const body = fs.readFileSync(file);
    if (body.length !== descriptor.bytes || sha256(body) !== descriptor.sha256) {
      throw new Error(`Static artifact bytes drifted: ${descriptor.path}.`);
    }
  }
  return Object.freeze({ fileCount: record.manifest.fileCount, totalBytes: record.manifest.totalBytes });
}

async function responseDigest(response, maximumBytes) {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for await (const chunk of response.body) {
    const body = Buffer.from(chunk);
    bytes += body.length;
    if (bytes > maximumBytes) {
      await response.body.cancel().catch(() => {});
      throw new Error(`response exceeds the expected ${maximumBytes} bytes`);
    }
    hash.update(body);
  }
  return { bytes, sha256: hash.digest('hex') };
}

async function fetchExact(url, expected, options) {
  let lastError;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal,
        headers: { Accept: '*/*', 'User-Agent': 'openbexi-deployment-attestation/1' }
      });
      const finalUrl = new URL(response.url);
      if (finalUrl.origin !== new URL(url).origin) throw new Error(`cross-origin redirect to ${finalUrl.origin}`);
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      const actual = await responseDigest(response, expected.bytes);
      if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
        throw new Error(`expected ${expected.bytes}/${expected.sha256}, found ${actual.bytes}/${actual.sha256}`);
      }
      return {
        path: expected.path,
        bytes: actual.bytes,
        sha256: actual.sha256,
        cacheControl: response.headers.get('cache-control'),
        etag: response.headers.get('etag'),
        attempts: attempt
      };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < options.attempts) await delay(options.retryDelayMs * attempt);
  }
  throw new Error(`Deployment verification failed for ${expected.path}: ${lastError?.message || lastError}`);
}

async function mapConcurrent(values, concurrency, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
}

function artifactUrl(baseUrl, relative, cacheBust) {
  const base = new URL(baseUrl);
  const loopback = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);
  if ((base.protocol !== 'https:' && base.protocol !== 'http:') || base.username || base.password ||
      (base.protocol === 'http:' && !loopback.has(base.hostname))) {
    throw new Error('Deployment base URL must be HTTPS, except for a loopback test server.');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const encoded = normalizeArtifactPath(relative).split('/').map(encodeURIComponent).join('/');
  const target = new URL(encoded, base);
  target.searchParams.set('openbexi_attest', cacheBust);
  return target.href;
}

function defaultCommit() {
  if (/^[0-9a-f]{7,64}$/i.test(process.env.GITHUB_SHA ?? '')) return process.env.GITHUB_SHA.toLowerCase();
  const result = spawnSync('git', ['-C', PROJECT_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

export async function attestStaticDeployment({
  manifestPath = null,
  artifactRoot = null,
  baseUrl = null,
  output = null,
  commit = defaultCommit(),
  attempts = 6,
  retryDelayMs = 5_000,
  concurrency = 4,
  timeoutMs = 60_000
} = {}) {
  const selectedManifest = manifestPath ?? (artifactRoot
    ? path.join(path.resolve(artifactRoot), 'asset-manifest.json')
    : DEFAULT_MANIFEST);
  const record = readArtifactManifest(selectedManifest);
  const local = artifactRoot ? verifyLocalArtifact(artifactRoot, record) : null;
  let remote = null;
  if (baseUrl) {
    const cacheBust = `${commit ?? 'unknown'}-${Date.now()}`;
    const manifestObservation = await fetchExact(
      artifactUrl(baseUrl, 'asset-manifest.json', cacheBust),
      { path: 'asset-manifest.json', bytes: record.body.length, sha256: record.sha256 },
      { attempts, retryDelayMs, timeoutMs }
    );
    const observations = await mapConcurrent(record.manifest.files, concurrency, descriptor => fetchExact(
      artifactUrl(baseUrl, descriptor.path, cacheBust),
      descriptor,
      { attempts, retryDelayMs, timeoutMs }
    ));
    const cachePaths = new Set([
      'index.html',
      'asset-manifest.json',
      'json/tracked/TRACKED.manifest.json',
      record.manifest.files.find(file => /^json\/tracked\/chunks\//.test(file.path))?.path
    ].filter(Boolean));
    remote = {
      baseUrl: new URL('.', artifactUrl(baseUrl, 'index.html', cacheBust)).href.split('?')[0],
      manifest: manifestObservation,
      verifiedFiles: observations.length,
      verifiedBytes: observations.reduce((sum, item) => sum + item.bytes, 0),
      maximumAttempts: Math.max(manifestObservation.attempts, ...observations.map(item => item.attempts)),
      cacheObservations: [manifestObservation, ...observations]
        .filter(item => cachePaths.has(item.path))
        .map(({ path: relative, cacheControl, etag }) => ({ path: relative, cacheControl, etag }))
    };
  }
  if (!local && !remote) throw new Error('Specify --artifact-root, --base-url, or both.');
  const attestation = {
    schemaVersion: 1,
    kind: 'openbexi-static-deployment-attestation',
    sourceCommit: commit,
    artifact: {
      version: record.manifest.version,
      manifestSha256: record.sha256,
      fileCount: record.manifest.fileCount,
      totalBytes: record.manifest.totalBytes
    },
    verification: {
      localExact: local !== null,
      remoteExact: remote !== null,
      local,
      remote
    },
    verifiedAt: new Date().toISOString()
  };
  if (output) {
    const target = path.resolve(output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(attestation, null, 2)}\n`, 'utf8');
  }
  return Object.freeze(attestation);
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const valueArguments = new Map([
      ['--manifest', 'manifestPath'], ['--artifact-root', 'artifactRoot'], ['--base-url', 'baseUrl'],
      ['--output', 'output'], ['--commit', 'commit'], ['--attempts', 'attempts'],
      ['--retry-delay-ms', 'retryDelayMs'], ['--concurrency', 'concurrency'], ['--timeout-ms', 'timeoutMs']
    ]);
    if (!valueArguments.has(argument)) throw new Error(`Unknown argument: ${argument}`);
    const key = valueArguments.get(argument);
    const value = argv[++index];
    if (value === undefined) throw new Error(`${argument} requires a value.`);
    options[key] = ['attempts', 'retryDelayMs', 'concurrency', 'timeoutMs'].includes(key) ? Number(value) : value;
  }
  for (const key of ['attempts', 'concurrency', 'timeoutMs']) {
    if (options[key] !== undefined && (!Number.isInteger(options[key]) || options[key] < 1)) {
      throw new Error(`${key} must be a positive integer.`);
    }
  }
  if (options.retryDelayMs !== undefined && (!Number.isInteger(options.retryDelayMs) || options.retryDelayMs < 0)) {
    throw new Error('retryDelayMs must be a non-negative integer.');
  }
  return options;
}

const invokedFile = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedFile === import.meta.url) {
  try {
    const attestation = await attestStaticDeployment(parseArguments(process.argv.slice(2)));
    const mode = attestation.verification.remoteExact ? 'deployment' : 'local artifact';
    console.log(`Verified ${mode}: ${attestation.artifact.fileCount} files, ${attestation.artifact.totalBytes} bytes, manifest ${attestation.artifact.manifestSha256}.`);
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}
