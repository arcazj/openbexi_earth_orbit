import json
import tempfile
import unittest
from pathlib import Path

from services.v21.catalog_registry import CatalogSnapshotError, CatalogSnapshotRegistry


class V21CatalogRegistryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.registry = CatalogSnapshotRegistry(self.root / "runtime")
        self.catalog = self.root / "TLE.json"
        self.catalog.write_text(json.dumps([{"norad_id": "100", "tle_line1": "one", "tle_line2": "two"}]), encoding="utf-8")
        self.metadata = self.root / "TLE.meta.json"
        self.metadata.write_text(
            json.dumps({"last_status": "ok", "mode": "all", "fetched_at": "2026-07-20T00:00:00Z"}),
            encoding="utf-8",
        )

    def test_snapshot_is_content_addressed_and_reproducible(self):
        first = self.registry.snapshot_tle_json(self.catalog, self.metadata)
        second = self.registry.snapshot_tle_json(self.catalog, self.metadata)
        self.assertEqual(first, second)
        self.assertTrue(first.revision_id.startswith("catalog:sha256:"))
        self.assertEqual(first.object_count, 1)
        self.assertEqual(first.source_status, "COMPLETE")
        self.assertEqual(self.registry.load_records(first)[0]["norad_id"], "100")
        self.assertFalse(Path(first.snapshot_path).is_absolute())

    def test_changed_catalog_gets_new_revision_without_mutating_old(self):
        first = self.registry.snapshot_tle_json(self.catalog, self.metadata)
        self.catalog.write_text(json.dumps([{"norad_id": "200"}]), encoding="utf-8")
        second = self.registry.snapshot_tle_json(self.catalog, self.metadata)
        self.assertNotEqual(first.revision_id, second.revision_id)
        self.assertEqual(self.registry.load_records(first)[0]["norad_id"], "100")

    def test_changed_acquisition_metadata_is_append_only_for_same_catalog(self):
        first = self.registry.snapshot_tle_json(self.catalog, self.metadata)
        revision_root = self.registry.resolve_private_path(first.snapshot_path).parent
        frozen_metadata = (revision_root / "source-metadata.json").read_bytes()
        frozen_descriptor = (revision_root / "revision.json").read_bytes()
        self.assertEqual(len(list((revision_root / "acquisitions").glob("*.json"))), 1)

        self.metadata.write_text(
            json.dumps({
                "last_status": "not-modified",
                "mode": "all",
                "source_status": "COMPLETE",
                "fetched_at": "2026-07-21T00:00:00Z",
            }),
            encoding="utf-8",
        )
        second = self.registry.snapshot_tle_json(self.catalog, self.metadata)

        self.assertEqual(second, first)
        self.assertEqual((revision_root / "source-metadata.json").read_bytes(), frozen_metadata)
        self.assertEqual((revision_root / "revision.json").read_bytes(), frozen_descriptor)
        acquisitions = [json.loads(path.read_text(encoding="utf-8")) for path in sorted(
            (revision_root / "acquisitions").glob("*.json")
        )]
        self.assertEqual(len(acquisitions), 2)
        self.assertEqual({item["catalog_revision_id"] for item in acquisitions}, {first.revision_id})
        self.assertEqual(
            {item["retrieved_at"] for item in acquisitions},
            {"2026-07-20T00:00:00Z", "2026-07-21T00:00:00Z"},
        )
        self.assertEqual({item["source_status"] for item in acquisitions}, {"COMPLETE"})

        self.metadata.write_text(
            json.dumps(json.loads(self.metadata.read_text(encoding="utf-8")), indent=2),
            encoding="utf-8",
        )
        third = self.registry.snapshot_tle_json(self.catalog, self.metadata)
        self.assertEqual(third, first)
        self.assertEqual(len(list((revision_root / "acquisitions").glob("*.json"))), 2)

    def test_gp_snapshot_preserves_omm_format_and_v22_adapter_metadata(self):
        gp = self.root / "GP.json"
        gp.write_text(
            json.dumps([{
                "norad_id": "100001",
                "element_set": {
                    "format": "OMM",
                    "omm": {"NORAD_CAT_ID": "100001", "EPOCH": "2026-08-20T00:00:00.000Z"},
                },
            }]),
            encoding="utf-8",
        )
        metadata = self.root / "GP.meta.json"
        metadata.write_text(
            json.dumps({"last_status": "ok", "mode": "all", "fetched_at": "2026-08-20T01:00:00Z"}),
            encoding="utf-8",
        )

        snapshot = self.registry.snapshot_gp_json(gp, metadata)

        self.assertEqual(snapshot.schema_version, "2.2.0")
        self.assertEqual(snapshot.source_format, "CCSDS_OMM_JSON")
        self.assertEqual(snapshot.adapter_version, "openbexi-omm-json-adapter/2.2.0")
        self.assertEqual(snapshot.source_status, "COMPLETE")
        self.assertEqual(self.registry.load_records(snapshot)[0]["norad_id"], "100001")

    def test_source_status_requires_successful_explicit_full_export(self):
        cases = (
            ({"last_status": "ok", "mode": "incremental"}, "PARTIAL"),
            ({"last_status": "ok", "mode": "all", "partial_update": True}, "PARTIAL"),
            ({"last_status": "ok", "mode": "all"}, "COMPLETE"),
            ({"last_status": "ok", "mode": "incremental", "source_status": "COMPLETE"}, "COMPLETE"),
            ({"last_status": "not-modified", "mode": "all", "source_status": "COMPLETE"}, "COMPLETE"),
            ({"last_status": "not-modified", "mode": "all", "source_status": "PARTIAL"}, "PARTIAL"),
            ({"source_status": "COMPLETE"}, "COMPLETE"),
            ({"source_status": "PARTIAL"}, "PARTIAL"),
            ({"last_status": "failed", "mode": "all"}, "DEGRADED"),
            ({"last_status": "failed", "mode": "all", "source_status": "COMPLETE"}, "DEGRADED"),
            ({"last_status": "error", "mode": "all", "source_status": "PARTIAL"}, "DEGRADED"),
            ({"last_status": "unknown", "mode": "all"}, "DEGRADED"),
            ({"last_status": "ok"}, "DEGRADED"),
        )
        for index, (metadata, expected) in enumerate(cases):
            with self.subTest(metadata=metadata):
                self.catalog.write_text(
                    json.dumps([{"norad_id": str(100 + index), "tle_line1": "one", "tle_line2": "two"}]),
                    encoding="utf-8",
                )
                self.metadata.write_text(json.dumps(metadata), encoding="utf-8")
                snapshot = self.registry.snapshot_tle_json(self.catalog, self.metadata)
                self.assertEqual(snapshot.source_status, expected)

    def test_invalid_or_oversized_catalog_fails_closed(self):
        self.catalog.write_text("{}", encoding="utf-8")
        with self.assertRaises(CatalogSnapshotError):
            self.registry.snapshot_tle_json(self.catalog)
        tiny_registry = CatalogSnapshotRegistry(self.root / "tiny", max_bytes=3)
        self.catalog.write_text("[{}]", encoding="utf-8")
        with self.assertRaises(CatalogSnapshotError):
            tiny_registry.snapshot_tle_json(self.catalog)

    def test_private_path_cannot_escape_runtime_root(self):
        with self.assertRaises(CatalogSnapshotError):
            self.registry.resolve_private_path("../outside.json")


if __name__ == "__main__":
    unittest.main()
