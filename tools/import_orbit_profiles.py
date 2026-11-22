"""Derive LEO and GEO viewer profiles from a tracked catalog and local GCAT TSV snapshots.

Usage: python tools/import_orbit_profiles.py geo satcat.tsv satcat100k.tsv
Physical dimensions for a shared outline come from the group member nearest its median size.
"""
import argparse
import csv
import json
import math
import re
from collections import defaultdict
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "json/satellites"
GEO_REFERENCES = json.loads((ROOT / "tools/geo_appearances.json").read_bytes())
GEO_MODELS = GEO_REFERENCES["models"]
GEO_BUSES = {bus: key for key, model in GEO_MODELS.items() for bus in model.get("buses", [])}
GEO_PAYLOADS = {number: key for key, model in GEO_MODELS.items() for number in model.get("numbers", [])}
KUIPER_REFERENCES = {
    "kuiper-protoflight": [
        "https://www.aboutamazon.com/news/innovation-at-amazon/amazon-project-kuiper-deorbit-satellites",
        "https://indico.esa.int/event/516/contributions/10014/attachments/6284/10794/CSD2024_Chandramouli_OverviewOfSpaceSustainability.pdf"
    ],
    "kuiper-production": [
        "https://www.aboutamazon.com/news/innovation-at-amazon/project-kuiper-photos-internet-satellite-first-launch",
        "https://arxiv.org/pdf/2601.07708#page=4",
        "https://www.aboutamazon.com/stories/how-amazon-leo-builds-satellites"
    ]
}
LEGACY = {
    "starlink_V1": ("Starlink V1", "starlink_V1"), "starlink_v2.glb": ("Starlink V2", "starlink_v2"),
    "starlink_v3.glb": ("Starlink V3", "starlink_v3"), "oneweb.glb": ("OneWeb", "oneweb"),
    "qianfan": ("Qianfan", "qianfan"), "iridium": ("Iridium NEXT", "iridium"),
    "cubesat": ("CubeSat 3U", "cubesat"), "ISS.glb": ("International Space Station", "ISS"),
    "SSL_1300.glb": ("SSL 1300", "SSL_1300"),
    "geo/hs-376.glb": ("Hughes HS-376", "geo"),
    "geo/ref-fs-intelsat-5-12089.glb": ("FS INTELSAT 5", "geo"),
}

# Mission-specific exterior configurations. Other platforms use the catalog body and appendages.
# Each tuple is id, label, design, family, body shape, optional dimension override, description.
def mission(key, name, design, family, shape, description, size=None):
    return (key, name, design, family, shape, size, description)


