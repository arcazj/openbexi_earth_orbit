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

TLE_RELATIVE_PATH = Path("json") / "tle" / "TLE.json"
TLE_META_RELATIVE_PATH = Path("json") / "tle" / "TLE.meta.json"
LAUNCH_DATES_RELATIVE_PATH = Path("json") / "tle" / "satellite_launch_dates.json"
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
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=argos&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=cubesat&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=dmc&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=education&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=geo&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=geodetic&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=glo-ops&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=globalstar&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=goes&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=gorizont&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=iridium&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-NEXT&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=molniya&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=orbcomm&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=planet&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=raduga&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=satnogs&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=sarsat&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=science&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=spire&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=tdrss&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle",
    "http://celestrak.org/NORAD/elements/gp.php?GROUP=x-comm&FORMAT=tle",
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
]

INCREMENTAL_TLE_GROUPS = ("active", "last-30-days")
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


def atomic_write_text(path: Path, text: str, *, dry_run: bool = False, backup: bool = True) -> None:
    if dry_run:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    if backup and path.exists():
        timestamp = dt.datetime.now().strftime("%Y%m%d%H%M%S")
        backup_path = path.with_suffix(path.suffix + f".bak-{timestamp}")
        backup_path.write_bytes(path.read_bytes())
    fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        os.replace(temp_path, path)
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


def latest_success_time(meta: dict[str, object], data_path: Path) -> dt.datetime | None:
    for key in ("fetched_at", "last_success_at"):
        parsed = parse_iso_datetime(meta.get(key))
        if parsed:
            return parsed
    if data_path.exists():
        return dt.datetime.fromtimestamp(data_path.stat().st_mtime, dt.timezone.utc)
    return None


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
    req = request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 OpenBEXI-Earth-Orbit/1.7.4",
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


