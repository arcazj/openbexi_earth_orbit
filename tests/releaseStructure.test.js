import assert from 'assert';
import fs from 'fs';
import path from 'path';

const README_H2_HEADINGS = [
  'Live Demo',
  'Features',
  'Images',
  'Requirements',
  'Quick Start',
  'API',
  'Tools',
  'Testing',
  'All Project Documentation',
  'License'
];

const LIVE_DEMO_URL = 'https://arcazj.github.io/openbexi_earth_orbit/index.html';
const README_IMAGE_URLS = [
  'https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_ex1.png',
  'https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_STARLINK.PNG',
  'https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_ONEWEB.PNG'
];
const README_IMAGE_PATHS = [
  'images/openbexi_earth_orbit_ex1.png',
  'images/openbexi_earth_orbit_STARLINK.PNG',
  'images/openbexi_earth_orbit_ONEWEB.PNG'
];

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function normalized(relativePath) {
  return relativePath.replaceAll('\\', '/');
}

function filesUnder(root, excludedDirectories = new Set()) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(target, excludedDirectories));
    if (entry.isFile()) files.push(normalized(path.relative('.', target)));
  }
  return files;
}

function markdownSections(markdown) {
  const sections = [];
  let current = null;
  let fenceMarker = null;

  for (const line of markdown.split(/\r?\n/)) {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1][0];
      fenceMarker = fenceMarker === marker ? null : (fenceMarker ?? marker);
      if (current) current.lines.push(line);
      continue;
    }

    const heading = fenceMarker === null ? line.match(/^##\s+(.+?)\s*$/) : null;
    if (heading) {
      current = { heading: heading[1], lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }

  return sections.map(section => ({
    heading: section.heading,
    content: section.lines.join('\n')
  }));
}

function markdownOutsideFences(markdown) {
  const lines = [];
  let fenceMarker = null;
  for (const line of markdown.split(/\r?\n/)) {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1][0];
      fenceMarker = fenceMarker === marker ? null : (fenceMarker ?? marker);
      continue;
    }
    if (fenceMarker === null) lines.push(line);
  }
  return lines.join('\n');
}

