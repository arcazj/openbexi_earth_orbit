import assert from 'node:assert/strict';
import {
    decayPredictionCacheKey,
    invalidateConfirmedDecayCache,
    loadConfirmedDecays
} from '../js/decayPredictor.js';

let fetchCount = 0;
let latestNorad = '7520';
const fetchImpl = async () => {
    fetchCount += 1;
    return {
        ok: true,
        status: 200,
        json: async () => ({
            fixture: [{
                NORAD_CAT_ID: latestNorad,
                OBJECT_NAME: `DECAY ${latestNorad}`,
                DECAY_DATE: '2026-08-20'
            }]
        })
    };
};

invalidateConfirmedDecayCache();
const first = await loadConfirmedDecays({ fetchImpl, force: true, revision: 'revision:1' });
assert(first.has('7520'));
latestNorad = '7577';
const cached = await loadConfirmedDecays({ fetchImpl, revision: 'revision:1' });
assert(cached.has('7520'));
assert.equal(fetchCount, 1);
const refreshed = await loadConfirmedDecays({ fetchImpl, revision: 'revision:2' });
assert(refreshed.has('7577'), 'revision change replaces the confirmed-decay module cache');
assert.equal(refreshed.has('7520'), false);
assert.equal(fetchCount, 2);

await assert.rejects(
    () => loadConfirmedDecays({
        force: true,
        revision: 'revision:3',
        fetchImpl: async () => ({ ok: false, status: 503 })
    }),
    /HTTP 503/,
    'failed confirmed-decay refresh rejects so the revision watcher can retry'
);
const retained = await loadConfirmedDecays({ fetchImpl, revision: 'revision:2' });
assert(retained.has('7577'), 'failed confirmed-decay refresh preserves the last known good map');

const ommSatellite = {
    norad_id: '100001',
    element_set: {
        format: 'OMM',
        epoch: '2026-08-22T10:00:00Z',
        omm: { NORAD_CAT_ID: '100001', EPOCH: '2026-08-22T10:00:00Z', MEAN_MOTION: 15.5 }
    }
};
assert(decayPredictionCacheKey(ommSatellite, { now: '2026-08-22T12:00:00Z' }), 'OMM predictions have a stable cache identity');

console.log('decay cache refresh tests passed');
