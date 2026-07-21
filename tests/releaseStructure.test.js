import assert from 'assert';
import fs from 'fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function dependencyVersion(packageJson, name) {
  assert(packageJson.dependencies?.[name], `package.json declares ${name}`);
  return packageJson.dependencies[name];
}

function assertThreeVendoredFirstWithCdnFallback(html, fileName) {
  assert(html.includes('./js/dependencyBootstrap.js'), `${fileName} loads the dependency bootstrap`);
  assert(html.includes('./vendor/three/0.184.0/build/three.module.js'), `${fileName} declares the vendored Three.js core`);
  assert(html.includes('./vendor/three/0.184.0/examples/jsm/'), `${fileName} declares the vendored Three.js addons`);
  assert(html.includes('https://unpkg.com/three@0.184.0/build/three.module.js'), `${fileName} declares an exact Three.js CDN fallback`);
  assert(html.includes('https://unpkg.com/three@0.184.0/examples/jsm/'), `${fileName} declares matching CDN addons`);
  assert(!html.includes('node_modules/three'), `${fileName} does not depend on generated Three.js files`);
  assert(html.includes('openbexiBootFromTemplate'), `${fileName} boots after dependency resolution`);
  assert(html.includes('type="text/openbexi-module"'), `${fileName} defers the main module until the import map is selected`);
  assert(html.includes('content="packaged-first-with-cdn-fallback"'), `${fileName} explicitly declares packaged dependencies first`);
}

function run() {
  const promptHistory = read('PROMPT_History.md').replace(/^\uFEFF/, '');
  const indexHtml = read('index.html');
  const displaySatelliteHtml = read('display_satellite.html');
  const readme = read('README.md');
  const packageJson = JSON.parse(read('package.json'));
  const packageLock = JSON.parse(read('package-lock.json'));
  const release = JSON.parse(read('release/version.json'));
  const archivedSbom = JSON.parse(read('release/evidence/openbexi-node-sbom-2.0.0.cdx.json'));
  const releaseModule = read('js/releaseVersion.js');

  assert(promptHistory.startsWith('# Prompt History'), 'PROMPT_History.md starts with Prompt History');

  assert.strictEqual(release.version, '2.0.0', 'authoritative release is Version 2.0.0');
  assert.strictEqual(release.channel, 'preview', 'Version 2.0.0 remains on the preview channel');
  assert.strictEqual(release.publicationState, 'candidate', 'Version 2.0.0 remains a candidate');
  assert.strictEqual(release.candidateAt, '2026-07-19', 'candidate date is explicit');
  assert.strictEqual(release.releasedAt, null, 'candidate has not been recorded as released');
  assert.strictEqual(release.maturity, 'experimental', 'scientific maturity remains experimental');
  assert.strictEqual(release.safetyClass, 'non-operational', 'release remains non-operational');
  assert.strictEqual(packageJson.version, release.version, 'package version matches release metadata');
  assert.strictEqual(packageLock.version, release.version, 'lockfile version matches release metadata');
  assert.match(
    archivedSbom.serialNumber,
    /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'archived CycloneDX SBOM has a standards-compliant UUID serial number'
  );
  assert(indexHtml.includes('const versionNumber = APP_VERSION;'), 'index.html uses the imported version');
  assert(releaseModule.includes("export const APP_VERSION = RELEASE_METADATA.version"), 'browser version derives from generated release metadata');
  assert(promptHistory.includes('Version 1.7.6'), 'historical release prompts remain available without controlling runtime version');

  assertThreeVendoredFirstWithCdnFallback(indexHtml, 'index.html');
  assert(
    indexHtml.includes('<meta name="openbexi-dependency-policy" content="packaged-first-with-cdn-fallback">'),
    'source index explicitly selects packaged dependencies before the CDN fallback'
  );
  assertThreeVendoredFirstWithCdnFallback(displaySatelliteHtml, 'display_satellite.html');
  assert.strictEqual(dependencyVersion(packageJson, 'three'), '0.184.0', 'package.json pins verified Three.js 0.184.0');
  assert.strictEqual(dependencyVersion(packageJson, 'satellite.js'), '6.0.2', 'package.json pins satellite.js 6.0.2');
  assert(indexHtml.includes('./vendor/satellite.js/6.0.2/satellite.min.js'), 'index.html declares vendored satellite.js');
  assert(indexHtml.includes('https://unpkg.com/satellite.js@6.0.2/dist/satellite.min.js'), 'index.html declares an exact satellite.js CDN fallback');
  assert(!indexHtml.includes('node_modules/satellite.js'), 'index.html does not depend on generated satellite.js files');
  assert(fs.existsSync('js/dependencyBootstrap.js'), 'dependency bootstrap file exists');

  const markdownFiles = fs.readdirSync('.')
    .filter(file => /\.md$/i.test(file))
    .filter(file => file !== 'CLAUDE.md')
    .sort();
  markdownFiles.forEach(file => {
    assert(readme.includes(file), `README Markdown index references ${file}`);
  });

  console.log('releaseStructure tests passed');
}

run();