def geo_mission(name, bus, number):
    match = re.search(r"\bGOES[ -](\d+)", name)
    if match:
        n = int(match[1])
        if n >= 16:
            return mission("goes-r","GOES-R series","weather","GOES","Box + Pan + Boom",
                           "Three-axis weather observatory with an Earth-pointing instrument deck, one five-panel solar wing and a magnetometer boom.")
        if n >= 8:
            label, key = ("N–P","goes-n") if n >= 13 else ("I–M","goes-i")
            return mission(key,"GOES " + label,"weather","GOES","Box + Pan + Boom",
                           "Weather platform with an Earth-facing instrument deck and a single solar wing.")
        key = "goes-early" if n <= 3 else "goes-vas"
        return mission(key,"GOES 1–3" if n<=3 else "GOES 4–7","weather-spinner","GOES","Cyl + Ant",
                       "Spin-stabilized weather spacecraft with solar cells around the instrument drum.")
    if bus in ("Meteosat","MSG") or (bus == "MTG" and ("MTG" in name or "METEOSAT" in name)):
        if bus == "MTG":
            sounder = "MTG-S" in name
            return mission("mtg-s" if sounder else "mtg-i","Meteosat Third Generation " + ("Sounder" if sounder else "Imager"),
                           "weather","Meteosat","Box + 2 Pan","Three-axis Meteosat instrument platform with two solar wings.")
        return mission(bus.lower(),"Meteosat " + ("Second Generation" if bus=="MSG" else "First Generation"),
                       "weather-spinner","Meteosat","Cyl + Ant","Spin-stabilized weather satellite with a solar-cell drum and lateral instrument opening.")
    if re.search(r"HIMAWARI[- ](?:8|9)\b",name):
        return mission("himawari-8-9","Himawari 8 and 9","weather","Himawari","Box + Pan + Boom",
                       "DS2000 weather platform with the Advanced Himawari Imager and one solar wing.")
    if re.match(r"^(?:FENGYUN|FY)[- ]?[24]",name):
        spinning = bool(re.match(r"^(?:FENGYUN|FY)[- ]?2",name))
        return mission("fy-2" if spinning else "fy-4","Fengyun-" + ("2" if spinning else "4"),
                       "weather-spinner" if spinning else "weather","Fengyun","Cyl + Ant" if spinning else "Box + Pan",
                       "Chinese geostationary meteorological spacecraft, represented in its deployed configuration.")
    if name.startswith(("ELEKTRO-L","INSAT-3D","GEO-KOMPSAT-2","HIMAWARI-6","HIMAWARI-7")):
        family = next(n for n in ("ELEKTRO-L","INSAT-3D","GEO-KOMPSAT-2A","GEO-KOMPSAT-2B","HIMAWARI-6","HIMAWARI-7") if name.startswith(n))
        return mission(family.lower(),family,"weather",family,"Box + 2 Pan" if family=="INSAT-3D" else "Box + Pan",
                       "Earth-observation spacecraft with an instrument deck and deployed solar power system.")
    tdrs = re.match(r"^TDRS[- ](\d+)", name)
    if tdrs:
        gen = 1 if int(tdrs[1])<=7 else 2 if int(tdrs[1])<=10 else 3
        return mission("tdrs-"+str(gen),"TDRS generation "+str(gen),"relay","TDRS","Box + 2 Pan + 2 Dish",
                       "NASA data relay spacecraft with two single-access reflectors and opposed solar wings.")
    if name.startswith("INMARSAT 4-"):
        return mission("inmarsat-4","Inmarsat-4","large-reflector","Inmarsat","Box + 2 Pan + Dish",
                       "Eurostar communications platform with two solar wings and a large L-band reflector.")
    if name.startswith(("BEIDOU","COMPASS","IRNSS","NVS-","QZS-")):
        if name.startswith(("BEIDOU","COMPASS")):
            which = "3" if "BEIDOU-3" in name else ("1" if "BEIDOU 1" in name else "2")
            key, label, family = "beidou-"+which, "BeiDou-"+which+" GEO", "BeiDou"
        elif name.startswith("QZS-"):
            key, label, family = "qzss-"+bus.lower(), "QZSS "+bus, "QZSS"
        else:
            key, label, family = ("irnss","NavIC IRNSS","NavIC") if name.startswith("IRNSS") else ("nvs","NavIC NVS","NavIC")
        return mission(key,label,"navigation",family,"Box + 2 Pan","Geosynchronous navigation bus with an Earth-facing antenna deck and solar wings.")
    if bus.startswith("HS-376"):
        return mission(bus.lower(),"Hughes "+bus,"comms-spinner","Hughes 376","Cyl + Dish",
                       "Spin-stabilized communications spacecraft with telescoping solar-cell drums and a despun reflector.")
    key = GEO_PAYLOADS.get(number) or GEO_BUSES.get(bus)
    if key:
        spec = GEO_MODELS[key]
        appearance = spec["appearance"]
        if "broadcast" in appearance:
            shape = "Cyl + 4 Pan + Plate" if appearance["broadcast"] == "Ekran" else "Cyl + 2 Pan + Dish"
            return mission(key, spec["name"], "geo-broadcast", spec["family"], shape,
                           spec["description"])
        if "experiment" in appearance:
            return mission(key, spec["name"], "geo-experiment", spec["family"], "Box + Truss + 2 Pan + Dish",
                           spec["description"], spec["dimensions"])
        dishes = appearance["dishes"] + int("meshDiameter" in appearance)
        return mission(key, spec["name"], "geo-telecom", spec["family"], f"Box + 2 Pan + {dishes} Dish",
                       spec["description"], spec.get("dimensions"))
    return None


