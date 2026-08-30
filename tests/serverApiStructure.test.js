import assert from 'assert';
import fs from 'fs';

function run() {
  const serverPy = fs.readFileSync('server.py', 'utf8');
  const readme = fs.readFileSync('README.md', 'utf8');
  const integration = fs.readFileSync('Test_and_Integration.md', 'utf8');
  const markdownViewer = fs.readFileSync('markdown_viewer.html', 'utf8');
  const swagger = fs.readFileSync('SWAGGER.md', 'utf8');
  const swaggerHtml = fs.readFileSync('swagger.html', 'utf8');
  const release = JSON.parse(fs.readFileSync('release/version.json', 'utf8'));

  [
    '"/api/health"',
    '"/api/version"',
    '"/api/tle"',
    '"/api/gp"',
    '"/api/gp-metadata"',
    '"/api/launches"',
    '"/api/satellites"',
    '"/api/satellite-metadata"',
    '"/api/display-satellite-models"',
    '"/api/decayed"',
    '"/api/data-update-status"',
    '"/openapi.json"',
    '"/docs"'
  ].forEach(route => {
    assert(serverPy.includes(route), `server.py exposes ${route}`);
  });

  assert(serverPy.includes('Access-Control-Allow-Origin'), 'server.py sends CORS headers');
  assert(serverPy.includes('ThreadingHTTPServer'), 'server.py uses a local threaded HTTP server');
  assert(serverPy.includes('RELEASE_METADATA_PATH = ROOT / "release" / "version.json"'), 'server.py loads authoritative release metadata');
  assert(serverPy.includes('APP_VERSION = str(RELEASE_METADATA["version"])'), 'server.py derives its version from release metadata');
  assert(serverPy.includes('PUBLICATION_STATE = str(RELEASE_METADATA["publicationState"])'), 'server.py derives its publication state from release metadata');
  assert(serverPy.includes('RELEASE_DATE = RELEASE_METADATA.get("releasedAt")'), 'server.py preserves a nullable release date');
  assert(serverPy.includes('CANDIDATE_DATE = RELEASE_METADATA.get("candidateAt")'), 'server.py derives its candidate date from release metadata');
  assert(serverPy.includes('--update-data-on-schedule'), 'server.py exposes data update schedule opt-in');
  assert(serverPy.includes('--no-data-update'), 'server.py exposes data update disable flag');
  assert(serverPy.includes('--data-update-interval-hours'), 'server.py exposes data update interval flag');
  for (const intervalFlag of [
    '--gp-update-interval-hours',
    '--tle-update-interval-hours',
    '--satcat-update-interval-hours',
    '--reconciliation-interval-hours'
  ]) {
    assert(serverPy.includes(intervalFlag), `server.py exposes ${intervalFlag}`);
    assert(readme.includes(intervalFlag), `README documents ${intervalFlag}`);
  }
  assert(serverPy.includes('maybe_update_satellite_data'), 'server.py imports the data tool function directly');
  assert(serverPy.includes('"data_revision": _composite_data_revision('), 'server.py exposes a deterministic composite data revision');
  assert(serverPy.includes('"gp_revision": gp_revision'), 'server.py exposes the GP dataset revision');
  assert(serverPy.includes('"launch_revision": launch_revision'), 'server.py exposes the launch dataset revision');
  assert(serverPy.includes('"decay_revision": decay_revision'), 'server.py exposes the decay dataset revision');
  assert((serverPy.match(/"\/api\/gp-metadata"/g) || []).length >= 2, 'GP metadata is present in routing and OpenAPI');
  assert(serverPy.includes('"state": "disabled"'), 'server.py keeps data updates disabled by default');
  assert(serverPy.includes('SwaggerUIBundle'), 'server docs page initializes Swagger UI when CDN is available');
  assert(serverPy.includes('.swagger-ui .opblock .opblock-summary-path'), 'server docs override Swagger route text contrast');
  assert(serverPy.includes('color: #ffffff !important'), 'server docs include high-contrast route/method text');
  assert(serverPy.includes('background: #132640 !important'), 'server docs keep endpoint rows in the OpenBEXI dark theme');
  [
    'icons/server_connected.svg',
    'icons/server_offline.svg',
    'icons/server_error.svg',
    'icons/server_checking.svg'
  ].forEach(iconPath => {
    assert(fs.existsSync(iconPath), `${iconPath} exists`);
    assert(fs.readFileSync(iconPath, 'utf8').includes('<svg'), `${iconPath} is an SVG icon`);
  });
  [
    ['## API', 'README includes the compact API section'],
    ['py server.py --host 127.0.0.1 --port 8000', 'README documents Python server startup'],
    ['[Static Swagger UI](swagger.html)', 'README links the static Swagger UI'],
    ['[API reference](SWAGGER.md)', 'README links the static API reference'],
    ['markdown_viewer.html?source=SWAGGER.md&title=Swagger%20API', 'README links the rendered API reference'],
    ['/api/gp', 'README documents the primary GP API'],
    ['/api/gp-metadata', 'README documents GP metadata'],
    ['/api/launches', 'README documents launch events'],
    ['/api/data-update-status', 'README documents data health'],
    ['/api/display-satellite-models', 'README documents the model manifest'],
    ['Deprecated numeric/Alpha-5 TLE compatibility subset; not complete six-digit coverage', 'README labels the TLE API as deprecated and reduced coverage'],
    ['tools/satellite_data_tools.py', 'README documents the Python data tool'],
    ['--update-data-on-schedule', 'README documents scheduled update opt-in']
    ,['npm run serve:update', 'README documents the daily update server command']
  ].forEach(([text, message]) => {
    assert(readme.includes(text), message);
  });
  assert(readme.includes('LICENSE.md'), 'README documents the Markdown license file');
  assert(fs.existsSync('LICENSE.md'), 'LICENSE.md exists for the Help Licenses action');
  assert(markdownViewer.includes('ALLOWED_MARKDOWN_SOURCES'), 'Markdown viewer restricts renderable sources');
  assert(markdownViewer.includes("'SWAGGER.md', 'Swagger API'"), 'Markdown viewer allows the local Swagger Markdown page');
  assert(markdownViewer.includes('safeMarkdownHref'), 'Markdown viewer sanitizes rendered links');
  assert(markdownViewer.includes('renderMarkdown(markdown'), 'Markdown viewer renders Markdown content');
  assert(swagger.includes('OpenBEXI Earth Orbit Swagger API'), 'SWAGGER.md has a clear title');
  assert(swagger.includes('The Help `Swagger` action opens `swagger.html`'), 'SWAGGER.md points to the local standard Swagger UI page');
  assert(swagger.includes('You do not need to run `server.py` to read this Markdown companion'), 'SWAGGER.md documents server-free display');
  assert(swagger.includes('/api/health'), 'SWAGGER.md documents API health');
  assert(swagger.includes('/openapi.json'), 'SWAGGER.md documents live OpenAPI JSON');
  assert(swagger.includes('/api/data-update-status'), 'SWAGGER.md documents data update status');
  assert(swagger.includes('/api/display-satellite-models'), 'SWAGGER.md documents display satellite model manifest');
  assert(swaggerHtml.includes('OpenBEXI Earth Orbit API'), 'swagger.html has a standard API title');
  assert(swaggerHtml.includes('class="badge version"'), 'swagger.html displays a version badge');
  assert(swaggerHtml.includes(release.version), 'swagger.html displays the release version');
  assert(swaggerHtml.includes('class="badge oas"'), 'swagger.html displays an OAS badge');
  assert(swaggerHtml.includes('Base URL / Schema Source'), 'swagger.html documents base URL/schema context');
  assert(swaggerHtml.includes('<details class="operation get"'), 'swagger.html uses expandable operation details');
  assert(swaggerHtml.includes('class="method get"'), 'swagger.html displays GET method badges');
  assert(swaggerHtml.includes('.method.post'), 'swagger.html defines POST method colors');
  assert(swaggerHtml.includes('.method.put'), 'swagger.html defines PUT method colors');
  assert(swaggerHtml.includes('.method.delete'), 'swagger.html defines DELETE method colors');
  [
    '/api/health',
    '/api/version',
    '/api/tle',
    '/api/satellites',
    '/api/satellite-metadata',
    '/api/satellite-metadata/{file_name}',
    '/api/display-satellite-models',
    '/api/decayed',
    '/api/data-update-status',
    '/openapi.json',
    '/docs'
  ].forEach(route => {
    assert(swaggerHtml.includes(route), `swagger.html documents ${route}`);
  });
  assert(!swaggerHtml.includes('https://unpkg.com'), 'swagger.html has no remote Swagger UI CDN dependency');
  assert(!swaggerHtml.includes('swagger-ui-dist'), 'swagger.html does not require swagger-ui-dist for local display');
  assert(integration.includes('/api/health'), 'integration plan includes API health checks');
  assert(integration.includes('Swagger/API docs'), 'integration plan includes Swagger/API docs checks');
  assert(integration.includes('Version 1.5.21'), 'integration plan covers Version 1.5.21');
  assert(integration.includes('Version 1.5.22'), 'integration plan covers Version 1.5.22');
  assert(integration.includes('Version 1.5.23'), 'integration plan covers Version 1.5.23');
  assert(integration.includes('Version 1.6 adds the optional `Stars & Milky Way` view layer'), 'integration plan covers Version 1.6');
  assert(integration.includes('Version 1.6.1 removes the integrated `Magnitude limit` slider'), 'integration plan covers Version 1.6.1');
  assert(integration.includes('Version 1.6.2 integrates Solar System Overview'), 'integration plan covers Version 1.6.2');
  assert(integration.includes('Version 1.7 upgrades Solar System textures and adds bundled JPL-derived ephemeris data'), 'integration plan covers Version 1.7');
  assert(integration.includes('Version 1.7.1 consolidates `Filters - Satellites Found` into `Satellites Selection - Found`'), 'integration plan covers Version 1.7.1');
  assert(integration.includes('Version 1.7.2 moves `Debris` into the orbit/category row'), 'integration plan covers Version 1.7.2');
  assert(integration.includes('Version 1.7.3 corrects 3D `Show Orbit`'), 'integration plan covers Version 1.7.3');
  assert(integration.includes('Version 1.7.4 replaces legacy Java data maintenance'), 'integration plan covers Version 1.7.4');
  assert(integration.includes('Version 1.7.5 makes `Show Launch Timeline` and `Show Re-entry Timeline` data-fresh'), 'integration plan covers Version 1.7.5');
  assert(integration.includes('Data Maintenance Tools'), 'integration plan covers Python data maintenance tools');
  assert(integration.includes('Coverage Traceability Audit'), 'integration plan includes a prior-release coverage audit');
  assert(integration.includes('swagger.html'), 'integration plan covers static standard Swagger UI rendering');
  assert(integration.includes('markdown_viewer.html?source=SWAGGER.md&title=Swagger%20API'), 'integration plan covers static Swagger Markdown companion rendering');
  assert(integration.includes('visible but unchecked by default'), 'integration plan covers default Stars & Milky Way sub-controls');
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
