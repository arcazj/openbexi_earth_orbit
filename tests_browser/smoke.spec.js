import { expect, test } from '@playwright/test';

const ENFORCE_TIMING_BUDGETS = process.env.OPENBEXI_ENFORCE_TIMING_BUDGETS === '1';

test('main application boots with local dependencies and a rendered WebGL canvas', async ({ page, request }, testInfo) => {
  test.setTimeout(90_000);
  const pageErrors = [];
  const consoleErrors = [];
  const requestFailures = [];
  const externalDependencyRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', request => {
    if (request.url().startsWith('https://unpkg.com/')) externalDependencyRequests.push(request.url());
  });
  page.on('requestfailed', request => {
    requestFailures.push({
      url: request.url(),
      errorText: request.failure()?.errorText || 'unknown network error'
    });
  });

  const response = await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/OpenBEXI Earth Orbit - Tracked Objects/i);
  await expect(page.locator('#menuToggleBtn')).toBeVisible();
  await expect(page.locator('#controlsContainer')).toBeVisible();

  await page.waitForFunction(() => {
    const sources = window.openbexiDependencySources;
    return sources?.three === 'local' && sources?.satellite === 'local';
  });
  await expect.poll(() => page.evaluate(() => window.openbexiStartupState?.phase)).toBe('module-loaded');

  const canvas = page.locator('body > canvas:not(#mercatorCanvas)').first();
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => (
    window.openbexiStartupPerformance
      ?.summary()
      .some(entry => entry.name === 'first-visible-globe-render')
  ));
  await expect.poll(() => page.evaluate(() => window.openbexiStartupState?.phase)).toBe('module-loaded');

  const canvasState = await canvas.evaluate(element => {
    const gl = element.getContext('webgl2') || element.getContext('webgl');
    if (!gl) return { hasContext: false, coloredSamples: 0, width: 0, height: 0 };
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(4);
    let coloredSamples = 0;
    for (let yIndex = 1; yIndex <= 5; yIndex += 1) {
      for (let xIndex = 1; xIndex <= 5; xIndex += 1) {
        const x = Math.floor(width * xIndex / 6);
        const y = Math.floor(height * yIndex / 6);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        if (pixels[3] > 0 && pixels[0] + pixels[1] + pixels[2] > 12) coloredSamples += 1;
      }
    }
    return { hasContext: true, coloredSamples, width, height };
  });

  expect(canvasState.hasContext).toBe(true);
  expect(canvasState.width).toBeGreaterThan(0);
  expect(canvasState.height).toBeGreaterThan(0);
  expect(canvasState.coloredSamples).toBeGreaterThan(0);

  await page.waitForFunction(() => {
    const simulation = window.openbexiSimulation;
    const startup = window.openbexiStartupPerformance?.summary?.() || [];
    return startup.some(entry => entry.name === 'default-meo-visible') &&
      simulation?.snapshot?.().drawnNoradIds?.includes('24876') &&
      simulation.markerState('24876')?.radius > 6.4;
  }, null, { timeout: 20_000 });
  const progressiveStartup = await page.evaluate(() => {
    const entries = window.openbexiStartupPerformance.summary();
    const byName = name => entries.find(entry => entry.name === name) || null;
    const snapshot = window.openbexiSimulation.snapshot();
    return {
      defaultMeo: byName('default-meo-visible'),
      visibleCount: snapshot.visibleNoradIds.length,
      drawnCount: snapshot.drawnNoradIds.length,
      unreadyVisibleCount: snapshot.unreadyVisibleNoradIds.length,
      visibleOriginCount: snapshot.visibleOriginNoradIds.length
    };
  });
  expect(progressiveStartup.defaultMeo?.durationMs).toBeLessThan(12_000);
  expect(progressiveStartup.visibleCount).toBeGreaterThan(100);
  expect(progressiveStartup.drawnCount).toBeGreaterThan(100);
  expect(progressiveStartup.unreadyVisibleCount).toBe(0);
  expect(progressiveStartup.visibleOriginCount).toBe(0);
  const defaultMeoCloud = await page.evaluate(async () => {
    const diagnostics = (await import('/js/satelliteTLELoader.js')).getSatellitePointCloudDiagnostics();
    return {
      ...diagnostics,
      expectedNoradIds: [...window.openbexiSimulation.snapshot().drawnNoradIds].sort()
    };
  });
  expect(defaultMeoCloud.drawnCount).toBeGreaterThan(100);
  expect(defaultMeoCloud.matchedPositionCount).toBe(defaultMeoCloud.drawnCount);
  expect(defaultMeoCloud.uploadedNoradIds.toSorted()).toEqual(defaultMeoCloud.expectedNoradIds);
  expect(defaultMeoCloud.uploadedNoradIds).toContain('24876');
  const expectedDefaultMarkerMode = defaultMeoCloud.drawnCount < 500 ? 'detailed' : 'density';
  expect(defaultMeoCloud.markerMode).toBe(expectedDefaultMarkerMode);
  if (expectedDefaultMarkerMode === 'detailed') {
    expect(defaultMeoCloud.pointSize).toBeGreaterThan(0.025);
  } else {
    expect(defaultMeoCloud.pointSize).toBe(0.025);
  }

  await page.waitForFunction(() => window.openbexiStartupPerformance
    ?.summary()
    .some(entry => entry.name === 'first-interactive-ui'), null, { timeout: 25_000 });
  const completedStartup = await page.evaluate(() => {
    const entries = window.openbexiStartupPerformance.summary();
    const byName = name => entries.find(entry => entry.name === name) || null;
    return {
      defaultMeoMs: byName('default-meo-visible')?.durationMs,
      catalogReadyMs: byName('satellite-data-ready')?.durationMs
    };
  });
  expect(completedStartup.catalogReadyMs).toBeLessThan(20_000);
  expect(completedStartup.defaultMeoMs).toBeLessThan(completedStartup.catalogReadyMs);

  await page.locator('#orbitTypeFilter [data-orbit-filter="ALL"]').click();
  await expect.poll(() => page.evaluate(() => window.openbexiSimulation.snapshot().visibleNoradIds.length))
    .toBeGreaterThan(16_000);
  await expect.poll(() => page.evaluate(() => window.openbexiSimulation.snapshot().drawnNoradIds.length), {
    timeout: 12_000
  }).toBeGreaterThan(500);
  const allMarkerSafety = await page.evaluate(() => {
    const snapshot = window.openbexiSimulation.snapshot();
    return {
      unreadyVisibleCount: snapshot.unreadyVisibleNoradIds.length,
      visibleOriginCount: snapshot.visibleOriginNoradIds.length
    };
  });
  expect(allMarkerSafety).toEqual({ unreadyVisibleCount: 0, visibleOriginCount: 0 });

  await expect.poll(() => page.evaluate(() => window.openbexiSimulation.snapshot().drawnNoradIds.length), {
    timeout: 30_000
  }).toBeGreaterThan(16_000);
  const pointCloud = await page.evaluate(async () => {
    const diagnostics = (await import('/js/satelliteTLELoader.js')).getSatellitePointCloudDiagnostics();
    return {
      ...diagnostics,
      expectedNoradIds: [...window.openbexiSimulation.snapshot().drawnNoradIds].sort()
    };
  });
  expect(pointCloud.drawnCount).toBeGreaterThan(16_000);
  expect(pointCloud.matchedPositionCount).toBe(pointCloud.drawnCount);
  expect(pointCloud.uploadedNoradIds.toSorted()).toEqual(pointCloud.expectedNoradIds);
  expect(pointCloud.markerMode).toBe('density');
  expect(pointCloud.pointSize).toBe(0.025);
  await page.locator('#viewMercatorToggle').check();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#mercatorCanvas');
    return canvas?.dataset.markerMode === 'density' && Number(canvas.dataset.renderedMarkerCount) > 16_000;
  });
  const densityCanvas = await page.locator('#mercatorCanvas').evaluate(canvas => {
    const ctx = canvas.getContext('2d');
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    let cyan = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] === 0) continue;
      colored += 1;
      if (pixels[offset] < 100 && pixels[offset + 1] > 120 && pixels[offset + 2] > 150) cyan += 1;
    }
    return { colored, cyanRatio: cyan / (canvas.width * canvas.height) };
  });
  expect(densityCanvas.colored).toBeGreaterThan(0);
  expect(densityCanvas.cyanRatio).toBeGreaterThan(0);
  expect(densityCanvas.cyanRatio).toBeLessThan(0.45);

  const frameGaps = await page.evaluate(() => new Promise(resolve => {
    const gaps = [];
    let prior = null;
    const collect = timestamp => {
      if (prior !== null) gaps.push(timestamp - prior);
      prior = timestamp;
      if (gaps.length >= 30) resolve(gaps);
      else requestAnimationFrame(collect);
    };
    requestAnimationFrame(collect);
  }));
  const sortedFrameGaps = frameGaps.toSorted((a, b) => a - b);
  const frameTiming = {
    p95FrameGapMs: sortedFrameGaps[Math.floor(sortedFrameGaps.length * 0.95)],
    maximumFrameGapMs: Math.max(...sortedFrameGaps),
    timingBudgetEnforced: ENFORCE_TIMING_BUDGETS
  };
  console.log(`[full-catalog-density-frame-cadence] ${JSON.stringify(frameTiming)}`);
  await testInfo.attach('full-catalog-density-frame-cadence', {
    body: JSON.stringify(frameTiming, null, 2),
    contentType: 'application/json'
  });
  if (ENFORCE_TIMING_BUDGETS) {
    expect(frameTiming.p95FrameGapMs).toBeLessThanOrEqual(150);
    expect(frameTiming.maximumFrameGapMs).toBeLessThanOrEqual(200);
  }
  await testInfo.attach('full-catalog-density-render', {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png'
  });

  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ status: 'ok' });
  if (requestFailures.length > 0) {
    await testInfo.attach('request-failures', {
      body: JSON.stringify(requestFailures, null, 2),
      contentType: 'application/json'
    });
  }
  expect(pageErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(externalDependencyRequests).toEqual([]);
});

