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
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
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

try:
    from tools.satellite_data_tools import (
        DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
        maybe_update_satellite_data,
    )
except Exception as exc:  # pragma: no cover - exposed through /api/data-update-status
    DEFAULT_SERVER_UPDATE_INTERVAL_HOURS = 24.0
    maybe_update_satellite_data = None
    DATA_TOOL_IMPORT_ERROR = str(exc)
else:
    DATA_TOOL_IMPORT_ERROR = None


DATA_UPDATE_STATUS_LOCK = threading.Lock()
DATA_UPDATE_ERROR_MAX_LENGTH = 1000
DATA_UPDATE_ERROR_MAX_ITEMS = 10
DATA_UPDATE_RESULT_MAX_DEPTH = 8
DATA_UPDATE_RESULT_MAX_ITEMS = 100
DATASET_STATUS_METADATA_NAMES = {
    "gp": "gp",
    "tle": "tle",
    "satcat": "satcat",
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


def _data_update_status_snapshot() -> dict[str, object]:
    with DATA_UPDATE_STATUS_LOCK:
        snapshot = dict(DATA_UPDATE_STATUS)
    health = _catalog_data_health(ROOT)
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
        payload = json.loads(path.read_text(encoding="utf-8"))
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
) -> str:
    components = {
        "decay_revision": decay,
        "gp_revision": gp,
        "launch_revision": launch,
        "satcat_revision": satcat,
        "tle_revision": tle,
    }
    canonical = json.dumps(components, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return f"sha256:{hashlib.sha256(canonical).hexdigest()}"


def _catalog_artifact_available(path: Path) -> bool:
    try:
        return path.is_file() and path.stat().st_size > 2
    except OSError:
        return False


def _catalog_data_health(root: Path) -> dict[str, object]:
    gp_meta = _load_metadata(root / "json" / "gp" / "GP.meta.json")
    launch_meta = _load_metadata(root / "json" / "launches" / "launches.meta.json")
    decay_meta = _load_metadata(root / "json" / "decayed" / "decayed.meta.json")
    satcat_meta = _load_metadata(root / "json" / "satcat.meta.json")
    tle_meta = _load_metadata(root / "json" / "tle" / "TLE.meta.json")
    dataset_metas = (gp_meta, tle_meta, satcat_meta, launch_meta, decay_meta)
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
    elif primary_errors or primary_statuses.intersection({"failed", "failure", "partial", "degraded", "error"}):
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
    last_reconciled_at = _newest_timestamp(
        [
            value
            for meta in (gp_meta, tle_meta, satcat_meta, launch_meta, decay_meta)
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
        ),
        "catalog_revision": gp_revision,
        "gp_revision": gp_revision,
        "launch_revision": launch_revision,
        "decay_revision": decay_revision,
        "tle_revision": tle_revision,
        "satcat_revision": satcat_revision,
        "datasets": {
            "gp": {"revision": gp_revision, **_metadata_dataset_history(gp_meta)},
            "launch": {"revision": launch_revision, **_metadata_dataset_history(launch_meta)},
            "decay": {"revision": decay_revision, **_metadata_dataset_history(decay_meta)},
            "tle": {"revision": tle_revision, **_metadata_dataset_history(tle_meta)},
            "satcat": {"revision": satcat_revision, **_metadata_dataset_history(satcat_meta)},
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
        "last_error": primary_errors[0] if primary_errors else None,
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
    resolved_parts = () if candidate == ROOT else candidate.relative_to(ROOT).parts
    return _static_path_parts_are_allowed(request_parts) and _static_path_parts_are_allowed(resolved_parts)


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


class DataUpdateScheduler:
    def __init__(
        self,
        *,
        interval_hours: float = DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
        gp_interval_hours: float | None = None,
        tle_interval_hours: float | None = None,
        satcat_interval_hours: float | None = None,
        reconciliation_interval_hours: float = DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
        on_updated=None,
        initial_delay_seconds: float = 1.0,
        failure_backoff_base_seconds: float = 300.0,
        failure_backoff_cap_seconds: float = 21_600.0,
        jitter=None,
        clock=None,
    ):
        self.interval_hours = max(1.0, float(interval_hours))
        self.intervals_hours = {
            "gp": max(1.0, float(gp_interval_hours if gp_interval_hours is not None else self.interval_hours)),
            "tle": max(1.0, float(tle_interval_hours if tle_interval_hours is not None else self.interval_hours)),
            "satcat": max(1.0, float(satcat_interval_hours if satcat_interval_hours is not None else self.interval_hours)),
            "reconciliation": max(1.0, float(reconciliation_interval_hours)),
        }
        self.on_updated = on_updated
        self.initial_delay_seconds = max(0.0, float(initial_delay_seconds))
        self.failure_backoff_base_seconds = max(60.0, float(failure_backoff_base_seconds))
        self.failure_backoff_cap_seconds = max(
            self.failure_backoff_base_seconds,
            float(failure_backoff_cap_seconds),
        )
        self.jitter = jitter or random.uniform
        self.clock = clock or time.time
        self.consecutive_failures = 0
        self.last_result: dict[str, object] | None = None
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._run, name="openbexi-data-update", daemon=True)

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
        if maybe_update_satellite_data is None:
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
            result = maybe_update_satellite_data(
                root=ROOT,
                interval_hours=self.interval_hours,
                gp_interval_hours=self.intervals_hours["gp"],
                tle_interval_hours=self.intervals_hours["tle"],
                satcat_interval_hours=self.intervals_hours["satcat"],
                reconciliation_interval_hours=self.intervals_hours["reconciliation"],
            )
            if not isinstance(result, dict):
                raise TypeError("Satellite data update returned a non-object result.")
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
        gp_result = result.get("gp")
        tle_result = result.get("tle")
        catalog_changed = (
            isinstance(gp_result, dict) and gp_result.get("changed") is True
        ) or (
            isinstance(tle_result, dict) and tle_result.get("changed") is True
        )
        if self.on_updated is not None and catalog_changed:
            try:
                self.on_updated()
            except Exception as exc:
                registration_error = str(exc)
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
            for name in ("gp", "tle", "satcat", "launches", "decayed", "reconciliation")
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
        **kwargs,
    ):
        self.serve_static = serve_static
        self.cors_origins = tuple(origin.rstrip("/") for origin in cors_origins if origin)
        self.v21_router = v21_router
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

    def _handle_api(self, *, head_only: bool) -> bool:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        host = safe_request_host(self.headers.get("Host"), self.server.server_port)

        if path.startswith("/api/v1"):
            if self.v21_router is not None:
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
                self._send_json_file(ROOT / "json" / "gp" / "GP.json", head_only=head_only)
                return True
            if path == "/api/gp-metadata":
                self._send_json_file(ROOT / "json" / "gp" / "GP.meta.json", head_only=head_only)
                return True
            if path == "/api/tle":
                self._send_json_file(ROOT / "json" / "tle" / "TLE.json", head_only=head_only)
                return True
            if path == "/api/satellites":
                self._send_json_file(_preferred_catalog_path(), head_only=head_only)
                return True
            if path == "/api/launches":
                self._send_json_file(ROOT / "json" / "launches" / "launches.json", head_only=head_only)
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
                self._send_json_file(ROOT / "json" / "decayed" / "decayed.json", head_only=head_only)
                return True
            if path == "/api/data-update-status":
                self._send_json(_data_update_status_snapshot(), head_only=head_only)
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
):
    def handler(*args, **kwargs):
        return OpenBexiHandler(
            *args,
            serve_static=serve_static,
            cors_origins=cors_origins,
            v21_router=v21_router,
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
        help="Enable background GP/OMM, TLE, SATCAT, launch, decay, and reconciliation cycles.",
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
    v21_service = None
    v21_store = None
    v21_router = None
    if not args.no_v21_service:
        try:
            runtime_root = (ROOT / args.runtime_dir).resolve()
            if ROOT != runtime_root and ROOT not in runtime_root.parents:
                raise RuntimeError("--runtime-dir must resolve inside the project root")
            runtime_root.mkdir(parents=True, exist_ok=True)
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
                root=ROOT,
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
    server = ThreadingHTTPServer(
        (args.host, args.port),
        make_handler(
            serve_static=not args.no_static,
            cors_origins=cors_origins,
            v21_router=v21_router,
        ),
    )
    scheduler = None
    if args.update_data_on_schedule and not args.no_data_update:
        scheduler = DataUpdateScheduler(
            interval_hours=args.data_update_interval_hours,
            gp_interval_hours=args.gp_update_interval_hours,
            tle_interval_hours=args.tle_update_interval_hours,
            satcat_interval_hours=args.satcat_update_interval_hours,
            reconciliation_interval_hours=args.reconciliation_interval_hours,
            on_updated=v21_service.bootstrap_bundled_catalog if v21_service else None,
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
            f"SATCAT {intervals['satcat']:g}h, reconciliation {intervals['reconciliation']:g}h)"
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
