import assert from 'node:assert/strict';
import * as satellite from 'satellite.js';
import {
  CATALOG_STATUS,
  computeTleChecksum,
  normalizeCatalogRecord,
  parseTleEpochUtc,
  validateCatalog,
  validateCatalogRecord,
  validateTlePair
} from '../js/domain/catalogValidation.js';
import { OBJECT_TYPE, ORBIT_CLASS } from '../js/domain/orbitalPolicy.js';

const line1 = '1 44714U 19074B   26193.55886833  .00056372  00000+0  87819-3 0  9996';
const line2 = '2 44714  53.1517 306.9551 0004043 312.7639  47.3031 15.53348743368159';
const sgp4InvalidLine2 = '2 44714  53.1517 306.9551 9999999 312.7639  47.3031 15.53348743368151';
const negativeBstarLine1 = '1 53481U 22099S   26193.58335648 -.01065545  00000+0 -16190-1 0  9991';
const negativeBstarLine2 = '2 53481  97.6058 318.6318 0001283  82.3398 307.6793 15.57111003  5773';

function replaceLine1Field(start, end, replacement) {
  assert.equal(replacement.length, end - start);
  const body = `${line1.slice(0, start)}${replacement}${line1.slice(end, 68)}`;
  return `${body}${computeTleChecksum(body)}`;
}

const malformedBstarLine1 = replaceLine1Field(53, 61, ' ABCDE-F');

const provenance = Object.freeze({
  schema_version: '2.0.0',
  source_id: 'fixture-source',
  provider: 'Fixture Provider',
  retrieved_at: '2026-07-19T00:00:00Z',
  dataset_id: 'fixture-dataset-v1',
  dataset_hash: 'sha256:catalog-fixture',
  source_uri: null,
  source_status: 'COMPLETE',
  partial_update: false,
  license_id: null
});

function record(overrides = {}) {
  return {
    satellite_name: 'STARLINK-1008',
    norad_id: '44714',
    object_type: 'PAYLOAD',
    orbit_class: 'LEO',
    lifecycle_status: 'ACTIVE',
    inclination_deg: 53.1517,
    eccentricity: 0.0004043,
    mean_motion_rev_per_day: 15.53348743,
    tle_line1: line1,
    tle_line2: line2,
    ...overrides
  };
}

