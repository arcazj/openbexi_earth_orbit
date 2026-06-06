import assert from 'assert';
import fs from 'fs';

function run() {
  const serverPy = fs.readFileSync('server.py', 'utf8');
  const readme = fs.readFileSync('README.md', 'utf8');
  const integration = fs.readFileSync('Test_and_Integration.md', 'utf8');

  [
    '"/api/health"',
    '"/api/version"',
    '"/api/tle"',
    '"/api/satellites"',
    '"/api/satellite-metadata"',
    '"/api/decayed"',
    '"/openapi.json"',
    '"/docs"'
  ].forEach(route => {
    assert(serverPy.includes(route), `server.py exposes ${route}`);
  });

  assert(serverPy.includes('Access-Control-Allow-Origin'), 'server.py sends CORS headers');
  assert(serverPy.includes('ThreadingHTTPServer'), 'server.py uses a local threaded HTTP server');
  assert(serverPy.includes('APP_VERSION = "1.5.17"'), 'server.py version matches latest release');
  assert(serverPy.includes('SwaggerUIBundle'), 'server docs page initializes Swagger UI when CDN is available');
  assert(serverPy.includes('.swagger-ui .opblock .opblock-summary-path'), 'server docs override Swagger route text contrast');
  assert(serverPy.includes('color: #ffffff !important'), 'server docs include high-contrast route/method text');
  assert(serverPy.includes('background: #132640 !important'), 'server docs keep endpoint rows in the OpenBEXI dark theme');
  [
    'icons/server_connected.svg',
    'icons/server_offline.svg',
    'icons/server_checking.svg',
    'icons/server_error.svg'
  ].forEach(iconPath => {
    assert(fs.existsSync(iconPath), `${iconPath} exists`);
    assert(fs.readFileSync(iconPath, 'utf8').includes('<svg'), `${iconPath} is an SVG icon`);
  });
  [
    'icons/power_green.png',
    'icons/power_red.png'
  ].forEach(iconPath => {
    assert(fs.existsSync(iconPath), `${iconPath} exists`);
  });
  assert(readme.includes('py server.py --host 127.0.0.1 --port 8000'), 'README documents Python server startup');
  assert(readme.includes('Version 1.5.17 moves Satellite Selection directly under Views & Time'), 'README documents revised Version 1.5.17 menu UX');
  assert(readme.includes('Views & Time, Satellite Selection, and Filters - Satellites Found start expanded'), 'README documents Version 1.5.17 launch defaults');
  assert(readme.includes('Releases History'), 'README documents the Releases History Help action');
  assert(readme.includes('LICENSE.md'), 'README documents the Markdown license file');
  assert(integration.includes('/api/health'), 'integration plan includes API health checks');
  assert(integration.includes('Swagger/API docs'), 'integration plan includes Swagger/API docs checks');
  assert(integration.includes('Version 1.5.17'), 'integration plan covers Version 1.5.17');
  assert(integration.includes('Views & Time, Satellite Selection, and Filters - Satellites Found start expanded'), 'integration plan covers Version 1.5.17 launch defaults');
  assert(integration.includes('README and Releases History render safe Markdown'), 'integration plan covers Help Markdown rendering');

  console.log('serverApiStructure tests passed');
}

run();
