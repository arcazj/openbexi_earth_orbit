import { KM_TO_SCENE_UNITS } from '../SatelliteConstantLoader.js';

const DEFAULT_MAX_SAMPLES_PER_BATCH = 256;
const DEFAULT_PROPAGATION_BUDGET_MS = 5;
const DEFAULT_WINDOW_REAL_SECONDS = 1.5;
const DEFAULT_MIN_WINDOW_MS = 30_000;
const DEFAULT_MAX_WINDOW_MS = 90 * 60_000;
const DEFAULT_CORRECTION_BLEND_MS = 120;
const DEFAULT_MAX_ORBIT_FRACTION = 1 / 32;
const DEFAULT_UNKNOWN_ORBIT_WINDOW_MS = 5 * 60_000;
const DEFAULT_FAILURE_RETRY_MS = 1_000;
const SIM_MILLISECONDS_PER_WARP_SECOND = 60_000;

function finiteVector(vector) {
    return !!vector && Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function writeVector(target, source) {
    if (typeof target?.set === 'function') target.set(source.x, source.y, source.z);
    else if (target) {
        target.x = source.x;
        target.y = source.y;
        target.z = source.z;
    }
}

export function satelliteMarkerDiagnostics(objects, earthRadius) {
    const source = Array.isArray(objects) ? objects : [];
    const visibleNoradIds = [];
    const drawnNoradIds = [];
    const unreadyVisibleNoradIds = [];
    const visibleOriginNoradIds = [];
    source.forEach(object => {
        const noradId = object?.norad_id?.toString();
        if (noradId) visibleNoradIds.push(noradId);
        if (object?.mesh?.visible !== true) return;
        if (object.motionPositionReady === true) {
            if (noradId) drawnNoradIds.push(noradId);
        } else if (noradId) {
            unreadyVisibleNoradIds.push(noradId);
        }
        const position = object.mesh.position;
        if (noradId && position && Number.isFinite(position.x) && Number.isFinite(position.y) &&
            Number.isFinite(position.z) && Math.hypot(position.x, position.y, position.z) <= earthRadius) {
            visibleOriginNoradIds.push(noradId);
        }
    });
    return { visibleNoradIds, drawnNoradIds, unreadyVisibleNoradIds, visibleOriginNoradIds };
}

export function satelliteMarkerState(objects, noradId) {
    const requestedNorad = noradId?.toString();
    const record = Array.isArray(objects)
        ? objects.find(object => object?.norad_id?.toString() === requestedNorad)
        : null;
    if (!record) return null;
    const position = record.mesh?.position?.toArray?.() || null;
    const finitePosition = Array.isArray(position) && position.length === 3 && position.every(Number.isFinite);
    return {
        noradId: requestedNorad,
        position: finitePosition ? position : null,
        radius: finitePosition ? Math.hypot(...position) : null,
        filterVisible: record.mesh?.userData?.filterVisible === true,
        visible: record.mesh?.visible === true,
        propagationInvalid: record.propagationInvalid === true
    };
}

function defaultSceneSample(propagation, positionOut, velocityOut) {
    const position = propagation?.position;
    const velocity = propagation?.velocity;
    if (!finiteVector(position) || !finiteVector(velocity)) return false;
    positionOut.x = position.x * KM_TO_SCENE_UNITS;
    positionOut.y = position.z * KM_TO_SCENE_UNITS;
    positionOut.z = position.y * KM_TO_SCENE_UNITS;
    velocityOut.x = velocity.x * KM_TO_SCENE_UNITS / 1000;
    velocityOut.y = velocity.z * KM_TO_SCENE_UNITS / 1000;
    velocityOut.z = velocity.y * KM_TO_SCENE_UNITS / 1000;
    return true;
}

export function hermiteInterpolatePosition(output, start, end, startVelocityPerMs, endVelocityPerMs, fraction, durationMs) {
    const t = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const duration = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
    output.x = h00 * start.x + h10 * duration * startVelocityPerMs.x +
        h01 * end.x + h11 * duration * endVelocityPerMs.x;
    output.y = h00 * start.y + h10 * duration * startVelocityPerMs.y +
        h01 * end.y + h11 * duration * endVelocityPerMs.y;
    output.z = h00 * start.z + h10 * duration * startVelocityPerMs.z +
        h01 * end.z + h11 * duration * endVelocityPerMs.z;
    return output;
}

export function satelliteInterpolationWindowMs(satrec, options = {}) {
    const maxOrbitFraction = Math.min(0.125, Math.max(1 / 256,
        options.maxOrbitFraction ?? DEFAULT_MAX_ORBIT_FRACTION
    ));
    const meanMotionRadPerMinute = Math.abs(Number(satrec?.no));
    if (!(Number.isFinite(meanMotionRadPerMinute) && meanMotionRadPerMinute > 0)) {
        return options.unknownOrbitWindowMs ?? DEFAULT_UNKNOWN_ORBIT_WINDOW_MS;
    }
    const periodMs = 2 * Math.PI / meanMotionRadPerMinute * 60_000;
    return Math.max(1, periodMs * maxOrbitFraction);
}

function createObjectMotionState() {
    return {
        generation: -1,
        startTimeMs: 0,
        endTimeMs: 0,
        startPosition: { x: 0, y: 0, z: 0 },
        endPosition: { x: 0, y: 0, z: 0 },
        startVelocity: { x: 0, y: 0, z: 0 },
        endVelocity: { x: 0, y: 0, z: 0 },
        renderedPosition: { x: 0, y: 0, z: 0 },
        correction: { x: 0, y: 0, z: 0 },
        correctionStartRealMs: Number.NEGATIVE_INFINITY,
        valid: false,
        selectedTimeMs: Number.NaN,
        selectedPropagation: null,
        selectedDate: new Date(0),
        startDate: new Date(0),
        endDate: new Date(0),
        windowMs: 0,
        retryAfterRealMs: Number.NEGATIVE_INFINITY
    };
}

export function createSatelliteMotionController(options = {}) {
    const propagate = options.propagate;
    if (typeof propagate !== 'function') throw new TypeError('Satellite motion controller requires a propagation function.');
    const toSceneSample = options.toSceneSample ?? defaultSceneSample;
    const now = options.now ?? (() => globalThis.performance?.now?.() ?? Date.now());
    const schedule = options.schedule ?? (callback => globalThis.setTimeout(callback, 0));
    const cancelSchedule = options.cancelSchedule ?? (id => globalThis.clearTimeout(id));
    const maxSamplesPerBatch = Math.max(1, Math.floor(options.maxSamplesPerBatch ?? DEFAULT_MAX_SAMPLES_PER_BATCH));
    const propagationBudgetMs = Math.max(0.1, options.propagationBudgetMs ?? DEFAULT_PROPAGATION_BUDGET_MS);
    const windowRealSeconds = Math.max(0.1, options.windowRealSeconds ?? DEFAULT_WINDOW_REAL_SECONDS);
    const minWindowMs = Math.max(1, options.minWindowMs ?? DEFAULT_MIN_WINDOW_MS);
    const maxWindowMs = Math.max(minWindowMs, options.maxWindowMs ?? DEFAULT_MAX_WINDOW_MS);
    const correctionBlendMs = Math.max(0, options.correctionBlendMs ?? DEFAULT_CORRECTION_BLEND_MS);
    const failureRetryMs = Math.max(100, options.failureRetryMs ?? DEFAULT_FAILURE_RETRY_MS);

    let generation = 0;
    let jobGeneration = 0;
    let cursor = 0;
    let pendingJob = null;
    let catalogSource = null;
    let catalogLength = -1;
    let catalogFirst = null;
    let catalogLast = null;
    let lastDirection = 1;
    let lastSelectedObject = null;
    let lastClockGeneration = Number.NaN;
    let lastSimTimeMs = Number.NaN;
    let lastRealTimeMs = Number.NaN;
    let samplingSweepRemaining = 0;
    let nextFailureRetryRealMs = Number.POSITIVE_INFINITY;
    const states = new WeakMap();
    const interpolationScratch = { x: 0, y: 0, z: 0 };
    const stats = {
        generation,
        scheduled: false,
        sampled: 0,
        interpolated: 0,
        selectedPropagation: null,
        staleJobsDiscarded: 0,
        pending: false,
        coverageLimited: false,
        coverageLimitedObjects: 0
    };

    const stateFor = object => {
        let state = states.get(object);
        if (!state) {
            state = createObjectMotionState();
            states.set(object, state);
        }
        return state;
    };

    const restartSampling = () => {
        jobGeneration += 1;
        if (pendingJob) {
            cancelSchedule(pendingJob.id);
            pendingJob = null;
        }
        stats.pending = false;
        stats.coverageLimited = false;
        stats.coverageLimitedObjects = 0;
        samplingSweepRemaining = Math.max(0, catalogLength);
    };

    const markPositionStale = object => {
        object.motionPositionReady = false;
        if (object.mesh) {
            object.mesh.userData ??= {};
            object.mesh.userData.positionReady = false;
            object.mesh.visible = false;
        }
    };

    const invalidate = ({ hideStale = true } = {}) => {
        generation += 1;
        stats.generation = generation;
        restartSampling();
        if (hideStale && Array.isArray(catalogSource)) catalogSource.forEach(markPositionStale);
    };

    const evaluateState = (state, simTimeMs, output) => {
        const duration = state.endTimeMs - state.startTimeMs;
        const fraction = duration > 0 ? (simTimeMs - state.startTimeMs) / duration : 0;
        return hermiteInterpolatePosition(
            output,
            state.startPosition,
            state.endPosition,
            state.startVelocity,
            state.endVelocity,
            fraction,
            duration
        );
    };

    const filterAllowsObject = object => object?.mesh?.userData?.filterVisible ?? object?.mesh?.visible === true;

    const markPropagationInvalid = (object, state, realTimeMs, trackCatalogRetry = true) => {
        state.valid = false;
        state.retryAfterRealMs = realTimeMs + failureRetryMs;
        if (trackCatalogRetry) {
            nextFailureRetryRealMs = Math.min(nextFailureRetryRealMs, state.retryAfterRealMs);
        }
        object.propagationInvalid = true;
        markPositionStale(object);
        if (object.mesh) {
            object.mesh.userData ??= {};
            if (typeof object.mesh.userData.filterVisible !== 'boolean') {
                object.mesh.userData.filterVisible = object.mesh.visible === true;
            }
        }
    };

    const markPropagationValid = object => {
        object.propagationInvalid = false;
        object.motionPositionReady = true;
        if (object.mesh) {
            object.mesh.userData ??= {};
            object.mesh.userData.positionReady = true;
            if (filterAllowsObject(object) && object.mesh.userData.pointMarkerSuppressed !== true) {
                object.mesh.visible = true;
            }
        }
    };

    const stateNeedsSample = (object, simTimeMs, direction, realTimeMs) => {
        if (!object?.satrec || !object?.mesh || !filterAllowsObject(object)) return false;
        const state = states.get(object);
        if (state && realTimeMs < state.retryAfterRealMs) return false;
        if (!state?.valid || state.generation !== generation) return true;
        const availableAheadMs = direction > 0
            ? state.endTimeMs - simTimeMs
            : simTimeMs - state.startTimeMs;
        return availableAheadMs <= state.windowMs * 0.35;
    };

    const sampleObject = (object, job, appliedAtRealMs) => {
        if (object === job.selectedObject || !stateNeedsSample(
            object,
            job.simTimeMs,
            job.direction,
            appliedAtRealMs
        )) return false;
        const state = stateFor(object);
        const curvatureWindowMs = satelliteInterpolationWindowMs(object.satrec, options);
        const windowMs = Math.min(job.windowMs, curvatureWindowMs);
        if (job.windowMs > curvatureWindowMs) job.coverageLimitedObjects += 1;
        const leadMs = Math.max(Math.min(minWindowMs, windowMs) * 0.2, windowMs * 0.2);
        const t0 = job.direction > 0 ? job.simTimeMs - leadMs : job.simTimeMs - windowMs;
        const t1 = job.direction > 0 ? job.simTimeMs + windowMs : job.simTimeMs + leadMs;
        state.startDate.setTime(Math.min(t0, t1));
        state.endDate.setTime(Math.max(t0, t1));
        const startPropagation = propagate(object.satrec, state.startDate);
        const endPropagation = propagate(object.satrec, state.endDate);
        const oldX = object.mesh.position?.x;
        const oldY = object.mesh.position?.y;
        const oldZ = object.mesh.position?.z;
        const hadValidState = state.valid && state.generation === generation && object.motionPositionReady === true &&
            Number.isFinite(oldX) && Number.isFinite(oldY) && Number.isFinite(oldZ);
        if (!toSceneSample(startPropagation, state.startPosition, state.startVelocity) ||
            !toSceneSample(endPropagation, state.endPosition, state.endVelocity)) {
            markPropagationInvalid(object, state, appliedAtRealMs);
            return false;
        }
        state.startTimeMs = state.startDate.getTime();
        state.endTimeMs = state.endDate.getTime();
        state.windowMs = windowMs;
        state.generation = generation;
        state.valid = true;
        state.retryAfterRealMs = Number.NEGATIVE_INFINITY;
        if (hadValidState && correctionBlendMs > 0) {
            evaluateState(state, job.simTimeMs, interpolationScratch);
            state.correction.x = oldX - interpolationScratch.x;
            state.correction.y = oldY - interpolationScratch.y;
            state.correction.z = oldZ - interpolationScratch.z;
            state.correctionStartRealMs = appliedAtRealMs;
        } else {
            state.correction.x = 0;
            state.correction.y = 0;
            state.correction.z = 0;
            state.correctionStartRealMs = Number.NEGATIVE_INFINITY;
            evaluateState(state, job.simTimeMs, state.renderedPosition);
            writeVector(object.mesh.position, state.renderedPosition);
        }
        markPropagationValid(object);
        return true;
    };

    const runJob = job => {
        if (job.generation !== generation || job.jobGeneration !== jobGeneration || job.objects !== catalogSource ||
            job.objects.length !== job.catalogLength ||
            job.objects[0] !== job.catalogFirst || job.objects[job.objects.length - 1] !== job.catalogLast) {
            stats.staleJobsDiscarded += 1;
            return;
        }
        const startedAt = now();
        let inspected = 0;
        let sampled = 0;
        while (inspected < job.objects.length && sampled < maxSamplesPerBatch) {
            const index = cursor % job.objects.length;
            cursor = (cursor + 1) % job.objects.length;
            inspected += 1;
            if (sampleObject(job.objects[index], job, now())) sampled += 1;
            if (now() - startedAt >= propagationBudgetMs) break;
        }
        samplingSweepRemaining = Math.max(0, samplingSweepRemaining - inspected);
        stats.sampled = sampled;
        stats.coverageLimitedObjects = job.coverageLimitedObjects;
        stats.coverageLimited = job.coverageLimitedObjects > 0;
    };

    const scheduleSamples = (objects, selectedObject, simTimeMs, rate, realTimeMs) => {
        if (pendingJob || objects.length === 0 || samplingSweepRemaining <= 0) return;
        const direction = rate < 0 ? -1 : 1;
        const windowMs = Math.max(
            minWindowMs,
            Math.min(maxWindowMs, Math.abs(rate) * SIM_MILLISECONDS_PER_WARP_SECOND * windowRealSeconds)
        );
        const job = {
            id: null,
            generation,
            jobGeneration,
            objects,
            selectedObject,
            direction,
            windowMs,
            coverageLimitedObjects: 0,
            simTimeMs,
            catalogLength: objects.length,
            catalogFirst: objects[0],
            catalogLast: objects[objects.length - 1]
        };
        pendingJob = job;
        job.id = schedule(() => {
            if (pendingJob === job) pendingJob = null;
            stats.pending = false;
            runJob(job);
        });
        stats.scheduled = true;
        stats.pending = true;
    };

    return Object.freeze({
        update(objects, context = {}) {
            const source = Array.isArray(objects) ? objects : [];
            const selectedObject = context.selectedObject ?? null;
            const simTimeMs = Number(context.simTimeMs);
            const rate = Number.isFinite(context.rate) ? context.rate : 0;
            const realTimeMs = Number.isFinite(context.realTimeMs) ? context.realTimeMs : now();
            const clockGeneration = Number(context.clockGeneration);
            if (!Number.isFinite(simTimeMs)) throw new TypeError('Satellite motion update requires a finite simulation time.');

            const nextFirst = source[0] ?? null;
            const nextLast = source[source.length - 1] ?? null;
            if (source !== catalogSource || source.length !== catalogLength ||
                nextFirst !== catalogFirst || nextLast !== catalogLast) {
                catalogSource = source;
                catalogLength = source.length;
                catalogFirst = nextFirst;
                catalogLast = nextLast;
                cursor = 0;
                restartSampling();
            }
            if (Number.isFinite(clockGeneration) && clockGeneration !== lastClockGeneration) {
                if (Number.isFinite(lastClockGeneration)) restartSampling();
                lastClockGeneration = clockGeneration;
            }
            if (selectedObject !== lastSelectedObject) {
                lastSelectedObject = selectedObject;
                restartSampling();
            }

            const direction = rate < 0 ? -1 : rate > 0 ? 1 : lastDirection;
            if (rate && direction !== lastDirection) {
                lastDirection = direction;
                restartSampling();
            }
            const previousSimTimeMs = lastSimTimeMs;
            if (Number.isFinite(lastSimTimeMs) && Number.isFinite(lastRealTimeMs)) {
                const expected = Math.max(1, Math.abs(realTimeMs - lastRealTimeMs) * Math.abs(rate) * 60);
                if (Math.abs(simTimeMs - lastSimTimeMs) > Math.max(5 * 60_000, expected * 4)) invalidate();
            }
            lastSimTimeMs = simTimeMs;
            lastRealTimeMs = realTimeMs;
            if (realTimeMs >= nextFailureRetryRealMs && samplingSweepRemaining <= 0) {
                samplingSweepRemaining = source.length;
                nextFailureRetryRealMs = Number.POSITIVE_INFINITY;
            }

            stats.scheduled = false;
            stats.sampled = 0;
            stats.interpolated = 0;
            stats.selectedPropagation = null;

            if (selectedObject?.satrec) {
                const selectedState = stateFor(selectedObject);
                const retryReady = realTimeMs >= selectedState.retryAfterRealMs;
                const shouldPropagateSelected =
                    (selectedState.valid && (selectedState.generation !== generation ||
                        selectedState.selectedTimeMs !== simTimeMs)) ||
                    (!selectedState.valid && retryReady);
                if (shouldPropagateSelected) {
                    selectedState.selectedDate.setTime(simTimeMs);
                    selectedState.selectedPropagation = propagate(selectedObject.satrec, selectedState.selectedDate);
                    selectedState.selectedTimeMs = simTimeMs;
                    if (finiteVector(selectedState.selectedPropagation?.position) && selectedObject.mesh?.position &&
                        toSceneSample(selectedState.selectedPropagation, selectedState.renderedPosition, selectedState.endVelocity)) {
                        writeVector(selectedObject.mesh.position, selectedState.renderedPosition);
                        selectedState.generation = generation;
                        selectedState.valid = true;
                        selectedState.retryAfterRealMs = Number.NEGATIVE_INFINITY;
                        markPropagationValid(selectedObject);
                    } else {
                        markPropagationInvalid(selectedObject, selectedState, realTimeMs, false);
                    }
                }
                stats.selectedPropagation = selectedState.selectedPropagation;
            }

            const simTimeChanged = !Number.isFinite(previousSimTimeMs) || simTimeMs !== previousSimTimeMs;
            if (simTimeChanged) {
                const direction = rate < 0 ? -1 : 1;
                let coverageSweepRequested = false;
                for (let index = 0; index < source.length; index += 1) {
                    const object = source[index];
                    if (object === selectedObject || !filterAllowsObject(object)) continue;
                    const state = states.get(object);
                    if (stateNeedsSample(object, simTimeMs, direction, realTimeMs)) {
                        coverageSweepRequested = true;
                    }
                    if (!state?.valid || state.generation !== generation) continue;
                    if (simTimeMs < state.startTimeMs || simTimeMs > state.endTimeMs) {
                        markPositionStale(object);
                        continue;
                    }
                    evaluateState(state, simTimeMs, state.renderedPosition);
                    if (correctionBlendMs > 0 && Number.isFinite(state.correctionStartRealMs)) {
                        const correctionFraction = Math.min(1, Math.max(0,
                            (realTimeMs - state.correctionStartRealMs) / correctionBlendMs
                        ));
                        const remaining = 1 - correctionFraction;
                        state.renderedPosition.x += state.correction.x * remaining;
                        state.renderedPosition.y += state.correction.y * remaining;
                        state.renderedPosition.z += state.correction.z * remaining;
                        if (correctionFraction >= 1) state.correctionStartRealMs = Number.NEGATIVE_INFINITY;
                    }
                    writeVector(object.mesh.position, state.renderedPosition);
                    stats.interpolated += 1;
                }
                if (coverageSweepRequested && samplingSweepRemaining <= 0) {
                    samplingSweepRemaining = source.length;
                }
            }

            scheduleSamples(source, selectedObject, simTimeMs, rate, realTimeMs);
            stats.generation = generation;
            return stats;
        },
        isRenderReady(object, simTimeMs) {
            if (!object?.mesh || object.motionPositionReady !== true || object.propagationInvalid === true) return false;
            const state = states.get(object);
            if (!state?.valid || state.generation !== generation || !Number.isFinite(simTimeMs)) return false;
            if (state.selectedTimeMs === simTimeMs && finiteVector(state.selectedPropagation?.position)) return true;
            return simTimeMs >= state.startTimeMs && simTimeMs <= state.endTimeMs;
        },
        invalidate,
        dispose() {
            invalidate();
            catalogLength = -1;
            catalogSource = null;
            catalogFirst = null;
            catalogLast = null;
        },
        diagnostics() {
            return stats;
        },
        stateFor(object) {
            return states.get(object) ?? null;
        }
    });
}

export const SATELLITE_MOTION_DEFAULTS = Object.freeze({
    maxSamplesPerBatch: DEFAULT_MAX_SAMPLES_PER_BATCH,
    propagationBudgetMs: DEFAULT_PROPAGATION_BUDGET_MS,
    windowRealSeconds: DEFAULT_WINDOW_REAL_SECONDS,
    minWindowMs: DEFAULT_MIN_WINDOW_MS,
    maxWindowMs: DEFAULT_MAX_WINDOW_MS,
    correctionBlendMs: DEFAULT_CORRECTION_BLEND_MS,
    failureRetryMs: DEFAULT_FAILURE_RETRY_MS,
    maxOrbitFraction: DEFAULT_MAX_ORBIT_FRACTION
});
