import { expect, test } from '@playwright/test';

async function openSolar(page) {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.openbexiSimulation);
    await page.locator('#viewAccordionHeader').click();
    await page.locator('#solarSystemOverviewToggle').check();
    await expect(page.locator('#solarDate')).toBeEnabled({ timeout: 60000 });
}
const snapshot = page => page.evaluate(() => window.openbexiSimulation.snapshot());
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));

test('Solar System modes, UTC scrubber, following and legacy restoration', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openSolar(page);
    await expect(page.locator('#solarEducational')).not.toBeChecked();
    await expect(page.locator('#solarCoverage')).toContainText('Precise');
    await expect(page.locator('#trackedCoverageHud')).toBeHidden();
    await page.locator('#solarDate').fill('2026-06-07T09:00');
    await page.locator('#solarDate').press('Tab');
    await expect.poll(async () => (await snapshot(page)).dateUtc).toBe('2026-06-07T09:00:00.000Z');
    const neptune = await page.evaluate(() => window.openbexiSimulation.planetPosition('Neptune'));
    expect(neptune.every(Number.isFinite)).toBe(true);
    await page.locator('#solarPlanetFocus').selectOption('Earth');
    const before = await snapshot(page);
    await page.locator('#solarStepForward').click();
    const after = await snapshot(page);
    expect(after.timeMs - before.timeMs).toBe(86400000);
    const offsetBefore = before.cameraPosition.map((value, i) => value - before.cameraTarget[i]);
    const offsetAfter = after.cameraPosition.map((value, i) => value - after.cameraTarget[i]);
    expect(distance(offsetBefore, offsetAfter)).toBeLessThan(1e-6);
    expect(distance(before.cameraTarget, after.cameraTarget)).toBeGreaterThan(0.01);
    await page.locator('#solarRange').selectOption('custom');
    await page.locator('#solarRangeStart').fill('2026-01-01');
    await page.locator('#solarRangeEnd').fill('2027-01-01');
    await page.locator('#solarRangeEnd').press('Tab');
    await page.locator('#solarScrubber').fill('0');
    await expect.poll(async () => (await snapshot(page)).dateUtc).toBe('2026-01-01T00:00:00.000Z');
    await page.locator('#solarScrubber').fill('10000');
    await expect.poll(async () => (await snapshot(page)).dateUtc).toBe('2027-01-01T00:00:00.000Z');
    await page.locator('#solarEducational').check();
    await page.locator('#solarDate').fill('2500-01-01T00:00');
    await page.locator('#solarDate').press('Tab');
    await expect.poll(async () => (await snapshot(page)).educational).toBe(true);
    expect((await snapshot(page)).dateUtc).toBe('2500-01-01T00:00:00.000Z');
    await page.locator('#solarTimeUnit').selectOption('year');
    await page.locator('#timeWarpSlider').fill('-1');
    await expect.poll(async () => (await snapshot(page)).timeMs).toBeLessThan(Date.parse('2500-01-01'));
    await page.locator('#timeWarpPause').click();
    expect((await snapshot(page)).rate).toBe(0);
    await page.locator('#solarEducational').uncheck();
    await expect.poll(async () => (await snapshot(page)).dateUtc).toBe('2035-12-31T00:00:00.000Z');
    expect((await snapshot(page)).rate).toBe(0);
    await page.locator('#timeWarpNow').click();
    expect(Math.abs((await snapshot(page)).timeMs - Date.now())).toBeLessThan(3000);
    await expect(page.locator('#solarRangeStart')).toHaveValue('2026-01-01');
    await expect(page.locator('#solarRangeEnd')).toHaveValue('2027-01-01');
    await expect(page.locator('#solarRangeLabel')).toContainText('2026-01-01');
    await page.setViewportSize({ width: 390, height: 844 });
    const inputBounds = await page.locator('#solarDate').boundingBox();
    expect(inputBounds.x).toBeGreaterThanOrEqual(0);
    expect(inputBounds.x + inputBounds.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: 'runtime/solar-system-mobile.png' });
    await page.locator('#solarSystemExitButton').click();
    await expect.poll(async () => (await snapshot(page)).solarSystemActive).toBe(false);
    expect((await snapshot(page)).millisecondsPerWarpSecond).toBe(1000);
    expect((await snapshot(page)).live).toBe(true);
    expect(errors).toEqual([]);
});