function markdownDestinations(markdown) {
  return [...markdownOutsideFences(markdown).matchAll(/\]\(([^)\r\n]+)\)/g)]
    .map(match => match[1].trim())
    .map(destination => {
      if (destination.startsWith('<')) {
        const end = destination.indexOf('>');
        return end === -1 ? destination : destination.slice(1, end);
      }
      return destination.split(/\s+["']/)[0];
    });
}

function localPathFromDestination(destination) {
  if (!destination || destination.startsWith('#') || destination.startsWith('//') ||
      /^[a-z][a-z0-9+.-]*:/i.test(destination) || destination.startsWith('/')) {
    return null;
  }

  const withoutQuery = destination.split(/[?#]/, 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    assert.fail(`README link has invalid URI encoding: ${destination}`);
  }
  assert(!decoded.includes('\\'), `README relative link uses forward slashes: ${destination}`);
  const relativePath = path.posix.normalize(decoded.replace(/^\.\//, ''));
  assert(
    relativePath !== '..' && !relativePath.startsWith('../') && !path.posix.isAbsolute(relativePath),
    `README relative link stays inside the repository: ${destination}`
  );
  return relativePath;
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
  const developmentSbom = JSON.parse(read('release/evidence/openbexi-node-sbom-2.3.1-development.cdx.json'));
  const releaseModule = read('js/releaseVersion.js');

  assert(promptHistory.startsWith('# Prompt History'), 'PROMPT_History.md starts with Prompt History');

  assert.strictEqual(release.version, '2.3.1', 'authoritative development version is 2.3.1');
  assert.strictEqual(release.channel, 'development', 'Version 2.3.1 remains on the development channel');
  assert.strictEqual(release.publicationState, 'development', 'Version 2.3.1 is not promoted');
  assert.strictEqual(release.candidateAt, null, 'development build has no candidate date');
  assert.strictEqual(release.releasedAt, null, 'development build has no release date');
  assert.strictEqual(release.maturity, 'experimental', 'scientific maturity remains experimental');
  assert.strictEqual(release.safetyClass, 'non-operational', 'release remains non-operational');
  assert.strictEqual(packageJson.version, release.version, 'package version matches release metadata');
  assert.strictEqual(packageLock.version, release.version, 'lockfile version matches release metadata');
  assert.strictEqual(
    packageJson.scripts['serve:update'],
    'node scripts/python.mjs server.py --host 127.0.0.1 --port 8000 --update-data-on-schedule --gp-update-interval-hours 24 --tle-update-interval-hours 24 --satcat-update-interval-hours 24 --tracked-update-interval-hours 24 --reconciliation-interval-hours 24',
    'serve:update starts the explicit opt-in daily maintenance server'
  );
  const playwrightConfig = read('playwright.config.js');
  assert.match(
    playwrightConfig,
    /process\.execPath,\s*['"]scripts\/python\.mjs['"]/,
    'Playwright starts its loopback server through shared Python discovery'
  );
  assert.match(
    archivedSbom.serialNumber,
    /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'archived CycloneDX SBOM has a standards-compliant UUID serial number'
  );
  assert.match(
    developmentSbom.serialNumber,
    /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'v2.3.1 development CycloneDX SBOM has a standards-compliant UUID serial number'
  );
  assert.strictEqual(
    developmentSbom.metadata?.component?.version,
    release.version,
    'v2.3.1 development SBOM matches authoritative version metadata'
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

  assert.match(readme, /^# OpenBEXI Earth Orbit\s*$/m, 'README has the project title');
  const readmeSections = markdownSections(readme);
  assert.deepStrictEqual(
    readmeSections.map(section => section.heading),
    README_H2_HEADINGS,
    'README has exactly the required ordered H2 sections'
  );
  const sectionByHeading = new Map(readmeSections.map(section => [section.heading, section.content]));

  const liveDemoDestinations = markdownDestinations(sectionByHeading.get('Live Demo'))
    .filter(destination => /^https?:/i.test(destination));
  assert.deepStrictEqual(
    liveDemoDestinations,
    [LIVE_DEMO_URL],
    'README Live Demo has exactly the canonical public application URL'
  );

  const clickableImages = [...sectionByHeading.get('Images').matchAll(
    /\[!\[([^\]]+)\]\(([^)\r\n]+)\)\]\(([^)\r\n]+)\)/g
  )].map(match => ({
    alt: match[1].trim(),
    source: match[2].trim(),
    target: match[3].trim()
  }));
  assert.strictEqual(clickableImages.length, 3, 'README has exactly three clickable project images');
  assert.deepStrictEqual(
    clickableImages.map(image => image.source),
    README_IMAGE_URLS,
    'README image sources use the exact canonical public URLs in the required order'
  );
  assert.deepStrictEqual(
    clickableImages.map(image => image.target),
    README_IMAGE_URLS,
    'README images link to their full-resolution canonical URLs'
  );
  clickableImages.forEach((image, index) => {
    assert(image.alt.length > 0, `README image ${index + 1} has nonempty alternative text`);
  });

  const repositoryFiles = filesUnder('.', new Set([
    '.git',
    'artifacts',
    'coverage',
    'dist',
    'node_modules',
    'playwright-report',
    'test-results',
    'vendor'
  ]));
  const repositoryFileSet = new Set(repositoryFiles);
  README_IMAGE_PATHS.forEach((imagePath, index) => {
    assert(repositoryFileSet.has(imagePath), `README image ${index + 1} has exact-case local file ${imagePath}`);
    assert(fs.statSync(imagePath).size > 0, `README image ${index + 1} local file is nonempty`);
    assert.strictEqual(
      README_IMAGE_URLS[index],
      `https://arcazj.github.io/openbexi_earth_orbit/${imagePath}`,
      `README image ${index + 1} public URL preserves the local path casing`
    );
  });

  const authoredMarkdownFiles = repositoryFiles
    .filter(file => /\.md$/i.test(file))
    .sort();
  assert.strictEqual(authoredMarkdownFiles.length, 42, 'repository has the expected 42 project-authored Markdown files');

  const documentationLinks = markdownDestinations(sectionByHeading.get('All Project Documentation'))
    .map(localPathFromDestination)
    .filter(Boolean)
    .filter(file => /\.md$/i.test(file));
  assert.strictEqual(documentationLinks.length, 42, 'README documentation inventory contains 42 Markdown links');
  assert.strictEqual(
    new Set(documentationLinks).size,
    documentationLinks.length,
    'README documentation inventory lists every Markdown file exactly once'
  );
  assert.deepStrictEqual(
    [...documentationLinks].sort(),
    authoredMarkdownFiles,
    'README documentation inventory exactly matches project-authored Markdown files'
  );

  for (const destination of markdownDestinations(readme)) {
    const relativePath = localPathFromDestination(destination);
    if (relativePath === null) continue;
    assert(
      repositoryFileSet.has(relativePath),
      `README relative link resolves with exact case: ${destination}`
    );
  }

  const apiSection = sectionByHeading.get('API');
  assert.match(
    apiSection,
    /^\|\s*Endpoint\s*\|\s*Purpose\s*\|\s*Authentication\s*\|\s*$/m,
    'README API table declares endpoint, purpose, and authentication columns'
  );
  for (const route of [
    '/api/health',
    '/api/version',
    '/api/gp',
    '/api/gp-metadata',
    '/api/satellites',
    '/api/tle',
    '/api/launches',
    '/api/decayed',
    '/api/satellite-metadata',
    '/api/display-satellite-models',
    '/api/data-update-status',
    '/api/v1/health/live',
    '/health/ready',
    '/capabilities',
    '/api/v1/catalog-revisions',
    '/screening-jobs',
    '/conjunction-events',
    '/api/v1/screening-jobs/{job_id}/stream'
  ]) {
    assert(apiSection.includes(route), `README API table covers ${route}`);
  }
  for (const documentationTarget of ['swagger.html', 'SWAGGER.md', 'markdown_viewer.html', '/docs', '/openapi.json']) {
    assert(apiSection.includes(documentationTarget), `README API section links ${documentationTarget}`);
  }

  const toolsSection = sectionByHeading.get('Tools');
  for (const supportedTool of [
    'tools/satellite_data_tools.py',
    'server.py',
    'npm run serve:update',
    'npm run benchmark:full-catalog',
    'npm run benchmark:v21-service',
    'tools/preprocess_star_catalog.py',
    'tools/generate_jpl_ephemeris.py'
  ]) {
    assert(toolsSection.includes(supportedTool), `README Tools section documents ${supportedTool}`);
  }
  const dataToolSource = read('tools/satellite_data_tools.py');
  const dataToolSubcommands = [...dataToolSource.matchAll(
    /subparsers\.add_parser\(\s*["']([^"']+)["']/g
  )].map(match => match[1]);
  assert.deepStrictEqual(
    dataToolSubcommands,
    ['export-gp', 'export-tle', 'build-decayed-db', 'refresh-satcat', 'build-launches', 'build-tracked', 'maybe-update'],
    'satellite data tool exposes the expected maintained subcommands'
  );
  dataToolSubcommands.forEach(command => {
    assert(toolsSection.includes(`\`${command}\``), `README Tools section documents satellite data subcommand ${command}`);
  });

  console.log('releaseStructure tests passed');
}

run();
