import assert from 'node:assert/strict';
import {
    ORBITAL_SOURCE_ERROR_CODE,
    OrbitalSourceAdapterError,
    parseCcsdsOemKvn,
    parseCcsdsOmmJson,
    parseCcsdsOmmKvn,
    parseProviderEphemeris,
    parseTleJson
} from '../js/domain/orbitalSourceAdapters.js';

const SOURCE = Object.freeze({
    source_id: 'adapter-test-source',
    provider: 'OpenBEXI test fixture',
    retrieved_at: '2026-07-20T00:00:00Z',
    source_uri: 'https://example.test/orbits',
    license_id: 'MIT'
});

const ISS_TLE = {
    name: 'ISS (ZARYA)',
    norad_id: '25544',
    tle_line1: '1 25544U 98067A   19156.50900463  .00003075  00000-0  59442-4 0  9992',
    tle_line2: '2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442'
};

const OMM_JSON = {
    CCSDS_OMM_VERS: '2.0',
    OBJECT_NAME: 'ISS (ZARYA)',
    OBJECT_ID: '1998-067A',
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
    MEAN_ANOMALY: 347.6017,
    EPHEMERIS_TYPE: 0,
    NORAD_CAT_ID: 25544,
    ELEMENT_SET_NO: 999,
    REV_AT_EPOCH: 17344,
    BSTAR: 0.000059442,
    MEAN_MOTION_DOT: 0.00003075,
    MEAN_MOTION_DDOT: 0
};

const tleBundle = parseTleJson(ISS_TLE, { source: SOURCE });
assert.strictEqual(tleBundle.record_count, 1);
assert.strictEqual(tleBundle.records[0].element_set.format, 'TLE');
assert.strictEqual(tleBundle.records[0].element_set.native_frame, 'TEME');
assert.strictEqual(tleBundle.records[0].element_set.time_scale, 'UTC');
assert.deepStrictEqual(tleBundle.records[0].original_record, ISS_TLE);
assert(Object.isFrozen(tleBundle.records[0].original_record));

const mutableOmm = structuredClone(OMM_JSON);
const ommBundle = parseCcsdsOmmJson(mutableOmm, {
    source: SOURCE,
    satcat_records: [{
        NORAD_CAT_ID: '25544',
        OBJECT_ID: '1998-067A',
        OBJECT_TYPE: 'PAY',
        OPS_STATUS_CODE: '+'
    }]
});
mutableOmm.OBJECT_NAME = 'MUTATED AFTER PARSE';
const omm = ommBundle.records[0];
assert.strictEqual(omm.object_id, 'obx:norad:25544');
assert.strictEqual(omm.object_type, 'PAYLOAD');
assert.strictEqual(omm.lifecycle_status, 'ACTIVE');
assert.strictEqual(omm.element_set.format, 'OMM');
assert.strictEqual(omm.element_set.propagation_theory, 'SGP4');
assert.strictEqual(omm.element_set.omm.EPOCH, '2019-06-05T12:12:58.000Z');
assert.strictEqual(omm.original_record.OBJECT_NAME, 'ISS (ZARYA)');
assert(omm.quality_flags.includes('SATCAT_OBJECT_TYPE_ENRICHED'));
assert(omm.quality_flags.includes('SATCAT_LIFECYCLE_ENRICHED'));

const OMM_KVN = `CCSDS_OMM_VERS = 2.0
OBJECT_NAME = ISS (ZARYA)
OBJECT_ID = 1998-067A
CENTER_NAME = EARTH
REF_FRAME = TEME
TIME_SYSTEM = UTC
MEAN_ELEMENT_THEORY = SGP4
EPOCH = 2019-06-05T12:12:58Z
MEAN_MOTION = 15.51174618
ECCENTRICITY = 0.0008217
INCLINATION = 51.6433
RA_OF_ASC_NODE = 59.2583
ARG_OF_PERICENTER = 16.4489
MEAN_ANOMALY = 347.6017
EPHEMERIS_TYPE = 0
NORAD_CAT_ID = 25544
ELEMENT_SET_NO = 999
REV_AT_EPOCH = 17344
BSTAR = 0.000059442
MEAN_MOTION_DOT = 0.00003075
MEAN_MOTION_DDOT = 0
`;
const ommKvnBundle = parseCcsdsOmmKvn(OMM_KVN, { source: SOURCE });
assert.strictEqual(ommKvnBundle.records[0].source_format, 'CCSDS_OMM_KVN');
assert.strictEqual(ommKvnBundle.records[0].original_record, OMM_KVN);
assert.strictEqual(ommKvnBundle.records[0].element_set.omm.NORAD_CAT_ID, '25544');

