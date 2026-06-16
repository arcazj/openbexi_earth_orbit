// decayPredictor.js
// -------------------------------------------------------------
// Lightweight decay / re-entry estimation using satellite.js.
// The goal is to classify satellites as CONFIRMED (already re-entered)
// or PREDICTED (likely to decay within the next few months), and to
// provide a deterministic window for upcoming re-entries.
//
// Heuristics (documented):
//  - Altitude threshold: 120 km. Crossing below this altitude is
//    treated as atmospheric re-entry.
//  - Backward search window: 60 days. If propagation fails or altitude
//    drops below the threshold in this window, the decay is marked
//    CONFIRMED.
//  - Forward prediction horizon: configurable (default 180 days). Only
//    satellites with current altitude below 2,000 km are propagated
//    forward to limit cost.
//  - Step size: 30 minutes for the forward search, 2 hours for a fast
//    backward scan. These values balance performance and determinism.
//  - Confidence: increases when the estimated decay is sooner and when
//    the B* drag term is non-zero (proxy for drag activity).
//
// Limitations:
//  - Uses single-TLE propagation; long-range decay estimates carry
//    uncertainty and should be treated as indicative only.
//  - Does not ingest historical TLE sets; trends are inferred from the
//    current TLE parameters only.
// -------------------------------------------------------------

const MS_PER_MIN = 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_MIN;
const DEFAULTS = {
    reentryAltitudeKm: 120,
    coarseAltitudeKm: 2000,
    backtrackDays: 60,
    predictionHorizonDays: 180,
    stepMinutes: 30,
    backtrackStepMinutes: 120
};

const DECAY_SOURCE = 'json/decayed/decayed.json';
const WARN_LIMIT = 5;
const PREDICTION_CACHE_STORAGE_KEY = 'openbexiDecayPredictionCacheV1';
const PREDICTION_CACHE_MAX_RECORDS = 2000;
const NON_DECAY_ORBIT_CLASSES = new Set(['GEO', 'MEO', 'HEO', 'HRO']);
const CANDIDATE_DEFAULTS = {
    lowPerigeeKm: 300,
    lowAltitudeKm: 300,
    highDragPerigeeKm: 450,
    highDragBstar: 0.0015,
    fastDecayMeanMotionRevPerDay: 15.8,
    fastDecayMaxPerigeeKm: 500,
    allowHighOrbitPrediction: false
};
let cachedDecayPromise = null;
let cachedDecayMap = null;

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function normalizeNoradId(sat) {
    const raw = sat?.norad_id ?? sat?.noradId ?? sat?.NORAD_CAT_ID ?? sat?.NORADID;
    if (raw === undefined || raw === null) return null;
    const text = String(raw).trim();
    return text || null;
}

function normalizeDateBucket(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    return safeDate.toISOString().substring(0, 10);
}

function tleIdentity(sat) {
    return {
        noradId: normalizeNoradId(sat),
        line1: String(sat?.tle_line1 ?? sat?.tleLine1 ?? '').trim(),
        line2: String(sat?.tle_line2 ?? sat?.tleLine2 ?? '').trim()
    };
}

function predictionOptionsIdentity(options = {}) {
    const merged = { ...DEFAULTS, ...options };
    return {
        reentryAltitudeKm: merged.reentryAltitudeKm,
        coarseAltitudeKm: merged.coarseAltitudeKm,
        backtrackDays: merged.backtrackDays,
        predictionHorizonDays: merged.predictionHorizonDays,
        stepMinutes: merged.stepMinutes,
        backtrackStepMinutes: merged.backtrackStepMinutes,
        predictionDate: normalizeDateBucket(options.now)
    };
}

export function decayPredictionCacheKey(sat, options = {}) {
    const identity = tleIdentity(sat);
    if (!identity.noradId || !identity.line1 || !identity.line2) return null;
    return JSON.stringify({
        ...identity,
        options: predictionOptionsIdentity(options)
    });
}

function readPredictionCache() {
    try {
        const storage = globalThis.localStorage;
        if (!storage?.getItem) return { version: 1, entries: {} };
        const parsed = JSON.parse(storage.getItem(PREDICTION_CACHE_STORAGE_KEY) || '{}');
        if (!parsed || typeof parsed !== 'object' || typeof parsed.entries !== 'object') {
            return { version: 1, entries: {} };
        }
        return parsed;
    } catch (err) {
        return { version: 1, entries: {} };
    }
}

