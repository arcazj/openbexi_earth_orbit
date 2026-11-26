"""Build viewer facts from local GCAT TSVs and the bundled tracked catalog.

Usage: python tools/import_spacecraft_facts.py orgs.tsv satcat.tsv satcat100k.tsv
"""

import argparse
import csv
import json
import math
from datetime import datetime
from pathlib import Path

if __package__:
    from . import argos, galileo, kuiper
    from .ses_models import FLIGHT_FACTS as SES_FLIGHT_FACTS
else:
    import argos
    import kuiper
    import galileo
    from ses_models import FLIGHT_FACTS as SES_FLIGHT_FACTS

ROOT = Path(__file__).resolve().parents[1]
FIELDS = (
    "name", "international_designator", "orbit_class", "manufacturer", "owner",
    "bus", "launch_date", "decay_date", "launch_mass_kg", "launch_mass_estimated",
    "dry_mass_kg", "dry_mass_estimated",
)

# Flight figures are keyed by the individual spacecraft even when several share a model.
FLIGHT_SPECIFICATIONS = {
    **SES_FLIGHT_FACTS,
    **argos.flight_facts(),
    "28922":{"reference_name":"Galileo GIOVE-A","manufacturer":galileo.BUILDERS["giove-a"],
             "mission_status":"Galileo mission ended in 2012. SSTL switched off the spacecraft in 2021.",
             "launch_mass_kg":602,"source_name":"ESA GIOVE-A mission bulletin","source_url":galileo.SSTL},
    "32781":{"reference_name":"Galileo GIOVE-B","manufacturer":galileo.BUILDERS["giove-b"],
             "mission_status":"Retired in 2012",
             "launch_mass_kg":530,"source_name":"ESA Galileo mission brochure","source_url":galileo.GIOVE},
    "38858":{"mission_status":"Decommissioned on 2025-04-16","source_name":"Galileo Service Centre retirement notice",
             "source_url":"https://www.gsc-europa.eu/news/goodbye-galileo-gsat0104"},
    "40889":{"mission_status":"Decommissioned on 2025-12-15","source_name":"Galileo Service Centre retirement notice",
             "source_url":"https://www.gsc-europa.eu/news/gsat0232-becomes-part-of-the-24-nominal-constellation-gsat0205-is-decommissioned"},
    "68495": {"reference_name":"Gravitas", "source_name":"K2 Space",
              "source_url":"https://www.linkedin.com/pulse/gravitas-mission-update-engineering-lessons-from-k2-spaces-kunjur-vzqyc",
              "payload":"11 hosted customer payloads", "deployed_span_m":40, "span_estimated":True, "nominal_array_power_kw":20},
    "43113": {"reference_name":"Telesat LEO-1", "source_name":"Surrey Satellite Technology Ltd",
              "source_url":"https://www.sstl.co.uk/space-portfolio/launched-missions/2010-2019/telesat-leo-phase-1-satellite-launched-2018",
              "manufacturer":"Surrey Satellite Technology Ltd", "launch_mass_kg":168, "payload":"Ka-band communications demonstrator"},
    "28187": {"reference_name":"Eutelsat W3A", "source_name":"EADS Astrium", "source_url":"https://spaceflightnow.com/news/n0403/27w3a/",
              "manufacturer":"EADS Astrium", "launch_mass_kg":4250, "deployed_span_m":35, "end_of_life_power_kw":9.6},
    "28638": {"reference_name":"APSTAR-6", "source_name":"APT Satellite", "source_url":"https://www.apstar.com/uploads/file/download3/4061825a9f4b52538bbf570781e90a24.pdf",
              "payload":"38 C-band and 12 Ku-band transponders", "deployed_span_m":38, "span_estimated":True},
    "28526": {"reference_name":"AMC-12", "source_name":"International Launch Services", "source_url":"https://www.ilslaunch.com/proton-launch-advisory-amc-12/",
              "separation_mass_kg":4974, "payload":"72 C-band transponders", "deployed_span_m":38, "span_estimated":True},
    "33453": {"reference_name":"Ciel-2", "source_name":"International Launch Services", "source_url":"https://www.ilslaunch.com/media-advisory-ils-proton-to-launch-ciel-ii-satellite/",
              "separation_mass_kg":5561, "payload":"32 Ku-band transponders", "deployed_span_m":35, "span_estimated":True},
}


