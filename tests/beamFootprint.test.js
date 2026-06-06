import assert from 'assert';
import {
  beamPatternLossDb,
  estimateArrayBeamwidthDeg,
  surfaceAngularSeparationDeg
} from '../js/coverage/beamFootprint.js';

function nearlyEqual(actual, expected, tolerance, message) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, got ${actual}`
  );
}

function run() {
  nearlyEqual(surfaceAngularSeparationDeg(0, 0, 0, 0), 0, 1e-9, 'same point separation');
  nearlyEqual(surfaceAngularSeparationDeg(0, 179, 0, -179), 2, 1e-6, 'dateline separation');

  const compactArrayBeamwidth = estimateArrayBeamwidthDeg(4, 4, 0.5);
  const largeArrayBeamwidth = estimateArrayBeamwidthDeg(32, 32, 0.5);
  assert(largeArrayBeamwidth < compactArrayBeamwidth, 'larger aperture has narrower beamwidth');

  const hpbw = 8;
  assert.strictEqual(beamPatternLossDb(0, hpbw), 0, 'boresight has no beam loss');
  nearlyEqual(beamPatternLossDb(hpbw, hpbw), 3, 1e-9, 'HPBW produces 3 dB loss');
  assert(beamPatternLossDb(hpbw * 2, hpbw) > beamPatternLossDb(hpbw, hpbw), 'loss grows off boresight');
  assert.strictEqual(beamPatternLossDb(100, hpbw, 30), 30, 'loss clamps to max');

  console.log('Beam footprint tests passed');
}

run();
