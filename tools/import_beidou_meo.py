"""Refresh the cataloged BeiDou MEO profiles from a local IGS satellite metadata SINEX file."""
import argparse
import json
from collections import defaultdict
from pathlib import Path

if __package__:
    from . import beidou
    from .gnss_metadata import read_metadata, write_registry
else:
    import beidou
    from gnss_metadata import read_metadata, write_registry

ROOT = Path(__file__).resolve().parents[1]


def refresh(path):
    created, identifiers, prns, masses = read_metadata(path, "C")
    registry = ROOT/"json/satellites/meo.json"
    profiles = json.loads(registry.read_bytes())
    catalog = json.loads((ROOT/"data/spacecraft-facts.json").read_bytes())
    cospar_column = catalog["fields"].index("international_designator")
    selected = {n for asset in beidou.EXPORTS for n in profiles.get(asset, {}).get("norad", [])}
    groups = defaultdict(dict)
    matched = set()
    for svn, cospar, number, block, *comment in identifiers:
        if int(number) not in selected:
            continue
        if int(number) in matched or catalog["spacecraft"][number][cospar_column] != cospar:
            raise ValueError(f"Conflicting spacecraft identifiers for {svn} / {number} / {cospar}")
        key = (block, svn in beidou.SAR_SVNS)
        flight = {"svn": svn, "cospar": cospar, "prns": sorted(prns[svn], key=lambda p: p["start"])}
        if comment[:1] == ["Launched"]:
            flight["launch_date"] = comment[1].rstrip(";")
        if svn in masses:
            flight.update(masses[svn][1])
        groups[key][number] = flight
        matched.add(int(number))
    if not selected or matched != selected:
        raise ValueError(f"Missing IGS identifiers for {sorted(selected-matched)}")
    replacements = dict(beidou.profile(*key, groups[key], created)
                        for key in beidou.CONFIGURATIONS if key in groups)
    if set(groups) - beidou.CONFIGURATIONS.keys():
        raise ValueError("IGS has a new spacecraft block that requires a model assignment")
    updated = {}
    first_asset = next(asset for asset in profiles if asset in beidou.EXPORTS)
    for asset, profile in profiles.items():
        if asset == first_asset:
            updated.update(replacements)
        elif asset not in beidou.EXPORTS:
            updated[asset] = profile
    write_registry(registry, updated)
    print(f"Matched {len(matched)} BeiDou MEO spacecraft to {len(replacements)} configurations on {created}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sinex", type=Path)
    refresh(parser.parse_args().sinex)
