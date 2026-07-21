#!/usr/bin/env python3
"""Local OpenBEXI Earth Orbit server.

The server intentionally uses only the Python standard library so the existing
static app can gain local API and OpenAPI documentation without adding a
mandatory Python dependency installation step.
"""

from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import mimetypes
import os
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
DATA_UPDATE_STATUS: dict[str, object] = {
    "enabled": False,
    "state": "disabled",
    "interval_hours": DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
    "last_result": None,
    "last_error": None,
}


def _set_data_update_status(**updates: object) -> None:
    with DATA_UPDATE_STATUS_LOCK:
        DATA_UPDATE_STATUS.update(updates)


def _data_update_status_snapshot() -> dict[str, object]:
    with DATA_UPDATE_STATUS_LOCK:
        return dict(DATA_UPDATE_STATUS)


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
        on_updated=None,
    ):
        self.interval_hours = max(1.0, float(interval_hours))
        self.on_updated = on_updated
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._run, name="openbexi-data-update", daemon=True)

    def start(self) -> None:
        _set_data_update_status(
            enabled=True,
            state="scheduled",
            interval_hours=self.interval_hours,
            tool_available=maybe_update_satellite_data is not None,
            import_error=DATA_TOOL_IMPORT_ERROR,
        )
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        if self.thread.is_alive():
            self.thread.join(timeout=2.0)

    def _run(self) -> None:
        if self.stop_event.wait(1.0):
            return
        while not self.stop_event.is_set():
            self.run_once()
            sleep_seconds = min(3600.0, max(60.0, self.interval_hours * 3600.0 / 4.0))
            self.stop_event.wait(sleep_seconds)

    def run_once(self) -> None:
        if maybe_update_satellite_data is None:
            _set_data_update_status(state="unavailable", last_error=DATA_TOOL_IMPORT_ERROR)
            return
        _set_data_update_status(state="checking", last_started_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        try:
            result = maybe_update_satellite_data(root=ROOT, interval_hours=self.interval_hours)
        except Exception as exc:
            _set_data_update_status(
                state="failed",
                last_error=str(exc),
                last_finished_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            )
            return
        state = "skipped" if result.get("skipped") else "succeeded"
        registration_error = None
        if state == "succeeded" and self.on_updated is not None:
            try:
                self.on_updated()
            except Exception as exc:
                registration_error = str(exc)
                state = "degraded"
        _set_data_update_status(
            state=state,
            last_result=result,
            last_error=registration_error,
            last_finished_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        )


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
                "TLE data, metadata, and health/status checks."
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
                    "summary": "Load the TLE dataset used by the frontend",
                    "responses": {
                        "200": {
                            "description": "TLE satellite records",
                            "content": {"application/json": {"schema": json_array_schema}},
                        }
                    },
                }
            },
            "/api/satellites": {
                "get": {
                    "summary": "Alias for the current satellite/TLE dataset",
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
            if path in {"/api/tle", "/api/satellites"}:
                self._send_json_file(ROOT / "json" / "tle" / "TLE.json", head_only=head_only)
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


def parse_args() -> argparse.Namespace:
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
        help="Enable background TLE/decayed-data updates after freshness checks.",
    )
    parser.add_argument(
        "--no-data-update",
        action="store_true",
        help="Disable background data updates even if scheduling flags are present.",
    )
    parser.add_argument(
        "--data-update-interval-hours",
        default=DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
        type=float,
        help="Minimum age before scheduled data updates run. Default: 24.",
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
    args = parser.parse_args()
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
            on_updated=v21_service.bootstrap_bundled_catalog if v21_service else None,
        )
        scheduler.start()
    else:
        _set_data_update_status(
            enabled=False,
            state="disabled",
            interval_hours=args.data_update_interval_hours,
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
        print(f"Data updates: enabled every {args.data_update_interval_hours:g} hours after freshness checks")
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
