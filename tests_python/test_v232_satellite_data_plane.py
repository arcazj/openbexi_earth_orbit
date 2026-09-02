from __future__ import annotations

import contextlib
import datetime as dt
import hashlib
import http.client
import io
import json
import shutil
import stat
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

import server
from tools import satellite_data_plane as data_plane
from tools import satellite_data_tools as data_tools


NOW = dt.datetime(2026, 9, 1, 12, 0, tzinfo=dt.timezone.utc)
SATCAT = (
    "OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,OBJECT_TYPE,OPS_STATUS_CODE,OWNER,"
    "LAUNCH_DATE,LAUNCH_SITE,DECAY_DATE,PERIOD,INCLINATION,APOGEE,PERIGEE,"
    "RCS,DATA_STATUS_CODE,ORBIT_CENTER,ORBIT_TYPE\n"
    "TEST OBJECT,2026-001A,100001,PAY,+,US,2026-01-01,AFETR,,92,51,500,490,0.2,,EA,ORB\n"
)


def write_json(path: Path, payload: object, *, indent: int | None = None) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(
        payload,
        ensure_ascii=False,
        allow_nan=False,
        indent=indent,
        separators=None if indent else (",", ":"),
    )
    if indent is not None:
        text += "\n"
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def seed_revision_pair(root: Path, data_path: Path, metadata_path: Path, payload: object) -> None:
    revision = write_json(root / data_path, payload)
    write_json(
        root / metadata_path,
        {
            "last_status": "ok",
            "last_success_at": data_tools.isoformat_utc(NOW),
            "catalog_revision": revision,
            "dataset_hash": revision,
        },
        indent=2,
    )


def seed_repository(root: Path) -> None:
    seed_revision_pair(root, data_tools.GP_RELATIVE_PATH, data_tools.GP_META_RELATIVE_PATH, [])
    gp_meta_path = root / data_tools.GP_META_RELATIVE_PATH
    gp_meta = json.loads(gp_meta_path.read_text(encoding="utf-8"))
    gp_meta.update({
        "catalog_source_groups": ["active"],
        "source_groups": list(data_tools.GP_SOURCE_GROUPS),
        "source_scope_verified": False,
        "source_scope": {"all_debris": False},
        "provider_completeness_claim": False,
    })
    write_json(gp_meta_path, gp_meta, indent=2)

    seed_revision_pair(root, data_tools.TLE_RELATIVE_PATH, data_tools.TLE_META_RELATIVE_PATH, [])
    seed_revision_pair(root, data_tools.LAUNCHES_RELATIVE_PATH, data_tools.LAUNCHES_META_RELATIVE_PATH, [])
    seed_revision_pair(root, data_tools.DECAYED_RELATIVE_PATH, data_tools.DECAYED_META_RELATIVE_PATH, {})

    satcat_path = root / data_tools.SATCAT_RELATIVE_PATH
    satcat_path.parent.mkdir(parents=True, exist_ok=True)
    with satcat_path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(SATCAT)
    satcat_revision = "sha256:" + hashlib.sha256(SATCAT.encode("utf-8")).hexdigest()
    write_json(
        root / data_tools.SATCAT_META_RELATIVE_PATH,
        {
            "source_url": data_tools.CELESTRAK_SATCAT_CSV_URL,
            "last_status": "ok",
            "last_success_at": data_tools.isoformat_utc(NOW),
            "last_reconciled_at": data_tools.isoformat_utc(NOW),
            "last_reconciled_catalog_revision": satcat_revision,
            "catalog_revision": satcat_revision,
            "dataset_hash": satcat_revision,
            "counts": {"records": 1},
        },
        indent=2,
    )
    result = data_tools.build_tracked_catalog(root=root, mode=data_tools.RECONCILIATION_MODE, now=NOW)
    if result.errors:
        raise AssertionError(result.errors)
    data_plane.validate_data_root(root)


def inventory(root: Path) -> dict[str, str]:
    return {
        item["path"]: item["sha256"]
        for item in data_plane.validate_data_root(root)["artifacts"]
    }


def changed_launch_updater(value: str):
    def update(*, root: Path, **_kwargs):
        path = Path(root) / data_tools.LAUNCHES_RELATIVE_PATH
        payload = [{"candidate": value}]
        data_tools.atomic_write_json(path, payload, backup=True)
        revision = "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()
        metadata_path = Path(root) / data_tools.LAUNCHES_META_RELATIVE_PATH
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata.update({"catalog_revision": revision, "dataset_hash": revision, "last_status": "ok"})
        data_tools.atomic_write_json(metadata_path, metadata, backup=False, indent=2)
        return {
            "skipped": False,
            "degraded": False,
            "launches": {"changed": True, "skipped": False, "errors": []},
        }

    return update


