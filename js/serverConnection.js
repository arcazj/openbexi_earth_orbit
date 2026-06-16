export const APP_VERSION = '1.7.6';
export const RELEASE_DATE = '2026-06-15';
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

export function resolveApiBaseUrl({ windowObj = globalThis.window, storage = globalThis.localStorage } = {}) {
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

export function resolveServerDataUrl(originalUrl, baseUrl) {
    const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
    if (!normalizedBaseUrl || typeof originalUrl !== 'string') return null;

    const cleanUrl = originalUrl.split(/[?#]/)[0].replace(/\\/g, '/');
    if (/json\/tle\/TLE\.json$/i.test(cleanUrl)) {
        return apiEndpoint(normalizedBaseUrl, '/api/tle');
    }
    if (/json\/decayed\/decayed\.json$/i.test(cleanUrl)) {
        return apiEndpoint(normalizedBaseUrl, '/api/decayed');
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
