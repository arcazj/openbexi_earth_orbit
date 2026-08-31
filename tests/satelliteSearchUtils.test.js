import assert from 'assert';
import { buildSatelliteSearchMatches, satelliteSearchBadges, satelliteSearchText } from '../js/satelliteSearchUtils.js';

const satellites = [
  { satellite_name: 'STARLINK-1001', norad_id: 44714, orbitType: 'LEO', company: 'Starlink' },
  { satellite_name: 'STARLINK-1002', norad_id: 44715, orbitType: 'LEO', company: 'Starlink' },
  { satellite_name: 'STARLINK-1003', norad_id: 44716, orbitType: 'LEO', company: 'Starlink' },
  { satellite_name: 'ISS (ZARYA)', norad_id: 25544, orbitType: 'LEO', company: 'NASA' },
  { satellite_name: 'INTELSAT 20 (IS-20)', norad_id: 38740, orbitType: 'GEO', company: 'Intelsat' }
];

function run() {
  assert(
    satelliteSearchText(satellites[0]).includes('44714') &&
      satelliteSearchText(satellites[0]).includes('leo') &&
      satelliteSearchText(satellites[0]).includes('starlink'),
    'search text includes name, NORAD, orbit, and tag/company'
  );
  const historicalDebris = {
    satellite_name: 'TINY FRAGMENT',
    norad_id: '101234',
    provider_catalog_id: 'A1234',
    alpha5_id: 'A1234',
    orbit_class: 'UNKNOWN',
    object_type: 'DEBRIS',
    lifecycle_status: 'DECAYED',
    metadata_only: true,
    rcs_m2: null
  };
  assert(satelliteSearchText(historicalDebris).includes('101234'), 'search indexes the canonical decoded NORAD ID');
  assert(satelliteSearchText(historicalDebris).includes('a1234'), 'search preserves provider and Alpha-5 catalog identities');
  assert(satelliteSearchText(historicalDebris).includes('debris'), 'search indexes independent object taxonomy');
  assert.deepStrictEqual(
    satelliteSearchBadges(historicalDebris),
    ['Historical', 'Metadata only', 'Debris'],
    'historical metadata-only results carry explicit status badges'
  );

  const emptySearch = buildSatelliteSearchMatches(satellites, '', {
    limit: 40,
    emptyQueryPreviewLimit: 2
  });
  assert.strictEqual(emptySearch.totalCount, 5, 'empty search count reflects active filtered total');
  assert.strictEqual(emptySearch.visibleCount, 2, 'empty search preview can be shorter than active filtered total');
  assert.strictEqual(emptySearch.countLabel, '5', 'empty search label shows active filtered total');

  const cappedStarlinkSearch = buildSatelliteSearchMatches(satellites, 'starlink', { limit: 2 });
  assert.strictEqual(cappedStarlinkSearch.totalCount, 3, 'search total counts every matching satellite');
  assert.strictEqual(cappedStarlinkSearch.visibleCount, 2, 'visible search results honor the cap');
  assert.strictEqual(cappedStarlinkSearch.countLabel, '2 / 3', 'capped search label shows visible over total');
  assert.deepStrictEqual(
    cappedStarlinkSearch.visibleMatches.map(sat => sat.norad_id),
    [44714, 44715],
    'visible capped search list contains the first capped matches'
  );

  const singleSearch = buildSatelliteSearchMatches(satellites, '25544', { limit: 40 });
  assert.strictEqual(singleSearch.totalCount, 1, 'search can match by NORAD ID');
  assert.strictEqual(singleSearch.visibleCount, 1, 'single search has one visible result');
  assert.strictEqual(singleSearch.countLabel, '1', 'single uncapped search label equals visible count');

  const noMatchSearch = buildSatelliteSearchMatches(satellites, 'definitely-not-present', { limit: 40 });
  assert.strictEqual(noMatchSearch.totalCount, 0, 'no-match search total is zero');
  assert.strictEqual(noMatchSearch.visibleCount, 0, 'no-match search visible count is zero');
  assert.strictEqual(noMatchSearch.countLabel, '0', 'no-match search label is zero');
  assert.deepStrictEqual(noMatchSearch.visibleMatches, [], 'no-match search has an empty visible result list');

  const filteredSubset = satellites.filter(sat => sat.orbitType === 'GEO');
  const filteredSearch = buildSatelliteSearchMatches(filteredSubset, 'starlink', { limit: 40 });
  assert.strictEqual(filteredSearch.totalCount, 0, 'search helper only searches the provided active-filter subset');

  console.log('satelliteSearchUtils tests passed');
}

run();