def tsv_rows(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        columns = next(source).lstrip("#").rstrip().split("\t")
        for row in csv.DictReader(
            (line for line in source if not line.startswith("#")), columns, delimiter="\t", quoting=csv.QUOTE_NONE
        ):
            yield {key: value.strip() for key, value in row.items() if key and value}


def catalog_text(value):
    return value if value and value.upper() not in {"-", "?", "UNK", "UNKNOWN"} else None


def organization_name(codes, organizations):
    names = (organizations.get(code.strip("? ")) for code in codes.split("/"))
    return " / ".join(dict.fromkeys(name for name in names if name)) or None


def positive_mass(value):
    try:
        mass = float(value)
    except (TypeError, ValueError):
        return None
    if math.isfinite(mass) and mass > 0:
        return int(mass) if mass.is_integer() else mass
    return None


def launch_date(value):
    try:
        return datetime.strptime(value, "%Y %b %d").date().isoformat()
    except ValueError:
        return None


def apply_navigation_identities(spacecraft):
    profiles = json.loads((ROOT / "json/satellites/meo.json").read_bytes())
    for profile in profiles.values():
        if profile.get("design") not in ("beidou-meo","galileo-navigation"):
            continue
        for number, flight in profile["flights"].items():
            row = spacecraft.get(number)
            if row and row.get("international_designator") == flight["cospar"]:
                row["manufacturer"] = profile["meta"]["manufacturer"]
                if profile["design"] == "galileo-navigation":
                    row["bus"] = profile["meta"]["bus"]
                elif profile["appearance"]["block"] != "BDS-2M":
                    row["bus"] = profile["appearance"]["block"]


def import_facts(org_file, object_files):
    tracked = json.loads((ROOT / "json/tracked/TRACKED.manifest.json").read_bytes())
    spacecraft = {}
    for chunk in tracked["chunks"] + tracked["history_chunks"]:
        if chunk["object_type"] == "PAYLOAD":
            for record in json.loads((ROOT / chunk["path"]).read_bytes())["records"]:
                spacecraft[record["norad_id"]] = {
                    "name": record["satellite_name"],
                    "international_designator": record.get("international_designator"),
                    "orbit_class": record.get("orbit_class"),
                    "launch_date": record.get("launch_date"),
                    "decay_date": record.get("decay_date"),
                }
    organizations = {}
    for row in tsv_rows(org_file):
        for field in ("ShortEName", "EName", "Name", "ShortName"):
            name = catalog_text(row.get(field))
            if name:
                organizations[row["Code"]] = name
                break
    matched = set()
    for path in object_files:
        for row in tsv_rows(path):
            number = row.get("Satcat", "").lstrip("0")
            if number not in spacecraft or number in matched or not row.get("Type", "").startswith("P"):
                continue
            matched.add(number)
            facts = spacecraft[number]
            total = positive_mass(row.get("TotMass"))
            launch_mass = total or positive_mass(row.get("Mass"))
            launch_mass_flag = row.get("TotFlag" if total else "MassFlag")
            dry_mass = positive_mass(row.get("DryMass"))
            facts.update(
                manufacturer=organization_name(row.get("Manufacturer", ""), organizations),
                owner=organization_name(row.get("Owner", ""), organizations),
                bus=catalog_text(row.get("Bus")),
                launch_date=facts["launch_date"] or launch_date(row.get("LDate", "")),
                launch_mass_kg=launch_mass,
                launch_mass_estimated=True if launch_mass and launch_mass_flag == "?" else None,
                dry_mass_kg=dry_mass,
                dry_mass_estimated=True if dry_mass and row.get("DryFlag") == "?" else None,
            )
    if not matched:
        raise ValueError("No GCAT payloads matched the tracked catalog.")
    apply_navigation_identities(spacecraft)

    output = ROOT / "data/spacecraft-facts.json"
    source = {
        "gcat": {
            "credit": "Adapted from Jonathan C. McDowell's GCAT",
            "url": "https://planet4589.org/space/gcat/root.html",
            "license": "https://creativecommons.org/licenses/by/4.0/",
        },
        "tracked_catalog": "json/tracked/TRACKED.manifest.json",
        "tracked_catalog_revision": tracked["catalog_revision"],
        "beidou_identities": "https://files.igs.org/pub/station/general/igs_satellite_metadata.snx",
        "galileo_identities": galileo.SINEX,
    }
    temporary = output.with_suffix(".json.tmp")
    flights = {number:spec for number,spec in FLIGHT_SPECIFICATIONS.items() if number in spacecraft}
    for number, name in kuiper.NAMES.items():
        if str(number) in spacecraft:
            flights[str(number)] = {"reference_name": name}
    for number,spec in flights.items():
        if "launch_mass_kg" in spec:
            spacecraft[number].update(launch_mass_kg=spec["launch_mass_kg"],launch_mass_estimated=spec.get("launch_mass_estimated"),
                                      manufacturer=spec["manufacturer"])
            if "dry_mass_kg" in spec:
                spacecraft[number].update(dry_mass_kg=spec["dry_mass_kg"],dry_mass_estimated=None)
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write('{"source":' + json.dumps(source, ensure_ascii=False, separators=(",", ":")) +
                     ',"model_facts":' + json.dumps(kuiper.FAMILY_FACTS, separators=(",", ":")) +
                     ',"flights":' + json.dumps(flights, separators=(",", ":")) +
                     ',"fields":' + json.dumps(FIELDS, separators=(",", ":")) + ',"spacecraft":{\n')
        rows = []
        for number, facts in sorted(spacecraft.items(), key=lambda item: int(item[0])):
            values = [facts.get(field) for field in FIELDS]
            while values and values[-1] is None:
                values.pop()
            rows.append(json.dumps(number) + ":" + json.dumps(values, ensure_ascii=False, separators=(",", ":")))
        handle.write(",\n".join(rows) + "\n}}\n")
    temporary.replace(output)
    print(f"{len(matched):,} GCAT matches for {len(spacecraft):,} tracked payloads.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("organizations", type=Path)
    parser.add_argument("objects", nargs="+", type=Path)
    args = parser.parse_args()
    import_facts(args.organizations, args.objects)
