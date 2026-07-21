import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MOBILE_CONJUNCTION_CATALOG = Object.freeze([
  {
    company: 'NASA',
    satellite_name: 'ISS (ZARYA)',
    norad_id: '25544',
    type: 'LEO',
    orbit_class: 'LEO',
    tle_line1: '1 25544U 98067A   26154.24769802  .00009145  00000+0  16852-2 0  9998',
    tle_line2: '2 25544  51.6400 135.3804 0003061  72.2548 287.8794 15.48314930362059'
  },
  {
    company: 'OPENBEXI TEST',
    satellite_name: 'COLOCATED VALIDATION OBJECT',
    norad_id: '99999',
    type: 'LEO',
    orbit_class: 'LEO',
    tle_line1: '1 99999U 98067A   26154.24769802  .00009145  00000+0  16852-2 0  9993',
    tle_line2: '2 99999  51.6400 135.3804 0003061  72.2548 287.8794 15.48314930362054'
  }
]);

const INVALID_CONJUNCTION_CATALOG = Object.freeze([{
  ...MOBILE_CONJUNCTION_CATALOG[0],
  tle_line1: `${MOBILE_CONJUNCTION_CATALOG[0].tle_line1.slice(0, -1)}0`
}]);

function monitorBrowserErrors(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

function expectNoBrowserErrors(browserErrors) {
  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
}

async function bootWithLocalDependencies(page, options = {}) {
  const { catalogFixture = null, emptyCatalog = false, waitForInteractive = true } = options;
  await page.route('**/node_modules/**', route => route.abort('blockedbyclient'));
  if (catalogFixture || emptyCatalog) {
    await page.route('**/json/tle/TLE.json', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(catalogFixture || [])
    }));
  }
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const sources = window.openbexiDependencySources;
    return sources?.three === 'local' && sources?.satellite === 'local';
  });
  if (waitForInteractive) {
    await page.waitForFunction(() => (
      window.openbexiStartupPerformance
        ?.summary()
        .some(entry => entry.name === 'first-interactive-ui')
    ));
  }
}

async function setScreeningInputs(page, values) {
  return page.locator('#conjunctionScreeningForm').evaluate((form, nextValues) => {
    for (const [id, value] of Object.entries(nextValues)) {
      const input = form.querySelector(`#${id}`);
      if (!(input instanceof HTMLInputElement)) throw new Error(`Missing screening input: ${id}`);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return Object.fromEntries(
      Object.keys(nextValues).map(id => [id, form.querySelector(`#${id}`)?.value])
    );
  }, values);
}

async function sampleConjunctionCanvas(page) {
  const canvas = page.locator('body > canvas:not(#mercatorCanvas)').first();
  await expect(canvas).toBeVisible();
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));

  return canvas.evaluate(element => {
    const readbackStartedAt = performance.now();
    const gl = window.renderer?.getContext?.()
      || element.getContext('webgl2')
      || element.getContext('webgl');
    if (!gl) return { hasContext: false, eventColorPixels: 0, nonBlankPixels: 0 };

    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const sampleWidth = Math.min(384, width);
    const sampleHeight = Math.min(256, height);
    const x = Math.max(0, Math.floor((width - sampleWidth) / 2));
    const y = Math.max(0, Math.floor((height - sampleHeight) / 2));
    const pixels = new Uint8Array(sampleWidth * sampleHeight * 4);
    gl.readPixels(x, y, sampleWidth, sampleHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let eventColorPixels = 0;
    let nonBlankPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      if (pixels[offset + 3] > 0 && red + green + blue > 12) nonBlankPixels += 1;
      const cyanMarker = red < 100 && green > 145 && blue > 145;
      const amberMarker = red > 190 && green > 95 && blue < 135;
      if (cyanMarker || amberMarker) eventColorPixels += 1;
    }
    return {
      hasContext: true,
      eventColorPixels,
      nonBlankPixels,
      width,
      height,
      sampleWidth,
      sampleHeight,
      glError: gl.getError(),
      readbackDurationMs: performance.now() - readbackStartedAt
    };
  });
}

