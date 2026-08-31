from __future__ import annotations

import datetime as dt
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from tools import satellite_data_tools as data_tools


HEADER = (
    "OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,OBJECT_TYPE,OPS_STATUS_CODE,OWNER,"
    "LAUNCH_DATE,LAUNCH_SITE,DECAY_DATE,PERIOD,INCLINATION,APOGEE,PERIGEE,"
    "RCS,DATA_STATUS_CODE,ORBIT_CENTER,ORBIT_TYPE\n"
)


def omm(norad_id: int, name: str | None = None) -> dict[str, object]:
    return {
        "OBJECT_NAME": name or f"OBJECT {norad_id}",
        "OBJECT_ID": "2026-001A",
        "EPOCH": "2026-08-30T00:00:00Z",
        "MEAN_MOTION": 15.5,
        "ECCENTRICITY": 0.001,
        "INCLINATION": 51.6,
        "RA_OF_ASC_NODE": 12.0,
        "ARG_OF_PERICENTER": 13.0,
        "MEAN_ANOMALY": 14.0,
        "EPHEMERIS_TYPE": 0,
        "NORAD_CAT_ID": norad_id,
        "ELEMENT_SET_NO": 7,
        "REV_AT_EPOCH": 42,
        "BSTAR": 0.00001,
        "MEAN_MOTION_DOT": 0.00002,
        "MEAN_MOTION_DDOT": 0,
        "OBJECT_TYPE": "PAYLOAD",
    }


def gp_record(norad_id: int, name: str | None = None) -> dict[str, object]:
    return data_tools.transform_satellite_omm_object(omm(norad_id, name), {})


def write_inputs(
    root: Path,
    satcat_text: str,
    gp_payload: object,
    *,
    reconciled: bool = True,
) -> None:
    satcat_path = root / data_tools.SATCAT_RELATIVE_PATH
    satcat_path.parent.mkdir(parents=True, exist_ok=True)
    satcat_path.write_text(satcat_text, encoding="utf-8")
    gp_path = root / data_tools.GP_RELATIVE_PATH
    gp_path.parent.mkdir(parents=True, exist_ok=True)
    gp_path.write_text(json.dumps(gp_payload), encoding="utf-8")
    with satcat_path.open("r", encoding="utf-8", newline="") as handle:
        persisted_satcat_text = handle.read()
    revision = data_tools.catalog_revision_for_text(persisted_satcat_text)
    received = sum(1 for line in persisted_satcat_text.splitlines()[1:] if line.strip())
    meta_path = root / data_tools.SATCAT_META_RELATIVE_PATH
    metadata = {
        "source_url": data_tools.CELESTRAK_SATCAT_CSV_URL,
        "last_status": "ok",
        "catalog_revision": revision,
        "dataset_hash": revision,
        "counts": {"records": received},
    }
    if reconciled:
        metadata["last_reconciled_at"] = "2026-08-30T00:00:00Z"
        metadata["last_reconciled_catalog_revision"] = revision
    meta_path.write_text(json.dumps(metadata), encoding="utf-8")


def load_manifest(root: Path) -> dict[str, object]:
    return json.loads((root / data_tools.TRACKED_MANIFEST_RELATIVE_PATH).read_text(encoding="utf-8"))


def load_records(root: Path, descriptors: list[dict[str, object]]) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for descriptor in descriptors:
        body = (root / str(descriptor["path"])).read_bytes()
        assert "sha256:" + hashlib.sha256(body).hexdigest() == descriptor["sha256"]
        payload = json.loads(body)
        assert len(payload["records"]) == descriptor["count"]
        records.extend(payload["records"])
    return records


