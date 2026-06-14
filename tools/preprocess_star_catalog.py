#!/usr/bin/env python3
"""Preprocess a real star catalog CSV into browser-friendly RA tile JSON files.

Expected input columns: name, ra_deg or ra_hours, dec_deg, mag, optional bv.
Use this with a licensed catalog export such as Tycho-2-derived data for
magnitude <= 11.5, or Gaia DR3 tiled exports for external LOD datasets.

Example:
  py tools/preprocess_star_catalog.py --input stars.csv --output data/stars/tiles --limit 11.5
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def to_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="CSV catalog path")
    parser.add_argument("--output", required=True, help="Output directory for RA tile JSON")
    parser.add_argument("--limit", type=float, default=11.5, help="Maximum magnitude, default 11.5")
    parser.add_argument("--tile-deg", type=float, default=15, help="RA tile size in degrees, default 15")
    args = parser.parse_args()

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)
    tiles: dict[int, list[dict[str, float | str]]] = {}

    with Path(args.input).open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            mag = to_float(row.get("mag"))
            dec_deg = to_float(row.get("dec_deg"))
            ra_deg = to_float(row.get("ra_deg"))
            ra_hours = to_float(row.get("ra_hours"))
            if mag is None or mag >= args.limit or dec_deg is None:
                continue
            if ra_deg is None and ra_hours is None:
                continue
            if ra_deg is None:
                ra_deg = (ra_hours or 0) * 15
            ra_deg = ra_deg % 360
            tile_id = int(ra_deg // args.tile_deg)
            entry = {
                "name": row.get("name") or row.get("source_id") or "",
                "raDeg": round(ra_deg, 8),
                "decDeg": round(dec_deg, 8),
                "mag": round(mag, 4),
            }
            bv = to_float(row.get("bv"))
            if bv is not None:
                entry["bv"] = round(bv, 4)
            tiles.setdefault(tile_id, []).append(entry)

    manifest = {
        "magnitudeLimit": args.limit,
        "tileDegrees": args.tile_deg,
        "tiles": []
    }
    for tile_id, stars in sorted(tiles.items()):
        filename = f"ra_{tile_id:02d}.json"
        (out_dir / filename).write_text(json.dumps(stars, separators=(",", ":")), encoding="utf-8")
        manifest["tiles"].append({"id": tile_id, "file": filename, "count": len(stars)})

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {sum(len(v) for v in tiles.values())} stars into {len(tiles)} tiles at {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
