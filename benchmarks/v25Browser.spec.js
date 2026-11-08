import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = process.cwd();
const output = path.join(ROOT, 'runtime/v25-browser-performance.json');
const reports = [];
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
test.afterAll(() => fs.writeFileSync(output, JSON.stringify({
    schemaVersion: 1, generatedAt: new Date().toISOString(), network: 'unthrottled loopback; no provider requests',
    hardware: { os: os.type(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, ramBytes: os.totalmem() },
    duration: '60-second prolonged-use sample after each startup; cold/warm current and doubled catalog',
    definitions: { coreInteractiveMs: 'Navigation to first-interactive-ui using native browser performance timestamps; compared per run with 4000 ms, not a qualified p75 sample.',
        startupMs: 'Navigation to default-meo-visible using native browser performance timestamps.',
        readinessObservedMs: 'Independent Node elapsed time until both readiness marks are observed; bounds-checks browser measurements.',
        interactionMs: 'Data-details click response after default MEO becomes visible; separate from startup readiness.',
        p95GlobeFrameMs: 'Frames while Mercator is disabled; compared with 33 ms.', p95FrameMs: 'All frames including view transitions.',
        heap: 'CDP V8 used heap before/after and after explicit GC; not RSS, peak process memory or GPU memory.' },
    limitations: 'Software rendering reported separately; no representative GPU/device or production performance qualification. Cold disables HTTP caching; OS cache is uncontrolled. Doubled fixture routes disable HTTP caching; warm means a reused browser/session and OS cache. Four 60-second samples do not qualify long-term memory retention.', reports
}, null, 2) + '\n'));

for (const doubled of [false, true]) test(`${doubled ? 'doubled synthetic' : 'current'} catalog cold and warm profile`, async ({ page, browserName, browser }) => {
    if (doubled) {
        const fixtureRoot = path.join(ROOT, 'runtime/v25-doubled-catalog');
        expect(fs.existsSync(path.join(fixtureRoot, 'profile.json'))).toBe(true);
        const aliases = { '/api/gp': 'json/gp/GP.json', '/api/gp-metadata': 'json/gp/GP.meta.json',
            '/api/tracked-objects/manifest': 'json/tracked/TRACKED.manifest.json', '/api/tracked-objects': 'json/tracked/TRACKED.manifest.json' };
        await page.route('**/*', async route => {
            const pathname = new URL(route.request().url()).pathname;
            const relative = aliases[pathname] || (pathname.startsWith('/api/tracked-objects/chunks/')
                ? 'json/tracked/chunks/' + pathname.split('/').at(-1) : pathname.slice(1));
            const candidate = path.resolve(fixtureRoot, relative);
            if (candidate.startsWith(fixtureRoot + path.sep) && relative.startsWith('json/') && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                await route.fulfill({ path: candidate, contentType: 'application/json' });
            } else await route.continue();
        });
    }
    // Freeze only wall Date for the calculation epoch. Playwright's Clock also
    // wraps performance/timers, so it cannot measure native startup/frame cost.
    const metadata = JSON.parse(fs.readFileSync('json/gp/GP.meta.json'));
    await page.addInitScript(epoch => {
        const NativeDate = Date;
        window.Date = new Proxy(NativeDate, {
            construct(target, args, newTarget) {
                return Reflect.construct(target, args.length ? args : [epoch], newTarget);
            },
            apply() { return new NativeDate(epoch).toString(); },
            get(target, key, receiver) {
                return key === 'now' ? () => epoch : Reflect.get(target, key, receiver);
            }
        });
    }, Date.parse(metadata.newest_orbital_epoch));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    for (const temperature of ['cold', 'warm']) {
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: temperature === 'cold' });
        const start = performance.now();
        await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => {
            const marks = window.openbexiStartupPerformance?.summary() || [];
            return ['default-meo-visible', 'first-interactive-ui'].every(name => marks.some(entry => entry.name === name));
        }, null, { timeout: 90000 });
        const readinessObservedMs = performance.now() - start;
        const interactionStart = performance.now();
        const details = page.locator('#dataHealthDetails > summary');
        await details.click(); await expect(page.locator('.data-health-panel')).toBeVisible();
        const interactionMs = performance.now() - interactionStart;
        await details.click();
        const heapBefore = (await cdp.send('Runtime.getHeapUsage')).usedSize;
        const measured = await page.evaluate(async () => {
            const canvas = document.querySelector('body > canvas');
            const gl = canvas?.getContext('webgl2');
            const debug = gl?.getExtension('WEBGL_debug_renderer_info');
            const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unknown';
            const before = performance.memory?.usedJSHeapSize ?? null;
            const gaps = [], globeGaps = [], started = performance.now();
            let nextSwitch = 10000;
            await new Promise(resolve => {
                let previous = performance.now();
                const frame = time => {
                    const gap = time - previous;
                    gaps.push(gap);
                    if (!document.getElementById('viewMercatorToggle')?.checked) globeGaps.push(gap);
                    previous = time;
                    if (time - started >= nextSwitch && nextSwitch <= 50000) {
                        document.getElementById('viewMercatorToggle')?.click(); nextSwitch += 10000;
                    }
                    if (time - started >= 60000) resolve(); else requestAnimationFrame(frame);
                };
                requestAnimationFrame(frame);
            });
            return { gaps, globeGaps, renderer, viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, heapBefore: before, heapAfter: performance.memory?.usedJSHeapSize ?? null,
                startupMarks: window.openbexiStartupPerformance.summary(), snapshot: window.openbexiSimulation.snapshot() };
        });
        const heapAfter = (await cdp.send('Runtime.getHeapUsage')).usedSize;
        await cdp.send('HeapProfiler.collectGarbage');
        const afterGc = await cdp.send('Runtime.getHeapUsage');
        const p95FrameMs = percentile(measured.gaps, .95);
        const p95GlobeFrameMs = percentile(measured.globeGaps, .95);
        const startupMs = measured.startupMarks.find(mark => mark.name === 'default-meo-visible')?.timestamp;
        const coreInteractiveMs = measured.startupMarks.find(mark => mark.name === 'first-interactive-ui')?.timestamp;
        for (const value of [startupMs, coreInteractiveMs]) {
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(readinessObservedMs + 500);
        }
        reports.push({ catalog: doubled ? 'doubled-synthetic' : 'current', temperature, browser: browserName, browserVersion: browser.version(),
            startupMs, coreInteractiveMs, readinessObservedMs, interactionMs, p95FrameMs, p95GlobeFrameMs, maxFrameMs: Math.max(...measured.gaps), frames: measured.gaps.length, globeFrames: measured.globeGaps.length,
            heapBefore, heapAfter, heapAfterGc: afterGc.usedSize,
            renderer: measured.renderer, viewport: measured.viewport, startupMarks: measured.startupMarks, drawnObjects: measured.snapshot.drawnNoradIds?.length,
            coreInteractiveTarget: coreInteractiveMs <= 4000 ? 'passed' : 'failed', frameTarget: p95GlobeFrameMs <= 33 ? 'passed' : 'failed' });
        console.log(JSON.stringify(reports.at(-1)));
    }
});
