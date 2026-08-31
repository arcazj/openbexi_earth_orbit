import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = 'validation/v2.0.0/manifest.json';
const DIGEST_PATH = 'validation/v2.0.0/manifest.sha256';

function fail(message) {
  throw new Error(`Validation corpus policy: ${message}`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath));
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function requireNonEmptyObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) {
    fail(`${label} must be a non-empty object`);
  }
}

function canonicalValidationValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValidationValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonicalValidationValue(value[key])])
    );
  }
  return value;
}

function requireExactValue(actual, expected, label) {
  if (JSON.stringify(canonicalValidationValue(actual)) !== JSON.stringify(canonicalValidationValue(expected))) {
    fail(`${label} does not match the frozen observation`);
  }
}

const manifestBytes = read(MANIFEST_PATH);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const sidecar = read(DIGEST_PATH).toString('utf8').trim();
const sidecarMatch = sidecar.match(/^([a-f0-9]{64})  manifest\.json$/);
if (!sidecarMatch) fail(`${DIGEST_PATH} must use the format "<lowercase sha256>  manifest.json"`);
if (sidecarMatch[1] !== sha256(manifestBytes)) fail('manifest.json does not match its immutable sidecar digest');

if (manifest.schemaVersion !== 1) fail('unsupported schemaVersion');
if (manifest.corpusVersion !== '2.0.0') fail('corpusVersion must match validation/v2.0.0');
if (manifest.releaseVersion !== '2.0.0') fail('releaseVersion must be 2.0.0');
if (manifest.publicationState !== 'preview') fail('v2.0.0 corpus must remain preview');
if (manifest.scientificMaturity !== 'experimental') fail('scientific maturity must remain experimental');
if (manifest.safetyClass !== 'non-operational') fail('safety class must remain non-operational');
if (manifest.review?.status !== 'pending' || manifest.review?.reviewer !== null || manifest.review?.reviewedAt !== null) {
  fail('independent reviewer status must remain explicitly pending until a separately reviewed corpus version is published');
}

const conventions = manifest.conventions ?? {};
if (conventions.timeScale !== 'UTC' || conventions.frame !== 'TEME' ||
    conventions.positionUnits !== 'km' || conventions.velocityUnits !== 'km/s' ||
    conventions.missDistanceUnits !== 'km' || conventions.relativeSpeedUnits !== 'km/s') {
  fail('corpus conventions must explicitly declare UTC, TEME, km, and km/s');
}

