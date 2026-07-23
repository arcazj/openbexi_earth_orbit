import assert from 'node:assert/strict';
import {
    ScreeningCancelledError
} from '../js/conjunction/conjunctionScreening.js';
import {
    createConjunctionWorkerClient
} from '../js/conjunction/conjunctionWorkerClient.js';
import {
    createConjunctionWorkerController,
    loadSatelliteLibrary
} from '../js/conjunction/conjunctionWorker.js';
import {
    CONJUNCTION_WORKER_MESSAGE,
    createCatalogBeginWorkerMessage,
    createCatalogChunkWorkerMessage,
    createCancelWorkerMessage,
    createScreenWorkerMessage,
    isWorkerResponse,
    serializeWorkerError,
    workerErrorFromPayload
} from '../js/conjunction/conjunctionWorkerProtocol.js';

async function waitFor(predicate, message) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    assert.fail(message);
}

const screenMessage = createScreenWorkerMessage({
    requestId: 'worker:test',
    request: { primary: {}, catalog: [] },
    satelliteModuleUrl: './satellite.es.js'
});
assert.deepStrictEqual(screenMessage, {
    type: CONJUNCTION_WORKER_MESSAGE.SCREEN,
    request_id: 'worker:test',
    request: { primary: {}, catalog: [] },
    satellite_module_url: './satellite.es.js'
});
assert(Object.isFrozen(screenMessage));
assert.deepStrictEqual(createCancelWorkerMessage('worker:test'), {
    type: CONJUNCTION_WORKER_MESSAGE.CANCEL,
    request_id: 'worker:test'
});
assert.throws(() => createCancelWorkerMessage(''), /requestId/i);
assert.deepStrictEqual(createCatalogBeginWorkerMessage({
    requestId: 'worker:catalog', objectCount: 2
}), {
    type: CONJUNCTION_WORKER_MESSAGE.CATALOG_BEGIN,
    request_id: 'worker:catalog',
    object_count: 2
});
assert.deepStrictEqual(createCatalogChunkWorkerMessage({
    requestId: 'worker:catalog', chunkIndex: 0, records: [{ id: 1 }, { id: 2 }]
}), {
    type: CONJUNCTION_WORKER_MESSAGE.CATALOG_CHUNK,
    request_id: 'worker:catalog',
    chunk_index: 0,
    records: [{ id: 1 }, { id: 2 }]
});
assert.throws(() => createCatalogChunkWorkerMessage({
    requestId: 'worker:catalog', chunkIndex: 0, records: Array(513)
}), /at most 512/i);

const serializedError = serializeWorkerError(Object.assign(new TypeError('bad request'), {
    code: 'BAD_REQUEST',
    details: { field: 'primary' }
}));
assert.strictEqual(serializedError.name, 'TypeError');
assert.strictEqual(serializedError.code, 'BAD_REQUEST');
assert.deepStrictEqual(serializedError.details, { field: 'primary' });
const revivedError = workerErrorFromPayload(serializedError);
assert.strictEqual(revivedError.name, 'TypeError');
assert.strictEqual(revivedError.code, 'BAD_REQUEST');
assert.strictEqual(revivedError.message, 'bad request');
assert.strictEqual(isWorkerResponse({
    type: CONJUNCTION_WORKER_MESSAGE.PROGRESS,
    request_id: 'worker:test'
}), true);
assert.strictEqual(isWorkerResponse({ type: CONJUNCTION_WORKER_MESSAGE.SCREEN, request_id: 'worker:test' }), false);

const loadedSatellite = await loadSatelliteLibrary();
assert.strictEqual(typeof loadedSatellite.twoline2satrec, 'function');
assert.strictEqual(typeof loadedSatellite.propagate, 'function');
let retryImportAttempts = 0;
const retryImporter = async () => {
    retryImportAttempts += 1;
    if (retryImportAttempts === 1) throw new Error('transient import failure');
    return { twoline2satrec() {}, propagate() {} };
};
await assert.rejects(loadSatelliteLibrary('test:transient-import', retryImporter), /transient/i);
const retriedSatellite = await loadSatelliteLibrary('test:transient-import', retryImporter);
assert.strictEqual(typeof retriedSatellite.propagate, 'function');
assert.strictEqual(retryImportAttempts, 2);

