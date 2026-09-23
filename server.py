#!/usr/bin/env python3
"""Local OpenBEXI Earth Orbit server.

The server intentionally uses only the Python standard library so the existing
static app can gain local API and OpenAPI documentation without adding a
mandatory Python dependency installation step.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import ipaddress
import json
import math
import mimetypes
import os
import random
import re
import secrets
import threading
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer as _ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import quote, unquote, urlparse

from services.v21.api import V21ApiService, configured_authenticator
from services.v21.feature_flags import load_server_feature_flag
from services.v21.http_api import V21HttpRouter
from services.v21.job_manager import ScreeningJobManager
from services.v21.job_store import JobStore


ROOT = Path(__file__).resolve().parent
RELEASE_METADATA_PATH = ROOT / "release" / "version.json"
RELEASE_METADATA = json.loads(RELEASE_METADATA_PATH.read_text(encoding="utf-8"))
APP_VERSION = str(RELEASE_METADATA["version"])
PUBLICATION_STATE = str(RELEASE_METADATA["publicationState"])
CANDIDATE_DATE = RELEASE_METADATA.get("candidateAt")
RELEASE_DATE = RELEASE_METADATA.get("releasedAt")
PUBLICATION_DATE = RELEASE_DATE or CANDIDATE_DATE
REPO_URL = "https://github.com/arcazj/openbexi_earth_orbit"
API_V1_VERSION = "1.0.0"

STATIC_ROOT_FILE_ALLOWLIST = frozenset(
    {
        "display_satellite.html",
        "earth_stars_milkyway.html",
        "index.html",
        "license.md",
        "markdown_viewer.html",
        "readme.md",
        "release_notes.md",
        "swagger.html",
        "swagger.md",
        "solarsystemoverview.html",
    }
)
STATIC_PREFIX_SUFFIX_ALLOWLIST = (
    (("css",), frozenset({".css"})),
    (("data", "ephemeris"), frozenset({".json"})),
    (("data", "stars"), frozenset({".js"})),
    (("icons",), frozenset({".png", ".svg"})),
    (("js",), frozenset({".js", ".mjs"})),
    (("obj",), frozenset({".glb", ".gltf", ".jpg", ".jpeg", ".mtl", ".obj", ".png", ".webp"})),
    (("textures",), frozenset({".jpg", ".jpeg", ".ktx2", ".png", ".webp"})),
)
STATIC_JSON_FILE_ALLOWLIST = frozenset(
    {
        ("json", "decayed", "decayed.json"),
        ("json", "gp", "gp.json"),
        ("json", "gp", "gp.meta.json"),
        ("json", "launches", "launches.json"),
        ("json", "launches", "launches.meta.json"),
        ("json", "tle", "tle.json"),
        ("json", "tle", "tle.meta.json"),
    }
)
STATIC_VENDOR_FILE_ALLOWLIST = frozenset(
    {
        ("vendor", "satellite.js", "6.0.2", "satellite.es.js"),
        ("vendor", "satellite.js", "6.0.2", "satellite.min.js"),
        ("vendor", "three", "0.184.0", "build", "three.core.js"),
        ("vendor", "three", "0.184.0", "build", "three.module.js"),
        ("vendor", "three", "0.184.0", "examples", "jsm", "controls", "orbitcontrols.js"),
        ("vendor", "three", "0.184.0", "examples", "jsm", "loaders", "gltfloader.js"),
        ("vendor", "three", "0.184.0", "examples", "jsm", "loaders", "mtlloader.js"),
        ("vendor", "three", "0.184.0", "examples", "jsm", "loaders", "objloader.js"),
        ("vendor", "three", "0.184.0", "examples", "jsm", "renderers", "css2drenderer.js"),
        ("vendor", "three", "0.184.0", "examples", "jsm", "utils", "buffergeometryutils.js"),
        ("vendor", "three", "0.184.0", "examples", "jsm", "utils", "skeletonutils.js"),
    }
)
STATIC_BLOCKED_PARTS = frozenset(
    {
        ".git",
        ".github",
        ".idea",
        "__pycache__",
        "node_modules",
        "out",
        "src",
        "target",
        "tests",
        "tests_python",
        "tools",
    }
)
STATIC_BLOCKED_SUFFIXES = frozenset(
    {
        ".class",
        ".env",
        ".iml",
        ".java",
        ".lock",
        ".py",
        ".pyc",
        ".pyo",
        ".tmp",
        ".toml",
        ".xml",
        ".yaml",
        ".yml",
    }
)
SAFE_HOST_HEADER = re.compile(r"^[A-Za-z0-9.\-:\[\]]+$")
MAX_CONCURRENT_REQUESTS = 8
REQUEST_QUEUE_SIZE = 64
REQUEST_SOCKET_TIMEOUT_SECONDS = 30.0


class ThreadingHTTPServer(_ThreadingHTTPServer):
    """Threaded local server with finite request and idle-socket capacity."""

    daemon_threads = True
    request_queue_size = REQUEST_QUEUE_SIZE

    def __init__(self, *args, max_concurrent_requests: int = MAX_CONCURRENT_REQUESTS, **kwargs):
        self._request_slots = threading.BoundedSemaphore(max(1, int(max_concurrent_requests)))
        super().__init__(*args, **kwargs)

    def get_request(self):
        request, client_address = super().get_request()
        request.settimeout(REQUEST_SOCKET_TIMEOUT_SECONDS)
        return request, client_address

    def process_request(self, request, client_address) -> None:
        if not self._request_slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._request_slots.release()
            raise

    def process_request_thread(self, request, client_address) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._request_slots.release()

try:
    from tools.satellite_data_tools import (
        DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
        maybe_update_satellite_data,
    )
    from tools.satellite_data_plane import (
        DataPlaneCancelled,
        SatelliteDataPlane,
    )
except Exception as exc:  # pragma: no cover - exposed through /api/data-update-status
    DEFAULT_SERVER_UPDATE_INTERVAL_HOURS = 24.0
    maybe_update_satellite_data = None
    SatelliteDataPlane = None
    DataPlaneCancelled = RuntimeError
    DATA_TOOL_IMPORT_ERROR = str(exc)
else:
    DATA_TOOL_IMPORT_ERROR = None


DATA_UPDATE_STATUS_LOCK = threading.Lock()
TRACKED_CHUNK_VALIDATION_LOCK = threading.Lock()
TRACKED_CHUNK_VALIDATION_CACHE_MAX_ITEMS = 128
TRACKED_CHUNK_VALIDATION_CACHE: dict[tuple[object, ...], dict[str, object] | None] = {}
TRACKED_CHUNK_BASENAME_PATTERN = re.compile(r"^([a-f0-9]{64})-[a-z0-9-]+\.json$")
TRACKED_REVISION_PATTERN = re.compile(r"^sha256:[a-f0-9]{64}$")
TRACKED_NORAD_ID_PATTERN = re.compile(r"^[1-9][0-9]{0,8}$")
TRACKED_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_SAFE_JSON_INTEGER = (1 << 53) - 1
PRODUCER_UTC_TIMESTAMP_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$"
)
TRACKED_OBJECT_TYPES = frozenset(
    {"PAYLOAD", "DEBRIS", "ROCKET_BODY", "MISSION_RELATED", "UNKNOWN"}
)
TRACKED_LIFECYCLE_STATUSES = frozenset(
    {"ACTIVE", "INACTIVE", "UNKNOWN", "DECAYED", "ABSENT", "RETIRED"}
)
TRACKED_OBSERVATION_STATUSES = frozenset(
    {"NEW", "OBSERVED", "CHANGED", "ABSENT", "REAPPEARED"}
)
TRACKED_MEMBERSHIP_STATUSES = frozenset({"PRESENT", "ABSENT"})
TRACKED_HISTORICAL_LIFECYCLE_STATUSES = frozenset({"DECAYED", "ABSENT", "RETIRED"})
TRACKED_ROW_ACCOUNTING_KEYS = (
    "received",
    "accepted",
    "quarantined",
    "duplicates",
    "issues",
    "expected",
    "expected_provider_records",
)
CATALOG_REVISION_CACHE_LOCK = threading.Lock()
CATALOG_REVISION_CACHE_MAX_ITEMS = 16
CATALOG_REVISION_CACHE: dict[tuple[object, ...], str] = {}
DATA_UPDATE_ERROR_MAX_LENGTH = 1000
DATA_UPDATE_ERROR_MAX_ITEMS = 10
DATA_UPDATE_RESULT_MAX_DEPTH = 8
DATA_UPDATE_RESULT_MAX_ITEMS = 100
DATASET_STATUS_METADATA_NAMES = {
    "gp": "gp",
    "tle": "tle",
    "satcat": "satcat",
    "tracked": "tracked",
    "launch": "launches",
    "decay": "decayed",
}
SENSITIVE_ERROR_ASSIGNMENT = re.compile(
    r"(?i)\b(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret)"
    r"(\s*[:=]\s*)([^&\s,;]+)"
)
BEARER_CREDENTIAL = re.compile(r"(?i)\bbearer\s+[^\s,;]+")
URL_USERINFO = re.compile(r"(?i)(https?://)[^/@\s]+@")
DATA_UPDATE_STATUS: dict[str, object] = {
    "enabled": False,
    "running": False,
    "state": "disabled",
    "interval_hours": DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
    "intervals_hours": {
        "gp": DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
        "tle": DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
        "satcat": DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
        "tracked": DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
        "reconciliation": DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
    },
    "consecutive_failures": 0,
    "next_check_at": None,
    "last_result": None,
    "last_error": None,
    "last_errors": [],
}


def _bounded_public_error(value: object) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = "".join(" " if ord(character) < 32 or ord(character) == 127 else character for character in value)
    text = URL_USERINFO.sub(r"\1<redacted>@", text)
    text = BEARER_CREDENTIAL.sub("Bearer <redacted>", text)
    text = SENSITIVE_ERROR_ASSIGNMENT.sub(r"\1\2<redacted>", text)
    text = " ".join(text.split())
    if len(text) > DATA_UPDATE_ERROR_MAX_LENGTH:
        text = text[: DATA_UPDATE_ERROR_MAX_LENGTH - 3].rstrip() + "..."
    return text or None


def _bounded_public_errors(values: object) -> list[str]:
    if not isinstance(values, (list, tuple)):
        values = [values]
    errors: list[str] = []
    for value in values:
        error = _bounded_public_error(value)
        if error and error not in errors:
            errors.append(error)
        if len(errors) >= DATA_UPDATE_ERROR_MAX_ITEMS:
            break
    return errors


def _data_update_result_key_is_sensitive(value: str) -> bool:
    normalized = re.sub(r"[^a-z0-9]", "", value.lower())
    return (
        "authorization" in normalized
        or "apikey" in normalized
        or "token" in normalized
        or "password" in normalized
        or "passwd" in normalized
        or "secret" in normalized
    )


def _public_data_update_result(value: object, *, depth: int = 0) -> object:
    if depth >= DATA_UPDATE_RESULT_MAX_DEPTH:
        return "<maximum depth omitted>"
    if isinstance(value, dict):
        public: dict[str, object] = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= DATA_UPDATE_RESULT_MAX_ITEMS:
                public["_omitted_items"] = len(value) - DATA_UPDATE_RESULT_MAX_ITEMS
                break
            public_key = "".join(
                " " if ord(character) < 32 or ord(character) == 127 else character
                for character in str(key)
            ).strip()[:128]
            if not public_key:
                continue
            normalized_key = public_key.lower()
            if _data_update_result_key_is_sensitive(public_key):
                public[public_key] = "<redacted>"
            elif normalized_key == "errors":
                public[public_key] = _bounded_public_errors(item)
            elif normalized_key == "error":
                public[public_key] = _bounded_public_error(item)
            else:
                public[public_key] = _public_data_update_result(item, depth=depth + 1)
        return public
    if isinstance(value, (list, tuple)):
        return [
            _public_data_update_result(item, depth=depth + 1)
            for item in value[:DATA_UPDATE_RESULT_MAX_ITEMS]
        ]
    if isinstance(value, str):
        return _bounded_public_error(value) or ""
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return _bounded_public_error(str(value))


def _set_data_update_status(**updates: object) -> None:
    with DATA_UPDATE_STATUS_LOCK:
        DATA_UPDATE_STATUS.update(updates)


def _data_update_status_snapshot(root: Path | None = None) -> dict[str, object]:
    with DATA_UPDATE_STATUS_LOCK:
        snapshot = dict(DATA_UPDATE_STATUS)
    health = _catalog_data_health(root or ROOT)
    live_error = _bounded_public_error(snapshot.get("last_error"))
    metadata_errors = [
        item.get("last_error")
        for item in health.get("datasets", {}).values()
        if isinstance(item, dict) and item.get("last_error")
    ]
    snapshot["last_error"] = live_error or health.get("last_error")
    snapshot["last_errors"] = _bounded_public_errors(
        [*(_bounded_public_errors(snapshot.get("last_errors"))), *metadata_errors]
    )
    if not health.get("last_reconciled_at") and snapshot.get("last_reconciled_at"):
        health["last_reconciled_at"] = snapshot["last_reconciled_at"]
    snapshot.update({key: value for key, value in health.items() if key != "last_error"})
    snapshot["dataset_status"] = _merged_dataset_status(snapshot, health)
    snapshot["last_result"] = _public_data_update_result(snapshot.get("last_result"))
    return snapshot


def _load_metadata(path: Path) -> dict[str, object]:
    try:
        payload = _strict_json_loads(
            path.read_bytes(),
            canonical_nonnegative_integers=(
                path.parent.name.lower() == "tracked"
                and path.name.lower() in {"tracked.manifest.json", "tracked.meta.json"}
            ),
        )
    except (OSError, ValueError, TypeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _metadata_count(meta: dict[str, object], *names: str) -> int:
    counts = meta.get("counts")
    if not isinstance(counts, dict):
        return 0
    for name in names:
        value = counts.get(name)
        if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
            return value
    return 0


def _metadata_revision(meta: dict[str, object]) -> str | None:
    for name in ("catalog_revision", "dataset_hash"):
        value = meta.get(name)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _parse_iso_timestamp(value: str) -> float | None:
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.timestamp()


def _producer_utc_timestamp_is_valid(value: object) -> bool:
    return (
        isinstance(value, str)
        and PRODUCER_UTC_TIMESTAMP_PATTERN.fullmatch(value) is not None
        and _parse_iso_timestamp(value) is not None
    )


def _is_nonnegative_safe_json_integer(value: object) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and 0 <= value <= MAX_SAFE_JSON_INTEGER
    )


def _reject_nonstandard_json_constant(value: str) -> None:
    raise ValueError(f"Non-standard JSON constant is not allowed: {value}")


def _reject_duplicate_json_object_keys(
    pairs: list[tuple[str, object]],
) -> dict[str, object]:
    value: dict[str, object] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"Duplicate JSON object key is not allowed: {key}")
        value[key] = item
    return value


def _parse_safe_json_integer(value: str) -> int:
    if re.fullmatch(r"(?:0|[1-9][0-9]*|-[1-9][0-9]*)", value) is None:
        raise ValueError(f"JSON integer is not canonical: {value}")
    parsed = int(value)
    if abs(parsed) > MAX_SAFE_JSON_INTEGER:
        raise ValueError(f"JSON integer exceeds the safe range: {value}")
    return parsed


def _parse_finite_json_float(value: str) -> float:
    parsed = float(value)
    if not math.isfinite(parsed):
        raise ValueError(f"JSON number is not finite: {value}")
    return parsed


def _parse_canonical_nonnegative_json_integer(value: str) -> int:
    if re.fullmatch(r"(?:0|[1-9][0-9]*)", value) is None:
        raise ValueError(f"Tracked JSON integer is not canonical: {value}")
    parsed = int(value)
    if parsed > MAX_SAFE_JSON_INTEGER:
        raise ValueError(f"Tracked JSON integer exceeds the safe range: {value}")
    return parsed


def _reject_tracked_json_float(value: str) -> None:
    raise ValueError(f"Tracked JSON numbers must use canonical integer syntax: {value}")


def _normalize_json_unicode_scalars(value: object) -> object:
    if isinstance(value, str):
        try:
            return value.encode("utf-16-le", errors="surrogatepass").decode(
                "utf-16-le", errors="strict"
            )
        except UnicodeDecodeError as exc:
            raise ValueError("JSON strings must contain only Unicode scalar values") from exc
    if isinstance(value, list):
        return [_normalize_json_unicode_scalars(item) for item in value]
    if isinstance(value, dict):
        normalized: dict[str, object] = {}
        for key, item in value.items():
            normalized_key = _normalize_json_unicode_scalars(key)
            if not isinstance(normalized_key, str):
                raise ValueError("JSON object keys must be strings")
            if normalized_key in normalized:
                raise ValueError(
                    f"Duplicate JSON object key after Unicode normalization: {normalized_key}"
                )
            normalized[normalized_key] = _normalize_json_unicode_scalars(item)
        return normalized
    return value


def _strict_json_loads(
    source: str | bytes | bytearray,
    *,
    canonical_nonnegative_integers: bool = False,
) -> object:
    if isinstance(source, (bytes, bytearray)):
        source = bytes(source).decode("utf-8", errors="strict")
    options: dict[str, object] = {
        "parse_constant": _reject_nonstandard_json_constant,
        "parse_int": _parse_safe_json_integer,
        "parse_float": _parse_finite_json_float,
        "object_pairs_hook": _reject_duplicate_json_object_keys,
    }
    if canonical_nonnegative_integers:
        options.update({
            "parse_int": _parse_canonical_nonnegative_json_integer,
            "parse_float": _reject_tracked_json_float,
        })
    return _normalize_json_unicode_scalars(json.loads(source, **options))


def _tracked_record_is_historical(record: dict[str, object]) -> bool:
    return (
        record.get("lifecycle_status") in TRACKED_HISTORICAL_LIFECYCLE_STATUSES
        or record.get("catalog_membership_status") == "ABSENT"
        or record.get("observation_status") == "ABSENT"
        or record.get("decay_date") is not None
    )


def _tracked_record_contract_is_valid(record: object) -> bool:
    if not isinstance(record, dict):
        return False
    norad_id = record.get("norad_id")
    lifecycle = record.get("lifecycle_status")
    observation = record.get("observation_status")
    membership = record.get("catalog_membership_status")
    decay_date = record.get("decay_date")
    has_current_elements = record.get("has_current_elements")
    metadata_only = record.get("metadata_only")
    if (
        not isinstance(norad_id, str)
        or TRACKED_NORAD_ID_PATTERN.fullmatch(norad_id) is None
        or not isinstance(lifecycle, str)
        or lifecycle not in TRACKED_LIFECYCLE_STATUSES
        or not isinstance(observation, str)
        or observation not in TRACKED_OBSERVATION_STATUSES
        or not isinstance(membership, str)
        or membership not in TRACKED_MEMBERSHIP_STATUSES
        or not isinstance(has_current_elements, bool)
        or not isinstance(metadata_only, bool)
        or metadata_only is has_current_elements
    ):
        return False
    if decay_date is not None:
        if not isinstance(decay_date, str) or TRACKED_DATE_PATTERN.fullmatch(decay_date) is None:
            return False
        try:
            if dt.date.fromisoformat(decay_date).isoformat() != decay_date:
                return False
        except ValueError:
            return False
    return not _tracked_record_is_historical(record) or (
        has_current_elements is False and metadata_only is True
    )


def _json_values_match_exact(left: object, right: object) -> bool:
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(
            _json_values_match_exact(left[key], right[key]) for key in left
        )
    if isinstance(left, list):
        return len(left) == len(right) and all(
            _json_values_match_exact(left_item, right_item)
            for left_item, right_item in zip(left, right)
        )
    return left == right


def _newest_timestamp(values: list[object]) -> str | None:
    candidates = [value.strip() for value in values if isinstance(value, str) and value.strip()]
    parsed = [(epoch, value) for value in candidates if (epoch := _parse_iso_timestamp(value)) is not None]
    if parsed:
        return max(parsed, key=lambda item: item[0])[1]
    return candidates[-1] if candidates else None


def _metadata_timestamp(meta: dict[str, object], name: str) -> str | None:
    value = meta.get(name)
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value if value and len(value) <= 128 and _parse_iso_timestamp(value) is not None else None


def _metadata_dataset_history(meta: dict[str, object]) -> dict[str, object]:
    last_status = meta.get("last_status")
    if not isinstance(last_status, str) or not last_status.strip():
        normalized_status = None
    else:
        normalized_status = last_status.strip()[:64]
    return {
        "last_status": normalized_status,
        "last_attempt_at": _metadata_timestamp(meta, "last_attempt_at"),
        "last_success_at": _metadata_timestamp(meta, "last_success_at"),
        "last_error": _bounded_public_error(meta.get("last_error")),
    }


def _metadata_history_state(last_status: object) -> str:
    normalized = str(last_status or "").strip().lower()
    if normalized in {"failed", "failure", "partial", "degraded", "error"}:
        return "degraded"
    if normalized in {"ok", "success", "succeeded", "not-modified", "current"}:
        return "current"
    return "unknown"


def _merged_dataset_status(
    snapshot: dict[str, object],
    health: dict[str, object],
) -> dict[str, dict[str, object]]:
    live_statuses = snapshot.get("dataset_status")
    if not isinstance(live_statuses, dict):
        live_statuses = {}
    intervals = snapshot.get("intervals_hours")
    if not isinstance(intervals, dict):
        intervals = {}
    health_datasets = health.get("datasets")
    if not isinstance(health_datasets, dict):
        health_datasets = {}

    merged_statuses: dict[str, dict[str, object]] = {}
    for metadata_name, status_name in DATASET_STATUS_METADATA_NAMES.items():
        metadata = health_datasets.get(metadata_name)
        if not isinstance(metadata, dict):
            metadata = {}
        interval_name = "satcat" if status_name in {"launches", "decayed"} else status_name
        interval = intervals.get(interval_name, snapshot.get("interval_hours"))
        status: dict[str, object] = {
            "interval_hours": interval,
            "state": _metadata_history_state(metadata.get("last_status")),
            "due": None,
        }
        for key in ("last_status", "last_attempt_at", "last_success_at", "last_error"):
            status[key] = metadata.get(key)

        live = live_statuses.get(status_name)
        if isinstance(live, dict):
            status.update(live)
            live_errors = _bounded_public_errors(live.get("errors"))
            if live_errors:
                status["errors"] = live_errors
                status["last_error"] = live_errors[0]
                status["last_status"] = "failed"
                if not live.get("last_attempt_at") and isinstance(live.get("last_checked_at"), str):
                    status["last_attempt_at"] = live["last_checked_at"]
            elif "errors" in status:
                status.pop("errors", None)
            status["last_error"] = _bounded_public_error(status.get("last_error"))
        merged_statuses[status_name] = status

    for name, live in live_statuses.items():
        if name in merged_statuses or not isinstance(live, dict):
            continue
        status = dict(live)
        errors = _bounded_public_errors(status.get("errors"))
        if errors:
            status["errors"] = errors
        else:
            status.pop("errors", None)
        if "last_error" in status:
            status["last_error"] = _bounded_public_error(status.get("last_error"))
        merged_statuses[name] = status
    return merged_statuses


def _composite_data_revision(
    *,
    gp: str | None,
    launch: str | None,
    decay: str | None,
    tle: str | None = None,
    satcat: str | None = None,
    tracked: str | None = None,
) -> str:
    components = {
        "decay_revision": decay,
        "gp_revision": gp,
        "launch_revision": launch,
        "satcat_revision": satcat,
        "tle_revision": tle,
    }
    if tracked is not None:
        components["tracked_revision"] = tracked
    canonical = json.dumps(components, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return f"sha256:{hashlib.sha256(canonical).hexdigest()}"


def _catalog_artifact_available(path: Path) -> bool:
    try:
        return path.is_file() and path.stat().st_size > 2
    except OSError:
        return False


def _tracked_manifest_pointer_is_valid(manifest: dict[str, object]) -> bool:
    quarantine = manifest.get("quarantine")
    return bool(
        _metadata_revision(manifest)
        and isinstance(manifest.get("counts"), dict)
        and isinstance(manifest.get("chunks"), list)
        and isinstance(manifest.get("history_chunks"), list)
        and isinstance(quarantine, dict)
        and isinstance(quarantine.get("path"), str)
        and quarantine.get("path")
    )


def _tracked_authoritative_counts(
    payload: dict[str, object],
) -> tuple[int, int, int, int, int] | None:
    counts = payload.get("counts")
    if not isinstance(counts, dict):
        return None

    current = counts.get("current")
    total = counts.get("total")
    history_total = counts.get("history_total")
    historical = counts.get("historical")
    absent = counts.get("absent")
    values = (current, historical, absent, history_total, total)
    if any(not _is_nonnegative_safe_json_integer(value) for value in values):
        return None
    if historical > history_total or absent > history_total or total != current + history_total:
        return None
    return current, historical, absent, history_total, total


def _tracked_availability_counts(payload: dict[str, object]) -> tuple[int, int, int, int] | None:
    authoritative = _tracked_authoritative_counts(payload)
    counts = payload.get("counts")
    if authoritative is None or not isinstance(counts, dict):
        return None
    current, _, _, _, total = authoritative
    values = tuple(
        counts.get(name)
        for name in (
            "propagatable",
            "metadata_only",
            "current_propagatable",
            "current_metadata_only",
        )
    )
    if any(not _is_nonnegative_safe_json_integer(value) for value in values):
        return None
    propagatable, metadata_only, current_propagatable, current_metadata_only = values
    if total != propagatable + metadata_only or current != current_propagatable + current_metadata_only:
        return None
    return values


def _tracked_row_accounting_counts(
    payload: dict[str, object],
) -> tuple[int, int, int, int, int, int | None, int | None] | None:
    counts = payload.get("counts")
    if not isinstance(counts, dict) or any(key not in counts for key in TRACKED_ROW_ACCOUNTING_KEYS):
        return None
    row_values = tuple(counts.get(key) for key in TRACKED_ROW_ACCOUNTING_KEYS[:5])
    if any(
        not _is_nonnegative_safe_json_integer(value)
        for value in row_values
    ):
        return None
    optional_values = tuple(counts.get(key) for key in TRACKED_ROW_ACCOUNTING_KEYS[5:])
    if any(
        value is not None
        and not _is_nonnegative_safe_json_integer(value)
        for value in optional_values
    ):
        return None
    return (*row_values, *optional_values)


def _tracked_metadata_pointer_error(
    manifest: dict[str, object],
    tracked_meta: dict[str, object],
) -> str | None:
    manifest_revision = _recomputed_tracked_catalog_revision(manifest)
    metadata_revision = tracked_meta.get("catalog_revision")
    metadata_hash = tracked_meta.get("dataset_hash")
    if (
        manifest.get("catalog_revision") != manifest_revision
        or not isinstance(metadata_revision, str)
        or metadata_hash != metadata_revision
        or metadata_revision != manifest_revision
    ):
        return "Tracked manifest and metadata revisions are inconsistent."
    coverage_revision = manifest.get("coverage_revision")
    if (
        not isinstance(coverage_revision, str)
        or not TRACKED_REVISION_PATTERN.fullmatch(coverage_revision)
        or tracked_meta.get("coverage_revision") != coverage_revision
        or not _json_values_match_exact(tracked_meta.get("coverage"), manifest.get("coverage"))
    ):
        return "Tracked manifest and metadata coverage revisions are inconsistent."
    coverage = manifest.get("coverage")
    complete_snapshot = (
        coverage.get("complete_source_snapshot") if isinstance(coverage, dict) else None
    )
    if complete_snapshot is True:
        last_reconciled_at = tracked_meta.get("last_reconciled_at")
        if (
            tracked_meta.get("source_status") != "VERIFIED_SNAPSHOT"
            or tracked_meta.get("last_reconciled_catalog_revision") != manifest_revision
            or not _producer_utc_timestamp_is_valid(last_reconciled_at)
        ):
            return "Tracked complete-snapshot claim is not backed by reconciled metadata."
    elif complete_snapshot is False:
        if tracked_meta.get("source_status") != "PARTIAL":
            return "Tracked partial snapshot is not identified as PARTIAL in metadata."
    else:
        return "Tracked complete-snapshot evidence is invalid."
    manifest_counts = _tracked_authoritative_counts(manifest)
    metadata_counts = _tracked_authoritative_counts(tracked_meta)
    manifest_availability = _tracked_availability_counts(manifest)
    metadata_availability = _tracked_availability_counts(tracked_meta)
    manifest_row_accounting = _tracked_row_accounting_counts(manifest)
    metadata_row_accounting = _tracked_row_accounting_counts(tracked_meta)
    if (
        manifest_counts is None
        or metadata_counts is None
        or metadata_counts != manifest_counts
        or manifest_availability is None
        or metadata_availability != manifest_availability
        or manifest_row_accounting is None
        or metadata_row_accounting != manifest_row_accounting
    ):
        return "Tracked manifest and metadata counts are inconsistent."
    raw_manifest_counts = manifest.get("counts")
    raw_metadata_counts = tracked_meta.get("counts")
    if not isinstance(raw_manifest_counts, dict) or not isinstance(raw_metadata_counts, dict):
        return "Tracked manifest and metadata object-type counts are inconsistent."
    for key in ("object_types", "current_object_types"):
        manifest_map = raw_manifest_counts.get(key)
        metadata_map = raw_metadata_counts.get(key)
        if (
            not isinstance(manifest_map, dict)
            or not isinstance(metadata_map, dict)
            or set(manifest_map) != set(TRACKED_OBJECT_TYPES)
            or not _json_values_match_exact(manifest_map, metadata_map)
            or any(
                not _is_nonnegative_safe_json_integer(value)
                for value in manifest_map.values()
            )
        ):
            return "Tracked manifest and metadata object-type counts are inconsistent."
    return None


def _catalog_data_health(root: Path) -> dict[str, object]:
    gp_meta = _load_metadata(root / "json" / "gp" / "GP.meta.json")
    launch_meta = _load_metadata(root / "json" / "launches" / "launches.meta.json")
    decay_meta = _load_metadata(root / "json" / "decayed" / "decayed.meta.json")
    satcat_meta = _load_metadata(root / "json" / "satcat.meta.json")
    tracked_meta_path = root / "json" / "tracked" / "TRACKED.meta.json"
    tracked_manifest_path = root / "json" / "tracked" / "TRACKED.manifest.json"
    tracked_meta = _load_metadata(tracked_meta_path)
    tracked_manifest_snapshot = _load_tracked_manifest_snapshot(root)
    tracked_manifest = (
        tracked_manifest_snapshot[0]
        if tracked_manifest_snapshot is not None
        else {}
    )
    gp_payload_matches, gp_payload_revision = (
        _metadata_payload_revision_matches(root / "json" / "gp" / "GP.json", gp_meta)
        if gp_meta
        else (False, None)
    )
    satcat_payload_matches, satcat_payload_revision = (
        _metadata_payload_revision_matches(root / "json" / "satcat.csv", satcat_meta)
        if satcat_meta
        else (False, None)
    )
    source_integrity_errors = []
    if gp_meta and not gp_payload_matches:
        source_integrity_errors.append("GP catalog bytes do not match the metadata revision.")
    if satcat_meta and not satcat_payload_matches:
        source_integrity_errors.append("SATCAT catalog bytes do not match the metadata revision.")
    tle_meta = _load_metadata(root / "json" / "tle" / "TLE.meta.json")
    dataset_metas = (gp_meta, tle_meta, satcat_meta, tracked_meta, launch_meta, decay_meta)
    primary_errors = _bounded_public_errors([meta.get("last_error") for meta in dataset_metas])
    primary_statuses = {
        str(meta.get("last_status") or "unknown").lower()
        for meta in dataset_metas
        if meta
    }
    if not gp_meta:
        catalog_state = (
            "fallback-tle"
            if _catalog_artifact_available(root / "json" / "tle" / "TLE.json")
            else "unavailable"
        )
    elif source_integrity_errors or primary_errors or primary_statuses.intersection({"failed", "failure", "partial", "degraded", "error"}):
        catalog_state = "degraded"
    elif str(gp_meta.get("source_status") or "").upper() == "PARTIAL" or gp_meta.get("partial_update") is True:
        catalog_state = "partial"
    else:
        catalog_state = "current"
    gp_revision = _metadata_revision(gp_meta)
    launch_revision = _metadata_revision(launch_meta)
    decay_revision = _metadata_revision(decay_meta)
    tle_revision = _metadata_revision(tle_meta)
    satcat_revision = _metadata_revision(satcat_meta)
    tracked_manifest_revision = _metadata_revision(tracked_manifest)
    tracked_metadata_revision = _metadata_revision(tracked_meta)
    tracked_manifest_valid = False
    tracked_manifest_error: str | None = None
    if tracked_manifest_snapshot is not None:
        tracked_manifest_valid, tracked_manifest_error = _validate_tracked_manifest_pointer(
            root,
            tracked_manifest_snapshot,
        )
    elif tracked_manifest_path.is_file():
        tracked_manifest_error = "Tracked manifest is unreadable or invalid."
    tracked_metadata_error = (
        _tracked_metadata_pointer_error(tracked_manifest, tracked_meta)
        if tracked_manifest_valid
        else None
    )
    tracked_metadata_valid = tracked_metadata_revision is not None and tracked_metadata_error is None
    tracked_artifacts_present = tracked_manifest_path.is_file() or tracked_meta_path.is_file()
    tracked_revision_mismatch = bool(tracked_manifest_valid and tracked_metadata_error)
    tracked_lineage_error = (
        source_integrity_errors[0]
        if source_integrity_errors
        else _tracked_manifest_lineage_error(
            tracked_manifest,
            tracked_meta=tracked_meta,
            gp_revision=gp_revision,
            satcat_revision=satcat_revision,
            gp_source_groups=gp_meta.get("catalog_source_groups"),
        )
        if tracked_manifest_valid
        else None
    )
    tracked_pointer_error = (
        tracked_manifest_error
        if tracked_manifest_error
        else "Tracked manifest is missing or invalid while tracked catalog state exists."
        if tracked_artifacts_present and not tracked_manifest_valid
        else "Tracked metadata is missing or invalid for the current manifest."
        if tracked_artifacts_present and tracked_metadata_revision is None
        else tracked_metadata_error
        if tracked_revision_mismatch
        else tracked_lineage_error
        if tracked_lineage_error
        else None
    )
    tracked_catalog_usable = bool(
        tracked_manifest_valid
        and tracked_metadata_valid
        and tracked_pointer_error is None
    )
    tracked_revision = tracked_manifest_revision if tracked_catalog_usable else None
    tracked_counts = tracked_manifest.get("counts") if tracked_catalog_usable else None
    tracked_counts = tracked_counts if isinstance(tracked_counts, dict) else {}
    if tracked_pointer_error and catalog_state != "unavailable":
        catalog_state = "degraded"
    last_reconciled_at = _newest_timestamp(
        [
            value
            for meta in (gp_meta, tle_meta, satcat_meta, tracked_meta, launch_meta, decay_meta)
            for value in (meta.get("last_reconciled_at"), meta.get("reconciled_at"))
        ]
    )
    return {
        "catalog_state": catalog_state,
        "catalog_source_status": gp_meta.get("source_status"),
        "data_revision": _composite_data_revision(
            gp=gp_revision,
            launch=launch_revision,
            decay=decay_revision,
            tle=tle_revision,
            satcat=satcat_revision,
            tracked=tracked_revision,
        ),
        "catalog_revision": gp_revision,
        "gp_revision": gp_revision,
        "gp_payload_revision": gp_payload_revision,
        "gp_revision_match": gp_payload_matches if gp_meta else None,
        "launch_revision": launch_revision,
        "decay_revision": decay_revision,
        "tle_revision": tle_revision,
        "satcat_revision": satcat_revision,
        "satcat_payload_revision": satcat_payload_revision,
        "satcat_revision_match": satcat_payload_matches if satcat_meta else None,
        "tracked_revision": tracked_revision,
        "tracked_metadata_revision": tracked_metadata_revision,
        "tracked_pointer_valid": tracked_manifest_valid if tracked_artifacts_present else None,
        "tracked_source_revision_match": (
            tracked_lineage_error is None if tracked_manifest_valid else False
        ) if tracked_artifacts_present else None,
        "tracked_revision_match": (
            tracked_manifest_revision == tracked_metadata_revision
            if tracked_manifest_valid and tracked_metadata_valid
            else False
            if tracked_artifacts_present
            else None
        ),
        "datasets": {
            "gp": {"revision": gp_revision, **_metadata_dataset_history(gp_meta)},
            "launch": {"revision": launch_revision, **_metadata_dataset_history(launch_meta)},
            "decay": {"revision": decay_revision, **_metadata_dataset_history(decay_meta)},
            "tle": {"revision": tle_revision, **_metadata_dataset_history(tle_meta)},
            "satcat": {"revision": satcat_revision, **_metadata_dataset_history(satcat_meta)},
            "tracked": {"revision": tracked_revision, **_metadata_dataset_history(tracked_meta)},
        },
        "retrieval_timestamp": gp_meta.get("retrieval_timestamp") or gp_meta.get("fetched_at") or satcat_meta.get("fetched_at"),
        "newest_orbital_epoch": gp_meta.get("newest_orbital_epoch"),
        "newest_launch_date": launch_meta.get("newest_launch_date") or gp_meta.get("newest_launch_date"),
        "newest_confirmed_decay_date": decay_meta.get("newest_confirmed_decay_date"),
        "last_reconciled_at": last_reconciled_at,
        "tle_count": _metadata_count(tle_meta, "total", "records"),
        "omm_count": _metadata_count(gp_meta, "omm", "total"),
        "six_digit_id_count": _metadata_count(gp_meta, "six_digit_ids"),
        "quarantined_count": _metadata_count(gp_meta, "quarantined"),
        "tracked_current_count": (
            _metadata_count({"counts": tracked_counts}, "current")
            if tracked_catalog_usable
            else None
        ),
        "tracked_metadata_only_count": (
            _metadata_count({"counts": tracked_counts}, "metadata_only")
            if tracked_catalog_usable
            else None
        ),
        "tracked_current_metadata_only_count": _metadata_count(
            {"counts": tracked_counts}, "current_metadata_only"
        ) if tracked_catalog_usable else None,
        "last_error": (
            tracked_pointer_error
            if tracked_pointer_error
            else source_integrity_errors[0]
            if source_integrity_errors
            else primary_errors[0]
            if primary_errors
            else None
        ),
    }


def _json_bytes(payload: object) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _private_cursor_secret(runtime_root: Path) -> bytes:
    """Load or create a private stable cursor-signing key for this runtime."""

    configured = os.environ.get("OPENBEXI_CURSOR_SECRET")
    if configured:
        raw = configured.encode("utf-8")
        if len(raw) < 24:
            raise RuntimeError("OPENBEXI_CURSOR_SECRET must contain at least 24 bytes")
        return raw
    runtime_root.mkdir(parents=True, exist_ok=True)
    path = runtime_root / "cursor-signing.key"
    if path.exists():
        raw = path.read_bytes().strip()
        if len(raw) < 24:
            raise RuntimeError("private cursor signing key is invalid")
        return raw
    raw = secrets.token_urlsafe(48).encode("ascii")
    temporary = path.with_suffix(".tmp")
    temporary.write_bytes(raw + b"\n")
    try:
        os.chmod(temporary, 0o600)
    except OSError:
        pass
    os.replace(temporary, path)
    return raw


def _safe_json_file(path: Path) -> bytes:
    resolved = path.resolve()
    if not resolved.is_file() or ROOT not in resolved.parents:
        raise FileNotFoundError(path)
    return resolved.read_bytes()


def _preferred_catalog_path(root: Path = ROOT) -> Path:
    gp_path = root / "json" / "gp" / "GP.json"
    if _catalog_artifact_available(gp_path):
        return gp_path
    return root / "json" / "tle" / "TLE.json"


def _tracked_manifest_path(root: Path | None = None) -> Path:
    return (root or ROOT) / "json" / "tracked" / "TRACKED.manifest.json"


def _path_stat_identity(path: Path) -> tuple[int, int, int, int]:
    stat = path.stat()
    return (stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns, stat.st_ino)


def _file_sha256_revision(path: Path) -> str | None:
    try:
        resolved = path.resolve(strict=True)
        before = _path_stat_identity(resolved)
    except OSError:
        return None
    cache_key = (str(resolved), *before)
    with CATALOG_REVISION_CACHE_LOCK:
        cached = CATALOG_REVISION_CACHE.get(cache_key)
    if cached is not None:
        return cached
    digest = hashlib.sha256()
    try:
        with resolved.open("rb") as stream:
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
        if _path_stat_identity(resolved) != before:
            return None
    except OSError:
        return None
    revision = f"sha256:{digest.hexdigest()}"
    with CATALOG_REVISION_CACHE_LOCK:
        stale_keys = [key for key in CATALOG_REVISION_CACHE if key[0] == str(resolved)]
        for key in stale_keys:
            CATALOG_REVISION_CACHE.pop(key, None)
        if len(CATALOG_REVISION_CACHE) >= CATALOG_REVISION_CACHE_MAX_ITEMS:
            CATALOG_REVISION_CACHE.pop(next(iter(CATALOG_REVISION_CACHE)))
        CATALOG_REVISION_CACHE[cache_key] = revision
    return revision


def _load_json_object_snapshot(
    path: Path,
    *,
    canonical_nonnegative_integers: bool = False,
) -> tuple[dict[str, object], bytes, tuple[int, int, int, int]] | None:
    try:
        before = _path_stat_identity(path)
        body = path.read_bytes()
        after = _path_stat_identity(path)
        if before != after:
            return None
        payload = _strict_json_loads(
            body,
            canonical_nonnegative_integers=canonical_nonnegative_integers,
        )
    except (OSError, UnicodeDecodeError, ValueError, TypeError):
        return None
    if not isinstance(payload, dict):
        return None
    return payload, body, after


def _metadata_payload_revision_matches(path: Path, metadata: dict[str, object]) -> tuple[bool, str | None]:
    actual = _file_sha256_revision(path)
    catalog_revision = metadata.get("catalog_revision")
    dataset_hash = metadata.get("dataset_hash")
    matches = bool(
        actual
        and isinstance(catalog_revision, str)
        and isinstance(dataset_hash, str)
        and actual == catalog_revision == dataset_hash
    )
    return matches, actual


def _load_tracked_manifest_snapshot(
    root: Path | None = None,
) -> tuple[dict[str, object], tuple[object, ...], bytes] | None:
    root = root or ROOT
    path = _tracked_manifest_path(root)
    try:
        before = _path_stat_identity(path)
        body = path.read_bytes()
        after = _path_stat_identity(path)
        if before != after:
            return None
        payload = _strict_json_loads(
            body,
            canonical_nonnegative_integers=True,
        )
    except (OSError, ValueError, TypeError):
        return None
    if not isinstance(payload, dict):
        return None
    identity = (
        str(path.resolve()),
        _metadata_revision(payload),
        *after,
        hashlib.sha256(body).hexdigest(),
    )
    return payload, identity, body


def _tracked_manifest_descriptors(manifest: dict[str, object]) -> list[dict[str, object]]:
    descriptors: list[dict[str, object]] = []
    for name in ("chunks", "history_chunks"):
        value = manifest.get(name)
        if isinstance(value, list):
            descriptors.extend(item for item in value if isinstance(item, dict))
    quarantine = manifest.get("quarantine")
    if isinstance(quarantine, dict) and quarantine.get("path"):
        descriptors.append(quarantine)
    return descriptors


def _recomputed_tracked_coverage_revision(manifest: dict[str, object]) -> str | None:
    counts = manifest.get("counts")
    coverage = manifest.get("coverage")
    quarantine = manifest.get("quarantine")
    if not isinstance(counts, dict) or not isinstance(coverage, dict) or not isinstance(quarantine, dict):
        return None
    row_accounting: dict[str, int] = {}
    for key in ("received", "accepted", "quarantined", "duplicates", "issues"):
        value = counts.get(key)
        if not _is_nonnegative_safe_json_integer(value):
            return None
        row_accounting[key] = value
    quarantine_count = quarantine.get("count")
    if (
        not _is_nonnegative_safe_json_integer(quarantine_count)
        or row_accounting["issues"]
        != row_accounting["quarantined"] + row_accounting["duplicates"]
        or row_accounting["issues"] != quarantine_count
    ):
        return None
    if "expected" not in counts or "expected_provider_records" not in counts:
        return None
    expected = counts.get("expected")
    if expected is not None and not _is_nonnegative_safe_json_integer(expected):
        return None
    expected_provider_records = counts.get("expected_provider_records")
    if expected_provider_records is not None:
        return None
    if (
        "expected" not in coverage
        or "expected_provider_records" not in coverage
        or any(
            not _is_nonnegative_safe_json_integer(coverage.get(key))
            or coverage.get(key) != row_accounting[key]
            for key in ("received", "accepted", "quarantined", "duplicates")
        )
        or (
            expected is not None
            and not _is_nonnegative_safe_json_integer(coverage.get("expected"))
        )
        or coverage.get("expected") != expected
        or coverage.get("expected_provider_records") != expected_provider_records
        or coverage.get("provider_completeness_claim") is not False
        or not isinstance(coverage.get("complete_source_snapshot"), bool)
        or coverage.get("invariant")
        != "received == accepted + quarantined + duplicates"
    ):
        return None
    provider_invariant = (
        row_accounting["received"]
        == row_accounting["accepted"]
        + row_accounting["quarantined"]
        + row_accounting["duplicates"]
    )
    expected_matches_received = (
        expected == row_accounting["received"] if expected is not None else None
    )
    invariants = manifest.get("invariants")
    if (
        coverage.get("invariant_holds") is not provider_invariant
        or coverage.get("expected_matches_received") != expected_matches_received
        or (
            coverage.get("complete_source_snapshot") is True
            and expected_matches_received is not True
        )
        or not isinstance(invariants, dict)
        or invariants.get("provider_coverage_holds") is not provider_invariant
    ):
        return None
    quarantine_sha256 = quarantine.get("sha256")
    if not isinstance(quarantine_sha256, str) or not TRACKED_REVISION_PATTERN.fullmatch(quarantine_sha256):
        return None
    try:
        material = json.dumps(
            {
                "row_accounting": row_accounting,
                "expected": expected,
                "quarantine_sha256": quarantine_sha256,
            },
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")
    except (TypeError, ValueError):
        return None
    return "sha256:" + hashlib.sha256(material).hexdigest()


def _recomputed_tracked_catalog_revision(manifest: dict[str, object]) -> str | None:
    chunks = manifest.get("chunks")
    history_chunks = manifest.get("history_chunks")
    coverage_revision = manifest.get("coverage_revision")
    computed_coverage_revision = _recomputed_tracked_coverage_revision(manifest)
    if (
        not isinstance(chunks, list)
        or not isinstance(history_chunks, list)
        or not TRACKED_REVISION_PATTERN.fullmatch(str(coverage_revision or ""))
        or coverage_revision != computed_coverage_revision
        or not all(isinstance(item, dict) for item in [*chunks, *history_chunks])
    ):
        return None
    descriptor_material = []
    for descriptor in [*chunks, *history_chunks]:
        raw_path = descriptor.get("path")
        digest = descriptor.get("sha256")
        if (
            not isinstance(raw_path, str)
            or not raw_path
            or not isinstance(digest, str)
            or not TRACKED_REVISION_PATTERN.fullmatch(digest)
        ):
            return None
        descriptor_material.append({"path": raw_path, "sha256": digest})
    try:
        material = json.dumps(
            {
                "chunks": descriptor_material,
                "coverage_revision": coverage_revision,
            },
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")
    except (TypeError, ValueError):
        return None
    return "sha256:" + hashlib.sha256(material).hexdigest()


def _validate_tracked_chunk_payload(
    body: bytes,
    descriptor: dict[str, object],
) -> dict[str, object] | None:
    expected_revision = descriptor.get("sha256")
    expected_hash = (
        expected_revision.removeprefix("sha256:")
        if isinstance(expected_revision, str)
        else ""
    )
    expected_bytes = descriptor.get("bytes")
    expected_count = descriptor.get("count")
    if (
        not TRACKED_REVISION_PATTERN.fullmatch(str(expected_revision or ""))
        or not _is_nonnegative_safe_json_integer(expected_bytes)
        or len(body) != expected_bytes
        or hashlib.sha256(body).hexdigest() != expected_hash
        or not _is_nonnegative_safe_json_integer(expected_count)
    ):
        return None
    try:
        payload = _strict_json_loads(body)
    except (UnicodeDecodeError, ValueError, TypeError):
        return None
    records = payload.get("records") if isinstance(payload, dict) else None
    if (
        not isinstance(payload, dict)
        or not re.match(r"^2\.3(?:\.|$)", str(payload.get("schema_version") or ""))
        or not isinstance(records, list)
        or len(records) != expected_count
    ):
        return None
    descriptor_scope = descriptor.get("scope")
    descriptor_type = descriptor.get("object_type")
    if descriptor_scope is None:
        return {"norad_ids": frozenset(), "counts": {}, "object_types": {}}
    if (
        not isinstance(payload, dict)
        or descriptor_scope not in {"CURRENT", "HISTORICAL"}
        or payload.get("scope") != descriptor_scope
        or payload.get("object_type") != descriptor_type
    ):
        return None
    norad_ids: set[str] = set()
    counts = {
        "current": 0,
        "historical": 0,
        "absent": 0,
        "history_total": 0,
        "total": 0,
        "propagatable": 0,
        "metadata_only": 0,
        "current_propagatable": 0,
        "current_metadata_only": 0,
    }
    for record in records:
        if (
            not _tracked_record_contract_is_valid(record)
            or record.get("object_type") != descriptor_type
        ):
            return None
        norad_id = record["norad_id"]
        if norad_id in norad_ids:
            return None
        norad_ids.add(norad_id)
        is_current = not _tracked_record_is_historical(record)
        if (descriptor_scope == "CURRENT") != is_current:
            return None
        counts["total"] += 1
        counts["historical"] += int(record.get("decay_date") is not None)
        counts["absent"] += int(record.get("catalog_membership_status") == "ABSENT")
        counts["propagatable"] += int(record["has_current_elements"])
        counts["metadata_only"] += int(record["metadata_only"])
        if is_current:
            counts["current"] += 1
            counts["current_propagatable"] += int(record["has_current_elements"])
            counts["current_metadata_only"] += int(record["metadata_only"])
        else:
            counts["history_total"] += 1
    return {
        "norad_ids": frozenset(norad_ids),
        "counts": counts,
        "object_types": {
            "all": {descriptor_type: len(records)},
            "current": {descriptor_type: len(records) if descriptor_scope == "CURRENT" else 0},
        },
    }


def _verified_tracked_chunk(
    file_name: str,
    root: Path | None = None,
    *,
    include_body: bool = False,
    manifest_snapshot: tuple[dict[str, object], tuple[object, ...], bytes] | None = None,
) -> dict[str, object] | None:
    root = root or ROOT
    safe_name = Path(file_name).name
    name_match = TRACKED_CHUNK_BASENAME_PATTERN.fullmatch(safe_name)
    if safe_name != file_name or name_match is None:
        return None
    snapshot = manifest_snapshot or _load_tracked_manifest_snapshot(root)
    if snapshot is None:
        return None
    manifest, manifest_identity, _ = snapshot
    relative = f"json/tracked/chunks/{safe_name}"
    matches = [
        descriptor
        for descriptor in _tracked_manifest_descriptors(manifest)
        if descriptor.get("path") == relative
    ]
    if len(matches) != 1:
        return None
    descriptor = matches[0]
    if descriptor.get("sha256") != f"sha256:{name_match.group(1)}":
        return None
    resolved_root = root.resolve()
    candidate = (root / relative).resolve()
    chunk_root = (root / "json" / "tracked" / "chunks").resolve()
    if (
        chunk_root == resolved_root
        or resolved_root not in chunk_root.parents
        or candidate.parent != chunk_root
        or resolved_root not in candidate.parents
    ):
        return None
    try:
        file_identity = _path_stat_identity(candidate)
    except OSError:
        return None
    cache_key = (
        manifest_identity,
        str(candidate),
        file_identity,
        descriptor.get("sha256"),
        descriptor.get("bytes"),
        descriptor.get("count"),
        descriptor.get("scope"),
        descriptor.get("object_type"),
    )
    body: bytes | None = None
    with TRACKED_CHUNK_VALIDATION_LOCK:
        if cache_key in TRACKED_CHUNK_VALIDATION_CACHE:
            validation = TRACKED_CHUNK_VALIDATION_CACHE[cache_key]
        else:
            try:
                body = candidate.read_bytes()
                stable = _path_stat_identity(candidate) == file_identity
            except OSError:
                stable = False
                body = None
            validation = (
                _validate_tracked_chunk_payload(body, descriptor)
                if stable and body is not None
                else None
            )
            if len(TRACKED_CHUNK_VALIDATION_CACHE) >= TRACKED_CHUNK_VALIDATION_CACHE_MAX_ITEMS:
                TRACKED_CHUNK_VALIDATION_CACHE.pop(next(iter(TRACKED_CHUNK_VALIDATION_CACHE)))
            TRACKED_CHUNK_VALIDATION_CACHE[cache_key] = validation
    if validation is None:
        return None
    if include_body and body is None:
        try:
            body = candidate.read_bytes()
            if (
                _path_stat_identity(candidate) != file_identity
                or len(body) != descriptor.get("bytes")
            ):
                return None
        except OSError:
            return None
    return {
        "path": candidate,
        "body": body if include_body else None,
        "bytes": descriptor.get("bytes"),
        "sha256": descriptor.get("sha256"),
        "count": descriptor.get("count"),
        "validation": validation,
    }


def _tracked_chunk_api_path(file_name: str, root: Path | None = None) -> Path | None:
    verified = _verified_tracked_chunk(file_name, root)
    path = verified.get("path") if verified is not None else None
    return path if isinstance(path, Path) else None


def _validate_tracked_manifest_pointer(
    root: Path,
    snapshot: tuple[dict[str, object], tuple[object, ...], bytes],
) -> tuple[bool, str | None]:
    manifest, _, _ = snapshot
    if not _tracked_manifest_pointer_is_valid(manifest):
        return False, "Tracked manifest schema is invalid."
    if not re.match(r"^2\.3(?:\.|$)", str(manifest.get("schema_version") or "")):
        return False, "Tracked manifest must use the Version 2.3 schema."
    if manifest.get("provider_completeness_claim") is not False:
        return False, "Tracked manifest must not claim provider-universe completeness."
    invariants = manifest.get("invariants")
    required_invariants = (
        "provider_coverage_holds",
        "catalog_partition_holds",
        "current_chunk_count_holds",
        "history_chunk_count_holds",
    )
    if not isinstance(invariants, dict) or any(invariants.get(name) is not True for name in required_invariants):
        return False, "Tracked manifest accounting invariants are not satisfied."
    chunks = manifest.get("chunks")
    history_chunks = manifest.get("history_chunks")
    if not all(isinstance(item, dict) for item in chunks + history_chunks):
        return False, "Tracked manifest contains an invalid chunk descriptor."
    descriptor_ids = [item.get("id") for item in [*chunks, *history_chunks]]
    if (
        any(not isinstance(value, str) or not value.strip() for value in descriptor_ids)
        or len(descriptor_ids) != len(set(descriptor_ids))
    ):
        return False, "Tracked manifest chunk descriptor ids must be nonempty and unique."
    for collection, expected_scope in (
        (chunks, "CURRENT"),
        (history_chunks, "HISTORICAL"),
    ):
        if any(
            item.get("scope") != expected_scope
            or item.get("object_type") not in TRACKED_OBJECT_TYPES
            for item in collection
        ):
            return False, "Tracked manifest chunk descriptor taxonomy is invalid."
    descriptors = _tracked_manifest_descriptors(manifest)
    paths = [descriptor.get("path") for descriptor in descriptors]
    quarantine = manifest.get("quarantine")
    if (
        not isinstance(quarantine, dict)
        or not isinstance(quarantine.get("path"), str)
        or not quarantine["path"].endswith("-quarantine.json")
        or any(not isinstance(path, str) or not path for path in paths)
        or len(paths) != len(set(paths))
    ):
        return False, "Tracked manifest chunk paths are invalid or duplicated."
    observed_counts = {
        "current": 0,
        "historical": 0,
        "absent": 0,
        "history_total": 0,
        "total": 0,
        "propagatable": 0,
        "metadata_only": 0,
        "current_propagatable": 0,
        "current_metadata_only": 0,
    }
    observed_object_types = {object_type: 0 for object_type in TRACKED_OBJECT_TYPES}
    observed_current_object_types = {object_type: 0 for object_type in TRACKED_OBJECT_TYPES}
    catalog_ids: set[str] = set()
    for descriptor in descriptors:
        path = str(descriptor["path"])
        prefix = "json/tracked/chunks/"
        file_name = path[len(prefix):] if path.startswith(prefix) else ""
        name_match = TRACKED_CHUNK_BASENAME_PATTERN.fullmatch(file_name)
        if (
            name_match is None
            or descriptor.get("sha256") != f"sha256:{name_match.group(1)}"
        ):
            return False, "Tracked manifest contains an invalid content-addressed chunk path."
        verified = _verified_tracked_chunk(
            file_name,
            root,
            manifest_snapshot=snapshot,
        )
        if verified is None:
            return False, f"Tracked manifest chunk validation failed: {Path(path).name}."
        validation = verified.get("validation")
        if not isinstance(validation, dict):
            return False, f"Tracked manifest chunk validation failed: {Path(path).name}."
        norad_ids = validation.get("norad_ids")
        if not isinstance(norad_ids, frozenset) or catalog_ids.intersection(norad_ids):
            return False, "Tracked manifest contains duplicate NORAD identities."
        catalog_ids.update(norad_ids)
        chunk_counts = validation.get("counts")
        if isinstance(chunk_counts, dict):
            for key in observed_counts:
                observed_counts[key] += int(chunk_counts.get(key, 0))
        object_type_counts = validation.get("object_types")
        if isinstance(object_type_counts, dict):
            for key, target in (
                ("all", observed_object_types),
                ("current", observed_current_object_types),
            ):
                values = object_type_counts.get(key)
                if isinstance(values, dict):
                    for object_type, value in values.items():
                        if object_type in target:
                            target[object_type] += int(value)
    recomputed_coverage_revision = _recomputed_tracked_coverage_revision(manifest)
    if manifest.get("coverage_revision") != recomputed_coverage_revision:
        return False, "Tracked manifest coverage_revision does not match its evidence."
    recomputed_revision = _recomputed_tracked_catalog_revision(manifest)
    if manifest.get("catalog_revision") != recomputed_revision:
        return False, "Tracked manifest catalog_revision does not match its descriptor closure."
    authoritative_counts = _tracked_authoritative_counts(manifest)
    if authoritative_counts is None or _tracked_availability_counts(manifest) is None:
        return False, "Tracked manifest authoritative counts are invalid."
    counts = manifest.get("counts")
    object_type_maps_are_valid = all(
        isinstance(counts.get(key), dict)
        and set(counts[key]) == set(TRACKED_OBJECT_TYPES)
        and all(_is_nonnegative_safe_json_integer(value) for value in counts[key].values())
        and _json_values_match_exact(counts[key], observed)
        for key, observed in (
            ("object_types", observed_object_types),
            ("current_object_types", observed_current_object_types),
        )
    ) if isinstance(counts, dict) else False
    if (
        not isinstance(counts, dict)
        or any(counts.get(key) != value for key, value in observed_counts.items())
        or not object_type_maps_are_valid
    ):
        return False, "Tracked manifest record-derived counts are inconsistent."
    current_expected, _, _, history_expected, _ = authoritative_counts
    for expected, described, label in (
        (current_expected, chunks, "current"),
        (history_expected, history_chunks, "history"),
    ):
        described_counts = [item.get("count") for item in described]
        if (
            not _is_nonnegative_safe_json_integer(expected)
            or any(
                not _is_nonnegative_safe_json_integer(count)
                for count in described_counts
            )
            or sum(described_counts) != expected
        ):
            return False, f"Tracked manifest {label} count does not match its chunks."
    return True, None


def _tracked_manifest_lineage_error(
    manifest: dict[str, object],
    *,
    tracked_meta: dict[str, object],
    gp_revision: str | None,
    satcat_revision: str | None,
    gp_source_groups: object,
) -> str | None:
    provenance = manifest.get("provenance")
    provenance = provenance if isinstance(provenance, dict) else {}
    for label, current_revision in (("GP", gp_revision), ("SATCAT", satcat_revision)):
        manifest_revision = provenance.get(f"{label.lower()}_revision")
        if not isinstance(current_revision, str) or not current_revision:
            return f"Current {label} metadata revision is unavailable for tracked lineage verification."
        if manifest_revision != current_revision:
            return f"Tracked manifest {label} provenance is stale or missing."
        metadata_revision = tracked_meta.get(f"source_{label.lower()}_revision")
        if metadata_revision != current_revision:
            return f"Tracked metadata {label} lineage is stale or missing."
    manifest_groups = provenance.get("gp_source_groups")
    metadata_groups = tracked_meta.get("source_gp_groups")
    if (
        not isinstance(manifest_groups, list)
        or not all(isinstance(item, str) and item for item in manifest_groups)
        or not isinstance(metadata_groups, list)
        or not all(isinstance(item, str) and item for item in metadata_groups)
        or not isinstance(gp_source_groups, list)
        or not all(isinstance(item, str) and item for item in gp_source_groups)
        or manifest_groups != metadata_groups
        or manifest_groups != gp_source_groups
    ):
        return "Tracked GP source-group lineage is stale or missing."
    return None


def _load_coherent_tracked_catalog_snapshot(root: Path) -> dict[str, object] | None:
    manifest_snapshot = _load_tracked_manifest_snapshot(root)
    if manifest_snapshot is None:
        return None
    manifest, manifest_identity, manifest_body = manifest_snapshot
    tracked_meta_path = root / "json" / "tracked" / "TRACKED.meta.json"
    gp_path = root / "json" / "gp" / "GP.json"
    gp_meta_path = root / "json" / "gp" / "GP.meta.json"
    tracked_meta_snapshot = _load_json_object_snapshot(
        tracked_meta_path,
        canonical_nonnegative_integers=True,
    )
    gp_meta_snapshot = _load_json_object_snapshot(gp_meta_path)
    if tracked_meta_snapshot is None or gp_meta_snapshot is None:
        return None
    tracked_meta, tracked_meta_body, tracked_meta_identity = tracked_meta_snapshot
    gp_meta, _, gp_meta_identity = gp_meta_snapshot
    try:
        gp_file_identity = _path_stat_identity(gp_path)
    except OSError:
        return None
    gp_matches, gp_actual_revision = _metadata_payload_revision_matches(gp_path, gp_meta)
    if not gp_matches:
        return None

    provenance = manifest.get("provenance")
    provenance = provenance if isinstance(provenance, dict) else {}
    manifest_satcat_revision = provenance.get("satcat_revision")
    metadata_satcat_revision = tracked_meta.get("source_satcat_revision")
    if (
        not isinstance(manifest_satcat_revision, str)
        or not manifest_satcat_revision
        or not isinstance(metadata_satcat_revision, str)
        or metadata_satcat_revision != manifest_satcat_revision
    ):
        return None
    satcat_meta: dict[str, object] = {}
    satcat_meta_path = root / "json" / "satcat.meta.json"
    satcat_path = root / "json" / "satcat.csv"
    satcat_meta_identity: tuple[int, int, int, int] | None = None
    satcat_file_identity: tuple[int, int, int, int] | None = None
    satcat_meta_snapshot = _load_json_object_snapshot(satcat_meta_path)
    if satcat_meta_snapshot is None:
        return None
    satcat_meta, _, satcat_meta_identity = satcat_meta_snapshot
    try:
        satcat_file_identity = _path_stat_identity(satcat_path)
    except OSError:
        return None
    satcat_matches, _ = _metadata_payload_revision_matches(satcat_path, satcat_meta)
    if not satcat_matches:
        return None

    pointer_valid, _ = _validate_tracked_manifest_pointer(root, manifest_snapshot)
    if (
        not pointer_valid
        or _tracked_metadata_pointer_error(manifest, tracked_meta) is not None
        or _tracked_manifest_lineage_error(
            manifest,
            tracked_meta=tracked_meta,
            gp_revision=gp_actual_revision,
            satcat_revision=_metadata_revision(satcat_meta),
            gp_source_groups=gp_meta.get("catalog_source_groups"),
        ) is not None
    ):
        return None

    stable_paths = (
        (_tracked_manifest_path(root), tuple(manifest_identity[2:6])),
        (tracked_meta_path, tracked_meta_identity),
        (gp_meta_path, gp_meta_identity),
        (gp_path, gp_file_identity),
    )
    try:
        if any(_path_stat_identity(path) != identity for path, identity in stable_paths):
            return None
        if satcat_meta_identity is not None and (
            _path_stat_identity(satcat_meta_path) != satcat_meta_identity
            or _path_stat_identity(satcat_path) != satcat_file_identity
        ):
            return None
    except OSError:
        return None
    return {
        "root": root,
        "manifest": manifest,
        "manifest_snapshot": manifest_snapshot,
        "manifest_body": manifest_body,
        "metadata_body": tracked_meta_body,
    }


def _decode_request_path(raw_path: str) -> str | None:
    decoded = urlparse(raw_path).path
    for _ in range(3):
        next_value = unquote(decoded)
        if next_value == decoded:
            break
        decoded = next_value
    if "\x00" in decoded or "\\" in decoded:
        return None
    return decoded


def _normalized_request_path(raw_path: str) -> str | None:
    decoded = _decode_request_path(raw_path)
    if decoded is None:
        return None
    return "/" + "/".join(part for part in decoded.split("/") if part)


def resolve_static_request_path(raw_path: str) -> tuple[Path, tuple[str, ...]] | None:
    """Resolve a URL path without permitting traversal or symlink escape."""
    decoded = _decode_request_path(raw_path)
    if decoded is None:
        return None
    segments = tuple(part for part in PurePosixPath(decoded).parts if part not in {"", "/"})
    if any(part in {".", ".."} for part in decoded.split("/")):
        return None
    candidate = ROOT.joinpath(*segments).resolve()
    if candidate != ROOT and ROOT not in candidate.parents:
        return None
    return candidate, segments


def _static_path_parts_are_allowed(parts: tuple[str, ...]) -> bool:
    if not parts:
        return True
    lowered = tuple(part.lower() for part in parts)
    if any(part.startswith(".") or part in STATIC_BLOCKED_PARTS for part in lowered):
        return False
    if any(".bak-" in part or part.endswith("~") for part in lowered):
        return False
    if Path(lowered[-1]).suffix in STATIC_BLOCKED_SUFFIXES:
        return False

    if len(parts) == 1:
        return lowered[0] in STATIC_ROOT_FILE_ALLOWLIST
    if lowered in STATIC_JSON_FILE_ALLOWLIST:
        return True
    if lowered in STATIC_VENDOR_FILE_ALLOWLIST:
        return True
    if len(lowered) == 3 and lowered[:2] == ("json", "satellites"):
        return Path(lowered[-1]).suffix == ".json"
    if len(lowered) == 3 and lowered[:2] == ("json", "tracked"):
        return lowered[-1] in {"tracked.manifest.json", "tracked.meta.json"}

    suffix = Path(lowered[-1]).suffix
    return any(
        lowered[: len(prefix)] == prefix and suffix in allowed_suffixes
        for prefix, allowed_suffixes in STATIC_PREFIX_SUFFIX_ALLOWLIST
    )


def static_request_is_exposed(raw_path: str) -> bool:
    resolved = resolve_static_request_path(raw_path)
    if resolved is None:
        return False
    candidate, request_parts = resolved
    lowered_request_parts = tuple(part.lower() for part in request_parts)
    if len(lowered_request_parts) == 4 and lowered_request_parts[:3] == (
        "json",
        "tracked",
        "chunks",
    ):
        verified_chunk = _tracked_chunk_api_path(request_parts[-1])
        return verified_chunk is not None and candidate == verified_chunk
    resolved_parts = () if candidate == ROOT else candidate.relative_to(ROOT).parts
    return _static_path_parts_are_allowed(request_parts) and _static_path_parts_are_allowed(resolved_parts)


def _tracked_static_chunk_name(raw_path: str) -> str | None:
    normalized = _normalized_request_path(raw_path)
    if normalized is None:
        return None
    match = re.fullmatch(r"/json/tracked/chunks/([^/]+)", normalized, flags=re.IGNORECASE)
    return match.group(1) if match else None


def is_loopback_host(host: str) -> bool:
    normalized = str(host or "").strip().lower().strip("[]")
    if normalized == "localhost":
        return True
    try:
        return ipaddress.ip_address(normalized).is_loopback
    except ValueError:
        return False


def cors_origin_is_allowed(origin: str, configured_origins: tuple[str, ...] = ()) -> bool:
    if not origin:
        return False
    normalized = origin.rstrip("/")
    if "*" in configured_origins or normalized in configured_origins:
        return True
    try:
        parsed = urlparse(normalized)
        host = parsed.hostname or ""
        _ = parsed.port
    except ValueError:
        return False
    return (
        parsed.scheme in {"http", "https"}
        and parsed.username is None
        and parsed.password is None
        and not parsed.path
        and not parsed.params
        and not parsed.query
        and not parsed.fragment
        and is_loopback_host(host)
    )


def safe_request_host(host_header: str | None, server_port: int) -> str:
    fallback = f"127.0.0.1:{server_port}"
    candidate = str(host_header or "").strip()
    if not candidate or len(candidate) > 255 or not SAFE_HOST_HEADER.fullmatch(candidate):
        return fallback
    return candidate


def cache_control_for_path(raw_path: str, status: int = HTTPStatus.OK) -> str:
    if int(status) >= 400:
        return "no-store"
    decoded = (_decode_request_path(raw_path) or "").lower()
    if decoded.startswith("/api/") or decoded in {"/docs", "/openapi.json"}:
        return "no-store"
    if decoded.startswith("/node_modules/"):
        return "public, max-age=604800, immutable"
    suffix = Path(decoded).suffix
    if suffix in {".glb", ".gltf", ".jpg", ".jpeg", ".png", ".webp", ".avif", ".ktx2"}:
        return "public, max-age=86400"
    return "no-cache"


def _metadata_files() -> list[dict[str, object]]:
    metadata_dir = ROOT / "json" / "satellites"
    files = []
    for path in sorted(metadata_dir.glob("*.json")):
        files.append(
            {
                "name": path.name,
                "path": f"json/satellites/{path.name}",
                "url": f"/api/satellite-metadata/{quote(path.name)}",
                "bytes": path.stat().st_size,
            }
        )
    return files


KNOWN_DISPLAY_MODEL_METADATA: dict[str, dict[str, object]] = {
    "starlink_V1.obj": {
        "id": "starlink_V1",
        "displayName": "Starlink V1",
        "description": "OBJ/MTL Starlink satellite model.",
        "tags": ["Starlink", "OBJ", "MTL", "LEO"],
        "textures": [
            {"path": "Textures/starlink_BaseColor.png", "required": False},
            {"path": "Textures/starlink_Checker_Roughness.png", "required": False},
            {"path": "Textures/starlink_Metallic.png", "required": False},
            {"path": "Textures/starlink_Normal.png", "required": False},
        ],
    },
    "o3b_mpower_hd.obj": {
        "id": "o3b_mpower_hd",
        "displayName": "O3b mPOWER HD",
        "description": "OBJ/MTL O3b mPOWER satellite model.",
        "tags": ["O3b", "mPOWER", "OBJ", "MTL", "MEO"],
    },
    "generic.obj": {
        "id": "generic",
        "displayName": "Generic Satellite",
        "description": "Generic OBJ/MTL satellite model.",
        "tags": ["Generic", "OBJ", "MTL"],
    },
    "ISS.glb": {
        "id": "ISS.glb",
        "displayName": "International Space Station",
        "description": "GLB International Space Station model.",
        "tags": ["ISS", "GLB", "Station", "LEO"],
    },
    "International Space Station (ISS) (A).glb": {
        "displayName": "International Space Station (A)",
        "description": "GLB International Space Station reference model.",
        "tags": ["ISS", "GLB", "Station", "LEO"],
    },
    "SSL_1300.glb": {
        "id": "SSL_1300.glb",
        "displayName": "SSL 1300",
        "description": "GLB SSL 1300 satellite bus model.",
        "tags": ["SSL", "GLB", "GEO"],
    },
    "starlink_v2.glb": {
        "displayName": "Starlink V2",
        "description": "GLB Starlink V2 satellite model.",
        "tags": ["Starlink", "GLB", "LEO"],
    },
    "oneweb.glb": {
        "displayName": "OneWeb GLB",
        "description": "GLB OneWeb satellite model.",
        "tags": ["OneWeb", "GLB", "LEO"],
    },
    "o3b.glb": {
        "displayName": "O3b GLB",
        "description": "GLB O3b satellite model.",
        "tags": ["O3b", "GLB", "MEO"],
    },
    "Hubble Space Telescope (A).glb": {
        "displayName": "Hubble Space Telescope (A)",
        "description": "GLB Hubble Space Telescope reference model.",
        "tags": ["Hubble", "GLB", "Telescope", "LEO"],
    },
    "Hubble Space Telescope (B).glb": {
        "displayName": "Hubble Space Telescope (B)",
        "description": "GLB Hubble Space Telescope reference model.",
        "tags": ["Hubble", "GLB", "Telescope", "LEO"],
    },
}


DISPLAY_MODEL_PRIORITY = {
    "starlink_V1": 0,
    "starlink_v2.glb": 1,
    "oneweb.glb": 2,
    "o3b.glb": 3,
    "o3b_mpower_hd": 4,
    "ISS.glb": 5,
    "International Space Station (ISS) (A).glb": 6,
    "SSL_1300.glb": 7,
}


def _display_model_name(relative_path: str) -> str:
    stem = Path(relative_path).stem.replace("_", " ").replace("-", " ").strip()
    if relative_path.startswith("ISS_High_definition/"):
        parent = Path(relative_path).parent.name.replace("_", " ").replace("-", " ")
        return f"ISS High Definition / {parent} / {stem}".strip()
    return stem or relative_path


def _display_model_metadata(relative_path: str) -> dict[str, object]:
    return dict(KNOWN_DISPLAY_MODEL_METADATA.get(relative_path, {}))


def _display_satellite_model_manifest() -> dict[str, object]:
    obj_dir = ROOT / "obj"
    models: list[dict[str, object]] = []

    for obj_path in sorted(obj_dir.rglob("*.obj"), key=lambda item: item.as_posix().lower()):
        mtl_path = obj_path.with_suffix(".mtl")
        if not mtl_path.is_file():
            continue
        obj_relative = obj_path.relative_to(obj_dir).as_posix()
        mtl_relative = mtl_path.relative_to(obj_dir).as_posix()
        metadata = _display_model_metadata(obj_relative)
        model_id = str(metadata.pop("id", obj_relative[:-4]))
        models.append(
            {
                "id": model_id,
                "displayName": metadata.pop("displayName", _display_model_name(obj_relative)),
                "type": "obj-mtl",
                "description": metadata.pop("description", "OBJ/MTL satellite model."),
                "tags": metadata.pop("tags", ["OBJ", "MTL"]),
                "files": {"obj": obj_relative, "mtl": mtl_relative},
                "textures": metadata.pop("textures", []),
                **metadata,
            }
        )

    for glb_path in sorted(obj_dir.rglob("*.glb"), key=lambda item: item.as_posix().lower()):
        glb_relative = glb_path.relative_to(obj_dir).as_posix()
        metadata = _display_model_metadata(glb_relative)
        model_id = str(metadata.pop("id", glb_relative))
        tags = metadata.pop("tags", ["ISS", "GLB", "Module"] if glb_relative.startswith("ISS_High_definition/") else ["GLB"])
        models.append(
            {
                "id": model_id,
                "displayName": metadata.pop("displayName", _display_model_name(glb_relative)),
                "type": "glb",
                "description": metadata.pop("description", "GLB satellite model."),
                "tags": tags,
                "files": {"glb": glb_relative},
                "textures": metadata.pop("textures", []),
                **metadata,
            }
        )

    models.sort(
        key=lambda model: (
            DISPLAY_MODEL_PRIORITY.get(str(model["id"]), 100),
            str(model["displayName"]).lower(),
            str(model["id"]).lower(),
        )
    )
    return {"schemaVersion": 1, "basePath": "obj/", "models": models}


REPOSITORY_DATA_POINTER_IDENTITY = ("repository-release",)


def _data_pointer_identity(pointer: object) -> tuple[str, ...] | None:
    if pointer is None:
        return REPOSITORY_DATA_POINTER_IDENTITY
    if not isinstance(pointer, dict):
        return None
    candidate_id = pointer.get("candidate_id")
    candidate_revision = pointer.get("candidate_revision")
    if (
        not isinstance(candidate_id, str)
        or not candidate_id.strip()
        or not isinstance(candidate_revision, str)
        or re.fullmatch(r"sha256:[a-f0-9]{64}", candidate_revision) is None
    ):
        return None
    return ("candidate", candidate_id, candidate_revision)


def _data_pointer_identity_from_value(value: object) -> tuple[str, ...] | None:
    if value == REPOSITORY_DATA_POINTER_IDENTITY:
        return REPOSITORY_DATA_POINTER_IDENTITY
    if not isinstance(value, tuple) or len(value) != 3 or value[0] != "candidate":
        return None
    return _data_pointer_identity({"candidate_id": value[1], "candidate_revision": value[2]})


def _selected_data_plane_root(data_plane) -> tuple[Path, tuple[str, ...]]:
    pointer = data_plane.pointer()
    identity = _data_pointer_identity(pointer)
    if identity is None:
        raise RuntimeError("The selected satellite data pointer is invalid.")
    root = data_plane.repository_root if pointer is None else data_plane.candidate_root(identity[1])
    return Path(root).resolve(), identity


class DataSelectionCoordinator:
    def __init__(
        self,
        *,
        data_plane,
        registered_root: Path | str,
        registered_pointer_identity: tuple[str, ...],
        on_selected=None,
    ) -> None:
        identity = _data_pointer_identity_from_value(registered_pointer_identity)
        if identity is None:
            raise ValueError("The registered satellite data pointer identity is invalid.")
        self.data_plane = data_plane
        self.on_selected = on_selected
        self._registered_root = Path(registered_root).resolve()
        self._registered_pointer_identity = identity
        self._lock = threading.RLock()
        self.last_error: str | None = None

    @property
    def registered_pointer_identity(self) -> tuple[str, ...]:
        with self._lock:
            return self._registered_pointer_identity

    def current_root(self) -> Path:
        with self._lock:
            return self._registered_root

    def synchronize(self) -> tuple[Path, tuple[str, ...]]:
        with self._lock:
            selected_root, selected_identity = _selected_data_plane_root(self.data_plane)
            if selected_identity == self._registered_pointer_identity:
                self.last_error = None
                return self._registered_root, self._registered_pointer_identity
            if self.on_selected is not None:
                self.on_selected(selected_root)
            self._registered_root = selected_root
            self._registered_pointer_identity = selected_identity
            self.last_error = None
            return selected_root, selected_identity

    def resolve(self) -> Path:
        try:
            root, _identity = self.synchronize()
            return root
        except Exception as exc:
            with self._lock:
                self.last_error = str(exc)
                return self._registered_root


class DataUpdateScheduler:
    def __init__(
        self,
        *,
        interval_hours: float = DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
        gp_interval_hours: float | None = None,
        tle_interval_hours: float | None = None,
        satcat_interval_hours: float | None = None,
        tracked_interval_hours: float | None = None,
        reconciliation_interval_hours: float = DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
        on_updated=None,
        initial_delay_seconds: float = 1.0,
        failure_backoff_base_seconds: float = 300.0,
        failure_backoff_cap_seconds: float = 21_600.0,
        data_plane=None,
        registered_pointer_identity: tuple[str, ...] | None = None,
        jitter=None,
        clock=None,
    ):
        self.interval_hours = max(1.0, float(interval_hours))
        self.intervals_hours = {
            "gp": max(1.0, float(gp_interval_hours if gp_interval_hours is not None else self.interval_hours)),
            "tle": max(1.0, float(tle_interval_hours if tle_interval_hours is not None else self.interval_hours)),
            "satcat": max(1.0, float(satcat_interval_hours if satcat_interval_hours is not None else self.interval_hours)),
            "tracked": max(
                1.0,
                float(
                    tracked_interval_hours
                    if tracked_interval_hours is not None
                    else satcat_interval_hours
                    if satcat_interval_hours is not None
                    else self.interval_hours
                ),
            ),
            "reconciliation": max(1.0, float(reconciliation_interval_hours)),
        }
        self.on_updated = on_updated
        self.initial_delay_seconds = max(0.0, float(initial_delay_seconds))
        self.failure_backoff_base_seconds = max(60.0, float(failure_backoff_base_seconds))
        self.failure_backoff_cap_seconds = max(
            self.failure_backoff_base_seconds,
            float(failure_backoff_cap_seconds),
        )
        if data_plane is not None:
            self.data_plane = data_plane
        elif SatelliteDataPlane is not None:
            self.data_plane = SatelliteDataPlane(
                repository_root=ROOT,
                state_root=ROOT / "runtime" / "data-plane",
            )
        else:
            self.data_plane = None
        self.jitter = jitter or random.uniform
        self.clock = clock or time.time
        self.consecutive_failures = 0
        self.last_result: dict[str, object] | None = None
        self.registration_pending = False
        self.registered_pointer_identity = _data_pointer_identity_from_value(registered_pointer_identity)
        self.stop_event = threading.Event()
        self.publication_lock = threading.Lock()
        self.thread = threading.Thread(target=self._run, name="openbexi-data-update", daemon=False)

    def start(self) -> None:
        if self.stop_event.is_set() or self.thread.ident is not None or self.thread.is_alive():
            raise RuntimeError("The data-update scheduler can only be started once.")
        started_at = self._timestamp()
        _set_data_update_status(
            enabled=True,
            running=True,
            worker_alive=True,
            state="scheduled",
            interval_hours=self.interval_hours,
            intervals_hours=dict(self.intervals_hours),
            dataset_status=self._dataset_status(None),
            consecutive_failures=0,
            retry_delay_seconds=None,
            poll_interval_seconds=self._success_delay_seconds(None),
            started_at=started_at,
            stopped_at=None,
            stop_requested=False,
            shutdown_timed_out=False,
            last_started_at=None,
            last_finished_at=None,
            last_cycle_state=None,
            last_reconciled_at=None,
            next_check_at=self._timestamp(self.clock() + self.initial_delay_seconds),
            last_result=None,
            last_error=None,
            last_errors=[],
            tool_available=maybe_update_satellite_data is not None,
            import_error=DATA_TOOL_IMPORT_ERROR,
        )
        self.thread.start()

    def stop(self, timeout_seconds: float = 120.0) -> None:
        with self.publication_lock:
            self.stop_event.set()
        _set_data_update_status(
            stop_requested=True,
            state="stopping",
            next_check_at=None,
            retry_delay_seconds=None,
        )
        if self.thread.is_alive():
            self.thread.join(timeout=max(0.0, float(timeout_seconds)))
        if self.thread.is_alive():
            _set_data_update_status(
                running=True,
                worker_alive=True,
                state="stopping",
                shutdown_timed_out=True,
            )
        else:
            _set_data_update_status(
                running=False,
                worker_alive=False,
                state="stopped",
                stopped_at=self._timestamp(),
                shutdown_timed_out=False,
            )

    def _run(self) -> None:
        try:
            if self.stop_event.wait(self.initial_delay_seconds):
                return
            while not self.stop_event.is_set():
                state = self.run_once()
                if self.stop_event.is_set():
                    break
                if state in {"failed", "degraded", "unavailable"}:
                    sleep_seconds = self._failure_delay_seconds()
                    retry_delay = sleep_seconds
                else:
                    sleep_seconds = self._success_delay_seconds(self.last_result)
                    retry_delay = None
                _set_data_update_status(
                    next_check_at=self._timestamp(self.clock() + sleep_seconds),
                    poll_interval_seconds=sleep_seconds,
                    retry_delay_seconds=retry_delay,
                )
                if self.stop_event.wait(sleep_seconds):
                    break
        finally:
            _set_data_update_status(
                running=False,
                worker_alive=False,
                state="stopped",
                stopped_at=self._timestamp(),
                next_check_at=None,
                retry_delay_seconds=None,
                shutdown_timed_out=False,
            )

    def run_once(self) -> str:
        if self.data_plane is None:
            self.consecutive_failures += 1
            _set_data_update_status(
                state="unavailable",
                last_cycle_state="unavailable",
                consecutive_failures=self.consecutive_failures,
                last_error=DATA_TOOL_IMPORT_ERROR,
                last_errors=[DATA_TOOL_IMPORT_ERROR] if DATA_TOOL_IMPORT_ERROR else [],
            )
            return "unavailable"
        started_at = self._timestamp()
        _set_data_update_status(
            state="checking",
            last_started_at=started_at,
            next_check_at=None,
            retry_delay_seconds=None,
            last_error=None,
            last_errors=[],
        )
        try:
            result = self.data_plane.stage_update(
                promote=True,
                cancel_requested=self.stop_event.is_set,
                publication_guard=self.publication_lock,
                interval_hours=self.interval_hours,
                gp_interval_hours=self.intervals_hours["gp"],
                tle_interval_hours=self.intervals_hours["tle"],
                satcat_interval_hours=self.intervals_hours["satcat"],
                tracked_interval_hours=self.intervals_hours["tracked"],
                reconciliation_interval_hours=self.intervals_hours["reconciliation"],
            )
            if not isinstance(result, dict):
                raise TypeError("Satellite data update returned a non-object result.")
        except DataPlaneCancelled:
            _set_data_update_status(
                state="cancelled",
                last_cycle_state="cancelled",
                last_error=None,
                last_errors=[],
                last_finished_at=self._timestamp(),
            )
            return "cancelled"
        except Exception as exc:
            self.consecutive_failures += 1
            _set_data_update_status(
                state="failed",
                last_cycle_state="failed",
                consecutive_failures=self.consecutive_failures,
                last_error=str(exc),
                last_errors=[str(exc)],
                last_finished_at=self._timestamp(),
            )
            return "failed"
        self.last_result = result
        result_errors = self._result_errors(result)
        state = (
            "degraded"
            if result.get("degraded") or result_errors
            else "skipped"
            if result.get("skipped")
            else "succeeded"
        )
        registration_error = None
        candidate_promoted = result.get("promoted") is True
        selected_pointer_identity = None
        if self.on_updated is not None and self.registered_pointer_identity is not None:
            try:
                selected_pointer_identity = _data_pointer_identity(self.data_plane.pointer())
                if selected_pointer_identity is None:
                    raise RuntimeError("The selected satellite data pointer is invalid.")
            except Exception as exc:
                registration_error = str(exc)
                self.registration_pending = True
            else:
                if selected_pointer_identity != self.registered_pointer_identity:
                    self.registration_pending = True
        if self.on_updated is not None and candidate_promoted:
            self.registration_pending = True
        if self.on_updated is not None and self.registration_pending:
            try:
                callback_pointer_identity = self.on_updated()
            except Exception as exc:
                registration_error = str(exc)
                state = "degraded"
            else:
                callback_pointer_identity = _data_pointer_identity_from_value(callback_pointer_identity)
                registered_pointer_identity = callback_pointer_identity or selected_pointer_identity
                if self.registered_pointer_identity is not None and registered_pointer_identity is None:
                    registration_error = registration_error or "Runtime data-pointer registration was not confirmed."
                    state = "degraded"
                else:
                    if registered_pointer_identity is not None:
                        self.registered_pointer_identity = registered_pointer_identity
                    self.registration_pending = False
                    registration_error = None
        elif registration_error is not None:
            state = "degraded"
        if state == "degraded":
            self.consecutive_failures += 1
        else:
            self.consecutive_failures = 0
        finished_at = self._timestamp()
        last_reconciled_at = self._last_reconciled_at(result)
        _set_data_update_status(
            state=state,
            last_cycle_state=state,
            consecutive_failures=self.consecutive_failures,
            last_result=result,
            last_error=registration_error or (result_errors[0] if result_errors else None),
            last_errors=([registration_error] if registration_error else []) + result_errors,
            last_finished_at=finished_at,
            dataset_status=self._dataset_status(result, checked_at=finished_at),
            **({"last_reconciled_at": last_reconciled_at} if last_reconciled_at else {}),
        )
        return state

    def _timestamp(self, epoch_seconds: float | None = None) -> str:
        value = self.clock() if epoch_seconds is None else epoch_seconds
        return dt.datetime.fromtimestamp(value, tz=dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    def _failure_delay_seconds(self) -> float:
        exponent = min(32, max(0, self.consecutive_failures - 1))
        base = min(
            self.failure_backoff_cap_seconds,
            self.failure_backoff_base_seconds * (2 ** exponent),
        )
        lower = max(60.0, base * 0.8)
        upper = min(self.failure_backoff_cap_seconds, base * 1.2)
        if upper < lower:
            lower = upper
        jittered = float(self.jitter(lower, upper))
        return min(self.failure_backoff_cap_seconds, max(60.0, jittered))

    def _success_delay_seconds(self, result: dict[str, object] | None) -> float:
        default_delay = min(3600.0, max(60.0, min(self.intervals_hours.values()) * 900.0))
        if not isinstance(result, dict):
            return default_delay
        numeric_delay = next(
            (
                float(result[key])
                for key in ("next_check_in_seconds", "next_due_in_seconds")
                if isinstance(result.get(key), (int, float)) and not isinstance(result.get(key), bool)
            ),
            None,
        )
        if numeric_delay is not None:
            return min(3600.0, max(60.0, numeric_delay))
        timestamps = []
        for container in (result, result.get("datasets"), result.get("schedule")):
            if not isinstance(container, dict):
                continue
            for value in container.values():
                if isinstance(value, dict):
                    candidate = value.get("next_due_at") or value.get("next_check_at")
                    if isinstance(candidate, str):
                        timestamps.append(candidate)
            for key in ("next_due_at", "next_check_at"):
                candidate = container.get(key)
                if isinstance(candidate, str):
                    timestamps.append(candidate)
        epochs = [self._parse_timestamp(value) for value in timestamps]
        future_epochs = [value for value in epochs if value is not None]
        if not future_epochs:
            return default_delay
        return min(3600.0, max(60.0, min(future_epochs) - self.clock()))

    @staticmethod
    def _parse_timestamp(value: str) -> float | None:
        return _parse_iso_timestamp(value)

    @staticmethod
    def _result_errors(result: dict[str, object]) -> list[str]:
        errors: list[str] = []
        containers = [result]
        containers.extend(
            result[name]
            for name in ("gp", "tle", "satcat", "tracked", "launches", "decayed", "reconciliation")
            if isinstance(result.get(name), dict)
        )
        for container in containers:
            nested = container.get("errors")
            if isinstance(nested, list):
                errors.extend(str(item) for item in nested if str(item).strip())
            elif isinstance(nested, str) and nested.strip():
                errors.append(nested.strip())
            single = container.get("error")
            if isinstance(single, str) and single.strip():
                errors.append(single.strip())
        return list(dict.fromkeys(errors))

    def _dataset_status(
        self,
        result: dict[str, object] | None,
        *,
        checked_at: str | None = None,
    ) -> dict[str, dict[str, object]]:
        due = result.get("due") if isinstance(result, dict) and isinstance(result.get("due"), dict) else {}
        statuses: dict[str, dict[str, object]] = {}
        configured_intervals = {
            **self.intervals_hours,
            "launches": self.intervals_hours["satcat"],
            "decayed": self.intervals_hours["satcat"],
        }
        for name, interval in configured_intervals.items():
            item = result.get(name) if isinstance(result, dict) and isinstance(result.get(name), dict) else None
            due_value = due.get(name)
            if name == "reconciliation" and isinstance(due_value, dict):
                due_value = any(value is True for value in due_value.values())
            if item is not None and isinstance(item.get("due"), bool):
                due_value = item["due"]
            status: dict[str, object] = {
                "interval_hours": interval,
                "state": "pending" if result is None else "not-due",
                "due": due_value if isinstance(due_value, bool) else None,
            }
            if checked_at:
                status["last_checked_at"] = checked_at
            if item is not None:
                errors = self._result_errors(item)
                status["state"] = (
                    "degraded"
                    if errors
                    else "reconciled"
                    if name == "reconciliation" and item.get("completed") is True
                    else "updated"
                    if item.get("changed") is True
                    else "skipped"
                    if item.get("skipped") is True
                    else "not-due"
                    if name == "reconciliation" and due_value is False
                    else "checked"
                )
                for key in ("changed", "skipped", "completed", "message", "next_due_at", "last_success_at"):
                    if key in item:
                        status[key] = item[key]
                if errors:
                    status["errors"] = errors
            statuses[name] = status
        return statuses

    @staticmethod
    def _last_reconciled_at(result: dict[str, object]) -> str | None:
        values = [result.get("last_reconciled_at"), result.get("reconciled_at")]
        reconciliation = result.get("reconciliation")
        if isinstance(reconciliation, dict) and not reconciliation.get("skipped"):
            values.extend(
                reconciliation.get(key)
                for key in ("last_reconciled_at", "reconciled_at", "finished_at")
            )
        return _newest_timestamp(values)


def _openapi_v1_paths(json_object_schema: dict[str, object]) -> dict[str, object]:
    bearer = [{"bearerAuth": []}]
    problem = {
        "description": "RFC 9457-style problem response",
        "content": {"application/problem+json": {"schema": {"$ref": "#/components/schemas/Problem"}}},
    }
    idempotency = {
        "name": "Idempotency-Key",
        "in": "header",
        "required": True,
        "schema": {"type": "string", "minLength": 8, "maxLength": 128},
    }
    job_request = {
        "required": True,
        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ScreeningJobRequest"}}},
    }
    return {
        "/api/v1/health/live": {
            "get": {"summary": "Check API process liveness", "responses": {"200": {"description": "Process is live"}}}
        },
        "/api/v1/health/ready": {
            "get": {
                "summary": "Check screening-service readiness",
                "responses": {"200": {"description": "Service is ready"}, "503": problem},
            }
        },
        "/api/v1/capabilities": {
            "get": {
                "summary": "Discover versioned screening capabilities and bounds",
                "responses": {"200": {"description": "Capability document", "content": {"application/json": {"schema": json_object_schema}}}},
            }
        },
        "/api/v1/catalog-revisions": {
            "get": {
                "summary": "List catalog revisions with keyset pagination",
                "security": bearer,
                "parameters": [
                    {"name": "limit", "in": "query", "schema": {"type": "integer", "minimum": 1, "maximum": 200}},
                    {"name": "cursor", "in": "query", "schema": {"type": "string"}},
                    {"name": "source_id", "in": "query", "schema": {"type": "string"}},
                    {"name": "source_status", "in": "query", "schema": {"type": "string", "enum": ["COMPLETE", "PARTIAL", "DEGRADED"]}},
                ],
                "responses": {"200": {"description": "Catalog revision page"}, "401": problem},
            }
        },
        "/api/v1/catalog-revisions/{revision_id}": {
            "get": {
                "summary": "Read one catalog revision",
                "security": bearer,
                "parameters": [{"name": "revision_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                "responses": {"200": {"description": "Catalog revision"}, "401": problem, "404": problem},
            }
        },
        "/api/v1/screening-jobs": {
            "get": {
                "summary": "List durable screening jobs",
                "security": bearer,
                "parameters": [
                    {"name": "limit", "in": "query", "schema": {"type": "integer", "minimum": 1, "maximum": 200}},
                    {"name": "cursor", "in": "query", "schema": {"type": "string"}},
                    {"name": "state", "in": "query", "schema": {"type": "array", "items": {"type": "string"}}},
                ],
                "responses": {"200": {"description": "Screening-job page"}, "401": problem},
            },
            "post": {
                "summary": "Submit an idempotent full-catalog screening job",
                "security": bearer,
                "parameters": [idempotency],
                "requestBody": job_request,
                "responses": {"202": {"description": "Job accepted"}, "400": problem, "401": problem, "403": problem, "409": problem},
            },
        },
        "/api/v1/screening-jobs/{job_id}": {
            "get": {
                "summary": "Read a durable screening job",
                "security": bearer,
                "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                "responses": {"200": {"description": "Job detail"}, "401": problem, "404": problem},
            },
            "delete": {
                "summary": "Request screening-job cancellation",
                "security": bearer,
                "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                "responses": {"202": {"description": "Cancellation accepted"}, "401": problem, "403": problem, "404": problem},
            },
        },
        "/api/v1/screening-jobs/{job_id}/retry": {
            "post": {
                "summary": "Retry an eligible job within its attempt budget",
                "security": bearer,
                "parameters": [{"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                "responses": {"202": {"description": "Retry queued"}, "409": problem},
            }
        },
        "/api/v1/screening-jobs/{job_id}/replay": {
            "post": {
                "summary": "Replay the frozen request and catalog revision",
                "security": bearer,
                "parameters": [
                    {"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}},
                    idempotency,
                ],
                "responses": {"202": {"description": "Replay accepted"}, "409": problem},
            }
        },
        "/api/v1/screening-jobs/{job_id}/stream": {
            "get": {
                "summary": "Resume authenticated job progress as Server-Sent Events",
                "security": bearer,
                "parameters": [
                    {"name": "job_id", "in": "path", "required": True, "schema": {"type": "string"}},
                    {"name": "Last-Event-ID", "in": "header", "schema": {"type": "integer", "minimum": 0}},
                ],
                "responses": {"200": {"description": "SSE stream", "content": {"text/event-stream": {"schema": {"type": "string"}}}}, "401": problem},
            }
        },
        "/api/v1/conjunction-events": {
            "get": {
                "summary": "Query immutable conjunction event revisions",
                "security": bearer,
                "parameters": [
                    {"name": "limit", "in": "query", "schema": {"type": "integer", "minimum": 1, "maximum": 200}},
                    {"name": "cursor", "in": "query", "schema": {"type": "string"}},
                    {"name": "job_id", "in": "query", "schema": {"type": "string"}},
                    {"name": "object_id", "in": "query", "schema": {"type": "string"}},
                    {"name": "tca_from", "in": "query", "schema": {"type": "string", "format": "date-time"}},
                    {"name": "tca_to", "in": "query", "schema": {"type": "string", "format": "date-time"}},
                    {"name": "max_miss_distance_km", "in": "query", "schema": {"type": "number", "minimum": 0}},
                    {"name": "order", "in": "query", "schema": {"type": "string", "enum": ["tca_asc", "tca_desc", "miss_distance_asc", "miss_distance_desc"]}},
                ],
                "responses": {"200": {"description": "Conjunction event page"}, "401": problem},
            }
        },
        "/api/v1/conjunction-events/{event_id}": {
            "get": {
                "summary": "Read one immutable conjunction event revision",
                "security": bearer,
                "parameters": [{"name": "event_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                "responses": {"200": {"description": "Conjunction event"}, "401": problem, "404": problem},
            }
        },
    }


def _openapi_document(host: str) -> dict[str, object]:
    json_array_schema = {
        "type": "array",
        "items": {"type": "object", "additionalProperties": True},
    }
    json_object_schema = {"type": "object", "additionalProperties": True}
    return {
        "openapi": "3.0.3",
        "info": {
            "title": "OpenBEXI Earth Orbit API",
            "version": API_V1_VERSION,
            "x-application-version": APP_VERSION,
            "description": (
                "Local API for OpenBEXI Earth Orbit satellite data, "
                "GP/OMM and legacy TLE data, metadata, and health/status checks."
            ),
        },
        "servers": [{"url": f"http://{host}"}],
        "paths": {
            "/api/health": {
                "get": {
                    "summary": "Check server health",
                    "responses": {
                        "200": {
                            "description": "Server is available",
                            "content": {"application/json": {"schema": json_object_schema}},
                        }
                    },
                }
            },
            "/api/version": {
                "get": {
                    "summary": "Get app and API version information",
                    "responses": {
                        "200": {
                            "description": "Version payload",
                            "content": {"application/json": {"schema": json_object_schema}},
                        }
                    },
                }
            },
            "/api/tle": {
                "get": {
                    "summary": "Load the deprecated compatibility TLE dataset",
                    "responses": {
                        "200": {
                            "description": "TLE satellite records",
                            "content": {"application/json": {"schema": json_array_schema}},
                        }
                    },
                }
            },
            "/api/gp": {
                "get": {
                    "summary": "Load the primary CelesTrak GP/OMM dataset",
                    "responses": {
                        "200": {
                            "description": "GP/OMM satellite records",
                            "content": {"application/json": {"schema": json_array_schema}},
                        },
                        "404": {"description": "GP/OMM catalog has not been exported yet"},
                    },
                }
            },
            "/api/gp-metadata": {
                "get": {
                    "summary": "Load primary GP/OMM catalog metadata",
                    "responses": {
                        "200": {
                            "description": "GP/OMM source, revision, freshness, and normalization metadata",
                            "content": {"application/json": {"schema": json_object_schema}},
                        },
                        "404": {"description": "GP/OMM metadata has not been exported yet"},
                    },
                }
            },
            "/api/tracked-objects": {
                "get": {
                    "summary": "Load the current provider-tracked object manifest",
                    "responses": {
                        "200": {
                            "description": "Tracked-object coverage, revision, and chunk manifest",
                            "content": {"application/json": {"schema": json_object_schema}},
                        },
                        "404": {"description": "Tracked-object catalog has not been built yet"},
                        "503": {"description": "Tracked manifest, closure, or source lineage is not coherent"},
                    },
                }
            },
            "/api/tracked-objects/manifest": {
                "get": {
                    "summary": "Load the current provider-tracked object manifest",
                    "responses": {
                        "200": {
                            "description": "Tracked-object coverage, revision, and chunk manifest",
                            "content": {"application/json": {"schema": json_object_schema}},
                        },
                        "404": {"description": "Tracked-object catalog has not been built yet"},
                        "503": {"description": "Tracked manifest, closure, or source lineage is not coherent"},
                    },
                }
            },
            "/api/tracked-objects/chunks/{file_name}": {
                "get": {
                    "summary": "Load one content-addressed tracked-object chunk referenced by the current manifest",
                    "parameters": [
                        {
                            "name": "file_name",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                        }
                    ],
                    "responses": {
                        "200": {
                            "description": "Tracked-object chunk",
                            "content": {"application/json": {"schema": json_object_schema}},
                        },
                        "404": {"description": "Chunk is not referenced by the current manifest"},
                        "503": {"description": "Tracked manifest, closure, or source lineage is not coherent"},
                    },
                }
            },
            "/api/satellites": {
                "get": {
                    "summary": "Load the preferred GP/OMM catalog with legacy TLE fallback",
                    "responses": {
                        "200": {
                            "description": "Satellite records",
                            "content": {"application/json": {"schema": json_array_schema}},
                        }
                    },
                }
            },
            "/api/satellite-metadata": {
                "get": {
                    "summary": "List available satellite metadata files",
                    "responses": {
                        "200": {
                            "description": "Metadata file index",
                            "content": {"application/json": {"schema": json_object_schema}},
                        }
                    },
                }
            },
            "/api/satellite-metadata/{file_name}": {
                "get": {
                    "summary": "Load one known satellite metadata JSON file",
                    "parameters": [
                        {
                            "name": "file_name",
                            "in": "path",
                            "required": True,
                            "schema": {"type": "string"},
                        }
                    ],
                    "responses": {
                        "200": {
                            "description": "Satellite metadata JSON",
                            "content": {"application/json": {"schema": json_object_schema}},
                        },
                        "404": {"description": "Metadata file not found"},
                    },
                }
            },
            "/api/display-satellite-models": {
                "get": {
                    "summary": "List GLB and OBJ/MTL satellite models available under obj/",
                    "responses": {
                        "200": {
                            "description": "Display satellite model manifest",
                            "content": {"application/json": {"schema": json_object_schema}},
                        }
                    },
                }
            },
            "/api/decayed": {
                "get": {
                    "summary": "Load confirmed decayed satellite data",
                    "responses": {
                        "200": {
                            "description": "Decayed satellite source data",
                            "content": {"application/json": {"schema": json_object_schema}},
                        }
                    },
                }
            },
            "/api/data-update-status": {
                "get": {
                    "summary": "Get optional scheduled data-update status",
                    "responses": {
                        "200": {
                            "description": "Data update scheduler status",
                            "content": {"application/json": {"schema": json_object_schema}},
                        }
                    },
                }
            },
            "/openapi.json": {
                "get": {
                    "summary": "OpenAPI schema",
                    "responses": {
                        "200": {
                            "description": "OpenAPI JSON document",
                            "content": {"application/json": {"schema": json_object_schema}},
                        }
                    },
                }
            },
            "/docs": {
                "get": {
                    "summary": "Swagger/OpenAPI documentation page",
                    "responses": {"200": {"description": "HTML documentation"}},
                }
            },
            "/api/launches": {
                "get": {
                    "summary": "Load SATCAT-backed launch timeline records",
                    "responses": {
                        "200": {
                            "description": "Normalized launch event records",
                            "content": {"application/json": {"schema": json_array_schema}},
                        },
                        "404": {"description": "Launch catalog has not been built yet"},
                    },
                }
            },
            **_openapi_v1_paths(json_object_schema),
        },
        "components": {
            "securitySchemes": {
                "bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "opaque local token"}
            },
            "schemas": {
                "Problem": {
                    "type": "object",
                    "required": ["type", "title", "status", "detail", "code"],
                    "properties": {
                        "type": {"type": "string", "format": "uri"},
                        "title": {"type": "string"},
                        "status": {"type": "integer"},
                        "detail": {"type": "string"},
                        "code": {"type": "string"},
                        "instance": {"type": "string"},
                    },
                },
                "ScreeningJobRequest": {
                    "type": "object",
                    "required": ["schema_version", "catalog_revision_id", "catalog_scope", "configuration"],
                    "properties": {
                        "schema_version": {"type": "string", "enum": ["2.1.0"]},
                        "catalog_revision_id": {"type": "string"},
                        "catalog_scope": {"type": "object"},
                        "configuration": {"type": "object"},
                    },
                    "additionalProperties": False,
                },
            },
        },
    }


def _docs_html() -> bytes:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>OpenBEXI Earth Orbit API Docs</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body {{ margin: 0; background: #0f1520; color: #d9ecff; font-family: Arial, sans-serif; }}
    .fallback {{ padding: 16px; border-bottom: 1px solid #274466; background: #111d2c; }}
    .fallback a {{ color: #8ecbff; }}
    #swagger-ui {{ background: #0f1520; min-height: calc(100vh - 48px); }}
    .swagger-ui, .swagger-ui .info .title, .swagger-ui .info p, .swagger-ui .opblock-tag,
    .swagger-ui .opblock .opblock-summary-path, .swagger-ui .opblock .opblock-summary-description,
    .swagger-ui table thead tr td, .swagger-ui table thead tr th, .swagger-ui .response-col_status,
    .swagger-ui .response-col_description, .swagger-ui .model-title, .swagger-ui .model,
    .swagger-ui .parameter__name, .swagger-ui .parameter__type, .swagger-ui .parameter__deprecated,
    .swagger-ui .tab li, .swagger-ui label, .swagger-ui p, .swagger-ui h4, .swagger-ui h5 {{
      color: #e8f5ff !important;
    }}
    .swagger-ui .info .title small, .swagger-ui .info .title small pre {{
      background: #d8f2ff !important;
      color: #06182c !important;
    }}
    .swagger-ui .scheme-container {{
      background: #edf6ff !important;
      color: #06182c !important;
      box-shadow: none !important;
    }}
    .swagger-ui .scheme-container label, .swagger-ui .scheme-container select {{
      color: #06182c !important;
    }}
    .swagger-ui .opblock.opblock-get {{
      background: #132640 !important;
      border-color: #6db6ff !important;
    }}
    .swagger-ui .opblock.opblock-get .opblock-summary {{
      border-color: #6db6ff !important;
    }}
    .swagger-ui .opblock .opblock-summary-method {{
      color: #ffffff !important;
      text-shadow: 0 1px 1px rgba(0,0,0,0.45);
    }}
    .swagger-ui .opblock .opblock-summary-path a span,
    .swagger-ui .opblock .opblock-summary-path__deprecated {{
      color: #ffffff !important;
      font-weight: 800 !important;
    }}
    .swagger-ui .opblock .opblock-summary-description {{
      color: #bdd7f0 !important;
    }}
    .swagger-ui .opblock-description-wrapper,
    .swagger-ui .opblock-external-docs-wrapper,
    .swagger-ui .opblock-title_normal,
    .swagger-ui .responses-wrapper,
    .swagger-ui .parameters-container {{
      background: #102033 !important;
      color: #e8f5ff !important;
    }}
    .swagger-ui .highlight-code,
    .swagger-ui .microlight,
    .swagger-ui pre {{
      background: #071321 !important;
      color: #e8f5ff !important;
    }}
    .swagger-ui .btn, .swagger-ui .try-out__btn {{
      color: #e8f5ff !important;
      border-color: #7fbaff !important;
      background: #183b63 !important;
    }}
    .swagger-ui svg, .swagger-ui .expand-operation svg {{
      fill: #e8f5ff !important;
    }}
  </style>
</head>
<body>
  <div class="fallback">
    <strong>OpenBEXI Earth Orbit API</strong>
    <span>Version {APP_VERSION}, {PUBLICATION_STATE} dated {PUBLICATION_DATE}.</span>
    <a href="/openapi.json">OpenAPI schema</a>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    if (window.SwaggerUIBundle) {{
      window.SwaggerUIBundle({{ url: '/openapi.json', dom_id: '#swagger-ui' }});
    }}
  </script>
</body>
</html>
""".encode("utf-8")


