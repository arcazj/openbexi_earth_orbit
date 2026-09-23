export { APP_VERSION, RELEASE_DATE, RELEASE_METADATA } from './releaseVersion.js';
export const DEFAULT_SERVER_TIMEOUT_MS = 800;
export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';
export const API_BASE_STORAGE_KEY = 'openbexi.apiBaseUrl';
export const SERVER_STATUS_ICONS = {
    connected: 'icons/server_connected.svg',
    disconnected: 'icons/server_offline.svg',
    checking: 'icons/server_checking.svg',
    error: 'icons/server_error.svg'
};

export function normalizeApiBaseUrl(value) {
    if (!value || typeof value !== 'string') return '';
    return value.trim().replace(/\/+$/, '');
}

export function apiEndpoint(baseUrl, path) {
    const normalizedBase = normalizeApiBaseUrl(baseUrl);
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
}

function isLoopbackHost(hostname = '') {
    return hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname.startsWith('127.');
}

export function resolveApiBaseUrl({
    windowObj = globalThis.window,
    storage = globalThis.localStorage,
    documentObj = globalThis.document
} = {}) {
    const location = windowObj?.location;
    let search = '';
    try {
        search = location?.search || '';
    } catch (err) {
        search = '';
    }

    const params = new URLSearchParams(search);
    const fromQuery = params.get('apiBase') || params.get('server');
    if (fromQuery) return normalizeApiBaseUrl(fromQuery);

    try {
        const fromStorage = storage?.getItem?.(API_BASE_STORAGE_KEY);
        if (fromStorage) return normalizeApiBaseUrl(fromStorage);
    } catch (err) {
        // Storage may be blocked; use the safe default below.
    }

    const deploymentMode = String(
        documentObj?.querySelector?.('meta[name="openbexi-deployment-mode"]')?.content || ''
    ).trim().toLowerCase();
    if (deploymentMode === 'static') return '';

    if (location?.origin && /^https?:$/i.test(location.protocol) && isLoopbackHost(location.hostname)) {
        return normalizeApiBaseUrl(location.origin);
    }

    return DEFAULT_API_BASE_URL;
}

export function validateTleData(data) {
    if (!Array.isArray(data) || data.length === 0) return false;
    return data.some(item =>
        item &&
        typeof item === 'object' &&
        (item.norad_id !== undefined || item.NORAD_CAT_ID !== undefined) &&
        typeof item.tle_line1 === 'string' &&
        typeof item.tle_line2 === 'string' &&
        item.tle_line1.trim().startsWith('1 ') &&
        item.tle_line2.trim().startsWith('2 ')
    );
}

function gpRecordFormat(item) {
    return String(item?.element_set?.format ?? item?.elementSet?.format ?? item?.source_format ?? '').trim().toUpperCase();
}

export function validateGpData(data) {
    if (!Array.isArray(data) || data.length === 0) return false;
    return data.some(item => {
        if (!item || typeof item !== 'object') return false;
        const norad = item.norad_id ?? item.NORAD_CAT_ID ?? item.element_set?.omm?.NORAD_CAT_ID;
        if (norad === undefined || norad === null || !/^(?:\d{1,9}|[A-HJ-NP-Z]\d{4})$/i.test(String(norad).trim())) return false;
        const format = gpRecordFormat(item);
        if (format === 'TLE' || format === 'TLE_JSON') {
            return typeof (item.tle_line1 ?? item.element_set?.line1) === 'string' &&
                typeof (item.tle_line2 ?? item.element_set?.line2) === 'string';
        }
        const omm = item.element_set?.omm ?? item.omm ?? item;
        return (format === 'OMM' || format === 'CCSDS_OMM_JSON' || omm?.EPOCH !== undefined) &&
            typeof omm === 'object' &&
            omm !== null &&
            (omm.EPOCH !== undefined || item.element_set?.epoch !== undefined);
    });
}

