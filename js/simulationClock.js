const DEFAULT_MIN_RATE = -60;
const DEFAULT_MAX_RATE = 60;
const DEFAULT_MILLISECONDS_PER_WARP_SECOND = 60_000;
const DEFAULT_MAX_FRAME_GAP_SECONDS = 0.25;

function finiteOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

function normalizeBounds(bounds) {
    if (!bounds) return { minTimeMs: Number.NEGATIVE_INFINITY, maxTimeMs: Number.POSITIVE_INFINITY };
    const minTimeMs = finiteOr(bounds.minTimeMs, Number.NEGATIVE_INFINITY);
    const maxTimeMs = finiteOr(bounds.maxTimeMs, Number.POSITIVE_INFINITY);
    if (minTimeMs > maxTimeMs) throw new RangeError('Simulation clock minimum time cannot exceed maximum time.');
    return { minTimeMs, maxTimeMs };
}

export function createSimulationClock(options = {}) {
    const minRate = finiteOr(options.minRate, DEFAULT_MIN_RATE);
    const maxRate = finiteOr(options.maxRate, DEFAULT_MAX_RATE);
    if (minRate > maxRate) throw new RangeError('Simulation clock minimum rate cannot exceed maximum rate.');

    const millisecondsPerWarpSecond = Math.max(
        0,
        finiteOr(options.millisecondsPerWarpSecond, DEFAULT_MILLISECONDS_PER_WARP_SECOND)
    );
    const maxFrameGapSeconds = Math.max(
        0,
        finiteOr(options.maxFrameGapSeconds, DEFAULT_MAX_FRAME_GAP_SECONDS)
    );
    let { minTimeMs, maxTimeMs } = normalizeBounds(options.bounds);

    const state = {
        timeMs: finiteOr(options.initialTimeMs, 0),
        rate: Math.min(maxRate, Math.max(minRate, finiteOr(options.initialRate, 0))),
        appliedDeltaSeconds: 0,
        boundary: null,
        generation: 0
    };

    const clampTime = (timeMs, pauseOnClamp = true) => {
        let next = finiteOr(timeMs, state.timeMs);
        let boundary = null;
        if (next < minTimeMs) {
            next = minTimeMs;
            boundary = 'start';
        } else if (next > maxTimeMs) {
            next = maxTimeMs;
            boundary = 'end';
        }
        state.timeMs = next;
        state.boundary = boundary;
        if (boundary && pauseOnClamp) state.rate = 0;
        return boundary;
    };

    clampTime(state.timeMs);

    return Object.freeze({
        tick(deltaSeconds) {
            const requestedDelta = Math.max(0, finiteOr(deltaSeconds, 0));
            const appliedDelta = Math.min(requestedDelta, maxFrameGapSeconds);
            state.appliedDeltaSeconds = appliedDelta;
            if (!appliedDelta || !state.rate) return state;

            const nextTime = state.timeMs + appliedDelta * millisecondsPerWarpSecond * state.rate;
            if (state.rate < 0 && nextTime <= minTimeMs) {
                state.timeMs = minTimeMs;
                state.boundary = 'start';
                state.rate = 0;
            } else if (state.rate > 0 && nextTime >= maxTimeMs) {
                state.timeMs = maxTimeMs;
                state.boundary = 'end';
                state.rate = 0;
            } else {
                clampTime(nextTime);
            }
            return state;
        },
        setTime(timeMs, { pauseOnClamp = true } = {}) {
            const previous = state.timeMs;
            clampTime(timeMs, pauseOnClamp);
            if (state.timeMs !== previous) state.generation += 1;
            return state;
        },
        setRate(rate) {
            const nextRate = Math.min(maxRate, Math.max(minRate, finiteOr(Number(rate), 0)));
            if (nextRate !== state.rate) state.generation += 1;
            state.rate = nextRate;
            if ((state.boundary === 'start' && nextRate > 0) || (state.boundary === 'end' && nextRate < 0)) {
                state.boundary = null;
            }
            return state;
        },
        setBounds(bounds) {
            const normalized = normalizeBounds(bounds);
            if (normalized.minTimeMs === minTimeMs && normalized.maxTimeMs === maxTimeMs) return state;
            minTimeMs = normalized.minTimeMs;
            maxTimeMs = normalized.maxTimeMs;
            state.generation += 1;
            clampTime(state.timeMs);
            return state;
        },
        clearBounds() {
            if (minTimeMs === Number.NEGATIVE_INFINITY && maxTimeMs === Number.POSITIVE_INFINITY) return state;
            minTimeMs = Number.NEGATIVE_INFINITY;
            maxTimeMs = Number.POSITIVE_INFINITY;
            state.boundary = null;
            state.generation += 1;
            return state;
        },
        reset(timeMs, rate = 0) {
            state.generation += 1;
            state.rate = Math.min(maxRate, Math.max(minRate, finiteOr(Number(rate), 0)));
            clampTime(timeMs);
            return state;
        },
        state() {
            return state;
        },
        bounds(target = {}) {
            target.minTimeMs = minTimeMs;
            target.maxTimeMs = maxTimeMs;
            return target;
        }
    });
}

export const SIMULATION_CLOCK_DEFAULTS = Object.freeze({
    minRate: DEFAULT_MIN_RATE,
    maxRate: DEFAULT_MAX_RATE,
    millisecondsPerWarpSecond: DEFAULT_MILLISECONDS_PER_WARP_SECOND,
    maxFrameGapSeconds: DEFAULT_MAX_FRAME_GAP_SECONDS
});
