import { expect, test } from '@playwright/test';

test('main application boots with local dependencies and a rendered WebGL canvas', async ({ page, request }) => {
  const pageErrors = [];
  const consoleErrors = [];
  const externalDependencyRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', request => {
    if (request.url().startsWith('https://unpkg.com/')) externalDependencyRequests.push(request.url());
  });

  const response = await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/Satellite Simulation/i);
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

  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  await expect(health.json()).resolves.toMatchObject({ status: 'ok' });
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(externalDependencyRequests).toEqual([]);
});

test('module graph failure produces a visible retry state instead of a black screen', async ({ page }) => {
  let failModuleOnce = true;
  await page.route('**/js/mercatorMapLoader.js', route => {
    if (failModuleOnce) {
      failModuleOnce = false;
      return route.abort('connectionreset');
    }
    return route.continue();
  });
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

  await page.getByRole('button', { name: 'Retry', exact: true }).click();
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