function writePredictionCache(cache) {
    try {
        const storage = globalThis.localStorage;
        if (!storage?.setItem) return;
        const entries = Object.entries(cache.entries || {});
        if (entries.length > PREDICTION_CACHE_MAX_RECORDS) {
            entries
                .sort((a, b) => String(b[1]?.cached_at || '').localeCompare(String(a[1]?.cached_at || '')))
                .slice(PREDICTION_CACHE_MAX_RECORDS)
                .forEach(([key]) => {
                    delete cache.entries[key];
                });
        }
        storage.setItem(PREDICTION_CACHE_STORAGE_KEY, JSON.stringify({ version: 1, entries: cache.entries || {} }));
    } catch (err) {
        // Cache misses are acceptable; prediction still runs when storage is unavailable.
    }
}

function parseTleExponential(value) {
    const text = String(value || '').trim();
    const match = text.match(/^([+-]?)(\d+)([+-]\d+)$/);
    if (!match) return null;
    const mantissa = Number(`${match[1] === '-' ? '-' : ''}0.${match[2]}`);
    const exponent = Number(match[3]);
    const parsed = mantissa * Math.pow(10, exponent);
    return Number.isFinite(parsed) ? parsed : null;
}

function bstarFromSatellite(sat) {
    const satrecBstar = finiteNumber(sat?.satrec?.bstar);
    if (satrecBstar !== null) return satrecBstar;
    const directBstar = finiteNumber(sat?.bstar);
    if (directBstar !== null) return directBstar;
    const line1 = String(sat?.tle_line1 ?? sat?.tleLine1 ?? '');
    return line1.length >= 61 ? parseTleExponential(line1.slice(53, 61)) : null;
}

function safePropagate(satrec, date) {
    try {
        const pv = window.satellite.propagate(satrec, date);
        if (!pv || !pv.position) return null;
        const gmst = window.satellite.gstime(date);
        const geo = window.satellite.eciToGeodetic(pv.position, gmst);
        // satellite.js returns height in km.
        const altitudeKm = geo.height;
        if (!isFinite(altitudeKm)) return null;
        return { date, altitudeKm, geo };
    } catch (err) {
        console.warn('Propagation failed', { err, date });
        return null;
    }
}

function findCrossing(satrec, start, end, stepMinutes, thresholdKm) {
    const stepMs = stepMinutes * MS_PER_MIN;
    let last = null;
    for (let t = start.getTime(); t <= end.getTime(); t += stepMs) {
        const state = safePropagate(satrec, new Date(t));
        if (!state) {
            return { date: new Date(t), reason: 'Propagation failed' };
        }
        if (state.altitudeKm <= thresholdKm) {
            return { date: state.date, reason: `Altitude dropped below ${thresholdKm} km` };
        }
        if (last && last.altitudeKm > thresholdKm && state.altitudeKm <= thresholdKm) {
            return { date: state.date, reason: `Altitude crossed ${thresholdKm} km threshold` };
        }
        last = state;
    }
    return null;
}

function confidenceForWindow(crossDate, now, satrec, horizonDays) {
    const daysUntil = (crossDate.getTime() - now.getTime()) / MS_PER_DAY;
    const proximity = Math.max(0, Math.min(1, (horizonDays - daysUntil) / horizonDays));
    const dragBonus = Math.min(0.3, Math.abs(satrec.bstar || 0) * 1e5);
    const base = 0.35 + dragBonus;
    return Math.max(0.1, Math.min(1, base + proximity * 0.5));
}

export function parseDecayDate(value) {
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    let year;
    let month;
    let day;

    const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
        year = parseInt(isoMatch[1], 10);
        month = parseInt(isoMatch[2], 10);
        day = parseInt(isoMatch[3], 10);
    } else {
        const parts = trimmed.split('/').map((p) => parseInt(p, 10));
        if (parts.length !== 3) return null;
        [month, day, year] = parts;
    }

    if (!month || !day || !year) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) return null;
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }
    const iso = `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}-${date
        .getUTCDate()
        .toString()
        .padStart(2, '0')}`;
    return { date, iso };
}

export function normalizeDecayRecord(raw, warn = () => {}) {
    const noradRaw = raw?.NORAD_CAT_ID ?? raw?.norad_cat_id ?? raw?.NORADID ?? raw?.noradId;
    const noradId = noradRaw === undefined || noradRaw === null ? null : String(noradRaw).trim();
    if (!noradId) {
        warn('missing NORAD_CAT_ID');
        return null;
    }

    const decayParsed = parseDecayDate(raw?.DECAY_DATE ?? raw?.decay_date);
    if (!decayParsed) {
        warn(`invalid DECAY_DATE for NORAD ${noradId}`);
        return null;
    }

    const launchParsed = parseDecayDate(raw?.LAUNCH_DATE ?? raw?.launch_date);

    return {
        noradId,
        decayDate: decayParsed.date,
        decayDateIso: decayParsed.iso,
        launchDateIso: launchParsed?.iso || null,
        objectName: raw?.OBJECT_NAME || raw?.object_name || null,
        objectId: raw?.OBJECT_ID || raw?.object_id || null,
        objectType: raw?.OBJECT_TYPE || raw?.object_type || null,
        launchSite: raw?.LAUNCH_SITE || raw?.launch_site || null
    };
}