function run() {
  assert.equal(line1.length, 69);
  assert.equal(line2.length, 69);
  assert.equal(computeTleChecksum(line1), 6);
  assert.equal(computeTleChecksum(line2), 9);
  assert.equal(parseTleEpochUtc('26001.50000000'), '2026-01-01T12:00:00.000Z');
  assert.equal(parseTleEpochUtc('00060.00000000'), '2000-02-29T00:00:00.000Z');
  assert.throws(() => parseTleEpochUtc('23000.00000000'), /outside year/);

  const tle = validateTlePair(line1, line2, { expected_norad_id: '44714' });
  assert.equal(tle.valid, true);
  assert.equal(tle.value.norad_id, '44714');
  assert.equal(tle.value.international_designator, '2019-074B');
  assert.equal(tle.value.epoch, '2026-07-12T13:24:46.223Z');
  assert.equal(tle.value.eccentricity, 0.0004043);
  assert.equal(validateTlePair(`${line1.slice(0, 68)}0`, line2).valid, false);
  assert.equal(validateTlePair(line1, line2, { expected_norad_id: '44715' }).valid, false);
  assert.equal(validateTlePair(line1.slice(0, -1), line2).valid, false);
  assert.equal(validateTlePair(negativeBstarLine1, negativeBstarLine2).valid, true);
  assert.equal(validateTlePair(replaceLine1Field(33, 43, '+.00056372'), line2).valid, true);
  assert.equal(validateTlePair(replaceLine1Field(53, 61, '+87819-3'), line2).valid, true);

  const invalidLine1Fields = [
    [33, 43, ' .ABCDEFGH', 'TLE_MEAN_MOTION_FIRST_DERIVATIVE_INVALID'],
    [44, 52, ' ABCDE-F', 'TLE_MEAN_MOTION_SECOND_DERIVATIVE_INVALID'],
    [53, 61, ' ABCDE-F', 'TLE_BSTAR_INVALID'],
    [62, 63, 'X', 'TLE_EPHEMERIS_TYPE_INVALID'],
    [64, 68, ' 9X9', 'TLE_ELEMENT_SET_NUMBER_INVALID']
  ];
  for (const [start, end, replacement, expectedCode] of invalidLine1Fields) {
    const result = validateTlePair(replaceLine1Field(start, end, replacement), line2);
    assert.equal(result.valid, false);
    assert(result.errors.some(issue => issue.code === expectedCode), expectedCode);
  }

  const unsupportedEphemeris = validateTlePair(replaceLine1Field(62, 63, '2'), line2);
  assert.equal(unsupportedEphemeris.valid, false);
  assert(unsupportedEphemeris.errors.some(issue => issue.code === 'TLE_EPHEMERIS_TYPE_UNSUPPORTED'));

  const invalidSeparator = validateTlePair(replaceLine1Field(52, 53, 'X'), line2);
  assert.equal(invalidSeparator.valid, false);
  assert(invalidSeparator.errors.some(issue => issue.code === 'TLE_LINE1_SEPARATOR_INVALID'));

  for (const [start, end, expectedCode] of [
    [44, 52, 'TLE_MEAN_MOTION_SECOND_DERIVATIVE_INVALID'],
    [53, 61, 'TLE_BSTAR_INVALID']
  ]) {
    const blankExponentField = validateTlePair(replaceLine1Field(start, end, ' '.repeat(end - start)), line2);
    assert.equal(blankExponentField.valid, false);
    assert(blankExponentField.errors.some(issue => issue.code === expectedCode));
  }

  const malformedBstarSatrec = satellite.twoline2satrec(malformedBstarLine1, line2);
  assert.equal(malformedBstarSatrec.error, 0, 'pinned satellite.js does not set an error for malformed BSTAR');
  assert.equal(Number.isFinite(malformedBstarSatrec.bstar), false);

  const normalized = normalizeCatalogRecord(record(), {
    provenance,
    reference_time: '2026-07-19T00:00:00Z'
  });
  assert.equal(normalized.object_id, 'obx:norad:44714');
  assert.equal(normalized.object_type, OBJECT_TYPE.PAYLOAD);
  assert.equal(normalized.orbit_class, ORBIT_CLASS.LEO);
  assert.equal(normalized.element_set.native_frame, 'TEME');
  assert.equal(normalized.element_set.time_scale, 'UTC');
  assert(Object.isFrozen(normalized));

  const separatedClassification = normalizeCatalogRecord(record({
    object_type: undefined,
    orbit_class: undefined,
    type: 'LEO'
  }), { provenance, reference_time: '2026-07-19T00:00:00Z' });
  assert.equal(separatedClassification.object_type, OBJECT_TYPE.UNKNOWN);
  assert.equal(separatedClassification.orbit_class, ORBIT_CLASS.LEO);
  assert(separatedClassification.quality_flags.includes('LEGACY_TYPE_USED_AS_ORBIT_CLASS'));

  const invalidDerived = validateCatalogRecord(record({ inclination_deg: Number.NaN }), {
    provenance,
    reference_time: '2026-07-19T00:00:00Z'
  });
  assert.equal(invalidDerived.valid, false);
  assert(invalidDerived.errors.some(issue => issue.code === 'DERIVED_FIELD_NONFINITE'));

  const stale = validateCatalogRecord(record(), {
    provenance,
    reference_time: '2026-08-01T00:00:00Z'
  });
  assert.equal(stale.valid, true);
  assert(stale.value.quality_flags.includes('TLE_STALE'));
  assert.equal(validateCatalogRecord(record(), {
    provenance,
    reference_time: '2026-08-01T00:00:00Z',
    quarantine_stale: true
  }).valid, false);
  assert.equal(validateCatalogRecord(record(), {
    provenance,
    reference_time: '2026-07-01T00:00:00Z'
  }).valid, false);

  const goodCatalog = validateCatalog([record()], {
    provenance,
    reference_time: '2026-07-19T00:00:00Z'
  });
  assert.equal(goodCatalog.valid, true);
  assert.equal(goodCatalog.value.status, CATALOG_STATUS.VALID);
  assert.equal(goodCatalog.value.quality.accepted_records, 1);
  assert.equal(goodCatalog.value.quality.freshness.FRESH, 1);

  const duplicates = validateCatalog([record(), record({ satellite_name: 'DUPLICATE NAME' })], {
    provenance,
    reference_time: '2026-07-19T00:00:00Z'
  });
  assert.equal(duplicates.valid, false);
  assert.equal(duplicates.value.status, CATALOG_STATUS.INVALID);
  assert.equal(duplicates.value.objects.length, 0);
  assert.equal(duplicates.value.quality.duplicate_records, 2);
  assert(duplicates.value.quarantine.every(item => item.reason_codes.includes('DUPLICATE_OBJECT_ID')));

  const partialCatalog = validateCatalog([record()], {
    provenance: { ...provenance, source_status: 'PARTIAL', partial_update: true },
    reference_time: '2026-07-19T00:00:00Z'
  });
  assert.equal(partialCatalog.valid, true);
  assert.equal(partialCatalog.value.status, CATALOG_STATUS.PARTIAL);

  const badChecksumCatalog = validateCatalog([record({ tle_line1: `${line1.slice(0, 68)}0` })], {
    provenance,
    reference_time: '2026-07-19T00:00:00Z'
  });
  assert.equal(badChecksumCatalog.valid, false);
  assert(badChecksumCatalog.value.quarantine[0].reason_codes.includes('TLE_CHECKSUM_MISMATCH'));

  const sgp4InvalidCatalog = validateCatalog([record({
    eccentricity: 0.9999999,
    tle_line2: sgp4InvalidLine2
  })], {
    provenance,
    reference_time: '2026-07-19T00:00:00Z',
    sgp4_initializer: satellite.twoline2satrec
  });
  assert.equal(validateTlePair(line1, sgp4InvalidLine2).valid, true, 'fixture passes fixed-column checks');
  assert.equal(satellite.twoline2satrec(line1, sgp4InvalidLine2).error, 4, 'fixture fails pinned SGP4 initialization');
  assert.equal(sgp4InvalidCatalog.valid, false);
  assert.equal(sgp4InvalidCatalog.value.quality.quarantined_records, 1);
  assert(sgp4InvalidCatalog.value.quarantine[0].reason_codes.includes('TLE_SGP4_INITIALIZATION_FAILED'));

  const malformedBstarCatalog = validateCatalog([record({ tle_line1: malformedBstarLine1 })], {
    provenance,
    reference_time: '2026-07-19T00:00:00Z',
    sgp4_initializer: satellite.twoline2satrec
  });
  assert.equal(malformedBstarCatalog.valid, false);
  assert(malformedBstarCatalog.value.quarantine[0].reason_codes.includes('TLE_BSTAR_INVALID'));

  const nonFiniteSatrecCatalog = validateCatalog([record()], {
    provenance,
    reference_time: '2026-07-19T00:00:00Z',
    sgp4_initializer: (candidateLine1, candidateLine2) => ({
      ...satellite.twoline2satrec(candidateLine1, candidateLine2),
      bstar: Number.NaN
    })
  });
  assert.equal(nonFiniteSatrecCatalog.valid, false);
  assert(nonFiniteSatrecCatalog.value.quarantine[0].reason_codes.includes('TLE_SGP4_NONFINITE_FIELD'));
}

run();
console.log('catalog validation tests passed');
