// js/startupPerformance.js
// Small startup instrumentation and scheduling helpers.

function safeNow(performanceObj) {
    return performanceObj?.now ? performanceObj.now() : Date.now();
}

function safeMark(performanceObj, name) {
    try {
        performanceObj?.mark?.(name);
    } catch (err) {
        // Performance marks are diagnostic only.
    }
}

function safeMeasure(performanceObj, name, startMark, endMark) {
    try {
        performanceObj?.measure?.(name, startMark, endMark);
    } catch (err) {
        // Some browsers throw if marks are unavailable; keep startup resilient.
    }
}

export function createStartupPerformanceTracker(options = {}) {
    const {
        label = 'openbexi-startup',
        performanceObj = globalThis.performance,
        windowObj = globalThis.window,
        documentObj = globalThis.document,
        logEnabled = false
    } = options;

    const startTime = safeNow(performanceObj);
    const entries = [];
    const seen = new Set();

    const record = (name, detail = null, once = false) => {
        if (once && seen.has(name)) return entries.find(entry => entry.name === name) || null;
        seen.add(name);
        const timestamp = safeNow(performanceObj);
        const entry = {
            name,
            timestamp,
            durationMs: Math.max(0, timestamp - startTime),
            detail
        };
        entries.push(entry);
        safeMark(performanceObj, `${label}:${name}`);
        return entry;
    };

    const tracker = {
        mark(name, detail = null) {
            return record(name, detail, false);
        },
        markOnce(name, detail = null) {
            return record(name, detail, true);
        },
        measure(name, startMark, endMark) {
            safeMeasure(performanceObj, `${label}:${name}`, `${label}:${startMark}`, `${label}:${endMark}`);
        },
        summary() {
            return entries.map(entry => ({ ...entry }));
        },
        logSummary() {
            if (!logEnabled) return;
            const table = entries.map(entry => ({
                event: entry.name,
                ms: Math.round(entry.durationMs),
                detail: entry.detail || ''
            }));
            if (globalThis.console?.table) {
                console.table(table);
            } else {
                console.info(`${label} startup timings`, table);
            }
        }
    };

    documentObj?.addEventListener?.('DOMContentLoaded', () => tracker.markOnce('dom-content-loaded'));
    windowObj?.addEventListener?.('load', () => tracker.markOnce('window-load'));

    if (windowObj) {
        windowObj.openbexiStartupPerformance = tracker;
    }

    return tracker;
}

export function scheduleDeferredWork(callback, options = {}) {
    const {
        timeout = 500,
        windowObj = globalThis.window,
        setTimeoutFn = globalThis.setTimeout,
        clearTimeoutFn = globalThis.clearTimeout
    } = options;

    if (windowObj?.requestIdleCallback) {
        const id = windowObj.requestIdleCallback(callback, { timeout });
        return () => windowObj.cancelIdleCallback?.(id);
    }

    const id = setTimeoutFn(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 0);
    return () => clearTimeoutFn?.(id);
}

export function nextDeferredTick(options = {}) {
    return new Promise(resolve => {
        scheduleDeferredWork(resolve, options);
    });
}

export async function processInChunks(items, processor, options = {}) {
    const {
        chunkSize = 250,
        afterChunk = null,
        schedulerOptions = {}
    } = options;

    const source = Array.isArray(items) ? items : [];
    const size = Math.max(1, chunkSize);
    let processed = 0;

    while (processed < source.length) {
        const end = Math.min(processed + size, source.length);
        for (let i = processed; i < end; i += 1) {
            const result = processor(source[i], i, source);
            if (result?.then) await result;
        }
        processed = end;
        if (typeof afterChunk === 'function') {
            afterChunk({ processed, total: source.length });
        }
        if (processed < source.length) {
            await nextDeferredTick(schedulerOptions);
        }
    }

    return source;
}

export function createRoundRobinFrameProcessor(options = {}) {
    const {
        budgetMs = 6,
        maxItemsPerRun = 512,
        performanceObj = globalThis.performance
    } = options;
    if (!(Number.isFinite(budgetMs) && budgetMs > 0)) {
        throw new TypeError('Frame processor budgetMs must be greater than zero.');
    }
    if (!Number.isInteger(maxItemsPerRun) || maxItemsPerRun < 1) {
        throw new TypeError('Frame processor maxItemsPerRun must be a positive integer.');
    }

    let cursor = 0;
    return Object.freeze({
        run(items, processor) {
            const source = Array.isArray(items) ? items : [];
            if (source.length === 0 || typeof processor !== 'function') {
                cursor = 0;
                return Object.freeze({ processed: 0, next_index: 0 });
            }
            cursor %= source.length;
            const startedAt = safeNow(performanceObj);
            const limit = Math.min(source.length, maxItemsPerRun);
            let processed = 0;
            while (processed < limit) {
                const index = cursor;
                cursor = (cursor + 1) % source.length;
                processor(source[index], index, source);
                processed += 1;
                if (safeNow(performanceObj) - startedAt >= budgetMs) break;
            }
            return Object.freeze({ processed, next_index: cursor });
        },
        reset() {
            cursor = 0;
        },
        nextIndex() {
            return cursor;
        }
    });
}
