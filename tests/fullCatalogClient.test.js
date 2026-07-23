import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FullCatalogApiError,
  buildFullCatalogJobRequest,
  createFullCatalogClient,
  createSseParser,
  isTerminalFullCatalogJob,
  normalizeFullCatalogEvent
} from '../js/conjunction/fullCatalogClient.js';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' }
  });
}

function sseResponse(chunks) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    }
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const request = buildFullCatalogJobRequest({
  startTime: '2026-07-20T12:00:00Z',
  durationHours: 1,
  coarseStepSeconds: 60,
  screeningRadiusKm: 10,
  refinementToleranceSeconds: 0.5,
  maxResults: 100,
  catalogRevisionId: 'catalog:test'
});
assert.equal(request.schema_version, '2.1.0');
assert.equal(request.catalog_revision_id, 'catalog:test');
assert.equal(request.configuration.horizon_seconds, 3600);
assert.equal(request.configuration.start_time, '2026-07-20T12:00:00.000Z');
assert.deepEqual(request.catalog_scope.lifecycle_statuses, ['ACTIVE', 'INACTIVE', 'UNKNOWN']);
assert.throws(() => buildFullCatalogJobRequest({
  startTime: '2026-07-20T12:00:00Z',
  durationHours: 12,
  coarseStepSeconds: 60,
  screeningRadiusKm: 10,
  refinementToleranceSeconds: 0.5,
  maxResults: 100
}), /durationHours/);
assert.throws(() => buildFullCatalogJobRequest({
  startTime: null,
  durationHours: 1,
  coarseStepSeconds: 60,
  screeningRadiusKm: 10,
  refinementToleranceSeconds: 0.5,
  maxResults: 100
}), /startTime/);

const parsedFrames = [];
const parser = createSseParser(frame => parsedFrames.push(frame));
parser.push('id: 8\r\nevent: job.progress\r\ndata: {"fraction":0.4,');
parser.push('"stage":"broad-phase"}\r\n\r\n: keep-alive\n\n');
parser.push('id: 9\nevent: job.state\ndata: {"state":"SUCCEEDED"}\n\n');
parser.finish();
assert.equal(parsedFrames.length, 2);
assert.equal(parsedFrames[0].id, '8');
assert.equal(parsedFrames[0].type, 'job.progress');
assert.equal(parsedFrames[0].data.fraction, 0.4);
assert.equal(parsedFrames[1].id, '9');
assert.equal(parser.lastEventId(), '9');

const normalizedEvent = normalizeFullCatalogEvent({
  event_revision_id: 'event-1',
  job_id: 'job-1',
  object_a_id: 'obx:norad:100',
  object_b_id: 'obx:norad:200',
  tca_utc: '2026-07-20T12:05:00Z',
  miss_distance_km: 2.5,
  payload: { relative_speed_km_s: 12.25 }
});
assert.equal(normalizedEvent.event_id, 'event-1');
assert.equal(normalizedEvent.primary_object_id, 'obx:norad:100');
assert.equal(normalizedEvent.secondary_object_id, 'obx:norad:200');
assert.equal(normalizedEvent.tca, '2026-07-20T12:05:00Z');
assert.equal(normalizedEvent.relative_velocity_km_s, 12.25);
assert.equal(isTerminalFullCatalogJob({ state: 'succeeded' }), true);
assert.equal(isTerminalFullCatalogJob({ state: 'running' }), false);

const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url, options });
  if (url.endsWith('/api/v1/capabilities')) {
    return jsonResponse({ full_catalog_screening: { enabled: true, authenticated: true } });
  }
  if (url.endsWith('/api/v1/screening-jobs') && options.method === 'POST') {
    return jsonResponse({ job_id: 'job-1', state: 'QUEUED' }, 202);
  }
  if (url.endsWith('/api/v1/screening-jobs/job-1') && options.method === 'DELETE') {
    return jsonResponse({ job_id: 'job-1', state: 'CANCEL_REQUESTED' }, 202);
  }
  throw new Error(`Unexpected request ${options.method || 'GET'} ${url}`);
};
const client = createFullCatalogClient({
  baseUrl: 'http://127.0.0.1:8000/',
  fetchImpl,
  cryptoImpl: { randomUUID: () => 'fixed-key' }
});
assert.equal(client.baseUrl, 'http://127.0.0.1:8000');
assert.equal(client.hasToken(), false);
await client.discoverCapabilities();
assert.equal(calls[0].options.headers.Authorization, undefined, 'capability discovery is unauthenticated');
client.setToken(' analyst-secret ');
assert.equal(client.hasToken(), true);
await client.submitJob(request);
assert.equal(calls[1].options.headers.Authorization, 'Bearer analyst-secret');
assert.equal(calls[1].options.headers['Idempotency-Key'], 'browser-fixed-key');
assert.equal(calls[1].url.includes('analyst-secret'), false, 'tokens never enter request URLs');
assert.equal(calls[1].options.credentials, 'omit');
await client.cancelJob('job-1');
client.clearToken();
await assert.rejects(() => client.cancelJob('job-1'), error => (
  error instanceof FullCatalogApiError && error.code === 'AUTH_TOKEN_REQUIRED'
));

