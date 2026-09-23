import assert from 'node:assert/strict';
import {
  buildTrackedCoveragePresentation,
  trackedCoverageState
} from '../js/trackedCoveragePresentation.js';

const verified = buildTrackedCoveragePresentation({
  counts: { filtered: 12488, propagatable: 2640, metadata_only: 9848 },
  manifest: {
    generated_at: '2026-09-01T08:12:36.260Z',
    coverage: { complete_source_snapshot: true }
  }
});

assert.equal(verified.matched, 12488);
assert.equal(verified.positioned, 2640);
assert.equal(verified.unavailable, 9848);
assert.equal(verified.state.key, 'verified');
assert.equal(verified.timestamp, '2026-09-01 08:12:36Z');
assert.match(verified.ariaLabel, /2,640 positioned/);

const bounded = buildTrackedCoveragePresentation({
  counts: { filtered: 3, propagatable: 9 },
  manifest: { coverage: { complete_source_snapshot: false } },
  includeHistorical: true
});
assert.equal(bounded.positioned, 3, 'positioned count cannot exceed active matches');
assert.equal(bounded.unavailable, 0);
assert.equal(bounded.scope, 'current + history');
assert.equal(bounded.state.key, 'partial');

assert.equal(trackedCoverageState({ lineageBlocked: true }).key, 'unavailable');
assert.equal(trackedCoverageState({ snapshotState: 'error' }).key, 'degraded');
assert.equal(trackedCoverageState({ snapshotState: 'loading' }).key, 'loading');

console.log('tracked coverage presentation tests passed');