class OpenBexiHandler(SimpleHTTPRequestHandler):
    server_version = f"OpenBEXIHTTP/{APP_VERSION}"
    sys_version = ""

    def __init__(
        self,
        *args,
        serve_static: bool = True,
        cors_origins: tuple[str, ...] = (),
        v21_router: V21HttpRouter | None = None,
        data_root_resolver=None,
        **kwargs,
    ):
        self.serve_static = serve_static
        self.cors_origins = tuple(origin.rstrip("/") for origin in cors_origins if origin)
        self.v21_router = v21_router
        self.data_root_resolver = data_root_resolver
        self._response_status = HTTPStatus.OK
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_response(self, code: int, message: str | None = None) -> None:
        self._response_status = code
        super().send_response(code, message)

    def end_headers(self) -> None:
        origin = self.headers.get("Origin", "")
        if origin:
            self.send_header("Vary", "Origin")
        if cors_origin_is_allowed(origin, self.cors_origins):
            allowed_origin = "*" if "*" in self.cors_origins else origin.rstrip("/")
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
            self.send_header("Access-Control-Allow-Methods", "GET,HEAD,POST,DELETE,OPTIONS")
            self.send_header(
                "Access-Control-Allow-Headers",
                "Accept,Authorization,Content-Type,Idempotency-Key,Last-Event-ID",
            )
            self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Cache-Control", cache_control_for_path(self.path, self._response_status))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        origin = self.headers.get("Origin", "")
        if origin and not cors_origin_is_allowed(origin, self.cors_origins):
            self.send_error(HTTPStatus.FORBIDDEN, "CORS origin is not allowed")
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:
        if self._handle_api(head_only=False):
            return
        if not self.serve_static:
            self.send_error(HTTPStatus.NOT_FOUND, "Static hosting disabled")
            return
        if self._handle_tracked_static_catalog(head_only=False):
            return
        if self._handle_tracked_static_chunk(head_only=False):
            return
        if self._handle_mutable_data_static(head_only=False):
            return
        if not static_request_is_exposed(self.path):
            self.send_error(HTTPStatus.NOT_FOUND, "Static resource is not exposed")
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        if self._handle_api(head_only=True):
            return
        if not self.serve_static:
            self.send_error(HTTPStatus.NOT_FOUND, "Static hosting disabled")
            return
        if self._handle_tracked_static_catalog(head_only=True):
            return
        if self._handle_tracked_static_chunk(head_only=True):
            return
        if self._handle_mutable_data_static(head_only=True):
            return
        if not static_request_is_exposed(self.path):
            self.send_error(HTTPStatus.NOT_FOUND, "Static resource is not exposed")
            return
        super().do_HEAD()

    def do_POST(self) -> None:
        if self._handle_api(head_only=False):
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Unknown API route")

    def do_DELETE(self) -> None:
        if self._handle_api(head_only=False):
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Unknown API route")

    def list_directory(self, path: str):
        self.send_error(HTTPStatus.NOT_FOUND, "Directory listing is disabled")
        return None

    def _send_bytes(
        self,
        body: bytes,
        *,
        content_type: str = "application/json; charset=utf-8",
        status: HTTPStatus = HTTPStatus.OK,
        head_only: bool = False,
    ) -> None:
        etag = f'"{hashlib.sha256(body).hexdigest()}"'
        if self.headers.get("If-None-Match") == etag:
            self.send_response(HTTPStatus.NOT_MODIFIED)
            self.send_header("ETag", etag)
            self.end_headers()
            return
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("ETag", etag)
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def _send_json(self, payload: object, *, head_only: bool = False) -> None:
        self._send_bytes(_json_bytes(payload), head_only=head_only)

    def _send_json_file(self, path: Path, *, head_only: bool = False) -> None:
        self._send_bytes(_safe_json_file(path), head_only=head_only)

    def _data_root(self) -> Path:
        root = self.data_root_resolver() if self.data_root_resolver is not None else ROOT
        resolved = Path(root).resolve()
        if resolved != ROOT and ROOT not in resolved.parents:
            raise OSError("Active data root is outside the repository runtime boundary.")
        return resolved

    def _send_tracked_catalog_unavailable(self, *, head_only: bool) -> None:
        body = _json_bytes(
            {
                "type": "https://openbexi.example/problems/tracked-catalog-unavailable",
                "title": "Tracked-object catalog unavailable",
                "status": HTTPStatus.SERVICE_UNAVAILABLE,
                "detail": (
                    "The tracked-object catalog is temporarily unavailable because its "
                    "manifest, metadata, chunks, or source lineage is not coherent."
                ),
                "code": "TRACKED_CATALOG_UNAVAILABLE",
                "instance": urlparse(self.path).path,
            }
        )
        self._send_bytes(
            body,
            content_type="application/problem+json; charset=utf-8",
            status=HTTPStatus.SERVICE_UNAVAILABLE,
            head_only=head_only,
        )

    def _tracked_catalog_request_snapshot(
        self,
        *,
        head_only: bool,
        root: Path | None = None,
    ) -> dict[str, object] | None:
        snapshot = _load_coherent_tracked_catalog_snapshot(root or self._data_root())
        if snapshot is not None:
            return snapshot
        self._send_tracked_catalog_unavailable(head_only=head_only)
        return None

    def _handle_tracked_static_catalog(self, *, head_only: bool) -> bool:
        path = (_normalized_request_path(self.path) or "").rstrip("/").lower()
        data_root = self._data_root()
        tracked_files = {
            "/json/tracked/tracked.manifest.json": _tracked_manifest_path(data_root),
            "/json/tracked/tracked.meta.json": data_root / "json" / "tracked" / "TRACKED.meta.json",
        }
        file_path = tracked_files.get(path)
        if file_path is None:
            return False
        snapshot = self._tracked_catalog_request_snapshot(head_only=head_only, root=data_root)
        if snapshot is None:
            return True
        body_key = "manifest_body" if file_path == _tracked_manifest_path(data_root) else "metadata_body"
        self._send_bytes(snapshot[body_key], head_only=head_only)
        return True

    def _send_verified_tracked_chunk(
        self,
        verified: dict[str, object],
        *,
        head_only: bool,
    ) -> None:
        length = verified.get("bytes")
        digest = str(verified.get("sha256") or "").lower().removeprefix("sha256:")
        body = verified.get("body")
        if (
            isinstance(length, bool)
            or not isinstance(length, int)
            or not re.fullmatch(r"[a-f0-9]{64}", digest)
            or (not head_only and (not isinstance(body, bytes) or len(body) != length))
        ):
            raise OSError("Verified tracked chunk response is inconsistent")
        etag = f'"{digest}"'
        if self.headers.get("If-None-Match") == etag:
            self.send_response(HTTPStatus.NOT_MODIFIED)
            self.send_header("ETag", etag)
            self.end_headers()
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(length))
        self.send_header("ETag", etag)
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def _handle_tracked_static_chunk(self, *, head_only: bool) -> bool:
        file_name = _tracked_static_chunk_name(self.path)
        if file_name is None:
            return False
        snapshot = self._tracked_catalog_request_snapshot(head_only=head_only)
        if snapshot is None:
            return True
        verified = _verified_tracked_chunk(
            file_name,
            snapshot["root"],
            include_body=not head_only,
            manifest_snapshot=snapshot["manifest_snapshot"],
        )
        if verified is None:
            self.send_error(HTTPStatus.NOT_FOUND, "Tracked-object chunk is not referenced")
            return True
        self._send_verified_tracked_chunk(verified, head_only=head_only)
        return True

    def _handle_mutable_data_static(self, *, head_only: bool) -> bool:
        path = (_normalized_request_path(self.path) or "").rstrip("/").lower()
        relative = {
            "/json/gp/gp.json": Path("json/gp/GP.json"),
            "/json/gp/gp.meta.json": Path("json/gp/GP.meta.json"),
            "/json/tle/tle.json": Path("json/tle/TLE.json"),
            "/json/tle/tle.meta.json": Path("json/tle/TLE.meta.json"),
            "/json/satcat.csv": Path("json/satcat.csv"),
            "/json/satcat.meta.json": Path("json/satcat.meta.json"),
            "/json/launches/launches.json": Path("json/launches/launches.json"),
            "/json/launches/launches.meta.json": Path("json/launches/launches.meta.json"),
            "/json/decayed/decayed.json": Path("json/decayed/decayed.json"),
            "/json/decayed/decayed.meta.json": Path("json/decayed/decayed.meta.json"),
        }.get(path)
        if relative is None:
            return False
        body = _safe_json_file(self._data_root() / relative)
        content_type = "text/csv; charset=utf-8" if relative.suffix.lower() == ".csv" else "application/json; charset=utf-8"
        self._send_bytes(body, content_type=content_type, head_only=head_only)
        return True

    def _handle_api(self, *, head_only: bool) -> bool:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        host = safe_request_host(self.headers.get("Host"), self.server.server_port)

        if path.startswith("/api/v1"):
            if self.v21_router is not None:
                self._data_root()
                return self.v21_router.handle(
                    self,
                    method=self.command,
                    head_only=head_only,
                )
            body = _json_bytes(
                {
                    "type": "https://openbexi.example/problems/capability-unavailable",
                    "title": "Capability unavailable",
                    "status": 503,
                    "detail": "The optional authenticated API v1 service is not running.",
                    "code": "CAPABILITY_UNAVAILABLE",
                    "instance": parsed.path,
                }
            )
            self._send_bytes(
                body,
                content_type="application/problem+json; charset=utf-8",
                status=HTTPStatus.SERVICE_UNAVAILABLE,
                head_only=head_only,
            )
            return True

        try:
            if path == "/api/health":
                self._send_json(
                    {
                        "status": "ok",
                        "app": "openbexi_earth_orbit",
                        "version": APP_VERSION,
                        "release_date": RELEASE_DATE,
                        "candidate_date": CANDIDATE_DATE,
                        "publication_state": PUBLICATION_STATE,
                    },
                    head_only=head_only,
                )
                return True
            if path == "/api/version":
                self._send_json(
                    {
                        "app_version": APP_VERSION,
                        "api_version": API_V1_VERSION,
                        "release_date": RELEASE_DATE,
                        "candidate_date": CANDIDATE_DATE,
                        "publication_state": PUBLICATION_STATE,
                        "release_channel": RELEASE_METADATA["channel"],
                        "maturity": RELEASE_METADATA["maturity"],
                        "safety_class": RELEASE_METADATA["safetyClass"],
                        "repository": REPO_URL,
                        "server": self.server_version,
                    },
                    head_only=head_only,
                )
                return True
            if path == "/api/gp":
                self._send_json_file(self._data_root() / "json" / "gp" / "GP.json", head_only=head_only)
                return True
            if path == "/api/gp-metadata":
                self._send_json_file(self._data_root() / "json" / "gp" / "GP.meta.json", head_only=head_only)
                return True
            if path in {"/api/tracked-objects", "/api/tracked-objects/manifest"}:
                snapshot = self._tracked_catalog_request_snapshot(head_only=head_only)
                if snapshot is None:
                    return True
                self._send_bytes(snapshot["manifest_body"], head_only=head_only)
                return True
            tracked_chunk_prefix = "/api/tracked-objects/chunks/"
            if path.startswith(tracked_chunk_prefix):
                snapshot = self._tracked_catalog_request_snapshot(head_only=head_only)
                if snapshot is None:
                    return True
                match = re.fullmatch(r"/api/tracked-objects/chunks/([^/]+)", path)
                file_name = unquote(match.group(1)) if match else ""
                verified = _verified_tracked_chunk(
                    file_name,
                    snapshot["root"],
                    include_body=not head_only,
                    manifest_snapshot=snapshot["manifest_snapshot"],
                )
                if verified is None:
                    self.send_error(HTTPStatus.NOT_FOUND, "Tracked-object chunk is not referenced")
                    return True
                self._send_verified_tracked_chunk(verified, head_only=head_only)
                return True
            if path == "/api/tle":
                self._send_json_file(self._data_root() / "json" / "tle" / "TLE.json", head_only=head_only)
                return True
            if path == "/api/satellites":
                self._send_json_file(_preferred_catalog_path(self._data_root()), head_only=head_only)
                return True
            if path == "/api/launches":
                self._send_json_file(self._data_root() / "json" / "launches" / "launches.json", head_only=head_only)
                return True
            if path == "/api/satellite-metadata":
                self._send_json(
                    {
                        "count": len(_metadata_files()),
                        "files": _metadata_files(),
                    },
                    head_only=head_only,
                )
                return True
            if path.startswith("/api/satellite-metadata/"):
                file_name = Path(unquote(path.split("/", 3)[-1])).name
                if not file_name.endswith(".json"):
                    self.send_error(HTTPStatus.NOT_FOUND, "Only JSON metadata files are exposed")
                    return True
                self._send_json_file(ROOT / "json" / "satellites" / file_name, head_only=head_only)
                return True
            if path == "/api/display-satellite-models":
                self._send_json(_display_satellite_model_manifest(), head_only=head_only)
                return True
            if path == "/api/decayed":
                self._send_json_file(self._data_root() / "json" / "decayed" / "decayed.json", head_only=head_only)
                return True
            if path == "/api/data-update-status":
                self._send_json(_data_update_status_snapshot(self._data_root()), head_only=head_only)
                return True
            if path == "/openapi.json":
                self._send_json(_openapi_document(host), head_only=head_only)
                return True
            if path == "/docs":
                self._send_bytes(_docs_html(), content_type="text/html; charset=utf-8", head_only=head_only)
                return True
        except FileNotFoundError:
            self.send_error(HTTPStatus.NOT_FOUND, "Requested API resource was not found")
            return True
        except OSError as exc:
            self.log_error("API resource error: %s", exc)
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, "Unable to read the requested API resource")
            return True

        if path.startswith("/api/"):
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API route")
            return True
        return False

    def guess_type(self, path: str) -> str:
        if path.endswith(".glb"):
            return "model/gltf-binary"
        if path.endswith(".gltf"):
            return "model/gltf+json"
        if path.endswith(".obj"):
            return "text/plain"
        if path.endswith(".mtl"):
            return "text/plain"
        if path.endswith((".js", ".mjs")):
            return "text/javascript"
        if path.endswith(".wasm"):
            return "application/wasm"
        if path.endswith(".ktx2"):
            return "image/ktx2"
        if path.endswith(".csv"):
            return "text/csv"
        return super().guess_type(path) or mimetypes.guess_type(path)[0] or "application/octet-stream"