test('full JPL guides span both playback edges, fit the viewport and stay cached', async ({ page }) => {
    test.setTimeout(120000);
    const requests = [];
    page.on('request', request => { if (request.url().includes('/ephemeris/orbits/')) requests.push(request.url()); });
    await openSolar(page);
    await expect(page.locator('#solarOrbitGuideStatus')).toContainText('one revolution', { timeout: 60000 });
    for (const input of ['2020-01-01T00:00', '2035-12-31T00:00']) {
        await page.locator('#solarDate').fill(input);
        await page.locator('#solarDate').press('Tab');
        const epoch = Date.parse(`${input}:00Z`);
        await expect.poll(() => page.evaluate(time => window.openbexiSimulation.orbitGuides().every(guide =>
            guide.completeRevolution && guide.type === 'Line' && Math.abs(guide.centerTimeMs - time) < 1000 &&
            guide.startTimeMs < time && guide.endTimeMs > time), epoch)).toBe(true);
        await expect(page.locator('#solarDate')).toHaveAttribute('min', '2020-01-01T00:00:00');
        await expect(page.locator('#solarDate')).toHaveAttribute('max', '2035-12-31T00:00:00');
    }
    await page.locator('#solarFitInner').click();
    const innerCamera = (await snapshot(page)).cameraPosition;
    await page.locator('#solarFitAll').click();
    expect(Math.hypot(...(await snapshot(page)).cameraPosition)).toBeGreaterThan(Math.hypot(...innerCamera) * 5);
    const assertFit = async () => {
        await expect.poll(() => page.evaluate(() => window.openbexiSimulation.orbitGuides().every(guide => {
            const b = guide.projectedBounds;
            return b.minX >= -1 && b.maxX <= 1 && b.minY >= -1 && b.maxY <= 1;
        }))).toBe(true);
    };
    await assertFit();
    await page.locator('#menuToggleBtn').click();
    await expect.poll(() => page.locator('#controlsContainer').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: 'runtime/jpl-complete-guides-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await assertFit();
    await page.screenshot({ path: 'runtime/jpl-complete-guides-mobile.png' });
    await page.locator('#menuToggleBtn').click();
    const loadedRequests = requests.length;
    await page.locator('#solarSystemExitButton').click();
    await expect(page.locator('#trackedCoverageHud')).toBeVisible();
    await page.locator('#solarSystemOverviewToggle').check();
    await expect(page.locator('#solarOrbitGuideStatus')).toContainText('one revolution');
    expect(requests.length).toBe(loadedRequests);
    expect(new Set(requests).size).toBe(9);
});

test('missing full guides leave precise playback available and identify partial arcs', async ({ page }) => {
    await page.route('**/data/ephemeris/orbits/**', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.goto('/SolarSystemOverview.html');
    await expect(page.locator('#solarDate')).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('#solarOrbitGuideStatus')).toContainText('available JPL arcs');
    await expect(page.locator('#solarEducational')).not.toBeChecked();
    expect(await page.evaluate(() => window.openbexiSolarSystem.orbitGuides().some(guide => guide.completeRevolution))).toBe(false);
    await page.locator('#solarEducational').check();
    await expect(page.locator('#solarOrbitGuideStatus')).toContainText('Educational');
});

test('standalone shares precise and educational playback', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/SolarSystemOverview.html');
    await expect(page.locator('#solarDate')).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('#planetCount')).toHaveText('8 + Moon');
    await page.locator('#solarPlanetFocus').selectOption('Neptune');
    await expect.poll(() => page.evaluate(() => window.openbexiSolarSystem.snapshot().live)).toBe(true);
    await page.locator('#timePause').click();
    await expect.poll(() => page.evaluate(() => window.openbexiSolarSystem.snapshot().rate)).toBe(0);
    await page.locator('#timePause').click();
    await expect.poll(() => page.evaluate(() => window.openbexiSolarSystem.snapshot().rate)).toBe(1);
    await page.locator('#timePause').click();
    await page.locator('#solarEducational').check();
    await page.locator('#solarDate').fill('1800-01-01T00:00');
    await page.locator('#solarDate').press('Tab');
    await expect.poll(() => page.evaluate(() => window.openbexiSolarSystem.snapshot().educational)).toBe(true);
    await page.screenshot({ path: 'runtime/solar-system-standalone.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    const panel = await page.locator('#hud').boundingBox();
    expect(panel.y).toBeGreaterThanOrEqual(56);
    expect(panel.x + panel.width).toBeLessThanOrEqual(390);
    expect(errors).toEqual([]);
});

test('missing precise data stays explicit and educational mode remains usable', async ({ page }) => {
    await page.route('**/data/ephemeris/*6h.json', route => route.abort());
    await page.goto('/SolarSystemOverview.html');
    await expect(page.locator('#solarCoverage')).toContainText('unavailable');
    await expect(page.locator('#solarDate')).toBeDisabled();
    await page.locator('#solarEducational').check();
    await expect(page.locator('#solarDate')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.openbexiSolarSystem.snapshot().mode)).toBe('Educational approximation');
});
