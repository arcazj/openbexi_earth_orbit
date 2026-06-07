import * as THREE from 'three';

export const SOLAR_SYSTEM_EPHEMERIS_URL = 'data/ephemeris/solar_system_jpl_horizons_2020_2035_6h.json';
export const SOLAR_SYSTEM_REFERENCE_SAMPLES_URL = 'data/ephemeris/solar_system_jpl_horizons_reference_samples.json';

export const AU_KM = 149597870.7;
export const SOLAR_SYSTEM_AU_SCENE_SCALE = 16;
export const MOON_DISTANCE_VISUAL_MULTIPLIER = 80;

const DAY_MS = 86400000;
const BODY_CATEGORY_THRESHOLD_KM = {
    inner: 5000,
    moon: 5000,
    outer: 50000
};

export function createSolarSystemEphemerisState() {
    return {
        status: 'idle',
        data: null,
        error: null,
        promise: null,
        lastMode: 'approximate visual fallback',
        lastWarning: 'JPL-derived ephemeris has not loaded yet.'
    };
}

export function loadSolarSystemEphemeris(state, fetchImpl = globalThis.fetch) {
    if (!state) return Promise.reject(new Error('Missing ephemeris state'));
    if (state.status === 'ready' && state.data) return Promise.resolve(state.data);
    if (state.promise) return state.promise;
    if (typeof fetchImpl !== 'function') {
        const error = new Error('Fetch API is unavailable for local ephemeris loading');
        state.status = 'error';
        state.error = error;
        state.lastWarning = error.message;
        return Promise.reject(error);
    }

    state.status = 'loading';
    state.lastWarning = 'Loading local JPL-derived ephemeris...';
    state.promise = fetchImpl(SOLAR_SYSTEM_EPHEMERIS_URL)
        .then(response => {
            if (!response?.ok) {
                throw new Error(`Unable to load ${SOLAR_SYSTEM_EPHEMERIS_URL}`);
            }
            return response.json();
        })
        .then(raw => {
            const data = parseSolarSystemEphemerisData(raw);
            state.status = 'ready';
            state.data = data;
            state.error = null;
            state.lastMode = 'JPL-derived ephemeris';
            state.lastWarning = '';
            return data;
        })
        .catch(error => {
            state.status = 'error';
            state.error = error;
            state.lastMode = 'approximate visual fallback';
            state.lastWarning = error?.message || 'Local ephemeris failed to load';
            throw error;
        })
        .finally(() => {
            state.promise = null;
        });
    return state.promise;
}

export function parseSolarSystemEphemerisData(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Ephemeris payload is missing');
    const { metadata, times, bodies } = raw;
    if (!metadata || !Array.isArray(times) || !bodies) {
        throw new Error('Ephemeris payload is missing metadata, times, or bodies');
    }
    const timeMs = times.map(value => {
        const ms = Date.parse(value);
        if (!Number.isFinite(ms)) throw new Error(`Invalid ephemeris timestamp: ${value}`);
        return ms;
    });
    if (timeMs.length < 2) throw new Error('Ephemeris requires at least two timestamps');
    for (let i = 1; i < timeMs.length; i += 1) {
        if (timeMs[i] <= timeMs[i - 1]) throw new Error('Ephemeris timestamps must be strictly increasing');
    }
    Object.entries(bodies).forEach(([key, body]) => {
        if (!Array.isArray(body.vectors) || body.vectors.length !== times.length) {
            throw new Error(`Ephemeris body ${key} has an invalid vector table`);
        }
        body.vectors.forEach((vector, index) => {
            if (!Array.isArray(vector) || vector.length < 6 || vector.some(value => !Number.isFinite(value))) {
                throw new Error(`Ephemeris body ${key} has an invalid vector at index ${index}`);
            }
        });
    });
    return {
        metadata,
        times,
        timeMs,
        bodies
    };
}