const OEM_KVN = `CCSDS_OEM_VERS = 2.0
CREATION_DATE = 2026-07-20T00:00:00Z
ORIGINATOR = OPENBEXI TEST
META_START
OBJECT_NAME = TEST VEHICLE
OBJECT_ID = 1998-067A
CENTER_NAME = EARTH
REF_FRAME = GCRF
TIME_SYSTEM = UTC
START_TIME = 2026-07-20T00:00:00Z
STOP_TIME = 2026-07-20T00:01:00Z
INTERPOLATION = LINEAR
INTERPOLATION_DEGREE = 1
META_STOP
2026-07-20T00:00:00Z 7000 0 0 0 7.5 0
2026-07-20T00:01:00Z 7000 450 0 -0.48 7.48 0
`;
const oemBundle = parseCcsdsOemKvn(OEM_KVN, { source: SOURCE });
const oem = oemBundle.records[0];
assert.strictEqual(oem.object_id, 'obx:cospar:1998-067a');
assert.strictEqual(oem.element_set.format, 'OEM');
assert.strictEqual(oem.element_set.native_frame, 'GCRF');
assert.strictEqual(oem.element_set.states.length, 2);
assert.strictEqual(oem.element_set.states[1].velocity_km_s.y, 7.48);
assert.strictEqual(oem.original_record, OEM_KVN);

const providerInput = {
    name: 'Provider vehicle',
    provider_object_id: 'vehicle-7',
    frame: 'ITRF',
    time_scale: 'UTC',
    units: { position: 'km', velocity: 'km/s' },
    interpolation: 'LINEAR',
    states: [
        { timestamp: '2026-07-20T00:00:00Z', position: [7000, 0, 0], velocity: [0, 7.5, 0] },
        { timestamp: '2026-07-20T00:01:00Z', position: [7000, 450, 0], velocity: [-0.48, 7.48, 0] }
    ]
};
const provider = parseProviderEphemeris(providerInput, { source: SOURCE }).records[0];
assert.strictEqual(provider.object_id, 'obx:provider:adapter-test-source:vehicle-7');
assert.strictEqual(provider.element_set.format, 'PROVIDER_EPHEMERIS');
assert.strictEqual(provider.element_set.native_frame, 'ITRF');

assert.throws(
    () => parseCcsdsOmmJson({ ...OMM_JSON, REF_FRAME: 'GCRF' }, { source: SOURCE }),
    error => error instanceof OrbitalSourceAdapterError &&
        error.code === ORBITAL_SOURCE_ERROR_CODE.FRAME_UNSUPPORTED
);
assert.throws(
    () => parseCcsdsOmmKvn(`${OMM_KVN}REF_FRAME = TEME\n`, { source: SOURCE }),
    error => error.code === ORBITAL_SOURCE_ERROR_CODE.DUPLICATE_FIELD
);
assert.throws(
    () => parseTleJson([ISS_TLE, { ...ISS_TLE }], {
        source: SOURCE,
        limits: { max_records: 1 }
    }),
    error => error.code === ORBITAL_SOURCE_ERROR_CODE.RECORD_LIMIT_EXCEEDED
);
assert.throws(
    () => parseCcsdsOemKvn(OEM_KVN, {
        source: SOURCE,
        limits: { max_input_bytes: 32 }
    }),
    error => error.code === ORBITAL_SOURCE_ERROR_CODE.INPUT_TOO_LARGE
);
assert.throws(
    () => parseProviderEphemeris({
        ...providerInput,
        states: [providerInput.states[1], providerInput.states[0]]
    }, { source: SOURCE }),
    error => error.code === ORBITAL_SOURCE_ERROR_CODE.SAMPLE_ORDER_INVALID
);

console.log('orbitalSourceAdapters tests passed');
