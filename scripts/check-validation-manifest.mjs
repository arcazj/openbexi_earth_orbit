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

const v22ManifestPath = 'validation/v2.2.0/manifest.json';
const v22DigestPath = 'validation/v2.2.0/manifest.sha256';
const v22ManifestBytes = read(v22ManifestPath);
const v22Manifest = JSON.parse(v22ManifestBytes.toString('utf8'));
const v22Sidecar = read(v22DigestPath).toString('utf8').trim();
const v22SidecarMatch = v22Sidecar.match(/^([a-f0-9]{64})  manifest\.json$/);
if (!v22SidecarMatch || v22SidecarMatch[1] !== sha256(v22ManifestBytes)) {
  fail('v2.2 development manifest does not match its sidecar digest');
}
if (v22Manifest.schemaVersion !== 1 || v22Manifest.corpusVersion !== '2.2.0-development' ||
    v22Manifest.releaseVersion !== '2.2.0' || v22Manifest.publicationState !== 'development') {
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

if (!Array.isArray(v22Manifest.artifacts) || v22Manifest.artifacts.length < 115) {
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
  const actual = sha256(read(artifact.path));
  if (actual !== artifact.sha256) {
    fail(`${artifact.path} drifted from v2.2 evidence: expected ${artifact.sha256}, found ${actual}`);
  }
}
for (const requiredPath of [
  '.github/workflows/ci.yml',
  '.github/dependabot.yml',
  '.nvmrc',
  'package.json',
  'package-lock.json',
  'release/version.json',
  'release/feature-flags.json',
  'release/static-artifact.json',
  'release/asset-budgets.json',
  'release/evidence/openbexi-node-sbom-2.2.0-development.cdx.json',
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
  'scripts/run-full-catalog-screening.mjs',
  'scripts/check-validation-manifest.mjs',
  'scripts/check-asset-budgets.mjs',
  'scripts/check-js-syntax.mjs',
  'scripts/check-version.mjs',
  'scripts/generate-sbom.mjs',
  'scripts/sync-version.mjs',
  'scripts/vendor-browser-dependencies.mjs',
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
  'json/satcat.csv',
  'json/satcat.meta.json',
  'data/ephemeris/solar_system_jpl_horizons_2020_2035_6h.json',
  'data/ephemeris/solar_system_jpl_horizons_reference_samples.json',
  'obj/SSL_1300.glb'
]) {
  if (!v22ArtifactPaths.has(requiredPath)) fail(`v2.2 evidence is missing material artifact ${requiredPath}`);
}
if (fs.existsSync(path.join(ROOT, 'obj/loral.glb'))) {
  fail('v2.2 static/model evidence must not restore the byte-identical obj/loral.glb duplicate');
}
const canonicalSsl1300 = read('obj/SSL_1300.glb');
if (canonicalSsl1300.length !== 8517244 ||
    sha256(canonicalSsl1300) !== '651b30cebf57bd08fedcfb34c31127f7a466b7897ccac2aafa8ea9908cccfcf0') {
  fail('v2.2 canonical obj/SSL_1300.glb size or checksum is invalid');
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

if (!Array.isArray(v22Manifest.evidence) || v22Manifest.evidence.length < 34) {
  fail('v2.2 must include OMM ingest, mixed-loader, timeline, API, and static evidence');
}
const v22EvidenceIds = new Set();
for (const evidence of v22Manifest.evidence) {
  if (!evidence.id || v22EvidenceIds.has(evidence.id) || !v22ArtifactPaths.has(evidence.artifact)) {
    fail(`v2.2 has invalid evidence ${evidence.id ?? '<missing>'}`);
  }
  v22EvidenceIds.add(evidence.id);
  requireNonEmptyObject(evidence.expected, `${evidence.id}.expected`);
  if (evidence.locator && !read(evidence.artifact).toString('utf8').includes(evidence.locator)) {
    fail(`${evidence.id} locator no longer matches ${evidence.artifact}`);
  }
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
  'static.browser-state-runtime-closure',
  'tooling.browser-server-ownership'
]) {
  if (!v22EvidenceIds.has(requiredId)) fail(`v2.2 evidence is missing ${requiredId}`);
}
if (!v22Manifest.knownGaps?.some(gap => /independent scientific reviewer approval is pending/i.test(gap)) ||
    !v22Manifest.knownGaps?.some(gap => /redistribution approval is pending/i.test(gap)) ||
    !v22Manifest.knownGaps?.some(gap => /fallback-tle state reports packaged-file availability only/i.test(gap)) ||
    !v22Manifest.knownGaps?.some(gap => /strict fixed-column, checksum, adapter, and propagation validation remains a runner boundary/i.test(gap))) {
  fail('v2.2 evidence must retain independent-review, redistribution, and fallback-validation gaps');
}

console.log(
  `Validation evidence passed: ${v22Manifest.corpusVersion}, ${v22EvidenceIds.size} evidence records, ` +
  `${v22Manifest.artifacts.length} hashed artifacts, review ${v22Manifest.review.status}`
);
