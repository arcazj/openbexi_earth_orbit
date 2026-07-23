import assert from 'node:assert/strict';
import {
  buildIdentityEvidence,
  canonicalObjectPair,
  canonicalPairKey,
  catalogObjectId,
  conjunctionEventId,
  elementSetId,
  normalizeInternationalDesignator,
  normalizeNoradId,
  noradIdFromInternalObjectId,
  stableFingerprint
} from '../js/domain/objectIdentity.js';
import {
  CAPABILITY,
  CAPABILITY_MATURITY,
  DOMAIN_SCHEMA_VERSION,
  INITIAL_TIME_FRAME_POLICY,
  OBJECT_TYPE,
  ORBIT_CLASS,
  REFERENCE_FRAME,
  TIME_SCALE,
  evaluateCapability,
  freshnessStatus,
  normalizeObjectType,
  normalizeOrbitClass,
  normalizeUtcInstant
} from '../js/domain/orbitalPolicy.js';
import {
  CONTRACT_KIND,
  DOMAIN_SCHEMAS,
  normalizeComputationProvenance,
  normalizeConjunctionEvent,
  normalizeDatasetProvenance,
  normalizeScreeningRequest,
  normalizeScreeningResult,
  normalizeStateVector,
  validateConjunctionEvent,
  validateContract,
  validateDatasetProvenance,
  validateScreeningResult,
  validateStateVector
} from '../js/domain/contracts.js';

const datasetProvenance = normalizeDatasetProvenance({
  source_id: 'fixture-source',
  provider: 'Fixture Provider',
  retrieved_at: '2026-07-19T00:00:00Z',
  dataset_id: 'fixture-dataset-v1',
  dataset_hash: 'sha256:catalog-fixture',
  source_uri: null,
  source_status: 'COMPLETE',
  partial_update: false,
  license_id: null
});

function computationProvenance(elementSetIds, generatedAt = '2026-07-19T00:00:00Z') {
  return normalizeComputationProvenance({
    dataset_id: datasetProvenance.dataset_id,
    dataset_hash: datasetProvenance.dataset_hash,
    generated_at: generatedAt,
    algorithm: {
      name: 'fixture-algorithm',
      version: '1.0.0',
      configuration_hash: 'sha256:configuration-fixture'
    },
    input_element_set_ids: elementSetIds
  });
}

function state(objectId, elementSetId, position, velocity) {
  return normalizeStateVector({
    object_id: objectId,
    element_set_id: elementSetId,
    timestamp: '2026-07-19T01:00:00Z',
    time_scale: TIME_SCALE.UTC,
    frame: REFERENCE_FRAME.TEME,
    position_km: position,
    velocity_km_s: velocity,
    provenance: computationProvenance([elementSetId], '2026-07-19T01:00:00Z'),
    quality_flags: ['FIXTURE_ONLY']
  });
}

