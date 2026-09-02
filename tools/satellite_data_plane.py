#!/usr/bin/env python3
"""Revisioned, private staging and promotion for mutable satellite data."""

from __future__ import annotations

import contextlib
import datetime as dt
import hashlib
import json
import os
import re
import secrets
import shutil
import stat
import threading
from pathlib import Path
from typing import Callable, ContextManager

from tools import satellite_data_tools as data_tools


DATA_PLANE_SCHEMA_VERSION = "1.0.0"
CANDIDATE_METADATA_NAME = ".openbexi-candidate.json"
CURRENT_POINTER_NAME = "current.json"
DATA_PLANE_LOCK_NAME = ".promotion.lock"
CANDIDATE_RETENTION = 8
VALIDATION_CACHE_SIZE = 16
CANDIDATE_ID_PATTERN = re.compile(r"^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$")

CORE_DATA_PATHS = (
    data_tools.GP_RELATIVE_PATH,
    data_tools.GP_META_RELATIVE_PATH,
    data_tools.TLE_RELATIVE_PATH,
    data_tools.TLE_META_RELATIVE_PATH,
    data_tools.SATCAT_RELATIVE_PATH,
    data_tools.SATCAT_META_RELATIVE_PATH,
    data_tools.LAUNCHES_RELATIVE_PATH,
    data_tools.LAUNCHES_META_RELATIVE_PATH,
    data_tools.DECAYED_RELATIVE_PATH,
    data_tools.DECAYED_META_RELATIVE_PATH,
    data_tools.TRACKED_MANIFEST_RELATIVE_PATH,
    data_tools.TRACKED_META_RELATIVE_PATH,
)
OPTIONAL_SEED_PATHS = (data_tools.LAUNCH_DATES_RELATIVE_PATH,)
JSON_ARRAY_PATHS = {
    data_tools.GP_RELATIVE_PATH,
    data_tools.TLE_RELATIVE_PATH,
    data_tools.LAUNCHES_RELATIVE_PATH,
}
JSON_OBJECT_PATHS = {
    data_tools.DECAYED_RELATIVE_PATH,
    data_tools.GP_META_RELATIVE_PATH,
    data_tools.TLE_META_RELATIVE_PATH,
    data_tools.SATCAT_META_RELATIVE_PATH,
    data_tools.LAUNCHES_META_RELATIVE_PATH,
    data_tools.DECAYED_META_RELATIVE_PATH,
    data_tools.TRACKED_MANIFEST_RELATIVE_PATH,
    data_tools.TRACKED_META_RELATIVE_PATH,
}
REVISION_PAIRS = (
    ("gp", data_tools.GP_RELATIVE_PATH, data_tools.GP_META_RELATIVE_PATH),
    ("tle", data_tools.TLE_RELATIVE_PATH, data_tools.TLE_META_RELATIVE_PATH),
    ("satcat", data_tools.SATCAT_RELATIVE_PATH, data_tools.SATCAT_META_RELATIVE_PATH),
    ("launches", data_tools.LAUNCHES_RELATIVE_PATH, data_tools.LAUNCHES_META_RELATIVE_PATH),
    ("decayed", data_tools.DECAYED_RELATIVE_PATH, data_tools.DECAYED_META_RELATIVE_PATH),
)
TRACKED_COUNT_KEYS = (
    "current",
    "historical",
    "absent",
    "history_total",
    "total",
    "propagatable",
    "metadata_only",
    "current_propagatable",
    "current_metadata_only",
)
TRACKED_ROW_ACCOUNTING_KEYS = (
    "received",
    "accepted",
    "quarantined",
    "duplicates",
    "issues",
    "expected",
    "expected_provider_records",
)


class DataPlaneError(data_tools.SatelliteDataError):
    """Raised when a candidate cannot be safely staged or promoted."""


class DataPlaneCancelled(DataPlaneError):
    """Raised when cooperative cancellation prevents candidate promotion."""


def _sha256_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def _stat_identity(path: Path) -> tuple[int, int, int, int, int]:
    value = path.stat()
    return (value.st_size, value.st_mtime_ns, value.st_ctime_ns, value.st_ino, value.st_mode)


def _canonical_revision(value: object) -> str:
    body = json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return _sha256_bytes(body)


def _safe_candidate_id(candidate_id: object) -> str:
    value = str(candidate_id or "").strip()
    if not CANDIDATE_ID_PATTERN.fullmatch(value):
        raise DataPlaneError("Candidate id is invalid.")
    return value


def _candidate_path(state_root: Path, candidate_id: object) -> Path:
    value = _safe_candidate_id(candidate_id)
    state_root = state_root.resolve()
    raw_candidates_root = state_root / "candidates"
    if raw_candidates_root.is_symlink():
        raise DataPlaneError("Candidate directory may not be a symlink.")
    candidates_root = raw_candidates_root.resolve()
    if state_root not in candidates_root.parents:
        raise DataPlaneError("Candidate directory escapes the data-plane root.")
    raw_candidate_root = candidates_root / value
    if raw_candidate_root.is_symlink():
        raise DataPlaneError("Candidate path may not be a symlink.")
    candidate_root = raw_candidate_root.resolve()
    if candidate_root.parent != candidates_root:
        raise DataPlaneError("Candidate path escapes the data-plane root.")
    return candidate_root


