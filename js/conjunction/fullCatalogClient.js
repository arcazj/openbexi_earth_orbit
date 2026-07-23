const TERMINAL_JOB_STATES = new Set([
    'SUCCEEDED',
    'FAILED',
    'CANCELLED',
    'TIMED_OUT'
]);

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_POLL_ATTEMPTS = 900;
const DEFAULT_MAX_STREAM_CONNECTIONS = 3;

function normalizeBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function endpoint(baseUrl, path) {
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${normalizeBaseUrl(baseUrl)}${suffix}`;
}

function finiteNumber(value, name) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError(`${name} must be a finite number`);
    return number;
}

function boundedNumber(value, name, minimum, maximum, { integer = false } = {}) {
    const number = finiteNumber(value, name);
    if (number < minimum || number > maximum) {
        throw new RangeError(`${name} must be between ${minimum} and ${maximum}`);
    }
    if (integer && !Number.isInteger(number)) throw new TypeError(`${name} must be an integer`);
    return number;
}

function safeProblemMessage(problem, status) {
    if (problem && typeof problem === 'object') {
        const detail = typeof problem.detail === 'string' ? problem.detail.trim() : '';
        const title = typeof problem.title === 'string' ? problem.title.trim() : '';
        if (detail) return detail;
        if (title) return title;
    }
    return `Full-catalog API request failed with HTTP ${status}`;
}

function abortError() {
    if (typeof DOMException === 'function') return new DOMException('The operation was aborted.', 'AbortError');
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    return error;
}

function delay(milliseconds, signal, delayImpl = globalThis.setTimeout) {
    if (signal?.aborted) return Promise.reject(signal.reason || abortError());
    return new Promise((resolve, reject) => {
        let timer = null;
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason || abortError());
        };
        const onElapsed = () => {
            signal?.removeEventListener?.('abort', onAbort);
            resolve();
        };
        signal?.addEventListener?.('abort', onAbort, { once: true });
        timer = delayImpl(onElapsed, milliseconds);
    });
}

function normalizedJobState(job) {
    return String(job?.state || '').trim().toUpperCase();
}

export function isTerminalFullCatalogJob(job) {
    return TERMINAL_JOB_STATES.has(normalizedJobState(job));
}

export class FullCatalogApiError extends Error {
    constructor(message, { status = 0, code = 'FULL_CATALOG_API_ERROR', problem = null } = {}) {
        super(message);
        this.name = 'FullCatalogApiError';
        this.status = status;
        this.code = code;
        this.problem = problem;
    }
}

export function createFullCatalogIdempotencyKey(cryptoImpl = globalThis.crypto) {
    if (typeof cryptoImpl?.randomUUID === 'function') return `browser-${cryptoImpl.randomUUID()}`;
    const values = new Uint32Array(4);
    if (typeof cryptoImpl?.getRandomValues === 'function') {
        cryptoImpl.getRandomValues(values);
    } else {
        for (let index = 0; index < values.length; index += 1) {
            values[index] = Math.floor(Math.random() * 0xffffffff);
        }
    }
    return `browser-${Array.from(values, value => value.toString(16).padStart(8, '0')).join('')}`;
}

export function buildFullCatalogJobRequest({
    startTime,
    durationHours,
    coarseStepSeconds,
    screeningRadiusKm,
    refinementToleranceSeconds,
    maxResults,
    catalogRevisionId = 'current'
} = {}) {
    if (startTime === null || startTime === undefined || startTime === '') {
        throw new TypeError('startTime must be a valid UTC instant');
    }
    const start = startTime instanceof Date ? new Date(startTime.getTime()) : new Date(startTime);
    if (!Number.isFinite(start.getTime())) throw new TypeError('startTime must be a valid UTC instant');
    const duration = boundedNumber(durationHours, 'durationHours', 1 / 60, 6);
    const horizonSeconds = Math.round(duration * 3600);
    const coarseStep = boundedNumber(coarseStepSeconds, 'coarseStepSeconds', 10, 900, { integer: true });
    const radius = boundedNumber(screeningRadiusKm, 'screeningRadiusKm', 0.001, 1000);
    const tolerance = boundedNumber(refinementToleranceSeconds, 'refinementToleranceSeconds', 0.01, 10);
    const resultLimit = boundedNumber(maxResults, 'maxResults', 1, 10000, { integer: true });
    if (coarseStep > horizonSeconds) throw new RangeError('coarseStepSeconds exceeds the screening horizon');
    if (tolerance > coarseStep) throw new RangeError('refinementToleranceSeconds exceeds the coarse step');

    return {
        schema_version: '2.1.0',
        catalog_revision_id: String(catalogRevisionId || 'current'),
        catalog_scope: {
            object_types: ['DEBRIS', 'PAYLOAD', 'ROCKET_BODY', 'UNKNOWN'],
            lifecycle_statuses: ['ACTIVE', 'INACTIVE', 'UNKNOWN']
        },
        configuration: {
            start_time: start.toISOString(),
            horizon_seconds: horizonSeconds,
            coarse_step_seconds: coarseStep,
            screening_radius_km: radius,
            refinement_tolerance_seconds: tolerance,
            max_results: resultLimit
        }
    };
}

export function normalizeFullCatalogEvent(event) {
    const row = event && typeof event === 'object' ? event : {};
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const value = { ...payload, ...row };
    delete value.payload;
    const tca = value.tca_utc || value.tca || null;
    const relativeSpeed = value.relative_speed_km_s ?? value.relative_velocity_km_s ?? null;
    return {
        ...value,
        event_id: value.event_revision_id || value.event_id || value.conjunction_id || null,
        request_id: value.job_id || value.request_id || null,
        primary_object_id: value.object_a_id || value.primary_object_id || null,
        secondary_object_id: value.object_b_id || value.secondary_object_id || null,
        tca,
        tca_utc: tca,
        relative_speed_km_s: relativeSpeed,
        relative_velocity_km_s: relativeSpeed,
        source_workflow: 'SERVER_FULL_CATALOG_SCREENING'
    };
}

export function createSseParser(onEvent = () => {}) {
    let buffer = '';
    let eventType = 'message';
    let eventId = '';
    let dataLines = [];

    const dispatch = () => {
        if (dataLines.length === 0) {
            eventType = 'message';
            return;
        }
        const data = dataLines.join('\n');
        let parsed = data;
        try {
            parsed = JSON.parse(data);
        } catch {
            // Non-JSON frames remain observable to callers without breaking the stream.
        }
        onEvent({ type: eventType || 'message', id: eventId, data: parsed, rawData: data });
        eventType = 'message';
        dataLines = [];
    };

    const processLine = (sourceLine) => {
        const line = sourceLine.endsWith('\r') ? sourceLine.slice(0, -1) : sourceLine;
        if (line === '') {
            dispatch();
            return;
        }
        if (line.startsWith(':')) return;
        const separator = line.indexOf(':');
        const field = separator === -1 ? line : line.slice(0, separator);
        let value = separator === -1 ? '' : line.slice(separator + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'event') eventType = value;
        if (field === 'data') dataLines.push(value);
        if (field === 'id' && !value.includes('\0')) eventId = value;
    };

    return {
        push(chunk) {
            buffer += String(chunk || '');
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            lines.forEach(processLine);
        },
        finish() {
            if (buffer) processLine(buffer);
            buffer = '';
            dispatch();
        },
        lastEventId() {
            return eventId;
        }
    };
}

export function createFullCatalogClient({
    baseUrl,
    fetchImpl = globalThis.fetch,
    cryptoImpl = globalThis.crypto,
    delayImpl = globalThis.setTimeout
} = {}) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    let bearerToken = '';

    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

    const request = async (path, {
        method = 'GET',
        body,
        signal,
        authenticated = true,
        idempotencyKey,
        headers = {}
    } = {}) => {
        if (!normalizedBaseUrl) {
            throw new FullCatalogApiError('The full-catalog service requires the Python server.', {
                code: 'SERVER_REQUIRED'
            });
        }
        if (authenticated && !bearerToken) {
            throw new FullCatalogApiError('A bearer token is required.', { code: 'AUTH_TOKEN_REQUIRED' });
        }
        const requestHeaders = {
            Accept: 'application/json',
            ...headers
        };
        if (authenticated) requestHeaders.Authorization = `Bearer ${bearerToken}`;
        if (idempotencyKey) requestHeaders['Idempotency-Key'] = idempotencyKey;
        if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
        const response = await fetchImpl(endpoint(normalizedBaseUrl, path), {
            method,
            headers: requestHeaders,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal,
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer'
        });
        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }
        if (!response.ok) {
            throw new FullCatalogApiError(safeProblemMessage(payload, response.status), {
                status: response.status,
                code: payload?.code || `HTTP_${response.status}`,
                problem: payload
            });
        }
        return payload;
    };

    const getJob = (jobId, options = {}) => request(
        `/api/v1/screening-jobs/${encodeURIComponent(jobId)}`,
        options
    );

    const streamJob = async (jobId, {
        lastEventId = '',
        signal,
        onEvent = () => {}
    } = {}) => {
        if (!normalizedBaseUrl) throw new FullCatalogApiError('The full-catalog service requires the Python server.', { code: 'SERVER_REQUIRED' });
        if (!bearerToken) throw new FullCatalogApiError('A bearer token is required.', { code: 'AUTH_TOKEN_REQUIRED' });
        const headers = {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${bearerToken}`
        };
        if (lastEventId !== '' && lastEventId !== null) headers['Last-Event-ID'] = String(lastEventId);
        const response = await fetchImpl(
            endpoint(normalizedBaseUrl, `/api/v1/screening-jobs/${encodeURIComponent(jobId)}/stream`),
            {
                method: 'GET',
                headers,
                signal,
                cache: 'no-store',
                credentials: 'omit',
                referrerPolicy: 'no-referrer'
            }
        );
        if (!response.ok) {
            let problem = null;
            try {
                problem = await response.json();
            } catch {
                problem = null;
            }
            throw new FullCatalogApiError(safeProblemMessage(problem, response.status), {
                status: response.status,
                code: problem?.code || `HTTP_${response.status}`,
                problem
            });
        }
        if (!response.body?.getReader) {
            throw new FullCatalogApiError('Streaming responses are unavailable in this browser.', {
                code: 'SSE_UNAVAILABLE'
            });
        }
        const parser = createSseParser(onEvent);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                parser.push(decoder.decode(value, { stream: true }));
            }
            parser.push(decoder.decode());
            parser.finish();
            return parser.lastEventId();
        } finally {
            reader.releaseLock?.();
        }
    };

    const pollJob = async (jobId, {
        signal,
        onJob = () => {},
        pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
        maxPollAttempts = DEFAULT_MAX_POLL_ATTEMPTS
    } = {}) => {
        const interval = boundedNumber(pollIntervalMs, 'pollIntervalMs', 0, 60000);
        const attempts = boundedNumber(maxPollAttempts, 'maxPollAttempts', 1, 10000, { integer: true });
        let latest = null;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            latest = await getJob(jobId, { signal });
            onJob(latest, { transport: 'poll', attempt: attempt + 1 });
            if (isTerminalFullCatalogJob(latest)) return latest;
            if (attempt + 1 < attempts) await delay(interval, signal, delayImpl);
        }
        throw new FullCatalogApiError('Job monitoring reached its bounded polling limit.', {
            code: 'WATCH_LIMIT_REACHED'
        });
    };

    const listEvents = (jobId, { limit = 200, cursor = null, signal } = {}) => {
        const boundedLimit = boundedNumber(limit, 'limit', 1, 200, { integer: true });
        const query = new URLSearchParams({
            job_id: String(jobId),
            limit: String(boundedLimit),
            order: 'tca_asc'
        });
        if (cursor) query.set('cursor', String(cursor));
        return request(`/api/v1/conjunction-events?${query}`, { signal });
    };

    const loadJobEvents = async (jobId, { maxItems = 500, signal } = {}) => {
        const maximum = boundedNumber(maxItems, 'maxItems', 1, 10000, { integer: true });
        const items = [];
        let cursor = null;
        const seenCursors = new Set();
        do {
            const page = await listEvents(jobId, {
                limit: Math.min(200, maximum - items.length),
                cursor,
                signal
            });
            const pageItems = Array.isArray(page?.items) ? page.items : [];
            items.push(...pageItems.slice(0, maximum - items.length).map(normalizeFullCatalogEvent));
            const nextCursor = page?.next_cursor || null;
            if (nextCursor && seenCursors.has(nextCursor)) {
                throw new FullCatalogApiError('Event pagination repeated a cursor.', {
                    code: 'PAGINATION_CURSOR_REPEATED'
                });
            }
            if (nextCursor) seenCursors.add(nextCursor);
            cursor = nextCursor;
        } while (cursor && items.length < maximum);
        return { items, next_cursor: cursor };
    };

    return Object.freeze({
        baseUrl: normalizedBaseUrl,
        setToken(value) {
            bearerToken = String(value || '').trim();
        },
        clearToken() {
            bearerToken = '';
        },
        hasToken() {
            return bearerToken.length > 0;
        },
        createIdempotencyKey() {
            return createFullCatalogIdempotencyKey(cryptoImpl);
        },
        discoverCapabilities(options = {}) {
            return request('/api/v1/capabilities', { ...options, authenticated: false });
        },
        submitJob(jobRequest, { idempotencyKey, signal } = {}) {
            const key = idempotencyKey || createFullCatalogIdempotencyKey(cryptoImpl);
            return request('/api/v1/screening-jobs', {
                method: 'POST',
                body: jobRequest,
                idempotencyKey: key,
                signal
            });
        },
        getJob,
        cancelJob(jobId, options = {}) {
            return request(`/api/v1/screening-jobs/${encodeURIComponent(jobId)}`, {
                ...options,
                method: 'DELETE'
            });
        },
        listEvents,
        loadJobEvents,
        streamJob,
        pollJob,
        async watchJob(jobId, {
            signal,
            onJob = () => {},
            onStreamEvent = () => {},
            pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
            maxPollAttempts = DEFAULT_MAX_POLL_ATTEMPTS,
            maxStreamConnections = DEFAULT_MAX_STREAM_CONNECTIONS
        } = {}) {
            const streamConnections = boundedNumber(
                maxStreamConnections,
                'maxStreamConnections',
                0,
                20,
                { integer: true }
            );
            let latest = await getJob(jobId, { signal });
            onJob(latest, { transport: 'initial' });
            if (isTerminalFullCatalogJob(latest)) return latest;
            let lastEventId = '';

            for (let connection = 0; connection < streamConnections; connection += 1) {
                try {
                    lastEventId = await streamJob(jobId, {
                        lastEventId,
                        signal,
                        onEvent(frame) {
                            onStreamEvent(frame);
                            const data = frame.data && typeof frame.data === 'object' ? frame.data : {};
                            if (frame.type === 'job.progress') {
                                latest = {
                                    ...latest,
                                    progress_fraction: data.fraction ?? latest.progress_fraction,
                                    progress_stage: data.stage ?? latest.progress_stage,
                                    progress_sequence: data.sequence ?? latest.progress_sequence
                                };
                                onJob(latest, { transport: 'sse', frame });
                            } else if (frame.type === 'job.state' && data.state) {
                                latest = { ...latest, state: data.state };
                                onJob(latest, { transport: 'sse', frame });
                            }
                        }
                    });
                } catch (error) {
                    if (signal?.aborted || error?.name === 'AbortError') throw error;
                    break;
                }
                latest = await getJob(jobId, { signal });
                onJob(latest, { transport: 'sse-refresh', lastEventId });
                if (isTerminalFullCatalogJob(latest)) return latest;
            }

            return pollJob(jobId, {
                signal,
                onJob,
                pollIntervalMs,
                maxPollAttempts
            });
        }
    });
}
