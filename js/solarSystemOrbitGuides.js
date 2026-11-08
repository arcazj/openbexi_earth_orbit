import { parseSolarSystemEphemerisData, interpolateBodyVectorKm, heliocentricVectorKmToScene } from './solarSystemEphemeris.js';

export const ORBIT_GUIDE_ROOT = 'data/ephemeris/orbits/';
export const ORBIT_GUIDE_BODIES = Object.freeze(['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
const TURN = Math.PI * 2;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function createOrbitGuideState() {
    return { status: 'idle', data: new Map(), errors: [], revision: 0, promise: null, manifest: null };
}

export function parseOrbitGuide(raw, bodyKey) {
    const metadata = raw?.metadata;
    if (metadata?.purpose !== 'orbit-guides-only' || metadata.bodyKey !== bodyKey ||
        metadata.center !== '500@10' || metadata.referencePlane !== 'ECLIPTIC' ||
        metadata.referenceFrame !== 'ICRF' || metadata.vectorCorrection !== 'NONE' || metadata.units !== 'km and km/s' ||
        !metadata.timeScale?.includes('TIME_TYPE=UT') || Object.keys(raw.bodies || {}).join() !== bodyKey) {
        throw new Error('Incompatible JPL orbit guide');
    }
    const data = parseSolarSystemEphemerisData(raw);
    const vectors = data.bodies[bodyKey].vectors;
    data.longitudes = new Float64Array(vectors.length);
    data.longitudes[0] = Math.atan2(vectors[0][1], vectors[0][0]);
    for (let i = 1; i < vectors.length; i++) {
        const delta = wrap(Math.atan2(vectors[i][1], vectors[i][0]) - data.longitudes[i - 1]);
        if (!(delta > 0 && delta < Math.PI)) throw new Error('Orbit guide longitude is not increasing');
        data.longitudes[i] = data.longitudes[i - 1] + delta;
    }
    return data;
}

export function loadOrbitGuides(state, fetchImpl = globalThis.fetch) {
    if (state.status === 'ready') return Promise.resolve(state);
    if (state.promise) return state.promise;
    state.status = 'loading';
    state.errors = [];
    state.promise = (async () => {
        if (!state.manifest) {
            const response = await fetchImpl(`${ORBIT_GUIDE_ROOT}manifest.json`);
            if (!response.ok) throw new Error('Orbit guide manifest unavailable');
            const manifest = await response.json();
            if (manifest.schemaVersion !== 1 || manifest.purpose !== 'orbit-guides-only' ||
                Object.keys(manifest.bodies || {}).sort().join() !== [...ORBIT_GUIDE_BODIES].sort().join()) {
                throw new Error('Invalid orbit guide manifest');
            }
            state.manifest = manifest;
        }
        // Serial local reads avoid competing with the playback table and textures.
        for (const key of ORBIT_GUIDE_BODIES) {
            if (state.data.has(key)) continue;
            try {
                const descriptor = state.manifest.bodies[key];
                if (!new RegExp(`^${key}-[a-f0-9]{16}\\.json$`).test(descriptor.file)) throw new Error('Invalid guide filename');
                const response = await fetchImpl(`${ORBIT_GUIDE_ROOT}${descriptor.file}`);
                if (!response.ok) throw new Error('Guide unavailable');
                state.data.set(key, parseOrbitGuide(await response.json(), key));
                state.revision++;
            } catch (error) { state.errors.push(`${key}: ${error.message}`); }
        }
        state.status = state.data.size === ORBIT_GUIDE_BODIES.length ? 'ready' : 'partial';
    })().catch(error => {
        state.status = 'error'; state.errors.push(error.message);
    }).finally(() => { state.promise = null; });
    return state.promise;
}

function longitudeAt(data, key, time) {
    const sample = interpolateBodyVectorKm(data, key, new Date(time));
    if (sample.status !== 'ok') return NaN;
    const reference = data.longitudes[sample.index];
    return reference + wrap(Math.atan2(sample.vector[1], sample.vector[0]) - reference);
}

function timeAtLongitude(data, key, angle) {
    const phases = data.longitudes;
    if (angle < phases[0] || angle > phases.at(-1)) return NaN;
    let lo = 0, hi = phases.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (phases[mid] < angle) lo = mid;
        else hi = mid;
    }
    let start = data.timeMs[lo], stop = data.timeMs[hi];
    for (let i = 0; i < 24; i++) {
        const middle = (start + stop) / 2;
        if (longitudeAt(data, key, middle) < angle) start = middle;
        else stop = middle;
    }
    return (start + stop) / 2;
}

export function orbitGuideWindow(data, key, date) {
    if (!data) return null;
    const centerTimeMs = date.getTime();
    const phase = longitudeAt(data, key, centerTimeMs);
    if (!Number.isFinite(phase)) return null;
    // A full heliocentric longitude sweep around the selected epoch. Perturbed
    // positions at the two ends need not coincide; never insert a closing chord.
    const minTimeMs = timeAtLongitude(data, key, phase - Math.PI);
    const maxTimeMs = timeAtLongitude(data, key, phase + Math.PI);
    if (![minTimeMs, maxTimeMs].every(Number.isFinite)) return null;
    return { minTimeMs, maxTimeMs, centerTimeMs, longitudeSpan: TURN };
}

export function sampleOrbitGuide(data, key, date, { anchor = null, maxChordError = 0.0016 } = {}) {
    const window = orbitGuideWindow(data, key, date);
    if (!window) return null;
    const position = time => heliocentricVectorKmToScene(interpolateBodyVectorKm(data, key, new Date(time)).vector);
    const points = [position(window.minTimeMs)];
    function append(start, left, stop, right, depth = 0) {
        const middle = (start + stop) / 2;
        const actual = position(middle);
        const chordMiddle = left.clone().add(right).multiplyScalar(.5);
        if (depth < 12 && actual.distanceTo(chordMiddle) > maxChordError) {
            append(start, left, middle, actual, depth + 1);
            append(middle, actual, stop, right, depth + 1);
        } else points.push(right);
    }
    const current = anchor?.clone() || position(window.centerTimeMs);
    append(window.minTimeMs, points[0], window.centerTimeMs, current);
    const anchorIndex = points.length - 1;
    append(window.centerTimeMs, current, window.maxTimeMs, position(window.maxTimeMs));
    return { ...window, points, anchorIndex };
}
