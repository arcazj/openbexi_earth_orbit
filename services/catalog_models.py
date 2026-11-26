"""Resolve public model resources from the same profiles and files as the viewer."""

from __future__ import annotations

import json
import re
import struct
from functools import lru_cache
from pathlib import Path, PurePosixPath
from urllib.parse import quote


def _read(path):
    return json.loads(path.read_bytes())


def _asset_url(relative):
    return "/obj/" + quote(relative, safe="/")


class ModelLibrary:
    def __init__(self, root, manifest, orbit_index, profiles):
        self.root = root
        self.profiles = profiles
        self.catalog_orbits = orbit_index.get("catalogOrbitClasses", {})
        self.models = {}
        self.assignments = {}
        by_profile = {}
        for row in manifest["models"]:
            files = row["files"]
            primary = PurePosixPath(files.get("glb") or files["obj"])
            model_id = ".".join(primary.with_suffix("").parts).lower()
            by_profile[row["id"]] = model_id
            # Prefer the physical file's own profile over a display alias.
            if model_id not in self.models or row["id"] == str(primary):
                self.models[model_id] = row
            if profiles.get(row["id"], {}).get("mesh_file") == str(primary):
                # Existing resource URLs use the profile name that preceded the NORAD filename.
                legacy_id = ".".join(PurePosixPath(row["id"]).with_suffix("").parts).lower()
                self.models.setdefault(legacy_id, row)
        for orbit, groups in orbit_index["orbits"].items():
            for profile_id, ranges in groups.items():
                model_id = by_profile[profile_id]
                for interval in filter(None, ranges.split(",")):
                    first, _, last = interval.partition("-")
                    for number in range(int(first), int(last or first) + 1):
                        self.assignments[str(number)] = (orbit, model_id)

    def link(self, row):
        assignment = self.assignments.get(row["norad_id"])
        if row["object_type"] != "PAYLOAD":
            return None
        if not assignment:
            if (row["orbit_class"] != "LEO" or "leo.kuiper-production" not in self.models
                    or not re.fullmatch(r"(?:KUIPER|AMAZON LEO)[- ]\d+", row.get("name") or "", re.I)):
                return None
            assignment = ("LEO", "leo.kuiper-production")
        orbit, model_id = assignment
        if row["orbit_class"] not in (None, "UNKNOWN", orbit, self.catalog_orbits.get(row["norad_id"])):
            return None
        return {"id": model_id, "href": "/api/v1/models/" + model_id}

    def detail(self, model_id):
        row = self.models.get(model_id)
        if row is None:
            return None
        files = row["files"]
        primary = files.get("glb") or files["obj"]
        profile = self.profiles.get(row["id"], {})
        meta = profile.get("meta", {})
        dedicated = profile.get("existingMetadata")
        if dedicated:
            meta = _read(self.root / "json" / "satellites" / (dedicated + ".json"))["0"]["meta"]
        extras = _glb_extras(self.root / "obj" / primary) if "glb" in files else {}
        references = dict.fromkeys(meta.get("references", []))
        for url, numbers in meta.get("flight_references", {}).items():
            references[url] = "Flight reference for NORAD " + ", ".join(map(str, numbers))
        for ref in extras.get("sources", []):
            if isinstance(ref, dict) and ref.get("url"):
                references[ref["url"]] = ref.get("basis")
        if extras.get("source"):
            references.setdefault(extras["source"], None)
        notes = [meta.get("dimension_note"), extras.get("visualEstimates"), extras.get("approximations"),
                 extras.get("estimates", {}).get("detail"), extras.get("illustrationEstimates", {}).get("details")]
        return {
            "id": model_id, "name": profile.get("name") or row["displayName"],
            "format": row["type"], "description": row.get("description"),
            "files": {kind: _asset_url(path) for kind, path in files.items()},
            "textures": [{"url": _asset_url(t["path"]), "required": t.get("required", True)} for t in row.get("textures", [])],
            "reference_status": meta.get("reference_status"),
            "dimensions": _dimensions(meta.get("geometry", {}), extras),
            "notes": [note for note in notes if isinstance(note, str) and note],
            "references": [{"url": url, "basis": basis} for url, basis in references.items()],
        }


def _glb_extras(path):
    # Only the JSON chunk contains the asset metadata. Leave mesh buffers on disk.
    with path.open("rb") as stream:
        header = stream.read(20)
        if len(header) != 20:
            raise ValueError("Incomplete packaged GLB header")
        magic, version, _, length, kind = struct.unpack("<4sIII4s", header)
        if (magic, version, kind) != (b"glTF", 2, b"JSON") or length > path.stat().st_size - 20:
            raise ValueError("Invalid packaged GLB header")
        document = json.loads(stream.read(length))
        return {**document.get("extras", {}), **document.get("asset", {}).get("extras", {})}


def _dimensions(geometry, extras):
    result = []
    for group, basis, all_metres in (
        (geometry, "profile", False),
        (extras.get("nominalDimensionsM", {}), "nominal", True),
        (extras.get("representativeDeployedEnvelopeM", {}), "representative", True),
        (extras.get("measurements", {}), "nominal", False),
        (extras.get("modeledDimensions", {}), "estimate", False),
        (extras.get("illustrationEstimates", {}), "estimate", False),
        (extras.get("estimates", {}), "estimate", False),
    ):
        for name, value in group.items():
            if not all_metres and not name.endswith(("_m", "M")):
                continue
            values = value if isinstance(value, list) else [value]
            if values and all(type(n) in (int, float) for n in values):
                estimated = group is geometry and (
                    (name.startswith("body_") and geometry.get("body_estimated"))
                    or (name == "span_m" and geometry.get("span_estimated"))
                )
                result.append({"name": name, "values_m": values,
                               "basis": "estimate" if estimated or "estimated" in name.lower() else basis})
    return result


def model_library(root):
    catalog = root / "json"
    paths = (catalog / "display_satellite_models.json",
             *(catalog / "satellites" / (name + ".json") for name in ("orbit-model-index", "leo", "meo", "geo")))
    identities = tuple((stat.st_mtime_ns, stat.st_size) for stat in (p.stat() for p in paths))
    return _load_library(root, paths, identities)


@lru_cache(maxsize=1)
def _load_library(root, paths, identities):
    manifest, orbit_index, *groups = map(_read, paths)
    profiles = {key: profile for group in groups for key, profile in group.items()}
    return ModelLibrary(root, manifest, orbit_index, profiles)