export function flattenDecayData(data) {
    if (!data || typeof data !== 'object') return [];
    const warnMessages = new Set();
    let warnCount = 0;
    const warn = (msg) => {
        if (warnCount < WARN_LIMIT && !warnMessages.has(msg)) {
            console.warn(`Skipping decayed record: ${msg}`);
            warnMessages.add(msg);
            warnCount += 1;
        }
    };

    const records = [];
    Object.keys(data).forEach((key) => {
        const arr = Array.isArray(data[key]) ? data[key] : [];
        arr.forEach((entry) => {
            const normalized = normalizeDecayRecord(entry, warn);
            if (normalized) records.push(normalized);
        });
    });
    return records;
}

function buildDecayMap(records) {
    const map = new Map();
    records.forEach((rec) => {
        const existing = map.get(rec.noradId);
        if (!existing || existing.decayDate < rec.decayDate) {
            map.set(rec.noradId, rec);
        }
    });
    return map;
}

export async function loadConfirmedDecays() {
    if (cachedDecayMap) return cachedDecayMap;
    if (cachedDecayPromise) return cachedDecayPromise;

    const serverConnection = globalThis.window?.openbexiServerConnection;
    const serverDecaySource = serverConnection?.connected && typeof serverConnection.resolveDataUrl === 'function'
        ? serverConnection.resolveDataUrl(DECAY_SOURCE)
        : null;
    const source = serverDecaySource || DECAY_SOURCE;

    cachedDecayPromise = fetch(source)
        .then((resp) => {
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }
            return resp.json();
        })
        .then((json) => {
            const records = flattenDecayData(json);
            cachedDecayMap = buildDecayMap(records);
            return cachedDecayMap;
        })
        .catch((err) => {
            console.error(`Failed to load confirmed decay data from ${source}:`, err.message || err);
            cachedDecayMap = null;
            return null;
        })
        .finally(() => {
            cachedDecayPromise = null;
        });

    return cachedDecayPromise;
}

export function applyConfirmedDecayRecord(sat, confirmedDecays) {
    const satNoradId = normalizeNoradId(sat);
    if (!sat || !confirmedDecays || !satNoradId || !confirmedDecays.has(satNoradId)) return false;
    const record = confirmedDecays.get(satNoradId);
    sat.decay = {
        decay_status: 'CONFIRMED',
        decay_reason: 'Source: json/decayed/decayed.json',
        decay_date: record.decayDateIso,
        predicted_decay_window: null,
        object_name: record.objectName || null,
        object_id: record.objectId || null,
        object_type: record.objectType || null,
        launch_date: record.launchDateIso || null,
        launch_site: record.launchSite || null
    };
    return true;
}

export function isLikelyDecayCandidate(sat, options = {}) {
    const satNoradId = normalizeNoradId(sat);
    if (!sat || !satNoradId) return false;
    if (options.confirmedDecays?.has?.(satNoradId)) return false;
    if (sat.decay?.decay_status === 'CONFIRMED') return false;

    const merged = { ...CANDIDATE_DEFAULTS, ...options };
    const orbitClass = String(sat.orbit_class || sat.type || '').trim().toUpperCase();
    const perigeeKm = finiteNumber(sat.perigee_km);
    const apogeeKm = finiteNumber(sat.apogee_km);
    const altitudeKm = finiteNumber(sat.estimated_altitude_km);
    const meanMotion = finiteNumber(sat.mean_motion_rev_per_day);
    const bstar = bstarFromSatellite(sat);
    const statusText = String(sat.decay_status || sat.status || sat.decay_risk || sat.type || '').toUpperCase();

    if (statusText.includes('DECAY') || statusText.includes('RE-ENTRY') || statusText.includes('REENTRY')) {
        return true;
    }

    const lowOrbitSignal =
        (perigeeKm !== null && perigeeKm <= merged.lowPerigeeKm) ||
        (altitudeKm !== null && altitudeKm <= merged.lowAltitudeKm) ||
        (apogeeKm !== null && apogeeKm <= merged.lowAltitudeKm);
    if (lowOrbitSignal) return true;

    if (!merged.allowHighOrbitPrediction && NON_DECAY_ORBIT_CLASSES.has(orbitClass)) {
        return false;
    }

    const fastLowOrbit =
        meanMotion !== null &&
        meanMotion >= merged.fastDecayMeanMotionRevPerDay &&
        (perigeeKm === null || perigeeKm <= merged.fastDecayMaxPerigeeKm);
    if (fastLowOrbit) return true;

    const highDragLowOrbit =
        bstar !== null &&
        Math.abs(bstar) >= merged.highDragBstar &&
        (
            (perigeeKm !== null && perigeeKm <= merged.highDragPerigeeKm) ||
            (altitudeKm !== null && altitudeKm <= merged.highDragPerigeeKm) ||
            (meanMotion !== null && meanMotion >= 15.4)
        );
    return highDragLowOrbit;
}

