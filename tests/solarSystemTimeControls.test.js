import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSimulationClock } from '../js/simulationClock.js';
import { SOLAR_TIME_UNITS, solarTimeWindow, solarSystemTimeBounds } from '../js/solarSystemTimeControls.js';
import { educationalPlanetPosition, EDUCATIONAL_BOUNDS } from '../js/solarSystemEducation.js';
import { AU_KM, SOLAR_SYSTEM_AU_SCENE_SCALE, parseSolarSystemEphemerisData, interpolateBodyVectorKm, vectorDistanceKm,
    solarSystemScenePositionForBody } from '../js/solarSystemEphemeris.js';

const data = parseSolarSystemEphemerisData(JSON.parse(fs.readFileSync('data/ephemeris/solar_system_jpl_horizons_2020_2035_6h.json')));
const reference = JSON.parse(fs.readFileSync('data/ephemeris/solar_system_jpl_horizons_reference_samples.json'));
assert.match(data.metadata.timeScale, /TIME_TYPE=UT/);
assert.match(reference.metadata.timeScale, /TIME_TYPE=UT/);
let worstErrorKm = 0;
for (const sample of reference.samples) {
    const result = interpolateBodyVectorKm(data, sample.body, new Date(sample.dateUtc));
    const error = vectorDistanceKm(result.vector, sample.positionKm);
    worstErrorKm = Math.max(worstErrorKm, error);
    assert(error < 0.1, `${sample.body}: off-grid Hermite error ${error} km exceeds 100 m regression limit`);
    assert(vectorDistanceKm(result.vector.slice(3), sample.velocityKmPerSec) < 0.0001, `${sample.body} velocity matches Horizons within 0.1 m/s`);
    if (sample.body === 'moon') continue;
    const approximate = educationalPlanetPosition(sample.body, new Date(sample.dateUtc));
    const km = approximate.toArray();
    const vector = [km[0], km[2], km[1]].map(value => value * AU_KM / SOLAR_SYSTEM_AU_SCENE_SCALE);
    assert(vectorDistanceKm(vector, sample.positionKm) / Math.hypot(...sample.positionKm) < 0.02,
        `${sample.body}: approximate orientation remains within the educational comparison tolerance`);
}
const time = new Date('2026-06-07T09:00:00Z');
const moon = solarSystemScenePositionForBody(data, 'moon', time);
const earth = solarSystemScenePositionForBody(data, 'earth', time);
assert(Math.abs(moon.position.distanceTo(earth.position) * AU_KM / SOLAR_SYSTEM_AU_SCENE_SCALE - Math.hypot(...moon.relativeToEarthKm)) < 1e-5,
    'precise Moon distance is not exaggerated');
for (const year of [1000, 1600, 2400, 3000]) {
    for (const body of Object.keys(data.bodies).filter(key => key !== 'moon')) {
        const position = educationalPlanetPosition(body, new Date(`${year}-01-01T00:00:00Z`));
        assert(position.toArray().every(Number.isFinite));
        assert(position.length() > 0);
    }
}
assert.equal(educationalPlanetPosition('earth', new Date('3001-01-01')), null);
const preciseBounds = solarSystemTimeBounds({ options: { educational: false }, ephemerisState: { data } });
assert.deepEqual(solarTimeWindow(preciseBounds.minTimeMs, 30, preciseBounds), {
    minTimeMs: preciseBounds.minTimeMs, maxTimeMs: preciseBounds.minTimeMs + 30 * 86400000
});
assert.deepEqual(solarTimeWindow(time.getTime(), Infinity, preciseBounds), preciseBounds);
const clock = createSimulationClock({ initialTimeMs: time.getTime() });
const original = clock.state().timeMs;
clock.setTimeScale(SOLAR_TIME_UNITS.day); clock.setRate(1); clock.tick(1);
assert.equal(clock.state().timeMs, original + 86400000);
clock.setRate(-1); clock.tick(1); assert.equal(clock.state().timeMs, original);
clock.setRate(0); clock.tick(1); assert.equal(clock.state().timeMs, original);
clock.setBounds(EDUCATIONAL_BOUNDS); clock.setTime(Date.parse('2500-01-01'));
clock.setBounds(preciseBounds);
assert.equal(clock.state().timeMs, preciseBounds.maxTimeMs);
assert.equal(clock.state().rate, 0);
clock.setRate(-1); clock.tick(1); assert(clock.state().timeMs < preciseBounds.maxTimeMs);
clock.clearBounds(); clock.setTimeScale(60000); clock.reset(original, 1); clock.tick(1);
assert.equal(clock.state().timeMs, original + 60000, 'explicit minutes/second retains accelerated satellite playback');
console.log(`Solar time and precision tests passed; worst sampled error ${(worstErrorKm * 1000).toFixed(2)} m.`);
