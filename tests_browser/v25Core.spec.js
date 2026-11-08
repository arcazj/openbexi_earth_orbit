import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const playback = '**/data/ephemeris/solar_system_jpl_horizons_2020_2035_6h.json';
async function boot(page) {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.openbexiSimulation);
    await expect(page.locator('#satelliteSearchInput')).toBeEnabled({ timeout: 60000 });
}

test('core journey: lazy playback, search, keyboard health, views, dates and restoration', async ({ page }, testInfo) => {
    // Full-density mobile software rendering can exhaust the shared journey
    // budget before Solar System opens. Performance targets are measured separately.
    test.setTimeout(testInfo.project.name === 'mobile-chromium' ? 240000 : 150000);
    const requests = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('_2020_2035_6h.json')) requests.push(request.url()); });
    await boot(page);
    expect(requests).toHaveLength(0);
    const search = page.locator('#satelliteSearchInput');
    await page.getByRole('button', { name: 'ALL', exact: true }).first().click();
    await search.fill('25544');
    const match = page.locator('#satelliteSearchResults [data-norad-id="25544"]');
    await expect(match).toBeVisible({ timeout: 60000 });
    await search.press('ArrowDown'); await search.press('Enter');
    await expect.poll(() => page.evaluate(() => window.openbexiSimulation.snapshot().selectedNoradId)).toBe('25544');
    const selectedQuery = await search.inputValue();
    await expect(page.locator('#dataRefreshSummary')).not.toBeEmpty();
    const summary = page.locator('#dataHealthDetails > summary');
    await summary.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#dataHealthRows h3')).toHaveCount(6);
    await expect(page.locator('#dataHealthRows')).toContainText('Successful check');
    await page.keyboard.press('Tab');
    await expect(page.locator('.data-health-panel')).toBeFocused();
    await page.keyboard.press('PageDown');
    // Trace capture on software-rendered mobile can delay the response even
    // after the keyboard scroll has visibly completed; retain the actual assertion.
    await expect.poll(() => page.locator('.data-health-panel').evaluate(element => element.scrollTop), { timeout: 60000 }).toBeGreaterThan(0);
    await page.screenshot({ path: `runtime/v25-health-${test.info().project.name}.png` });
    const scan = await new AxeBuilder({ page }).include('#dataRefreshStatus').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(scan.violations).toEqual([]);
    await summary.focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.data-health-panel')).toBeHidden();
    await page.locator('#viewAccordionHeader').click();
    await page.locator('#viewMercatorToggle').check();
    await expect(page.locator('#mercatorContainer')).toBeVisible();
    const before = await page.evaluate(() => window.openbexiSimulation.snapshot());
    await page.locator('#solarSystemOverviewToggle').check();
    await expect(page.locator('#solarDate')).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('#solarEducational')).not.toBeChecked();
    await page.locator('#solarDate').fill('2024-02-29T12:00');
    await page.locator('#solarDate').press('Tab');
    await expect.poll(() => page.evaluate(() => window.openbexiSimulation.snapshot().dateUtc)).toBe('2024-02-29T12:00:00.000Z');
    await expect(page.locator('#solarOrbitGuideStatus')).toContainText('one revolution', { timeout: 60000 });
    await page.locator('#solarSystemExitButton').click();
    await expect(page.locator('#viewMercatorToggle')).toBeChecked();
    await expect(search).toHaveValue(selectedQuery);
    const restored = await page.evaluate(() => window.openbexiSimulation.snapshot());
    expect(restored.dateUtc).toBe(before.dateUtc);
    await page.locator('#solarSystemOverviewToggle').check();
    await expect(page.locator('#solarDate')).toBeEnabled();
    expect(requests).toHaveLength(1);
    expect(errors).toEqual([]);
});

test('failed playback load preserves the clock and recovers with retry', async ({ page }) => {
    test.setTimeout(120000);
    await page.route(playback, route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await boot(page);
    await page.locator('#viewAccordionHeader').click();
    await page.locator('#solarSystemOverviewToggle').check();
    await expect(page.locator('#solarDate')).toBeDisabled();
    await expect.poll(() => page.evaluate(() => window.openbexiSimulation.snapshot().ephemerisMode)).toBe('Precise positions unavailable');
    await page.unroute(playback);
    const time = await page.evaluate(() => window.openbexiSimulation.snapshot().dateUtc);
    await page.locator('#solarDataRetry').click();
    await expect(page.locator('#solarDate')).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('#solarEducational')).not.toBeChecked();
    expect(await page.evaluate(() => window.openbexiSimulation.snapshot().dateUtc)).toBe(time);
});

test('accepted revision refresh preserves the view and unchanged polls reuse catalogs', async ({ page, request }) => {
    test.setTimeout(120000);
    const statusResponse = await request.get('/api/data-update-status');
    expect(statusResponse.ok()).toBe(true);
    const status = await statusResponse.json();
    let revision = status.data_revision, launches = 0;
    await page.route('**/api/data-update-status', route => route.fulfill({ json: {
        ...status, data_revision: revision,
        launch_revision: revision === status.data_revision ? status.launch_revision : 'sha256:' + 'b'.repeat(64)
    } }));
    page.on('request', value => { if (new URL(value.url()).pathname === '/api/launches') launches++; });
    await boot(page);
    await expect.poll(() => page.evaluate(async () => {
        if (!window.openbexiServerConnection?.connected) return null;
        return (await window.openbexiServerConnection.checkForDataUpdates()).revision;
    })).toBe(status.data_revision);
    await page.locator('#satelliteSearchInput').fill('24876');
    const match = page.locator('#satelliteSearchResults [data-norad-id="24876"]');
    const focusStarted = page.waitForEvent('console', { predicate: message => message.text().startsWith('[camera] Selected satellite observer target') });
    await expect(match).toBeVisible(); await match.click();
    await expect.poll(() => page.evaluate(() => window.openbexiSimulation.snapshot().selectedNoradId)).toBe('24876');
    await focusStarted;
    await page.waitForFunction(() => window.openbexiSimulation.snapshot().cameraTransitionActive === false);
    await page.evaluate(() => window.openbexiServerConnection.checkForDataUpdates());
    const before = await page.evaluate(() => window.openbexiSimulation.snapshot());
    const count = launches;
    await page.evaluate(() => window.openbexiServerConnection.checkForDataUpdates());
    expect(launches).toBe(count);
    revision = 'v25-fixture:accepted-new-launch-revision';
    await page.evaluate(() => window.openbexiServerConnection.checkForDataUpdates());
    await expect.poll(() => launches).toBeGreaterThan(count);
    const after = await page.evaluate(() => window.openbexiSimulation.snapshot());
    expect(after.selectedNoradId).toBe(before.selectedNoradId);
    expect(after.orbitTypeFilter).toEqual(before.orbitTypeFilter);
    expect(after.objectTypeFilter).toEqual(before.objectTypeFilter);
    expect(after.dateUtc).toBe(before.dateUtc);
    // OrbitControls can recompute a resting vector by a few floating-point
    // ulps (observed in WebKit). This allowance is far below a visible move.
    for (const key of ['cameraPosition', 'cameraTarget']) {
        after[key].forEach((value, axis) => expect(value).toBeCloseTo(before[key][axis], 10));
    }
});