def leo_mission(name, bus, number):
    if number in (58013, 58014):
        return mission("ref-kuiper-58013", "KuiperSat-1 and KuiperSat-2", "kuiper-protoflight", "Project Kuiper",
                       "Box + 2 Pan + Dish", "Amazon Protoflight spacecraft with an exposed equipment chassis, a phased array, a gateway dish and long articulated solar panels.")
    if bus.casefold() == "kuiper" or re.match(r"^(?:KUIPER|AMAZON LEO)[- ]\d", name, re.I):
        return mission("kuiper-production", "Amazon Leo / Kuiper production spacecraft", "kuiper-production", "Amazon Leo",
                       "Box + 3 antenna panels + solar array", "Deployed production spacecraft with three hinged antenna leaves around the central payload and a separate sun-tracking solar array.")
    if bus == "STS OV":
        return mission("space-shuttle","Space Shuttle orbiter","orbiter","Crewed spacecraft","Lifting body",
                       "NASA orbiter with swept delta wings, a vertical tail and three main engine bells.",(37.24,5.2,23.79))
    if bus == "Dragon CM":
        first = "CREW" not in name and not re.search(r"DRAGON (?:CRS-2[1-9]|CRS-3[0-9])",name) and number < 45000
        return mission("dragon-1" if first else "dragon-2","Dragon "+("1" if first else "2"),"capsule","Dragon",
                       "Frust + Cyl + 2 Pan" if first else "Frust + Cyl","SpaceX capsule and trunk in orbital configuration.")
    if number == 20580:
        return mission("hubble","Hubble Space Telescope","telescope","Astronomy","Cyl + 2 Pan",
                       "Cylindrical observatory with an open aperture door and two opposed solar wings.",(13.2,4.2,12.0))
    if name.startswith("IRIDIUM") and (bus in ("LM700","LM-700") or re.match(r"IRIDIUM[- ]\d{1,2}\b",name)):
        return mission("iridium-original","Iridium first generation","iridium-classic","Iridium","Tri Cyl + 2 Pan",
                       "First-generation communications satellite with a triangular bus and three inclined main antenna panels.")
    if re.match(r"^SENTINEL[- ]1",name):
        return mission("sentinel-1","Copernicus Sentinel-1","sar","Copernicus","Box + 2 Pan",
                       "C-band Earth-observation satellite with a 12 m radar antenna and two solar wings.")
    if re.match(r"^SENTINEL[- ]2",name):
        return mission("sentinel-2","Copernicus Sentinel-2","weather","Copernicus","Box + Pan",
                       "Multispectral Earth-observation spacecraft with a single deployed solar wing.")
    if re.match(r"^LANDSAT[- ](?:8|9)\b",name):
        return mission("landsat-8-9","Landsat 8 and 9","weather","Landsat","Box + Pan",
                       "Earth-observation spacecraft with optical and thermal instruments and a single solar wing.")
    if name in ("AQUA","TERRA","AURA"):
        return mission(name.lower(),name.title(),"weather","Earth Observing System","Box + Pan",
                       "NASA Earth-observation spacecraft with an instrument deck and a single solar wing.")
    if re.match(r"^NOAA[- ](?:20|21|22)\b",name) or "SUOMI NPP" in name:
        return mission("jpss-"+bus.lower(),"JPSS / "+bus,"weather","Polar weather","Box + Pan",
                       "Polar weather satellite with Earth-facing instruments and a solar wing.")
    return None


