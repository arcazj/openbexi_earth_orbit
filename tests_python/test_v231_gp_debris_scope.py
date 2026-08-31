from __future__ import annotations

import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path

from tools import satellite_data_tools as data_tools


NOW = dt.datetime(2026, 8, 30, 12, 0, tzinfo=dt.timezone.utc)


def omm(
    norad_id: str | int,
    *,
    epoch: str = "2026-08-30T00:00:00Z",
    name: str | None = None,
    object_type: str = "PAYLOAD",
) -> dict[str, object]:
    return {
        "OBJECT_NAME": name or f"OBJECT {norad_id}",
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
        "OBJECT_TYPE": object_type,
    }


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def group_from_url(url: str) -> str:
    return data_tools.extract_group_from_url(url).lower()


def seed_gp(
    root: Path,
    records: list[dict[str, object]],
    *,
    source_groups: list[str] | None = None,
    reconciled: bool = False,
) -> tuple[Path, Path, dict[str, str]]:
    gp_path = root / data_tools.GP_RELATIVE_PATH
    meta_path = root / data_tools.GP_META_RELATIVE_PATH
    write_json(gp_path, records)
    revision = data_tools.catalog_revision_for_payload(records)
    source_urls = data_tools.gp_source_urls_for_mode("incremental")
    etags = {group_from_url(url): f'"{group_from_url(url)}-v1"' for url in source_urls}
    meta: dict[str, object] = {
        "last_success_at": data_tools.isoformat_utc(NOW - dt.timedelta(days=1)),
        "catalog_revision": revision,
        "dataset_hash": revision,
        "source_groups": source_groups or list(data_tools.GP_SOURCE_GROUPS),
        "source_scope_verified": source_groups is None or source_groups == list(data_tools.GP_SOURCE_GROUPS),
        "catalog_source_groups": source_groups or list(data_tools.GP_SOURCE_GROUPS),
        "source_urls": source_urls,
        "urls": {
            url: {"etag": etags[group_from_url(url)], "status": 200}
            for url in source_urls
        },
    }
    if reconciled:
        meta.update(
            {
                "last_reconciled_at": data_tools.isoformat_utc(NOW - dt.timedelta(days=1)),
                "last_reconciled_catalog_revision": revision,
            }
        )
    write_json(meta_path, meta)
    return gp_path, meta_path, etags


