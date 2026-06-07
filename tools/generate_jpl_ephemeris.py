"""Generate local JPL Horizons-derived Solar System ephemeris JSON.

This is a development/provenance helper. The browser app only reads the
generated JSON files under data/ephemeris and never fetches Horizons at runtime.
"""

from __future__ import annotations

import csv
import io
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
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
    stop_dt = start_dt.replace(minute=start_dt.minute + 1) if start_dt.minute < 59 else start_dt
    stop = stop_dt.strftime("%Y-%b-%d %H:%M")
    return parse_horizons_csv(horizons_request(command, date, stop, "1m"))[0]


def main() -> None:
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
            "interpolation": "linear position interpolation between 6-hour Horizons samples",
            "referenceFrame": "ICRF",
            "referencePlane": "ECLIPTIC",
            "origin": "Sun center, Horizons center 500@10",
            "units": "km and km/s",
            "timeScale": "UTC timestamps from Horizons calendar output; runtime interpolation uses UTC milliseconds",
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
    EPHEMERIS_FILE.write_text(json.dumps(ephemeris, separators=(",", ":")), encoding="utf-8")

    samples = []
    for key, name, command, category in BODIES:
        for date in REFERENCE_SAMPLE_DATES:
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
        },
        "samples": samples,
    }
    REFERENCE_FILE.write_text(json.dumps(reference, indent=2), encoding="utf-8")
    print(f"Wrote {EPHEMERIS_FILE}")
    print(f"Wrote {REFERENCE_FILE}")


if __name__ == "__main__":
    main()
