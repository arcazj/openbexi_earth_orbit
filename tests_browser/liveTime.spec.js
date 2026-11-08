import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

async function verifySolarToolbar(page, standalone) {
    const toolbar = page.locator(standalone ? '.solar-playback-toolbar' : '#timeWarpBox');
    const unit = page.locator('#solarTimeUnit');
    const slider = page.locator(standalone ? '#timeSpeed' : '#timeWarpSlider');
    const pause = page.locator(standalone ? '#timePause' : '#timeWarpPause');
    const live = page.locator(standalone ? '#timeNow' : '#timeWarpNow');
    const readout = page.locator(standalone ? '#timeSpeedValue' : '#timeWarpVal');
    const api = standalone ? 'openbexiSolarSystem' : 'openbexiSimulation';
    const state = () => page.evaluate(key => window[key].snapshot(), api);
    await expect(toolbar.locator('select:visible')).toHaveCount(1);
    await expect(toolbar.locator('#solarTimeUnit')).toBeVisible();
    await expect(page.locator('#solarSystemTimeControls #solarTimeUnit')).toHaveCount(0);
    await expect(unit).toHaveAttribute('aria-label', 'Solar System playback unit');
    await expect(unit.locator('option')).toHaveText(['sec/s', 'min/s', 'hour/s', 'day/s', 'year/s']);
    await expect(unit.locator('optgroup[label="Advanced"] option')).toHaveAttribute('value', 'year');
    await expect(readout).toHaveText('Live · 1 sec/s');

    await pause.click();
    const paused = await state();
    await unit.focus();
    await unit.press('ArrowDown');
    await unit.press('Enter');
    await expect(unit).toHaveValue('minute');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Paused, minutes per second selected');
    for (const [value, scale] of [['second', 1000], ['minute', 60000], ['hour', 3600000], ['day', 86400000], ['year', 31557600000]]) {
        await unit.selectOption(value);
        expect(await state()).toMatchObject({ timeMs: paused.timeMs, rate: 0, live: false, millisecondsPerWarpSecond: scale });
    }

    await unit.selectOption('second');
    await slider.fill('-2');
    const transition = await page.evaluate(key => {
        const before = { ...window[key].snapshot() };
        const select = document.getElementById('solarTimeUnit');
        select.value = 'hour';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return { before, after: window[key].snapshot() };
    }, api);
    expect(transition.after).toMatchObject({ timeMs: transition.before.timeMs, rate: -2, live: false, millisecondsPerWarpSecond: 3600000 });
    await expect(readout).toHaveText('-2 hour/s');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Reverse, 2 simulated hours per real second');
    await pause.click();
    await unit.selectOption('minute');
    await pause.click();
    expect((await state()).rate).toBe(-2);
    await expect(readout).toHaveText('-2 min/s');

    await page.locator('#solarDate').fill('2024-01-01T00:00');
    await page.locator('#solarDate').press('Tab');
    await unit.selectOption('second');
    await slider.fill('1');
    await expect(readout).toHaveText('1 sec/s');
    await expect(live).toHaveAttribute('aria-pressed', 'false');
    if (test.info().project.use.hasTouch) await live.tap(); else await live.click();
    expect(await state()).toMatchObject({ live: true, rate: 1, millisecondsPerWarpSecond: 1000 });
    await expect(unit).toHaveValue('second');

    const originalViewport = page.viewportSize();
    if (test.info().project.name === 'mobile-chromium') await page.setViewportSize({ width: 320, height: 844 });
    const boxes = await Promise.all([unit, pause, live].map(control => control.boundingBox()));
    for (const box of boxes) {
        expect(box.width).toBeGreaterThanOrEqual(24);
        expect(box.height).toBeGreaterThanOrEqual(24);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
    }
    expect(boxes[0].x + boxes[0].width).toBeLessThanOrEqual(boxes[1].x);
    expect(boxes[1].x + boxes[1].width).toBeLessThanOrEqual(boxes[2].x);
    await expect(unit).toBeVisible();
    const scan = await new AxeBuilder({ page }).include(standalone ? '.solar-playback-toolbar' : '#timeWarpBox')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({ path: `runtime/v251-toolbar-${standalone ? 'standalone' : 'integrated'}-${test.info().project.name}.png` });
    if (test.info().project.name === 'mobile-chromium') await page.setViewportSize(originalViewport);
}

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
    await verifySolarToolbar(page, false);
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
    await verifySolarToolbar(page, true);
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
