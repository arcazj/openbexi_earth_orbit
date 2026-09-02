import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildSatelliteSearchMatches } from '../js/satelliteSearchUtils.js';
import {
  buildTrackedFacetOptions,
  buildTrackedCatalogCounts,
  trackedObjectMatchesFilters
} from '../js/trackedObjectCatalog.js';
import {
  prepareTrackedResults,
  trackedResultWindow
} from '../js/trackedResultsView.js';

const RECORD_COUNT = 120_000;
const MAX_BUILD_MS = 2_500;
const MAX_FILTER_MS = 3_000;
const MAX_SEARCH_MS = 3_000;
const MAX_FACET_MS = 6_000;
const MAX_RESULTS_MS = 3_000;
const MAX_TOTAL_MS = 16_000;
const MAX_HEAP_DELTA_BYTES = 384 * 1024 * 1024;
const ORBITS = ['LEO', 'MEO', 'GEO', 'HEO', 'OTHER'];
const OBJECT_TYPES = ['PAYLOAD', 'DEBRIS', 'ROCKET_BODY', 'UNKNOWN'];

function heapUsed() {
  return Number(process.memoryUsage?.().heapUsed || 0);
}

const initialHeap = heapUsed();
const startedAt = performance.now();
const records = Array.from({ length: RECORD_COUNT }, (_, index) => {
  const historical = index % 10 === 0;
  const objectType = OBJECT_TYPES[index % OBJECT_TYPES.length];
  return {
    norad_id: String(1_000_000 + index),
    satellite_name: `${objectType} SCALE ${index}${index % 12_000 === 0 ? ' SEARCH-NEEDLE' : ''}`,
    object_type: objectType,
    orbit_class: ORBITS[index % ORBITS.length],
    orbitType: ORBITS[index % ORBITS.length],
    lifecycle_status: historical ? 'DECAYED' : 'ACTIVE',
    decay_date: historical ? '2020-01-01' : null,
    rcs_m2: index % 3 === 0 ? null : (index % 100) / 100_000,
    rcs_status: index % 3 === 0 ? 'MISSING' : 'PUBLISHED',
    owner_code: `OWNER ${index % 40}`,
    launch_site: `SITE ${index % 24}`,
    ops_status_code: index % 7 === 0 ? null : index % 2 === 0 ? '+' : '-',
    launch_date: `${1957 + (index % 70)}-01-01`,
    international_designator: `${1957 + (index % 70)}-${String(index % 1000).padStart(3, '0')}A`,
    has_current_elements: false,
    metadata_only: true,
    propagation_status: 'NO_CURRENT_ELEMENTS',
    company: `OWNER ${index % 40}`
  };
});
const buildMs = performance.now() - startedAt;

const filterStartedAt = performance.now();
const filtered = records.filter(record => trackedObjectMatchesFilters(record, {
  orbitSelection: ['GEO', 'MEO'],
  objectTypeSelection: ['DEBRIS', 'ROCKET_BODY'],
  tagSelection: ['ALL COMPANY'],
  includeHistorical: false
}));
const filterMs = performance.now() - filterStartedAt;

const searchStartedAt = performance.now();
const search = buildSatelliteSearchMatches(records, 'search-needle', { limit: 40 });
const searchMs = performance.now() - searchStartedAt;

const facetStartedAt = performance.now();
const facetOptions = buildTrackedFacetOptions(records, {
  position: ['ALL'],
  rcs: ['ALL'],
  owner: [],
  launchSite: [],
  status: [],
  launchYearFrom: null,
  launchYearTo: null,
  designator: ''
});
const facetMs = performance.now() - facetStartedAt;

const resultsStartedAt = performance.now();
const preparedResults = prepareTrackedResults(records, {
  mode: 'UNAVAILABLE',
  sortKey: 'owner',
  direction: 'asc'
});
const firstResultWindow = trackedResultWindow(preparedResults, {
  viewportHeight: 440,
  rowHeight: 44,
  scrollTop: 44 * 60_000,
  overscan: 5
});
const resultsMs = performance.now() - resultsStartedAt;
const totalMs = performance.now() - startedAt;
const heapDeltaBytes = Math.max(0, heapUsed() - initialHeap);
const counts = buildTrackedCatalogCounts(records, filtered);

const diagnostics = {
  recordCount: records.length,
  filteredCount: filtered.length,
  searchMatchCount: search.totalCount,
  buildMs: Number(buildMs.toFixed(2)),
  filterMs: Number(filterMs.toFixed(2)),
  searchMs: Number(searchMs.toFixed(2)),
  facetMs: Number(facetMs.toFixed(2)),
  resultsMs: Number(resultsMs.toFixed(2)),
  totalMs: Number(totalMs.toFixed(2)),
  heapDeltaMiB: Number((heapDeltaBytes / 1024 / 1024).toFixed(2)),
  bounds: {
    maxBuildMs: MAX_BUILD_MS,
    maxFilterMs: MAX_FILTER_MS,
    maxSearchMs: MAX_SEARCH_MS,
    maxFacetMs: MAX_FACET_MS,
    maxResultsMs: MAX_RESULTS_MS,
    maxTotalMs: MAX_TOTAL_MS,
    maxHeapDeltaMiB: MAX_HEAP_DELTA_BYTES / 1024 / 1024
  }
};

console.log(`[tracked-catalog-120k-benchmark] ${JSON.stringify(diagnostics)}`);
assert.equal(records.length, RECORD_COUNT);
assert.equal(counts.total, RECORD_COUNT);
assert.equal(counts.historical_tracked, RECORD_COUNT / 10);
assert(filtered.length > 0, 'scale fixture exercises a non-empty filter intersection');
assert.equal(search.totalCount, 10, 'scale search deterministically finds every sentinel record');
assert.equal(search.visibleCount, 10);
assert.equal(preparedResults.length, RECORD_COUNT, 'every metadata-only scale record is available in the results view');
assert(firstResultWindow.rows.length > 0 && firstResultWindow.rows.length <= 20,
  'results virtualization materializes only a bounded viewport window');
for (const key of ['owner', 'launchSite', 'status']) {
  assert.equal(facetOptions[key].reduce((sum, entry) => sum + entry.count, 0), RECORD_COUNT,
    `120k ${key} facet remains exhaustive`);
}
assert(buildMs <= MAX_BUILD_MS, `120k fixture build exceeded ${MAX_BUILD_MS} ms`);
assert(filterMs <= MAX_FILTER_MS, `120k filter exceeded ${MAX_FILTER_MS} ms`);
assert(searchMs <= MAX_SEARCH_MS, `120k search exceeded ${MAX_SEARCH_MS} ms`);
assert(facetMs <= MAX_FACET_MS, `120k facet build exceeded its documented ${MAX_FACET_MS} ms bound`);
assert(resultsMs <= MAX_RESULTS_MS, `120k results sort/window exceeded ${MAX_RESULTS_MS} ms`);
assert(totalMs <= MAX_TOTAL_MS, `120k filter/search/facet/results benchmark exceeded ${MAX_TOTAL_MS} ms`);
assert(heapDeltaBytes <= MAX_HEAP_DELTA_BYTES, '120k filter/search benchmark exceeded its heap-growth bound');

console.log('tracked object catalog 120k benchmark tests passed');
