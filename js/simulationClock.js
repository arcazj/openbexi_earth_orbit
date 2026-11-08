const DEFAULT_MIN_RATE = -60;
const DEFAULT_MAX_RATE = 60;
const DEFAULT_MILLISECONDS_PER_WARP_SECOND = 1000;

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

    let millisecondsPerWarpSecond = Math.max(
        0,
        finiteOr(options.millisecondsPerWarpSecond, DEFAULT_MILLISECONDS_PER_WARP_SECOND)
    );
    const now = options.now ?? Date.now;
    let { minTimeMs, maxTimeMs } = normalizeBounds(options.bounds);

    const state = {
        timeMs: finiteOr(options.initialTimeMs, 0),
        rate: Math.min(maxRate, Math.max(minRate, finiteOr(options.initialRate, 0))),
        appliedDeltaSeconds: 0,
        boundary: null,
        generation: 0,
        live: false
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
        if (boundary && pauseOnClamp) { state.rate = 0; state.live = false; }
        return boundary;
    };

    clampTime(state.timeMs);

    const goLive = () => {
        millisecondsPerWarpSecond = 1000;
        state.rate = 1;
        state.live = true;
        state.generation += 1;
        clampTime(now());
        return state;
    };
    if (options.initialLive) goLive();

    return Object.freeze({
        goLive,
        tick(deltaSeconds) {
            // Rendering may throttle in a background tab; simulation time must not.
            const appliedDelta = Math.max(0, finiteOr(deltaSeconds, 0));
            state.appliedDeltaSeconds = appliedDelta;
            if (state.live) {
                clampTime(now());
                return state;
            }
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
            if (state.live) state.generation += 1;
            state.live = false;
            clampTime(timeMs, pauseOnClamp);
            if (state.timeMs !== previous) state.generation += 1;
            return state;
        },
        setRate(rate) {
            const nextRate = Math.min(maxRate, Math.max(minRate, finiteOr(Number(rate), 0)));
            if (nextRate !== state.rate || state.live) state.generation += 1;
            state.live = false;
            state.rate = nextRate;
            if ((state.boundary === 'start' && nextRate > 0) || (state.boundary === 'end' && nextRate < 0)) {
                state.boundary = null;
            }
            return state;
        },
        setTimeScale(value) {
            if (!Number.isFinite(value) || value <= 0) throw new RangeError('Time scale must be positive.');
            if (value !== millisecondsPerWarpSecond || state.live) state.generation += 1;
            state.live = false;
            millisecondsPerWarpSecond = value;
            return state;
        },
        timeScale() { return millisecondsPerWarpSecond; },
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
            state.live = false;
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
    millisecondsPerWarpSecond: DEFAULT_MILLISECONDS_PER_WARP_SECOND
});

export function simulationRateLabel(clock, unit = 'second') {
    const { rate, live } = clock.state();
    if (live) return 'Live · 1 sec/s';
    if (!rate) return 'Paused';
    const label = clock.timeScale() === 1000 ? 'sec' : ({ minute: 'min', second: 'sec' }[unit] || unit);
    return `${rate} ${label}/s`;
}

export function simulationRateDescription(clock, unit = 'second') {
    const { rate, live } = clock.state();
    if (live) return 'Live, 1 simulated second per real second';
    const name = clock.timeScale() === 1000 ? 'second' : unit === 'min' ? 'minute' : unit;
    if (!rate) return `Paused, ${name}s per second selected`;
    return `${rate < 0 ? 'Reverse' : 'Forward'}, ${Math.abs(rate)} simulated ${name}${Math.abs(rate) === 1 ? '' : 's'} per real second`;
}