@contextlib.contextmanager
def running_server(
    root: Path,
    plane: data_plane.SatelliteDataPlane,
    *,
    coordinator: server.DataSelectionCoordinator | None = None,
    v21_router=None,
):
    with mock.patch.object(server, "ROOT", root):
        httpd = server.ThreadingHTTPServer(
            ("127.0.0.1", 0),
            server.make_handler(
                serve_static=True,
                v21_router=v21_router,
                data_root_resolver=coordinator.resolve if coordinator else plane.current_root,
            ),
        )
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            yield httpd.server_address[1]
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=2)


def request(port: int, path: str) -> tuple[int, bytes]:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        connection.request("GET", path)
        response = connection.getresponse()
        return response.status, response.read()
    finally:
        connection.close()


class SatelliteDataPlaneTests(unittest.TestCase):
    def test_cli_import_validate_and_promote_are_explicit_and_network_free(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            output = io.StringIO()
            with (
                mock.patch.object(data_tools, "fetch_url", side_effect=AssertionError("network used")),
                contextlib.redirect_stdout(output),
            ):
                self.assertEqual(
                    data_tools.main([
                        "--root",
                        str(root),
                        "import-candidate",
                        "--data-plane-dir",
                        "runtime/data-plane",
                    ]),
                    0,
                )
            imported = json.loads(output.getvalue())
            self.assertEqual(imported["candidate_state"], "validated")
            self.assertFalse(imported["network_used"])

            for command in ("validate-candidate", "promote-candidate"):
                output = io.StringIO()
                with (
                    mock.patch.object(data_tools, "fetch_url", side_effect=AssertionError("network used")),
                    contextlib.redirect_stdout(output),
                ):
                    self.assertEqual(
                        data_tools.main([
                            "--root",
                            str(root),
                            command,
                            imported["candidate_id"],
                            "--data-plane-dir",
                            "runtime/data-plane",
                        ]),
                        0,
                    )
                self.assertTrue(json.loads(output.getvalue()))

            plane = data_plane.SatelliteDataPlane(
                repository_root=root,
                state_root=root / "runtime" / "data-plane",
            )
            self.assertEqual(plane.pointer()["candidate_id"], imported["candidate_id"])

    def test_import_preserves_malformed_local_closure_without_network_or_promotion(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            malformed = b"is it a professional{\n"
            (root / data_tools.TLE_META_RELATIVE_PATH).write_bytes(malformed)
            plane = data_plane.SatelliteDataPlane(
                repository_root=root,
                state_root=root / "runtime" / "data-plane",
            )

            result = plane.import_candidate(now=NOW)

            self.assertEqual(result["candidate_state"], "quarantined")
            self.assertFalse(result["valid"])
            self.assertFalse(result["network_used"])
            self.assertFalse(result["promoted"])
            self.assertIn("Invalid JSON at json/tle/TLE.meta.json", result["validation_error"])
            candidate_root = plane.candidate_root(result["candidate_id"])
            self.assertEqual((candidate_root / data_tools.TLE_META_RELATIVE_PATH).read_bytes(), malformed)
            metadata = json.loads(
                (candidate_root / data_plane.CANDIDATE_METADATA_NAME).read_text(encoding="utf-8")
            )
            self.assertEqual(metadata["state"], "quarantined")
            self.assertEqual(metadata["refresh"]["mode"], "import")
            self.assertFalse(metadata["refresh"]["network_used"])
            self.assertTrue(metadata["retention"]["pinned"])
            self.assertEqual(metadata["import_inventory"]["candidate_revision"], result["candidate_revision"])
            self.assertIsNone(plane.pointer())
            with self.assertRaisesRegex(data_plane.DataPlaneError, "Invalid JSON"):
                plane.promote_candidate(result["candidate_id"])

    def test_not_due_preflight_and_dry_run_promotion_create_no_candidate(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            plane = data_plane.SatelliteDataPlane(
                repository_root=root,
                state_root=root / "runtime" / "data-plane",
            )
            not_due = {
                "intervals_hours": {
                    "gp": 24,
                    "tle": 24,
                    "satcat": 24,
                    "tracked": 24,
                    "launches": 24,
                    "decayed": 24,
                    "reconciliation": 24,
                },
                "due": {
                    "gp": False,
                    "tle": False,
                    "satcat": False,
                    "tracked": False,
                    "launches": False,
                    "decayed": False,
                },
                "reconciliation": {
                    "gp": False,
                    "tle": False,
                    "satcat": False,
                    "tracked": False,
                    "launches": False,
                    "decayed": False,
                },
                "any_due": False,
            }

            with mock.patch.object(data_tools, "scheduled_data_update_plan", return_value=not_due):
                result = plane.stage_update(promote=True, now=NOW)

            self.assertTrue(result["skipped"])
            self.assertEqual(result["candidate_state"], "not-created")
            self.assertFalse((plane.state_root / "candidates").exists())
            with self.assertRaisesRegex(data_plane.DataPlaneError, "dry-run"):
                plane.stage_update(promote=True, dry_run=True, now=NOW)
            self.assertFalse((plane.state_root / "candidates").exists())

    def test_persistent_os_lock_rejects_concurrent_stale_takeover(self):
        with tempfile.TemporaryDirectory() as temporary:
            state_root = Path(temporary)
            lock_path = state_root / data_plane.DATA_PLANE_LOCK_NAME
            lock_path.write_text("12345 2020-01-01T00:00:00Z\n", encoding="utf-8")
            entered = threading.Event()
            release = threading.Event()
            holder_errors = []

            def hold_lock():
                try:
                    with data_plane._data_plane_lock(state_root):
                        entered.set()
                        if not release.wait(timeout=5):
                            raise AssertionError("test did not release the held data-plane lock")
                except BaseException as exc:
                    holder_errors.append(exc)

            holder = threading.Thread(target=hold_lock)
            holder.start()
            self.assertTrue(entered.wait(timeout=2))
            first_identity = (lock_path.stat().st_dev, lock_path.stat().st_ino)
            try:
                with self.assertRaisesRegex(data_plane.DataPlaneError, "already running"):
                    with data_plane._data_plane_lock(state_root):
                        self.fail("a concurrent contender acquired the data-plane lock")
                self.assertTrue(lock_path.is_file())
                self.assertEqual((lock_path.stat().st_dev, lock_path.stat().st_ino), first_identity)
            finally:
                release.set()
                holder.join(timeout=2)

            self.assertFalse(holder.is_alive())
            self.assertEqual(holder_errors, [])
            with data_plane._data_plane_lock(state_root):
                self.assertTrue(lock_path.is_file())
            self.assertEqual((lock_path.stat().st_dev, lock_path.stat().st_ino), first_identity)

    def test_staged_refresh_promotes_private_candidate_without_mutating_release(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            release_inventory = inventory(root)
            plane = data_plane.SatelliteDataPlane(
                repository_root=root,
                state_root=root / "runtime" / "data-plane",
            )

            result = plane.stage_update(
                updater=changed_launch_updater("first"),
                promote=True,
                now=NOW,
            )

            self.assertTrue(result["promoted"])
            self.assertRegex(result["candidate_id"], data_plane.CANDIDATE_ID_PATTERN)
            self.assertNotEqual(plane.current_root(), root)
            self.assertEqual(inventory(root), release_inventory)
            self.assertEqual(
                json.loads((plane.current_root() / data_tools.LAUNCHES_RELATIVE_PATH).read_text(encoding="utf-8")),
                [{"candidate": "first"}],
            )
            pointer = plane.pointer()
            self.assertEqual(pointer["candidate_revision"], result["candidate_revision"])
            self.assertEqual(pointer["provenance"]["kind"], "validated-private-candidate")

    def test_metadata_only_reconciliation_revision_is_promoted(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            plane = data_plane.SatelliteDataPlane(
                repository_root=root,
                state_root=root / "runtime" / "data-plane",
            )

            def metadata_only_update(*, root: Path, **_kwargs):
                metadata_path = Path(root) / data_tools.LAUNCHES_META_RELATIVE_PATH
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                metadata["last_reconciled_at"] = data_tools.isoformat_utc(NOW)
                data_tools.atomic_write_json(metadata_path, metadata, backup=False, indent=2)
                return {
                    "skipped": False,
                    "degraded": False,
                    "launches": {"changed": False, "skipped": False, "errors": []},
                    "reconciliation": {"changed": False, "skipped": False, "errors": []},
                }

            result = plane.stage_update(
                updater=metadata_only_update,
                promote=True,
                now=NOW,
            )

            self.assertTrue(result["candidate_changed"])
            self.assertTrue(result["promoted"])
            self.assertEqual(
                json.loads(
                    (plane.current_root() / data_tools.LAUNCHES_META_RELATIVE_PATH).read_text(encoding="utf-8")
                )["last_reconciled_at"],
                data_tools.isoformat_utc(NOW),
            )

    def test_promotion_rejects_tracked_descriptor_contract_drift(self):
        def rebind_revisions(manifest, metadata):
            row_accounting = {
                key: manifest["counts"][key]
                for key in ("received", "accepted", "quarantined", "duplicates", "issues")
            }
            coverage_revision = data_tools.catalog_revision_for_payload(
                {
                    "row_accounting": row_accounting,
                    "expected": manifest["counts"]["expected"],
                    "quarantine_sha256": manifest["quarantine"]["sha256"],
                }
            )
            catalog_revision = data_tools.catalog_revision_for_payload(
                {
                    "chunks": [
                        {"path": item["path"], "sha256": item["sha256"]}
                        for item in [*manifest["chunks"], *manifest["history_chunks"]]
                    ],
                    "coverage_revision": coverage_revision,
                }
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

        def wrong_schema(manifest, _metadata):
            manifest["schema_version"] = "2.2.0"

        def non_object_descriptor(manifest, _metadata):
            manifest["chunks"].append("invalid")

        def duplicate_descriptor(manifest, _metadata):
            manifest["chunks"].append(dict(manifest["chunks"][0]))

        def generic_chunk_name(manifest, _metadata):
            manifest["chunks"][0]["path"] = "json/tracked/chunks/current-payload.json"

        def mismatched_content_address(manifest, _metadata):
            manifest["chunks"][0]["path"] = (
                f"json/tracked/chunks/{'0' * 64}-current-payload.json"
            )

        def forged_catalog_revision(manifest, metadata):
            forged = f"sha256:{'0' * 64}"
            manifest["catalog_revision"] = forged
            metadata["catalog_revision"] = forged
            metadata["dataset_hash"] = forged

        def reordered_descriptors(manifest, _metadata):
            manifest["chunks"][0], manifest["chunks"][1] = (
                manifest["chunks"][1],
                manifest["chunks"][0],
            )

        def forged_coverage_revision(manifest, metadata):
            forged_coverage = f"sha256:{'0' * 64}"
            forged_catalog = data_tools.catalog_revision_for_payload(
                {
                    "chunks": [
                        {"path": item["path"], "sha256": item["sha256"]}
                        for item in [*manifest["chunks"], *manifest["history_chunks"]]
                    ],
                    "coverage_revision": forged_coverage,
                }
            )
            manifest["coverage_revision"] = forged_coverage
            manifest["catalog_revision"] = forged_catalog
            metadata["coverage_revision"] = forged_coverage
            metadata["catalog_revision"] = forged_catalog
            metadata["dataset_hash"] = forged_catalog

        def aggregate_count_drift(manifest, metadata):
            for payload in (manifest, metadata):
                counts = payload["counts"]
                counts["current"] += 1
                counts["total"] += 1
                counts["metadata_only"] += 1
                counts["current_metadata_only"] += 1

        cases = (
            ("schema", wrong_schema, "Version 2.3 schema"),
            ("non-object", non_object_descriptor, "invalid chunk descriptor"),
            ("duplicate", duplicate_descriptor, "descriptor ids must be nonempty and unique"),
            ("generic-name", generic_chunk_name, "content-addressed names"),
            ("mismatched-name", mismatched_content_address, "content-addressed names"),
            (
                "missing-id",
                lambda manifest, _metadata: manifest["chunks"][0].pop("id"),
                "descriptor ids must be nonempty and unique",
            ),
            (
                "current-scope",
                lambda manifest, _metadata: manifest["chunks"][0].__setitem__(
                    "scope", "HISTORICAL"
                ),
                "descriptor taxonomy is invalid",
            ),
            (
                "unknown-type",
                lambda manifest, _metadata: manifest["chunks"][0].__setitem__(
                    "object_type", "NOT_A_TRACKED_TYPE"
                ),
                "descriptor taxonomy is invalid",
            ),
            ("forged-revision", forged_catalog_revision, "recomputed descriptor closure"),
            ("reordered-descriptors", reordered_descriptors, "recomputed descriptor closure"),
            ("forged-coverage", forged_coverage_revision, "recomputed evidence"),
            (
                "impossible-issue-accounting",
                impossible_issue_accounting,
                "coverage revision inputs are invalid",
            ),
            (
                "metadata-row-accounting",
                lambda _manifest, metadata: metadata["counts"].__setitem__("issues", 1),
                "row accounting differs",
            ),
            (
                "metadata-fractional-count",
                lambda _manifest, metadata: metadata["counts"].__setitem__(
                    "current", 1.0
                ),
                "count is invalid or inconsistent",
            ),
            (
                "metadata-fractional-coverage",
                lambda _manifest, metadata: metadata["coverage"].__setitem__(
                    "received", 1.0
                ),
                "coverage_revision differs",
            ),
            (
                "false-complete-snapshot",
                false_complete_snapshot,
                "coverage revision inputs are invalid",
            ),
            (
                "expected-provider-records",
                forged_expected_provider_records,
                "coverage revision inputs are invalid",
            ),
            (
                "fractional-expected-count",
                fractional_expected_count,
                "coverage revision inputs are invalid",
            ),
            (
                "unsafe-expected-count",
                unsafe_expected_count,
                "coverage revision inputs are invalid",
            ),
            (
                "unsafe-descriptor-count",
                lambda manifest, _metadata: manifest["chunks"][0].__setitem__(
                    "count", (1 << 53) + 1
                ),
                "descriptor counts and byte lengths are invalid",
            ),
            (
                "missing-reconciled-at",
                lambda _manifest, metadata: metadata.pop("last_reconciled_at"),
                "complete-snapshot claim is not backed",
            ),
            (
                "invalid-reconciled-at-zero",
                lambda _manifest, metadata: metadata.__setitem__(
                    "last_reconciled_at", "0"
                ),
                "complete-snapshot claim is not backed",
            ),
            (
                "invalid-reconciled-at-calendar",
                lambda _manifest, metadata: metadata.__setitem__(
                    "last_reconciled_at", "2026-02-31T12:00:00Z"
                ),
                "complete-snapshot claim is not backed",
            ),
            (
                "unverified-complete-metadata",
                lambda _manifest, metadata: metadata.update(
                    {
                        "source_status": "PARTIAL",
                        "last_reconciled_catalog_revision": None,
                    }
                ),
                "complete-snapshot claim is not backed",
            ),
            ("aggregate-count", aggregate_count_drift, "closure failed"),
        )
        for offset, (label, mutate, expected_error) in enumerate(cases, start=1):
            with self.subTest(case=label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                seed_repository(root)
                plane = data_plane.SatelliteDataPlane(
                    repository_root=root,
                    state_root=root / "runtime" / "data-plane",
                )
                staged = plane.stage_update(
                    updater=changed_launch_updater(label),
                    promote=False,
                    now=NOW + dt.timedelta(seconds=offset),
                )
                candidate_root = plane.candidate_root(staged["candidate_id"])
                manifest_path = candidate_root / data_tools.TRACKED_MANIFEST_RELATIVE_PATH
                metadata_path = candidate_root / data_tools.TRACKED_META_RELATIVE_PATH
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                mutate(manifest, metadata)
                write_json(manifest_path, manifest)
                write_json(metadata_path, metadata)

                with self.assertRaisesRegex(
                    data_plane.DataPlaneError,
                    f"(?:{expected_error}|Invalid JSON)",
                ):
                    plane.promote_candidate(staged["candidate_id"])
                self.assertIsNone(plane.pointer())

    def test_nonstandard_tracked_json_bytes_cannot_be_promoted(self):
        def append_nonstandard_member(path: Path) -> None:
            source = path.read_text(encoding="utf-8").rstrip()
            path.write_text(
                f'{source[:-1]},"unexpected_nonstandard":NaN}}\n',
                encoding="utf-8",
            )

        def replace_zero_with_negative_zero(path: Path) -> None:
            source = path.read_text(encoding="utf-8")
            changed = source.replace('"quarantined": 0', '"quarantined": -0', 1)
            if changed == source:
                changed = source.replace('"quarantined":0', '"quarantined":-0', 1)
            self.assertNotEqual(changed, source)
            path.write_text(changed, encoding="utf-8")

        def replace_with_non_utf8(path: Path) -> None:
            path.write_bytes(b'{"unexpected":"\x80"}')

        def replace_with_utf8_bom(path: Path) -> None:
            path.write_bytes(b"\xef\xbb\xbf" + path.read_bytes())

        def replace_with_utf16(path: Path) -> None:
            path.write_bytes(path.read_text(encoding="utf-8").encode("utf-16"))

        def append_string_member(path: Path, value: str) -> None:
            source = path.read_text(encoding="utf-8").rstrip()
            path.write_text(
                f'{source[:-1]},"unexpected_string":"{value}"}}\n',
                encoding="utf-8",
            )

        def append_duplicate_member(path: Path) -> None:
            source = path.read_text(encoding="utf-8").rstrip()
            path.write_text(f'{source[:-1]},"counts":{{}}}}\n', encoding="utf-8")

        cases = (
            ("manifest-nan", data_tools.TRACKED_MANIFEST_RELATIVE_PATH, append_nonstandard_member),
            ("metadata-infinity", data_tools.TRACKED_META_RELATIVE_PATH, append_nonstandard_member),
            ("manifest-negative-zero", data_tools.TRACKED_MANIFEST_RELATIVE_PATH, replace_zero_with_negative_zero),
            ("manifest-invalid-utf8", data_tools.TRACKED_MANIFEST_RELATIVE_PATH, replace_with_non_utf8),
            ("metadata-utf8-bom", data_tools.TRACKED_META_RELATIVE_PATH, replace_with_utf8_bom),
            ("manifest-utf16", data_tools.TRACKED_MANIFEST_RELATIVE_PATH, replace_with_utf16),
            ("manifest-duplicate-key", data_tools.TRACKED_MANIFEST_RELATIVE_PATH, append_duplicate_member),
            (
                "metadata-lone-surrogate",
                data_tools.TRACKED_META_RELATIVE_PATH,
                lambda path: append_string_member(path, r"\ud800"),
            ),
        )
        for offset, (label, relative, mutate) in enumerate(cases, start=1):
            with self.subTest(case=label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                seed_repository(root)
                plane = data_plane.SatelliteDataPlane(
                    repository_root=root,
                    state_root=root / "runtime" / "data-plane",
                )
                staged = plane.stage_update(
                    updater=changed_launch_updater(label),
                    promote=False,
                    now=NOW + dt.timedelta(minutes=offset),
                )
                mutate(plane.candidate_root(staged["candidate_id"]) / relative)

                with self.assertRaisesRegex(data_plane.DataPlaneError, "Invalid JSON"):
                    plane.promote_candidate(staged["candidate_id"])
                self.assertIsNone(plane.pointer())

    def test_rehashed_tracked_record_contract_forgery_cannot_be_promoted(self):
        def duplicate_record(manifest, metadata, payload):
            payload["records"].append(dict(payload["records"][0]))
            object_type = payload["object_type"]
            for target in (manifest["counts"], metadata["counts"]):
                target["current"] += 1
                target["total"] += 1
                target["metadata_only"] += 1
                target["current_metadata_only"] += 1
                target["object_types"][object_type] += 1
                target["current_object_types"][object_type] += 1

        def availability_drift(manifest, metadata, _payload):
            for target in (manifest["counts"], metadata["counts"]):
                target["propagatable"] += 1
                target["metadata_only"] -= 1
                target["current_propagatable"] += 1
                target["current_metadata_only"] -= 1

        def boolean_type_count(manifest, metadata, _payload):
            for target in (manifest["counts"], metadata["counts"]):
                target["object_types"]["DEBRIS"] = False
                target["current_object_types"]["DEBRIS"] = False

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
        for offset, (label, mutate) in enumerate(cases, start=1):
            with self.subTest(case=label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                seed_repository(root)
                plane = data_plane.SatelliteDataPlane(
                    repository_root=root,
                    state_root=root / "runtime" / "data-plane",
                )
                staged = plane.stage_update(
                    updater=changed_launch_updater(label),
                    promote=False,
                    now=NOW + dt.timedelta(minutes=offset),
                )
                candidate_root = plane.candidate_root(staged["candidate_id"])
                manifest_path = candidate_root / data_tools.TRACKED_MANIFEST_RELATIVE_PATH
                metadata_path = candidate_root / data_tools.TRACKED_META_RELATIVE_PATH
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                descriptor = manifest["chunks"][0]
                chunk_path = candidate_root / descriptor["path"]
                payload = json.loads(chunk_path.read_text(encoding="utf-8"))
                mutate(manifest, metadata, payload)
                body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
                digest = hashlib.sha256(body).hexdigest()
                suffix = Path(descriptor["path"]).name[64:]
                replacement_relative = f"json/tracked/chunks/{digest}{suffix}"
                (candidate_root / replacement_relative).write_bytes(body)
                descriptor.update({
                    "path": replacement_relative,
                    "sha256": f"sha256:{digest}",
                    "bytes": len(body),
                    "count": len(payload["records"]),
                })
                revision = data_tools.tracked_catalog_revision_for_manifest(manifest)
                manifest["catalog_revision"] = revision
                metadata["catalog_revision"] = revision
                metadata["dataset_hash"] = revision
                metadata["last_reconciled_catalog_revision"] = revision
                write_json(manifest_path, manifest)
                write_json(metadata_path, metadata)

                with self.assertRaisesRegex(
                    data_plane.DataPlaneError,
                    "(?:closure failed|object-type counts differ)",
                ):
                    plane.promote_candidate(staged["candidate_id"])
                self.assertIsNone(plane.pointer())

    def test_nonstandard_tracked_chunk_bytes_cannot_be_promoted(self):
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
        for offset, (label, rewrite) in enumerate(cases, start=1):
            with self.subTest(case=label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                seed_repository(root)
                plane = data_plane.SatelliteDataPlane(
                    repository_root=root,
                    state_root=root / "runtime" / "data-plane",
                )
                staged = plane.stage_update(
                    updater=changed_launch_updater(f"chunk-{label}"),
                    promote=False,
                    now=NOW + dt.timedelta(seconds=offset),
                )
                candidate_root = plane.candidate_root(staged["candidate_id"])
                manifest_path = candidate_root / data_tools.TRACKED_MANIFEST_RELATIVE_PATH
                metadata_path = candidate_root / data_tools.TRACKED_META_RELATIVE_PATH
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                descriptor = manifest["chunks"][0]
                old_path = candidate_root / descriptor["path"]
                body = rewrite(old_path.read_bytes())
                digest = hashlib.sha256(body).hexdigest()
                filename = f"{digest}-{old_path.name.split('-', 1)[1]}"
                new_path = old_path.with_name(filename)
                new_path.write_bytes(body)
                descriptor.update({
                    "path": new_path.relative_to(candidate_root).as_posix(),
                    "sha256": f"sha256:{digest}",
                    "bytes": len(body),
                })
                revision = data_tools.tracked_catalog_revision_for_manifest(manifest)
                manifest["catalog_revision"] = revision
                metadata.update({
                    "catalog_revision": revision,
                    "dataset_hash": revision,
                    "last_reconciled_catalog_revision": revision,
                })
                write_json(manifest_path, manifest, indent=2)
                write_json(metadata_path, metadata, indent=2)

                with self.assertRaisesRegex(data_plane.DataPlaneError, "closure failed"):
                    plane.promote_candidate(staged["candidate_id"])
                self.assertIsNone(plane.pointer())

    def test_promoted_byte_drift_fails_closed_and_current_previous_survive_pruning(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            plane = data_plane.SatelliteDataPlane(
                repository_root=root,
                state_root=root / "runtime" / "data-plane",
            )
            previous = plane.stage_update(
                updater=changed_launch_updater("previous"),
                promote=True,
                now=NOW,
            )
            current = plane.stage_update(
                updater=changed_launch_updater("current"),
                promote=True,
                now=NOW + dt.timedelta(seconds=1),
            )
            pointer_before_retry = plane.pointer()
            pointer_bytes_before_retry = plane.pointer_path.read_bytes()
            retried = plane.promote_candidate(current["candidate_id"])
            self.assertEqual(retried, pointer_before_retry)
            self.assertEqual(plane.pointer_path.read_bytes(), pointer_bytes_before_retry)
            self.assertEqual(
                retried["previous_candidate_id"],
                previous["candidate_id"],
            )
            self.assertNotEqual(
                retried["previous_candidate_id"],
                retried["candidate_id"],
            )
            duplicate_id = "20260101T000000Z-aaaaaaaaaaaa"
            duplicate_root = plane.state_root / "candidates" / duplicate_id
            shutil.copytree(plane.candidate_root(current["candidate_id"]), duplicate_root)
            duplicate_metadata_path = duplicate_root / data_plane.CANDIDATE_METADATA_NAME
            duplicate_metadata = json.loads(
                duplicate_metadata_path.read_text(encoding="utf-8")
            )
            duplicate_metadata["candidate_id"] = duplicate_id
            write_json(duplicate_metadata_path, duplicate_metadata, indent=2)
            duplicate_retry = plane.promote_candidate(duplicate_id)
            self.assertEqual(duplicate_retry, pointer_before_retry)
            self.assertEqual(plane.pointer_path.read_bytes(), pointer_bytes_before_retry)
            self.assertEqual(
                duplicate_retry["previous_candidate_id"],
                previous["candidate_id"],
            )
            current_root = plane.current_root()
            launch_path = current_root / data_tools.LAUNCHES_RELATIVE_PATH
            self.assertFalse(launch_path.stat().st_mode & stat.S_IWUSR)

            candidates_root = plane.state_root / "candidates"
            for offset in range(10, 20):
                name = f"20260901T1200{offset:02d}Z-{offset:012x}"
                (candidates_root / name).mkdir(parents=True)
            plane._prune_candidates()
            self.assertTrue(plane.candidate_root(current["candidate_id"]).is_dir())
            self.assertTrue(plane.candidate_root(previous["candidate_id"]).is_dir())
            self.assertFalse(duplicate_root.exists())

            launch_path.chmod(launch_path.stat().st_mode | stat.S_IWUSR)
            launch_path.write_bytes(b'[{"candidate":"drifted"}]')
            launch_path.chmod(launch_path.stat().st_mode & ~stat.S_IWUSR)

            self.assertIsNone(plane.pointer())
            self.assertEqual(plane.current_root(), root)
            plane._prune_candidates()
            self.assertTrue(plane.candidate_root(current["candidate_id"]).is_dir())
            self.assertTrue(plane.candidate_root(previous["candidate_id"]).is_dir())
            with running_server(root, plane) as port:
                status, body = request(port, "/api/launches")
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body), [])

    def test_validation_drift_and_atomic_pointer_failure_preserve_current_candidate(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            plane = data_plane.SatelliteDataPlane(
                repository_root=root,
                state_root=root / "runtime" / "data-plane",
            )
            first = plane.stage_update(updater=changed_launch_updater("first"), promote=True, now=NOW)
            first_pointer = plane.pointer()

            drifted = plane.stage_update(
                updater=changed_launch_updater("drifted"),
                promote=False,
                now=NOW + dt.timedelta(seconds=1),
            )
            drifted_root = plane.candidate_root(drifted["candidate_id"])
            (drifted_root / data_tools.GP_RELATIVE_PATH).write_text("[{}]", encoding="utf-8")
            with self.assertRaisesRegex(data_plane.DataPlaneError, "gp bytes"):
                plane.promote_candidate(drifted["candidate_id"])
            self.assertEqual(plane.pointer(), first_pointer)

            second = plane.stage_update(
                updater=changed_launch_updater("second"),
                promote=False,
                now=NOW + dt.timedelta(seconds=2),
            )
            original_write = data_tools.atomic_write_json

            def fail_pointer(path, payload, **kwargs):
                if Path(path) == plane.pointer_path:
                    raise OSError("injected pointer failure")
                return original_write(path, payload, **kwargs)

            with mock.patch.object(data_tools, "atomic_write_json", side_effect=fail_pointer):
                with self.assertRaisesRegex(OSError, "injected pointer failure"):
                    plane.promote_candidate(second["candidate_id"])
            self.assertEqual(plane.pointer(), first_pointer)
            self.assertEqual(first["candidate_id"], plane.pointer()["candidate_id"])
            retried = plane.promote_candidate(second["candidate_id"])
            self.assertEqual(retried["candidate_id"], second["candidate_id"])

            with mock.patch.object(data_tools, "atomic_write_json", side_effect=fail_pointer):
                with self.assertRaisesRegex(OSError, "injected pointer failure"):
                    plane.stage_update(
                        updater=changed_launch_updater("third"),
                        promote=True,
                        now=NOW + dt.timedelta(seconds=3),
                    )
            candidates = sorted((plane.state_root / "candidates").iterdir(), key=lambda item: item.name)
            failed_candidate = candidates[-1]
            failed_metadata = json.loads(
                (failed_candidate / data_plane.CANDIDATE_METADATA_NAME).read_text(encoding="utf-8")
            )
            self.assertEqual(failed_metadata["state"], "validated")
            self.assertIn("injected pointer failure", failed_metadata["promotion_error"])
            retried = plane.promote_candidate(failed_candidate.name)
            self.assertEqual(retried["candidate_id"], failed_candidate.name)

    def test_server_api_and_static_routes_follow_the_atomic_pointer(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            plane = data_plane.SatelliteDataPlane(
                repository_root=root,
                state_root=root / "runtime" / "data-plane",
            )
            plane.stage_update(updater=changed_launch_updater("served"), promote=True, now=NOW)

            with running_server(root, plane) as port:
                api_status, api_body = request(port, "/api/launches")
                static_status, static_body = request(port, "/json/launches/launches.json")

            self.assertEqual(api_status, 200)
            self.assertEqual(static_status, 200)
            self.assertEqual(json.loads(api_body), [{"candidate": "served"}])
            self.assertEqual(static_body, api_body)
            self.assertEqual(
                json.loads((root / data_tools.LAUNCHES_RELATIVE_PATH).read_text(encoding="utf-8")),
                [],
            )

    def test_default_server_rebinds_external_promotion_before_v21_routing(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            plane = data_plane.SatelliteDataPlane(
                repository_root=root,
                state_root=root / "runtime" / "data-plane",
            )
            initial_root, initial_identity = server._selected_data_plane_root(plane)
            registration_attempts = []

            def register(selected_root: Path) -> None:
                registration_attempts.append(selected_root)
                if len(registration_attempts) == 1:
                    raise RuntimeError("transient registration failure")

            coordinator = server.DataSelectionCoordinator(
                data_plane=plane,
                registered_root=initial_root,
                registered_pointer_identity=initial_identity,
                on_selected=register,
            )
            routed_roots = []

            class FakeV21Router:
                def handle(self, handler, *, method, head_only):
                    routed_roots.append(coordinator.current_root())
                    handler._send_json({"method": method}, head_only=head_only)
                    return True

            with running_server(root, plane, coordinator=coordinator, v21_router=FakeV21Router()) as port:
                promoted = plane.stage_update(
                    updater=changed_launch_updater("manual"),
                    promote=True,
                    now=NOW,
                )
                first_status, _first_body = request(port, "/api/v1/capabilities")
                second_status, _second_body = request(port, "/api/v1/capabilities")

            promoted_root = plane.candidate_root(promoted["candidate_id"])
            self.assertEqual((first_status, second_status), (200, 200))
            self.assertEqual(routed_roots, [initial_root, promoted_root])
            self.assertEqual(registration_attempts, [promoted_root, promoted_root])
            self.assertEqual(coordinator.current_root(), promoted_root)
            self.assertEqual(
                coordinator.registered_pointer_identity,
                ("candidate", promoted["candidate_id"], promoted["candidate_revision"]),
            )

    def test_scheduler_stop_cancels_candidate_before_pointer_publication(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            release_inventory = inventory(root)
            plane = data_plane.SatelliteDataPlane(
                repository_root=root,
                state_root=root / "runtime" / "data-plane",
            )
            entered = threading.Event()

            def blocking_update(*, cancel_requested, **_kwargs):
                entered.set()
                if not cancel_requested:
                    raise AssertionError("scheduler did not provide cooperative cancellation")
                while not cancel_requested():
                    threading.Event().wait(0.01)
                return {
                    "skipped": False,
                    "degraded": False,
                    "gp": {"changed": True, "skipped": False, "errors": []},
                }

            class BlockingPlane:
                def stage_update(self, **kwargs):
                    return plane.stage_update(updater=blocking_update, now=NOW, **kwargs)

            registered = mock.Mock()
            scheduler = server.DataUpdateScheduler(
                data_plane=BlockingPlane(),
                initial_delay_seconds=0,
                on_updated=registered,
            )
            scheduler.start()
            self.assertTrue(entered.wait(timeout=2))
            scheduler.stop(timeout_seconds=2)

            self.assertFalse(scheduler.thread.is_alive())
            self.assertIsNone(plane.pointer())
            self.assertEqual(inventory(root), release_inventory)
            registered.assert_not_called()

    def test_update_cooperative_cancel_fires_before_any_candidate_phase(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            before = inventory(root)
            with self.assertRaises(data_tools.SatelliteDataCancelled):
                data_tools.maybe_update_satellite_data(root=root, cancel_requested=lambda: True)
            self.assertEqual(inventory(root), before)


if __name__ == "__main__":
    unittest.main()
