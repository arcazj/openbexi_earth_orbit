import datetime as dt
import sqlite3
import tempfile
import unittest
from pathlib import Path

from services.v21.job_store import (
    IdempotencyConflictError,
    JobNotFoundError,
    JobStore,
    RetentionConflictError,
    SchemaVersionError,
    StateTransitionError,
    ValidationError,
)


class StepClock:
    def __init__(self):
        self.value = dt.datetime(2026, 7, 20, 12, 0, tzinfo=dt.timezone.utc)

    def __call__(self):
        value = self.value
        self.value += dt.timedelta(seconds=1)
        return value


class V21JobStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.path = Path(self.temporary.name) / "screening.sqlite3"
        self.clock = StepClock()
        self.store = JobStore(self.path, clock=self.clock)
        self.addCleanup(self._close_store)

    def _close_store(self):
        if self.store is not None:
            self.store.close()
            self.store = None

    def catalog(self, revision_id="catalog-1", object_ids=("100", "200"), promote=True):
        observations = [
            {
                "object_id": object_id,
                "name": "Object " + object_id,
                "norad_id": object_id,
                "object_type": "PAYLOAD",
                "lifecycle_status": "ACTIVE",
                "observation_status": "OBSERVED",
            }
            for object_id in object_ids
        ]
        return self.store.create_catalog_revision(
            revision_id=revision_id,
            source_id="test-source",
            dataset_id="dataset-" + revision_id,
            metadata={"freshness": "current", "revision": revision_id},
            observations=observations,
            snapshot_path="catalogs/%s/catalog.json" % revision_id,
            metadata_path="catalogs/%s/metadata.json" % revision_id,
            dataset_format="TLE_JSON",
            adapter_version="test-adapter/2.1.0",
            accepted_count=len(observations),
            quarantined_count=1,
            provenance={"provider": "test", "license_id": "fixture"},
            promote=promote,
        )

    def job(self, key="job-key", request=None, max_attempts=3, job_id=None, owner="owner-a"):
        if self.store.get_current_catalog_revision() is None:
            self.catalog()
        return self.store.create_job(
            key,
            request or {"horizon_hours": 24, "threshold_km": 5},
            self.store.get_current_catalog_revision()["revision_id"],
            owner_id=owner,
            max_attempts=max_attempts,
            job_id=job_id,
        )["job"]

    def test_migration_catalog_lifecycle_and_reopen(self):
        catalog = self.catalog()
        self.assertEqual(catalog["dataset_format"], "TLE_JSON")
        self.assertEqual(catalog["source_provenance"]["provider"], "test")
        self.assertTrue(catalog["dataset_hash"].startswith("sha256:"))
        self.assertEqual(catalog["accepted_count"], 2)
        self.assertEqual(self.store.get_current_object("100")["current_revision_id"], "catalog-1")
        self.assertEqual(len(self.store.get_catalog_observations("catalog-1")), 2)

        self.catalog("catalog-2", ("100", "300"))
        self.assertEqual(self.store.get_current_object("100")["current_revision_id"], "catalog-2")
        self.assertIsNone(self.store.get_current_object("200"))
        self.assertEqual(self.store.get_current_catalog_revision()["revision_id"], "catalog-2")
        page = self.store.list_catalog_revisions(limit=1)
        self.assertEqual(page["items"][0]["revision_id"], "catalog-2")
        self.assertIsNotNone(page["next_cursor"])
        self.assertEqual(
            self.store.list_catalog_revisions(limit=1, cursor=page["next_cursor"])["items"][0][
                "revision_id"
            ],
            "catalog-1",
        )
        self.catalog("catalog-staged", ("400",), promote=False)
        self.assertIsNone(self.store.get_current_object("400"))
        self.assertEqual(self.store.get_current_catalog_revision()["revision_id"], "catalog-2")

        self._close_store()
        self.store = JobStore(self.path, clock=self.clock)
        self.assertEqual(self.store.schema_version, 1)
        self.assertEqual(self.store.health()["status"], "healthy")
        self.assertEqual(self.store.get_current_catalog_revision()["snapshot_path"], "catalogs/catalog-2/catalog.json")

    def test_atomic_job_idempotency_and_conflict(self):
        self.catalog()
        first = self.store.create_job(
            "repeatable", {"threshold_km": 5, "horizon_hours": 24}, "catalog-1", job_id="job-a"
        )
        second = self.store.create_job(
            "repeatable", {"horizon_hours": 24, "threshold_km": 5}, "catalog-1", job_id="ignored"
        )
        self.assertTrue(first["created"])
        self.assertFalse(second["created"])
        self.assertEqual(second["job"]["job_id"], "job-a")
        self.assertEqual(second["job"]["request"], {"horizon_hours": 24, "threshold_km": 5})
        self.assertTrue(second["job"]["request_hash"].startswith("sha256:"))
        with self.assertRaises(IdempotencyConflictError):
            self.store.create_job("repeatable", {"threshold_km": 6}, "catalog-1")
        self.assertEqual(self.store.stats()["record_counts"]["screening_jobs"], 1)

    def test_validated_transitions_and_interrupted_recovery(self):
        job = self.job(max_attempts=2)
        with self.assertRaises(StateTransitionError):
            self.store.transition_job(job["job_id"], "SUCCEEDED")
        claimed = self.store.claim_next_job("worker-1")
        self.assertEqual(claimed["state"], "RUNNING")
        self.store.update_progress(
            job["job_id"], "propagation", 0.4, expected_attempt=1, worker_id="worker-1"
        )

        self._close_store()
        self.store = JobStore(self.path, clock=self.clock)
        recovery = self.store.recover_interrupted_jobs()
        self.assertEqual(recovery["requeued"], [job["job_id"]])
        self.assertEqual(self.store.list_attempts(job["job_id"])[0]["state"], "INTERRUPTED")
        self.assertEqual(self.store.claim_next_job("worker-2")["attempt_count"], 2)

        self._close_store()
        self.store = JobStore(self.path, clock=self.clock)
        recovery = self.store.recover_interrupted_jobs()
        self.assertEqual(recovery["failed"], [job["job_id"]])
        failed = self.store.get_job(job["job_id"])
        self.assertEqual(failed["state"], "FAILED")
        self.assertEqual(failed["error"]["code"], "INTERRUPTED_MAX_ATTEMPTS")
        self.assertIsNone(self.store.claim_next_job("worker-3"))

    def test_result_import_is_atomic_idempotent_and_persistent(self):
        job = self.job()
        self.store.claim_next_job("worker-1")
        self.store.update_progress(
            job["job_id"],
            "broad-phase",
            0.25,
            {"pairs": 1},
            expected_attempt=1,
            worker_id="worker-1",
        )
        candidate = {
            "object_a_id": "100",
            "object_b_id": "200",
            "interval_start": "2026-07-21T00:00:00Z",
            "interval_end": "2026-07-21T00:02:00Z",
        }
        event = {
            "object_a_id": "200",
            "object_b_id": "100",
            "tca": "2026-07-21T00:01:00Z",
            "miss_distance_km": 0.75,
            "relative_velocity_km_s": 12.1,
            "risk_class": "UNVALIDATED",
        }
        error = {"stage": "covariance", "code": "COVARIANCE_UNAVAILABLE", "object_id": "100"}
        result = self.store.import_result(
            job["job_id"],
            candidates=[candidate],
            events=[event],
            errors=[error],
            summary={"scientific_status": "PARTIAL", "collision_probability_available": False},
            expected_attempt=1,
            worker_id="worker-1",
        )
        self.assertEqual(result["state"], "SUCCEEDED")
        self.assertEqual(result["result"]["summary"]["scientific_status"], "PARTIAL")
        self.assertEqual(result["result"]["event_count"], 1)
        repeated = self.store.import_result(
            job["job_id"],
            candidates=[candidate],
            events=[event],
            errors=[error],
            summary={"scientific_status": "PARTIAL", "collision_probability_available": False},
            expected_attempt=1,
            worker_id="worker-1",
        )
        self.assertEqual(repeated["result_hash"], result["result_hash"])

        self._close_store()
        self.store = JobStore(self.path, clock=self.clock)
        self.assertEqual(self.store.get_job(job["job_id"])["state"], "SUCCEEDED")
        self.assertEqual(self.store.list_candidates(job["job_id"])[0]["pair_key"], "100|200")
        event_record = self.store.list_events(job_id=job["job_id"])["items"][0]
        self.assertEqual(event_record["relative_speed_km_s"], 12.1)
        self.assertEqual(self.store.get_event(event_record["conjunction_id"])["event_revision_id"], event_record["event_revision_id"])
        self.assertEqual(self.store.list_errors(job["job_id"])[0]["code"], "COVARIANCE_UNAVAILABLE")
        self.assertEqual(len(self.store.list_progress(job["job_id"])), 1)
        self.assertGreaterEqual(len(self.store.list_outbox(job_id=job["job_id"])), 5)

    def test_stale_worker_cannot_mutate_a_reclaimed_attempt(self):
        job = self.job(key="fenced", job_id="fenced", max_attempts=2)
        first = self.store.claim_next_job("worker-old")
        self.store.finish_attempt(
            job["job_id"],
            "FAILED",
            error={"code": "RETRY"},
            expected_attempt=first["attempt_count"],
            worker_id="worker-old",
        )
        self.store.retry_job(job["job_id"])
        second = self.store.claim_next_job("worker-new")
        self.assertEqual(second["attempt_count"], 2)

        with self.assertRaises(StateTransitionError):
            self.store.update_progress(
                job["job_id"],
                "late-progress",
                0.5,
                expected_attempt=1,
                worker_id="worker-old",
            )
        with self.assertRaises(StateTransitionError):
            self.store.finish_attempt(
                job["job_id"],
                "FAILED",
                expected_attempt=1,
                worker_id="worker-old",
            )
        with self.assertRaises(StateTransitionError):
            self.store.import_result(
                job["job_id"], expected_attempt=1, worker_id="worker-old"
            )
        with self.assertRaises(StateTransitionError):
            self.store.update_progress(
                job["job_id"],
                "wrong-worker",
                0.5,
                expected_attempt=2,
                worker_id="worker-old",
            )
        with self.assertRaises(StateTransitionError):
            self.store.transition_job(job["job_id"], "SUCCEEDED")
        with self.assertRaises(StateTransitionError):
            self.store.finish_attempt(
                job["job_id"],
                "SUCCEEDED",
                expected_attempt=2,
                worker_id="worker-new",
            )

        progress = self.store.update_progress(
            job["job_id"],
            "current-attempt",
            0.5,
            expected_attempt=2,
            worker_id="worker-new",
        )
        self.assertEqual(progress["attempt_number"], 2)

    def test_import_order_is_canonical_and_same_pair_encounters_remain_distinct(self):
        job = self.job(key="canonical-result", job_id="canonical-result")
        claimed = self.store.claim_next_job("worker-canonical")
        candidates = [
            {
                "object_a_id": "100",
                "object_b_id": "200",
                "interval_start": "2026-07-21T01:00:00Z",
                "interval_end": "2026-07-21T01:02:00Z",
            },
            {
                "object_a_id": "100",
                "object_b_id": "200",
                "interval_start": "2026-07-21T03:00:00Z",
                "interval_end": "2026-07-21T03:02:00Z",
            },
        ]
        events = [
            {
                "event_id": "engine:event:first",
                "object_a_id": "100",
                "object_b_id": "200",
                "tca": "2026-07-21T01:01:00Z",
                "miss_distance_km": 1.0,
                "relative_velocity_km_s": 10.0,
            },
            {
                "event_id": "engine:event:second",
                "object_a_id": "100",
                "object_b_id": "200",
                "tca": "2026-07-21T03:01:00Z",
                "miss_distance_km": 2.0,
                "relative_velocity_km_s": 11.0,
            },
        ]
        errors = [
            {"stage": "covariance", "code": "MISSING_A", "object_id": "100"},
            {"stage": "covariance", "code": "MISSING_B", "object_id": "200"},
        ]
        first = self.store.import_result(
            job["job_id"],
            candidates=candidates,
            events=events,
            errors=errors,
            summary={"scientific_status": "PARTIAL"},
            expected_attempt=claimed["attempt_count"],
            worker_id="worker-canonical",
        )
        replay = self.store.import_result(
            job["job_id"],
            candidates=reversed(candidates),
            events=reversed(events),
            errors=reversed(errors),
            summary={"scientific_status": "PARTIAL"},
            expected_attempt=claimed["attempt_count"],
            worker_id="worker-canonical",
        )
        self.assertEqual(replay["result_hash"], first["result_hash"])

        records = self.store.list_events(job_id=job["job_id"])["items"]
        self.assertEqual(
            {record["event_revision_id"] for record in records},
            {"engine:event:first", "engine:event:second"},
        )
        self.assertEqual(len({record["conjunction_id"] for record in records}), 2)
        self.assertEqual(len(self.store.list_events(current_only=True)["items"]), 2)

    def test_explicit_conjunction_revisions_select_current_deterministically(self):
        first_job = self.job(key="revision-a", job_id="revision-a")
        first_claim = self.store.claim_next_job("worker-revision-a")
        base_event = {
            "event_id": "engine:revision:a",
            "conjunction_id": "encounter:100:200:20260721T0101",
            "object_a_id": "100",
            "object_b_id": "200",
            "tca": "2026-07-21T01:01:00Z",
            "miss_distance_km": 1.0,
            "relative_velocity_km_s": 10.0,
        }
        self.store.import_result(
            first_job["job_id"],
            events=[base_event],
            expected_attempt=first_claim["attempt_count"],
            worker_id="worker-revision-a",
        )

        second_job = self.job(key="revision-b", job_id="revision-b")
        second_claim = self.store.claim_next_job("worker-revision-b")
        revised_event = dict(base_event)
        revised_event.update(
            {
                "event_id": "engine:revision:b",
                "supersedes_event_revision_id": "engine:revision:a",
                "tca": "2026-07-21T01:01:01Z",
                "miss_distance_km": 0.9,
            }
        )
        self.store.import_result(
            second_job["job_id"],
            events=[revised_event],
            expected_attempt=second_claim["attempt_count"],
            worker_id="worker-revision-b",
        )
        current = self.store.get_event("encounter:100:200:20260721T0101")
        self.assertEqual(current["event_revision_id"], "engine:revision:b")
        self.assertEqual(self.store.get_event("engine:revision:a")["miss_distance_km"], 1.0)

    def test_batch_supersession_is_topological_and_cannot_cross_conjunctions(self):
        job = self.job(key="batch-revisions", job_id="batch-revisions")
        claimed = self.store.claim_next_job("worker-batch-revisions")
        base = {
            "event_id": "z-base-revision",
            "conjunction_id": "encounter:batch",
            "object_a_id": "100",
            "object_b_id": "200",
            "tca": "2026-07-21T01:01:00Z",
            "miss_distance_km": 1.0,
            "relative_velocity_km_s": 10.0,
        }
        revision = dict(base)
        revision.update(
            {
                "event_id": "a-child-revision",
                "supersedes_event_revision_id": "z-base-revision",
                "tca": "2026-07-21T01:01:01Z",
                "miss_distance_km": 0.8,
            }
        )
        first = self.store.import_result(
            job["job_id"],
            events=[revision, base],
            expected_attempt=claimed["attempt_count"],
            worker_id="worker-batch-revisions",
        )
        replay = self.store.import_result(
            job["job_id"],
            events=[base, revision],
            expected_attempt=claimed["attempt_count"],
            worker_id="worker-batch-revisions",
        )
        self.assertEqual(replay["result_hash"], first["result_hash"])
        self.assertEqual(
            self.store.get_event("encounter:batch")["event_revision_id"],
            "a-child-revision",
        )

        invalid_job = self.job(key="cross-revision", job_id="cross-revision")
        invalid_claim = self.store.claim_next_job("worker-cross-revision")
        invalid = {
            "event_id": "cross-conjunction-revision",
            "conjunction_id": "encounter:other",
            "supersedes_event_revision_id": "a-child-revision",
            "object_a_id": "100",
            "object_b_id": "300",
            "tca": "2026-07-21T02:00:00Z",
            "miss_distance_km": 2.0,
            "relative_velocity_km_s": 11.0,
        }
        with self.assertRaises(ValidationError):
            self.store.import_result(
                invalid_job["job_id"],
                events=[invalid],
                expected_attempt=invalid_claim["attempt_count"],
                worker_id="worker-cross-revision",
            )
        self.assertEqual(self.store.get_job(invalid_job["job_id"])["state"], "RUNNING")
        self.assertEqual(self.store.list_events(job_id=invalid_job["job_id"])["items"], [])

    def test_attempt_children_require_a_real_attempt_and_bad_observations_fail_cleanly(self):
        with self.assertRaises(ValidationError):
            self.store.create_catalog_revision(
                revision_id="catalog-invalid",
                source_id="test-source",
                dataset_id="dataset-invalid",
                metadata={},
                observations=[42],
                snapshot_path="catalogs/invalid/catalog.json",
            )
        self.assertIsNone(self.store.get_catalog_revision("catalog-invalid"))

        job = self.job(key="fk-job", job_id="fk-job")
        connection = sqlite3.connect(str(self.path))
        self.addCleanup(connection.close)
        connection.execute("PRAGMA foreign_keys = ON")
        invalid_rows = [
            (
                """INSERT INTO job_progress(
                       job_id, sequence, attempt_number, stage, fraction,
                       payload_json, payload_hash, created_at
                   ) VALUES (?, 1, 99, 'invalid', 0, '{}', 'sha256:invalid', ?)""",
                (job["job_id"], "2026-07-21T00:00:00Z"),
            ),
            (
                """INSERT INTO conjunction_candidates(
                       candidate_id, job_id, attempt_number, pair_key,
                       interval_start_utc, interval_end_utc, payload_json,
                       payload_hash, created_at
                   ) VALUES ('invalid-candidate', ?, 99, '100|200', ?, ?, '{}',
                             'sha256:invalid', ?)""",
                (
                    job["job_id"],
                    "2026-07-21T00:00:00Z",
                    "2026-07-21T00:01:00Z",
                    "2026-07-21T00:00:00Z",
                ),
            ),
            (
                """INSERT INTO screening_errors(
                       error_id, job_id, attempt_number, stage, code, object_id,
                       payload_json, payload_hash, created_at
                   ) VALUES ('invalid-error', ?, 99, 'test', 'INVALID', NULL,
                             '{}', 'sha256:invalid', ?)""",
                (job["job_id"], "2026-07-21T00:00:00Z"),
            ),
            (
                """INSERT INTO conjunction_events(
                       event_revision_id, conjunction_id, job_id, attempt_number,
                       pair_key, object_a_id, object_b_id, tca_utc,
                       miss_distance_km, relative_speed_km_s,
                       supersedes_event_revision_id, payload_json, payload_hash, created_at
                   ) VALUES ('invalid-event', 'invalid-conjunction', ?, 99,
                             '100|200', '100', '200', ?, 1, 2, NULL,
                             '{}', 'sha256:invalid', ?)""",
                (
                    job["job_id"],
                    "2026-07-21T00:00:00Z",
                    "2026-07-21T00:00:00Z",
                ),
            ),
        ]
        for statement, parameters in invalid_rows:
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(statement, parameters)
            connection.rollback()
        self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_job_and_event_keyset_pagination_and_filters(self):
        self.catalog()
        for index in range(4):
            self.job(
                key="key-%d" % index,
                request={"index": index},
                job_id="job-%d" % index,
                owner="owner-a" if index < 3 else "owner-b",
            )
        first_page = self.store.list_jobs(limit=2, owner_id="owner-a")
        second_page = self.store.list_jobs(limit=2, owner_id="owner-a", cursor=first_page["next_cursor"])
        ids = [item["job_id"] for item in first_page["items"] + second_page["items"]]
        self.assertEqual(len(ids), 3)
        self.assertEqual(len(set(ids)), 3)
        with self.assertRaises(ValidationError):
            self.store.list_jobs(limit=2, owner_id="owner-b", cursor=first_page["next_cursor"])

        claimed = self.store.claim_next_job("worker-events")
        events = []
        for index, miss in enumerate((3.0, 0.5, 1.25, 8.0)):
            events.append(
                {
                    "object_a_id": "100",
                    "object_b_id": str(300 + index),
                    "tca": "2026-07-21T0%d:00:00Z" % index,
                    "miss_distance_km": miss,
                    "relative_velocity_km_s": 10 + index,
                }
            )
        self.store.import_result(
            claimed["job_id"],
            events=events,
            expected_attempt=claimed["attempt_count"],
            worker_id="worker-events",
        )
        page = self.store.list_events(limit=2, max_miss_distance_km=3.0, order="miss_distance_asc")
        page_two = self.store.list_events(
            limit=2,
            max_miss_distance_km=3.0,
            order="miss_distance_asc",
            cursor=page["next_cursor"],
        )
        distances = [item["miss_distance_km"] for item in page["items"] + page_two["items"]]
        self.assertEqual(distances, [0.5, 1.25, 3.0])
        self.assertEqual(len(self.store.list_events(object_id="100")["items"]), 4)
        self.assertEqual(
            len(
                self.store.list_events(
                    tca_from="2026-07-21T01:00:00Z", tca_to="2026-07-21T02:00:00Z"
                )["items"]
            ),
            2,
        )

    def test_cancellation_is_durable_and_idempotent(self):
        queued = self.job(key="queued-cancel", job_id="queued-cancel")
        cancelled = self.store.request_cancellation(queued["job_id"], actor_id="owner-a")
        self.assertEqual(cancelled["state"], "CANCELLED")
        self.assertEqual(self.store.request_cancellation(queued["job_id"])["state"], "CANCELLED")

        running = self.job(key="running-cancel", job_id="running-cancel")
        self.assertEqual(self.store.claim_next_job("worker-cancel")["job_id"], running["job_id"])
        requested = self.store.request_cancellation(running["job_id"], actor_id="owner-a")
        self.assertEqual(requested["state"], "CANCEL_REQUESTED")
        finished = self.store.finish_attempt(
            running["job_id"],
            "CANCELLED",
            expected_attempt=1,
            worker_id="worker-cancel",
            actor_id="worker-cancel",
        )
        self.assertEqual(finished["state"], "CANCELLED")
        self.assertEqual(self.store.list_attempts(running["job_id"])[0]["state"], "CANCELLED")

    def test_retention_refuses_active_or_event_history_and_preserves_audit(self):
        active = self.job(key="active", job_id="active")
        with self.assertRaises(RetentionConflictError):
            self.store.delete_job(active["job_id"], "2030-01-01T00:00:00Z")
        self.store.request_cancellation(active["job_id"])

        disposable = self.job(key="failed", job_id="failed")
        self.store.transition_job(disposable["job_id"], "RUNNING", worker_id="worker-failed")
        self.store.finish_attempt(
            disposable["job_id"],
            "FAILED",
            error={"code": "TEST"},
            expected_attempt=1,
            worker_id="worker-failed",
        )
        with self.assertRaises(RetentionConflictError):
            self.store.delete_job(disposable["job_id"], "2030-01-01T00:00:00Z")
        self.assertTrue(
            self.store.delete_job(
                disposable["job_id"],
                "2030-01-01T00:00:00Z",
                discard_unconsumed_outbox=True,
            )
        )
        with self.assertRaises(JobNotFoundError):
            self.store.get_job(disposable["job_id"])
        audits = self.store.list_audit_records("screening_job", disposable["job_id"])
        self.assertEqual(audits[-1]["action"], "job.deleted")

        durable = self.job(key="durable", job_id="durable")
        self.store.transition_job(durable["job_id"], "RUNNING", worker_id="worker-durable")
        self.store.import_result(
            durable["job_id"],
            events=[
                {
                    "object_a_id": "100",
                    "object_b_id": "200",
                    "tca": "2026-07-22T00:00:00Z",
                    "miss_distance_km": 1,
                    "relative_velocity_km_s": 2,
                }
            ],
            expected_attempt=1,
            worker_id="worker-durable",
        )
        with self.assertRaises(RetentionConflictError):
            self.store.delete_job(durable["job_id"], "2030-01-01T00:00:00Z")
        before = self.store.list_outbox(job_id=durable["job_id"])
        retained = self.store.prune_job_intermediates(
            durable["job_id"], "2030-01-01T00:00:00Z"
        )
        self.assertEqual(retained["event_outbox_retained"], len(before))
        self.assertEqual(self.store.list_outbox(job_id=durable["job_id"]), before)
        discarded = self.store.prune_job_intermediates(
            durable["job_id"],
            "2030-01-01T00:00:00Z",
            discard_unconsumed_outbox=True,
        )
        self.assertEqual(discarded["event_outbox"], len(before))
        self.assertEqual(self.store.list_outbox(job_id=durable["job_id"]), [])
        self.assertEqual(len(self.store.list_events(job_id=durable["job_id"])["items"]), 1)

    def test_newer_schema_is_refused_without_downgrade(self):
        newer_path = Path(self.temporary.name) / "newer.sqlite3"
        connection = sqlite3.connect(str(newer_path))
        connection.execute("PRAGMA user_version = 99")
        connection.close()
        with self.assertRaises(SchemaVersionError):
            JobStore(newer_path)
        verification = sqlite3.connect(str(newer_path))
        try:
            self.assertEqual(verification.execute("PRAGMA user_version").fetchone()[0], 99)
        finally:
            verification.close()


if __name__ == "__main__":
    unittest.main()
