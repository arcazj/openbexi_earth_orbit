import assert from 'node:assert/strict';
import * as satellite from 'satellite.js';
import { validateStateVector } from '../js/domain/contracts.js';
import {
    PROPAGATION_ERROR_CODE,
    SATELLITE_JS_VERSION,
    createTlePropagationService
} from '../js/orbit/propagationService.js';

const ISS_TLE = Object.freeze({
    name: 'ISS (ZARYA)',
    norad_id: '25544',
    tle_line1: '1 25544U 98067A   19156.50900463  .00003075  00000-0  59442-4 0  9992',
    tle_line2: '2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442'
});

function vectorError(actual, expected) {
    return Math.hypot(
        actual.x - expected.x,
        actual.y - expected.y,
        actual.z - expected.z
    );
}

const service = createTlePropagationService({ satelliteLib: satellite });
assert.strictEqual(service.implementation_version, SATELLITE_JS_VERSION);
assert.strictEqual(service.time_scale, 'UTC');
assert.strictEqual(service.frame, 'TEME');
assert.deepStrictEqual(service.units, { position: 'km', velocity: 'km/s' });

const prepared = service.prepareObject(ISS_TLE);
assert.strictEqual(prepared.ok, true, prepared.error?.message);
assert.strictEqual(prepared.value.object_id, 'obx:norad:25544');
assert.match(prepared.value.element_set_id, /^elset:tle:obx:norad:25544:/);
assert.strictEqual(prepared.value.element_epoch_utc, '2019-06-05T12:12:58.000Z');

const propagated = service.propagate(prepared.value, prepared.value.element_epoch_utc);
assert.strictEqual(propagated.ok, true, propagated.error?.message);
assert.strictEqual(validateStateVector(propagated.value).valid, true);
assert.strictEqual(propagated.value.object_id, 'obx:norad:25544');
assert.strictEqual(propagated.value.element_set_id, prepared.value.element_set_id);
assert.strictEqual(propagated.value.timestamp, prepared.value.element_epoch_utc);
assert.strictEqual(propagated.value.time_scale, 'UTC');
assert.strictEqual(propagated.value.frame, 'TEME');
assert(Math.hypot(
    propagated.value.position_km.x,
    propagated.value.position_km.y,
    propagated.value.position_km.z
) > 6378.137);
assert(Math.hypot(
    propagated.value.velocity_km_s.x,
    propagated.value.velocity_km_s.y,
    propagated.value.velocity_km_s.z
) > 0);
assert.strictEqual(propagated.value.provenance.algorithm.name, 'satellite.js SGP4');
assert.strictEqual(propagated.value.provenance.algorithm.version, SATELLITE_JS_VERSION);

// Vallado et al., "Revisiting Spacetrack Report #3", AIAA 2006-6753.
// Official fixture and MATLAB verification output:
// https://github.com/CelesTrak/fundamentals-of-astrodynamics/blob/main/datalib/SGP4-VER.TLE
// https://github.com/CelesTrak/fundamentals-of-astrodynamics/blob/main/software/matlab/SGP4/tmatverDec2015.out
// The reference epoch has sub-millisecond precision while JavaScript Date is
// millisecond-resolution, so the position tolerance includes a 0.432 ms offset.
const VALLADO_VANGUARD = Object.freeze({
    name: 'VANGUARD 1',
    norad_id: '5',
    tle_line1: '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753',
    tle_line2: '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667'
});
const vanguardPrepared = service.prepareObject(VALLADO_VANGUARD);
assert.strictEqual(vanguardPrepared.ok, true, vanguardPrepared.error?.message);
assert.strictEqual(vanguardPrepared.value.element_epoch_utc, '2000-06-27T18:50:19.734Z');
const vanguardEpoch = service.propagate(
    vanguardPrepared.value,
    vanguardPrepared.value.element_epoch_utc
);
assert.strictEqual(vanguardEpoch.ok, true, vanguardEpoch.error?.message);
assert(vectorError(vanguardEpoch.value.position_km, {
    x: 7022.46529266,
    y: -1400.08296755,
    z: 0.03995155
}) <= 0.005, 'Vallado Vanguard epoch position must agree within 5 m');
assert(vectorError(vanguardEpoch.value.velocity_km_s, {
    x: 1.893841015,
    y: 6.405893759,
    z: 4.534807250
}) <= 0.000005, 'Vallado Vanguard epoch velocity must agree within 5 mm/s');

