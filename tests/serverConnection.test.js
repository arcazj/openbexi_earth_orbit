import assert from 'assert';
import {
  APP_VERSION,
  apiEndpoint,
  checkServerConnection,
  checkServerConnectionWithFallback,
  catalogRevisionFromStatus,
  createCatalogRevisionWatcher,
  createStaticDataRevisionWatcher,
  SERVER_STATUS_ICONS,
  loadGpDataFromServer,
  loadGpMetadataFromServer,
  loadStaticDataUpdateStatus,
  loadTleDataFromServer,
  resolveApiBaseUrl,
  resolveServerDataUrl,
  serverStatusViewModel,
  validateGpData,
  validateTleData
} from '../js/serverConnection.js';

function response(ok, data, status = 200) {
  return {
    ok,
    status,
    json: async () => data
  };
}

async function run() {
  assert.strictEqual(apiEndpoint('http://127.0.0.1:8000/', '/api/health'), 'http://127.0.0.1:8000/api/health');
  assert.strictEqual(
    resolveApiBaseUrl({
      windowObj: { location: { search: '?apiBase=http://localhost:9000', protocol: 'http:', hostname: '127.0.0.1', origin: 'http://127.0.0.1:8000' } },
      storage: null
    }),
    'http://localhost:9000',
    'query parameter can configure server URL'
  );
  assert.strictEqual(
    resolveApiBaseUrl({
      windowObj: { location: { search: '', protocol: 'http:', hostname: '127.0.0.1', origin: 'http://127.0.0.1:8000' } },
      storage: null,
      documentObj: null
    }),
    'http://127.0.0.1:8000',
    'loopback static hosting checks same-origin API first'
  );
  assert.strictEqual(
    resolveApiBaseUrl({
      windowObj: { location: { search: '', protocol: 'http:', hostname: '127.0.0.1', origin: 'http://127.0.0.1:8001' } },
      storage: null,
      documentObj: { querySelector: () => ({ content: 'static' }) }
    }),
    '',
    'curated static deployment does not probe nonexistent same-origin API routes'
  );
  assert.strictEqual(
    resolveServerDataUrl('json/gp/GP.json', 'http://127.0.0.1:8000'),
    'http://127.0.0.1:8000/api/gp',
    'GP local URL maps to server GP endpoint'
  );
  assert.strictEqual(
    resolveServerDataUrl('json/gp/GP.meta.json', 'http://127.0.0.1:8000'),
    'http://127.0.0.1:8000/api/gp-metadata',
    'GP metadata follows the connected server instead of the page host'
  );
  assert.strictEqual(
    resolveServerDataUrl('json/tle/TLE.json', 'http://127.0.0.1:8000'),
    'http://127.0.0.1:8000/api/tle',
    'TLE local URL maps to server TLE endpoint'
  );
  assert.strictEqual(
    resolveServerDataUrl('json/tle/TLE.meta.json', 'http://127.0.0.1:8000'),
    'http://127.0.0.1:8000/json/tle/TLE.meta.json',
    'legacy TLE metadata follows the connected server'
  );
  assert.strictEqual(
    resolveServerDataUrl('json/launches/launches.json', 'http://127.0.0.1:8000'),
    'http://127.0.0.1:8000/api/launches',
    'launch local URL maps to server launch endpoint'
  );
  assert.strictEqual(
    resolveServerDataUrl('json/satellites/starlink_V1.json', 'http://127.0.0.1:8000'),
    'http://127.0.0.1:8000/api/satellite-metadata/starlink_V1.json',
    'satellite metadata URL maps to server metadata endpoint'
  );
  assert.strictEqual(
    resolveServerDataUrl('json/tracked/TRACKED.manifest.json', 'http://remote.example:8000'),
    'http://remote.example:8000/api/tracked-objects/manifest',
    'tracked manifest follows the connected server'
  );
  assert.strictEqual(
    resolveServerDataUrl('json/tracked/chunks/abc-current-debris.json', 'http://remote.example:8000'),
    'http://remote.example:8000/api/tracked-objects/chunks/abc-current-debris.json',
    'content-addressed tracked chunks follow the connected server'
  );

  const validTle = [{
    norad_id: '25544',
    satellite_name: 'ISS (ZARYA)',
    tle_line1: '1 25544U 98067A   26154.24769802  .00009145  00000+0  16852-2 0  9990',
    tle_line2: '2 25544  51.6400 135.3804 0003061  72.2548 287.8794 15.48314930362054'
  }];
  assert.strictEqual(validateTleData(validTle), true, 'valid TLE data passes validation');
  assert.strictEqual(validateTleData([{ norad_id: '1' }]), false, 'malformed TLE data fails validation');
  const validGp = [{
    norad_id: '100001',
    source_format: 'CCSDS_OMM_JSON',
    element_set: {
      format: 'OMM',
      epoch: '2026-08-22T00:00:00Z',
      omm: { NORAD_CAT_ID: '100001', EPOCH: '2026-08-22T00:00:00Z' }
    }
  }];
  assert.strictEqual(validateGpData(validGp), true, 'six-digit OMM GP data passes validation');
  assert.strictEqual(validateGpData([{
    ...validGp[0],
    norad_id: 'A1234',
    element_set: { ...validGp[0].element_set, omm: { ...validGp[0].element_set.omm, NORAD_CAT_ID: 'A1234' } }
  }]), true, 'Alpha-5 GP identifiers pass validation without numeric coercion');
  assert.strictEqual(validateGpData([{ norad_id: '100001', element_set: { format: 'OMM' } }]), false);
  assert.strictEqual(
    catalogRevisionFromStatus({ data_revision: 'sha256:composite', catalog_revision: 'sha256:gp-only' }),
    'sha256:composite',
    'composite data revision takes precedence over the legacy GP-only catalog revision'
  );

  const connected = await checkServerConnection({
    baseUrl: 'http://127.0.0.1:8000',
    fetchImpl: async (url) => {
      if (url.endsWith('/api/health')) return response(true, { status: 'ok' });
      if (url.endsWith('/api/version')) return response(true, { api_version: APP_VERSION });
      return response(false, {}, 404);
    }
  });
  assert.strictEqual(connected.state, 'connected', 'health ok marks server connected');
  assert.strictEqual(connected.version.api_version, APP_VERSION, 'version payload is captured');

  const disconnected = await checkServerConnection({
    baseUrl: 'http://127.0.0.1:8000',
    fetchImpl: async () => { throw new Error('connection refused'); }
  });
  assert.strictEqual(disconnected.state, 'disconnected', 'fetch failure marks server disconnected');
  assert.strictEqual(disconnected.dataSource, 'local', 'disconnected mode falls back to local data source');

  const fallbackConnected = await checkServerConnectionWithFallback({
    baseUrl: 'http://localhost:63342',
    fetchImpl: async (url) => {
      if (url.startsWith('http://localhost:63342')) throw new Error('static host has no API');
      if (url.endsWith('/api/health')) return response(true, { status: 'ok' });
      if (url.endsWith('/api/version')) return response(true, { api_version: APP_VERSION });
      return response(false, {}, 404);
    }
  });
  assert.strictEqual(fallbackConnected.state, 'connected', 'fallback connects to the default Python API after a static host misses');
  assert.strictEqual(fallbackConnected.baseUrl, 'http://127.0.0.1:8000', 'fallback reports the working Python API base URL');

  const loadedTle = await loadTleDataFromServer({
    baseUrl: 'http://127.0.0.1:8000',
    fetchImpl: async () => response(true, validTle)
  });
  assert.strictEqual(loadedTle.length, 1, 'server TLE loader returns validated records');

  const loadedGp = await loadGpDataFromServer({
    baseUrl: 'http://127.0.0.1:8000',
    fetchImpl: async () => response(true, validGp)
  });
  assert.strictEqual(loadedGp[0].norad_id, '100001', 'server GP loader preserves full-width NORAD IDs');

  const loadedGpMetadata = await loadGpMetadataFromServer({
    baseUrl: 'http://remote.example:8000',
    fetchImpl: async (url) => {
      assert.strictEqual(url, 'http://remote.example:8000/api/gp-metadata');
      return response(true, { catalog_revision: 'sha256:remote-gp' });
    }
  });
  assert.strictEqual(loadedGpMetadata.catalog_revision, 'sha256:remote-gp');
  await assert.rejects(
    () => loadGpMetadataFromServer({
      baseUrl: 'http://remote.example:8000',
      fetchImpl: async () => response(false, { catalog_revision: 'sha256:page-host' }, 503)
    }),
    /HTTP 503/,
    'failed remote GP metadata does not fall back to a page-host sidecar'
  );

  await assert.rejects(
    () => loadTleDataFromServer({
      baseUrl: 'http://127.0.0.1:8000',
      fetchImpl: async () => response(true, [{ bad: true }])
    }),
    /validation/,
    'invalid server TLE response rejects so caller can fall back to local data'
  );

  let revision = 'sha256:first';
  const changes = [];
  const watcher = createCatalogRevisionWatcher({
    baseUrl: 'http://127.0.0.1:8000',
    intervalMs: 60_000,
    fetchImpl: async () => response(true, {
      data_revision: revision,
      catalog_revision: 'sha256:unchanged-gp'
    }),
    onRevisionChange: event => changes.push(event)
  });
  await watcher.start();
  revision = 'sha256:second';
  const changed = await watcher.checkNow();
  watcher.stop();
  assert.strictEqual(changed.changed, true);
  assert.strictEqual(changes[0].previous, 'sha256:first');
  assert.strictEqual(changes[0].revision, 'sha256:second');

  let retryRevision = 'sha256:retry-first';
  let refreshAttempts = 0;
  const retryWatcher = createCatalogRevisionWatcher({
    baseUrl: 'http://127.0.0.1:8000',
    intervalMs: 60_000,
    fetchImpl: async () => response(true, { data_revision: retryRevision }),
    onRevisionChange: async () => {
      refreshAttempts += 1;
      if (refreshAttempts === 1) throw new Error('transient refresh failure');
    }
  });
  await retryWatcher.start();
  retryRevision = 'sha256:retry-second';
  const failedRefresh = await retryWatcher.checkNow();
  assert(failedRefresh.error, 'failed revision callback is reported');
  assert.strictEqual(retryWatcher.revision, 'sha256:retry-first', 'failed revision is not marked as applied');
  const retriedRefresh = await retryWatcher.checkNow();
  retryWatcher.stop();
  assert.strictEqual(retriedRefresh.changed, true);
  assert.strictEqual(refreshAttempts, 2, 'the same revision is retried after a transient callback failure');
  assert.strictEqual(retryWatcher.revision, 'sha256:retry-second');

  const staticMetadata = {
    'json/gp/GP.meta.json': { catalog_revision: 'sha256:gp-one' },
    'json/launches/launches.meta.json': { catalog_revision: 'sha256:launch-one' },
    'json/decayed/decayed.meta.json': { catalog_revision: 'sha256:decay-one' },
    'json/tracked/TRACKED.manifest.json': { manifest_hash: 'sha256:tracked-one' }
  };
  const staticFetchOptions = [];
  const staticFetch = async (url, options) => {
    staticFetchOptions.push(options);
    return response(true, staticMetadata[url]);
  };
  const staticStatus = await loadStaticDataUpdateStatus({ fetchImpl: staticFetch });
  assert.match(staticStatus.data_revision, /^static:/);
  assert.strictEqual(staticStatus.launch_revision, 'sha256:launch-one');
  assert.strictEqual(staticStatus.tracked_revision, 'sha256:tracked-one');
  assert(staticFetchOptions.every(options => options.cache === 'no-store'), 'static metadata polling bypasses browser caches');

  const staticChanges = [];
  const staticWatcher = createStaticDataRevisionWatcher({
    fetchImpl: staticFetch,
    intervalMs: 60_000,
    onRevisionChange: event => staticChanges.push(event)
  });
  await staticWatcher.start();
  staticMetadata['json/decayed/decayed.meta.json'] = { catalog_revision: 'sha256:decay-two' };
  const staticChanged = await staticWatcher.checkNow();
  staticWatcher.stop();
  assert.strictEqual(staticChanged.changed, true, 'a static decay-only revision triggers the composite watcher');
  assert.strictEqual(staticChanges.length, 1);

  const tleOnlyMetadata = {
    'json/tle/TLE.meta.json': { catalog_revision: 'sha256:tle-only' },
    'json/launches/launches.meta.json': { catalog_revision: 'sha256:launch-only' },
    'json/decayed/decayed.meta.json': { catalog_revision: 'sha256:decay-only' },
    'json/tracked/TRACKED.manifest.json': { manifest_hash: 'sha256:tracked-only' }
  };
  const tleOnlyStatus = await loadStaticDataUpdateStatus({
    fetchImpl: async (url) => {
      if (url === 'json/gp/GP.meta.json') return response(false, {}, 404);
      return response(true, tleOnlyMetadata[url]);
    }
  });
  assert.strictEqual(tleOnlyStatus.catalog_kind, 'TLE');
  assert.strictEqual(tleOnlyStatus.tle_revision, 'sha256:tle-only');
  assert.strictEqual(tleOnlyStatus.gp_revision, null);

  assert.strictEqual(serverStatusViewModel({ state: 'connected' }).tooltip, 'Connected to server');
  assert.strictEqual(serverStatusViewModel({ state: 'connected' }).icon, SERVER_STATUS_ICONS.connected, 'connected state uses icon');
  assert.strictEqual(serverStatusViewModel({ state: 'connected' }).icon, 'icons/server_connected.svg', 'connected state uses the connected server icon');
  assert.strictEqual(serverStatusViewModel({ state: 'checking' }).tooltip, 'Checking server connection');
  assert.strictEqual(serverStatusViewModel({ state: 'checking' }).icon, 'icons/server_checking.svg', 'checking state uses icon');
  assert.strictEqual(serverStatusViewModel({ state: 'error' }).tooltip, 'Server error - using local data');
  assert.strictEqual(serverStatusViewModel({ state: 'error' }).icon, 'icons/server_error.svg', 'error state uses error server icon');
  assert.strictEqual(serverStatusViewModel({ state: 'disconnected' }).tooltip, 'Offline mode - using local data');
  assert.strictEqual(serverStatusViewModel({ state: 'disconnected' }).icon, 'icons/server_offline.svg', 'offline state uses offline server icon');

  console.log('serverConnection tests passed');
}

await run();
