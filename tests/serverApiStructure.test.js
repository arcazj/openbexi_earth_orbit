import assert from 'assert';
import fs from 'fs';

function run() {
  const serverPy = fs.readFileSync('server.py', 'utf8');
  const readme = fs.readFileSync('README.md', 'utf8');
  const integration = fs.readFileSync('Test_and_Integration.md', 'utf8');
  const markdownViewer = fs.readFileSync('markdown_viewer.html', 'utf8');

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
  assert(serverPy.includes('APP_VERSION = "1.5.21"'), 'server.py version matches latest release');
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
  assert(readme.includes('Version 1.5.21 makes the right-side selected-satellite data and TLE sections collapsible'), 'README documents Version 1.5.21 UI changes');
  assert(readme.includes('README and Releases History open through `markdown_viewer.html`'), 'README documents separate-page Markdown rendering');
  assert(readme.includes('SSL_1300.glb` resolves only for `INTELSAT 20 (IS-20)` and `INTELSAT 18 (IS-18)`'), 'README documents SSL_1300 IS-20/IS-18 gating');
  assert(readme.includes('LICENSE.md'), 'README documents the Markdown license file');
  assert(fs.existsSync('LICENSE.md'), 'LICENSE.md exists for the Help Licenses action');
  assert(markdownViewer.includes('ALLOWED_MARKDOWN_SOURCES'), 'Markdown viewer restricts renderable sources');
  assert(markdownViewer.includes('safeMarkdownHref'), 'Markdown viewer sanitizes rendered links');
  assert(markdownViewer.includes('renderMarkdown(markdown'), 'Markdown viewer renders Markdown content');
  assert(integration.includes('/api/health'), 'integration plan includes API health checks');
  assert(integration.includes('Swagger/API docs'), 'integration plan includes Swagger/API docs checks');
  assert(integration.includes('Version 1.5.21'), 'integration plan covers Version 1.5.21');
  assert(integration.includes('README and Releases History open rendered Markdown in `markdown_viewer.html`'), 'integration plan covers separate-page Help Markdown rendering');
  assert(integration.includes('SSL_1300.glb` is restricted to `INTELSAT 20 (IS-20)` and `INTELSAT 18 (IS-18)`'), 'integration plan covers SSL_1300 IS-20/IS-18 gating');

  console.log('serverApiStructure tests passed');
}

run();
