from __future__ import annotations

import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.parse import urlencode

import server
from tests_python.test_v23_tracked_catalog import HEADER, omm, write_inputs
from tools import satellite_data_tools as data


class CatalogModelApiTests(unittest.TestCase):
    def setUp(self):
        runtime = server.ROOT / "runtime"
        runtime.mkdir(exist_ok=True)
        temporary = tempfile.TemporaryDirectory(dir=runtime)
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.build()
        handler = server.make_handler(serve_static=True, data_root_resolver=lambda: self.root)
        self.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=self.httpd.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 2)
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)

    def build(self, extra="", anomaly=14.0):
        rows = [(39188, "O3B FM5", ""), (39189, "O3B FM4", ""),
                (63130, "COSMOS 2584 [GLONASS-K2]", ""), (44080, "FLOCK 4A-2", "2025-01-01"),
                (100001, "METADATA ONLY", "")]
        text = HEADER + "".join(f"{name},2025-042A,{number},PAY,+,CIS,2020-01-01,AFETR,{decay},"
                                "675,55,19000,19000,,,EA,ORB\n" for number, name, decay in rows) + extra
        gp = []
        for number, name, _ in rows[:4]:
            raw = dict(omm(number, name), MEAN_MOTION=2.1, MEAN_ANOMALY=anomaly)
            gp.append(data.transform_satellite_omm_object(raw, {}))
        write_inputs(self.root, text, gp)
        (self.root / data.GP_RELATIVE_PATH).write_bytes(json.dumps(gp, ensure_ascii=False, separators=(",", ":")).encode())
        revision = data.catalog_revision_for_payload(gp)
        (self.root / data.GP_META_RELATIVE_PATH).write_text(json.dumps({
            "catalog_revision": revision, "dataset_hash": revision,
            "catalog_source_groups": list(data.GP_SOURCE_GROUPS), **data.gp_source_scope_metadata(verified=True)
        }), encoding="utf-8")
        result = data.build_tracked_catalog(root=self.root, mode=data.RECONCILIATION_MODE)
        self.assertFalse(result.errors, result.errors)

    def request(self, path, method="GET", headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=15)
        try:
            conn.request(method, path, headers=headers or {})
            response = conn.getresponse()
            return response.status, response.headers, response.read()
        finally:
            conn.close()

    def get_json(self, path, status=200):
        actual, headers, body = self.request(path)
        self.assertEqual(actual, status, body)
        self.assertIn("application/" + ("json" if status == 200 else "problem+json"), headers["Content-Type"])
        return json.loads(body)

    def test_scope_search_and_valid_omm(self):
        page = self.get_json("/api/v1/objects?q=GLONASS-K2+63130+2025-042A&orbit=meo&owner=cis&type=PAYLOAD")
        self.assertEqual([item["norad_id"] for item in page["items"]], ["63130"])
        detail = self.get_json(page["items"][0]["href"])
        self.assertEqual(page["gp_revision"], detail["gp_revision"])
        self.assertEqual(detail["element_set"]["omm"]["NORAD_CAT_ID"], "63130")
        self.assertEqual(detail["element_set"]["omm"]["EPOCH"], detail["epoch"])
        self.assertEqual(detail["model"]["id"], "meo.glonass-k2")
        hist = self.get_json("/api/v1/objects?scope=historical&availability=unavailable&q=44080")
        self.assertEqual([r["norad_id"] for r in hist["items"]], ["44080"])
        self.assertEqual(self.get_json("/api/v1/objects?q=44080")["items"], [])
        for n in ("44080", "100001"):
            obj = self.get_json("/api/v1/objects/" + n)
            self.assertIsNone(obj["epoch"])
            self.assertIsNone(obj["element_set"])
            self.assertEqual(obj["availability"], "unavailable")
        self.assertIsNone(self.get_json("/api/v1/objects/100001")["model"])

    def test_paging_is_numeric_bound_to_filters_and_both_revisions(self):
        base = "/api/v1/objects?"
        first = self.get_json(base + "scope=all&limit=2")
        cursor = first["next_cursor"]
        second = self.get_json(base + urlencode({"scope": "ALL", "limit": 10, "cursor": cursor}))
        ids = [item["norad_id"] for page in (first, second) for item in page["items"]]
        self.assertEqual(ids, ["39188", "39189", "44080", "63130", "100001"])
        self.assertIsNone(second["next_cursor"])
        self.get_json(base + urlencode({"scope": "current", "cursor": cursor}), 400)
        self.get_json(base + urlencode({"scope": "all", "cursor": cursor + "!"}), 400)
        self.build(anomaly=15.0)
        self.assertEqual(self.get_json(base + urlencode({"scope": "all", "cursor": cursor}), 409)["code"],
                         "CATALOG_REVISION_CHANGED")
        next_cursor = self.get_json(base + "limit=1")["next_cursor"]
        self.build(extra="NEW,2026-002A,100002,PAY,+,US,2026-01-01,AFETR,,90,51,500,490,,,EA,ORB\n")
        self.get_json(base + urlencode({"cursor": next_cursor}), 409)

    def test_shared_model_download_and_source_basis(self):
        left, right = [self.get_json("/api/v1/objects/" + n)["model"] for n in ("39188", "39189")]
        self.assertEqual(left, right)
        model = self.get_json(left["href"])
        self.assertEqual(model["id"], "meo.o3b")
        self.assertTrue(model["references"] and model["dimensions"])
        status, _, body = self.request(model["files"]["glb"])
        self.assertEqual((status, body[:4]), (200, b"glTF"))
        for model_id, required in (("leo.starlink_v1", False), ("leo.qianfan", True)):
            obj = self.get_json("/api/v1/models/" + model_id)
            self.assertEqual(set(obj["files"]), {"obj", "mtl"})
            self.assertTrue(obj["textures"])
            for t in obj["textures"]:
                self.assertIs(t["required"], required)
                self.assertEqual(self.request(t["url"], "HEAD")[0], 200)
        library = server.model_library(server.ROOT)
        links = [library.link({"norad_id": n, "object_type": "PAYLOAD", "orbit_class": "MEO"})
                 for n in ("20061", "20959")]
        self.assertEqual(links[0], links[1])  # GPS II and IIA use the same primary mesh.
        self.assertEqual(self.get_json(links[0]["href"])["files"]["glb"], "/obj/meo/gps-ii.glb")
        production = self.get_json("/api/v1/models/leo.kuiper-production")
        self.assertIn("https://planet4589.org/space/gcat/index.html", [ref["url"] for ref in production["references"]])
        self.assertTrue(any("three-leaf" in note for note in production["notes"]))

    def test_contract_head_etags_errors_and_read_only_methods(self):
        spec = self.get_json("/docs/catalog-api.openapi.json")
        live = self.get_json("/openapi.json")
        for key, operation in spec["paths"].items():
            self.assertEqual(live["paths"][key], operation)
        for key, schema in spec["components"]["schemas"].items():
            self.assertEqual(live["components"]["schemas"][key], schema)
        schemas = spec["components"]["schemas"]
        page = self.get_json("/api/v1/objects?limit=1")
        detail = self.get_json(page["items"][0]["href"])
        for payload, schema in ((page, schemas["CatalogPage"]), (page["items"][0], schemas["CatalogObject"]),
                                (detail, schemas["CatalogDetail"]["allOf"][1]), (detail["element_set"]["omm"], schemas["CatalogOMM"]),
                                (self.get_json(detail["model"]["href"]), schemas["CatalogModel"])):
            self.assertTrue(set(schema["required"]).issubset(payload), schema)
        self.assertEqual(self.get_json("/api/version")["catalog_model_api"], "/api/v1/objects")
        for route in ("/api/v1/objects", "/api/v1/objects/63130", "/api/v1/models/meo.o3b"):
            _, res, body = self.request(route)
            status, head, empty = self.request(route, "HEAD")
            self.assertEqual((status, head["ETag"], int(head["Content-Length"]), empty), (200, res["ETag"], len(body), b""))
            self.assertEqual(self.request(route, headers={"If-None-Match": head["ETag"]})[0], 304)
            for method in ("POST", "DELETE", "PUT", "PATCH"):
                status, denied, body = self.request(route, method)
                self.assertEqual((status, denied["Allow"], json.loads(body)["code"]), (405, "GET, HEAD, OPTIONS", "METHOD_NOT_ALLOWED"))
        for query in ("?orbit=bad", "?unknown=1", "?limit=0", "?limit=201", "?owner=us&owner=us", "?q="):
            self.get_json("/api/v1/objects" + query, 400)
        self.get_json("/api/v1/objects/063130", 400)
        self.get_json("/api/v1/objects/999999999", 404)
        self.get_json("/api/v1/models/no-such-model", 404)
        self.get_json("/api/v1/models/meo.o3b?q=x", 400)

    def test_incoherent_pointer_fails_after_a_successful_request(self):
        self.get_json("/api/v1/objects/63130")
        (self.root / data.GP_RELATIVE_PATH).write_text("[]", encoding="utf-8")
        self.get_json("/api/v1/objects", 503)
        self.get_json("/api/v1/objects/63130", 503)
        self.get_json("/api/v1/models/meo.glonass-k2")
