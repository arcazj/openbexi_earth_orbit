import fs from 'node:fs';

const versionRecord = JSON.parse(fs.readFileSync('release/version.json', 'utf8'));
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const featureFlagRecord = JSON.parse(fs.readFileSync('release/feature-flags.json', 'utf8'));
const browserRelease = await import('../js/releaseVersion.js');
const serverSource = fs.readFileSync('server.py', 'utf8');
const serverConnectionSource = fs.readFileSync('js/serverConnection.js', 'utf8');
const menuSource = fs.readFileSync('js/SatelliteMenuLoader.js', 'utf8');
const indexSource = fs.readFileSync('index.html', 'utf8');
const swaggerSource = fs.readFileSync('swagger.html', 'utf8');
const swaggerMarkdown = fs.readFileSync('SWAGGER.md', 'utf8');

const allowedChannels = new Set(['development', 'preview', 'stable']);
const allowedPublicationStates = new Set(['development', 'candidate', 'released']);
const allowedMaturity = new Set(['prototype', 'experimental', 'validated']);
const allowedSafetyClasses = new Set(['non-operational', 'independently-reviewed']);
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function fail(message) {
  throw new Error(`Version policy: ${message}`);
}

if (versionRecord.schemaVersion !== 1) fail('unsupported schemaVersion');
if (!exactVersion.test(versionRecord.version)) fail(`invalid version ${versionRecord.version}`);
if (!exactVersion.test(versionRecord.baselineRuntimeVersion)) fail('invalid baselineRuntimeVersion');
if (!allowedChannels.has(versionRecord.channel)) fail(`invalid channel ${versionRecord.channel}`);
if (!allowedPublicationStates.has(versionRecord.publicationState)) {
  fail(`invalid publicationState ${versionRecord.publicationState}`);
}
if (!allowedMaturity.has(versionRecord.maturity)) fail(`invalid maturity ${versionRecord.maturity}`);
if (!allowedSafetyClasses.has(versionRecord.safetyClass)) fail(`invalid safetyClass ${versionRecord.safetyClass}`);
if (versionRecord.publicationState === 'candidate') {
  if (versionRecord.channel !== 'preview') fail('candidate publicationState requires the preview channel');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(versionRecord.candidateAt)) {
    fail('candidate publicationState requires a YYYY-MM-DD candidateAt value');
  }
  if (versionRecord.releasedAt !== null) fail('candidate publicationState requires releasedAt to be null');
}
if (versionRecord.publicationState === 'development') {
  if (versionRecord.channel !== 'development') fail('development publicationState requires the development channel');
  if (versionRecord.candidateAt !== null || versionRecord.releasedAt !== null) {
    fail('development publicationState requires candidateAt and releasedAt to be null');
  }
}
if (versionRecord.publicationState === 'released' && !/^\d{4}-\d{2}-\d{2}$/.test(versionRecord.releasedAt)) {
  fail('released publicationState requires a YYYY-MM-DD releasedAt value');
}
if (versionRecord.safetyClass === 'independently-reviewed' && versionRecord.maturity !== 'validated') {
  fail('independently-reviewed requires validated maturity');
}
if (packageJson.private !== true) fail('package.json must remain private to prevent accidental publication');
if (packageJson.version !== versionRecord.version) fail('package.json version does not match release/version.json');
if (packageLock.version !== versionRecord.version) fail('package-lock.json version does not match release/version.json');
if (packageLock.packages?.['']?.version !== versionRecord.version) {
  fail('package-lock.json root package version does not match release/version.json');
}

if (JSON.stringify(browserRelease.RELEASE_METADATA) !== JSON.stringify(versionRecord)) {
  fail('js/releaseVersion.js drifted; run npm run version:sync');
}
if (browserRelease.APP_VERSION !== versionRecord.version) fail('browser APP_VERSION drifted');
const publicationDate = versionRecord.releasedAt ?? versionRecord.candidateAt ?? null;
if (browserRelease.RELEASE_DATE !== publicationDate) fail('browser RELEASE_DATE drifted');
if (!serverConnectionSource.includes("from './releaseVersion.js'")) {
  fail('js/serverConnection.js must re-export generated release metadata');
}
if (!menuSource.includes("from './releaseVersion.js'") || !menuSource.includes('${APP_VERSION}')) {
  fail('SatelliteMenuLoader must display generated APP_VERSION');
}
if (!indexSource.includes('const versionNumber = APP_VERSION;')) {
  fail('index.html must display the imported APP_VERSION');
}
if (!serverSource.includes('RELEASE_METADATA_PATH = ROOT / "release" / "version.json"') ||
    !serverSource.includes('APP_VERSION = str(RELEASE_METADATA["version"])') ||
    !serverSource.includes('server_version = f"OpenBEXIHTTP/{APP_VERSION}"')) {
  fail('server.py must derive application and server metadata from release/version.json');
}
if (!swaggerSource.includes(versionRecord.version) || !swaggerMarkdown.includes(versionRecord.version) ||
    (publicationDate !== null && (!swaggerSource.includes(publicationDate) || !swaggerMarkdown.includes(publicationDate))) ||
    !swaggerSource.includes(versionRecord.publicationState) || !swaggerMarkdown.includes(versionRecord.publicationState)) {
  fail('static API documentation does not contain the authoritative version, publication state, and date');
}
if (swaggerSource.includes(versionRecord.baselineRuntimeVersion) ||
    swaggerMarkdown.includes(versionRecord.baselineRuntimeVersion)) {
  fail('static API documentation still exposes the baseline runtime version');
}

