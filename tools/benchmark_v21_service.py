#!/usr/bin/env python3
"""Benchmark the local v2.1 durable screening service through its HTTP API.

This is development evidence, not a scientific-accuracy or production-capacity
claim. Each run uses a fresh private runtime and generated role credentials.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import http.client
import json
import math
import os
import platform
import secrets
import shutil
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Dict, Iterable, Optional, Sequence, Tuple
from urllib.parse import quote, urlencode


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
from services.v21.api import API_VERSION, SERVICE_SCHEMA_VERSION, V21ApiService  # noqa: E402
from services.v21.feature_flags import load_server_feature_flag  # noqa: E402
from services.v21.http_api import V21HttpRouter  # noqa: E402
from services.v21.job_manager import ScreeningJobManager  # noqa: E402
from services.v21.job_store import JobStore, canonical_json  # noqa: E402
from services.v21.security import BearerTokenAuthenticator  # noqa: E402


TERMINAL_STATES = frozenset(("SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"))
DEFAULT_START_TIME = "2026-07-20T00:00:00Z"
ALL_OBJECT_TYPES = ("PAYLOAD", "ROCKET_BODY", "DEBRIS", "UNKNOWN")
ALL_LIFECYCLE_STATUSES = ("ACTIVE", "INACTIVE", "UNKNOWN")


class BenchmarkError(RuntimeError):
    """Raised when the benchmark cannot produce valid service evidence."""


class QuietBenchmarkHandler(server.OpenBexiHandler):
    """Use the real application handler without polluting JSON output."""

    def log_message(self, format_string: str, *args: object) -> None:
        _ = (format_string, args)


def _handler(v21_router: V21HttpRouter):
    def construct(*args: object, **kwargs: object) -> QuietBenchmarkHandler:
        return QuietBenchmarkHandler(
            *args,
            serve_static=False,
            cors_origins=(),
            v21_router=v21_router,
            **kwargs,
        )

    return construct


def _utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _sha256_json(value: object) -> str:
    return "sha256:" + hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _command_text(command: Sequence[str], fallback: str = "unavailable") -> str:
    try:
        completed = subprocess.run(
            list(command),
            cwd=str(ROOT),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            check=True,
        )
        return completed.stdout.strip() or fallback
    except (OSError, subprocess.SubprocessError):
        return fallback


def _working_tree_dirty() -> Optional[bool]:
    try:
        completed = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(ROOT),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=5,
            check=True,
        )
        return bool(completed.stdout.strip())
    except (OSError, subprocess.SubprocessError):
        return None


def _duration_ms(start: Optional[str], end: Optional[str]) -> Optional[float]:
    if not start or not end:
        return None
    try:
        start_value = dt.datetime.fromisoformat(str(start).replace("Z", "+00:00"))
        end_value = dt.datetime.fromisoformat(str(end).replace("Z", "+00:00"))
    except ValueError:
        return None
    return round(max(0.0, (end_value - start_value).total_seconds() * 1000.0), 3)


def _percentile(values: Sequence[float], quantile: float) -> float:
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(quantile * len(ordered)) - 1))
    return ordered[index]


class LatencyRecorder:
    def __init__(self) -> None:
        self._samples: Dict[str, list[Dict[str, Any]]] = {}

    def add(self, label: str, elapsed_ms: float, status: int, response_bytes: int) -> None:
        self._samples.setdefault(label, []).append({
            "elapsed_ms": float(elapsed_ms),
            "status": int(status),
            "response_bytes": int(response_bytes),
        })

    def report(self) -> Dict[str, Dict[str, Any]]:
        result: Dict[str, Dict[str, Any]] = {}
        for label in sorted(self._samples):
            samples = self._samples[label]
            values = [sample["elapsed_ms"] for sample in samples]
            status_counts: Dict[str, int] = {}
            for sample in samples:
                key = str(sample["status"])
                status_counts[key] = status_counts.get(key, 0) + 1
            result[label] = {
                "sample_count": len(samples),
                "minimum_ms": round(min(values), 3),
                "median_ms": round(statistics.median(values), 3),
                "mean_ms": round(statistics.fmean(values), 3),
                "p95_ms": round(_percentile(values, 0.95), 3),
                "maximum_ms": round(max(values), 3),
                "response_bytes_total": sum(sample["response_bytes"] for sample in samples),
                "status_counts": status_counts,
            }
        return result


class ApiClient:
    def __init__(self, port: int, tokens: Dict[str, str], recorder: LatencyRecorder) -> None:
        self.port = int(port)
        self.tokens = tokens
        self.recorder = recorder

    def request(
        self,
        method: str,
        path: str,
        *,
        label: str,
        role: Optional[str] = None,
        payload: Optional[object] = None,
        headers: Optional[Dict[str, str]] = None,
        expected_statuses: Iterable[int] = (200,),
    ) -> Tuple[int, Dict[str, str], object]:
        outgoing = dict(headers or {})
        if role is not None:
            outgoing["Authorization"] = "Bearer " + self.tokens[role]
        body = None
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            outgoing["Content-Type"] = "application/json"
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        started = time.perf_counter_ns()
        try:
            connection.request(method, path, body=body, headers=outgoing)
            response = connection.getresponse()
            raw = response.read()
            elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000.0
            self.recorder.add(label, elapsed_ms, response.status, len(raw))
            response_headers = {name.lower(): value for name, value in response.getheaders()}
        finally:
            connection.close()
        try:
            decoded = json.loads(raw.decode("utf-8")) if raw else None
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise BenchmarkError("%s %s returned invalid JSON" % (method, path)) from exc
        if response.status not in set(expected_statuses):
            code = decoded.get("code") if isinstance(decoded, dict) else None
            detail = decoded.get("detail") if isinstance(decoded, dict) else None
            raise BenchmarkError(
                "%s %s returned HTTP %d%s%s"
                % (
                    method,
                    path,
                    response.status,
                    " (" + str(code) + ")" if code else "",
                    ": " + str(detail) if detail else "",
                )
            )
        return response.status, response_headers, decoded


def _scope_object_ids(limit: int) -> Optional[list[str]]:
    if limit <= 0:
        return None
    records = json.loads((ROOT / "json" / "tle" / "TLE.json").read_text(encoding="utf-8"))
    identifiers = []
    for record in records:
        norad_id = str(record.get("norad_id") or record.get("NORAD_CAT_ID") or "").strip()
        if norad_id:
            identifiers.append("obx:norad:" + norad_id)
        if len(identifiers) >= limit:
            break
    if len(identifiers) < 2:
        raise BenchmarkError("--object-limit must select at least two catalog records")
    return identifiers


def _file_bytes(paths: Iterable[Path]) -> int:
    total = 0
    for path in paths:
        try:
            if path.is_file():
                total += path.stat().st_size
        except OSError:
            continue
    return total


def _tree_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return [path for path in root.rglob("*") if path.is_file()]


def _persistence_snapshot(runtime_root: Path, database_path: Path, job_id: Optional[str]) -> Dict[str, Any]:
    all_files = _tree_files(runtime_root)
    database_files = [database_path, Path(str(database_path) + "-wal"), Path(str(database_path) + "-shm")]
    job_root = runtime_root / "jobs" / str(job_id) if job_id else runtime_root / "jobs"
    job_files = _tree_files(job_root)
    catalog_files = _tree_files(runtime_root / "catalogs")
    database_bytes = database_path.stat().st_size if database_path.exists() else 0
    wal_path = Path(str(database_path) + "-wal")
    shm_path = Path(str(database_path) + "-shm")
    wal_bytes = wal_path.stat().st_size if wal_path.exists() else 0
    shm_bytes = shm_path.stat().st_size if shm_path.exists() else 0
    job_bytes = _file_bytes(job_files)
    catalog_bytes = _file_bytes(catalog_files)
    total_bytes = _file_bytes(all_files)
    categorized = database_bytes + wal_bytes + shm_bytes + job_bytes + catalog_bytes
    result_files = [path for path in job_files if path.name == "result.json"]
    input_files = [path for path in job_files if path.name == "input.json"]
    return {
        "sqlite_database_bytes": database_bytes,
        "sqlite_wal_bytes": wal_bytes,
        "sqlite_shared_memory_bytes": shm_bytes,
        "sqlite_total_bytes": _file_bytes(database_files),
        "job_artifact_bytes": job_bytes,
        "job_artifact_file_count": len(job_files),
        "job_input_envelope_bytes": _file_bytes(input_files),
        "job_result_artifact_bytes": _file_bytes(result_files),
        "catalog_snapshot_bytes": catalog_bytes,
        "catalog_snapshot_file_count": len(catalog_files),
        "other_runtime_bytes": max(0, total_bytes - categorized),
        "total_persistence_bytes": total_bytes,
        "total_runtime_file_count": len(all_files),
    }


def _atomic_write_json(path: Path, payload: object) -> None:
    encoded = (json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix=".%s." % path.name, suffix=".tmp", dir=str(path.parent))
    temporary = Path(temporary_name)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(str(temporary), str(path))
    finally:
        temporary.unlink(missing_ok=True)


def _build_request(catalog_revision_id: str, start_time: str, object_ids: Optional[list[str]], args: argparse.Namespace) -> Dict[str, Any]:
    scope: Dict[str, Any] = {
        "object_types": list(ALL_OBJECT_TYPES),
        "lifecycle_statuses": list(ALL_LIFECYCLE_STATUSES),
    }
    if object_ids is not None:
        scope["object_ids"] = object_ids
    return {
        "schema_version": SERVICE_SCHEMA_VERSION,
        "catalog_revision_id": catalog_revision_id,
        "catalog_scope": scope,
        "configuration": {
            "start_time": start_time,
            "horizon_seconds": 60,
            "coarse_step_seconds": 60,
            "screening_radius_km": args.screening_radius_km,
            "max_attempts": 1,
            "timeout_seconds": args.job_timeout_seconds,
        },
    }


def _poll_job(client: ApiClient, job_id: str, timeout_seconds: float) -> Tuple[Dict[str, Any], float]:
    deadline = time.monotonic() + timeout_seconds
    started = time.perf_counter_ns()
    encoded_job_id = quote(job_id, safe="")
    while time.monotonic() < deadline:
        _, _, job = client.request(
            "GET",
            "/api/v1/screening-jobs/" + encoded_job_id,
            label="GET /api/v1/screening-jobs/{job_id}",
            role="viewer",
        )
        if not isinstance(job, dict):
            raise BenchmarkError("screening job response is not an object")
        if job.get("state") in TERMINAL_STATES:
            elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000.0
            return job, elapsed_ms
        elapsed = timeout_seconds - max(0.0, deadline - time.monotonic())
        delay = 0.1 if elapsed < 2 else (0.25 if elapsed < 10 else (0.5 if elapsed < 30 else 1.0))
        time.sleep(delay)
    raise BenchmarkError("screening job did not reach a terminal state within %.1f seconds" % timeout_seconds)


def _query_events(client: ApiClient, job_id: str) -> Tuple[int, int]:
    total = 0
    pages = 0
    cursor: Optional[str] = None
    while True:
        query = {"job_id": job_id, "limit": "200"}
        if cursor:
            query["cursor"] = cursor
        _, _, page = client.request(
            "GET",
            "/api/v1/conjunction-events?" + urlencode(query),
            label="GET /api/v1/conjunction-events",
            role="viewer",
        )
        if not isinstance(page, dict) or not isinstance(page.get("items"), list):
            raise BenchmarkError("conjunction event response is not a page")
        pages += 1
        total += len(page["items"])
        cursor = page.get("next_cursor")
        if not cursor:
            return total, pages
        if pages >= 1000:
            raise BenchmarkError("conjunction event pagination exceeded 1,000 pages")


def _scientific_summary(job: Dict[str, Any]) -> Dict[str, Any]:
    manifest = job.get("result") if isinstance(job.get("result"), dict) else {}
    summary = manifest.get("summary") if isinstance(manifest.get("summary"), dict) else {}
    statistics_value = summary.get("statistics") if isinstance(summary.get("statistics"), dict) else {}
    return {
        "job_state": job.get("state"),
        "scientific_status": summary.get("status"),
        "capability": summary.get("capability"),
        "maturity": summary.get("maturity"),
        "safety_class": "non-operational",
        "quality_flags": summary.get("quality_flags") if isinstance(summary.get("quality_flags"), list) else [],
        "resource_limit_reason": summary.get("resource_limit_reason"),
        "candidate_count": manifest.get("candidate_count"),
        "event_count": manifest.get("event_count"),
        "error_count": manifest.get("error_count"),
        "statistics": statistics_value,
    }


def run_benchmark(args: argparse.Namespace) -> Dict[str, Any]:
    release = json.loads((ROOT / "release" / "version.json").read_text(encoding="utf-8"))
    runtime_root = Path(tempfile.mkdtemp(prefix="openbexi-v21-service-benchmark-")).resolve()
    try:
        os.chmod(runtime_root, 0o700)
    except OSError:
        pass
    database_path = runtime_root / "service.sqlite3"
    store: Optional[JobStore] = None
    manager: Optional[ScreeningJobManager] = None
    service: Optional[V21ApiService] = None
    httpd = None
    server_thread: Optional[threading.Thread] = None
    job_id: Optional[str] = None
    report: Optional[Dict[str, Any]] = None
    live_persistence: Optional[Dict[str, Any]] = None
    record_counts: Dict[str, int] = {}
    jobs_by_state: Dict[str, int] = {}
    failure: Optional[BaseException] = None
    try:
        tokens = {
            "viewer": secrets.token_urlsafe(32),
            "analyst": secrets.token_urlsafe(32),
            "administrator": secrets.token_urlsafe(32),
        }
        authenticator = BearerTokenAuthenticator(tuple((role, token) for role, token in tokens.items()))
        feature_flag = load_server_feature_flag(ROOT, "experimental_full_catalog_screening")
        if not feature_flag.enabled:
            raise BenchmarkError("experimental_full_catalog_screening is disabled for this release channel")
        store = JobStore(database_path)
        manager = ScreeningJobManager(
            root=ROOT,
            runtime_root=runtime_root,
            store=store,
            poll_seconds=0.02,
        )
        service = V21ApiService(
            root=ROOT,
            runtime_root=runtime_root,
            store=store,
            feature_flag=feature_flag,
            authenticator=authenticator,
            cursor_secret=secrets.token_bytes(32),
            manager=manager,
        )
        service_started_ns = time.perf_counter_ns()
        startup = service.start()
        service_startup_ms = (time.perf_counter_ns() - service_started_ns) / 1_000_000.0

        router = V21HttpRouter(service, stream_seconds=0.1)
        httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), _handler(router))
        server_thread = threading.Thread(target=httpd.serve_forever, name="v21-benchmark-http", daemon=True)
        server_thread.start()
        port = int(httpd.server_address[1])
        recorder = LatencyRecorder()
        client = ApiClient(port, tokens, recorder)

        client.request(
            "GET",
            "/api/v1/capabilities",
            label="GET /api/v1/capabilities",
        )
        client.request(
            "GET",
            "/api/v1/health/ready",
            label="GET /api/v1/health/ready",
        )
        _, _, catalog = client.request(
            "GET",
            "/api/v1/catalog-revisions/current",
            label="GET /api/v1/catalog-revisions/current",
            role="viewer",
        )
        if not isinstance(catalog, dict):
            raise BenchmarkError("current catalog response is not an object")
        start_time = args.start_time or str(catalog.get("retrieved_at") or DEFAULT_START_TIME)
        object_ids = _scope_object_ids(args.object_limit)
        job_request = _build_request(str(catalog["revision_id"]), start_time, object_ids, args)
        submission_started_ns = time.perf_counter_ns()
        _, _, submitted = client.request(
            "POST",
            "/api/v1/screening-jobs",
            label="POST /api/v1/screening-jobs",
            role="analyst",
            payload=job_request,
            headers={"Idempotency-Key": "benchmark-" + secrets.token_hex(16)},
            expected_statuses=(202,),
        )
        if not isinstance(submitted, dict) or not submitted.get("job_id"):
            raise BenchmarkError("screening submission did not return a job identifier")
        job_id = str(submitted["job_id"])
        terminal, polling_ms = _poll_job(client, job_id, args.wait_timeout_seconds)
        submission_to_terminal_ms = (time.perf_counter_ns() - submission_started_ns) / 1_000_000.0
        event_count, event_pages = _query_events(client, job_id)

        store_stats = store.stats()
        record_counts = dict(store_stats.get("record_counts") or {})
        jobs_by_state = dict(store_stats.get("jobs_by_state") or {})
        live_persistence = _persistence_snapshot(runtime_root, database_path, job_id)
        scientific = _scientific_summary(terminal)
        normalized_request = terminal.get("request") if isinstance(terminal.get("request"), dict) else job_request
        normalized_configuration = normalized_request.get("configuration", {})
        report = {
            "schema_version": "1.0.0",
            "benchmark": "OPENBEXI_V21_DURABLE_SCREENING_SERVICE",
            "benchmark_status": "PASS" if terminal.get("state") == "SUCCEEDED" else "FAIL",
            "captured_at_utc": _utc_now(),
            "labels": {
                "application_version": str(release.get("version")),
                "api_version": API_VERSION,
                "service_schema_version": SERVICE_SCHEMA_VERSION,
                "publication_state": str(release.get("publicationState")),
                "release_channel": str(release.get("channel")),
                "capability_maturity": feature_flag.scientific_maturity,
                "safety_class": feature_flag.safety_class,
                "intended_use": "development-benchmark-only",
                "operational_use": False,
                "scientific_accuracy_claim": False,
            },
            "environment": {
                "name": args.environment_name,
                "operating_system": platform.platform(),
                "machine_architecture": platform.machine(),
                "logical_cpu_count": os.cpu_count(),
                "python_version": platform.python_version(),
                "node_version": _command_text(("node", "--version")),
                "code_revision": _command_text(("git", "rev-parse", "HEAD")),
                "working_tree_dirty": _working_tree_dirty(),
                "loopback_http": True,
                "runtime_retained": bool(args.keep_runtime),
                "retained_runtime_root": str(runtime_root) if args.keep_runtime else None,
            },
            "source_identity": {
                "catalog_revision_id": catalog.get("revision_id"),
                "source_id": catalog.get("source_id"),
                "dataset_id": catalog.get("dataset_id"),
                "dataset_hash": catalog.get("dataset_hash"),
                "dataset_format": catalog.get("dataset_format") or catalog.get("format"),
                "adapter_version": catalog.get("adapter_version"),
                "source_status": catalog.get("source_status"),
                "retrieved_at": catalog.get("retrieved_at"),
                "catalog_object_count": catalog.get("object_count"),
                "scoped_object_count": len(object_ids) if object_ids is not None else catalog.get("object_count"),
                "scope_mode": "bounded-object-list" if object_ids is not None else "full-catalog",
            },
            "configuration_identity": {
                "request_hash": terminal.get("request_hash") or _sha256_json(normalized_request),
                "configuration_hash": _sha256_json(normalized_configuration),
                "configuration": normalized_configuration,
            },
            "timing": {
                "service_bootstrap_and_worker_start_ms": round(service_startup_ms, 3),
                "submission_to_terminal_observation_ms": round(submission_to_terminal_ms, 3),
                "polling_window_ms": round(polling_ms, 3),
                "queue_to_terminal_ms": _duration_ms(terminal.get("created_at"), terminal.get("completed_at")),
                "worker_execution_ms": _duration_ms(terminal.get("started_at"), terminal.get("completed_at")),
                "endpoint_latency": recorder.report(),
            },
            "job": {
                "job_id": job_id,
                "state": terminal.get("state"),
                "attempt_count": terminal.get("attempt_count"),
                "result_hash": terminal.get("result_hash"),
                "scientific": scientific,
                "queried_conjunction_event_count": event_count,
                "conjunction_event_query_pages": event_pages,
            },
            "persistence": {
                "record_counts": record_counts,
                "jobs_by_state": jobs_by_state,
                "live_before_shutdown": live_persistence,
                "after_clean_shutdown": None,
            },
            "service_start": {
                "catalog_revision_id": startup.get("catalog_revision_id"),
                "worker_started": bool((startup.get("manager") or {}).get("started")),
            },
            "limitations": [
                "This is one local run on an uncontrolled development machine; it is not a capacity SLO.",
                "Endpoint latency is loopback HTTP latency and excludes network, proxy, TLS, and multi-user contention.",
                "The screening horizon is 60 seconds and does not characterize longer production workloads.",
                "The result uses experimental TLE/SGP4 screening and is non-operational.",
                "No covariance, collision probability, maneuver recommendation, or scientific-accuracy claim is provided.",
                "Catalog provenance, freshness, completeness, and licensing limitations remain applicable.",
                "Persistence bytes describe this catalog revision and one job; SQLite allocation granularity affects totals.",
            ],
        }
        if object_ids is not None:
            report["limitations"].append(
                "This run used a bounded object list and does not represent full-catalog screening throughput."
            )
    except BaseException as exc:
        failure = exc
    finally:
        if httpd is not None:
            httpd.shutdown()
            httpd.server_close()
        if server_thread is not None:
            server_thread.join(timeout=5)
        if service is not None:
            service.stop()
        elif manager is not None:
            manager.stop()
        if store is not None:
            store.close()

    if failure is not None:
        if not args.keep_runtime:
            shutil.rmtree(runtime_root, ignore_errors=True)
        raise failure.with_traceback(failure.__traceback__)
    if report is None:
        if not args.keep_runtime:
            shutil.rmtree(runtime_root, ignore_errors=True)
        raise BenchmarkError("benchmark did not produce a report")
    report["persistence"]["after_clean_shutdown"] = _persistence_snapshot(runtime_root, database_path, job_id)
    if not args.keep_runtime:
        shutil.rmtree(runtime_root, ignore_errors=True)
    return report


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a repeatable local benchmark of the v2.1 durable screening HTTP service."
    )
    parser.add_argument("--output", type=Path, help="Write the JSON report atomically to this path.")
    parser.add_argument(
        "--environment-name",
        default="local-development",
        help="Stable name for the benchmark environment (default: local-development).",
    )
    parser.add_argument(
        "--object-limit",
        type=int,
        default=0,
        help="Screen only the first N bundled objects; 0 screens the full catalog (default: 0).",
    )
    parser.add_argument("--start-time", help="UTC screening start time; defaults to source retrieval time.")
    parser.add_argument(
        "--screening-radius-km",
        type=float,
        default=10.0,
        help="Close-approach screening radius in km (default: 10).",
    )
    parser.add_argument(
        "--job-timeout-seconds",
        type=int,
        default=120,
        help="Worker-enforced job timeout in seconds (default: 120).",
    )
    parser.add_argument(
        "--wait-timeout-seconds",
        type=float,
        default=180.0,
        help="Client wait bound in seconds (default: 180).",
    )
    parser.add_argument(
        "--keep-runtime",
        action="store_true",
        help="Retain the generated private runtime for inspection.",
    )
    args = parser.parse_args(argv)
    if args.object_limit == 1 or args.object_limit < 0 or args.object_limit > 25_000:
        parser.error("--object-limit must be 0 or an integer from 2 through 25,000")
    if not math.isfinite(args.screening_radius_km) or not (0.001 <= args.screening_radius_km <= 1000):
        parser.error("--screening-radius-km must be between 0.001 and 1,000")
    if not (10 <= args.job_timeout_seconds <= 7200):
        parser.error("--job-timeout-seconds must be between 10 and 7,200")
    if not math.isfinite(args.wait_timeout_seconds) or args.wait_timeout_seconds <= 0:
        parser.error("--wait-timeout-seconds must be positive")
    if not str(args.environment_name).strip():
        parser.error("--environment-name must be non-empty")
    return args


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        report = run_benchmark(args)
    except (BenchmarkError, OSError, ValueError) as exc:
        print("v2.1 service benchmark failed: %s" % exc, file=sys.stderr)
        return 1
    if args.output:
        _atomic_write_json(args.output, report)
    print(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False))
    return 0 if report.get("benchmark_status") == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