async function startResponsivenessMonitor(page) {
  await page.evaluate(() => {
    const startedAt = performance.now();
    const monitor = {
      active: true,
      startedAt,
      intervalTicks: 0,
      rafFrames: 0,
      lastIntervalAt: startedAt,
      maxIntervalGapMs: 0,
      progressValues: new Set(),
      intervalId: 0
    };
    monitor.intervalId = setInterval(() => {
      const now = performance.now();
      monitor.intervalTicks += 1;
      monitor.maxIntervalGapMs = Math.max(monitor.maxIntervalGapMs, now - monitor.lastIntervalAt);
      monitor.lastIntervalAt = now;
      const progress = document.querySelector('#conjunctionProgress');
      if (progress instanceof HTMLProgressElement) monitor.progressValues.add(progress.value);
    }, 100);
    const onFrame = () => {
      if (!monitor.active) return;
      monitor.rafFrames += 1;
      requestAnimationFrame(onFrame);
    };
    requestAnimationFrame(onFrame);
    window.__openbexiConjunctionResponsiveness = monitor;
  });
}

async function stopResponsivenessMonitor(page) {
  return page.evaluate(() => {
    const monitor = window.__openbexiConjunctionResponsiveness;
    if (!monitor) return null;
    monitor.active = false;
    clearInterval(monitor.intervalId);
    const result = {
      durationMs: performance.now() - monitor.startedAt,
      intervalTicks: monitor.intervalTicks,
      rafFrames: monitor.rafFrames,
      maxIntervalGapMs: monitor.maxIntervalGapMs,
      distinctProgressValues: monitor.progressValues.size
    };
    delete window.__openbexiConjunctionResponsiveness;
    return result;
  });
}

async function collectBrowserEvidence(page) {
  return page.evaluate(() => {
    const startupEntries = window.openbexiStartupPerformance?.summary?.() || [];
    const entry = name => startupEntries.find(candidate => candidate.name === name) || null;
    const tleStart = entry('tle-load-start');
    const dataReady = entry('satellite-data-ready');
    const gl = window.renderer?.getContext?.() || null;
    const debug = gl?.getExtension?.('WEBGL_debug_renderer_info');
    const heap = performance.memory ? {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
    } : null;
    return {
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      },
      startup: {
        tleLoadMs: tleStart && dataReady ? dataReady.timestamp - tleStart.timestamp : null,
        firstInteractiveMs: entry('first-interactive-ui')?.durationMs ?? null,
        objectCount: dataReady?.detail?.count ?? null
      },
      heap,
      webgl: gl ? {
        version: gl.getParameter(gl.VERSION),
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        drawingBufferWidth: gl.drawingBufferWidth,
        drawingBufferHeight: gl.drawingBufferHeight
      } : null
    };
  });
}

async function collectConjunctionLayoutEvidence(page, profile) {
  await page.setViewportSize({ width: profile.width, height: profile.height });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const metrics = await page.locator('#controlsContainer').evaluate((controls, label) => {
    const content = controls.querySelector('#conjunctionContent');
    const controlsRect = controls.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const overflowingControls = [...content.querySelectorAll('input, select, button, output')]
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < contentRect.left - 1 || rect.right > contentRect.right + 1);
      })
      .map(element => element.id || element.tagName.toLowerCase());
    const selectedDetail = document.querySelector('#selectedSatelliteDetailPanel');
    const selectedDetailRect = selectedDetail?.getBoundingClientRect();
    const selectedDetailVisible = Boolean(selectedDetail && !selectedDetail.hidden && selectedDetailRect.width > 0);
    const detailOverlapsControls = selectedDetailVisible && !(
      selectedDetailRect.right <= controlsRect.left ||
      selectedDetailRect.left >= controlsRect.right ||
      selectedDetailRect.bottom <= controlsRect.top ||
      selectedDetailRect.top >= controlsRect.bottom
    );
    return {
      label,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      controlsLeft: controlsRect.left,
      controlsRight: controlsRect.right,
      contentClientWidth: content.clientWidth,
      contentScrollWidth: content.scrollWidth,
      overflowingControls,
      selectedDetailVisible,
      detailOverlapsControls
    };
  }, profile.label);
  expect(metrics.controlsLeft).toBeGreaterThanOrEqual(-1);
  expect(metrics.controlsRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.contentScrollWidth).toBeLessThanOrEqual(metrics.contentClientWidth + 1);
  expect(metrics.overflowingControls).toEqual([]);
  expect(metrics.detailOverlapsControls).toBe(false);
  return metrics;
}