test('module graph failure produces a visible retry state instead of a black screen', async ({ page }) => {
  let failModuleOnce = true;
  const modulePattern = '**/js/mercatorMapLoader.js';
  const failModule = route => {
    if (failModuleOnce) {
      failModuleOnce = false;
      return route.abort('connectionreset');
    }
    return route.continue();
  };
  await page.route(modulePattern, failModule);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Application failed to start.');
  await expect(alert).toHaveAttribute('data-error-code', 'STARTUP_FAILED');
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(page.locator('#startupFailure')).not.toHaveAttribute('hidden', '');
  await expect.poll(() => page.evaluate(() => window.openbexiStartupState)).toEqual({
    phase: 'error',
    errorCode: 'STARTUP_FAILED'
  });

  await page.unroute(modulePattern, failModule);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.clearBrowserCache');
  await cdp.detach();
  await page.getByRole('button', { name: 'Retry', exact: true }).click({ noWaitAfter: true });
  await page.waitForFunction(() => (
    window.openbexiStartupPerformance
      ?.summary()
      .some(entry => entry.name === 'first-visible-globe-render')
  ));
  const recoveredCanvas = page.locator('body > canvas:not(#mercatorCanvas)').first();
  await expect(recoveredCanvas).toBeVisible();
  const recoveredPixels = await recoveredCanvas.evaluate(element => {
    const gl = window.renderer?.getContext?.() || element.getContext('webgl2') || element.getContext('webgl');
    if (!gl) return 0;
    const pixel = new Uint8Array(4);
    let colored = 0;
    for (let y = 1; y <= 5; y += 1) for (let x = 1; x <= 5; x += 1) {
      gl.readPixels(Math.floor(gl.drawingBufferWidth * x / 6), Math.floor(gl.drawingBufferHeight * y / 6), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      if (pixel[3] > 0 && pixel[0] + pixel[1] + pixel[2] > 12) colored += 1;
    }
    return colored;
  });
  expect(recoveredPixels).toBeGreaterThan(0);
  await expect(alert).toBeHidden();
});
