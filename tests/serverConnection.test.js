import assert from 'assert';
import {
  apiEndpoint,
  checkServerConnection,
  SERVER_STATUS_ICONS,
  loadTleDataFromServer,
  resolveApiBaseUrl,
  resolveServerDataUrl,
  serverStatusViewModel,
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
      storage: null
    }),
    'http://127.0.0.1:8000',
    'loopback static hosting checks same-origin API first'
  );
  assert.strictEqual(
    resolveServerDataUrl('json/tle/TLE.json', 'http://127.0.0.1:8000'),
    'http://127.0.0.1:8000/api/tle',
    'TLE local URL maps to server TLE endpoint'
  );
  assert.strictEqual(
    resolveServerDataUrl('json/satellites/starlink_V1.json', 'http://127.0.0.1:8000'),
    'http://127.0.0.1:8000/api/satellite-metadata/starlink_V1.json',
    'satellite metadata URL maps to server metadata endpoint'
  );

  const validTle = [{
    norad_id: '25544',
    satellite_name: 'ISS (ZARYA)',
    tle_line1: '1 25544U 98067A   26154.24769802  .00009145  00000+0  16852-2 0  9990',
    tle_line2: '2 25544  51.6400 135.3804 0003061  72.2548 287.8794 15.48314930362054'
  }];
  assert.strictEqual(validateTleData(validTle), true, 'valid TLE data passes validation');
  assert.strictEqual(validateTleData([{ norad_id: '1' }]), false, 'malformed TLE data fails validation');

  const connected = await checkServerConnection({
    baseUrl: 'http://127.0.0.1:8000',
    fetchImpl: async (url) => {
      if (url.endsWith('/api/health')) return response(true, { status: 'ok' });
      if (url.endsWith('/api/version')) return response(true, { api_version: '1.7.1' });
      return response(false, {}, 404);
    }
  });
  assert.strictEqual(connected.state, 'connected', 'health ok marks server connected');
  assert.strictEqual(connected.version.api_version, '1.7.1', 'version payload is captured');

  const disconnected = await checkServerConnection({
    baseUrl: 'http://127.0.0.1:8000',
    fetchImpl: async () => { throw new Error('connection refused'); }
  });
  assert.strictEqual(disconnected.state, 'disconnected', 'fetch failure marks server disconnected');
  assert.strictEqual(disconnected.dataSource, 'local', 'disconnected mode falls back to local data source');

  const loadedTle = await loadTleDataFromServer({
    baseUrl: 'http://127.0.0.1:8000',
    fetchImpl: async () => response(true, validTle)
  });
  assert.strictEqual(loadedTle.length, 1, 'server TLE loader returns validated records');

  await assert.rejects(
    () => loadTleDataFromServer({
      baseUrl: 'http://127.0.0.1:8000',
      fetchImpl: async () => response(true, [{ bad: true }])
    }),
    /validation/,
    'invalid server TLE response rejects so caller can fall back to local data'
  );

  assert.strictEqual(serverStatusViewModel({ state: 'connected' }).tooltip, 'Connected to server');
  assert.strictEqual(serverStatusViewModel({ state: 'connected' }).icon, SERVER_STATUS_ICONS.connected, 'connected state uses icon');
  assert.strictEqual(serverStatusViewModel({ state: 'connected' }).icon, 'icons/power_green.png', 'connected state uses the green power icon');
  assert.strictEqual(serverStatusViewModel({ state: 'checking' }).tooltip, 'Checking server connection');
  assert.strictEqual(serverStatusViewModel({ state: 'checking' }).icon, 'icons/server_checking.svg', 'checking state uses icon');
  assert.strictEqual(serverStatusViewModel({ state: 'error' }).tooltip, 'Server error - using local data');
  assert.strictEqual(serverStatusViewModel({ state: 'error' }).icon, 'icons/power_red.png', 'error state uses red power icon');
  assert.strictEqual(serverStatusViewModel({ state: 'disconnected' }).tooltip, 'Offline mode - using local data');
  assert.strictEqual(serverStatusViewModel({ state: 'disconnected' }).icon, 'icons/power_red.png', 'offline state uses red power icon');

  console.log('serverConnection tests passed');
}

await run();
