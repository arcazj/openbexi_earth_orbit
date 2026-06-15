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

function importMapVersions(html, fileName) {
  const threeMatch = html.match(/"three"\s*:\s*"https:\/\/unpkg\.com\/three@([^/]+)\/build\/three\.module\.js"/);
  const addonsMatch = html.match(/"three\/addons\/"\s*:\s*"https:\/\/unpkg\.com\/three@([^/]+)\/examples\/jsm\/"/);
  assert(threeMatch, `${fileName} defines a Three.js core import map entry`);
  assert(addonsMatch, `${fileName} defines a Three.js addons import map entry`);
  return {
    core: threeMatch[1],
    addons: addonsMatch[1]
  };
}

function run() {
  const promptHistory = read('PROMPT_History.md').replace(/^\uFEFF/, '');
  const indexHtml = read('index.html');
  const displaySatelliteHtml = read('display_satellite.html');
  const readme = read('README.md');

  assert(promptHistory.startsWith('# Prompt History'), 'PROMPT_History.md starts with Prompt History');

  const latestVersion = latestReleaseVersion(promptHistory);
  assert.strictEqual(latestVersion, '1.7.6', 'latest release is Version 1.7.6');

  const versionMatch = indexHtml.match(/const\s+versionNumber\s*=\s*"([^"]+)"/);
  assert(versionMatch, 'index.html defines a visible version number');
  assert.strictEqual(versionMatch[1], latestVersion, 'index.html version matches latest prompt release');

  const indexVersions = importMapVersions(indexHtml, 'index.html');
  const viewerVersions = importMapVersions(displaySatelliteHtml, 'display_satellite.html');
  assert.strictEqual(indexVersions.core, indexVersions.addons, 'index.html core/addons Three.js versions match');
  assert.strictEqual(viewerVersions.core, viewerVersions.addons, 'display_satellite.html core/addons Three.js versions match');
  assert.strictEqual(indexVersions.core, '0.184.0', 'index.html uses verified Three.js 0.184.0');
  assert.strictEqual(viewerVersions.core, '0.184.0', 'display_satellite.html uses verified Three.js 0.184.0');

  const markdownFiles = fs.readdirSync('.')
    .filter(file => /\.md$/i.test(file))
    .sort();
  markdownFiles.forEach(file => {
    assert(readme.includes(file), `README Markdown index references ${file}`);
  });

  console.log('releaseStructure tests passed');
}

run();
