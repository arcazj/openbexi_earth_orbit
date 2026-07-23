CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
);

CREATE TABLE catalog_revisions (
    revision_id TEXT PRIMARY KEY,
    schema_version TEXT NOT NULL,
    source_id TEXT NOT NULL,
    dataset_id TEXT NOT NULL,
    snapshot_path TEXT NOT NULL,
    metadata_path TEXT,
    dataset_format TEXT NOT NULL,
    adapter_version TEXT NOT NULL,
    dataset_hash TEXT NOT NULL,
    source_status TEXT NOT NULL CHECK (source_status IN ('COMPLETE', 'PARTIAL', 'DEGRADED')),
    retrieved_at TEXT,
    created_at TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    metadata_hash TEXT NOT NULL,
    provenance_json TEXT NOT NULL,
    provenance_hash TEXT NOT NULL,
    object_count INTEGER NOT NULL CHECK (object_count >= 0),
    accepted_count INTEGER NOT NULL CHECK (accepted_count >= 0),
    quarantined_count INTEGER NOT NULL CHECK (quarantined_count >= 0),
    is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
    UNIQUE (source_id, dataset_hash)
);

CREATE UNIQUE INDEX catalog_revisions_one_current
    ON catalog_revisions(is_current) WHERE is_current = 1;
CREATE INDEX catalog_revisions_created_order
    ON catalog_revisions(created_at DESC, revision_id DESC);

