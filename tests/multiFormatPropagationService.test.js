import assert from 'node:assert/strict';
import * as satellite from 'satellite.js';
import { validateStateVector } from '../js/domain/contracts.js';
import {
    parseCcsdsOemKvn,
    parseCcsdsOmmJson,
    parseProviderEphemeris,
    parseTleJson
} from '../js/domain/orbitalSourceAdapters.js';
import {
    MULTI_FORMAT_PROPAGATION_ERROR_CODE,
    TABULATED_INTERPOLATION_POLICY,
    createMultiFormatPropagationService
} from '../js/orbit/multiFormatPropagationService.js';

const SOURCE = Object.freeze({
    source_id: 'propagation-test-source',
    provider: 'OpenBEXI test fixture',
    retrieved_at: '2026-07-20T00:00:00Z'
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

function vectorDistance(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

const service = createMultiFormatPropagationService({ satelliteLib: satellite });
assert.deepStrictEqual(service.interpolation_policy, TABULATED_INTERPOLATION_POLICY);
assert(service.supported_formats.includes('OMM'));
assert(service.supported_formats.includes('OEM'));

const tleRecord = parseTleJson(ISS_TLE, { source: SOURCE }).records[0];
const tleState = service.propagate(tleRecord, tleRecord.element_set.epoch);
assert.strictEqual(tleState.ok, true, tleState.error?.message);
assert.strictEqual(tleState.value.frame, 'TEME');
assert.strictEqual(validateStateVector(tleState.value).valid, true);

const ommRecord = parseCcsdsOmmJson(OMM_JSON, { source: SOURCE }).records[0];
const ommPrepared = service.prepareObject(ommRecord);
assert.strictEqual(ommPrepared.ok, true, ommPrepared.error?.message);
assert.strictEqual(ommPrepared.value.route, 'OMM');
const ommState = service.propagate(ommPrepared.value, OMM_JSON.EPOCH);
assert.strictEqual(ommState.ok, true, ommState.error?.message);
assert.strictEqual(ommState.value.frame, 'TEME');
assert.strictEqual(ommState.value.time_scale, 'UTC');
assert.strictEqual(validateStateVector(ommState.value).valid, true);
assert.strictEqual(ommState.value.provenance.algorithm.name, 'satellite.js SGP4 (CCSDS OMM)');

const directSatrec = satellite.json2satrec(ommRecord.element_set.omm);
const directState = satellite.propagate(directSatrec, new Date(OMM_JSON.EPOCH));
assert(vectorDistance(ommState.value.position_km, directState.position) < 1e-9);
assert(vectorDistance(ommState.value.velocity_km_s, directState.velocity) < 1e-12);

const oemRecord = parseCcsdsOemKvn(OEM_KVN, { source: SOURCE }).records[0];
const oemPrepared = service.prepareObject(oemRecord);
assert.strictEqual(oemPrepared.ok, true, oemPrepared.error?.message);
assert.strictEqual(oemPrepared.value.route, 'TABULATED');
assert.strictEqual(oemPrepared.value.frame, 'GCRF');

const exactState = service.propagate(oemPrepared.value, '2026-07-20T00:00:00Z');
assert.strictEqual(exactState.ok, true, exactState.error?.message);
assert.deepStrictEqual(exactState.value.position_km, { x: 7000, y: 0, z: 0 });
assert(exactState.value.quality_flags.includes('TABULATED_EXACT_SAMPLE'));

const midpoint = service.propagate(oemPrepared.value, '2026-07-20T00:00:30Z');
assert.strictEqual(midpoint.ok, true, midpoint.error?.message);
assert.deepStrictEqual(midpoint.value.position_km, { x: 7000, y: 225, z: 0 });
assert.deepStrictEqual(midpoint.value.velocity_km_s, { x: -0.24, y: 7.49, z: 0 });
assert.strictEqual(midpoint.value.frame, 'GCRF');
assert(midpoint.value.quality_flags.includes('TABULATED_LINEAR_INTERPOLATION'));
assert.strictEqual(validateStateVector(midpoint.value).valid, true);

const beforeRange = service.propagate(oemPrepared.value, '2026-07-19T23:59:59Z');
assert.strictEqual(beforeRange.ok, false);
assert.strictEqual(beforeRange.error.code, MULTI_FORMAT_PROPAGATION_ERROR_CODE.OUT_OF_RANGE);
assert.match(beforeRange.error.message, /extrapolation is prohibited/i);

const gapLimitedService = createMultiFormatPropagationService({
    satelliteLib: satellite,
    maxInterpolationGapSeconds: 30
});
const excessiveGap = gapLimitedService.propagate(oemRecord, '2026-07-20T00:00:30Z');
assert.strictEqual(excessiveGap.ok, false);
assert.strictEqual(
    excessiveGap.error.code,
    MULTI_FORMAT_PROPAGATION_ERROR_CODE.INTERPOLATION_GAP_EXCEEDED
);

const providerRecord = parseProviderEphemeris({
    name: 'Provider vehicle',
    provider_object_id: 'vehicle-42',
    frame: 'ITRF',
    time_scale: 'UTC',
    units: { position: 'km', velocity: 'km/s' },
    interpolation: 'LINEAR',
    states: [
        { timestamp: '2026-07-20T00:00:00Z', position: [7100, 0, 0], velocity: [0, 7.4, 0] },
        { timestamp: '2026-07-20T00:01:00Z', position: [7100, 444, 0], velocity: [-0.45, 7.38, 0] }
    ]
}, { source: SOURCE }).records[0];
const providerState = service.propagate(providerRecord, '2026-07-20T00:00:30Z');
assert.strictEqual(providerState.ok, true, providerState.error?.message);
assert.strictEqual(providerState.value.frame, 'ITRF');
assert.deepStrictEqual(providerState.value.position_km, { x: 7100, y: 222, z: 0 });

const unsupportedFrame = structuredClone(oemRecord);
unsupportedFrame.element_set.native_frame = 'RTN';
unsupportedFrame.element_set.states.forEach(sample => { sample.frame = 'RTN'; });
const rejectedFrame = service.prepareObject(unsupportedFrame);
assert.strictEqual(rejectedFrame.ok, false);
assert.strictEqual(rejectedFrame.error.code, MULTI_FORMAT_PROPAGATION_ERROR_CODE.FRAME_UNSUPPORTED);

const noOmmLibrary = createMultiFormatPropagationService({ satelliteLib: null }).prepareObject(ommRecord);
assert.strictEqual(noOmmLibrary.ok, false);
assert.strictEqual(noOmmLibrary.error.code, MULTI_FORMAT_PROPAGATION_ERROR_CODE.LIBRARY_UNAVAILABLE);

console.log('multiFormatPropagationService tests passed');
