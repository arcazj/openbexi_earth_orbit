import assert from 'assert';
import {
  buildShareState,
  buildShareUrl,
  parseShareStateFromSearch,
  shareStateSummary,
  shareUrlContainsUnsafeLocalData
} from '../js/shareState.js';

function run() {
  const simParams = {
    selectedSatelliteNoradId: '25544',
    selectedSatelliteName: 'ISS (ZARYA)',
    view3D: true,
    viewMercator: true,
    orbitTypeFilter: ['ALL'],
    objectTypeFilter: ['DEBRIS'],
    includeHistoricalTrackedObjects: true,
    companyFilter: ['STARLINK', 'STATIONS'],
    trackedFacets: {
      position: ['POSITIONED'],
      rcs: ['LT_0_01', 'UNKNOWN'],
      owner: ['US', 'ESA'],
      launchSite: ['AFETR'],
      status: ['PRESENT'],
      launchYearFrom: 1998,
      launchYearTo: 2026,
      designator: '1998-067'
    },
    simDate: new Date('2026-06-04T12:00:00.000Z'),
    showOrbit: true,
    showFootprint: true,
    showOnlySelectedSatellite: true,
    useHighDefTexture: true,
    showDayNight: true,
    showECEFAxes: false,
    showOrbitFrame: true,
    yawDeg: 1.5,
    pitchDeg: -2.5,
    rollDeg: 3
  };

  const shareUrl = buildShareUrl(
    'http://127.0.0.1:8000/index.html?apiBase=http://127.0.0.1:8000&server=http://bad',
    simParams,
    { norad_id: '25544', satellite_name: 'ISS (ZARYA)' },
    { event_id: 'conjunction:abc123', request_id: 'screen:def456' }
  );
  const url = new URL(shareUrl);
  assert.strictEqual(url.searchParams.get('share'), '1', 'share URL has share flag');
  assert.strictEqual(url.searchParams.get('sat'), '25544', 'share URL includes selected NORAD');
  assert.strictEqual(url.searchParams.get('conjEvent'), 'conjunction:abc123', 'share URL identifies the event revision');
  assert.strictEqual(url.searchParams.get('conjRequest'), 'screen:def456', 'share URL identifies the producing request');
  assert.strictEqual(url.searchParams.get('orbit'), 'ALL', 'share URL includes the debris facet orbit scope');
  assert.strictEqual(url.searchParams.get('objects'), 'DEBRIS', 'share URL includes the independent Debris object type');
  assert.strictEqual(url.searchParams.get('history'), '1', 'share URL includes historical scope');
  assert.strictEqual(url.searchParams.get('tags'), 'STARLINK,STATIONS', 'share URL includes tag filters');
  assert.strictEqual(url.searchParams.get('position'), 'POSITIONED', 'share URL includes position availability');
  assert.strictEqual(url.searchParams.get('rcs'), 'LT_0_01,UNKNOWN', 'share URL includes RCS bands');
  assert.strictEqual(url.searchParams.get('owner'), 'US,ESA', 'share URL includes owner facets');
  assert.strictEqual(url.searchParams.get('launchSite'), 'AFETR', 'share URL includes launch-site facets');
  assert.strictEqual(url.searchParams.get('status'), 'PRESENT', 'share URL includes status facets');
  assert.strictEqual(url.searchParams.get('yearFrom'), '1998', 'share URL includes launch-year lower bound');
  assert.strictEqual(url.searchParams.get('yearTo'), '2026', 'share URL includes launch-year upper bound');
  assert.strictEqual(url.searchParams.get('designator'), '1998-067', 'share URL includes designator filter');
  assert.strictEqual(url.searchParams.has('debris'), false, 'share URL does not duplicate category state in a debris parameter');
  assert.strictEqual(url.searchParams.has('apiBase'), false, 'share URL removes local API base configuration');
  assert.strictEqual(url.searchParams.has('server'), false, 'share URL removes server configuration');
  assert.strictEqual(shareUrlContainsUnsafeLocalData(shareUrl), false, 'normal share URL contains no unsafe local data');

  const parsed = parseShareStateFromSearch(url.search);
  assert.strictEqual(parsed.selectedSatelliteNoradId, '25544', 'share parse restores selected NORAD');
  assert.strictEqual(parsed.conjunctionEventId, 'conjunction:abc123', 'share parse restores the event revision');
  assert.strictEqual(parsed.conjunctionRequestId, 'screen:def456', 'share parse restores the producing request');
  assert.deepStrictEqual(parsed.orbitTypeFilter, ['ALL'], 'share parse restores orbit filters');
  assert.deepStrictEqual(parsed.objectTypeFilter, ['DEBRIS'], 'share parse restores object-type filters');
  assert.strictEqual(parsed.includeHistoricalTrackedObjects, true, 'share parse restores historical scope');
  assert.deepStrictEqual(parsed.companyFilter, ['STARLINK', 'STATIONS'], 'share parse restores tag filters');
  assert.deepStrictEqual(parsed.trackedFacets, simParams.trackedFacets, 'share parse restores tracked-object facets');
  assert.strictEqual(parsed.view3D, true, 'share parse restores 3D view');
  assert.strictEqual(parsed.viewMercator, true, 'share parse restores Mercator view');
  assert.strictEqual(parsed.useHighDefTexture, true, 'share parse restores High Def');
  assert.strictEqual(parsed.showOrbitFrame, true, 'share parse restores orbit frame');
  assert.strictEqual(parsed.simDate.toISOString(), '2026-06-04T12:00:00.000Z', 'share parse restores simulation time');

  const state = buildShareState({
    orbitTypeFilter: ['ALL', 'file:///C:/private/TLE.json'],
    objectTypeFilter: ['DEBRIS'],
    companyFilter: ['STARLINK', 'token=abc'],
    trackedFacets: {
      position: ['POSITIONED', 'file:///C:/private/data'],
      owner: ['US', 'token=abc'],
      launchYearFrom: 1900,
      launchYearTo: 2200,
      designator: 'password=secret'
    },
    simDate: new Date('2026-06-04T00:00:00.000Z'),
    view3D: true
  });
  assert.deepStrictEqual(state.orbitTypeFilter, ['ALL'], 'share state strips unsafe local file paths');
  assert.deepStrictEqual(state.companyFilter, ['STARLINK'], 'share state strips unsafe token-like values');
  assert.deepStrictEqual(state.trackedFacets.position, ['POSITIONED'], 'share state strips unsafe facet values');
  assert.deepStrictEqual(state.trackedFacets.owner, ['US'], 'share state strips unsafe facet owner values');
  assert.strictEqual(state.trackedFacets.launchYearFrom, null, 'share state rejects out-of-range launch years');
  assert.strictEqual(state.trackedFacets.launchYearTo, null, 'share state rejects future launch years beyond policy');
  assert.strictEqual(state.trackedFacets.designator, '', 'share state rejects secret-like facet text');
  const dormantFacetUrl = new URL(buildShareUrl('http://example.test/index.html', {
    orbitTypeFilter: ['LEO'],
    objectTypeFilter: ['DEBRIS'],
    trackedFacets: { position: ['POSITIONED'], owner: ['US'] }
  }));
  assert.strictEqual(dormantFacetUrl.searchParams.has('position'), false,
    'debris facets are omitted when the active orbit scope is not ALL');
  assert.strictEqual(dormantFacetUrl.searchParams.has('owner'), false,
    'dormant facets cannot misdescribe a share link');
  assert.deepStrictEqual(
    parseShareStateFromSearch('?share=1&orbit=LEO&objects=DEBRIS&position=POSITIONED&owner=US').trackedFacets,
    {
      position: [], rcs: [], owner: [], launchSite: [], status: [],
      launchYearFrom: null, launchYearTo: null, designator: ''
    },
    'inactive-context facet parameters are dropped instead of becoming hidden future state'
  );
  assert.deepStrictEqual(
    parseShareStateFromSearch('?share=1&debris=only').orbitTypeFilter,
    ['ALL'],
    'legacy debris-only links migrate to all orbit classes'
  );
  assert.deepStrictEqual(
    parseShareStateFromSearch('?share=1&debris=only').objectTypeFilter,
    ['DEBRIS'],
    'legacy debris-only links migrate to the independent Debris object type'
  );
  assert.deepStrictEqual(
    parseShareStateFromSearch('?share=1&orbit=LEO&debris=only').orbitTypeFilter,
    ['LEO'],
    'an explicit legacy orbit filter is preserved during migration'
  );
  assert.deepStrictEqual(
    parseShareStateFromSearch('?share=1&orbit=LEO,DEBRIS').objectTypeFilter,
    ['DEBRIS'],
    'legacy unified orbit=DEBRIS links migrate without changing debris intent'
  );
  assert(shareStateSummary(parsed).includes('NORAD 25544'), 'share summary includes selected satellite');
  assert(shareStateSummary(parsed).includes('Event conjunction:abc123'), 'share summary includes the conjunction event revision');
  assert(shareStateSummary(parsed).includes('Position POSITIONED'), 'share summary includes tracked facets');
  assert.strictEqual(
    parseShareStateFromSearch('?share=1&conjEvent=file%3A%2F%2Fprivate&conjRequest=token%3Dsecret').conjunctionEventId,
    '',
    'unsafe conjunction identifiers are rejected'
  );
  assert.strictEqual(
    shareUrlContainsUnsafeLocalData('http://example.test/index.html?path=file:///C:/secret'),
    true,
    'unsafe local file data is detected'
  );

  console.log('shareState tests passed');
}

run();