const posted = [];
const controller = createConjunctionWorkerController({
    postMessage: message => posted.push(message),
    loadLibrary: async () => ({}),
    screen: async (request, runtime) => {
        runtime.onProgress({ stage: 'SYNTHETIC', completed: 1, total: 1, fraction: 1 });
        return { marker: request.marker };
    },
    yieldControl: async () => {}
});
controller.handleMessage(createScreenWorkerMessage({
    requestId: 'controller:complete',
    request: { marker: 42, catalog: [] }
}));
await waitFor(
    () => posted.some(message => message.type === CONJUNCTION_WORKER_MESSAGE.COMPLETE),
    'worker controller did not complete'
);
assert.deepStrictEqual(posted.map(message => message.type), [
    CONJUNCTION_WORKER_MESSAGE.PROGRESS,
    CONJUNCTION_WORKER_MESSAGE.COMPLETE
]);
assert.deepStrictEqual(posted[1].result, { marker: 42 });
assert.strictEqual(controller.activeRequests.size, 0);

let transferredCatalog = null;
const transferMessages = [];
const transferController = createConjunctionWorkerController({
    postMessage: message => transferMessages.push(message),
    loadLibrary: async () => ({}),
    screen: async request => {
        transferredCatalog = request.catalog;
        return { count: request.catalog.length };
    }
});
transferController.handleMessage(createCatalogBeginWorkerMessage({
    requestId: 'controller:transfer', objectCount: 3
}));
transferController.handleMessage(createCatalogChunkWorkerMessage({
    requestId: 'controller:transfer', chunkIndex: 0, records: [{ id: 1 }, { id: 2 }]
}));
transferController.handleMessage(createCatalogChunkWorkerMessage({
    requestId: 'controller:transfer', chunkIndex: 1, records: [{ id: 3 }]
}));
transferController.handleMessage(createScreenWorkerMessage({
    requestId: 'controller:transfer', request: { marker: 'chunked' }
}));
await waitFor(
    () => transferMessages.some(message => message.type === CONJUNCTION_WORKER_MESSAGE.COMPLETE),
    'worker controller did not complete a chunked catalog transfer'
);
assert.deepStrictEqual(transferredCatalog, [{ id: 1 }, { id: 2 }, { id: 3 }]);
assert.strictEqual(transferController.catalogTransfers.size, 0);

const cancellationMessages = [];
let cancellationScreenCalled = false;
const cancellationController = createConjunctionWorkerController({
    postMessage: message => cancellationMessages.push(message),
    loadLibrary: async () => ({}),
    screen: async () => {
        cancellationScreenCalled = true;
        return {};
    }
});
cancellationController.handleMessage(createScreenWorkerMessage({
    requestId: 'controller:cancel',
    request: { marker: 'cancel', catalog: [] }
}));
cancellationController.handleMessage(createCancelWorkerMessage('controller:cancel'));
await waitFor(
    () => cancellationMessages.some(message => message.type === CONJUNCTION_WORKER_MESSAGE.CANCELLED),
    'worker controller did not acknowledge cancellation'
);
assert.strictEqual(cancellationScreenCalled, false);
assert.strictEqual(cancellationController.activeRequests.size, 0);

const errorMessages = [];
const errorController = createConjunctionWorkerController({
    postMessage: message => errorMessages.push(message),
    loadLibrary: async () => ({}),
    screen: async () => {
        const error = new Error('screen failed');
        error.code = 'SCREEN_FAILED';
        throw error;
    }
});
errorController.handleMessage(createScreenWorkerMessage({
    requestId: 'controller:error',
    request: { marker: 'error', catalog: [] }
}));
await waitFor(
    () => errorMessages.some(message => message.type === CONJUNCTION_WORKER_MESSAGE.ERROR),
    'worker controller did not report an error'
);
assert.strictEqual(errorMessages[0].error.code, 'SCREEN_FAILED');

class FakeWorker {
    static instances = [];
    static heldMarkers = new Set(['cancel', 'hold']);
    static throwingMarkers = new Set(['throw']);

