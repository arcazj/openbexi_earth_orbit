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
  assert(serverPy.includes('APP_VERSION = "1.6.2"'), 'server.py version matches latest release');
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
  assert(readme.includes('Version 1.5.22 keeps the Earth-centered scene frame fixed'), 'README documents Version 1.5.22 Earth/Moon camera changes');
  assert(readme.includes('Version 1.5.23 adds `Mars` to `Other Selections`'), 'README documents Version 1.5.23 Mars changes');
  assert(readme.includes('Version 1.6 adds an optional `Stars & Milky Way` checkbox'), 'README documents Version 1.6 Stars & Milky Way changes');
  assert(readme.includes('Version 1.6.1 removes the integrated main-app `Magnitude limit` slider'), 'README documents Version 1.6.1 star catalog changes');
  assert(readme.includes('Version 1.6.2 integrates `Solar System Overview`'), 'README documents Version 1.6.2 Solar System integration');
  assert(readme.includes('displays all 46 bundled reference stars'), 'README documents the bundled star count');
  assert(readme.includes('textures/March.jpg'), 'README documents the local Mars texture path');
  assert(readme.includes('Mars texture loading is silent during initial `index.html` launch while Earth is active'), 'README documents silent Mars texture loading on launch');
  assert(readme.includes('the app shows a centered progress bar labeled `Loading Mars map/texture...`'), 'README documents centered Mars texture loading progress after selection');
  assert(readme.includes('shows a short confirmation state if the texture already loaded silently before selection'), 'README documents already-loaded Mars selection feedback');
  assert(readme.includes('keeps it visible long enough for fast cached/local loads to be seen'), 'README documents minimum Mars loading visibility');
  assert(readme.includes('Mars context also switches the Mercator background to the shared Mars texture'), 'README documents Mars Mercator map behavior');
  assert(readme.includes('textures/March_8k.jpg'), 'README documents the optimized Mars runtime texture path');
  assert(readme.includes('source/license to be confirmed'), 'README documents Mars texture provenance limitation');
  assert(readme.includes('TEME-like coordinates'), 'README documents TEME-as-ECI visualization approximation');
  assert(readme.includes('README and Releases History open through `markdown_viewer.html`'), 'README documents separate-page Markdown rendering');
  assert(readme.includes('SolarSystemOverview.html'), 'README documents the standalone Solar System Overview page');
  assert(readme.includes('The main app also integrates Solar System Overview starting in Version 1.6.2'), 'README documents SolarSystemOverview is now integrated while standalone remains available');
  assert(readme.includes('SSL_1300.glb` resolves only for `INTELSAT 20 (IS-20)` and `INTELSAT 18 (IS-18)`'), 'README documents SSL_1300 IS-20/IS-18 gating');
  assert(readme.includes('LICENSE.md'), 'README documents the Markdown license file');
  assert(fs.existsSync('LICENSE.md'), 'LICENSE.md exists for the Help Licenses action');
  assert(markdownViewer.includes('ALLOWED_MARKDOWN_SOURCES'), 'Markdown viewer restricts renderable sources');
  assert(markdownViewer.includes('safeMarkdownHref'), 'Markdown viewer sanitizes rendered links');
  assert(markdownViewer.includes('renderMarkdown(markdown'), 'Markdown viewer renders Markdown content');
  assert(integration.includes('/api/health'), 'integration plan includes API health checks');
  assert(integration.includes('Swagger/API docs'), 'integration plan includes Swagger/API docs checks');
  assert(integration.includes('Version 1.5.21'), 'integration plan covers Version 1.5.21');
  assert(integration.includes('Version 1.5.22'), 'integration plan covers Version 1.5.22');
  assert(integration.includes('Version 1.5.23'), 'integration plan covers Version 1.5.23');
  assert(integration.includes('Version 1.6 adds the optional `Stars & Milky Way` view layer'), 'integration plan covers Version 1.6');
  assert(integration.includes('Version 1.6.1 removes the integrated `Magnitude limit` slider'), 'integration plan covers Version 1.6.1');
  assert(integration.includes('Version 1.6.2 integrates Solar System Overview'), 'integration plan covers Version 1.6.2');
  assert(integration.includes('controls only while enabled'), 'integration plan covers hidden Stars & Milky Way sub-controls');
  assert(integration.includes('Test Mars mode keeps Mars visually centered'), 'integration plan covers Mars target checks');
  assert(integration.includes('Mars texture loading does not show a visible progress bar on initial `index.html` launch'), 'integration plan covers silent Mars launch behavior');
  assert(integration.includes('Selecting Mars shows a progress bar'), 'integration plan covers Mars texture progress checks');
  assert(integration.includes('Mars Mercator uses `textures/March_8k.jpg`'), 'integration plan covers Mars Mercator texture checks');
  assert(integration.includes('Earth mesh remains at `(0, 0, 0)`'), 'integration plan covers Earth-origin checks');
  assert(integration.includes('README and Releases History open rendered Markdown in `markdown_viewer.html`'), 'integration plan covers separate-page Help Markdown rendering');
  assert(integration.includes('Standalone Solar System Overview'), 'integration plan covers the standalone Solar System Overview page');
  assert(integration.includes('SSL_1300.glb` is restricted to `INTELSAT 20 (IS-20)` and `INTELSAT 18 (IS-18)`'), 'integration plan covers SSL_1300 IS-20/IS-18 gating');

  console.log('serverApiStructure tests passed');
}

run();
