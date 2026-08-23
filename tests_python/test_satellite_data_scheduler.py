import tempfile
import unittest
from pathlib import Path
from unittest import mock

from tools import satellite_data_tools as data_tools


class _Result:
    def __init__(self, name: str):
        self.name = name

    def to_dict(self):
        return {
            "changed": True,
            "skipped": False,
            "mode": self.name,
            "message": f"{self.name} fixture",
            "counts": {},
            "errors": [],
            "paths": {},
        }


class ScheduledDataUpdateTests(unittest.TestCase):
    def test_launch_and_decay_due_work_run_independently(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)

            def is_due(_root, metadata_path, _data_path, _hours):
                return metadata_path in {
                    data_tools.LAUNCHES_META_RELATIVE_PATH,
                    data_tools.DECAYED_META_RELATIVE_PATH,
                }

            with (
                mock.patch.object(data_tools, "metadata_is_older_than", side_effect=is_due),
                mock.patch.object(data_tools, "build_decayed_db", return_value=_Result("decayed")) as decayed,
                mock.patch.object(data_tools, "build_launch_catalog", return_value=_Result("launches")) as launches,
                mock.patch.object(data_tools, "export_gp_data", return_value=_Result("gp")) as gp,
            ):
                result = data_tools.maybe_update_satellite_data(
                    root=root,
                    interval_hours=24,
                    dry_run=True,
                )

            decayed.assert_called_once_with(
                root=root,
                mode="incremental",
                force=False,
                dry_run=True,
                interval_hours=24,
                refresh_satcat=True,
            )
            launches.assert_called_once_with(root=root, dry_run=True)
            gp.assert_not_called()
            self.assertEqual(result["decayed"]["mode"], "decayed")
            self.assertEqual(result["launches"]["mode"], "launches")
            self.assertFalse(result["skipped"])
            self.assertFalse(result["degraded"])


if __name__ == "__main__":
    unittest.main()
