import assert from 'node:assert/strict';
import {
  prepareTrackedResults,
  TRACKED_RESULT_MODE,
  TRACKED_RESULT_SORT,
  trackedResultWindow
} from '../js/trackedResultsView.js';

const records = [
  { norad_id: '20', satellite_name: 'Zulu', object_type: 'DEBRIS', rcs_m2: null, has_current_elements: false, metadata_only: true },
  { norad_id: '3', satellite_name: 'Alpha', object_type: 'PAYLOAD', owner: 'US', orbit_class: 'LEO', rcs_m2: 2, has_current_elements: true, metadata_only: false },
  { norad_id: '11', satellite_name: 'Beta', object_type: 'DEBRIS', owner: 'FR', orbit_class: 'MEO', rcs_m2: 0.02, has_current_elements: true, metadata_only: false }
];

const all = prepareTrackedResults(records);
assert.deepEqual(all.map(row => row.norad), ['3', '11', '20']);
assert.deepEqual(
  prepareTrackedResults(records, { mode: TRACKED_RESULT_MODE.POSITIONED }).map(row => row.norad),
  ['3', '11']
);
assert.deepEqual(
  prepareTrackedResults(records, { mode: TRACKED_RESULT_MODE.UNAVAILABLE }).map(row => row.norad),
  ['20']
);
assert.deepEqual(
  prepareTrackedResults(records, { sortKey: TRACKED_RESULT_SORT.RCS, direction: 'desc' }).map(row => row.norad),
  ['3', '11', '20']
);
assert.equal(all.find(row => row.norad === '20').rcs, null, 'an explicit missing RCS is not coerced to 0 m2');

const rows = Array.from({ length: 100 }, (_, index) => ({ norad: String(index) }));
const windowed = trackedResultWindow(rows, { scrollTop: 440, viewportHeight: 220, rowHeight: 44, overscan: 2 });
assert.equal(windowed.start, 8);
assert.equal(windowed.end, 17);
assert.equal(windowed.totalHeight, 4400);
assert.equal(windowed.rows.length, 9);

console.log('tracked results view tests passed');
