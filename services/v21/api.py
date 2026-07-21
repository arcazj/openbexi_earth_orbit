"""Application service for the authenticated OpenBEXI API v1."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Mapping, Optional, Sequence

from .catalog_registry import CatalogSnapshotRegistry, CatalogSnapshotError
from .feature_flags import ServerFeatureFlag
from .job_manager import ScreeningJobManager
from .job_store import (
    IdempotencyConflictError,
    JobNotFoundError,
    JobStore,
    JobStoreError,
    StateTransitionError,
    ValidationError,
    canonical_json,
)
from .security import (
    ApiProblem,
    BearerTokenAuthenticator,
    CursorCodec,
    Principal,
    SlidingWindowRateLimiter,
    validate_idempotency_key,
)


API_VERSION = "1.0.0"
SERVICE_SCHEMA_VERSION = "2.1.0"
TERMINAL_JOB_STATES = frozenset({"SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"})
UTC_INSTANT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$")

DEFAULT_CONFIGURATION = {
    "horizon_seconds": 3600,
    "coarse_step_seconds": 60,
    "screening_radius_km": 10.0,
    "refinement_tolerance_seconds": 1.0,
    "refinement_subdivisions": 8,
    "max_refinement_iterations": 64,
    "max_relative_acceleration_km_s2": 0.024516625,
    "coarse_padding_km": 0.0,
    "max_results": 5000,
    "yield_every_operations": 2000,
    "spatial_cell_size_km": 1000.0,
    "max_cells_per_object": 512,
    "max_cell_memberships_per_slab": 2_000_000,
    "max_spatial_pair_checks_per_slab": 5_000_000,
    "max_candidate_intervals": 250_000,
    "max_detected_events": 10_000,
    "max_persisted_candidates": 100_000,
    "timeout_seconds": 1800,
    "max_attempts": 2,
}

CONFIGURATION_LIMITS = {
    "horizon_seconds": (60, 21_600, False),
    "coarse_step_seconds": (10, 900, False),
    "screening_radius_km": (0.001, 1000, False),
    "refinement_tolerance_seconds": (0.01, 10, False),
    "refinement_subdivisions": (2, 32, True),
    "max_refinement_iterations": (8, 128, True),
    "max_relative_acceleration_km_s2": (0, 0.1, False),
    "coarse_padding_km": (0, 1000, False),
    "max_results": (1, 10_000, True),
    "yield_every_operations": (100, 1_000_000, True),
    "spatial_cell_size_km": (50, 5000, False),
    "max_cells_per_object": (1, 512, True),
    "max_cell_memberships_per_slab": (1000, 10_000_000, True),
    "max_spatial_pair_checks_per_slab": (1000, 10_000_000, True),
    "max_candidate_intervals": (1, 500_000, True),
    "max_detected_events": (1, 100_000, True),
    "max_persisted_candidates": (1, 100_000, True),
    "timeout_seconds": (10, 7200, True),
    "max_attempts": (1, 3, True),
}

SUPPORTED_OBJECT_TYPES = frozenset({"PAYLOAD", "ROCKET_BODY", "DEBRIS", "UNKNOWN"})
SUPPORTED_LIFECYCLE = frozenset({"ACTIVE", "INACTIVE", "DECAYED", "RETIRED", "UNKNOWN"})
DEFAULT_LIFECYCLE = ("ACTIVE", "INACTIVE", "UNKNOWN")


def _utc(value: Any, field: str) -> str:
    text = str(value or "").strip()
    if not UTC_INSTANT.fullmatch(text):
        raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "%s must be an ISO UTC timestamp ending in Z." % field)
    try:
        parsed = dt.datetime.fromisoformat(text[:-1] + "+00:00")
    except ValueError as exc:
        raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "%s is not a valid timestamp." % field) from exc
    return parsed.astimezone(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _bounded_configuration(value: object) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "configuration must be an object.")
    unknown = set(value) - set(CONFIGURATION_LIMITS) - {"configuration_version", "start_time", "end_time"}
    if unknown:
        raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "Unsupported configuration fields: %s." % ", ".join(sorted(unknown)))
    result: Dict[str, Any] = {"configuration_version": SERVICE_SCHEMA_VERSION}
    for name, (minimum, maximum, integer) in CONFIGURATION_LIMITS.items():
        supplied = value.get(name, DEFAULT_CONFIGURATION[name])
        if isinstance(supplied, bool):
            raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "%s must be numeric." % name)
        try:
            number = float(supplied)
        except (TypeError, ValueError) as exc:
            raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "%s must be numeric." % name) from exc
        if not (minimum <= number <= maximum):
            raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "%s must be between %s and %s." % (name, minimum, maximum))
        if integer and not number.is_integer():
            raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "%s must be an integer." % name)
        result[name] = int(number) if integer else number
    if result["coarse_step_seconds"] > result["horizon_seconds"]:
        raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "coarse_step_seconds exceeds the screening horizon.")
    if result["refinement_tolerance_seconds"] > result["coarse_step_seconds"]:
        raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "refinement_tolerance_seconds exceeds the coarse step.")
    if result["max_persisted_candidates"] > result["max_candidate_intervals"]:
        raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "max_persisted_candidates exceeds max_candidate_intervals.")
    grid_points = int((result["horizon_seconds"] + result["coarse_step_seconds"] - 1) // result["coarse_step_seconds"]) + 1
    if grid_points > 721:
        raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "The synchronized time grid exceeds 721 points.")
    return result


def normalize_job_request(payload: object, current_revision_id: str) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "The job request must be an object.")
    unknown = set(payload) - {"schema_version", "catalog_revision_id", "catalog_scope", "configuration"}
    if unknown:
        raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "Unsupported request fields: %s." % ", ".join(sorted(unknown)))
    if str(payload.get("schema_version", SERVICE_SCHEMA_VERSION)) != SERVICE_SCHEMA_VERSION:
        raise ApiProblem(400, "REQUEST_VERSION_UNSUPPORTED", "Unsupported request version", "schema_version must be 2.1.0.")
    revision_id = str(payload.get("catalog_revision_id") or current_revision_id).strip()
    if revision_id == "current":
        revision_id = current_revision_id
    scope = payload.get("catalog_scope") or {}
    if not isinstance(scope, dict) or set(scope) - {"object_types", "lifecycle_statuses", "object_ids"}:
        raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "catalog_scope contains unsupported fields.")

    def values(name: str, default: Sequence[str], allowed: frozenset, maximum: int) -> list[str]:
        source = scope.get(name, default)
        if not isinstance(source, list) or not source or len(source) > maximum:
            raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "%s must be a non-empty bounded array." % name)
        normalized = sorted(set(str(item).strip().upper() for item in source if str(item).strip()))
        if not normalized or any(item not in allowed for item in normalized):
            raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "%s contains unsupported values." % name)
        return normalized

    object_ids = scope.get("object_ids")
    if object_ids is not None:
        if not isinstance(object_ids, list) or not object_ids or len(object_ids) > 25_000:
            raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "object_ids must contain 1 to 25,000 values.")
        object_ids = sorted(set(str(item).strip() for item in object_ids if str(item).strip()))
        if not object_ids:
            raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", "object_ids contains no usable values.")

    raw_configuration = payload.get("configuration") or {}
    configuration = _bounded_configuration(raw_configuration)
    start_time = _utc(raw_configuration.get("start_time"), "configuration.start_time")
    start = dt.datetime.fromisoformat(start_time[:-1] + "+00:00")
    end = start + dt.timedelta(seconds=configuration["horizon_seconds"])
    configuration["start_time"] = start_time
    configuration["end_time"] = end.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return {
        "schema_version": SERVICE_SCHEMA_VERSION,
        "capability": "FULL_CATALOG_SCREENING",
        "maturity": "Experimental",
        "safety_class": "non-operational",
        "catalog_revision_id": revision_id,
        "catalog_scope": {
            "object_types": values("object_types", sorted(SUPPORTED_OBJECT_TYPES), SUPPORTED_OBJECT_TYPES, 8),
            "lifecycle_statuses": values("lifecycle_statuses", DEFAULT_LIFECYCLE, SUPPORTED_LIFECYCLE, 8),
            "object_ids": object_ids,
        },
        "configuration": configuration,
    }


def configured_authenticator(environment: Optional[Mapping[str, str]] = None) -> BearerTokenAuthenticator:
    source = os.environ if environment is None else environment
    entries = []
    for role, name in (
        ("viewer", "OPENBEXI_API_VIEWER_TOKEN"),
        ("analyst", "OPENBEXI_API_ANALYST_TOKEN"),
        ("administrator", "OPENBEXI_API_ADMIN_TOKEN"),
    ):
        if source.get(name):
            entries.append((role, source[name]))
    return BearerTokenAuthenticator(entries)


def _source_observations(
    records: Sequence[Dict[str, Any]],
    observed_at: Optional[str],
    previous_objects: Sequence[Dict[str, Any]] = (),
    *,
    include_absent: bool = False,
) -> list[Dict[str, Any]]:
    observations = []
    timestamp = observed_at or dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    previous_by_id = {str(item.get("object_id")): item for item in previous_objects}
    observed_ids = set()

    object_type_aliases = {
        "PAY": "PAYLOAD",
        "PAYLOAD": "PAYLOAD",
        "R/B": "ROCKET_BODY",
        "ROCKET BODY": "ROCKET_BODY",
        "ROCKET_BODY": "ROCKET_BODY",
        "DEB": "DEBRIS",
        "DEBRIS": "DEBRIS",
    }
    for record in records:
        norad_id = str(record.get("norad_id") or record.get("NORAD_CAT_ID") or "").strip().upper()
        line1 = str(record.get("tle_line1") or record.get("line1") or "").strip()
        line2 = str(record.get("tle_line2") or record.get("line2") or "").strip()
        if not norad_id or not line1 or not line2:
            continue
        object_id = "obx:norad:" + norad_id
        observed_ids.add(object_id)
        element_digest = hashlib.sha256((line1 + "\n" + line2).encode("ascii", errors="replace")).hexdigest()[:32]
        element_set_id = "elset:sha256:" + element_digest
        object_type = object_type_aliases.get(
            str(record.get("object_type") or record.get("OBJECT_TYPE") or "").strip().upper(),
            "UNKNOWN",
        )
        lifecycle = str(record.get("lifecycle_status") or "UNKNOWN").strip().upper()
        if lifecycle not in SUPPORTED_LIFECYCLE:
            lifecycle = "UNKNOWN"
        previous = previous_by_id.get(object_id)
        if previous is None:
            observation_status = "NEW"
        elif str(previous.get("observation_status", "")).upper() == "ABSENT":
            observation_status = "REAPPEARED"
        elif any((
            str(previous.get("current_element_set_id") or previous.get("observed_element_set_id") or "") != element_set_id,
            str(previous.get("name") or "") != str(record.get("satellite_name") or record.get("name") or ("NORAD " + norad_id)),
            str(previous.get("object_type") or "UNKNOWN") != object_type,
            str(previous.get("lifecycle_status") or "UNKNOWN") != lifecycle,
        )):
            observation_status = "CHANGED"
        else:
            observation_status = "OBSERVED"
        observations.append({
            "object_id": object_id,
            "norad_id": norad_id,
            "international_designator": None,
            "name": str(record.get("satellite_name") or record.get("name") or ("NORAD " + norad_id)),
            "object_type": object_type,
            "lifecycle_status": lifecycle,
            "observation_status": observation_status,
            "observed_at": timestamp,
            "element_set_id": element_set_id,
        })
    if include_absent:
        for object_id in sorted(set(previous_by_id) - observed_ids):
            previous = previous_by_id[object_id]
            observations.append({
                "object_id": object_id,
                "norad_id": previous.get("norad_id"),
                "international_designator": previous.get("international_designator"),
                "name": str(previous.get("name") or object_id),
                "object_type": str(previous.get("object_type") or "UNKNOWN"),
                "lifecycle_status": str(previous.get("lifecycle_status") or "UNKNOWN"),
                "observation_status": "ABSENT",
                "observed_at": timestamp,
                "element_set_id": None,
            })
    observations.sort(key=lambda item: item["object_id"])
    return observations


def _public_catalog(revision: Dict[str, Any]) -> Dict[str, Any]:
    """Remove private artifact locations from an authenticated status response."""

    result = dict(revision)
    result.pop("snapshot_path", None)
    result.pop("metadata_path", None)
    metadata = dict(result.get("metadata") or {})
    metadata.pop("snapshot_path", None)
    metadata.pop("metadata_path", None)
    result["metadata"] = metadata
    return result


class V21ApiService:
    def __init__(
        self,
        *,
        root: Path,
        runtime_root: Path,
        store: JobStore,
        feature_flag: ServerFeatureFlag,
        authenticator: BearerTokenAuthenticator,
        cursor_secret: str | bytes,
        manager: Optional[ScreeningJobManager] = None,
    ) -> None:
        self.root = Path(root).resolve()
        self.runtime_root = Path(runtime_root).resolve()
        self.store = store
        self.feature_flag = feature_flag
        self.authenticator = authenticator
        self.cursor_codec = CursorCodec(cursor_secret)
        self.manager = manager
        self.read_limiter = SlidingWindowRateLimiter(limit=240, window_seconds=60)
        self.mutation_limiter = SlidingWindowRateLimiter(limit=30, window_seconds=60)

    def bootstrap_bundled_catalog(self) -> Dict[str, Any]:
        registry = CatalogSnapshotRegistry(self.runtime_root)
        try:
            snapshot = registry.snapshot_tle_json(
                self.root / "json" / "tle" / "TLE.json",
                self.root / "json" / "tle" / "TLE.meta.json",
            )
            existing = self.store.get_catalog_revision(snapshot.revision_id)
            if existing is not None:
                return _public_catalog(existing)
            records = registry.load_records(snapshot)
            observations = _source_observations(
                records,
                snapshot.retrieved_at,
                self.store.list_current_objects(),
                include_absent=snapshot.source_status == "COMPLETE",
            )
            present_count = sum(item["observation_status"] != "ABSENT" for item in observations)
            provenance = {
                "schema_version": SERVICE_SCHEMA_VERSION,
                "source_id": snapshot.source_id,
                "provider": snapshot.provider,
                "retrieved_at": snapshot.retrieved_at,
                "dataset_id": snapshot.dataset_id,
                "dataset_hash": snapshot.dataset_hash,
                "source_uri": None,
                "source_status": snapshot.source_status,
                "partial_update": snapshot.source_status != "COMPLETE",
                "license_id": snapshot.license_id,
            }
            return _public_catalog(self.store.create_catalog_revision(
                snapshot.revision_id,
                snapshot.source_id,
                snapshot.dataset_id,
                snapshot.metadata(),
                observations,
                snapshot.snapshot_path,
                metadata_path=snapshot.metadata_path,
                dataset_format=snapshot.source_format,
                adapter_version=snapshot.adapter_version,
                accepted_count=len(observations),
                quarantined_count=max(0, snapshot.object_count - present_count),
                provenance=provenance,
                dataset_hash=snapshot.dataset_hash,
                source_status=snapshot.source_status,
                retrieved_at=snapshot.retrieved_at,
                actor_id="catalog-bootstrap",
            ))
        except (CatalogSnapshotError, OSError, ValueError, JobStoreError) as exc:
            raise ApiProblem(503, "CATALOG_UNAVAILABLE", "Catalog unavailable", "The bundled catalog could not be registered.") from exc

    def start(self) -> Dict[str, Any]:
        catalog = self.bootstrap_bundled_catalog()
        manager_status = self.manager.start() if self.manager and self.feature_flag.enabled else {"started": False}
        return {"catalog_revision_id": catalog["revision_id"], "manager": manager_status}

    def stop(self) -> None:
        if self.manager:
            self.manager.stop()

    def authenticate(self, authorization: Optional[str], required_role: str, remote_key: str = "local") -> Principal:
        principal = self.authenticator.authenticate(authorization, required_role=required_role)
        limiter = self.mutation_limiter if required_role in {"analyst", "administrator"} else self.read_limiter
        limiter.require(principal.principal_id + ":" + remote_key)
        return principal

    def capabilities(self) -> Dict[str, Any]:
        current = self.store.get_current_catalog_revision() if self.feature_flag.enabled else None
        return {
            "api_version": API_VERSION,
            "service_schema_version": SERVICE_SCHEMA_VERSION,
            "full_catalog_screening": {
                "enabled": self.feature_flag.enabled,
                "authenticated": self.authenticator.configured,
                "worker_running": bool(self.manager and self.manager.running),
                "current_catalog_revision_id": current["revision_id"] if current else None,
                "maturity": self.feature_flag.scientific_maturity,
                "safety_class": self.feature_flag.safety_class,
                "collision_probability": "UNAVAILABLE",
                "supported_source_formats": ["TLE_JSON", "CCSDS_OMM_JSON", "CCSDS_OMM_KVN", "CCSDS_OEM_KVN", "PROVIDER_EPHEMERIS_JSON"],
                "supported_object_types": sorted(SUPPORTED_OBJECT_TYPES),
                "supported_lifecycle_statuses": sorted(SUPPORTED_LIFECYCLE),
                "default_configuration": dict(DEFAULT_CONFIGURATION),
                "configuration_limits": {
                    name: {"minimum": bounds[0], "maximum": bounds[1], "integer": bounds[2]}
                    for name, bounds in CONFIGURATION_LIMITS.items()
                },
            },
            "static_fallback": "SELECTED_OBJECT_BROWSER_SCREENING",
        }

    def health(self, ready: bool = False) -> tuple[int, Dict[str, Any]]:
        health = self.store.health()
        capable = True
        if ready:
            capable = (
                self.feature_flag.enabled
                and health["status"] == "healthy"
                and bool(health.get("current_catalog_revision_id"))
                and bool(self.manager and self.manager.running)
            )
        return (200 if capable else 503), {
            "status": "ready" if capable and ready else ("live" if not ready else "unavailable"),
            "api_version": API_VERSION,
            "feature_enabled": self.feature_flag.enabled,
            "auth_configured": self.authenticator.configured,
            "worker_running": bool(self.manager and self.manager.running),
            "store": health,
        }

    @staticmethod
    def _filter_hash(kind: str, filters: Dict[str, Any]) -> str:
        return hashlib.sha256((kind + "\n" + canonical_json(filters)).encode("utf-8")).hexdigest()

    def _decode_cursor(self, cursor: Optional[str], kind: str, filters: Dict[str, Any]) -> Optional[str]:
        if not cursor:
            return None
        value = self.cursor_codec.decode(cursor, filter_hash=self._filter_hash(kind, filters))
        raw = value.get("store_cursor")
        if not isinstance(raw, str):
            raise ApiProblem(400, "CURSOR_INVALID", "Invalid cursor", "The pagination cursor is invalid.")
        return raw

    def _encode_cursor(self, cursor: Optional[str], kind: str, filters: Dict[str, Any]) -> Optional[str]:
        if not cursor:
            return None
        return self.cursor_codec.encode({"store_cursor": cursor}, filter_hash=self._filter_hash(kind, filters))

    def list_catalogs(self, *, limit: int, cursor: Optional[str], source_id: Optional[str], source_status: Optional[str]) -> Dict[str, Any]:
        filters = {"source_id": source_id, "source_status": source_status}
        try:
            page = self.store.list_catalog_revisions(
                limit=limit,
                cursor=self._decode_cursor(cursor, "catalogs", filters),
                source_id=source_id,
                source_status=source_status,
            )
        except ValidationError as exc:
            raise ApiProblem(400, "QUERY_INVALID", "Invalid query", str(exc)) from exc
        page["next_cursor"] = self._encode_cursor(page["next_cursor"], "catalogs", filters)
        page["items"] = [_public_catalog(item) for item in page["items"]]
        return page

    def get_catalog(self, revision_id: str) -> Dict[str, Any]:
        revision = self.store.get_current_catalog_revision() if revision_id == "current" else self.store.get_catalog_revision(revision_id)
        if revision is None:
            raise ApiProblem(404, "CATALOG_NOT_FOUND", "Catalog not found", "The requested catalog revision does not exist.")
        return _public_catalog(revision)

    def submit_job(self, payload: object, idempotency_key: Optional[str], principal: Principal) -> tuple[bool, Dict[str, Any]]:
        if not self.feature_flag.enabled:
            raise ApiProblem(503, "CAPABILITY_DISABLED", "Capability unavailable", "Full-catalog screening is disabled.")
        current = self.store.get_current_catalog_revision()
        if current is None:
            raise ApiProblem(503, "CATALOG_UNAVAILABLE", "Catalog unavailable", "No current catalog revision is registered.")
        request = normalize_job_request(payload, current["revision_id"])
        revision = self.store.get_catalog_revision(request["catalog_revision_id"])
        if revision is None:
            raise ApiProblem(400, "CATALOG_REVISION_INVALID", "Invalid catalog revision", "The requested catalog revision does not exist.")
        key = validate_idempotency_key(idempotency_key)
        try:
            created = self.store.create_job(
                key,
                request,
                request["catalog_revision_id"],
                owner_id=principal.principal_id,
                max_attempts=request["configuration"]["max_attempts"],
                actor_id=principal.principal_id,
            )
        except IdempotencyConflictError as exc:
            raise ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency conflict", str(exc)) from exc
        except ValidationError as exc:
            raise ApiProblem(400, "REQUEST_INVALID", "Invalid request", str(exc)) from exc
        if self.manager:
            self.manager.notify()
        return bool(created["created"]), created["job"]

    @staticmethod
    def authorize_job(job: Dict[str, Any], principal: Principal) -> None:
        # The bundled credential registry is role based, not a multi-tenant identity
        # provider. Any authenticated viewer may inspect local job history.
        _ = (job, principal)

    def get_job(self, job_id: str, principal: Principal) -> Dict[str, Any]:
        try:
            job = self.store.get_job(job_id)
        except JobNotFoundError as exc:
            raise ApiProblem(404, "JOB_NOT_FOUND", "Job not found", "The requested screening job does not exist.") from exc
        self.authorize_job(job, principal)
        job["attempts"] = self.store.list_attempts(job_id)
        return job

    def list_jobs(self, principal: Principal, *, limit: int, cursor: Optional[str], states: Sequence[str], catalog_revision_id: Optional[str]) -> Dict[str, Any]:
        owner_id = None
        filters = {"owner_id": owner_id, "states": sorted(states), "catalog_revision_id": catalog_revision_id}
        try:
            page = self.store.list_jobs(
                limit=limit,
                cursor=self._decode_cursor(cursor, "jobs", filters),
                owner_id=owner_id,
                states=states,
                catalog_revision_id=catalog_revision_id,
            )
        except ValidationError as exc:
            raise ApiProblem(400, "QUERY_INVALID", "Invalid query", str(exc)) from exc
        page["next_cursor"] = self._encode_cursor(page["next_cursor"], "jobs", filters)
        return page

    def cancel_job(self, job_id: str, principal: Principal) -> Dict[str, Any]:
        job = self.get_job(job_id, principal)
        try:
            cancelled = self.store.request_cancellation(job_id, actor_id=principal.principal_id)
        except StateTransitionError as exc:
            raise ApiProblem(409, "JOB_STATE_CONFLICT", "Job state conflict", str(exc)) from exc
        if self.manager:
            self.manager.notify()
        return cancelled

    def retry_job(self, job_id: str, principal: Principal) -> Dict[str, Any]:
        self.get_job(job_id, principal)
        try:
            job = self.store.retry_job(job_id, actor_id=principal.principal_id)
        except StateTransitionError as exc:
            raise ApiProblem(409, "JOB_STATE_CONFLICT", "Job state conflict", str(exc)) from exc
        if self.manager:
            self.manager.notify()
        return job

    def replay_job(self, job_id: str, idempotency_key: Optional[str], principal: Principal) -> tuple[bool, Dict[str, Any]]:
        original = self.get_job(job_id, principal)
        key = validate_idempotency_key(idempotency_key)
        try:
            created = self.store.create_job(
                key,
                original["request"],
                original["catalog_revision_id"],
                owner_id=principal.principal_id,
                max_attempts=original["max_attempts"],
                actor_id=principal.principal_id,
            )
        except IdempotencyConflictError as exc:
            raise ApiProblem(409, "IDEMPOTENCY_CONFLICT", "Idempotency conflict", str(exc)) from exc
        if self.manager:
            self.manager.notify()
        return bool(created["created"]), created["job"]

    def list_events(
        self,
        *,
        limit: int,
        cursor: Optional[str],
        job_id: Optional[str],
        object_id: Optional[str],
        tca_from: Optional[str],
        tca_to: Optional[str],
        max_miss_distance_km: Optional[float],
        order: str,
    ) -> Dict[str, Any]:
        filters = {
            "job_id": job_id,
            "object_id": object_id,
            "tca_from": tca_from,
            "tca_to": tca_to,
            "max_miss_distance_km": max_miss_distance_km,
            "order": order,
        }
        try:
            page = self.store.list_events(
                limit=limit,
                cursor=self._decode_cursor(cursor, "events", filters),
                job_id=job_id,
                object_id=object_id,
                tca_from=tca_from,
                tca_to=tca_to,
                max_miss_distance_km=max_miss_distance_km,
                order=order,
            )
        except ValidationError as exc:
            raise ApiProblem(400, "QUERY_INVALID", "Invalid query", str(exc)) from exc
        page["next_cursor"] = self._encode_cursor(page["next_cursor"], "events", filters)
        return page

    def get_event(self, event_id: str) -> Dict[str, Any]:
        try:
            return self.store.get_event(event_id)
        except JobStoreError as exc:
            raise ApiProblem(404, "EVENT_NOT_FOUND", "Event not found", "The requested event revision does not exist.") from exc

    def outbox(self, job_id: str, after_id: int, principal: Principal) -> list[Dict[str, Any]]:
        self.get_job(job_id, principal)
        return self.store.list_outbox(after_id=after_id, job_id=job_id, limit=100)