def legacy(orbit, number, name, bus, shape):
    if orbit == "geo":
        if number == 38740 or (re.fullmatch(r"(?:SSL|LS|FS)-1300(?:-[A-Z0-9]+)?",bus)
                               and geo_mission(name,bus,number) is None):
            return "SSL_1300.glb"
        return None
    if number == 25544: return "ISS.glb"
    # These communications platforms also appear outside their nominal GEO orbit.
    if bus == "HS-376": return "geo/hs-376.glb"
    if bus == "FS INTELSAT 5": return "geo/ref-fs-intelsat-5-12089.glb"
    if bus.startswith("Starlink"):
        if "V3" in bus: return "starlink_v3.glb"
        if "V2" in bus: return "starlink_v2.glb"
        return "starlink_V1"
    if re.match(r"^ONEWEB[- ]",name): return "oneweb.glb"
    if bus == "Qianfan" or name.startswith(("QIANFAN","SPACESAIL")): return "qianfan"
    if re.match(r"^IRIDIUM[- ]1\d\d\b",name): return "iridium"
    if number in (32790,37853) or (bus == "Cubesat 3U" and shape.casefold().strip("?")=="box"): return "cubesat"
    return None


def shape_key(text):
    text = text.lower().replace("panels","pan").replace("panel","pan").replace("wings","pan").replace("wing","pan")
    text = text.replace("cylinder","cyl").replace("22 pan","2 pan").replace("?","").strip()
    return " + ".join(sorted((re.sub(r"\s+"," ",s.strip()) for s in text.split("+") if s.strip()),
                             key=lambda s: bool(re.search(r"pan|dish|boom|ant|plate|wheel",s))))


def slug(text):
    return re.sub(r"[^a-z0-9]+","-",text.strip().lower()).strip("-")


def apply_geo_reviews(profiles, catalog):
    """Partition known payload configurations before applying the family's representative."""
    reviews = json.loads((ROOT/"tools/geo_fleet.json").read_bytes())
    for asset, review in reviews.items():
        assignments = dict(review.get("additionalAssignments",{}))
        if "parent" in review:
            assignments[review["parent"]] = review["numbers"]
        for source, numbers in assignments.items():
            parent = profiles[source]
            selected = set(numbers).intersection(parent["norad"])
            if not selected:
                continue
            parent["norad"] = sorted(set(parent["norad"])-selected)
            target = profiles.setdefault(asset,{"name":review.get("name",asset),"norad":[]})
            target["norad"] = sorted(set(target["norad"])|selected)
    for asset, profile in profiles.items():
        if not profile["norad"]:
            raise ValueError("Empty GEO profile: "+asset)
        if asset not in reviews:
            if profile.get("appearance"):
                profile["meta"]["reference_status"] = "Illustrated design"
                profile["meta"]["geometry"]["center_model"] = False
            continue
        review = reviews[asset]
        if "name" in review:
            profile["name"] = review["name"]
        meta = profile.setdefault("meta", {})
        representative = meta.get("dimension_source_norad")
        if representative not in profile["norad"]:
            representative = profile["norad"][0]
            row = catalog.get(representative, {})
            if profile.get("design") != "unknown" and "dimensions" not in review and all(
                    row.get(k,"-") != "-" for k in ("Length","Diameter","Span")):
                meta["geometry"] = dict(zip(("body_length_m","body_width_m","span_m"),
                                            (float(row[k]) for k in ("Length","Diameter","Span"))),glb_units="m")
                meta["dimension_source_norad"] = representative
            meta.setdefault("bus",row.get("Bus",profile["name"]))
        if "dimensions" in review:
            meta["geometry"] = dict(zip(("body_length_m","body_width_m","span_m"),review["dimensions"]),glb_units="m")
            meta.pop("dimension_source_norad",None)
        if "bus" in review:
            meta["bus"] = review["bus"]
        meta["references"] = review["sources"]
        if review.get("flightReferences"):
            members = set(profile["norad"])
            meta["flight_references"] = {url: sorted(members.intersection(numbers))
                                         for url, numbers in review["flightReferences"].items()
                                         if members.intersection(numbers)}
        if review.get("sharedWith"):
            profile["shared_with"] = review["sharedWith"]
        if "appearance" in review:
            profile["appearance"] = review["appearance"]
            profile["family"] = meta["bus"]
            profile["design"] = "geo-fleet"
            meta["geometry"]["center_model"] = False
            profile["shape"] = review.get("shape") or catalog.get(representative,{}).get("Shape",profile.get("shape",""))
            credit = review["illustration"]
            meta["reference_status"] = "Illustrated design"
            meta["reference_illustration"] = credit
            profile["description"] = "Representative deployed exterior based on "+credit+"."
        else:
            meta["reference_status"] = "Catalog outline"
        meta["dimension_note"] = review.get("note",
            "The catalog gives the representative envelope. Array sections, antenna mounts and surface finishes are estimated from the illustration.")