// These cases and expected TEME vectors come from the official CelesTrak
// AIAA-2006-6753 package (SHA-256
// 3642043b706c76be87cf012db3f22e04da6b80498d00f515e51879e0ffadc115):
// https://celestrak.org/publications/AIAA/2006-6753/AIAA-2006-6753.zip
const DEEP_SPACE_CASES = Object.freeze([
    {
        norad_id: '28129',
        name: 'GPS DEEP SPACE',
        tle_line1: '1 28129U 03058A   06175.57071136 -.00000104  00000-0  10000-3 0   459',
        tle_line2: '2 28129  54.7298 324.8098 0048506 266.2640  93.1663  2.00562768 18443',
        resonance: 0,
        epoch_position_km: { x: 21707.46412351, y: -15318.61752390, z: 0.13551152 },
        epoch_velocity_km_s: { x: 1.304029214, y: 1.816904974, z: 3.161919976 },
        after_120_minutes_position_km: { x: 18616.75971861, y: 3166.15177043, z: 18833.41523210 },
        after_120_minutes_velocity_km_s: { x: -2.076122016, y: 2.838457575, z: 1.586210535 }
    },
    {
        norad_id: '26975',
        name: 'MOLNIYA HALF-DAY RESONANCE',
        tle_line1: '1 26975U 78066F   06174.85818871  .00000620  00000-0  10000-3 0  6809',
        tle_line2: '2 26975  68.4714 236.1303 5602877 123.7484 302.5767  2.05657553 67521',
        resonance: 2,
        epoch_position_km: { x: -14506.92313768, y: -21613.56043281, z: 10.05018894 },
        epoch_velocity_km_s: { x: 2.212943308, y: 1.159970892, z: 3.020600202 },
        after_120_minutes_position_km: { x: 7309.62197950, y: 6076.00713664, z: 6800.08705263 },
        after_120_minutes_velocity_km_s: { x: 1.300543383, y: 5.322579615, z: -4.788746312 }
    },
    {
        norad_id: '28626',
        name: 'SYNCHRONOUS RESONANCE',
        tle_line1: '1 28626U 05008A   06176.46683397 -.00000205  00000-0  10000-3 0  2190',
        tle_line2: '2 28626   0.0019 286.9433 0000335  13.7918  55.6504  1.00270176  4891',
        resonance: 1,
        epoch_position_km: { x: 42080.71852213, y: -2646.86387436, z: 0.81851294 },
        epoch_velocity_km_s: { x: 0.193105177, y: 3.068688251, z: 0.000438449 },
        after_120_minutes_position_km: { x: 37740.00085593, y: 18802.76872802, z: 3.45512584 },
        after_120_minutes_velocity_km_s: { x: -1.371035206, y: 2.752105932, z: 0.000336883 }
    },
    {
        norad_id: '21897',
        name: 'NEGATIVE BSTAR RESONANT CASE',
        tle_line1: '1 21897U 92011A   06176.02341244 -.00001273  00000-0 -13525-3 0  3044',
        tle_line2: '2 21897  62.1749 198.0096 7421690 253.0462  20.1561  2.01269994104880',
        resonance: 2,
        negative_bstar: true,
        epoch_position_km: { x: -14464.72135182, y: -4699.19517587, z: 0.06681686 },
        epoch_velocity_km_s: { x: -3.249312013, y: -3.281032707, z: 4.007046940 },
        after_120_minutes_position_km: { x: -19410.46286123, y: -19143.03318969, z: 23114.05522619 },
        after_120_minutes_velocity_km_s: { x: 0.508602237, y: -1.156882269, z: 2.379923455 }
    }
]);
for (const fixture of DEEP_SPACE_CASES) {
    const deepPrepared = service.prepareObject(fixture);
    assert.strictEqual(deepPrepared.ok, true, deepPrepared.error?.message);
    assert.strictEqual(deepPrepared.value.satrec.method, 'd');
    assert.strictEqual(deepPrepared.value.satrec.irez, fixture.resonance);
    if (fixture.negative_bstar) assert(deepPrepared.value.satrec.bstar < 0);
    const deepState = service.propagate(deepPrepared.value, deepPrepared.value.element_epoch_utc);
    assert.strictEqual(deepState.ok, true, deepState.error?.message);
    assert.strictEqual(validateStateVector(deepState.value).valid, true);
    if (fixture.epoch_position_km) {
        assert(vectorError(deepState.value.position_km, fixture.epoch_position_km) <= 0.005);
        assert(vectorError(deepState.value.velocity_km_s, fixture.epoch_velocity_km_s) <= 0.000005);
        const after120Minutes = service.propagate(
            deepPrepared.value,
            new Date(Date.parse(deepPrepared.value.element_epoch_utc) + 120 * 60 * 1000)
        );
        assert.strictEqual(after120Minutes.ok, true, after120Minutes.error?.message);
        assert(vectorError(
            after120Minutes.value.position_km,
            fixture.after_120_minutes_position_km
        ) <= 0.005);
        assert(vectorError(
            after120Minutes.value.velocity_km_s,
            fixture.after_120_minutes_velocity_km_s
        ) <= 0.000005);
    }
}