if (featureFlagRecord.schemaVersion !== 1) fail('unsupported feature flag schemaVersion');
if (featureFlagRecord.releaseVersion !== versionRecord.version) {
  fail('feature flag releaseVersion does not match release/version.json');
}
if (!Array.isArray(featureFlagRecord.flags) || featureFlagRecord.flags.length === 0) {
  fail('feature flag registry must contain at least one auditable flag');
}
const featureFlagIds = new Set();
for (const flag of featureFlagRecord.flags) {
  if (!/^[a-z][a-z0-9_]*$/.test(flag.id ?? '')) fail(`invalid feature flag id ${flag.id}`);
  if (featureFlagIds.has(flag.id)) fail(`duplicate feature flag id ${flag.id}`);
  featureFlagIds.add(flag.id);
  if (typeof flag.enabled !== 'boolean') fail(`${flag.id} enabled must be boolean`);
  if (!Array.isArray(flag.enabledChannels) || flag.enabledChannels.some(channel => !allowedChannels.has(channel))) {
    fail(`${flag.id} has invalid enabledChannels`);
  }
  if (flag.enabled && !flag.enabledChannels.includes(versionRecord.channel)) {
    fail(`${flag.id} is enabled outside its declared release channels`);
  }
  if (String(flag.scientificMaturity).toLowerCase() !== versionRecord.maturity) {
    fail(`${flag.id} scientific maturity does not match release maturity`);
  }
  if (flag.safetyClass !== versionRecord.safetyClass) {
    fail(`${flag.id} safety class does not match release safety class`);
  }
  if (!flag.owner || !flag.rollback?.action || !flag.rollback?.dataImpact) {
    fail(`${flag.id} must identify an owner and rollback behavior`);
  }
  if (!flag.limitationsDocument || !fs.existsSync(flag.limitationsDocument)) {
    fail(`${flag.id} limitations document is missing`);
  }

  if (!new Set(['browser', 'server']).has(flag.scope)) fail(`${flag.id} has invalid scope ${flag.scope}`);
  const expectedBrowserEnablement = flag.scope === 'browser' && flag.enabled === true &&
    flag.enabledChannels.includes(versionRecord.channel) &&
    String(flag.scientificMaturity).toLowerCase() === versionRecord.maturity &&
    flag.safetyClass === versionRecord.safetyClass;
  const browserFlag = browserRelease.RELEASE_FEATURE_FLAGS?.[flag.id];
  if (flag.scope === 'browser') {
    if (!browserFlag || browserFlag.enabled !== expectedBrowserEnablement ||
        browserFlag.scientificMaturity !== String(flag.scientificMaturity) ||
        browserFlag.safetyClass !== String(flag.safetyClass)) {
      fail(`browser feature metadata for ${flag.id} drifted; run npm run version:sync`);
    }
  } else if (browserFlag) {
    fail(`server-only feature metadata for ${flag.id} must not be emitted to the browser`);
  }
}
if (!featureFlagIds.has('experimental_conjunction_screening')) {
  fail('experimental conjunction screening must have an auditable feature flag record');
}
if (!featureFlagIds.has('experimental_full_catalog_screening')) {
  fail('experimental full-catalog screening must have an auditable feature flag record');
}
if (browserRelease.EXPERIMENTAL_CONJUNCTION_SCREENING_ENABLED !==
    browserRelease.RELEASE_FEATURE_FLAGS.experimental_conjunction_screening.enabled) {
  fail('experimental conjunction screening convenience flag drifted');
}

const declared = { ...packageJson.dependencies, ...packageJson.devDependencies };
const locked = packageLock.packages?.[''] || {};
const lockedDeclared = { ...locked.dependencies, ...locked.devDependencies };
for (const [name, version] of Object.entries(declared)) {
  if (!exactVersion.test(version)) fail(`${name} must use an exact version, found ${version}`);
  if (lockedDeclared[name] !== version) fail(`${name} is not synchronized with package-lock.json`);
}

console.log(
  `Version policy passed: ${versionRecord.version} (${versionRecord.channel}, ${versionRecord.maturity}, ${versionRecord.safetyClass})`
);