    constructor(url, options) {
        this.url = url;
        this.options = options;
        this.listeners = new Map();
        this.messages = [];
        this.terminated = false;
        FakeWorker.instances.push(this);
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    emit(type, event) {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
    }

    postMessage(message) {
        this.messages.push(message);
        if (message.type === CONJUNCTION_WORKER_MESSAGE.CANCEL) {
            queueMicrotask(() => this.emit('message', { data: {
                type: CONJUNCTION_WORKER_MESSAGE.CANCELLED,
                request_id: message.request_id,
                error: serializeWorkerError(new ScreeningCancelledError())
            } }));
            return;
        }
        if ([
            CONJUNCTION_WORKER_MESSAGE.CATALOG_BEGIN,
            CONJUNCTION_WORKER_MESSAGE.CATALOG_CHUNK
        ].includes(message.type)) return;
        if (message.type !== CONJUNCTION_WORKER_MESSAGE.SCREEN) return;
        if (FakeWorker.throwingMarkers.has(message.request?.marker)) {
            throw new Error('synthetic postMessage failure');
        }
        if (FakeWorker.heldMarkers.has(message.request?.marker)) return;
        queueMicrotask(() => {
            this.emit('message', { data: {
                type: CONJUNCTION_WORKER_MESSAGE.PROGRESS,
                request_id: message.request_id,
                progress: { stage: 'FAKE', completed: 1, total: 1, fraction: 1 }
            } });
            this.emit('message', { data: {
                type: CONJUNCTION_WORKER_MESSAGE.COMPLETE,
                request_id: message.request_id,
                result: { request_id: message.request_id, ok: true }
            } });
        });
    }

    terminate() {
        this.terminated = true;
    }
}

const client = createConjunctionWorkerClient({
    WorkerCtor: FakeWorker,
    workerUrl: 'fake-worker.js',
    satelliteModuleUrl: 'fake-satellite.js'
});
const clientProgress = [];
const clientResult = await client.screen({ marker: 'client' }, {
    requestId: 'client:complete',
    onProgress: progress => clientProgress.push(progress)
});
assert.deepStrictEqual(clientResult, { request_id: 'client:complete', ok: true });
assert.strictEqual(clientProgress.length, 1);
assert.strictEqual(clientProgress[0].fraction, 1);
assert.strictEqual(client.pendingRequestCount(), 0);
assert.strictEqual(client.usesWorker(), true);
assert.strictEqual(FakeWorker.instances[0].messages[0].satellite_module_url, 'fake-satellite.js');

const cancelledPromise = client.screen({ marker: 'cancel' }, { requestId: 'client:cancel' });
assert.strictEqual(client.cancel('client:cancel'), true);
await assert.rejects(cancelledPromise, error => error instanceof ScreeningCancelledError);
assert.strictEqual(client.pendingRequestCount(), 0);
client.terminate();
assert.strictEqual(FakeWorker.instances[0].terminated, true);
await assert.rejects(client.screen({}, { requestId: 'after-terminate' }), /terminated/i);

let catalogUploadYields = 0;
const chunkClient = createConjunctionWorkerClient({
    WorkerCtor: FakeWorker,
    workerUrl: 'fake-worker.js',
    satelliteModuleUrl: 'fake-satellite.js',
    catalogChunkSize: 2,
    catalogChunksPerYield: 2,
    uploadYield: async () => { catalogUploadYields += 1; }
});
const chunkResult = await chunkClient.screen({
    marker: 'chunked',
    catalog: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]
}, { requestId: 'client:chunked' });
assert.deepStrictEqual(chunkResult, { request_id: 'client:chunked', ok: true });
const chunkWorkerMessages = FakeWorker.instances.at(-1).messages;
assert.strictEqual(chunkWorkerMessages[0].type, CONJUNCTION_WORKER_MESSAGE.CATALOG_BEGIN);
assert.strictEqual(chunkWorkerMessages[0].object_count, 5);
assert.deepStrictEqual(
    chunkWorkerMessages.filter(message => message.type === CONJUNCTION_WORKER_MESSAGE.CATALOG_CHUNK)
        .map(message => message.records.length),
    [2, 2, 1]
);
const finalChunkScreen = chunkWorkerMessages.at(-1);
assert.strictEqual(finalChunkScreen.type, CONJUNCTION_WORKER_MESSAGE.SCREEN);
assert.strictEqual('catalog' in finalChunkScreen.request, false);
assert.strictEqual(catalogUploadYields, 1);
chunkClient.terminate();

