import { expect, test } from '@playwright/test';

const snapshot = page => page.evaluate(() => window.openbexiSimulation.snapshot());
const fixedUtc = new Date('2026-11-08T12:00:00Z');
// Change only wall UTC: real RAF/performance timing must remain native for the 1× assertion.
async function installUtc(page) {
    await page.addInitScript(epoch => {
        window.testUtc = epoch;
        Date.now = () => window.testUtc;
    }, +fixedUtc);
}
const setUtc = (page, epoch) => page.evaluate(value => { window.testUtc = value; }, epoch);

test('Live UTC, true 1×, accelerated units and Solar System return preserve clock intent', async ({ page }) => {
    test.setTimeout(150000);
    await installUtc(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.openbexiSimulation);
    expect(await snapshot(page)).toMatchObject({ live: true, rate: 1, speedMultiplier: 1, timeMs: +fixedUtc });
    await expect(page.locator('#timeWarpNow')).toHaveAttribute('aria-pressed', 'true');
    // A wall-clock jump models return from sleep without relying on background-tab throttling.
    await setUtc(page, +fixedUtc + 120000);
    await expect.poll(async () => (await snapshot(page)).timeMs).toBe(+fixedUtc + 120000);
    await page.locator('#timeWarpPause').click();
    expect(await snapshot(page)).toMatchObject({ live: false, rate: 0 });
    await setUtc(page, +fixedUtc + 180000);
    expect((await snapshot(page)).timeMs).toBe(+fixedUtc + 120000);
    await page.locator('#timeWarpPause').click();
    const samples = await page.evaluate(() => new Promise(resolve => {
        const frames = [];
        function collect(timestamp) {
            frames.push({ timestamp, timeMs: window.openbexiSimulation.snapshot().timeMs });
            if (frames.length === 12) resolve(frames); else requestAnimationFrame(collect);
        }
        requestAnimationFrame(collect);
    }));
    const elapsed = samples.at(-1).timestamp - samples[0].timestamp;
    expect(elapsed).toBeGreaterThan(0);
    if (Math.abs(samples.at(-1).timeMs - samples[0].timeMs - elapsed) >= 5) console.log('1x timing samples', JSON.stringify(samples));
    expect(Math.abs(samples.at(-1).timeMs - samples[0].timeMs - elapsed)).toBeLessThan(5);
    await page.locator('#timeWarpUnit').selectOption('60000');
    expect((await snapshot(page)).speedMultiplier).toBe(60);
    await expect(page.locator('#timeWarpVal')).toHaveText('1 min/s');
    await page.locator('#timeWarpNow').click();
    expect(await snapshot(page)).toMatchObject({ live: true, speedMultiplier: 1, timeMs: +fixedUtc + 180000 });
    await expect(page.locator('#timeWarpUnit')).toHaveValue('1000');
    await page.locator('#viewAccordionHeader').click();
    await page.locator('#solarSystemOverviewToggle').check();
    await expect(page.locator('#solarDate')).toBeEnabled({ timeout: 60000 });
    expect((await snapshot(page)).live).toBe(true);
    await expect(page.locator('#solarTimeUnit')).toHaveValue('second');
    await page.locator('#solarTimeUnit').selectOption('day');
    await expect(page.locator('#timeWarpVal')).toHaveText('1 day/s');
    expect((await snapshot(page)).speedMultiplier).toBe(86400);
    await page.locator('#solarDate').fill('2024-01-01T00:00');
    await page.locator('#solarDate').press('Tab');
    expect((await snapshot(page)).live).toBe(false);
    await page.locator('#solarSystemExitButton').click();
    expect(await snapshot(page)).toMatchObject({ live: true, speedMultiplier: 1, timeMs: +fixedUtc + 180000 });
});

test('standalone Live drives precise positions and nominal spin, with pause and bounded coverage', async ({ page }) => {
    test.setTimeout(120000);
    await installUtc(page);
    await page.goto('/SolarSystemOverview.html');
    await expect(page.locator('#solarDate')).toBeEnabled({ timeout: 60000 });
    const state = () => page.evaluate(() => ({ ...window.openbexiSolarSystem.snapshot(),
        earth: window.openbexiSolarSystem.planetPosition('Earth'),
        rotation: window.openbexiSolarSystem.planetRotation('Earth') }));
    const before = await state();
    expect(before).toMatchObject({ live: true, rate: 1, millisecondsPerWarpSecond: 1000, mode: 'JPL-derived ephemeris' });
    await setUtc(page, +fixedUtc + 60000);
    await expect.poll(async () => (await state()).timeMs).toBe(+fixedUtc + 60000);
    const after = await state();
    expect(Math.hypot(...after.earth.map((v, i) => v - before.earth[i]))).toBeGreaterThan(0);
    expect(after.rotation).not.toBe(before.rotation);
    await page.locator('#timePause').click();
    const paused = await state();
    await setUtc(page, +fixedUtc + 120000);
    await expect(page.locator('#timeNow')).toHaveAttribute('aria-pressed', 'false');
    expect((await state()).timeMs).toBe(paused.timeMs);
    expect((await state()).rotation).toBe(paused.rotation);
    await page.locator('#timeNow').click();
    await expect.poll(async () => (await state()).timeMs).toBe(+fixedUtc + 120000);
    await setUtc(page, Date.parse('2040-01-01T00:00:00Z'));
    await expect.poll(async () => (await state()).boundary).toBe('end');
    expect(await state()).toMatchObject({ live: false, rate: 0, timeMs: Date.parse('2035-12-31T00:00:00Z') });
    await expect(page.locator('#timeNow')).toHaveAttribute('aria-pressed', 'false');
});