function utcClockSeconds(text) {
  const match = /^(\d{2}):(\d{2}):(\d{2})\s+UTC/.exec(text);
  if (!match) throw new Error(`Unexpected UTC clock value: ${text}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

test('full-catalog browser job uses authenticated API and exposes partial coverage', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The authenticated full-catalog journey runs once on desktop Chromium.');
  const browserErrors = monitorBrowserErrors(page);
  let jobReads = 0;
  const observedRequests = [];

  await page.route('**/api/v1/**', async route => {
    const incoming = route.request();
    const url = new URL(incoming.url());
    const headers = incoming.headers();
    observedRequests.push({ method: incoming.method(), url: incoming.url(), headers });
    if (url.pathname === '/api/v1/capabilities') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          api_version: '1.0.0',
          full_catalog_screening: {
            enabled: true,
            authenticated: true,
            worker_running: true,
            current_catalog_revision_id: 'catalog:test-browser',
            maturity: 'Experimental',
            safety_class: 'non-operational',
            collision_probability: 'UNAVAILABLE'
          }
        })
      });
      return;
    }
    if (url.pathname === '/api/v1/screening-jobs' && incoming.method() === 'POST') {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'job-browser-v21',
          state: 'QUEUED',
          request: JSON.parse(incoming.postData() || '{}'),
          progress_fraction: 0
        })
      });
      return;
    }
    if (url.pathname === '/api/v1/screening-jobs/job-browser-v21/stream') {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'id: 11\nevent: job.progress\ndata: {"fraction":0.75,"stage":"REFINING_SLAB"}\n\n',
          'id: 12\nevent: job.state\ndata: {"state":"SUCCEEDED"}\n\n'
        ].join('')
      });
      return;
    }
    if (url.pathname === '/api/v1/screening-jobs/job-browser-v21') {
      jobReads += 1;
      const complete = jobReads > 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(complete ? {
          job_id: 'job-browser-v21',
          state: 'SUCCEEDED',
          progress_fraction: 1,
          progress_stage: 'PARTIAL',
          request: { configuration: { max_results: 100 } },
          result: {
            event_count: 2,
            summary: {
              status: 'PARTIAL',
              statistics: { pair_intervals_unscreened: 1492127 }
            }
          }
        } : {
          job_id: 'job-browser-v21',
          state: 'RUNNING',
          progress_fraction: 0.25,
          progress_stage: 'SCREENING_SLAB'
        })
      });
      return;
    }
    if (url.pathname === '/api/v1/conjunction-events') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              event_revision_id: 'event-browser-1',
              job_id: 'job-browser-v21',
              object_a_id: 'obx:norad:25544',
              object_b_id: 'obx:norad:99999',
              tca_utc: '2026-07-20T12:05:00Z',
              miss_distance_km: 1.25,
              relative_speed_km_s: 12.5
            },
            {
              event_revision_id: 'event-browser-2',
              job_id: 'job-browser-v21',
              object_a_id: 'obx:norad:25544',
              object_b_id: 'obx:norad:99999',
              tca_utc: '2026-07-20T12:10:00Z',
              miss_distance_km: 2.5,
              relative_speed_km_s: 10.25
            }
          ],
          next_cursor: null
        })
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/problem+json', body: '{}' });
  });

  await bootWithLocalDependencies(page, { catalogFixture: MOBILE_CONJUNCTION_CATALOG });
  await page.locator('#conjunctionAccordionHeader').click();
  await expect(page.locator('#fullCatalogWorkspace')).toBeVisible();
  await expect(page.locator('.full-catalog-safety-note')).toContainText('Experimental and non-operational');
  await expect(page.locator('.full-catalog-safety-note')).toContainText('Collision probability is unavailable');
  await expect(page.locator('#fullCatalogCapabilityBadge')).toHaveText('Ready');

  const fullRun = page.getByRole('button', { name: 'Start Full-Catalog Job', exact: true });
  await expect(fullRun).toBeDisabled();
  await page.getByLabel('Bearer token', { exact: true }).fill('analyst-browser-test-token');
  await expect(fullRun).toBeEnabled();
  await fullRun.click();

  await expect(page.locator('#fullCatalogJobState')).toHaveText('SUCCEEDED');
  await expect(page.locator('#fullCatalogCoverage')).toContainText('Partial');
  await expect(page.locator('#fullCatalogCoverage')).toContainText('1,492,127 unscreened');
  await expect(page.locator('#fullCatalogStatus')).toContainText('partial coverage');
  await expect(page.locator('#fullCatalogResultRows tr')).toHaveCount(2);
  await expect(page.locator('#fullCatalogResultsStatus')).toContainText('2 events loaded');

  const submitted = observedRequests.find(item =>
    item.method === 'POST' && new URL(item.url).pathname === '/api/v1/screening-jobs'
  );
  expect(submitted?.headers.authorization).toBe('Bearer analyst-browser-test-token');
  expect(submitted?.headers['idempotency-key']).toMatch(/^browser-/);
  expect(observedRequests.every(item => !item.url.includes('analyst-browser-test-token'))).toBe(true);
  expect(observedRequests.every(item => !new URL(item.url).searchParams.has('access_token'))).toBe(true);

  const layout = await page.locator('#fullCatalogWorkspace').evaluate(workspace => ({
    workspaceWidth: workspace.getBoundingClientRect().width,
    workspaceScrollWidth: workspace.scrollWidth,
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth
  }));
  expect(layout.workspaceScrollWidth).toBeLessThanOrEqual(layout.workspaceWidth + 1);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  const menuGeometry = await page.evaluate(() => {
    const controls = document.querySelector('#controlsContainer')?.getBoundingClientRect();
    const toggle = document.querySelector('#menuToggleBtn')?.getBoundingClientRect();
    return controls && toggle ? {
      controlsWidth: controls.width,
      controlsRight: controls.right,
      toggleLeft: toggle.left,
      overlap: !(
        toggle.right <= controls.left || toggle.left >= controls.right ||
        toggle.bottom <= controls.top || toggle.top >= controls.bottom
      )
    } : null;
  });
  expect(menuGeometry?.controlsWidth).toBeGreaterThanOrEqual(370);
  expect(menuGeometry?.toggleLeft).toBeGreaterThanOrEqual((menuGeometry?.controlsRight || 0) + 8);
  expect(menuGeometry?.overlap).toBe(false);
  const accessibility = await new AxeBuilder({ page })
    .include('#fullCatalogWorkspace')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
  expectNoBrowserErrors(browserErrors);
  await testInfo.attach('v2.1-full-catalog-development', {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png'
  });
});

test('selected satellite screening runs in a Worker and renders a conjunction event', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The full catalog screen runs once on the desktop profile.');
  test.setTimeout(240_000);
  const browserErrors = monitorBrowserErrors(page);
  const satelliteRuntimeRequests = [];
  const threeRuntimeRequests = [];
  const wallStartedAt = Date.now();
  page.on('request', request => {
    if (request.url().includes('satellite.js')) satelliteRuntimeRequests.push(request.url());
    if (request.url().includes('/three/0.184.0/')) threeRuntimeRequests.push(request.url());
  });
  await bootWithLocalDependencies(page);
  const dependencySources = await page.evaluate(() => window.openbexiDependencySources);
  expect(dependencySources.satelliteUrl).toContain('/vendor/satellite.js/6.0.2/satellite.min.js');
  expect(dependencySources.threeCoreUrl).toContain('/vendor/three/0.184.0/build/three.module.js');
  expect(dependencySources.threeAddonsUrl).toContain('/vendor/three/0.184.0/examples/jsm/');
  const beforeScreening = await collectBrowserEvidence(page);

  const issShortcut = page.locator('#selectIssButton');
  await expect(issShortcut).toBeEnabled({ timeout: 30_000 });
  await issShortcut.click();

  const conjunctionHeader = page.locator('#conjunctionAccordionHeader');
  await expect(conjunctionHeader).toHaveAttribute('role', 'button');
  await expect(conjunctionHeader).toHaveAttribute('aria-controls', 'conjunctionContent');
  await expect(conjunctionHeader).toHaveAttribute('aria-expanded', 'false');
  await conjunctionHeader.focus();
  await expect(conjunctionHeader).toBeFocused();
  await conjunctionHeader.press('Enter');
  await expect(conjunctionHeader).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#conjunctionContent')).toBeVisible();
  await expect(page.locator('#conjunctionPrimarySummary')).toContainText('ISS');
  await expect(page.locator('#conjunctionCatalogSummary')).toContainText(/[\d,]+ (accepted|records)/);

  const runButton = page.getByRole('button', { name: 'Run Screen', exact: true });
  const cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });
  const exportButton = page.getByRole('button', { name: 'Export JSON', exact: true });
  await expect(page.getByLabel('Start UTC', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Duration (hours)', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Coarse step (seconds)', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Screening radius (km)', { exact: true })).toBeVisible();
  await expect(page.getByLabel('TCA tolerance (seconds)', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Result limit', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Screening progress', { exact: true })).toHaveAttribute('max', '100');
  await expect(page.locator('#conjunctionStatus')).toHaveAttribute('role', 'status');
  await expect(page.locator('#conjunctionStatus')).toHaveAttribute('aria-live', 'polite');
  await expect(runButton).toBeEnabled();
  await expect(cancelButton).toBeDisabled();
  await expect(exportButton).toBeDisabled();

  const configuredInputs = await setScreeningInputs(page, {
    conjunctionDurationHours: '1',
    conjunctionCoarseStepSeconds: '300',
    conjunctionScreeningRadiusKm: '100',
    conjunctionRefinementToleranceSeconds: '1',
    conjunctionMaxResults: '10'
  });
  expect(configuredInputs).toEqual({
    conjunctionDurationHours: '1',
    conjunctionCoarseStepSeconds: '300',
    conjunctionScreeningRadiusKm: '100',
    conjunctionRefinementToleranceSeconds: '1',
    conjunctionMaxResults: '10'
  });
  await runButton.focus();
  await expect(runButton).toBeFocused();
  await startResponsivenessMonitor(page);
  await runButton.press('Enter');

  await expect(cancelButton).toBeEnabled();
  await expect(page.locator('#conjunctionStatus')).toContainText('close approach', { timeout: 150_000 });
  const responsiveness = await stopResponsivenessMonitor(page);
  const statusText = await page.locator('#conjunctionStatus').innerText();
  await expect(page.locator('#conjunctionProgress')).toHaveJSProperty('value', 100);
  await expect(exportButton).toBeEnabled();

  const rows = page.locator('#conjunctionResultRows tr');
  expect(await rows.count()).toBeGreaterThan(0);
  const cameraBeforeEvent = await page.evaluate(() => window.camera.position.toArray());
  await rows.first().evaluate(row => row.click());
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#conjunctionEventDetails')).toBeVisible();
  await expect(page.locator('#conjunctionEventMetrics')).toContainText('Collision probability');
  await expect(page.locator('#conjunctionEventMetrics')).toContainText('Unavailable');
  const eventShareUrl = new URL(await page.locator('#shareLinkOutput').inputValue());
  expect(eventShareUrl.searchParams.get('conjEvent')).toMatch(/^conjunction:/);
  expect(eventShareUrl.searchParams.get('conjRequest')).toMatch(/^screen:/);
  await page.waitForTimeout(1_100);
  const cameraAfterEvent = await page.evaluate(() => window.camera.position.toArray());
  const cameraTravel = Math.hypot(...cameraAfterEvent.map((value, index) => value - cameraBeforeEvent[index]));
  expect(cameraTravel).toBeGreaterThan(0.001);
  const clockAtTca = utcClockSeconds(await page.locator('#utcClockDisplay').innerText());

  await page.locator('#conjunctionPlaybackOffset').evaluate(input => {
    input.value = '30';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#conjunctionPlaybackOffsetValue')).toHaveText('+30s');
  await page.waitForTimeout(600);
  const clockAfterPlayback = utcClockSeconds(await page.locator('#utcClockDisplay').innerText());
  expect((clockAfterPlayback - clockAtTca + 86_400) % 86_400).toBe(30);

  const canvasState = await sampleConjunctionCanvas(page);
  expect(canvasState.hasContext).toBe(true);
  expect(canvasState.glError).toBe(0);
  expect(canvasState.width).toBeGreaterThan(0);
  expect(canvasState.height).toBeGreaterThan(0);
  expect(canvasState.sampleWidth).toBeLessThanOrEqual(384);
  expect(canvasState.sampleHeight).toBeLessThanOrEqual(256);
  expect(canvasState.nonBlankPixels).toBeGreaterThan(0);
  expect(canvasState.eventColorPixels).toBeGreaterThan(0);
  expect(responsiveness?.intervalTicks).toBeGreaterThan(1);
  expect(responsiveness?.rafFrames).toBeGreaterThan(1);
  expect(responsiveness?.distinctProgressValues).toBeGreaterThan(1);
  expect(responsiveness?.maxIntervalGapMs).toBeLessThanOrEqual(2_500);
  expect(satelliteRuntimeRequests.some(url => url.endsWith('/vendor/satellite.js/6.0.2/satellite.es.js'))).toBe(true);
  expect(satelliteRuntimeRequests.some(url => url.includes('/node_modules/satellite.js/'))).toBe(false);
  expect(threeRuntimeRequests.some(url => url.endsWith('/vendor/three/0.184.0/build/three.module.js'))).toBe(true);
  expect(threeRuntimeRequests.some(url => url.endsWith('/vendor/three/0.184.0/examples/jsm/controls/OrbitControls.js'))).toBe(true);
  expect(statusText).toContain('partial result');
  expect(statusText).toContain('state propagations failed');
  expectNoBrowserErrors(browserErrors);

  const afterScreening = await collectBrowserEvidence(page);
  const evidence = {
    profile: testInfo.project.name,
    statusText,
    wallDurationMs: Date.now() - wallStartedAt,
    startup: beforeScreening.startup,
    responsiveness,
    heapApproximateNonPortable: {
      beforeScreening: beforeScreening.heap,
      afterScreening: afterScreening.heap
    },
    viewport: beforeScreening.viewport,
    userAgent: beforeScreening.userAgent,
    webgl: afterScreening.webgl,
    canvasReadback: {
      durationMs: canvasState.readbackDurationMs,
      sampleWidth: canvasState.sampleWidth,
      sampleHeight: canvasState.sampleHeight,
      nonBlankPixels: canvasState.nonBlankPixels,
      eventColorPixels: canvasState.eventColorPixels
    }
  };
  await testInfo.attach('v2-browser-performance-evidence', {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: 'application/json'
  });
  console.log(`[v2-browser-evidence] ${JSON.stringify(evidence)}`);
});

test('mobile conjunction workflow screens, renders, and fits without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'This workflow targets the mobile profile.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  await bootWithLocalDependencies(page, { catalogFixture: MOBILE_CONJUNCTION_CATALOG });
  await expect(page.locator('#selectIssButton')).toBeEnabled();
  await page.locator('#selectIssButton').click();
  await expect(page.locator('#conjunctionAccordionHeader')).toBeVisible();
  await page.locator('#conjunctionAccordionHeader').click();
  await expect(page.locator('#conjunctionContent')).toBeVisible();
  await expect(page.locator('#conjunctionPrimarySummary')).toContainText('ISS');
  await setScreeningInputs(page, {
    conjunctionDurationHours: '1',
    conjunctionCoarseStepSeconds: '300',
    conjunctionScreeningRadiusKm: '1',
    conjunctionRefinementToleranceSeconds: '1',
    conjunctionMaxResults: '10'
  });
  await expect(page.locator('#conjunctionRunButton')).toBeEnabled();
  await page.locator('#conjunctionRunButton').click();
  await expect(page.locator('#conjunctionStatus')).toContainText('close approach', { timeout: 30_000 });
  const rows = page.locator('#conjunctionResultRows tr');
  const eventRowCount = await rows.count();
  expect(eventRowCount).toBeGreaterThan(0);
  await rows.first().click();
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true');
  await page.locator('#conjunctionPlaybackOffset').evaluate(input => {
    input.value = '30';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#conjunctionPlaybackOffsetValue')).toHaveText('+30s');
  const canvasState = await sampleConjunctionCanvas(page);
  expect(canvasState.hasContext).toBe(true);
  expect(canvasState.glError).toBe(0);
  expect(canvasState.nonBlankPixels).toBeGreaterThan(0);
  expect(canvasState.eventColorPixels).toBeGreaterThan(0);
  const layoutEvidence = await collectConjunctionLayoutEvidence(page, {
    label: 'Pixel 7', width: 412, height: 839
  });
  const accessibility = await new AxeBuilder({ page })
    .include('#conjunctionAccordionSection')
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  const seriousFindings = accessibility.violations.filter(violation =>
    violation.impact === 'serious' || violation.impact === 'critical'
  );
  expect(seriousFindings, JSON.stringify(seriousFindings, null, 2)).toEqual([]);
  await setScreeningInputs(page, { conjunctionScreeningRadiusKm: '2' });
  await expect(page.locator('#conjunctionStatus')).toContainText('Screening inputs changed');
  await expect(page.locator('#conjunctionExportButton')).toBeDisabled();
  await expect(page.locator('#conjunctionResults')).toBeHidden();
  await expect(page.locator('#conjunctionEventDetails')).toBeHidden();
  expectNoBrowserErrors(browserErrors);
  console.log(`[v2-mobile-layout-evidence] ${JSON.stringify({
    profile: testInfo.project.name,
    catalogFixture: 'two-object-colocated-valid-tle',
    eventRows: eventRowCount,
    canvasEventColorPixels: canvasState.eventColorPixels,
    layout: layoutEvidence
  })}`);
});

test('conjunction workspace reflows at named CSS widths', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Exact CSS viewport widths run once on desktop Chromium.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await bootWithLocalDependencies(page, { catalogFixture: MOBILE_CONJUNCTION_CATALOG });
  await page.locator('#selectIssButton').click();
  await page.locator('#conjunctionAccordionHeader').click();
  await setScreeningInputs(page, {
    conjunctionDurationHours: '1',
    conjunctionCoarseStepSeconds: '300',
    conjunctionScreeningRadiusKm: '1',
    conjunctionRefinementToleranceSeconds: '1',
    conjunctionMaxResults: '10'
  });
  await page.locator('#conjunctionRunButton').click();
  await expect(page.locator('#conjunctionStatus')).toContainText('close approach', { timeout: 30_000 });
  await page.locator('#conjunctionResultRows tr').first().click();

  const profiles = [];
  for (const profile of [
    { label: '320px mobile', width: 320, height: 720 },
    { label: '390px mobile', width: 390, height: 844 },
    { label: '768px tablet', width: 768, height: 1024 },
    { label: '768px browser at 200% zoom reflow equivalent', width: 384, height: 512 }
  ]) {
    const evidence = await collectConjunctionLayoutEvidence(page, profile);
    expect(evidence.viewportWidth).toBe(profile.width);
    profiles.push(evidence);
  }
  expectNoBrowserErrors(browserErrors);
  console.log(`[v2-responsive-layout-evidence] ${JSON.stringify({ profiles })}`);
});

test('invalid catalog is rejected with an explicit non-runnable state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The invalid-catalog journey runs once on desktop Chromium.');
  const browserErrors = monitorBrowserErrors(page);
  await bootWithLocalDependencies(page, { catalogFixture: INVALID_CONJUNCTION_CATALOG });
  await page.locator('#conjunctionAccordionHeader').click();
  await expect(page.locator('#conjunctionCatalogSummary')).toContainText('0 accepted');
  await expect(page.locator('#conjunctionCatalogSummary')).toContainText('1 rejected');
  await expect(page.locator('#conjunctionStatus')).toContainText('Catalog unavailable: no accepted objects');
  await expect(page.locator('#conjunctionRunButton')).toBeDisabled();
  await expect(page.locator('#selectIssButton')).toBeDisabled();
  expectNoBrowserErrors(browserErrors);
});
