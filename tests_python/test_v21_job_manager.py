import json
import os
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import server
from services.v21.api import V21ApiService, normalize_job_request
from services.v21.catalog_registry import CatalogSnapshotRegistry
from services.v21.feature_flags import ServerFeatureFlag
from services.v21.job_manager import ScreeningJobManager
from services.v21.job_store import JobStore
from services.v21.security import BearerTokenAuthenticator, Principal


TERMINAL = {"SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"}


class V21JobManagerTests(unittest.TestCase):
    def setUp(self):
        if not shutil.which("node"):
            self.skipTest("Node.js is unavailable")
        self.temporary = tempfile.TemporaryDirectory()
        self.runtime_root = Path(self.temporary.name)
        self.store = JobStore(self.runtime_root / "manager.sqlite3")
        records = json.loads((server.ROOT / "json" / "tle" / "TLE.json").read_text(encoding="utf-8"))[:3]
        source_path = self.runtime_root / "source.json"
        source_path.write_text(json.dumps(records), encoding="utf-8")
        registry = CatalogSnapshotRegistry(self.runtime_root)
        self.snapshot = registry.snapshot_tle_json(source_path, source_id="manager-test", provider="Manager Test")
        observations = [
            {
                "object_id": "obx:norad:" + record["norad_id"],
                "name": record["satellite_name"],
                "norad_id": record["norad_id"],
                "object_type": "UNKNOWN",
                "lifecycle_status": "ACTIVE",
                "observation_status": "NEW",
                "element_set_id": "manager-element-%d" % index,
            }
            for index, record in enumerate(records)
        ]
        self.store.create_catalog_revision(
            self.snapshot.revision_id,
            self.snapshot.source_id,
            self.snapshot.dataset_id,
            self.snapshot.metadata(),
            observations,
            self.snapshot.snapshot_path,
            dataset_format="TLE_JSON",
            adapter_version=self.snapshot.adapter_version,
            provenance={"provider": "Manager Test"},
            dataset_hash=self.snapshot.dataset_hash,
        )

    def tearDown(self):
        self.store.close()
        self.temporary.cleanup()

    def create_job(self, key, *, max_attempts=1, timeout_seconds=30):
        request = normalize_job_request(
            {
                "catalog_revision_id": self.snapshot.revision_id,
                "catalog_scope": {
                    "object_types": ["UNKNOWN"],
                    "lifecycle_statuses": ["UNKNOWN"],
                },
                "configuration": {
                    "start_time": "2026-07-20T00:00:00Z",
                    "horizon_seconds": 60,
                    "coarse_step_seconds": 60,
                    "max_attempts": max_attempts,
                    "timeout_seconds": timeout_seconds,
                },
            },
            self.snapshot.revision_id,
        )
        return self.store.create_job(
            key,
            request,
            self.snapshot.revision_id,
            max_attempts=max_attempts,
        )["job"]

    def wait_for(self, job_id, states=TERMINAL, timeout=10):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            job = self.store.get_job(job_id)
            if job["state"] in states:
                return job
            time.sleep(0.03)
        self.fail("job did not reach %s; last state was %s" % (states, self.store.get_job(job_id)["state"]))

    def test_real_runner_publishes_a_fenced_atomic_result(self):
        job = self.create_job("manager-success-0001")
        manager = ScreeningJobManager(
            root=server.ROOT,
            runtime_root=self.runtime_root,
            store=self.store,
            poll_seconds=0.02,
        )
        try:
            manager.start()
            manager.notify()
            completed = self.wait_for(job["job_id"])
        finally:
            manager.stop()
        self.assertEqual(completed["state"], "SUCCEEDED")
        self.assertEqual(completed["attempt_count"], 1)
        self.assertIn(completed["result"]["summary"]["status"], {"COMPLETED", "PARTIAL"})
        self.assertTrue(completed["result_hash"].startswith("sha256:"))
        self.assertGreater(len(self.store.list_progress(job["job_id"])), 0)

    def test_runner_environment_is_allowlisted_and_excludes_provider_secrets(self):
        manager = ScreeningJobManager(
            root=server.ROOT,
            runtime_root=self.runtime_root,
            store=self.store,
        )
        injected = {
            "OPENBEXI_API_ANALYST_TOKEN": "api-secret-value",
            "OPENBEXI_CURSOR_SECRET": "cursor-secret-value",
            "SPACETRACK_USERNAME": "provider-user",
            "SPACETRACK_PASSWORD": "provider-secret-value",
            "FUTURE_PROVIDER_API_KEY": "future-secret-value",
            "NODE_OPTIONS": "--require=untrusted-module",
            "PATH": os.environ.get("PATH", ""),
        }
        with patch.dict(os.environ, injected, clear=False):
            environment = manager._runner_environment()

        self.assertEqual(environment["PATH"], injected["PATH"])
        self.assertEqual(environment["NODE_NO_WARNINGS"], "1")
        for secret_name in injected.keys() - {"PATH"}:
            self.assertNotIn(secret_name, environment)
        self.assertTrue(set(environment).issubset({
            "COMSPEC", "LANG", "LC_ALL", "PATH", "PATHEXT", "SYSTEMROOT",
            "TEMP", "TMP", "TMPDIR", "TZ", "WINDIR", "NODE_NO_WARNINGS",
        }))

    def test_progress_is_coalesced_and_latest_snapshot_precedes_terminal_state(self):
        runner = self.runtime_root / "progress-flood-runner.mjs"
        runner.write_text(
            "import { writeFileSync } from 'node:fs';\n"
            "const output = process.argv[process.argv.indexOf('--output') + 1];\n"
            "for (let index = 0; index < 2000; index += 1) {\n"
            "  console.log(JSON.stringify({type:'progress',progress:{"
            "stage:'STAGE_' + (index % 20),fraction:index / 2000,completed:index,total:2000}}));\n"
            "}\n"
            "writeFileSync(output, JSON.stringify({status:'COMPLETED',scientific_status:'COMPLETE',"
            "candidates:[],errors:[],events:[]}));\n",
            encoding="utf-8",
        )
        job = self.create_job("manager-progress-coalescing-0001")
        manager = ScreeningJobManager(
            root=server.ROOT,
            runtime_root=self.runtime_root,
            store=self.store,
            runner_path=runner,
            poll_seconds=0.02,
            progress_fraction_step=0.001,
            progress_heartbeat_seconds=3600,
            max_progress_records_per_attempt=12,
        )
        try:
            manager.start()
            manager.notify()
            completed = self.wait_for(job["job_id"])
        finally:
            manager.stop()

        self.assertEqual(completed["state"], "SUCCEEDED")
        progress = self.store.list_progress(job["job_id"], limit=100)
        self.assertEqual(len(progress), 12)
        self.assertEqual(progress[-1]["payload"]["details"]["completed"], 1999)
        self.assertAlmostEqual(progress[-1]["payload"]["fraction"], 1999 / 2000)

        outbox = self.store.list_outbox(job_id=job["job_id"], limit=100)
        last_progress_index = max(
            index for index, record in enumerate(outbox) if record["event_type"] == "job.progress"
        )
        succeeded_state_index = next(
            index
            for index, record in enumerate(outbox)
            if record["event_type"] == "job.state" and record["payload"]["state"] == "SUCCEEDED"
        )
        self.assertLess(last_progress_index, succeeded_state_index)
        self.assertEqual(completed["progress_fraction"], 1.0)
        self.assertEqual(completed["progress_stage"], "complete")

    def test_completed_job_replay_persists_repeated_engine_event_ids(self):
        runner = self.runtime_root / "deterministic-event-runner.mjs"
        runner.write_text(
            "import { writeFileSync } from 'node:fs';\n"
            "const output = process.argv[process.argv.indexOf('--output') + 1];\n"
            "const result = {status:'COMPLETED',scientific_status:'COMPLETE',candidates:[],errors:[],events:[{"
            "event_id:'engine:event:deterministic-replay',primary_object_id:'obx:norad:25544',"
            "secondary_object_id:'obx:norad:20580',tca:'2026-07-20T00:00:30.000Z',"
            "miss_distance_km:1.25,relative_velocity_km_s:11.75}]};\n"
            "writeFileSync(output, JSON.stringify(result));\n",
            encoding="utf-8",
        )
        original = self.create_job("manager-replay-original-0001")
        manager = ScreeningJobManager(
            root=server.ROOT,
            runtime_root=self.runtime_root,
            store=self.store,
            runner_path=runner,
            poll_seconds=0.02,
        )
        flag = ServerFeatureFlag(
            "experimental_full_catalog_screening",
            True,
            "server",
            "Experimental",
            "non-operational",
            "tests",
            "docs/science/EXPERIMENTAL_FULL_CATALOG_SCREENING_V2_1.md",
        )
        service = V21ApiService(
            root=server.ROOT,
            runtime_root=self.runtime_root,
            store=self.store,
            feature_flag=flag,
            authenticator=BearerTokenAuthenticator(),
            cursor_secret=b"manager-replay-test-cursor-secret",
            manager=manager,
        )
        principal = Principal("local:test-analyst", "analyst", "test-fingerprint")
        try:
            manager.start()
            manager.notify()
            completed_original = self.wait_for(original["job_id"])
            created, replay = service.replay_job(
                original["job_id"],
                "manager-replay-execution-0001",
                principal,
            )
            self.assertTrue(created)
            completed_replay = self.wait_for(replay["job_id"])
        finally:
            manager.stop()

        self.assertEqual(completed_original["state"], "SUCCEEDED")
        self.assertEqual(completed_replay["state"], "SUCCEEDED")
        original_events = self.store.list_events(job_id=original["job_id"])["items"]
        replay_events = self.store.list_events(job_id=replay["job_id"])["items"]
        self.assertEqual(len(original_events), 1)
        self.assertEqual(len(replay_events), 1)
        self.assertNotEqual(
            original_events[0]["event_revision_id"],
            replay_events[0]["event_revision_id"],
        )
        for event in original_events + replay_events:
            self.assertEqual(event["payload"]["event_id"], "engine:event:deterministic-replay")
            self.assertEqual(event["payload"]["engine_event_id"], "engine:event:deterministic-replay")
            self.assertEqual(event["payload"]["event_revision_id"], event["event_revision_id"])

    def test_running_job_cancellation_terminates_the_subprocess(self):
        runner = self.runtime_root / "slow-runner.mjs"
        runner.write_text("setInterval(() => {}, 1000);\n", encoding="utf-8")
        job = self.create_job("manager-cancel-0001")
        manager = ScreeningJobManager(
            root=server.ROOT,
            runtime_root=self.runtime_root,
            store=self.store,
            runner_path=runner,
            poll_seconds=0.02,
            terminate_grace_seconds=0.2,
        )
        try:
            manager.start()
            running = self.wait_for(job["job_id"], {"RUNNING"})
            self.assertEqual(running["attempt_count"], 1)
            self.store.request_cancellation(job["job_id"], actor_id="test")
            cancelled = self.wait_for(job["job_id"])
        finally:
            manager.stop()
        self.assertEqual(cancelled["state"], "CANCELLED")
        self.assertEqual(self.store.list_attempts(job["job_id"])[0]["state"], "CANCELLED")

    def test_timeout_is_terminal_after_process_enforcement(self):
        runner = self.runtime_root / "timeout-runner.mjs"
        runner.write_text("setInterval(() => {}, 1000);\n", encoding="utf-8")
        job = self.create_job("manager-timeout-0001")
        manager = ScreeningJobManager(
            root=server.ROOT,
            runtime_root=self.runtime_root,
            store=self.store,
            runner_path=runner,
            poll_seconds=0.02,
            terminate_grace_seconds=0.2,
        )
        manager._timeout_seconds = lambda claimed: 0.1
        try:
            manager.start()
            timed_out = self.wait_for(job["job_id"])
        finally:
            manager.stop()
        self.assertEqual(timed_out["state"], "TIMED_OUT")
        self.assertEqual(timed_out["error"]["code"], "JOB_TIMEOUT")

    def test_structured_runner_failure_is_preserved(self):
        runner = self.runtime_root / "failing-runner.mjs"
        runner.write_text(
            "console.log(JSON.stringify({type:'progress',progress:{stage:'VERIFY_CATALOG',"
            "fraction:0.25,completed:1,total:4}}));\n"
            "console.log(JSON.stringify({type:'progress',progress:{stage:'VERIFY_CATALOG',"
            "fraction:0.25,completed:2,total:4}}));\n"
            "console.log(JSON.stringify({type:'error',error:{code:'CATALOG_CHECKSUM_MISMATCH',"
            "message:'Frozen catalog checksum did not match.',stage:'VERIFY_CATALOG'}}));\n"
            "process.exitCode = 1;\n",
            encoding="utf-8",
        )
        job = self.create_job("manager-failure-0001")
        manager = ScreeningJobManager(
            root=server.ROOT,
            runtime_root=self.runtime_root,
            store=self.store,
            runner_path=runner,
            poll_seconds=0.02,
        )
        try:
            manager.start()
            failed = self.wait_for(job["job_id"])
        finally:
            manager.stop()
        self.assertEqual(failed["state"], "FAILED")
        self.assertEqual(failed["error"]["code"], "CATALOG_CHECKSUM_MISMATCH")
        self.assertEqual(failed["error"]["stage"], "VERIFY_CATALOG")
        self.assertEqual(failed["error"]["message"], "Frozen catalog checksum did not match.")
        progress = self.store.list_progress(job["job_id"])
        self.assertEqual(len(progress), 2)
        self.assertEqual(progress[-1]["payload"]["details"]["completed"], 2)
        outbox = self.store.list_outbox(job_id=job["job_id"])
        self.assertLess(
            max(index for index, item in enumerate(outbox) if item["event_type"] == "job.progress"),
            next(
                index
                for index, item in enumerate(outbox)
                if item["event_type"] == "job.state" and item["payload"]["state"] == "FAILED"
            ),
        )


if __name__ == "__main__":
    unittest.main()
