#!/usr/bin/env python3
"""Satellite data maintenance tools for OpenBEXI Earth Orbit.

This module replaces the legacy Java SatelliteDataExporter and buildDecayedDB
workflows with importable, standard-library-only Python code. It is usable as a
standalone CLI and from server.py without spawning a subprocess.
"""

from __future__ import annotations

import argparse
import calendar
import contextlib
import csv
import datetime as dt
import hashlib
import io
import json
import math
import os
import re
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable
from urllib import parse, request
from urllib.error import HTTPError, URLError


EARTH_RADIUS_KM = 6378.137
EARTH_MU_KM3_S2 = 398600.4418
MINUTES_PER_DAY = 1440.0
CELESTRAK_MIN_REFRESH_HOURS = 2.0
DEFAULT_SERVER_UPDATE_INTERVAL_HOURS = 24.0
DEFAULT_HTTP_TIMEOUT_SECONDS = 30.0
RECONCILIATION_MODE = "reconcile"
UPDATE_LOCK_STALE_HOURS = 6.0
RECONCILIATION_SHRINK_GUARD_MIN_EXISTING_RECORDS = 1_000
RECONCILIATION_SHRINK_GUARD_MIN_RETAINED_FRACTION = 0.75
BACKUP_RETENTION_PER_ARTIFACT = 7
METADATA_ERROR_MAX_LENGTH = 2000


def _release_version() -> str:
    try:
        metadata = json.loads((Path(__file__).resolve().parents[1] / "release" / "version.json").read_text(encoding="utf-8"))
        version = str(metadata.get("version", "")).strip()
        if re.fullmatch(r"\d+\.\d+\.\d+", version):
            return version
    except (OSError, ValueError, TypeError):
        pass
    return "development"


HTTP_USER_AGENT = "OpenBEXI-Earth-Orbit/%s (Experimental; non-operational)" % _release_version()

TLE_RELATIVE_PATH = Path("json") / "tle" / "TLE.json"
TLE_META_RELATIVE_PATH = Path("json") / "tle" / "TLE.meta.json"
LAUNCH_DATES_RELATIVE_PATH = Path("json") / "tle" / "satellite_launch_dates.json"
GP_RELATIVE_PATH = Path("json") / "gp" / "GP.json"
GP_META_RELATIVE_PATH = Path("json") / "gp" / "GP.meta.json"
TRACKED_DIRECTORY_RELATIVE_PATH = Path("json") / "tracked"
TRACKED_MANIFEST_RELATIVE_PATH = TRACKED_DIRECTORY_RELATIVE_PATH / "TRACKED.manifest.json"
TRACKED_META_RELATIVE_PATH = TRACKED_DIRECTORY_RELATIVE_PATH / "TRACKED.meta.json"
LAUNCHES_RELATIVE_PATH = Path("json") / "launches" / "launches.json"
LAUNCHES_META_RELATIVE_PATH = Path("json") / "launches" / "launches.meta.json"
SATCAT_RELATIVE_PATH = Path("json") / "satcat.csv"
SATCAT_META_RELATIVE_PATH = Path("json") / "satcat.meta.json"
DECAYED_RELATIVE_PATH = Path("json") / "decayed" / "decayed.json"
DECAYED_META_RELATIVE_PATH = Path("json") / "decayed" / "decayed.meta.json"
UPDATE_LOCK_RELATIVE_PATH = Path("json") / ".satellite_data_update.lock"

CELESTRAK_GP_ENDPOINT = "https://celestrak.org/NORAD/elements/gp.php"
CELESTRAK_SATCAT_CSV_URL = "https://celestrak.org/pub/satcat.csv"
N2YO_BROWSE_ENDPOINT = "https://www.n2yo.com/browse/"

# Keep this order compatible with the legacy Java exporter. Duplicate groups
# are intentional because the Java workflow visited them in this sequence and
# kept the first NORAD record it encountered.
LEGACY_TLE_SOURCE_URLS = [
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=intelsat&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=ses&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=eutelsat&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=globalstar&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=satnogs&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=oneweb&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=telesat&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=hulianwang&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=other-comm&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=cubesat&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=military&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=qianfan&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=kuiper&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=argos&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=cubesat&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=dmc&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=education&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=geo&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=geodetic&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=glo-ops&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=globalstar&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=goes&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=gorizont&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-NEXT&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=molniya&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=orbcomm&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=planet&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=raduga&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=satnogs&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=sarsat&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=science&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=spire&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=tdrss&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=x-comm&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
]

INCREMENTAL_TLE_GROUPS = ("active",)

GP_EVENT_DEBRIS_GROUPS = (
    "fengyun-1c-debris",
    "iridium-33-debris",
    "cosmos-2251-debris",
)
GP_SOURCE_GROUPS = ("active", *GP_EVENT_DEBRIS_GROUPS)
GP_SOURCE_SCOPE_DESCRIPTION = (
    "Configured current GP scope: active plus the Fengyun-1C, Iridium 33, and "
    "Cosmos 2251 event-debris collections. These named collections are not an "
    "all-debris feed, and lack of a GP join is not a provider-wide no-elements claim."
)

TRACKED_OBJECT_TYPES = (
    "PAYLOAD",
    "DEBRIS",
    "ROCKET_BODY",
    "MISSION_RELATED",
    "UNKNOWN",
)
TRACKED_CHUNK_FILES = {
    "PAYLOAD": "payload",
    "DEBRIS": "debris",
    "ROCKET_BODY": "rocket-body",
    "MISSION_RELATED": "mission-related",
    "UNKNOWN": "unknown",
}

PLACEHOLDER_COMPANY_TAGS = {
    "",
    "ACTIVE",
    "CELESTRAK",
    "LAST-30-DAYS",
    "N/A",
    "NO DATA",
    "UNKNOWN",
}

OMM_DEFAULTS = {
    "CCSDS_OMM_VERS": "2.0",
    "CENTER_NAME": "EARTH",
    "REF_FRAME": "TEME",
    "TIME_SYSTEM": "UTC",
    "MEAN_ELEMENT_THEORY": "SGP4",
}
OMM_REQUIRED_NUMBERS = {
    "MEAN_MOTION": (0.0, 25.0, True),
    "ECCENTRICITY": (0.0, 1.0, False),
    "INCLINATION": (0.0, 180.0, False),
    "RA_OF_ASC_NODE": (None, None, False),
    "ARG_OF_PERICENTER": (None, None, False),
    "MEAN_ANOMALY": (None, None, False),
    "BSTAR": (None, None, False),
    "MEAN_MOTION_DOT": (None, None, False),
    "MEAN_MOTION_DDOT": (None, None, False),
}
OMM_INTEGER_FIELDS = ("EPHEMERIS_TYPE", "ELEMENT_SET_NO", "REV_AT_EPOCH")
DECAYED_COLUMNS = (
    "OBJECT_NAME",
    "OBJECT_ID",
    "NORAD_CAT_ID",
    "OBJECT_TYPE",
    "LAUNCH_DATE",
    "LAUNCH_SITE",
    "DECAY_DATE",
)


class SatelliteDataError(RuntimeError):
    """Raised when a data update cannot complete safely."""


@dataclass
class FetchResponse:
    url: str
    text: str
    status: int = 200
    headers: dict[str, str] = field(default_factory=dict)
    not_modified: bool = False


@dataclass
class UpdateResult:
    changed: bool
    skipped: bool
    mode: str
    message: str
    counts: dict[str, int] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    paths: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, object]:
        return {
            "changed": self.changed,
            "skipped": self.skipped,
            "mode": self.mode,
            "message": self.message,
            "counts": self.counts,
            "errors": self.errors,
            "paths": self.paths,
        }


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def isoformat_utc(value: dt.datetime | None = None) -> str:
    value = value or utc_now()
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.timezone.utc)
    return value.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def _bounded_metadata_error(value: object) -> str:
    normalized = re.sub(r"[\x00-\x1f\x7f]+", " ", str(value or "")).strip()
    return normalized[:METADATA_ERROR_MAX_LENGTH]


def parse_iso_datetime(value: object) -> dt.datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = dt.datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def repo_path(root: Path | str, relative: Path) -> Path:
    return Path(root).resolve() / relative


def update_result_for_metadata(result: UpdateResult, root: Path | str) -> dict[str, object]:
    """Serialize an update result without exposing host-specific repository paths."""

    root_path = Path(root).resolve()
    payload = result.to_dict()
    relative_paths: dict[str, str] = {}
    for name, raw_path in result.paths.items():
        try:
            relative_paths[name] = Path(raw_path).resolve().relative_to(root_path).as_posix()
        except (OSError, ValueError):
            relative_paths[name] = raw_path
    payload["paths"] = relative_paths
    return payload


def default_repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_json(path: Path, default: object) -> object:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return default
    except json.JSONDecodeError as exc:
        raise SatelliteDataError(f"Invalid JSON in {path}: {exc}") from exc


