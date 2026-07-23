import { createTlePropagationService } from '../orbit/propagationService.js';
import {
    ScreeningCancelledError,
    screenSelectedObjectAgainstCatalog
} from './conjunctionScreening.js';
import {
    CONJUNCTION_WORKER_MESSAGE,
    createCatalogBeginWorkerMessage,
    createCatalogChunkWorkerMessage,
    createCancelWorkerMessage,
    createScreenWorkerMessage,
    isWorkerResponse,
    workerErrorFromPayload
} from './conjunctionWorkerProtocol.js';

const DEFAULT_WORKER_URL = new URL('./conjunctionWorker.js', import.meta.url);
const DEFAULT_SATELLITE_MODULE_URL = new URL(
    '../../vendor/satellite.js/6.0.2/satellite.es.js',
    import.meta.url
).href;
const DEFAULT_CATALOG_CHUNK_SIZE = 512;
const DEFAULT_CATALOG_CHUNKS_PER_YIELD = 4;

let nextRequestNumber = 1;

function defaultRequestId() {
    const id = `conjunction-worker-${nextRequestNumber}`;
    nextRequestNumber += 1;
    return id;
}

async function defaultFallback(request, runtime = {}) {
    const propagationService = runtime.propagationService ?? createTlePropagationService({
        satelliteLib: runtime.satelliteLib ?? globalThis.satellite
    });
    return screenSelectedObjectAgainstCatalog(request, {
        ...runtime,
        propagationService
    });
}

