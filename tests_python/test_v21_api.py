import contextlib
import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

import server
from services.v21.api import V21ApiService, _source_observations
from services.v21.catalog_registry import CatalogSnapshotRegistry
from services.v21.feature_flags import ServerFeatureFlag
from services.v21.http_api import V21HttpRouter
from services.v21.job_store import JobStore
from services.v21.security import BearerTokenAuthenticator


VIEWER_TOKEN = "viewer-token-0000000000000000"
ANALYST_TOKEN = "analyst-token-000000000000000"
ADMIN_TOKEN = "administrator-token-0000000000"


def auth(token):
    return {"Authorization": "Bearer " + token}


def request(port, method, path, *, headers=None, payload=None, raw_body=None):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    body = raw_body
    outgoing = dict(headers or {})
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        outgoing.setdefault("Content-Type", "application/json")
    try:
        connection.request(method, path, body=body, headers=outgoing)
        response = connection.getresponse()
        response_body = response.read()
        return response.status, {key.lower(): value for key, value in response.getheaders()}, response_body
    finally:
        connection.close()


class V21ApiFixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.runtime_root = Path(self.temporary.name)
        self.store = JobStore(self.runtime_root / "service.sqlite3")
        source_records = json.loads((server.ROOT / "json" / "tle" / "TLE.json").read_text(encoding="utf-8"))[:3]
        source_path = self.runtime_root / "source.json"
        source_path.write_text(json.dumps(source_records), encoding="utf-8")
        registry = CatalogSnapshotRegistry(self.runtime_root)
        snapshot = registry.snapshot_tle_json(source_path, source_id="test-source", provider="Test Provider", license_id="test")
        observations = [
            {
                "object_id": "obx:norad:" + record["norad_id"],
                "name": record["satellite_name"],
                "norad_id": record["norad_id"],
                "object_type": "UNKNOWN",
                "lifecycle_status": "ACTIVE",
                "observation_status": "NEW",
                "element_set_id": "test-element-%d" % index,
            }
            for index, record in enumerate(source_records)
        ]
        self.store.create_catalog_revision(
            snapshot.revision_id,
            snapshot.source_id,
            snapshot.dataset_id,
            snapshot.metadata(),
            observations,
            snapshot.snapshot_path,
            dataset_format="TLE_JSON",
            adapter_version=snapshot.adapter_version,
            provenance={"provider": "Test Provider", "license_id": "test"},
            dataset_hash=snapshot.dataset_hash,
        )
        flag = ServerFeatureFlag(
            "experimental_full_catalog_screening",
            True,
            "server",
            "Experimental",
            "non-operational",
            "tests",
            "docs/science/EXPERIMENTAL_FULL_CATALOG_SCREENING_V2_1.md",
        )
        authenticator = BearerTokenAuthenticator(
            (("viewer", VIEWER_TOKEN), ("analyst", ANALYST_TOKEN), ("administrator", ADMIN_TOKEN))
        )
        self.service = V21ApiService(
            root=server.ROOT,
            runtime_root=self.runtime_root,
            store=self.store,
            feature_flag=flag,
            authenticator=authenticator,
            cursor_secret=b"test-cursor-secret-at-least-32-bytes",
            manager=None,
        )
        self.router = V21HttpRouter(self.service, stream_seconds=0.1)
        self.httpd = server.ThreadingHTTPServer(
            ("127.0.0.1", 0),
            server.make_handler(serve_static=False, v21_router=self.router),
        )
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.httpd.server_address[1]

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)
        self.store.close()
        self.temporary.cleanup()

    @staticmethod
    def job_request(radius=10):
        return {
            "schema_version": "2.1.0",
            "catalog_revision_id": "current",
            "catalog_scope": {
                "object_types": ["UNKNOWN"],
                "lifecycle_statuses": ["ACTIVE"],
            },
            "configuration": {
                "start_time": "2026-07-20T00:00:00Z",
                "horizon_seconds": 60,
                "coarse_step_seconds": 60,
                "screening_radius_km": radius,
                "max_attempts": 1,
                "timeout_seconds": 30,
            },
        }

    def submit(self, key="screen-job-0001", payload=None):
        headers = {**auth(ANALYST_TOKEN), "Idempotency-Key": key}
        return request(
            self.port,
            "POST",
            "/api/v1/screening-jobs",
            headers=headers,
            payload=payload or self.job_request(),
        )


