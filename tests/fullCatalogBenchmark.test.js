import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  inferCatalogSourceFormat,
  preferredCatalogPair,
  prepareCatalogAdapterInput,
  siblingMetadataPath
} from '../scripts/orbital-catalog-input.mjs';

const ROOT = path.resolve('.');
const BENCHMARK = path.join(ROOT, 'scripts', 'benchmark-full-catalog.mjs');
const START_TIME = '2019-06-05T12:12:58.000Z';

function rawOmm(noradId, name, meanAnomaly) {
  return {
    CCSDS_OMM_VERS: '2.0',
    OBJECT_NAME: name,
    OBJECT_ID: `2026-${String(noradId).slice(-3)}A`,
    CENTER_NAME: 'EARTH',
    REF_FRAME: 'TEME',
    TIME_SYSTEM: 'UTC',
    MEAN_ELEMENT_THEORY: 'SGP4',
    EPOCH: '2019-06-05T12:12:58Z',
    MEAN_MOTION: 15.51174618,
    ECCENTRICITY: 0.0008217,
    INCLINATION: 51.6433,
    RA_OF_ASC_NODE: 59.2583,
    ARG_OF_PERICENTER: 16.4489,
    MEAN_ANOMALY: meanAnomaly,
    EPHEMERIS_TYPE: 0,
    NORAD_CAT_ID: String(noradId),
    ELEMENT_SET_NO: 999,
    REV_AT_EPOCH: 17344,
    BSTAR: 0.000059442,
    MEAN_MOTION_DOT: 0.00003075,
    MEAN_MOTION_DDOT: 0,
    OBJECT_TYPE: 'PAYLOAD'
  };
}

function packagedOmm(noradId, meanAnomaly) {
  const omm = rawOmm(noradId, `GP-${noradId}`, meanAnomaly);
  return {
    name: omm.OBJECT_NAME,
    satellite_name: omm.OBJECT_NAME,
    object_id: `obx:norad:${noradId}`,
    norad_id: String(noradId),
    object_type: 'PAYLOAD',
    lifecycle_status: 'ACTIVE',
    orbit_class: 'LEO',
    source_format: 'CCSDS_OMM_JSON',
    tle_line1: null,
    tle_line2: null,
    element_set: {
      format: 'OMM',
      epoch: omm.EPOCH,
      time_scale: 'UTC',
      native_frame: 'TEME',
      propagation_theory: 'SGP4',
      omm
    }
  };
}

function runBenchmark(catalogPath, options = {}) {
  return spawnSync(process.execPath, [
    BENCHMARK,
    '--catalog', catalogPath,
    '--limit', '2',
    '--start-time', options.startTime ?? START_TIME,
    '--horizon-seconds', '1',
    '--coarse-step-seconds', '1',
    ...(options.extra ?? [])
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true
  });
}

const temporary = mkdtempSync(path.join(tmpdir(), 'openbexi-full-benchmark-'));
try {
  const pairRoot = path.join(temporary, 'pair-selection');
  const tleDirectory = path.join(pairRoot, 'json', 'tle');
  const gpDirectory = path.join(pairRoot, 'json', 'gp');
  mkdirSync(tleDirectory, { recursive: true });
  mkdirSync(gpDirectory, { recursive: true });
  writeFileSync(path.join(tleDirectory, 'TLE.json'), '[]');
  writeFileSync(path.join(tleDirectory, 'TLE.meta.json'), '{}');
  writeFileSync(path.join(gpDirectory, 'GP.json'), '[]');
  assert.equal(preferredCatalogPair(pairRoot).catalog, path.join(tleDirectory, 'TLE.json'));
  writeFileSync(path.join(gpDirectory, 'GP.meta.json'), '{}');
  assert.equal(preferredCatalogPair(pairRoot).catalog, path.join(gpDirectory, 'GP.json'));
  assert.equal(siblingMetadataPath(path.join(gpDirectory, 'GP.json')), path.join(gpDirectory, 'GP.meta.json'));

  const gpCatalog = [packagedOmm(100001, 347.6017), packagedOmm(100002, 349.6017)];
  assert.equal(inferCatalogSourceFormat(gpCatalog), 'CCSDS_OMM_JSON');
  const prepared = prepareCatalogAdapterInput(gpCatalog, 'CCSDS_OMM_JSON');
  assert.equal(prepared.packaged_omm_record_count, 2);
  assert.deepEqual(prepared.input.map(record => record.NORAD_CAT_ID), ['100001', '100002']);
  assert.deepEqual(prepared.satcat_records.map(record => record.lifecycle_status), ['ACTIVE', 'ACTIVE']);
  assert.throws(
    () => prepareCatalogAdapterInput([{ ...gpCatalog[0], norad_id: '100009' }], 'CCSDS_OMM_JSON'),
    /identifiers conflict/
  );

  const gpFixture = path.join(temporary, 'GP.json');
  writeFileSync(gpFixture, JSON.stringify(gpCatalog));
  writeFileSync(siblingMetadataPath(gpFixture), JSON.stringify({
    schema_version: '2.2.0',
    parser_version: '2.2.0',
    source_format: 'CCSDS_OMM_JSON',
    provider: 'CelesTrak fixture',
    source_status: 'COMPLETE',
    fetched_at: '2026-08-23T00:00:00.000Z'
  }));
  const gpRun = runBenchmark(gpFixture);
  assert.equal(gpRun.status, 0, gpRun.stderr || gpRun.stdout);
  const gpReport = JSON.parse(gpRun.stdout);
  assert.equal(gpReport.source.source_format, 'CCSDS_OMM_JSON');
  assert.equal(gpReport.source.source_status, 'COMPLETE');
  assert.equal(gpReport.source.source_record_count, 2);
  assert.equal(gpReport.source.selected_record_count, 2);
  assert.equal(gpReport.source.packaged_omm_record_count, 2);

  const tleCatalog = [
    {
      satellite_name: 'STARLINK-1008',
      norad_id: '44714',
      tle_line1: '1 44714U 19074B   26201.40664019  .00040799  00000+0  62345-3 0  9993',
      tle_line2: '2 44714  53.1496 269.1769 0005106 339.4652  20.6153 15.54017911369373'
    },
    {
      satellite_name: 'STARLINK-1012',
      norad_id: '44718',
      tle_line1: '1 44718U 19074F   26201.65229082  .00040882  00000+0  61453-3 0  9993',
      tle_line2: '2 44718  53.1534 268.1921 0005811 345.4828  14.6016 15.54464927369402'
    }
  ];
  assert.equal(inferCatalogSourceFormat(tleCatalog), 'TLE_JSON');
  const tleFixture = path.join(temporary, 'TLE.json');
  writeFileSync(tleFixture, JSON.stringify(tleCatalog));
  writeFileSync(siblingMetadataPath(tleFixture), JSON.stringify({
    source_format: 'TLE_JSON',
    provider: 'CelesTrak fixture',
    source_status: 'COMPLETE',
    partial_update: true,
    last_status: 'ok',
    fetched_at: '2026-07-20T00:00:00.000Z'
  }));
  const tleRun = runBenchmark(tleFixture, { startTime: '2026-07-20T12:00:00.000Z' });
  assert.equal(tleRun.status, 0, tleRun.stderr || tleRun.stdout);
  const tleReport = JSON.parse(tleRun.stdout);
  assert.equal(tleReport.source.source_format, 'TLE_JSON');
  assert.equal(tleReport.source.source_status, 'PARTIAL');
  assert.equal(tleReport.source.packaged_omm_record_count, 0);

  console.log('fullCatalogBenchmark tests passed');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