def tle_norad_from_line1(line1: str | None) -> str:
    if not line1 or len(line1) < 7:
        return "no data"
    return line1[2:7].strip()


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
    norad2 = re.sub(r"\D", "", tle_norad_from_line2(line2))
    return bool(norad1 and norad2 and norad1 == norad2[: len(norad1)])


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
    perigee_km = metrics.get("perigee_km") if isinstance(metrics.get("perigee_km"), (int, float)) else math.nan
    apogee_km = metrics.get("apogee_km") if isinstance(metrics.get("apogee_km"), (int, float)) else math.nan

    if math.isfinite(perigee_km) and perigee_km < 120:
        return "DECAYING"
    if eccentricity > 0.25 or (math.isfinite(apogee_km) and apogee_km > 50000):
        return "HEO"
    if mean_motion < 2.5:
        return "GEO"
    if mean_motion > 11.0:
        return "LEO"
    return "MEO"


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
            norad = str(row.get("NORAD_CAT_ID") or "").strip()
            launch_date = _valid_launch_date(row.get("LAUNCH_DATE"))
            if not norad or not launch_date:
                continue
            records[norad] = {
                "norad_id": norad,
                "name": str(row.get("OBJECT_NAME") or "").strip(),
                "launch_date": launch_date,
                "launch_site": str(row.get("LAUNCH_SITE") or "").strip(),
            }
    return records


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
        norad = str(item.get("norad_id") or "").strip()
        if not norad or norad in by_norad:
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
        norad = str(sat.get("norad_id") or "").strip()
        if not norad:
            continue
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
    if existing.get("company") and existing.get("company") != "no data":
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
) -> tuple[list[tuple[str, FetchResponse]], list[str]]:
    fetcher = fetcher or fetch_url
    meta = meta or {}
    responses: list[tuple[str, FetchResponse]] = []
    errors: list[str] = []
    for url in urls:
        try:
            response = fetcher(url, headers=_metadata_request_headers(meta, url))
            if not response.not_modified:
                responses.append((extract_group_from_url(url), response))
        except Exception as exc:
            errors.append(f"{url}: {exc}")
    return responses, errors


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
        norad = str(record.get("norad_id", "")).strip()
        if norad and norad not in by_norad:
            by_norad[norad] = dict(record)
            order.append(norad)

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
            norad = str(candidate.get("norad_id", "")).strip()
            if not norad:
                rejected += 1
                continue
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

    return [by_norad[norad] for norad in order], {
        "existing": len(existing or []),
        "fetched": fetched,
        "added": added,
        "updated": updated,
        "rejected": rejected,
        "total": len(order),
    }


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
    now: dt.datetime,
    dry_run: bool,
) -> None:
    url_meta = dict(meta.get("urls", {})) if isinstance(meta.get("urls"), dict) else {}
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
        "fetched_at": isoformat_utc(now),
        "last_success_at": isoformat_utc(now),
        "last_attempt_at": isoformat_utc(now),
        "last_status": "ok",
        "mode": mode,
        "source_urls": source_urls,
        "celestrak_min_refresh_hours": CELESTRAK_MIN_REFRESH_HOURS,
        "counts": counts,
        "urls": url_meta,
    }
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
) -> UpdateResult:
    now = now or utc_now()
    root_path = Path(root).resolve()
    tle_path = repo_path(root_path, TLE_RELATIVE_PATH)
    meta_path = repo_path(root_path, TLE_META_RELATIVE_PATH)
    launch_dates = load_launch_dates(root_path)
    meta = load_json(meta_path, {})
    if not isinstance(meta, dict):
        meta = {}

    existing_payload = load_json(tle_path, [])
    existing = existing_payload if isinstance(existing_payload, list) else []

    if mode != "all" and not force:
        latest = latest_success_time(meta, tle_path)
        if is_recent_enough(latest, celestrak_min_refresh_hours, now=now):
            return UpdateResult(
                changed=False,
                skipped=True,
                mode=mode,
                message=f"TLE update skipped; last successful fetch is newer than {celestrak_min_refresh_hours:g} hours.",
                counts={"existing": len(existing), "total": len(existing)},
                paths={"tle": str(tle_path), "metadata": str(meta_path)},
            )

    source_urls = source_urls_for_mode(mode)
    responses, errors = fetch_tle_sources(source_urls, fetcher=fetcher, meta=meta)
    if errors and allow_space_track:
        fallback_response = try_spacetrack_fallback()
        if fallback_response:
            responses.append(("SPACE-TRACK", fallback_response))
            errors = []

    if errors and mode == "all":
        update_tle_failure_metadata(meta_path, meta, mode=mode, errors=errors, now=now, dry_run=dry_run)
        raise SatelliteDataError("--all TLE export failed before writing because one or more required sources failed.")
    if errors and not responses:
        update_tle_failure_metadata(meta_path, meta, mode=mode, errors=errors, now=now, dry_run=dry_run)
        return UpdateResult(
            changed=False,
            skipped=True,
            mode=mode,
            message="CelesTrak unavailable; preserved existing TLE data.",
            counts={"existing": len(existing), "total": len(existing)},
            errors=errors,
            paths={"tle": str(tle_path), "metadata": str(meta_path)},
        )

    base_records = [] if mode == "all" else [dict(item) for item in existing if isinstance(item, dict)]
    satellites, counts = build_satellites_from_tle_responses(responses, launch_dates, existing=base_records, mode=mode)
    sidecar_counts = merge_launch_date_sidecar_from_satcat(root_path, satellites, dry_run=dry_run)
    counts.update(sidecar_counts)
    changed = (
        mode == "all" or
        counts.get("added", 0) > 0 or
        counts.get("updated", 0) > 0 or
        counts.get("satellite_launch_dates_updated", 0) > 0
    )
    if changed:
        atomic_write_json(tle_path, satellites, dry_run=dry_run, backup=True)
    update_tle_success_metadata(
        meta_path,
        meta,
        mode=mode,
        source_urls=source_urls,
        responses=responses,
        counts=counts,
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
) -> UpdateResult:
    now = now or utc_now()
    fetcher = fetcher or fetch_url
    root_path = Path(root).resolve()
    output_path = repo_path(root_path, LAUNCH_DATES_RELATIVE_PATH)
    launch_dates: dict[str, dict[str, str]] = {}
    name_to_norad: dict[str, str] = {}
    errors: list[str] = []
    fetched_pages = 0

    for year in range(1990, now.year + 1):
        for month in range(1, 13):
            url = f"{N2YO_BROWSE_ENDPOINT}?y={year}&m={month:02d}"
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
            record["OBJECT_TYPE"] = object_type
            object_name = record["OBJECT_NAME"] or "(UNKNOWN_OBJECT_NAME)"
            grouped.setdefault(object_name, []).append(record)
    return {key: grouped[key] for key in sorted(grouped)}