export function applyCachedDecayPrediction(sat, options = {}) {
    if (!sat || sat.decay?.decay_status === 'CONFIRMED') return false;
    const key = decayPredictionCacheKey(sat, options);
    if (!key) return false;
    const cache = readPredictionCache();
    const entry = cache.entries?.[key];
    if (!entry?.decay || typeof entry.decay !== 'object') return false;
    sat.decay = { ...entry.decay, decay_cached_at: entry.cached_at || null };
    return true;
}

export function cacheDecayPrediction(sat, options = {}) {
    if (!sat?.decay) return false;
    const key = decayPredictionCacheKey(sat, options);
    if (!key) return false;
    const cache = readPredictionCache();
    cache.entries = cache.entries || {};
    cache.entries[key] = {
        cached_at: new Date().toISOString(),
        decay: { ...sat.decay }
    };
    writePredictionCache(cache);
    return true;
}

export function computeDecayEstimates(satellites, options = {}) {
    const {
        reentryAltitudeKm,
        coarseAltitudeKm,
        backtrackDays,
        predictionHorizonDays,
        stepMinutes,
        backtrackStepMinutes,
        confirmedDecays
    } = { ...DEFAULTS, ...options };

    const now = options.now ? new Date(options.now) : new Date();

    (satellites || []).forEach((sat) => {
        const satrec = sat?.satrec;

        if (applyConfirmedDecayRecord(sat, confirmedDecays)) {
            return;
        }
        if (!satrec) {
            sat.decay = {
                decay_status: 'UNKNOWN',
                decay_reason: 'Missing satrec; cannot propagate',
                decay_date: null,
                predicted_decay_window: null
            };
            return;
        }

        const currentState = safePropagate(satrec, now);
        if (!currentState) {
            sat.decay = {
                decay_status: 'CONFIRMED',
                decay_reason: 'Propagation invalid near current epoch',
                decay_date: now.toISOString(),
                predicted_decay_window: null
            };
            return;
        }

        const { altitudeKm } = currentState;
        if (altitudeKm > coarseAltitudeKm) {
            sat.decay = {
                decay_status: 'UNKNOWN',
                decay_reason: `Altitude ${altitudeKm.toFixed(0)} km exceeds coarse decay search limit`,
                decay_date: null,
                predicted_decay_window: null
            };
            return;
        }

        const backStart = new Date(now.getTime() - backtrackDays * MS_PER_DAY);
        const pastCrossing = findCrossing(
            satrec,
            backStart,
            now,
            backtrackStepMinutes,
            reentryAltitudeKm
        );

        if (pastCrossing) {
            sat.decay = {
                decay_status: 'CONFIRMED',
                decay_reason: pastCrossing.reason,
                decay_date: pastCrossing.date.toISOString(),
                predicted_decay_window: null
            };
            return;
        }

        if (altitudeKm <= reentryAltitudeKm) {
            sat.decay = {
                decay_status: 'CONFIRMED',
                decay_reason: `Current altitude ${altitudeKm.toFixed(1)} km below ${reentryAltitudeKm} km threshold`,
                decay_date: now.toISOString(),
                predicted_decay_window: null
            };
            return;
        }

        const horizonEnd = new Date(now.getTime() + predictionHorizonDays * MS_PER_DAY);
        const futureCrossing = findCrossing(
            satrec,
            now,
            horizonEnd,
            stepMinutes,
            reentryAltitudeKm
        );

        if (futureCrossing) {
            const padDays = Math.max(1, Math.min(10, Math.ceil(stepMinutes / 60)));
            const start = new Date(futureCrossing.date.getTime() - padDays * MS_PER_DAY * 0.5);
            const end = new Date(futureCrossing.date.getTime() + padDays * MS_PER_DAY * 0.5);
            const confidence = confidenceForWindow(futureCrossing.date, now, satrec, predictionHorizonDays);
            sat.decay = {
                decay_status: 'PREDICTED',
                decay_reason: futureCrossing.reason,
                decay_date: null,
                predicted_decay_window: {
                    start: start.toISOString(),
                    end: end.toISOString(),
                    confidence
                }
            };
            return;
        }

        sat.decay = {
            decay_status: 'UNKNOWN',
            decay_reason: 'Propagation stays above threshold within horizon',
            decay_date: null,
            predicted_decay_window: null
        };
    });

    return satellites;
}

export const decayDefaults = { ...DEFAULTS };
