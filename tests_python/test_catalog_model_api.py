from __future__ import annotations

import http.client
import json
import sqlite3
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from urllib.parse import urlencode
from unittest.mock import Mock

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
        self.fetcher = Mock()
        self.now = 1790000000
        self.refresh = server.SelectedElements(self.root, fetcher=self.fetcher, clock=lambda: self.now)
        handler = server.make_handler(serve_static=True, data_root_resolver=lambda: self.root, selected_elements=self.refresh)
        self.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=self.httpd.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 2)
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)

    def build(self, extra="", anomaly=14.0, epoch=None):
        rows = [(39188, "O3B FM5", ""), (39189, "O3B FM4", ""),
                (63130, "COSMOS 2584 [GLONASS-K2]", ""), (44080, "FLOCK 4A-2", "2025-01-01"),
                (100001, "METADATA ONLY", "")]
        text = HEADER + "".join(f"{name},2025-042A,{number},PAY,+,CIS,2020-01-01,AFETR,{decay},"
                                "675,55,19000,19000,,,EA,ORB\n" for number, name, decay in rows) + extra
        gp = []
        for number, name, _ in rows[:4]:
            raw = dict(omm(number, name), MEAN_MOTION=2.1, MEAN_ANOMALY=anomaly)
            if epoch is not None:
                raw["EPOCH"] = epoch
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

    def test_selected_elements_cache_concurrency_restart_and_fallback(self):
        url = data.CELESTRAK_GP_ENDPOINT + "?CATNR=39188&FORMAT=JSON"
        path = "/api/v1/objects/39188/refresh-elements"
        newest = dict(omm(39188), EPOCH="2026-09-01T10:00:00Z")
        self.fetcher.return_value = data.FetchResponse(url=url, text=json.dumps([newest]))
        with ThreadPoolExecutor(max_workers=4) as clients:
            responses = list(clients.map(lambda _: self.request(path, "POST"), range(4)))
        self.fetcher.assert_called_once_with(url, headers=None)
        for status, _, raw in responses:
            self.assertEqual(status, 200)
            elements = json.loads(raw)["element_set"]
            self.assertEqual(elements["epoch"], "2026-09-01T10:00:00.000Z")
            self.assertTrue(data.validate_tle_pair(elements["line1"], elements["line2"]))
        restart = server.SelectedElements(self.root, fetcher=self.fetcher, clock=lambda: self.now)
        detail = {"norad_id": "39188", "scope": "current", "element_set": None}
        self.assertEqual(restart.lookup(detail)["element_set"], elements)
        self.assertEqual(self.fetcher.call_count, 1)
        self.now += 3 * 3600
        self.fetcher.return_value = data.FetchResponse(url=url, text=json.dumps([omm(39188)]))
        older = restart.lookup(detail)
        self.assertEqual(older["element_set"], elements)
        self.assertEqual(older["checked_at"], self.now)
        self.now += 3 * 3600
        self.fetcher.return_value = data.FetchResponse(url=url, text=json.dumps([omm(39189)]))
        failed = restart.lookup(detail)
        self.assertEqual(failed["status"], "provider_unavailable")
        self.assertEqual(failed["element_set"], elements)
        self.assertEqual(failed["checked_at"], older["checked_at"])
        self.now += 3 * 3600
        self.fetcher.side_effect = OSError("offline")
        self.assertEqual(restart.lookup(detail)["element_set"], elements)
        self.assertEqual(json.loads(self.request("/api/v1/objects/44080/refresh-elements", "POST")[2])["status"], "historical")
        self.assertEqual(self.fetcher.call_count, 4)

    def test_selection_persists_new_catalog_epoch_during_provider_cooldown(self):
        number = 39188
        url = f"{data.CELESTRAK_GP_ENDPOINT}?CATNR={number}&FORMAT=JSON"
        path = f"/api/v1/objects/{number}/refresh-elements"
        upstream = dict(omm(number), EPOCH="2026-09-01T10:00:00Z")
        self.fetcher.return_value = data.FetchResponse(url=url, text=json.dumps([upstream]))
        first_check = self.now
        status, _, raw = self.request(path, "POST")
        self.assertEqual((status, json.loads(raw)["status"]), (200, "updated"))

        published_epoch = "2026-09-02T10:00:00.000Z"
        self.build(epoch=published_epoch)
        self.now += 60
        status, _, raw = self.request(path, "POST")
        elements = json.loads(raw)["element_set"]
        self.assertEqual((status, elements["epoch"]), (200, published_epoch))
        self.assertTrue(data.validate_tle_pair(elements["line1"], elements["line2"]))
        self.fetcher.assert_called_once_with(url, headers=None)
        with closing(sqlite3.connect(self.refresh.database)) as db:
            epoch, saved, checked, attempted = db.execute(
                "SELECT epoch, data, checked, attempted FROM elements WHERE norad=?", (str(number),)
            ).fetchone()
        self.assertEqual((epoch, json.loads(saved)["omm"]["EPOCH"]), (published_epoch, published_epoch))
        self.assertEqual((checked, attempted), (first_check, first_check))

        self.now = first_check + 2 * 3600
        status, _, raw = self.request(path, "POST")
        self.assertEqual((status, json.loads(raw)["element_set"]["epoch"]), (200, published_epoch))
        self.assertEqual(self.fetcher.call_count, 2)

    def test_selected_elements_for_six_digit_id_without_published_position(self):
        number = "100001"
        url = data.CELESTRAK_GP_ENDPOINT + "?CATNR=" + number + "&FORMAT=JSON"
        self.fetcher.return_value = data.FetchResponse(url=url, text=json.dumps([omm(int(number))]))
        status, _, raw = self.request("/api/v1/objects/" + number + "/refresh-elements", "POST")
        self.assertEqual(status, 200)
        elements = json.loads(raw)["element_set"]
        self.assertEqual(str(elements["omm"]["NORAD_CAT_ID"]), number)
        self.assertNotIn("line1", elements)
        self.fetcher.assert_called_once_with(url, headers=None)

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
        unique = library.link({"norad_id": "56174", "object_type": "PAYLOAD", "orbit_class": "GEO"})
        for href in (unique["href"], "/api/v1/models/geo.maxar-1300-tempo-instrument"):
            self.assertEqual(self.get_json(href)["files"]["glb"], "/obj/geo/56174.glb")
        production = self.get_json("/api/v1/models/leo.kuiper-production")
        self.assertIn("https://planet4589.org/space/gcat/index.html", [ref["url"] for ref in production["references"]])
        self.assertTrue(any("three-leaf" in note for note in production["notes"]))

    def test_refreshed_kuiper_payload_uses_the_reviewed_model_and_estimated_span(self):
        self.build(extra="KUIPER-00714,2026-264AD,101486,PAY,+,US,2026-11-24,FRGUI,,93,52,455,431,,,EA,ORB\n")
        flight = self.get_json("/api/v1/objects/101486")
        self.assertEqual(flight["model"]["id"], "leo.kuiper-production")
        for model_id, span in (("leo.kuiper-production", 5), ("leo.ref-kuiper-58013", 10)):
            model = self.get_json("/api/v1/models/" + model_id)
            dimension = next(item for item in model["dimensions"] if item["name"] == "span_m")
            self.assertEqual((dimension["values_m"], dimension["basis"]), ([span], "estimate"))

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
