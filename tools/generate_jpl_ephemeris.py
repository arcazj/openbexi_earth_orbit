"""Generate local JPL Horizons-derived Solar System ephemeris JSON.

This is a development/provenance helper. The browser app only reads the
generated JSON files under data/ephemeris and never fetches Horizons at runtime.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "ephemeris"
EPHEMERIS_FILE = OUT_DIR / "solar_system_jpl_horizons_2020_2035_6h.json"
REFERENCE_FILE = OUT_DIR / "solar_system_jpl_horizons_reference_samples.json"

HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
START_TIME = "2020-Jan-01"
STOP_TIME = "2035-Dec-31"
STEP_SIZE = "6h"
REFERENCE_SAMPLE_DATES = [
    "2021-Mar-20 03:00",
    "2026-Jun-07 09:00",
    "2034-Sep-22 15:00",
]

BODIES = [
    ("mercury", "Mercury", "199", "inner"),
    ("venus", "Venus", "299", "inner"),
    ("earth", "Earth", "399", "inner"),
    ("moon", "Moon", "301", "moon"),
    ("mars", "Mars", "499", "inner"),
    ("jupiter", "Jupiter", "599", "outer"),
    ("saturn", "Saturn", "699", "outer"),
    ("uranus", "Uranus", "799", "outer"),
    ("neptune", "Neptune", "899", "outer"),
]

MONTHS = {
    "Jan": 1,
    "Feb": 2,
    "Mar": 3,
    "Apr": 4,
    "May": 5,
    "Jun": 6,
    "Jul": 7,
    "Aug": 8,
    "Sep": 9,
    "Oct": 10,
    "Nov": 11,
    "Dec": 12,
}


def horizons_request(command: str, start: str, stop: str, step: str) -> str:
    params = {
        "format": "json",
        "COMMAND": command,
        "EPHEM_TYPE": "VECTORS",
        "CENTER": "500@10",
        "START_TIME": f"'{start}'",
        "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": step,
        "VEC_TABLE": "2",
        "CSV_FORMAT": "YES",
        "OUT_UNITS": "KM-S",
        "REF_SYSTEM": "ICRF",
        "REF_PLANE": "ECLIPTIC",
        "TIME_TYPE": "UT",
        "CAL_TYPE": "GREGORIAN",
        "VEC_CORR": "NONE",
    }
    url = f"{HORIZONS_URL}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=120) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if "result" not in payload:
        raise RuntimeError(f"Horizons response missing result for command {command}: {payload}")
    if "ERROR" in payload["result"].upper():
        raise RuntimeError(payload["result"])
    return payload["result"]


def parse_horizons_csv(result: str) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    inside = False
    csv_lines: list[str] = []
    for line in result.splitlines():
        if "$$SOE" in line:
            inside = True
            continue
        if "$$EOE" in line:
            break
        if inside and line.strip():
            csv_lines.append(line)

    reader = csv.reader(io.StringIO("\n".join(csv_lines)), skipinitialspace=True)
    for row in reader:
        if len(row) < 8:
            continue
        iso = horizons_date_to_iso(row[1].strip())
        values = [round(float(value), 6) for value in row[2:8]]
        rows.append({"dateUtc": iso, "vector": values})
    if not rows:
        raise RuntimeError("No vector rows parsed from Horizons result")
    return rows


def horizons_date_to_iso(value: str) -> str:
    # Example: "A.D. 2026-Jan-01 00:00:00.0000"
    value = value.replace("A.D.", "").strip()
    date_part, time_part = value.split(" ")
    year_s, month_s, day_s = date_part.split("-")
    hour_s, minute_s, second_s = time_part.split(":")
    second = int(float(second_s))
    dt = datetime(
        int(year_s),
        MONTHS[month_s],
        int(day_s),
        int(hour_s),
        int(minute_s),
        second,
        tzinfo=timezone.utc,
    )
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_body_table(command: str) -> list[dict[str, object]]:
    return parse_horizons_csv(horizons_request(command, START_TIME, STOP_TIME, STEP_SIZE))


def fetch_reference_sample(command: str, date: str) -> dict[str, object]:
    # Query one minute and use the first returned vector at the requested epoch.
    start_dt = datetime.strptime(date, "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)
    stop_dt = start_dt + timedelta(minutes=1)
    stop = stop_dt.strftime("%Y-%b-%d %H:%M")
    return parse_horizons_csv(horizons_request(command, date, stop, "1m"))[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start', default='2020-01-01', help='First UTC date (YYYY-MM-DD)')
    parser.add_argument('--stop', default='2035-12-31', help='Last UTC date (YYYY-MM-DD)')
    parser.add_argument('--output', type=Path, default=EPHEMERIS_FILE)
    parser.add_argument('--reference-output', type=Path, default=REFERENCE_FILE)
    args = parser.parse_args()
    global START_TIME, STOP_TIME
    start = datetime.strptime(args.start, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    stop = datetime.strptime(args.stop, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    if not start < stop or (stop - start).days > 36526:
        parser.error('Choose an increasing range of at most 100 years per file.')
    START_TIME, STOP_TIME = args.start, args.stop
    reference_dates = [
        (start + (stop - start) * fraction).replace(hour=3, minute=0).strftime('%Y-%b-%d %H:%M')
        for fraction in (0.1, 0.5, 0.9)
    ] if (args.start, args.stop) != ('2020-01-01', '2035-12-31') else REFERENCE_SAMPLE_DATES
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    times: list[str] | None = None
    body_payload: dict[str, object] = {}
    for key, name, command, category in BODIES:
        print(f"Fetching 6-hour Horizons vectors for {name} ({command})")
        table = fetch_body_table(command)
        body_times = [row["dateUtc"] for row in table]
        if times is None:
            times = body_times
        elif body_times != times:
            raise RuntimeError(f"Time axis mismatch for {name}")
        body_payload[key] = {
            "name": name,
            "horizonsCommand": command,
            "category": category,
            "vectors": [row["vector"] for row in table],
        }
        time.sleep(0.2)

    assert times is not None
    ephemeris = {
        "metadata": {
            "name": "OpenBEXI Solar System JPL Horizons-derived ephemeris",
            "source": "NASA/JPL Horizons API",
            "sourceUrl": HORIZONS_URL,
            "generatedAtUtc": generated_at,
            "runtimeRemoteFetch": False,
            "dateRange": {
                "startUtc": times[0],
                "stopUtc": times[-1],
            },
            "sampleCadence": "PT6H",
            "interpolation": "cubic Hermite position and velocity interpolation between 6-hour Horizons samples",
            "referenceFrame": "ICRF",
            "referencePlane": "ECLIPTIC",
            "origin": "Sun center, Horizons center 500@10",
            "units": "km and km/s",
            "timeScale": "UTC (Horizons TIME_TYPE=UT); runtime interpolation uses UTC milliseconds",
            "vectorCorrection": "NONE (geometric, no light-time or aberration)",
            "acceptableErrorKm": {
                "innerPlanetsAndMoon": 5000,
                "outerPlanets": 50000,
            },
            "license": "NASA/JPL Horizons public ephemeris service data; verify mission-specific reuse requirements before redistribution beyond this project.",
            "targets": [
                {"key": key, "name": name, "horizonsCommand": command, "category": category}
                for key, name, command, category in BODIES
            ],
        },
        "times": times,
        "bodies": body_payload,
    }

    samples = []
    for key, name, command, category in BODIES:
        for date in reference_dates:
            print(f"Fetching reference sample for {name} at {date}")
            sample = fetch_reference_sample(command, date)
            samples.append({
                "body": key,
                "name": name,
                "category": category,
                "dateUtc": sample["dateUtc"],
                "positionKm": sample["vector"][:3],
                "velocityKmPerSec": sample["vector"][3:],
            })
            time.sleep(0.1)
    reference = {
        "metadata": {
            "source": "NASA/JPL Horizons API",
            "sourceUrl": HORIZONS_URL,
            "generatedAtUtc": generated_at,
            "purpose": "Independent midpoint validation samples for the bundled 6-hour ephemeris interpolation.",
            "referenceFrame": "ICRF",
            "referencePlane": "ECLIPTIC",
            "origin": "Sun center, Horizons center 500@10",
            "units": "km and km/s",
            "timeScale": "UTC (Horizons TIME_TYPE=UT)",
        },
        "samples": samples,
    }
    # Keep the last complete dataset if any provider request fails.
    for path, payload in ((args.output, ephemeris), (args.reference_output, reference)):
        path.parent.mkdir(parents=True, exist_ok=True)
        pending = path.with_suffix(path.suffix + '.tmp')
        pending.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        pending.replace(path)
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()
