import datetime as dt
import io
import json
import os
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from tools import satellite_data_tools as tools
from tools.background_updates import IsolatedDataPlane, restore_snapshot
from tools.provider_queries import ProviderHTTPError, ProviderPaused, ProviderQueries
from tools.satellite_data_plane import SatelliteDataPlane
from tests_python.test_v232_satellite_data_plane import seed_repository, NOW


class SmartDataUpdatesTests(unittest.TestCase):
    def test_refresh_runs_in_another_process_and_promotes_local_repair(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            progress = []
            plane = SatelliteDataPlane(repository_root=root, state_root=root / "runtime" / "data-plane")
            result = IsolatedDataPlane(plane).stage_update(interval_hours=100000,
                reconciliation_interval_hours=100000, only="launches", on_progress=progress.append)
            self.assertFalse(result.get("degraded"), result)
            pid = next(item["worker_pid"] for item in progress if "worker_pid" in item)
            self.assertNotEqual(pid, os.getpid())
            self.assertTrue((plane.current_root() / tools.LAUNCHES_RELATIVE_PATH).is_file())
            self.assertFalse((plane.state_root / "provider-queries.json").exists(), "local repair must not query providers")

    def test_http_error_stops_other_urls_and_survives_restart(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "ledger.json"
            upstream = mock.Mock(side_effect=ProviderHTTPError("rate limited", status=429, retry_after="14400"))
            queries = ProviderQueries(path, upstream, now=NOW)
            with self.assertRaises(ProviderHTTPError):
                queries("https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json")
            with self.assertRaises(ProviderPaused):
                queries("https://celestrak.org/pub/satcat.csv")
            with self.assertRaises(ProviderPaused):
                ProviderQueries(path, upstream, now=NOW + dt.timedelta(days=2))("https://celestrak.org/pub/satcat.csv")
            self.assertEqual(upstream.call_count, 1)
            state = json.loads(path.read_text())
            allowed = next(iter(state["urls"].values()))["next_allowed_at"]
            self.assertEqual(tools.parse_iso_datetime(allowed), NOW + dt.timedelta(hours=4))

    def test_cached_response_repairs_missing_data_without_second_download(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "ledger.json"
            url = "https://celestrak.org/pub/satcat.csv"
            upstream = mock.Mock(return_value=tools.FetchResponse(url=url, text="cached source"))
            first = ProviderQueries(path, upstream, now=NOW)(url)
            second = ProviderQueries(path, upstream, now=NOW + dt.timedelta(minutes=1))(url)
            self.assertEqual(first.text, second.text)
            self.assertEqual(upstream.call_count, 1)

    def test_plan_is_read_only_and_selection_includes_local_dependencies(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            before = {str(path.relative_to(root)): path.read_bytes() for path in root.rglob("*") if path.is_file()}
            with mock.patch.object(tools, "fetch_url", side_effect=AssertionError("plan made a network request")):
                plan = tools.scheduled_data_update_plan(root=root, only="satcat", now=NOW)
            after = {str(path.relative_to(root)): path.read_bytes() for path in root.rglob("*") if path.is_file()}
            self.assertEqual(before, after)
            self.assertFalse(plan["due"]["gp"])
            self.assertFalse(plan["due"]["tle"])
            self.assertIn("tracked", plan["selected"])
            with self.assertRaises(tools.SatelliteDataError):
                tools.scheduled_data_update_plan(root=root, only="typo", now=NOW)

    def test_same_satcat_revision_skips_derived_rebuilds_and_damage_is_due(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            tools.build_launch_catalog(root=root, now=NOW)
            tools.build_decayed_db(root=root, force=True, now=NOW)
            plan = tools.scheduled_data_update_plan(root=root, now=NOW + dt.timedelta(days=3))
            self.assertFalse(plan["due"]["launches"])
            self.assertFalse(plan["due"]["decayed"])
            (root / tools.LAUNCHES_RELATIVE_PATH).write_text("[]")
            self.assertTrue(tools.scheduled_data_update_plan(root=root, now=NOW)["due"]["launches"])

    def test_satcat_change_enriches_gp_tle_without_provider_requests(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            changed = tools.UpdateResult(True, False, "refresh-satcat", "changed")
            unchanged = tools.UpdateResult(False, False, "incremental", "unchanged")
            with mock.patch.object(tools, "refresh_satcat_csv", return_value=changed), \
                 mock.patch.object(tools, "export_gp_data", return_value=unchanged) as gp, \
                 mock.patch.object(tools, "export_tle_data", return_value=unchanged) as tle:
                tools.maybe_update_satellite_data(root=root, only="satcat", now=NOW + dt.timedelta(days=3), dry_run=True)
            self.assertTrue(gp.call_args.kwargs["local_only"])
            self.assertTrue(tle.call_args.kwargs["local_only"])

    def test_untrusted_cloud_archive_cannot_escape_state_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            plane = SatelliteDataPlane(repository_root=root, state_root=root / "runtime")
            body = io.BytesIO()
            with tarfile.open(fileobj=body, mode="w") as archive:
                item = tarfile.TarInfo("../escaped.txt")
                item.size = 1
                archive.addfile(item, io.BytesIO(b"x"))
            with self.assertRaises(ValueError):
                restore_snapshot(body.getvalue(), plane)
            self.assertFalse((root / "escaped.txt").exists())


if __name__ == "__main__":
    unittest.main()
