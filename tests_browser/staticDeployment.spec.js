import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(projectRoot, 'dist');
const contentTypes = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
});

let server;
let origin;

async function installArtifactOriginGuard(page, options = {}) {
  const requests = [];
  const externalRequests = [];
  const notFoundResponses = [];
  const requestFailures = [];
  const missingCatalog = options.missingCatalog === true;

  page.on('request', request => requests.push(request.url()));
  page.on('requestfailed', request => requestFailures.push({
    url: request.url(),
    error: request.failure()?.errorText || 'unknown request failure'
  }));
  page.on('response', response => {
    if (response.status() === 404) notFoundResponses.push(response.url());
  });
  await page.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== origin) {
      externalRequests.push(requestUrl.href);
      await route.abort('blockedbyclient');
      return;
    }
    if (missingCatalog && requestUrl.pathname.endsWith('/json/tle/TLE.json')) {
      await route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: 'Missing packaged catalog' });
      return;
    }
    await route.continue();
  });

  return { requests, externalRequests, notFoundResponses, requestFailures };
}

test.beforeAll(async () => {
  execFileSync(process.execPath, ['scripts/build-static.mjs'], {
    cwd: projectRoot,
    stdio: 'pipe'
  });
  expect(fs.existsSync(path.join(distRoot, 'node_modules'))).toBe(false);

  server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const relative = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    const candidate = path.resolve(distRoot, ...relative.split('/'));
    if (!candidate.startsWith(`${distRoot}${path.sep}`) || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(candidate).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    fs.createReadStream(candidate).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

test('curated static artifact boots offline and screens the full catalog in its module Worker', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The static artifact boot runs once on desktop Chromium.');
  test.setTimeout(180_000);
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const network = await installArtifactOriginGuard(page);

  await page.goto(`${origin}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const sources = window.openbexiDependencySources;
    return sources?.policy === 'packaged-only' &&
      sources?.deploymentMode === 'static' &&
      sources?.three === 'local' &&
      sources?.satellite === 'local';
  });
  await page.waitForFunction(() => (
    window.openbexiStartupPerformance
      ?.summary()
      .some(entry => entry.name === 'first-interactive-ui')
  ));

  const sources = await page.evaluate(() => window.openbexiDependencySources);
  expect(sources.threeCoreUrl).toContain('/vendor/three/0.184.0/build/three.module.js');
  expect(sources.satelliteUrl).toContain('/vendor/satellite.js/6.0.2/satellite.min.js');
  await expect(page.locator('body > canvas:not(#mercatorCanvas)').first()).toBeVisible();

  const issShortcut = page.locator('#selectIssButton');
  await expect(issShortcut).toBeEnabled({ timeout: 30_000 });
  await issShortcut.click();
  await page.locator('#conjunctionAccordionHeader').click();
  const runButton = page.getByRole('button', { name: 'Run Screen', exact: true });
  await expect(runButton).toBeEnabled();
  await runButton.click();
  await expect(page.locator('#conjunctionStatus')).toContainText('close approach', { timeout: 90_000 });
  await expect(page.locator('#conjunctionProgress')).toHaveJSProperty('value', 100);
  await expect(page.getByRole('button', { name: 'Export JSON', exact: true })).toBeEnabled();

  expect(network.requests.some(url => url.endsWith('/js/conjunction/conjunctionWorker.js'))).toBe(true);
  expect(network.requests.some(url => url.endsWith('/vendor/satellite.js/6.0.2/satellite.es.js'))).toBe(true);
  expect(network.requests.some(url => url.includes('/node_modules/'))).toBe(false);
  expect(network.requests.every(url => new URL(url).origin === origin)).toBe(true);
  expect(network.externalRequests).toEqual([]);
  expect(network.requestFailures.every(failure => (
    new URL(failure.url).origin === origin && failure.error === 'net::ERR_ABORTED'
  ))).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(network.notFoundResponses).toEqual([]);
  expect(consoleErrors).toEqual([]);
  console.log(`[v2-static-network-evidence] ${JSON.stringify({
    requestCount: network.requests.length,
    externalRequests: network.externalRequests,
    notFoundResponses: network.notFoundResponses,
    sameOriginCancellations: network.requestFailures.length,
    workerScreening: 'passed'
  })}`);
});

test('static runtime fails closed when its packaged catalog is unavailable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The static artifact trust-boundary test runs on desktop Chromium.');
  test.setTimeout(60_000);
  const network = await installArtifactOriginGuard(page, { missingCatalog: true });

  await page.goto(`${origin}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.openbexiDependencySources?.policy === 'packaged-only');
  await expect(page.getByText(/packaged satellite catalog is missing or invalid/i)).toBeVisible();

  expect(network.externalRequests).toEqual([]);
  expect(network.requests.some(url => url.includes('raw.githubusercontent.com'))).toBe(false);
  expect(network.notFoundResponses).toEqual([`${origin}/json/tle/TLE.json`]);
});