const recoveryClient = createConjunctionWorkerClient({
    WorkerCtor: FakeWorker,
    workerUrl: 'fake-worker.js'
});
const crashedPromise = recoveryClient.screen({ marker: 'hold' }, { requestId: 'client:crash' });
const crashedWorker = FakeWorker.instances.at(-1);
crashedWorker.emit('error', { error: new Error('synthetic worker crash') });
await assert.rejects(crashedPromise, /synthetic worker crash/i);
assert.strictEqual(crashedWorker.terminated, true);
assert.strictEqual(recoveryClient.pendingRequestCount(), 0);
assert.strictEqual(recoveryClient.usesWorker(), false);
const recoveredResult = await recoveryClient.screen({ marker: 'recovered' }, { requestId: 'client:recovered' });
assert.deepStrictEqual(recoveredResult, { request_id: 'client:recovered', ok: true });
assert.notStrictEqual(FakeWorker.instances.at(-1), crashedWorker);
recoveryClient.terminate();

const throwingClient = createConjunctionWorkerClient({
    WorkerCtor: FakeWorker,
    workerUrl: 'fake-worker.js'
});
await assert.rejects(
    throwingClient.screen({ marker: 'throw' }, { requestId: 'client:throw' }),
    /synthetic postMessage failure/i
);
assert.strictEqual(throwingClient.pendingRequestCount(), 0);
throwingClient.terminate();

const raceClient = createConjunctionWorkerClient({
    WorkerCtor: FakeWorker,
    workerUrl: 'fake-worker.js'
});
const abortController = new AbortController();
const firstRacePromise = raceClient.screen({ request_id: 'screen:same', marker: 'hold' }, {
    signal: abortController.signal
});
const raceWorker = FakeWorker.instances.at(-1);
const firstTransportId = raceWorker.messages.find(message =>
    message.type === CONJUNCTION_WORKER_MESSAGE.SCREEN
)?.request_id;
abortController.abort();
const secondRacePromise = raceClient.screen({ request_id: 'screen:same', marker: 'rerun' });
const secondTransportId = raceWorker.messages.filter(message =>
    message.type === CONJUNCTION_WORKER_MESSAGE.SCREEN
).at(-1)?.request_id;
assert.notStrictEqual(firstTransportId, secondTransportId);
await assert.rejects(firstRacePromise, error => error instanceof ScreeningCancelledError);
assert.deepStrictEqual(await secondRacePromise, { request_id: secondTransportId, ok: true });
assert.strictEqual(raceClient.pendingRequestCount(), 0);
raceClient.terminate();

let releaseUploadYield;
const suspendedUploadYield = new Promise(resolve => { releaseUploadYield = resolve; });
const uploadCancellationClient = createConjunctionWorkerClient({
    WorkerCtor: FakeWorker,
    workerUrl: 'fake-worker.js',
    catalogChunkSize: 1,
    catalogChunksPerYield: 1,
    uploadYield: () => suspendedUploadYield
});
const uploadAbortController = new AbortController();
const uploadCancellationPromise = uploadCancellationClient.screen({
    marker: 'hold',
    catalog: [{ id: 1 }, { id: 2 }]
}, { signal: uploadAbortController.signal });
uploadAbortController.abort();
await new Promise(resolve => setTimeout(resolve, 10));
releaseUploadYield();
await assert.rejects(uploadCancellationPromise, error => error instanceof ScreeningCancelledError);
assert.strictEqual(uploadCancellationClient.pendingRequestCount(), 0);
uploadCancellationClient.terminate();

let fallbackRuntime;
const fallbackClient = createConjunctionWorkerClient({
    forceFallback: true,
    fallback: async (request, runtime) => {
        fallbackRuntime = runtime;
        runtime.onProgress({ stage: 'FALLBACK', completed: 1, total: 1, fraction: 1 });
        return { marker: request.marker };
    }
});
const fallbackProgress = [];
const fallbackResult = await fallbackClient.screen({ marker: 'fallback' }, {
    onProgress: progress => fallbackProgress.push(progress)
});
assert.deepStrictEqual(fallbackResult, { marker: 'fallback' });
assert.strictEqual(fallbackProgress[0].stage, 'FALLBACK');
assert.strictEqual(fallbackRuntime.isCancelled(), false);
assert.strictEqual(fallbackClient.usesWorker(), false);

console.log('conjunctionWorkerProtocol tests passed');
