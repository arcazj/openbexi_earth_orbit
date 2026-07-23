"""Single-node durable storage for the v2.1 screening service.

The store deliberately owns transactions and state validation.  Callers never
need to coordinate multiple SQL statements to publish a durable state change.
"""

import base64
import binascii
import contextlib
import datetime as dt
import hashlib
import heapq
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import threading
from typing import Any, Callable, Dict, Iterable, Iterator, List, Optional, Sequence, Tuple
import uuid


SCHEMA_VERSION = "2.1.0"
TERMINAL_STATES = frozenset(("SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"))
JOB_STATES = frozenset(
    ("QUEUED", "RUNNING", "CANCEL_REQUESTED", "SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT")
)
_ALLOWED_TRANSITIONS = {
    "QUEUED": frozenset(("RUNNING", "CANCELLED")),
    "RUNNING": frozenset(("CANCEL_REQUESTED", "SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT")),
    "CANCEL_REQUESTED": frozenset(("CANCELLED", "FAILED", "TIMED_OUT")),
    "FAILED": frozenset(("QUEUED",)),
    "TIMED_OUT": frozenset(("QUEUED",)),
    "SUCCEEDED": frozenset(),
    "CANCELLED": frozenset(),
}
_DIGEST_RE = re.compile(r"^(?:sha256:)?([0-9a-fA-F]{64})$")


class JobStoreError(RuntimeError):
    """Base class for durable-store failures visible to service callers."""


class SchemaVersionError(JobStoreError):
    pass


class IdempotencyConflictError(JobStoreError):
    pass


class StateTransitionError(JobStoreError):
    pass


class JobNotFoundError(JobStoreError):
    pass


class RetentionConflictError(JobStoreError):
    pass


class ValidationError(JobStoreError):
    pass


def canonical_json(value: Any) -> str:
    """Return stable, strict JSON suitable for hashing and persisted envelopes."""

    try:
        return json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise ValidationError("value is not canonical-JSON serializable: %s" % exc) from exc


def sha256_json(value: Any) -> str:
    digest = hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()
    return "sha256:" + digest


def _require_text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValidationError("%s must be a non-empty string" % field)
    return value.strip()


def _normalise_digest(value: str, field: str) -> str:
    match = _DIGEST_RE.match(_require_text(value, field))
    if not match:
        raise ValidationError("%s must be a SHA-256 digest" % field)
    return "sha256:" + match.group(1).lower()


def _decode_json(value: Optional[str]) -> Any:
    return None if value is None else json.loads(value)


def _stable_identifier(prefix: str, value: Any) -> str:
    return prefix + hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()[:32]


