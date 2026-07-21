import json
import tempfile
import unittest
from pathlib import Path

from services.v21.feature_flags import load_server_feature_flag


class V21FeatureFlagTests(unittest.TestCase):
    def fixture(self, *, flag_overrides=None, release_overrides=None):
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        (root / "release").mkdir()
        (root / "docs" / "science").mkdir(parents=True)
        limitation = "docs/science/full.md"
        (root / limitation).write_text("limits", encoding="utf-8")
        release = {
            "version": "2.1.0",
            "channel": "development",
            "maturity": "experimental",
            "safetyClass": "non-operational",
            **(release_overrides or {}),
        }
        flag = {
            "id": "experimental_full_catalog_screening",
            "enabled": True,
            "enabledChannels": ["development"],
            "scope": "server",
            "scientificMaturity": "Experimental",
            "safetyClass": "non-operational",
            "owner": "project-maintainers",
            "limitationsDocument": limitation,
            **(flag_overrides or {}),
        }
        (root / "release" / "version.json").write_text(json.dumps(release), encoding="utf-8")
        (root / "release" / "feature-flags.json").write_text(
            json.dumps({"schemaVersion": 1, "releaseVersion": release["version"], "flags": [flag]}),
            encoding="utf-8",
        )
        return temporary, root

    def test_enabled_server_flag_requires_all_release_conditions(self):
        temporary, root = self.fixture()
        self.addCleanup(temporary.cleanup)
        flag = load_server_feature_flag(root, "experimental_full_catalog_screening")
        self.assertTrue(flag.enabled)
        self.assertEqual(flag.scope, "server")

    def test_channel_or_maturity_drift_disables_flag(self):
        temporary, root = self.fixture(release_overrides={"channel": "preview"})
        self.addCleanup(temporary.cleanup)
        self.assertFalse(load_server_feature_flag(root, "experimental_full_catalog_screening").enabled)

    def test_missing_flag_scope_or_limitations_fails_closed(self):
        temporary, root = self.fixture(flag_overrides={"scope": "browser"})
        self.addCleanup(temporary.cleanup)
        with self.assertRaises(RuntimeError):
            load_server_feature_flag(root, "experimental_full_catalog_screening")

        temporary2, root2 = self.fixture(flag_overrides={"limitationsDocument": "docs/science/missing.md"})
        self.addCleanup(temporary2.cleanup)
        with self.assertRaises(RuntimeError):
            load_server_feature_flag(root2, "experimental_full_catalog_screening")


if __name__ == "__main__":
    unittest.main()
