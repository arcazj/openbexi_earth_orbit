import { createTlePropagationService } from '../orbit/propagationService.js';
import {
    ScreeningCancelledError,
    screenSelectedObjectAgainstCatalog
} from './conjunctionScreening.js';
import {
    CONJUNCTION_WORKER_MESSAGE,
    serializeWorkerError
} from './conjunctionWorkerProtocol.js';

export const DEFAULT_SATELLITE_MODULE_URL = new URL(
    '../../vendor/satellite.js/6.0.2/satellite.es.js',
    import.meta.url
).href;

const satelliteLibraryPromises = new Map();

export async function loadSatelliteLibrary(
    moduleUrl = DEFAULT_SATELLITE_MODULE_URL,
    importer = specifier => import(specifier)
) {
    const normalizedUrl = String(moduleUrl || DEFAULT_SATELLITE_MODULE_URL);
    if (!satelliteLibraryPromises.has(normalizedUrl)) {
        const libraryPromise = importer(normalizedUrl).then(moduleNamespace => {
            const library = moduleNamespace?.propagate ? moduleNamespace : globalThis.satellite;
            if (!library?.propagate || !library?.twoline2satrec) {
                throw new Error(`Satellite module ${normalizedUrl} did not expose the expected API.`);
            }
            return library;
        }).catch(error => {
            if (satelliteLibraryPromises.get(normalizedUrl) === libraryPromise) {
                satelliteLibraryPromises.delete(normalizedUrl);
            }
            throw error;
        });
        satelliteLibraryPromises.set(normalizedUrl, libraryPromise);
    }
    return satelliteLibraryPromises.get(normalizedUrl);
}

export function createConjunctionWorkerController({
    postMessage,
    loadLibrary = loadSatelliteLibrary,
    screen = screenSelectedObjectAgainstCatalog,
    yieldControl = () => new Promise(resolve => setTimeout(resolve, 0))
} = {}) {
    if (typeof postMessage !== 'function') throw new TypeError('Worker controller requires postMessage.');
    const activeRequests = new Map();
    const catalogTransfers = new Map();

    const post = message => postMessage(Object.freeze(message));

    async function runScreening(message) {
        const requestId = String(message.request_id ?? '').trim();
        if (!requestId) {
            post({
                type: CONJUNCTION_WORKER_MESSAGE.ERROR,
                request_id: '',
                error: serializeWorkerError(new TypeError('Worker request_id is required.'))
            });
            return;
        }
        if (activeRequests.has(requestId)) {
            post({
                type: CONJUNCTION_WORKER_MESSAGE.ERROR,
                request_id: requestId,
                error: serializeWorkerError(new Error(`Worker request ${requestId} is already active.`))
            });
            return;
        }

        const transfer = catalogTransfers.get(requestId);
        catalogTransfers.delete(requestId);
        let screeningRequest = message.request;
        if (!Array.isArray(screeningRequest?.catalog)) {
            const records = transfer?.chunks?.flat() ?? [];
            if (!transfer || records.length !== transfer.object_count) {
                post({
                    type: CONJUNCTION_WORKER_MESSAGE.ERROR,
                    request_id: requestId,
                    error: serializeWorkerError(new Error('Worker catalog transfer is incomplete.'))
                });
                return;
            }
            screeningRequest = { ...screeningRequest, catalog: records };
        }

        const control = { cancelled: false };
        activeRequests.set(requestId, control);
        try {
            const satelliteLib = await loadLibrary(message.satellite_module_url || DEFAULT_SATELLITE_MODULE_URL);
            if (control.cancelled) throw new ScreeningCancelledError();
            const propagationService = createTlePropagationService({ satelliteLib });
            let lastProgressStage = null;
            let lastProgressFraction = -1;
            let lastProgressAt = Number.NEGATIVE_INFINITY;
            const reportProgress = progress => {
                const now = globalThis.performance?.now?.() ?? Date.now();
                const fraction = Number(progress?.fraction);
                const stageChanged = progress?.stage !== lastProgressStage;
                const completed = Number.isFinite(fraction) && fraction >= 1;
                const advanced = Number.isFinite(fraction) && fraction - lastProgressFraction >= 0.01;
                if (!stageChanged && !completed && !(advanced && now - lastProgressAt >= 50)) return;
                lastProgressStage = progress?.stage ?? null;
                lastProgressFraction = Number.isFinite(fraction) ? fraction : lastProgressFraction;
                lastProgressAt = now;
                post({
                    type: CONJUNCTION_WORKER_MESSAGE.PROGRESS,
                    request_id: requestId,
                    progress
                });
            };
            const result = await screen(screeningRequest, {
                propagationService,
                isCancelled: () => control.cancelled,
                yieldControl,
                onProgress: reportProgress
            });
            if (control.cancelled) throw new ScreeningCancelledError();
            post({
                type: CONJUNCTION_WORKER_MESSAGE.COMPLETE,
                request_id: requestId,
                result
            });
        } catch (error) {
            if (control.cancelled || error?.code === 'SCREENING_CANCELLED') {
                post({
                    type: CONJUNCTION_WORKER_MESSAGE.CANCELLED,
                    request_id: requestId,
                    error: serializeWorkerError(error)
                });
            } else {
                post({
                    type: CONJUNCTION_WORKER_MESSAGE.ERROR,
                    request_id: requestId,
                    error: serializeWorkerError(error)
                });
            }
        } finally {
            activeRequests.delete(requestId);
        }
    }

    function handleMessage(message) {
        if (message?.type === CONJUNCTION_WORKER_MESSAGE.CANCEL) {
            const requestId = String(message.request_id ?? '');
            const active = activeRequests.get(requestId);
            if (active) active.cancelled = true;
            if (catalogTransfers.delete(requestId)) {
                post({
                    type: CONJUNCTION_WORKER_MESSAGE.CANCELLED,
                    request_id: requestId,
                    error: serializeWorkerError(new ScreeningCancelledError())
                });
            }
            return;
        }
        if (message?.type === CONJUNCTION_WORKER_MESSAGE.CATALOG_BEGIN) {
            catalogTransfers.set(String(message.request_id ?? ''), {
                object_count: message.object_count,
                chunks: []
            });
            return;
        }
        if (message?.type === CONJUNCTION_WORKER_MESSAGE.CATALOG_CHUNK) {
            const transfer = catalogTransfers.get(String(message.request_id ?? ''));
            if (transfer && Number.isInteger(message.chunk_index) && Array.isArray(message.records)) {
                transfer.chunks[message.chunk_index] = message.records;
            }
            return;
        }
        if (message?.type === CONJUNCTION_WORKER_MESSAGE.SCREEN) {
            void runScreening(message);
        }
    }

    return Object.freeze({ handleMessage, activeRequests, catalogTransfers });
}

if (typeof globalThis.addEventListener === 'function' && typeof globalThis.postMessage === 'function') {
    const controller = createConjunctionWorkerController({
        postMessage: message => globalThis.postMessage(message)
    });
    globalThis.addEventListener('message', event => controller.handleMessage(event.data));
}
