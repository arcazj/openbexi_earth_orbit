import assert from 'node:assert/strict';
import { SIDEREAL_ROTATION_DAYS, ROTATION_EPOCH_MS, solarSystemRotationRadians } from '../js/solarSystemRotation.js';

const TAU = 2 * Math.PI;
const angleDistance = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
// Independent periods from the cited JPL table and NASA lunar fact sheet.
const periods = { mercury: 58.6462, venus: -243.018, earth: 0.99726968, moon: 655.720 / 24,
    mars: 1.02595676, jupiter: 0.41354, saturn: 0.44401, uranus: -0.71833, neptune: 0.67125 };
assert.deepEqual(SIDEREAL_ROTATION_DAYS, periods);
for (const [body, days] of Object.entries(periods)) {
    const periodMs = Math.abs(days) * 86400000;
    const quarterTurn = solarSystemRotationRadians(body, ROTATION_EPOCH_MS + periodMs / 4);
    assert(angleDistance(quarterTurn, days < 0 ? TAU / 4 : 3 * TAU / 4) < 1e-10, `${body}: direction in scene coordinates`);
    assert(angleDistance(solarSystemRotationRadians(body, ROTATION_EPOCH_MS + periodMs), 0) < 1e-10, `${body}: full sidereal rotation`);
    assert(angleDistance(solarSystemRotationRadians(body, ROTATION_EPOCH_MS - periodMs / 4), TAU - quarterTurn) < 1e-10, `${body}: reversible rotation`);
    const epoch = Date.parse('2026-11-08T12:34:56Z');
    assert.equal(solarSystemRotationRadians(body, epoch), solarSystemRotationRadians(body, epoch), 'paused date is deterministic');
}
assert.notEqual(solarSystemRotationRadians('earth', ROTATION_EPOCH_MS + 3600000), solarSystemRotationRadians('jupiter', ROTATION_EPOCH_MS + 3600000));
assert.throws(() => solarSystemRotationRadians('unknown', ROTATION_EPOCH_MS), RangeError);
console.log('Nominal solar rotation tests passed (rate/direction only, not absolute body attitude).');