def _read_json_object(
    path: Path,
    *,
    canonical_nonnegative_integers: bool = False,
) -> dict[str, object]:
    if path.is_symlink():
        raise DataPlaneError(f"JSON object may not be a symlink: {path.name}")
    try:
        value = data_tools.strict_json_loads(
            path.read_bytes(),
            canonical_nonnegative_integers=canonical_nonnegative_integers,
        )
    except (OSError, UnicodeDecodeError, ValueError, TypeError) as exc:
        raise DataPlaneError(f"Invalid JSON object at {path.name}: {exc}") from exc
    if not isinstance(value, dict):
        raise DataPlaneError(f"Expected a JSON object at {path.name}.")
    return value


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


def _check_cancelled(cancel_requested: Callable[[], bool] | None) -> None:
    if cancel_requested is not None and cancel_requested():
        raise DataPlaneCancelled("Satellite data candidate operation was cancelled before promotion.")


def _acquire_os_file_lock(descriptor: int) -> bool:
    os.lseek(descriptor, 0, os.SEEK_SET)
    if os.name == "nt":
        import msvcrt

        try:
            msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
        except OSError:
            return False
    else:
        import fcntl

        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (BlockingIOError, OSError):
            return False
    return True


def _release_os_file_lock(descriptor: int) -> None:
    os.lseek(descriptor, 0, os.SEEK_SET)
    if os.name == "nt":
        import msvcrt

        msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)
    else:
        import fcntl

        fcntl.flock(descriptor, fcntl.LOCK_UN)


@contextlib.contextmanager
def _data_plane_lock(state_root: Path):
    state_root.mkdir(parents=True, exist_ok=True)
    lock_path = state_root / DATA_PLANE_LOCK_NAME
    if lock_path.is_symlink():
        raise DataPlaneError("Candidate promotion lock may not be a symlink.")
    flags = os.O_CREAT | os.O_RDWR | getattr(os, "O_BINARY", 0) | getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(str(lock_path), flags, 0o600)
        descriptor_stat = os.fstat(descriptor)
        path_stat = os.stat(lock_path, follow_symlinks=False)
        if not stat.S_ISREG(descriptor_stat.st_mode) or not os.path.samestat(descriptor_stat, path_stat):
            raise DataPlaneError("Candidate promotion lock is not a stable regular file.")
        if not _acquire_os_file_lock(descriptor):
            raise DataPlaneError("Another candidate stage or promotion is already running.")
    except Exception:
        if "descriptor" in locals():
            os.close(descriptor)
        raise
    try:
        owner = f"{os.getpid()} {data_tools.isoformat_utc()}\n".encode("utf-8")
        os.lseek(descriptor, 0, os.SEEK_SET)
        os.write(descriptor, owner)
        os.ftruncate(descriptor, len(owner))
        os.fsync(descriptor)
        yield
    finally:
        try:
            _release_os_file_lock(descriptor)
        finally:
            os.close(descriptor)


