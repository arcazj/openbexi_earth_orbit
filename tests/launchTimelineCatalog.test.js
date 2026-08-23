import assert from 'node:assert/strict';
import {
    initTimeline,
    invalidateLaunchCatalogCache,
    loadLaunchCatalog,
    mergeLaunchCatalog
} from '../js/ganttTimelineLoader.js';

const active = [{
    satellite_name: 'ACTIVE OMM',
    norad_id: '100001',
    launch_date: '2026-08-18',
    mesh: { visible: true },
    satrec: { no: 0.06 }
}];
const launchRows = [
    {
        norad_id: '100001',
        satellite_name: 'ACTIVE OMM SATCAT',
        object_type: 'PAYLOAD',
        launch_date: '2026-08-18',
        launch_site: 'AFETR'
    },
    {
        norad_id: '100401',
        satellite_name: 'POST-CUTOFF LAUNCH',
        object_id: '2026-200A',
        object_type: 'PAYLOAD',
        launch_date: '2026-08-20',
        launch_site: 'AFWTR'
    },
    {
        norad_id: '100402',
        satellite_name: 'POST-CUTOFF ROCKET BODY',
        object_type: 'ROCKET BODY',
        launch_date: '2026-08-20'
    }
];

const merged = mergeLaunchCatalog(active, launchRows);
assert.equal(merged.length, 3, 'SATCAT launches merge without duplicate active records');
assert.equal(merged.find(record => record.norad_id === '100001').isTimelineDetailsOnly, false);
const detailsOnly = merged.find(record => record.norad_id === '100401');
assert(detailsOnly, 'post-cutoff launch exists without an active orbit record');
assert.equal(detailsOnly.isTimelineDetailsOnly, true);
assert.equal(detailsOnly.launch_date, '2026-08-20');
assert.equal(merged.find(record => record.norad_id === '100402').object_type, 'ROCKET BODY');

let fetchCount = 0;
const fetchImpl = async () => {
    fetchCount += 1;
    return { ok: true, status: 200, json: async () => launchRows };
};
invalidateLaunchCatalogCache();
assert.equal((await loadLaunchCatalog({ fetchImpl, source: 'fixture:launches' })).length, 3);
await loadLaunchCatalog({ fetchImpl, source: 'fixture:launches' });
assert.equal(fetchCount, 1, 'launch catalog reuses the current revision cache');
await loadLaunchCatalog({ fetchImpl, source: 'fixture:launches', force: true });
assert.equal(fetchCount, 2, 'forced refresh replaces the cached launch catalog');
await assert.rejects(
    () => loadLaunchCatalog({
        force: true,
        source: 'fixture:launches',
        fetchImpl: async () => ({ ok: false, status: 503 })
    }),
    /HTTP 503/,
    'failed forced launch refresh rejects so the revision watcher can retry'
);
assert.equal(
    (await loadLaunchCatalog({ fetchImpl, source: 'fixture:launches' })).length,
    3,
    'failed forced launch refresh preserves the last known good cache'
);

function element(tagName) {
    return {
        tagName,
        className: '',
        style: {},
        children: [],
        classList: { add() {}, remove() {} },
        appendChild(child) { this.children.push(child); child.parentElement = this; },
        addEventListener() {},
        remove() {},
        closest() { return null; },
        getContext() { return null; },
        clientWidth: 800,
        clientHeight: 200,
        offsetHeight: 24
    };
}

Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
        createElement: element,
        getElementById: () => null,
        body: element('body')
    }
});
Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 }
});
Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: callback => callback()
});

const timeline = initTimeline(active, () => {}, { launchRecords: launchRows.slice(0, 1) });
const refreshed = timeline.refreshData(launchRows, active);
assert.equal(refreshed.length, 3, 'refreshData replaces stale launch events without a page reload');
assert.equal(refreshed.at(-1).satellite.norad_id, '100402');
timeline.teardown();

console.log('launch timeline catalog tests passed');
