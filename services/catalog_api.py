"""Read-only object search and lookup over one verified local catalog generation."""

from __future__ import annotations

import hashlib
import json
import re
import secrets
from bisect import bisect_right
from functools import lru_cache
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qsl

from services.v21.security import ApiProblem, CursorCodec
from tools.satellite_data_tools import valid_gp_records_for_tracked_catalog


CONTRACT = json.loads((Path(__file__).resolve().parents[1] / "docs/catalog-api.openapi.json").read_bytes())
PARAMETERS = {p["name"]: p["schema"] for p in CONTRACT["paths"]["/api/v1/objects"]["parameters"]
              if p["in"] == "query"}
OBJECT_ID = re.compile(r"[1-9][0-9]{0,8}")
MODEL_ID = re.compile(r"[a-z0-9][a-z0-9._-]{0,159}")
CURSORS = CursorCodec(secrets.token_bytes(32))
ELEMENTS_LOCK = Lock()


def invalid(detail):
    return ApiProblem(400, "QUERY_INVALID", "Invalid catalog request", detail)


def unavailable():
    return ApiProblem(503, "TRACKED_CATALOG_UNAVAILABLE", "Tracked-object catalog unavailable",
                      "The referenced catalog generation or its orbital elements could not be verified.")


def parse_query(raw):
    if len(raw) > 4096:
        raise invalid("The query exceeds 4096 characters.")
    try:
        pairs = (parse_qsl(raw, keep_blank_values=True, strict_parsing=True, max_num_fields=len(PARAMETERS),
                           errors="strict") if raw else [])
    except ValueError as exc:
        raise invalid("Supply one value for each supported query parameter.") from exc
    values = {}
    for name, raw_value in pairs:
        if name not in PARAMETERS or name in values:
            raise invalid("Unknown or repeated query parameter.")
        schema = PARAMETERS[name]
        value = raw_value.strip()
        if not value or len(value) > schema.get("maxLength", 1024):
            raise invalid(f"Invalid length for {name}.")
        if "enum" in schema:
            choices = {item.casefold(): item for item in schema["enum"]}
            if value.casefold() not in choices:
                raise invalid(f"Unsupported {name}. Choose from {', '.join(schema['enum'])}.")
            value = choices[value.casefold()]
        if name == "limit":
            if not re.fullmatch(r"[0-9]{1,3}", value) or not schema["minimum"] <= int(value) <= schema["maximum"]:
                raise invalid(f"limit must be between {schema['minimum']} and {schema['maximum']}.")
            value = int(value)
        if name in ("q", "owner"):
            value = " ".join(value.casefold().split())
        values[name] = value
    return {key: values.get(key, schema.get("default")) for key, schema in PARAMETERS.items()}


class ObjectCatalog:
    def __init__(self, snapshot, read_chunk):
        manifest = snapshot["manifest"]
        self.revision = manifest["catalog_revision"]
        self.gp_revision = manifest["provenance"]["gp_revision"]
        self.root = snapshot["root"]
        self.rows = {}
        self.search_text = {}
        for scope, descriptors in (("current", manifest["chunks"]), ("historical", manifest["history_chunks"])):
            for desc in descriptors:
                verified = read_chunk(Path(desc["path"]).name, self.root, include_body=True,
                                      manifest_snapshot=snapshot["manifest_snapshot"])
                if not verified or "sha256:" + hashlib.sha256(verified["body"]).hexdigest() != desc["sha256"]:
                    raise unavailable()
                for record in json.loads(verified["body"])["records"]:
                    number = record["norad_id"]
                    row = {k: record.get(k) for k in ("norad_id", "name", "international_designator", "owner",
                           "object_type", "orbit_class", "lifecycle_status", "source", "unavailable_reason")}
                    row.update(scope=scope, availability="positioned" if scope == "current" and
                               record["has_current_elements"] else "unavailable", href="/api/v1/objects/" + number)
                    self.rows[number] = row
                    fields = [record.get(k) for k in ("name", "satellite_name", "norad_id", "provider_catalog_id",
                              "alpha5_id", "object_id", "international_designator", "owner", "owner_code",
                              "company", "operator", "orbit_class", "object_type", "lifecycle_status")]
                    fields.extend(record.get("tags") or [])
                    fields.append("position unavailable" if row["availability"] == "unavailable" else "positioned")
                    self.search_text[number] = " ".join(str(v) for v in fields if v).casefold()
        self.numbers = sorted(map(int, self.rows))

    def page(self, query):
        filters = {k: v for k, v in query.items() if k not in ("limit", "cursor")}
        fingerprint = hashlib.sha256(json.dumps(filters, sort_keys=True).encode()).hexdigest()
        start = 0
        if query["cursor"]:
            pos = CURSORS.decode(query["cursor"], filter_hash=fingerprint)
            if (pos["revision"], pos["gp_revision"]) != (self.revision, self.gp_revision):
                raise ApiProblem(409, "CATALOG_REVISION_CHANGED", "Catalog revision changed",
                                 "Restart this search without a cursor to use the current revision.")
            start = bisect_right(self.numbers, pos["after"])
        terms = (query["q"] or "").split()
        rows = []
        more = False
        for i in range(start, len(self.numbers)):
            number = str(self.numbers[i])
            row = self.rows[number]
            if any(query[param] != "all" and row[field] != query[param] for param, field in
                   (("scope", "scope"), ("availability", "availability"), ("orbit", "orbit_class"),
                    ("type", "object_type"))):
                continue
            if query["owner"] and query["owner"] != (row["owner"] or "").casefold():
                continue
            if not all(term in self.search_text[number] for term in terms):
                continue
            if len(rows) == query["limit"]:
                more = True
                break
            rows.append(row)
        cursor = None
        if more:
            cursor = CURSORS.encode({"revision": self.revision, "gp_revision": self.gp_revision,
                                     "after": int(rows[-1]["norad_id"])}, filter_hash=fingerprint)
        return {"catalog_revision": self.revision, "gp_revision": self.gp_revision, "items": rows, "next_cursor": cursor}

    def detail(self, number, model_link):
        row = self.rows.get(number)
        if row is None:
            raise ApiProblem(404, "OBJECT_NOT_FOUND", "Object not found", "No catalog record has this NORAD ID.")
        elements = None
        if row["availability"] == "positioned":
            with ELEMENTS_LOCK:
                elements = _elements(self.root, self.gp_revision).get(number)
            if elements is None:
                raise unavailable()
        return {**row, "catalog_revision": self.revision, "gp_revision": self.gp_revision,
                "epoch": elements["omm"]["EPOCH"] if elements else None, "element_set": elements,
                "model": model_link(row) if row["object_type"] == "PAYLOAD" else None}


@lru_cache(maxsize=1)
def _elements(root, revision):
    raw = (root / "json/gp/GP.json").read_bytes()
    if "sha256:" + hashlib.sha256(raw).hexdigest() != revision:
        raise unavailable()
    records, _ = valid_gp_records_for_tracked_catalog(json.loads(raw))
    return {number: {k: r["element_set"][k] for k in ("format", "source", "omm")}
            for number, r in records.items()}


class CatalogCache:
    def __init__(self):
        self.lock = Lock()
        self.key = self.catalog = None

    def load(self, snapshot, read_chunk):
        manifest = snapshot["manifest"]
        key = (snapshot["root"], manifest["catalog_revision"], manifest["provenance"]["gp_revision"])
        with self.lock:
            if self.key != key:
                self.catalog = ObjectCatalog(snapshot, read_chunk)
                self.key = key
            return self.catalog
