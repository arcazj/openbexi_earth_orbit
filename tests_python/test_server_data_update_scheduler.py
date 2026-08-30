import contextlib
import inspect
import io
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

import server


def status_snapshot():
    with server.DATA_UPDATE_STATUS_LOCK:
        return dict(server.DATA_UPDATE_STATUS)


def write_dataset_metadata(root: Path, *, tle_error: str) -> dict[str, dict[str, object]]:
    metadata = {
        "gp": {
            "catalog_revision": "sha256:gp-history",
            "last_status": "ok",
            "last_attempt_at": "2026-08-29T01:00:00Z",
            "last_success_at": "2026-08-29T01:00:00Z",
        },
        "tle": {
            "catalog_revision": "sha256:tle-history",
            "last_status": "failed",
            "last_attempt_at": "2026-08-29T02:00:00Z",
            "last_success_at": "2026-08-28T02:00:00Z",
            "last_error": tle_error,
        },
        "satcat": {
            "dataset_hash": "sha256:satcat-history",
            "last_status": "not-modified",
            "last_attempt_at": "2026-08-29T03:00:00Z",
            "last_success_at": "2026-08-29T03:00:00Z",
        },
        "launch": {
            "catalog_revision": "sha256:launch-history",
            "last_status": "ok",
            "last_attempt_at": "2026-08-29T04:00:00Z",
            "last_success_at": "2026-08-29T04:00:00Z",
        },
        "decay": {
            "catalog_revision": "sha256:decay-history",
            "last_status": "ok",
            "last_attempt_at": "2026-08-29T05:00:00Z",
            "last_success_at": "2026-08-29T05:00:00Z",
        },
    }
    paths = {
        "gp": root / "json" / "gp" / "GP.meta.json",
        "tle": root / "json" / "tle" / "TLE.meta.json",
        "satcat": root / "json" / "satcat.meta.json",
        "launch": root / "json" / "launches" / "launches.meta.json",
        "decay": root / "json" / "decayed" / "decayed.meta.json",
    }
    for name, path in paths.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(metadata[name]), encoding="utf-8")
    return metadata


