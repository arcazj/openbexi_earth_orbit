import assert from 'node:assert/strict';
import { lifeExtensionFamily, LIFE_EXTENSION_TAG } from '../js/lifeExtensionCatalog.js';
import { assessExtensionView, loadExtensionElements } from '../js/lifeExtensionView.js';
import { trackedObjectMatchesFilters } from '../js/trackedObjectCatalog.js';
import { satelliteSearchText } from '../js/satelliteSearchUtils.js';
import { resolveSatelliteModel } from '../js/satelliteModelResolver.js';

import { mev1, mev2 as vehicle, intelsat as client, optus } from './fixtures/lifeExtensionTles.js';

const catalog = (...rows) => ({ records: new Map(rows.map(row => [row.norad_id, row])) });
const now = new Date('2026-11-24T12:00:00Z');
const compare = (other, time = now) => assessExtensionView('46113', 'MEV-2', catalog(vehicle, ...other), time);
const paired = compare([client]);
assert.equal(paired.paired, true);
assert.equal(paired.maxSeparationKm, 0);
assert.deepEqual(paired.elements.map(row => row.id), ['46113','28358']);
function withMeanAnomaly(value) {
    const body = client.tle_line2.slice(0,43) + value.padStart(8) + client.tle_line2.slice(51,68);
    const checksum = [...body].reduce((sum, c) => sum + (c === '-' ? 1 : Number(c) || 0), 0) % 10;
    return { ...client, tle_line2: body + checksum };
}
const close = compare([withMeanAnomaly('141.3675')]);
assert(close.paired && close.maxSeparationKm > .1 && close.maxSeparationKm < 1);
assert.equal(compare([withMeanAnomaly('141.3690')]).paired, false);
assert.equal(compare([]).paired, false);
assert.equal(compare([client], new Date('2026-12-20')).elements[1].status, 'stale');
assert.equal(compare([client], new Date('2026-11-10')).paired, false);
assert.equal(compare([{ ...client, tle_line1: vehicle.tle_line1, tle_line2: vehicle.tle_line2 }]).elements[1].status, 'invalid');
assert.equal(compare([{ ...client, tle_line2: client.tle_line2.slice(0,-1) + '9' }]).paired, false);
const far = assessExtensionView('44625', 'MEV-1', catalog(mev1,optus), now);
assert.equal(far.client, undefined);
assert.equal(far.paired,false);
assert.equal(assessExtensionView('44625','MEV-1',catalog(),new Date('2026-01-01')).client.norad,'35756');
const betweenClients = assessExtensionView('44625', 'MEV-1', catalog(), new Date('2025-05-01'));
assert.equal(betweenClients.client, undefined);
assert.equal(betweenClients.paired, false);
const firstClient = assessExtensionView('44625', 'MEV-1', catalog(), new Date('2021-07-20'));
assert.equal(firstClient.client.norad, '26824');
assert.equal(lifeExtensionFamily({ satellite_name: 'Mission Extension Pod 1' }), 'MEP');
assert.equal(lifeExtensionFamily({ satellite_name: 'MISSION ROBOTIC VEHICLE' }), 'MRV');
assert.equal(lifeExtensionFamily({ satellite_name: 'MEV-2 DEB' }), null);
assert.equal(lifeExtensionFamily(client), null);
assert(satelliteSearchText(vehicle).includes('mission extension vehicle'));
const filters = { orbitSelection: ['GEO'], tagSelection: [LIFE_EXTENSION_TAG] };
assert(trackedObjectMatchesFilters(vehicle, filters));
assert(!trackedObjectMatchesFilters(client, filters));
assert(!trackedObjectMatchesFilters(vehicle, { ...filters, orbitSelection: ['LEO'] }));
for (const id of ['44625','46113']) assert.equal(resolveSatelliteModel({ norad_id: id }).assetId, 'geo/mev.glb');
assert.notEqual(resolveSatelliteModel({ norad_id: '43272' }).assetId, 'geo/mev.glb');

const originalFetch = globalThis.fetch, originalNow = Date.now;
let clock = now.getTime(), revision = 'one', requests = 0;
try {
    Date.now = () => clock;
    globalThis.fetch = async path => {
        const metadata = path.endsWith('.meta.json');
        if (!metadata) requests++;
        return { ok: true, json: async () => metadata ? { catalog_revision: revision } : [vehicle, client] };
    };
    await Promise.all([loadExtensionElements(), loadExtensionElements()]);
    clock += 301_000;
    await loadExtensionElements();
    assert.equal(requests, 1, 'unchanged published elements are reused');
    clock += 301_000;
    revision = 'two';
    await loadExtensionElements();
    assert.equal(requests, 2, 'a new published revision refreshes the TLEs');
    await loadExtensionElements(true);
    assert.equal(requests, 3, 'manual reload reads the current elements');
} finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
}
