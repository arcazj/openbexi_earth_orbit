import { stableFingerprint } from './objectIdentity.js';
import { LIFECYCLE_STATUS } from './orbitalPolicy.js';
import { V21_SCHEMA_VERSION } from './v21Contracts.js';

export const CATALOG_TRANSITION = Object.freeze({
    NEW: 'NEW',
    UNCHANGED: 'UNCHANGED',
    UPDATED: 'UPDATED',
    ABSENT: 'ABSENT',
    REAPPEARED: 'REAPPEARED',
    DECAYED: 'DECAYED',
    RETIRED: 'RETIRED'
});

function recordFingerprint(record) {
    return `fnv1a64:${stableFingerprint([
        record.object_id,
        record.name,
        record.object_type,
        record.orbit_class,
        record.lifecycle_status,
        record.element_set?.element_set_id,
        record.element_set?.epoch
    ].join('\n'))}`;
}

function previousIndex(previous) {
    const entries = Array.isArray(previous) ? previous : Object.values(previous ?? {});
    return new Map(entries.map(item => [item.object_id, item]));
}

function presentObservation(record, revisionId, observedAt, prior) {
    const fingerprint = recordFingerprint(record);
    let transition = CATALOG_TRANSITION.NEW;
    if (prior) {
        transition = prior.present !== true
            ? CATALOG_TRANSITION.REAPPEARED
            : prior.record_fingerprint === fingerprint
                ? CATALOG_TRANSITION.UNCHANGED
                : CATALOG_TRANSITION.UPDATED;
    }
    if (record.lifecycle_status === LIFECYCLE_STATUS.DECAYED) transition = CATALOG_TRANSITION.DECAYED;
    if (record.lifecycle_status === LIFECYCLE_STATUS.RETIRED) transition = CATALOG_TRANSITION.RETIRED;
    return Object.freeze({
        schema_version: V21_SCHEMA_VERSION,
        object_id: record.object_id,
        present: true,
        lifecycle_status: record.lifecycle_status,
        transition,
        revision_id: revisionId,
        observed_at: observedAt,
        first_seen_revision_id: prior?.first_seen_revision_id ?? revisionId,
        previous_revision_id: prior?.revision_id ?? null,
        missing_since_revision_id: null,
        record_fingerprint: fingerprint,
        element_set_id: record.element_set?.element_set_id ?? null,
        name: record.name,
        norad_id: record.norad_id ?? null,
        international_designator: record.international_designator ?? null,
        object_type: record.object_type,
        orbit_class: record.orbit_class
    });
}

export function reconcileCatalogLifecycle({ previous = [], current = [], revision_id, observed_at } = {}) {
    const revisionId = String(revision_id ?? '').trim();
    if (!revisionId) throw new TypeError('revision_id is required.');
    const observed = new Date(observed_at ?? Date.now());
    if (!Number.isFinite(observed.getTime())) throw new TypeError('observed_at must be a valid timestamp.');
    if (!Array.isArray(current)) throw new TypeError('current catalog must be an array.');

    const priorById = previousIndex(previous);
    const currentIds = new Set();
    const observations = [];
    const timestamp = observed.toISOString();
    for (const record of [...current].sort((left, right) => left.object_id.localeCompare(right.object_id))) {
        if (!record?.object_id || currentIds.has(record.object_id)) {
            throw new TypeError(`Current catalog contains a missing or duplicate object_id: ${record?.object_id ?? ''}.`);
        }
        currentIds.add(record.object_id);
        observations.push(presentObservation(record, revisionId, timestamp, priorById.get(record.object_id)));
    }

    for (const prior of [...priorById.values()].sort((left, right) => left.object_id.localeCompare(right.object_id))) {
        if (currentIds.has(prior.object_id)) continue;
        observations.push(Object.freeze({
            ...prior,
            schema_version: V21_SCHEMA_VERSION,
            present: false,
            transition: CATALOG_TRANSITION.ABSENT,
            revision_id: revisionId,
            observed_at: timestamp,
            previous_revision_id: prior.revision_id ?? null,
            missing_since_revision_id: prior.missing_since_revision_id ?? revisionId
        }));
    }

    observations.sort((left, right) => left.object_id.localeCompare(right.object_id));
    const counts = Object.fromEntries(Object.values(CATALOG_TRANSITION).map(value => [value, 0]));
    observations.forEach(item => { counts[item.transition] += 1; });
    return Object.freeze({
        schema_version: V21_SCHEMA_VERSION,
        revision_id: revisionId,
        observed_at: timestamp,
        observations: Object.freeze(observations),
        counts: Object.freeze(counts)
    });
}