export function createConjunctionWorkerClient({
    workerUrl = DEFAULT_WORKER_URL,
    satelliteModuleUrl = DEFAULT_SATELLITE_MODULE_URL,
    WorkerCtor = globalThis.Worker,
    fallback = defaultFallback,
    forceFallback = false,
    workerOptions = { type: 'module', name: 'openbexi-conjunction-screening' },
    catalogChunkSize = DEFAULT_CATALOG_CHUNK_SIZE,
    catalogChunksPerYield = DEFAULT_CATALOG_CHUNKS_PER_YIELD,
    uploadYield = () => new Promise(resolve => setTimeout(resolve, 0))
} = {}) {
    if (!Number.isInteger(catalogChunkSize) || catalogChunkSize < 1 || catalogChunkSize > 512) {
        throw new TypeError('catalogChunkSize must be an integer from 1 through 512.');
    }
    if (!Number.isInteger(catalogChunksPerYield) || catalogChunksPerYield < 1 || catalogChunksPerYield > 64) {
        throw new TypeError('catalogChunksPerYield must be an integer from 1 through 64.');
    }
    const pending = new Map();
    let worker = null;
    let terminated = false;

    const settle = (requestId, action) => {
        const entry = pending.get(requestId);
        if (!entry) return;
        pending.delete(requestId);
        entry.removeAbortListener?.();
        action(entry);
    };

    const handleWorkerMessage = event => {
        const message = event?.data ?? event;
        if (!isWorkerResponse(message)) return;
        const requestId = message.request_id;
        const entry = pending.get(requestId);
        if (!entry) return;
        if (message.type === CONJUNCTION_WORKER_MESSAGE.PROGRESS) {
            entry.onProgress(message.progress);
            return;
        }
        if (message.type === CONJUNCTION_WORKER_MESSAGE.COMPLETE) {
            settle(requestId, current => current.resolve(message.result));
            return;
        }
        if (message.type === CONJUNCTION_WORKER_MESSAGE.CANCELLED) {
            settle(requestId, current => current.reject(new ScreeningCancelledError()));
            return;
        }
        if (message.type === CONJUNCTION_WORKER_MESSAGE.ERROR) {
            settle(requestId, current => current.reject(workerErrorFromPayload(message.error)));
        }
    };

    const ensureWorker = () => {
        if (worker || forceFallback || typeof WorkerCtor !== 'function') return worker;
        const createdWorker = new WorkerCtor(workerUrl, workerOptions);
        worker = createdWorker;
        createdWorker.addEventListener?.('message', handleWorkerMessage);
        if (!createdWorker.addEventListener) createdWorker.onmessage = handleWorkerMessage;
        const handleError = event => {
            const error = event?.error || new Error(event?.message || 'Conjunction Worker failed.');
            createdWorker.terminate?.();
            if (worker === createdWorker) worker = null;
            for (const requestId of [...pending.keys()]) {
                settle(requestId, entry => entry.reject(error));
            }
        };
        createdWorker.addEventListener?.('error', handleError);
        if (!createdWorker.addEventListener) createdWorker.onerror = handleError;
        return worker;
    };

    function cancel(requestId) {
        const normalizedId = String(requestId ?? '');
        if (!pending.has(normalizedId)) return false;
        try {
            worker?.postMessage(createCancelWorkerMessage(normalizedId));
        } catch (error) {
            settle(normalizedId, entry => entry.reject(error));
        }
        return true;
    }

    async function screen(request, {
        requestId = defaultRequestId(),
        signal = null,
        onProgress = () => {},
        fallbackRuntime = {}
    } = {}) {
        if (terminated) throw new Error('Conjunction Worker client has been terminated.');
        if (signal?.aborted) throw new ScreeningCancelledError();

        const activeWorker = ensureWorker();
        if (!activeWorker) {
            if (typeof fallback !== 'function') {
                throw new Error('Web Workers are unavailable and no conjunction-screening fallback was provided.');
            }
            let cancelled = false;
            const abort = () => { cancelled = true; };
            signal?.addEventListener?.('abort', abort, { once: true });
            try {
                return await fallback(request, {
                    ...fallbackRuntime,
                    onProgress,
                    isCancelled: () => cancelled || signal?.aborted === true
                });
            } finally {
                signal?.removeEventListener?.('abort', abort);
            }
        }

        const normalizedRequestId = String(requestId);
        if (pending.has(normalizedRequestId)) {
            throw new Error(`Conjunction Worker request ${normalizedRequestId} is already pending.`);
        }
        const completion = new Promise((resolve, reject) => {
            const abort = () => cancel(normalizedRequestId);
            signal?.addEventListener?.('abort', abort, { once: true });
            pending.set(normalizedRequestId, {
                resolve,
                reject,
                onProgress: typeof onProgress === 'function' ? onProgress : () => {},
                removeAbortListener: () => signal?.removeEventListener?.('abort', abort)
            });
        });
        // Cancellation can settle this promise while catalog upload is yielding,
        // before the async screen() call returns and its caller can attach a handler.
        void completion.catch(() => {});
        try {
            const catalog = request?.catalog;
            let workerRequest = request;
            if (Array.isArray(catalog)) {
                const { catalog: omittedCatalog, ...requestWithoutCatalog } = request;
                void omittedCatalog;
                workerRequest = requestWithoutCatalog;
                activeWorker.postMessage(createCatalogBeginWorkerMessage({
                    requestId: normalizedRequestId,
                    objectCount: catalog.length
                }));
                for (let offset = 0, chunkIndex = 0; offset < catalog.length; offset += catalogChunkSize, chunkIndex += 1) {
                    if (!pending.has(normalizedRequestId)) break;
                    activeWorker.postMessage(createCatalogChunkWorkerMessage({
                        requestId: normalizedRequestId,
                        chunkIndex,
                        records: catalog.slice(offset, offset + catalogChunkSize)
                    }));
                    const hasMoreChunks = offset + catalogChunkSize < catalog.length;
                    if (hasMoreChunks && (chunkIndex + 1) % catalogChunksPerYield === 0) {
                        await uploadYield();
                    }
                }
            }
            if (pending.has(normalizedRequestId)) {
                activeWorker.postMessage(createScreenWorkerMessage({
                    requestId: normalizedRequestId,
                    request: workerRequest,
                    satelliteModuleUrl
                }));
            }
        } catch (error) {
            settle(normalizedRequestId, entry => entry.reject(error));
        }
        return completion;
    }

    function terminate() {
        if (terminated) return;
        terminated = true;
        worker?.terminate?.();
        worker = null;
        for (const requestId of [...pending.keys()]) {
            settle(requestId, entry => entry.reject(new ScreeningCancelledError('Conjunction Worker client terminated.')));
        }
    }

    return Object.freeze({
        screen,
        cancel,
        terminate,
        pendingRequestCount: () => pending.size,
        usesWorker: () => !!worker
    });
}