def refresh_satcat_csv(
    *,
    root: Path | str,
    force: bool = False,
    dry_run: bool = False,
    fetcher: Callable[..., FetchResponse] | None = None,
    now: dt.datetime | None = None,
    interval_hours: float = DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
) -> UpdateResult:
    now = now or utc_now()
    fetcher = fetcher or fetch_url
    root_path = Path(root).resolve()
    satcat_path = repo_path(root_path, SATCAT_RELATIVE_PATH)
    meta_path = repo_path(root_path, SATCAT_META_RELATIVE_PATH)
    meta = load_json(meta_path, {})
    if not isinstance(meta, dict):
        meta = {}

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

    headers = _metadata_request_headers(meta, CELESTRAK_SATCAT_CSV_URL)
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
                "last_status": "not-modified",
                "urls": url_meta,
            }
        )
        atomic_write_json(meta_path, meta, dry_run=dry_run, backup=False, indent=2)
        return UpdateResult(
            changed=False,
            skipped=True,
            mode="refresh-satcat",
            message="SATCAT source has not changed.",
            paths={"satcat": str(satcat_path), "metadata": str(meta_path)},
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
        atomic_write_json(meta_path, failed_meta, dry_run=dry_run, backup=False, indent=2)
        return UpdateResult(
            changed=False,
            skipped=True,
            mode="refresh-satcat",
            message="CelesTrak SATCAT response was invalid; preserved existing satcat.csv.",
            errors=[error],
            paths={"satcat": str(satcat_path), "metadata": str(meta_path)},
        )

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
        "counts": {"bytes": len(response.text.encode("utf-8"))},
        "urls": url_meta,
    }
    atomic_write_json(meta_path, success_meta, dry_run=dry_run, backup=False, indent=2)
    return UpdateResult(
        changed=not dry_run,
        skipped=False,
        mode="refresh-satcat",
        message="SATCAT refresh completed.",
        counts={"bytes": len(response.text.encode("utf-8"))},
        paths={"satcat": str(satcat_path), "metadata": str(meta_path)},
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
            return UpdateResult(
                changed=False,
                skipped=True,
                mode=mode,
                message="SATCAT refresh failed and no local satcat.csv exists; preserved existing decayed DB.",
                counts={},
                errors=refresh_result.errors,
                paths={"decayed": str(output_path), "metadata": str(meta_path), "satcat": str(input_path)},
            )
        if (
            mode != "all" and
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
                    "source": str(input_path),
                    "satcat_refresh": refresh_result.to_dict(),
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

    record_count = sum(len(records) for records in grouped.values())
    atomic_write_json(output_path, grouped, dry_run=dry_run, backup=True, indent=2)
    success_meta = {
        "built_at": isoformat_utc(now),
        "fetched_at": isoformat_utc(now),
        "last_success_at": isoformat_utc(now),
        "last_attempt_at": isoformat_utc(now),
        "last_status": "ok",
        "mode": mode,
        "source": str(input_path),
        "satcat_refresh": refresh_result.to_dict() if refresh_result else None,
        "counts": {"objects": len(grouped), "records": record_count},
    }
    atomic_write_json(meta_path, success_meta, dry_run=dry_run, backup=False, indent=2)
    return UpdateResult(
        changed=not dry_run,
        skipped=False,
        mode=mode,
        message="Decayed DB build completed.",
        counts={"objects": len(grouped), "records": record_count},
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


@contextlib.contextmanager
def update_lock(root: Path | str):
    lock_path = repo_path(root, UPDATE_LOCK_RELATIVE_PATH)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    fd: int | None = None
    try:
        fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, f"{os.getpid()} {isoformat_utc()}\n".encode("utf-8"))
        yield True
    except FileExistsError:
        yield False
    finally:
        if fd is not None:
            os.close(fd)
            with contextlib.suppress(FileNotFoundError):
                lock_path.unlink()


def metadata_is_older_than(root: Path | str, relative_meta_path: Path, data_relative_path: Path, hours: float) -> bool:
    meta_path = repo_path(root, relative_meta_path)
    data_path = repo_path(root, data_relative_path)
    meta = load_json(meta_path, {})
    if not isinstance(meta, dict):
        meta = {}
    latest = latest_success_time(meta, data_path)
    return not is_recent_enough(latest, hours)


def maybe_update_satellite_data(
    *,
    root: Path | str,
    interval_hours: float = DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
    force: bool = False,
    dry_run: bool = False,
) -> dict[str, object]:
    results: dict[str, object] = {
        "started_at": isoformat_utc(),
        "skipped": False,
        "lock_acquired": False,
        "tle": None,
        "decayed": None,
    }
    lock_context = contextlib.nullcontext(True) if dry_run else update_lock(root)
    with lock_context as acquired:
        results["lock_acquired"] = acquired
        if not acquired:
            results["skipped"] = True
            results["message"] = "Another satellite data update is already running."
            return results

        tle_due = force or metadata_is_older_than(root, TLE_META_RELATIVE_PATH, TLE_RELATIVE_PATH, interval_hours)
        decayed_due = force or metadata_is_older_than(root, DECAYED_META_RELATIVE_PATH, DECAYED_RELATIVE_PATH, interval_hours)
        if tle_due:
            try:
                results["tle"] = export_tle_data(root=root, mode="incremental", force=force, dry_run=dry_run).to_dict()
            except Exception as exc:
                results["tle"] = {"changed": False, "skipped": True, "errors": [str(exc)]}
        if decayed_due:
            results["decayed"] = build_decayed_db(
                root=root,
                mode="incremental",
                force=force,
                dry_run=dry_run,
                interval_hours=interval_hours,
                refresh_satcat=True,
            ).to_dict()
        if not tle_due and not decayed_due:
            results["skipped"] = True
            results["message"] = f"Local data is newer than {interval_hours:g} hours."
    results["finished_at"] = isoformat_utc()
    return results


def _print_result(result: UpdateResult | dict[str, object]) -> None:
    payload = result.to_dict() if isinstance(result, UpdateResult) else result
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Maintain OpenBEXI Earth Orbit satellite data files.")
    parser.add_argument("--root", default=None, help="Repository root. Default: repository root containing this tool.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    export_parser = subparsers.add_parser("export-tle", help="Export or incrementally update json/tle/TLE.json.")
    export_parser.add_argument("--all", action="store_true", help="Use the legacy Java full-source group workflow.")
    export_parser.add_argument("--force", action="store_true", help="Ignore freshness checks.")
    export_parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing files.")
    export_parser.add_argument(
        "--allow-space-track-fallback",
        action="store_true",
        help="Permit optional Space-Track fallback only when credentials are configured.",
    )
    export_parser.add_argument(
        "--refresh-launch-dates",
        action="store_true",
        help="Refresh N2YO launch dates before export. This is slow and disabled for default incremental updates.",
    )
    export_parser.add_argument(
        "--skip-launch-dates",
        action="store_true",
        help="Skip the N2YO launch-date refresh in --all mode and reuse the existing local launch-date file.",
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

    maybe_parser = subparsers.add_parser("maybe-update", help="Run the server-style scheduled freshness check once.")
    maybe_parser.add_argument("--force", action="store_true", help="Ignore freshness checks.")
    maybe_parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing files.")
    maybe_parser.add_argument(
        "--interval-hours",
        type=float,
        default=DEFAULT_SERVER_UPDATE_INTERVAL_HOURS,
        help="Required age before server-style updates run. Default: 24.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    root = Path(args.root).resolve() if args.root else default_repo_root()
    try:
        if args.command == "export-tle":
            refresh_launch_dates = args.refresh_launch_dates or (args.all and not args.skip_launch_dates)
            if refresh_launch_dates:
                _print_result(extract_launch_dates_all(root=root, dry_run=args.dry_run))
            result = export_tle_data(
                root=root,
                mode="all" if args.all else "incremental",
                force=args.force,
                dry_run=args.dry_run,
                allow_space_track=args.allow_space_track_fallback,
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
            result = refresh_satcat_csv(root=root, force=args.force, dry_run=args.dry_run)
            _print_result(result)
            return 0
        if args.command == "maybe-update":
            result = maybe_update_satellite_data(
                root=root,
                interval_hours=args.interval_hours,
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
