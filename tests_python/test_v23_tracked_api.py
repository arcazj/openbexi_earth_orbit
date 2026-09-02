from __future__ import annotations

import contextlib
import hashlib
import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

import server

GP_FIXTURE_BYTES = b"[{}]"
GP_FIXTURE_REVISION = f"sha256:{hashlib.sha256(GP_FIXTURE_BYTES).hexdigest()}"
SATCAT_FIXTURE_BYTES = b"OBJECT_NAME,NORAD_CAT_ID,DECAY_DATE\r\nTEST,100001,\r\n"
SATCAT_FIXTURE_REVISION = f"sha256:{hashlib.sha256(SATCAT_FIXTURE_BYTES).hexdigest()}"


def tracked_coverage_revision(
    row_accounting: dict[str, int],
    expected: int | None,
    quarantine_sha256: str,
) -> str:
    material = json.dumps(
        {
            "row_accounting": row_accounting,
            "expected": expected,
            "quarantine_sha256": quarantine_sha256,
        },
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(material).hexdigest()}"


def tracked_catalog_revision(
    chunks: list[dict[str, object]],
    history_chunks: list[dict[str, object]],
    coverage_revision: str,
) -> str:
    material = json.dumps(
        {
            "chunks": [
                {"path": item["path"], "sha256": item["sha256"]}
                for item in [*chunks, *history_chunks]
            ],
            "coverage_revision": coverage_revision,
        },
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(material).hexdigest()}"


@contextlib.contextmanager
def running_server(root: Path):
    with mock.patch.object(server, "ROOT", root):
        httpd = server.ThreadingHTTPServer(
            ("127.0.0.1", 0),
            server.make_handler(serve_static=True),
        )
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            yield httpd.server_address[1]
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=2)


def request(port: int, method: str, path: str):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        connection.request(method, path)
        response = connection.getresponse()
        return response.status, dict(response.getheaders()), response.read()
    finally:
        connection.close()


def write_valid_tracked_pointer(
    root: Path,
    *,
    manifest_revision: str | None = None,
    metadata_revision: str | None = None,
    gp_revision: str = GP_FIXTURE_REVISION,
    satcat_revision: str | None = SATCAT_FIXTURE_REVISION,
    gp_source_groups: tuple[str, ...] = ("active",),
) -> tuple[Path, Path]:
    gp_root = root / "json" / "gp"
    gp_root.mkdir(parents=True, exist_ok=True)
    gp_path = gp_root / "GP.json"
    gp_meta_path = gp_root / "GP.meta.json"
    if not gp_path.exists():
        gp_path.write_bytes(GP_FIXTURE_BYTES)
    if not gp_meta_path.exists():
        gp_meta_path.write_text(
            json.dumps({
                "catalog_revision": gp_revision,
                "dataset_hash": gp_revision,
                "catalog_source_groups": list(gp_source_groups),
                "last_status": "ok",
            }),
            encoding="utf-8",
        )
    if satcat_revision is not None:
        satcat_path = root / "json" / "satcat.csv"
        satcat_meta_path = root / "json" / "satcat.meta.json"
        if not satcat_path.exists():
            satcat_path.parent.mkdir(parents=True, exist_ok=True)
            satcat_path.write_bytes(SATCAT_FIXTURE_BYTES)
        if not satcat_meta_path.exists():
            satcat_meta_path.parent.mkdir(parents=True, exist_ok=True)
            satcat_meta_path.write_text(
                json.dumps({
                    "catalog_revision": satcat_revision,
                    "dataset_hash": satcat_revision,
                    "last_status": "ok",
                }),
                encoding="utf-8",
            )
    payload = {
        "schema_version": "2.3.0",
        "scope": "CURRENT",
        "object_type": "DEBRIS",
        "records": [
            {
                "norad_id": "100001",
                "object_type": "DEBRIS",
                "lifecycle_status": "ACTIVE",
                "observation_status": "NEW",
                "catalog_membership_status": "PRESENT",
                "decay_date": None,
                "has_current_elements": False,
                "metadata_only": True,
            }
        ],
    }
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    digest = hashlib.sha256(body).hexdigest()
    filename = f"{digest}-current-debris.json"
    tracked_root = root / "json" / "tracked"
    chunk_path = tracked_root / "chunks" / filename
    chunk_path.parent.mkdir(parents=True, exist_ok=True)
    chunk_path.write_bytes(body)
    descriptor = {
        "id": "current-debris",
        "path": f"json/tracked/chunks/{filename}",
        "count": 1,
        "bytes": len(body),
        "sha256": f"sha256:{digest}",
        "scope": "CURRENT",
        "object_type": "DEBRIS",
    }
    empty_payload = {
        "schema_version": "2.3.0",
        "scope": "CURRENT",
        "object_type": "PAYLOAD",
        "records": [],
    }
    empty_body = json.dumps(empty_payload, separators=(",", ":")).encode("utf-8")
    empty_digest = hashlib.sha256(empty_body).hexdigest()
    empty_filename = f"{empty_digest}-current-payload.json"
    (chunk_path.parent / empty_filename).write_bytes(empty_body)
    empty_descriptor = {
        "id": "current-payload",
        "path": f"json/tracked/chunks/{empty_filename}",
        "count": 0,
        "bytes": len(empty_body),
        "sha256": f"sha256:{empty_digest}",
        "scope": "CURRENT",
        "object_type": "PAYLOAD",
    }
    descriptors = [descriptor, empty_descriptor]
    quarantine_payload = {"schema_version": "2.3.0", "records": []}
    quarantine_body = json.dumps(quarantine_payload, separators=(",", ":")).encode("utf-8")
    quarantine_digest = hashlib.sha256(quarantine_body).hexdigest()
    quarantine_filename = f"{quarantine_digest}-quarantine.json"
    (chunk_path.parent / quarantine_filename).write_bytes(quarantine_body)
    quarantine_descriptor = {
        "path": f"json/tracked/chunks/{quarantine_filename}",
        "count": 0,
        "bytes": len(quarantine_body),
        "sha256": f"sha256:{quarantine_digest}",
    }
    row_accounting = {
        "received": 1,
        "accepted": 1,
        "quarantined": 0,
        "duplicates": 0,
        "issues": 0,
    }
    coverage_revision = tracked_coverage_revision(
        row_accounting,
        1,
        quarantine_descriptor["sha256"],
    )
    manifest_revision = manifest_revision or tracked_catalog_revision(
        descriptors,
        [],
        coverage_revision,
    )
    tracked_counts = {
        "expected": 1,
        "expected_provider_records": None,
        **row_accounting,
        "current": 1,
        "historical": 0,
        "absent": 0,
        "history_total": 0,
        "total": 1,
        "propagatable": 0,
        "metadata_only": 1,
        "current_propagatable": 0,
        "current_metadata_only": 1,
        "object_types": {
            "PAYLOAD": 0,
            "DEBRIS": 1,
            "ROCKET_BODY": 0,
            "MISSION_RELATED": 0,
            "UNKNOWN": 0,
        },
        "current_object_types": {
            "PAYLOAD": 0,
            "DEBRIS": 1,
            "ROCKET_BODY": 0,
            "MISSION_RELATED": 0,
            "UNKNOWN": 0,
        },
    }
    coverage = {
        "expected": 1,
        "expected_provider_records": None,
        "received": 1,
        "accepted": 1,
        "quarantined": 0,
        "duplicates": 0,
        "complete_source_snapshot": True,
        "provider_completeness_claim": False,
        "invariant": "received == accepted + quarantined + duplicates",
        "invariant_holds": True,
        "expected_matches_received": True,
    }
    manifest_path = tracked_root / "TRACKED.manifest.json"
    provenance = {"gp_revision": gp_revision, "gp_source_groups": list(gp_source_groups)}
    if satcat_revision is not None:
        provenance["satcat_revision"] = satcat_revision
    manifest_path.write_text(
        json.dumps(
            {
                "schema_version": "2.3.0",
                "catalog_revision": manifest_revision,
                "coverage_revision": coverage_revision,
                "provider_completeness_claim": False,
                "counts": tracked_counts,
                "coverage": coverage,
                "invariants": {
                    "provider_coverage_holds": True,
                    "catalog_partition_holds": True,
                    "current_chunk_count_holds": True,
                    "history_chunk_count_holds": True,
                },
                "provenance": provenance,
                "chunks": descriptors,
                "history_chunks": [],
                "quarantine": quarantine_descriptor,
            }
        ),
        encoding="utf-8",
    )
    tracked_metadata = {
        "catalog_revision": metadata_revision or manifest_revision,
        "dataset_hash": metadata_revision or manifest_revision,
        "coverage_revision": coverage_revision,
        "coverage": coverage,
        "last_status": "ok",
        "source_status": "VERIFIED_SNAPSHOT",
        "last_reconciled_at": "2026-09-01T12:00:00Z",
        "last_reconciled_catalog_revision": manifest_revision,
        "source_gp_revision": gp_revision,
        "source_gp_groups": list(gp_source_groups),
        "counts": tracked_counts,
    }
    if satcat_revision is not None:
        tracked_metadata["source_satcat_revision"] = satcat_revision
    (tracked_root / "TRACKED.meta.json").write_text(
        json.dumps(tracked_metadata),
        encoding="utf-8",
    )
    return manifest_path, chunk_path


