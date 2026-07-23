import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  REQUIRED_STATIC_RUNTIME_PATHS,
  assertRequiredStaticRuntimePaths,
  buildStaticArtifact
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

function localModuleSpecifiers(source) {
  const matches = source.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.\.?\/[^'"]+)['"]/g);
  return [...matches].map(match => match[1]);
}

const cleanCloneBuild = buildStaticArtifact({ includeOptional: false });
assert(
  fs.existsSync(path.join(cleanCloneBuild.outputRoot, 'json', 'tle', 'TLE.meta.json')),
  'the provenance sidecar is a required part of the packaged catalog'
);
assert.throws(
  () => assertRequiredStaticRuntimePaths(REQUIRED_STATIC_RUNTIME_PATHS.filter(path => path !== 'json/tle/TLE.json')),
  /json\/tle\/TLE\.json/,
  'the static build fails closed when the packaged catalog is absent'
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
assert(manifestPaths.has('json/tle/TLE.json'), 'artifact packages the required TLE catalog');
assert(manifestPaths.has('json/tle/TLE.meta.json'), 'artifact packages provenance beside the required catalog');
assert(!manifestPaths.has('vendor/satellite.js/6.0.2/manifest.json'));
assert(!manifestPaths.has('vendor/three/0.184.0/manifest.json'));

for (const relative of outputFiles.filter(file => /\.(?:html|js|mjs)$/i.test(file))) {
  const file = path.join(outputRoot, ...relative.split('/'));
  const source = fs.readFileSync(file, 'utf8');
  assert(!source.includes('/node_modules/'), `${relative} contains a node_modules runtime URL`);
  assert(!source.includes('https://unpkg.com/'), `${relative} contains an unpkg runtime URL`);
  assert(!source.includes('raw.githubusercontent.com/'), `${relative} contains a mutable raw-GitHub runtime URL`);
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