export function interpolateBodyVectorKm(ephemerisData, bodyKey, simDate) {
    if (!ephemerisData?.timeMs || !ephemerisData?.bodies?.[bodyKey]) {
        return { status: 'unavailable', warning: `No ephemeris data for ${bodyKey}` };
    }
    const time = simDate instanceof Date ? simDate.getTime() : Date.parse(simDate);
    if (!Number.isFinite(time)) {
        return { status: 'invalid-date', warning: 'Invalid simulation date' };
    }
    const { timeMs } = ephemerisData;
    if (time < timeMs[0] || time > timeMs[timeMs.length - 1]) {
        return {
            status: 'out-of-range',
            warning: `Simulation date is outside ${ephemerisDateRangeText(ephemerisData)}`
        };
    }

    let lo = 0;
    let hi = timeMs.length - 1;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (timeMs[mid] === time) {
            return {
                status: 'ok',
                vector: ephemerisData.bodies[bodyKey].vectors[mid],
                index: mid,
                fraction: 0
            };
        }
        if (timeMs[mid] < time) lo = mid + 1;
        else hi = mid - 1;
    }
    const i0 = Math.max(0, hi);
    const i1 = Math.min(timeMs.length - 1, lo);
    if (i0 === i1) {
        return {
            status: 'ok',
            vector: ephemerisData.bodies[bodyKey].vectors[i0],
            index: i0,
            fraction: 0
        };
    }
    const fraction = (time - timeMs[i0]) / (timeMs[i1] - timeMs[i0]);
    const v0 = ephemerisData.bodies[bodyKey].vectors[i0];
    const v1 = ephemerisData.bodies[bodyKey].vectors[i1];
    return {
        status: 'ok',
        vector: v0.map((value, index) => value + (v1[index] - value) * fraction),
        index: i0,
        fraction
    };
}

export function solarSystemScenePositionForBody(ephemerisData, bodyKey, simDate) {
    if (bodyKey === 'moon') {
        const earth = interpolateBodyVectorKm(ephemerisData, 'earth', simDate);
        const moon = interpolateBodyVectorKm(ephemerisData, 'moon', simDate);
        if (earth.status !== 'ok') return earth;
        if (moon.status !== 'ok') return moon;
        const earthPosition = heliocentricVectorKmToScene(earth.vector);
        const relativeKm = [
            moon.vector[0] - earth.vector[0],
            moon.vector[1] - earth.vector[1],
            moon.vector[2] - earth.vector[2]
        ];
        const relativeScene = heliocentricVectorKmToScene(relativeKm)
            .multiplyScalar(MOON_DISTANCE_VISUAL_MULTIPLIER);
        return {
            status: 'ok',
            position: earthPosition.add(relativeScene),
            vectorKm: moon.vector,
            relativeToEarthKm: relativeKm,
            mode: 'JPL-derived ephemeris'
        };
    }
    const result = interpolateBodyVectorKm(ephemerisData, bodyKey, simDate);
    if (result.status !== 'ok') return result;
    return {
        status: 'ok',
        position: heliocentricVectorKmToScene(result.vector),
        vectorKm: result.vector,
        mode: 'JPL-derived ephemeris'
    };
}

export function heliocentricVectorKmToScene(vector) {
    const scale = SOLAR_SYSTEM_AU_SCENE_SCALE / AU_KM;
    return new THREE.Vector3(
        vector[0] * scale,
        vector[2] * scale,
        vector[1] * scale
    );
}

export function ephemerisDateRangeText(ephemerisData) {
    const range = ephemerisData?.metadata?.dateRange;
    if (!range?.startUtc || !range?.stopUtc) return 'unknown date range';
    return `${range.startUtc.slice(0, 10)} to ${range.stopUtc.slice(0, 10)}`;
}

export function solarSystemEphemerisStatusText(state) {
    if (!state) return 'Ephemeris: approximate visual fallback';
    if (state.status === 'ready' && state.data) {
        if (state.lastMode === 'approximate visual fallback' && state.lastWarning) {
            return `Ephemeris warning: ${state.lastWarning}; using approximate visual fallback`;
        }
        return `Ephemeris: JPL-derived Horizons, ${ephemerisDateRangeText(state.data)}`;
    }
    if (state.status === 'loading') return 'Ephemeris: loading local JPL-derived data';
    if (state.status === 'error') return `Ephemeris warning: ${state.lastWarning}`;
    return 'Ephemeris warning: approximate visual fallback until local data loads';
}

export function ephemerisThresholdForBody(ephemerisData, bodyKey) {
    const category = ephemerisData?.bodies?.[bodyKey]?.category || 'inner';
    return BODY_CATEGORY_THRESHOLD_KM[category] || BODY_CATEGORY_THRESHOLD_KM.inner;
}

export function vectorDistanceKm(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function daysBetweenSamples(ephemerisData) {
    if (!ephemerisData?.timeMs || ephemerisData.timeMs.length < 2) return NaN;
    return (ephemerisData.timeMs[1] - ephemerisData.timeMs[0]) / DAY_MS;
}
