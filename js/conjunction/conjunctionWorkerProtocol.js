export const CONJUNCTION_WORKER_MESSAGE = Object.freeze({
    CATALOG_BEGIN: 'conjunction.catalog.begin',
    CATALOG_CHUNK: 'conjunction.catalog.chunk',
    SCREEN: 'conjunction.screen',
    CANCEL: 'conjunction.cancel',
    PROGRESS: 'conjunction.progress',
    COMPLETE: 'conjunction.complete',
    CANCELLED: 'conjunction.cancelled',
    ERROR: 'conjunction.error'
});

export function createCatalogBeginWorkerMessage({ requestId, objectCount }) {
    if (!Number.isInteger(objectCount) || objectCount < 0 || objectCount > 100_000) {
        throw new TypeError('Worker catalog objectCount must be an integer from 0 through 100000.');
    }
    return Object.freeze({
        type: CONJUNCTION_WORKER_MESSAGE.CATALOG_BEGIN,
        request_id: requireRequestId(requestId),
        object_count: objectCount
    });
}

export function createCatalogChunkWorkerMessage({ requestId, chunkIndex, records }) {
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
        throw new TypeError('Worker catalog chunkIndex must be a non-negative integer.');
    }
    if (!Array.isArray(records) || records.length > 512) {
        throw new TypeError('Worker catalog records must be an array of at most 512 objects.');
    }
    return Object.freeze({
        type: CONJUNCTION_WORKER_MESSAGE.CATALOG_CHUNK,
        request_id: requireRequestId(requestId),
        chunk_index: chunkIndex,
        records
    });
}

function requireRequestId(requestId) {
    const normalized = String(requestId ?? '').trim();
    if (!normalized) throw new TypeError('Worker requestId is required.');
    return normalized;
}

export function createScreenWorkerMessage({ requestId, request, satelliteModuleUrl = null }) {
    if (!request || typeof request !== 'object') throw new TypeError('Worker screening request is required.');
    return Object.freeze({
        type: CONJUNCTION_WORKER_MESSAGE.SCREEN,
        request_id: requireRequestId(requestId),
        request,
        satellite_module_url: satelliteModuleUrl == null ? null : String(satelliteModuleUrl)
    });
}

export function createCancelWorkerMessage(requestId) {
    return Object.freeze({
        type: CONJUNCTION_WORKER_MESSAGE.CANCEL,
        request_id: requireRequestId(requestId)
    });
}

export function serializeWorkerError(error) {
    return Object.freeze({
        name: error?.name || 'Error',
        code: error?.code || 'CONJUNCTION_WORKER_ERROR',
        message: error?.message || String(error),
        details: error?.details ?? null,
        stack: error?.stack ?? null
    });
}

export function workerErrorFromPayload(payload = {}) {
    const error = new Error(payload.message || 'Conjunction Worker failed.');
    error.name = payload.name || 'Error';
    error.code = payload.code || 'CONJUNCTION_WORKER_ERROR';
    error.details = payload.details ?? null;
    return error;
}

export function isWorkerResponse(message) {
    return !!message && [
        CONJUNCTION_WORKER_MESSAGE.PROGRESS,
        CONJUNCTION_WORKER_MESSAGE.COMPLETE,
        CONJUNCTION_WORKER_MESSAGE.CANCELLED,
        CONJUNCTION_WORKER_MESSAGE.ERROR
    ].includes(message.type) && typeof message.request_id === 'string';
}