def make_handler(
    serve_static: bool,
    cors_origins: tuple[str, ...] = (),
    v21_router: V21HttpRouter | None = None,
    data_root_resolver=None,
):
    def handler(*args, **kwargs):
        return OpenBexiHandler(
            *args,
            serve_static=serve_static,
            cors_origins=cors_origins,
            v21_router=v21_router,
            data_root_resolver=data_root_resolver,
            **kwargs,
        )

    return handler


def _interval_hours_argument(value: str) -> float:
    try:
        interval = float(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("interval must be a number of hours") from exc
    if not math.isfinite(interval) or interval < 1.0:
        raise argparse.ArgumentTypeError("interval must be at least 1 hour")
    return interval


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve OpenBEXI Earth Orbit locally with API endpoints.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host. Default: 127.0.0.1")
    parser.add_argument("--port", default=8000, type=int, help="Bind port. Default: 8000")
    parser.add_argument(
        "--allow-public",
        action="store_true",
        help="Acknowledge non-loopback exposure. Required when --host is not loopback.",
    )
    parser.add_argument(
        "--cors-origin",
        action="append",
        default=[],
        metavar="ORIGIN",
        help=(
            "Allow an additional exact CORS origin. Loopback HTTP(S) origins are allowed by default. "
            "Use '*' only for an intentionally public read-only deployment."
        ),
    )
    parser.add_argument(
        "--no-static",
        action="store_true",
        help="Disable serving index.html and static repository files.",
    )
    parser.add_argument(
        "--update-data-on-schedule",
        action="store_true",
        help="Enable background GP/OMM, TLE, SATCAT, tracked, launch, decay, and reconciliation cycles.",
    )
    parser.add_argument(
        "--no-data-update",
        action="store_true",
        help="Disable background data updates even if scheduling flags are present.",
    )
    parser.add_argument(
        "--data-update-interval-hours",
        default=DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
        type=_interval_hours_argument,
        help="Fallback minimum age for scheduled datasets. Default: 24.",
    )
    parser.add_argument(
        "--gp-update-interval-hours",
        default=None,
        type=_interval_hours_argument,
        help="GP/OMM update interval. Defaults to --data-update-interval-hours.",
    )
    parser.add_argument(
        "--tle-update-interval-hours",
        default=None,
        type=_interval_hours_argument,
        help="Deprecated compatibility TLE update interval. Defaults to --data-update-interval-hours.",
    )
    parser.add_argument(
        "--satcat-update-interval-hours",
        default=None,
        type=_interval_hours_argument,
        help="SATCAT, launch, and confirmed-decay update interval. Defaults to --data-update-interval-hours.",
    )
    parser.add_argument(
        "--tracked-update-interval-hours",
        default=None,
        type=_interval_hours_argument,
        help="Tracked-object catalog rebuild interval. Defaults to --satcat-update-interval-hours.",
    )
    parser.add_argument(
        "--reconciliation-interval-hours",
        default=DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
        type=_interval_hours_argument,
        help="Complete-source reconciliation interval. Default: 24.",
    )
    parser.add_argument(
        "--runtime-dir",
        default="runtime",
        help="Private v2.1 database and job-artifact directory. Default: runtime.",
    )
    parser.add_argument(
        "--no-v21-service",
        action="store_true",
        help="Disable the optional authenticated API v1 screening service.",
    )
    args = parser.parse_args(argv)
    if not is_loopback_host(args.host) and not args.allow_public:
        parser.error("non-loopback --host requires --allow-public")
    return args


def main() -> None:
    args = parse_args()
    cors_origins = tuple(origin.rstrip("/") for origin in args.cors_origin if origin)
    runtime_root = (ROOT / args.runtime_dir).resolve()
    if ROOT != runtime_root and ROOT not in runtime_root.parents:
        raise RuntimeError("--runtime-dir must resolve inside the project root")
    if runtime_root == ROOT / "json" or ROOT / "json" in runtime_root.parents:
        raise RuntimeError("--runtime-dir must not resolve inside the published json closure")
    runtime_root.mkdir(parents=True, exist_ok=True)
    data_plane = (
        SatelliteDataPlane(repository_root=ROOT, state_root=runtime_root / "data-plane")
        if SatelliteDataPlane is not None
        else None
    )
    if data_plane:
        v21_registered_data_root, v21_registered_pointer_identity = _selected_data_plane_root(data_plane)
    else:
        v21_registered_data_root = ROOT
        v21_registered_pointer_identity = None
    v21_service = None
    v21_store = None
    v21_router = None
    if not args.no_v21_service:
        try:
            feature_flag = load_server_feature_flag(
                ROOT,
                "experimental_full_catalog_screening",
            )
            v21_store = JobStore(runtime_root / "openbexi-v21.sqlite3")
            manager = ScreeningJobManager(
                root=ROOT,
                runtime_root=runtime_root,
                store=v21_store,
            )
            v21_service = V21ApiService(
                root=v21_registered_data_root,
                runtime_root=runtime_root,
                store=v21_store,
                feature_flag=feature_flag,
                authenticator=configured_authenticator(),
                cursor_secret=_private_cursor_secret(runtime_root),
                manager=manager,
            )
            v21_service.start()
            v21_router = V21HttpRouter(v21_service)
        except Exception as exc:
            if v21_service:
                v21_service.stop()
            if v21_store:
                v21_store.close()
            v21_service = None
            v21_store = None
            print(f"API v1 screening service unavailable: {exc}")
    register_v21_data_root = None
    if v21_service:
        def register_v21_data_root(selected_data_root: Path) -> None:
            previous_data_root = v21_service.root
            v21_service.root = selected_data_root
            try:
                v21_service.bootstrap_bundled_catalog()
            except Exception:
                v21_service.root = previous_data_root
                raise

    data_selection = (
        DataSelectionCoordinator(
            data_plane=data_plane,
            registered_root=v21_registered_data_root,
            registered_pointer_identity=v21_registered_pointer_identity,
            on_selected=register_v21_data_root,
        )
        if data_plane and v21_registered_pointer_identity is not None
        else None
    )
    server = ThreadingHTTPServer(
        (args.host, args.port),
        make_handler(
            serve_static=not args.no_static,
            cors_origins=cors_origins,
            v21_router=v21_router,
            data_root_resolver=data_selection.resolve if data_selection else None,
        ),
    )
    scheduler = None
    if args.update_data_on_schedule and not args.no_data_update:
        on_data_promoted = None
        if v21_service and data_selection:
            def on_data_promoted() -> tuple[str, ...]:
                _selected_data_root, selected_pointer_identity = data_selection.synchronize()
                return selected_pointer_identity

        scheduler = DataUpdateScheduler(
            interval_hours=args.data_update_interval_hours,
            gp_interval_hours=args.gp_update_interval_hours,
            tle_interval_hours=args.tle_update_interval_hours,
            satcat_interval_hours=args.satcat_update_interval_hours,
            tracked_interval_hours=args.tracked_update_interval_hours,
            reconciliation_interval_hours=args.reconciliation_interval_hours,
            data_plane=data_plane,
            on_updated=on_data_promoted,
            registered_pointer_identity=(
                data_selection.registered_pointer_identity if data_selection else None
            ),
        )
        scheduler.start()
    else:
        _set_data_update_status(
            enabled=False,
            running=False,
            worker_alive=False,
            state="disabled",
            interval_hours=args.data_update_interval_hours,
            intervals_hours={
                "gp": args.gp_update_interval_hours or args.data_update_interval_hours,
                "tle": args.tle_update_interval_hours or args.data_update_interval_hours,
                "satcat": args.satcat_update_interval_hours or args.data_update_interval_hours,
                "tracked": (
                    args.tracked_update_interval_hours
                    or args.satcat_update_interval_hours
                    or args.data_update_interval_hours
                ),
                "reconciliation": args.reconciliation_interval_hours,
            },
            dataset_status={},
            consecutive_failures=0,
            retry_delay_seconds=None,
            next_check_at=None,
            stop_requested=False,
            shutdown_timed_out=False,
            last_errors=[],
            tool_available=maybe_update_satellite_data is not None,
            import_error=DATA_TOOL_IMPORT_ERROR,
        )
    url = f"http://{args.host}:{args.port}"
    print(f"OpenBEXI Earth Orbit server {APP_VERSION} listening on {url}")
    print(f"App:  {url}/index.html")
    print(f"Docs: {url}/docs")
    if v21_service:
        auth_state = "configured" if v21_service.authenticator.configured else "not configured"
        print(f"API v1: {url}/api/v1/capabilities (bearer credentials {auth_state})")
    else:
        print("API v1: disabled or unavailable")
    if scheduler:
        intervals = scheduler.intervals_hours
        print(
            "Data updates: enabled "
            f"(GP {intervals['gp']:g}h, TLE {intervals['tle']:g}h, "
            f"SATCAT {intervals['satcat']:g}h, tracked {intervals.get('tracked', intervals['satcat']):g}h, "
            f"reconciliation {intervals['reconciliation']:g}h)"
        )
    else:
        print("Data updates: disabled")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping OpenBEXI server.")
    finally:
        if scheduler:
            scheduler.stop()
        if v21_service:
            v21_service.stop()
        server.server_close()
        if v21_store:
            v21_store.close()


if __name__ == "__main__":
    main()
