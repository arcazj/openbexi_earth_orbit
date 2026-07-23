import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPOSITORY_ROOT = path.resolve('.');
const RUNNER = path.join(REPOSITORY_ROOT, 'scripts', 'run-full-catalog-screening.mjs');
const START_TIME = '2026-07-20T12:00:00.000Z';

const CATALOG = Object.freeze([
  {
    satellite_name: 'STARLINK-1008',
    norad_id: '44714',
    object_type: 'PAYLOAD',
    lifecycle_status: 'ACTIVE',
    orbit_class: 'LEO',
    tle_line1: '1 44714U 19074B   26201.40664019  .00040799  00000+0  62345-3 0  9993',
    tle_line2: '2 44714  53.1496 269.1769 0005106 339.4652  20.6153 15.54017911369373'
  },
  {
    satellite_name: 'STARLINK-1012',
    norad_id: '44718',
    object_type: 'PAYLOAD',
    lifecycle_status: 'ACTIVE',
    orbit_class: 'LEO',
    tle_line1: '1 44718U 19074F   26201.65229082  .00040882  00000+0  61453-3 0  9993',
    tle_line2: '2 44718  53.1534 268.1921 0005811 345.4828  14.6016 15.54464927369402'
  },
  {
    satellite_name: 'STARLINK-1017',
    norad_id: '44723',
    object_type: 'PAYLOAD',
    lifecycle_status: 'ACTIVE',
    orbit_class: 'LEO',
    tle_line1: '1 44723U 19074L   26201.38027259  .00017309  00000+0  52089-3 0  9994',
    tle_line2: '2 44723  53.0456 274.1065 0001298  76.0391 284.0754 15.34479410369271'
  }
]);

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function request(revisionId, options = {}) {
  return {
    schema_version: '2.1.0',
    catalog_revision_id: revisionId,
    catalog_scope: {
      object_types: ['PAYLOAD'],
      lifecycle_statuses: options.lifecycleStatuses ?? ['ACTIVE'],
      object_ids: options.objectIds ?? ['obx:norad:44714', 'obx:norad:44718']
    },
    configuration: {
      start_time: options.startTime ?? START_TIME,
      horizon_seconds: 60,
      coarse_step_seconds: 10,
      screening_radius_km: 10,
      refinement_tolerance_seconds: 1,
      refinement_subdivisions: 4,
      max_refinement_iterations: 16,
      max_relative_acceleration_km_s2: 0.024516625,
      coarse_padding_km: 0,
      spatial_cell_km: 250,
      max_cells_per_object: 64,
      max_pair_checks: 12_345,
      max_candidates: 123,
      max_persisted_candidates: 100,
      max_results: 10,
      yield_every_operations: 100,
      timeout_seconds: 10,
      max_attempts: 1
    }
  };
}

function createFixture(base, name = 'job-runner-test', options = {}) {
  const runtimeRoot = path.join(base, 'runtime');
  const catalog = options.catalog ?? CATALOG;
  const catalogBytes = Buffer.from(JSON.stringify(catalog), 'utf8');
  const datasetHash = sha256(catalogBytes);
  const digest = datasetHash.slice('sha256:'.length);
  const revisionId = `catalog:sha256:${digest}`;
  const catalogRelative = `catalogs/${digest}/catalog.json`;
  const inputRelative = `jobs/${name}/input.json`;
  const outputRelative = `jobs/${name}/result.json`;
  const catalogPath = path.join(runtimeRoot, ...catalogRelative.split('/'));
  const inputPath = path.join(runtimeRoot, ...inputRelative.split('/'));
  mkdirSync(path.dirname(catalogPath), { recursive: true });
  mkdirSync(path.dirname(inputPath), { recursive: true });
  writeFileSync(catalogPath, catalogBytes);
  const envelope = {
    schema_version: '2.1.0',
    job_id: name,
    catalog_revision: {
      revision_id: revisionId,
      snapshot_path: catalogRelative,
      source_format: options.sourceFormat ?? 'TLE_JSON',
      source_id: 'runner-test-source',
      provider: 'OpenBEXI runner fixture',
      dataset_id: `dataset:runner-test:${digest.slice(0, 16)}`,
      dataset_hash: datasetHash,
      source_status: 'COMPLETE',
      retrieved_at: '2026-07-20T11:00:00.000Z',
      source_uri: null,
      license_id: 'test-only',
      object_count: catalog.length
    },
    request: request(revisionId, options)
  };
  writeFileSync(inputPath, `${JSON.stringify(envelope)}\n`, 'utf8');
  return {
    runtimeRoot,
    catalogPath,
    catalogBytes,
    inputPath,
    inputRelative,
    outputRelative,
    outputPath: path.join(runtimeRoot, ...outputRelative.split('/')),
    envelope
  };
}

