import assert from 'assert';
import fs from 'fs';
import { createSimulationClock, SIMULATION_CLOCK_DEFAULTS, simulationRateLabel } from '../js/simulationClock.js';

function run() {
  const start = Date.parse('2026-08-23T00:00:00Z');
  const clock = createSimulationClock({
    initialTimeMs: start,
    initialRate: 2
  });
  const stableState = clock.state();

  assert.strictEqual(clock.tick(0.5), stableState, 'clock tick reuses its state object');
  assert.strictEqual(SIMULATION_CLOCK_DEFAULTS.millisecondsPerWarpSecond, 1000);
  assert.strictEqual(stableState.timeMs, start + 1000, '2× advances two seconds per real second');
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
    start + 60 * 1000 * 30,
    'background-tab elapsed time is retained at the chosen playback speed'
  );

  const bounded = createSimulationClock({
    initialTimeMs: start,
    initialRate: 1,
    bounds: { minTimeMs: start - 60_000, maxTimeMs: start + 60_000 }
  });
  bounded.tick(120);
  assert.strictEqual(bounded.state().timeMs, start + 60_000, 'clock clamps at the supported ephemeris end');
  assert.strictEqual(bounded.state().boundary, 'end', 'clock reports the reached ephemeris boundary');
  assert.strictEqual(bounded.state().rate, 0, 'clock pauses instead of extrapolating beyond ephemeris data');
  bounded.setRate(-1);
  assert.strictEqual(bounded.state().boundary, null, 'an inward reverse rate leaves the end boundary');
  bounded.tick(120);
  assert.strictEqual(bounded.state().timeMs, start - 60_000, 'reverse time clamps at the supported start');
  assert.strictEqual(bounded.state().boundary, 'start', 'reverse boundary is explicit');
  assert.throws(
    () => bounded.setBounds({ minTimeMs: start + 1, maxTimeMs: start }),
    /minimum time cannot exceed maximum time/,
    'invalid ephemeris bounds fail closed'
  );

  let wallTime = start;
  const live = createSimulationClock({ initialLive: true, now: () => wallTime });
  assert.equal(live.state().timeMs, start);
  assert.equal(live.state().rate, 1);
  assert.equal(simulationRateLabel(live), 'Live · 1×');
  wallTime += 120000;
  live.tick(0.016);
  assert.equal(live.state().timeMs, wallTime, 'Live resynchronizes after sleep or a system clock correction');
  live.setRate(0);
  wallTime += 60000;
  live.tick(60);
  assert.equal(live.state().timeMs, start + 120000, 'pause freezes the UTC instant');
  assert.equal(live.state().live, false);
  live.setRate(1); live.tick(60);
  assert.equal(live.state().timeMs, start + 180000, 'manual 1× retains full elapsed time');
  assert.equal(simulationRateLabel(live), '1×');
  live.setTimeScale(86400000); live.tick(1);
  assert.equal(live.state().timeMs, start + 180000 + 86400000);
  assert.equal(simulationRateLabel(live, 'day'), '1 day/s');
  live.goLive();
  assert.equal(live.timeScale(), 1000, 'Live resets accelerated units');
  assert.equal(live.state().timeMs, wallTime);
  live.setBounds({ minTimeMs: start, maxTimeMs: wallTime + 1000 });
  wallTime += 2000; live.tick(2);
  assert.equal(live.state().timeMs, wallTime - 1000, 'Live respects validated coverage');
  assert.equal(live.state().boundary, 'end');
  assert.equal(live.state().live, false);
  assert.equal(live.state().rate, 0);
  live.goLive();
  assert.equal(live.state().live, false, 'Live cannot bypass a dataset boundary');
  live.clearBounds(); live.goLive();
  wallTime -= 5000; live.tick(1);
  assert.equal(live.state().timeMs, wallTime, 'Live follows corrected system UTC in either direction');
  live.reset(start, 0); live.tick(100);
  assert.equal(live.state().timeMs, start, 'manual date selection leaves Live');

  const indexHtml = fs.readFileSync('index.html', 'utf8');
  assert(indexHtml.includes("from './js/simulationClock.js'"), 'index imports the authoritative simulation clock');
  assert(indexHtml.includes('min="-60" max="60"'), 'Time x UI supports deterministic forward and reverse motion');
  assert(indexHtml.includes('simulationClock.tick(dtReal)'), 'animation advances the shared clock once per frame');
  assert(!indexHtml.includes('advanceSolarSystemSimulationMillis'), 'obsolete duplicate Solar System clock code is removed');

  console.log('Simulation clock tests passed');
}

run();