const normalizedElementSet = service.prepareObject({
    object_id: 'obx:norad:25544',
    name: 'ISS alias test',
    element_set: {
        element_set_id: 'elset:test:iss',
        line1: ISS_TLE.tle_line1,
        line2: ISS_TLE.tle_line2,
        epoch: '2019-06-05T12:12:58Z'
    }
});
assert.strictEqual(normalizedElementSet.ok, true);
assert.strictEqual(normalizedElementSet.value.element_set_id, 'elset:test:iss');

const missingTle = service.prepareObject({ norad_id: '42', name: 'Missing TLE' });
assert.strictEqual(missingTle.ok, false);
assert.strictEqual(missingTle.error.code, PROPAGATION_ERROR_CODE.MISSING_TLE);
assert.strictEqual(missingTle.error.stage, 'PREPARE');

const invalidEpoch = service.propagate(prepared.value, 'not-a-time');
assert.strictEqual(invalidEpoch.ok, false);
assert.strictEqual(invalidEpoch.error.code, PROPAGATION_ERROR_CODE.INVALID_EPOCH);
assert.strictEqual(invalidEpoch.error.object_id, prepared.value.object_id);

const unavailable = createTlePropagationService({ satelliteLib: null }).prepareObject(ISS_TLE);
assert.strictEqual(unavailable.ok, false);
assert.strictEqual(unavailable.error.code, PROPAGATION_ERROR_CODE.LIBRARY_UNAVAILABLE);
assert.strictEqual(unavailable.error.recoverable, false);

const VALID_SATREC_STUB = Object.freeze({
    error: 0,
    epochyr: 26,
    epochdays: 200,
    jdsatepoch: 2461240,
    ndot: 0,
    nddot: 0,
    bstar: 0,
    inclo: 0.9,
    nodeo: 1,
    ecco: 0.001,
    argpo: 2,
    mo: 3,
    no: 0.06
});

const invalidVelocityService = createTlePropagationService({
    satelliteLib: {
        twoline2satrec: () => ({ ...VALID_SATREC_STUB }),
        propagate: () => ({
            position: { x: 7000, y: 0, z: 0 },
            velocity: { x: Number.NaN, y: 0, z: 0 }
        })
    }
});
const invalidVelocity = invalidVelocityService.propagate(ISS_TLE, '2026-07-19T00:00:00Z');
assert.strictEqual(invalidVelocity.ok, false);
assert.strictEqual(invalidVelocity.error.code, PROPAGATION_ERROR_CODE.INVALID_VELOCITY);
assert.strictEqual(invalidVelocity.error.timestamp, '2026-07-19T00:00:00.000Z');