class TrackedCatalogTests(unittest.TestCase):
    def test_same_gp_bytes_republish_when_actual_source_groups_change(self):
        satcat_text = (
            HEADER
            + "OBJECT,2026-001A,100001,PAY,+,US,2026-01-01,AFETR,,92,51,500,490,,,EA,ORB\n"
        )
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = [gp_record(100001)]
            write_inputs(root, satcat_text, payload)
            gp_revision = data_tools.catalog_revision_for_payload(payload)
            gp_meta_path = root / data_tools.GP_META_RELATIVE_PATH
            verified_meta = {
                "catalog_revision": gp_revision,
                "dataset_hash": gp_revision,
                "catalog_source_groups": list(data_tools.GP_SOURCE_GROUPS),
                **data_tools.gp_source_scope_metadata(verified=True),
            }
            gp_meta_path.write_text(json.dumps(verified_meta), encoding="utf-8")

            first = data_tools.build_tracked_catalog(root=root, mode="incremental")
            self.assertFalse(first.skipped)
            first_manifest = load_manifest(root)
            first_chunk_paths = [
                descriptor["path"]
                for descriptor in [
                    *first_manifest["chunks"],
                    *first_manifest["history_chunks"],
                    first_manifest["quarantine"],
                ]
            ]
            self.assertEqual(
                first_manifest["provenance"]["gp_source_groups"],
                list(data_tools.GP_SOURCE_GROUPS),
            )

            active_only_meta = {
                **verified_meta,
                "source_scope_verified": False,
                "catalog_source_groups": ["active"],
            }
            gp_meta_path.write_text(json.dumps(active_only_meta), encoding="utf-8")
            second = data_tools.build_tracked_catalog(root=root, mode="incremental")

            self.assertFalse(second.skipped)
            second_manifest = load_manifest(root)
            self.assertEqual(second_manifest["provenance"]["gp_source_groups"], ["active"])
            self.assertEqual(
                [
                    descriptor["path"]
                    for descriptor in [
                        *second_manifest["chunks"],
                        *second_manifest["history_chunks"],
                        second_manifest["quarantine"],
                    ]
                ],
                first_chunk_paths,
            )
            tracked_meta = json.loads(
                (root / data_tools.TRACKED_META_RELATIVE_PATH).read_text(encoding="utf-8")
            )
            self.assertEqual(tracked_meta["source_gp_groups"], ["active"])

    def test_tracked_provenance_does_not_trust_mismatched_gp_metadata(self):
        satcat_text = (
            HEADER
            + "OBJECT,2026-001A,100001,PAY,+,US,2026-01-01,AFETR,,92,51,500,490,,,EA,ORB\n"
        )
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = [gp_record(100001)]
            write_inputs(root, satcat_text, payload)
            stale_revision = data_tools.catalog_revision_for_payload([gp_record(999999)])
            gp_meta_path = root / data_tools.GP_META_RELATIVE_PATH
            gp_meta_path.write_text(
                json.dumps(
                    {
                        "catalog_revision": stale_revision,
                        "dataset_hash": stale_revision,
                        "source_groups": list(data_tools.GP_SOURCE_GROUPS),
                        "source_scope_verified": True,
                        "catalog_source_groups": list(data_tools.GP_SOURCE_GROUPS),
                    }
                ),
                encoding="utf-8",
            )

            result = data_tools.build_tracked_catalog(root=root, mode="incremental")

            self.assertFalse(result.errors)
            manifest = load_manifest(root)
            actual_revision = data_tools.catalog_revision_for_payload(payload)
            self.assertEqual(manifest["provenance"]["gp_revision"], actual_revision)
            self.assertEqual(manifest["provenance"]["gp_source_groups"], [])
            self.assertIn("unrecorded", manifest["provenance"]["gp_scope"])

    def test_crlf_satcat_revision_remains_bound_to_verified_snapshot(self):
        satcat_bytes = (
            HEADER.replace("\n", "\r\n")
            + "OBJECT,2026-001A,100001,PAY,+,US,2026-01-01,AFETR,,92,51,500,490,,,EA,ORB\r\n"
        ).encode("utf-8")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            satcat_path = root / data_tools.SATCAT_RELATIVE_PATH
            satcat_path.parent.mkdir(parents=True)
            satcat_path.write_bytes(satcat_bytes)
            revision = "sha256:" + hashlib.sha256(satcat_bytes).hexdigest()
            meta_path = root / data_tools.SATCAT_META_RELATIVE_PATH
            meta_path.write_text(
                json.dumps(
                    {
                        "source_url": data_tools.CELESTRAK_SATCAT_CSV_URL,
                        "last_status": "ok",
                        "catalog_revision": revision,
                        "counts": {"records": 1},
                        "last_reconciled_at": "2026-08-30T00:00:00Z",
                        "last_reconciled_catalog_revision": revision,
                    }
                ),
                encoding="utf-8",
            )
            result = data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                gp_payload=[],
            )
            self.assertFalse(result.errors)
            manifest = load_manifest(root)
            self.assertEqual(manifest["provenance"]["satcat_revision"], revision)
            self.assertTrue(manifest["coverage"]["complete_source_snapshot"])
            tracked_meta = json.loads(
                (root / data_tools.TRACKED_META_RELATIVE_PATH).read_text(encoding="utf-8")
            )
            self.assertEqual(tracked_meta["source_status"], "VERIFIED_SNAPSHOT")

    def test_satcat_reconciliation_forces_tracked_reconciliation_without_another_fetch(self):
        def result(name: str, *, changed: bool = False) -> data_tools.UpdateResult:
            return data_tools.UpdateResult(
                changed=changed,
                skipped=not changed,
                mode=name,
                message=name,
            )

        def reconciliation_due(_root, metadata_path, _hours, *, now=None):
            del now
            return metadata_path == data_tools.SATCAT_META_RELATIVE_PATH

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with (
                mock.patch.object(data_tools, "metadata_is_older_than", return_value=False),
                mock.patch.object(
                    data_tools,
                    "metadata_reconciliation_is_older_than",
                    side_effect=reconciliation_due,
                ),
                mock.patch.object(
                    data_tools,
                    "refresh_satcat_csv",
                    return_value=result("refresh-satcat", changed=False),
                ) as satcat_refresh,
                mock.patch.object(data_tools, "build_launch_catalog", return_value=result("launches")),
                mock.patch.object(data_tools, "build_decayed_db", return_value=result("decayed")),
                mock.patch.object(data_tools, "export_tle_data", return_value=result("tle")),
                mock.patch.object(data_tools, "export_gp_data", return_value=result("gp")),
                mock.patch.object(data_tools, "build_tracked_catalog", return_value=result("tracked")) as tracked,
            ):
                data_tools.maybe_update_satellite_data(root=root, dry_run=True)

            satcat_refresh.assert_called_once()
            self.assertEqual(tracked.call_count, 1)
            self.assertEqual(tracked.call_args.kwargs["mode"], data_tools.RECONCILIATION_MODE)

    def test_incremental_dependency_failure_blocks_reconciliation_without_false_label(self):
        def result(name: str, *, changed: bool = False) -> data_tools.UpdateResult:
            return data_tools.UpdateResult(
                changed=changed,
                skipped=not changed,
                mode=name,
                message=name,
            )

        def reconciliation_due(_root, metadata_path, _hours, *, now=None):
            del now
            return metadata_path == data_tools.GP_META_RELATIVE_PATH

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with (
                mock.patch.object(data_tools, "metadata_is_older_than", return_value=False),
                mock.patch.object(
                    data_tools,
                    "metadata_reconciliation_is_older_than",
                    side_effect=reconciliation_due,
                ),
                mock.patch.object(
                    data_tools,
                    "export_gp_data",
                    return_value=result("gp", changed=True),
                ),
                mock.patch.object(
                    data_tools,
                    "build_tracked_catalog",
                    side_effect=RuntimeError("tracked dependency failed"),
                ) as tracked,
            ):
                scheduled = data_tools.maybe_update_satellite_data(root=root, dry_run=True)

            self.assertEqual(tracked.call_args.kwargs["mode"], "incremental")
            self.assertTrue(scheduled["reconciliation"]["datasets"]["gp"])
            self.assertFalse(scheduled["reconciliation"]["datasets"]["tracked"])
            self.assertEqual(scheduled["reconciliation"]["counts"]["datasets"], 1)
            self.assertFalse(scheduled["reconciliation"]["completed"])
            self.assertIsNone(scheduled["reconciliation"]["last_reconciled_at"])
            self.assertIn("tracked dependency failed", scheduled["reconciliation"]["errors"])
            self.assertTrue(scheduled["degraded"])

    def test_scheduled_unverified_forced_reconciliation_preserves_membership_and_fails(self):
        row_a = "A,2026-001A,100001,PAY,+,US,2026-01-01,AFETR,,92,51,500,490,,,EA,ORB\n"
        row_b = "B,2026-001B,100002,DEB,+,US,2026-01-01,AFETR,,93,52,520,500,,,EA,ORB\n"

        def result(name: str, *, changed: bool = False) -> data_tools.UpdateResult:
            return data_tools.UpdateResult(
                changed=changed,
                skipped=not changed,
                mode=name,
                message=name,
            )

        def reconciliation_due(_root, metadata_path, _hours, *, now=None):
            del now
            return metadata_path == data_tools.SATCAT_META_RELATIVE_PATH

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_inputs(root, HEADER + row_a + row_b, [])
            data_tools.build_tracked_catalog(root=root, mode=data_tools.RECONCILIATION_MODE)
            write_inputs(root, HEADER + row_a, [], reconciled=False)
            data_tools.build_tracked_catalog(root=root, mode="incremental")
            manifest_path = root / data_tools.TRACKED_MANIFEST_RELATIVE_PATH
            manifest_before = manifest_path.read_bytes()
            satcat_meta_path = root / data_tools.SATCAT_META_RELATIVE_PATH
            failed_satcat_meta = json.loads(satcat_meta_path.read_text(encoding="utf-8"))
            failed_satcat_meta["last_status"] = "failed"
            satcat_meta_path.write_text(json.dumps(failed_satcat_meta), encoding="utf-8")

            now = dt.datetime(2026, 8, 31, 12, 0, tzinfo=dt.timezone.utc)
            with (
                mock.patch.object(data_tools, "metadata_is_older_than", return_value=False),
                mock.patch.object(
                    data_tools,
                    "metadata_reconciliation_is_older_than",
                    side_effect=reconciliation_due,
                ),
                mock.patch.object(
                    data_tools,
                    "refresh_satcat_csv",
                    return_value=result("refresh-satcat", changed=True),
                ),
                mock.patch.object(data_tools, "build_launch_catalog", return_value=result("launches")),
                mock.patch.object(data_tools, "build_decayed_db", return_value=result("decayed")),
                mock.patch.object(data_tools, "export_tle_data", return_value=result("tle")),
                mock.patch.object(data_tools, "export_gp_data", return_value=result("gp")),
            ):
                scheduled = data_tools.maybe_update_satellite_data(root=root, now=now)

            self.assertFalse(scheduled["due"]["reconciliation"]["tracked"])
            self.assertTrue(scheduled["reconciliation"]["datasets"]["tracked"])
            self.assertFalse(scheduled["reconciliation"]["completed"])
            self.assertIsNone(scheduled["reconciliation"]["last_reconciled_at"])
            self.assertTrue(scheduled["reconciliation"]["errors"])
            self.assertTrue(scheduled["degraded"])
            self.assertTrue(scheduled["tracked"]["errors"])
            self.assertEqual(manifest_path.read_bytes(), manifest_before)
            current = load_records(root, load_manifest(root)["chunks"])
            retained = next(record for record in current if record["norad_id"] == "100002")
            self.assertEqual(retained["catalog_membership_status"], "PRESENT")
            tracked_meta = json.loads(
                (root / data_tools.TRACKED_META_RELATIVE_PATH).read_text(encoding="utf-8")
            )
            self.assertEqual(tracked_meta["last_status"], "failed")
            self.assertEqual(tracked_meta["source_status"], "DEGRADED")

    def test_catalog_preserves_small_missing_rcs_and_separates_current_history(self):
        satcat = HEADER + (
            "CURRENT PAY,2026-001A,100001,PAY,+,US,2026-01-01,AFETR,,92,51,500,490,0.05,,EA,ORB\n"
            "TINY DEBRIS,2026-001B,100002,DEB,+,US,2026-01-01,AFETR,,95,52,650,620,0.00001,,EA,ORB\n"
            "MISSING RCS,2026-001C,100003,R/B,+,US,2026-01-01,AFETR,,96,53,700,680,,,EA,ORB\n"
            "OLD DEBRIS,2000-001A,100004,DEB,D,US,2000-01-01,AFETR,2001-01-01,90,30,400,300,0.01,,EA,ORB\n"
            "ALPHA OBJECT,2026-002A,B0001,UNK,+,US,2026-01-02,AFETR,,100,40,900,850,,,EA,ORB\n"
            "TINY DEBRIS UPDATED,2026-001B,100002,DEB,+,US,2026-01-01,AFETR,,95,52,650,620,0.00001,,EA,ORB\n"
            "INVALID ID,2026-003A,NOT-AN-ID,DEB,+,US,2026-01-03,AFETR,,90,30,400,300,0.01,,EA,ORB\n"
        )
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_inputs(root, satcat, [gp_record(100001), gp_record(100005, "GP ONLY")])

            result = data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                now=dt.datetime(2026, 8, 30, tzinfo=dt.timezone.utc),
            )

            self.assertTrue(result.changed)
            manifest = load_manifest(root)
            self.assertFalse(manifest["provider_completeness_claim"])
            self.assertEqual(manifest["scope"]["current_records"], 4)
            self.assertEqual(manifest["scope"]["historical_records"], 1)
            self.assertTrue(manifest["coverage"]["invariant_holds"])
            self.assertEqual(
                manifest["coverage"]["received"],
                manifest["coverage"]["accepted"]
                + manifest["coverage"]["quarantined"]
                + manifest["coverage"]["duplicates"],
            )
            self.assertEqual(manifest["counts"]["current_metadata_only"], 3)
            self.assertEqual(manifest["counts"]["gp_only"], 1)

            current = load_records(root, manifest["chunks"])
            history = load_records(root, manifest["history_chunks"])
            by_id = {record["norad_id"]: record for record in current}
            self.assertEqual(set(by_id), {"100001", "100002", "100003", "110001"})
            self.assertEqual(by_id["110001"]["provider_catalog_id"], "B0001")
            self.assertEqual(by_id["110001"]["alpha5_id"], "B0001")
            self.assertEqual(by_id["100002"]["rcs_m2"], 0.00001)
            self.assertEqual(by_id["100003"]["rcs_status"], "MISSING")
            self.assertEqual(by_id["100003"]["propagation_status"], "NO_CURRENT_ELEMENTS")
            self.assertEqual(by_id["100003"]["lifecycle_status"], "ACTIVE")
            self.assertTrue(by_id["100001"]["has_current_elements"])
            self.assertIn("element_reference", by_id["100001"])
            self.assertNotIn("element_set", by_id["100001"])
            self.assertIsNone(by_id["100002"]["company"])
            self.assertEqual([record["norad_id"] for record in history], ["100004"])
            self.assertEqual(history[0]["lifecycle_status"], "DECAYED")

            issue_payload = json.loads((root / manifest["quarantine"]["path"]).read_text(encoding="utf-8"))
            self.assertEqual(len(issue_payload["records"]), 2)
            self.assertTrue(any(item.get("disposition") == "DEDUPLICATED" for item in issue_payload["records"]))

    def test_same_inputs_do_not_churn_and_corrupt_chunk_fails_closed(self):
        satcat = HEADER + "OBJECT,2026-001A,100001,PAY,+,US,2026-01-01,AFETR,,92,51,500,490,,,EA,ORB\n"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_inputs(root, satcat, [gp_record(100001)])
            first = data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                now=dt.datetime(2026, 8, 30, tzinfo=dt.timezone.utc),
            )
            self.assertTrue(first.changed)
            manifest_path = root / data_tools.TRACKED_MANIFEST_RELATIVE_PATH
            before = manifest_path.read_bytes()

            second = data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                now=dt.datetime(2026, 8, 31, tzinfo=dt.timezone.utc),
            )
            self.assertTrue(second.skipped)
            self.assertEqual(manifest_path.read_bytes(), before)

            manifest = load_manifest(root)
            chunk_path = root / manifest["chunks"][0]["path"]
            valid_chunk = chunk_path.read_bytes()
            chunk_path.write_text("corrupt", encoding="utf-8")
            rejected = data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                now=dt.datetime(2026, 9, 1, tzinfo=dt.timezone.utc),
            )
            self.assertFalse(rejected.changed)
            self.assertTrue(rejected.skipped)
            self.assertTrue(rejected.errors)
            self.assertEqual(manifest_path.read_bytes(), before)
            chunk_path.write_bytes(valid_chunk)
            self.assertTrue(data_tools._tracked_manifest_is_complete(root, manifest_path))

            manifest = load_manifest(root)
            descriptor = next(item for item in manifest["chunks"] if item["count"])
            chunk_path = root / descriptor["path"]
            payload = json.loads(chunk_path.read_text(encoding="utf-8"))
            payload["records"][0]["object_type"] = "DEBRIS"
            tampered = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            chunk_path.write_bytes(tampered)
            descriptor["sha256"] = "sha256:" + hashlib.sha256(tampered).hexdigest()
            descriptor["bytes"] = len(tampered)
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            self.assertFalse(data_tools._tracked_manifest_is_complete(root, manifest_path))

    def test_rolled_back_manifest_cannot_satisfy_newer_input_noop(self):
        row_a = "OBJECT A,2026-001A,100001,PAY,+,US,2026-01-01,AFETR,,92,51,500,490,,,EA,ORB\n"
        row_b = "OBJECT B,2026-001A,100001,PAY,+,US,2026-01-01,AFETR,,92,51,500,490,,,EA,ORB\n"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_inputs(root, HEADER + row_a, [gp_record(100001, "OBJECT A")])
            first = data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
            )
            self.assertTrue(first.changed)
            manifest_path = root / data_tools.TRACKED_MANIFEST_RELATIVE_PATH
            manifest_a = manifest_path.read_bytes()
            revision_a = load_manifest(root)["catalog_revision"]

            write_inputs(root, HEADER + row_b, [gp_record(100001, "OBJECT B")])
            second = data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
            )
            self.assertTrue(second.changed)
            revision_b = load_manifest(root)["catalog_revision"]
            self.assertNotEqual(revision_a, revision_b)

            manifest_path.write_bytes(manifest_a)
            self.assertTrue(data_tools._tracked_manifest_is_complete(root, manifest_path))
            rebuilt = data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
            )
            self.assertFalse(rebuilt.skipped)
            self.assertTrue(rebuilt.changed)
            rebuilt_manifest = load_manifest(root)
            rebuilt_meta = json.loads(
                (root / data_tools.TRACKED_META_RELATIVE_PATH).read_text(encoding="utf-8")
            )
            self.assertEqual(rebuilt_manifest["catalog_revision"], revision_b)
            self.assertEqual(rebuilt_meta["catalog_revision"], revision_b)

    def test_reconciliation_marks_absent_and_reappearance_is_a_transition(self):
        row_a = "A,2026-001A,100001,PAY,+,US,2026-01-01,AFETR,,92,51,500,490,,,EA,ORB\n"
        row_b = "B,2026-001B,100002,DEB,+,US,2026-01-01,AFETR,,93,52,520,500,,,EA,ORB\n"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_inputs(root, HEADER + row_a + row_b, [])
            data_tools.build_tracked_catalog(root=root, mode=data_tools.RECONCILIATION_MODE)

            write_inputs(root, HEADER + row_a, [])
            data_tools.build_tracked_catalog(root=root, mode=data_tools.RECONCILIATION_MODE)
            manifest = load_manifest(root)
            history = load_records(root, manifest["history_chunks"])
            absent = next(record for record in history if record["norad_id"] == "100002")
            self.assertEqual(absent["catalog_membership_status"], "ABSENT")
            self.assertEqual(absent["observation_status"], "ABSENT")
            self.assertFalse(absent["has_current_elements"])

            write_inputs(root, HEADER + row_a + row_b, [])
            data_tools.build_tracked_catalog(root=root, mode=data_tools.RECONCILIATION_MODE)
            manifest = load_manifest(root)
            current = load_records(root, manifest["chunks"])
            reappeared = next(record for record in current if record["norad_id"] == "100002")
            self.assertEqual(reappeared["observation_status"], "REAPPEARED")
            self.assertEqual(reappeared["lifecycle_status"], "ACTIVE")
            self.assertEqual(reappeared["propagation_status"], "NO_CURRENT_ELEMENTS")

    def test_reconciliation_requires_verified_satcat_lineage_before_absence(self):
        row_a = "A,2026-001A,100001,PAY,+,US,2026-01-01,AFETR,,92,51,500,490,,,EA,ORB\n"
        row_b = "B,2026-001B,100002,DEB,+,US,2026-01-01,AFETR,,93,52,520,500,,,EA,ORB\n"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_inputs(root, HEADER + row_a + row_b, [])
            data_tools.build_tracked_catalog(root=root, mode=data_tools.RECONCILIATION_MODE)

            write_inputs(root, HEADER + row_a, [], reconciled=False)
            incremental = data_tools.build_tracked_catalog(root=root, mode="incremental")
            self.assertFalse(incremental.skipped)
            incremental_manifest = load_manifest(root)
            incremental_current = load_records(root, incremental_manifest["chunks"])
            self.assertIn("100002", {record["norad_id"] for record in incremental_current})
            manifest_path = root / data_tools.TRACKED_MANIFEST_RELATIVE_PATH
            manifest_before = manifest_path.read_bytes()
            tracked_meta_path = root / data_tools.TRACKED_META_RELATIVE_PATH
            prior_reconciled_at = json.loads(
                tracked_meta_path.read_text(encoding="utf-8")
            ).get("last_reconciled_at")

            unverified = data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
            )
            self.assertTrue(unverified.skipped)
            self.assertTrue(unverified.errors)
            self.assertEqual(manifest_path.read_bytes(), manifest_before)
            preserved = load_records(root, load_manifest(root)["chunks"])
            retained = next(record for record in preserved if record["norad_id"] == "100002")
            self.assertEqual(retained["catalog_membership_status"], "PRESENT")
            tracked_meta = json.loads(tracked_meta_path.read_text(encoding="utf-8"))
            self.assertEqual(tracked_meta["last_status"], "failed")
            self.assertEqual(tracked_meta["source_status"], "DEGRADED")
            self.assertEqual(tracked_meta.get("last_reconciled_at"), prior_reconciled_at)

            satcat_meta_path = root / data_tools.SATCAT_META_RELATIVE_PATH
            failed_satcat_meta = json.loads(satcat_meta_path.read_text(encoding="utf-8"))
            failed_satcat_meta["last_status"] = "failed"
            satcat_meta_path.write_text(json.dumps(failed_satcat_meta), encoding="utf-8")
            failed = data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
            )
            self.assertTrue(failed.skipped)
            self.assertTrue(failed.errors)
            self.assertEqual(manifest_path.read_bytes(), manifest_before)

            write_inputs(root, HEADER + row_a, [], reconciled=True)
            reconciled = data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
            )
            self.assertFalse(reconciled.skipped)
            self.assertFalse(reconciled.errors)
            manifest = load_manifest(root)
            current = load_records(root, manifest["chunks"])
            history = load_records(root, manifest["history_chunks"])
            self.assertNotIn("100002", {record["norad_id"] for record in current})
            absent = next(record for record in history if record["norad_id"] == "100002")
            self.assertEqual(absent["observation_status"], "ABSENT")

    def test_corrupt_prior_history_closure_fails_closed_without_erasing_absent_record(self):
        row_a = "A,2026-001A,100001,PAY,+,US,2026-01-01,AFETR,,92,51,500,490,,,EA,ORB\n"
        row_b = "B,2026-001B,100002,DEB,+,US,2026-01-01,AFETR,,93,52,520,500,,,EA,ORB\n"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_inputs(root, HEADER + row_a + row_b, [])
            data_tools.build_tracked_catalog(root=root, mode=data_tools.RECONCILIATION_MODE)
            write_inputs(root, HEADER + row_a, [])
            data_tools.build_tracked_catalog(root=root, mode=data_tools.RECONCILIATION_MODE)

            manifest_path = root / data_tools.TRACKED_MANIFEST_RELATIVE_PATH
            meta_path = root / data_tools.TRACKED_META_RELATIVE_PATH
            manifest = load_manifest(root)
            history_descriptor = next(
                descriptor for descriptor in manifest["history_chunks"] if descriptor["count"]
            )
            history_path = root / history_descriptor["path"]
            history_path.write_bytes(b"corrupt")
            manifest_before = manifest_path.read_bytes()
            meta_before = json.loads(meta_path.read_text(encoding="utf-8"))

            result = data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                now=dt.datetime(2026, 9, 1, tzinfo=dt.timezone.utc),
            )

            self.assertFalse(result.changed)
            self.assertTrue(result.skipped)
            self.assertTrue(result.errors)
            self.assertEqual(manifest_path.read_bytes(), manifest_before)
            self.assertEqual(history_path.read_bytes(), b"corrupt")
            persisted = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertEqual(persisted["catalog_revision"], meta_before["catalog_revision"])
            self.assertEqual(persisted["counts"], meta_before["counts"])
            self.assertEqual(persisted["last_status"], "failed")
            self.assertEqual(persisted["source_status"], "DEGRADED")
            self.assertIn("manifest closure", persisted["last_error"])

    def test_changed_build_rolls_back_manifest_and_metadata_when_metadata_promotion_fails(self):
        row_a = "A,2026-001A,100001,PAY,+,US,2026-01-01,AFETR,,92,51,500,490,,,EA,ORB\n"
        row_b = "B,2026-001B,100002,DEB,+,US,2026-01-01,AFETR,,93,52,520,500,,,EA,ORB\n"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_inputs(root, HEADER + row_a, [])
            first = data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
            )
            self.assertTrue(first.changed)
            manifest_path = root / data_tools.TRACKED_MANIFEST_RELATIVE_PATH
            meta_path = root / data_tools.TRACKED_META_RELATIVE_PATH
            manifest_before = manifest_path.read_bytes()
            metadata_before = meta_path.read_bytes()
            prior_manifest = load_manifest(root)
            prior_revision = prior_manifest["catalog_revision"]
            chunk_root = root / data_tools.TRACKED_DIRECTORY_RELATIVE_PATH / "chunks"
            chunk_names_before = {path.name for path in chunk_root.glob("*.json")}
            self.assertTrue(data_tools._tracked_manifest_is_complete(root, manifest_path))

            write_inputs(root, HEADER + row_a + row_b, [])
            real_atomic_write_json = data_tools.atomic_write_json
            promoted_revisions: list[str] = []

            def fail_after_metadata_promotion(path, payload, *args, **kwargs):
                result = real_atomic_write_json(path, payload, *args, **kwargs)
                if (
                    Path(path).resolve() == meta_path.resolve()
                    and isinstance(payload, dict)
                    and payload.get("last_status") == "ok"
                    and payload.get("catalog_revision") != prior_revision
                ):
                    promoted_revisions.append(str(payload["catalog_revision"]))
                    raise OSError("injected TRACKED.meta promotion failure")
                return result

            with mock.patch.object(
                data_tools,
                "atomic_write_json",
                side_effect=fail_after_metadata_promotion,
            ):
                with self.assertRaisesRegex(OSError, "injected TRACKED.meta promotion failure"):
                    data_tools.build_tracked_catalog(
                        root=root,
                        mode=data_tools.RECONCILIATION_MODE,
                    )

            self.assertEqual(len(promoted_revisions), 1)
            self.assertNotEqual(promoted_revisions[0], prior_revision)
            self.assertEqual(manifest_path.read_bytes(), manifest_before)
            self.assertEqual(meta_path.read_bytes(), metadata_before)
            self.assertEqual(load_manifest(root)["catalog_revision"], prior_revision)
            self.assertEqual(
                json.loads(meta_path.read_text(encoding="utf-8"))["catalog_revision"],
                prior_revision,
            )
            self.assertTrue(data_tools._tracked_manifest_is_complete(root, manifest_path))
            self.assertEqual(
                {path.name for path in chunk_root.glob("*.json")},
                chunk_names_before,
            )
            restored_records = load_records(root, prior_manifest["chunks"])
            self.assertEqual([record["norad_id"] for record in restored_records], ["100001"])

    def test_invalid_snapshot_preserves_last_known_good_manifest(self):
        satcat = HEADER + "OBJECT,2026-001A,100001,PAY,+,US,2026-01-01,AFETR,,92,51,500,490,,,EA,ORB\n"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_inputs(root, satcat, [])
            data_tools.build_tracked_catalog(root=root, mode=data_tools.RECONCILIATION_MODE)
            manifest_path = root / data_tools.TRACKED_MANIFEST_RELATIVE_PATH
            before = manifest_path.read_bytes()
            result = data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                satcat_text="bad,data\n1,2\n",
                gp_payload=[],
            )
            self.assertTrue(result.errors)
            self.assertEqual(manifest_path.read_bytes(), before)

    def test_missing_satcat_persists_failure_and_preserves_last_known_good(self):
        satcat = HEADER + "OBJECT,2026-001A,100001,PAY,+,US,2026-01-01,AFETR,,92,51,500,490,,,EA,ORB\n"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            write_inputs(root, satcat, [gp_record(100001)])
            data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                now=dt.datetime(2026, 8, 30, tzinfo=dt.timezone.utc),
            )
            manifest_path = root / data_tools.TRACKED_MANIFEST_RELATIVE_PATH
            meta_path = root / data_tools.TRACKED_META_RELATIVE_PATH
            manifest_before = manifest_path.read_bytes()
            meta_before = json.loads(meta_path.read_text(encoding="utf-8"))
            (root / data_tools.SATCAT_RELATIVE_PATH).unlink()

            attempted_at = dt.datetime(2026, 8, 31, 12, 0, tzinfo=dt.timezone.utc)
            result = data_tools.build_tracked_catalog(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                now=attempted_at,
            )

            self.assertTrue(result.skipped)
            self.assertTrue(result.errors)
            self.assertEqual(manifest_path.read_bytes(), manifest_before)
            persisted = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertEqual(persisted["last_status"], "failed")
            self.assertEqual(persisted["source_status"], "DEGRADED")
            self.assertEqual(persisted["last_attempt_at"], data_tools.isoformat_utc(attempted_at))
            self.assertEqual(persisted["last_error"], "SATCAT input is unavailable.")
            self.assertLessEqual(len(persisted["last_error"]), data_tools.METADATA_ERROR_MAX_LENGTH)
            self.assertEqual(persisted["catalog_revision"], meta_before["catalog_revision"])
            self.assertEqual(persisted["last_success_at"], meta_before["last_success_at"])
            self.assertEqual(persisted["counts"], meta_before["counts"])

    def test_alpha5_boundaries_round_trip_without_numeric_coercion(self):
        self.assertIsNone(data_tools.alpha5_catalog_id("99999"))
        self.assertEqual(data_tools.alpha5_catalog_id("100000"), "A0000")
        self.assertEqual(data_tools.normalize_catalog_id("A0000"), "100000")
        self.assertEqual(data_tools.alpha5_catalog_id("339999"), "Z9999")
        self.assertEqual(data_tools.normalize_catalog_id("Z9999"), "339999")
        self.assertIsNone(data_tools.alpha5_catalog_id("340000"))
        for raw in ("M/R", "MR", "MISSION RELATED", "MISSION_RELATED"):
            self.assertEqual(data_tools.normalize_object_type(raw), "MISSION_RELATED")


if __name__ == "__main__":
    unittest.main()