function run() {
  assert.equal(DOMAIN_SCHEMA_VERSION, '2.0.0');
  assert.equal(normalizeNoradId('00042'), '42');
  assert.equal(normalizeNoradId('a1234'), 'A1234');
  assert.throws(() => normalizeNoradId('I1234'), /Invalid NORAD/);
  assert.equal(noradIdFromInternalObjectId('obx:norad:00042'), '42');
  assert.equal(noradIdFromInternalObjectId('obx:norad:a1234'), 'A1234');
  assert.equal(noradIdFromInternalObjectId('obx:cospar:1998-067a'), null);
  assert.equal(normalizeInternationalDesignator('1998-067a'), '1998-067A');
  assert.equal(catalogObjectId({ norad_id: '00042', name: 'ignored' }), 'obx:norad:42');
  assert.equal(catalogObjectId({ international_designator: '1998-067A' }), 'obx:cospar:1998-067a');
  assert.equal(
    catalogObjectId({ provider: 'Fixture Provider', provider_object_id: 'Object 7' }),
    'obx:provider:fixture-provider:object-7'
  );
  assert.throws(() => catalogObjectId({ name: 'name-is-not-an-identity' }), /Stable object identity/);
  assert.deepEqual(
    canonicalObjectPair('obx:norad:20', 'obx:norad:10'),
    ['obx:norad:10', 'obx:norad:20']
  );
  assert.equal(
    canonicalPairKey('obx:norad:20', 'obx:norad:10'),
    canonicalPairKey('obx:norad:10', 'obx:norad:20')
  );
  assert.equal(stableFingerprint('same-input'), stableFingerprint('same-input'));
  assert.notEqual(stableFingerprint('same-input'), stableFingerprint('different-input'));
  assert.match(elementSetId({ object_id: 'obx:norad:10', line1: 'a', line2: 'b' }), /^elset:tle:/);
  assert.match(conjunctionEventId({
    first_object_id: 'obx:norad:10',
    second_object_id: 'obx:norad:20',
    tca: '2026-07-19T01:00:00.000Z'
  }), /^conjunction:[a-f0-9]{16}$/);
  assert.equal(buildIdentityEvidence({ norad_id: '10' }).scheme, 'NORAD');

  assert.equal(normalizeUtcInstant('2026-07-19T01:02:03-04:00'), '2026-07-19T05:02:03.000Z');
  assert.throws(() => normalizeUtcInstant('2026-07-19T01:02:03'), /explicit UTC offset/);
  assert.throws(() => normalizeUtcInstant('2026-02-30T01:02:03Z'), /invalid calendar/);
  assert.throws(() => normalizeUtcInstant('2026-07-19T24:00:00Z'), /invalid calendar/);
  assert.equal(INITIAL_TIME_FRAME_POLICY.tle_native_state_frame, REFERENCE_FRAME.TEME);
  assert.equal(normalizeObjectType('R/B'), OBJECT_TYPE.ROCKET_BODY);
  assert.equal(normalizeOrbitClass('HRO'), ORBIT_CLASS.HEO);
  assert.equal(freshnessStatus(
    '2026-07-01T00:00:00Z', ORBIT_CLASS.LEO, '2026-07-09T00:00:00Z'
  ).status, 'STALE');
  assert.equal(evaluateCapability(CAPABILITY.COLLISION_PROBABILITY, []).enabled, false);
  assert.deepEqual(
    evaluateCapability(CAPABILITY.SELECTED_OBJECT_SCREENING, [
      'validated_propagation_fixture', 'same_time_same_frame', 'deterministic_screening_configuration'
    ]).missing_evidence,
    []
  );

  assert(Object.isFrozen(DOMAIN_SCHEMAS));
  Object.values(DOMAIN_SCHEMAS).forEach(schema => {
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.additionalProperties, false);
  });
  assert.equal(validateContract(CONTRACT_KIND.DATASET_PROVENANCE, datasetProvenance).valid, true);
  assert.equal(validateContract(CONTRACT_KIND.DATASET_PROVENANCE, {
    ...datasetProvenance,
    retrieved_at: null,
    source_status: 'DEGRADED'
  }).valid, true, 'unknown provider retrieval time is explicit and valid');
  assert.equal(validateDatasetProvenance({ ...datasetProvenance, unexpected: true }).valid, false);
  assert.equal(validateDatasetProvenance({ ...datasetProvenance, source_status: 'PARTIAL' }).valid, false);

  const primaryObjectId = 'obx:norad:10001';
  const secondaryObjectId = 'obx:norad:10002';
  const primaryElementSetId = 'elset:tle:obx:norad:10001:fixture';
  const secondaryElementSetId = 'elset:tle:obx:norad:10002:fixture';
  const primaryState = state(primaryObjectId, primaryElementSetId, { x: 7000, y: 0, z: 0 }, { x: 0, y: 7.5, z: 0 });
  const secondaryState = state(secondaryObjectId, secondaryElementSetId, { x: 7000.01, y: 0.02, z: 0.02 }, { x: 0, y: 7.49, z: 0.02 });
  assert.equal(validateStateVector(primaryState).valid, true);
  assert.equal(validateStateVector({ ...primaryState, extra: 1 }).valid, false);
  assert.equal(validateStateVector({ ...primaryState, position_km: { x: NaN, y: 0, z: 0 } }).valid, false);

  const request = normalizeScreeningRequest({
    request_id: 'screening-fixture',
    requested_at: '2026-07-19T00:00:00Z',
    primary_object_id: primaryObjectId,
    candidate_object_ids: [secondaryObjectId],
    dataset_id: datasetProvenance.dataset_id,
    dataset_hash: datasetProvenance.dataset_hash,
    dataset_provenance: datasetProvenance,
    start_time: '2026-07-19T00:00:00Z',
    end_time: '2026-07-20T00:00:00Z',
    time_scale: TIME_SCALE.UTC,
    frame: REFERENCE_FRAME.TEME,
    configuration: {
      configuration_version: '2.0.0',
      screening_radius_km: 10,
      horizon_seconds: 86400,
      coarse_step_seconds: 60,
      refinement_tolerance_seconds: 0.1,
      refinement_subdivisions: 16,
      max_results: 500,
      max_refinement_iterations: 64,
      max_relative_acceleration_km_s2: 0.02,
      coarse_padding_km: 0,
      yield_every_operations: 256,
      start_time: '2026-07-19T00:00:00Z',
      end_time: '2026-07-20T00:00:00Z'
    }
  });
  assert.equal(request.capability, CAPABILITY.SELECTED_OBJECT_SCREENING);
  assert.equal(request.maturity, CAPABILITY_MATURITY.EXPERIMENTAL);
  assert.throws(() => normalizeScreeningRequest({
    ...request,
    candidate_object_ids: [primaryObjectId]
  }), /validation failed/);

  const event = normalizeConjunctionEvent({
    request_id: request.request_id,
    primary_object_id: primaryObjectId,
    secondary_object_id: secondaryObjectId,
    primary_name: 'PRIMARY FIXTURE',
    secondary_name: 'SECONDARY FIXTURE',
    tca: primaryState.timestamp,
    time_scale: TIME_SCALE.UTC,
    frame: REFERENCE_FRAME.TEME,
    primary_state: primaryState,
    secondary_state: secondaryState,
    screening_radius_km: 10,
    collision_probability: null,
    collision_probability_method: null,
    covariance_status: 'UNAVAILABLE',
    hard_body_radius_km: null,
    primary_element_set: { element_set_id: primaryElementSetId, epoch: '2026-07-18T00:00:00Z', age_days: 1.0416666667 },
    secondary_element_set: { element_set_id: secondaryElementSetId, epoch: '2026-07-18T12:00:00Z', age_days: 0.5416666667 },
    dataset_provenance: datasetProvenance,
    provenance: computationProvenance([primaryElementSetId, secondaryElementSetId], primaryState.timestamp),
    quality_flags: ['COLLISION_PROBABILITY_UNAVAILABLE'],
    analysis: {
      refinement_iterations: 8,
      refinement_converged: true,
      boundary_event: false
    }
  });
  assert.equal(event.primary_state.object_id, primaryObjectId);
  assert.equal(event.secondary_state.object_id, secondaryObjectId);
  assert.equal(event.collision_probability, null);
  assert.equal(validateConjunctionEvent(event).valid, true);
  assert.equal(validateConjunctionEvent({ ...event, debug: true }).valid, false);
  assert.equal(validateConjunctionEvent({ ...event, tca: '2026-07-19T01:00:01Z' }).valid, false);
  assert.equal(validateConjunctionEvent({ ...event, collision_probability: 0.1, collision_probability_method: 'heuristic' }).valid, false);
  assert.equal(validateConjunctionEvent({
    ...event,
    primary_state: {
      ...event.primary_state,
      provenance: {
        ...event.primary_state.provenance,
        dataset_hash: 'sha256:different-catalog'
      }
    }
  }).valid, false);

  const result = normalizeScreeningResult({
    request_id: request.request_id,
    status: 'COMPLETED',
    started_at: '2026-07-19T00:00:00Z',
    completed_at: '2026-07-19T00:00:01Z',
    request,
    configuration: {
      configuration_version: '2.0.0',
      screening_radius_km: 10,
      horizon_seconds: 86400,
      coarse_step_seconds: 60,
      refinement_tolerance_seconds: 0.1,
      refinement_subdivisions: 16,
      max_results: 500,
      max_refinement_iterations: 64,
      max_relative_acceleration_km_s2: 0.02,
      coarse_padding_km: 0,
      yield_every_operations: 256,
      start_time: request.start_time,
      end_time: request.end_time
    },
    events: [event],
    statistics: {
      catalog_objects: 2,
      candidates_examined: 1,
      events_refined: 1,
      propagation_failures: 0,
      self_pairs_skipped: 1,
      coarse_intervals_tested: 10,
      coarse_candidates: 1,
      events_detected: 1,
      events_reported: 1,
      events_truncated: 0,
      truncated_error_count: 0
    },
    errors: [],
    dataset_provenance: datasetProvenance,
    provenance: computationProvenance([primaryElementSetId, secondaryElementSetId]),
    quality_flags: ['TLE_SGP4_SCREENING_ONLY']
  });
  assert.equal(validateScreeningResult(result).valid, true);
  assert.equal(validateScreeningResult({ ...result, events: [event, event] }).valid, false);
}

run();
console.log('domain foundation contract tests passed');