const initializationErrorService = createTlePropagationService({
    satelliteLib: {
        twoline2satrec: () => ({ error: 3 }),
        propagate: () => null
    }
});
const initializationError = initializationErrorService.prepareObject(ISS_TLE);
assert.strictEqual(initializationError.ok, false);
assert.strictEqual(initializationError.error.code, PROPAGATION_ERROR_CODE.TLE_INVALID);
assert.strictEqual(initializationError.error.propagator_error_code, 3);

const malformedBstar = service.prepareObject({
    satellite_name: 'MALFORMED BSTAR',
    norad_id: '44714',
    tle_line1: '1 44714U 19074B   26193.55886833  .00056372  00000+0  ABCDE-F 0  9990',
    tle_line2: '2 44714  53.1517 306.9551 0004043 312.7639  47.3031 15.53348743368159'
});
assert.strictEqual(malformedBstar.ok, false);
assert.strictEqual(malformedBstar.error.code, PROPAGATION_ERROR_CODE.TLE_INVALID);

const thrownPropagationService = createTlePropagationService({
    satelliteLib: {
        twoline2satrec: () => ({ ...VALID_SATREC_STUB }),
        propagate: () => { throw new Error('synthetic SGP4 failure'); }
    }
});
const thrownPropagation = thrownPropagationService.propagate(ISS_TLE, '2026-07-19T00:00:00Z');
assert.strictEqual(thrownPropagation.ok, false);
assert.strictEqual(thrownPropagation.error.code, PROPAGATION_ERROR_CODE.PROPAGATION_FAILED);
assert.match(thrownPropagation.error.message, /synthetic SGP4 failure/);

const belowEarthService = createTlePropagationService({
    satelliteLib: {
        twoline2satrec: () => ({ ...VALID_SATREC_STUB }),
        propagate: () => ({
            position: { x: 6300, y: 0, z: 0 },
            velocity: { x: 0, y: 7.9, z: 0 }
        })
    }
});
const belowEarth = belowEarthService.propagate(ISS_TLE, '2026-07-19T00:00:00Z');
assert.strictEqual(belowEarth.ok, false);
assert.strictEqual(belowEarth.error.code, PROPAGATION_ERROR_CODE.BELOW_EARTH);

const invalidProvenance = service.propagate({
    ...ISS_TLE,
    provenance: {
        dataset_id: 'dataset:invalid-provenance',
        dataset_hash: 'not a valid hash'
    }
}, '2019-06-05T12:12:58Z');
assert.strictEqual(invalidProvenance.ok, false);
assert.strictEqual(invalidProvenance.error.code, PROPAGATION_ERROR_CODE.STATE_VALIDATION_FAILED);
assert.strictEqual(invalidProvenance.error.object_id, 'obx:norad:25544');

const qualityAware = service.prepareObject({
    ...ISS_TLE,
    quality_flags: ['TLE_STALE', 'CATALOG_WARNING'],
    provenance: {
        dataset_id: 'dataset:quality-aware',
        dataset_hash: 'test:quality-aware',
        source_status: 'DEGRADED',
        partial_update: true
    }
});
assert.strictEqual(qualityAware.ok, true);
assert.deepStrictEqual(qualityAware.value.input_quality_flags, [
    'CATALOG_WARNING',
    'SOURCE_DATA_DEGRADED',
    'SOURCE_PARTIAL_UPDATE',
    'TLE_STALE'
]);
const qualityState = service.propagate(qualityAware.value, qualityAware.value.element_epoch_utc);
assert.strictEqual(qualityState.ok, true);
for (const flag of qualityAware.value.input_quality_flags) {
    assert(qualityState.value.quality_flags.includes(flag));
}

console.log('propagationService tests passed');