function runRunner(fixture, overrides = {}) {
  return spawnSync(process.execPath, [
    RUNNER,
    '--input', overrides.input ?? fixture.inputRelative,
    '--output', overrides.output ?? fixture.outputRelative,
    '--runtime-root', overrides.runtimeRoot ?? fixture.runtimeRoot
  ], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true
  });
}

function messages(result) {
  return result.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

const temporary = mkdtempSync(path.join(tmpdir(), 'openbexi-full-runner-'));
try {
  const successFixture = createFixture(path.join(temporary, 'success'));
  const success = runRunner(successFixture);
  assert.equal(success.status, 0, success.stderr || success.stdout);
  assert.equal(success.stderr, '');
  const successMessages = messages(success);
  assert(successMessages.length > 4);
  assert(successMessages.slice(0, -1).every(message => message.type === 'progress'));
  assert.equal(successMessages.at(-1).type, 'result');
  assert.equal(successMessages.at(-1).job_id, 'job-runner-test');
  assert.equal(successMessages.at(-1).output_path, successFixture.outputRelative);
  const progress = successMessages.filter(message => message.type === 'progress');
  assert.deepEqual(progress.map(message => message.sequence), progress.map((_, index) => index + 1));
  for (let index = 1; index < progress.length; index += 1) {
    assert(
      progress[index].progress.fraction >= progress[index - 1].progress.fraction,
      'persisted progress fractions must be monotonic'
    );
  }

  const resultBytes = readFileSync(successFixture.outputPath);
  const artifact = JSON.parse(resultBytes.toString('utf8'));
  assert.equal(successMessages.at(-1).result_sha256, sha256(resultBytes));
  assert.equal(successMessages.at(-1).byte_length, resultBytes.length);
  assert.equal(artifact.request_id, 'job-runner-test');
  assert.equal(artifact.catalog_revision_id, successFixture.envelope.catalog_revision.revision_id);
  assert.equal(artifact.snapshot_identity.dataset_hash, successFixture.envelope.catalog_revision.dataset_hash);
  assert.equal(artifact.snapshot_identity.source_record_count, 3);
  assert.equal(artifact.snapshot_identity.scoped_record_count, 2);
  assert.equal(artifact.statistics.catalog_records, 2);
  assert.equal(artifact.statistics.catalog_objects, 2);
  assert.equal(artifact.configuration.spatial_cell_size_km, 250);
  assert.equal(artifact.configuration.max_spatial_pair_checks_per_slab, 12_345);
  assert.equal(artifact.configuration.max_candidate_intervals, 123);
  assert.deepEqual(readFileSync(successFixture.catalogPath), successFixture.catalogBytes);

  const ommCatalog = [
    {
      CCSDS_OMM_VERS: '2.0', OBJECT_NAME: 'OMM-ONE', OBJECT_ID: '1998-067A',
      CENTER_NAME: 'EARTH', REF_FRAME: 'TEME', TIME_SYSTEM: 'UTC', MEAN_ELEMENT_THEORY: 'SGP4',
      EPOCH: '2019-06-05T12:12:58Z', MEAN_MOTION: 15.51174618, ECCENTRICITY: 0.0008217,
      INCLINATION: 51.6433, RA_OF_ASC_NODE: 59.2583, ARG_OF_PERICENTER: 16.4489,
      MEAN_ANOMALY: 347.6017, EPHEMERIS_TYPE: 0, NORAD_CAT_ID: 25544, ELEMENT_SET_NO: 999,
      REV_AT_EPOCH: 17344, BSTAR: 0.000059442, MEAN_MOTION_DOT: 0.00003075,
      MEAN_MOTION_DDOT: 0, OBJECT_TYPE: 'PAYLOAD'
    },
    {
      CCSDS_OMM_VERS: '2.0', OBJECT_NAME: 'OMM-TWO', OBJECT_ID: '2019-074F',
      CENTER_NAME: 'EARTH', REF_FRAME: 'TEME', TIME_SYSTEM: 'UTC', MEAN_ELEMENT_THEORY: 'SGP4',
      EPOCH: '2019-06-05T12:12:58Z', MEAN_MOTION: 15.54464927, ECCENTRICITY: 0.0005811,
      INCLINATION: 53.1534, RA_OF_ASC_NODE: 268.1921, ARG_OF_PERICENTER: 345.4828,
      MEAN_ANOMALY: 14.6016, EPHEMERIS_TYPE: 0, NORAD_CAT_ID: 44718, ELEMENT_SET_NO: 999,
      REV_AT_EPOCH: 17344, BSTAR: 0.000061453, MEAN_MOTION_DOT: 0.000040882,
      MEAN_MOTION_DDOT: 0, OBJECT_TYPE: 'PAYLOAD'
    }
  ];
  const ommFixture = createFixture(path.join(temporary, 'omm'), 'omm-job', {
    catalog: ommCatalog,
    sourceFormat: 'CCSDS_OMM_JSON',
    objectIds: ['obx:norad:25544', 'obx:norad:44718'],
    lifecycleStatuses: ['UNKNOWN'],
    startTime: '2019-06-05T12:12:58.000Z'
  });
  const ommRun = runRunner(ommFixture);
  assert.equal(ommRun.status, 0, ommRun.stderr || ommRun.stdout);
  const ommArtifact = JSON.parse(readFileSync(ommFixture.outputPath, 'utf8'));
  assert.equal(ommArtifact.snapshot_identity.source_format, 'CCSDS_OMM_JSON');
  assert.equal(ommArtifact.statistics.catalog_objects, 2);

  const providerCatalog = ['frame-a', 'frame-b'].map((providerObjectId, index) => ({
    name: `Provider ${providerObjectId}`,
    provider_object_id: providerObjectId,
    object_type: 'PAYLOAD',
    lifecycle_status: 'ACTIVE',
    frame: 'ITRF',
    time_scale: 'UTC',
    units: { position: 'km', velocity: 'km/s' },
    interpolation: 'LINEAR',
    states: [
      {
        timestamp: START_TIME,
        position: [7000 + index * 20, 0, 0],
        velocity: [0, 7.5, 0]
      },
      {
        timestamp: '2026-07-20T12:01:00.000Z',
        position: [7000 + index * 20, 450, 0],
        velocity: [0, 7.5, 0]
      }
    ]
  }));
  const nonTemeFixture = createFixture(path.join(temporary, 'non-teme'), 'non-teme-job', {
    catalog: providerCatalog,
    sourceFormat: 'PROVIDER_EPHEMERIS_JSON',
    objectIds: [
      'obx:provider:runner-test-source:frame-a',
      'obx:provider:runner-test-source:frame-b'
    ]
  });
  const nonTemeRun = runRunner(nonTemeFixture);
  assert.notEqual(nonTemeRun.status, 0);
  assert.equal(existsSync(nonTemeFixture.outputPath), false);
  const nonTemeMessage = messages(nonTemeRun).at(-1);
  assert.equal(nonTemeMessage.type, 'error');
  assert.equal(nonTemeMessage.error.code, 'CATALOG_FRAME_UNSUPPORTED');
  assert.equal(nonTemeMessage.error.stage, 'APPLY_SCOPE');

  const checksumFixture = createFixture(path.join(temporary, 'checksum'), 'checksum-job');
  writeFileSync(checksumFixture.catalogPath, Buffer.concat([checksumFixture.catalogBytes, Buffer.from('\n')]));
  const checksumFailure = runRunner(checksumFixture);
  assert.notEqual(checksumFailure.status, 0);
  assert.equal(existsSync(checksumFixture.outputPath), false);
  const checksumMessage = messages(checksumFailure).at(-1);
  assert.equal(checksumMessage.type, 'error');
  assert.equal(checksumMessage.job_id, 'checksum-job');
  assert.equal(checksumMessage.error.code, 'CATALOG_CHECKSUM_MISMATCH');
  assert.equal(checksumMessage.error.message.includes(checksumFixture.runtimeRoot), false);
  assert.equal(checksumFailure.stderr, '');

  const escapeFixture = createFixture(path.join(temporary, 'escape'), 'escape-job');
  const outsideInput = path.join(temporary, 'outside-input.json');
  writeFileSync(outsideInput, JSON.stringify(escapeFixture.envelope), 'utf8');
  const pathFailure = runRunner(escapeFixture, { input: outsideInput });
  assert.notEqual(pathFailure.status, 0);
  assert.equal(messages(pathFailure).at(-1).error.code, 'RUNNER_PATH_OUTSIDE_RUNTIME');
  assert.equal(pathFailure.stdout.includes(outsideInput), false);
  assert.equal(existsSync(escapeFixture.outputPath), false);

  console.log('fullCatalogRunner tests passed');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