class V21HttpApiTests(V21ApiFixture):
    def test_public_capabilities_and_health_do_not_expose_private_paths(self):
        status, _, body = request(self.port, "GET", "/api/v1/capabilities")
        self.assertEqual(status, 200)
        payload = json.loads(body)
        self.assertTrue(payload["full_catalog_screening"]["enabled"])
        self.assertNotIn(str(self.runtime_root), body.decode("utf-8"))

        live_status, _, live_body = request(self.port, "GET", "/api/v1/health/live")
        self.assertEqual(live_status, 200)
        self.assertEqual(json.loads(live_body)["status"], "live")

        ready_status, _, ready_body = request(self.port, "GET", "/api/v1/health/ready")
        self.assertEqual(ready_status, 503)
        self.assertEqual(json.loads(ready_body)["status"], "unavailable")

        catalog_status, _, catalog_body = request(
            self.port,
            "GET",
            "/api/v1/catalog-revisions/current",
            headers=auth(VIEWER_TOKEN),
        )
        self.assertEqual(catalog_status, 200)
        catalog = json.loads(catalog_body)
        self.assertNotIn("snapshot_path", catalog)
        self.assertNotIn("metadata_path", catalog)
        self.assertNotIn("snapshot_path", catalog["metadata"])
        self.assertNotIn(str(self.runtime_root), catalog_body.decode("utf-8"))

    def test_catalog_observations_classify_change_absence_and_reappearance(self):
        first = {
            "norad_id": "12345",
            "satellite_name": "TEST OBJECT",
            "tle_line1": "1 12345U 20001A   26201.00000000  .00000000  00000+0  00000+0 0  9990",
            "tle_line2": "2 12345  51.6000 100.0000 0001000  10.0000 350.0000 15.50000000123450",
        }
        new = _source_observations([first], "2026-07-20T00:00:00Z")
        self.assertEqual(new[0]["observation_status"], "NEW")
        previous = [{
            **new[0],
            "current_element_set_id": new[0]["element_set_id"],
            "observation_status": "OBSERVED",
        }]
        unchanged = _source_observations([first], "2026-07-20T01:00:00Z", previous)
        self.assertEqual(unchanged[0]["observation_status"], "OBSERVED")
        changed_record = dict(first, satellite_name="RENAMED OBJECT")
        changed = _source_observations([changed_record], "2026-07-20T02:00:00Z", previous)
        self.assertEqual(changed[0]["observation_status"], "CHANGED")
        absent = _source_observations([], "2026-07-20T03:00:00Z", previous, include_absent=True)
        self.assertEqual(absent[0]["observation_status"], "ABSENT")
        reappeared_previous = [{**previous[0], "observation_status": "ABSENT"}]
        reappeared = _source_observations([first], "2026-07-20T04:00:00Z", reappeared_previous)
        self.assertEqual(reappeared[0]["observation_status"], "REAPPEARED")

    def test_incremental_catalog_bootstrap_does_not_mark_missing_objects_absent(self):
        previous_revision_id = self.store.get_current_catalog_revision()["revision_id"]
        previous_objects = self.store.list_current_objects()
        self.assertGreaterEqual(len(previous_objects), 2)
        missing_object = previous_objects[1]

        source_root = self.runtime_root / "incremental-source"
        tle_root = source_root / "json" / "tle"
        tle_root.mkdir(parents=True)
        source_records = json.loads((server.ROOT / "json" / "tle" / "TLE.json").read_text(encoding="utf-8"))
        (tle_root / "TLE.json").write_text(json.dumps(source_records[:1]), encoding="utf-8")
        (tle_root / "TLE.meta.json").write_text(
            json.dumps({
                "last_status": "ok",
                "mode": "incremental",
                "fetched_at": "2026-07-20T05:00:00Z",
            }),
            encoding="utf-8",
        )
        service = V21ApiService(
            root=source_root,
            runtime_root=self.runtime_root,
            store=self.store,
            feature_flag=self.service.feature_flag,
            authenticator=self.service.authenticator,
            cursor_secret=b"incremental-test-cursor-secret-32-bytes",
            manager=None,
        )

        catalog = service.bootstrap_bundled_catalog()

        self.assertEqual(catalog["source_status"], "PARTIAL")
        self.assertTrue(catalog["source_provenance"]["partial_update"])
        observations = self.store.get_catalog_observations(catalog["revision_id"])
        self.assertNotIn("ABSENT", {item["observation_status"] for item in observations})
        retained = self.store.get_current_object(missing_object["object_id"])
        self.assertEqual(retained["current_revision_id"], previous_revision_id)

    def test_authentication_roles_and_problem_details(self):
        status, headers, body = request(self.port, "GET", "/api/v1/screening-jobs")
        self.assertEqual(status, 401)
        self.assertTrue(headers["content-type"].startswith("application/problem+json"))
        self.assertIn("bearer", headers["www-authenticate"].lower())
        self.assertEqual(json.loads(body)["code"], "AUTH_REQUIRED")

        status, _, body = request(
            self.port,
            "POST",
            "/api/v1/screening-jobs",
            headers={**auth(VIEWER_TOKEN), "Idempotency-Key": "screen-job-0002"},
            payload=self.job_request(),
        )
        self.assertEqual(status, 403)
        self.assertEqual(json.loads(body)["code"], "AUTH_FORBIDDEN")

    def test_unexpected_router_failure_returns_a_bounded_problem(self):
        original = self.service.capabilities

        def fail_capabilities():
            raise RuntimeError("private diagnostic must not cross the API boundary")

        self.service.capabilities = fail_capabilities
        try:
            status, headers, body = request(self.port, "GET", "/api/v1/capabilities")
        finally:
            self.service.capabilities = original
        self.assertEqual(status, 500)
        self.assertTrue(headers["content-type"].startswith("application/problem+json"))
        problem = json.loads(body)
        self.assertEqual(problem["code"], "INTERNAL_ERROR")
        self.assertNotIn("private diagnostic", body.decode("utf-8"))

    def test_submission_is_idempotent_and_conflicts_on_changed_request(self):
        status, headers, body = self.submit()
        self.assertEqual(status, 202)
        self.assertEqual(headers["idempotent-replayed"], "false")
        job = json.loads(body)
        self.assertEqual(job["state"], "QUEUED")
        self.assertEqual(headers["location"], "/api/v1/screening-jobs/" + job["job_id"])

        replay_status, replay_headers, replay_body = self.submit()
        self.assertEqual(replay_status, 202)
        self.assertEqual(replay_headers["idempotent-replayed"], "true")
        self.assertEqual(json.loads(replay_body)["job_id"], job["job_id"])

        conflict_status, _, conflict_body = self.submit(payload=self.job_request(radius=20))
        self.assertEqual(conflict_status, 409)
        self.assertEqual(json.loads(conflict_body)["code"], "IDEMPOTENCY_CONFLICT")

    def test_replay_freezes_original_request_and_catalog_revision(self):
        _, _, original_body = self.submit("screen-job-original-0001")
        original = json.loads(original_body)
        replay_headers = {
            **auth(ANALYST_TOKEN),
            "Idempotency-Key": "screen-job-replay-0001",
        }
        status, headers, body = request(
            self.port,
            "POST",
            "/api/v1/screening-jobs/%s/replay" % original["job_id"],
            headers=replay_headers,
            payload={},
        )
        self.assertEqual(status, 202)
        self.assertEqual(headers["idempotent-replayed"], "false")
        replay = json.loads(body)
        self.assertNotEqual(replay["job_id"], original["job_id"])
        self.assertEqual(replay["request"], original["request"])
        self.assertEqual(replay["catalog_revision_id"], original["catalog_revision_id"])

        repeated_status, repeated_headers, repeated_body = request(
            self.port,
            "POST",
            "/api/v1/screening-jobs/%s/replay" % original["job_id"],
            headers=replay_headers,
            payload={},
        )
        self.assertEqual(repeated_status, 202)
        self.assertEqual(repeated_headers["idempotent-replayed"], "true")
        self.assertEqual(json.loads(repeated_body)["job_id"], replay["job_id"])

    def test_signed_keyset_pagination_rejects_tampering(self):
        self.submit("screen-job-page-0001")
        self.submit("screen-job-page-0002")
        status, _, body = request(
            self.port,
            "GET",
            "/api/v1/screening-jobs?limit=1",
            headers=auth(VIEWER_TOKEN),
        )
        self.assertEqual(status, 200)
        first = json.loads(body)
        self.assertEqual(len(first["items"]), 1)
        self.assertTrue(first["next_cursor"])

        cursor = first["next_cursor"]
        status, _, body = request(
            self.port,
            "GET",
            "/api/v1/screening-jobs?limit=1&cursor=" + cursor[:-1] + ("A" if cursor[-1] != "A" else "B"),
            headers=auth(VIEWER_TOKEN),
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["code"], "CURSOR_INVALID")

    def test_cancel_and_sse_resume_surface_durable_outbox(self):
        _, _, body = self.submit("screen-job-stream-0001")
        job = json.loads(body)
        status, headers, stream = request(
            self.port,
            "GET",
            "/api/v1/screening-jobs/%s/stream?once=true" % job["job_id"],
            headers=auth(VIEWER_TOKEN),
        )
        self.assertEqual(status, 200)
        self.assertTrue(headers["content-type"].startswith("text/event-stream"))
        self.assertIn(b"event: job.state", stream)
        self.assertIn(b"id: ", stream)

        cancel_status, _, cancel_body = request(
            self.port,
            "DELETE",
            "/api/v1/screening-jobs/" + job["job_id"],
            headers=auth(ANALYST_TOKEN),
        )
        self.assertEqual(cancel_status, 202)
        self.assertEqual(json.loads(cancel_body)["state"], "CANCELLED")

    def test_request_admission_rejects_url_tokens_and_oversized_bodies(self):
        status, _, body = request(
            self.port,
            "GET",
            "/api/v1/screening-jobs?access_token=secret",
            headers=auth(VIEWER_TOKEN),
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["code"], "TOKEN_IN_URL_REJECTED")

        status, _, body = request(
            self.port,
            "POST",
            "/api/v1/screening-jobs",
            headers={
                **auth(ANALYST_TOKEN),
                "Idempotency-Key": "screen-job-large-0001",
                "Content-Type": "application/json",
                "Content-Length": "70000",
            },
            raw_body=b"{}",
        )
        self.assertEqual(status, 413)
        self.assertEqual(json.loads(body)["code"], "BODY_TOO_LARGE")

    def test_cors_preflight_allows_versioned_auth_headers(self):
        status, headers, _ = request(
            self.port,
            "OPTIONS",
            "/api/v1/screening-jobs",
            headers={"Origin": "http://localhost:63342"},
        )
        self.assertEqual(status, 204)
        self.assertIn("Authorization", headers["access-control-allow-headers"])
        self.assertIn("Idempotency-Key", headers["access-control-allow-headers"])
        self.assertIn("DELETE", headers["access-control-allow-methods"])


if __name__ == "__main__":
    unittest.main()
