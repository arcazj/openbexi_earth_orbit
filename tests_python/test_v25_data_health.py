import datetime as dt
import json
import tempfile
import unittest
from unittest import mock
from pathlib import Path

from services.data_health import build_health, health_from_root, PATHS
from tools import satellite_data_tools as data_tools
from tests_python.test_v23_tracked_catalog import HEADER, write_inputs, gp_record, load_manifest, load_records

NOW = dt.datetime(2026, 11, 7, 12, tzinfo=dt.timezone.utc)


class DataHealthTests(unittest.TestCase):
    def test_new_launch_delayed_elements_and_confirmed_decay_lifecycle(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            row = 'NEW LAUNCH,2026-311A,330001,PAY,+,US,2026-11-07,AFETR,,92,51,500,490,0.2,,EA,ORB\n'
            def build(csv, gp, days):
                write_inputs(root, HEADER + csv, gp)
                result = data_tools.build_tracked_catalog(root=root, now=NOW + dt.timedelta(days=days))
                self.assertFalse(result.errors)
                manifest = load_manifest(root)
                return load_records(root, manifest['chunks']), load_records(root, manifest['history_chunks'])
            current, history = build(row, [], 0)
            self.assertEqual(current[0]['norad_id'], '330001')
            self.assertTrue(current[0]['metadata_only'])
            self.assertFalse(current[0]['has_current_elements'])
            self.assertEqual(current[0]['lifecycle_status'], 'ACTIVE')
            current, history = build(row, [gp_record(330001)], 1)
            self.assertTrue(current[0]['has_current_elements'])
            # Elements disappear; the source has not confirmed decay.
            current, history = build(row, [], 2)
            self.assertEqual(current[0]['lifecycle_status'], 'ACTIVE')
            self.assertTrue(current[0]['metadata_only'])
            confirmed = row.replace('PAY,+,', 'PAY,D,').replace('AFETR,,', 'AFETR,2026-11-10,')
            current, history = build(confirmed, [], 3)
            self.assertEqual(len(current), 0)
            self.assertEqual(history[0]['norad_id'], '330001')
            self.assertEqual(history[0]['lifecycle_status'], 'DECAYED')

    def metadata(self):
        return {name: dict(catalog_revision='sha256:' + 'a' * 64, fetched_at='2026-11-01T12:00:00Z',
                          last_success_at='2026-11-07T11:00:00Z', last_attempt_at='2026-11-07T11:00:00Z',
                          source_status='COMPLETE') for name in PATHS}

    def health(self, metadata, **kwargs):
        return build_health(metadata, now=NOW, environ={}, **kwargs)

    def test_304_check_is_fresh_without_claiming_new_content(self):
        meta = self.metadata()
        meta['gp']['last_status'] = 'not-modified'
        health = self.health(meta)
        gp = health['datasets']['gp']
        self.assertEqual(gp['state'], 'current')
        self.assertEqual(gp['checkAgeHours'], 1)
        self.assertEqual(gp['contentAgeHours'], 144)
        self.assertEqual(gp['coverage'], 'limited')

    def test_failed_attempt_does_not_advance_success_or_leak_secrets(self):
        meta = self.metadata()
        meta['gp'].update(last_attempt_at='2026-11-07T12:00:00Z', last_error='secret C:/private token=hidden')
        health = self.health(meta)
        self.assertEqual(health['datasets']['gp']['checkedAt'], '2026-11-07T11:00:00Z')
        self.assertEqual(health['datasets']['gp']['state'], 'degraded')
        self.assertNotIn('secret', json.dumps(health))
        self.assertNotIn('hidden', json.dumps(health))

    def test_recent_derived_build_cannot_hide_stale_parent(self):
        meta = self.metadata()
        meta['gp']['last_success_at'] = '2026-10-01T00:00:00Z'
        health = self.health(meta)
        self.assertEqual(health['datasets']['gp']['state'], 'stale')
        self.assertEqual(health['datasets']['tracked']['dependencyIssues'], ['gp'])
        self.assertEqual(health['datasets']['tracked']['state'], 'degraded')
        self.assertEqual(health['clock'], 'wall-utc')

    def test_partial_coverage_missing_revision_and_snapshot_are_distinct(self):
        meta = self.metadata()
        meta['tracked']['source_status'] = 'PARTIAL'
        meta['tle'] = {}
        health = self.health(meta, mode='snapshot')
        self.assertEqual(health['state'], 'snapshot')
        self.assertEqual(health['datasets']['tracked']['state'], 'partial')
        self.assertEqual(health['datasets']['tle']['state'], 'unavailable')

    def test_thresholds_are_bounded_without_altering_scheduler(self):
        meta = self.metadata()
        health = build_health(meta, now=NOW, environ={'OPENBEXI_HEALTH_GP_HOURS': '-1', 'OPENBEXI_HEALTH_TLE_HOURS': 'nan'})
        self.assertEqual(health['datasets']['gp']['thresholdHours'], 2)
        self.assertEqual(health['datasets']['tle']['thresholdHours'], 48)
        self.assertIsNone(health['datasets']['gp']['nextPermittedAttemptAt'])

    def test_storage_failure_is_bounded_and_diagnosable(self):
        with mock.patch.object(Path, 'open', side_effect=PermissionError('private filesystem token=secret')):
            health = health_from_root(Path('unused'))
        self.assertEqual(health['datasets']['gp']['reason'], 'storage_unavailable')
        self.assertNotIn('secret', json.dumps(health))

    def test_rejected_payload_cannot_become_current_from_its_sidecar(self):
        health = self.health(self.metadata(), status={'datasets': {'gp': {'revision': None}}})
        self.assertEqual(health['datasets']['gp']['state'], 'unavailable')

    def test_provider_admission_is_distinct_from_scheduler_wake(self):
        health = self.health(self.metadata(), status={'next_check_at': '2026-11-07T12:30:00Z',
            'dataset_status': {'gp': {'next_allowed_at': '2026-11-07T14:00:00Z'}}})
        self.assertEqual(health['datasets']['gp']['nextPermittedAttemptAt'], '2026-11-07T14:00:00Z')
        self.assertEqual(health['datasets']['gp']['nextScheduledCheckAt'], '2026-11-07T12:30:00Z')

    def test_unchanged_derived_content_reuses_only_verified_source_revalidation(self):
        meta = self.metadata()
        meta['launch'].update(last_success_at='2026-11-01T12:00:00Z', source_satcat_revision=meta['satcat']['catalog_revision'])
        launch = self.health(meta)['datasets']['launch']
        self.assertEqual(launch['checkedAt'], '2026-11-01T12:00:00Z')
        self.assertEqual(launch['freshnessAt'], '2026-11-07T11:00:00Z')
        self.assertEqual(launch['state'], 'current')
        meta['launch'].update(last_success_at='2026-11-07T11:00:00Z', source_satcat_revision='sha256:' + 'b' * 64)
        launch = self.health(meta)['datasets']['launch']
        self.assertEqual(launch['state'], 'degraded')
        self.assertEqual(launch['reason'], 'source_revision_mismatch')

    def test_provider_pause_is_not_a_promised_retry(self):
        health = self.health(self.metadata(), status={'last_result': {'provider_blocked': True},
            'dataset_status': {'gp': {'next_due_at': '2026-11-07T13:00:00Z'}}})
        self.assertEqual(health['datasets']['gp']['reason'], 'provider_paused')
        self.assertIsNone(health['datasets']['gp']['nextPermittedAttemptAt'])

    def test_source_revalidation_orders_instants_with_optional_fractional_seconds(self):
        meta = self.metadata()
        meta['launch'].update(last_success_at='2026-11-07T11:00:00Z', source_satcat_revision=meta['satcat']['catalog_revision'])
        meta['satcat']['last_success_at'] = '2026-11-07T11:00:00.500Z'
        self.assertEqual(self.health(meta)['datasets']['launch']['freshnessAt'], '2026-11-07T11:00:00.500000Z')

    def test_restart_reconstructs_small_sidecars_and_malformed_is_unavailable(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name, relative in PATHS.items():
                path = root / 'json' / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(self.metadata()[name]), encoding='utf-8')
            first = health_from_root(root)
            second = health_from_root(root)
            self.assertEqual(first['datasets'], second['datasets'])
            (root / 'json' / PATHS['gp']).write_text('{invalid')
            self.assertEqual(health_from_root(root)['datasets']['gp']['state'], 'unavailable')


if __name__ == '__main__':
    unittest.main()