class TrackedCatalogApiTests(unittest.TestCase):
    def test_manifest_and_only_referenced_chunks_are_exposed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            gp_root = root / "json" / "gp"
            gp_root.mkdir(parents=True)
            (gp_root / "GP.json").write_bytes(GP_FIXTURE_BYTES)
            (gp_root / "GP.meta.json").write_text(
                json.dumps({
                    "catalog_revision": GP_FIXTURE_REVISION,
                    "dataset_hash": GP_FIXTURE_REVISION,
                    "last_status": "ok",
                    "catalog_source_groups": ["active"],
                }),
                encoding="utf-8",
            )
            manifest_path, chunk_path = write_valid_tracked_pointer(root)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            chunk_body = chunk_path.read_bytes()
            chunk_payload = json.loads(chunk_body)
            filename = chunk_path.name

            with server.TRACKED_CHUNK_VALIDATION_LOCK:
                server.TRACKED_CHUNK_VALIDATION_CACHE.clear()
            original_validator = server._validate_tracked_chunk_payload
            with mock.patch.object(
                server,
                "_validate_tracked_chunk_payload",
                wraps=original_validator,
            ) as validator, running_server(root) as port:
                for path in (
                    "/api/tracked-objects",
                    "/api/tracked-objects/manifest",
                    "/json/tracked/TRACKED.manifest.json",
                ):
                    status, _, body = request(port, "GET", path)
                    self.assertEqual(status, 200, path)
                    self.assertEqual(
                        json.loads(body)["catalog_revision"],
                        manifest["catalog_revision"],
                    )

                api_path = f"/api/tracked-objects/chunks/{filename}"
                status, _, body = request(port, "GET", api_path)
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body)["records"][0]["norad_id"], "100001")
                status, _, body = request(port, "GET", f"/{manifest['chunks'][0]['path']}")
                self.assertEqual(status, 200)
                self.assertEqual(body, chunk_body)
                status, headers, body = request(port, "HEAD", api_path)
                self.assertEqual(status, 200)
                self.assertEqual(body, b"")
                self.assertEqual(int(headers["Content-Length"]), len(chunk_body))
                self.assertEqual(
                    validator.call_count,
                    len(manifest["chunks"]) + len(manifest["history_chunks"]) + 1,
                )

                status, _, _ = request(port, "GET", "/api/tracked-objects/chunks/unreferenced.json")
                self.assertEqual(status, 404)
                status, _, _ = request(port, "GET", "/api/tracked-objects/chunks/%2e%2e%2fsecret.json")
                self.assertEqual(status, 404)
                status, _, _ = request(port, "GET", f"/api/tracked-objects/chunks/extra/{filename}")
                self.assertEqual(status, 404)
                status, _, _ = request(port, "GET", f"/json/tracked/chunks/extra/{filename}")
                self.assertEqual(status, 404)

                chunk_path.write_text("corrupt", encoding="utf-8")
                status, _, body = request(port, "GET", api_path)
                self.assertEqual(status, 503)
                self.assertEqual(json.loads(body)["code"], "TRACKED_CATALOG_UNAVAILABLE")

                tampered_payload = dict(chunk_payload)
                tampered_payload["records"] = [dict(chunk_payload["records"][0])]
                tampered_payload["records"][0]["object_type"] = "PAYLOAD"
                tampered_body = json.dumps(tampered_payload, separators=(",", ":")).encode("utf-8")
                tampered_digest = hashlib.sha256(tampered_body).hexdigest()
                chunk_path.write_bytes(tampered_body)
                manifest["chunks"][0]["bytes"] = len(tampered_body)
                manifest["chunks"][0]["sha256"] = f"sha256:{tampered_digest}"
                manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
                status, _, body = request(port, "GET", api_path)
                self.assertEqual(status, 503)
                self.assertEqual(json.loads(body)["code"], "TRACKED_CATALOG_UNAVAILABLE")

    def test_manifest_metadata_and_chunks_fail_closed_on_stale_source_lineage(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            _, chunk_path = write_valid_tracked_pointer(root)
            gp_meta_path = root / "json" / "gp" / "GP.meta.json"
            gp_meta = json.loads(gp_meta_path.read_text(encoding="utf-8"))
            gp_meta["catalog_revision"] = "sha256:new-gp"
            gp_meta_path.write_text(json.dumps(gp_meta), encoding="utf-8")

            paths = (
                "/api/tracked-objects",
                "/api/tracked-objects/manifest",
                "/json/tracked/TRACKED.manifest.json",
                "/json/tracked/TRACKED.meta.json",
                f"/api/tracked-objects/chunks/{chunk_path.name}",
                f"/json/tracked/chunks/{chunk_path.name}",
            )
            with running_server(root) as port:
                for path in paths:
                    with self.subTest(path=path):
                        status, headers, body = request(port, "GET", path)
                        self.assertEqual(status, 503)
                        self.assertEqual(
                            headers.get("Content-Type"),
                            "application/problem+json; charset=utf-8",
                        )
                        problem = json.loads(body)
                        self.assertEqual(problem["code"], "TRACKED_CATALOG_UNAVAILABLE")
                        self.assertEqual(problem["instance"], path)

    def test_gp_payload_drift_degrades_health_and_denies_tracked_catalog(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            _, chunk_path = write_valid_tracked_pointer(root)
            (root / "json" / "gp" / "GP.json").write_text(
                '[{"norad_id":"200002"}]',
                encoding="utf-8",
            )

            health = server._catalog_data_health(root)
            self.assertEqual(health["catalog_state"], "degraded")
            self.assertFalse(health["gp_revision_match"])
            self.assertFalse(health["tracked_source_revision_match"])
            self.assertIsNone(health["tracked_revision"])
            self.assertIsNone(health["tracked_current_count"])
            self.assertIn("GP catalog bytes do not match", health["last_error"])

            paths = (
                "/api/tracked-objects/manifest",
                "/json/tracked/TRACKED.manifest.json",
                f"/api/tracked-objects/chunks/{chunk_path.name}",
            )
            with running_server(root) as port:
                for path in paths:
                    status, _, body = request(port, "GET", path)
                    self.assertEqual(status, 503, path)
                    self.assertEqual(json.loads(body)["code"], "TRACKED_CATALOG_UNAVAILABLE")

    def test_missing_manifest_satcat_lineage_denies_all_tracked_routes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest_path, chunk_path = write_valid_tracked_pointer(root)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["provenance"].pop("satcat_revision")
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            health = server._catalog_data_health(root)
            self.assertEqual(health["catalog_state"], "degraded")
            self.assertFalse(health["tracked_source_revision_match"])
            self.assertIn("SATCAT provenance is stale", health["last_error"])

            mixed_case_paths = (
                "/JSON/TRACKED/tracked.manifest.json",
                "/JSON/TRACKED/TRACKED.meta.json",
                f"/JSON/TRACKED/CHUNKS/{chunk_path.name}",
            )
            paths = (
                "/api/tracked-objects/manifest",
                "/json/tracked/TRACKED.manifest.json",
                "/json/tracked/TRACKED.meta.json",
                f"/api/tracked-objects/chunks/{chunk_path.name}",
                f"/json/tracked/chunks/{chunk_path.name}",
                *mixed_case_paths,
            )
            with running_server(root) as port:
                for path in paths:
                    status, _, body = request(port, "GET", path)
                    self.assertEqual(status, 503, path)
                    self.assertEqual(json.loads(body)["code"], "TRACKED_CATALOG_UNAVAILABLE")
                for path in mixed_case_paths:
                    status, headers, body = request(port, "HEAD", path)
                    self.assertEqual(status, 503, path)
                    self.assertEqual(body, b"")
                    self.assertEqual(
                        headers.get("Content-Type"),
                        "application/problem+json; charset=utf-8",
                    )

    def test_absent_satcat_lineage_is_not_a_coherent_tracked_snapshot(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest_path, chunk_path = write_valid_tracked_pointer(root)
            coherent_revision = server._catalog_data_health(root)["data_revision"]
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["provenance"].pop("satcat_revision")
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            metadata_path = root / "json" / "tracked" / "TRACKED.meta.json"
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            metadata.pop("source_satcat_revision")
            metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
            (root / "json" / "satcat.csv").unlink()
            (root / "json" / "satcat.meta.json").unlink()

            health = server._catalog_data_health(root)
            self.assertEqual(health["catalog_state"], "degraded")
            self.assertFalse(health["tracked_source_revision_match"])
            self.assertIsNone(health["tracked_revision"])
            self.assertIsNone(health["tracked_current_count"])
            self.assertIn("SATCAT metadata revision is unavailable", health["last_error"])
            self.assertNotEqual(health["data_revision"], coherent_revision)
            self.assertIsNone(server._load_coherent_tracked_catalog_snapshot(root))

            paths = (
                "/api/tracked-objects/manifest",
                "/json/tracked/TRACKED.manifest.json",
                "/json/tracked/TRACKED.meta.json",
                f"/api/tracked-objects/chunks/{chunk_path.name}",
                f"/json/tracked/chunks/{chunk_path.name}",
            )
            with running_server(root) as port:
                for method in ("GET", "HEAD"):
                    for path in paths:
                        status, _, body = request(port, method, path)
                        self.assertEqual(status, 503, (method, path))
                        if method == "GET":
                            self.assertEqual(
                                json.loads(body)["code"],
                                "TRACKED_CATALOG_UNAVAILABLE",
                            )
                        else:
                            self.assertEqual(body, b"")

    def test_count_hash_and_redundant_slash_aliases_fail_closed(self):
        def rebind_revisions(manifest, metadata):
            row_accounting = {
                key: manifest["counts"][key]
                for key in ("received", "accepted", "quarantined", "duplicates", "issues")
            }
            coverage_revision = tracked_coverage_revision(
                row_accounting,
                manifest["counts"]["expected"],
                manifest["quarantine"]["sha256"],
            )
            catalog_revision = tracked_catalog_revision(
                manifest["chunks"],
                manifest["history_chunks"],
                coverage_revision,
            )
            manifest["coverage_revision"] = coverage_revision
            manifest["catalog_revision"] = catalog_revision
            metadata["coverage_revision"] = coverage_revision
            metadata["catalog_revision"] = catalog_revision
            metadata["dataset_hash"] = catalog_revision

        def impossible_issue_accounting(manifest, metadata):
            manifest["counts"]["issues"] = 9
            metadata["counts"]["issues"] = 9
            rebind_revisions(manifest, metadata)

        def false_complete_snapshot(manifest, metadata):
            manifest["counts"]["expected"] = None
            metadata["counts"]["expected"] = None
            manifest["coverage"]["expected"] = None
            manifest["coverage"]["expected_matches_received"] = None
            metadata["coverage"] = dict(manifest["coverage"])
            rebind_revisions(manifest, metadata)

        def forged_expected_provider_records(manifest, metadata):
            manifest["counts"]["expected_provider_records"] = 123
            manifest["coverage"]["expected_provider_records"] = 123
            metadata["counts"]["expected_provider_records"] = 123
            metadata["coverage"]["expected_provider_records"] = 123

        def fractional_expected_count(manifest, metadata):
            for payload in (manifest, metadata):
                payload["counts"]["expected"] = 1.0
                payload["coverage"]["expected"] = 1.0

        def unsafe_expected_count(manifest, metadata):
            unsafe = (1 << 53) + 1
            for payload in (manifest, metadata):
                payload["counts"]["expected"] = unsafe
                payload["coverage"]["expected"] = unsafe

        def generic_chunk_name(manifest, _metadata):
            manifest["chunks"][0]["path"] = "json/tracked/chunks/current-debris.json"

        def mismatched_content_address(manifest, _metadata):
            manifest["chunks"][0]["path"] = (
                f"json/tracked/chunks/{'0' * 64}-current-debris.json"
            )

        def duplicate_descriptor_id(manifest, _metadata):
            duplicate = dict(manifest["chunks"][0])
            duplicate["path"] = (
                f"json/tracked/chunks/{'0' * 64}-duplicate.json"
            )
            duplicate["sha256"] = f"sha256:{'0' * 64}"
            manifest["chunks"].append(duplicate)

        def forged_catalog_revision(manifest, metadata):
            forged = f"sha256:{'0' * 64}"
            manifest["catalog_revision"] = forged
            metadata["catalog_revision"] = forged
            metadata["dataset_hash"] = forged

        def reordered_descriptors(manifest, _metadata):
            manifest["chunks"] = list(reversed(manifest["chunks"]))

        def forged_coverage_revision(manifest, metadata):
            forged_coverage = f"sha256:{'0' * 64}"
            forged_catalog = tracked_catalog_revision(
                manifest["chunks"],
                manifest["history_chunks"],
                forged_coverage,
            )
            manifest["coverage_revision"] = forged_coverage
            manifest["catalog_revision"] = forged_catalog
            metadata["coverage_revision"] = forged_coverage
            metadata["catalog_revision"] = forged_catalog
            metadata["dataset_hash"] = forged_catalog

        cases = {
            "manifest-schema": lambda manifest, metadata: manifest.__setitem__(
                "schema_version", "9.9.0"
            ),
            "provider-completeness": lambda manifest, metadata: manifest.__setitem__(
                "provider_completeness_claim", True
            ),
            "manifest-invariant": lambda manifest, metadata: manifest["invariants"].__setitem__(
                "catalog_partition_holds", False
            ),
            "manifest-total": lambda manifest, metadata: manifest["counts"].__setitem__(
                "total", 999
            ),
            "manifest-missing-current": lambda manifest, metadata: manifest["counts"].pop(
                "current"
            ),
            "metadata-count": lambda manifest, metadata: metadata["counts"].__setitem__(
                "current", 999
            ),
            "metadata-historical-count": lambda manifest, metadata: metadata["counts"].__setitem__(
                "historical", 1
            ),
            "metadata-absent-count": lambda manifest, metadata: metadata["counts"].__setitem__(
                "absent", 1
            ),
            "manifest-availability-count": lambda manifest, metadata: manifest["counts"].__setitem__(
                "metadata_only", 999
            ),
            "metadata-availability-count": lambda manifest, metadata: metadata["counts"].__setitem__(
                "metadata_only", 999
            ),
            "metadata-hash": lambda manifest, metadata: metadata.__setitem__(
                "dataset_hash", "sha256:inconsistent"
            ),
            "generic-chunk-name": generic_chunk_name,
            "mismatched-content-address": mismatched_content_address,
            "missing-descriptor-id": lambda manifest, metadata: manifest["chunks"][0].pop(
                "id"
            ),
            "duplicate-descriptor-id": duplicate_descriptor_id,
            "current-descriptor-scope": lambda manifest, metadata: manifest["chunks"][0].__setitem__(
                "scope", "HISTORICAL"
            ),
            "unknown-descriptor-type": lambda manifest, metadata: manifest["chunks"][0].__setitem__(
                "object_type", "NOT_A_TRACKED_TYPE"
            ),
            "forged-catalog-revision": forged_catalog_revision,
            "reordered-descriptors": reordered_descriptors,
            "forged-coverage-revision": forged_coverage_revision,
            "impossible-issue-accounting": impossible_issue_accounting,
            "metadata-row-accounting": lambda manifest, metadata: metadata["counts"].__setitem__(
                "issues", 1
            ),
            "metadata-fractional-count": lambda manifest, metadata: metadata["counts"].__setitem__(
                "current", 1.0
            ),
            "metadata-fractional-coverage": lambda manifest, metadata: metadata["coverage"].__setitem__(
                "received", 1.0
            ),
            "false-complete-snapshot": false_complete_snapshot,
            "expected-provider-records": forged_expected_provider_records,
            "fractional-expected-count": fractional_expected_count,
            "unsafe-expected-count": unsafe_expected_count,
            "unsafe-descriptor-count": lambda manifest, metadata: manifest["chunks"][0].__setitem__(
                "count", (1 << 53) + 1
            ),
            "missing-reconciled-at": lambda manifest, metadata: metadata.pop(
                "last_reconciled_at"
            ),
            "invalid-reconciled-at-zero": lambda manifest, metadata: metadata.__setitem__(
                "last_reconciled_at", "0"
            ),
            "invalid-reconciled-at-calendar": lambda manifest, metadata: metadata.__setitem__(
                "last_reconciled_at", "2026-02-31T12:00:00Z"
            ),
            "unverified-complete-metadata": lambda manifest, metadata: metadata.update(
                {
                    "source_status": "PARTIAL",
                    "last_reconciled_catalog_revision": None,
                }
            ),
            "metadata-coverage-revision": lambda manifest, metadata: metadata.__setitem__(
                "coverage_revision", f"sha256:{'0' * 64}"
            ),
        }
        for name, mutate in cases.items():
            with self.subTest(case=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                manifest_path, chunk_path = write_valid_tracked_pointer(root)
                metadata_path = root / "json" / "tracked" / "TRACKED.meta.json"
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                coherent_revision = server._catalog_data_health(root)["data_revision"]
                mutate(manifest, metadata)
                manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
                metadata_path.write_text(json.dumps(metadata), encoding="utf-8")

                health = server._catalog_data_health(root)
                self.assertEqual(health["catalog_state"], "degraded")
                self.assertFalse(health["tracked_revision_match"])
                self.assertIsNone(health["tracked_revision"])
                self.assertIsNone(health["tracked_current_count"])
                self.assertNotEqual(health["data_revision"], coherent_revision)
                self.assertIsNotNone(health["last_error"])

                paths = (
                    "/api/tracked-objects/manifest",
                    "/json//tracked/TRACKED.manifest.json",
                    "/json/tracked//TRACKED.meta.json",
                    f"/json//tracked/chunks/{chunk_path.name}",
                )
                with running_server(root) as port:
                    for method in ("GET", "HEAD"):
                        for path in paths:
                            status, headers, body = request(port, method, path)
                            self.assertEqual(status, 503, (name, method, path))
                            self.assertEqual(
                                headers.get("Content-Type"),
                                "application/problem+json; charset=utf-8",
                            )
                            if method == "GET":
                                self.assertEqual(
                                    json.loads(body)["code"],
                                    "TRACKED_CATALOG_UNAVAILABLE",
                                )
                            else:
                                self.assertEqual(body, b"")

    def test_nonstandard_tracked_control_bytes_fail_closed(self):
        def append_member(path: Path, token: str) -> None:
            source = path.read_text(encoding="utf-8").rstrip()
            path.write_text(
                f'{source[:-1]},"unexpected_number":{token}}}',
                encoding="utf-8",
            )

        def negative_zero(path: Path) -> None:
            source = path.read_text(encoding="utf-8")
            changed = source.replace('"quarantined": 0', '"quarantined": -0', 1)
            self.assertNotEqual(changed, source)
            path.write_text(changed, encoding="utf-8")

        def invalid_utf8(path: Path) -> None:
            path.write_bytes(b'{"unexpected":"\x80"}')

        def utf8_bom(path: Path) -> None:
            path.write_bytes(b"\xef\xbb\xbf" + path.read_bytes())

        def utf16(path: Path) -> None:
            path.write_bytes(path.read_text(encoding="utf-8").encode("utf-16"))

        def string_member(path: Path, value: str) -> None:
            source = path.read_text(encoding="utf-8").rstrip()
            path.write_text(
                f'{source[:-1]},"unexpected_string":"{value}"}}',
                encoding="utf-8",
            )

        def duplicate_member(path: Path) -> None:
            source = path.read_text(encoding="utf-8").rstrip()
            path.write_text(f'{source[:-1]},"counts":{{}}}}', encoding="utf-8")

        cases = (
            ("manifest-nan", "manifest", lambda path: append_member(path, "NaN")),
            ("manifest-infinity", "manifest", lambda path: append_member(path, "Infinity")),
            ("manifest-float", "manifest", lambda path: append_member(path, "1.0")),
            ("manifest-exponent", "manifest", lambda path: append_member(path, "1e400")),
            ("manifest-negative-zero", "manifest", negative_zero),
            ("manifest-invalid-utf8", "manifest", invalid_utf8),
            ("metadata-utf8-bom", "metadata", utf8_bom),
            ("manifest-utf16", "manifest", utf16),
            ("metadata-nan", "metadata", lambda path: append_member(path, "NaN")),
            ("manifest-duplicate-key", "manifest", duplicate_member),
            ("metadata-lone-surrogate", "metadata", lambda path: string_member(path, r"\ud800")),
        )
        for label, target, mutate in cases:
            with self.subTest(case=label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                manifest_path, chunk_path = write_valid_tracked_pointer(root)
                metadata_path = root / "json" / "tracked" / "TRACKED.meta.json"
                mutate(manifest_path if target == "manifest" else metadata_path)

                health = server._catalog_data_health(root)
                self.assertEqual(health["catalog_state"], "degraded")
                self.assertIsNone(server._load_coherent_tracked_catalog_snapshot(root))
                with running_server(root) as port:
                    for method in ("GET", "HEAD"):
                        for request_path in (
                            "/api/tracked-objects/manifest",
                            "/json/tracked/TRACKED.meta.json",
                            f"/api/tracked-objects/chunks/{chunk_path.name}",
                        ):
                            status, headers, body = request(port, method, request_path)
                            self.assertEqual(status, 503, (label, method, request_path))
                            self.assertEqual(
                                headers.get("Content-Type"),
                                "application/problem+json; charset=utf-8",
                            )
                            if method == "GET":
                                self.assertEqual(
                                    json.loads(body)["code"],
                                    "TRACKED_CATALOG_UNAVAILABLE",
                                )
                            else:
                                self.assertEqual(body, b"")

    def test_nonstandard_tracked_chunk_bytes_fail_closed(self):
        def appended(source: bytes, member: bytes) -> bytes:
            return source.rstrip()[:-1] + b"," + member + b"}"

        cases = (
            ("nan", lambda source: appended(source, b'"unexpected":NaN')),
            ("infinity", lambda source: appended(source, b'"unexpected":Infinity')),
            ("numeric-overflow", lambda source: appended(source, b'"unexpected":1e400')),
            ("duplicate-key", lambda source: appended(source, b'"records":[]')),
            ("invalid-utf8", lambda source: appended(source, b'"unexpected":"\x80"')),
            ("utf8-bom", lambda source: b"\xef\xbb\xbf" + source),
            ("utf16", lambda source: source.decode("utf-8").encode("utf-16")),
            ("lone-surrogate", lambda source: appended(source, br'"unexpected":"\ud800"')),
        )
        for label, rewrite in cases:
            with self.subTest(case=label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                manifest_path, chunk_path = write_valid_tracked_pointer(root)
                metadata_path = root / "json" / "tracked" / "TRACKED.meta.json"
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                body = rewrite(chunk_path.read_bytes())
                digest = hashlib.sha256(body).hexdigest()
                replacement = chunk_path.with_name(
                    f"{digest}-{chunk_path.name.split('-', 1)[1]}"
                )
                replacement.write_bytes(body)
                descriptor = manifest["chunks"][0]
                descriptor.update({
                    "path": replacement.relative_to(root).as_posix(),
                    "sha256": f"sha256:{digest}",
                    "bytes": len(body),
                })
                revision = tracked_catalog_revision(
                    manifest["chunks"],
                    manifest["history_chunks"],
                    manifest["coverage_revision"],
                )
                manifest["catalog_revision"] = revision
                metadata.update({
                    "catalog_revision": revision,
                    "dataset_hash": revision,
                    "last_reconciled_catalog_revision": revision,
                })
                manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
                metadata_path.write_text(json.dumps(metadata), encoding="utf-8")

                self.assertEqual(server._catalog_data_health(root)["catalog_state"], "degraded")
                with running_server(root) as port:
                    for method in ("GET", "HEAD"):
                        for request_path in (
                            "/api/tracked-objects/manifest",
                            f"/api/tracked-objects/chunks/{replacement.name}",
                        ):
                            status, _, response_body = request(port, method, request_path)
                            self.assertEqual(status, 503, (label, method, request_path))
                            if method == "GET":
                                self.assertEqual(
                                    json.loads(response_body)["code"],
                                    "TRACKED_CATALOG_UNAVAILABLE",
                                )
                            else:
                                self.assertEqual(response_body, b"")

    def test_rehashed_tracked_record_contract_forgery_fails_closed(self):
        def duplicate_record(manifest, metadata, payload):
            payload["records"].append(dict(payload["records"][0]))
            for target in (manifest["counts"], metadata["counts"]):
                target["current"] += 1
                target["total"] += 1
                target["metadata_only"] += 1
                target["current_metadata_only"] += 1
                target["object_types"]["DEBRIS"] += 1
                target["current_object_types"]["DEBRIS"] += 1

        def availability_drift(manifest, metadata, _payload):
            for target in (manifest["counts"], metadata["counts"]):
                target["propagatable"] += 1
                target["metadata_only"] -= 1
                target["current_propagatable"] += 1
                target["current_metadata_only"] -= 1

        def boolean_type_count(manifest, metadata, _payload):
            for target in (manifest["counts"], metadata["counts"]):
                target["object_types"]["PAYLOAD"] = False
                target["current_object_types"]["PAYLOAD"] = False

        cases = (
            ("boolean-id", lambda _m, _d, p: p["records"][0].__setitem__("norad_id", True)),
            ("object-id", lambda _m, _d, p: p["records"][0].__setitem__("norad_id", {"id": "100001"})),
            ("leading-zero-id", lambda _m, _d, p: p["records"][0].__setitem__("norad_id", "0100001")),
            ("duplicate-id", duplicate_record),
            ("lifecycle-scope", lambda _m, _d, p: p["records"][0].__setitem__("lifecycle_status", "DECAYED")),
            ("observation-scope", lambda _m, _d, p: p["records"][0].__setitem__("observation_status", "ABSENT")),
            ("non-string-date", lambda _m, _d, p: p["records"][0].__setitem__("decay_date", [])),
            ("invalid-date", lambda _m, _d, p: p["records"][0].__setitem__("decay_date", "2026-02-31")),
            (
                "historical-current-elements",
                lambda _m, _d, p: p["records"][0].update({
                    "lifecycle_status": "DECAYED",
                    "decay_date": "2026-01-01",
                    "has_current_elements": True,
                    "metadata_only": False,
                }),
            ),
            ("availability-count", availability_drift),
            ("boolean-object-type-count", boolean_type_count),
        )
        for label, mutate in cases:
            with self.subTest(case=label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                manifest_path, chunk_path = write_valid_tracked_pointer(root)
                metadata_path = root / "json" / "tracked" / "TRACKED.meta.json"
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                payload = json.loads(chunk_path.read_text(encoding="utf-8"))
                mutate(manifest, metadata, payload)
                body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
                digest = hashlib.sha256(body).hexdigest()
                suffix = chunk_path.name[64:]
                replacement = chunk_path.with_name(f"{digest}{suffix}")
                replacement.write_bytes(body)
                descriptor = manifest["chunks"][0]
                descriptor.update({
                    "path": replacement.relative_to(root).as_posix(),
                    "sha256": f"sha256:{digest}",
                    "bytes": len(body),
                    "count": len(payload["records"]),
                })
                revision = tracked_catalog_revision(
                    manifest["chunks"],
                    manifest["history_chunks"],
                    manifest["coverage_revision"],
                )
                manifest["catalog_revision"] = revision
                metadata["catalog_revision"] = revision
                metadata["dataset_hash"] = revision
                metadata["last_reconciled_catalog_revision"] = revision
                manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
                metadata_path.write_text(json.dumps(metadata), encoding="utf-8")

                self.assertEqual(server._catalog_data_health(root)["catalog_state"], "degraded")
                with running_server(root) as port:
                    for method in ("GET", "HEAD"):
                        for request_path in (
                            "/api/tracked-objects/manifest",
                            f"/api/tracked-objects/chunks/{replacement.name}",
                        ):
                            status, _, response_body = request(port, method, request_path)
                            self.assertEqual(status, 503, (label, method, request_path))
                            if method == "GET":
                                self.assertEqual(
                                    json.loads(response_body)["code"],
                                    "TRACKED_CATALOG_UNAVAILABLE",
                                )
                            else:
                                self.assertEqual(response_body, b"")

    def test_manifest_response_uses_the_exact_validated_snapshot(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest_path, _ = write_valid_tracked_pointer(root)
            expected_body = manifest_path.read_bytes()
            original_loader = server._load_coherent_tracked_catalog_snapshot
            swapped = False

            def load_then_swap(request_root):
                nonlocal swapped
                snapshot = original_loader(request_root)
                if snapshot is not None and not swapped:
                    replacement = json.loads(manifest_path.read_text(encoding="utf-8"))
                    replacement["catalog_revision"] = "sha256:replacement"
                    manifest_path.write_text(json.dumps(replacement), encoding="utf-8")
                    swapped = True
                return snapshot

            with mock.patch.object(
                server,
                "_load_coherent_tracked_catalog_snapshot",
                side_effect=load_then_swap,
            ), running_server(root) as port:
                status, _, body = request(port, "GET", "/api/tracked-objects/manifest")

            self.assertEqual(status, 200)
            self.assertEqual(body, expected_body)
            self.assertNotEqual(body, manifest_path.read_bytes())

    def test_historical_chunk_scope_is_verified_and_served(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = {
                "schema_version": "2.3.0",
                "scope": "HISTORICAL",
                "object_type": "DEBRIS",
                "records": [
                    {
                        "norad_id": "100002",
                        "object_type": "DEBRIS",
                        "lifecycle_status": "DECAYED",
                        "observation_status": "OBSERVED",
                        "catalog_membership_status": "PRESENT",
                        "decay_date": "2025-01-01",
                        "has_current_elements": False,
                        "metadata_only": True,
                    },
                    {
                        "norad_id": "100003",
                        "object_type": "DEBRIS",
                        "lifecycle_status": "ABSENT",
                        "observation_status": "ABSENT",
                        "catalog_membership_status": "ABSENT",
                        "decay_date": None,
                        "has_current_elements": False,
                        "metadata_only": True,
                    }
                ],
            }
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            digest = hashlib.sha256(body).hexdigest()
            filename = f"{digest}-historical-debris.json"
            chunk_path = root / "json" / "tracked" / "chunks" / filename
            chunk_path.parent.mkdir(parents=True)
            chunk_path.write_bytes(body)
            descriptor = {
                "id": "historical-debris",
                "path": f"json/tracked/chunks/{filename}",
                "count": 2,
                "bytes": len(body),
                "sha256": f"sha256:{digest}",
                "scope": "HISTORICAL",
                "object_type": "DEBRIS",
            }
            quarantine_payload = {"schema_version": "2.3.0", "records": []}
            quarantine_body = json.dumps(quarantine_payload, separators=(",", ":")).encode("utf-8")
            quarantine_digest = hashlib.sha256(quarantine_body).hexdigest()
            quarantine_filename = f"{quarantine_digest}-quarantine.json"
            (chunk_path.parent / quarantine_filename).write_bytes(quarantine_body)
            quarantine_descriptor = {
                "path": f"json/tracked/chunks/{quarantine_filename}",
                "count": 0,
                "bytes": len(quarantine_body),
                "sha256": f"sha256:{quarantine_digest}",
            }
            row_accounting = {
                "received": 2,
                "accepted": 2,
                "quarantined": 0,
                "duplicates": 0,
                "issues": 0,
            }
            coverage_revision = tracked_coverage_revision(
                row_accounting,
                2,
                quarantine_descriptor["sha256"],
            )
            manifest_revision = tracked_catalog_revision([], [descriptor], coverage_revision)
            tracked_counts = {
                "expected": 2,
                "expected_provider_records": None,
                **row_accounting,
                "current": 0,
                "historical": 1,
                "absent": 1,
                "history_total": 2,
                "total": 2,
                "propagatable": 0,
                "metadata_only": 2,
                "current_propagatable": 0,
                "current_metadata_only": 0,
                "object_types": {
                    "PAYLOAD": 0,
                    "DEBRIS": 2,
                    "ROCKET_BODY": 0,
                    "MISSION_RELATED": 0,
                    "UNKNOWN": 0,
                },
                "current_object_types": {
                    "PAYLOAD": 0,
                    "DEBRIS": 0,
                    "ROCKET_BODY": 0,
                    "MISSION_RELATED": 0,
                    "UNKNOWN": 0,
                },
            }
            coverage = {
                "expected": 2,
                "expected_provider_records": None,
                "received": 2,
                "accepted": 2,
                "quarantined": 0,
                "duplicates": 0,
                "complete_source_snapshot": True,
                "provider_completeness_claim": False,
                "invariant": "received == accepted + quarantined + duplicates",
                "invariant_holds": True,
                "expected_matches_received": True,
            }
            (root / "json" / "tracked" / "TRACKED.manifest.json").write_text(
                json.dumps(
                    {
                        "schema_version": "2.3.0",
                        "catalog_revision": manifest_revision,
                        "coverage_revision": coverage_revision,
                        "provider_completeness_claim": False,
                        "counts": tracked_counts,
                        "coverage": coverage,
                        "invariants": {
                            "provider_coverage_holds": True,
                            "catalog_partition_holds": True,
                            "current_chunk_count_holds": True,
                            "history_chunk_count_holds": True,
                        },
                        "provenance": {
                            "gp_revision": GP_FIXTURE_REVISION,
                            "gp_source_groups": ["active"],
                            "satcat_revision": SATCAT_FIXTURE_REVISION,
                        },
                        "chunks": [],
                        "history_chunks": [descriptor],
                        "quarantine": quarantine_descriptor,
                    }
                ),
                encoding="utf-8",
            )
            (root / "json" / "tracked" / "TRACKED.meta.json").write_text(
                json.dumps({
                    "catalog_revision": manifest_revision,
                    "dataset_hash": manifest_revision,
                    "coverage_revision": coverage_revision,
                    "coverage": coverage,
                    "source_status": "VERIFIED_SNAPSHOT",
                    "last_reconciled_at": "2026-09-01T12:00:00Z",
                    "last_reconciled_catalog_revision": manifest_revision,
                    "source_gp_revision": GP_FIXTURE_REVISION,
                    "source_gp_groups": ["active"],
                    "source_satcat_revision": SATCAT_FIXTURE_REVISION,
                    "counts": tracked_counts,
                    "last_status": "ok",
                }),
                encoding="utf-8",
            )
            gp_root = root / "json" / "gp"
            gp_root.mkdir(parents=True)
            (gp_root / "GP.json").write_bytes(GP_FIXTURE_BYTES)
            (gp_root / "GP.meta.json").write_text(
                json.dumps({
                    "catalog_revision": GP_FIXTURE_REVISION,
                    "dataset_hash": GP_FIXTURE_REVISION,
                    "catalog_source_groups": ["active"],
                    "last_status": "ok",
                }),
                encoding="utf-8",
            )
            (root / "json" / "satcat.csv").write_bytes(SATCAT_FIXTURE_BYTES)
            (root / "json" / "satcat.meta.json").write_text(
                json.dumps({
                    "catalog_revision": SATCAT_FIXTURE_REVISION,
                    "dataset_hash": SATCAT_FIXTURE_REVISION,
                    "last_status": "ok",
                }),
                encoding="utf-8",
            )
            with running_server(root) as port:
                status, _, served = request(
                    port,
                    "GET",
                    f"/api/tracked-objects/chunks/{filename}",
                )
            self.assertEqual(status, 200)
            self.assertEqual(served, body)

    def test_static_policy_openapi_and_health_include_tracked_catalog(self):
        self.assertTrue(server.static_request_is_exposed("/json/tracked/TRACKED.manifest.json"))
        self.assertFalse(
            server.static_request_is_exposed(
                "/json/tracked/chunks/0123456789abcdef-current-debris.json"
            )
        )
        self.assertFalse(server.static_request_is_exposed("/json/tracked/TRACKED.quarantine.json"))
        self.assertIn("/api/tracked-objects", server._openapi_document("127.0.0.1")["paths"])
        self.assertIn(
            "/api/tracked-objects/manifest",
            server._openapi_document("127.0.0.1")["paths"],
        )
        openapi_paths = server._openapi_document("127.0.0.1")["paths"]
        for path in (
            "/api/tracked-objects",
            "/api/tracked-objects/manifest",
            "/api/tracked-objects/chunks/{file_name}",
        ):
            self.assertIn("503", openapi_paths[path]["get"]["responses"])

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            gp_path = root / "json" / "gp" / "GP.json"
            gp_path.parent.mkdir(parents=True)
            gp_path.write_bytes(GP_FIXTURE_BYTES)
            (gp_path.parent / "GP.meta.json").write_text(
                json.dumps({
                    "catalog_revision": GP_FIXTURE_REVISION,
                    "dataset_hash": GP_FIXTURE_REVISION,
                    "last_status": "ok",
                    "catalog_source_groups": ["active"],
                }),
                encoding="utf-8",
            )
            write_valid_tracked_pointer(
                root,
                metadata_revision=f"sha256:{'0' * 64}",
            )
            health = server._catalog_data_health(root)
            self.assertIsNone(health["tracked_revision"])
            self.assertFalse(health["tracked_revision_match"])
            self.assertTrue(health["tracked_pointer_valid"])
            self.assertIsNone(health["tracked_current_count"])
            self.assertIsNone(health["tracked_current_metadata_only_count"])
            self.assertEqual(health["datasets"]["tracked"]["last_status"], "ok")
            self.assertEqual(health["catalog_state"], "degraded")
            self.assertIn("revisions are inconsistent", health["last_error"])

    def test_health_validates_pointer_closure_and_current_source_lineage(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            gp_root = root / "json" / "gp"
            gp_root.mkdir(parents=True)
            (gp_root / "GP.json").write_bytes(GP_FIXTURE_BYTES)
            (gp_root / "GP.meta.json").write_text(
                json.dumps({
                    "catalog_revision": GP_FIXTURE_REVISION,
                    "dataset_hash": GP_FIXTURE_REVISION,
                    "last_status": "ok",
                    "catalog_source_groups": ["active"],
                }),
                encoding="utf-8",
            )
            manifest_path, chunk_path = write_valid_tracked_pointer(root)

            current = server._catalog_data_health(root)
            self.assertEqual(current["catalog_state"], "current")
            self.assertTrue(current["tracked_pointer_valid"])
            self.assertTrue(current["tracked_source_revision_match"])
            self.assertEqual(current["tracked_current_count"], 1)

            chunk_body = chunk_path.read_bytes()
            chunk_path.unlink()
            missing = server._catalog_data_health(root)
            self.assertEqual(missing["catalog_state"], "degraded")
            self.assertFalse(missing["tracked_pointer_valid"])
            self.assertIsNone(missing["tracked_revision"])
            self.assertIsNone(missing["tracked_current_count"])
            self.assertIn("chunk validation failed", missing["last_error"])

            chunk_path.write_bytes(chunk_body)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["provenance"]["gp_revision"] = "sha256:stale"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            stale = server._catalog_data_health(root)
            self.assertEqual(stale["catalog_state"], "degraded")
            self.assertTrue(stale["tracked_pointer_valid"])
            self.assertFalse(stale["tracked_source_revision_match"])
            self.assertIsNone(stale["tracked_revision"])
            self.assertIsNone(stale["tracked_current_count"])
            self.assertIn("GP provenance is stale", stale["last_error"])

            manifest["provenance"]["gp_revision"] = GP_FIXTURE_REVISION
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            tracked_meta_path = root / "json" / "tracked" / "TRACKED.meta.json"
            tracked_meta = json.loads(tracked_meta_path.read_text(encoding="utf-8"))
            tracked_meta["source_gp_revision"] = "sha256:stale"
            tracked_meta_path.write_text(json.dumps(tracked_meta), encoding="utf-8")
            stale_metadata = server._catalog_data_health(root)
            self.assertEqual(stale_metadata["catalog_state"], "degraded")
            self.assertTrue(stale_metadata["tracked_pointer_valid"])
            self.assertFalse(stale_metadata["tracked_source_revision_match"])
            self.assertIn("Tracked metadata GP lineage is stale", stale_metadata["last_error"])

            tracked_meta["source_gp_revision"] = GP_FIXTURE_REVISION
            tracked_meta["source_gp_groups"] = ["unrelated-group"]
            tracked_meta_path.write_text(json.dumps(tracked_meta), encoding="utf-8")
            stale_groups = server._catalog_data_health(root)
            self.assertEqual(stale_groups["catalog_state"], "degraded")
            self.assertFalse(stale_groups["tracked_source_revision_match"])
            self.assertIn("GP source-group lineage is stale", stale_groups["last_error"])

    def test_health_degrades_when_declared_satcat_metadata_is_missing_or_corrupt(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            gp_root = root / "json" / "gp"
            gp_root.mkdir(parents=True)
            (gp_root / "GP.json").write_bytes(GP_FIXTURE_BYTES)
            (gp_root / "GP.meta.json").write_text(
                json.dumps({
                    "catalog_revision": GP_FIXTURE_REVISION,
                    "dataset_hash": GP_FIXTURE_REVISION,
                    "last_status": "ok",
                    "catalog_source_groups": ["active"],
                }),
                encoding="utf-8",
            )
            satcat_meta_path = root / "json" / "satcat.meta.json"
            satcat_meta_path.write_text(
                json.dumps({
                    "catalog_revision": SATCAT_FIXTURE_REVISION,
                    "dataset_hash": SATCAT_FIXTURE_REVISION,
                    "last_status": "ok",
                }),
                encoding="utf-8",
            )
            (root / "json" / "satcat.csv").write_bytes(SATCAT_FIXTURE_BYTES)
            write_valid_tracked_pointer(root, satcat_revision=SATCAT_FIXTURE_REVISION)
            self.assertEqual(server._catalog_data_health(root)["catalog_state"], "current")

            satcat_meta_path.unlink()
            missing = server._catalog_data_health(root)
            self.assertEqual(missing["catalog_state"], "degraded")
            self.assertFalse(missing["tracked_source_revision_match"])
            self.assertIn("SATCAT metadata revision is unavailable", missing["last_error"])

            satcat_meta_path.write_text("{invalid", encoding="utf-8")
            corrupt = server._catalog_data_health(root)
            self.assertEqual(corrupt["catalog_state"], "degraded")
            self.assertFalse(corrupt["tracked_source_revision_match"])
            self.assertIn("SATCAT metadata revision is unavailable", corrupt["last_error"])

    def test_tracked_chunk_symlink_cannot_escape_repository_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            temporary_root = Path(temporary)
            root = temporary_root / "repository"
            _, chunk_path = write_valid_tracked_pointer(root)
            body = chunk_path.read_bytes()
            filename = chunk_path.name
            outside = temporary_root / "outside"
            outside.mkdir()
            (outside / filename).write_bytes(body)
            chunk_directory = chunk_path.parent
            for candidate in chunk_directory.iterdir():
                candidate.unlink()
            chunk_directory.rmdir()
            try:
                chunk_directory.symlink_to(outside, target_is_directory=True)
            except OSError as exc:
                self.skipTest(f"Directory symlinks are unavailable: {exc}")

            self.assertIsNone(server._verified_tracked_chunk(filename, root))
            with running_server(root) as port:
                status, _, body = request(
                    port,
                    "GET",
                    f"/api/tracked-objects/chunks/{filename}",
                )
            self.assertEqual(status, 503)
            self.assertEqual(json.loads(body)["code"], "TRACKED_CATALOG_UNAVAILABLE")

    def test_health_degrades_missing_invalid_or_one_sided_tracked_pointer(self):
        cases = (
            ("metadata-only", True, None),
            ("invalid-manifest", True, "{invalid"),
            (
                "manifest-only",
                False,
                json.dumps(
                    {
                        "catalog_revision": "sha256:manifest",
                        "counts": {"current": 3},
                        "chunks": [],
                        "history_chunks": [],
                        "quarantine": {},
                    }
                ),
            ),
        )
        for name, write_meta, manifest_text in cases:
            with self.subTest(case=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                gp_path = root / "json" / "gp" / "GP.json"
                gp_path.parent.mkdir(parents=True)
                gp_path.write_bytes(GP_FIXTURE_BYTES)
                (gp_path.parent / "GP.meta.json").write_text(
                    json.dumps({
                        "catalog_revision": GP_FIXTURE_REVISION,
                        "dataset_hash": GP_FIXTURE_REVISION,
                        "last_status": "ok",
                    }),
                    encoding="utf-8",
                )
                tracked_root = root / "json" / "tracked"
                tracked_root.mkdir(parents=True)
                if write_meta:
                    (tracked_root / "TRACKED.meta.json").write_text(
                        json.dumps(
                            {
                                "catalog_revision": "sha256:tracked",
                                "last_status": "ok",
                                "counts": {"current": 99},
                            }
                        ),
                        encoding="utf-8",
                    )
                if manifest_text is not None:
                    (tracked_root / "TRACKED.manifest.json").write_text(
                        manifest_text,
                        encoding="utf-8",
                    )

                health = server._catalog_data_health(root)
                self.assertEqual(health["catalog_state"], "degraded")
                self.assertFalse(health["tracked_revision_match"])
                self.assertIsNotNone(health["last_error"])
                if name != "manifest-only":
                    self.assertIsNone(health["tracked_revision"])
                    self.assertIsNone(health["tracked_current_count"])


if __name__ == "__main__":
    unittest.main()
