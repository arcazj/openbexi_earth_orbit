import assert from 'assert';
import {
  buildConjunctionExportPayload,
  buildConjunctionScreeningRequest,
  conjunctionEventMissDistanceKm,
  conjunctionEventQuality,
  conjunctionEventRelativeSpeedKmS,
  conjunctionEventSecondaryLabel,
  conjunctionRunQualityNotices,
  filterAndSortConjunctionEvents,
  formatUtcDateTimeLocal,
  parseUtcDateTimeLocal
} from '../js/conjunction/conjunctionPanel.js';

const start = new Date('2026-07-19T12:34:56.000Z');
assert.strictEqual(formatUtcDateTimeLocal(start), '2026-07-19T12:34:56');
assert.strictEqual(parseUtcDateTimeLocal('2026-07-19T12:34:56').toISOString(), start.toISOString());
assert.strictEqual(parseUtcDateTimeLocal('not-a-date'), null);

const primary = { norad_id: '25544', satellite_name: 'ISS', tle_line1: 'line-1', tle_line2: 'line-2' };
const secondary = { norad_id: '12345', satellite_name: 'TEST', tle_line1: 'line-1', tle_line2: 'line-2' };
const request = buildConjunctionScreeningRequest({
  primary,
  catalog: [primary, secondary],
  startTime: start,
  durationHours: 6,
  coarseStepSeconds: 60,
  screeningRadiusKm: 100,
  refinementToleranceSeconds: 0.5,
  maxResults: 100,
  dataset: {
    datasetId: 'fixture',
    datasetHash: 'test:fixture',
    source_id: 'fixture-source',
    provider: 'Fixture Provider',
    retrieved_at: start.toISOString(),
    source_status: 'COMPLETE',
    partial_update: false
  }
});

assert.strictEqual(request.options.start_time, start.toISOString());
assert.strictEqual(request.options.end_time, '2026-07-19T18:34:56.000Z');
assert.strictEqual(request.options.coarse_step_seconds, 60);
assert.strictEqual(request.options.screening_radius_km, 100);
assert.strictEqual(request.options.max_results, 100);
assert.strictEqual(request.time_scale, 'UTC');
assert.strictEqual(request.frame, 'TEME');
assert.strictEqual(request.primary_object_id, 'obx:norad:25544');
assert.strictEqual(request.configuration.configuration_version, '2.0.0');
assert.strictEqual(request.configuration.max_results, 100);
assert.strictEqual(request.dataset_provenance.provider, 'Fixture Provider');
assert.throws(() => buildConjunctionScreeningRequest({ primary: null, catalog: [secondary], startTime: start }), /primary/i);
assert.throws(() => buildConjunctionScreeningRequest({
  primary,
  catalog: Array(200).fill(secondary),
  startTime: start,
  durationHours: 24,
  coarseStepSeconds: 5,
  screeningRadiusKm: 100,
  refinementToleranceSeconds: 0.5,
  maxResults: 100
}), /work limit/i);

const events = [
  {
    eventId: 'later-close',
    tcaUtc: '2026-07-19T14:00:00.000Z',
    missDistanceKm: 2.5,
    relativeSpeedKmS: 8.25,
    secondary: { name: 'ALPHA', noradId: '20' }
  },
  {
    event_id: 'earlier-far',
    tca_utc: '2026-07-19T13:00:00.000Z',
    miss_distance_km: 15,
    relative_velocity_km_s: 12.5,
    secondary_object: { satellite_name: 'BETA', norad_id: '10' }
  }
];

assert.strictEqual(conjunctionEventMissDistanceKm(events[1]), 15);
assert.strictEqual(conjunctionEventRelativeSpeedKmS(events[1]), 12.5);
assert.strictEqual(conjunctionEventSecondaryLabel(events[1]), 'BETA (10)');
assert.strictEqual(filterAndSortConjunctionEvents(events, '', 'tca')[0], events[1]);
assert.strictEqual(filterAndSortConjunctionEvents(events, '', 'miss-distance')[0], events[0]);
assert.strictEqual(filterAndSortConjunctionEvents(events, '', 'relative-speed')[0], events[1]);
assert.deepStrictEqual(filterAndSortConjunctionEvents(events, 'alpha', 'tca'), [events[0]]);

const exported = buildConjunctionExportPayload(request, { events });
assert.match(exported.qualification, /Experimental TLE-based/);
assert.strictEqual(exported.limitations.collision_probability.status, 'unavailable');
assert.strictEqual(exported.result.events.length, 2);
assert.strictEqual(exported.request.catalog, undefined, 'exports do not duplicate the complete catalog');
assert.strictEqual(exported.request.catalogSnapshot.objectCount, 2);
assert.strictEqual(exported.request.catalogSnapshot.objects.length, 2);
assert.strictEqual(exported.request.catalogSnapshot.objects[1].element_set.line1, 'line-1');
assert.strictEqual(exported.replay.input_status, 'SELF_CONTAINED_FROZEN_CATALOG');

const canonicalEvent = {
  tca: '2026-07-19T13:30:00.000Z',
  miss_distance_km: 4.25,
  relative_speed_km_s: 9.75,
  secondary_name: 'CANONICAL',
  secondary_object_id: 'norad:42'
};
assert.strictEqual(conjunctionEventMissDistanceKm(canonicalEvent), 4.25);
assert.strictEqual(conjunctionEventRelativeSpeedKmS(canonicalEvent), 9.75);
assert.strictEqual(conjunctionEventSecondaryLabel(canonicalEvent), 'CANONICAL (NORAD 42)');
assert.strictEqual(conjunctionEventQuality({ quality_flags: ['SAME_TIME_TEME_STATES'] }), 'Nominal');
assert.strictEqual(conjunctionEventQuality({ quality_flags: ['STALE_ELEMENT_SET'] }), 'Review');
assert.strictEqual(conjunctionEventQuality({ quality_flags: ['INCOMPLETE_REFINEMENT_COVERAGE'] }), 'Review');
assert.strictEqual(conjunctionEventQuality({ quality_flags: ['COLOCATED_OR_COMMON_TLE_GEOMETRY'] }), 'Review');
assert.strictEqual(conjunctionEventQuality({ quality_flags: ['PROPAGATION_FAILED'] }), 'Invalid');
assert.deepStrictEqual(conjunctionRunQualityNotices({
  quality_flags: ['RESULT_LIMIT_APPLIED', 'STALE_INPUTS_AT_SCREEN_TIME'],
  statistics: { events_reported: 10, events_detected: 12, events_truncated: 2 }
}), [
  '2 additional events omitted by the result limit',
  'element sets exceed the screening-time freshness policy'
]);
assert.deepStrictEqual(conjunctionRunQualityNotices({
  quality_flags: ['FUTURE_EPOCH_INPUTS_AT_SCREEN_TIME', 'MISSING_ELEMENT_EPOCH_INPUTS']
}), [
  'some element epochs occur after the screening window',
  'some element epochs are unavailable'
]);

console.log('conjunctionPanel tests passed');
