import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createOrbitGuideState, loadOrbitGuides, parseOrbitGuide, sampleOrbitGuide, orbitGuideWindow, ORBIT_GUIDE_ROOT } from '../js/solarSystemOrbitGuides.js';
import { interpolateBodyVectorKm, parseSolarSystemEphemerisData, solarSystemScenePositionForBody, solarSystemEphemerisBounds, vectorDistanceKm } from '../js/solarSystemEphemeris.js';

const manifest = JSON.parse(fs.readFileSync(`${ORBIT_GUIDE_ROOT}manifest.json`));
const playback = parseSolarSystemEphemerisData(JSON.parse(fs.readFileSync('data/ephemeris/solar_system_jpl_horizons_2020_2035_6h.json')));
const beforeBounds = solarSystemEphemerisBounds(playback);
let samples = 0, worstKm = 0, maxPoints = 0;
for (const [key, descriptor] of Object.entries(manifest.bodies)) {
    const bytes = fs.readFileSync(`${ORBIT_GUIDE_ROOT}${descriptor.file}`);
    assert.equal(bytes.length, descriptor.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), descriptor.sha256);
    const raw = JSON.parse(bytes);
    const data = parseOrbitGuide(raw, key);
    assert(data.timeMs[0] < beforeBounds.minTimeMs && data.timeMs.at(-1) > beforeBounds.maxTimeMs);
    for (const reference of raw.validation.samples) {
        const interpolated = interpolateBodyVectorKm(data, key, new Date(reference.dateUtc));
        const error = vectorDistanceKm(interpolated.vector, reference.vector);
        assert(error <= 100, `${key} guide interpolation differs by ${error} km`);
        worstKm = Math.max(worstKm, error); samples++;
    }
    // Both playback boundaries and monthly epochs have enough guide data.
    for (let year = 2020; year <= 2035; year++) for (let month = 0; month < 12; month++) {
        assert(orbitGuideWindow(data, key, new Date(Date.UTC(year, month, 1))), `${key} missing a revolution in ${year}-${month + 1}`);
    }
    for (const time of [beforeBounds.minTimeMs, Date.parse('2026-06-07T09:00:00Z'), beforeBounds.maxTimeMs]) {
        const date = new Date(time);
        const anchor = solarSystemScenePositionForBody(playback, key, date).position;
        const guide = sampleOrbitGuide(data, key, date, { anchor });
        assert(guide.minTimeMs < time && guide.maxTimeMs > time);
        assert(guide.points.every(point => point.toArray().every(Number.isFinite)));
        assert(guide.points[guide.anchorIndex].distanceTo(anchor) < 1e-12);
        assert(guide.points[0].distanceTo(guide.points.at(-1)) > 0, 'actual endpoints are not welded together');
        let sweep = 0;
        for (let i = 1; i < guide.points.length; i++) {
            const a = guide.points[i - 1], b = guide.points[i];
            const delta = Math.atan2(b.z, b.x) - Math.atan2(a.z, a.x);
            sweep += Math.atan2(Math.sin(delta), Math.cos(delta));
        }
        assert(Math.abs(sweep - 2*Math.PI) < 1e-6, `${key}: sweep ${sweep} is not a complete revolution`);
        maxPoints = Math.max(maxPoints, guide.points.length);
        assert(guide.points.length <= 4097, 'adaptive guide geometry remains bounded');
    }
    assert.equal(orbitGuideWindow(data, key, new Date(data.timeMs[0])), null, 'insufficient coverage cannot manufacture a revolution');
    assert.throws(() => parseOrbitGuide({ ...raw, metadata: { ...raw.metadata, units: 'AU' } }, key));
}
assert.equal(samples, 136);
assert.deepEqual(solarSystemEphemerisBounds(playback), beforeBounds, 'guide ranges never widen playback');

const calls = [];
let failJupiter = true;
const fetchLocal = async url => {
    calls.push(url);
    if (url.includes('/jupiter-') && failJupiter) return { ok: false };
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(url)) };
};
const state = createOrbitGuideState();
const loading = loadOrbitGuides(state, fetchLocal);
assert.equal(loadOrbitGuides(state, fetchLocal), loading, 'concurrent viewers share one pending load');
await loading;
assert.equal(state.status, 'partial'); assert.equal(state.data.size, 7);
const firstCalls = calls.length;
failJupiter = false;
await loadOrbitGuides(state, fetchLocal);
assert.equal(state.status, 'ready'); assert.equal(state.data.size, 8);
assert.equal(calls.length - firstCalls, 1, 'retry reuses the seven accepted guide files');
await loadOrbitGuides(state, fetchLocal);
assert.equal(calls.length - firstCalls, 1, 'completed guide data stays cached');
console.log(`JPL orbit guides passed: ${samples} samples, worst ${worstKm.toFixed(3)} km; maximum ${maxPoints} render points/body.`);
