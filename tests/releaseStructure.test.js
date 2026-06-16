import assert from 'assert';
import fs from 'fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function latestReleaseVersion(promptHistory) {
  const match = promptHistory.match(/^## Release Date:\s+\d{4}-\d{2}-\d{2}\s+Version\s+([0-9.]+)/m);
  assert(match, 'PROMPT_History.md has a latest release entry');
  return match[1];
}

function dependencyVersion(packageJson, name) {
  assert(packageJson.dependencies?.[name], `package.json declares ${name}`);
  return packageJson.dependencies[name];
}

function assertThreeCdnWithNodeModulesFallback(html, fileName) {
  assert(html.includes('./js/dependencyBootstrap.js'), `${fileName} loads the dependency bootstrap`);
  assert(html.includes('https://unpkg.com/three@0.184.0/build/three.module.js'), `${fileName} tries Three.js CDN core first`);
  assert(html.includes('https://unpkg.com/three@0.184.0/examples/jsm/'), `${fileName} tries Three.js CDN addons first`);
  assert(html.includes('./node_modules/three/build/three.module.js'), `${fileName} has local Three.js core fallback`);
  assert(html.includes('./node_modules/three/examples/jsm/'), `${fileName} has local Three.js addons fallback`);
  assert(html.includes('openbexiBootFromTemplate'), `${fileName} boots after dependency resolution`);
  assert(html.includes('type="text/openbexi-module"'), `${fileName} defers the main module until the import map is selected`);
}

function run() {
  const promptHistory = read('PROMPT_History.md').replace(/^\uFEFF/, '');
  const indexHtml = read('index.html');
  const displaySatelliteHtml = read('display_satellite.html');
  const readme = read('README.md');
  const packageJson = JSON.parse(read('package.json'));

  assert(promptHistory.startsWith('# Prompt History'), 'PROMPT_History.md starts with Prompt History');

  const latestVersion = latestReleaseVersion(promptHistory);
  assert.strictEqual(latestVersion, '1.7.6', 'latest release is Version 1.7.6');

  const versionMatch = indexHtml.match(/const\s+versionNumber\s*=\s*"([^"]+)"/);
  assert(versionMatch, 'index.html defines a visible version number');
  assert.strictEqual(versionMatch[1], latestVersion, 'index.html version matches latest prompt release');

  assertThreeCdnWithNodeModulesFallback(indexHtml, 'index.html');
  assertThreeCdnWithNodeModulesFallback(displaySatelliteHtml, 'display_satellite.html');
  assert.strictEqual(dependencyVersion(packageJson, 'three'), '0.184.0', 'package.json pins verified Three.js 0.184.0');
  assert.strictEqual(dependencyVersion(packageJson, 'satellite.js'), '6.0.2', 'package.json pins satellite.js 6.0.2');
  assert(indexHtml.includes('https://unpkg.com/satellite.js@6.0.2/dist/satellite.min.js'), 'index.html tries satellite.js CDN first');
  assert(indexHtml.includes('./node_modules/satellite.js/dist/satellite.min.js'), 'index.html has local satellite.js fallback');
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
