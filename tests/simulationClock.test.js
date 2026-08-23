import assert from 'assert';
import fs from 'fs';
import { createSimulationClock, SIMULATION_CLOCK_DEFAULTS } from '../js/simulationClock.js';

function run() {
  const start = Date.parse('2026-08-23T00:00:00Z');
  const clock = createSimulationClock({
    initialTimeMs: start,
    initialRate: 2,
    maxFrameGapSeconds: 10
  });
  const stableState = clock.state();

  assert.strictEqual(clock.tick(0.5), stableState, 'clock tick reuses its state object');
  assert.strictEqual(stableState.timeMs, start + 60_000, 'Time x advances minutes per real second');
  clock.setRate(-2);
  clock.tick(0.5);
  assert.strictEqual(stableState.timeMs, start, 'equal reverse Time x returns to the exact original UTC instant');
  clock.setRate(0);
  clock.tick(5);
  assert.strictEqual(stableState.timeMs, start, 'Time x zero pauses the authoritative clock');

  const gapClock = createSimulationClock({ initialTimeMs: start, initialRate: 60 });
  gapClock.tick(30);
  assert.strictEqual(
    gapClock.state().timeMs,
    start + 60 * 60_000 * SIMULATION_CLOCK_DEFAULTS.maxFrameGapSeconds,
    'a background-tab frame gap is capped before advancing simulation time'
  );

  const bounded = createSimulationClock({
    initialTimeMs: start,
    initialRate: 1,
    maxFrameGapSeconds: 10,
    bounds: { minTimeMs: start - 60_000, maxTimeMs: start + 60_000 }
  });
  bounded.tick(2);
  assert.strictEqual(bounded.state().timeMs, start + 60_000, 'clock clamps at the supported ephemeris end');
  assert.strictEqual(bounded.state().boundary, 'end', 'clock reports the reached ephemeris boundary');
  assert.strictEqual(bounded.state().rate, 0, 'clock pauses instead of extrapolating beyond ephemeris data');
  bounded.setRate(-1);
  assert.strictEqual(bounded.state().boundary, null, 'an inward reverse rate leaves the end boundary');
  bounded.tick(2);
  assert.strictEqual(bounded.state().timeMs, start - 60_000, 'reverse time clamps at the supported start');
  assert.strictEqual(bounded.state().boundary, 'start', 'reverse boundary is explicit');
  assert.throws(
    () => bounded.setBounds({ minTimeMs: start + 1, maxTimeMs: start }),
    /minimum time cannot exceed maximum time/,
    'invalid ephemeris bounds fail closed'
  );

  const indexHtml = fs.readFileSync('index.html', 'utf8');
  assert(indexHtml.includes("from './js/simulationClock.js'"), 'index imports the authoritative simulation clock');
  assert(indexHtml.includes('min="-60" max="60"'), 'Time x UI supports deterministic forward and reverse motion');
  assert(indexHtml.includes('simulationClock.tick(dtReal)'), 'animation advances the shared clock once per frame');
  assert(!indexHtml.includes('advanceSolarSystemSimulationMillis'), 'obsolete duplicate Solar System clock code is removed');

  console.log('Simulation clock tests passed');
}

run();