CREATE TABLE catalog_objects (
    object_id TEXT PRIMARY KEY,
    current_revision_id TEXT NOT NULL REFERENCES catalog_revisions(revision_id) ON DELETE RESTRICT,
    current_element_set_id TEXT,
    name TEXT NOT NULL,
    norad_id TEXT,
    international_designator TEXT,
    object_type TEXT NOT NULL,
    lifecycle_status TEXT NOT NULL CHECK (
        lifecycle_status IN ('ACTIVE', 'INACTIVE', 'DECAYED', 'RETIRED', 'UNKNOWN')
    ),
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX catalog_objects_lifecycle
    ON catalog_objects(lifecycle_status, object_id);
CREATE INDEX catalog_objects_current_revision
    ON catalog_objects(current_revision_id, object_id);

CREATE TABLE catalog_object_observations (
    observation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    catalog_revision_id TEXT NOT NULL REFERENCES catalog_revisions(revision_id) ON DELETE RESTRICT,
    object_id TEXT NOT NULL REFERENCES catalog_objects(object_id) ON DELETE RESTRICT,
    observed_at TEXT NOT NULL,
    observation_status TEXT NOT NULL CHECK (
        observation_status IN ('NEW', 'OBSERVED', 'CHANGED', 'ABSENT', 'REAPPEARED', 'DECAYED', 'RETIRED')
    ),
    lifecycle_status TEXT NOT NULL CHECK (
        lifecycle_status IN ('ACTIVE', 'INACTIVE', 'DECAYED', 'RETIRED', 'UNKNOWN')
    ),
    element_set_id TEXT,
    payload_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
    UNIQUE (catalog_revision_id, object_id)
);

CREATE UNIQUE INDEX catalog_observations_one_current
    ON catalog_object_observations(object_id) WHERE is_current = 1;
CREATE INDEX catalog_observations_revision
    ON catalog_object_observations(catalog_revision_id, object_id);

CREATE TABLE screening_jobs (
    job_id TEXT PRIMARY KEY,
    schema_version TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_json TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    catalog_revision_id TEXT NOT NULL REFERENCES catalog_revisions(revision_id) ON DELETE RESTRICT,
    state TEXT NOT NULL CHECK (
        state IN ('QUEUED', 'RUNNING', 'CANCEL_REQUESTED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT')
    ),
    max_attempts INTEGER NOT NULL CHECK (max_attempts >= 1),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    progress_sequence INTEGER NOT NULL DEFAULT 0 CHECK (progress_sequence >= 0),
    progress_fraction REAL NOT NULL DEFAULT 0 CHECK (progress_fraction >= 0 AND progress_fraction <= 1),
    progress_stage TEXT,
    cancel_requested_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    worker_id TEXT,
    result_json TEXT,
    result_hash TEXT,
    error_json TEXT,
    error_hash TEXT,
    UNIQUE (owner_id, idempotency_key)
);

CREATE INDEX screening_jobs_state_order
    ON screening_jobs(state, created_at DESC, job_id DESC);
CREATE INDEX screening_jobs_owner_order
    ON screening_jobs(owner_id, created_at DESC, job_id DESC);
CREATE INDEX screening_jobs_catalog
    ON screening_jobs(catalog_revision_id, created_at DESC, job_id DESC);

CREATE TABLE screening_attempts (
    attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL REFERENCES screening_jobs(job_id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
    state TEXT NOT NULL CHECK (
        state IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'INTERRUPTED')
    ),
    worker_id TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    error_json TEXT,
    error_hash TEXT,
    UNIQUE (job_id, attempt_number)
);

CREATE INDEX screening_attempts_job
    ON screening_attempts(job_id, attempt_number);

CREATE TABLE job_progress (
    job_id TEXT NOT NULL REFERENCES screening_jobs(job_id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL CHECK (sequence >= 1),
    attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
    stage TEXT NOT NULL,
    fraction REAL NOT NULL CHECK (fraction >= 0 AND fraction <= 1),
    payload_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (job_id, sequence),
    FOREIGN KEY (job_id, attempt_number)
        REFERENCES screening_attempts(job_id, attempt_number) ON DELETE CASCADE
);

CREATE TABLE event_outbox (
    outbox_id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT REFERENCES screening_jobs(job_id) ON DELETE CASCADE,
    progress_sequence INTEGER,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX event_outbox_job_order
    ON event_outbox(job_id, outbox_id);

CREATE TABLE conjunction_candidates (
    candidate_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES screening_jobs(job_id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
    pair_key TEXT NOT NULL,
    interval_start_utc TEXT NOT NULL,
    interval_end_utc TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (job_id, attempt_number, pair_key, interval_start_utc, interval_end_utc),
    FOREIGN KEY (job_id, attempt_number)
        REFERENCES screening_attempts(job_id, attempt_number) ON DELETE CASCADE
);

CREATE INDEX conjunction_candidates_job_pair
    ON conjunction_candidates(job_id, pair_key, interval_start_utc, candidate_id);

CREATE TABLE conjunction_events (
    event_revision_id TEXT PRIMARY KEY,
    conjunction_id TEXT NOT NULL,
    job_id TEXT NOT NULL REFERENCES screening_jobs(job_id) ON DELETE RESTRICT,
    attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
    pair_key TEXT NOT NULL,
    object_a_id TEXT NOT NULL,
    object_b_id TEXT NOT NULL,
    tca_utc TEXT NOT NULL,
    miss_distance_km REAL NOT NULL CHECK (miss_distance_km >= 0),
    relative_speed_km_s REAL NOT NULL CHECK (relative_speed_km_s >= 0),
    supersedes_event_revision_id TEXT REFERENCES conjunction_events(event_revision_id) ON DELETE RESTRICT,
    payload_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (job_id, attempt_number, payload_hash),
    FOREIGN KEY (job_id, attempt_number)
        REFERENCES screening_attempts(job_id, attempt_number) ON DELETE RESTRICT
);

CREATE INDEX conjunction_events_tca_order
    ON conjunction_events(tca_utc, event_revision_id);
CREATE INDEX conjunction_events_job_order
    ON conjunction_events(job_id, tca_utc, event_revision_id);
CREATE INDEX conjunction_events_pair_order
    ON conjunction_events(pair_key, tca_utc, event_revision_id);
CREATE INDEX conjunction_events_object_a
    ON conjunction_events(object_a_id, tca_utc, event_revision_id);
CREATE INDEX conjunction_events_object_b
    ON conjunction_events(object_b_id, tca_utc, event_revision_id);

CREATE TABLE conjunction_current (
    conjunction_id TEXT PRIMARY KEY,
    event_revision_id TEXT NOT NULL UNIQUE REFERENCES conjunction_events(event_revision_id) ON DELETE RESTRICT,
    updated_at TEXT NOT NULL
);

CREATE TRIGGER conjunction_events_immutable_update
BEFORE UPDATE ON conjunction_events
BEGIN
    SELECT RAISE(ABORT, 'conjunction event revisions are immutable');
END;

CREATE TRIGGER conjunction_events_immutable_delete
BEFORE DELETE ON conjunction_events
BEGIN
    SELECT RAISE(ABORT, 'conjunction event revisions are immutable');
END;

CREATE TABLE screening_errors (
    error_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES screening_jobs(job_id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
    stage TEXT NOT NULL,
    code TEXT NOT NULL,
    object_id TEXT,
    payload_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (job_id, attempt_number)
        REFERENCES screening_attempts(job_id, attempt_number) ON DELETE CASCADE
);

CREATE INDEX screening_errors_job
    ON screening_errors(job_id, attempt_number, error_id);

CREATE TABLE audit_records (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX audit_records_resource
    ON audit_records(resource_type, resource_id, audit_id);

CREATE TRIGGER audit_records_immutable_update
BEFORE UPDATE ON audit_records
BEGIN
    SELECT RAISE(ABORT, 'audit records are immutable');
END;

CREATE TRIGGER audit_records_immutable_delete
BEFORE DELETE ON audit_records
BEGIN
    SELECT RAISE(ABORT, 'audit records are immutable');
END;