if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length < 2) {
  fail('at least propagation and conjunction executable artifacts are required');
}
const artifactPaths = new Set();
for (const artifact of manifest.artifacts) {
  if (artifactPaths.has(artifact.path)) fail(`duplicate artifact ${artifact.path}`);
  artifactPaths.add(artifact.path);
  if (!/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')) fail(`${artifact.path} has an invalid SHA-256`);
  const actual = sha256(read(artifact.path));
  if (actual !== artifact.sha256) fail(`${artifact.path} checksum drifted: expected ${artifact.sha256}, found ${actual}`);
}

if (!Array.isArray(manifest.executables) || manifest.executables.length < 2) {
  fail('propagation and conjunction executable commands are required');
}
for (const executable of manifest.executables) {
  if (!artifactPaths.has(executable.artifact)) fail(`${executable.id} references an unhashed artifact`);
  if (typeof executable.command !== 'string' || !executable.command.includes(executable.artifact)) {
    fail(`${executable.id} must name its executable artifact in the command`);
  }
}

if (!Array.isArray(manifest.sources) || manifest.sources.length < 2) fail('official and synthetic sources are required');
const sourceIds = new Set();
for (const source of manifest.sources) {
  if (!source.id || sourceIds.has(source.id)) fail(`invalid or duplicate source id ${source.id}`);
  sourceIds.add(source.id);
  requireNonEmptyObject(source.urls, `${source.id}.urls`);
  for (const url of Object.values(source.urls)) {
    if (typeof url !== 'string' || !url.startsWith('https://')) fail(`${source.id} source URLs must use HTTPS`);
  }
  if (!source.license?.spdx || !source.license?.status) fail(`${source.id} must record SPDX and license status`);
}
const officialSource = manifest.sources.find(source => source.classification === 'official-reference');
if (!officialSource || officialSource.license.spdx !== 'AGPL-3.0-only' ||
    !officialSource.license.status.toLowerCase().includes('pending')) {
  fail('official CelesTrak source must retain its identified AGPL license and pending compatibility status');
}

const caseGroups = [
  ['referenceCases', 'reference'],
  ['referenceInputCoverageCases', 'reference-input-coverage'],
  ['syntheticCases', 'synthetic']
];
const caseIds = new Set();
for (const [groupName, classification] of caseGroups) {
  const cases = manifest[groupName];
  if (!Array.isArray(cases) || (groupName !== 'referenceInputCoverageCases' && cases.length === 0)) {
    fail(`${groupName} must be ${groupName === 'referenceInputCoverageCases' ? 'an array' : 'a non-empty array'}`);
  }
  for (const fixtureCase of cases) {
    if (!fixtureCase.id || caseIds.has(fixtureCase.id)) fail(`invalid or duplicate case id ${fixtureCase.id}`);
    caseIds.add(fixtureCase.id);
    if (fixtureCase.classification !== classification) fail(`${fixtureCase.id} is in the wrong case group`);
    if (fixtureCase.reviewStatus !== 'pending') fail(`${fixtureCase.id} review status must remain pending`);
    if (fixtureCase.conventionsRef !== 'corpus-defaults') fail(`${fixtureCase.id} must use declared corpus conventions`);
    if (!artifactPaths.has(fixtureCase.fixture?.artifact)) fail(`${fixtureCase.id} references an unhashed fixture artifact`);
    const sourceText = read(fixtureCase.fixture.artifact).toString('utf8');
    const locators = String(fixtureCase.fixture.locator ?? '').split(' / ');
    if (locators.some(locator => !locator || !sourceText.includes(locator))) {
      fail(`${fixtureCase.id} fixture locator no longer matches ${fixtureCase.fixture.artifact}`);
    }
    if (!Array.isArray(fixtureCase.sourceIds) || fixtureCase.sourceIds.length === 0 ||
        fixtureCase.sourceIds.some(sourceId => !sourceIds.has(sourceId))) {
      fail(`${fixtureCase.id} has an invalid source reference`);
    }
    requireNonEmptyObject(fixtureCase.expectedOutputs, `${fixtureCase.id}.expectedOutputs`);
    requireNonEmptyObject(fixtureCase.tolerances, `${fixtureCase.id}.tolerances`);
  }
}

for (const fixtureCase of manifest.referenceInputCoverageCases) {
  if (fixtureCase.accuracyClaim !== false || fixtureCase.tolerances.numericOutput !== null) {
    fail(`${fixtureCase.id} must not imply numeric accuracy without an independent expected output`);
  }
}
if (!manifest.knownGaps?.some(gap => /independent scientific reviewer approval is pending/i.test(gap))) {
  fail('known gaps must retain the pending independent-review disclosure');
}

console.log(
  `Validation corpus passed: ${manifest.corpusVersion}, ${caseIds.size} cases, ${manifest.artifacts.length} hashed artifacts, review ${manifest.review.status}`
);

const v21ManifestPath = 'validation/v2.1.0/manifest.json';
const v21DigestPath = 'validation/v2.1.0/manifest.sha256';
const v21ManifestBytes = read(v21ManifestPath);
const v21Manifest = JSON.parse(v21ManifestBytes.toString('utf8'));
const v21Sidecar = read(v21DigestPath).toString('utf8').trim();
const v21SidecarMatch = v21Sidecar.match(/^([a-f0-9]{64})  manifest\.json$/);
if (!v21SidecarMatch || v21SidecarMatch[1] !== sha256(v21ManifestBytes)) {
  fail('v2.1 development manifest does not match its sidecar digest');
}
if (v21Manifest.schemaVersion !== 1 || v21Manifest.corpusVersion !== '2.1.0-development' ||
    v21Manifest.releaseVersion !== '2.1.0' || v21Manifest.publicationState !== 'development') {
  fail('v2.1 development corpus identity is invalid');
}
if (v21Manifest.scientificMaturity !== 'experimental' || v21Manifest.safetyClass !== 'non-operational' ||
    v21Manifest.claims?.accuracy !== false || v21Manifest.claims?.operationalUse !== false) {
  fail('v2.1 evidence must remain experimental, non-operational, and free of accuracy claims');
}
if (v21Manifest.review?.status !== 'pending' || v21Manifest.review?.reviewer !== null ||
    v21Manifest.review?.reviewedAt !== null) {
  fail('v2.1 independent review must remain explicitly pending');
}
const v21Conventions = v21Manifest.conventions ?? {};
if (v21Conventions.timeScale !== 'UTC' || v21Conventions.screeningFrame !== 'TEME' ||
    v21Conventions.positionUnits !== 'km' || v21Conventions.velocityUnits !== 'km/s') {
  fail('v2.1 evidence must declare UTC, TEME, km, and km/s conventions');
}

if (!Array.isArray(v21Manifest.artifacts) || v21Manifest.artifacts.length < 27) {
  fail('v2.1 evidence must hash the engine, runner, source adapters, tests, scale, and service observations');
}
const v21ArtifactPaths = new Set();
const v21DriftedSourceArtifacts = new Set();
for (const artifact of v21Manifest.artifacts) {
  if (typeof artifact.path !== 'string' || v21ArtifactPaths.has(artifact.path)) {
    fail(`v2.1 has an invalid or duplicate artifact ${artifact.path}`);
  }
  v21ArtifactPaths.add(artifact.path);
  if (!/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')) fail(`${artifact.path} has an invalid v2.1 SHA-256`);
  const actual = sha256(read(artifact.path));
  if (actual !== artifact.sha256) {
    if (artifact.path.startsWith('validation/v2.1.0/')) {
      fail(`${artifact.path} drifted from immutable v2.1 evidence: expected ${artifact.sha256}, found ${actual}`);
    }
    v21DriftedSourceArtifacts.add(artifact.path);
  }
}
if (!Array.isArray(v21Manifest.executables) || v21Manifest.executables.length < 6) {
  fail('v2.1 must declare engine, runner, source, scale, and service benchmark executables');
}
for (const executable of v21Manifest.executables) {
  if (!executable.id || typeof executable.command !== 'string' || executable.command.length < 5 ||
      !Array.isArray(executable.artifacts) || executable.artifacts.length === 0 ||
      executable.artifacts.some(artifact => !v21ArtifactPaths.has(artifact))) {
    fail(`v2.1 executable ${executable.id ?? '<missing>'} has invalid artifact references`);
  }
}

if (!Array.isArray(v21Manifest.evidence) || v21Manifest.evidence.length < 8) {
  fail('v2.1 must include oracle, integration, source-format, scale, and service evidence');
}
const v21EvidenceIds = new Set();
for (const evidence of v21Manifest.evidence) {
  if (!evidence.id || v21EvidenceIds.has(evidence.id) || !v21ArtifactPaths.has(evidence.artifact)) {
    fail(`v2.1 has invalid evidence ${evidence.id ?? '<missing>'}`);
  }
  v21EvidenceIds.add(evidence.id);
  requireNonEmptyObject(evidence.expected, `${evidence.id}.expected`);
  const artifactText = read(evidence.artifact).toString('utf8');
  if (evidence.locator && !v21DriftedSourceArtifacts.has(evidence.artifact) && !artifactText.includes(evidence.locator)) {
    fail(`${evidence.id} locator no longer matches ${evidence.artifact}`);
  }
}
for (const requiredId of [
  'broad-phase.brute-force-chord-recall',
  'refinement.analytic-linear-events',
  'runner.immutable-input-and-result',
  'sources.multi-format-contracts',
  'scale.local-full-catalog-60-seconds',
  'service.full-catalog-http-and-persistence',
  'service.durable-contracts',
  'service.store-fencing-and-atomicity'
]) {
  if (!v21EvidenceIds.has(requiredId)) fail(`v2.1 evidence is missing ${requiredId}`);
}

const scaleArtifact = v21Manifest.evidence.find(item =>
  item.id === 'scale.local-full-catalog-60-seconds'
)?.artifact;
const scaleReport = JSON.parse(read(scaleArtifact).toString('utf8'));
if (scaleReport.application_version !== '2.1.0' || scaleReport.publication_state !== 'development' ||
    scaleReport.scientific_maturity !== 'experimental' || scaleReport.safety_class !== 'non-operational' ||
    scaleReport.accuracy_claim !== false) {
  fail('v2.1 scale report has invalid release or scientific labels');
}
if (scaleReport.source?.selected_record_count < 10_000 ||
    scaleReport.result?.statistics?.catalog_objects !== scaleReport.source.selected_record_count ||
    scaleReport.result.statistics.pair_intervals_total < 10_000_000) {
  fail('v2.1 scale report does not exercise a full-size catalog');
}
const scaleStats = scaleReport.result.statistics;
if (scaleStats.pair_intervals_screened + scaleStats.pair_intervals_unscreened !== scaleStats.pair_intervals_total ||
    scaleReport.result.status !== 'PARTIAL' || scaleStats.pair_intervals_unscreened < 1) {
  fail('v2.1 scale report must account for its explicitly incomplete screening coverage');
}
if (!(scaleReport.measurement?.wall_time_seconds > 0) || !(scaleReport.measurement?.result_bytes > 0) ||
    !(scaleReport.measurement?.memory_peak_observed?.rss_bytes > 0) ||
    !(scaleReport.reduction?.spatial_check_reduction_fraction > 0) ||
    !(scaleReport.reduction?.coarse_candidate_reduction_fraction > 0)) {
  fail('v2.1 scale report is missing duration, memory, volume, or candidate-reduction measurements');
}

const serviceArtifact = v21Manifest.evidence.find(item =>
  item.id === 'service.full-catalog-http-and-persistence'
)?.artifact;
const serviceReport = JSON.parse(read(serviceArtifact).toString('utf8'));
const serviceLabels = serviceReport.labels ?? {};
if (serviceReport.benchmark !== 'OPENBEXI_V21_DURABLE_SCREENING_SERVICE' ||
    serviceReport.benchmark_status !== 'PASS' || serviceLabels.application_version !== '2.1.0' ||
    serviceLabels.publication_state !== 'development' || serviceLabels.capability_maturity !== 'Experimental' ||
    serviceLabels.safety_class !== 'non-operational' || serviceLabels.operational_use !== false ||
    serviceLabels.scientific_accuracy_claim !== false) {
  fail('v2.1 service report has invalid benchmark, release, or scientific labels');
}
const serviceJob = serviceReport.job ?? {};
const serviceScience = serviceJob.scientific ?? {};
if (serviceReport.source_identity?.catalog_object_count < 10_000 ||
    serviceScience.statistics?.catalog_objects !== serviceReport.source_identity.catalog_object_count ||
    serviceReport.source_identity?.source_status !== 'PARTIAL' ||
    !serviceScience.quality_flags?.includes('PARTIAL_SOURCE_DATASET') ||
    serviceJob.state !== 'SUCCEEDED' || serviceScience.job_state !== 'SUCCEEDED' ||
    serviceScience.scientific_status !== 'PARTIAL' ||
    serviceJob.queried_conjunction_event_count !== serviceScience.event_count) {
  fail('v2.1 service report must exercise a full catalog and preserve infrastructure/scientific status semantics');
}
const servicePersistence = serviceReport.persistence ?? {};
if (!(serviceReport.timing?.worker_execution_ms > 0) ||
    !(serviceReport.timing?.submission_to_terminal_observation_ms > 0) ||
    !(servicePersistence.after_clean_shutdown?.total_persistence_bytes > 0) ||
    servicePersistence.record_counts?.catalog_objects !== serviceReport.source_identity.catalog_object_count ||
    servicePersistence.record_counts?.conjunction_events !== serviceScience.event_count) {
  fail('v2.1 service report is missing execution timing or clean-shutdown persistence evidence');
}
if (!(servicePersistence.record_counts?.job_progress > 0) ||
    servicePersistence.record_counts.job_progress > 512 * serviceJob.attempt_count ||
    servicePersistence.record_counts.event_outbox > servicePersistence.record_counts.job_progress + 8 ||
    servicePersistence.record_counts.audit_records > servicePersistence.record_counts.job_progress + 8) {
  fail('v2.1 service report exceeds the bounded per-attempt progress/outbox persistence budget');
}
for (const endpoint of [
  'POST /api/v1/screening-jobs',
  'GET /api/v1/screening-jobs/{job_id}',
  'GET /api/v1/conjunction-events'
]) {
  const latency = serviceReport.timing?.endpoint_latency?.[endpoint];
  if (!(latency?.sample_count > 0) || !(latency?.p95_ms > 0)) {
    fail(`v2.1 service report is missing latency samples for ${endpoint}`);
  }
}
if (!v21Manifest.knownGaps?.some(gap => /independent scientific reviewer approval is pending/i.test(gap)) ||
    !v21Manifest.knownGaps?.some(gap => /collision-probability/i.test(gap))) {
  fail('v2.1 evidence must retain independent-review and collision-probability gaps');
}

console.log(
  `Validation evidence passed: ${v21Manifest.corpusVersion}, ${v21EvidenceIds.size} evidence records, ` +
  `${v21Manifest.artifacts.length} historical hashes, ${v21DriftedSourceArtifacts.size} source files superseded, ` +
  `review ${v21Manifest.review.status}`
);

const historicalV22ManifestPath = 'validation/v2.2.0/manifest.json';
const historicalV22DigestPath = 'validation/v2.2.0/manifest.sha256';
const historicalV22ManifestBytes = read(historicalV22ManifestPath);
const historicalV22Manifest = JSON.parse(historicalV22ManifestBytes.toString('utf8'));
const historicalV22Sidecar = read(historicalV22DigestPath).toString('utf8').trim();
const historicalV22SidecarMatch = historicalV22Sidecar.match(/^([a-f0-9]{64})  manifest\.json$/);
if (!historicalV22SidecarMatch || historicalV22SidecarMatch[1] !== sha256(historicalV22ManifestBytes)) {
  fail('historical v2.2.0 manifest does not match its immutable sidecar digest');
}
if (historicalV22Manifest.schemaVersion !== 1 ||
    historicalV22Manifest.corpusVersion !== '2.2.0-development' ||
    historicalV22Manifest.releaseVersion !== '2.2.0' ||
    historicalV22Manifest.publicationState !== 'development') {
  fail('historical v2.2.0 corpus identity is invalid');
}

const v22ManifestPath = 'validation/v2.2.1/manifest.json';
const v22DigestPath = 'validation/v2.2.1/manifest.sha256';
const immutableV22ManifestSha256 = '6b20ae3141c3dc42687ac98903c15e3f6cab10a6bd56be16a3393c5083cbea45';
const v22ManifestBytes = read(v22ManifestPath);
const v22Manifest = JSON.parse(v22ManifestBytes.toString('utf8'));
const v22Sidecar = read(v22DigestPath).toString('utf8').trim();
const v22SidecarMatch = v22Sidecar.match(/^([a-f0-9]{64})  manifest\.json$/);
if (!v22SidecarMatch || v22SidecarMatch[1] !== sha256(v22ManifestBytes)) {
  fail('historical v2.2.1 development manifest does not match its sidecar digest');
}
if (v22SidecarMatch[1] !== immutableV22ManifestSha256) {
  fail('historical v2.2.1 manifest or sidecar changed from its frozen digest');
}
if (v22Manifest.schemaVersion !== 1 || v22Manifest.corpusVersion !== '2.2.1-development' ||
    v22Manifest.releaseVersion !== '2.2.1' || v22Manifest.publicationState !== 'development') {
  fail('v2.2 development corpus identity is invalid');
}
if (v22Manifest.scientificMaturity !== 'experimental' || v22Manifest.safetyClass !== 'non-operational' ||
    v22Manifest.claims?.accuracy !== false || v22Manifest.claims?.operationalUse !== false) {
  fail('v2.2 evidence must remain experimental, non-operational, and free of accuracy claims');
}
if (v22Manifest.review?.status !== 'pending' || v22Manifest.review?.reviewer !== null ||
    v22Manifest.review?.reviewedAt !== null) {
  fail('v2.2 independent review must remain explicitly pending');
}
const v22Conventions = v22Manifest.conventions ?? {};
if (v22Conventions.timeScale !== 'UTC' || v22Conventions.frame !== 'TEME' ||
    v22Conventions.positionUnits !== 'km' || v22Conventions.velocityUnits !== 'km/s') {
  fail('v2.2 evidence must declare UTC, TEME, km, and km/s conventions');
}

if (!Array.isArray(v22Manifest.artifacts) || v22Manifest.artifacts.length < 124) {
  fail('v2.2 evidence must hash ingest, browser, timeline, API, propagation, packaging, and test artifacts');
}
const v22ArtifactPaths = new Set();
for (const artifact of v22Manifest.artifacts) {
  if (typeof artifact.path !== 'string' || v22ArtifactPaths.has(artifact.path)) {
    fail(`v2.2 has an invalid or duplicate artifact ${artifact.path}`);
  }
  if (typeof artifact.role !== 'string' || artifact.role.trim().length < 3) {
    fail(`v2.2 artifact ${artifact.path} has no meaningful role`);
  }
  v22ArtifactPaths.add(artifact.path);
  if (!/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')) fail(`${artifact.path} has an invalid v2.2 SHA-256`);
}
for (const requiredPath of [
  '.github/workflows/ci.yml',
  '.github/dependabot.yml',
  '.gitattributes',
  '.nvmrc',
  'package.json',
  'package-lock.json',
  'release/version.json',
  'release/feature-flags.json',
  'release/static-artifact.json',
  'release/asset-budgets.json',
  'release/evidence/openbexi-node-sbom-2.2.1-development.cdx.json',
  'README.md',
  'tools/satellite_data_tools.py',
  'tools/benchmark_v21_service.py',
  'server.py',
  'services/v21/api.py',
  'services/v21/catalog_registry.py',
  'index.html',
  'display_satellite.html',
  'css/style.css',
  'js/SatelliteConfigurationLoader.js',
  'js/SatelliteMenuLoader.js',
  'js/satelliteCategoryFilter.js',
  'js/simulationClock.js',
  'js/satelliteTLELoader.js',
  'js/ganttTimelineLoader.js',
  'js/decayPredictor.js',
  'js/reentryTimeline.js',
  'js/mercatorMapLoader.js',
  'js/satelliteFootprintLoader.js',
  'js/satelliteModelLoader.js',
  'js/satelliteModelResolver.js',
  'js/sceneFrame.js',
  'js/shareState.js',
  'js/solarSystemEphemeris.js',
  'js/solarSystemOverviewLoader.js',
  'js/startupPerformance.js',
  'js/serverConnection.js',
  'js/dependencyBootstrap.js',
  'js/releaseVersion.js',
  'js/domain/orbitalSourceAdapters.js',
  'js/domain/v21Contracts.js',
  'js/orbit/multiFormatPropagationService.js',
  'js/orbit/orbitLinkGeometry.js',
  'js/orbit/satelliteMotionInterpolator.js',
  'js/conjunction/conjunctionScreening.js',
  'js/conjunction/conjunctionWorker.js',
  'js/conjunction/conjunctionWorkerClient.js',
  'js/conjunction/fullCatalogScreening.js',
  'scripts/build-static.mjs',
  'scripts/benchmark-full-catalog.mjs',
  'scripts/orbital-catalog-input.mjs',
  'scripts/python-discovery.mjs',
  'scripts/python.mjs',
  'scripts/run-browser-tests.mjs',
  'scripts/vendor-browser-dependencies.mjs',
  'scripts/run-full-catalog-screening.mjs',
  'scripts/check-validation-manifest.mjs',
  'scripts/check-asset-budgets.mjs',
  'scripts/check-js-syntax.mjs',
  'scripts/check-version.mjs',
  'scripts/generate-sbom.mjs',
  'scripts/sync-version.mjs',
  'playwright.config.js',
  'swagger.html',
  'tests/runAll.js',
  'tests/satelliteDataTools.test.js',
  'tests/gpCatalogLoader.test.js',
  'tests/multiFormatPropagationService.test.js',
  'tests/launchTimelineCatalog.test.js',
  'tests/decayCacheRefresh.test.js',
  'tests/serverConnection.test.js',
  'tests/serverApiStructure.test.js',
  'tests/catalogLoaderIntegration.test.js',
  'tests/catalogArtifactClassification.test.js',
  'tests/fullCatalogRunner.test.js',
  'tests/fullCatalogBenchmark.test.js',
  'tests/conjunctionWorkerProtocol.test.js',
  'tests/conjunctionUx.test.js',
  'tests/menuUx.test.js',
  'tests/displaySatelliteViewer.test.js',
  'tests/mercatorMotionReuse.test.js',
  'tests/orbitLinkGeometry.test.js',
  'tests/releaseStructure.test.js',
  'tests/satelliteCategoryFilter.test.js',
  'tests/satelliteMotionInterpolator.test.js',
  'tests/satelliteOrbitOcclusion.test.js',
  'tests/sceneFrameRoundTrip.test.js',
  'tests/shareState.test.js',
  'tests/simulationClock.test.js',
  'tests/solarSystemEphemeris.test.js',
  'tests/solarSystemOverview.test.js',
  'tests/startupPerformance.test.js',
  'tests/startupStructure.test.js',
  'tests/staticArtifact.test.js',
  'tests_python/test_server_security.py',
  'tests_python/test_v21_api.py',
  'tests_python/test_v21_catalog_registry.py',
  'tests_python/test_satellite_data_scheduler.py',
  'tests_python/test_server_data_update_scheduler.py',
  'tests_browser/conjunction.spec.js',
  'tests_browser/staticDeployment.spec.js',
  'tests_browser/timelines.spec.js',
  'tests_browser/satelliteFilters.spec.js',
  'tests_browser/timeSimulation.spec.js',
  'tests_browser/smoke.spec.js',
  'json/display_satellite_models.json',
  'json/gp/GP.json',
  'json/gp/GP.meta.json',
  'json/launches/launches.json',
  'json/launches/launches.meta.json',
  'json/decayed/decayed.json',
  'json/decayed/decayed.meta.json',
  'json/tle/TLE.json',
  'json/tle/TLE.meta.json',
  'json/tle/satellite_launch_dates.json',
  'json/satcat.csv',
  'json/satcat.meta.json',
  'docs/governance/DATA_SOURCES.md',
  'docs/governance/V2_POLICY.md',
  'docs/engineering/RELEASE_CHECKLIST_V2_2.md',
  'data/ephemeris/solar_system_jpl_horizons_2020_2035_6h.json',
  'data/ephemeris/solar_system_jpl_horizons_reference_samples.json',
  'obj/SSL_1300.glb'
]) {
  if (!v22ArtifactPaths.has(requiredPath)) fail(`v2.2 evidence is missing material artifact ${requiredPath}`);
}
if (!Array.isArray(v22Manifest.executables) || v22Manifest.executables.length < 16) {
  fail('v2.2 must declare ingest, browser, timeline, API, static, and Python executables');
}
const v22ExecutableIds = new Set();
for (const executable of v22Manifest.executables) {
  if (!executable.id || v22ExecutableIds.has(executable.id) ||
      typeof executable.command !== 'string' || executable.command.length < 5 ||
      !Array.isArray(executable.artifacts) || executable.artifacts.length === 0 ||
      executable.artifacts.some(artifact => !v22ArtifactPaths.has(artifact))) {
    fail(`v2.2 executable ${executable.id ?? '<missing>'} has invalid artifact references`);
  }
  v22ExecutableIds.add(executable.id);
}
for (const requiredId of [
  'gp-omm-export-fixtures',
  'mixed-browser-catalog',
  'timeline-refresh-fixtures',
  'server-browser-contracts',
  'static-runtime-closure',
  'python-service-regressions',
  'multi-format-worker-regressions',
  'browser-integration-regressions',
  'durable-registry-acquisitions',
  'gp-omm-benchmark-fixtures',
  'independent-data-scheduler',
  'python-discovery-and-data-tools',
  'static-timeline-and-network-closure',
  'browser-state-motion-unit-regressions',
  'browser-filter-time-density-regressions',
  'generated-data-and-model-integrity'
]) {
  if (!v22ExecutableIds.has(requiredId)) fail(`v2.2 executable evidence is missing ${requiredId}`);
}

if (!Array.isArray(v22Manifest.evidence) || v22Manifest.evidence.length < 46) {
  fail('v2.2 must include OMM ingest, mixed-loader, timeline, API, and static evidence');
}
const v22EvidenceIds = new Set();
for (const evidence of v22Manifest.evidence) {
  if (!evidence.id || v22EvidenceIds.has(evidence.id) || !v22ArtifactPaths.has(evidence.artifact)) {
    fail(`v2.2 has invalid evidence ${evidence.id ?? '<missing>'}`);
  }
  v22EvidenceIds.add(evidence.id);
  requireNonEmptyObject(evidence.expected, `${evidence.id}.expected`);
}
for (const requiredId of [
  'ingest.omm-identities-and-quarantine',
  'browser.mixed-catalog-propagation',
  'timeline.launch-details-only-refresh',
  'timeline.decay-cache-revision',
  'api.gp-launch-health-contracts',
  'static.omm-runtime-closure',
  'api.composite-data-revisions',
  'api.health-fallback-availability',
  'static.same-origin-revision-watcher',
  'browser.static-timeline-same-document-refresh',
  'service.immutable-acquisition-history',
  'service.malformed-gp-tle-bootstrap',
  'benchmark.gp-omm-input',
  'scheduler.independent-launch-decay',
  'scheduler.daily-update-reconciliation',
  'scheduler.server-lifecycle',
  'scheduler.production-catalog-shrink-guard',
  'scheduler.conditional-304-freshness-reset',
  'scheduler.collision-safe-backup-retention',
  'scheduler.mixed-304-tle-rejection',
  'scheduler.satcat-crlf-byte-exact-no-churn',
  'api.persisted-status-redaction',
  'api.recursive-status-redaction',
  'tooling.catalog-shrink-parser-boundary',
  'docs.readme-inventory-generated-exclusion',
  'tooling.shared-python-discovery',
  'static.offline-network-closure',
  'browser.unified-category-point-layer',
  'browser.tag-category-name-collision',
  'browser.selected-details-mercator-layering',
  'browser.authoritative-time-ephemeris',
  'motion.current-epoch-readiness-recovery',
  'motion.selected-same-time-invalidation-recovery',
  'render.batched-globe-density',
  'render.mercator-density',
  'render.point-resource-ownership',
  'motion.selected-orbit-in-place',
  'cleanup.obsolete-tle-orbit-sampler',
  'assets.canonical-ssl1300-only',
  'data.generated-catalog-classification',
  'governance.snapshot-redistribution-approval',
  'static.browser-state-runtime-closure',
  'tooling.browser-server-ownership'
]) {
  if (!v22EvidenceIds.has(requiredId)) fail(`v2.2 evidence is missing ${requiredId}`);
}
if (!v22Manifest.knownGaps?.some(gap => /independent scientific reviewer approval is pending/i.test(gap)) ||
    !v22Manifest.knownGaps?.some(gap => /future changed snapshots require renewed.*review/i.test(gap)) ||
    !v22Manifest.knownGaps?.some(gap => /fallback-tle state reports packaged-file availability only/i.test(gap)) ||
    !v22Manifest.knownGaps?.some(gap => /strict fixed-column, checksum, adapter, and propagation validation remains a runner boundary/i.test(gap))) {
  fail('v2.2 evidence must retain independent-review, future-snapshot, and fallback-validation gaps');
}

console.log(
  `Historical validation evidence pinned: ${v22Manifest.corpusVersion}, ${v22EvidenceIds.size} evidence records, ` +
  `${v22Manifest.artifacts.length} recorded hashes, review ${v22Manifest.review.status}`
);

const frozenV230Digest = 'b58ba777d115cca74518e56182ab8c229d6ed1a02e0ddc7cae528c549799232e';
const v230ManifestPath = 'validation/v2.3.0/manifest.json';
const v230DigestPath = 'validation/v2.3.0/manifest.sha256';
const v230ManifestBytes = read(v230ManifestPath);
const v230DigestBytes = read(v230DigestPath);
if (sha256(v230ManifestBytes) !== frozenV230Digest ||
    v230DigestBytes.toString('utf8') !== `${frozenV230Digest}  manifest.json\n`) {
  fail('historical v2.3.0 manifest or sidecar bytes changed');
}
const v230Manifest = JSON.parse(v230ManifestBytes.toString('utf8'));
if (v230Manifest.schemaVersion !== 1 ||
    v230Manifest.corpusId !== 'openbexi-earth-orbit-v2.3.0-development-evidence' ||
    v230Manifest.corpusVersion !== '2.3.0-development' ||
    v230Manifest.releaseVersion !== '2.3.0' ||
    v230Manifest.publicationState !== 'development' ||
    v230Manifest.artifacts?.length !== 260 ||
    v230Manifest.executables?.length !== 13 ||
    v230Manifest.evidence?.length !== 26) {
  fail('historical v2.3.0 corpus identity or structure changed');
}
console.log(
  `Historical validation evidence pinned: ${v230Manifest.corpusVersion}, ${v230Manifest.evidence.length} evidence records, ` +
  `${v230Manifest.artifacts.length} recorded hashes`
);

const v23ManifestPath = 'validation/v2.3.1/manifest.json';
const v23DigestPath = 'validation/v2.3.1/manifest.sha256';
const v23ManifestBytes = read(v23ManifestPath);
const v23Manifest = JSON.parse(v23ManifestBytes.toString('utf8'));
const v23Sidecar = read(v23DigestPath).toString('utf8');
const v23SidecarMatch = v23Sidecar.match(/^([a-f0-9]{64})  manifest\.json\n$/);
if (!v23SidecarMatch || v23SidecarMatch[1] !== sha256(v23ManifestBytes)) {
  fail('v2.3 development manifest does not match its sidecar digest');
}
if (v23Manifest.schemaVersion !== 1 ||
    v23Manifest.corpusId !== 'openbexi-earth-orbit-v2.3.1-development-evidence' ||
    v23Manifest.corpusVersion !== '2.3.1-development' ||
    v23Manifest.releaseVersion !== '2.3.1' || v23Manifest.publicationState !== 'development') {
  fail('v2.3.1 development corpus identity is invalid');
}
if (!Number.isFinite(Date.parse(v23Manifest.generatedAt)) ||
    v23Manifest.generation?.command !== 'py tools/satellite_data_tools.py build-tracked --all' ||
    v23Manifest.generation?.tool !== 'tools/satellite_data_tools.py' ||
    v23Manifest.generation?.toolVersion !== '2.3.1' ||
    v23Manifest.generation?.verificationCommand !== 'npm run check:validation') {
  fail('v2.3 evidence must identify a valid generation time and reproducible tracked-build/verification commands');
}
if (v23Manifest.scientificMaturity !== 'experimental' || v23Manifest.safetyClass !== 'non-operational') {
  fail('v2.3 evidence must remain experimental, non-operational, and free of accuracy, completeness, full-screening, or RCS-size claims');
}
requireExactValue(
  v23Manifest.claims,
  {
    accuracy: false,
    operationalUse: false,
    providerCompleteness: false,
    physicalDebrisCompleteness: false,
    rcsPhysicalSizeInference: false,
    fullTrackedScreeningCoverage: false,
    candidate: false,
    stableRelease: false,
    candidateAt: null,
    releasedAt: null,
    acceptanceUse: 'Development regression evidence with one approved publication; no candidate, scientific validation, stable-release, or operational claim.'
  },
  'v2.3.1 development and scientific claims'
);
if (v23Manifest.review?.status !== 'pending' || v23Manifest.review?.reviewer !== null ||
    v23Manifest.review?.reviewedAt !== null) {
  fail('v2.3 independent review must remain explicitly pending');
}
requireExactValue(
  v23Manifest.redistribution,
  {
    status: 'approved',
    approved: true,
    owner: 'arcazj',
    reviewer: 'arcazj (repository/data-release owner)',
    approvalDate: '2026-08-30',
    approvedAt: '2026-08-31T01:55:18Z',
    boundaryId: 'v2.3.1-exact-bytes-one-publication',
    approvedScope: 'v2.3.1-exact-manifest-chunks-metadata-quarantine-static-validation-and-unchanged-provider-bytes',
    channel: {
      id: 'github-origin-master-and-repository-root-pages',
      gitRemote: 'origin',
      branch: 'origin/master',
      repository: 'arcazj/openbexi_earth_orbit',
      pagesSource: 'repository-root',
      pagesUrl: 'https://arcazj.github.io/openbexi_earth_orbit/'
    },
    approvalEvidence: {
      basis: 'explicit-user-commit-and-push-after-exact-checksum-warning',
      instruction: 'commit and push to github',
      warnedManifestSha256: '14185ed9ef5969eb50dfffc162ea3a3495fad75a4008575569e865a94c6269d2',
      attributedOwner: 'arcazj',
      attributionBasis: [
        'git-user-name=arcazj',
        'github-origin-owner=arcazj'
      ]
    },
    publicationLimit: 1,
    rollbackRehearsalWaiver: {
      status: 'approved-for-one-publication',
      gapId: 'rollback-rehearsal-pending',
      publicationLimit: 1,
      preservesPendingGap: true,
      independentReviewWaived: false,
      candidateOrReleasePromotionWaived: false
    },
    exclusions: [
      'subsequent-byte-changes-after-final-approved-commit',
      'future-provider-refreshes',
      'different-repositories-or-branches',
      'different-publication-channels'
    ]
  },
  'v2.3.1 exact-byte redistribution approval'
);
const v23Conventions = v23Manifest.conventions ?? {};
if (v23Conventions.timeScale !== 'UTC' || v23Conventions.propagationFrame !== 'TEME' ||
    v23Conventions.positionUnits !== 'km' || v23Conventions.velocityUnits !== 'km/s' ||
    v23Conventions.rcsUnits !== 'm2' || v23Conventions.identifierEncoding !== 'canonical decimal strings') {
  fail('v2.3 evidence must declare UTC, TEME, km, km/s, m2 RCS metadata, and string identifiers');
}

if (!Array.isArray(v23Manifest.artifacts) || v23Manifest.artifacts.length < 70) {
  fail('v2.3 evidence must hash source, tracked data, API, static, browser, scale, governance, and tests');
}
const v23ArtifactPaths = new Set();
const v23ArtifactBytes = new Map();
for (const artifact of v23Manifest.artifacts) {
  if (typeof artifact.path !== 'string' || !artifact.path || artifact.path.includes('\\') ||
      path.isAbsolute(artifact.path) || artifact.path.split('/').includes('..') ||
      v23ArtifactPaths.has(artifact.path)) {
    fail(`v2.3 has an invalid or duplicate artifact ${artifact.path}`);
  }
  if (typeof artifact.role !== 'string' || artifact.role.trim().length < 3) {
    fail(`v2.3 artifact ${artifact.path} has no meaningful role`);
  }
  if (!/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')) {
    fail(`${artifact.path} has an invalid v2.3 SHA-256`);
  }
  const bytes = read(artifact.path);
  const actual = sha256(bytes);
  if (actual !== artifact.sha256) {
    fail(`${artifact.path} checksum drifted from v2.3 evidence: expected ${artifact.sha256}, found ${actual}`);
  }
  v23ArtifactPaths.add(artifact.path);
  v23ArtifactBytes.set(artifact.path, bytes);
}
const v231AdditionalArtifactPaths = [
  'data/stars/bright-stars-demo.js',
  'icons/ob_satellite.png',
  'icons/server_checking.svg',
  'icons/server_connected.svg',
  'icons/server_error.svg',
  'icons/server_offline.svg',
  'obj/ISS.glb',
  'obj/Textures/oneweb_antenna_texture.png',
  'obj/Textures/oneweb_bus_texture.png',
  'obj/Textures/oneweb_solar_texture.png',
  'obj/Textures/starlink_BaseColor.png',
  'obj/Textures/starlink_Checker_Roughness.png',
  'obj/Textures/starlink_Metallic.png',
  'obj/Textures/starlink_Normal.png',
  'obj/Textures/starmap-4k.jpg',
  'obj/o3b.glb',
  'obj/oneweb.glb',
  'obj/starlink_V1.mtl',
  'obj/starlink_V1.obj',
  'obj/starlink_v2.glb',
  'textures/1_earth_16k.jpg',
  'textures/March_8k.jpg',
  'textures/earthmap1k.jpg',
  'textures/jupiter.jpg',
  'textures/mercury.png',
  'textures/moon_map2.jpg',
  'textures/planets/saturn.jpg',
  'textures/planets/saturn_ring.png',
  'textures/planets/sun.jpg',
  'textures/planets/uranus.jpg',
  'textures/venus.png',
  'vendor/satellite.js/6.0.2/satellite.es.js',
  'vendor/satellite.js/6.0.2/satellite.min.js',
  'vendor/three/0.184.0/LICENSE',
  'vendor/three/0.184.0/build/three.core.js',
  'vendor/three/0.184.0/build/three.module.js',
  'vendor/three/0.184.0/examples/jsm/controls/OrbitControls.js',
  'vendor/three/0.184.0/examples/jsm/loaders/GLTFLoader.js',
  'vendor/three/0.184.0/examples/jsm/loaders/MTLLoader.js',
  'vendor/three/0.184.0/examples/jsm/loaders/OBJLoader.js',
  'vendor/three/0.184.0/examples/jsm/renderers/CSS2DRenderer.js',
  'vendor/three/0.184.0/examples/jsm/utils/BufferGeometryUtils.js',
  'vendor/three/0.184.0/examples/jsm/utils/SkeletonUtils.js',
  'release/evidence/openbexi-node-sbom-2.3.1-development.cdx.json',
  'tests_python/test_v231_gp_debris_scope.py',
  'validation/v2.3.0/manifest.json',
  'validation/v2.3.0/manifest.sha256'
];
const expectedV231ArtifactPaths = new Set([
  ...v230Manifest.artifacts.map(artifact => artifact.path),
  ...v231AdditionalArtifactPaths
]);
if (expectedV231ArtifactPaths.size !== 307 || v23ArtifactPaths.size !== expectedV231ArtifactPaths.size ||
    [...expectedV231ArtifactPaths].some(requiredPath => !v23ArtifactPaths.has(requiredPath)) ||
    [...v23ArtifactPaths].some(actualPath => !expectedV231ArtifactPaths.has(actualPath))) {
  fail('v2.3.1 evidence must contain exactly the frozen 307-artifact source, static-input, test, SBOM, data, and historical closure');
}
for (const requiredPath of [
  '.gitattributes',
  '.github/workflows/ci.yml',
  '.github/dependabot.yml',
  '.nvmrc',
  'LICENSE.md',
  'package.json',
  'package-lock.json',
  'release/version.json',
  'release/feature-flags.json',
  'release/static-artifact.json',
  'release/asset-budgets.json',
  'release/evidence/openbexi-node-sbom-2.3.0-development.cdx.json',
  'release/evidence/openbexi-node-sbom-2.3.1-development.cdx.json',
  'README.md',
  'RELEASE_NOTES.md',
  'ROADMAP.md',
  'PROMPT_History.md',
  'PROMPT_Instructions.md',
  'PROMPT4beamFormingSimulator3DWithMercatorMap_V2.MD',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'SWAGGER.md',
  'swagger.html',
  'Test_and_Integration.md',
  'docs/adr/0006-v2.3-tracked-object-catalog.md',
  'docs/engineering/RELEASE_CHECKLIST_V2_3.md',
  'docs/engineering/ROLLBACK.md',
  'docs/engineering/ROLLBACK_V2_3.md',
  'docs/engineering/PERFORMANCE_BUDGETS.md',
  'docs/engineering/STATIC_DEPLOYMENT.md',
  'docs/engineering/SERVER_DEPLOYMENT_V2_1.md',
  'docs/engineering/THREAT_MODEL_V2.md',
  'docs/engineering/THREAT_MODEL_V2_1.md',
  'docs/governance/DATA_SOURCES.md',
  'docs/governance/V2_POLICY.md',
  'docs/orbital-domain-contracts-v2.md',
  'docs/conjunction-screening-v2.md',
  'docs/science/EXPERIMENTAL_CONJUNCTION_SCREENING_V2.md',
  'docs/science/EXPERIMENTAL_FULL_CATALOG_SCREENING_V2_1.md',
  'docs/validation/VALIDATION_CORPUS.md',
  'tools/satellite_data_tools.py',
  'server.py',
  'scripts/build-static.mjs',
  'scripts/check-asset-budgets.mjs',
  'scripts/check-js-syntax.mjs',
  'scripts/check-validation-manifest.mjs',
  'scripts/check-version.mjs',
  'scripts/generate-sbom.mjs',
  'scripts/python-discovery.mjs',
  'scripts/python.mjs',
  'scripts/run-browser-tests.mjs',
  'scripts/vendor-browser-dependencies.mjs',
  'playwright.config.js',
  'index.html',
  'css/style.css',
  'js/releaseVersion.js',
  'js/trackedObjectCatalog.js',
  'js/conjunction/conjunctionPanel.js',
  'js/SatelliteMenuLoader.js',
  'js/satelliteSearchUtils.js',
  'js/serverConnection.js',
  'js/shareState.js',
  'tests/trackedObjectCatalog.test.js',
  'tests/trackedObjectCatalogBenchmark.test.js',
  'tests/trackedObjectCatalogRealManifest.test.js',
  'tests/conjunctionPanel.test.js',
  'tests/runAll.js',
  'tests/releaseStructure.test.js',
  'tests/staticArtifact.test.js',
  'tests_python/test_v23_tracked_catalog.py',
  'tests_python/test_v23_tracked_api.py',
  'tests_python/test_v231_gp_debris_scope.py',
  'tests_python/test_satellite_data_scheduler.py',
  'tests_python/test_server_data_update_scheduler.py',
  'tests_python/test_server_security.py',
  'tests_browser/satelliteFilters.spec.js',
  'json/satcat.csv',
  'json/satcat.meta.json',
  'json/gp/GP.json',
  'json/gp/GP.meta.json',
  'json/tracked/TRACKED.manifest.json',
  'json/tracked/TRACKED.meta.json',
  'obj/SSL_1300.glb',
  'data/ephemeris/README.md',
  'validation/v2.3.0/manifest.json',
  'validation/v2.3.0/manifest.sha256'
]) {
  if (!v23ArtifactPaths.has(requiredPath)) fail(`v2.3 evidence is missing material artifact ${requiredPath}`);
}

const v23JavascriptTests = fs.readdirSync(path.join(ROOT, 'tests'))
  .filter(name => name.endsWith('.test.js'))
  .sort()
  .map(name => `tests/${name}`);
const v23PythonTests = fs.readdirSync(path.join(ROOT, 'tests_python'))
  .filter(name => name.startsWith('test_') && name.endsWith('.py'))
  .sort()
  .map(name => `tests_python/${name}`);
const v23BrowserTests = fs.readdirSync(path.join(ROOT, 'tests_browser'))
  .filter(name => name.endsWith('.spec.js'))
  .sort()
  .map(name => `tests_browser/${name}`);
for (const suitePath of [...v23JavascriptTests, ...v23PythonTests, ...v23BrowserTests]) {
  if (!v23ArtifactPaths.has(suitePath)) fail(`v2.3 evidence does not hash discovered test ${suitePath}`);
}

const repositoryAttributes = read('.gitattributes').toString('utf8').split(/\r?\n/);
const satcatAttributeRules = repositoryAttributes.filter(line => /^json\/satcat\.csv(?:\s|$)/.test(line));
if (satcatAttributeRules.length !== 1 || satcatAttributeRules[0] !== 'json/satcat.csv -text -diff') {
  fail('v2.3 SATCAT evidence requires the exact `json/satcat.csv -text -diff` byte-preservation and non-diff rule');
}
if (fs.existsSync(path.join(ROOT, 'obj/loral.glb'))) {
  fail('v2.3 static/model evidence must not restore the byte-identical obj/loral.glb duplicate');
}
const canonicalSsl1300 = v23ArtifactBytes.get('obj/SSL_1300.glb');
if (canonicalSsl1300.length !== 8517244 ||
    sha256(canonicalSsl1300) !== '651b30cebf57bd08fedcfb34c31127f7a466b7897ccac2aafa8ea9908cccfcf0') {
  fail('v2.3 canonical obj/SSL_1300.glb size or checksum is invalid');
}
const canonicalSatelliteIcon = v23ArtifactBytes.get('icons/ob_satellite.png');
if (canonicalSatelliteIcon.length !== 25316 ||
    sha256(canonicalSatelliteIcon) !== '34fbdde639c3fc698146302e6881af560d15e1aaa4ea397324aa160a5c6ee08f' ||
    canonicalSatelliteIcon.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    canonicalSatelliteIcon.readUInt32BE(8) !== 13 ||
    canonicalSatelliteIcon.subarray(12, 16).toString('ascii') !== 'IHDR' ||
    canonicalSatelliteIcon.readUInt32BE(16) !== 512 || canonicalSatelliteIcon.readUInt32BE(20) !== 512 ||
    canonicalSatelliteIcon[24] !== 8 || canonicalSatelliteIcon[25] !== 6) {
  fail('v2.3.1 detailed Globe icon must remain the exact 512x512 RGBA PNG');
}

if (!Array.isArray(v23Manifest.executables) || v23Manifest.executables.length !== 13) {
  fail('v2.3 must declare source, data, API, static, browser, scale, and release executables');
}
const v23ExecutableIds = new Set();
for (const executable of v23Manifest.executables) {
  if (!executable.id || v23ExecutableIds.has(executable.id) ||
      typeof executable.command !== 'string' || executable.command.length < 5 ||
      !Array.isArray(executable.artifacts) || executable.artifacts.length === 0 ||
      executable.artifacts.some(artifact => !v23ArtifactPaths.has(artifact)) ||
      executable.status !== 'passed' || executable.exitCode !== 0) {
    fail(`v2.3 executable ${executable.id ?? '<missing>'} has invalid command, artifacts, or pass status`);
  }
  requireNonEmptyObject(executable.observed, `${executable.id}.observed`);
  v23ExecutableIds.add(executable.id);
}
for (const requiredId of [
  'tracked-browser-unit-regressions',
  'tracked-real-manifest-invariants',
  'tracked-scale-120k',
  'tracked-python-ingest-reconciliation',
  'tracked-api-security',
  'six-component-scheduler',
  'static-tracked-closure',
  'browser-filter-integration',
  'complete-javascript-suite',
  'complete-python-suite',
  'browser-playwright-suite',
  'release-policy-checks'
]) {
  if (!v23ExecutableIds.has(requiredId)) fail(`v2.3 executable evidence is missing ${requiredId}`);
}
const v23ExecutableById = new Map(v23Manifest.executables.map(executable => [executable.id, executable]));
for (const executableId of [
  'tracked-browser-unit-regressions',
  'static-tracked-closure',
  'browser-filter-integration'
]) {
  if (!v23ExecutableById.get(executableId)?.artifacts?.includes('icons/ob_satellite.png')) {
    fail(`v2.3.1 executable ${executableId} does not bind the detailed Globe icon bytes`);
  }
}
for (const [executableId, suitePaths] of [
  ['complete-javascript-suite', ['tests/runAll.js', ...v23JavascriptTests]],
  ['complete-python-suite', ['scripts/python.mjs', ...v23PythonTests]],
  ['browser-playwright-suite', ['scripts/run-browser-tests.mjs', 'playwright.config.js', ...v23BrowserTests]]
]) {
  const declaredArtifacts = new Set(v23ExecutableById.get(executableId)?.artifacts ?? []);
  if (suitePaths.some(suitePath => !declaredArtifacts.has(suitePath))) {
    fail(`v2.3 executable ${executableId} does not bind every discovered suite input`);
  }
}
if (v23ExecutableById.get('complete-javascript-suite')?.observed?.testFilesPassed !== 59 ||
    v23ExecutableById.get('complete-javascript-suite')?.observed?.testFilesFailed !== 0 ||
    v23ExecutableById.get('complete-python-suite')?.observed?.cases !== 129 ||
    v23ExecutableById.get('complete-python-suite')?.observed?.testsPassed !== 128 ||
    v23ExecutableById.get('complete-python-suite')?.observed?.testsSkipped !== 1 ||
    v23ExecutableById.get('complete-python-suite')?.observed?.testsFailed !== 0 ||
    v23ExecutableById.get('complete-python-suite')?.observed?.durationSeconds !== 32.119 ||
    v23ExecutableById.get('complete-python-suite')?.observed?.skipReason !== 'Windows directory-symlink capability unavailable' ||
    v23ExecutableById.get('browser-filter-integration')?.observed?.testsPassed !== 14 ||
    v23ExecutableById.get('browser-filter-integration')?.observed?.testsFailed !== 0 ||
    v23ExecutableById.get('browser-filter-integration')?.observed?.testsSkipped !== 0 ||
    v23ExecutableById.get('browser-filter-integration')?.observed?.project !== 'chromium' ||
    v23ExecutableById.get('tracked-scale-120k')?.observed?.records !== 120000) {
  fail('v2.3 executable observations do not match the frozen JavaScript, Python, browser, or scale results');
}
requireExactValue(
  v23ExecutableById.get('tracked-browser-unit-regressions')?.observed?.globeIconLifecycle,
  {
    detailedMaximum: 499,
    densityMinimum: 500,
    detailedPointSize: 16,
    detailedSizeAttenuation: false,
    densityPointSize: 0.025,
    densitySizeAttenuation: true,
    assetTextureReused: true,
    loadFailureFallbackSource: 'procedural-fallback',
    failedOwnedTextureDisposeCount: 1,
    fallbackTextureDisposeCount: 1,
    injectedSharedTextureDisposeCount: 0
  },
  'v2.3.1 Globe icon unit lifecycle evidence'
);
const v23GlobeIconObserved = v23ExecutableById.get('browser-filter-integration')?.observed?.globeIcon;
requireExactValue(
  v23GlobeIconObserved,
  {
    asset: 'icons/ob_satellite.png',
    sameOrigin: true,
    decodedWidth: 512,
    decodedHeight: 512,
    pngAlphaIou: 0.9939361512395221,
    pngAlphaFlippedIou: 0.4270518657192699,
    circleIou: 0.47253916070392576,
    isolatedSelectionMaskIou: 1,
    isolatedRedPixels: 15985,
    isolatedWhitePixels: 15985,
    liveWidth: 16,
    liveHeight: 16,
    liveCount: 140,
    liveOccupancy: 0.546875,
    liveSelectionMaskIou: 1,
    liveRedPixels: 104,
    liveWhitePixels: 92,
    detailedPointSize: 16,
    detailedSizeAttenuation: false,
    densityPointSize: 0.025,
    densitySizeAttenuation: true
  },
  'v2.3.1 focused Chromium Globe icon evidence'
);
if (v23GlobeIconObserved.pngAlphaIou <= v23GlobeIconObserved.pngAlphaFlippedIou ||
    v23GlobeIconObserved.pngAlphaIou <= 0.98) {
  fail('v2.3.1 detailed Globe marker must retain the direct, unflipped PNG silhouette orientation');
}
const v23TrackedPythonObserved = v23ExecutableById.get('tracked-python-ingest-reconciliation')?.observed ?? {};
const v23ApiSecurityObserved = v23ExecutableById.get('tracked-api-security')?.observed ?? {};
const v23SchedulerObserved = v23ExecutableById.get('six-component-scheduler')?.observed ?? {};
if (v23TrackedPythonObserved.cases !== 25 || v23TrackedPythonObserved.testsPassed !== 25 ||
    v23TrackedPythonObserved.trackedCatalogCases !== 16 || v23TrackedPythonObserved.gpScopeCases !== 9 ||
    v23TrackedPythonObserved.testsSkipped !== 0 || v23TrackedPythonObserved.testsFailed !== 0 ||
    v23ApiSecurityObserved.cases !== 31 || v23ApiSecurityObserved.testsPassed !== 30 ||
    v23ApiSecurityObserved.testsSkipped !== 1 || v23ApiSecurityObserved.testsFailed !== 0 ||
    v23SchedulerObserved.cases !== 22 || v23SchedulerObserved.testsPassed !== 22 ||
    v23SchedulerObserved.testsSkipped !== 0 || v23SchedulerObserved.testsFailed !== 0) {
  fail('v2.3.1 focused backend evidence does not match the frozen source, catalog, API/security, and scheduler matrices');
}
const v23ScaleObserved = v23ExecutableById.get('tracked-scale-120k')?.observed ?? {};
if (v23ScaleObserved.filteredRecords !== 24000 || v23ScaleObserved.searchMatches !== 10 ||
    v23ScaleObserved.buildMs !== 30.82 || v23ScaleObserved.filterMs !== 154.15 ||
    v23ScaleObserved.searchMs !== 51.28 || v23ScaleObserved.facetsMs !== 228.97 ||
    v23ScaleObserved.totalMs !== 465.23 || v23ScaleObserved.heapDeltaMiB !== 77.10) {
  fail('v2.3 120,000-record scale evidence does not match the authoritative frozen observation');
}
const v23StaticObserved = v23ExecutableById.get('static-tracked-closure')?.observed ?? {};
if (v23StaticObserved.files !== 135 || v23StaticObserved.bytes !== 280508022 ||
    v23StaticObserved.trackedFiles !== 13 || v23StaticObserved.trackedBytes !== 74565511 ||
    v23StaticObserved.indexBytes !== 307962 || v23StaticObserved.browserJavaScriptFiles !== 51 ||
    v23StaticObserved.browserJavaScriptBytes !== 864848) {
  fail('v2.3 static/source evidence does not match the frozen build and budget measurements');
}
const v23BrowserObserved = v23ExecutableById.get('browser-playwright-suite')?.observed ?? {};
if (v23BrowserObserved.declarations !== 47 || v23BrowserObserved.testsPassed !== 28 ||
    v23BrowserObserved.testsSkipped !== 19 || v23BrowserObserved.testsFailed !== 0 ||
    v23BrowserObserved.testsUnexpected !== 0 || v23BrowserObserved.testsFlaky !== 0 ||
    v23BrowserObserved.reportErrors !== 0 || v23BrowserObserved.attemptsPerDeclaration !== 1 ||
    v23BrowserObserved.ok !== true || v23BrowserObserved.skipWithoutReason !== 0 ||
    v23BrowserObserved.files !== 6 ||
    JSON.stringify(v23BrowserObserved.projects) !== JSON.stringify(['chromium', 'mobile-chromium']) ||
    v23BrowserObserved.durationMs !== 532467.509 || v23BrowserObserved.durationMinutes !== 8.874458483) {
  fail('v2.3 complete Playwright evidence does not match the frozen aggregate run');
}
const v23ReleaseObserved = v23ExecutableById.get('release-policy-checks')?.observed ?? {};
if (v23ReleaseObserved.syntaxFiles !== 136 || v23ReleaseObserved.auditVulnerabilities !== 0 ||
    v23ReleaseObserved.budgetsPassed !== true || v23ReleaseObserved.versionPassed !== true ||
    v23ReleaseObserved.vendorPassed !== true || v23ReleaseObserved.validationPassed !== true) {
  fail('v2.3 release-policy evidence does not match the frozen checks');
}
const v231ReleaseIdentity = JSON.parse(v23ArtifactBytes.get('release/version.json').toString('utf8'));
if (v231ReleaseIdentity.version !== '2.3.1' || v231ReleaseIdentity.channel !== 'development' ||
    v231ReleaseIdentity.publicationState !== 'development' ||
    v231ReleaseIdentity.maturity !== 'experimental' ||
    v231ReleaseIdentity.safetyClass !== 'non-operational' ||
    v231ReleaseIdentity.candidateAt !== null || v231ReleaseIdentity.releasedAt !== null) {
  fail('v2.3.1 publication approval must not change development identity, maturity, safety, or null promotion dates');
}
const v231Sbom = JSON.parse(
  v23ArtifactBytes.get('release/evidence/openbexi-node-sbom-2.3.1-development.cdx.json').toString('utf8')
);
if (v231Sbom.bomFormat !== 'CycloneDX' || v231Sbom.specVersion !== '1.5' ||
    !/^urn:uuid:[0-9a-f-]{36}$/i.test(String(v231Sbom.serialNumber ?? '')) ||
    v231Sbom.metadata?.component?.name !== 'openbexi_earth_orbit' ||
    v231Sbom.metadata?.component?.version !== '2.3.1' || v231Sbom.components?.length !== 2) {
  fail('v2.3.1 dependency SBOM identity is invalid');
}

if (!Array.isArray(v23Manifest.evidence) || v23Manifest.evidence.length !== 64) {
  fail('v2.3 must include source, data, API, static, browser, scale, and governance evidence');
}
const v23EvidenceIds = new Set();
const v23EvidenceCategories = new Set();
for (const evidence of v23Manifest.evidence) {
  if (!evidence.id || v23EvidenceIds.has(evidence.id) || !v23ArtifactPaths.has(evidence.artifact)) {
    fail(`v2.3 has invalid evidence ${evidence.id ?? '<missing>'}`);
  }
  if (!['source', 'data', 'api', 'static', 'browser', 'scale', 'governance', 'release'].includes(evidence.category)) {
    fail(`v2.3 evidence ${evidence.id} has invalid category ${evidence.category}`);
  }
  v23EvidenceIds.add(evidence.id);
  v23EvidenceCategories.add(evidence.category);
  requireNonEmptyObject(evidence.expected, `${evidence.id}.expected`);
  if (typeof evidence.locator !== 'string' || evidence.locator.length < 3 ||
      !v23ArtifactBytes.get(evidence.artifact).toString('utf8').includes(evidence.locator)) {
    fail(`${evidence.id} locator no longer matches ${evidence.artifact}`);
  }
}
for (const category of ['source', 'data', 'api', 'static', 'browser', 'scale', 'governance', 'release']) {
  if (!v23EvidenceCategories.has(category)) fail(`v2.3 evidence is missing category ${category}`);
}
for (const requiredId of [
  'source.local-tracked-builder',
  'source.no-additional-provider-fetch',
  'source.verified-lineage-before-absence',
  'source.configured-four-gp-groups',
  'source.incremental-mixed-200-304',
  'source.atomic-four-group-reconciliation',
  'source.unverified-304-rejected',
  'source.quarantine-migration-rejected',
  'source.validator-free-migration-retry',
  'source.actual-group-provenance-republish',
  'source.mismatched-gp-metadata-untrusted',
  'source.provider-503-last-known-good',
  'source.transactional-pointer-rollback',
  'data.frozen-tracked-closure',
  'data.strict-count-partitions',
  'data.current-history-debris',
  'data.zero-positioned-debris',
  'data.small-and-missing-rcs',
  'data.rcs-band-accounting',
  'data.no-physical-size-inference',
  'data.identity-lifecycle-availability',
  'data.exhaustive-unknown-facets',
  'data.gp-availability-by-type',
  'api.manifest-chunk-allowlist',
  'api.gp-byte-drift-fail-closed',
  'api.source-group-lineage-fail-closed',
  'api.manifest-metadata-count-equality',
  'api.six-component-status',
  'static.manifest-reference-closure',
  'static.source-lineage-closure',
  'static.count-availability-contract',
  'static.offline-provider-closure',
  'browser.independent-filter-dimensions',
  'browser.all-debris-facet-activation',
  'browser.inactive-facet-scope',
  'browser.tracked-object-wording',
  'browser.truthful-population-counts',
  'browser.gp-only-boundary',
  'browser.metadata-only-safety',
  'browser.authoritative-availability-demotion',
  'browser.lazy-type-history-loading',
  'browser.stale-request-generation',
  'browser.share-facet-roundtrip',
  'browser.inactive-share-facets-dropped',
  'browser.rcs-missing-invalid-bands',
  'browser.no-mass-filter',
  'browser.object-type-color-key',
  'browser.globe-499-500-transition',
  'browser.globe-detailed-red-selected',
  'browser.globe-density-red-selected',
  'browser.mercator-independent-density',
  'browser.screening-exclusion-accounting',
  'browser.screening-unknown-not-zero',
  'browser.real-debris-position-truth',
  'browser.playwright-python-discovery',
  'browser.playwright-config-python-bootstrap',
  'scale.synthetic-120k',
  'governance.provider-completeness-boundary',
  'governance.redistribution-approved',
  'governance.no-mass-boundary',
  'governance.tracked-rollback',
  'release.version-and-feature-flag',
  'release.development-only-decision',
  'release.dependency-sbom'
]) {
  if (!v23EvidenceIds.has(requiredId)) fail(`v2.3 evidence is missing ${requiredId}`);
}
const v23EvidenceById = new Map(v23Manifest.evidence.map(evidence => [evidence.id, evidence]));
requireExactValue(
  v23EvidenceById.get('static.offline-provider-closure')?.expected,
  {
    externalRequests: 0,
    iconAsset: 'icons/ob_satellite.png',
    iconBytes: 25316,
    iconSha256: '34fbdde639c3fc698146302e6881af560d15e1aaa4ea397324aa160a5c6ee08f',
    sameOrigin: true
  },
  'v2.3.1 static icon and offline-provider evidence'
);
requireExactValue(
  v23EvidenceById.get('browser.globe-499-500-transition')?.expected,
  {
    detailedMaximum: 499,
    densityMinimum: 500,
    detailedAsset: 'icons/ob_satellite.png',
    detailedPointSize: 16,
    detailedSizeAttenuation: false,
    densityTextured: false,
    densityPointSize: 0.025,
    densitySizeAttenuation: true,
    assetTextureReused: true,
    loadFailureFallbackAtDrawn: 499,
    loadFailureFallbackSource: 'procedural-fallback',
    failedOwnedTextureDisposeCount: 1,
    fallbackTextureDisposeCount: 1,
    injectedSharedTextureDisposeCount: 0
  },
  'v2.3.1 Globe 499/500 transition and fallback evidence'
);
requireExactValue(
  v23EvidenceById.get('browser.globe-detailed-red-selected')?.expected,
  {
    fixtureDrawn: 499,
    iconAsset: 'icons/ob_satellite.png',
    decodedWidth: 512,
    decodedHeight: 512,
    alphaOnlyTint: true,
    pngAlphaIouMinimum: 0.98,
    pngAlphaFlippedIouMaximum: 0.5,
    circleIouMaximum: 0.7,
    liveOccupancyMaximum: 0.7,
    selectionMaskIouMinimum: 0.9,
    orientation: 'direct-unflipped-greater-than-flipped',
    debris: '#ff3b30',
    selected: '#ffffff'
  },
  'v2.3.1 detailed Globe artwork and selection evidence'
);
requireExactValue(
  v23EvidenceById.get('governance.redistribution-approved')?.expected,
  {
    redistributionApproved: true,
    owner: 'arcazj',
    reviewer: 'arcazj (repository/data-release owner)',
    approvalDate: '2026-08-30',
    approvedAt: '2026-08-31T01:55:18Z',
    channelId: 'github-origin-master-and-repository-root-pages',
    branch: 'origin/master',
    repository: 'arcazj/openbexi_earth_orbit',
    pagesSource: 'repository-root',
    pagesUrl: 'https://arcazj.github.io/openbexi_earth_orbit/',
    publicationLimit: 1,
    warnedManifestSha256: '14185ed9ef5969eb50dfffc162ea3a3495fad75a4008575569e865a94c6269d2',
    rollbackRehearsalPending: true,
    futureBytesApproved: false,
    differentChannelsApproved: false
  },
  'v2.3.1 approved redistribution evidence'
);
requireExactValue(
  v23EvidenceById.get('governance.tracked-rollback')?.expected,
  {
    rehearsalPending: true,
    scopedPublicationWaiver: true,
    publicationLimit: 1
  },
  'v2.3.1 rollback and scoped publication-waiver evidence'
);
requireExactValue(
  v23EvidenceById.get('release.development-only-decision')?.expected,
  {
    candidate: false,
    stable: false,
    operational: false,
    developmentPublicationAuthorized: true,
    publicationLimit: 1,
    independentReviewPending: true
  },
  'v2.3.1 development publication decision evidence'
);

const trackedEvidence = v23Manifest.trackedSnapshot ?? {};
const trackedManifestPath = trackedEvidence.manifestPath;
const trackedMetadataPath = trackedEvidence.metadataPath;
if (trackedManifestPath !== 'json/tracked/TRACKED.manifest.json' ||
    trackedMetadataPath !== 'json/tracked/TRACKED.meta.json') {
  fail('v2.3 tracked snapshot must identify the canonical manifest and metadata paths');
}
const trackedManifest = JSON.parse(v23ArtifactBytes.get(trackedManifestPath).toString('utf8'));
const trackedMetadata = JSON.parse(v23ArtifactBytes.get(trackedMetadataPath).toString('utf8'));
const satcatMetadata = JSON.parse(v23ArtifactBytes.get('json/satcat.meta.json').toString('utf8'));
const gpMetadata = JSON.parse(v23ArtifactBytes.get('json/gp/GP.meta.json').toString('utf8'));
const frozenTrackedRevision = 'sha256:7c1a20d93d1eb5faf7e2b964b13c7b4f0478f2eec95cc701ea1b1e57ef0d730c';
if (trackedManifest.schema_version !== '2.3.0' || trackedManifest.catalog_kind !== 'provider_tracked_objects' ||
    trackedEvidence.catalogRevision !== frozenTrackedRevision ||
    trackedManifest.catalog_revision !== trackedEvidence.catalogRevision ||
    trackedMetadata.catalog_revision !== trackedEvidence.catalogRevision ||
    trackedMetadata.source_status !== 'VERIFIED_SNAPSHOT') {
  fail('v2.3 tracked snapshot identity or verified local status is invalid');
}
if (sha256(v23ArtifactBytes.get(trackedManifestPath)) !== '0fdbcb7b23dfa4715d5953f69ce412017508b0f21231013e3ae951bd5c6ba586' ||
    sha256(v23ArtifactBytes.get(trackedMetadataPath)) !== '5324bd0d9aa1d6f7c619e8b291d9b9b422661a4a26d7480867da5e92c560036b' ||
    `sha256:${sha256(v23ArtifactBytes.get('json/gp/GP.json'))}` !== gpMetadata.catalog_revision ||
    `sha256:${sha256(v23ArtifactBytes.get('json/satcat.csv'))}` !== satcatMetadata.catalog_revision) {
  fail('v2.3.1 frozen tracked, GP, or SATCAT source bytes changed');
}
if (trackedManifest.provenance?.satcat_revision !== satcatMetadata.catalog_revision ||
    trackedMetadata.source_satcat_revision !== satcatMetadata.catalog_revision ||
    satcatMetadata.dataset_hash !== satcatMetadata.catalog_revision ||
    trackedManifest.provenance?.gp_revision !== gpMetadata.catalog_revision ||
    trackedMetadata.source_gp_revision !== gpMetadata.catalog_revision ||
    gpMetadata.dataset_hash !== gpMetadata.catalog_revision ||
    trackedManifest.coverage_revision !== trackedMetadata.coverage_revision ||
    trackedMetadata.dataset_hash !== frozenTrackedRevision ||
    JSON.stringify(trackedManifest.provenance?.gp_source_groups) !== JSON.stringify(['active']) ||
    JSON.stringify(trackedMetadata.source_gp_groups) !== JSON.stringify(['active']) ||
    JSON.stringify(gpMetadata.catalog_source_groups) !== JSON.stringify(['active'])) {
  fail('v2.3 tracked source lineage must bind the exact SATCAT and configured active GP revisions');
}
const configuredGpSourceGroups = [
  'active',
  'fengyun-1c-debris',
  'iridium-33-debris',
  'cosmos-2251-debris'
];
if (JSON.stringify(gpMetadata.source_groups) !== JSON.stringify(configuredGpSourceGroups) ||
    gpMetadata.source_scope_verified !== false || gpMetadata.source_scope?.all_debris !== false ||
    gpMetadata.last_status !== 'failed' || gpMetadata.source_status !== 'DEGRADED' ||
    !String(gpMetadata.last_error ?? '').includes('HTTP 503') || gpMetadata.counts?.total !== 16470) {
  fail('v2.3.1 GP evidence must preserve the failed four-group attempt and accepted active-only last-known-good scope');
}
if (!Array.isArray(v23Manifest.sources) || v23Manifest.sources.length !== 2) {
  fail('v2.3 evidence must record the configured SATCAT and active GP source/license boundaries');
}
const v23Sources = new Map(v23Manifest.sources.map(source => [source.id, source]));
for (const [id, expected] of new Map([
  ['celestrak-satcat-bundled', {
    artifact: 'json/satcat.csv',
    metadataArtifact: 'json/satcat.meta.json',
    revision: satcatMetadata.catalog_revision,
    scope: 'configured-bundled-satcat-snapshot'
  }],
  ['celestrak-active-gp-bundled', {
    artifact: 'json/gp/GP.json',
    metadataArtifact: 'json/gp/GP.meta.json',
    revision: gpMetadata.catalog_revision,
    scope: 'configured-active-gp-snapshot'
  }]
])) {
  const source = v23Sources.get(id);
  if (!source || source.provider !== 'CelesTrak' || source.artifact !== expected.artifact ||
      source.metadataArtifact !== expected.metadataArtifact || source.revision !== expected.revision ||
      source.scope !== expected.scope || !v23ArtifactPaths.has(source.artifact) ||
      !v23ArtifactPaths.has(source.metadataArtifact) ||
      typeof source.url !== 'string' || !source.url.startsWith('https://') ||
      source.license?.spdx !== 'NOASSERTION' ||
      source.license?.sourceBytesApproval !== 'v2.2.1-exact-bytes-approved' ||
      source.license?.derivedProductRedistributionStatus !==
        'v2.3.1-derived-bytes-approved-one-publication-github-origin-master-and-repository-root-pages') {
    fail(`v2.3 source boundary ${id} is missing or inconsistent`);
  }
}
if (trackedManifest.provider_completeness_claim !== false ||
    trackedManifest.coverage?.provider_completeness_claim !== false ||
    trackedMetadata.provider_completeness_claim !== false ||
    trackedMetadata.coverage?.provider_completeness_claim !== false ||
    trackedManifest.counts?.expected_provider_records !== null ||
    trackedManifest.coverage?.expected_provider_records !== null ||
    trackedMetadata.counts?.expected_provider_records !== null ||
    trackedMetadata.coverage?.expected_provider_records !== null) {
  fail('v2.3 tracked snapshot must not claim provider completeness or invent an expected provider count');
}
if (trackedManifest.coverage?.invariant_holds !== true ||
    trackedManifest.invariants?.provider_coverage_holds !== true ||
    trackedManifest.invariants?.catalog_partition_holds !== true ||
    trackedManifest.invariants?.current_chunk_count_holds !== true ||
    trackedManifest.invariants?.history_chunk_count_holds !== true) {
  fail('v2.3 tracked snapshot accounting invariants are not all true');
}

const expectedTrackedCounts = trackedEvidence.counts ?? {};
for (const [key, expected] of Object.entries({
  total: 70474,
  current: 34960,
  historical: 35514,
  history_total: 35514,
  absent: 0,
  propagatable: 16470,
  metadata_only: 54004,
  current_propagatable: 16470,
  current_metadata_only: 18490,
  quarantined: 0,
  duplicates: 0,
  debris_small_rcs_current: 7852,
  debris_missing_rcs_current: 3123
})) {
  if (expectedTrackedCounts[key] !== expected || trackedManifest.counts?.[key] !== expected ||
      trackedMetadata.counts?.[key] !== expected) {
    fail(`v2.3 tracked snapshot count ${key} must remain ${expected}`);
  }
}
for (const counts of [trackedManifest.counts, trackedMetadata.counts]) {
  if (counts?.expected !== 70474 || counts?.received !== 70474 || counts?.accepted !== 70474 ||
      counts?.total !== 70474) {
    fail('v2.3 tracked manifest and metadata must pin expected, received, accepted, and total to 70,474');
  }
}
for (const coverage of [trackedManifest.coverage, trackedMetadata.coverage]) {
  if (coverage?.expected !== 70474 || coverage?.received !== 70474 || coverage?.accepted !== 70474 ||
      coverage?.quarantined !== 0 || coverage?.duplicates !== 0 || coverage?.invariant_holds !== true) {
    fail('v2.3 tracked manifest and metadata coverage accounting must pin the frozen accepted population');
  }
}
const expectedCurrentTypes = {
  PAYLOAD: 19989,
  DEBRIS: 12490,
  ROCKET_BODY: 2425,
  MISSION_RELATED: 0,
  UNKNOWN: 56
};
for (const [type, expected] of Object.entries(expectedCurrentTypes)) {
  if (trackedManifest.counts?.current_object_types?.[type] !== expected ||
      trackedMetadata.counts?.current_object_types?.[type] !== expected ||
      expectedTrackedCounts.current_object_types?.[type] !== expected) {
    fail(`v2.3 tracked snapshot current type ${type} must remain ${expected}`);
  }
}
for (const [type, expected] of Object.entries({
  PAYLOAD: 27584,
  DEBRIS: 35838,
  ROCKET_BODY: 6887,
  MISSION_RELATED: 0,
  UNKNOWN: 165
})) {
  if (trackedManifest.counts?.object_types?.[type] !== expected ||
      trackedMetadata.counts?.object_types?.[type] !== expected ||
      expectedTrackedCounts.object_types?.[type] !== expected) {
    fail(`v2.3 tracked snapshot total type ${type} must remain ${expected}`);
  }
}
const strictTrackedCountKeys = [
  'current', 'historical', 'absent', 'history_total', 'total',
  'propagatable', 'metadata_only', 'current_propagatable', 'current_metadata_only'
];
if (strictTrackedCountKeys.some(key => trackedManifest.counts[key] !== trackedMetadata.counts[key]) ||
    trackedManifest.counts.received !==
      trackedManifest.counts.accepted + trackedManifest.counts.quarantined + trackedManifest.counts.duplicates ||
    trackedManifest.counts.total !== trackedManifest.counts.current + trackedManifest.counts.history_total ||
    trackedManifest.counts.historical > trackedManifest.counts.history_total ||
    trackedManifest.counts.absent > trackedManifest.counts.history_total ||
    trackedManifest.counts.total !== trackedManifest.counts.propagatable + trackedManifest.counts.metadata_only ||
    trackedManifest.counts.current !==
      trackedManifest.counts.current_propagatable + trackedManifest.counts.current_metadata_only) {
  fail('v2.3 tracked snapshot count partitions do not reconcile');
}

const currentDescriptors = Array.isArray(trackedManifest.chunks) ? trackedManifest.chunks : [];
const historyDescriptors = Array.isArray(trackedManifest.history_chunks) ? trackedManifest.history_chunks : [];
const quarantineDescriptor = trackedManifest.quarantine;
if (currentDescriptors.length !== 5 || historyDescriptors.length !== 5 ||
    !quarantineDescriptor || typeof quarantineDescriptor !== 'object') {
  fail('v2.3 tracked snapshot must publish five current, five history, and one quarantine chunk');
}
const descriptorGroups = [
  ...currentDescriptors.map(descriptor => ({ descriptor, scope: 'CURRENT' })),
  ...historyDescriptors.map(descriptor => ({ descriptor, scope: 'HISTORICAL' })),
  { descriptor: quarantineDescriptor, scope: 'QUARANTINE' }
];
const expectedDescriptorTypes = new Map([
  ['current-payload', ['CURRENT', 'PAYLOAD']],
  ['current-debris', ['CURRENT', 'DEBRIS']],
  ['current-rocket-body', ['CURRENT', 'ROCKET_BODY']],
  ['current-mission-related', ['CURRENT', 'MISSION_RELATED']],
  ['current-unknown', ['CURRENT', 'UNKNOWN']],
  ['historical-payload', ['HISTORICAL', 'PAYLOAD']],
  ['historical-debris', ['HISTORICAL', 'DEBRIS']],
  ['historical-rocket-body', ['HISTORICAL', 'ROCKET_BODY']],
  ['historical-mission-related', ['HISTORICAL', 'MISSION_RELATED']],
  ['historical-unknown', ['HISTORICAL', 'UNKNOWN']]
]);
const seenDescriptorIds = new Set();
const seenDescriptorPaths = new Set();
const seenTrackedIds = new Set();
let currentRecordCount = 0;
let historicalRecordCount = 0;
let decayDatedHistoricalRecordCount = 0;
let absentHistoricalRecordCount = 0;
let propagatableRecordCount = 0;
let metadataOnlyRecordCount = 0;
let currentPropagatableRecordCount = 0;
let currentMetadataOnlyRecordCount = 0;
let currentSmallDebrisCount = 0;
let currentMissingDebrisCount = 0;
let currentDebrisRecordCount = 0;
let historicalDebrisRecordCount = 0;
let metadataOnlyDebrisRecordCount = 0;
let positionedDebrisRecordCount = 0;
const currentTypeCounts = Object.fromEntries(Object.keys(expectedCurrentTypes).map(type => [type, 0]));
const expectedAllTypes = {
  PAYLOAD: 27584,
  DEBRIS: 35838,
  ROCKET_BODY: 6887,
  MISSION_RELATED: 0,
  UNKNOWN: 165
};
const allTypeCounts = Object.fromEntries(Object.keys(expectedAllTypes).map(type => [type, 0]));
const propagatableTypeCounts = Object.fromEntries(Object.keys(expectedAllTypes).map(type => [type, 0]));
const emptyRcsBands = () => ({
  LT_0_01: 0,
  FROM_0_01_TO_0_1: 0,
  FROM_0_1_TO_1: 0,
  GTE_1: 0,
  UNKNOWN: 0
});
const currentDebrisRcsBands = emptyRcsBands();
const allDebrisRcsBands = emptyRcsBands();
function incrementRcsBand(bands, value) {
  if (!Number.isFinite(value) || value < 0) bands.UNKNOWN += 1;
  else if (value < 0.01) bands.LT_0_01 += 1;
  else if (value < 0.1) bands.FROM_0_01_TO_0_1 += 1;
  else if (value < 1) bands.FROM_0_1_TO_1 += 1;
  else bands.GTE_1 += 1;
}
let trackedClosureBytes = v23ArtifactBytes.get(trackedManifestPath).length +
  v23ArtifactBytes.get(trackedMetadataPath).length;
let maxTrackedChunkBytes = 0;
for (const { descriptor, scope } of descriptorGroups) {
  const relativePath = String(descriptor.path ?? '');
  const pathMatch = relativePath.match(/^json\/tracked\/chunks\/([a-f0-9]{64})-[a-z0-9-]+\.json$/);
  if (!pathMatch || seenDescriptorPaths.has(relativePath) ||
      !v23ArtifactPaths.has(relativePath)) {
    fail(`v2.3 tracked descriptor has an invalid or unhashed path ${relativePath}`);
  }
  seenDescriptorPaths.add(relativePath);
  if (scope === 'QUARANTINE') {
    if (descriptor.id !== undefined || descriptor.scope !== undefined || descriptor.object_type !== undefined) {
      fail('v2.3 quarantine descriptor must not masquerade as a current/history object-type chunk');
    }
  } else {
    const descriptorId = String(descriptor.id ?? '');
    const expectedDescriptor = expectedDescriptorTypes.get(descriptorId);
    if (!expectedDescriptor || seenDescriptorIds.has(descriptorId) || descriptor.scope !== scope ||
        descriptor.object_type !== expectedDescriptor[1] || expectedDescriptor[0] !== scope) {
      fail(`v2.3 tracked descriptor ${descriptorId || '<missing>'} has invalid identity, scope, or type`);
    }
    seenDescriptorIds.add(descriptorId);
  }
  const bytes = v23ArtifactBytes.get(relativePath);
  trackedClosureBytes += bytes.length;
  maxTrackedChunkBytes = Math.max(maxTrackedChunkBytes, bytes.length);
  const contentDigest = sha256(bytes);
  if (pathMatch[1] !== contentDigest || descriptor.bytes !== bytes.length ||
      descriptor.sha256 !== `sha256:${contentDigest}`) {
    fail(`v2.3 tracked descriptor byte/hash mismatch for ${relativePath}`);
  }
  const payload = JSON.parse(bytes.toString('utf8'));
  if (payload.schema_version !== '2.3.0' || !Array.isArray(payload.records) ||
      payload.records.length !== descriptor.count) {
    fail(`v2.3 tracked descriptor record-count mismatch for ${relativePath}`);
  }
  if (scope !== 'QUARANTINE' &&
      (payload.scope !== scope || payload.object_type !== descriptor.object_type)) {
    fail(`v2.3 tracked descriptor payload type/scope mismatch for ${relativePath}`);
  }
  for (const record of payload.records) {
    const noradId = String(record?.norad_id ?? '');
    if (!/^[1-9][0-9]*$/.test(noradId) || seenTrackedIds.has(noradId)) {
      fail(`v2.3 tracked snapshot has an invalid or duplicate NORAD identity ${noradId}`);
    }
    seenTrackedIds.add(noradId);
    if (scope !== 'QUARANTINE' && record.object_type !== descriptor.object_type) {
      fail(`v2.3 tracked record ${noradId} does not match descriptor object type`);
    }
    if (scope !== 'QUARANTINE') {
      const belongsInHistory = record.catalog_membership_status !== 'PRESENT' || Boolean(record.decay_date);
      if ((scope === 'HISTORICAL') !== belongsInHistory) {
        fail(`v2.3 tracked record ${noradId} does not match current/history membership semantics`);
      }
    }
    if (record.physical_size_estimate !== null || record.rcs_size !== null ||
        ['mass', 'mass_kg', 'weight', 'weight_kg', 'diameter', 'diameter_m'].some(key =>
          record[key] !== undefined && record[key] !== null)) {
      fail(`v2.3 tracked record ${noradId} inferred physical size from RCS`);
    }
    if ((record.rcs_m2 === null && record.rcs_status !== 'MISSING') ||
        (record.rcs_m2 !== null &&
          (!Number.isFinite(record.rcs_m2) || record.rcs_m2 < 0 || record.rcs_status !== 'PUBLISHED'))) {
      fail(`v2.3 tracked record ${noradId} has invalid RCS value/status semantics`);
    }
    if (scope === 'CURRENT') {
      currentRecordCount += 1;
      if (!(record.object_type in currentTypeCounts)) fail(`v2.3 current record has unknown type ${record.object_type}`);
      currentTypeCounts[record.object_type] += 1;
      if (record.metadata_only === true) currentMetadataOnlyRecordCount += 1;
      if (record.object_type === 'DEBRIS') {
        currentDebrisRecordCount += 1;
        incrementRcsBand(currentDebrisRcsBands, record.rcs_m2);
        if (record.rcs_m2 === null) currentMissingDebrisCount += 1;
        if (Number.isFinite(record.rcs_m2) && record.rcs_m2 < 0.1) currentSmallDebrisCount += 1;
      }
    } else if (scope === 'HISTORICAL') {
      historicalRecordCount += 1;
      if (record.decay_date) decayDatedHistoricalRecordCount += 1;
      if (record.catalog_membership_status === 'ABSENT') absentHistoricalRecordCount += 1;
      if (record.object_type === 'DEBRIS') historicalDebrisRecordCount += 1;
    }
    if (scope !== 'QUARANTINE') {
      if (!(record.object_type in allTypeCounts)) fail(`v2.3 record has unknown type ${record.object_type}`);
      allTypeCounts[record.object_type] += 1;
      if (record.object_type === 'DEBRIS') incrementRcsBand(allDebrisRcsBands, record.rcs_m2);
    }
    if (record.has_current_elements === true && record.orbit_available === true &&
        record.metadata_only === false && record.propagation_status === 'CURRENT_ELEMENTS' &&
        record.element_availability_status === 'CURRENT_ELEMENTS' &&
        record.element_reference?.catalog === 'json/gp/GP.json' &&
        String(record.element_reference?.norad_id ?? '') === noradId) {
      propagatableRecordCount += 1;
      propagatableTypeCounts[record.object_type] += 1;
      if (scope === 'CURRENT') currentPropagatableRecordCount += 1;
      if (record.object_type === 'DEBRIS') positionedDebrisRecordCount += 1;
    } else if (record.has_current_elements === false && record.orbit_available === false &&
               record.metadata_only === true && record.propagation_status === 'NO_CURRENT_ELEMENTS' &&
               record.element_availability_status === 'NO_CURRENT_ELEMENTS' &&
               record.element_reference === undefined) {
      metadataOnlyRecordCount += 1;
      if (record.object_type === 'DEBRIS') metadataOnlyDebrisRecordCount += 1;
    } else {
      fail(`v2.3 tracked record ${noradId} has inconsistent propagation availability`);
    }
  }
}
if (seenTrackedIds.size !== 70474 || currentRecordCount !== 34960 || historicalRecordCount !== 35514 ||
    decayDatedHistoricalRecordCount !== 35514 || absentHistoricalRecordCount !== 0 ||
    propagatableRecordCount !== 16470 || metadataOnlyRecordCount !== 54004 ||
    currentPropagatableRecordCount !== 16470 || currentMetadataOnlyRecordCount !== 18490 ||
    currentDebrisRecordCount !== 12490 || historicalDebrisRecordCount !== 23348 ||
    positionedDebrisRecordCount !== 0 || metadataOnlyDebrisRecordCount !== 35838 ||
    currentSmallDebrisCount !== 7852 ||
    currentMissingDebrisCount !== 3123 ||
    Object.entries(expectedCurrentTypes).some(([type, count]) => currentTypeCounts[type] !== count) ||
    Object.entries(expectedAllTypes).some(([type, count]) => allTypeCounts[type] !== count) ||
    Object.entries({ PAYLOAD: 16468, DEBRIS: 0, ROCKET_BODY: 2, MISSION_RELATED: 0, UNKNOWN: 0 })
      .some(([type, count]) => propagatableTypeCounts[type] !== count) ||
    JSON.stringify(currentDebrisRcsBands) !== JSON.stringify({
      LT_0_01: 2230,
      FROM_0_01_TO_0_1: 5622,
      FROM_0_1_TO_1: 1272,
      GTE_1: 243,
      UNKNOWN: 3123
    }) ||
    JSON.stringify(allDebrisRcsBands) !== JSON.stringify({
      LT_0_01: 5091,
      FROM_0_01_TO_0_1: 12808,
      FROM_0_1_TO_1: 4225,
      GTE_1: 1259,
      UNKNOWN: 12455
    })) {
  fail('v2.3 tracked chunk contents do not match the frozen snapshot accounting');
}
if (seenDescriptorIds.size !== expectedDescriptorTypes.size ||
    trackedEvidence.fileCount !== 13 || trackedEvidence.closureBytes !== 74565511 ||
    trackedEvidence.maxChunkBytes !== 24215754 || descriptorGroups.length + 2 !== trackedEvidence.fileCount ||
    trackedClosureBytes !== trackedEvidence.closureBytes || maxTrackedChunkBytes !== trackedEvidence.maxChunkBytes) {
  fail('v2.3 tracked closure file, aggregate-byte, or maximum-chunk evidence is invalid');
}

const requiredV23GapIds = [
  'independent-review-pending',
  'provider-completeness-not-claimed',
  'named-hardware-scale-pending',
  'rollback-rehearsal-pending'
];
requireExactValue(v23Manifest.knownGapIds, requiredV23GapIds, 'v2.3.1 known-gap IDs');
requireExactValue(
  v23Manifest.knownGaps,
  [
    'Independent scientific and security reviewer approval is pending.',
    'Provider-universe and physical-debris completeness are not claimed.',
    'Repeated named-hardware desktop/mobile and projected-scale performance evidence remains pending.',
    'A production-like rollback and restore rehearsal remains pending; a scoped owner waiver permits only the approved one-time origin/master and repository-root GitHub Pages publication.'
  ],
  'v2.3.1 known-gap statements'
);

console.log(
  `Validation evidence passed: ${v23Manifest.corpusVersion}, ${v23EvidenceIds.size} evidence records, ` +
  `${v23Manifest.artifacts.length} strict hashes, ${seenTrackedIds.size} tracked identities, ` +
  `review ${v23Manifest.review.status}, redistribution ${v23Manifest.redistribution.status}`
);