def _copy_file(source: Path, target: Path) -> None:
    if source.is_symlink():
        raise DataPlaneError(f"Candidate seed may not contain symlinks: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    target.chmod(target.stat().st_mode | stat.S_IWUSR)


def _resolve_regular_artifact(root: Path, relative: Path | str) -> Path:
    root = root.resolve()
    relative_path = Path(relative)
    if relative_path.is_absolute() or not relative_path.parts or ".." in relative_path.parts:
        raise DataPlaneError(f"Candidate artifact path is unsafe: {relative_path.as_posix()}")
    candidate = root
    for part in relative_path.parts:
        candidate /= part
        if candidate.is_symlink():
            raise DataPlaneError(f"Candidate artifact may not use symlinks: {relative_path.as_posix()}")
    resolved = candidate.resolve()
    if root not in resolved.parents or not resolved.is_file():
        raise DataPlaneError(f"Candidate artifact is missing or unsafe: {relative_path.as_posix()}")
    return resolved


def _tracked_closure_paths(root: Path) -> list[Path]:
    manifest_path = root / data_tools.TRACKED_MANIFEST_RELATIVE_PATH
    manifest = _read_json_object(
        manifest_path,
        canonical_nonnegative_integers=True,
    )
    descriptors = [
        item
        for name in ("chunks", "history_chunks")
        for item in manifest.get(name, [])
        if isinstance(item, dict)
    ]
    quarantine = manifest.get("quarantine")
    if isinstance(quarantine, dict):
        descriptors.append(quarantine)
    tracked_root = (root / data_tools.TRACKED_DIRECTORY_RELATIVE_PATH).resolve()
    paths: list[Path] = []
    for descriptor in descriptors:
        raw_path = descriptor.get("path")
        if not isinstance(raw_path, str) or not raw_path.strip():
            raise DataPlaneError("Tracked manifest closure contains an invalid path.")
        path = _resolve_regular_artifact(root, Path(raw_path))
        if path.suffix.lower() != ".json" or tracked_root not in path.parents:
            raise DataPlaneError("Tracked manifest closure contains an unsafe path.")
        paths.append(path)
    return paths


def seed_candidate_root(source_root: Path | str, candidate_root: Path | str) -> list[str]:
    """Clone only update inputs and the current tracked closure into a private root."""

    source = Path(source_root).resolve()
    target = Path(candidate_root).resolve()
    if source == target or target in source.parents:
        raise DataPlaneError("Candidate root must be separate from its source data root.")
    if target.exists():
        raise DataPlaneError("Candidate root already exists.")
    target.mkdir(parents=True)
    relative_paths = list(CORE_DATA_PATHS)
    relative_paths.extend(path for path in OPTIONAL_SEED_PATHS if (source / path).is_file())
    relative_paths.extend(path.relative_to(source) for path in _tracked_closure_paths(source))
    copied: list[str] = []
    try:
        for relative in dict.fromkeys(relative_paths):
            source_path = _resolve_regular_artifact(source, relative)
            _copy_file(source_path, target / relative)
            copied.append(relative.as_posix())
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise
    return copied


def _load_candidate_payload(path: Path, relative: Path) -> object:
    try:
        value = data_tools.strict_json_loads(
            path.read_bytes(),
            canonical_nonnegative_integers=relative
            in {
                data_tools.TRACKED_MANIFEST_RELATIVE_PATH,
                data_tools.TRACKED_META_RELATIVE_PATH,
            },
        )
    except (OSError, UnicodeDecodeError, ValueError, TypeError) as exc:
        raise DataPlaneError(f"Invalid JSON at {relative.as_posix()}: {exc}") from exc
    if relative in JSON_ARRAY_PATHS and not isinstance(value, list):
        raise DataPlaneError(f"Expected a JSON array at {relative.as_posix()}.")
    if relative in JSON_OBJECT_PATHS and not isinstance(value, dict):
        raise DataPlaneError(f"Expected a JSON object at {relative.as_posix()}.")
    return value


def _raw_inventory(root: Path, relative_paths: list[Path | str]) -> dict[str, object]:
    """Inventory copied bytes without requiring their data formats to be valid."""

    artifacts: list[dict[str, object]] = []
    relative_values = sorted(
        {Path(value).as_posix() for value in relative_paths},
    )
    for relative_value in relative_values:
        relative = Path(relative_value)
        path = _resolve_regular_artifact(root, relative)
        body = path.read_bytes()
        artifacts.append({
            "path": relative_value,
            "bytes": len(body),
            "sha256": _sha256_bytes(body),
        })
    return {
        "candidate_revision": _canonical_revision(artifacts),
        "artifact_count": len(artifacts),
        "total_bytes": sum(int(item["bytes"]) for item in artifacts),
        "artifacts": artifacts,
    }


def _validate_revision_pair(root: Path, label: str, data_path: Path, metadata_path: Path) -> None:
    body = (root / data_path).read_bytes()
    metadata = _read_json_object(root / metadata_path)
    if data_path == data_tools.SATCAT_RELATIVE_PATH:
        try:
            actual = data_tools.catalog_revision_for_text(body.decode("utf-8"))
        except UnicodeDecodeError as exc:
            raise DataPlaneError("satcat bytes are not valid UTF-8.") from exc
    else:
        try:
            payload = data_tools.strict_json_loads(body)
        except (UnicodeDecodeError, ValueError, TypeError) as exc:
            raise DataPlaneError(f"{label} bytes are not valid JSON.") from exc
        actual = data_tools.catalog_revision_for_payload(payload)
    if metadata.get("catalog_revision") != actual or metadata.get("dataset_hash") != actual:
        raise DataPlaneError(f"{label} bytes do not match catalog_revision and dataset_hash.")


def _validate_tracked_descriptor_contract(
    manifest: dict[str, object],
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    if not re.match(r"^2\.3(?:\.|$)", str(manifest.get("schema_version") or "")):
        raise DataPlaneError("Tracked manifest must use the Version 2.3 schema.")
    chunks = manifest.get("chunks")
    history_chunks = manifest.get("history_chunks")
    quarantine = manifest.get("quarantine")
    if not isinstance(chunks, list) or not isinstance(history_chunks, list) or not isinstance(quarantine, dict):
        raise DataPlaneError("Tracked manifest descriptor collections are invalid.")
    if not all(isinstance(item, dict) for item in chunks + history_chunks):
        raise DataPlaneError("Tracked manifest contains an invalid chunk descriptor.")
    collection_descriptors = [*chunks, *history_chunks]
    descriptor_ids = [descriptor.get("id") for descriptor in collection_descriptors]
    if (
        any(not isinstance(value, str) or not value.strip() for value in descriptor_ids)
        or len(descriptor_ids) != len(set(descriptor_ids))
    ):
        raise DataPlaneError("Tracked manifest chunk descriptor ids must be nonempty and unique.")
    for descriptors, expected_scope in (
        (chunks, "CURRENT"),
        (history_chunks, "HISTORICAL"),
    ):
        if any(
            descriptor.get("scope") != expected_scope
            or descriptor.get("object_type") not in data_tools.TRACKED_OBJECT_TYPES
            for descriptor in descriptors
        ):
            raise DataPlaneError("Tracked manifest chunk descriptor taxonomy is invalid.")
    descriptors = [*collection_descriptors, quarantine]
    paths = [descriptor.get("path") for descriptor in descriptors]
    if (
        any(not isinstance(path, str) or not path for path in paths)
        or len(paths) != len(set(paths))
        or not str(quarantine.get("path")).endswith("-quarantine.json")
    ):
        raise DataPlaneError("Tracked manifest chunk paths are invalid or duplicated.")
    if any(
        not data_tools.tracked_descriptor_content_address_is_valid(descriptor)
        for descriptor in descriptors
    ):
        raise DataPlaneError(
            "Tracked manifest chunks must use content-addressed names bound to exact SHA-256 digests."
        )
    if any(
        not data_tools.is_nonnegative_safe_json_integer(descriptor.get(key))
        for descriptor in descriptors
        for key in ("count", "bytes")
    ):
        raise DataPlaneError("Tracked manifest descriptor counts and byte lengths are invalid.")
    return chunks, history_chunks


def _validate_tracked_lineage(root: Path) -> None:
    manifest_path = root / data_tools.TRACKED_MANIFEST_RELATIVE_PATH
    manifest = _read_json_object(
        manifest_path,
        canonical_nonnegative_integers=True,
    )
    chunks, history_chunks = _validate_tracked_descriptor_contract(manifest)
    try:
        computed_coverage_revision = data_tools.tracked_coverage_revision_for_manifest(manifest)
    except data_tools.SatelliteDataError as exc:
        raise DataPlaneError("Tracked coverage revision inputs are invalid.") from exc
    if manifest.get("coverage_revision") != computed_coverage_revision:
        raise DataPlaneError("Tracked coverage_revision does not match its recomputed evidence.")
    try:
        computed_catalog_revision = data_tools.tracked_catalog_revision_for_manifest(manifest)
    except data_tools.SatelliteDataError as exc:
        raise DataPlaneError("Tracked catalog revision inputs are invalid.") from exc
    if manifest.get("catalog_revision") != computed_catalog_revision:
        raise DataPlaneError("Tracked catalog_revision does not match its recomputed descriptor closure.")
    if not data_tools._tracked_manifest_is_complete(root, manifest_path):
        raise DataPlaneError("Tracked manifest closure failed hash, byte, record, or scope validation.")
    metadata = _read_json_object(
        root / data_tools.TRACKED_META_RELATIVE_PATH,
        canonical_nonnegative_integers=True,
    )
    if manifest.get("provider_completeness_claim") is not False:
        raise DataPlaneError("Tracked candidate must not claim provider-universe completeness.")
    if metadata.get("provider_completeness_claim") is not False:
        raise DataPlaneError("Tracked metadata must not claim provider-universe completeness.")
    invariants = manifest.get("invariants")
    for key in (
        "provider_coverage_holds",
        "catalog_partition_holds",
        "current_chunk_count_holds",
        "history_chunk_count_holds",
    ):
        if not isinstance(invariants, dict) or invariants.get(key) is not True:
            raise DataPlaneError(f"Tracked invariant is not satisfied: {key}.")
    manifest_counts = manifest.get("counts")
    metadata_counts = metadata.get("counts")
    if not isinstance(manifest_counts, dict) or not isinstance(metadata_counts, dict):
        raise DataPlaneError("Tracked manifest or metadata counts are missing.")
    for key in TRACKED_COUNT_KEYS:
        value = manifest_counts.get(key)
        metadata_value = metadata_counts.get(key)
        if (
            not data_tools.is_nonnegative_safe_json_integer(value)
            or not data_tools.is_nonnegative_safe_json_integer(metadata_value)
            or metadata_value != value
        ):
            raise DataPlaneError(f"Tracked count is invalid or inconsistent: {key}.")
    for key in TRACKED_ROW_ACCOUNTING_KEYS:
        value = manifest_counts.get(key)
        metadata_value = metadata_counts.get(key)
        if key == "expected_provider_records":
            values_are_valid = value is None and metadata_value is None
        elif key == "expected":
            values_are_valid = all(
                item is None or data_tools.is_nonnegative_safe_json_integer(item)
                for item in (value, metadata_value)
            )
        else:
            values_are_valid = all(
                data_tools.is_nonnegative_safe_json_integer(item)
                for item in (value, metadata_value)
            )
        if (
            key not in manifest_counts
            or key not in metadata_counts
            or not values_are_valid
            or metadata_value != value
        ):
            raise DataPlaneError(
                f"Tracked row accounting differs between manifest and metadata: {key}."
            )
    for key in ("object_types", "current_object_types"):
        manifest_map = manifest_counts.get(key)
        metadata_map = metadata_counts.get(key)
        if (
            not isinstance(manifest_map, dict)
            or not isinstance(metadata_map, dict)
            or set(manifest_map) != set(data_tools.TRACKED_OBJECT_TYPES)
            or not _json_values_match_exact(manifest_map, metadata_map)
            or any(
                not data_tools.is_nonnegative_safe_json_integer(value)
                for value in manifest_map.values()
            )
        ):
            raise DataPlaneError(
                f"Tracked object-type counts differ between manifest and metadata: {key}."
            )
    for descriptors, count_key in ((chunks, "current"), (history_chunks, "history_total")):
        descriptor_counts = [descriptor.get("count") for descriptor in descriptors]
        if (
            any(
                not data_tools.is_nonnegative_safe_json_integer(value)
                for value in descriptor_counts
            )
            or sum(descriptor_counts) != manifest_counts[count_key]
        ):
            raise DataPlaneError(f"Tracked {count_key} descriptor counts do not match the manifest.")
    if (
        manifest_counts["total"] != manifest_counts["current"] + manifest_counts["history_total"]
        or manifest_counts["total"]
        != manifest_counts["propagatable"] + manifest_counts["metadata_only"]
        or manifest_counts["current"]
        != manifest_counts["current_propagatable"] + manifest_counts["current_metadata_only"]
        or manifest_counts["historical"] > manifest_counts["history_total"]
        or manifest_counts["absent"] > manifest_counts["history_total"]
    ):
        raise DataPlaneError("Tracked population partitions are inconsistent.")
    if (
        metadata.get("catalog_revision") != computed_catalog_revision
        or metadata.get("dataset_hash") != computed_catalog_revision
    ):
        raise DataPlaneError("Tracked metadata does not match the recomputed catalog revision.")
    coverage_revision = manifest.get("coverage_revision")
    if (
        not isinstance(coverage_revision, str)
        or not data_tools.SHA256_REVISION_PATTERN.fullmatch(coverage_revision)
        or metadata.get("coverage_revision") != coverage_revision
        or not _json_values_match_exact(metadata.get("coverage"), manifest.get("coverage"))
    ):
        raise DataPlaneError("Tracked coverage_revision differs between manifest and metadata.")
    coverage = manifest.get("coverage")
    complete_snapshot = (
        coverage.get("complete_source_snapshot") if isinstance(coverage, dict) else None
    )
    if complete_snapshot is True:
        last_reconciled_at = metadata.get("last_reconciled_at")
        if (
            metadata.get("source_status") != "VERIFIED_SNAPSHOT"
            or metadata.get("last_reconciled_catalog_revision") != computed_catalog_revision
            or not data_tools.producer_utc_timestamp_is_valid(last_reconciled_at)
        ):
            raise DataPlaneError(
                "Tracked complete-snapshot claim is not backed by reconciled metadata."
            )
    elif complete_snapshot is False:
        if metadata.get("source_status") != "PARTIAL":
            raise DataPlaneError(
                "Tracked partial snapshot is not identified as PARTIAL in metadata."
            )
    else:
        raise DataPlaneError("Tracked complete-snapshot evidence is invalid.")
    provenance = manifest.get("provenance")
    provenance = provenance if isinstance(provenance, dict) else {}
    gp_meta = _read_json_object(root / data_tools.GP_META_RELATIVE_PATH)
    satcat_meta = _read_json_object(root / data_tools.SATCAT_META_RELATIVE_PATH)
    gp_revision = gp_meta.get("catalog_revision")
    satcat_revision = satcat_meta.get("catalog_revision")
    if (
        provenance.get("gp_revision") != gp_revision
        or metadata.get("source_gp_revision") != gp_revision
        or provenance.get("satcat_revision") != satcat_revision
        or metadata.get("source_satcat_revision") != satcat_revision
    ):
        raise DataPlaneError("Tracked candidate source revisions are stale or inconsistent.")
    gp_groups = data_tools.gp_catalog_source_groups(gp_meta)
    if provenance.get("gp_source_groups") != gp_groups or metadata.get("source_gp_groups") != gp_groups:
        raise DataPlaneError("Tracked GP source-group provenance is inconsistent.")


def validate_data_root(root: Path | str) -> dict[str, object]:
    """Validate a repository-shaped data root and return its immutable inventory."""

    candidate_root = Path(root).resolve()
    for relative in CORE_DATA_PATHS:
        path = _resolve_regular_artifact(candidate_root, relative)
        if relative != data_tools.SATCAT_RELATIVE_PATH:
            _load_candidate_payload(path, relative)
    for label, data_path, metadata_path in REVISION_PAIRS:
        _validate_revision_pair(candidate_root, label, data_path, metadata_path)
    _validate_tracked_lineage(candidate_root)

    artifact_paths = list(CORE_DATA_PATHS)
    artifact_paths.extend(path.relative_to(candidate_root) for path in _tracked_closure_paths(candidate_root))
    artifact_paths.extend(path for path in OPTIONAL_SEED_PATHS if (candidate_root / path).is_file())
    inventory = _raw_inventory(candidate_root, artifact_paths)
    return {
        "valid": True,
        **inventory,
    }


class SatelliteDataPlane:
    """Manage validated candidates behind one atomic private pointer."""

    def __init__(self, *, repository_root: Path | str, state_root: Path | str):
        self.repository_root = Path(repository_root).resolve()
        self.state_root = Path(state_root).resolve()
        if self.state_root == self.repository_root or self.repository_root not in self.state_root.parents:
            raise DataPlaneError("Data-plane state must resolve inside, but not equal, the repository root.")
        if self.state_root == self.repository_root / "json" or self.repository_root / "json" in self.state_root.parents:
            raise DataPlaneError("Data-plane state must not be stored inside the published json closure.")
        self._validation_cache: dict[tuple[object, ...], bool] = {}
        self._validation_cache_lock = threading.Lock()

    @property
    def pointer_path(self) -> Path:
        return self.state_root / CURRENT_POINTER_NAME

    def pointer(self) -> dict[str, object] | None:
        try:
            pointer = _read_json_object(self.pointer_path)
            candidate_id = _safe_candidate_id(pointer.get("candidate_id"))
            candidate_root = _candidate_path(self.state_root, candidate_id)
            metadata = _read_json_object(candidate_root / CANDIDATE_METADATA_NAME)
            validation = metadata.get("validation")
            if (
                pointer.get("schema_version") != DATA_PLANE_SCHEMA_VERSION
                or pointer.get("state") != "promoted"
                or metadata.get("schema_version") != DATA_PLANE_SCHEMA_VERSION
                or metadata.get("candidate_id") != candidate_id
                or metadata.get("state") != "validated"
                or not isinstance(validation, dict)
                or validation.get("valid") is not True
                or pointer.get("candidate_revision") != validation.get("candidate_revision")
                or pointer.get("artifact_count") != validation.get("artifact_count")
                or pointer.get("total_bytes") != validation.get("total_bytes")
                or not candidate_root.is_dir()
                or not self._verified_validation_inventory(candidate_root, validation)
            ):
                return None
            return pointer
        except (DataPlaneError, OSError):
            return None

    def _verified_validation_inventory(
        self,
        candidate_root: Path,
        validation: dict[str, object],
    ) -> bool:
        artifacts = validation.get("artifacts")
        expected_count = validation.get("artifact_count")
        expected_bytes = validation.get("total_bytes")
        expected_revision = validation.get("candidate_revision")
        if (
            not isinstance(artifacts, list)
            or isinstance(expected_count, bool)
            or not isinstance(expected_count, int)
            or expected_count != len(artifacts)
            or isinstance(expected_bytes, bool)
            or not isinstance(expected_bytes, int)
            or not isinstance(expected_revision, str)
            or _canonical_revision(artifacts) != expected_revision
        ):
            return False
        resolved: list[tuple[Path, dict[str, object], tuple[int, int, int, int, int]]] = []
        seen_paths: set[str] = set()
        total_bytes = 0
        try:
            for item in artifacts:
                if not isinstance(item, dict):
                    return False
                raw_path = item.get("path")
                size = item.get("bytes")
                digest = item.get("sha256")
                if (
                    not isinstance(raw_path, str)
                    or raw_path in seen_paths
                    or isinstance(size, bool)
                    or not isinstance(size, int)
                    or size < 0
                    or not isinstance(digest, str)
                    or not re.fullmatch(r"sha256:[a-f0-9]{64}", digest)
                ):
                    return False
                path = _resolve_regular_artifact(candidate_root, Path(raw_path))
                identity = _stat_identity(path)
                if identity[0] != size or identity[4] & (stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH):
                    return False
                seen_paths.add(raw_path)
                total_bytes += size
                resolved.append((path, item, identity))
        except (DataPlaneError, OSError):
            return False
        if total_bytes != expected_bytes:
            return False
        cache_key: tuple[object, ...] = (
            str(candidate_root),
            expected_revision,
            tuple((item["path"], identity) for _path, item, identity in resolved),
        )
        with self._validation_cache_lock:
            if cache_key in self._validation_cache:
                return True
            try:
                for path, item, identity in resolved:
                    if _sha256_file(path) != item["sha256"] or _stat_identity(path) != identity:
                        return False
            except OSError:
                return False
            self._validation_cache[cache_key] = True
            while len(self._validation_cache) > VALIDATION_CACHE_SIZE:
                self._validation_cache.pop(next(iter(self._validation_cache)))
        return True

    def _seal_candidate_artifacts(
        self,
        candidate_root: Path,
        validation: dict[str, object],
    ) -> None:
        artifacts = validation.get("artifacts")
        if not isinstance(artifacts, list):
            raise DataPlaneError("Candidate validation inventory is missing.")
        for item in artifacts:
            raw_path = item.get("path") if isinstance(item, dict) else None
            if not isinstance(raw_path, str):
                raise DataPlaneError("Candidate validation inventory contains an invalid path.")
            path = _resolve_regular_artifact(candidate_root, Path(raw_path))
            path.chmod(path.stat().st_mode & ~(stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH))
        if not self._verified_validation_inventory(candidate_root, validation):
            raise DataPlaneError("Candidate artifact seal verification failed.")

    def current_root(self) -> Path:
        pointer = self.pointer()
        if pointer is None:
            return self.repository_root
        return _candidate_path(self.state_root, pointer["candidate_id"])

    def candidate_root(self, candidate_id: object) -> Path:
        root = _candidate_path(self.state_root, candidate_id)
        if not root.is_dir():
            raise DataPlaneError("Candidate does not exist.")
        return root

    def _write_candidate_metadata(self, candidate_root: Path, payload: dict[str, object]) -> None:
        data_tools.atomic_write_json(
            candidate_root / CANDIDATE_METADATA_NAME,
            payload,
            backup=False,
            indent=2,
        )

    def validate_candidate(self, candidate_id: object, *, record: bool = True) -> dict[str, object]:
        candidate_root = self.candidate_root(candidate_id)
        metadata = _read_json_object(candidate_root / CANDIDATE_METADATA_NAME)
        if (
            metadata.get("schema_version") != DATA_PLANE_SCHEMA_VERSION
            or metadata.get("candidate_id") != _safe_candidate_id(candidate_id)
            or metadata.get("state") not in {"staged", "imported", "quarantined", "validated"}
        ):
            raise DataPlaneError("Candidate provenance does not permit validation or promotion.")
        refresh = metadata.get("refresh")
        if not isinstance(refresh, dict) or refresh.get("degraded") is True:
            raise DataPlaneError("Candidate refresh evidence is missing or degraded.")
        validation = validate_data_root(candidate_root)
        validation["validated_at"] = data_tools.isoformat_utc()
        if record:
            updated = dict(metadata)
            updated["state"] = "validated"
            updated["validation"] = validation
            updated.pop("validation_error", None)
            self._write_candidate_metadata(candidate_root, updated)
        return validation

    def _promote_locked(
        self,
        candidate_id: object,
        *,
        cancel_requested: Callable[[], bool] | None = None,
        publication_guard: ContextManager[object] | None = None,
    ) -> dict[str, object]:
        candidate_id = _safe_candidate_id(candidate_id)
        validation = self.validate_candidate(candidate_id)
        _check_cancelled(cancel_requested)
        candidate_root = self.candidate_root(candidate_id)
        self._seal_candidate_artifacts(candidate_root, validation)
        previous = self.pointer()
        if (
            previous is not None
            and previous.get("candidate_revision") == validation["candidate_revision"]
            and previous.get("artifact_count") == validation["artifact_count"]
            and previous.get("total_bytes") == validation["total_bytes"]
        ):
            return previous
        promoted_at = data_tools.isoformat_utc()
        pointer = {
            "schema_version": DATA_PLANE_SCHEMA_VERSION,
            "state": "promoted",
            "candidate_id": candidate_id,
            "candidate_revision": validation["candidate_revision"],
            "artifact_count": validation["artifact_count"],
            "total_bytes": validation["total_bytes"],
            "promoted_at": promoted_at,
            "previous_candidate_id": previous.get("candidate_id") if previous else None,
            "previous_candidate_revision": previous.get("candidate_revision") if previous else None,
            "provenance": {
                "kind": "validated-private-candidate",
                "repository_release_fallback": True,
                "atomic_pointer": CURRENT_POINTER_NAME,
            },
        }
        with publication_guard or contextlib.nullcontext():
            _check_cancelled(cancel_requested)
            data_tools.atomic_write_json(self.pointer_path, pointer, backup=True, indent=2)
        if self.pointer() != pointer:
            raise DataPlaneError("Atomic data-plane pointer verification failed after promotion.")
        return pointer

    def promote_candidate(
        self,
        candidate_id: object,
        *,
        cancel_requested: Callable[[], bool] | None = None,
        publication_guard: ContextManager[object] | None = None,
    ) -> dict[str, object]:
        with _data_plane_lock(self.state_root):
            return self._promote_locked(
                candidate_id,
                cancel_requested=cancel_requested,
                publication_guard=publication_guard,
            )

    def _new_candidate_id(self, now: dt.datetime | None = None) -> str:
        timestamp = (now or data_tools.utc_now()).astimezone(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        for _attempt in range(16):
            candidate_id = f"{timestamp}-{secrets.token_hex(6)}"
            if not _candidate_path(self.state_root, candidate_id).exists():
                return candidate_id
        raise DataPlaneError("Unable to allocate a unique candidate id.")

    def _prune_candidates(self) -> None:
        candidates_root = (self.state_root / "candidates").resolve()
        if not candidates_root.is_dir():
            return
        retained_ids: set[str] = set()
        try:
            raw_pointer = _read_json_object(self.pointer_path)
        except DataPlaneError:
            raw_pointer = {}
        for key in ("candidate_id", "previous_candidate_id"):
            value = raw_pointer.get(key)
            if isinstance(value, str) and CANDIDATE_ID_PATTERN.fullmatch(value):
                retained_ids.add(value)
        candidates = sorted(
            (
                path
                for path in candidates_root.iterdir()
                if path.is_dir() and not path.is_symlink() and CANDIDATE_ID_PATTERN.fullmatch(path.name)
            ),
            key=lambda path: path.name,
            reverse=True,
        )
        keep = {path.name for path in candidates[:CANDIDATE_RETENTION]}
        keep.update(retained_ids)
        for candidate in candidates:
            try:
                metadata = _read_json_object(candidate / CANDIDATE_METADATA_NAME)
            except DataPlaneError:
                continue
            retention = metadata.get("retention")
            if isinstance(retention, dict) and retention.get("pinned") is True:
                keep.add(candidate.name)
        for candidate in candidates:
            resolved = candidate.resolve()
            if candidate.name not in keep and resolved.parent == candidates_root:
                def make_writable_and_retry(function, path, _error):
                    Path(path).chmod(stat.S_IWRITE | stat.S_IREAD)
                    function(path)

                shutil.rmtree(resolved, onerror=make_writable_and_retry)

    def import_candidate(
        self,
        *,
        source_root: Path | str | None = None,
        now: dt.datetime | None = None,
    ) -> dict[str, object]:
        """Byte-snapshot a local closure without network access or pointer promotion."""

        with _data_plane_lock(self.state_root):
            source = Path(source_root or self.repository_root).resolve()
            candidate_id = self._new_candidate_id(now)
            candidate_root = _candidate_path(self.state_root, candidate_id)
            seeded_paths = seed_candidate_root(source, candidate_root)
            raw_inventory = _raw_inventory(candidate_root, seeded_paths)
            metadata: dict[str, object] = {
                "schema_version": DATA_PLANE_SCHEMA_VERSION,
                "candidate_id": candidate_id,
                "state": "imported",
                "created_at": data_tools.isoformat_utc(now),
                "base": {
                    "kind": "local-data-closure-import",
                    "candidate_id": None,
                    "candidate_revision": None,
                },
                "refresh": {
                    "mode": "import",
                    "network_used": False,
                    "degraded": False,
                    "changed": False,
                },
                "retention": {
                    "pinned": True,
                    "reason": "manual-local-data-closure-import",
                },
                "seeded_artifacts": seeded_paths,
                "import_inventory": raw_inventory,
            }
            self._write_candidate_metadata(candidate_root, metadata)
            validation_error: str | None = None
            try:
                validation = validate_data_root(candidate_root)
            except Exception as exc:
                validation_error = data_tools._bounded_metadata_error(exc)
                metadata["state"] = "quarantined"
                metadata["validation_error"] = validation_error
            else:
                validation["validated_at"] = data_tools.isoformat_utc(now)
                metadata["state"] = "validated"
                metadata["validation"] = validation
            self._write_candidate_metadata(candidate_root, metadata)
            self._prune_candidates()
            return {
                "candidate_id": candidate_id,
                "candidate_root": candidate_root.relative_to(self.repository_root).as_posix(),
                "candidate_state": metadata["state"],
                "candidate_revision": raw_inventory["candidate_revision"],
                "candidate_artifacts": raw_inventory["artifact_count"],
                "candidate_bytes": raw_inventory["total_bytes"],
                "valid": metadata["state"] == "validated",
                "validation_error": validation_error,
                "network_used": False,
                "promoted": False,
            }

    def stage_update(
        self,
        *,
        promote: bool = False,
        cancel_requested: Callable[[], bool] | None = None,
        publication_guard: ContextManager[object] | None = None,
        updater: Callable[..., dict[str, object]] = data_tools.maybe_update_satellite_data,
        now: dt.datetime | None = None,
        **update_kwargs: object,
    ) -> dict[str, object]:
        """Refresh a private clone, validate it, and optionally switch the pointer."""

        if promote and update_kwargs.get("dry_run") is True:
            raise DataPlaneError("A dry-run candidate cannot be promoted.")
        with _data_plane_lock(self.state_root):
            _check_cancelled(cancel_requested)
            base_root = self.current_root()
            base_pointer = self.pointer()
            if updater is data_tools.maybe_update_satellite_data:
                plan_keys = {
                    "interval_hours",
                    "gp_interval_hours",
                    "tle_interval_hours",
                    "satcat_interval_hours",
                    "tracked_interval_hours",
                    "launches_interval_hours",
                    "decayed_interval_hours",
                    "reconciliation_interval_hours",
                    "force",
                }
                plan = data_tools.scheduled_data_update_plan(
                    root=base_root,
                    now=now,
                    **{key: value for key, value in update_kwargs.items() if key in plan_keys},
                )
                if plan["any_due"] is not True:
                    return {
                        "started_at": data_tools.isoformat_utc(now),
                        "finished_at": data_tools.isoformat_utc(now),
                        "skipped": True,
                        "degraded": False,
                        "lock_acquired": False,
                        "intervals_hours": plan["intervals_hours"],
                        "due": {**plan["due"], "reconciliation": plan["reconciliation"]},
                        "gp": None,
                        "tle": None,
                        "satcat": None,
                        "tracked": None,
                        "launches": None,
                        "decayed": None,
                        "reconciliation": {
                            "changed": False,
                            "skipped": True,
                            "mode": data_tools.RECONCILIATION_MODE,
                            "message": "Satellite data reconciliation is not due.",
                            "due": False,
                            "datasets": plan["reconciliation"],
                            "completed": False,
                            "counts": {"datasets": 0},
                            "errors": [],
                            "paths": {},
                        },
                        "message": "All satellite datasets are within their configured freshness windows.",
                        "candidate_id": None,
                        "candidate_state": "not-created",
                        "promoted": False,
                        "promotion": None,
                    }
            candidate_id = self._new_candidate_id(now)
            candidate_root = _candidate_path(self.state_root, candidate_id)
            seeded_paths = seed_candidate_root(base_root, candidate_root)
            seed_inventory = _raw_inventory(candidate_root, seeded_paths)
            metadata: dict[str, object] = {
                "schema_version": DATA_PLANE_SCHEMA_VERSION,
                "candidate_id": candidate_id,
                "state": "staged",
                "created_at": data_tools.isoformat_utc(now),
                "base": {
                    "kind": "promoted-candidate" if base_pointer else "repository-release",
                    "candidate_id": base_pointer.get("candidate_id") if base_pointer else None,
                    "candidate_revision": base_pointer.get("candidate_revision") if base_pointer else None,
                    "seed_revision": seed_inventory["candidate_revision"],
                    "artifact_count": seed_inventory["artifact_count"],
                    "total_bytes": seed_inventory["total_bytes"],
                },
                "seeded_artifacts": seeded_paths,
            }
            self._write_candidate_metadata(candidate_root, metadata)
            try:
                _check_cancelled(cancel_requested)
                result = updater(
                    root=candidate_root,
                    cancel_requested=cancel_requested,
                    now=now,
                    **update_kwargs,
                )
                if not isinstance(result, dict):
                    raise DataPlaneError("Candidate updater returned a non-object result.")
                _check_cancelled(cancel_requested)
                metadata["refresh"] = result
                result_errors = [str(error) for error in result.get("errors", []) if error]
                result_errors.extend(
                    str(error)
                    for name in ("gp", "tle", "satcat", "tracked", "launches", "decayed", "reconciliation")
                    for error in (
                        result.get(name, {}).get("errors", [])
                        if isinstance(result.get(name), dict)
                        else []
                    )
                    if error
                )
                if result.get("degraded") or result_errors:
                    metadata["state"] = "rejected"
                    metadata["errors"] = result_errors or ["Candidate refresh reported a degraded result."]
                    self._write_candidate_metadata(candidate_root, metadata)
                    self._prune_candidates()
                    return {
                        **result,
                        "degraded": True,
                        "candidate_id": candidate_id,
                        "candidate_state": "rejected",
                        "promoted": False,
                        "errors": metadata["errors"],
                    }
                validation = validate_data_root(candidate_root)
                validation["validated_at"] = data_tools.isoformat_utc(now)
                metadata["state"] = "validated"
                metadata["validation"] = validation
                self._write_candidate_metadata(candidate_root, metadata)
                changed = validation["candidate_revision"] != seed_inventory["candidate_revision"]
                pointer = None
                if promote and changed:
                    _check_cancelled(cancel_requested)
                    pointer = self._promote_locked(
                        candidate_id,
                        cancel_requested=cancel_requested,
                        publication_guard=publication_guard,
                    )
                response = {
                    **result,
                    "candidate_id": candidate_id,
                    "candidate_state": "promoted" if pointer else "validated",
                    "candidate_revision": validation["candidate_revision"],
                    "candidate_artifacts": validation["artifact_count"],
                    "candidate_bytes": validation["total_bytes"],
                    "candidate_changed": changed,
                    "promoted": pointer is not None,
                    "promotion": pointer,
                }
                self._prune_candidates()
                return response
            except (DataPlaneCancelled, data_tools.SatelliteDataCancelled) as exc:
                metadata["state"] = "cancelled"
                metadata["cancelled_at"] = data_tools.isoformat_utc()
                self._write_candidate_metadata(candidate_root, metadata)
                self._prune_candidates()
                if isinstance(exc, DataPlaneCancelled):
                    raise
                raise DataPlaneCancelled(str(exc)) from exc
            except Exception as exc:
                error = data_tools._bounded_metadata_error(exc)
                if metadata.get("state") == "validated":
                    metadata["promotion_error"] = error
                else:
                    metadata["state"] = "rejected"
                    metadata["errors"] = [error]
                self._write_candidate_metadata(candidate_root, metadata)
                self._prune_candidates()
                raise
