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
  assert(serverPy.includes('APP_VERSION = "1.5.13"'), 'server.py version matches latest release');
  assert(serverPy.includes('SwaggerUIBundle'), 'server docs page initializes Swagger UI when CDN is available');
  assert(readme.includes('py server.py --host 127.0.0.1 --port 8000'), 'README documents Python server startup');
  assert(integration.includes('/api/health'), 'integration plan includes API health checks');
  assert(integration.includes('Swagger/API docs'), 'integration plan includes Swagger/API docs checks');

  console.log('serverApiStructure tests passed');
}

run();
