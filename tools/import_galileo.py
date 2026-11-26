"""Refresh the Galileo model assignments from a local IGS satellite metadata SINEX."""
import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

if __package__:
    from . import galileo
    from .gnss_metadata import read_metadata, write_registry
else:
    import galileo
    from gnss_metadata import read_metadata, write_registry

ROOT = Path(__file__).resolve().parents[1]


def refresh(sinex):
    epoch, identifiers, prns, masses = read_metadata(sinex, "E")
    manifest = json.loads((ROOT/"json/tracked/TRACKED.manifest.json").read_bytes())
    selected = {}
    for chunk in manifest["chunks"] + manifest["history_chunks"]:
        if chunk["object_type"] == "PAYLOAD":
            for record in json.loads((ROOT/chunk["path"]).read_bytes())["records"]:
                match = re.match(r"GSAT0(\d{3})\b",record["satellite_name"])
                if match:
                    selected[record["norad_id"]] = ("E"+match[1],record["international_designator"])
    groups = defaultdict(dict)
    matched = set()
    for svn,cospar,number,block,*comments in identifiers:
        if number not in selected:
            continue
        if number in matched or selected[number] != (svn,cospar):
            raise ValueError(f"Conflicting Galileo identity for {svn}, NORAD {number}, {cospar}")
        variant = {"GAL-0A":"giove-a","GAL-0B":"giove-b","GAL-1":"galileo-iov","GAL-2":"galileo-foc"}[block]
        if block == "GAL-1" and svn not in ("E101","E102"):
            variant = "galileo-iov-sar"
        flight = {"svn":svn,"cospar":cospar,"prns":sorted(prns[svn],key=lambda p:p["start"])}
        if svn in masses and block in ("GAL-1","GAL-2"):
            # Prototype SINEX masses use different conventions (including a BOL
            # value below GIOVE-B's published dry mass). Display launch/dry for those.
            flight.update(masses[svn][1])
        groups[variant][number] = flight
        matched.add(number)
    if not selected or matched != selected.keys():
        raise ValueError(f"No IGS identity for Galileo NORAD IDs {sorted(selected.keys()-matched)}")
    registry = ROOT/"json/satellites/meo.json"
    profiles = json.loads(registry.read_bytes())
    target_ids = set(map(int, matched))
    for asset,p in list(profiles.items()):
        if asset not in galileo.EXPORTS and target_ids.intersection(p["norad"]):
            p["norad"] = [n for n in p["norad"] if n not in target_ids]
            if not p["norad"]:
                del profiles[asset]
    for variant,asset in galileo.ASSETS.items():
        if variant in groups:
            profiles[asset] = galileo.profile(variant,groups[variant],epoch)
        else:
            profiles.pop(asset,None)
    write_registry(registry,profiles)
    print(f"Matched {len(matched)} Galileo spacecraft to {len(groups)} illustrated configurations (IGS {epoch}).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sinex",type=Path)
    refresh(parser.parse_args().sinex)