class GpDebrisScopeTests(unittest.TestCase):
    def test_incremental_mixed_200_304_merges_debris_and_updates_each_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            retained = data_tools.transform_satellite_omm_object(
                omm(123456, epoch="2026-08-28T00:00:00Z", name="RETAINED ACTIVE"),
                {},
            )
            gp_path, meta_path, etags = seed_gp(root, [retained])
            calls: list[tuple[str, dict[str, str]]] = []

            def fetcher(url: str, headers=None):
                group = group_from_url(url)
                request_headers = dict(headers or {})
                calls.append((group, request_headers))
                self.assertEqual(request_headers.get("If-None-Match"), etags[group])
                if group == "fengyun-1c-debris":
                    return data_tools.FetchResponse(
                        url=url,
                        text=json.dumps(
                            [
                                omm(
                                    "900000001",
                                    epoch="2026-08-29T00:00:00Z",
                                    name="OLDER DEBRIS",
                                    object_type="DEBRIS",
                                ),
                                omm(
                                    "900000001",
                                    epoch="2026-08-30T01:00:00Z",
                                    name="CURRENT DEBRIS",
                                    object_type="DEBRIS",
                                ),
                            ]
                        ),
                        headers={"etag": '"fengyun-1c-debris-v2"'},
                    )
                return data_tools.FetchResponse(
                    url=url,
                    text="",
                    status=304,
                    headers={"etag": etags[group]},
                    not_modified=True,
                )

            result = data_tools.export_gp_data(
                root=root,
                mode="incremental",
                force=True,
                fetcher=fetcher,
                now=NOW,
            )

            self.assertFalse(result.errors)
            self.assertEqual(
                [group for group, _headers in calls],
                list(data_tools.GP_SOURCE_GROUPS),
            )
            records = json.loads(gp_path.read_text(encoding="utf-8"))
            by_id = {record["norad_id"]: record for record in records}
            self.assertEqual(set(by_id), {"123456", "900000001"})
            self.assertEqual(by_id["900000001"]["satellite_name"], "CURRENT DEBRIS")
            self.assertEqual(by_id["900000001"]["object_type"], "DEBRIS")
            self.assertEqual(
                by_id["900000001"]["element_set"]["epoch"],
                "2026-08-30T01:00:00.000Z",
            )
            self.assertEqual(result.counts["duplicates"], 1)
            self.assertEqual(result.counts["nine_digit_ids"], 1)

            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertEqual(metadata["source_groups"], list(data_tools.GP_SOURCE_GROUPS))
            self.assertEqual(
                metadata["source_scope"]["event_debris_groups"],
                list(data_tools.GP_EVENT_DEBRIS_GROUPS),
            )
            self.assertFalse(metadata["source_scope"]["all_debris"])
            self.assertFalse(metadata["provider_completeness_claim"])
            self.assertTrue(metadata["source_scope_verified"])
            self.assertEqual(metadata["catalog_source_groups"], list(data_tools.GP_SOURCE_GROUPS))
            self.assertEqual(metadata["source_status"], "PARTIAL")
            self.assertTrue(metadata["partial_update"])
            for url in data_tools.gp_source_urls_for_mode("incremental"):
                expected_status = 200 if group_from_url(url) == "fengyun-1c-debris" else 304
                self.assertEqual(metadata["urls"][url]["status"], expected_status)

    def test_reconciliation_replaces_only_after_all_four_sources_succeed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            stale = data_tools.transform_satellite_omm_object(
                omm(777777, epoch="2026-08-20T00:00:00Z", name="STALE"),
                {},
            )
            gp_path, meta_path, _etags = seed_gp(root, [stale])
            payloads = {
                "active": [omm(100001, name="ACTIVE PAYLOAD")],
                "fengyun-1c-debris": [
                    omm("900000001", name="FENGYUN DEBRIS", object_type="DEBRIS")
                ],
                "iridium-33-debris": [
                    omm("900000002", name="IRIDIUM DEBRIS", object_type="DEBRIS")
                ],
                "cosmos-2251-debris": [
                    omm("900000003", name="COSMOS DEBRIS", object_type="DEBRIS")
                ],
            }
            calls: list[str] = []

            def fetcher(url: str, headers=None):
                group = group_from_url(url)
                calls.append(group)
                self.assertEqual(headers or {}, {})
                return data_tools.FetchResponse(url=url, text=json.dumps(payloads[group]))

            result = data_tools.export_gp_data(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                force=True,
                fetcher=fetcher,
                now=NOW,
            )

            self.assertFalse(result.errors)
            self.assertEqual(calls, list(data_tools.GP_SOURCE_GROUPS))
            records = json.loads(gp_path.read_text(encoding="utf-8"))
            self.assertEqual(
                {record["norad_id"] for record in records},
                {"100001", "900000001", "900000002", "900000003"},
            )
            self.assertTrue(
                all(
                    record["object_type"] == "DEBRIS"
                    for record in records
                    if record["norad_id"].startswith("9")
                )
            )
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertEqual(metadata["source_status"], "COMPLETE")
            self.assertFalse(metadata["partial_update"])
            self.assertFalse(metadata["provider_completeness_claim"])
            self.assertTrue(metadata["source_scope_verified"])
            self.assertEqual(metadata["catalog_source_groups"], list(data_tools.GP_SOURCE_GROUPS))
            self.assertEqual(metadata["last_reconciled_at"], data_tools.isoformat_utc(NOW))
            self.assertEqual(
                metadata["last_reconciled_catalog_revision"],
                metadata["catalog_revision"],
            )

    def test_reconciliation_rejects_mixed_full_and_304_sources_atomically(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            existing = data_tools.transform_satellite_omm_object(omm(123456), {})
            gp_path, meta_path, etags = seed_gp(root, [existing], reconciled=True)
            before = gp_path.read_bytes()

            def fetcher(url: str, headers=None):
                group = group_from_url(url)
                self.assertEqual((headers or {}).get("If-None-Match"), etags[group])
                if group == "active":
                    return data_tools.FetchResponse(
                        url=url,
                        text="",
                        status=304,
                        not_modified=True,
                    )
                return data_tools.FetchResponse(
                    url=url,
                    text=json.dumps([omm(800000 + len(group), object_type="DEBRIS")]),
                )

            result = data_tools.export_gp_data(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                force=True,
                fetcher=fetcher,
                now=NOW,
            )

            self.assertTrue(result.errors)
            self.assertIn("mixed full and 304", result.errors[0])
            self.assertEqual(gp_path.read_bytes(), before)
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertEqual(metadata["last_status"], "failed")
            self.assertNotIn("last_reconciled_at", metadata)
            self.assertNotIn("last_reconciled_catalog_revision", metadata)
            self.assertTrue(metadata["source_scope_verified"])
            self.assertEqual(metadata["catalog_source_groups"], list(data_tools.GP_SOURCE_GROUPS))

            retry_calls: list[tuple[str, dict[str, str]]] = []

            def retry_fetcher(url: str, headers=None):
                group = group_from_url(url)
                retry_calls.append((group, dict(headers or {})))
                object_type = "PAYLOAD" if group == "active" else "DEBRIS"
                return data_tools.FetchResponse(
                    url=url,
                    text=json.dumps([
                        omm(810000 + len(retry_calls), name=f"RETRY {group}", object_type=object_type)
                    ]),
                )

            retry_time = NOW + dt.timedelta(minutes=1)
            retried = data_tools.export_gp_data(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                force=True,
                fetcher=retry_fetcher,
                now=retry_time,
            )

            self.assertFalse(retried.skipped)
            self.assertFalse(retried.errors)
            self.assertEqual(
                retry_calls,
                [(group, {}) for group in data_tools.GP_SOURCE_GROUPS],
            )
            retried_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertEqual(
                retried_meta["last_reconciled_at"],
                data_tools.isoformat_utc(retry_time),
            )
            self.assertEqual(
                retried_meta["last_reconciled_catalog_revision"],
                retried_meta["catalog_revision"],
            )

    def test_incremental_error_with_304_sources_preserves_last_known_good(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            existing = data_tools.transform_satellite_omm_object(omm(123456), {})
            gp_path, meta_path, _etags = seed_gp(root, [existing])
            before = gp_path.read_bytes()
            calls: list[str] = []

            def fetcher(url: str, headers=None):
                del headers
                group = group_from_url(url)
                calls.append(group)
                if group == "iridium-33-debris":
                    return data_tools.FetchResponse(url=url, text="unavailable", status=503)
                return data_tools.FetchResponse(
                    url=url,
                    text="",
                    status=304,
                    not_modified=True,
                )

            result = data_tools.export_gp_data(
                root=root,
                mode="incremental",
                force=True,
                fetcher=fetcher,
                now=NOW,
            )

            self.assertEqual(calls, list(data_tools.GP_SOURCE_GROUPS))
            self.assertTrue(result.errors)
            self.assertIn("HTTP 503", result.errors[0])
            self.assertEqual(gp_path.read_bytes(), before)
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertEqual(metadata["last_status"], "failed")
            self.assertEqual(metadata["catalog_revision"], data_tools.catalog_revision_for_payload([existing]))
            self.assertTrue(metadata["source_scope_verified"])
            self.assertEqual(metadata["catalog_source_groups"], list(data_tools.GP_SOURCE_GROUPS))

    def test_active_only_snapshot_cannot_authorize_four_group_304_reconciliation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            existing = data_tools.transform_satellite_omm_object(omm(123456), {})
            gp_path, meta_path, _etags = seed_gp(
                root,
                [existing],
                source_groups=["active"],
                reconciled=True,
            )
            stale_scope_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            stale_scope_meta["last_success_at"] = data_tools.isoformat_utc(NOW)
            write_json(meta_path, stale_scope_meta)
            before = gp_path.read_bytes()
            headers_seen: list[dict[str, str]] = []

            def fetcher(url: str, headers=None):
                headers_seen.append(dict(headers or {}))
                return data_tools.FetchResponse(
                    url=url,
                    text="",
                    status=304,
                    not_modified=True,
                )

            result = data_tools.export_gp_data(
                root=root,
                mode=data_tools.RECONCILIATION_MODE,
                fetcher=fetcher,
                now=NOW,
            )

            self.assertTrue(result.errors)
            self.assertIn("configured GP source scope", result.errors[0])
            self.assertEqual(headers_seen, [{}] * len(data_tools.GP_SOURCE_GROUPS))
            self.assertEqual(gp_path.read_bytes(), before)
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertEqual(metadata["source_groups"], list(data_tools.GP_SOURCE_GROUPS))
            self.assertFalse(metadata["source_scope_verified"])
            self.assertEqual(metadata["catalog_source_groups"], ["active"])
            self.assertEqual(metadata["source_urls"], data_tools.gp_source_urls_for_mode("reconcile"))
            self.assertNotIn("last_reconciled_at", metadata)
            self.assertNotIn("last_reconciled_catalog_revision", metadata)

    def test_active_only_scope_cannot_be_relabelled_by_incremental_304_responses(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            existing = data_tools.transform_satellite_omm_object(omm(123456), {})
            gp_path, meta_path, _etags = seed_gp(
                root,
                [existing],
                source_groups=["active"],
            )
            before = gp_path.read_bytes()
            calls: list[str] = []

            def fetcher(url: str, headers=None):
                del headers
                calls.append(group_from_url(url))
                return data_tools.FetchResponse(
                    url=url,
                    text="",
                    status=304,
                    not_modified=True,
                )

            result = data_tools.export_gp_data(
                root=root,
                mode="incremental",
                force=True,
                fetcher=fetcher,
                now=NOW,
            )

            self.assertEqual(calls, list(data_tools.GP_SOURCE_GROUPS))
            self.assertTrue(result.errors)
            self.assertIn("configured GP source scope", result.errors[0])
            self.assertEqual(gp_path.read_bytes(), before)
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertEqual(metadata["last_status"], "failed")
            self.assertFalse(metadata["provider_completeness_claim"])
            self.assertFalse(metadata["source_scope_verified"])
            self.assertEqual(metadata["catalog_source_groups"], ["active"])

    def test_verified_scope_requires_metadata_revision_to_match_gp_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            original = data_tools.transform_satellite_omm_object(omm(123456), {})
            gp_path, meta_path, _etags = seed_gp(root, [original])
            replacement = data_tools.transform_satellite_omm_object(
                omm(654321, name="CRASH-WINDOW REPLACEMENT"),
                {},
            )
            write_json(gp_path, [replacement])
            before = gp_path.read_bytes()
            headers_seen: list[dict[str, str]] = []

            def fetcher(url: str, headers=None):
                headers_seen.append(dict(headers or {}))
                return data_tools.FetchResponse(url=url, text="", status=304, not_modified=True)

            result = data_tools.export_gp_data(
                root=root,
                mode="incremental",
                force=True,
                fetcher=fetcher,
                now=NOW,
            )

            self.assertTrue(result.errors)
            self.assertIn("configured GP source scope", result.errors[0])
            self.assertEqual(headers_seen, [{}] * len(data_tools.GP_SOURCE_GROUPS))
            self.assertEqual(gp_path.read_bytes(), before)
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            replacement_revision = data_tools.catalog_revision_for_payload([replacement])
            self.assertEqual(metadata["catalog_revision"], replacement_revision)
            self.assertEqual(metadata["dataset_hash"], replacement_revision)
            self.assertFalse(metadata["source_scope_verified"])
            self.assertEqual(metadata["catalog_source_groups"], [])
            self.assertEqual(metadata["last_status"], "failed")

    def test_active_only_scope_migration_rejects_any_quarantined_response(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            existing = data_tools.transform_satellite_omm_object(omm(123456), {})
            gp_path, meta_path, _etags = seed_gp(
                root,
                [existing],
                source_groups=["active"],
            )
            before = gp_path.read_bytes()
            before_revision = data_tools.catalog_revision_for_payload([existing])
            first_headers: list[dict[str, str]] = []

            def quarantined_fetcher(url: str, headers=None):
                first_headers.append(dict(headers or {}))
                group = group_from_url(url)
                if group == "fengyun-1c-debris":
                    payload = [{}]
                else:
                    object_type = "PAYLOAD" if group == "active" else "DEBRIS"
                    payload = [omm(810000 + len(first_headers), object_type=object_type)]
                return data_tools.FetchResponse(url=url, text=json.dumps(payload))

            failed = data_tools.export_gp_data(
                root=root,
                mode="incremental",
                force=True,
                fetcher=quarantined_fetcher,
                now=NOW,
            )

            self.assertTrue(failed.skipped)
            self.assertTrue(failed.errors)
            self.assertIn("structural validation", failed.errors[0])
            self.assertEqual(first_headers, [{}] * len(data_tools.GP_SOURCE_GROUPS))
            self.assertEqual(gp_path.read_bytes(), before)
            failed_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertEqual(failed_meta["catalog_revision"], before_revision)
            self.assertEqual(failed_meta["last_status"], "failed")
            self.assertFalse(failed_meta["source_scope_verified"])
            self.assertEqual(failed_meta["catalog_source_groups"], ["active"])

            retry_headers: list[dict[str, str]] = []

            def retry_fetcher(url: str, headers=None):
                retry_headers.append(dict(headers or {}))
                return data_tools.FetchResponse(url=url, text="", status=304, not_modified=True)

            retried = data_tools.export_gp_data(
                root=root,
                mode="incremental",
                force=True,
                fetcher=retry_fetcher,
                now=NOW + dt.timedelta(minutes=1),
            )

            self.assertTrue(retried.errors)
            self.assertEqual(retry_headers, [{}] * len(data_tools.GP_SOURCE_GROUPS))
            self.assertEqual(gp_path.read_bytes(), before)
            retried_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertFalse(retried_meta["source_scope_verified"])
            self.assertEqual(retried_meta["catalog_source_groups"], ["active"])

    def test_failed_scope_migration_remains_due_and_retries_without_validators(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            existing = data_tools.transform_satellite_omm_object(omm(123456), {})
            gp_path, meta_path, _etags = seed_gp(
                root,
                [existing],
                source_groups=["active"],
            )
            first_calls: list[dict[str, str]] = []

            def failed_fetcher(url: str, headers=None):
                first_calls.append(dict(headers or {}))
                return data_tools.FetchResponse(url=url, text="unavailable", status=503)

            failed = data_tools.export_gp_data(
                root=root,
                mode="all",
                force=True,
                fetcher=failed_fetcher,
                now=NOW,
            )
            self.assertTrue(failed.errors)
            self.assertEqual(first_calls, [{}] * len(data_tools.GP_SOURCE_GROUPS))
            failed_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertFalse(failed_meta["source_scope_verified"])
            self.assertEqual(failed_meta["catalog_source_groups"], ["active"])
            self.assertEqual(failed_meta["source_urls"], data_tools.gp_source_urls_for_mode("all"))

            retry_calls: list[dict[str, str]] = []

            def success_fetcher(url: str, headers=None):
                retry_calls.append(dict(headers or {}))
                group = group_from_url(url)
                object_type = "PAYLOAD" if group == "active" else "DEBRIS"
                return data_tools.FetchResponse(
                    url=url,
                    text=json.dumps([omm(800000 + len(retry_calls), object_type=object_type)]),
                )

            retried = data_tools.export_gp_data(
                root=root,
                mode="incremental",
                fetcher=success_fetcher,
                now=NOW + dt.timedelta(minutes=1),
            )
            self.assertFalse(retried.skipped)
            self.assertFalse(retried.errors)
            self.assertEqual(retry_calls, [{}] * len(data_tools.GP_SOURCE_GROUPS))
            verified_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            self.assertTrue(verified_meta["source_scope_verified"])
            self.assertEqual(verified_meta["catalog_source_groups"], list(data_tools.GP_SOURCE_GROUPS))
            self.assertEqual(verified_meta["source_urls"], data_tools.gp_source_urls_for_mode("incremental"))
            self.assertTrue(gp_path.exists())


if __name__ == "__main__":
    unittest.main()