class JobStore:
    """SQLite WAL persistence for one service process and its worker thread(s)."""

    def __init__(
        self,
        path: Any,
        clock: Optional[Callable[[], Any]] = None,
        busy_timeout_ms: int = 5000,
    ) -> None:
        self.path = str(path)
        self._clock = clock or (lambda: dt.datetime.now(dt.timezone.utc))
        self._lock = threading.RLock()
        self._closed = False
        self._conn = sqlite3.connect(
            self.path,
            isolation_level=None,
            check_same_thread=False,
            timeout=max(0.001, busy_timeout_ms / 1000.0),
        )
        self._conn.row_factory = sqlite3.Row
        try:
            self._conn.execute("PRAGMA foreign_keys = ON")
            self._conn.execute("PRAGMA busy_timeout = %d" % int(busy_timeout_ms))
            self._conn.execute("PRAGMA journal_mode = WAL")
            self._conn.execute("PRAGMA synchronous = NORMAL")
            self._apply_migrations()
        except Exception:
            self._conn.close()
            self._closed = True
            raise

    def __enter__(self) -> "JobStore":
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        self.close()

    def close(self) -> None:
        with self._lock:
            if not self._closed:
                self._conn.close()
                self._closed = True

    @property
    def schema_version(self) -> int:
        with self._lock:
            return int(self._conn.execute("PRAGMA user_version").fetchone()[0])

    def _now(self) -> str:
        value = self._clock()
        if isinstance(value, str):
            return self._timestamp(value, "clock")
        if not isinstance(value, dt.datetime):
            raise ValidationError("clock must return a datetime or ISO-8601 string")
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        return value.astimezone(dt.timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")

    @staticmethod
    def _timestamp(value: Any, field: str) -> str:
        if isinstance(value, dt.datetime):
            parsed = value
        elif isinstance(value, str) and value.strip():
            text = value.strip()
            try:
                parsed = dt.datetime.fromisoformat(text[:-1] + "+00:00" if text.endswith("Z") else text)
            except ValueError as exc:
                raise ValidationError("%s must be an ISO-8601 timestamp" % field) from exc
        else:
            raise ValidationError("%s must be an ISO-8601 timestamp" % field)
        if parsed.tzinfo is None:
            raise ValidationError("%s must include a timezone" % field)
        return parsed.astimezone(dt.timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")

    @contextlib.contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                yield self._conn
            except Exception:
                self._conn.execute("ROLLBACK")
                raise
            else:
                self._conn.execute("COMMIT")

    def _migration_files(self) -> List[Tuple[int, Path, str]]:
        directory = Path(__file__).with_name("migrations")
        migrations = []
        for path in sorted(directory.glob("[0-9][0-9][0-9][0-9]_*.sql")):
            version = int(path.name.split("_", 1)[0])
            migrations.append((version, path, path.read_text(encoding="utf-8")))
        if not migrations:
            raise SchemaVersionError("no database migrations are installed")
        expected = list(range(1, migrations[-1][0] + 1))
        if [entry[0] for entry in migrations] != expected:
            raise SchemaVersionError("database migrations are not contiguous")
        return migrations

    def _apply_migrations(self) -> None:
        migrations = self._migration_files()
        supported = migrations[-1][0]
        current = int(self._conn.execute("PRAGMA user_version").fetchone()[0])
        if current > supported:
            raise SchemaVersionError(
                "database schema version %d is newer than supported version %d" % (current, supported)
            )

        if current:
            table = self._conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'"
            ).fetchone()
            if not table:
                raise SchemaVersionError("versioned database is missing schema_migrations")

        for version, path, sql in migrations:
            checksum = "sha256:" + hashlib.sha256(sql.encode("utf-8")).hexdigest()
            if version <= current:
                row = self._conn.execute(
                    "SELECT name, checksum FROM schema_migrations WHERE version = ?", (version,)
                ).fetchone()
                if row is None or row["name"] != path.name or row["checksum"] != checksum:
                    raise SchemaVersionError("migration %d does not match the applied schema" % version)
                continue

            try:
                self._conn.executescript("BEGIN IMMEDIATE;\n" + sql)
                self._conn.execute(
                    "INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
                    (version, path.name, checksum, self._now()),
                )
                self._conn.execute("PRAGMA user_version = %d" % version)
                self._conn.execute("COMMIT")
            except Exception:
                if self._conn.in_transaction:
                    self._conn.execute("ROLLBACK")
                raise
            current = version

    @staticmethod
    def _catalog_from_row(row: sqlite3.Row) -> Dict[str, Any]:
        result = dict(row)
        result["metadata"] = _decode_json(result.pop("metadata_json"))
        result["provenance"] = _decode_json(result.pop("provenance_json"))
        result["source_provenance"] = result["provenance"]
        result["format"] = result["dataset_format"]
        result["is_current"] = bool(result["is_current"])
        return result

    @staticmethod
    def _job_from_row(row: sqlite3.Row) -> Dict[str, Any]:
        result = dict(row)
        result["request"] = _decode_json(result.pop("request_json"))
        result["result"] = _decode_json(result.pop("result_json"))
        result["error"] = _decode_json(result.pop("error_json"))
        return result

    @staticmethod
    def _payload_from_row(row: sqlite3.Row) -> Dict[str, Any]:
        result = dict(row)
        result["payload"] = _decode_json(result.pop("payload_json"))
        return result

    def _audit(
        self,
        conn: sqlite3.Connection,
        actor_id: str,
        action: str,
        resource_type: str,
        resource_id: str,
        payload: Any,
        now: Optional[str] = None,
    ) -> None:
        encoded = canonical_json(payload)
        conn.execute(
            """INSERT INTO audit_records(
                   actor_id, action, resource_type, resource_id,
                   payload_json, payload_hash, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                _require_text(actor_id, "actor_id"),
                _require_text(action, "action"),
                _require_text(resource_type, "resource_type"),
                _require_text(resource_id, "resource_id"),
                encoded,
                sha256_json(payload),
                now or self._now(),
            ),
        )

    def _outbox(
        self,
        conn: sqlite3.Connection,
        event_type: str,
        payload: Any,
        job_id: Optional[str] = None,
        progress_sequence: Optional[int] = None,
        now: Optional[str] = None,
    ) -> None:
        encoded = canonical_json(payload)
        conn.execute(
            """INSERT INTO event_outbox(
                   job_id, progress_sequence, event_type, payload_json, payload_hash, created_at
               ) VALUES (?, ?, ?, ?, ?, ?)""",
            (job_id, progress_sequence, event_type, encoded, sha256_json(payload), now or self._now()),
        )

    def create_catalog_revision(
        self,
        revision_id: str,
        source_id: str,
        dataset_id: str,
        metadata: Optional[Dict[str, Any]],
        observations: Optional[Iterable[Dict[str, Any]]],
        snapshot_path: str,
        metadata_path: Optional[str] = None,
        dataset_format: str = "json",
        adapter_version: str = SCHEMA_VERSION,
        accepted_count: Optional[int] = None,
        quarantined_count: int = 0,
        provenance: Optional[Dict[str, Any]] = None,
        dataset_hash: Optional[str] = None,
        schema_version: str = SCHEMA_VERSION,
        source_status: str = "COMPLETE",
        retrieved_at: Optional[Any] = None,
        promote: bool = True,
        actor_id: str = "system",
    ) -> Dict[str, Any]:
        revision_id = _require_text(revision_id, "revision_id")
        source_id = _require_text(source_id, "source_id")
        dataset_id = _require_text(dataset_id, "dataset_id")
        snapshot_path = _require_text(snapshot_path, "snapshot_path")
        dataset_format = _require_text(dataset_format, "dataset_format")
        adapter_version = _require_text(adapter_version, "adapter_version")
        if metadata_path is not None:
            metadata_path = _require_text(metadata_path, "metadata_path")
        if source_status not in ("COMPLETE", "PARTIAL", "DEGRADED"):
            raise ValidationError("invalid source_status")
        metadata = metadata or {}
        provenance = provenance or {}
        metadata_json = canonical_json(metadata)
        provenance_json = canonical_json(provenance)
        observation_list = list(observations or ())
        for item in observation_list:
            if not isinstance(item, dict):
                raise ValidationError("each observation must be an object")
        observation_list.sort(key=lambda item: str(item.get("object_id", "")))
        if accepted_count is None:
            accepted_count = len(observation_list)
        if not isinstance(accepted_count, int) or accepted_count < 0:
            raise ValidationError("accepted_count must be a non-negative integer")
        if accepted_count != len(observation_list):
            raise ValidationError("accepted_count must equal the number of persisted observations")
        if not isinstance(quarantined_count, int) or quarantined_count < 0:
            raise ValidationError("quarantined_count must be a non-negative integer")
        calculated_hash = sha256_json(
            {"metadata": metadata, "observations": observation_list, "provenance": provenance}
        )
        dataset_hash = calculated_hash if dataset_hash is None else _normalise_digest(dataset_hash, "dataset_hash")
        now = self._now()
        retrieved = self._timestamp(retrieved_at, "retrieved_at") if retrieved_at is not None else None

        with self._transaction() as conn:
            existing = conn.execute(
                "SELECT * FROM catalog_revisions WHERE revision_id = ?", (revision_id,)
            ).fetchone()
            if existing is not None:
                same = all(
                    (
                        existing["source_id"] == source_id,
                        existing["dataset_id"] == dataset_id,
                        existing["snapshot_path"] == snapshot_path,
                        existing["metadata_path"] == metadata_path,
                        existing["dataset_format"] == dataset_format,
                        existing["adapter_version"] == adapter_version,
                        existing["dataset_hash"] == dataset_hash,
                        existing["schema_version"] == schema_version,
                        existing["source_status"] == source_status,
                        existing["retrieved_at"] == retrieved,
                        existing["metadata_hash"] == sha256_json(metadata),
                        existing["provenance_hash"] == sha256_json(provenance),
                        existing["accepted_count"] == accepted_count,
                        existing["quarantined_count"] == quarantined_count,
                    )
                )
                if same:
                    return self._catalog_from_row(existing)
                raise IdempotencyConflictError("catalog revision id already represents different content")

            try:
                conn.execute(
                    """INSERT INTO catalog_revisions(
                           revision_id, schema_version, source_id, dataset_id, snapshot_path,
                           metadata_path, dataset_format, adapter_version, dataset_hash,
                           source_status, retrieved_at, created_at, metadata_json, metadata_hash,
                           provenance_json, provenance_hash, object_count, accepted_count,
                           quarantined_count, is_current
                       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)""",
                    (
                        revision_id,
                        _require_text(schema_version, "schema_version"),
                        source_id,
                        dataset_id,
                        snapshot_path,
                        metadata_path,
                        dataset_format,
                        adapter_version,
                        dataset_hash,
                        source_status,
                        retrieved,
                        now,
                        metadata_json,
                        sha256_json(metadata),
                        provenance_json,
                        sha256_json(provenance),
                        len(observation_list),
                        accepted_count,
                        quarantined_count,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise IdempotencyConflictError("catalog source content already has another revision id") from exc

            if promote:
                conn.execute("UPDATE catalog_revisions SET is_current = 0 WHERE is_current = 1")
                conn.execute("UPDATE catalog_revisions SET is_current = 1 WHERE revision_id = ?", (revision_id,))
                if source_status == "COMPLETE":
                    conn.execute("UPDATE catalog_object_observations SET is_current = 0 WHERE is_current = 1")

            for observation in observation_list:
                self._insert_observation(conn, revision_id, observation, now, promote)

            self._audit(
                conn,
                actor_id,
                "catalog.revision.created",
                "catalog_revision",
                revision_id,
                {
                    "dataset_hash": dataset_hash,
                    "accepted_count": accepted_count,
                    "quarantined_count": quarantined_count,
                    "promoted": bool(promote),
                },
                now,
            )
            row = conn.execute("SELECT * FROM catalog_revisions WHERE revision_id = ?", (revision_id,)).fetchone()
            return self._catalog_from_row(row)

    def _insert_observation(
        self,
        conn: sqlite3.Connection,
        revision_id: str,
        observation: Dict[str, Any],
        now: str,
        promote: bool,
    ) -> None:
        object_id = _require_text(observation.get("object_id"), "observation.object_id")
        name = _require_text(observation.get("name", object_id), "observation.name")
        object_type = _require_text(observation.get("object_type", "UNKNOWN"), "observation.object_type")
        lifecycle = str(observation.get("lifecycle_status", "UNKNOWN")).upper()
        if lifecycle not in ("ACTIVE", "INACTIVE", "DECAYED", "RETIRED", "UNKNOWN"):
            raise ValidationError("invalid observation.lifecycle_status")
        status = str(observation.get("observation_status", "OBSERVED")).upper()
        if status not in ("NEW", "OBSERVED", "CHANGED", "ABSENT", "REAPPEARED", "DECAYED", "RETIRED"):
            raise ValidationError("invalid observation.observation_status")
        observed_at = self._timestamp(observation.get("observed_at", now), "observation.observed_at")
        element_set_id = observation.get("element_set_id")
        if element_set_id is not None:
            element_set_id = _require_text(element_set_id, "observation.element_set_id")
        payload_json = canonical_json(observation)

        if promote:
            conn.execute(
                "UPDATE catalog_object_observations SET is_current = 0 WHERE object_id = ? AND is_current = 1",
                (object_id,),
            )
        existing = conn.execute("SELECT * FROM catalog_objects WHERE object_id = ?", (object_id,)).fetchone()
        if existing is None:
            conn.execute(
                """INSERT INTO catalog_objects(
                       object_id, current_revision_id, current_element_set_id, name, norad_id,
                       international_designator, object_type, lifecycle_status,
                       first_seen_at, last_seen_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    object_id,
                    revision_id,
                    element_set_id,
                    name,
                    observation.get("norad_id"),
                    observation.get("international_designator"),
                    object_type,
                    lifecycle,
                    observed_at,
                    observed_at,
                    now,
                ),
            )
        elif promote:
            conn.execute(
                """UPDATE catalog_objects SET
                       current_revision_id = ?, current_element_set_id = ?, name = ?, norad_id = ?,
                       international_designator = ?, object_type = ?, lifecycle_status = ?,
                       last_seen_at = ?, updated_at = ?
                   WHERE object_id = ?""",
                (
                    revision_id,
                    element_set_id,
                    name,
                    observation.get("norad_id"),
                    observation.get("international_designator"),
                    object_type,
                    lifecycle,
                    observed_at,
                    now,
                    object_id,
                ),
            )
        conn.execute(
            """INSERT INTO catalog_object_observations(
                   catalog_revision_id, object_id, observed_at, observation_status,
                   lifecycle_status, element_set_id, payload_json, payload_hash, is_current
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                revision_id,
                object_id,
                observed_at,
                status,
                lifecycle,
                element_set_id,
                payload_json,
                sha256_json(observation),
                1 if promote else 0,
            ),
        )

    def get_catalog_revision(self, revision_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM catalog_revisions WHERE revision_id = ?", (revision_id,)
            ).fetchone()
        return None if row is None else self._catalog_from_row(row)

    def get_current_catalog_revision(self) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._conn.execute("SELECT * FROM catalog_revisions WHERE is_current = 1").fetchone()
        return None if row is None else self._catalog_from_row(row)

    def list_catalog_revisions(
        self,
        limit: int = 50,
        cursor: Optional[str] = None,
        source_id: Optional[str] = None,
        source_status: Optional[str] = None,
        current_only: bool = False,
    ) -> Dict[str, Any]:
        limit = self._limit(limit)
        if source_status is not None:
            source_status = source_status.upper()
            if source_status not in ("COMPLETE", "PARTIAL", "DEGRADED"):
                raise ValidationError("invalid source_status")
        filters = {
            "source_id": source_id,
            "source_status": source_status,
            "current_only": bool(current_only),
        }
        filter_hash = sha256_json(filters)
        clauses = []
        params = []
        if source_id is not None:
            clauses.append("source_id = ?")
            params.append(source_id)
        if source_status is not None:
            clauses.append("source_status = ?")
            params.append(source_status)
        if current_only:
            clauses.append("is_current = 1")
        if cursor is not None:
            decoded = self._decode_cursor(cursor, "catalogs", filter_hash)
            created_at = _require_text(decoded.get("created_at"), "cursor.created_at")
            revision_id = _require_text(decoded.get("revision_id"), "cursor.revision_id")
            clauses.append("(created_at < ? OR (created_at = ? AND revision_id < ?))")
            params.extend((created_at, created_at, revision_id))
        sql = "SELECT * FROM catalog_revisions"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY created_at DESC, revision_id DESC LIMIT ?"
        params.append(limit + 1)
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        more = len(rows) > limit
        rows = rows[:limit]
        items = [self._catalog_from_row(row) for row in rows]
        next_cursor = None
        if more and rows:
            last = rows[-1]
            next_cursor = self._encode_cursor(
                {
                    "v": 1,
                    "kind": "catalogs",
                    "filters": filter_hash,
                    "created_at": last["created_at"],
                    "revision_id": last["revision_id"],
                }
            )
        return {"items": items, "next_cursor": next_cursor}

    def list_current_objects(self, lifecycle_status: Optional[str] = None) -> List[Dict[str, Any]]:
        sql = """SELECT object.*, observation.observation_status,
                        observation.element_set_id AS observed_element_set_id
                 FROM catalog_objects object
                 JOIN catalog_object_observations observation
                   ON observation.object_id = object.object_id AND observation.is_current = 1"""
        params = []
        if lifecycle_status is not None:
            lifecycle_status = lifecycle_status.upper()
            sql += " WHERE object.lifecycle_status = ?"
            params.append(lifecycle_status)
        sql += " ORDER BY object.object_id"
        with self._lock:
            return [dict(row) for row in self._conn.execute(sql, params).fetchall()]

    def get_current_object(self, object_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self._conn.execute(
                """SELECT object.* FROM catalog_objects object
                   JOIN catalog_object_observations observation
                     ON observation.object_id = object.object_id AND observation.is_current = 1
                   WHERE object.object_id = ?""",
                (object_id,),
            ).fetchone()
        return None if row is None else dict(row)

    def get_catalog_observations(self, revision_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                """SELECT * FROM catalog_object_observations
                   WHERE catalog_revision_id = ? ORDER BY object_id""",
                (revision_id,),
            ).fetchall()
        return [self._payload_from_row(row) for row in rows]

    def create_job(
        self,
        idempotency_key: str,
        request: Dict[str, Any],
        catalog_revision_id: str,
        owner_id: str = "local",
        max_attempts: int = 3,
        job_id: Optional[str] = None,
        actor_id: Optional[str] = None,
        request_hash: Optional[str] = None,
    ) -> Dict[str, Any]:
        idempotency_key = _require_text(idempotency_key, "idempotency_key")
        owner_id = _require_text(owner_id, "owner_id")
        catalog_revision_id = _require_text(catalog_revision_id, "catalog_revision_id")
        if not isinstance(request, dict):
            raise ValidationError("request must be an object")
        if not isinstance(max_attempts, int) or max_attempts < 1:
            raise ValidationError("max_attempts must be a positive integer")
        envelope = {
            "catalog_revision_id": catalog_revision_id,
            "max_attempts": max_attempts,
            "request": request,
        }
        calculated_hash = sha256_json(envelope)
        if request_hash is not None and _normalise_digest(request_hash, "request_hash") != calculated_hash:
            raise ValidationError("request_hash does not match the canonical request envelope")
        job_id = _require_text(job_id, "job_id") if job_id is not None else str(uuid.uuid4())
        request_json = canonical_json(request)
        now = self._now()

        with self._transaction() as conn:
            existing = conn.execute(
                "SELECT * FROM screening_jobs WHERE owner_id = ? AND idempotency_key = ?",
                (owner_id, idempotency_key),
            ).fetchone()
            if existing is not None:
                if existing["request_hash"] != calculated_hash:
                    raise IdempotencyConflictError("idempotency key was used for a different request")
                return {"created": False, "job": self._job_from_row(existing)}
            if conn.execute(
                "SELECT 1 FROM catalog_revisions WHERE revision_id = ?", (catalog_revision_id,)
            ).fetchone() is None:
                raise ValidationError("catalog_revision_id does not exist")
            try:
                conn.execute(
                    """INSERT INTO screening_jobs(
                           job_id, schema_version, owner_id, idempotency_key, request_json,
                           request_hash, catalog_revision_id, state, max_attempts,
                           attempt_count, progress_sequence, progress_fraction,
                           created_at, updated_at
                       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?, 0, 0, 0, ?, ?)""",
                    (
                        job_id,
                        SCHEMA_VERSION,
                        owner_id,
                        idempotency_key,
                        request_json,
                        calculated_hash,
                        catalog_revision_id,
                        max_attempts,
                        now,
                        now,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise IdempotencyConflictError("job id already exists") from exc
            self._outbox(conn, "job.state", {"job_id": job_id, "state": "QUEUED"}, job_id, now=now)
            self._audit(
                conn,
                actor_id or owner_id,
                "job.created",
                "screening_job",
                job_id,
                {"request_hash": calculated_hash, "catalog_revision_id": catalog_revision_id},
                now,
            )
            row = conn.execute("SELECT * FROM screening_jobs WHERE job_id = ?", (job_id,)).fetchone()
            return {"created": True, "job": self._job_from_row(row)}

    def get_job(self, job_id: str) -> Dict[str, Any]:
        with self._lock:
            row = self._conn.execute("SELECT * FROM screening_jobs WHERE job_id = ?", (job_id,)).fetchone()
        if row is None:
            raise JobNotFoundError("job does not exist: %s" % job_id)
        return self._job_from_row(row)

    @staticmethod
    def _raw_job(conn: sqlite3.Connection, job_id: str) -> Dict[str, Any]:
        row = conn.execute("SELECT * FROM screening_jobs WHERE job_id = ?", (job_id,)).fetchone()
        if row is None:
            raise JobNotFoundError("job does not exist: %s" % job_id)
        return dict(row)

    @staticmethod
    def _validate_worker_fence(
        job: Dict[str, Any], expected_attempt: int, worker_id: str
    ) -> Tuple[int, str]:
        if isinstance(expected_attempt, bool) or not isinstance(expected_attempt, int) or expected_attempt < 1:
            raise ValidationError("expected_attempt must be a positive integer")
        worker_id = _require_text(worker_id, "worker_id")
        if int(job["attempt_count"]) != expected_attempt:
            raise StateTransitionError("worker attempt fence does not match the active attempt")
        if job["worker_id"] != worker_id:
            raise StateTransitionError("worker identity does not own the active attempt")
        return expected_attempt, worker_id

    @staticmethod
    def _write_job(conn: sqlite3.Connection, job: Dict[str, Any]) -> None:
        conn.execute(
            """UPDATE screening_jobs SET
                   state = ?, attempt_count = ?, progress_sequence = ?, progress_fraction = ?,
                   progress_stage = ?, cancel_requested_at = ?, updated_at = ?, started_at = ?,
                   completed_at = ?, worker_id = ?, result_json = ?, result_hash = ?,
                   error_json = ?, error_hash = ?
               WHERE job_id = ?""",
            (
                job["state"],
                job["attempt_count"],
                job["progress_sequence"],
                job["progress_fraction"],
                job["progress_stage"],
                job["cancel_requested_at"],
                job["updated_at"],
                job["started_at"],
                job["completed_at"],
                job["worker_id"],
                job["result_json"],
                job["result_hash"],
                job["error_json"],
                job["error_hash"],
                job["job_id"],
            ),
        )

    def _transition_locked(
        self,
        conn: sqlite3.Connection,
        job: Dict[str, Any],
        new_state: str,
        now: str,
        worker_id: Optional[str],
        error: Optional[Any],
        result: Optional[Any],
        actor_id: str,
    ) -> Dict[str, Any]:
        old_state = job["state"]
        if new_state not in JOB_STATES or new_state not in _ALLOWED_TRANSITIONS[old_state]:
            raise StateTransitionError("invalid job transition %s -> %s" % (old_state, new_state))
        if new_state == "RUNNING":
            if job["attempt_count"] >= job["max_attempts"]:
                raise StateTransitionError("job has exhausted its attempt budget")
            worker_id = _require_text(worker_id, "worker_id")
            job["attempt_count"] += 1
            job["started_at"] = now
            job["completed_at"] = None
            job["worker_id"] = worker_id
            job["progress_fraction"] = 0.0
            job["progress_stage"] = None
            job["result_json"] = None
            job["result_hash"] = None
            job["error_json"] = None
            job["error_hash"] = None
            conn.execute(
                """INSERT INTO screening_attempts(
                       job_id, attempt_number, state, worker_id, started_at
                   ) VALUES (?, ?, 'RUNNING', ?, ?)""",
                (job["job_id"], job["attempt_count"], worker_id, now),
            )
        elif new_state == "QUEUED":
            if job["attempt_count"] >= job["max_attempts"]:
                raise StateTransitionError("job has exhausted its attempt budget")
            job["completed_at"] = None
            job["started_at"] = None
            job["worker_id"] = None
            job["progress_fraction"] = 0.0
            job["progress_stage"] = None
            job["cancel_requested_at"] = None
            job["result_json"] = None
            job["result_hash"] = None
            job["error_json"] = None
            job["error_hash"] = None
        elif new_state == "CANCEL_REQUESTED":
            job["cancel_requested_at"] = now
        elif new_state in TERMINAL_STATES:
            job["completed_at"] = now
            if new_state == "SUCCEEDED":
                job["progress_fraction"] = 1.0
                job["progress_stage"] = "complete"
            if result is not None:
                job["result_json"] = canonical_json(result)
                job["result_hash"] = sha256_json(result)
            if error is not None:
                job["error_json"] = canonical_json(error)
                job["error_hash"] = sha256_json(error)
            if job["attempt_count"]:
                conn.execute(
                    """UPDATE screening_attempts SET
                           state = ?, finished_at = ?, error_json = ?, error_hash = ?
                       WHERE job_id = ? AND attempt_number = ? AND state = 'RUNNING'""",
                    (
                        new_state,
                        now,
                        job["error_json"],
                        job["error_hash"],
                        job["job_id"],
                        job["attempt_count"],
                    ),
                )
            job["worker_id"] = None
        job["state"] = new_state
        job["updated_at"] = now
        self._write_job(conn, job)
        payload = {"job_id": job["job_id"], "from": old_state, "state": new_state}
        self._outbox(conn, "job.state", payload, job["job_id"], now=now)
        self._audit(conn, actor_id, "job.state.changed", "screening_job", job["job_id"], payload, now)
        return self._job_from_row(conn.execute("SELECT * FROM screening_jobs WHERE job_id = ?", (job["job_id"],)).fetchone())

    def transition_job(
        self,
        job_id: str,
        new_state: str,
        expected_state: Optional[str] = None,
        worker_id: Optional[str] = None,
        error: Optional[Any] = None,
        result: Optional[Any] = None,
        actor_id: str = "system",
    ) -> Dict[str, Any]:
        new_state = _require_text(new_state, "new_state").upper()
        if new_state == "SUCCEEDED":
            raise StateTransitionError("SUCCEEDED is reserved for atomic result import")
        now = self._now()
        with self._transaction() as conn:
            job = self._raw_job(conn, job_id)
            if expected_state is not None and job["state"] != expected_state.upper():
                raise StateTransitionError(
                    "expected job state %s, found %s" % (expected_state.upper(), job["state"])
                )
            if job["state"] in ("RUNNING", "CANCEL_REQUESTED") and new_state in TERMINAL_STATES:
                raise StateTransitionError("active attempts must be completed through finish_attempt")
            return self._transition_locked(conn, job, new_state, now, worker_id, error, result, actor_id)

    def claim_next_job(self, worker_id: str, actor_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        worker_id = _require_text(worker_id, "worker_id")
        now = self._now()
        with self._transaction() as conn:
            row = conn.execute(
                """SELECT * FROM screening_jobs
                   WHERE state = 'QUEUED'
                   ORDER BY created_at ASC, job_id ASC
                   LIMIT 1"""
            ).fetchone()
            if row is None:
                return None
            return self._transition_locked(
                conn, dict(row), "RUNNING", now, worker_id, None, None, actor_id or worker_id
            )

    def finish_attempt(
        self,
        job_id: str,
        state: str,
        error: Optional[Any] = None,
        result: Optional[Any] = None,
        *,
        expected_attempt: int,
        worker_id: str,
        actor_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        state = _require_text(state, "state").upper()
        if state not in TERMINAL_STATES:
            raise ValidationError("finish_attempt requires a terminal state")
        if state == "SUCCEEDED":
            raise StateTransitionError("SUCCEEDED is reserved for atomic result import")
        now = self._now()
        with self._transaction() as conn:
            job = self._raw_job(conn, job_id)
            if job["state"] not in ("RUNNING", "CANCEL_REQUESTED"):
                raise StateTransitionError("finish_attempt requires an active job")
            _, worker_id = self._validate_worker_fence(job, expected_attempt, worker_id)
            return self._transition_locked(
                conn, job, state, now, None, error, result, actor_id or worker_id
            )

    def request_cancellation(self, job_id: str, actor_id: str = "system") -> Dict[str, Any]:
        now = self._now()
        with self._transaction() as conn:
            job = self._raw_job(conn, job_id)
            if job["state"] in TERMINAL_STATES or job["state"] == "CANCEL_REQUESTED":
                return self._job_from_row(
                    conn.execute("SELECT * FROM screening_jobs WHERE job_id = ?", (job_id,)).fetchone()
                )
            job["cancel_requested_at"] = now
            target = "CANCELLED" if job["state"] == "QUEUED" else "CANCEL_REQUESTED"
            return self._transition_locked(conn, job, target, now, None, None, None, actor_id)

    def retry_job(self, job_id: str, actor_id: str = "system") -> Dict[str, Any]:
        return self.transition_job(job_id, "QUEUED", actor_id=actor_id)

    def recover_interrupted_jobs(self, actor_id: str = "recovery") -> Dict[str, Any]:
        """Recover jobs left active after process termination.

        RUNNING attempts are marked INTERRUPTED, then requeued while their attempt
        budget permits.  Cancellation requests are completed rather than rerun.
        """

        now = self._now()
        recovered = []
        failed = []
        cancelled = []
        with self._transaction() as conn:
            rows = conn.execute(
                """SELECT * FROM screening_jobs
                   WHERE state IN ('RUNNING', 'CANCEL_REQUESTED')
                   ORDER BY created_at ASC, job_id ASC"""
            ).fetchall()
            for row in rows:
                job = dict(row)
                old_state = job["state"]
                if job["attempt_count"]:
                    attempt_state = "CANCELLED" if old_state == "CANCEL_REQUESTED" else "INTERRUPTED"
                    recovery_error = {
                        "code": "PROCESS_INTERRUPTED",
                        "message": "active attempt did not complete before service recovery",
                    }
                    conn.execute(
                        """UPDATE screening_attempts SET
                               state = ?, finished_at = ?, error_json = ?, error_hash = ?
                           WHERE job_id = ? AND attempt_number = ? AND state = 'RUNNING'""",
                        (
                            attempt_state,
                            now,
                            canonical_json(recovery_error),
                            sha256_json(recovery_error),
                            job["job_id"],
                            job["attempt_count"],
                        ),
                    )
                if old_state == "CANCEL_REQUESTED":
                    new_state = "CANCELLED"
                    job["completed_at"] = now
                    cancelled.append(job["job_id"])
                elif job["attempt_count"] < job["max_attempts"]:
                    new_state = "QUEUED"
                    job["completed_at"] = None
                    job["started_at"] = None
                    job["progress_fraction"] = 0.0
                    job["progress_stage"] = None
                    recovered.append(job["job_id"])
                else:
                    new_state = "FAILED"
                    terminal_error = {
                        "code": "INTERRUPTED_MAX_ATTEMPTS",
                        "message": "attempt budget exhausted during service recovery",
                    }
                    job["completed_at"] = now
                    job["error_json"] = canonical_json(terminal_error)
                    job["error_hash"] = sha256_json(terminal_error)
                    failed.append(job["job_id"])
                job["state"] = new_state
                job["worker_id"] = None
                job["updated_at"] = now
                self._write_job(conn, job)
                payload = {
                    "job_id": job["job_id"],
                    "from": old_state,
                    "state": new_state,
                    "reason": "process_interrupted",
                }
                self._outbox(conn, "job.state", payload, job["job_id"], now=now)
                self._audit(
                    conn, actor_id, "job.recovered", "screening_job", job["job_id"], payload, now
                )
        return {"requeued": recovered, "failed": failed, "cancelled": cancelled}

    def update_progress(
        self,
        job_id: str,
        stage: str,
        fraction: float,
        details: Optional[Dict[str, Any]] = None,
        *,
        expected_attempt: int,
        worker_id: str,
        actor_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        stage = _require_text(stage, "stage")
        if isinstance(fraction, bool) or not isinstance(fraction, (int, float)) or not math.isfinite(fraction):
            raise ValidationError("fraction must be a finite number")
        fraction = float(fraction)
        if fraction < 0.0 or fraction > 1.0:
            raise ValidationError("fraction must be between zero and one")
        details = details or {}
        if not isinstance(details, dict):
            raise ValidationError("details must be an object")
        now = self._now()
        with self._transaction() as conn:
            job = self._raw_job(conn, job_id)
            if job["state"] not in ("RUNNING", "CANCEL_REQUESTED"):
                raise StateTransitionError("progress can only be recorded for an active attempt")
            _, worker_id = self._validate_worker_fence(job, expected_attempt, worker_id)
            if fraction < float(job["progress_fraction"]):
                raise ValidationError("progress fraction cannot decrease within an attempt")
            sequence = int(job["progress_sequence"]) + 1
            payload = {
                "job_id": job_id,
                "attempt_number": job["attempt_count"],
                "sequence": sequence,
                "stage": stage,
                "fraction": fraction,
                "details": details,
            }
            encoded = canonical_json(payload)
            conn.execute(
                """INSERT INTO job_progress(
                       job_id, sequence, attempt_number, stage, fraction,
                       payload_json, payload_hash, created_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    job_id,
                    sequence,
                    job["attempt_count"],
                    stage,
                    fraction,
                    encoded,
                    sha256_json(payload),
                    now,
                ),
            )
            job["progress_sequence"] = sequence
            job["progress_fraction"] = fraction
            job["progress_stage"] = stage
            job["updated_at"] = now
            self._write_job(conn, job)
            self._outbox(conn, "job.progress", payload, job_id, sequence, now)
            self._audit(
                conn,
                actor_id or worker_id,
                "job.progress.updated",
                "screening_job",
                job_id,
                {"sequence": sequence, "stage": stage, "fraction": fraction},
                now,
            )
            return payload

    def list_progress(self, job_id: str, after_sequence: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
        limit = self._limit(limit)
        with self._lock:
            rows = self._conn.execute(
                """SELECT * FROM job_progress
                   WHERE job_id = ? AND sequence > ?
                   ORDER BY sequence ASC LIMIT ?""",
                (job_id, int(after_sequence), limit),
            ).fetchall()
        return [self._payload_from_row(row) for row in rows]

    def list_outbox(
        self,
        after_id: int = 0,
        job_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        limit = self._limit(limit)
        sql = "SELECT * FROM event_outbox WHERE outbox_id > ?"
        params = [int(after_id)]
        if job_id is not None:
            sql += " AND job_id = ?"
            params.append(job_id)
        sql += " ORDER BY outbox_id ASC LIMIT ?"
        params.append(limit)
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        return [self._payload_from_row(row) for row in rows]

    @staticmethod
    def _nonnegative_number(value: Any, field: str) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValidationError("%s must be a number" % field)
        result = float(value)
        if not math.isfinite(result) or result < 0:
            raise ValidationError("%s must be a finite non-negative number" % field)
        return result

    @staticmethod
    def _pair_key(object_a_id: Any, object_b_id: Any) -> Tuple[str, str, str]:
        first = _require_text(object_a_id, "object_a_id")
        second = _require_text(object_b_id, "object_b_id")
        if first == second:
            raise ValidationError("a conjunction pair must contain two distinct objects")
        if "|" in first or "|" in second:
            raise ValidationError("object ids used in conjunction pairs cannot contain '|'")
        left, right = sorted((first, second))
        return left, right, left + "|" + right

    def _prepare_candidate(self, job_id: str, attempt: int, source: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(source, dict):
            raise ValidationError("each candidate must be an object")
        value = dict(source)
        if "object_a_id" in value and "object_b_id" in value:
            _, _, derived_pair = self._pair_key(value["object_a_id"], value["object_b_id"])
            if value.get("pair_key") is not None and value["pair_key"] != derived_pair:
                raise ValidationError("candidate pair_key does not match its object ids")
            value["pair_key"] = derived_pair
        value["pair_key"] = _require_text(value.get("pair_key"), "candidate.pair_key")
        interval_start = value.get("interval_start_utc", value.get("interval_start"))
        interval_end = value.get("interval_end_utc", value.get("interval_end"))
        value.pop("interval_start", None)
        value.pop("interval_end", None)
        value["interval_start_utc"] = self._timestamp(interval_start, "candidate.interval_start_utc")
        value["interval_end_utc"] = self._timestamp(interval_end, "candidate.interval_end_utc")
        if value["interval_end_utc"] < value["interval_start_utc"]:
            raise ValidationError("candidate interval ends before it starts")
        candidate_id = value.get("candidate_id") or _stable_identifier(
            "cand_", {"job_id": job_id, "attempt": attempt, "candidate": value}
        )
        value["candidate_id"] = _require_text(candidate_id, "candidate.candidate_id")
        return value

    def _prepare_event(self, job_id: str, attempt: int, source: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(source, dict):
            raise ValidationError("each event must be an object")
        value = dict(source)
        object_a, object_b, pair_key = self._pair_key(value.get("object_a_id"), value.get("object_b_id"))
        if value.get("pair_key") is not None and value["pair_key"] != pair_key:
            raise ValidationError("event pair_key does not match its object ids")
        value["object_a_id"] = object_a
        value["object_b_id"] = object_b
        value["pair_key"] = pair_key
        tca = value.get("tca_utc", value.get("tca"))
        relative_speed = value.get("relative_speed_km_s", value.get("relative_velocity_km_s"))
        value.pop("tca", None)
        value.pop("relative_velocity_km_s", None)
        value["tca_utc"] = self._timestamp(tca, "event.tca_utc")
        value["miss_distance_km"] = self._nonnegative_number(
            value.get("miss_distance_km"), "event.miss_distance_km"
        )
        value["relative_speed_km_s"] = self._nonnegative_number(
            relative_speed, "event.relative_speed_km_s"
        )
        revision_material = dict(value)
        revision_material.pop("event_revision_id", None)
        revision_material.pop("conjunction_id", None)
        event_revision_id = value.get("event_revision_id") or value.get("event_id") or _stable_identifier(
            "event_", {"job_id": job_id, "attempt": attempt, "event": revision_material}
        )
        value["event_revision_id"] = _require_text(event_revision_id, "event.event_revision_id")
        conjunction_id = value.get("conjunction_id") or _stable_identifier(
            "conj_", {"event_revision_id": value["event_revision_id"]}
        )
        value["conjunction_id"] = _require_text(conjunction_id, "event.conjunction_id")
        if value.get("supersedes_event_revision_id") is not None:
            value["supersedes_event_revision_id"] = _require_text(
                value["supersedes_event_revision_id"], "event.supersedes_event_revision_id"
            )
        return value

    @staticmethod
    def _canonical_event_order(events: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Return a stable topological order for immutable event revision chains."""

        by_id = {}
        for event in events:
            revision_id = event["event_revision_id"]
            if revision_id in by_id:
                raise ValidationError("event_revision_id values must be unique within a result")
            by_id[revision_id] = event

        indegree = {revision_id: 0 for revision_id in by_id}
        children = {revision_id: [] for revision_id in by_id}
        for revision_id, event in by_id.items():
            target_id = event.get("supersedes_event_revision_id")
            if target_id not in by_id:
                continue
            target = by_id[target_id]
            if (
                target["conjunction_id"] != event["conjunction_id"]
                or target["pair_key"] != event["pair_key"]
            ):
                raise ValidationError(
                    "same-result supersession must preserve conjunction_id and object pair"
                )
            children[target_id].append(revision_id)
            if len(children[target_id]) > 1:
                raise ValidationError("event revision chains cannot branch within one result")
            indegree[revision_id] += 1

        ready = [revision_id for revision_id, degree in indegree.items() if degree == 0]
        heapq.heapify(ready)
        ordered = []
        while ready:
            revision_id = heapq.heappop(ready)
            ordered.append(by_id[revision_id])
            for child_id in children[revision_id]:
                indegree[child_id] -= 1
                if indegree[child_id] == 0:
                    heapq.heappush(ready, child_id)
        if len(ordered) != len(by_id):
            raise ValidationError("event revision chains cannot contain a cycle")
        return ordered

    def _prepare_error(self, job_id: str, attempt: int, source: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(source, dict):
            raise ValidationError("each screening error must be an object")
        value = dict(source)
        value["stage"] = _require_text(value.get("stage"), "error.stage")
        value["code"] = _require_text(value.get("code"), "error.code")
        if value.get("object_id") is not None:
            value["object_id"] = _require_text(value["object_id"], "error.object_id")
        error_id = value.get("error_id") or _stable_identifier(
            "err_", {"job_id": job_id, "attempt": attempt, "error": value}
        )
        value["error_id"] = _require_text(error_id, "error.error_id")
        return value

    def import_result(
        self,
        job_id: str,
        candidates: Optional[Iterable[Dict[str, Any]]] = None,
        events: Optional[Iterable[Dict[str, Any]]] = None,
        errors: Optional[Iterable[Dict[str, Any]]] = None,
        summary: Optional[Dict[str, Any]] = None,
        *,
        expected_attempt: int,
        worker_id: str,
        actor_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        initial = self.get_job(job_id)
        if isinstance(expected_attempt, bool) or not isinstance(expected_attempt, int) or expected_attempt < 1:
            raise ValidationError("expected_attempt must be a positive integer")
        worker_id = _require_text(worker_id, "worker_id")
        attempt = expected_attempt
        prepared_candidates = sorted(
            (self._prepare_candidate(job_id, attempt, item) for item in (candidates or ())),
            key=lambda item: item["candidate_id"],
        )
        prepared_events = self._canonical_event_order(
            self._prepare_event(job_id, attempt, item) for item in (events or ())
        )
        prepared_errors = sorted(
            (self._prepare_error(job_id, attempt, item) for item in (errors or ())),
            key=lambda item: item["error_id"],
        )
        if summary is None:
            summary = {}
        if not isinstance(summary, dict):
            raise ValidationError("summary must be an object")
        result = {
            "summary": summary,
            "candidate_count": len(prepared_candidates),
            "event_count": len(prepared_events),
            "error_count": len(prepared_errors),
        }
        result_material = {
            "manifest": result,
            "candidates": prepared_candidates,
            "events": prepared_events,
            "errors": prepared_errors,
        }
        result_hash = sha256_json(result_material)
        now = self._now()
        with self._transaction() as conn:
            job = self._raw_job(conn, job_id)
            if job["state"] == "SUCCEEDED":
                attempt_row = conn.execute(
                    """SELECT worker_id FROM screening_attempts
                       WHERE job_id = ? AND attempt_number = ?""",
                    (job_id, expected_attempt),
                ).fetchone()
                same_worker = attempt_row is not None and attempt_row["worker_id"] == worker_id
                if (
                    int(job["attempt_count"]) == expected_attempt
                    and same_worker
                    and job["result_hash"] == result_hash
                ):
                    return self._job_from_row(
                        conn.execute("SELECT * FROM screening_jobs WHERE job_id = ?", (job_id,)).fetchone()
                    )
                raise IdempotencyConflictError("job already has a different published result")
            if job["state"] != "RUNNING":
                raise StateTransitionError("results can only be imported for a RUNNING job")
            self._validate_worker_fence(job, expected_attempt, worker_id)
            try:
                for item in prepared_candidates:
                    payload_json = canonical_json(item)
                    conn.execute(
                        """INSERT INTO conjunction_candidates(
                               candidate_id, job_id, attempt_number, pair_key,
                               interval_start_utc, interval_end_utc, payload_json,
                               payload_hash, created_at
                           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            item["candidate_id"],
                            job_id,
                            attempt,
                            item["pair_key"],
                            item["interval_start_utc"],
                            item["interval_end_utc"],
                            payload_json,
                            sha256_json(item),
                            now,
                        ),
                    )
                for item in prepared_events:
                    supersedes_id = item.get("supersedes_event_revision_id")
                    if supersedes_id is not None:
                        target = conn.execute(
                            """SELECT conjunction_id, pair_key FROM conjunction_events
                               WHERE event_revision_id = ?""",
                            (supersedes_id,),
                        ).fetchone()
                        if target is None:
                            raise ValidationError("superseded event revision does not exist")
                        if (
                            target["conjunction_id"] != item["conjunction_id"]
                            or target["pair_key"] != item["pair_key"]
                        ):
                            raise ValidationError(
                                "supersession must preserve conjunction_id and object pair"
                            )
                    current = conn.execute(
                        """SELECT event.event_revision_id, event.pair_key
                           FROM conjunction_current current
                           JOIN conjunction_events event
                             ON event.event_revision_id = current.event_revision_id
                           WHERE current.conjunction_id = ?""",
                        (item["conjunction_id"],),
                    ).fetchone()
                    if current is not None:
                        if current["pair_key"] != item["pair_key"]:
                            raise ValidationError("conjunction_id cannot be reused for another object pair")
                        if item.get("supersedes_event_revision_id") != current["event_revision_id"]:
                            raise ValidationError(
                                "a conjunction revision must explicitly supersede its current revision"
                            )
                    payload_json = canonical_json(item)
                    conn.execute(
                        """INSERT INTO conjunction_events(
                               event_revision_id, conjunction_id, job_id, attempt_number,
                               pair_key, object_a_id, object_b_id, tca_utc,
                               miss_distance_km, relative_speed_km_s,
                               supersedes_event_revision_id, payload_json, payload_hash, created_at
                           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            item["event_revision_id"],
                            item["conjunction_id"],
                            job_id,
                            attempt,
                            item["pair_key"],
                            item["object_a_id"],
                            item["object_b_id"],
                            item["tca_utc"],
                            item["miss_distance_km"],
                            item["relative_speed_km_s"],
                            item.get("supersedes_event_revision_id"),
                            payload_json,
                            sha256_json(item),
                            now,
                        ),
                    )
                    conn.execute(
                        """INSERT INTO conjunction_current(conjunction_id, event_revision_id, updated_at)
                           VALUES (?, ?, ?)
                           ON CONFLICT(conjunction_id) DO UPDATE SET
                               event_revision_id = excluded.event_revision_id,
                               updated_at = excluded.updated_at""",
                        (item["conjunction_id"], item["event_revision_id"], now),
                    )
                for item in prepared_errors:
                    payload_json = canonical_json(item)
                    conn.execute(
                        """INSERT INTO screening_errors(
                               error_id, job_id, attempt_number, stage, code, object_id,
                               payload_json, payload_hash, created_at
                           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            item["error_id"],
                            job_id,
                            attempt,
                            item["stage"],
                            item["code"],
                            item.get("object_id"),
                            payload_json,
                            sha256_json(item),
                            now,
                        ),
                    )
            except sqlite3.IntegrityError as exc:
                raise ValidationError("result records violate persistence constraints: %s" % exc) from exc

            # Persist only the compact manifest on the job; detailed records are
            # canonical rows and are covered by the publication hash.
            job["result_json"] = canonical_json(result)
            job["result_hash"] = result_hash
            completed = self._transition_locked(
                conn, job, "SUCCEEDED", now, None, None, None, actor_id or worker_id
            )
            self._outbox(
                conn,
                "job.result",
                {
                    "job_id": job_id,
                    "result_hash": result_hash,
                    "candidate_count": len(prepared_candidates),
                    "event_count": len(prepared_events),
                    "error_count": len(prepared_errors),
                },
                job_id,
                now=now,
            )
            self._audit(
                conn,
                actor_id or worker_id,
                "job.result.published",
                "screening_job",
                job_id,
                {"result_hash": result_hash},
                now,
            )
            return completed

    def list_candidates(self, job_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                """SELECT * FROM conjunction_candidates
                   WHERE job_id = ? ORDER BY interval_start_utc, candidate_id""",
                (job_id,),
            ).fetchall()
        return [self._payload_from_row(row) for row in rows]

    def list_errors(self, job_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM screening_errors WHERE job_id = ? ORDER BY error_id", (job_id,)
            ).fetchall()
        return [self._payload_from_row(row) for row in rows]

    def get_event(self, event_or_conjunction_id: str) -> Dict[str, Any]:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM conjunction_events WHERE event_revision_id = ?",
                (event_or_conjunction_id,),
            ).fetchone()
            if row is None:
                row = self._conn.execute(
                    """SELECT event.* FROM conjunction_current current
                       JOIN conjunction_events event
                         ON event.event_revision_id = current.event_revision_id
                       WHERE current.conjunction_id = ?""",
                    (event_or_conjunction_id,),
                ).fetchone()
        if row is None:
            raise JobStoreError("conjunction event does not exist: %s" % event_or_conjunction_id)
        return self._payload_from_row(row)

    @staticmethod
    def _limit(limit: int) -> int:
        if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1 or limit > 200:
            raise ValidationError("limit must be an integer between 1 and 200")
        return limit

    @staticmethod
    def _encode_cursor(value: Dict[str, Any]) -> str:
        raw = canonical_json(value).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    @staticmethod
    def _decode_cursor(cursor: str, kind: str, filter_hash: str) -> Dict[str, Any]:
        try:
            padding = "=" * (-len(cursor) % 4)
            value = json.loads(base64.urlsafe_b64decode(cursor + padding).decode("utf-8"))
        except (binascii.Error, ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValidationError("invalid pagination cursor") from exc
        if not isinstance(value, dict) or value.get("v") != 1 or value.get("kind") != kind:
            raise ValidationError("pagination cursor has the wrong type or version")
        if value.get("filters") != filter_hash:
            raise ValidationError("pagination cursor does not match the active filters")
        return value

    def list_jobs(
        self,
        limit: int = 50,
        cursor: Optional[str] = None,
        owner_id: Optional[str] = None,
        states: Optional[Sequence[str]] = None,
        catalog_revision_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        limit = self._limit(limit)
        if isinstance(states, str):
            states = (states,)
        normalised_states = sorted(set(state.upper() for state in (states or ())))
        if any(state not in JOB_STATES for state in normalised_states):
            raise ValidationError("states contains an invalid job state")
        filters = {
            "owner_id": owner_id,
            "states": normalised_states,
            "catalog_revision_id": catalog_revision_id,
        }
        filter_hash = sha256_json(filters)
        clauses = []
        params = []
        if owner_id is not None:
            clauses.append("owner_id = ?")
            params.append(owner_id)
        if normalised_states:
            clauses.append("state IN (%s)" % ",".join("?" for _ in normalised_states))
            params.extend(normalised_states)
        if catalog_revision_id is not None:
            clauses.append("catalog_revision_id = ?")
            params.append(catalog_revision_id)
        if cursor is not None:
            decoded = self._decode_cursor(cursor, "jobs", filter_hash)
            created_at = _require_text(decoded.get("created_at"), "cursor.created_at")
            job_id = _require_text(decoded.get("job_id"), "cursor.job_id")
            clauses.append("(created_at < ? OR (created_at = ? AND job_id < ?))")
            params.extend((created_at, created_at, job_id))
        sql = "SELECT * FROM screening_jobs"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY created_at DESC, job_id DESC LIMIT ?"
        params.append(limit + 1)
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        more = len(rows) > limit
        rows = rows[:limit]
        items = [self._job_from_row(row) for row in rows]
        next_cursor = None
        if more and rows:
            last = rows[-1]
            next_cursor = self._encode_cursor(
                {
                    "v": 1,
                    "kind": "jobs",
                    "filters": filter_hash,
                    "created_at": last["created_at"],
                    "job_id": last["job_id"],
                }
            )
        return {"items": items, "next_cursor": next_cursor}

    def list_events(
        self,
        limit: int = 50,
        cursor: Optional[str] = None,
        job_id: Optional[str] = None,
        object_id: Optional[str] = None,
        pair_key: Optional[str] = None,
        tca_from: Optional[Any] = None,
        tca_to: Optional[Any] = None,
        min_miss_distance_km: Optional[float] = None,
        max_miss_distance_km: Optional[float] = None,
        order: str = "tca_asc",
        current_only: bool = False,
    ) -> Dict[str, Any]:
        limit = self._limit(limit)
        from_value = self._timestamp(tca_from, "tca_from") if tca_from is not None else None
        to_value = self._timestamp(tca_to, "tca_to") if tca_to is not None else None
        if from_value is not None and to_value is not None and to_value < from_value:
            raise ValidationError("tca_to precedes tca_from")
        minimum = (
            self._nonnegative_number(min_miss_distance_km, "min_miss_distance_km")
            if min_miss_distance_km is not None
            else None
        )
        maximum = (
            self._nonnegative_number(max_miss_distance_km, "max_miss_distance_km")
            if max_miss_distance_km is not None
            else None
        )
        if minimum is not None and maximum is not None and maximum < minimum:
            raise ValidationError("max_miss_distance_km is smaller than min_miss_distance_km")
        order_aliases = {
            "tca": "tca_asc",
            "-tca": "tca_desc",
            "miss_distance": "miss_distance_asc",
            "-miss_distance": "miss_distance_desc",
        }
        order = order_aliases.get(order, order)
        sort_options = {
            "tca_asc": (("tca_utc", "ASC"), ("event_revision_id", "ASC")),
            "tca_desc": (("tca_utc", "DESC"), ("event_revision_id", "DESC")),
            "miss_distance_asc": (
                ("miss_distance_km", "ASC"),
                ("tca_utc", "ASC"),
                ("event_revision_id", "ASC"),
            ),
            "miss_distance_desc": (
                ("miss_distance_km", "DESC"),
                ("tca_utc", "ASC"),
                ("event_revision_id", "ASC"),
            ),
        }
        if order not in sort_options:
            raise ValidationError("invalid event order")
        sort_columns = sort_options[order]
        filters = {
            "job_id": job_id,
            "object_id": object_id,
            "pair_key": pair_key,
            "tca_from": from_value,
            "tca_to": to_value,
            "min_miss_distance_km": minimum,
            "max_miss_distance_km": maximum,
            "order": order,
            "current_only": bool(current_only),
        }
        filter_hash = sha256_json(filters)
        clauses = []
        params = []
        if job_id is not None:
            clauses.append("event.job_id = ?")
            params.append(job_id)
        if object_id is not None:
            clauses.append("(event.object_a_id = ? OR event.object_b_id = ?)")
            params.extend((object_id, object_id))
        if pair_key is not None:
            clauses.append("event.pair_key = ?")
            params.append(pair_key)
        if from_value is not None:
            clauses.append("event.tca_utc >= ?")
            params.append(from_value)
        if to_value is not None:
            clauses.append("event.tca_utc <= ?")
            params.append(to_value)
        if minimum is not None:
            clauses.append("event.miss_distance_km >= ?")
            params.append(minimum)
        if maximum is not None:
            clauses.append("event.miss_distance_km <= ?")
            params.append(maximum)
        if cursor is not None:
            decoded = self._decode_cursor(cursor, "events", filter_hash)
            values = decoded.get("sort_values")
            if not isinstance(values, list) or len(values) != len(sort_columns):
                raise ValidationError("event cursor is missing stable sort values")
            keyset_parts = []
            keyset_params = []
            for index, (column, direction) in enumerate(sort_columns):
                comparison = ">" if direction == "ASC" else "<"
                equalities = ["event.%s = ?" % previous[0] for previous in sort_columns[:index]]
                branch = equalities + ["event.%s %s ?" % (column, comparison)]
                keyset_parts.append("(" + " AND ".join(branch) + ")")
                keyset_params.extend(values[:index])
                keyset_params.append(values[index])
            clauses.append("(" + " OR ".join(keyset_parts) + ")")
            params.extend(keyset_params)
        sql = "SELECT event.* FROM conjunction_events event"
        if current_only:
            sql += " JOIN conjunction_current current ON current.event_revision_id = event.event_revision_id"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY " + ", ".join(
            "event.%s %s" % (column, direction) for column, direction in sort_columns
        )
        sql += " LIMIT ?"
        params.append(limit + 1)
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        more = len(rows) > limit
        rows = rows[:limit]
        items = [self._payload_from_row(row) for row in rows]
        next_cursor = None
        if more and rows:
            last = rows[-1]
            next_cursor = self._encode_cursor(
                {
                    "v": 1,
                    "kind": "events",
                    "filters": filter_hash,
                    "sort_values": [last[column] for column, _ in sort_columns],
                }
            )
        return {"items": items, "next_cursor": next_cursor}

    def list_attempts(self, job_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM screening_attempts WHERE job_id = ? ORDER BY attempt_number", (job_id,)
            ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["error"] = _decode_json(item.pop("error_json"))
            result.append(item)
        return result

    def list_audit_records(
        self,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        after_id: int = 0,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        limit = self._limit(limit)
        clauses = ["audit_id > ?"]
        params = [int(after_id)]
        if resource_type is not None:
            clauses.append("resource_type = ?")
            params.append(resource_type)
        if resource_id is not None:
            clauses.append("resource_id = ?")
            params.append(resource_id)
        sql = "SELECT * FROM audit_records WHERE " + " AND ".join(clauses)
        sql += " ORDER BY audit_id ASC LIMIT ?"
        params.append(limit)
        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()
        return [self._payload_from_row(row) for row in rows]

    def delete_job(
        self,
        job_id: str,
        completed_before: Any,
        actor_id: str = "retention",
        *,
        discard_unconsumed_outbox: bool = False,
    ) -> bool:
        """Delete an eligible job only under an explicit outbox-loss policy."""

        if not isinstance(discard_unconsumed_outbox, bool):
            raise ValidationError("discard_unconsumed_outbox must be a boolean")
        cutoff = self._timestamp(completed_before, "completed_before")
        now = self._now()
        with self._transaction() as conn:
            job = self._raw_job(conn, job_id)
            if job["state"] not in TERMINAL_STATES or job["completed_at"] is None:
                raise RetentionConflictError("only completed jobs can be deleted")
            if job["completed_at"] >= cutoff:
                raise RetentionConflictError("job is newer than the retention cutoff")
            event_count = conn.execute(
                "SELECT COUNT(*) FROM conjunction_events WHERE job_id = ?", (job_id,)
            ).fetchone()[0]
            if event_count:
                raise RetentionConflictError("job owns immutable conjunction history and cannot be deleted")
            outbox_count = int(
                conn.execute("SELECT COUNT(*) FROM event_outbox WHERE job_id = ?", (job_id,)).fetchone()[0]
            )
            if outbox_count and not discard_unconsumed_outbox:
                raise RetentionConflictError(
                    "job has resumable outbox records; deletion requires explicit discard_unconsumed_outbox"
                )
            self._audit(
                conn,
                actor_id,
                "job.deleted",
                "screening_job",
                job_id,
                {
                    "completed_at": job["completed_at"],
                    "cutoff": cutoff,
                    "discarded_outbox_count": outbox_count,
                    "discard_unconsumed_outbox": discard_unconsumed_outbox,
                },
                now,
            )
            conn.execute("DELETE FROM screening_jobs WHERE job_id = ?", (job_id,))
            return True

    def prune_job_intermediates(
        self,
        job_id: str,
        completed_before: Any,
        actor_id: str = "retention",
        *,
        discard_unconsumed_outbox: bool = False,
    ) -> Dict[str, int]:
        """Prune recomputable rows while retaining resumable outbox rows by default."""

        if not isinstance(discard_unconsumed_outbox, bool):
            raise ValidationError("discard_unconsumed_outbox must be a boolean")
        cutoff = self._timestamp(completed_before, "completed_before")
        now = self._now()
        with self._transaction() as conn:
            job = self._raw_job(conn, job_id)
            if (
                job["state"] not in TERMINAL_STATES
                or job["completed_at"] is None
                or job["completed_at"] >= cutoff
            ):
                raise RetentionConflictError("job is not eligible for intermediate-data pruning")
            counts = {}
            for table in ("conjunction_candidates", "screening_errors", "job_progress"):
                cursor = conn.execute("DELETE FROM %s WHERE job_id = ?" % table, (job_id,))
                counts[table] = cursor.rowcount
            outbox_count = int(
                conn.execute("SELECT COUNT(*) FROM event_outbox WHERE job_id = ?", (job_id,)).fetchone()[0]
            )
            if discard_unconsumed_outbox:
                cursor = conn.execute("DELETE FROM event_outbox WHERE job_id = ?", (job_id,))
                counts["event_outbox"] = cursor.rowcount
                counts["event_outbox_retained"] = 0
            else:
                counts["event_outbox"] = 0
                counts["event_outbox_retained"] = outbox_count
            self._audit(
                conn,
                actor_id,
                "job.intermediates.pruned",
                "screening_job",
                job_id,
                {
                    "cutoff": cutoff,
                    "deleted": counts,
                    "discard_unconsumed_outbox": discard_unconsumed_outbox,
                },
                now,
            )
            return counts

    def stats(self) -> Dict[str, Any]:
        with self._lock:
            state_rows = self._conn.execute(
                "SELECT state, COUNT(*) AS count FROM screening_jobs GROUP BY state"
            ).fetchall()
            counts = {}
            for table in (
                "catalog_revisions",
                "catalog_objects",
                "screening_jobs",
                "screening_attempts",
                "job_progress",
                "event_outbox",
                "conjunction_candidates",
                "conjunction_events",
                "screening_errors",
                "audit_records",
            ):
                counts[table] = int(self._conn.execute("SELECT COUNT(*) FROM " + table).fetchone()[0])
        db_bytes = os.path.getsize(self.path) if self.path != ":memory:" and os.path.exists(self.path) else 0
        wal_path = self.path + "-wal"
        wal_bytes = os.path.getsize(wal_path) if self.path != ":memory:" and os.path.exists(wal_path) else 0
        return {
            "jobs_by_state": {row["state"]: int(row["count"]) for row in state_rows},
            "record_counts": counts,
            "database_bytes": db_bytes,
            "wal_bytes": wal_bytes,
        }

    def health(self) -> Dict[str, Any]:
        try:
            with self._lock:
                quick_check = str(self._conn.execute("PRAGMA quick_check").fetchone()[0])
                journal_mode = str(self._conn.execute("PRAGMA journal_mode").fetchone()[0]).lower()
                foreign_keys = bool(self._conn.execute("PRAGMA foreign_keys").fetchone()[0])
                current = self._conn.execute(
                    "SELECT revision_id FROM catalog_revisions WHERE is_current = 1"
                ).fetchone()
            healthy = quick_check == "ok" and foreign_keys and self.schema_version == self._migration_files()[-1][0]
            return {
                "status": "healthy" if healthy else "unhealthy",
                "schema_version": self.schema_version,
                "service_schema_version": SCHEMA_VERSION,
                "quick_check": quick_check,
                "journal_mode": journal_mode,
                "foreign_keys": foreign_keys,
                "current_catalog_revision_id": None if current is None else current["revision_id"],
                "stats": self.stats(),
            }
        except sqlite3.Error as exc:
            return {
                "status": "unhealthy",
                "schema_version": None,
                "service_schema_version": SCHEMA_VERSION,
                "error": str(exc),
            }
