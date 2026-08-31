import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from tools import satellite_data_tools as data_tools


SATCAT_FIXTURE = (
    "OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,OBJECT_TYPE,OPS_STATUS_CODE,LAUNCH_DATE,LAUNCH_SITE,DECAY_DATE\n"
    "CURRENT PAY,2026-001A,100001,PAY,+,2026-08-20,AFETR,\n"
    "CURRENT DECAY,2026-002A,100002,PAY,D,2026-08-21,AFETR,2026-08-22\n"
)

TLE_FIXTURE = """ISS (ZARYA)
1 25544U 98067A   26240.24769802  .00009145  00000+0  16852-2 0  9994
2 25544  51.6400 135.3804 0003061  72.2548 287.8794 15.48314930362059
"""


def _omm(norad_id: int, epoch: str = "2026-08-28T12:00:00Z") -> dict[str, object]:
    return {
        "OBJECT_NAME": f"OBJECT {norad_id}",
        "OBJECT_ID": "2026-001A",
        "EPOCH": epoch,
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


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def _tle_catalog(first_norad: int, count: int) -> str:
    templates = TLE_FIXTURE.splitlines()[1:]

    def line_for_norad(template: str, norad_id: int) -> str:
        material = f"{template[:2]}{norad_id:05d}{template[7:68]}"
        checksum = sum(int(char) for char in material if char.isdigit()) + material.count("-")
        return f"{material}{checksum % 10}"

    blocks = []
    for norad_id in range(first_norad, first_norad + count):
        blocks.extend(
            (
                f"UNRELATED {norad_id}",
                line_for_norad(templates[0], norad_id),
                line_for_norad(templates[1], norad_id),
            )
        )
    return "\n".join(blocks) + "\n"


def _result(name: str) -> data_tools.UpdateResult:
    return data_tools.UpdateResult(
        changed=True,
        skipped=False,
        mode=name,
        message=f"{name} fixture",
    )


class ScheduledDataUpdateTests(unittest.TestCase):
    def test_decayed_missing_satcat_after_refresh_failure_persists_error(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            attempted_at = dt.datetime(2026, 8, 30, 12, 0, tzinfo=dt.timezone.utc)
            refresh_failure = data_tools.UpdateResult(
                changed=False,
                skipped=True,
                mode="refresh-satcat",
                message="SATCAT unavailable",
                errors=["provider unavailable " + ("x" * 3000)],
            )
            with mock.patch.object(
                data_tools,
                "refresh_satcat_csv",
                return_value=refresh_failure,
            ):
                result = data_tools.build_decayed_db(
                    root=root,
                    refresh_satcat=True,
                    now=attempted_at,
                )

            self.assertTrue(result.skipped)
            self.assertTrue(result.errors)
            meta = json.loads(
                (root / data_tools.DECAYED_META_RELATIVE_PATH).read_text(encoding="utf-8")
            )
            self.assertEqual(meta["last_status"], "failed")
            self.assertEqual(meta["last_attempt_at"], data_tools.isoformat_utc(attempted_at))
            self.assertEqual(meta["last_error"], result.errors[0])
            self.assertLessEqual(len(meta["last_error"]), data_tools.METADATA_ERROR_MAX_LENGTH)

    def test_update_lock_recovers_dead_owner_but_preserves_live_owner(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            lock_path = root / data_tools.UPDATE_LOCK_RELATIVE_PATH
            lock_path.parent.mkdir(parents=True)
            lock_path.write_text("999999 2026-08-29T00:00:00Z\n", encoding="utf-8")

            with mock.patch.object(data_tools, "_process_is_running", return_value=False):
                with data_tools.update_lock(root) as acquired:
                    self.assertTrue(acquired)
                    self.assertIn(str(data_tools.os.getpid()), lock_path.read_text(encoding="utf-8"))
            self.assertFalse(lock_path.exists())

            lock_path.write_text(f"1234 {data_tools.isoformat_utc()}\n", encoding="utf-8")
            with mock.patch.object(data_tools, "_process_is_running", return_value=True):
                with data_tools.update_lock(root) as acquired:
                    self.assertFalse(acquired)
            self.assertTrue(lock_path.exists())

    def test_atomic_promotions_use_collision_safe_bounded_backups(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / "catalog.json"
            target.write_text("version-0", encoding="utf-8")
            legacy_backup = root / "catalog.json.bak-20260828120000"
            legacy_backup.write_text("legacy", encoding="utf-8")
            unrelated_artifact = root / "other.json.bak-20260829T120000Z"
            unrelated_manual = root / "catalog.json.bak-manual"
            unrelated_suffix = root / "catalog.json.bak-20260829T120000Z-not-a-counter"
            for unrelated in (unrelated_artifact, unrelated_manual, unrelated_suffix):
                unrelated.write_text("preserve", encoding="utf-8")

            promotions = data_tools.BACKUP_RETENTION_PER_ARTIFACT + 4
            with mock.patch.object(data_tools, "_backup_timestamp", return_value="20260829T120000Z"):
                for version in range(1, promotions + 1):
                    data_tools.atomic_write_text(target, f"version-{version}")

            backup_prefix = f"{target.name}.bak-20260829T120000Z"
            generated = []
            for sibling in root.iterdir():
                suffix = sibling.name.removeprefix(backup_prefix)
                if sibling.name == backup_prefix or (suffix.startswith("-") and suffix[1:].isdigit()):
                    generated.append(sibling)
            self.assertEqual(len(generated), data_tools.BACKUP_RETENTION_PER_ARTIFACT)
            self.assertEqual(len({item.name for item in generated}), len(generated))
            self.assertEqual(
                {item.read_text(encoding="utf-8") for item in generated},
                {
                    f"version-{version}"
                    for version in range(
                        promotions - data_tools.BACKUP_RETENTION_PER_ARTIFACT,
                        promotions,
                    )
                },
            )
            self.assertEqual(target.read_text(encoding="utf-8"), f"version-{promotions}")
            self.assertFalse(legacy_backup.exists())
            for unrelated in (unrelated_artifact, unrelated_manual, unrelated_suffix):
                self.assertEqual(unrelated.read_text(encoding="utf-8"), "preserve")

    def test_rotation_failure_after_promotion_does_not_block_success_metadata(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            now = dt.datetime(2026, 8, 29, 12, 0, tzinfo=dt.timezone.utc)
            satcat_path = root / data_tools.SATCAT_RELATIVE_PATH
            satcat_path.parent.mkdir(parents=True)
            satcat_path.write_bytes(SATCAT_FIXTURE.encode("utf-8"))
            replacement = SATCAT_FIXTURE.replace("CURRENT PAY", "CURRENT PAY UPDATED")

            with mock.patch.object(
                data_tools,
                "_rotate_artifact_backups",
                side_effect=OSError("cleanup denied"),
            ):
                result = data_tools.refresh_satcat_csv(
                    root=root,
                    force=True,
                    build_launches=False,
                    fetcher=lambda url, headers=None: data_tools.FetchResponse(
                        url=url,
                        text=replacement,
                        status=200,
                    ),
                    now=now,
                )

            self.assertTrue(result.changed)
            self.assertEqual(satcat_path.read_text(encoding="utf-8"), replacement)
            metadata = json.loads((root / data_tools.SATCAT_META_RELATIVE_PATH).read_text(encoding="utf-8"))
            self.assertEqual(metadata["last_status"], "ok")
            self.assertEqual(metadata["last_success_at"], data_tools.isoformat_utc(now))
            self.assertEqual(metadata["catalog_revision"], data_tools.catalog_revision_for_text(replacement))

    def test_production_catalog_shrink_guard_preserves_gp_tle_and_satcat_lkg(self):
        now = dt.datetime(2026, 8, 29, 12, 0, tzinfo=dt.timezone.utc)
        success_at = data_tools.isoformat_utc(now - dt.timedelta(days=1))
        catalog_size = data_tools.RECONCILIATION_SHRINK_GUARD_MIN_EXISTING_RECORDS

        self.assertIsNone(data_tools.reconciliation_shrink_error("fixture", catalog_size - 1, 1, 0))
        self.assertIsNotNone(data_tools.reconciliation_shrink_error("fixture", catalog_size, 1, 1))
        self.assertIn(
            "unrelated identity profile",
            data_tools.reconciliation_shrink_error(
                "fixture",
                catalog_size,
                catalog_size,
                0,
            ),
        )
        self.assertIsNone(
            data_tools.reconciliation_shrink_error(
                "fixture",
                catalog_size,
                1,
                0,
                allow_large_reconciliation_shrink=True,
            )
        )

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)

            tle_root = root / "tle"
            tle_base = data_tools.transform_satellite_tle_object(
                "STATIONS",
                "ISS (ZARYA)",
                TLE_FIXTURE.splitlines()[1],
                TLE_FIXTURE.splitlines()[2],
                {},
            )
            tle_existing = []
            for index in range(catalog_size):
                record = dict(tle_base)
                record["norad_id"] = str(60000 + index)
                record["object_id"] = f"obx:norad:{60000 + index}"
                tle_existing.append(record)
            tle_path = tle_root / data_tools.TLE_RELATIVE_PATH
            _write_json(tle_path, tle_existing)
            tle_before = tle_path.read_bytes()
            launch_dates_path = tle_root / data_tools.LAUNCH_DATES_RELATIVE_PATH
            _write_json(launch_dates_path, [])
            launch_dates_before = launch_dates_path.read_bytes()
            satcat_path_for_tle = tle_root / data_tools.SATCAT_RELATIVE_PATH
            satcat_path_for_tle.parent.mkdir(parents=True, exist_ok=True)
            satcat_path_for_tle.write_text(
                SATCAT_FIXTURE.splitlines()[0]
                + "\nLKG OBJECT,2026-001A,60000,PAY,+,2026-08-20,AFETR,\n",
                encoding="utf-8",
            )
            tle_revision = data_tools.catalog_revision_for_payload(tle_existing)
            _write_json(tle_root / data_tools.TLE_META_RELATIVE_PATH, {
                "fetched_at": success_at,
                "last_success_at": success_at,
                "last_reconciled_at": success_at,
                "last_reconciled_catalog_revision": tle_revision,
                "catalog_revision": tle_revision,
                "dataset_hash": tle_revision,
                "source_urls": data_tools.source_urls_for_mode(data_tools.RECONCILIATION_MODE),
                "urls": {},
            })
            tle_result = data_tools.export_tle_data(
                root=tle_root,
                mode=data_tools.RECONCILIATION_MODE,
                force=True,
                fetcher=lambda url, headers=None: data_tools.FetchResponse(url=url, text=TLE_FIXTURE),
                now=now,
            )
            self.assertTrue(tle_result.errors)
            self.assertIn("dangerously truncated", tle_result.errors[0])
            self.assertFalse(tle_result.changed)
            self.assertEqual(tle_path.read_bytes(), tle_before)
            self.assertEqual(launch_dates_path.read_bytes(), launch_dates_before)
            tle_meta = json.loads((tle_root / data_tools.TLE_META_RELATIVE_PATH).read_text(encoding="utf-8"))
            self.assertEqual(tle_meta["catalog_revision"], tle_revision)
            self.assertEqual(tle_meta["last_success_at"], success_at)
            self.assertEqual(tle_meta["last_status"], "failed")

            unrelated_tle = _tle_catalog(70000, catalog_size)
            unrelated_tle_result = data_tools.export_tle_data(
                root=tle_root,
                mode=data_tools.RECONCILIATION_MODE,
                force=True,
                fetcher=lambda url, headers=None: data_tools.FetchResponse(
                    url=url,
                    text=unrelated_tle,
                ),
                now=now + dt.timedelta(hours=1),
            )
            self.assertTrue(unrelated_tle_result.errors)
            self.assertIn("unrelated identity profile", unrelated_tle_result.errors[0])
            self.assertEqual(tle_path.read_bytes(), tle_before)
            self.assertEqual(launch_dates_path.read_bytes(), launch_dates_before)

            mixed_urls = [
                "https://example.test/tle-a",
                "https://example.test/tle-b",
            ]
            mostly_retained_tle = _tle_catalog(60000, 800)

            def mixed_tle_fetcher(url, headers=None):
                del headers
                if url == mixed_urls[0]:
                    return data_tools.FetchResponse(url=url, text=mostly_retained_tle)
                return data_tools.FetchResponse(
                    url=url,
                    text="",
                    status=304,
                    not_modified=True,
                )

            with mock.patch.object(data_tools, "source_urls_for_mode", return_value=mixed_urls):
                mixed_tle_result = data_tools.export_tle_data(
                    root=tle_root,
                    mode="all",
                    force=True,
                    fetcher=mixed_tle_fetcher,
                    now=now + dt.timedelta(hours=2),
                )
            self.assertTrue(mixed_tle_result.errors)
            self.assertIn("mixed full and 304", mixed_tle_result.errors[0])
            self.assertFalse(mixed_tle_result.changed)
            self.assertEqual(tle_path.read_bytes(), tle_before)
            self.assertEqual(launch_dates_path.read_bytes(), launch_dates_before)
            mixed_meta = json.loads(
                (tle_root / data_tools.TLE_META_RELATIVE_PATH).read_text(encoding="utf-8")
            )
            self.assertEqual(mixed_meta["catalog_revision"], tle_revision)
            self.assertEqual(mixed_meta["last_success_at"], success_at)
            self.assertEqual(mixed_meta["last_status"], "failed")

            with mock.patch.object(
                data_tools,
                "source_urls_for_mode",
                return_value=[mixed_urls[0]],
            ):
                malformed_all_result = data_tools.export_tle_data(
                    root=tle_root,
                    mode="all",
                    force=True,
                    fetcher=lambda url, headers=None: data_tools.FetchResponse(
                        url=url,
                        text=TLE_FIXTURE + "BROKEN\n",
                    ),
                    now=now + dt.timedelta(hours=3),
                )
            self.assertTrue(malformed_all_result.errors)
            self.assertIn("structurally incomplete", malformed_all_result.errors[0])
            self.assertEqual(tle_path.read_bytes(), tle_before)
            self.assertEqual(launch_dates_path.read_bytes(), launch_dates_before)
            malformed_meta = json.loads(
                (tle_root / data_tools.TLE_META_RELATIVE_PATH).read_text(encoding="utf-8")
            )
            self.assertEqual(malformed_meta["catalog_revision"], tle_revision)
            self.assertEqual(malformed_meta["last_success_at"], success_at)

            gp_root = root / "gp"
            gp_base = data_tools.transform_satellite_omm_object(_omm(300000), {})
            gp_base["company"] = "STATIONS"
            gp_existing = []
            for index in range(catalog_size):
                record = dict(gp_base)
                record["norad_id"] = str(300000 + index)
                record["object_id"] = f"obx:norad:{300000 + index}"
                gp_existing.append(record)
            gp_path = gp_root / data_tools.GP_RELATIVE_PATH
            _write_json(gp_path, gp_existing)
            gp_before = gp_path.read_bytes()
            gp_revision = data_tools.catalog_revision_for_payload(gp_existing)
            _write_json(gp_root / data_tools.GP_META_RELATIVE_PATH, {
                "fetched_at": success_at,
                "last_success_at": success_at,
                "last_reconciled_at": success_at,
                "last_reconciled_catalog_revision": gp_revision,
                "catalog_revision": gp_revision,
                "dataset_hash": gp_revision,
                "urls": {},
            })
            gp_result = data_tools.export_gp_data(
                root=gp_root,
                mode="all",
                force=True,
                fetcher=lambda url, headers=None: data_tools.FetchResponse(
                    url=url,
                    text=json.dumps([_omm(300000)]),
                ),
                now=now,
            )
            self.assertTrue(gp_result.errors)
            self.assertIn("dangerously truncated", gp_result.errors[0])
            self.assertEqual(gp_path.read_bytes(), gp_before)
            gp_meta = json.loads((gp_root / data_tools.GP_META_RELATIVE_PATH).read_text(encoding="utf-8"))
            self.assertEqual(gp_meta["catalog_revision"], gp_revision)
            self.assertEqual(gp_meta["last_success_at"], success_at)
            self.assertEqual(gp_meta["last_status"], "failed")

            unrelated_gp_payload = [
                _omm(600000 + index)
                for index in range(catalog_size)
            ]
            unrelated_gp_result = data_tools.export_gp_data(
                root=gp_root,
                mode="all",
                force=True,
                fetcher=lambda url, headers=None: data_tools.FetchResponse(
                    url=url,
                    text=json.dumps(unrelated_gp_payload),
                ),
                now=now + dt.timedelta(hours=1),
            )
            self.assertTrue(unrelated_gp_result.errors)
            self.assertIn("unrelated identity profile", unrelated_gp_result.errors[0])
            self.assertEqual(gp_path.read_bytes(), gp_before)

            satcat_root = root / "satcat"
            satcat_header = SATCAT_FIXTURE.splitlines()[0]
            satcat_rows = [
                f"OBJECT {400000 + index},2026-001A,{400000 + index},PAY,+,2026-08-20,AFETR,"
                for index in range(catalog_size)
            ]
            satcat_existing = "\n".join([satcat_header, *satcat_rows, ""])
            satcat_path = satcat_root / data_tools.SATCAT_RELATIVE_PATH
            satcat_path.parent.mkdir(parents=True)
            satcat_path.write_text(satcat_existing, encoding="utf-8")
            satcat_before = satcat_path.read_bytes()
            satcat_revision = data_tools.catalog_revision_for_text(satcat_existing)
            _write_json(satcat_root / data_tools.SATCAT_META_RELATIVE_PATH, {
                "fetched_at": success_at,
                "last_success_at": success_at,
                "last_reconciled_at": success_at,
                "last_reconciled_catalog_revision": satcat_revision,
                "catalog_revision": satcat_revision,
                "dataset_hash": satcat_revision,
                "urls": {},
            })
            satcat_result = data_tools.refresh_satcat_csv(
                root=satcat_root,
                force=True,
                build_launches=False,
                fetcher=lambda url, headers=None: data_tools.FetchResponse(url=url, text=SATCAT_FIXTURE),
                now=now,
            )
            self.assertTrue(satcat_result.errors)
            self.assertIn("dangerously truncated", satcat_result.errors[0])
            self.assertEqual(satcat_path.read_bytes(), satcat_before)
            satcat_meta = json.loads((satcat_root / data_tools.SATCAT_META_RELATIVE_PATH).read_text(encoding="utf-8"))
            self.assertEqual(satcat_meta["catalog_revision"], satcat_revision)
            self.assertEqual(satcat_meta["last_success_at"], success_at)
            self.assertEqual(satcat_meta["last_status"], "failed")

            unrelated_rows = [
                f"UNRELATED {500000 + index},2026-002A,{500000 + index},PAY,+,2026-08-21,AFETR,"
                for index in range(catalog_size)
            ]
            unrelated_satcat = "\n".join([satcat_header, *unrelated_rows, ""])
            unrelated_result = data_tools.refresh_satcat_csv(
                root=satcat_root,
                force=True,
                build_launches=False,
                fetcher=lambda url, headers=None: data_tools.FetchResponse(
                    url=url,
                    text=unrelated_satcat,
                ),
                now=now + dt.timedelta(hours=1),
            )
            self.assertTrue(unrelated_result.errors)
            self.assertIn("unrelated identity profile", unrelated_result.errors[0])
            self.assertEqual(satcat_path.read_bytes(), satcat_before)
            unrelated_meta = json.loads(
                (satcat_root / data_tools.SATCAT_META_RELATIVE_PATH).read_text(encoding="utf-8")
            )
            self.assertEqual(unrelated_meta["catalog_revision"], satcat_revision)
            self.assertEqual(unrelated_meta["last_success_at"], success_at)

    def test_launch_and_decay_due_work_run_independently(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)

            def is_due(_root, metadata_path, _data_path, _hours, *, now=None):
                del now
                return metadata_path in {
                    data_tools.LAUNCHES_META_RELATIVE_PATH,
                    data_tools.DECAYED_META_RELATIVE_PATH,
                }

            with (
                mock.patch.object(data_tools, "metadata_is_older_than", side_effect=is_due),
                mock.patch.object(data_tools, "metadata_reconciliation_is_older_than", return_value=False),
                mock.patch.object(data_tools, "build_decayed_db", return_value=_result("decayed")) as decayed,
                mock.patch.object(data_tools, "build_launch_catalog", return_value=_result("launches")) as launches,
                mock.patch.object(data_tools, "export_gp_data", return_value=_result("gp")) as gp,
                mock.patch.object(data_tools, "export_tle_data", return_value=_result("tle")) as tle,
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
                now=mock.ANY,
                interval_hours=24,
                refresh_satcat=False,
            )
            launches.assert_called_once_with(
                root=root,
                dry_run=True,
                now=mock.ANY,
                mode="incremental",
            )
            gp.assert_not_called()
            tle.assert_not_called()
            self.assertEqual(result["decayed"]["mode"], "decayed")
            self.assertEqual(result["launches"]["mode"], "launches")
            self.assertFalse(result["skipped"])
            self.assertFalse(result["degraded"])

    def test_daily_reconciliation_coalesces_fetches_and_preserves_history(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            now = dt.datetime(2026, 8, 29, 12, 0, tzinfo=dt.timezone.utc)

            alpha5_line1 = "1 A0001U 26001A   26240.24769802  .00009145  00000+0  16852-2 0  9990"
            alpha5_line2 = "2 A0001  51.6400 135.3804 0003061  72.2548 287.8794 15.48314930362054"
            self.assertTrue(data_tools.validate_tle_pair(alpha5_line1, alpha5_line2))
            self.assertEqual(data_tools.tle_norad_from_line1(alpha5_line1), "100001")

            historical_launch = {
                "norad_id": "42",
                "object_id": "obx:norad:42",
                "name": "HISTORICAL LAUNCH",
                "satellite_name": "HISTORICAL LAUNCH",
                "launch_date": "1960-01-01",
            }
            historical_decay = {
                "OBJECT_NAME": "HISTORICAL DECAY",
                "OBJECT_ID": "1960-001A",
                "NORAD_CAT_ID": "43",
                "OBJECT_TYPE": "PAY",
                "LAUNCH_DATE": "1960-01-01",
                "LAUNCH_SITE": "AFETR",
                "DECAY_DATE": "1960-02-01",
            }
            prior_tle = data_tools.transform_satellite_tle_object(
                "STATIONS",
                "ISS (ZARYA)",
                TLE_FIXTURE.splitlines()[1],
                TLE_FIXTURE.splitlines()[2],
                {"25544": "1998-11-20"},
            )
            stale_tle = dict(prior_tle)
            stale_tle.update({"norad_id": "40967", "company": "GEO", "satellite_name": "STALE ACTIVE"})
            stale_gp = data_tools.transform_satellite_omm_object(_omm(100009), {})

            _write_json(root / data_tools.LAUNCHES_RELATIVE_PATH, [historical_launch])
            _write_json(root / data_tools.DECAYED_RELATIVE_PATH, {"HISTORICAL DECAY": [historical_decay]})
            _write_json(root / data_tools.TLE_RELATIVE_PATH, [prior_tle, stale_tle])
            _write_json(root / data_tools.LAUNCH_DATES_RELATIVE_PATH, [
                {"norad_id": "25544", "name": "ISS (ZARYA)", "launch_date": "1998-11-20"}
            ])
            _write_json(root / data_tools.GP_RELATIVE_PATH, [stale_gp])

            calls: list[tuple[str, dict[str, str]]] = []

            def fetcher(url, headers=None):
                calls.append((url, dict(headers or {})))
                if url == data_tools.CELESTRAK_SATCAT_CSV_URL:
                    return data_tools.FetchResponse(
                        url=url,
                        text=SATCAT_FIXTURE,
                        headers={"etag": "satcat-v1", "last-modified": "Sat, 29 Aug 2026 12:00:00 GMT"},
                    )
                if "FORMAT=tle" in url:
                    return data_tools.FetchResponse(url=url, text=TLE_FIXTURE, headers={"etag": "tle-v1"})
                if "FORMAT=json" in url:
                    return data_tools.FetchResponse(url=url, text=json.dumps([_omm(100001)]), headers={"etag": "gp-v1"})
                raise AssertionError(f"unexpected provider URL: {url}")

            result = data_tools.maybe_update_satellite_data(
                root=root,
                interval_hours=24,
                reconciliation_interval_hours=24,
                force=True,
                fetcher=fetcher,
                now=now,
            )

            self.assertEqual([url for url, _headers in calls].count(data_tools.CELESTRAK_SATCAT_CSV_URL), 1)
            self.assertEqual(sum("FORMAT=tle" in url for url, _headers in calls), 1)
            gp_urls = [url for url, _headers in calls if "FORMAT=json" in url]
            self.assertEqual(
                [data_tools.extract_group_from_url(url).lower() for url in gp_urls],
                list(data_tools.GP_SOURCE_GROUPS),
            )
            self.assertFalse(any("n2yo.com" in url or "space-track" in url for url, _headers in calls))

            launches = json.loads((root / data_tools.LAUNCHES_RELATIVE_PATH).read_text(encoding="utf-8"))
            self.assertEqual({item["norad_id"] for item in launches}, {"42", "100001", "100002"})
            decayed = json.loads((root / data_tools.DECAYED_RELATIVE_PATH).read_text(encoding="utf-8"))
            decayed_ids = {
                item["NORAD_CAT_ID"]
                for records in decayed.values()
                for item in records
            }
            self.assertEqual(decayed_ids, {"43", "100002"})

            tle = json.loads((root / data_tools.TLE_RELATIVE_PATH).read_text(encoding="utf-8"))
            self.assertEqual([item["norad_id"] for item in tle], ["25544"])
            self.assertEqual(tle[0]["company"], "STATIONS")
            gp = json.loads((root / data_tools.GP_RELATIVE_PATH).read_text(encoding="utf-8"))
            self.assertEqual([item["norad_id"] for item in gp], ["100001"])
            self.assertEqual(gp[0]["satellite_name"], "CURRENT PAY")
            self.assertEqual(
                {
                    key: result["tle"]["counts"][key]
                    for key in ("existing", "added", "updated", "retained", "pruned")
                },
                {"existing": 2, "added": 0, "updated": 0, "retained": 1, "pruned": 1},
            )
            self.assertEqual(
                {
                    key: result["gp"]["counts"][key]
                    for key in ("existing", "added", "updated", "retained", "pruned")
                },
                {"existing": 1, "added": 1, "updated": 0, "retained": 0, "pruned": 1},
            )

            for relative_meta in (
                data_tools.SATCAT_META_RELATIVE_PATH,
                data_tools.LAUNCHES_META_RELATIVE_PATH,
                data_tools.DECAYED_META_RELATIVE_PATH,
                data_tools.TLE_META_RELATIVE_PATH,
                data_tools.GP_META_RELATIVE_PATH,
            ):
                meta = json.loads((root / relative_meta).read_text(encoding="utf-8"))
                self.assertEqual(meta["last_reconciled_at"], data_tools.isoformat_utc(now))
                self.assertEqual(meta["last_reconciled_catalog_revision"], meta["catalog_revision"])

            self.assertTrue(result["reconciliation"]["completed"])
            self.assertEqual(result["reconciliation"]["last_reconciled_at"], data_tools.isoformat_utc(now))
            for name in ("satcat", "launches", "decayed", "tle", "gp"):
                for reported_path in result[name]["paths"].values():
                    self.assertFalse(Path(reported_path).is_absolute(), reported_path)

            backup_count = len(list(root.rglob("*.bak-*")))
            calls.clear()
            second = data_tools.maybe_update_satellite_data(
                root=root,
                interval_hours=24,
                reconciliation_interval_hours=24,
                force=True,
                fetcher=fetcher,
                now=now + dt.timedelta(days=1),
            )
            self.assertEqual(len(list(root.rglob("*.bak-*"))), backup_count)
            self.assertFalse(second["satcat"]["changed"])
            self.assertFalse(second["launches"]["changed"])
            self.assertFalse(second["decayed"]["changed"])
            self.assertFalse(second["tle"]["changed"])
            self.assertFalse(second["gp"]["changed"])

    def test_reconcile_rejects_304_after_local_catalog_change(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            now = dt.datetime(2026, 8, 29, 12, 0, tzinfo=dt.timezone.utc)
            (root / "json").mkdir(parents=True)
            (root / data_tools.SATCAT_RELATIVE_PATH).write_text(SATCAT_FIXTURE, encoding="utf-8")

            tle_record = data_tools.transform_satellite_tle_object(
                "STATIONS", "ISS (ZARYA)", TLE_FIXTURE.splitlines()[1], TLE_FIXTURE.splitlines()[2], {}
            )
            gp_record = data_tools.transform_satellite_omm_object(_omm(100001), data_tools.satcat_records_from_text(SATCAT_FIXTURE))
            for relative_path, relative_meta, payload in (
                (data_tools.TLE_RELATIVE_PATH, data_tools.TLE_META_RELATIVE_PATH, [tle_record]),
                (data_tools.GP_RELATIVE_PATH, data_tools.GP_META_RELATIVE_PATH, [gp_record]),
            ):
                _write_json(root / relative_path, payload)
                revision = data_tools.catalog_revision_for_payload(payload)
                _write_json(root / relative_meta, {
                    "last_success_at": data_tools.isoformat_utc(now),
                    "last_reconciled_at": data_tools.isoformat_utc(now),
                    "last_reconciled_catalog_revision": revision,
                    "catalog_revision": revision,
                    "dataset_hash": revision,
                    "urls": {},
                })

            complete_tle_before = (root / data_tools.TLE_RELATIVE_PATH).read_text(encoding="utf-8")

            def incomplete_tle(url, headers=None):
                del headers
                return data_tools.FetchResponse(url=url, text=TLE_FIXTURE + "BROKEN\n")

            incomplete_result = data_tools.export_tle_data(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                force=True,
                fetcher=incomplete_tle,
                now=now + dt.timedelta(hours=1),
            )
            self.assertTrue(incomplete_result.errors)
            self.assertEqual(
                (root / data_tools.TLE_RELATIVE_PATH).read_text(encoding="utf-8"),
                complete_tle_before,
            )

            tle_payload = json.loads((root / data_tools.TLE_RELATIVE_PATH).read_text(encoding="utf-8"))
            stale = dict(tle_payload[0])
            stale["norad_id"] = "40967"
            tle_payload.append(stale)
            _write_json(root / data_tools.TLE_RELATIVE_PATH, tle_payload)
            tle_before = (root / data_tools.TLE_RELATIVE_PATH).read_text(encoding="utf-8")

            def tle_304(url, headers=None):
                self.assertNotIn("If-None-Match", headers or {})
                self.assertNotIn("If-Modified-Since", headers or {})
                return data_tools.FetchResponse(url=url, text="", status=304, not_modified=True)

            tle_result = data_tools.export_tle_data(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                force=True,
                fetcher=tle_304,
                now=now + dt.timedelta(days=1),
            )
            self.assertTrue(tle_result.errors)
            self.assertEqual((root / data_tools.TLE_RELATIVE_PATH).read_text(encoding="utf-8"), tle_before)

            gp_payload = json.loads((root / data_tools.GP_RELATIVE_PATH).read_text(encoding="utf-8"))
            gp_payload.append(data_tools.transform_satellite_omm_object(_omm(100009), {}))
            _write_json(root / data_tools.GP_RELATIVE_PATH, gp_payload)
            gp_before = (root / data_tools.GP_RELATIVE_PATH).read_text(encoding="utf-8")

            def gp_304(url, headers=None):
                self.assertEqual(headers or {}, {})
                return data_tools.FetchResponse(url=url, text="", status=304, not_modified=True)

            gp_result = data_tools.export_gp_data(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                force=True,
                fetcher=gp_304,
                now=now + dt.timedelta(days=1),
            )
            self.assertTrue(gp_result.errors)
            self.assertEqual((root / data_tools.GP_RELATIVE_PATH).read_text(encoding="utf-8"), gp_before)

            satcat_meta = {
                "last_success_at": data_tools.isoformat_utc(now),
                "last_reconciled_at": data_tools.isoformat_utc(now),
                "last_reconciled_catalog_revision": data_tools.catalog_revision_for_text(SATCAT_FIXTURE),
                "catalog_revision": data_tools.catalog_revision_for_text(SATCAT_FIXTURE),
                "dataset_hash": data_tools.catalog_revision_for_text(SATCAT_FIXTURE),
                "urls": {},
            }
            _write_json(root / data_tools.SATCAT_META_RELATIVE_PATH, satcat_meta)
            changed_satcat = SATCAT_FIXTURE + "\n"
            (root / data_tools.SATCAT_RELATIVE_PATH).write_text(changed_satcat, encoding="utf-8")

            satcat_result = data_tools.refresh_satcat_csv(
                root=root,
                force=True,
                reconcile=True,
                build_launches=False,
                fetcher=gp_304,
                now=now + dt.timedelta(days=1),
            )
            self.assertTrue(satcat_result.errors)
            self.assertEqual((root / data_tools.SATCAT_RELATIVE_PATH).read_text(encoding="utf-8"), changed_satcat)

    def test_satcat_304_clears_prior_failure_after_matching_reconciliation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            now = dt.datetime(2026, 8, 29, 12, 0, tzinfo=dt.timezone.utc)
            satcat_path = root / data_tools.SATCAT_RELATIVE_PATH
            satcat_path.parent.mkdir(parents=True)
            satcat_path.write_bytes(SATCAT_FIXTURE.encode("utf-8"))
            revision = data_tools.catalog_revision_for_text(SATCAT_FIXTURE)
            _write_json(root / data_tools.SATCAT_META_RELATIVE_PATH, {
                "fetched_at": data_tools.isoformat_utc(now),
                "last_success_at": data_tools.isoformat_utc(now),
                "last_reconciled_at": data_tools.isoformat_utc(now),
                "last_reconciled_catalog_revision": revision,
                "catalog_revision": revision,
                "dataset_hash": revision,
                "last_status": "failed",
                "last_error": "temporary provider failure",
                "urls": {},
            })

            result = data_tools.refresh_satcat_csv(
                root=root,
                force=True,
                reconcile=True,
                build_launches=False,
                fetcher=lambda url, headers=None: data_tools.FetchResponse(
                    url=url,
                    text="",
                    status=304,
                    not_modified=True,
                ),
                now=now + dt.timedelta(days=1),
            )

            self.assertFalse(result.errors)
            metadata = json.loads((root / data_tools.SATCAT_META_RELATIVE_PATH).read_text(encoding="utf-8"))
            self.assertEqual(metadata["last_status"], "not-modified")
            self.assertNotIn("last_error", metadata)
            self.assertEqual(
                data_tools.latest_success_time(metadata, satcat_path),
                now + dt.timedelta(days=1),
            )
            self.assertFalse(
                data_tools.metadata_is_older_than(
                    root,
                    data_tools.SATCAT_META_RELATIVE_PATH,
                    data_tools.SATCAT_RELATIVE_PATH,
                    24,
                    now=now + dt.timedelta(days=1, hours=1),
                )
            )

    def test_satcat_crlf_bytes_keep_revision_binding_and_avoid_noop_backup_churn(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            now = dt.datetime(2026, 8, 30, 12, 0, tzinfo=dt.timezone.utc)
            satcat_path = root / data_tools.SATCAT_RELATIVE_PATH
            satcat_path.parent.mkdir(parents=True)
            crlf_satcat = SATCAT_FIXTURE.replace("\n", "\r\n")
            satcat_bytes = crlf_satcat.encode("utf-8")
            satcat_path.write_bytes(satcat_bytes)
            revision = data_tools.catalog_revision_for_text(crlf_satcat)
            source_url = data_tools.CELESTRAK_SATCAT_CSV_URL
            _write_json(root / data_tools.SATCAT_META_RELATIVE_PATH, {
                "fetched_at": data_tools.isoformat_utc(now - dt.timedelta(days=1)),
                "last_success_at": data_tools.isoformat_utc(now - dt.timedelta(days=1)),
                "last_reconciled_at": data_tools.isoformat_utc(now - dt.timedelta(days=1)),
                "last_reconciled_catalog_revision": revision,
                "catalog_revision": revision,
                "dataset_hash": revision,
                "urls": {source_url: {"etag": '"satcat-crlf-v1"'}},
            })
            captured_headers = {}

            def unchanged_crlf_fetcher(url, headers=None):
                captured_headers.update(headers or {})
                return data_tools.FetchResponse(
                    url=url,
                    text=crlf_satcat,
                    status=200,
                    headers={"etag": '"satcat-crlf-v1"'},
                )

            result = data_tools.refresh_satcat_csv(
                root=root,
                force=True,
                reconcile=True,
                build_launches=False,
                fetcher=unchanged_crlf_fetcher,
                now=now,
            )

            self.assertFalse(result.changed)
            self.assertFalse(result.errors)
            self.assertEqual(captured_headers.get("If-None-Match"), '"satcat-crlf-v1"')
            self.assertEqual(satcat_path.read_bytes(), satcat_bytes)
            self.assertEqual(list(satcat_path.parent.glob(f"{satcat_path.name}.bak-*")), [])
            metadata = json.loads((root / data_tools.SATCAT_META_RELATIVE_PATH).read_text(encoding="utf-8"))
            self.assertEqual(metadata["catalog_revision"], revision)
            self.assertEqual(metadata["dataset_hash"], revision)
            self.assertEqual(metadata["last_reconciled_catalog_revision"], revision)


if __name__ == "__main__":
    unittest.main()
