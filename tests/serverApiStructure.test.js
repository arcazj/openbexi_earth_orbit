import assert from 'assert';
import fs from 'fs';

function run() {
  const serverPy = fs.readFileSync('server.py', 'utf8');
  const readme = fs.readFileSync('README.md', 'utf8') + fs.readFileSync('docs/engineering/DATA_MAINTENANCE.md', 'utf8');
  const integration = fs.readFileSync('docs/TESTING.md', 'utf8');
  const markdownViewer = fs.readFileSync('markdown_viewer.html', 'utf8');
  const swagger = fs.readFileSync('docs/SWAGGER.md', 'utf8');
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
  assert(serverPy.includes('--update-data-on-schedule'), 'server.py retains the data update schedule compatibility flag');
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
  assert(serverPy.includes('if not args.no_data_update:'), 'server.py starts automatic maintenance by default');
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
    ['[API reference](docs/SWAGGER.md)', 'README links the static API reference'],
    ['markdown_viewer.html?source=docs/SWAGGER.md&title=Swagger%20API', 'README links the rendered API reference'],
    ['/api/gp', 'README documents the primary GP API'],
    ['/api/gp-metadata', 'README documents GP metadata'],
    ['/api/launches', 'README documents launch events'],
    ['/api/data-update-status', 'README documents data health'],
    ['/api/display-satellite-models', 'README documents the model manifest'],
    ['Deprecated numeric/Alpha-5 TLE compatibility subset; not complete six-digit coverage', 'README labels the TLE API as deprecated and reduced coverage'],
    ['tools/satellite_data_tools.py', 'README documents the Python data tool'],
    ['--update-data-on-schedule', 'README documents the scheduled update compatibility flag']
    ,['npm run serve:update', 'README documents the daily update server command']
  ].forEach(([text, message]) => {
    assert(readme.includes(text), message);
  });
  assert(readme.includes('LICENSE.md'), 'README documents the Markdown license file');
  assert(fs.existsSync('LICENSE.md'), 'LICENSE.md exists for the Help Licenses action');
  assert(markdownViewer.includes('ALLOWED_MARKDOWN_SOURCES'), 'Markdown viewer restricts renderable sources');
  assert(markdownViewer.includes("'docs/SWAGGER.md', 'Swagger API'"), 'Markdown viewer allows the local Swagger Markdown page');
  assert(markdownViewer.includes('safeMarkdownHref'), 'Markdown viewer sanitizes rendered links');
  assert(markdownViewer.includes('renderMarkdown(markdown'), 'Markdown viewer renders Markdown content');
  assert(swagger.includes('OpenBEXI Earth Orbit Swagger API'), 'docs/SWAGGER.md has a clear title');
  assert(swagger.includes('The Help `Swagger` action opens `swagger.html`'), 'docs/SWAGGER.md points to the local standard Swagger UI page');
  assert(swagger.includes('You do not need to run `server.py` to read this Markdown companion'), 'docs/SWAGGER.md documents server-free display');
  assert(swagger.includes('/api/health'), 'docs/SWAGGER.md documents API health');
  assert(swagger.includes('/openapi.json'), 'docs/SWAGGER.md documents live OpenAPI JSON');
  assert(swagger.includes('/api/data-update-status'), 'docs/SWAGGER.md documents data update status');
  assert(swagger.includes('/api/display-satellite-models'), 'docs/SWAGGER.md documents display satellite model manifest');
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
  for (const topic of ['Core regression journeys', 'Data Maintenance Tools', 'Coverage Traceability Audit', 'markdown_viewer.html']) {
    assert(integration.includes(topic), `Current test guide covers ${topic}`);
  }

  console.log('serverApiStructure tests passed');
}

run();