def import_profiles(orbit, sources):
    catalog = json.loads((ROOT/"json/tracked/TRACKED.manifest.json").read_bytes())
    records = {}
    starlink_pieces = {}
    for chunk in catalog["chunks"] + catalog["history_chunks"]:
        if chunk["object_type"]=="PAYLOAD":
            for row in json.loads((ROOT/chunk["path"]).read_bytes())["records"]:
                if row["orbit_class"]==orbit.upper():
                    records[int(row["norad_id"])] = row["satellite_name"]
                    if row["satellite_name"].startswith("STARLINK") and row.get("international_designator"):
                        starlink_pieces[row["international_designator"]] = int(row["norad_id"])
    raw = {}
    for source in sources:
        with source.open(encoding="utf8") as f:
            columns=next(f).lstrip("#").strip().split("\t")
            for r in csv.DictReader((l for l in f if not l.startswith("#")),fieldnames=columns,delimiter="\t"):
                number = (r.get("Satcat") or "").strip()
                # Some short-lived Starlinks have a launch-piece ID in both sources
                # while GCAT lists no numerical SATCAT ID. Require a matching bus too.
                if number == "NNA" and (r.get("Bus") or "").strip().startswith("Starlink"):
                    number = str(starlink_pieces.get((r.get("Piece") or "").strip(), ""))
                if number.isdigit() and int(number) in records:
                    raw[int(number)] = {key:value.strip() for key,value in r.items() if value is not None}
    groups, legacy_ids, unknown = defaultdict(list), defaultdict(list), []
    specs = {}
    for number,name in records.items():
        row = raw.get(number,{})
        bus, shape = row.get("Bus","").strip("?"),row.get("Shape","")
        asset = legacy(orbit,number,name,bus,shape)
        if asset:
            legacy_ids[asset].append(number)
            continue
        try:
            size = tuple(float(row[k]) for k in ("Length","Diameter","Span"))
        except (KeyError, ValueError):
            size = (0,0,0)
        special = (geo_mission if orbit=="geo" else leo_mission)(name,bus,number)
        if special:
            reference = GEO_MODELS.get(special[0], {}) if orbit == "geo" else {}
            size = reference.get("dimensions") or special[5] or size
        if not all(math.isfinite(n) and n>0 for n in size) or (not special and (
            not shape or shape.lower() in ("-","unk","irr","unknown") or row.get("Type","").startswith(("R","C"))
            or re.fullmatch(r"OBJECT [A-Z]+",name))):
            unknown.append(number)
            continue
        if special:
            key = ("mission",special[0])
            specs[key] = special
        else:
            if not bus or bus.lower() in ("unknown","unk","-"): bus = name
            layout = shape_key(shape)
            # A published bus can carry different instruments on each flight. Keep its
            # representative platform together. CubeSats retain their deployment layout.
            key = ("outline",bus,layout if "cubesat" in bus.lower() else "")
        groups[key].append((number,name,bus,shape,size))
    result = {}
    for key, members in sorted(groups.items()):
        layouts = defaultdict(list)
        for member in members:
            layouts[shape_key(member[3])].append(member)
        typical = max(layouts.values(),key=lambda rows:(len(rows),-min(r[0] for r in rows)))
        midpoint = tuple(median(s) for s in zip(*(r[4] for r in typical)))
        best = min(typical,key=lambda r:(sum(abs(math.log(v/m)) for v,m in zip(r[4],midpoint)),r[0]))
        norad,name,bus,shape,size = best
        if key in specs:
            ident,label,design,family,shape,_,description = specs[key]
        else:
            ident = "ref-"+slug(bus)[:52]+"-"+str(min(r[0] for r in members))
            label = bus if len(members)>1 else name
            family,design = "Catalog outline","outline"
            description = "Representative "+bus+" platform. Body shape and appendages follow the catalog, with approximate dimensions."
        asset = orbit+"/"+slug(ident)+".glb"
        assert asset not in result, asset
        reference = GEO_MODELS.get(ident) if orbit == "geo" else None
        if reference:
            label, description = reference["name"], reference["description"]
            size = reference.get("dimensions", size)
            if "weather" in reference["appearance"]:
                design = "geo-weather"
            elif "relay" in reference["appearance"]:
                design = "geo-relay"
        meta = {"bus":bus,"geometry":dict(zip(("body_length_m","body_width_m","span_m"),size),glb_units="m"),
                "dimension_source_norad":norad}
        result[asset]={"name":label,"description":description,"family":family,"design":design,"shape":shape,
                       "meta":meta,"norad":sorted(r[0] for r in members)}
        if design in KUIPER_REFERENCES:
            meta["references"] = KUIPER_REFERENCES[design]
            meta["reference_status"] = "Illustrated design"
            meta["geometry"]["center_model"] = False
            meta["dimension_note"] = (
                "GCAT supplies an approximate envelope. Solar panel divisions, equipment positions and the fixed solar-drive angle are illustrative. " +
                ("The three-leaf layout follows Figure 4 of the cited observational study, an interpretation of Amazon imagery."
                 if design == "kuiper-production" else "Amazon's Protoflight photograph shows only part of the deployed spacecraft."))
        if reference:
            result[asset]["appearance"] = reference["appearance"]
            if "busName" in reference:
                meta["bus"] = reference["busName"]
            meta["references"] = [GEO_REFERENCES["sources"][source] for source in reference["sources"]]
            if "dimensions" in reference:
                meta.pop("dimension_source_norad")
            meta["dimension_note"] = reference.get("dimensionNote",
                "Representative GCAT envelope. Reflector layout, yokes and surface finishes are estimated from the cited illustrations.")
    names = defaultdict(list)
    for entry in result.values():names[entry["name"]].append(entry)
    for label, entries in names.items():
        if len(entries)>1:
            for entry in entries:entry["name"]=label+" ("+records[entry["meta"]["dimension_source_norad"]]+")"
    result[orbit+"/"+orbit+"-reference.glb"]={"name":orbit.upper()+" spacecraft reference",
        "description":"Schematic marker. A verified exterior model is unavailable for this catalog entry.",
        "family":"Reference","design":"unknown","shape":"Unk",
        "meta":{"bus":"Unidentified","geometry":{"glb_units":"m","to_scale":False}},"norad":sorted(unknown)}
    for asset, ids in sorted(legacy_ids.items()):
        name, metadata = LEGACY[asset]
        result[asset]={"name":name,"existingMetadata":metadata,"norad":sorted(ids)}
    if orbit == "geo":
        apply_geo_reviews(result, raw)
    ids = [number for p in result.values() for number in p["norad"]]
    assert len(ids)==len(set(ids))==len(records)
    body = "{\n"+",\n".join("  "+json.dumps(k)+": "+json.dumps(v,ensure_ascii=False) for k,v in result.items())+"\n}\n"
    (DATA/(orbit+".json")).write_bytes(body.encode())
    print(f"{orbit.upper()}: {len(ids)} payloads, {len(result)} profiles, {len(unknown)} schematic markers.")


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("orbit",choices=["leo","geo"])
    parser.add_argument("sources",nargs="+",type=Path)
    args=parser.parse_args()
    import_profiles(args.orbit,args.sources)
