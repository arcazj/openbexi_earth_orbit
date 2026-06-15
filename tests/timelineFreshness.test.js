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

  const indexHtml = fs.readFileSync('index.html', 'utf8');
  assert(indexHtml.includes('isDecayedTimelineRecord'), 'index handles inactive decayed timeline records');
  assert(indexHtml.includes('!activeTleSat'), 'timeline selection avoids active propagation for missing TLE satellites');

  console.log('timelineFreshness tests passed');
}

run();