class ServerDataUpdateSchedulerTests(unittest.TestCase):
    def setUp(self):
        with server.DATA_UPDATE_STATUS_LOCK:
            self.original_status = dict(server.DATA_UPDATE_STATUS)

    def tearDown(self):
        with server.DATA_UPDATE_STATUS_LOCK:
            server.DATA_UPDATE_STATUS.clear()
            server.DATA_UPDATE_STATUS.update(self.original_status)

    def test_cycle_passes_independent_intervals_and_reports_dataset_state(self):
        result = {
            "skipped": False,
            "degraded": False,
            "due": {"gp": True, "tle": False, "satcat": True, "reconciliation": False},
            "gp": {"changed": True, "skipped": False, "message": "GP updated"},
            "tle": {"changed": False, "skipped": True, "message": "TLE is current"},
            "satcat": {"changed": False, "skipped": True, "message": "SATCAT not modified"},
            "reconciliation": {"changed": False, "skipped": True, "message": "Not due"},
        }
        registered = mock.Mock()
        scheduler = server.DataUpdateScheduler(
            interval_hours=30,
            gp_interval_hours=24,
            tle_interval_hours=36,
            satcat_interval_hours=48,
            reconciliation_interval_hours=72,
            on_updated=registered,
            clock=lambda: 1_800_000_000.0,
        )

        with mock.patch.object(server, "maybe_update_satellite_data", return_value=result) as update:
            state = scheduler.run_once()

        self.assertEqual(state, "succeeded")
        update.assert_called_once_with(
            root=server.ROOT,
            interval_hours=30,
            gp_interval_hours=24,
            tle_interval_hours=36,
            satcat_interval_hours=48,
            reconciliation_interval_hours=72,
        )
        registered.assert_called_once_with()
        status = status_snapshot()
        self.assertEqual(status["state"], "succeeded")
        self.assertEqual(status["consecutive_failures"], 0)
        self.assertEqual(status["dataset_status"]["gp"]["state"], "updated")
        self.assertTrue(status["dataset_status"]["gp"]["due"])
        self.assertEqual(status["dataset_status"]["tle"]["state"], "skipped")
        self.assertFalse(status["dataset_status"]["tle"]["due"])

    def test_status_snapshot_reconstructs_dataset_history_after_restart(self):
        secret = "provider-token-value"
        metadata_error = (
            f"TLE provider failed\nAuthorization={secret} Bearer second-secret "
            + ("x" * (server.DATA_UPDATE_ERROR_MAX_LENGTH + 200))
        )
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            metadata = write_dataset_metadata(root, tle_error=metadata_error)
            with server.DATA_UPDATE_STATUS_LOCK:
                server.DATA_UPDATE_STATUS.clear()
                server.DATA_UPDATE_STATUS.update({
                    "enabled": False,
                    "running": False,
                    "state": "disabled",
                    "interval_hours": 24,
                    "intervals_hours": {
                        "gp": 24,
                        "tle": 24,
                        "satcat": 24,
                        "reconciliation": 24,
                    },
                    "dataset_status": {},
                    "last_error": None,
                    "last_errors": [],
                })
            with mock.patch.object(server, "ROOT", root):
                snapshot = server._data_update_status_snapshot()

        expected_names = {
            "gp": "gp",
            "tle": "tle",
            "satcat": "satcat",
            "launch": "launches",
            "decay": "decayed",
        }
        for metadata_name, status_name in expected_names.items():
            with self.subTest(dataset=status_name):
                dataset = snapshot["dataset_status"][status_name]
                self.assertEqual(dataset["last_status"], metadata[metadata_name]["last_status"])
                self.assertEqual(dataset["last_attempt_at"], metadata[metadata_name]["last_attempt_at"])
                self.assertEqual(dataset["last_success_at"], metadata[metadata_name]["last_success_at"])
        self.assertEqual(snapshot["dataset_status"]["gp"]["state"], "current")
        self.assertEqual(snapshot["dataset_status"]["tle"]["state"], "degraded")
        self.assertEqual(snapshot["catalog_state"], "degraded")
        self.assertEqual(snapshot["tle_revision"], "sha256:tle-history")
        self.assertEqual(snapshot["datasets"]["tle"]["revision"], "sha256:tle-history")
        public_error = snapshot["dataset_status"]["tle"]["last_error"]
        self.assertNotIn(secret, public_error)
        self.assertNotIn("second-secret", public_error)
        self.assertIn("<redacted>", public_error)
        self.assertLessEqual(len(public_error), server.DATA_UPDATE_ERROR_MAX_LENGTH)
        self.assertEqual(snapshot["last_error"], public_error)
        self.assertIn(public_error, snapshot["last_errors"])

    def test_not_due_cycle_overlays_live_state_without_losing_metadata_history(self):
        result = {
            "skipped": True,
            "degraded": False,
            "due": {
                "gp": False,
                "tle": False,
                "satcat": False,
                "launches": False,
                "decayed": False,
                "reconciliation": {
                    "gp": False,
                    "tle": False,
                    "satcat": False,
                    "launches": False,
                    "decayed": False,
                },
            },
            "gp": None,
            "tle": None,
            "satcat": None,
            "launches": None,
            "decayed": None,
            "reconciliation": {
                "changed": False,
                "skipped": True,
                "due": False,
                "message": "Satellite data reconciliation is not due.",
            },
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            metadata = write_dataset_metadata(root, tle_error="TLE source unavailable")
            scheduler = server.DataUpdateScheduler(clock=lambda: 1_800_000_000.0)
            with (
                mock.patch.object(server, "ROOT", root),
                mock.patch.object(server, "maybe_update_satellite_data", return_value=result),
            ):
                self.assertEqual(scheduler.run_once(), "skipped")
                snapshot = server._data_update_status_snapshot()

        gp = snapshot["dataset_status"]["gp"]
        self.assertEqual(gp["state"], "not-due")
        self.assertFalse(gp["due"])
        self.assertEqual(gp["last_checked_at"], "2027-01-15T08:00:00Z")
        self.assertEqual(gp["last_status"], metadata["gp"]["last_status"])
        self.assertEqual(gp["last_attempt_at"], metadata["gp"]["last_attempt_at"])
        self.assertEqual(gp["last_success_at"], metadata["gp"]["last_success_at"])
        tle = snapshot["dataset_status"]["tle"]
        self.assertEqual(tle["state"], "not-due")
        self.assertFalse(tle["due"])
        self.assertEqual(tle["last_status"], "failed")
        self.assertEqual(tle["last_error"], "TLE source unavailable")
        self.assertEqual(snapshot["last_error"], "TLE source unavailable")
        self.assertEqual(snapshot["dataset_status"]["reconciliation"]["state"], "skipped")

    def test_public_snapshot_recursively_sanitizes_live_result(self):
        live_secret = "live-provider-secret"
        nested_secret = "nested-provider-secret"
        message_secret = "message-provider-secret"
        plain_secrets = {
            "authorization": "plain-authorization-value",
            "api_key": "plain-api-key-value",
            "api-key": "plain-dashed-api-key-value",
            "refreshToken": "plain-refresh-token-value",
            "password": "plain-password-value",
            "passwd": "plain-passwd-value",
            "client_secret": {"value": "plain-structured-secret-value"},
        }
        result = {
            "skipped": False,
            "degraded": True,
            "gp": {
                "changed": False,
                "skipped": True,
                "errors": [
                    f"authorization={live_secret}\n" + ("x" * (server.DATA_UPDATE_ERROR_MAX_LENGTH + 200)),
                    *[f"secondary failure {index}" for index in range(server.DATA_UPDATE_ERROR_MAX_ITEMS + 5)],
                ],
                "details": {
                    "error": f"password={nested_secret}\r\nBearer another-secret",
                    "message": (
                        f"retry with Bearer {message_secret}\t"
                        + ("y" * (server.DATA_UPDATE_ERROR_MAX_LENGTH + 200))
                    ),
                    **plain_secrets,
                },
            },
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            scheduler = server.DataUpdateScheduler(clock=lambda: 1_800_000_000.0)
            with (
                mock.patch.object(server, "ROOT", root),
                mock.patch.object(server, "maybe_update_satellite_data", return_value=result),
            ):
                self.assertEqual(scheduler.run_once(), "degraded")
                self.assertIn(live_secret, status_snapshot()["last_result"]["gp"]["errors"][0])
                snapshot = server._data_update_status_snapshot()

        public_gp = snapshot["last_result"]["gp"]
        public_text = json.dumps(public_gp)
        for secret in (live_secret, nested_secret, message_secret, "another-secret"):
            self.assertNotIn(secret, public_text)
        for key, secret in plain_secrets.items():
            self.assertEqual(public_gp["details"][key], "<redacted>")
            if isinstance(secret, str):
                self.assertNotIn(secret, public_text)
            else:
                self.assertNotIn(secret["value"], public_text)
        self.assertIn("<redacted>", public_text)
        self.assertNotIn("\n", public_gp["errors"][0])
        self.assertNotIn("\r", public_gp["details"]["error"])
        self.assertNotIn("\t", public_gp["details"]["message"])
        self.assertLessEqual(len(public_gp["errors"]), server.DATA_UPDATE_ERROR_MAX_ITEMS)
        self.assertLessEqual(len(public_gp["errors"][0]), server.DATA_UPDATE_ERROR_MAX_LENGTH)
        self.assertLessEqual(len(public_gp["details"]["message"]), server.DATA_UPDATE_ERROR_MAX_LENGTH)

    def test_server_interval_arguments_match_the_data_tool_contract(self):
        inspect.signature(server.maybe_update_satellite_data).bind(
            root=server.ROOT,
            interval_hours=24,
            gp_interval_hours=24,
            tle_interval_hours=24,
            satcat_interval_hours=24,
            reconciliation_interval_hours=24,
        )

    def test_failures_use_bounded_exponential_backoff_and_success_resets_it(self):
        scheduler = server.DataUpdateScheduler(
            initial_delay_seconds=0,
            jitter=lambda lower, _upper: lower,
            clock=lambda: 1_800_000_000.0,
        )
        with mock.patch.object(server, "maybe_update_satellite_data", side_effect=RuntimeError("provider unavailable")):
            self.assertEqual(scheduler.run_once(), "failed")
            self.assertEqual(scheduler._failure_delay_seconds(), 240.0)
            self.assertEqual(scheduler.run_once(), "failed")
            self.assertEqual(scheduler._failure_delay_seconds(), 480.0)

        with mock.patch.object(
            server,
            "maybe_update_satellite_data",
            return_value={"skipped": True, "degraded": False},
        ):
            self.assertEqual(scheduler.run_once(), "skipped")
        self.assertEqual(scheduler.consecutive_failures, 0)
        self.assertEqual(status_snapshot()["consecutive_failures"], 0)

    def test_degraded_auxiliary_dataset_still_registers_changed_gp_and_reports_errors(self):
        result = {
            "skipped": False,
            "degraded": True,
            "gp": {"changed": True, "skipped": False},
            "tle": {"changed": False, "skipped": True, "errors": ["TLE source unavailable"]},
            "satcat": {"changed": False, "skipped": True, "error": "SATCAT source unavailable"},
        }
        registered = mock.Mock()
        scheduler = server.DataUpdateScheduler(on_updated=registered)

        with mock.patch.object(server, "maybe_update_satellite_data", return_value=result):
            self.assertEqual(scheduler.run_once(), "degraded")

        registered.assert_called_once_with()
        status = status_snapshot()
        self.assertEqual(status["last_error"], "TLE source unavailable")
        self.assertEqual(
            status["last_errors"],
            ["TLE source unavailable", "SATCAT source unavailable"],
        )
        self.assertEqual(status["dataset_status"]["tle"]["state"], "degraded")
        self.assertEqual(status["dataset_status"]["satcat"]["state"], "degraded")

    def test_tle_fallback_change_registers_catalog_but_launch_only_change_does_not(self):
        registered = mock.Mock()
        scheduler = server.DataUpdateScheduler(on_updated=registered)
        with mock.patch.object(
            server,
            "maybe_update_satellite_data",
            return_value={"skipped": False, "tle": {"changed": True}},
        ):
            self.assertEqual(scheduler.run_once(), "succeeded")
        registered.assert_called_once_with()

        registered.reset_mock()
        with mock.patch.object(
            server,
            "maybe_update_satellite_data",
            return_value={"skipped": False, "launches": {"changed": True}},
        ):
            self.assertEqual(scheduler.run_once(), "succeeded")
        registered.assert_not_called()

    def test_success_polling_uses_due_hint_and_never_exceeds_one_hour(self):
        scheduler = server.DataUpdateScheduler(clock=lambda: 1_800_000_000.0)
        self.assertEqual(scheduler._success_delay_seconds({"next_due_in_seconds": 120}), 120)
        self.assertEqual(scheduler._success_delay_seconds({"next_due_in_seconds": 20_000}), 3600)
        self.assertEqual(scheduler._success_delay_seconds({"next_due_in_seconds": 1}), 60)
        self.assertEqual(
            scheduler._success_delay_seconds({"next_due_at": "2027-01-15T08:02:00Z"}),
            120,
        )

    def test_background_catch_up_is_non_blocking_and_stop_is_graceful(self):
        cycle_finished = threading.Event()

        def update(**_kwargs):
            cycle_finished.set()
            return {"skipped": True, "degraded": False}

        scheduler = server.DataUpdateScheduler(initial_delay_seconds=0)
        with mock.patch.object(server, "maybe_update_satellite_data", side_effect=update):
            scheduler.start()
            self.assertTrue(cycle_finished.wait(timeout=2), "initial catch-up cycle ran in the background")
            scheduler.stop(timeout_seconds=2)

        self.assertFalse(scheduler.thread.is_alive())
        status = status_snapshot()
        self.assertEqual(status["state"], "stopped")
        self.assertFalse(status["running"])
        self.assertFalse(status["worker_alive"])
        self.assertIsNone(status["next_check_at"])

    def test_main_binds_server_before_starting_scheduler_and_stops_worker_first(self):
        events = []
        scheduler_kwargs = {}

        class FakeServer:
            def __init__(self, *_args, **_kwargs):
                events.append("bind")

            def serve_forever(self):
                events.append("serve")

            def server_close(self):
                events.append("server-close")

        class FakeScheduler:
            def __init__(self, **kwargs):
                scheduler_kwargs.update(kwargs)
                self.intervals_hours = {
                    "gp": kwargs["gp_interval_hours"],
                    "tle": kwargs["tle_interval_hours"],
                    "satcat": kwargs["satcat_interval_hours"],
                    "reconciliation": kwargs["reconciliation_interval_hours"],
                }

            def start(self):
                events.append("scheduler-start")

            def stop(self):
                events.append("scheduler-stop")

        args = server.parse_args([
            "--port", "0",
            "--no-v21-service",
            "--update-data-on-schedule",
            "--gp-update-interval-hours", "24",
            "--tle-update-interval-hours", "24",
            "--satcat-update-interval-hours", "24",
            "--reconciliation-interval-hours", "24",
        ])
        with (
            mock.patch.object(server, "parse_args", return_value=args),
            mock.patch.object(server, "ThreadingHTTPServer", FakeServer),
            mock.patch.object(server, "DataUpdateScheduler", FakeScheduler),
            mock.patch("builtins.print"),
        ):
            server.main()

        self.assertEqual(events, ["bind", "scheduler-start", "serve", "scheduler-stop", "server-close"])
        self.assertEqual(scheduler_kwargs["interval_hours"], 24)
        self.assertEqual(scheduler_kwargs["gp_interval_hours"], 24)
        self.assertEqual(scheduler_kwargs["tle_interval_hours"], 24)
        self.assertEqual(scheduler_kwargs["satcat_interval_hours"], 24)
        self.assertEqual(scheduler_kwargs["reconciliation_interval_hours"], 24)

    def test_cli_defaults_to_daily_intervals_and_accepts_per_dataset_overrides(self):
        defaults = server.parse_args(["--update-data-on-schedule"])
        self.assertEqual(defaults.data_update_interval_hours, 24)
        self.assertIsNone(defaults.gp_update_interval_hours)
        self.assertIsNone(defaults.tle_update_interval_hours)
        self.assertIsNone(defaults.satcat_update_interval_hours)
        self.assertEqual(defaults.reconciliation_interval_hours, 24)

        configured = server.parse_args([
            "--update-data-on-schedule",
            "--gp-update-interval-hours", "25",
            "--tle-update-interval-hours", "26",
            "--satcat-update-interval-hours", "27",
            "--reconciliation-interval-hours", "28",
        ])
        self.assertEqual(configured.gp_update_interval_hours, 25)
        self.assertEqual(configured.tle_update_interval_hours, 26)
        self.assertEqual(configured.satcat_update_interval_hours, 27)
        self.assertEqual(configured.reconciliation_interval_hours, 28)

        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                server.parse_args(["--gp-update-interval-hours", "0.5"])
            with self.assertRaises(SystemExit):
                server.parse_args(["--gp-update-interval-hours", "nan"])


if __name__ == "__main__":
    unittest.main()
