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
from tests_python.test_v232_satellite_data_plane import seed_repository, changed_launch_updater, NOW
from tests_python.test_satellite_data_scheduler import _omm


class SmartDataUpdatesTests(unittest.TestCase):
    def test_restored_snapshot_is_selectable_and_idempotent_after_resealing(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            source = SatelliteDataPlane(repository_root=root, state_root=root / "source")
            self.assertTrue(source.stage_update(promote=True, updater=changed_launch_updater("cloud"))["promoted"])
            body = io.BytesIO()
            with tarfile.open(fileobj=body, mode="w") as archive:
                for path in source.current_root().rglob("*"):
                    if path.is_file():
                        archive.add(path, arcname=path.relative_to(source.state_root).as_posix(), recursive=False)
                archive.add(source.pointer_path, arcname="current.json")
            destination = SatelliteDataPlane(repository_root=root, state_root=root / "destination")
            restore_snapshot(body.getvalue(), destination)
            self.assertEqual(destination.pointer()["candidate_revision"], source.pointer()["candidate_revision"])
            self.assertNotEqual(destination.current_root(), root)
            restore_snapshot(body.getvalue(), destination)
            self.assertIsNotNone(destination.pointer())

    def test_formats_share_admission_including_legacy_ledgers(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "ledger.json"
            tle = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"
            gp = "https://celestrak.org/NORAD/elements/gp.php?FORMAT=json&GROUP=active"
            upstream = mock.Mock(return_value=tools.FetchResponse(url=tle, text="downloaded"))
            ProviderQueries(path, upstream, now=NOW)(tle)
            state = json.loads(path.read_text())
            state.pop("scopes")  # A previous version persisted only URL admission.
            path.write_text(json.dumps(state))
            with self.assertRaises(ProviderPaused):
                ProviderQueries(path, upstream, now=NOW + dt.timedelta(minutes=1))(gp)
            self.assertEqual(upstream.call_count, 1)

    def test_scheduled_tle_downloads_only_gp_once_per_group(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            calls = []
            def fetcher(url, headers=None):
                calls.append(url)
                return tools.FetchResponse(url=url, text=json.dumps([_omm(25544), _omm(100001)]))
            result = tools.maybe_update_satellite_data(root=root, only="tle", force=True, now=NOW, fetcher=fetcher)
            self.assertFalse(result["degraded"], result)
            self.assertEqual(len(calls), len(tools.GP_SOURCE_GROUPS))
            self.assertTrue(all("FORMAT=json" in url for url in calls))
            tle = json.loads((root / tools.TLE_RELATIVE_PATH).read_text())
            self.assertIn("25544", {item["norad_id"] for item in tle})
            self.assertNotIn("100001", {item["norad_id"] for item in tle})
            self.assertEqual(result["tle"]["counts"]["unrepresentable"], 1)

    def test_omm_legacy_encoding_preserves_epoch_and_elements_with_valid_checksums(self):
        record = _omm(25544)
        record.update(EPOCH="2026-10-03T12:00:00Z", MEAN_MOTION_DOT=-0.00009145,
                      BSTAR=0.00016852, MEAN_MOTION_DDOT=0.0000012345)
        line1, line2 = tools.omm_to_tle(record)
        self.assertEqual(len(line1), 69)
        self.assertEqual(len(line2), 69)
        self.assertTrue(tools.tle_checksum_is_valid(line1))
        self.assertTrue(tools.tle_checksum_is_valid(line2))
        self.assertEqual(tools.tle_epoch_datetime(line1), tools.parse_iso_datetime(record["EPOCH"]))
        self.assertAlmostEqual(float(line1[33:43]), record["MEAN_MOTION_DOT"], places=8)
        self.assertEqual(line1[44:52], " 12345-5")
        self.assertEqual(line1[53:61], " 16852-3")
        metrics = tools.extract_orbit_metrics(line2)
        self.assertAlmostEqual(metrics["mean_motion_rev_per_day"], record["MEAN_MOTION"], places=8)
        with self.assertRaises(tools.SatelliteDataError):
            tools.omm_to_tle(_omm(100001))

    def test_cooldown_plan_replays_newer_cache_and_schedules_deferred_gp(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed_repository(root)
            ledger = root / "runtime" / "provider-queries.json"
            upstream = mock.Mock(return_value=tools.FetchResponse(url=tools.CELESTRAK_SATCAT_CSV_URL,
                text=(root / tools.SATCAT_RELATIVE_PATH).read_text()))
            ProviderQueries(ledger, upstream, now=NOW + dt.timedelta(days=3))(tools.CELESTRAK_SATCAT_CSV_URL)
            # A successful TLE download also defers GP of the same GROUP.
            upstream.return_value = tools.FetchResponse(url=tools.source_urls_for_mode("incremental")[0], text="unused")
            ProviderQueries(ledger, upstream, now=NOW + dt.timedelta(days=3))(upstream.return_value.url)
            plan = tools.scheduled_data_update_plan(root=root, now=NOW + dt.timedelta(days=3, minutes=1))
            self.assertIn("satcat", plan["cached_sources"])
            self.assertFalse(plan["due"]["gp"])
            self.assertEqual(plan["next_check_in_seconds"], 7140)
            with mock.patch.object(tools, "derive_tle_from_gp", return_value=tools.UpdateResult(False, True, "derived-gp", "cached")):
                result = tools.maybe_update_satellite_data(root=root, only="satcat", now=NOW + dt.timedelta(days=3, minutes=1),
                    fetcher=mock.Mock(side_effect=AssertionError("cache activation contacted provider")))
            self.assertFalse(result["degraded"], result)
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
            self.assertEqual(plan["reasons"]["tle"], "derive compatibility TLE from local GP/cache")
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
