"""Content-addressed private catalog snapshots for durable screening jobs."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


MAX_CATALOG_BYTES = 100 * 1024 * 1024
MAX_CATALOG_RECORDS = 100_000


class CatalogSnapshotError(ValueError):
    pass


@dataclass(frozen=True)
class CatalogSnapshot:
    revision_id: str
    schema_version: str
    source_format: str
    source_id: str
    provider: str
    dataset_id: str
    dataset_hash: str
    source_status: str
    retrieved_at: str | None
    object_count: int
    snapshot_path: str
    metadata_path: str | None
    source_path: str
    adapter_version: str
    license_id: str | None

    def metadata(self) -> dict[str, Any]:
        return asdict(self)


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _read_bounded(path: Path, max_bytes: int) -> bytes:
    if not path.is_file():
        raise CatalogSnapshotError(f"Catalog source is missing: {path}")
    size = path.stat().st_size
    if size < 2 or size > max_bytes:
        raise CatalogSnapshotError(f"Catalog source size {size} is outside the supported bound")
    return path.read_bytes()


def _source_status(source_metadata: dict[str, Any]) -> str:
    """Classify acquisition health separately from source completeness."""

    last_status = str(source_metadata.get("last_status", "unknown")).strip().lower()
    explicit = str(source_metadata.get("source_status", "")).strip().upper()
    if last_status == "partial" or source_metadata.get("partial_update") is True:
        return "PARTIAL"
    if last_status in {"failed", "error"}:
        return "DEGRADED"
    if explicit in {"COMPLETE", "PARTIAL", "DEGRADED"}:
        return explicit
    if last_status not in {"ok", "not-modified"}:
        return "DEGRADED"

    mode = str(source_metadata.get("mode", "unknown")).strip().lower()
    if mode == "incremental":
        return "PARTIAL"
    if mode == "all":
        return "COMPLETE"
    return "DEGRADED"


def _canonical_json_bytes(value: object, *, indent: int | None = None) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":") if indent is None else None,
            indent=indent,
        )
        + ("\n" if indent is not None else "")
    ).encode("utf-8")


def _write_immutable(path: Path, data: bytes, label: str) -> None:
    if path.exists():
        if not path.is_file() or path.read_bytes() != data:
            raise CatalogSnapshotError(f"Existing {label} is immutable and does not match")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    temporary = Path(temporary_name)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(str(temporary), str(path))
        except FileExistsError:
            if not path.is_file() or path.read_bytes() != data:
                raise CatalogSnapshotError(f"Existing {label} is immutable and does not match")
    finally:
        temporary.unlink(missing_ok=True)


def _snapshot_from_descriptor(path: Path) -> CatalogSnapshot:
    try:
        decoded = json.loads(path.read_text(encoding="utf-8"))
        snapshot = CatalogSnapshot(**decoded)
    except (OSError, TypeError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CatalogSnapshotError("Frozen catalog revision descriptor is invalid") from exc
    return snapshot


class CatalogSnapshotRegistry:
    def __init__(self, runtime_root: Path, *, max_bytes: int = MAX_CATALOG_BYTES) -> None:
        self.runtime_root = Path(runtime_root).resolve()
        self.catalog_root = self.runtime_root / "catalogs"
        self.max_bytes = int(max_bytes)
        self.catalog_root.mkdir(parents=True, exist_ok=True)

    def _relative_private_path(self, path: Path) -> str:
        resolved = path.resolve()
        if self.runtime_root != resolved and self.runtime_root not in resolved.parents:
            raise CatalogSnapshotError("Snapshot path escaped the private runtime root")
        return resolved.relative_to(self.runtime_root).as_posix()

    def resolve_private_path(self, relative_path: str) -> Path:
        candidate = (self.runtime_root / str(relative_path)).resolve()
        if self.runtime_root != candidate and self.runtime_root not in candidate.parents:
            raise CatalogSnapshotError("Private catalog path escaped the runtime root")
        return candidate

    def _snapshot_json(
        self,
        catalog_path: Path,
        metadata_path: Path | None = None,
        *,
        source_id: str,
        provider: str,
        license_id: str | None,
        source_format: str,
        schema_version: str,
        adapter_version: str,
    ) -> CatalogSnapshot:
        catalog_path = Path(catalog_path).resolve()
        raw = _read_bounded(catalog_path, self.max_bytes)
        try:
            records = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise CatalogSnapshotError("Catalog source must be valid UTF-8 JSON") from exc
        if not isinstance(records, list) or not records or len(records) > MAX_CATALOG_RECORDS:
            raise CatalogSnapshotError(
                f"Catalog must contain 1 to {MAX_CATALOG_RECORDS} records"
            )

        source_metadata: dict[str, Any] = {}
        metadata_raw: bytes | None = None
        if metadata_path is not None and Path(metadata_path).is_file():
            metadata_raw = _read_bounded(Path(metadata_path).resolve(), 5 * 1024 * 1024)
            try:
                decoded = json.loads(metadata_raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise CatalogSnapshotError("Catalog metadata must be valid UTF-8 JSON") from exc
            if not isinstance(decoded, dict):
                raise CatalogSnapshotError("Catalog metadata must be a JSON object")
            source_metadata = decoded

        digest = _sha256_bytes(raw)
        dataset_hash = f"sha256:{digest}"
        revision_id = f"catalog:sha256:{digest}"
        revision_root = self.catalog_root / digest
        target = revision_root / "catalog.json"
        _write_immutable(target, raw, "content-addressed catalog")
        source_status = _source_status(source_metadata)
        retrieved_at = (
            source_metadata.get("retrieval_timestamp")
            or source_metadata.get("fetched_at")
            or source_metadata.get("last_success_at")
        )
        descriptor = revision_root / "revision.json"
        frozen: CatalogSnapshot | None = None
        if descriptor.exists():
            frozen = _snapshot_from_descriptor(descriptor)
            if any((
                frozen.revision_id != revision_id,
                frozen.dataset_hash != dataset_hash,
                frozen.snapshot_path != self._relative_private_path(target),
                frozen.source_id != str(source_id),
                frozen.source_format != source_format,
                frozen.schema_version != schema_version,
                frozen.adapter_version != adapter_version,
            )):
                raise CatalogSnapshotError("Frozen catalog revision identity conflicts with this source")
        acquisition_material = {
            "adapter_version": adapter_version,
            "dataset_hash": dataset_hash,
            "license_id": license_id,
            "provider": str(provider),
            "schema_version": schema_version,
            "source_format": source_format,
            "source_id": str(source_id),
            "source_path": catalog_path.name,
            "source_metadata": source_metadata,
        }
        source_metadata_digest = _sha256_bytes(_canonical_json_bytes(source_metadata))
        acquisition_digest = _sha256_bytes(_canonical_json_bytes(acquisition_material))
        acquisition = {
            "acquisition_id": f"acquisition:sha256:{acquisition_digest}",
            "catalog_revision_id": revision_id,
            "metadata_sha256": f"sha256:{source_metadata_digest}" if metadata_raw is not None else None,
            "retrieved_at": str(retrieved_at) if retrieved_at else None,
            "source_status": source_status,
            **acquisition_material,
        }
        _write_immutable(
            revision_root / "acquisitions" / f"{acquisition_digest}.json",
            _canonical_json_bytes(acquisition, indent=2),
            "catalog acquisition record",
        )
        if frozen is not None:
            return frozen

        metadata_target: Path | None = None
        if metadata_raw is not None:
            metadata_target = revision_root / "source-metadata.json"
            _write_immutable(metadata_target, metadata_raw, "frozen source metadata")
        snapshot = CatalogSnapshot(
            revision_id=revision_id,
            schema_version=schema_version,
            source_format=source_format,
            source_id=str(source_id),
            provider=str(provider),
            dataset_id=f"dataset:{source_id}:{digest[:16]}",
            dataset_hash=dataset_hash,
            source_status=source_status,
            retrieved_at=str(retrieved_at) if retrieved_at else None,
            object_count=len(records),
            snapshot_path=self._relative_private_path(target),
            metadata_path=self._relative_private_path(metadata_target) if metadata_target else None,
            source_path=catalog_path.name,
            adapter_version=adapter_version,
            license_id=license_id,
        )
        descriptor_bytes = _canonical_json_bytes(snapshot.metadata(), indent=2)
        _write_immutable(descriptor, descriptor_bytes, "catalog revision descriptor")
        return snapshot

    def snapshot_tle_json(
        self,
        catalog_path: Path,
        metadata_path: Path | None = None,
        *,
        source_id: str = "celestrak-gp-bundled",
        provider: str = "CelesTrak",
        license_id: str | None = "celestrak-terms-review-required",
    ) -> CatalogSnapshot:
        return self._snapshot_json(
            catalog_path,
            metadata_path,
            source_id=source_id,
            provider=provider,
            license_id=license_id,
            source_format="TLE_JSON",
            schema_version="2.1.0",
            adapter_version="openbexi-tle-json-adapter/2.1.0",
        )

    def snapshot_gp_json(
        self,
        catalog_path: Path,
        metadata_path: Path | None = None,
        *,
        source_id: str = "celestrak-gp-omm-bundled",
        provider: str = "CelesTrak",
        license_id: str | None = "celestrak-terms-review-required",
    ) -> CatalogSnapshot:
        return self._snapshot_json(
            catalog_path,
            metadata_path,
            source_id=source_id,
            provider=provider,
            license_id=license_id,
            source_format="CCSDS_OMM_JSON",
            schema_version="2.2.0",
            adapter_version="openbexi-omm-json-adapter/2.2.0",
        )

    def load_records(self, snapshot: CatalogSnapshot) -> list[dict[str, Any]]:
        path = self.resolve_private_path(snapshot.snapshot_path)
        raw = _read_bounded(path, self.max_bytes)
        if f"sha256:{_sha256_bytes(raw)}" != snapshot.dataset_hash:
            raise CatalogSnapshotError("Catalog snapshot checksum mismatch")
        records = json.loads(raw.decode("utf-8"))
        if not isinstance(records, list):
            raise CatalogSnapshotError("Catalog snapshot is not an array")
        return records

    def copy_snapshot_to(self, snapshot: CatalogSnapshot, destination: Path) -> None:
        source = self.resolve_private_path(snapshot.snapshot_path)
        destination = Path(destination).resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
