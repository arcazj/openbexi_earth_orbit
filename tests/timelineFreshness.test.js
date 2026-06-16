import assert from 'assert';
import fs from 'fs';
import {
  buildLaunchTimelineData,
  getLatestLaunchEvent,
  getLaunchTimelineRanges,
  parseLaunchDate
} from '../js/ganttTimelineLoader.js';
import {
  buildReentryTimelineData,
  getLatestReentryEvent,
  getReentryTimelineRanges
} from '../js/reentryTimeline.js';
import {
  applyCachedDecayPrediction,
  applyConfirmedDecayRecord,
  cacheDecayPrediction,
  decayPredictionCacheKey,
  isLikelyDecayCandidate
} from '../js/decayPredictor.js';

function run() {
  const now = new Date('2026-06-15T00:00:00Z');
  const launchSats = [
    { satellite_name: 'OLD SAT', norad_id: '100', company: 'Legacy', launch_date: '2020-01-02' },
    { satellite_name: 'NO DATE', norad_id: '101', launch_date: 'N/A' },
    { satellite_name: 'BAD DATE', norad_id: '102', launch_date: 'not-a-date' },
    { satellite_name: 'LATEST LAUNCH', norad_id: '103', company: 'Fresh', launch_date: '2026-06-01' },
    { satellite_name: 'IMPOSSIBLE FUTURE', norad_id: '104', launch_date: '2035-01-01' }
  ];

  assert.strictEqual(parseLaunchDate('2035-01-01', { now }), null, 'future-impossible launch dates are skipped');
  const launchData = buildLaunchTimelineData(launchSats, { now });
  assert.strictEqual(launchData.length, 2, 'launch timeline keeps only valid loaded launch dates');
  const latestLaunch = getLatestLaunchEvent(launchData);
  assert.strictEqual(latestLaunch.satellite.satellite_name, 'LATEST LAUNCH', 'latest launch comes from dataset dates');
  assert.notStrictEqual(latestLaunch.time, now.getTime(), 'latest launch does not use wall-clock time as the anchor');
  const launchRanges = getLaunchTimelineRanges(launchData, latestLaunch);
  assert(launchRanges.detailStart < latestLaunch.time && latestLaunch.time < launchRanges.detailEnd, 'launch viewport includes latest launch');

  const activeSats = [
    {
      satellite_name: 'ACTIVE CONFIRMED',
      norad_id: '200',
      launch_date: '2021-01-01',
      decay: { decay_status: 'CONFIRMED', decay_date: '2025-01-01', decay_reason: 'fixture' }
    },
    {
      satellite_name: 'ACTIVE PREDICTED',
      norad_id: '201',
      launch_date: '2024-02-01',
      decay: {
        decay_status: 'PREDICTED',
        predicted_decay_window: { start: '2026-07-01', end: '2026-07-10', confidence: 0.7 },
        decay_reason: 'fixture'
      }
    },
    {
      satellite_name: 'BAD DECAY',
      norad_id: '202',
      decay: { decay_status: 'CONFIRMED', decay_date: 'not-a-date' }
    }
  ];
  const confirmedDecays = new Map([
    ['200', {
      noradId: '200',
      decayDateIso: '2026-12-31',
      objectName: 'DUPLICATE ACTIVE',
      objectId: '1998-001A',
      objectType: 'PAY',
      launchDateIso: '1998-01-01',
      launchSite: 'TEST'
    }],
    ['300', {
      noradId: '300',
      decayDateIso: '2026-08-20',
      objectName: 'LATEST DECAYED',
      objectId: '2020-001A',
      objectType: 'PAY',
      launchDateIso: '2020-01-01',
      launchSite: 'AFETR'
    }],
    ['301', {
      noradId: '301',
      decayDateIso: 'bad-date',
      objectName: 'INVALID DECAY'
    }]
  ]);

  const reentryData = buildReentryTimelineData(activeSats, confirmedDecays);
  assert.strictEqual(reentryData.some(item => item.satellite.satellite_name === 'DUPLICATE ACTIVE'), false, 'confirmed records do not duplicate active TLE satellites');
  assert.strictEqual(reentryData.some(item => item.satellite.satellite_name === 'INVALID DECAY'), false, 'invalid decayed dates are skipped');
  const latestReentry = getLatestReentryEvent(reentryData);
  assert.strictEqual(latestReentry.satellite.satellite_name, 'LATEST DECAYED', 'latest re-entry can come from confirmed decayed data');
  assert.strictEqual(latestReentry.satellite.isDecayedTimelineRecord, true, 'inactive decayed records stay selectable as details-only records');
  assert.strictEqual(latestReentry.satellite.object_id, '2020-001A', 'decayed timeline record keeps object ID metadata');
  assert.strictEqual(latestReentry.satellite.launch_site, 'AFETR', 'decayed timeline record keeps launch-site metadata');
  const reentryRanges = getReentryTimelineRanges(reentryData, latestReentry);
  assert(reentryRanges.detailStart < latestReentry.time && latestReentry.time < reentryRanges.detailEnd, 're-entry viewport includes latest decay');

  const confirmedActive = {
    satellite_name: 'CONFIRMED ACTIVE',
    norad_id: '300',
    tle_line1: '1 00300U 20001A   26166.50000000  .00000000  00000+0  00000+0 0  9991',
    tle_line2: '2 00300  51.6000 120.0000 0001000  10.0000  20.0000 15.00000000  1001'
  };
  assert.strictEqual(applyConfirmedDecayRecord(confirmedActive, confirmedDecays), true, 'confirmed decay records apply before prediction');
  assert.strictEqual(confirmedActive.decay.decay_status, 'CONFIRMED', 'confirmed decay status takes precedence');
  assert.strictEqual(confirmedActive.decay.object_id, '2020-001A', 'confirmed decay metadata is copied to active satellites');

  const stableGeo = {
    satellite_name: 'STABLE GEO',
    norad_id: '400',
    orbit_class: 'GEO',
    perigee_km: 35780,
    estimated_altitude_km: 35786,
    mean_motion_rev_per_day: 1.0027,
    tle_line1: '1 00400U 20001A   26166.50000000  .00000000  00000+0  00000+0 0  9991',
    tle_line2: '2 00400   0.1000 120.0000 0001000  10.0000  20.0000  1.00270000  1001'
  };
  const stableLeo = {
    satellite_name: 'STABLE LEO',
    norad_id: '401',
    orbit_class: 'LEO',
    perigee_km: 550,
    estimated_altitude_km: 550,
    mean_motion_rev_per_day: 15.05,
    tle_line1: '1 00401U 20001A   26166.50000000  .00000000  00000+0  10000-4 0  9991',
    tle_line2: '2 00401  51.6000 120.0000 0001000  10.0000  20.0000 15.05000000  1001'
  };
  const decayingLeo = {
    satellite_name: 'LOW LEO',
    norad_id: '402',
    orbit_class: 'LEO',
    perigee_km: 180,
    estimated_altitude_km: 190,
    mean_motion_rev_per_day: 16.1,
    tle_line1: '1 00402U 20001A   26166.50000000  .00120000  00000+0  15000-2 0  9991',
    tle_line2: '2 00402  51.6000 120.0000 0001000  10.0000  20.0000 16.10000000  1001'
  };
  assert.strictEqual(isLikelyDecayCandidate(stableGeo, { confirmedDecays }), false, 'GEO satellites are not predicted by default');
  assert.strictEqual(isLikelyDecayCandidate(stableLeo, { confirmedDecays }), false, 'stable LEO satellites are not decay candidates');
  assert.strictEqual(isLikelyDecayCandidate(decayingLeo, { confirmedDecays }), true, 'low-perigee LEO satellites are decay candidates');

  const storage = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key) => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    },
    configurable: true
  });
  const cacheSource = {
    ...decayingLeo,
    decay: {
      decay_status: 'PREDICTED',
      decay_reason: 'fixture prediction',
      decay_date: null,
      predicted_decay_window: { start: '2026-07-01', end: '2026-07-02', confidence: 0.8 }
    }
  };
  const cacheOptions = { now: '2026-06-15T12:00:00Z' };
  const sameDayOptions = { now: '2026-06-15T23:59:00Z' };
  const nextDayOptions = { now: '2026-06-16T00:01:00Z' };
  assert(decayPredictionCacheKey(cacheSource, cacheOptions), 'prediction cache key includes NORAD and TLE identity');
  assert.strictEqual(decayPredictionCacheKey(cacheSource, cacheOptions), decayPredictionCacheKey(cacheSource, sameDayOptions), 'cache key reuses the same UTC day bucket');
  assert.notStrictEqual(decayPredictionCacheKey(cacheSource, cacheOptions), decayPredictionCacheKey(cacheSource, nextDayOptions), 'cache key changes across UTC days');
  assert.strictEqual(cacheDecayPrediction(cacheSource, cacheOptions), true, 'prediction can be cached');
  const cacheTarget = { ...decayingLeo, decay: null };
  assert.strictEqual(applyCachedDecayPrediction(cacheTarget, sameDayOptions), true, 'same-day cached prediction is reused');
  assert.strictEqual(cacheTarget.decay.decay_status, 'PREDICTED', 'cached prediction restores decay status');
  const nextDayTarget = { ...decayingLeo, decay: null };
  assert.strictEqual(applyCachedDecayPrediction(nextDayTarget, nextDayOptions), false, 'next-day cache miss triggers recomputation');

  const indexHtml = fs.readFileSync('index.html', 'utf8');
  assert(indexHtml.includes('isDecayedTimelineRecord'), 'index handles inactive decayed timeline records');
  assert(indexHtml.includes('!activeTleSat'), 'timeline selection avoids active propagation for missing TLE satellites');
  assert(indexHtml.includes('isLikelyDecayCandidate'), 'startup filters active decay prediction candidates');
  assert(indexHtml.includes('applyCachedDecayPrediction'), 'startup reuses cached decay predictions');
  assert(indexHtml.includes('setStatusNote'), 're-entry timeline can show non-blocking prediction status');

  console.log('timelineFreshness tests passed');
}

run();