def _backup_timestamp() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _create_collision_safe_backup(path: Path) -> Path:
    timestamp = _backup_timestamp()
    prefix = f"{path.name}.bak-{timestamp}"
    pattern = re.compile(rf"{re.escape(prefix)}(?:-(\d+))?$")
    collision = -1
    for sibling in path.parent.iterdir():
        match = pattern.fullmatch(sibling.name)
        if match:
            collision = max(collision, int(match.group(1) or 0))

    while True:
        collision += 1
        suffix = "" if collision == 0 else f"-{collision}"
        backup_path = path.parent / f"{prefix}{suffix}"
        try:
            fd = os.open(str(backup_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            continue
        try:
            with os.fdopen(fd, "wb") as backup_handle, path.open("rb") as source_handle:
                while chunk := source_handle.read(1024 * 1024):
                    backup_handle.write(chunk)
        except Exception:
            with contextlib.suppress(FileNotFoundError):
                backup_path.unlink()
            raise
        return backup_path


def _rotate_artifact_backups(path: Path, *, keep: int = BACKUP_RETENTION_PER_ARTIFACT) -> None:
    pattern = re.compile(
        rf"{re.escape(path.name)}\.bak-(?:(\d{{8}}T\d{{6}}Z)(?:-(\d+))?|(\d{{14}}))$"
    )
    matching: list[tuple[str, int, Path]] = []
    for sibling in path.parent.iterdir():
        match = pattern.fullmatch(sibling.name)
        if match and sibling.is_file() and not sibling.is_symlink():
            timestamp = match.group(1)
            if timestamp is None:
                legacy_timestamp = match.group(3) or ""
                timestamp = f"{legacy_timestamp[:8]}T{legacy_timestamp[8:]}Z"
            matching.append((timestamp, int(match.group(2) or 0), sibling))
    matching.sort(key=lambda item: (item[0], item[1]), reverse=True)
    for _timestamp, _collision, stale_path in matching[max(0, keep):]:
        with contextlib.suppress(FileNotFoundError):
            stale_path.unlink()


def atomic_write_text(path: Path, text: str, *, dry_run: bool = False, backup: bool = True) -> None:
    if dry_run:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    if backup and path.exists():
        _create_collision_safe_backup(path)
    fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        os.replace(temp_path, path)
        if backup:
            try:
                _rotate_artifact_backups(path)
            except Exception:
                # Promotion already succeeded; cleanup must not prevent truthful metadata updates.
                pass
    finally:
        with contextlib.suppress(FileNotFoundError):
            temp_path.unlink()


def atomic_write_json(
    path: Path,
    payload: object,
    *,
    dry_run: bool = False,
    backup: bool = True,
    indent: int | None = None,
) -> None:
    text = json.dumps(payload, ensure_ascii=False, allow_nan=False, indent=indent, separators=None if indent else (",", ":"))
    if indent is not None:
        text += "\n"
    atomic_write_text(path, text, dry_run=dry_run, backup=backup)


def _restore_text_snapshot(
    path: Path,
    original_text: str | None,
    *,
    originally_existed: bool,
    dry_run: bool,
) -> None:
    if dry_run:
        return
    if originally_existed:
        if original_text is None:
            raise SatelliteDataError(f"Missing rollback snapshot for {path}.")
        current_text = path.read_text(encoding="utf-8") if path.exists() else None
        if current_text != original_text:
            atomic_write_text(path, original_text, backup=False)
    elif path.exists():
        path.unlink()


def _restore_bytes_snapshot(
    path: Path,
    original_bytes: bytes | None,
    *,
    originally_existed: bool,
    dry_run: bool,
) -> None:
    if dry_run:
        return
    if originally_existed:
        if original_bytes is None:
            raise SatelliteDataError(f"Missing byte rollback snapshot for {path}.")
        current_bytes = path.read_bytes() if path.exists() else None
        if current_bytes == original_bytes:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
        temp_path = Path(temp_name)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(original_bytes)
            os.replace(temp_path, path)
        finally:
            with contextlib.suppress(FileNotFoundError):
                temp_path.unlink()
    elif path.exists():
        path.unlink()


def latest_success_time(meta: dict[str, object], data_path: Path) -> dt.datetime | None:
    successful_times = [
        parsed
        for key in ("fetched_at", "last_success_at", "revalidated_at")
        if (parsed := parse_iso_datetime(meta.get(key))) is not None
    ]
    if successful_times:
        return max(successful_times)
    if data_path.exists():
        return dt.datetime.fromtimestamp(data_path.stat().st_mtime, dt.timezone.utc)
    return None


def reconciliation_shrink_error(
    dataset: str,
    previous_count: int,
    candidate_count: int,
    retained_count: int,
    *,
    allow_large_reconciliation_shrink: bool = False,
) -> str | None:
    if (
        allow_large_reconciliation_shrink
        or previous_count < RECONCILIATION_SHRINK_GUARD_MIN_EXISTING_RECORDS
    ):
        return None
    minimum_count = math.ceil(
        previous_count * RECONCILIATION_SHRINK_GUARD_MIN_RETAINED_FRACTION
    )
    if candidate_count >= minimum_count:
        if retained_count >= minimum_count:
            return None
        retained_percent = retained_count / previous_count * 100.0
        required_percent = RECONCILIATION_SHRINK_GUARD_MIN_RETAINED_FRACTION * 100.0
        return (
            f"{dataset} catalog replacement rejected an unrelated identity profile: "
            f"{retained_count} candidate NORAD identities retain {retained_percent:.1f}% "
            f"of the {previous_count}-record last-known-good catalog; at least "
            f"{required_percent:.0f}% is required."
        )
    candidate_percent = candidate_count / previous_count * 100.0
    required_percent = RECONCILIATION_SHRINK_GUARD_MIN_RETAINED_FRACTION * 100.0
    return (
        f"{dataset} catalog replacement rejected a dangerously truncated catalog: "
        f"{candidate_count} candidate records provide {candidate_percent:.1f}% of "
        f"the {previous_count}-record last-known-good catalog; at least "
        f"{required_percent:.0f}% is required."
    )


def catalog_norad_ids(records: Iterable[object]) -> set[str]:
    identities: set[str] = set()
    for record in records:
        if not isinstance(record, dict):
            continue
        try:
            identities.add(normalize_norad_id(record.get("norad_id")))
        except SatelliteDataError:
            continue
    return identities


def age_hours(value: dt.datetime | None, *, now: dt.datetime | None = None) -> float | None:
    if value is None:
        return None
    now = now or utc_now()
    if now.tzinfo is None:
        now = now.replace(tzinfo=dt.timezone.utc)
    return max(0.0, (now.astimezone(dt.timezone.utc) - value).total_seconds() / 3600.0)


def is_recent_enough(value: dt.datetime | None, hours: float, *, now: dt.datetime | None = None) -> bool:
    current_age = age_hours(value, now=now)
    return current_age is not None and current_age < hours


def make_celestrak_group_url(group: str, *, output_format: str = "tle") -> str:
    query = parse.urlencode({"GROUP": group, "FORMAT": output_format})
    return f"{CELESTRAK_GP_ENDPOINT}?{query}"


def require_https_ingestion_url(url: str) -> str:
    normalized = str(url or "").strip()
    parsed = parse.urlparse(normalized)
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        raise SatelliteDataError(f"Refusing non-HTTPS ingestion URL: {normalized or '<empty>'}")
    if parsed.username is not None or parsed.password is not None:
        raise SatelliteDataError(f"Refusing credential-bearing ingestion URL: {normalized}")
    return normalized


def extract_group_from_url(url: str) -> str:
    parsed = parse.urlparse(url)
    query = parse.parse_qs(parsed.query)
    group = query.get("GROUP", query.get("group", ["no data"]))[0]
    return str(group or "no data").upper()


def fetch_url(
    url: str,
    *,
    timeout: float = DEFAULT_HTTP_TIMEOUT_SECONDS,
    headers: dict[str, str] | None = None,
) -> FetchResponse:
    url = require_https_ingestion_url(url)
    req = request.Request(
        url,
        headers={
            "User-Agent": HTTP_USER_AGENT,
            **(headers or {}),
        },
    )
    try:
        with request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            return FetchResponse(
                url=url,
                text=body,
                status=getattr(response, "status", 200),
                headers={key.lower(): value for key, value in response.headers.items()},
            )
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        if exc.code == 304:
            return FetchResponse(url=url, text="", status=304, not_modified=True)
        if exc.code == 403 and "has not updated since your last successful" in detail:
            return FetchResponse(url=url, text="", status=304, not_modified=True, headers={"x-celestrak-detail": detail.strip()})
        raise SatelliteDataError(f"HTTP {exc.code} for {url}: {detail[:200]}") from exc
    except URLError as exc:
        raise SatelliteDataError(f"Network error for {url}: {exc.reason}") from exc
    except TimeoutError as exc:
        raise SatelliteDataError(f"Timed out fetching {url}") from exc


def parse_tle_text(text: str) -> list[tuple[str, str, str]]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    blocks: list[tuple[str, str, str]] = []
    index = 0
    while index + 2 < len(lines):
        name = lines[index]
        line1 = lines[index + 1]
        line2 = lines[index + 2]
        if validate_tle_pair(line1, line2):
            blocks.append((name.removeprefix("0 ").strip(), line1, line2))
            index += 3
        else:
            index += 1
    return blocks


def decode_tle_catalog_id(value: object) -> str:
    """Decode numeric or Space-Track Alpha-5 catalog fields without truncation."""

    text = str(value or "").strip().upper()
    if text.isdigit():
        return normalize_norad_id(text)
    match = re.fullmatch(r"([A-HJ-NP-Z])(\d{4})", text)
    if not match:
        raise SatelliteDataError(f"Invalid TLE catalog identifier: {text or '<empty>'}")
    alpha5_alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    prefix_value = alpha5_alphabet.index(match.group(1)) + 10
    return normalize_norad_id(f"{prefix_value}{match.group(2)}")


def tle_norad_from_line1(line1: str | None) -> str:
    if not line1 or len(line1) < 7:
        return "no data"
    try:
        return decode_tle_catalog_id(line1[2:7])
    except SatelliteDataError:
        return "no data"


def tle_norad_from_line2(line2: str | None) -> str:
    if not line2:
        return ""
    tokens = line2.strip().split()
    return tokens[1].strip() if len(tokens) > 1 else ""


def validate_tle_pair(line1: str | None, line2: str | None) -> bool:
    if not line1 or not line2:
        return False
    if not line1.startswith("1 ") or not line2.startswith("2 "):
        return False
    norad1 = tle_norad_from_line1(line1)
    try:
        norad2 = decode_tle_catalog_id(tle_norad_from_line2(line2))
    except SatelliteDataError:
        return False
    return bool(norad1 != "no data" and norad1 == norad2)


def tle_checksum_is_valid(line: str | None) -> bool:
    if not line or len(line) < 69 or not line[68].isdigit():
        return False
    checksum = sum(int(character) for character in line[:68] if character.isdigit())
    checksum += line[:68].count("-")
    return checksum % 10 == int(line[68])


def parse_float(value: str | None) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def parse_tle_eccentricity(token: str | None) -> float | None:
    if not token:
        return None
    digits = re.sub(r"[^0-9]", "", token)
    if not digits:
        return None
    try:
        return float(f"0.{digits}")
    except ValueError:
        return None


def put_if_finite(target: dict[str, object], key: str, value: float | None) -> None:
    if value is not None and math.isfinite(value):
        target[key] = value


def extract_orbit_metrics(tle_line2: str | None) -> dict[str, float]:
    metrics: dict[str, float] = {}
    if not tle_line2:
        return metrics
    tokens = tle_line2.strip().split()
    if len(tokens) < 8:
        return metrics

    inclination_deg = parse_float(tokens[2])
    eccentricity = parse_tle_eccentricity(tokens[4])
    mean_motion = parse_float(tokens[7])

    put_if_finite(metrics, "inclination_deg", inclination_deg)
    put_if_finite(metrics, "eccentricity", eccentricity)
    put_if_finite(metrics, "mean_motion_rev_per_day", mean_motion)

    if mean_motion is not None and mean_motion > 0:
        period_min = MINUTES_PER_DAY / mean_motion
        mean_motion_rad_per_sec = mean_motion * 2.0 * math.pi / 86400.0
        semi_major_axis_km = (EARTH_MU_KM3_S2 / (mean_motion_rad_per_sec * mean_motion_rad_per_sec)) ** (1.0 / 3.0)
        safe_eccentricity = eccentricity if eccentricity is not None else 0.0
        perigee_km = semi_major_axis_km * (1.0 - safe_eccentricity) - EARTH_RADIUS_KM
        apogee_km = semi_major_axis_km * (1.0 + safe_eccentricity) - EARTH_RADIUS_KM
        estimated_altitude_km = (perigee_km + apogee_km) / 2.0

        put_if_finite(metrics, "period_min", period_min)
        put_if_finite(metrics, "semi_major_axis_km", semi_major_axis_km)
        put_if_finite(metrics, "perigee_km", perigee_km)
        put_if_finite(metrics, "apogee_km", apogee_km)
        put_if_finite(metrics, "estimated_altitude_km", estimated_altitude_km)

    return metrics


def determine_orbit(metrics: dict[str, object]) -> str:
    mean_motion = metrics.get("mean_motion_rev_per_day")
    if not isinstance(mean_motion, (int, float)):
        return "no data"
    eccentricity = metrics.get("eccentricity") if isinstance(metrics.get("eccentricity"), (int, float)) else 0.0
    inclination_deg = metrics.get("inclination_deg") if isinstance(metrics.get("inclination_deg"), (int, float)) else 0.0
    period_min = metrics.get("period_min") if isinstance(metrics.get("period_min"), (int, float)) else MINUTES_PER_DAY / mean_motion
    altitude_km = metrics.get("estimated_altitude_km") if isinstance(metrics.get("estimated_altitude_km"), (int, float)) else math.nan
    perigee_km = metrics.get("perigee_km") if isinstance(metrics.get("perigee_km"), (int, float)) else math.nan
    apogee_km = metrics.get("apogee_km") if isinstance(metrics.get("apogee_km"), (int, float)) else math.nan

    if math.isfinite(perigee_km) and perigee_km < 120:
        return "DECAYING"

    is_near_geo_period = abs(period_min - 1436.1) <= 90.0
    is_near_geo_inclination = abs(inclination_deg) <= 15.0
    is_near_circular = eccentricity < 0.08
    if is_near_geo_period and is_near_geo_inclination and is_near_circular:
        return "GEO"

    is_molniya_like = (
        600.0 <= period_min <= 900.0
        and 50.0 <= abs(inclination_deg) <= 75.0
        and eccentricity >= 0.1
    )
    is_highly_eccentric = eccentricity >= 0.25
    is_long_elliptical = eccentricity >= 0.12 and period_min > 225.0
    if is_highly_eccentric or is_molniya_like or is_long_elliptical:
        return "HEO"

    if math.isfinite(altitude_km):
        if altitude_km < 2000.0:
            return "LEO"
        if altitude_km < 35786.0:
            return "MEO"
        return "OTHER"

    if mean_motion > 11.0:
        return "LEO"
    if 2.5 <= mean_motion <= 11.0:
        return "MEO"
    return "OTHER"


def normalize_norad_id(value: object) -> str:
    """Return a numeric NORAD identifier without TLE-width truncation."""

    if isinstance(value, bool) or value is None:
        raise SatelliteDataError("NORAD_CAT_ID must be a numeric catalog identifier.")
    if isinstance(value, int):
        text = str(value)
    elif isinstance(value, float):
        if not math.isfinite(value) or not value.is_integer():
            raise SatelliteDataError("NORAD_CAT_ID must be an integer.")
        text = str(int(value))
    else:
        text = str(value).strip()
    if not re.fullmatch(r"\d{1,9}", text):
        raise SatelliteDataError(f"Invalid numeric NORAD_CAT_ID: {text or '<empty>'}")
    normalized = text.lstrip("0") or "0"
    if normalized == "0":
        raise SatelliteDataError("NORAD_CAT_ID must be positive.")
    return normalized


def normalize_catalog_id(value: object) -> str:
    """Normalize numeric or Alpha-5 catalog identity to an untruncated string."""

    text = str(value or "").strip().upper()
    if re.fullmatch(r"[A-HJ-NP-Z]\d{4}", text):
        return decode_tle_catalog_id(text)
    return normalize_norad_id(value)


def alpha5_catalog_id(value: object) -> str | None:
    """Return the reversible Alpha-5 form when the numeric ID requires it."""

    norad_id = normalize_catalog_id(value)
    numeric = int(norad_id)
    if numeric < 100_000 or numeric > 339_999:
        return None
    prefix_value, suffix = divmod(numeric, 10_000)
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    if not 10 <= prefix_value < 10 + len(alphabet):
        return None
    return f"{alphabet[prefix_value - 10]}{suffix:04d}"


def normalize_omm_epoch(value: object) -> str:
    text = str(value or "").strip()
    if not text or "T" not in text.upper():
        raise SatelliteDataError("OMM EPOCH must be an ISO-8601 date-time.")
    parsed = parse_iso_datetime(text)
    if parsed is None:
        raise SatelliteDataError(f"Invalid OMM EPOCH: {text}")
    return parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _finite_omm_number(
    value: object,
    field_name: str,
    minimum: float | None,
    maximum: float | None,
    exclusive_minimum: bool = False,
    exclusive_maximum: bool = False,
) -> float:
    if isinstance(value, bool):
        raise SatelliteDataError(f"OMM {field_name} must be numeric.")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise SatelliteDataError(f"OMM {field_name} must be numeric.") from exc
    if not math.isfinite(number):
        raise SatelliteDataError(f"OMM {field_name} must be finite.")
    if minimum is not None and (number <= minimum if exclusive_minimum else number < minimum):
        raise SatelliteDataError(f"OMM {field_name} is below its supported range.")
    if maximum is not None and (number >= maximum if exclusive_maximum else number > maximum):
        raise SatelliteDataError(f"OMM {field_name} is above its supported range.")
    return number


def canonicalize_omm_record(record: object) -> dict[str, object]:
    """Validate one CelesTrak JSON record and return canonical OMM fields."""

    if not isinstance(record, dict):
        raise SatelliteDataError("OMM catalog rows must be JSON objects.")
    fields: dict[str, object] = {}
    for raw_key, raw_value in record.items():
        key = str(raw_key).strip().upper()
        if not key:
            raise SatelliteDataError("OMM field names cannot be empty.")
        if key in fields:
            raise SatelliteDataError(f"Duplicate OMM field after normalization: {key}")
        if isinstance(raw_value, (dict, list, bool)):
            raise SatelliteDataError(f"OMM {key} must be a scalar value.")
        if isinstance(raw_value, float) and not math.isfinite(raw_value):
            raise SatelliteDataError(f"OMM {key} must be finite.")
        fields[key] = raw_value

    for key, default in OMM_DEFAULTS.items():
        if fields.get(key) in (None, ""):
            fields[key] = default

    version = str(fields["CCSDS_OMM_VERS"]).strip()
    if not re.fullmatch(r"2(?:\.\d+)?", version):
        raise SatelliteDataError(f"Unsupported CCSDS OMM version: {version}")
    fields["CCSDS_OMM_VERS"] = version
    for key, expected in (
        ("CENTER_NAME", "EARTH"),
        ("REF_FRAME", "TEME"),
        ("TIME_SYSTEM", "UTC"),
        ("MEAN_ELEMENT_THEORY", "SGP4"),
    ):
        actual = str(fields[key]).strip().upper()
        if actual != expected:
            raise SatelliteDataError(f"Unsupported OMM {key}: {actual or '<empty>'}")
        fields[key] = expected

    name = str(fields.get("OBJECT_NAME") or "").strip()
    if not name:
        raise SatelliteDataError("OMM OBJECT_NAME is required.")
    fields["OBJECT_NAME"] = name
    fields["NORAD_CAT_ID"] = normalize_norad_id(fields.get("NORAD_CAT_ID"))
    fields["EPOCH"] = normalize_omm_epoch(fields.get("EPOCH"))

    for key, (minimum, maximum, exclusive_minimum) in OMM_REQUIRED_NUMBERS.items():
        fields[key] = _finite_omm_number(
            fields.get(key),
            key,
            minimum,
            maximum,
            exclusive_minimum=exclusive_minimum,
            exclusive_maximum=(key == "ECCENTRICITY"),
        )

    ephemeris_type = fields.get("EPHEMERIS_TYPE", 0)
    for key in OMM_INTEGER_FIELDS:
        if key not in fields and key != "EPHEMERIS_TYPE":
            continue
        number = _finite_omm_number(fields.get(key, ephemeris_type), key, 0.0, None)
        if not number.is_integer():
            raise SatelliteDataError(f"OMM {key} must be an integer.")
        fields[key] = int(number)
    if fields["EPHEMERIS_TYPE"] != 0:
        raise SatelliteDataError("Only OMM EPHEMERIS_TYPE 0 is supported.")

    for key in ("OBJECT_ID", "OBJECT_TYPE", "CLASSIFICATION_TYPE", "ORIGINATOR", "CREATION_DATE"):
        if key in fields and fields[key] is not None:
            fields[key] = str(fields[key]).strip()
    return fields


def extract_orbit_metrics_from_omm(omm: dict[str, object]) -> dict[str, float]:
    metrics: dict[str, float] = {
        "inclination_deg": float(omm["INCLINATION"]),
        "eccentricity": float(omm["ECCENTRICITY"]),
        "mean_motion_rev_per_day": float(omm["MEAN_MOTION"]),
    }
    mean_motion = metrics["mean_motion_rev_per_day"]
    eccentricity = metrics["eccentricity"]
    period_min = MINUTES_PER_DAY / mean_motion
    mean_motion_rad_per_sec = mean_motion * 2.0 * math.pi / 86400.0
    semi_major_axis_km = (EARTH_MU_KM3_S2 / (mean_motion_rad_per_sec * mean_motion_rad_per_sec)) ** (1.0 / 3.0)
    perigee_km = semi_major_axis_km * (1.0 - eccentricity) - EARTH_RADIUS_KM
    apogee_km = semi_major_axis_km * (1.0 + eccentricity) - EARTH_RADIUS_KM
    metrics.update(
        {
            "period_min": period_min,
            "semi_major_axis_km": semi_major_axis_km,
            "perigee_km": perigee_km,
            "apogee_km": apogee_km,
            "estimated_altitude_km": (perigee_km + apogee_km) / 2.0,
        }
    )
    return metrics


def normalize_object_type(value: object) -> str:
    normalized = str(value or "").strip().upper()
    if normalized in {"PAY", "PAYLOAD", "SAT", "SATELLITE"}:
        return "PAYLOAD"
    if normalized in {"R/B", "RB", "ROCKET BODY", "ROCKET_BODY", "ROCKETBODY"}:
        return "ROCKET_BODY"
    if normalized in {"DEB", "DEBRIS", "FRAGMENT", "FRAGMENTATION_DEBRIS"}:
        return "DEBRIS"
    if normalized in {"M/R", "MR", "MISSION RELATED", "MISSION_RELATED"}:
        return "MISSION_RELATED"
    return "UNKNOWN"


def satcat_lifecycle_status(record: dict[str, str] | None) -> str:
    if not record:
        return "UNKNOWN"
    if str(record.get("DECAY_DATE") or "").strip():
        return "DECAYED"
    code = str(record.get("OPS_STATUS_CODE") or "").strip().upper()
    if code in {"+", "P", "B", "S", "X"}:
        return "ACTIVE"
    if code in {"-", "N"}:
        return "INACTIVE"
    if code == "D":
        return "DECAYED"
    return "UNKNOWN"


def satcat_records_from_text(text: str) -> dict[str, dict[str, str]]:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "NORAD_CAT_ID" not in reader.fieldnames:
        raise SatelliteDataError("SATCAT CSV is missing NORAD_CAT_ID.")
    records: dict[str, dict[str, str]] = {}
    for row in reader:
        try:
            norad = normalize_norad_id(row.get("NORAD_CAT_ID"))
        except SatelliteDataError:
            continue
        records[norad] = {key: str(value or "").strip() for key, value in row.items() if key}
        records[norad]["NORAD_CAT_ID"] = norad
    return records


def load_satcat_records(root: Path | str) -> dict[str, dict[str, str]]:
    path = repo_path(root, SATCAT_RELATIVE_PATH)
    if not path.exists():
        return {}
    return satcat_records_from_text(path.read_text(encoding="utf-8"))


def transform_satellite_omm_object(
    record: object,
    satcat_records: dict[str, dict[str, str]] | None = None,
) -> dict[str, object]:
    omm = canonicalize_omm_record(record)
    norad_id = str(omm["NORAD_CAT_ID"])
    satcat = (satcat_records or {}).get(norad_id, {})
    metrics = extract_orbit_metrics_from_omm(omm)
    orbit = determine_orbit(metrics)
    satellite_name = str(satcat.get("OBJECT_NAME") or omm["OBJECT_NAME"]).strip()
    international_designator = str(satcat.get("OBJECT_ID") or omm.get("OBJECT_ID") or "").strip() or None
    launch_date = _valid_launch_date(satcat.get("LAUNCH_DATE")) or "no data"
    object_type = normalize_object_type(satcat.get("OBJECT_TYPE") or omm.get("OBJECT_TYPE"))
    lifecycle_status = satcat_lifecycle_status(satcat)
    satellite: dict[str, object] = {
        "company": "CELESTRAK",
        "name": satellite_name,
        "satellite_name": satellite_name,
        "object_id": f"obx:norad:{norad_id}",
        "norad_id": norad_id,
        "international_designator": international_designator,
        "launch_date": launch_date,
        "launch_site": str(satcat.get("LAUNCH_SITE") or "").strip() or None,
        "decay_date": _valid_launch_date(satcat.get("DECAY_DATE")) or None,
        "object_type": object_type,
        "lifecycle_status": lifecycle_status,
        "operational_status": lifecycle_status,
        "type": orbit,
        "orbit_class": orbit,
        "source_format": "CCSDS_OMM_JSON",
        "tle_line1": None,
        "tle_line2": None,
        "element_set": {
            "format": "OMM",
            "source": "CELESTRAK",
            "epoch": omm["EPOCH"],
            "time_scale": "UTC",
            "native_frame": "TEME",
            "propagation_theory": "SGP4",
            "line1": None,
            "line2": None,
            "omm": omm,
        },
    }
    satellite.update(metrics)
    return satellite


def load_launch_dates(root: Path | str) -> dict[str, str]:
    path = repo_path(root, LAUNCH_DATES_RELATIVE_PATH)
    payload = load_json(path, [])
    launch_dates: dict[str, str] = {}
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                norad = str(item.get("norad_id", "")).strip()
                launch_date = str(item.get("launch_date", "")).strip()
                if norad and launch_date:
                    launch_dates[norad] = launch_date
    return launch_dates


def _valid_launch_date(value: object) -> str:
    text = str(value or "").strip()
    if not text or text.lower() == "no data":
        return ""
    try:
        dt.date.fromisoformat(text)
    except ValueError:
        return ""
    return text


def load_satcat_launch_dates(root: Path | str) -> dict[str, dict[str, str]]:
    path = repo_path(root, SATCAT_RELATIVE_PATH)
    if not path.exists():
        return {}
    records: dict[str, dict[str, str]] = {}
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            return {}
        for row in reader:
            try:
                norad = normalize_norad_id(row.get("NORAD_CAT_ID"))
            except SatelliteDataError:
                continue
            launch_date = _valid_launch_date(row.get("LAUNCH_DATE"))
            if not launch_date:
                continue
            records[norad] = {
                "norad_id": norad,
                "name": str(row.get("OBJECT_NAME") or "").strip(),
                "launch_date": launch_date,
                "launch_site": str(row.get("LAUNCH_SITE") or "").strip(),
            }
    return records


def catalog_revision_for_payload(payload: object) -> str:
    material = json.dumps(
        payload,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(material).hexdigest()


def catalog_revision_for_text(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def reconciliation_snapshot_is_current(meta: dict[str, object], revision: str | None) -> bool:
    reconciled_revision = meta.get("last_reconciled_catalog_revision")
    return bool(
        revision
        and isinstance(reconciled_revision, str)
        and reconciled_revision == revision
        and meta.get("last_reconciled_at")
    )


def is_meaningful_company_tag(value: object) -> bool:
    return str(value or "").strip().upper() not in PLACEHOLDER_COMPANY_TAGS


def load_gp_company_tag_enrichment(root: Path | str) -> tuple[dict[str, str], dict[str, object]]:
    """Load first-group operator/category tags from the v2.2 TLE compatibility catalog."""

    tle_path = repo_path(root, TLE_RELATIVE_PATH)
    payload = load_json(tle_path, [])
    records = payload if isinstance(payload, list) else []
    tags: dict[str, str] = {}
    for record in records:
        if not isinstance(record, dict):
            continue
        norad_id = str(record.get("norad_id") or "").strip()
        company = str(record.get("company") or "").strip().upper()
        if norad_id and norad_id not in tags and is_meaningful_company_tag(company):
            tags[norad_id] = company

    tle_meta = load_json(repo_path(root, TLE_META_RELATIVE_PATH), {})
    source_catalog_revision = None
    if isinstance(tle_meta, dict):
        source_catalog_revision = tle_meta.get("catalog_revision") or tle_meta.get("dataset_hash")
    tag_material = [
        {"norad_id": norad_id, "company": tags[norad_id]}
        for norad_id in sorted(tags, key=lambda value: (int(value), value))
    ]
    return tags, {
        "source": TLE_RELATIVE_PATH.as_posix(),
        "source_catalog_revision": source_catalog_revision,
        "tag_map_revision": catalog_revision_for_payload(tag_material),
        "available_tags": len(tags),
    }


def enrich_gp_company_tags(
    records: Iterable[dict[str, object]],
    company_tags: dict[str, str],
    *,
    existing: Iterable[dict[str, object]] | None = None,
) -> tuple[list[dict[str, object]], dict[str, int]]:
    """Apply stable catalog tags without weakening full-string NORAD identity."""

    existing_by_norad = {
        str(item.get("norad_id") or "").strip(): item
        for item in (existing or [])
        if isinstance(item, dict) and str(item.get("norad_id") or "").strip()
    }
    enriched: list[dict[str, object]] = []
    changed = 0
    matched = 0
    tagged = 0
    for item in records:
        record = dict(item)
        norad_id = str(record.get("norad_id") or "").strip()
        source_tag = str(company_tags.get(norad_id) or "").strip().upper()
        previous_tag = str(existing_by_norad.get(norad_id, {}).get("company") or "").strip().upper()
        current_tag = str(record.get("company") or "").strip().upper()
        if is_meaningful_company_tag(source_tag):
            selected_tag = source_tag
            matched += 1
        elif is_meaningful_company_tag(previous_tag):
            selected_tag = previous_tag
        else:
            selected_tag = current_tag or "ACTIVE"
        if selected_tag != current_tag:
            record["company"] = selected_tag
            changed += 1
        if is_meaningful_company_tag(selected_tag):
            tagged += 1
        enriched.append(record)

    return enriched, {
        "tag_enriched": changed,
        "tag_source_matches": matched,
        "tagged": tagged,
        "tag_unmatched": max(0, len(enriched) - tagged),
    }


def refresh_gp_catalog_enrichment(
    records: Iterable[dict[str, object]],
    company_tags: dict[str, str],
    *,
    existing: Iterable[dict[str, object]] | None = None,
) -> tuple[list[dict[str, object]], dict[str, int]]:
    enriched, counts = enrich_gp_company_tags(records, company_tags, existing=existing)
    enriched, orbit_reclassified = refresh_catalog_orbit_classes(enriched)
    counts["orbit_reclassified"] = orbit_reclassified
    return enriched, counts


def enrich_gp_from_satcat(
    records: Iterable[dict[str, object]],
    satcat_records: dict[str, dict[str, str]],
) -> tuple[list[dict[str, object]], int]:
    """Refresh descriptive lifecycle fields without changing orbital elements."""

    enriched: list[dict[str, object]] = []
    changed = 0
    for item in records:
        record = dict(item)
        try:
            norad_id = normalize_norad_id(record.get("norad_id"))
        except SatelliteDataError:
            enriched.append(record)
            continue
        record["norad_id"] = norad_id
        satcat = satcat_records.get(norad_id)
        if satcat:
            before = dict(record)
            satellite_name = str(satcat.get("OBJECT_NAME") or record.get("satellite_name") or record.get("name") or "").strip()
            lifecycle_status = satcat_lifecycle_status(satcat)
            if satellite_name:
                record["name"] = satellite_name
                record["satellite_name"] = satellite_name
            record.update(
                {
                    "international_designator": str(satcat.get("OBJECT_ID") or "").strip() or record.get("international_designator"),
                    "launch_date": _valid_launch_date(satcat.get("LAUNCH_DATE")) or record.get("launch_date") or "no data",
                    "launch_site": str(satcat.get("LAUNCH_SITE") or "").strip() or record.get("launch_site"),
                    "decay_date": _valid_launch_date(satcat.get("DECAY_DATE")) or None,
                    "object_type": normalize_object_type(satcat.get("OBJECT_TYPE")),
                    "lifecycle_status": lifecycle_status,
                    "operational_status": lifecycle_status,
                }
            )
            if record != before:
                changed += 1
        enriched.append(record)
    return enriched, changed


def refresh_catalog_orbit_classes(
    records: Iterable[dict[str, object]],
) -> tuple[list[dict[str, object]], int]:
    refreshed = [dict(record) for record in records]
    orbit_reclassified = 0
    for record in refreshed:
        orbit_class = determine_orbit(record)
        if orbit_class == "no data":
            continue
        if record.get("orbit_class") != orbit_class or record.get("type") != orbit_class:
            record["orbit_class"] = orbit_class
            record["type"] = orbit_class
            orbit_reclassified += 1
    return refreshed, orbit_reclassified


def launch_events_from_satcat_records(records: dict[str, dict[str, str]]) -> list[dict[str, object]]:
    launches: list[dict[str, object]] = []
    for norad_id, row in records.items():
        if normalize_object_type(row.get("OBJECT_TYPE")) != "PAYLOAD":
            continue
        launch_date = _valid_launch_date(row.get("LAUNCH_DATE"))
        if not launch_date:
            continue
        satellite_name = str(row.get("OBJECT_NAME") or f"NORAD {norad_id}").strip()
        international_designator = str(row.get("OBJECT_ID") or "").strip() or None
        lifecycle_status = satcat_lifecycle_status(row)
        launches.append(
            {
                "object_id": f"obx:norad:{norad_id}",
                "norad_id": norad_id,
                "name": satellite_name,
                "satellite_name": satellite_name,
                "international_designator": international_designator,
                "object_type": normalize_object_type(row.get("OBJECT_TYPE")),
                "lifecycle_status": lifecycle_status,
                "operational_status": lifecycle_status,
                "launch_date": launch_date,
                "launch_site": str(row.get("LAUNCH_SITE") or "").strip() or None,
                "decay_date": _valid_launch_date(row.get("DECAY_DATE")) or None,
                "orbit_available": False,
                "details_only": True,
                "source": "CELESTRAK_SATCAT",
            }
        )
    launches.sort(key=lambda item: (str(item["launch_date"]), int(str(item["norad_id"]))))
    return launches


def merge_historical_launch_events(
    existing: Iterable[dict[str, object]],
    current: Iterable[dict[str, object]],
) -> tuple[list[dict[str, object]], int]:
    """Upsert current SATCAT rows without deleting previously observed launches."""

    by_norad: dict[str, dict[str, object]] = {}
    for item in existing:
        if not isinstance(item, dict):
            continue
        try:
            norad_id = normalize_norad_id(item.get("norad_id"))
        except SatelliteDataError:
            continue
        record = dict(item)
        record["norad_id"] = norad_id
        by_norad.setdefault(norad_id, record)
    previous_ids = set(by_norad)
    current_ids: set[str] = set()
    for item in current:
        if not isinstance(item, dict):
            continue
        try:
            norad_id = normalize_norad_id(item.get("norad_id"))
        except SatelliteDataError:
            continue
        record = dict(item)
        record["norad_id"] = norad_id
        by_norad[norad_id] = record
        current_ids.add(norad_id)

    launches = sorted(
        by_norad.values(),
        key=lambda item: (
            str(item.get("launch_date") or ""),
            int(str(item["norad_id"])),
        ),
    )
    return launches, len(previous_ids - current_ids)


def build_launch_catalog(
    *,
    root: Path | str,
    dry_run: bool = False,
    now: dt.datetime | None = None,
    satcat_text: str | None = None,
    mode: str = "incremental",
) -> UpdateResult:
    now = now or utc_now()
    root_path = Path(root).resolve()
    output_path = repo_path(root_path, LAUNCHES_RELATIVE_PATH)
    meta_path = repo_path(root_path, LAUNCHES_META_RELATIVE_PATH)
    input_path = repo_path(root_path, SATCAT_RELATIVE_PATH)
    try:
        source_text = satcat_text if satcat_text is not None else input_path.read_text(encoding="utf-8")
        records = satcat_records_from_text(source_text)
        current_launches = launch_events_from_satcat_records(records)
    except Exception as exc:
        existing_meta = load_json(meta_path, {})
        failed_meta = dict(existing_meta) if isinstance(existing_meta, dict) else {}
        failed_meta.update(
            {
                "last_attempt_at": isoformat_utc(now),
                "last_status": "failed",
                "last_error": str(exc),
                "source": SATCAT_RELATIVE_PATH.as_posix(),
            }
        )
        atomic_write_json(meta_path, failed_meta, dry_run=dry_run, backup=False, indent=2)
        return UpdateResult(
            changed=False,
            skipped=True,
            mode="build-launches",
            message="SATCAT unavailable or invalid; preserved existing launch catalog.",
            errors=[str(exc)],
            paths={"launches": str(output_path), "metadata": str(meta_path), "satcat": str(input_path)},
        )

    previous_payload = load_json(output_path, [])
    previous = previous_payload if isinstance(previous_payload, list) else []
    launches, retained_history = merge_historical_launch_events(previous, current_launches)
    changed = not isinstance(previous_payload, list) or previous != launches
    if changed:
        atomic_write_json(output_path, launches, dry_run=dry_run, backup=True)
    newest_launch_date = max((str(item["launch_date"]) for item in launches), default=None)
    revision = catalog_revision_for_payload(launches)
    previous_meta = load_json(meta_path, {})
    previous_meta = previous_meta if isinstance(previous_meta, dict) else {}
    success_meta = {
        "schema_version": "2.2.0",
        "built_at": isoformat_utc(now),
        "last_success_at": isoformat_utc(now),
        "last_attempt_at": isoformat_utc(now),
        "last_status": "ok",
        "mode": mode,
        "source": SATCAT_RELATIVE_PATH.as_posix(),
        "catalog_revision": revision,
        "dataset_hash": revision,
        "newest_launch_date": newest_launch_date,
        "counts": {
            "satcat_records": len(records),
            "source_records": len(current_launches),
            "retained_history": retained_history,
            "records": len(launches),
            "six_digit_ids": sum(len(str(item["norad_id"])) >= 6 for item in launches),
        },
    }
    if mode == RECONCILIATION_MODE:
        success_meta["last_reconciled_at"] = isoformat_utc(now)
        success_meta["last_reconciled_catalog_revision"] = revision
    elif previous_meta.get("last_reconciled_at"):
        success_meta["last_reconciled_at"] = previous_meta["last_reconciled_at"]
        if previous_meta.get("last_reconciled_catalog_revision"):
            success_meta["last_reconciled_catalog_revision"] = previous_meta["last_reconciled_catalog_revision"]
    atomic_write_json(meta_path, success_meta, dry_run=dry_run, backup=False, indent=2)
    return UpdateResult(
        changed=changed and not dry_run,
        skipped=False,
        mode="build-launches",
        message="Launch catalog build completed." if changed else "Launch catalog already current.",
        counts=dict(success_meta["counts"]),
        paths={"launches": str(output_path), "metadata": str(meta_path), "satcat": str(input_path)},
    )


def merge_launch_date_sidecar_from_satcat(
    root: Path | str,
    satellites: list[dict[str, object]],
    *,
    dry_run: bool = False,
) -> dict[str, int]:
    satcat_launch_dates = load_satcat_launch_dates(root)
    if not satcat_launch_dates:
        return {"sidecar_added": 0, "sidecar_updated": 0, "satellite_launch_dates_updated": 0}

    output_path = repo_path(root, LAUNCH_DATES_RELATIVE_PATH)
    payload = load_json(output_path, [])
    existing_items = payload if isinstance(payload, list) else []
    by_norad: dict[str, dict[str, str]] = {}
    order: list[str] = []
    for item in existing_items:
        if not isinstance(item, dict):
            continue
        try:
            norad = normalize_norad_id(item.get("norad_id"))
        except SatelliteDataError:
            continue
        if norad in by_norad:
            continue
        by_norad[norad] = {
            "norad_id": norad,
            "name": str(item.get("name") or "").strip(),
            "launch_date": str(item.get("launch_date") or "").strip(),
        }
        order.append(norad)

    added = 0
    updated = 0
    satellite_launch_dates_updated = 0
    for sat in satellites:
        try:
            norad = normalize_norad_id(sat.get("norad_id"))
        except SatelliteDataError:
            continue
        sat["norad_id"] = norad
        satcat_record = satcat_launch_dates.get(norad)
        launch_date = satcat_record.get("launch_date") if satcat_record else ""
        if not launch_date:
            continue

        existing = by_norad.get(norad)
        if not existing:
            by_norad[norad] = {
                "norad_id": norad,
                "name": satcat_record.get("name") or str(sat.get("satellite_name") or "").strip(),
                "launch_date": launch_date,
            }
            order.append(norad)
            added += 1
        elif _valid_launch_date(existing.get("launch_date")) != launch_date:
            existing["launch_date"] = launch_date
            if not existing.get("name"):
                existing["name"] = satcat_record.get("name") or str(sat.get("satellite_name") or "").strip()
            updated += 1

        if _valid_launch_date(sat.get("launch_date")) != launch_date:
            sat["launch_date"] = launch_date
            satellite_launch_dates_updated += 1

    if added or updated:
        merged = [by_norad[norad] for norad in order if norad in by_norad]
        atomic_write_json(output_path, merged, dry_run=dry_run, backup=True)

    return {
        "sidecar_added": added,
        "sidecar_updated": updated,
        "satellite_launch_dates_updated": satellite_launch_dates_updated,
    }


def transform_satellite_tle_object(
    company: str,
    name_line: str | None,
    tle_line1: str | None,
    tle_line2: str | None,
    launch_dates: dict[str, str] | None = None,
) -> dict[str, object]:
    norad_id = tle_norad_from_line1(tle_line1)
    metrics = extract_orbit_metrics(tle_line2)
    orbit = determine_orbit(metrics)
    sat: dict[str, object] = {
        "company": company or "no data",
        "satellite_name": name_line.strip() if name_line else "no data",
        "norad_id": norad_id,
        "launch_date": (launch_dates or {}).get(norad_id, "no data"),
        "type": orbit,
        "orbit_class": orbit,
    }
    sat.update(metrics)
    sat["tle_line1"] = tle_line1.strip() if tle_line1 else "no data"
    sat["tle_line2"] = tle_line2.strip() if tle_line2 else "no data"
    return sat


def tle_epoch_datetime(line1: str | None) -> dt.datetime | None:
    if not line1 or len(line1) < 32:
        return None
    try:
        year_two = int(line1[18:20])
        day_of_year = float(line1[20:32])
    except ValueError:
        return None
    year = 2000 + year_two if year_two < 57 else 1900 + year_two
    day_integer = int(day_of_year)
    day_fraction = day_of_year - day_integer
    start = dt.datetime(year, 1, 1, tzinfo=dt.timezone.utc)
    return start + dt.timedelta(days=day_integer - 1, seconds=day_fraction * 86400.0)


def should_replace_tle(existing: dict[str, object] | None, candidate: dict[str, object]) -> bool:
    if not existing:
        return True
    existing_epoch = tle_epoch_datetime(str(existing.get("tle_line1", "")))
    candidate_epoch = tle_epoch_datetime(str(candidate.get("tle_line1", "")))
    if existing_epoch is None:
        return candidate_epoch is not None
    if candidate_epoch is None:
        return False
    return candidate_epoch > existing_epoch


def preserve_existing_tags(existing: dict[str, object], candidate: dict[str, object]) -> dict[str, object]:
    merged = dict(candidate)
    if is_meaningful_company_tag(existing.get("company")):
        merged["company"] = existing["company"]
    if existing.get("launch_date") and existing.get("launch_date") != "no data" and candidate.get("launch_date") == "no data":
        merged["launch_date"] = existing["launch_date"]
    return merged


def source_urls_for_mode(mode: str) -> list[str]:
    if mode == "all":
        return list(LEGACY_TLE_SOURCE_URLS)
    return [make_celestrak_group_url(group) for group in INCREMENTAL_TLE_GROUPS]


def _metadata_request_headers(meta: dict[str, object], url: str) -> dict[str, str]:
    urls = meta.get("urls")
    headers: dict[str, str] = {}
    if isinstance(urls, dict):
        url_meta = urls.get(url)
        if isinstance(url_meta, dict):
            etag = url_meta.get("etag")
            last_modified = url_meta.get("last_modified")
            if isinstance(etag, str) and etag:
                headers["If-None-Match"] = etag
            if isinstance(last_modified, str) and last_modified:
                headers["If-Modified-Since"] = last_modified
    return headers


def fetch_tle_sources(
    urls: Iterable[str],
    *,
    fetcher: Callable[..., FetchResponse] | None = None,
    meta: dict[str, object] | None = None,
) -> tuple[list[tuple[str, FetchResponse]], list[FetchResponse], list[str]]:
    fetcher = fetcher or fetch_url
    meta = meta or {}
    responses: list[tuple[str, FetchResponse]] = []
    not_modified: list[FetchResponse] = []
    errors: list[str] = []
    for url in urls:
        try:
            validated_url = require_https_ingestion_url(url)
            response = fetcher(validated_url, headers=_metadata_request_headers(meta, validated_url))
            if response.not_modified or response.status == 304:
                not_modified.append(response)
            else:
                responses.append((extract_group_from_url(validated_url), response))
        except Exception as exc:
            errors.append(f"{url}: {exc}")
    return responses, not_modified, errors


def build_satellites_from_tle_responses(
    responses: Iterable[tuple[str, FetchResponse]],
    launch_dates: dict[str, str],
    *,
    existing: list[dict[str, object]] | None = None,
    mode: str,
) -> tuple[list[dict[str, object]], dict[str, int]]:
    current = list(existing or [])
    by_norad: dict[str, dict[str, object]] = {}
    order: list[str] = []
    for record in current:
        try:
            norad = normalize_norad_id(record.get("norad_id"))
        except SatelliteDataError:
            continue
        if norad not in by_norad:
            by_norad[norad] = dict(record)
            by_norad[norad]["norad_id"] = norad
            order.append(norad)
    initial_norad_ids = set(by_norad)
    updated_initial_ids: set[str] = set()

    added = 0
    updated = 0
    rejected = 0
    fetched = 0

    for company, response in responses:
        for name, line1, line2 in parse_tle_text(response.text):
            fetched += 1
            if not validate_tle_pair(line1, line2):
                rejected += 1
                continue
            candidate = transform_satellite_tle_object(company, name, line1, line2, launch_dates)
            try:
                norad = normalize_norad_id(candidate.get("norad_id"))
            except SatelliteDataError:
                rejected += 1
                continue
            candidate["norad_id"] = norad
            existing_record = by_norad.get(norad)
            if mode == "all":
                if existing_record is None:
                    by_norad[norad] = candidate
                    order.append(norad)
                    added += 1
            elif existing_record is None:
                by_norad[norad] = candidate
                order.append(norad)
                added += 1
            elif should_replace_tle(existing_record, candidate):
                by_norad[norad] = preserve_existing_tags(existing_record, candidate)
                updated += 1
                if norad in initial_norad_ids:
                    updated_initial_ids.add(norad)

    return [by_norad[norad] for norad in order], {
        "existing": len(existing or []),
        "fetched": fetched,
        "added": added,
        "updated": updated,
        "retained": len(initial_norad_ids - updated_initial_ids),
        "rejected": rejected,
        "total": len(order),
    }


def validate_complete_tle_snapshot(responses: Iterable[tuple[str, FetchResponse]]) -> str | None:
    response_list = list(responses)
    if not response_list:
        return "Complete active TLE reconciliation returned no response."
    for _company, response in response_list:
        lines = [line.strip() for line in response.text.splitlines() if line.strip()]
        blocks = parse_tle_text(response.text)
        if not blocks:
            return f"Complete active TLE reconciliation returned no usable records from {response.url}."
        if len(lines) != len(blocks) * 3:
            return f"Complete active TLE reconciliation returned a structurally incomplete response from {response.url}."
        if any(not tle_checksum_is_valid(line) for _name, line1, line2 in blocks for line in (line1, line2)):
            return f"Complete active TLE reconciliation returned a checksum-invalid response from {response.url}."
    return None


def update_tle_failure_metadata(
    meta_path: Path,
    meta: dict[str, object],
    *,
    mode: str,
    errors: list[str],
    now: dt.datetime,
    dry_run: bool,
) -> None:
    failed_meta = dict(meta)
    failed_meta.update(
        {
            "mode": mode,
            "last_attempt_at": isoformat_utc(now),
            "last_error": "; ".join(errors)[:1000],
            "last_status": "failed",
        }
    )
    atomic_write_json(meta_path, failed_meta, dry_run=dry_run, backup=False, indent=2)


def update_tle_success_metadata(
    meta_path: Path,
    meta: dict[str, object],
    *,
    mode: str,
    source_urls: list[str],
    responses: list[tuple[str, FetchResponse]],
    counts: dict[str, int],
    catalog_revision: str,
    now: dt.datetime,
    dry_run: bool,
) -> None:
    prior_urls = dict(meta.get("urls", {})) if isinstance(meta.get("urls"), dict) else {}
    url_meta = {
        url: dict(prior_urls[url])
        for url in source_urls
        if isinstance(prior_urls.get(url), dict)
    }
    for _company, response in responses:
        existing = dict(url_meta.get(response.url, {})) if isinstance(url_meta.get(response.url), dict) else {}
        etag = response.headers.get("etag")
        last_modified = response.headers.get("last-modified")
        if etag:
            existing["etag"] = etag
        if last_modified:
            existing["last_modified"] = last_modified
        existing["status"] = response.status
        existing["last_attempt_at"] = isoformat_utc(now)
        url_meta[response.url] = existing
    success_meta = {
        "schema_version": "2.2.0",
        "dataset_format": "TLE_JSON_COMPATIBILITY",
        "deprecated_compatibility": True,
        "fetched_at": isoformat_utc(now),
        "last_success_at": isoformat_utc(now),
        "last_attempt_at": isoformat_utc(now),
        "last_status": "ok",
        "mode": mode,
        "source_urls": source_urls,
        "celestrak_min_refresh_hours": CELESTRAK_MIN_REFRESH_HOURS,
        "counts": counts,
        "catalog_revision": catalog_revision,
        "dataset_hash": catalog_revision,
        "urls": url_meta,
    }
    if mode == RECONCILIATION_MODE:
        success_meta.update(
            {
                "last_reconciled_at": isoformat_utc(now),
                "last_reconciled_catalog_revision": catalog_revision,
                "source_status": "COMPLETE",
                "partial_update": False,
            }
        )
    else:
        if meta.get("last_reconciled_at"):
            success_meta["last_reconciled_at"] = meta["last_reconciled_at"]
        if meta.get("last_reconciled_catalog_revision"):
            success_meta["last_reconciled_catalog_revision"] = meta["last_reconciled_catalog_revision"]
        success_meta["source_status"] = "PARTIAL"
        success_meta["partial_update"] = True
    atomic_write_json(meta_path, success_meta, dry_run=dry_run, backup=False, indent=2)


def export_tle_data(
    *,
    root: Path | str,
    mode: str = "incremental",
    force: bool = False,
    dry_run: bool = False,
    fetcher: Callable[..., FetchResponse] | None = None,
    now: dt.datetime | None = None,
    celestrak_min_refresh_hours: float = CELESTRAK_MIN_REFRESH_HOURS,
    allow_space_track: bool = False,
    allow_large_reconciliation_shrink: bool = False,
) -> UpdateResult:
    now = now or utc_now()
    root_path = Path(root).resolve()
    tle_path = repo_path(root_path, TLE_RELATIVE_PATH)
    meta_path = repo_path(root_path, TLE_META_RELATIVE_PATH)
    launch_dates_path = repo_path(root_path, LAUNCH_DATES_RELATIVE_PATH)
    launch_dates_existed = launch_dates_path.exists()
    last_known_good_launch_dates_text = (
        launch_dates_path.read_text(encoding="utf-8")
        if mode in {"all", RECONCILIATION_MODE} and launch_dates_existed
        else None
    )
    launch_dates = load_launch_dates(root_path)
    meta = load_json(meta_path, {})
    if not isinstance(meta, dict):
        meta = {}
    last_known_good_meta = dict(meta)
    last_known_good_text = (
        tle_path.read_text(encoding="utf-8")
        if mode in {"all", RECONCILIATION_MODE} and tle_path.exists()
        else None
    )

    def reject_complete_replacement(
        error: str,
        message: str,
        counts: dict[str, int],
    ) -> UpdateResult:
        _restore_text_snapshot(
            tle_path,
            last_known_good_text,
            originally_existed=last_known_good_text is not None,
            dry_run=dry_run,
        )
        _restore_text_snapshot(
            launch_dates_path,
            last_known_good_launch_dates_text,
            originally_existed=launch_dates_existed,
            dry_run=dry_run,
        )
        update_tle_failure_metadata(
            meta_path,
            last_known_good_meta,
            mode=mode,
            errors=[error],
            now=now,
            dry_run=dry_run,
        )
        return UpdateResult(
            changed=False,
            skipped=True,
            mode=mode,
            message=message,
            counts=counts,
            errors=[error],
            paths={"tle": str(tle_path), "metadata": str(meta_path)},
        )

    existing_payload = load_json(tle_path, [])
    existing = existing_payload if isinstance(existing_payload, list) else []
    configured_source_urls = source_urls_for_mode(mode)

    existing, local_orbit_reclassified = refresh_catalog_orbit_classes(existing)
    local_sidecar_counts = merge_launch_date_sidecar_from_satcat(root_path, existing, dry_run=dry_run)
    local_tle_changed = (
        local_orbit_reclassified > 0
        or local_sidecar_counts["satellite_launch_dates_updated"] > 0
    )
    local_sidecar_changed = (
        local_sidecar_counts["sidecar_added"] > 0
        or local_sidecar_counts["sidecar_updated"] > 0
    )
    local_changed = local_tle_changed or local_sidecar_changed
    current_revision = catalog_revision_for_payload(existing)
    metadata_needs_refresh = (
        meta.get("catalog_revision") != current_revision
        or meta.get("dataset_hash") != current_revision
        or meta.get("source_urls") != configured_source_urls
    )
    if local_changed or metadata_needs_refresh:
        if local_tle_changed:
            atomic_write_json(tle_path, existing, dry_run=dry_run, backup=True)
        local_meta = dict(meta)
        local_counts = dict(local_meta.get("counts", {})) if isinstance(local_meta.get("counts"), dict) else {}
        local_counts["orbit_reclassified"] = local_orbit_reclassified
        local_counts.update(local_sidecar_counts)
        local_meta.update(
            {
                "catalog_revision": current_revision,
                "dataset_hash": current_revision,
                "source_urls": configured_source_urls,
                "urls": {
                    url: details
                    for url, details in (local_meta.get("urls", {}) if isinstance(local_meta.get("urls"), dict) else {}).items()
                    if url in configured_source_urls
                },
                "counts": local_counts,
                "last_local_enrichment_at": isoformat_utc(now),
            }
        )
        atomic_write_json(meta_path, local_meta, dry_run=dry_run, backup=False, indent=2)
        meta = local_meta

    if mode != "all" and not force:
        latest = latest_success_time(meta, tle_path)
        if is_recent_enough(latest, celestrak_min_refresh_hours, now=now):
            return UpdateResult(
                changed=local_changed and not dry_run,
                skipped=True,
                mode=mode,
                message=(
                    "TLE local orbit classification refresh completed; provider fetch skipped by the refresh guard."
                    if local_changed
                    else f"TLE update skipped; last successful fetch is newer than {celestrak_min_refresh_hours:g} hours."
                ),
                counts={
                    "existing": len(existing),
                    "total": len(existing),
                    "orbit_reclassified": local_orbit_reclassified,
                    **local_sidecar_counts,
                },
                paths={"tle": str(tle_path), "metadata": str(meta_path)},
            )

    source_urls = configured_source_urls
    complete_snapshot_current = reconciliation_snapshot_is_current(meta, current_revision)
    request_meta = meta
    if mode == RECONCILIATION_MODE and not complete_snapshot_current:
        request_meta = {key: value for key, value in meta.items() if key != "urls"}
    responses, not_modified, errors = fetch_tle_sources(source_urls, fetcher=fetcher, meta=request_meta)
    if errors and allow_space_track and mode != RECONCILIATION_MODE:
        fallback_response = try_spacetrack_fallback()
        if fallback_response:
            responses.append(("SPACE-TRACK", fallback_response))
            errors = []

    if errors and mode == "all":
        update_tle_failure_metadata(meta_path, meta, mode=mode, errors=errors, now=now, dry_run=dry_run)
        raise SatelliteDataError("--all TLE export failed before writing because one or more required sources failed.")
    if errors and (not responses or mode == RECONCILIATION_MODE):
        update_tle_failure_metadata(meta_path, meta, mode=mode, errors=errors, now=now, dry_run=dry_run)
        return UpdateResult(
            changed=local_changed and not dry_run,
            skipped=True,
            mode=mode,
            message="CelesTrak unavailable; preserved existing TLE data.",
            counts={"existing": len(existing), "total": len(existing)},
            errors=errors,
            paths={"tle": str(tle_path), "metadata": str(meta_path)},
        )

    if mode in {"all", RECONCILIATION_MODE} and responses and not_modified:
        mixed_response_error = (
            "Complete TLE replacement received mixed full and 304 source responses; "
            "unchanged groups cannot be reconstructed from an empty replacement base."
        )
        return reject_complete_replacement(
            mixed_response_error,
            "TLE replacement requires a coherent complete response set; preserved existing data.",
            {"existing": len(existing), "total": len(existing)},
        )

    if not_modified and not responses:
        if mode == RECONCILIATION_MODE and not complete_snapshot_current:
            reconciliation_error = "Cannot reconcile TLE data from 304 without a prior complete active snapshot."
            update_tle_failure_metadata(
                meta_path,
                meta,
                mode=mode,
                errors=[reconciliation_error],
                now=now,
                dry_run=dry_run,
            )
            return UpdateResult(
                changed=local_changed and not dry_run,
                skipped=True,
                mode=mode,
                message="TLE reconciliation requires a complete active response; preserved existing data.",
                counts={"existing": len(existing), "total": len(existing), **local_sidecar_counts},
                errors=[reconciliation_error],
                paths={"tle": str(tle_path), "metadata": str(meta_path)},
            )
        unchanged_meta = dict(meta)
        prior_urls = dict(meta.get("urls", {})) if isinstance(meta.get("urls"), dict) else {}
        url_meta = {
            url: dict(prior_urls[url])
            for url in source_urls
            if isinstance(prior_urls.get(url), dict)
        }
        for response in not_modified:
            existing_url_meta = dict(url_meta.get(response.url, {}))
            if response.headers.get("etag"):
                existing_url_meta["etag"] = response.headers["etag"]
            if response.headers.get("last-modified"):
                existing_url_meta["last_modified"] = response.headers["last-modified"]
            existing_url_meta["status"] = response.status
            existing_url_meta["last_attempt_at"] = isoformat_utc(now)
            url_meta[response.url] = existing_url_meta
        unchanged_meta.update(
            {
                "mode": mode,
                "source_urls": source_urls,
                "last_attempt_at": isoformat_utc(now),
                "last_success_at": isoformat_utc(now),
                "revalidated_at": isoformat_utc(now),
                "last_status": "not-modified",
                "catalog_revision": current_revision,
                "dataset_hash": current_revision,
                "urls": url_meta,
            }
        )
        if mode == RECONCILIATION_MODE:
            unchanged_meta["last_reconciled_at"] = isoformat_utc(now)
            unchanged_meta["last_reconciled_catalog_revision"] = current_revision
            unchanged_meta["source_status"] = "COMPLETE"
            unchanged_meta["partial_update"] = False
        unchanged_meta.pop("last_error", None)
        atomic_write_json(meta_path, unchanged_meta, dry_run=dry_run, backup=False, indent=2)
        return UpdateResult(
            changed=local_changed and not dry_run,
            skipped=True,
            mode=mode,
            message="CelesTrak TLE catalog was not modified; preserved existing data.",
            counts={
                "existing": len(existing),
                "total": len(existing),
                "orbit_reclassified": local_orbit_reclassified,
                **local_sidecar_counts,
            },
            paths={"tle": str(tle_path), "metadata": str(meta_path)},
        )

    if mode in {"all", RECONCILIATION_MODE}:
        completeness_error = (
            "Complete TLE replacement did not receive a full response from every configured source."
            if len(responses) != len(source_urls)
            else validate_complete_tle_snapshot(responses)
        )
        if completeness_error:
            return reject_complete_replacement(
                completeness_error,
                "TLE replacement response was incomplete; preserved existing data.",
                {"existing": len(existing), "total": len(existing), **local_sidecar_counts},
            )

    base_records = [] if mode in {"all", RECONCILIATION_MODE} else [
        dict(item) for item in existing if isinstance(item, dict)
    ]
    satellites, counts = build_satellites_from_tle_responses(responses, launch_dates, existing=base_records, mode=mode)
    if mode == RECONCILIATION_MODE:
        if counts.get("rejected", 0) or counts.get("total", 0) == 0:
            validation_error = "Complete active TLE reconciliation contained rejected records or no usable records."
            update_tle_failure_metadata(
                meta_path,
                meta,
                mode=mode,
                errors=[validation_error],
                now=now,
                dry_run=dry_run,
            )
            return UpdateResult(
                changed=local_changed and not dry_run,
                skipped=True,
                mode=mode,
                message="TLE reconciliation response failed record validation; preserved existing data.",
                counts=counts,
                errors=[validation_error],
                paths={"tle": str(tle_path), "metadata": str(meta_path)},
            )
        prior_by_norad = {
            str(item.get("norad_id") or "").strip(): item
            for item in existing
            if isinstance(item, dict) and str(item.get("norad_id") or "").strip()
        }
        satellites = [
            preserve_existing_tags(prior_by_norad.get(str(item.get("norad_id") or ""), {}), item)
            for item in satellites
        ]
        reconciled_by_norad = {
            str(item.get("norad_id") or ""): item
            for item in satellites
            if str(item.get("norad_id") or "")
        }
        current_ids = set(reconciled_by_norad)
        prior_ids = set(prior_by_norad)
        common_ids = prior_ids & current_ids
        updated = sum(
            reconciled_by_norad[norad_id] != prior_by_norad[norad_id]
            for norad_id in common_ids
        )
        counts.update(
            {
                "existing": len(prior_by_norad),
                "added": len(current_ids - prior_ids),
                "updated": updated,
                "retained": len(common_ids) - updated,
                "pruned": len(prior_ids - current_ids),
            }
        )
    if mode in {"all", RECONCILIATION_MODE}:
        previous_ids = catalog_norad_ids(existing)
        candidate_ids = catalog_norad_ids(satellites)
        shrink_error = reconciliation_shrink_error(
            "TLE",
            len(previous_ids),
            len(candidate_ids),
            len(previous_ids & candidate_ids),
            allow_large_reconciliation_shrink=allow_large_reconciliation_shrink,
        )
        if shrink_error:
            return reject_complete_replacement(
                shrink_error,
                "TLE catalog shrink guard rejected the response; preserved existing data.",
                counts,
            )
    sidecar_counts = merge_launch_date_sidecar_from_satcat(root_path, satellites, dry_run=dry_run)
    counts.update({
        key: sidecar_counts.get(key, 0) + local_sidecar_counts.get(key, 0)
        for key in sidecar_counts
    })
    changed = satellites != existing
    if changed:
        atomic_write_json(tle_path, satellites, dry_run=dry_run, backup=True)
    update_tle_success_metadata(
        meta_path,
        meta,
        mode=mode,
        source_urls=source_urls,
        responses=responses,
        counts=counts,
        catalog_revision=catalog_revision_for_payload(satellites),
        now=now,
        dry_run=dry_run,
    )
    return UpdateResult(
        changed=changed and not dry_run,
        skipped=False,
        mode=mode,
        message="TLE export completed." if changed else "TLE data already current.",
        counts=counts,
        errors=errors,
        paths={"tle": str(tle_path), "metadata": str(meta_path)},
    )


def gp_source_urls_for_mode(mode: str) -> list[str]:
    del mode
    return [make_celestrak_group_url(group, output_format="json") for group in GP_SOURCE_GROUPS]


def gp_source_scope_metadata(*, verified: bool) -> dict[str, object]:
    return {
        "source_groups": list(GP_SOURCE_GROUPS),
        "source_scope_verified": verified,
        "source_scope": {
            "kind": "configured-current-gp-collections",
            "active_group": "active",
            "event_debris_groups": list(GP_EVENT_DEBRIS_GROUPS),
            "all_debris": False,
        },
        "provider_completeness_claim": False,
    }


def gp_catalog_source_groups(meta: dict[str, object]) -> list[str]:
    explicit = meta.get("catalog_source_groups")
    if isinstance(explicit, list) and all(isinstance(item, str) and item for item in explicit):
        return list(dict.fromkeys(item.lower() for item in explicit))
    if meta.get("source_scope_verified") is True and meta.get("source_groups") == list(GP_SOURCE_GROUPS):
        return list(GP_SOURCE_GROUPS)
    if "source_scope_verified" not in meta:
        legacy = meta.get("source_groups")
        if isinstance(legacy, list) and all(isinstance(item, str) and item for item in legacy):
            return list(dict.fromkeys(item.lower() for item in legacy))
    urls = meta.get("urls")
    if isinstance(urls, dict):
        groups = [
            extract_group_from_url(url).lower()
            for url, item in urls.items()
            if isinstance(url, str)
            and isinstance(item, dict)
            and item.get("status") in {200, 304}
        ]
        if groups:
            return list(dict.fromkeys(groups))
    return []


def gp_source_scope_is_current(meta: dict[str, object]) -> bool:
    return (
        meta.get("source_groups") == list(GP_SOURCE_GROUPS)
        and meta.get("source_scope_verified") is True
        and gp_catalog_source_groups(meta) == list(GP_SOURCE_GROUPS)
    )


def fetch_omm_sources(
    urls: Iterable[str],
    *,
    fetcher: Callable[..., FetchResponse] | None = None,
    meta: dict[str, object] | None = None,
) -> tuple[list[tuple[str, FetchResponse]], list[FetchResponse], list[str]]:
    fetcher = fetcher or fetch_url
    meta = meta or {}
    responses: list[tuple[str, FetchResponse]] = []
    not_modified: list[FetchResponse] = []
    errors: list[str] = []
    for url in urls:
        try:
            validated_url = require_https_ingestion_url(url)
            response = fetcher(validated_url, headers=_metadata_request_headers(meta, validated_url))
            if response.not_modified or response.status == 304:
                not_modified.append(response)
                continue
            if response.status != 200:
                raise SatelliteDataError(f"HTTP {response.status} for {validated_url}")
            responses.append((extract_group_from_url(validated_url), response))
        except Exception as exc:
            errors.append(f"{url}: {exc}")
    return responses, not_modified, errors


def _omm_epoch_from_satellite(record: dict[str, object]) -> dt.datetime | None:
    element_set = record.get("element_set")
    if not isinstance(element_set, dict):
        return None
    epoch = element_set.get("epoch")
    if not epoch and isinstance(element_set.get("omm"), dict):
        epoch = element_set["omm"].get("EPOCH")
    return parse_iso_datetime(epoch)


def _omm_material(record: dict[str, object]) -> str:
    element_set = record.get("element_set")
    omm = element_set.get("omm") if isinstance(element_set, dict) else None
    return json.dumps(omm or {}, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":"))


def should_replace_omm(existing: dict[str, object] | None, candidate: dict[str, object]) -> bool:
    if existing is None:
        return True
    existing_epoch = _omm_epoch_from_satellite(existing)
    candidate_epoch = _omm_epoch_from_satellite(candidate)
    if candidate_epoch is None:
        return False
    if existing_epoch is None:
        return True
    if candidate_epoch != existing_epoch:
        return candidate_epoch > existing_epoch
    # CelesTrak can occasionally publish duplicate epochs. A stable lexical
    # tie-break keeps output deterministic regardless of response ordering.
    return _omm_material(candidate) > _omm_material(existing)


def build_satellites_from_omm_responses(
    responses: Iterable[tuple[str, FetchResponse]],
    satcat_records: dict[str, dict[str, str]],
    *,
    existing: list[dict[str, object]] | None = None,
    company_tags: dict[str, str] | None = None,
    mode: str,
) -> tuple[list[dict[str, object]], dict[str, int], list[dict[str, object]]]:
    current = [dict(item) for item in (existing or []) if isinstance(item, dict)]
    initial_by_norad: dict[str, dict[str, object]] = {}
    for item in current:
        try:
            norad_id = normalize_norad_id(item.get("norad_id"))
        except SatelliteDataError:
            continue
        normalized_item = dict(item)
        normalized_item["norad_id"] = norad_id
        initial_by_norad.setdefault(norad_id, normalized_item)
    candidates: dict[str, dict[str, object]] = {}
    quarantined: list[dict[str, object]] = []
    fetched = 0
    duplicates = 0

    for company, response in responses:
        try:
            payload = json.loads(response.text)
        except json.JSONDecodeError as exc:
            raise SatelliteDataError(f"Invalid OMM JSON from {response.url}: {exc}") from exc
        if not isinstance(payload, list):
            raise SatelliteDataError(f"OMM JSON from {response.url} must be an array.")
        for index, raw in enumerate(payload):
            fetched += 1
            try:
                candidate = transform_satellite_omm_object(raw, satcat_records)
                norad_id = str(candidate["norad_id"])
                source_tag = str((company_tags or {}).get(norad_id) or "").strip().upper()
                existing_tag = str(initial_by_norad.get(norad_id, {}).get("company") or "").strip().upper()
                if is_meaningful_company_tag(source_tag):
                    candidate["company"] = source_tag
                elif is_meaningful_company_tag(existing_tag):
                    candidate["company"] = existing_tag
                else:
                    candidate["company"] = company
            except Exception as exc:
                raw_id = raw.get("NORAD_CAT_ID") if isinstance(raw, dict) else None
                quarantined.append(
                    {
                        "source_url": response.url,
                        "record_index": index,
                        "norad_id": None if raw_id is None else str(raw_id),
                        "reason": str(exc),
                    }
                )
                continue
            previous_candidate = candidates.get(norad_id)
            if previous_candidate is not None:
                duplicates += 1
            if should_replace_omm(previous_candidate, candidate):
                candidates[norad_id] = candidate

    output_by_norad = {} if mode in {"all", RECONCILIATION_MODE} else dict(initial_by_norad)
    added = 0
    updated = 0
    for norad_id, candidate in candidates.items():
        existing_record = output_by_norad.get(norad_id)
        if existing_record is None:
            output_by_norad[norad_id] = candidate
            added += 1
        elif should_replace_omm(existing_record, candidate):
            output_by_norad[norad_id] = candidate
            if norad_id in initial_by_norad:
                updated += 1

    def norad_sort_key(value: str) -> tuple[int, str]:
        return (int(value), value)

    satellites = [output_by_norad[key] for key in sorted(output_by_norad, key=norad_sort_key)]
    satellites, tag_counts = refresh_gp_catalog_enrichment(
        satellites,
        company_tags or {},
        existing=current,
    )
    output_ids = set(output_by_norad)
    if mode == RECONCILIATION_MODE:
        reconciled_by_norad = {
            str(record.get("norad_id") or ""): record
            for record in satellites
            if str(record.get("norad_id") or "")
        }
        common_ids = set(initial_by_norad) & set(reconciled_by_norad)
        added = len(set(reconciled_by_norad) - set(initial_by_norad))
        updated = sum(
            reconciled_by_norad[norad_id] != initial_by_norad[norad_id]
            for norad_id in common_ids
        )
        retained = len(common_ids) - updated
    else:
        retained = len((set(initial_by_norad) & output_ids) - {
            norad_id
            for norad_id, candidate in candidates.items()
            if norad_id in initial_by_norad and should_replace_omm(initial_by_norad[norad_id], candidate)
        })
    counts = {
        "existing": len(initial_by_norad),
        "fetched": fetched,
        "added": added,
        "updated": updated,
        "retained": retained,
        "pruned": len(set(initial_by_norad) - output_ids),
        "duplicates": duplicates,
        "quarantined": len(quarantined),
        "total": len(satellites),
        "omm": len(satellites),
        "tle": 0,
        "six_digit_ids": sum(len(str(item.get("norad_id") or "")) >= 6 for item in satellites),
        "nine_digit_ids": sum(len(str(item.get("norad_id") or "")) == 9 for item in satellites),
        **tag_counts,
    }
    return satellites, counts, quarantined


def _update_gp_failure_metadata(
    meta_path: Path,
    meta: dict[str, object],
    *,
    mode: str,
    errors: list[str],
    now: dt.datetime,
    dry_run: bool,
    invalidate_reconciliation_snapshot: bool = False,
) -> None:
    prior_scope_verified = gp_source_scope_is_current(meta)
    represented_groups = gp_catalog_source_groups(meta)
    failed_meta = dict(meta)
    if not prior_scope_verified or invalidate_reconciliation_snapshot:
        failed_meta.pop("last_reconciled_at", None)
        failed_meta.pop("last_reconciled_catalog_revision", None)
    failed_meta.update(
        {
            "schema_version": "2.2.0",
            "parser_version": "2.2.0",
            "dataset_format": "CCSDS_OMM_JSON",
            "source_format": "CCSDS_OMM_JSON",
            "mode": mode,
            "last_attempt_at": isoformat_utc(now),
            "last_error": "; ".join(errors)[:2000],
            "last_status": "failed",
            "source_status": "DEGRADED",
            "source_urls": gp_source_urls_for_mode(mode),
            "catalog_source_groups": represented_groups,
            **gp_source_scope_metadata(verified=prior_scope_verified),
        }
    )
    atomic_write_json(meta_path, failed_meta, dry_run=dry_run, backup=False, indent=2)


def _gp_url_metadata(
    meta: dict[str, object],
    responses: Iterable[FetchResponse],
    now: dt.datetime,
) -> dict[str, object]:
    url_meta = dict(meta.get("urls", {})) if isinstance(meta.get("urls"), dict) else {}
    for response in responses:
        existing = dict(url_meta.get(response.url, {})) if isinstance(url_meta.get(response.url), dict) else {}
        if response.headers.get("etag"):
            existing["etag"] = response.headers["etag"]
        if response.headers.get("last-modified"):
            existing["last_modified"] = response.headers["last-modified"]
        existing["status"] = response.status
        existing["last_attempt_at"] = isoformat_utc(now)
        url_meta[response.url] = existing
    return url_meta


def export_gp_data(
    *,
    root: Path | str,
    mode: str = "incremental",
    force: bool = False,
    dry_run: bool = False,
    fetcher: Callable[..., FetchResponse] | None = None,
    now: dt.datetime | None = None,
    celestrak_min_refresh_hours: float = CELESTRAK_MIN_REFRESH_HOURS,
    allow_large_reconciliation_shrink: bool = False,
) -> UpdateResult:
    now = now or utc_now()
    root_path = Path(root).resolve()
    gp_path = repo_path(root_path, GP_RELATIVE_PATH)
    meta_path = repo_path(root_path, GP_META_RELATIVE_PATH)
    meta = load_json(meta_path, {})
    if not isinstance(meta, dict):
        meta = {}
    provider_meta_at_start = dict(meta)
    last_known_good_text = (
        gp_path.read_text(encoding="utf-8")
        if mode in {"all", RECONCILIATION_MODE} and gp_path.exists()
        else None
    )
    existing_payload = load_json(gp_path, [])
    existing = existing_payload if isinstance(existing_payload, list) else []
    existing_revision_at_start = catalog_revision_for_payload(existing)
    metadata_revision_matches_at_start = (
        meta.get("catalog_revision") == existing_revision_at_start
        and meta.get("dataset_hash") == existing_revision_at_start
    )
    source_scope_current_at_start = (
        gp_source_scope_is_current(meta)
        and metadata_revision_matches_at_start
    )
    if not metadata_revision_matches_at_start:
        meta = dict(meta)
        meta.update(
            {
                "catalog_revision": existing_revision_at_start,
                "dataset_hash": existing_revision_at_start,
                "catalog_source_groups": [],
                **gp_source_scope_metadata(verified=False),
            }
        )
        meta.pop("last_reconciled_at", None)
        meta.pop("last_reconciled_catalog_revision", None)
    last_known_good_meta = dict(meta)

    company_tags, tag_enrichment = load_gp_company_tag_enrichment(root_path)
    satcat_records = load_satcat_records(root_path)
    locally_enriched, local_enrichment_counts = refresh_gp_catalog_enrichment(
        existing,
        company_tags,
        existing=existing,
    )
    locally_enriched, satcat_enriched = enrich_gp_from_satcat(locally_enriched, satcat_records)
    local_enrichment_counts["satcat_enriched"] = satcat_enriched
    local_enrichment_changed = locally_enriched != existing
    locally_enriched_revision = catalog_revision_for_payload(locally_enriched)
    if (
        not source_scope_current_at_start
        and local_enrichment_changed
        and gp_source_scope_is_current(provider_meta_at_start)
        and provider_meta_at_start.get("catalog_revision") == locally_enriched_revision
        and provider_meta_at_start.get("dataset_hash") == locally_enriched_revision
    ):
        source_scope_current_at_start = True
        meta = dict(provider_meta_at_start)
        last_known_good_meta = dict(meta)
    desired_tag_enrichment = {
        **tag_enrichment,
        "matched_records": local_enrichment_counts["tag_source_matches"],
        "tagged_records": local_enrichment_counts["tagged"],
        "unmatched_records": local_enrichment_counts["tag_unmatched"],
    }
    tag_metadata_changed = meta.get("tag_enrichment") != desired_tag_enrichment
    if local_enrichment_changed or tag_metadata_changed:
        if local_enrichment_changed:
            atomic_write_json(gp_path, locally_enriched, dry_run=dry_run, backup=True)
            existing = locally_enriched
        local_meta = dict(meta)
        local_counts = dict(local_meta.get("counts", {})) if isinstance(local_meta.get("counts"), dict) else {}
        local_counts.update(local_enrichment_counts)
        local_meta.update(
            {
                "catalog_revision": catalog_revision_for_payload(existing),
                "dataset_hash": catalog_revision_for_payload(existing),
                "counts": local_counts,
                "tag_enrichment": desired_tag_enrichment,
                "catalog_source_groups": gp_catalog_source_groups(meta),
                **gp_source_scope_metadata(verified=source_scope_current_at_start),
            }
        )
        if not source_scope_current_at_start:
            local_meta.pop("last_reconciled_at", None)
            local_meta.pop("last_reconciled_catalog_revision", None)
        if local_enrichment_changed:
            local_meta["last_local_enrichment_at"] = isoformat_utc(now)
        else:
            local_meta["last_tag_metadata_refresh_at"] = isoformat_utc(now)
        atomic_write_json(meta_path, local_meta, dry_run=dry_run, backup=False, indent=2)
        meta = local_meta

    if mode != "all" and not force and source_scope_current_at_start:
        latest = latest_success_time(meta, gp_path)
        if is_recent_enough(latest, celestrak_min_refresh_hours, now=now):
            return UpdateResult(
                changed=local_enrichment_changed and not dry_run,
                skipped=True,
                mode=mode,
                message=(
                    "GP/OMM local tag/orbit enrichment completed; provider fetch skipped by the refresh guard."
                    if local_enrichment_changed
                    else f"GP/OMM update skipped; last successful fetch is newer than {celestrak_min_refresh_hours:g} hours."
                ),
                counts={"existing": len(existing), "total": len(existing), **local_enrichment_counts},
                paths={"gp": str(gp_path), "metadata": str(meta_path)},
            )

    source_urls = gp_source_urls_for_mode(mode)
    current_revision = catalog_revision_for_payload(existing)
    complete_replacement = mode in {"all", RECONCILIATION_MODE}
    complete_snapshot_current = (
        gp_source_scope_is_current(meta)
        and reconciliation_snapshot_is_current(meta, current_revision)
    )
    request_meta = meta
    if not source_scope_current_at_start or (complete_replacement and not complete_snapshot_current):
        request_meta = {key: value for key, value in meta.items() if key != "urls"}
    responses, not_modified, errors = fetch_omm_sources(source_urls, fetcher=fetcher, meta=request_meta)
    if errors or (not responses and not not_modified):
        failure_errors = errors or ["CelesTrak returned no GP/OMM response."]
        _update_gp_failure_metadata(
            meta_path, meta, mode=mode, errors=failure_errors, now=now, dry_run=dry_run
        )
        return UpdateResult(
            changed=local_enrichment_changed and not dry_run,
            skipped=True,
            mode=mode,
            message="CelesTrak unavailable; preserved existing GP/OMM data.",
            counts={"existing": len(existing), "total": len(existing), **local_enrichment_counts},
            errors=failure_errors,
            paths={"gp": str(gp_path), "metadata": str(meta_path)},
        )

    if not source_scope_current_at_start and not_modified:
        scope_error = (
            "Cannot establish the configured GP source scope from 304 responses; "
            "a full response from every configured source is required."
        )
        _update_gp_failure_metadata(
            meta_path,
            meta,
            mode=mode,
            errors=[scope_error],
            now=now,
            dry_run=dry_run,
        )
        return UpdateResult(
            changed=local_enrichment_changed and not dry_run,
            skipped=True,
            mode=mode,
            message="GP/OMM source-scope verification failed; preserved existing data.",
            counts={"existing": len(existing), "total": len(existing), **local_enrichment_counts},
            errors=[scope_error],
            paths={"gp": str(gp_path), "metadata": str(meta_path)},
        )

    if complete_replacement and responses and not_modified:
        mixed_response_error = (
            "Complete GP/OMM replacement received mixed full and 304 source responses; "
            "unchanged groups cannot be reconstructed from an empty replacement base."
        )
        _update_gp_failure_metadata(
            meta_path,
            meta,
            mode=mode,
            errors=[mixed_response_error],
            now=now,
            dry_run=dry_run,
            invalidate_reconciliation_snapshot=True,
        )
        return UpdateResult(
            changed=local_enrichment_changed and not dry_run,
            skipped=True,
            mode=mode,
            message="GP/OMM replacement requires a coherent complete response set; preserved existing data.",
            counts={"existing": len(existing), "total": len(existing), **local_enrichment_counts},
            errors=[mixed_response_error],
            paths={"gp": str(gp_path), "metadata": str(meta_path)},
        )

    if not_modified and not responses:
        if (
            not source_scope_current_at_start
            or (complete_replacement and not complete_snapshot_current)
        ):
            reconciliation_error = (
                "Cannot accept GP/OMM 304 responses without a prior eligible snapshot "
                "for the configured source groups."
            )
            _update_gp_failure_metadata(
                meta_path,
                meta,
                mode=mode,
                errors=[reconciliation_error],
                now=now,
                dry_run=dry_run,
            )
            return UpdateResult(
                changed=local_enrichment_changed and not dry_run,
                skipped=True,
                mode=mode,
                message="GP/OMM update requires prior configured-source coverage for 304 responses; preserved existing data.",
                counts={"existing": len(existing), "total": len(existing), **local_enrichment_counts},
                errors=[reconciliation_error],
                paths={"gp": str(gp_path), "metadata": str(meta_path)},
            )
        unchanged_meta = dict(meta)
        unchanged_meta.update(
            {
                "schema_version": "2.2.0",
                "parser_version": "2.2.0",
                "dataset_format": "CCSDS_OMM_JSON",
                "source_format": "CCSDS_OMM_JSON",
                "last_attempt_at": isoformat_utc(now),
                "last_success_at": isoformat_utc(now),
                "revalidated_at": isoformat_utc(now),
                "last_status": "not-modified",
                "source_urls": source_urls,
                "catalog_source_groups": list(GP_SOURCE_GROUPS),
                "urls": _gp_url_metadata(meta, not_modified, now),
                **gp_source_scope_metadata(verified=True),
            }
        )
        if mode == RECONCILIATION_MODE:
            unchanged_meta["last_reconciled_at"] = isoformat_utc(now)
            unchanged_meta["last_reconciled_catalog_revision"] = current_revision
            unchanged_meta["source_status"] = "COMPLETE"
            unchanged_meta["partial_update"] = False
        unchanged_meta.pop("last_error", None)
        atomic_write_json(meta_path, unchanged_meta, dry_run=dry_run, backup=False, indent=2)
        return UpdateResult(
            changed=local_enrichment_changed and not dry_run,
            skipped=True,
            mode=mode,
            message="GP/OMM source has not changed.",
            counts={"existing": len(existing), "total": len(existing), **local_enrichment_counts},
            paths={"gp": str(gp_path), "metadata": str(meta_path)},
        )

    base_records = [dict(item) for item in existing if isinstance(item, dict)]
    try:
        satellites, counts, quarantine = build_satellites_from_omm_responses(
            responses,
            satcat_records,
            existing=base_records,
            company_tags=company_tags,
            mode=mode,
        )
    except Exception as exc:
        _update_gp_failure_metadata(meta_path, meta, mode=mode, errors=[str(exc)], now=now, dry_run=dry_run)
        return UpdateResult(
            changed=False,
            skipped=True,
            mode=mode,
            message="CelesTrak GP/OMM response was invalid; preserved existing data.",
            counts={"existing": len(existing), "total": len(existing)},
            errors=[str(exc)],
            paths={"gp": str(gp_path), "metadata": str(meta_path)},
        )

    if counts["fetched"] > 0 and counts["omm"] == 0:
        error = "All fetched GP/OMM records were quarantined."
        _update_gp_failure_metadata(meta_path, meta, mode=mode, errors=[error], now=now, dry_run=dry_run)
        return UpdateResult(
            changed=False,
            skipped=True,
            mode=mode,
            message="CelesTrak GP/OMM response contained no usable records; preserved existing data.",
            counts=counts,
            errors=[error],
            paths={"gp": str(gp_path), "metadata": str(meta_path)},
        )

    if (
        complete_replacement
        and (
            len(responses) != len(source_urls)
            or counts["fetched"] == 0
            or counts["omm"] == 0
        )
    ) or (
        bool(quarantine)
        and (mode == RECONCILIATION_MODE or not source_scope_current_at_start)
    ):
        error = "Complete configured-scope GP/OMM response failed structural validation."
        _update_gp_failure_metadata(meta_path, meta, mode=mode, errors=[error], now=now, dry_run=dry_run)
        return UpdateResult(
            changed=local_enrichment_changed and not dry_run,
            skipped=True,
            mode=mode,
            message="GP/OMM complete response was incomplete; preserved existing data.",
            counts=counts,
            errors=[error],
            paths={"gp": str(gp_path), "metadata": str(meta_path)},
        )

    if mode in {"all", RECONCILIATION_MODE}:
        previous_ids = catalog_norad_ids(existing)
        candidate_ids = catalog_norad_ids(satellites)
        shrink_error = reconciliation_shrink_error(
            "GP/OMM",
            len(previous_ids),
            len(candidate_ids),
            len(previous_ids & candidate_ids),
            allow_large_reconciliation_shrink=allow_large_reconciliation_shrink,
        )
        if shrink_error:
            _restore_text_snapshot(
                gp_path,
                last_known_good_text,
                originally_existed=last_known_good_text is not None,
                dry_run=dry_run,
            )
            _update_gp_failure_metadata(
                meta_path,
                last_known_good_meta,
                mode=mode,
                errors=[shrink_error],
                now=now,
                dry_run=dry_run,
            )
            return UpdateResult(
                changed=False,
                skipped=True,
                mode=mode,
                message="GP/OMM catalog shrink guard rejected the response; preserved existing data.",
                counts=counts,
                errors=[shrink_error],
                paths={"gp": str(gp_path), "metadata": str(meta_path)},
            )

    changed = satellites != existing
    if changed:
        atomic_write_json(gp_path, satellites, dry_run=dry_run, backup=True)
    newest_epoch = max(
        (str(item.get("element_set", {}).get("epoch")) for item in satellites if isinstance(item.get("element_set"), dict)),
        default=None,
    )
    newest_launch_date = max(
        (_valid_launch_date(item.get("launch_date")) for item in satellites if _valid_launch_date(item.get("launch_date"))),
        default=None,
    )
    partial = not complete_replacement or bool(quarantine)
    catalog_revision = catalog_revision_for_payload(satellites)
    success_meta = {
        "schema_version": "2.2.0",
        "parser_version": "2.2.0",
        "dataset_format": "CCSDS_OMM_JSON",
        "source_format": "CCSDS_OMM_JSON",
        "provider": "CelesTrak",
        "fetched_at": isoformat_utc(now),
        "retrieval_timestamp": isoformat_utc(now),
        "last_success_at": isoformat_utc(now),
        "last_attempt_at": isoformat_utc(now),
        "last_status": "partial" if quarantine else "ok",
        "last_error": None,
        "source_status": "PARTIAL" if partial else "COMPLETE",
        "partial_update": partial,
        "mode": mode,
        "source_urls": source_urls,
        "catalog_source_groups": list(GP_SOURCE_GROUPS),
        **gp_source_scope_metadata(verified=True),
        "celestrak_min_refresh_hours": celestrak_min_refresh_hours,
        "catalog_revision": catalog_revision,
        "dataset_hash": catalog_revision,
        "newest_orbital_epoch": newest_epoch,
        "newest_launch_date": newest_launch_date,
        "counts": counts,
        "catalog_revision": catalog_revision,
        "dataset_hash": catalog_revision,
        "tag_enrichment": {
            **tag_enrichment,
            "matched_records": counts["tag_source_matches"],
            "tagged_records": counts["tagged"],
            "unmatched_records": counts["tag_unmatched"],
        },
        "quarantine": quarantine[:100],
        "quarantine_truncated": max(0, len(quarantine) - 100),
        "urls": _gp_url_metadata(
            meta,
            [response for _company, response in responses] + not_modified,
            now,
        ),
    }
    if mode == RECONCILIATION_MODE:
        success_meta["last_reconciled_at"] = isoformat_utc(now)
        success_meta["last_reconciled_catalog_revision"] = catalog_revision
    elif gp_source_scope_is_current(meta) and meta.get("last_reconciled_at"):
        success_meta["last_reconciled_at"] = meta["last_reconciled_at"]
        if meta.get("last_reconciled_catalog_revision"):
            success_meta["last_reconciled_catalog_revision"] = meta["last_reconciled_catalog_revision"]
    atomic_write_json(meta_path, success_meta, dry_run=dry_run, backup=False, indent=2)
    return UpdateResult(
        changed=(changed or local_enrichment_changed) and not dry_run,
        skipped=False,
        mode=mode,
        message="GP/OMM export completed." if changed else "GP/OMM data already current.",
        counts=counts,
        errors=[item["reason"] for item in quarantine[:20]],
        paths={"gp": str(gp_path), "metadata": str(meta_path)},
    )


def extract_launch_dates_from_page(html: str) -> list[dict[str, str]]:
    pattern = re.compile(
        r"<tr\s+BGCOLOR=[^>]+><td><a\s+href=\"[^\"]+\">([^<]+)</a></td>\s*"
        r"<td[^>]*>([^<]+)</td>\s*<td[^>]*>([^<]+)</td>",
        re.IGNORECASE,
    )
    launches = []
    for match in pattern.finditer(html):
        launches.append(
            {
                "name": match.group(1).strip(),
                "norad_id": match.group(2).strip(),
                "launch_date": match.group(3).strip(),
            }
        )
    return launches


def extract_launch_dates_all(
    *,
    root: Path | str,
    dry_run: bool = False,
    fetcher: Callable[..., FetchResponse] | None = None,
    now: dt.datetime | None = None,
    allow_n2yo: bool = False,
) -> UpdateResult:
    now = now or utc_now()
    root_path = Path(root).resolve()
    output_path = repo_path(root_path, LAUNCH_DATES_RELATIVE_PATH)
    if not allow_n2yo:
        return UpdateResult(
            changed=False,
            skipped=True,
            mode="launch-dates-all",
            message="N2YO HTML launch-date enrichment is disabled unless explicitly opted in.",
            paths={"launch_dates": str(output_path)},
        )

    fetcher = fetcher or fetch_url
    launch_dates: dict[str, dict[str, str]] = {}
    name_to_norad: dict[str, str] = {}
    errors: list[str] = []
    fetched_pages = 0

    for year in range(1990, now.year + 1):
        for month in range(1, 13):
            url = require_https_ingestion_url(f"{N2YO_BROWSE_ENDPOINT}?y={year}&m={month:02d}")
            try:
                response = fetcher(url)
                fetched_pages += 1
            except Exception as exc:
                errors.append(f"{url}: {exc}")
                continue
            for sat in extract_launch_dates_from_page(response.text):
                norad_id = sat["norad_id"]
                name = sat["name"]
                if norad_id in launch_dates:
                    removed = launch_dates.pop(norad_id)
                    if name_to_norad.get(removed["name"]) == norad_id:
                        name_to_norad.pop(removed["name"], None)
                if name in name_to_norad:
                    previous_norad = name_to_norad.pop(name)
                    launch_dates.pop(previous_norad, None)
                launch_dates[norad_id] = sat
                name_to_norad[name] = norad_id

    payload = list(launch_dates.values())
    atomic_write_json(output_path, payload, dry_run=dry_run, backup=True)
    return UpdateResult(
        changed=not dry_run,
        skipped=False,
        mode="launch-dates-all",
        message="Launch date extraction completed.",
        counts={"pages": fetched_pages, "records": len(payload), "errors": len(errors)},
        errors=errors,
        paths={"launch_dates": str(output_path)},
    )


def parse_satcat_csv(path: Path) -> dict[str, list[dict[str, str]]]:
    if not path.exists():
        raise FileNotFoundError(f"Input not found: {path}")
    grouped: dict[str, list[dict[str, str]]] = {}
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise SatelliteDataError(f"Empty CSV: {path}")
        missing = [column for column in DECAYED_COLUMNS if column not in reader.fieldnames]
        if missing:
            raise SatelliteDataError(f"Missing required SATCAT columns: {', '.join(missing)}")
        for row in reader:
            decay_date = (row.get("DECAY_DATE") or "").strip()
            if not decay_date:
                continue
            object_type = (row.get("OBJECT_TYPE") or "").strip()
            if object_type.upper() != "PAY":
                continue
            record = {column: (row.get(column) or "").strip() for column in DECAYED_COLUMNS}
            try:
                record["NORAD_CAT_ID"] = normalize_norad_id(record["NORAD_CAT_ID"])
            except SatelliteDataError:
                continue
            record["OBJECT_TYPE"] = object_type
            object_name = record["OBJECT_NAME"] or "(UNKNOWN_OBJECT_NAME)"
            grouped.setdefault(object_name, []).append(record)
    return {key: grouped[key] for key in sorted(grouped)}


def merge_historical_decayed_records(
    existing: dict[str, list[dict[str, str]]],
    current: dict[str, list[dict[str, str]]],
) -> tuple[dict[str, list[dict[str, str]]], int]:
    """Upsert confirmed decays by NORAD ID without pruning prior confirmations."""

    by_norad: dict[str, dict[str, str]] = {}
    for grouped in (existing,):
        for records in grouped.values():
            if not isinstance(records, list):
                continue
            for record in records:
                if not isinstance(record, dict):
                    continue
                try:
                    norad_id = normalize_norad_id(record.get("NORAD_CAT_ID"))
                except SatelliteDataError:
                    continue
                normalized = {key: str(value or "").strip() for key, value in record.items()}
                normalized["NORAD_CAT_ID"] = norad_id
                by_norad.setdefault(norad_id, normalized)
    previous_ids = set(by_norad)
    current_ids: set[str] = set()
    for records in current.values():
        for record in records:
            norad_id = normalize_norad_id(record.get("NORAD_CAT_ID"))
            normalized = dict(record)
            normalized["NORAD_CAT_ID"] = norad_id
            by_norad[norad_id] = normalized
            current_ids.add(norad_id)

    grouped_result: dict[str, list[dict[str, str]]] = {}
    for norad_id in sorted(by_norad, key=lambda value: (int(value), value)):
        record = by_norad[norad_id]
        object_name = record.get("OBJECT_NAME") or "(UNKNOWN_OBJECT_NAME)"
        grouped_result.setdefault(object_name, []).append(record)
    return {key: grouped_result[key] for key in sorted(grouped_result)}, len(previous_ids - current_ids)


def refresh_satcat_csv(
    *,
    root: Path | str,
    force: bool = False,
    dry_run: bool = False,
    fetcher: Callable[..., FetchResponse] | None = None,
    now: dt.datetime | None = None,
    interval_hours: float = DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
    reconcile: bool = False,
    build_launches: bool = True,
    allow_large_reconciliation_shrink: bool = False,
) -> UpdateResult:
    now = now or utc_now()
    fetcher = fetcher or fetch_url
    root_path = Path(root).resolve()
    satcat_path = repo_path(root_path, SATCAT_RELATIVE_PATH)
    meta_path = repo_path(root_path, SATCAT_META_RELATIVE_PATH)
    meta = load_json(meta_path, {})
    if not isinstance(meta, dict):
        meta = {}
    if satcat_path.exists():
        with satcat_path.open("r", encoding="utf-8", newline="") as handle:
            current_text = handle.read()
    else:
        current_text = None
    current_revision = (
        catalog_revision_for_text(current_text)
        if current_text is not None
        else None
    )

    if not force:
        latest = latest_success_time(meta, satcat_path)
        if is_recent_enough(latest, interval_hours, now=now):
            return UpdateResult(
                changed=False,
                skipped=True,
                mode="refresh-satcat",
                message=f"SATCAT refresh skipped; last successful fetch is newer than {interval_hours:g} hours.",
                counts={"bytes": satcat_path.stat().st_size if satcat_path.exists() else 0},
                paths={"satcat": str(satcat_path), "metadata": str(meta_path)},
            )

    complete_snapshot_current = reconciliation_snapshot_is_current(meta, current_revision)
    request_meta = meta
    if reconcile and not complete_snapshot_current:
        request_meta = {key: value for key, value in meta.items() if key != "urls"}
    headers = _metadata_request_headers(request_meta, CELESTRAK_SATCAT_CSV_URL)
    try:
        response = fetcher(CELESTRAK_SATCAT_CSV_URL, headers=headers)
    except Exception as exc:
        failed_meta = dict(meta)
        failed_meta.update(
            {
                "source_url": CELESTRAK_SATCAT_CSV_URL,
                "last_attempt_at": isoformat_utc(now),
                "last_error": str(exc),
                "last_status": "failed",
            }
        )
        if current_revision:
            failed_meta.setdefault("catalog_revision", current_revision)
            failed_meta.setdefault("dataset_hash", current_revision)
        atomic_write_json(meta_path, failed_meta, dry_run=dry_run, backup=False, indent=2)
        return UpdateResult(
            changed=False,
            skipped=True,
            mode="refresh-satcat",
            message="CelesTrak SATCAT unavailable; preserved existing satcat.csv.",
            errors=[str(exc)],
            paths={"satcat": str(satcat_path), "metadata": str(meta_path)},
        )

    if response.not_modified:
        if reconcile and not complete_snapshot_current:
            error = "Cannot reconcile SATCAT from 304 without a matching complete snapshot revision."
            failed_meta = dict(meta)
            failed_meta.update(
                {
                    "source_url": CELESTRAK_SATCAT_CSV_URL,
                    "last_attempt_at": isoformat_utc(now),
                    "last_error": error,
                    "last_status": "failed",
                }
            )
            if current_revision:
                failed_meta.setdefault("catalog_revision", current_revision)
                failed_meta.setdefault("dataset_hash", current_revision)
            atomic_write_json(meta_path, failed_meta, dry_run=dry_run, backup=False, indent=2)
            return UpdateResult(
                changed=False,
                skipped=True,
                mode="refresh-satcat",
                message="SATCAT reconciliation requires a complete response; preserved existing data.",
                errors=[error],
                paths={"satcat": str(satcat_path), "metadata": str(meta_path)},
            )
        url_meta = dict(meta.get("urls", {})) if isinstance(meta.get("urls"), dict) else {}
        existing = dict(url_meta.get(CELESTRAK_SATCAT_CSV_URL, {})) if isinstance(url_meta.get(CELESTRAK_SATCAT_CSV_URL), dict) else {}
        if response.headers.get("etag"):
            existing["etag"] = response.headers["etag"]
        if response.headers.get("last-modified"):
            existing["last_modified"] = response.headers["last-modified"]
        existing["status"] = response.status
        existing["last_attempt_at"] = isoformat_utc(now)
        url_meta[CELESTRAK_SATCAT_CSV_URL] = existing
        meta.update(
            {
                "source_url": CELESTRAK_SATCAT_CSV_URL,
                "last_attempt_at": isoformat_utc(now),
                "last_success_at": isoformat_utc(now),
                "revalidated_at": isoformat_utc(now),
                "last_status": "not-modified",
                "catalog_revision": meta.get("catalog_revision") or current_revision,
                "dataset_hash": meta.get("dataset_hash") or current_revision,
                "urls": url_meta,
            }
        )
        if reconcile:
            meta["last_reconciled_at"] = isoformat_utc(now)
            meta["last_reconciled_catalog_revision"] = current_revision
        meta.pop("last_error", None)
        atomic_write_json(meta_path, meta, dry_run=dry_run, backup=False, indent=2)
        launch_result = (
            build_launch_catalog(
                root=root_path,
                dry_run=dry_run,
                now=now,
                mode=RECONCILIATION_MODE if reconcile else "incremental",
            )
            if build_launches and satcat_path.exists()
            else None
        )
        return UpdateResult(
            changed=bool(launch_result and launch_result.changed),
            skipped=True,
            mode="refresh-satcat",
            message="SATCAT source has not changed.",
            counts={"launch_records": launch_result.counts.get("records", 0)} if launch_result else {},
            errors=launch_result.errors if launch_result else [],
            paths={
                "satcat": str(satcat_path),
                "metadata": str(meta_path),
                **({"launches": launch_result.paths["launches"]} if launch_result else {}),
            },
        )

    first_line = response.text.splitlines()[0].strip() if response.text.splitlines() else ""
    if "OBJECT_NAME" not in first_line or "NORAD_CAT_ID" not in first_line or "DECAY_DATE" not in first_line:
        error = "Downloaded SATCAT CSV does not contain the expected header."
        failed_meta = dict(meta)
        failed_meta.update(
            {
                "source_url": CELESTRAK_SATCAT_CSV_URL,
                "last_attempt_at": isoformat_utc(now),
                "last_error": error,
                "last_status": "failed",
            }
        )
        if current_revision:
            failed_meta.setdefault("catalog_revision", current_revision)
            failed_meta.setdefault("dataset_hash", current_revision)
        atomic_write_json(meta_path, failed_meta, dry_run=dry_run, backup=False, indent=2)
        return UpdateResult(
            changed=False,
            skipped=True,
            mode="refresh-satcat",
            message="CelesTrak SATCAT response was invalid; preserved existing satcat.csv.",
            errors=[error],
            paths={"satcat": str(satcat_path), "metadata": str(meta_path)},
        )

    try:
        parsed_records = satcat_records_from_text(response.text)
    except Exception as exc:
        failed_meta = dict(meta)
        failed_meta.update(
            {
                "source_url": CELESTRAK_SATCAT_CSV_URL,
                "last_attempt_at": isoformat_utc(now),
                "last_error": str(exc),
                "last_status": "failed",
            }
        )
        if current_revision:
            failed_meta.setdefault("catalog_revision", current_revision)
            failed_meta.setdefault("dataset_hash", current_revision)
        atomic_write_json(meta_path, failed_meta, dry_run=dry_run, backup=False, indent=2)
        return UpdateResult(
            changed=False,
            skipped=True,
            mode="refresh-satcat",
            message="CelesTrak SATCAT response was invalid; preserved existing satcat.csv.",
            errors=[str(exc)],
            paths={"satcat": str(satcat_path), "metadata": str(meta_path)},
        )

    previous_records: dict[str, dict[str, str]] = {}
    if current_text is not None:
        with contextlib.suppress(SatelliteDataError):
            previous_records = satcat_records_from_text(current_text)
    previous_record_count = len(previous_records)
    shrink_error = (
        reconciliation_shrink_error(
            "SATCAT",
            previous_record_count,
            len(parsed_records),
            len(set(previous_records) & set(parsed_records)),
            allow_large_reconciliation_shrink=allow_large_reconciliation_shrink,
        )
        if current_text is not None
        else None
    )
    if shrink_error:
        failed_meta = dict(meta)
        failed_meta.update(
            {
                "source_url": CELESTRAK_SATCAT_CSV_URL,
                "last_attempt_at": isoformat_utc(now),
                "last_error": shrink_error,
                "last_status": "failed",
            }
        )
        if current_revision:
            failed_meta.setdefault("catalog_revision", current_revision)
            failed_meta.setdefault("dataset_hash", current_revision)
        atomic_write_json(meta_path, failed_meta, dry_run=dry_run, backup=False, indent=2)
        return UpdateResult(
            changed=False,
            skipped=True,
            mode="refresh-satcat",
            message="SATCAT catalog shrink guard rejected the response; preserved existing data.",
            counts={
                "existing": previous_record_count,
                "candidate": len(parsed_records),
            },
            errors=[shrink_error],
            paths={"satcat": str(satcat_path), "metadata": str(meta_path)},
        )

    changed = current_text != response.text
    if changed:
        atomic_write_text(satcat_path, response.text, dry_run=dry_run, backup=True)
    url_meta = dict(meta.get("urls", {})) if isinstance(meta.get("urls"), dict) else {}
    source_info = dict(url_meta.get(CELESTRAK_SATCAT_CSV_URL, {})) if isinstance(url_meta.get(CELESTRAK_SATCAT_CSV_URL), dict) else {}
    if response.headers.get("etag"):
        source_info["etag"] = response.headers["etag"]
    if response.headers.get("last-modified"):
        source_info["last_modified"] = response.headers["last-modified"]
    source_info["status"] = response.status
    source_info["last_attempt_at"] = isoformat_utc(now)
    url_meta[CELESTRAK_SATCAT_CSV_URL] = source_info
    success_meta = {
        "fetched_at": isoformat_utc(now),
        "last_success_at": isoformat_utc(now),
        "last_attempt_at": isoformat_utc(now),
        "last_status": "ok",
        "source_url": CELESTRAK_SATCAT_CSV_URL,
        "catalog_revision": catalog_revision_for_text(response.text),
        "dataset_hash": catalog_revision_for_text(response.text),
        "counts": {
            "bytes": len(response.text.encode("utf-8")),
            "records": len(parsed_records),
        },
        "urls": url_meta,
    }
    if reconcile:
        success_meta["last_reconciled_at"] = isoformat_utc(now)
        success_meta["last_reconciled_catalog_revision"] = success_meta["catalog_revision"]
    elif meta.get("last_reconciled_at"):
        success_meta["last_reconciled_at"] = meta["last_reconciled_at"]
        if meta.get("last_reconciled_catalog_revision"):
            success_meta["last_reconciled_catalog_revision"] = meta["last_reconciled_catalog_revision"]
    atomic_write_json(meta_path, success_meta, dry_run=dry_run, backup=False, indent=2)
    launch_result = (
        build_launch_catalog(
            root=root_path,
            dry_run=dry_run,
            now=now,
            satcat_text=response.text,
            mode=RECONCILIATION_MODE if reconcile else "incremental",
        )
        if build_launches
        else None
    )
    return UpdateResult(
        changed=(changed or bool(launch_result and launch_result.changed)) and not dry_run,
        skipped=False,
        mode="refresh-satcat",
        message="SATCAT refresh completed.",
        counts={
            "bytes": len(response.text.encode("utf-8")),
            "records": len(parsed_records),
            "launch_records": launch_result.counts.get("records", 0) if launch_result else 0,
        },
        errors=launch_result.errors if launch_result else [],
        paths={
            "satcat": str(satcat_path),
            "metadata": str(meta_path),
            **({"launches": launch_result.paths["launches"]} if launch_result else {}),
        },
    )


def _optional_finite_number(
    value: object,
    *,
    minimum: float | None = None,
) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        number = float(text)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or (minimum is not None and number < minimum):
        return None
    return number


def _tracked_satcat_rows(
    text: str,
) -> tuple[dict[str, dict[str, str]], dict[str, int], list[dict[str, object]]]:
    reader = csv.DictReader(io.StringIO(text))
    required = {"OBJECT_NAME", "NORAD_CAT_ID", "OBJECT_TYPE", "DECAY_DATE"}
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        missing = sorted(required - set(reader.fieldnames or []))
        raise SatelliteDataError(
            "SATCAT tracked-object input is missing required columns: " + ", ".join(missing)
        )

    records: dict[str, dict[str, str]] = {}
    quarantine: list[dict[str, object]] = []
    received = 0
    duplicates = 0
    rejected = 0
    for row_number, row in enumerate(reader, start=2):
        if not any(str(value or "").strip() for value in row.values()):
            continue
        received += 1
        raw_id = row.get("NORAD_CAT_ID")
        try:
            norad_id = normalize_catalog_id(raw_id)
        except SatelliteDataError as exc:
            rejected += 1
            quarantine.append(
                {
                    "source": "CELESTRAK_SATCAT",
                    "row": row_number,
                    "provider_catalog_id": str(raw_id or "").strip() or None,
                    "reason": str(exc),
                }
            )
            continue
        if norad_id in records:
            duplicates += 1
            quarantine.append(
                {
                    "source": "CELESTRAK_SATCAT",
                    "row": row_number,
                    "provider_catalog_id": str(raw_id or "").strip() or None,
                    "reason": "Duplicate catalog identity; deterministic last-row-wins policy applied.",
                    "disposition": "DEDUPLICATED",
                }
            )
        normalized = {key: str(value or "").strip() for key, value in row.items() if key}
        normalized["NORAD_CAT_ID"] = norad_id
        normalized["PROVIDER_NORAD_CAT_ID"] = str(raw_id or "").strip()
        records[norad_id] = normalized
    return records, {
        "received": received,
        "accepted": len(records),
        "quarantined": rejected,
        "duplicates": duplicates,
        "issues": len(quarantine),
    }, quarantine


def _valid_gp_records_for_tracked_catalog(
    payload: object,
) -> tuple[dict[str, dict[str, object]], list[dict[str, object]]]:
    records = payload if isinstance(payload, list) else []
    valid: dict[str, dict[str, object]] = {}
    quarantine: list[dict[str, object]] = []
    for index, item in enumerate(records):
        raw_id = item.get("norad_id") if isinstance(item, dict) else None
        try:
            if not isinstance(item, dict):
                raise SatelliteDataError("GP catalog row must be an object.")
            element_set = item.get("element_set")
            if not isinstance(element_set, dict) or not isinstance(element_set.get("omm"), dict):
                raise SatelliteDataError("GP catalog row has no OMM element set.")
            omm = canonicalize_omm_record(element_set["omm"])
            norad_id = normalize_catalog_id(item.get("norad_id") or omm.get("NORAD_CAT_ID"))
            if norad_id != str(omm["NORAD_CAT_ID"]):
                raise SatelliteDataError("GP record and OMM NORAD identifiers do not match.")
            metrics = extract_orbit_metrics_from_omm(omm)
            candidate = {
                "norad_id": norad_id,
                "name": str(item.get("satellite_name") or item.get("name") or omm["OBJECT_NAME"]).strip(),
                "international_designator": str(
                    item.get("international_designator") or omm.get("OBJECT_ID") or ""
                ).strip() or None,
                "company": str(item.get("company") or "CELESTRAK").strip(),
                "object_type": normalize_object_type(item.get("object_type") or omm.get("OBJECT_TYPE")),
                "orbit_class": determine_orbit(metrics),
                "element_set": {
                    "format": "OMM",
                    "source": str(element_set.get("source") or "CELESTRAK"),
                    "epoch": omm["EPOCH"],
                    "time_scale": "UTC",
                    "native_frame": "TEME",
                    "propagation_theory": "SGP4",
                    "line1": None,
                    "line2": None,
                    "omm": omm,
                },
                **metrics,
            }
        except Exception as exc:
            quarantine.append(
                {
                    "source": "GP_OMM",
                    "record_index": index,
                    "provider_catalog_id": None if raw_id is None else str(raw_id),
                    "reason": str(exc),
                }
            )
            continue
        previous = valid.get(norad_id)
        if previous is None or should_replace_omm(previous, candidate):
            valid[norad_id] = candidate
    return valid, quarantine


def _satcat_orbit_summary(row: dict[str, str]) -> tuple[dict[str, float | None], str]:
    period_min = _optional_finite_number(row.get("PERIOD"), minimum=0.000001)
    perigee_km = _optional_finite_number(row.get("PERIGEE"))
    apogee_km = _optional_finite_number(row.get("APOGEE"))
    inclination_deg = _optional_finite_number(row.get("INCLINATION"))
    summary: dict[str, float | None] = {
        "period_min": period_min,
        "inclination_deg": inclination_deg,
        "perigee_km": perigee_km,
        "apogee_km": apogee_km,
    }
    metrics: dict[str, object] = {}
    if period_min is not None:
        metrics["period_min"] = period_min
        metrics["mean_motion_rev_per_day"] = MINUTES_PER_DAY / period_min
    if inclination_deg is not None:
        metrics["inclination_deg"] = inclination_deg
    if perigee_km is not None:
        metrics["perigee_km"] = perigee_km
    if apogee_km is not None:
        metrics["apogee_km"] = apogee_km
    if perigee_km is not None and apogee_km is not None:
        metrics["estimated_altitude_km"] = (perigee_km + apogee_km) / 2.0
    orbit_class = determine_orbit(metrics)
    return summary, "UNKNOWN" if orbit_class == "no data" else orbit_class


def _tracked_record(
    norad_id: str,
    row: dict[str, str] | None,
    gp: dict[str, object] | None,
) -> dict[str, object]:
    row = row or {}
    satcat_summary, satcat_orbit_class = _satcat_orbit_summary(row)
    decay_date = _valid_launch_date(row.get("DECAY_DATE")) or None
    has_current_elements = gp is not None and decay_date is None
    rcs_text = str(row.get("RCS") or "").strip()
    rcs_m2 = _optional_finite_number(rcs_text, minimum=0.0)
    rcs_status = "PUBLISHED" if rcs_m2 is not None else "MISSING" if not rcs_text else "INVALID"
    object_type = normalize_object_type(row.get("OBJECT_TYPE") or (gp or {}).get("object_type"))
    if object_type not in TRACKED_OBJECT_TYPES:
        object_type = "UNKNOWN"
    name = str(
        row.get("OBJECT_NAME")
        or (gp or {}).get("name")
        or f"NORAD {norad_id}"
    ).strip()
    orbit_class = str((gp or {}).get("orbit_class") or satcat_orbit_class).upper()
    if orbit_class not in {"LEO", "MEO", "GEO", "HEO", "OTHER", "DECAYING"}:
        orbit_class = "UNKNOWN"
    operational_status = satcat_lifecycle_status(row) if row else "UNKNOWN"
    lifecycle_status = (
        "DECAYED"
        if decay_date
        else operational_status
        if operational_status in {"ACTIVE", "INACTIVE"}
        else "UNKNOWN"
    )
    if lifecycle_status == "UNKNOWN" and gp is not None:
        lifecycle_status = "ACTIVE"
    record: dict[str, object] = {
        "object_id": f"obx:norad:{norad_id}",
        "norad_id": norad_id,
        "provider_catalog_id": str(row.get("PROVIDER_NORAD_CAT_ID") or norad_id),
        "alpha5_id": alpha5_catalog_id(norad_id),
        "name": name,
        "satellite_name": name,
        "international_designator": str(
            row.get("OBJECT_ID") or (gp or {}).get("international_designator") or ""
        ).strip() or None,
        "object_type": object_type,
        "orbit_class": orbit_class,
        "type": orbit_class,
        "lifecycle_status": lifecycle_status,
        "operational_status": operational_status,
        "catalog_membership_status": "PRESENT",
        "launch_date": _valid_launch_date(row.get("LAUNCH_DATE")) or None,
        "launch_site": str(row.get("LAUNCH_SITE") or "").strip() or None,
        "decay_date": decay_date,
        "owner": str(row.get("OWNER") or "").strip() or None,
        "owner_code": str(row.get("OWNER") or "").strip() or None,
        "company": str((gp or {}).get("company") or "").strip() or None,
        "ops_status_code": str(row.get("OPS_STATUS_CODE") or "").strip() or None,
        "data_status_code": str(row.get("DATA_STATUS_CODE") or "").strip() or None,
        "orbit_center": str(row.get("ORBIT_CENTER") or "").strip() or None,
        "orbit_type": str(row.get("ORBIT_TYPE") or "").strip() or None,
        "rcs_m2": rcs_m2,
        "rcs_status": rcs_status,
        "rcs_size": None,
        "physical_size_estimate": None,
        "satcat_orbit_summary": satcat_summary,
        "orbit_class_source": "GP_OMM" if gp else "SATCAT_SUMMARY" if satcat_orbit_class != "UNKNOWN" else "UNKNOWN",
        "has_current_elements": has_current_elements,
        "orbit_available": has_current_elements,
        "metadata_only": not has_current_elements,
        "propagation_status": "CURRENT_ELEMENTS" if has_current_elements else "NO_CURRENT_ELEMENTS",
        "element_availability_status": "CURRENT_ELEMENTS" if has_current_elements else "NO_CURRENT_ELEMENTS",
        "unavailable_reason": (
            None
            if has_current_elements
            else "DECAYED"
            if decay_date
            else "NOT_AVAILABLE_IN_CONFIGURED_GP_SNAPSHOT"
        ),
        "source": "CELESTRAK_SATCAT" if row else "CELESTRAK_GP_OMM",
    }
    if gp is not None and has_current_elements:
        record["element_reference"] = {
            "catalog": GP_RELATIVE_PATH.as_posix(),
            "norad_id": norad_id,
            "format": "OMM",
        }
    return record


def _load_tracked_records(root: Path) -> dict[str, dict[str, object]]:
    records: dict[str, dict[str, object]] = {}
    manifest = load_json(repo_path(root, TRACKED_MANIFEST_RELATIVE_PATH), {})
    if not isinstance(manifest, dict):
        return records
    for path in _tracked_manifest_chunk_paths(root, manifest):
        try:
            payload = load_json(path, {})
        except SatelliteDataError:
            continue
        chunk_records = payload.get("records", []) if isinstance(payload, dict) else payload
        if not isinstance(chunk_records, list):
            continue
        for item in chunk_records:
            if not isinstance(item, dict):
                continue
            try:
                norad_id = normalize_catalog_id(item.get("norad_id"))
            except SatelliteDataError:
                continue
            record = dict(item)
            record["norad_id"] = norad_id
            records[norad_id] = record
    return records


def _tracked_manifest_chunk_paths(root: Path, manifest: dict[str, object]) -> list[Path]:
    tracked_root = repo_path(root, TRACKED_DIRECTORY_RELATIVE_PATH).resolve()
    descriptors: list[object] = []
    for name in ("chunks", "history_chunks"):
        value = manifest.get(name)
        if isinstance(value, list):
            descriptors.extend(value)
    quarantine = manifest.get("quarantine")
    if isinstance(quarantine, dict):
        descriptors.append(quarantine)

    paths: list[Path] = []
    for descriptor in descriptors:
        raw_path = descriptor.get("path") if isinstance(descriptor, dict) else None
        if not isinstance(raw_path, str) or not raw_path.strip():
            continue
        candidate = (root / Path(raw_path)).resolve()
        if (
            candidate.suffix.lower() != ".json"
            or candidate == tracked_root
            or tracked_root not in candidate.parents
        ):
            continue
        paths.append(candidate)
    return paths


def _tracked_manifest_is_complete(root: Path, manifest_path: Path) -> bool:
    manifest = load_json(manifest_path, {})
    if not isinstance(manifest, dict):
        return False
    descriptors: list[dict[str, object]] = []
    for name in ("chunks", "history_chunks"):
        value = manifest.get(name)
        if isinstance(value, list):
            descriptors.extend(item for item in value if isinstance(item, dict))
    if isinstance(manifest.get("quarantine"), dict):
        descriptors.append(manifest["quarantine"])
    paths = _tracked_manifest_chunk_paths(root, manifest)
    if len(paths) != len(descriptors):
        return False
    for descriptor, path in zip(descriptors, paths):
        try:
            body = path.read_bytes()
            digest = "sha256:" + hashlib.sha256(body).hexdigest()
            if digest != descriptor.get("sha256") or len(body) != descriptor.get("bytes"):
                return False
            payload = json.loads(body)
            records = payload.get("records") if isinstance(payload, dict) else None
            if not isinstance(records, list) or len(records) != descriptor.get("count"):
                return False
            descriptor_scope = descriptor.get("scope")
            descriptor_type = descriptor.get("object_type")
            if descriptor_scope is not None:
                if payload.get("scope") != descriptor_scope or payload.get("object_type") != descriptor_type:
                    return False
                for record in records:
                    if not isinstance(record, dict) or record.get("object_type") != descriptor_type:
                        return False
                    is_current = (
                        record.get("catalog_membership_status") == "PRESENT"
                        and not record.get("decay_date")
                    )
                    if (descriptor_scope == "CURRENT") != is_current:
                        return False
        except (OSError, ValueError, TypeError):
            return False
    return True


def _prune_unreferenced_tracked_chunks(root: Path, manifest_path: Path) -> None:
    """Retain chunks referenced by the current and bounded backup manifests."""

    tracked_root = repo_path(root, TRACKED_DIRECTORY_RELATIVE_PATH).resolve()
    chunk_root = (tracked_root / "chunks").resolve()
    if chunk_root == tracked_root or tracked_root not in chunk_root.parents or not chunk_root.is_dir():
        return
    manifest_paths = [manifest_path]
    manifest_paths.extend(
        sorted(
            (
                path
                for path in manifest_path.parent.glob(manifest_path.name + ".bak-*")
                if path.is_file() and not path.is_symlink()
            ),
            key=lambda path: path.name,
            reverse=True,
        )[:BACKUP_RETENTION_PER_ARTIFACT]
    )
    retained: set[Path] = set()
    for candidate_manifest in manifest_paths:
        payload = load_json(candidate_manifest, {})
        if isinstance(payload, dict):
            retained.update(_tracked_manifest_chunk_paths(root, payload))
    for candidate in chunk_root.glob("*.json"):
        resolved = candidate.resolve()
        if (
            resolved not in retained
            and resolved.is_file()
            and not resolved.is_symlink()
            and chunk_root in resolved.parents
        ):
            with contextlib.suppress(FileNotFoundError):
                resolved.unlink()


def _tracked_record_comparison(record: dict[str, object]) -> dict[str, object]:
    ignored = {
        "observation_status",
        "previous_lifecycle_status",
        "reappeared_status",
    }
    return {key: value for key, value in record.items() if key not in ignored}


def _tracked_absent_record(record: dict[str, object]) -> dict[str, object]:
    absent = dict(record)
    absent.pop("element_set", None)
    absent.pop("element_reference", None)
    for key in (
        "inclination_deg",
        "eccentricity",
        "mean_motion_rev_per_day",
        "semi_major_axis_km",
    ):
        absent.pop(key, None)
    absent.update(
        {
            "lifecycle_status": "ABSENT",
            "observation_status": "ABSENT",
            "catalog_membership_status": "ABSENT",
            "has_current_elements": False,
            "orbit_available": False,
            "metadata_only": True,
            "propagation_status": "NO_CURRENT_ELEMENTS",
            "element_availability_status": "NO_CURRENT_ELEMENTS",
            "unavailable_reason": "ABSENT_FROM_PROVIDER_SNAPSHOT",
        }
    )
    return absent


def build_tracked_catalog(
    *,
    root: Path | str,
    mode: str = "incremental",
    dry_run: bool = False,
    now: dt.datetime | None = None,
    satcat_text: str | None = None,
    gp_payload: object | None = None,
) -> UpdateResult:
    """Build the full provider-tracked inventory without inventing orbital state."""

    now = now or utc_now()
    root_path = Path(root).resolve()
    satcat_path = repo_path(root_path, SATCAT_RELATIVE_PATH)
    gp_path = repo_path(root_path, GP_RELATIVE_PATH)
    manifest_path = repo_path(root_path, TRACKED_MANIFEST_RELATIVE_PATH)
    meta_path = repo_path(root_path, TRACKED_META_RELATIVE_PATH)
    previous_meta = load_json(meta_path, {})
    previous_meta = previous_meta if isinstance(previous_meta, dict) else {}
    if satcat_text is None:
        if not satcat_path.exists():
            error = _bounded_metadata_error("SATCAT input is unavailable.")
            failed_meta = dict(previous_meta)
            failed_meta.update(
                {
                    "schema_version": "2.3.0",
                    "parser_version": "2.3.0",
                    "dataset_format": "OPENBEXI_TRACKED_OBJECT_CHUNKS",
                    "provider": "CelesTrak",
                    "mode": mode,
                    "last_attempt_at": isoformat_utc(now),
                    "last_status": "failed",
                    "source_status": "DEGRADED",
                    "last_error": error,
                }
            )
            atomic_write_json(meta_path, failed_meta, dry_run=dry_run, backup=False, indent=2)
            return UpdateResult(
                changed=False,
                skipped=True,
                mode=mode,
                message="SATCAT is unavailable; preserved the tracked-object last-known-good catalog.",
                errors=[error],
                paths={"manifest": str(manifest_path), "metadata": str(meta_path)},
            )
        with satcat_path.open("r", encoding="utf-8", newline="") as handle:
            satcat_text = handle.read()
    if gp_payload is None:
        gp_payload = load_json(gp_path, [])
    gp_meta = load_json(repo_path(root_path, GP_META_RELATIVE_PATH), {})
    gp_meta = gp_meta if isinstance(gp_meta, dict) else {}

    satcat_revision = catalog_revision_for_text(satcat_text)
    gp_revision = catalog_revision_for_payload(gp_payload if isinstance(gp_payload, list) else [])
    input_revision = catalog_revision_for_payload(
        {"satcat_revision": satcat_revision, "gp_revision": gp_revision}
    )
    previous_manifest_error: str | None = None
    try:
        previous_manifest = load_json(manifest_path, {})
    except SatelliteDataError as exc:
        previous_manifest = {}
        previous_manifest_error = _bounded_metadata_error(exc)
    previous_manifest = previous_manifest if isinstance(previous_manifest, dict) else {}
    previous_provenance = previous_manifest.get("provenance")
    previous_provenance = previous_provenance if isinstance(previous_provenance, dict) else {}
    gp_metadata_revision_matches = (
        gp_meta.get("catalog_revision") == gp_revision
        and gp_meta.get("dataset_hash") == gp_revision
    )
    represented_gp_groups = gp_catalog_source_groups(gp_meta) if gp_metadata_revision_matches else []
    if (
        not represented_gp_groups
        and previous_provenance.get("gp_revision") == gp_revision
        and isinstance(previous_provenance.get("gp_source_groups"), list)
    ):
        represented_gp_groups = list(previous_provenance["gp_source_groups"])
    represented_gp_scope = (
        GP_SOURCE_SCOPE_DESCRIPTION
        if represented_gp_groups == list(GP_SOURCE_GROUPS)
        else (
            "Last-known-good GP snapshot groups: "
            + (", ".join(represented_gp_groups) if represented_gp_groups else "unrecorded")
            + "; configured event-debris coverage remains pending a successful source-scope update."
        )
    )
    all_chunks_available = False
    if manifest_path.is_file() and previous_manifest_error is None:
        try:
            all_chunks_available = _tracked_manifest_is_complete(root_path, manifest_path)
        except SatelliteDataError as exc:
            previous_manifest_error = _bounded_metadata_error(exc)
    if manifest_path.is_file() and not all_chunks_available:
        error = _bounded_metadata_error(
            previous_manifest_error
            or "Existing tracked-object manifest closure is incomplete or corrupt."
        )
        failed_meta = dict(previous_meta)
        failed_meta.update(
            {
                "schema_version": "2.3.0",
                "parser_version": "2.3.0",
                "dataset_format": "OPENBEXI_TRACKED_OBJECT_CHUNKS",
                "provider": "CelesTrak",
                "mode": mode,
                "last_attempt_at": isoformat_utc(now),
                "last_status": "failed",
                "source_status": "DEGRADED",
                "last_error": error,
            }
        )
        atomic_write_json(meta_path, failed_meta, dry_run=dry_run, backup=False, indent=2)
        return UpdateResult(
            changed=False,
            skipped=True,
            mode=mode,
            message="Tracked-object last-known-good closure failed validation; preserved existing artifacts.",
            counts=(
                dict(previous_meta.get("counts", {}))
                if isinstance(previous_meta.get("counts"), dict)
                else {}
            ),
            errors=[error],
            paths={"manifest": str(manifest_path), "metadata": str(meta_path)},
        )
    manifest_revision_matches_metadata = bool(
        previous_manifest.get("catalog_revision")
        and previous_manifest.get("catalog_revision") == previous_meta.get("catalog_revision")
    )
    manifest_inputs_match = (
        previous_provenance.get("satcat_revision") == satcat_revision
        and previous_provenance.get("gp_revision") == gp_revision
    )
    prior_snapshot_is_reconciled = (
        previous_meta.get("source_status") == "VERIFIED_SNAPSHOT"
        and previous_meta.get("last_reconciled_catalog_revision")
        == previous_meta.get("catalog_revision")
    )
    requested_reconciliation = mode in {"all", RECONCILIATION_MODE}
    try:
        satcat_records, coverage_counts, quarantine = _tracked_satcat_rows(satcat_text)
    except Exception as exc:
        error = _bounded_metadata_error(exc)
        failed_meta = dict(previous_meta)
        failed_meta.update(
            {
                "schema_version": "2.3.0",
                "last_attempt_at": isoformat_utc(now),
                "last_status": "failed",
                "source_status": "DEGRADED",
                "last_error": error,
            }
        )
        atomic_write_json(meta_path, failed_meta, dry_run=dry_run, backup=False, indent=2)
        return UpdateResult(
            changed=False,
            skipped=True,
            mode=mode,
            message="Tracked-object input failed validation; preserved last-known-good data.",
            errors=[error],
            paths={"manifest": str(manifest_path), "metadata": str(meta_path)},
        )

    satcat_meta = load_json(repo_path(root_path, SATCAT_META_RELATIVE_PATH), {})
    satcat_meta = satcat_meta if isinstance(satcat_meta, dict) else {}
    declared = (
        satcat_meta.get("counts", {}).get("records")
        if isinstance(satcat_meta.get("counts"), dict)
        else None
    )
    provider_invariant = (
        coverage_counts["accepted"]
        + coverage_counts["quarantined"]
        + coverage_counts["duplicates"]
        == coverage_counts["received"]
    )
    satcat_metadata_matches = bool(
        satcat_meta.get("catalog_revision") == satcat_revision
        and satcat_meta.get("source_url") == CELESTRAK_SATCAT_CSV_URL
        and str(satcat_meta.get("last_status") or "").lower() in {"ok", "not-modified"}
        and isinstance(declared, int)
        and not isinstance(declared, bool)
        and declared >= 0
    )
    expected: int | None = declared if satcat_metadata_matches else None
    expected_matches_received = (
        expected == coverage_counts["received"] if expected is not None else None
    )
    verified_satcat_reconciliation = bool(
        satcat_metadata_matches
        and reconciliation_snapshot_is_current(satcat_meta, satcat_revision)
        and provider_invariant
        and expected_matches_received is True
    )
    if requested_reconciliation and not verified_satcat_reconciliation:
        error = _bounded_metadata_error(
            "Tracked reconciliation refused absence transitions because SATCAT is not a "
            "verified complete reconciliation snapshot."
        )
        failed_meta = dict(previous_meta)
        failed_meta.update(
            {
                "schema_version": "2.3.0",
                "parser_version": "2.3.0",
                "dataset_format": "OPENBEXI_TRACKED_OBJECT_CHUNKS",
                "provider": "CelesTrak",
                "mode": mode,
                "last_attempt_at": isoformat_utc(now),
                "last_status": "failed",
                "source_status": "DEGRADED",
                "last_error": error,
                "attempted_source_satcat_revision": satcat_revision,
                "attempted_source_gp_revision": gp_revision,
            }
        )
        atomic_write_json(meta_path, failed_meta, dry_run=dry_run, backup=False, indent=2)
        return UpdateResult(
            changed=False,
            skipped=True,
            mode=mode,
            message="Tracked reconciliation was not authorized; preserved last-known-good membership.",
            counts=(
                dict(previous_meta.get("counts", {}))
                if isinstance(previous_meta.get("counts"), dict)
                else {}
            ),
            errors=[error],
            paths={"manifest": str(manifest_path), "metadata": str(meta_path)},
        )

    unchanged_inputs_eligible = (
        previous_meta.get("input_revision") == input_revision
        and all_chunks_available
        and manifest_revision_matches_metadata
        and manifest_inputs_match
        and (not requested_reconciliation or prior_snapshot_is_reconciled)
    )
    source_group_provenance_matches = (
        previous_provenance.get("gp_source_groups") == represented_gp_groups
        and previous_meta.get("source_gp_groups") == represented_gp_groups
    )
    if unchanged_inputs_eligible and not source_group_provenance_matches:
        refreshed_manifest = dict(previous_manifest)
        refreshed_provenance = dict(previous_provenance)
        refreshed_provenance.update(
            {
                "gp_source_groups": represented_gp_groups,
                "gp_scope": represented_gp_scope,
            }
        )
        refreshed_manifest.update(
            {
                "generated_at": isoformat_utc(now),
                "provenance": refreshed_provenance,
            }
        )
        refreshed_meta = dict(previous_meta)
        refreshed_meta.update(
            {
                "mode": mode,
                "source_gp_groups": represented_gp_groups,
                "last_attempt_at": isoformat_utc(now),
                "last_success_at": isoformat_utc(now),
                "revalidated_at": isoformat_utc(now),
                "last_status": "ok",
            }
        )
        if requested_reconciliation:
            refreshed_meta["last_reconciled_at"] = isoformat_utc(now)
            refreshed_meta["last_reconciled_catalog_revision"] = previous_meta.get("catalog_revision")
        refreshed_meta.pop("last_error", None)
        manifest_snapshot = manifest_path.read_text(encoding="utf-8")
        metadata_snapshot = meta_path.read_text(encoding="utf-8") if meta_path.exists() else None
        try:
            atomic_write_json(manifest_path, refreshed_manifest, dry_run=dry_run, backup=True)
            if not dry_run and not _tracked_manifest_is_complete(root_path, manifest_path):
                raise SatelliteDataError("Tracked manifest verification failed after provenance promotion.")
            atomic_write_json(meta_path, refreshed_meta, dry_run=dry_run, backup=False, indent=2)
        except Exception:
            _restore_text_snapshot(
                manifest_path,
                manifest_snapshot,
                originally_existed=True,
                dry_run=dry_run,
            )
            _restore_text_snapshot(
                meta_path,
                metadata_snapshot,
                originally_existed=metadata_snapshot is not None,
                dry_run=dry_run,
            )
            raise
        return UpdateResult(
            changed=not dry_run,
            skipped=False,
            mode=mode,
            message="Tracked-object source provenance was updated without rewriting catalog chunks.",
            counts=(
                dict(previous_meta.get("counts", {}))
                if isinstance(previous_meta.get("counts"), dict)
                else {}
            ),
            paths={"manifest": str(manifest_path), "metadata": str(meta_path)},
        )

    if unchanged_inputs_eligible:
        refreshed_meta = dict(previous_meta)
        refreshed_meta.update(
            {
                "last_attempt_at": isoformat_utc(now),
                "last_success_at": isoformat_utc(now),
                "revalidated_at": isoformat_utc(now),
                "last_status": "not-modified",
            }
        )
        if requested_reconciliation:
            refreshed_meta["last_reconciled_at"] = isoformat_utc(now)
            refreshed_meta["last_reconciled_catalog_revision"] = previous_meta.get("catalog_revision")
        refreshed_meta.pop("last_error", None)
        atomic_write_json(meta_path, refreshed_meta, dry_run=dry_run, backup=False, indent=2)
        return UpdateResult(
            changed=False,
            skipped=True,
            mode=mode,
            message="Tracked-object sources have not changed.",
            counts=dict(previous_meta.get("counts", {})) if isinstance(previous_meta.get("counts"), dict) else {},
            paths={"manifest": str(manifest_path), "metadata": str(meta_path)},
        )

    gp_records, gp_quarantine = _valid_gp_records_for_tracked_catalog(gp_payload)
    quarantine.extend(gp_quarantine)
    previous = _load_tracked_records(root_path)
    current: dict[str, dict[str, object]] = {}
    for norad_id in sorted(satcat_records, key=lambda value: (int(value), value)):
        candidate = _tracked_record(norad_id, satcat_records.get(norad_id), gp_records.get(norad_id))
        prior = previous.get(norad_id)
        if prior is None:
            candidate["observation_status"] = "NEW"
        elif prior.get("catalog_membership_status") == "ABSENT" or prior.get("lifecycle_status") == "ABSENT":
            candidate["previous_lifecycle_status"] = "ABSENT"
            candidate["reappeared_status"] = candidate["lifecycle_status"]
            candidate["observation_status"] = "REAPPEARED"
        elif _tracked_record_comparison(prior) == _tracked_record_comparison(candidate):
            candidate["observation_status"] = "OBSERVED"
        else:
            candidate["observation_status"] = "CHANGED"
        current[norad_id] = candidate

    output = dict(current)
    if mode in {"all", RECONCILIATION_MODE}:
        for norad_id in sorted(set(previous) - set(current), key=lambda value: (int(value), value)):
            output[norad_id] = _tracked_absent_record(previous[norad_id])
    else:
        for norad_id in sorted(set(previous) - set(current), key=lambda value: (int(value), value)):
            output[norad_id] = previous[norad_id]

    chunks: dict[str, list[dict[str, object]]] = {name: [] for name in TRACKED_OBJECT_TYPES}
    history_chunks: dict[str, list[dict[str, object]]] = {
        name: [] for name in TRACKED_OBJECT_TYPES
    }
    for norad_id in sorted(output, key=lambda value: (int(value), value)):
        record = output[norad_id]
        object_type = str(record.get("object_type") or "UNKNOWN")
        selected_type = object_type if object_type in chunks else "UNKNOWN"
        if record.get("catalog_membership_status") == "PRESENT" and not record.get("decay_date"):
            chunks[selected_type].append(record)
        else:
            history_chunks[selected_type].append(record)

    output_records = list(output.values())
    counts: dict[str, object] = {
        "expected": expected,
        "expected_provider_records": None,
        **coverage_counts,
        "total": len(output_records),
        "current": sum(
            record.get("catalog_membership_status") == "PRESENT" and not record.get("decay_date")
            for record in output_records
        ),
        "historical": sum(bool(record.get("decay_date")) for record in output_records),
        "history_total": sum(len(records) for records in history_chunks.values()),
        "absent": sum(record.get("catalog_membership_status") == "ABSENT" for record in output_records),
        "propagatable": sum(record.get("has_current_elements") is True for record in output_records),
        "metadata_only": sum(record.get("metadata_only") is True for record in output_records),
        "current_propagatable": sum(
            record.get("catalog_membership_status") == "PRESENT"
            and not record.get("decay_date")
            and record.get("has_current_elements") is True
            for record in output_records
        ),
        "gp_only": len(set(gp_records) - set(satcat_records)),
        "gp_quarantined": len(gp_quarantine),
        "small_rcs_current": sum(
            record.get("catalog_membership_status") == "PRESENT"
            and not record.get("decay_date")
            and isinstance(record.get("rcs_m2"), (int, float))
            and float(record["rcs_m2"]) < 0.1
            for record in output_records
        ),
        "missing_rcs_current": sum(
            record.get("catalog_membership_status") == "PRESENT"
            and not record.get("decay_date")
            and record.get("rcs_status") == "MISSING"
            for record in output_records
        ),
        "debris_small_rcs_current": sum(
            record.get("object_type") == "DEBRIS"
            and record.get("catalog_membership_status") == "PRESENT"
            and not record.get("decay_date")
            and isinstance(record.get("rcs_m2"), (int, float))
            and float(record["rcs_m2"]) < 0.1
            for record in output_records
        ),
        "debris_missing_rcs_current": sum(
            record.get("object_type") == "DEBRIS"
            and record.get("catalog_membership_status") == "PRESENT"
            and not record.get("decay_date")
            and record.get("rcs_status") == "MISSING"
            for record in output_records
        ),
        "object_types": {
            object_type: len(chunks[object_type]) + len(history_chunks[object_type])
            for object_type in TRACKED_OBJECT_TYPES
        },
    }
    counts["current_object_types"] = {
        object_type: sum(
            record.get("object_type") == object_type
            and record.get("catalog_membership_status") == "PRESENT"
            and not record.get("decay_date")
            for record in output_records
        )
        for object_type in TRACKED_OBJECT_TYPES
    }
    counts["current_metadata_only"] = counts["current"] - counts["current_propagatable"]
    counts["orbit_classes"] = {
        orbit_class: sum(record.get("orbit_class") == orbit_class for record in output_records)
        for orbit_class in ("LEO", "MEO", "GEO", "HEO", "OTHER", "DECAYING", "UNKNOWN")
    }
    counts["lifecycle_statuses"] = {
        lifecycle: sum(record.get("lifecycle_status") == lifecycle for record in output_records)
        for lifecycle in ("ACTIVE", "INACTIVE", "DECAYED", "ABSENT", "UNKNOWN")
    }
    catalog_partition_holds = counts["total"] == counts["propagatable"] + counts["metadata_only"]

    chunk_payloads: dict[Path, object] = {}

    def make_chunk(
        object_type: str,
        scope: str,
        records: list[dict[str, object]],
    ) -> dict[str, object]:
        payload = {
            "schema_version": "2.3.0",
            "scope": scope,
            "object_type": object_type,
            "records": records,
        }
        text = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        digest_hex = hashlib.sha256(text.encode("utf-8")).hexdigest()
        filename = f"{digest_hex}-{scope.lower()}-{TRACKED_CHUNK_FILES[object_type]}.json"
        relative_path = TRACKED_DIRECTORY_RELATIVE_PATH / "chunks" / filename
        path = repo_path(root_path, relative_path)
        chunk_payloads[path] = payload
        return {
            "id": f"{scope.lower()}-{object_type.lower().replace('_', '-')}",
            "path": relative_path.as_posix(),
            "scope": scope,
            "object_type": object_type,
            "count": len(records),
            "sha256": "sha256:" + digest_hex,
            "bytes": len(text.encode("utf-8")),
        }

    chunk_descriptors = [
        make_chunk(object_type, "CURRENT", chunks[object_type])
        for object_type in TRACKED_OBJECT_TYPES
    ]
    history_chunk_descriptors = [
        make_chunk(object_type, "HISTORICAL", history_chunks[object_type])
        for object_type in TRACKED_OBJECT_TYPES
    ]
    descriptor_material = [
        {"path": item["path"], "sha256": item["sha256"]}
        for item in [*chunk_descriptors, *history_chunk_descriptors]
    ]
    quarantine_payload = {
        "schema_version": "2.3.0",
        "records": quarantine,
    }
    quarantine_text = json.dumps(
        quarantine_payload,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    )
    quarantine_digest = hashlib.sha256(quarantine_text.encode("utf-8")).hexdigest()
    quarantine_relative_path = (
        TRACKED_DIRECTORY_RELATIVE_PATH
        / "chunks"
        / f"{quarantine_digest}-quarantine.json"
    )
    quarantine_path = repo_path(root_path, quarantine_relative_path)
    chunk_payloads[quarantine_path] = quarantine_payload
    coverage_revision = catalog_revision_for_payload(
        {
            "row_accounting": coverage_counts,
            "expected": expected,
            "quarantine_sha256": "sha256:" + quarantine_digest,
        }
    )
    catalog_revision = catalog_revision_for_payload(
        {
            "chunks": descriptor_material,
            "coverage_revision": coverage_revision,
        }
    )
    complete_snapshot = bool(
        requested_reconciliation and verified_satcat_reconciliation
    )
    manifest = {
        "schema_version": "2.3.0",
        "catalog_kind": "provider_tracked_objects",
        "catalog_revision": catalog_revision,
        "coverage_revision": coverage_revision,
        "generated_at": isoformat_utc(now),
        "provider_completeness_claim": False,
        "scientific_boundary": (
            "All records published in the provider SATCAT snapshot are retained; only records with "
            "validated current GP/OMM elements are propagatable. This is not an inventory of every "
            "physical debris particle."
        ),
        "default_membership": "CURRENT",
        "scope": {
            "default": "CURRENT",
            "current_records": counts["current"],
            "historical_records": counts["history_total"],
            "historical_decayed_records": counts["historical"],
            "absent_records": counts["absent"],
        },
        "counts": counts,
        "coverage": {
            "expected": expected,
            "expected_provider_records": None,
            "received": coverage_counts["received"],
            "accepted": coverage_counts["accepted"],
            "quarantined": coverage_counts["quarantined"],
            "duplicates": coverage_counts["duplicates"],
            "complete_source_snapshot": complete_snapshot,
            "provider_completeness_claim": False,
            "invariant": "received == accepted + quarantined + duplicates",
            "invariant_holds": provider_invariant,
            "expected_matches_received": expected_matches_received,
        },
        "invariants": {
            "provider_coverage_holds": provider_invariant,
            "catalog_partition": "total == propagatable + metadata_only",
            "catalog_partition_holds": catalog_partition_holds,
            "current_chunk_count_holds": sum(item["count"] for item in chunk_descriptors) == counts["current"],
            "history_chunk_count_holds": sum(item["count"] for item in history_chunk_descriptors) == counts["history_total"],
        },
        "taxonomy": {
            "object_types": list(TRACKED_OBJECT_TYPES),
            "lifecycle_semantics": "Lifecycle and provider observation transitions are independent from element availability.",
            "observation_statuses": ["NEW", "OBSERVED", "CHANGED", "ABSENT", "REAPPEARED"],
            "element_availability_statuses": ["CURRENT_ELEMENTS", "NO_CURRENT_ELEMENTS"],
            "mission_related_source": "Not independently classified by CelesTrak SATCAT; no heuristic relabeling is applied.",
            "duplicate_policy": "Duplicate NORAD identities are audited and resolved deterministically with the last SATCAT row winning.",
            "rcs_semantics": "rcs_m2 is provider-published radar cross-section, not physical object size.",
        },
        "provenance": {
            "provider": "CelesTrak",
            "satcat_url": CELESTRAK_SATCAT_CSV_URL,
            "satcat_revision": satcat_revision,
            "gp_revision": gp_revision,
            "gp_source_groups": represented_gp_groups,
            "gp_scope": represented_gp_scope,
            "gp_join": {
                "satcat_intersection": len(set(gp_records) & set(satcat_records)),
                "gp_only_excluded_from_tracked_scope": len(set(gp_records) - set(satcat_records)),
                "policy": "The tracked scope is SATCAT-defined; GP-only identities remain in GP.json and are not counted twice.",
            },
        },
        "chunks": chunk_descriptors,
        "history_chunks": history_chunk_descriptors,
        "quarantine": {
            "path": quarantine_relative_path.as_posix(),
            "count": len(quarantine),
            "sha256": "sha256:" + quarantine_digest,
            "bytes": len(quarantine_text.encode("utf-8")),
        },
    }

    success_meta = {
        "schema_version": "2.3.0",
        "parser_version": "2.3.0",
        "dataset_format": "OPENBEXI_TRACKED_OBJECT_CHUNKS",
        "provider": "CelesTrak",
        "mode": mode,
        "source_status": "VERIFIED_SNAPSHOT" if complete_snapshot and provider_invariant else "PARTIAL",
        "provider_completeness_claim": False,
        "input_revision": input_revision,
        "source_satcat_revision": satcat_revision,
        "source_gp_revision": gp_revision,
        "source_gp_groups": represented_gp_groups,
        "catalog_revision": catalog_revision,
        "coverage_revision": coverage_revision,
        "dataset_hash": catalog_revision,
        "fetched_at": isoformat_utc(now),
        "last_attempt_at": isoformat_utc(now),
        "last_success_at": isoformat_utc(now),
        "last_status": "ok",
        "counts": counts,
        "coverage": manifest["coverage"],
    }
    if complete_snapshot:
        success_meta["last_reconciled_at"] = isoformat_utc(now)
        success_meta["last_reconciled_catalog_revision"] = catalog_revision
    elif previous_meta.get("last_reconciled_at"):
        success_meta["last_reconciled_at"] = previous_meta["last_reconciled_at"]
        success_meta["last_reconciled_catalog_revision"] = previous_meta.get(
            "last_reconciled_catalog_revision"
        )

    outputs = {
        **chunk_payloads,
        manifest_path: manifest,
    }
    original = {
        path: (path.read_text(encoding="utf-8") if path.exists() else None)
        for path in outputs
    }
    changed_paths = [
        path
        for path, payload in outputs.items()
        if original[path] != json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    ]
    manifest_snapshot = manifest_path.read_bytes() if manifest_path.exists() else None
    metadata_snapshot = meta_path.read_bytes() if meta_path.exists() else None
    try:
        for path in changed_paths:
            if path != manifest_path:
                atomic_write_json(path, outputs[path], dry_run=dry_run, backup=False)
        if not dry_run:
            staged_manifest = dict(manifest)
            for descriptor, path in zip(
                [*chunk_descriptors, *history_chunk_descriptors, manifest["quarantine"]],
                _tracked_manifest_chunk_paths(root_path, staged_manifest),
            ):
                body = path.read_bytes()
                if (
                    "sha256:" + hashlib.sha256(body).hexdigest() != descriptor["sha256"]
                    or len(body) != descriptor["bytes"]
                ):
                    raise SatelliteDataError(f"Tracked chunk verification failed before manifest promotion: {path.name}")
        if manifest_path in changed_paths:
            atomic_write_json(manifest_path, manifest, dry_run=dry_run, backup=True)
        if not dry_run and not _tracked_manifest_is_complete(root_path, manifest_path):
            raise SatelliteDataError("Tracked manifest verification failed after promotion.")
        atomic_write_json(meta_path, success_meta, dry_run=dry_run, backup=False, indent=2)
        if not dry_run:
            promoted_meta = load_json(meta_path, {})
            if (
                not isinstance(promoted_meta, dict)
                or promoted_meta.get("catalog_revision") != manifest.get("catalog_revision")
                or promoted_meta.get("coverage_revision") != manifest.get("coverage_revision")
            ):
                raise SatelliteDataError("Tracked metadata verification failed after promotion.")
    except Exception:
        _restore_bytes_snapshot(
            manifest_path,
            manifest_snapshot,
            originally_existed=manifest_snapshot is not None,
            dry_run=dry_run,
        )
        _restore_bytes_snapshot(
            meta_path,
            metadata_snapshot,
            originally_existed=metadata_snapshot is not None,
            dry_run=dry_run,
        )
        for path, original_text in original.items():
            if path == manifest_path:
                continue
            _restore_text_snapshot(
                path,
                original_text,
                originally_existed=original_text is not None,
                dry_run=dry_run,
            )
        raise
    if not dry_run:
        with contextlib.suppress(Exception):
            _prune_unreferenced_tracked_chunks(root_path, manifest_path)
    return UpdateResult(
        changed=bool(changed_paths) and not dry_run,
        skipped=False,
        mode=mode,
        message="Tracked-object catalog build completed.",
        counts={key: value for key, value in counts.items() if isinstance(value, int)},
        errors=[],
        paths={
            "manifest": str(manifest_path),
            "metadata": str(meta_path),
            "quarantine": str(quarantine_path),
        },
    )


def build_decayed_db(
    *,
    root: Path | str,
    mode: str = "incremental",
    force: bool = False,
    dry_run: bool = False,
    now: dt.datetime | None = None,
    interval_hours: float = DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
    refresh_satcat: bool = False,
    fetcher: Callable[..., FetchResponse] | None = None,
) -> UpdateResult:
    now = now or utc_now()
    root_path = Path(root).resolve()
    input_path = repo_path(root_path, SATCAT_RELATIVE_PATH)
    output_path = repo_path(root_path, DECAYED_RELATIVE_PATH)
    meta_path = repo_path(root_path, DECAYED_META_RELATIVE_PATH)
    meta = load_json(meta_path, {})
    if not isinstance(meta, dict):
        meta = {}

    refresh_result: UpdateResult | None = None
    if refresh_satcat:
        refresh_result = refresh_satcat_csv(
            root=root_path,
            force=force,
            dry_run=dry_run,
            fetcher=fetcher,
            now=now,
            interval_hours=interval_hours,
        )
        if refresh_result.errors and not input_path.exists():
            error = _bounded_metadata_error("; ".join(refresh_result.errors))
            failed_meta = dict(meta)
            failed_meta.update(
                {
                    "mode": mode,
                    "last_attempt_at": isoformat_utc(now),
                    "last_error": error,
                    "last_status": "failed",
                    "source": SATCAT_RELATIVE_PATH.as_posix(),
                }
            )
            atomic_write_json(meta_path, failed_meta, dry_run=dry_run, backup=False, indent=2)
            return UpdateResult(
                changed=False,
                skipped=True,
                mode=mode,
                message="SATCAT refresh failed and no local satcat.csv exists; preserved existing decayed DB.",
                counts={},
                errors=[error],
                paths={"decayed": str(output_path), "metadata": str(meta_path), "satcat": str(input_path)},
            )
        if (
            mode not in {"all", RECONCILIATION_MODE} and
            refresh_result.skipped and
            "not changed" in refresh_result.message.lower() and
            output_path.exists()
        ):
            existing = load_json(output_path, {})
            objects = len(existing) if isinstance(existing, dict) else 0
            record_count = sum(len(records) for records in existing.values()) if isinstance(existing, dict) else 0
            skipped_meta = dict(meta)
            skipped_meta.update(
                {
                    "mode": mode,
                    "last_attempt_at": isoformat_utc(now),
                    "last_status": "not-modified",
                    "source": SATCAT_RELATIVE_PATH.as_posix(),
                    "satcat_refresh": update_result_for_metadata(refresh_result, root_path),
                    "counts": {"objects": objects, "records": record_count},
                }
            )
            atomic_write_json(meta_path, skipped_meta, dry_run=dry_run, backup=False, indent=2)
            return UpdateResult(
                changed=False,
                skipped=True,
                mode=mode,
                message="Decayed DB rebuild skipped; SATCAT source has not changed.",
                counts={"objects": objects, "records": record_count},
                paths={"decayed": str(output_path), "metadata": str(meta_path), "satcat": str(input_path)},
            )

    if mode != "all" and not force:
        latest = latest_success_time(meta, output_path)
        if is_recent_enough(latest, interval_hours, now=now):
            existing = load_json(output_path, {})
            count = sum(len(records) for records in existing.values()) if isinstance(existing, dict) else 0
            return UpdateResult(
                changed=False,
                skipped=True,
                mode=mode,
                message=f"Decayed DB update skipped; last build is newer than {interval_hours:g} hours.",
                counts={"records": count},
                paths={"decayed": str(output_path), "metadata": str(meta_path)},
            )

    try:
        grouped = parse_satcat_csv(input_path)
    except Exception as exc:
        failed_meta = dict(meta)
        failed_meta.update(
            {
                "mode": mode,
                "last_attempt_at": isoformat_utc(now),
                "last_error": str(exc),
                "last_status": "failed",
            }
        )
        atomic_write_json(meta_path, failed_meta, dry_run=dry_run, backup=False, indent=2)
        if mode == "all":
            raise
        return UpdateResult(
            changed=False,
            skipped=True,
            mode=mode,
            message="SATCAT unavailable or invalid; preserved existing decayed DB.",
            counts={},
            errors=[str(exc)],
            paths={"decayed": str(output_path), "metadata": str(meta_path)},
        )

    existing_payload = load_json(output_path, {})
    existing_grouped = existing_payload if isinstance(existing_payload, dict) else {}
    grouped, retained_history = merge_historical_decayed_records(existing_grouped, grouped)
    record_count = sum(len(records) for records in grouped.values())
    changed = not isinstance(existing_payload, dict) or grouped != existing_grouped
    if changed:
        atomic_write_json(output_path, grouped, dry_run=dry_run, backup=True, indent=2)
    newest_confirmed_decay_date = max(
        (
            _valid_launch_date(record.get("DECAY_DATE"))
            for records in grouped.values()
            for record in records
            if _valid_launch_date(record.get("DECAY_DATE"))
        ),
        default=None,
    )
    revision = catalog_revision_for_payload(grouped)
    success_meta = {
        "schema_version": "2.2.0",
        "built_at": isoformat_utc(now),
        "fetched_at": isoformat_utc(now),
        "last_success_at": isoformat_utc(now),
        "last_attempt_at": isoformat_utc(now),
        "last_status": "ok",
        "mode": mode,
        "source": SATCAT_RELATIVE_PATH.as_posix(),
        "satcat_refresh": update_result_for_metadata(refresh_result, root_path) if refresh_result else None,
        "catalog_revision": revision,
        "dataset_hash": revision,
        "newest_confirmed_decay_date": newest_confirmed_decay_date,
        "counts": {
            "objects": len(grouped),
            "records": record_count,
            "retained_history": retained_history,
        },
    }
    if mode == RECONCILIATION_MODE:
        success_meta["last_reconciled_at"] = isoformat_utc(now)
        success_meta["last_reconciled_catalog_revision"] = revision
    elif meta.get("last_reconciled_at"):
        success_meta["last_reconciled_at"] = meta["last_reconciled_at"]
        if meta.get("last_reconciled_catalog_revision"):
            success_meta["last_reconciled_catalog_revision"] = meta["last_reconciled_catalog_revision"]
    atomic_write_json(meta_path, success_meta, dry_run=dry_run, backup=False, indent=2)
    return UpdateResult(
        changed=changed and not dry_run,
        skipped=False,
        mode=mode,
        message="Decayed DB build completed.",
        counts={"objects": len(grouped), "records": record_count, "retained_history": retained_history},
        paths={"decayed": str(output_path), "metadata": str(meta_path)},
    )


def try_spacetrack_fallback() -> FetchResponse | None:
    username = os.environ.get("SPACETRACK_USERNAME")
    password = os.environ.get("SPACETRACK_PASSWORD")
    if not username or not password:
        return None
    # Space-Track is intentionally disabled unless credentials are configured.
    # The server does not call this path by default. Keeping the hook explicit
    # prevents accidental use of unverified mirrors when CelesTrak is down.
    return None


def _process_is_running(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def update_lock_is_stale(
    lock_path: Path,
    *,
    now: dt.datetime | None = None,
    stale_hours: float = UPDATE_LOCK_STALE_HOURS,
) -> bool:
    now = now or utc_now()
    try:
        text = lock_path.read_text(encoding="utf-8").strip()
        parts = text.split(maxsplit=1)
        try:
            pid = int(parts[0]) if parts else 0
        except ValueError:
            pid = 0
        created_at = parse_iso_datetime(parts[1]) if len(parts) == 2 else None
        if created_at is None:
            created_at = dt.datetime.fromtimestamp(lock_path.stat().st_mtime, tz=dt.timezone.utc)
    except OSError:
        return False
    age_hours = max(0.0, (now - created_at).total_seconds() / 3600.0)
    return (pid > 0 and not _process_is_running(pid)) or age_hours >= stale_hours


@contextlib.contextmanager
def update_lock(root: Path | str):
    lock_path = repo_path(root, UPDATE_LOCK_RELATIVE_PATH)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    fd: int | None = None
    acquired = False
    for attempt in range(2):
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, f"{os.getpid()} {isoformat_utc()}\n".encode("utf-8"))
            acquired = True
            break
        except FileExistsError:
            if attempt == 0 and update_lock_is_stale(lock_path):
                with contextlib.suppress(FileNotFoundError):
                    lock_path.unlink()
                continue
            break
    try:
        yield acquired
    finally:
        if fd is not None:
            os.close(fd)
            with contextlib.suppress(FileNotFoundError):
                lock_path.unlink()


def metadata_is_older_than(
    root: Path | str,
    relative_meta_path: Path,
    data_relative_path: Path,
    hours: float,
    *,
    now: dt.datetime | None = None,
) -> bool:
    meta_path = repo_path(root, relative_meta_path)
    data_path = repo_path(root, data_relative_path)
    meta = load_json(meta_path, {})
    if not isinstance(meta, dict):
        meta = {}
    latest = latest_success_time(meta, data_path)
    return not is_recent_enough(latest, hours, now=now)


def metadata_reconciliation_is_older_than(
    root: Path | str,
    relative_meta_path: Path,
    hours: float,
    *,
    now: dt.datetime | None = None,
) -> bool:
    meta = load_json(repo_path(root, relative_meta_path), {})
    if not isinstance(meta, dict):
        return True
    return not is_recent_enough(parse_iso_datetime(meta.get("last_reconciled_at")), hours, now=now)


def maybe_update_satellite_data(
    *,
    root: Path | str,
    interval_hours: float = DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
    gp_interval_hours: float | None = None,
    tle_interval_hours: float | None = None,
    satcat_interval_hours: float | None = None,
    tracked_interval_hours: float | None = None,
    launches_interval_hours: float | None = None,
    decayed_interval_hours: float | None = None,
    reconciliation_interval_hours: float | None = None,
    force: bool = False,
    dry_run: bool = False,
    fetcher: Callable[..., FetchResponse] | None = None,
    now: dt.datetime | None = None,
) -> dict[str, object]:
    now = now or utc_now()
    root_path = Path(root).resolve()

    def configured_interval(value: float | None, fallback: float) -> float:
        resolved = fallback if value is None else float(value)
        if not math.isfinite(resolved) or resolved <= 0:
            raise SatelliteDataError("Scheduled data intervals must be finite positive hours.")
        return resolved

    base_interval = configured_interval(interval_hours, DEFAULT_SERVER_UPDATE_INTERVAL_HOURS)
    intervals = {
        "gp": configured_interval(gp_interval_hours, base_interval),
        "tle": configured_interval(tle_interval_hours, base_interval),
        "satcat": configured_interval(satcat_interval_hours, base_interval),
        "tracked": configured_interval(tracked_interval_hours, satcat_interval_hours or base_interval),
        "launches": configured_interval(launches_interval_hours, satcat_interval_hours or base_interval),
        "decayed": configured_interval(decayed_interval_hours, satcat_interval_hours or base_interval),
        "reconciliation": configured_interval(reconciliation_interval_hours, base_interval),
    }
    results: dict[str, object] = {
        "started_at": isoformat_utc(now),
        "skipped": False,
        "lock_acquired": False,
        "intervals_hours": intervals,
        "due": {},
        "gp": None,
        "tle": None,
        "satcat": None,
        "tracked": None,
        "launches": None,
        "decayed": None,
        "reconciliation": None,
    }
    lock_context = contextlib.nullcontext(True) if dry_run else update_lock(root_path)
    with lock_context as acquired:
        results["lock_acquired"] = acquired
        if not acquired:
            results["skipped"] = True
            results["message"] = "Another satellite data update is already running."
            return results

        due = {
            "gp": force or metadata_is_older_than(
                root_path, GP_META_RELATIVE_PATH, GP_RELATIVE_PATH, intervals["gp"], now=now
            ),
            "tle": force or metadata_is_older_than(
                root_path, TLE_META_RELATIVE_PATH, TLE_RELATIVE_PATH, intervals["tle"], now=now
            ),
            "satcat": force or metadata_is_older_than(
                root_path, SATCAT_META_RELATIVE_PATH, SATCAT_RELATIVE_PATH, intervals["satcat"], now=now
            ),
            "tracked": force or metadata_is_older_than(
                root_path,
                TRACKED_META_RELATIVE_PATH,
                TRACKED_MANIFEST_RELATIVE_PATH,
                intervals["tracked"],
                now=now,
            ),
            "launches": force or metadata_is_older_than(
                root_path, LAUNCHES_META_RELATIVE_PATH, LAUNCHES_RELATIVE_PATH, intervals["launches"], now=now
            ),
            "decayed": force or metadata_is_older_than(
                root_path, DECAYED_META_RELATIVE_PATH, DECAYED_RELATIVE_PATH, intervals["decayed"], now=now
            ),
        }
        reconciliation_due = {
            "gp": force or metadata_reconciliation_is_older_than(
                root_path, GP_META_RELATIVE_PATH, intervals["reconciliation"], now=now
            ),
            "tle": force or metadata_reconciliation_is_older_than(
                root_path, TLE_META_RELATIVE_PATH, intervals["reconciliation"], now=now
            ),
            "satcat": force or metadata_reconciliation_is_older_than(
                root_path, SATCAT_META_RELATIVE_PATH, intervals["reconciliation"], now=now
            ),
            "tracked": force or metadata_reconciliation_is_older_than(
                root_path, TRACKED_META_RELATIVE_PATH, intervals["reconciliation"], now=now
            ),
            "launches": force or metadata_reconciliation_is_older_than(
                root_path, LAUNCHES_META_RELATIVE_PATH, intervals["reconciliation"], now=now
            ),
            "decayed": force or metadata_reconciliation_is_older_than(
                root_path, DECAYED_META_RELATIVE_PATH, intervals["reconciliation"], now=now
            ),
        }
        results["due"] = {**due, "reconciliation": reconciliation_due}
        executed_names: set[str] = set()

        def record_result(name: str, operation: Callable[[], UpdateResult]) -> UpdateResult | None:
            executed_names.add(name)
            try:
                result = operation()
            except Exception as exc:
                results[name] = {
                    "changed": False,
                    "skipped": True,
                    "mode": "scheduled",
                    "message": f"{name} update failed; preserved last-known-good data.",
                    "counts": {},
                    "errors": [str(exc)],
                    "paths": {},
                }
                return None
            results[name] = update_result_for_metadata(result, root_path)
            return result

        satcat_result: UpdateResult | None = None
        if due["satcat"] or reconciliation_due["satcat"]:
            satcat_result = record_result(
                "satcat",
                lambda: refresh_satcat_csv(
                    root=root_path,
                    force=force or reconciliation_due["satcat"],
                    dry_run=dry_run,
                    fetcher=fetcher,
                    now=now,
                    interval_hours=intervals["satcat"],
                    reconcile=reconciliation_due["satcat"],
                    build_launches=False,
                ),
            )
        satcat_changed = bool(satcat_result and satcat_result.changed)
        satcat_reconciled = bool(
            satcat_result
            and satcat_result.mode == "refresh-satcat"
            and reconciliation_due["satcat"]
            and not satcat_result.errors
        )

        if due["launches"] or reconciliation_due["launches"] or satcat_changed:
            record_result(
                "launches",
                lambda: build_launch_catalog(
                    root=root_path,
                    dry_run=dry_run,
                    now=now,
                    mode=RECONCILIATION_MODE if reconciliation_due["launches"] else "incremental",
                ),
            )

        if due["decayed"] or reconciliation_due["decayed"] or satcat_changed:
            record_result(
                "decayed",
                lambda: build_decayed_db(
                    root=root_path,
                    mode=RECONCILIATION_MODE if reconciliation_due["decayed"] else "incremental",
                    force=force or reconciliation_due["decayed"],
                    dry_run=dry_run,
                    now=now,
                    interval_hours=intervals["decayed"],
                    refresh_satcat=False,
                ),
            )

        if due["tle"] or reconciliation_due["tle"] or satcat_changed:
            record_result(
                "tle",
                lambda: export_tle_data(
                    root=root_path,
                    mode=RECONCILIATION_MODE if reconciliation_due["tle"] else "incremental",
                    force=force or reconciliation_due["tle"],
                    dry_run=dry_run,
                    fetcher=fetcher,
                    now=now,
                    allow_space_track=False,
                ),
            )

        gp_result: UpdateResult | None = None
        if due["gp"] or reconciliation_due["gp"] or satcat_changed:
            gp_result = record_result(
                "gp",
                lambda: export_gp_data(
                    root=root_path,
                    mode=RECONCILIATION_MODE if reconciliation_due["gp"] else "incremental",
                    force=force or reconciliation_due["gp"],
                    dry_run=dry_run,
                    fetcher=fetcher,
                    now=now,
                ),
            )
        gp_changed = bool(gp_result and gp_result.changed)

        tracked_reconciliation_attempted = False
        if (
            due["tracked"]
            or reconciliation_due["tracked"]
            or satcat_changed
            or satcat_reconciled
            or gp_changed
        ):
            tracked_reconciliation_attempted = bool(
                reconciliation_due["tracked"] or satcat_reconciled
            )
            record_result(
                "tracked",
                lambda: build_tracked_catalog(
                    root=root_path,
                    mode=(
                        RECONCILIATION_MODE
                        if reconciliation_due["tracked"] or satcat_reconciled
                        else "incremental"
                    ),
                    dry_run=dry_run,
                    now=now,
                ),
            )

        reconciliation_was_due = any(reconciliation_due.values())
        effective_reconciliation = dict(reconciliation_due)
        if tracked_reconciliation_attempted:
            effective_reconciliation["tracked"] = True
        reconciliation_names = [
            name for name, was_attempted in effective_reconciliation.items() if was_attempted
        ]
        error_dependency_names = [
            name
            for name in reconciliation_due
            if reconciliation_was_due
            and (effective_reconciliation.get(name) or name in executed_names)
        ]
        reconciliation_errors = [
            error
            for name in error_dependency_names
            for error in (
                results.get(name, {}).get("errors", [])
                if isinstance(results.get(name), dict)
                else [f"{name} reconciliation did not run"]
                if effective_reconciliation.get(name)
                else []
            )
        ]
        reconciliation_completed = reconciliation_was_due and not reconciliation_errors
        reconciliation_changed = any(
            isinstance(results.get(name), dict) and bool(results[name].get("changed"))
            for name in reconciliation_names
        )
        results["reconciliation"] = {
            "changed": reconciliation_changed,
            "skipped": not reconciliation_was_due,
            "mode": RECONCILIATION_MODE,
            "message": (
                "Daily satellite data reconciliation completed."
                if reconciliation_completed
                else (
                    "Satellite data reconciliation completed with dataset errors."
                    if reconciliation_was_due
                    else "Satellite data reconciliation is not due."
                )
            ),
            "due": reconciliation_was_due,
            "datasets": effective_reconciliation,
            "completed": reconciliation_completed,
            "last_reconciled_at": isoformat_utc(now) if reconciliation_completed else None,
            "counts": {"datasets": len(reconciliation_names)},
            "errors": reconciliation_errors,
            "paths": {},
        }

        if not any(due.values()) and not any(reconciliation_due.values()):
            results["skipped"] = True
            results["message"] = "All satellite datasets are within their configured freshness windows."
        nested_results = [
            results.get(key)
            for key in ("gp", "tle", "satcat", "tracked", "launches", "decayed")
        ]
        results["degraded"] = any(
            isinstance(item, dict) and bool(item.get("errors"))
            for item in nested_results
        )
    results["finished_at"] = isoformat_utc(now)
    return results


def _print_result(result: UpdateResult | dict[str, object]) -> None:
    payload = result.to_dict() if isinstance(result, UpdateResult) else result
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Maintain OpenBEXI Earth Orbit satellite data files.")
    parser.add_argument("--root", default=None, help="Repository root. Default: repository root containing this tool.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    gp_parser = subparsers.add_parser("export-gp", help="Export or incrementally update json/gp/GP.json from CelesTrak OMM JSON.")
    gp_parser.add_argument(
        "--all",
        action="store_true",
        help="Replace the local GP catalog from the complete configured GP source scope.",
    )
    gp_parser.add_argument("--force", action="store_true", help="Ignore freshness checks.")
    gp_parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing files.")
    gp_parser.add_argument(
        "--allow-large-catalog-shrink",
        action="store_true",
        help="Explicitly permit a production-scale full replacement below the catalog shrink guard.",
    )

    export_parser = subparsers.add_parser(
        "export-tle",
        help="Deprecated compatibility command: update the legacy json/tle/TLE.json catalog.",
    )
    export_parser.add_argument("--all", action="store_true", help="Use the legacy Java full-source group workflow.")
    export_parser.add_argument("--force", action="store_true", help="Ignore freshness checks.")
    export_parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing files.")
    export_parser.add_argument(
        "--allow-large-catalog-shrink",
        action="store_true",
        help="Explicitly permit a production-scale full replacement below the catalog shrink guard.",
    )
    export_parser.add_argument(
        "--allow-space-track-fallback",
        action="store_true",
        help="Permit optional Space-Track fallback only when credentials are configured.",
    )
    export_parser.add_argument(
        "--refresh-launch-dates",
        action="store_true",
        help=(
            "Explicitly opt in to legacy N2YO HTML launch-date enrichment before export. "
            "Disabled by default, including with --all; not approved for release evidence."
        ),
    )

    decayed_parser = subparsers.add_parser("build-decayed-db", help="Build json/decayed/decayed.json from json/satcat.csv.")
    decayed_parser.add_argument("--all", action="store_true", help="Run the legacy-compatible full SATCAT rebuild.")
    decayed_parser.add_argument("--force", action="store_true", help="Ignore freshness checks.")
    decayed_parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing files.")
    decayed_parser.add_argument(
        "--refresh-satcat",
        action="store_true",
        help="Download CelesTrak raw SATCAT CSV before rebuilding decayed.json.",
    )

    satcat_parser = subparsers.add_parser("refresh-satcat", help="Download CelesTrak raw SATCAT CSV to json/satcat.csv.")
    satcat_parser.add_argument("--force", action="store_true", help="Ignore freshness checks.")
    satcat_parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing files.")
    satcat_parser.add_argument(
        "--allow-large-catalog-shrink",
        action="store_true",
        help="Explicitly permit a production-scale full replacement below the catalog shrink guard.",
    )

    launches_parser = subparsers.add_parser(
        "build-launches",
        help="Build json/launches/launches.json from the local SATCAT CSV.",
    )
    launches_parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing files.")

    tracked_parser = subparsers.add_parser(
        "build-tracked",
        help="Build the chunked provider-tracked object inventory from local SATCAT and GP data.",
    )
    tracked_parser.add_argument(
        "--all",
        action="store_true",
        help="Reconcile a verified complete SATCAT snapshot and mark missing prior identities absent.",
    )
    tracked_parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing files.")

    maybe_parser = subparsers.add_parser("maybe-update", help="Run the server-style scheduled freshness check once.")
    maybe_parser.add_argument("--force", action="store_true", help="Ignore freshness checks.")
    maybe_parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing files.")
    maybe_parser.add_argument(
        "--interval-hours",
        type=float,
        default=DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
        help="Required age before server-style updates run. Default: 24.",
    )
    maybe_parser.add_argument("--gp-interval-hours", type=float, default=None, help="Override the GP/OMM update interval.")
    maybe_parser.add_argument("--tle-interval-hours", type=float, default=None, help="Override the compatibility TLE interval.")
    maybe_parser.add_argument("--satcat-interval-hours", type=float, default=None, help="Override the SATCAT/derived-data interval.")
    maybe_parser.add_argument("--tracked-interval-hours", type=float, default=None, help="Override the tracked-catalog build interval.")
    maybe_parser.add_argument(
        "--reconciliation-interval-hours",
        type=float,
        default=None,
        help="Override the complete active-catalog reconciliation interval.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    root = Path(args.root).resolve() if args.root else default_repo_root()
    try:
        if args.command == "export-gp":
            result = export_gp_data(
                root=root,
                mode="all" if args.all else "incremental",
                force=args.force,
                dry_run=args.dry_run,
                allow_large_reconciliation_shrink=args.allow_large_catalog_shrink,
            )
            _print_result(result)
            return 0
        if args.command == "export-tle":
            if args.refresh_launch_dates:
                _print_result(extract_launch_dates_all(
                    root=root,
                    dry_run=args.dry_run,
                    allow_n2yo=True,
                ))
            result = export_tle_data(
                root=root,
                mode="all" if args.all else "incremental",
                force=args.force,
                dry_run=args.dry_run,
                allow_space_track=args.allow_space_track_fallback,
                allow_large_reconciliation_shrink=args.allow_large_catalog_shrink,
            )
            _print_result(result)
            return 0
        if args.command == "build-decayed-db":
            result = build_decayed_db(
                root=root,
                mode="all" if args.all else "incremental",
                force=args.force,
                dry_run=args.dry_run,
                refresh_satcat=args.refresh_satcat,
            )
            _print_result(result)
            return 0
        if args.command == "refresh-satcat":
            result = refresh_satcat_csv(
                root=root,
                force=args.force,
                dry_run=args.dry_run,
                allow_large_reconciliation_shrink=args.allow_large_catalog_shrink,
            )
            _print_result(result)
            return 0
        if args.command == "build-launches":
            result = build_launch_catalog(root=root, dry_run=args.dry_run)
            _print_result(result)
            return 0
        if args.command == "build-tracked":
            result = build_tracked_catalog(
                root=root,
                mode=RECONCILIATION_MODE if args.all else "incremental",
                dry_run=args.dry_run,
            )
            _print_result(result)
            return 0
        if args.command == "maybe-update":
            result = maybe_update_satellite_data(
                root=root,
                interval_hours=args.interval_hours,
                gp_interval_hours=args.gp_interval_hours,
                tle_interval_hours=args.tle_interval_hours,
                satcat_interval_hours=args.satcat_interval_hours,
                tracked_interval_hours=args.tracked_interval_hours,
                reconciliation_interval_hours=args.reconciliation_interval_hours,
                force=args.force,
                dry_run=args.dry_run,
            )
            _print_result(result)
            return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    parser.error("Unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
