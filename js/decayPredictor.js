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

export function computeDecayEstimates(satellites, options = {}) {
    const {
        reentryAltitudeKm,
        coarseAltitudeKm,
        backtrackDays,
        predictionHorizonDays,
        stepMinutes,
        backtrackStepMinutes
    } = { ...DEFAULTS, ...options };

    const now = options.now ? new Date(options.now) : new Date();

    (satellites || []).forEach((sat) => {
        const satrec = sat?.satrec;
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

        if (altitudeKm > coarseAltitudeKm) {
            sat.decay = {
                decay_status: 'UNKNOWN',
                decay_reason: `Altitude ${altitudeKm.toFixed(0)} km exceeds coarse decay search limit`,
                decay_date: null,
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