export async function fetchJsonWithTimeout(url, {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_SERVER_TIMEOUT_MS
} = {}) {
    if (typeof fetchImpl !== 'function') {
        throw new Error('fetch is unavailable');
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;
    try {
        const response = await fetchImpl(url, {
            signal: controller?.signal,
            cache: 'no-store'
        });
        if (!response?.ok) {
            throw new Error(`HTTP ${response?.status || 0}`);
        }
        return await response.json();
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

export async function checkServerConnection({
    baseUrl = resolveApiBaseUrl(),
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_SERVER_TIMEOUT_MS
} = {}) {
    const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
    try {
        const health = await fetchJsonWithTimeout(apiEndpoint(normalizedBaseUrl, '/api/health'), {
            fetchImpl,
            timeoutMs
        });
        if (health?.status !== 'ok') {
            return {
                state: 'error',
                connected: false,
                baseUrl: normalizedBaseUrl,
                dataSource: 'local',
                error: 'Health endpoint returned an invalid status'
            };
        }

        let version = null;
        try {
            version = await fetchJsonWithTimeout(apiEndpoint(normalizedBaseUrl, '/api/version'), {
                fetchImpl,
                timeoutMs
            });
        } catch (err) {
            version = null;
        }

        return {
            state: 'connected',
            connected: true,
            baseUrl: normalizedBaseUrl,
            dataSource: 'live server',
            health,
            version,
            docsUrl: apiEndpoint(normalizedBaseUrl, '/docs'),
            openApiUrl: apiEndpoint(normalizedBaseUrl, '/openapi.json')
        };
    } catch (err) {
        return {
            state: 'disconnected',
            connected: false,
            baseUrl: normalizedBaseUrl,
            dataSource: 'local',
            error: err?.name === 'AbortError' ? 'Server check timed out' : (err?.message || String(err))
        };
    }
}

export async function checkServerConnectionWithFallback({
    baseUrl = resolveApiBaseUrl(),
    fallbackBaseUrls = [DEFAULT_API_BASE_URL],
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_SERVER_TIMEOUT_MS
} = {}) {
    const candidates = [];
    const addCandidate = (candidate) => {
        const normalized = normalizeApiBaseUrl(candidate);
        if (normalized && !candidates.includes(normalized)) {
            candidates.push(normalized);
        }
    };

    addCandidate(baseUrl);
    fallbackBaseUrls.forEach(addCandidate);

    let firstFailure = null;
    for (const candidate of candidates) {
        const result = await checkServerConnection({
            baseUrl: candidate,
            fetchImpl,
            timeoutMs
        });
        if (result.connected) return result;
        if (!firstFailure) firstFailure = result;
    }

    return firstFailure || {
        state: 'disconnected',
        connected: false,
        baseUrl: normalizeApiBaseUrl(baseUrl),
        dataSource: 'local',
        error: 'No API base URL candidates were available'
    };
}

export async function loadTleDataFromServer({
    baseUrl,
    fetchImpl = globalThis.fetch,
    timeoutMs = 10000
} = {}) {
    const data = await fetchJsonWithTimeout(apiEndpoint(baseUrl, '/api/tle'), {
        fetchImpl,
        timeoutMs
    });
    if (!validateTleData(data)) {
        throw new Error('Server TLE response failed validation');
    }
    return data;
}

export async function loadGpDataFromServer({
    baseUrl,
    fetchImpl = globalThis.fetch,
    timeoutMs = 10000
} = {}) {
    const data = await fetchJsonWithTimeout(apiEndpoint(baseUrl, '/api/gp'), {
        fetchImpl,
        timeoutMs
    });
    if (!validateGpData(data)) {
        throw new Error('Server GP response failed validation');
    }
    return data;
}

function validateMetadataPayload(data, label) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error(`${label} response failed validation`);
    }
    return data;
}

export async function loadGpMetadataFromServer({
    baseUrl,
    fetchImpl = globalThis.fetch,
    timeoutMs = 10000
} = {}) {
    const data = await fetchJsonWithTimeout(apiEndpoint(baseUrl, '/api/gp-metadata'), {
        fetchImpl,
        timeoutMs
    });
    return validateMetadataPayload(data, 'Server GP metadata');
}

export async function loadTleMetadataFromServer({
    baseUrl,
    fetchImpl = globalThis.fetch,
    timeoutMs = 10000
} = {}) {
    const data = await fetchJsonWithTimeout(apiEndpoint(baseUrl, '/json/tle/TLE.meta.json'), {
        fetchImpl,
        timeoutMs
    });
    return validateMetadataPayload(data, 'Server TLE metadata');
}

export async function loadLaunchDataFromServer({
    baseUrl,
    fetchImpl = globalThis.fetch,
    timeoutMs = 10000
} = {}) {
    const data = await fetchJsonWithTimeout(apiEndpoint(baseUrl, '/api/launches'), {
        fetchImpl,
        timeoutMs
    });
    if (!Array.isArray(data)) throw new Error('Server launch response failed validation');
    return data;
}

export async function loadDataUpdateStatus({
    baseUrl,
    fetchImpl = globalThis.fetch,
    timeoutMs = 10000
} = {}) {
    return fetchJsonWithTimeout(apiEndpoint(baseUrl, '/api/data-update-status'), {
        fetchImpl,
        timeoutMs
    });
}

function metadataRevision(metadata) {
    const value = metadata?.catalog_revision ?? metadata?.manifest_hash ?? metadata?.dataset_hash ?? metadata?.revision ??
        metadata?.last_success_at ?? metadata?.generated_at ?? metadata?.built_at ?? metadata?.fetched_at;
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    return normalized || null;
}

export async function loadStaticDataUpdateStatus({
    fetchImpl = globalThis.fetch,
    timeoutMs = 10000
} = {}) {
    const orbitalMetadataPromise = fetchJsonWithTimeout('json/gp/GP.meta.json', { fetchImpl, timeoutMs })
        .then(metadata => ({ kind: 'GP', metadata }))
        .catch(() => fetchJsonWithTimeout('json/tle/TLE.meta.json', { fetchImpl, timeoutMs })
            .then(metadata => ({ kind: 'TLE', metadata })));
    const [orbital, launch, decay, tracked] = await Promise.all([
        orbitalMetadataPromise,
        fetchJsonWithTimeout('json/launches/launches.meta.json', { fetchImpl, timeoutMs }),
        fetchJsonWithTimeout('json/decayed/decayed.meta.json', { fetchImpl, timeoutMs }),
        fetchJsonWithTimeout('json/tracked/TRACKED.manifest.json', { fetchImpl, timeoutMs })
    ]);
    const orbitalRevision = metadataRevision(orbital.metadata);
    const launchRevision = metadataRevision(launch);
    const decayRevision = metadataRevision(decay);
    const trackedRevision = metadataRevision(tracked);
    if (!orbitalRevision || !launchRevision || !decayRevision || !trackedRevision) {
        throw new Error('Static catalog metadata is missing a revision identity.');
    }
    return {
        source: 'static-metadata',
        catalog_kind: orbital.kind,
        data_revision: `static:${[orbitalRevision, launchRevision, decayRevision, trackedRevision].map(encodeURIComponent).join('|')}`,
        orbital_revision: orbitalRevision,
        gp_revision: orbital.kind === 'GP' ? orbitalRevision : null,
        tle_revision: orbital.kind === 'TLE' ? orbitalRevision : null,
        launch_revision: launchRevision,
        decay_revision: decayRevision,
        tracked_revision: trackedRevision,
        catalog_revision: orbitalRevision,
        datasets: {
            orbital: { kind: orbital.kind, revision: orbitalRevision },
            ...(orbital.kind === 'GP'
                ? { gp: { revision: orbitalRevision } }
                : { tle: { revision: orbitalRevision } }),
            launch: { revision: launchRevision },
            decay: { revision: decayRevision },
            tracked: { revision: trackedRevision }
        }
    };
}

export function catalogRevisionFromStatus(status) {
    const value = status?.data_revision ?? status?.catalog_revision ?? status?.catalog_revision_id ?? status?.revision ??
        status?.gp?.catalog_revision ?? status?.gp?.revision ?? status?.datasets?.gp?.revision;
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    return normalized || null;
}

export function createCatalogRevisionWatcher({
    baseUrl,
    fetchImpl = globalThis.fetch,
    intervalMs = 60_000,
    statusLoader = null,
    onRevisionChange = null,
    onError = null
} = {}) {
    let currentRevision = null;
    let currentStatus = null;
    let timer = null;
    let stopped = true;
    let requestInFlight = null;

    const checkNow = async () => {
        if (requestInFlight) return requestInFlight;
        const loadStatus = typeof statusLoader === 'function'
            ? statusLoader
            : () => loadDataUpdateStatus({ baseUrl, fetchImpl });
        requestInFlight = Promise.resolve()
            .then(() => loadStatus({ baseUrl, fetchImpl }))
            .then(async status => {
                const revision = catalogRevisionFromStatus(status);
                const previous = currentRevision;
                const previousStatus = currentStatus;
                if (!revision) {
                    return { revision: currentRevision, previous, status, previousStatus, changed: false };
                }
                const changed = !!previous && revision !== previous;
                if (changed && typeof onRevisionChange === 'function') {
                    await onRevisionChange({ revision, previous, status, previousStatus });
                }
                currentRevision = revision;
                currentStatus = status;
                return { revision, previous, status, previousStatus, changed };
            })
            .catch(error => {
                if (typeof onError === 'function') onError(error);
                return { revision: currentRevision, previous: currentRevision, status: null, changed: false, error };
            })
            .finally(() => {
                requestInFlight = null;
            });
        return requestInFlight;
    };

    const schedule = () => {
        if (stopped) return;
        timer = setTimeout(async () => {
            await checkNow();
            schedule();
        }, Math.max(1000, Number(intervalMs) || 60_000));
    };

    return Object.freeze({
        async start() {
            if (!stopped) return checkNow();
            stopped = false;
            const result = await checkNow();
            schedule();
            return result;
        },
        stop() {
            stopped = true;
            if (timer) clearTimeout(timer);
            timer = null;
        },
        checkNow,
        get revision() {
            return currentRevision;
        },
        get status() {
            return currentStatus;
        }
    });
}

export function createStaticDataRevisionWatcher(options = {}) {
    return createCatalogRevisionWatcher({
        ...options,
        baseUrl: '',
        statusLoader: ({ fetchImpl }) => loadStaticDataUpdateStatus({
            fetchImpl,
            timeoutMs: options.timeoutMs ?? 10000
        })
    });
}

export function resolveServerDataUrl(originalUrl, baseUrl) {
    const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
    if (!normalizedBaseUrl || typeof originalUrl !== 'string') return null;

    const cleanUrl = originalUrl.split(/[?#]/)[0].replace(/\\/g, '/');
    if (/json\/gp\/GP\.meta\.json$/i.test(cleanUrl)) {
        return apiEndpoint(normalizedBaseUrl, '/api/gp-metadata');
    }
    if (/json\/gp\/GP\.json$/i.test(cleanUrl)) {
        return apiEndpoint(normalizedBaseUrl, '/api/gp');
    }
    if (/json\/tle\/TLE\.json$/i.test(cleanUrl)) {
        return apiEndpoint(normalizedBaseUrl, '/api/tle');
    }
    if (/json\/tle\/TLE\.meta\.json$/i.test(cleanUrl)) {
        return apiEndpoint(normalizedBaseUrl, '/json/tle/TLE.meta.json');
    }
    if (/json\/launches\/launches\.json$/i.test(cleanUrl)) {
        return apiEndpoint(normalizedBaseUrl, '/api/launches');
    }
    if (/json\/decayed\/decayed\.json$/i.test(cleanUrl)) {
        return apiEndpoint(normalizedBaseUrl, '/api/decayed');
    }
    if (/json\/tracked\/TRACKED\.manifest\.json$/i.test(cleanUrl)) {
        return apiEndpoint(normalizedBaseUrl, '/api/tracked-objects/manifest');
    }
    const trackedChunkMatch = cleanUrl.match(/json\/tracked\/chunks\/([^/]+\.json)$/i);
    if (trackedChunkMatch) {
        return apiEndpoint(
            normalizedBaseUrl,
            `/api/tracked-objects/chunks/${encodeURIComponent(trackedChunkMatch[1])}`
        );
    }

    const metadataMatch = cleanUrl.match(/json\/satellites\/([^/]+\.json)$/i);
    if (metadataMatch) {
        return apiEndpoint(normalizedBaseUrl, `/api/satellite-metadata/${encodeURIComponent(metadataMatch[1])}`);
    }

    return null;
}

export function serverStatusViewModel(status = {}) {
    const state = status.state || 'disconnected';
    const connected = state === 'connected';
    const error = state === 'error';
    const checking = state === 'checking';
    const dataSource = status.dataSource || (connected ? 'live server' : 'local');

    if (checking) {
        return {
            text: 'Checking server',
            tooltip: 'Checking server connection',
            ariaLabel: 'Checking server connection',
            cssClass: 'server-state-checking',
            icon: SERVER_STATUS_ICONS.checking,
            dataSource
        };
    }
    if (connected) {
        return {
            text: 'Server connected',
            tooltip: 'Connected to server',
            ariaLabel: 'Connected to server',
            cssClass: 'server-state-connected',
            icon: SERVER_STATUS_ICONS.connected,
            dataSource
        };
    }
    if (error) {
        return {
            text: 'Server error',
            tooltip: 'Server error - using local data',
            ariaLabel: 'Server error - using local data',
            cssClass: 'server-state-error',
            icon: SERVER_STATUS_ICONS.error,
            dataSource: 'local'
        };
    }
    return {
        text: 'Offline mode',
        tooltip: 'Offline mode - using local data',
        ariaLabel: 'Offline mode - using local data',
        cssClass: 'server-state-disconnected',
        icon: SERVER_STATUS_ICONS.disconnected,
        dataSource: 'local'
    };
}