const watchCalls = [];
let jobReads = 0;
const watchClient = createFullCatalogClient({
  baseUrl: 'http://127.0.0.1:8000',
  delayImpl(callback) {
    callback();
    return 0;
  },
  fetchImpl: async (url, options = {}) => {
    watchCalls.push({ url, options });
    if (url.endsWith('/screening-jobs/job-watch/stream')) {
      return sseResponse([
        'id: 11\nevent: job.progress\ndata: {"fraction":0.75,"stage":"refinement"}\n\n',
        'id: 12\nevent: job.state\ndata: {"state":"SUCCEEDED"}\n\n'
      ]);
    }
    if (url.endsWith('/screening-jobs/job-watch')) {
      jobReads += 1;
      return jsonResponse(jobReads === 1
        ? { job_id: 'job-watch', state: 'RUNNING', progress_fraction: 0.1 }
        : { job_id: 'job-watch', state: 'SUCCEEDED', progress_fraction: 1 });
    }
    throw new Error(`Unexpected watch request ${url}`);
  }
});
watchClient.setToken('viewer-secret');
const jobUpdates = [];
const streamFrames = [];
const completed = await watchClient.watchJob('job-watch', {
  onJob: job => jobUpdates.push({ ...job }),
  onStreamEvent: frame => streamFrames.push(frame),
  maxStreamConnections: 1,
  maxPollAttempts: 2,
  pollIntervalMs: 0
});
assert.equal(completed.state, 'SUCCEEDED');
assert.equal(jobUpdates.some(job => job.progress_fraction === 0.75), true);
assert.deepEqual(streamFrames.map(frame => frame.id), ['11', '12']);
const streamCall = watchCalls.find(call => call.url.endsWith('/stream'));
assert.equal(streamCall.options.headers.Authorization, 'Bearer viewer-secret');
assert.equal(streamCall.url.includes('viewer-secret'), false);
await watchClient.streamJob('job-watch', { lastEventId: '12' });
assert.equal(watchCalls.at(-1).options.headers['Last-Event-ID'], '12');

let fallbackReads = 0;
const fallbackClient = createFullCatalogClient({
  baseUrl: 'http://127.0.0.1:8000',
  delayImpl(callback) {
    callback();
    return 0;
  },
  fetchImpl: async (url) => {
    if (url.endsWith('/stream')) return jsonResponse({ code: 'STREAM_TEMPORARY' }, 503);
    fallbackReads += 1;
    return jsonResponse(fallbackReads < 3
      ? { job_id: 'job-fallback', state: 'RUNNING' }
      : { job_id: 'job-fallback', state: 'FAILED' });
  }
});
fallbackClient.setToken('viewer-secret');
const fallback = await fallbackClient.watchJob('job-fallback', {
  maxStreamConnections: 1,
  maxPollAttempts: 3,
  pollIntervalMs: 0
});
assert.equal(fallback.state, 'FAILED');
assert.equal(fallbackReads, 3, 'polling fallback remains bounded by its configured attempt count');

const pageCalls = [];
const eventsClient = createFullCatalogClient({
  baseUrl: 'http://127.0.0.1:8000',
  fetchImpl: async (url) => {
    pageCalls.push(url);
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('job_id'), 'job-events');
    assert.equal(parsed.searchParams.has('access_token'), false);
    if (!parsed.searchParams.has('cursor')) {
      return jsonResponse({
        items: [{
          event_revision_id: 'event-a', object_a_id: 'a', object_b_id: 'b',
          tca_utc: '2026-07-20T00:00:00Z', miss_distance_km: 1, relative_speed_km_s: 2
        }],
        next_cursor: 'signed-cursor'
      });
    }
    return jsonResponse({
      items: [{
        event_revision_id: 'event-b', object_a_id: 'a', object_b_id: 'c',
        tca_utc: '2026-07-20T01:00:00Z', miss_distance_km: 3, relative_speed_km_s: 4
      }],
      next_cursor: null
    });
  }
});
eventsClient.setToken('viewer-secret');
const eventPage = await eventsClient.loadJobEvents('job-events', { maxItems: 10 });
assert.deepEqual(eventPage.items.map(event => event.event_id), ['event-a', 'event-b']);
assert.equal(pageCalls.length, 2);

const menuMarkup = fs.readFileSync('js/SatelliteMenuLoader.js', 'utf8');
const appMarkup = fs.readFileSync('index.html', 'utf8');
const clientSource = fs.readFileSync('js/conjunction/fullCatalogClient.js', 'utf8');
const styles = fs.readFileSync('css/style.css', 'utf8');
assert(menuMarkup.includes('id="fullCatalogWorkspace"'));
assert(menuMarkup.includes('id="fullCatalogBearerToken"') && menuMarkup.includes('autocomplete="off"'));
assert(menuMarkup.includes('Session memory only'));
assert(menuMarkup.includes('Experimental and non-operational. Collision probability is unavailable.'));
assert(menuMarkup.includes('id="fullCatalogCoverage"'));
assert(menuMarkup.includes('aria-live="polite"'));
assert(appMarkup.includes('createFullCatalogWorkspace'));
assert(appMarkup.includes('selected-object screening remains available'));
assert(appMarkup.includes('Job finished with partial coverage'));
assert(appMarkup.includes('satelliteForConjunctionObject(normalized.primary_object_id)'));
assert.equal(clientSource.includes('localStorage'), false, 'the API client never persists bearer credentials');
assert.equal(clientSource.includes('access_token'), false, 'the API client never constructs token query parameters');
assert(styles.includes('.full-catalog-workspace'));
assert(styles.includes('.full-catalog-form,\n    .full-catalog-action-row,\n    .full-catalog-job-metrics'));

console.log('fullCatalogClient tests passed');
