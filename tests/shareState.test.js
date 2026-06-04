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
    orbitTypeFilter: ['LEO', 'MEO'],
    companyFilter: ['STARLINK', 'STATIONS'],
    debrisFilter: 'hide',
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
    { norad_id: '25544', satellite_name: 'ISS (ZARYA)' }
  );
  const url = new URL(shareUrl);
  assert.strictEqual(url.searchParams.get('share'), '1', 'share URL has share flag');
  assert.strictEqual(url.searchParams.get('sat'), '25544', 'share URL includes selected NORAD');
  assert.strictEqual(url.searchParams.get('orbit'), 'LEO,MEO', 'share URL includes orbit filters');
  assert.strictEqual(url.searchParams.get('tags'), 'STARLINK,STATIONS', 'share URL includes tag filters');
  assert.strictEqual(url.searchParams.has('apiBase'), false, 'share URL removes local API base configuration');
  assert.strictEqual(url.searchParams.has('server'), false, 'share URL removes server configuration');
  assert.strictEqual(shareUrlContainsUnsafeLocalData(shareUrl), false, 'normal share URL contains no unsafe local data');

  const parsed = parseShareStateFromSearch(url.search);
  assert.strictEqual(parsed.selectedSatelliteNoradId, '25544', 'share parse restores selected NORAD');
  assert.deepStrictEqual(parsed.orbitTypeFilter, ['LEO', 'MEO'], 'share parse restores orbit filters');
  assert.deepStrictEqual(parsed.companyFilter, ['STARLINK', 'STATIONS'], 'share parse restores tag filters');
  assert.strictEqual(parsed.view3D, true, 'share parse restores 3D view');
  assert.strictEqual(parsed.viewMercator, true, 'share parse restores Mercator view');
  assert.strictEqual(parsed.useHighDefTexture, true, 'share parse restores High Def');
  assert.strictEqual(parsed.showOrbitFrame, true, 'share parse restores orbit frame');
  assert.strictEqual(parsed.simDate.toISOString(), '2026-06-04T12:00:00.000Z', 'share parse restores simulation time');

  const state = buildShareState({
    orbitTypeFilter: ['LEO', 'file:///C:/private/TLE.json'],
    companyFilter: ['STARLINK', 'token=abc'],
    simDate: new Date('2026-06-04T00:00:00.000Z'),
    view3D: true
  });
  assert.deepStrictEqual(state.orbitTypeFilter, ['LEO'], 'share state strips unsafe local file paths');
  assert.deepStrictEqual(state.companyFilter, ['STARLINK'], 'share state strips unsafe token-like values');
  assert(shareStateSummary(parsed).includes('NORAD 25544'), 'share summary includes selected satellite');
  assert.strictEqual(
    shareUrlContainsUnsafeLocalData('http://example.test/index.html?path=file:///C:/secret'),
    true,
    'unsafe local file data is detected'
  );

  console.log('shareState tests passed');
}

run();
