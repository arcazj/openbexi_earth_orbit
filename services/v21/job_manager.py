"""Single-node subprocess supervisor for durable v2.1 screening jobs."""

from __future__ import annotations

import hashlib
import json
import os
import queue
import re
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

from .job_store import JobNotFoundError, JobStore, StateTransitionError


MAX_RESULT_BYTES = 256 * 1024 * 1024
MAX_LOG_LINE_BYTES = 64 * 1024
PRIVATE_JOB_ID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
DEFAULT_PROGRESS_FRACTION_STEP = 0.01
DEFAULT_PROGRESS_HEARTBEAT_SECONDS = 5.0
DEFAULT_MAX_PROGRESS_RECORDS_PER_ATTEMPT = 512
MAX_EARLY_PROGRESS_STAGES = 16
RUNNER_ENVIRONMENT_ALLOWLIST = frozenset({
    "COMSPEC",
    "LANG",
    "LC_ALL",
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "TZ",
    "WINDIR",
})


@dataclass
class _ProgressState:
    observed_fraction: float
    persisted_fraction: float
    latest_stage: Optional[str]
    latest_details: Dict[str, Any]
    persisted_stage: Optional[str]
    persisted_details: Dict[str, Any]
    last_persisted_at: float
    heartbeat_seconds: float
    persisted_count: int = 0
    seen_stages: set[str] = field(default_factory=set)


class JobManagerError(RuntimeError):
    pass


def _atomic_json(path: Path, payload: object) -> None:
    encoded = (json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")
    temporary = path.with_name(".%s.%d.tmp" % (path.name, os.getpid()))
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with temporary.open("wb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(str(temporary), str(path))
    finally:
        temporary.unlink(missing_ok=True)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def _bounded_error(code: str, message: str, **details: object) -> Dict[str, object]:
    clean_message = str(message).replace("\r", " ").replace("\n", " ")[:1000]
    return {
        "code": str(code),
        "message": clean_message,
        **{key: value for key, value in details.items() if value is not None},
    }


class ScreeningJobManager:
    """Claim queued jobs and execute one locked Node runner at a time.

    SQLite is intentionally the single source of truth. The manager never keeps
    a second in-memory queue, and restart recovery is delegated to JobStore.
    """

    def __init__(
        self,
        *,
        root: Path,
        runtime_root: Path,
        store: JobStore,
        node_executable: Optional[str] = None,
        runner_path: Optional[Path] = None,
        poll_seconds: float = 0.2,
        terminate_grace_seconds: float = 2.0,
        worker_id: Optional[str] = None,
        progress_fraction_step: float = DEFAULT_PROGRESS_FRACTION_STEP,
        progress_heartbeat_seconds: float = DEFAULT_PROGRESS_HEARTBEAT_SECONDS,
        max_progress_records_per_attempt: int = DEFAULT_MAX_PROGRESS_RECORDS_PER_ATTEMPT,
    ) -> None:
        self.root = Path(root).resolve()
        self.runtime_root = Path(runtime_root).resolve()
        self.store = store
        self.node_executable = node_executable or shutil.which("node") or "node"
        self.runner_path = (runner_path or self.root / "scripts" / "run-full-catalog-screening.mjs").resolve()
        self.poll_seconds = max(0.02, float(poll_seconds))
        self.terminate_grace_seconds = max(0.1, float(terminate_grace_seconds))
        self.worker_id = worker_id or "local-screening-worker-%d" % os.getpid()
        self.progress_fraction_step = min(1.0, max(0.001, float(progress_fraction_step)))
        self.progress_heartbeat_seconds = max(0.1, float(progress_heartbeat_seconds))
        self.max_progress_records_per_attempt = min(
            4096, max(2, int(max_progress_records_per_attempt))
        )
        self._progress_states: Dict[tuple[str, int], _ProgressState] = {}
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._process_lock = threading.Lock()
        self._active_process: Optional[subprocess.Popen[str]] = None
        self._active_job_id: Optional[str] = None
        self.runtime_root.mkdir(parents=True, exist_ok=True)

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    @property
    def active_job_id(self) -> Optional[str]:
        with self._process_lock:
            return self._active_job_id

    def start(self) -> Dict[str, object]:
        if self.running:
            return {"started": False, "recovery": {"requeued": [], "failed": [], "cancelled": []}}
        if not self.runner_path.is_file():
            raise JobManagerError("screening runner is unavailable")
        recovery = self.store.recover_interrupted_jobs(actor_id=self.worker_id)
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="openbexi-v21-screening", daemon=True)
        self._thread.start()
        return {"started": True, "recovery": recovery}

    def notify(self) -> None:
        self._wake.set()

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        self._wake.set()
        with self._process_lock:
            process = self._active_process
        if process is not None and process.poll() is None:
            self._terminate(process)
        if self._thread:
            self._thread.join(timeout=max(0.1, float(timeout)))

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                job = self.store.claim_next_job(self.worker_id, actor_id=self.worker_id)
            except Exception:
                self._wake.wait(self.poll_seconds)
                self._wake.clear()
                continue
            if job is None:
                self._wake.wait(self.poll_seconds)
                self._wake.clear()
                continue
            try:
                self._execute(job)
            except Exception as exc:
                self._handle_failure(
                    job["job_id"],
                    int(job["attempt_count"]),
                    _bounded_error("WORKER_INTERNAL_ERROR", str(exc)),
                )

    def _job_directory(self, job: Dict[str, Any]) -> Path:
        job_id = str(job.get("job_id", ""))
        if not PRIVATE_JOB_ID.fullmatch(job_id):
            raise JobManagerError("job id is not safe for private artifact storage")
        attempt = int(job.get("attempt_count", 0))
        if attempt < 1:
            raise JobManagerError("claimed job has no active attempt")
        target = (self.runtime_root / "jobs" / job_id / ("attempt-%d" % attempt)).resolve()
        if self.runtime_root not in target.parents:
            raise JobManagerError("job artifact path escaped the runtime directory")
        target.mkdir(parents=True, exist_ok=True)
        return target

    def _catalog_envelope(self, revision: Dict[str, Any]) -> Dict[str, Any]:
        provenance = dict(revision.get("provenance") or {})
        metadata = dict(revision.get("metadata") or {})
        return {
            "revision_id": revision["revision_id"],
            "snapshot_path": revision["snapshot_path"],
            "source_format": revision.get("dataset_format") or metadata.get("source_format") or "TLE_JSON",
            "source_id": revision["source_id"],
            "provider": provenance.get("provider") or metadata.get("provider") or revision["source_id"],
            "dataset_id": revision["dataset_id"],
            "dataset_hash": revision["dataset_hash"],
            "source_status": revision["source_status"],
            "retrieved_at": revision.get("retrieved_at"),
            "source_uri": provenance.get("source_uri"),
            "partial_update": bool(provenance.get("partial_update", False)),
            "license_id": provenance.get("license_id") or metadata.get("license_id"),
            "adapter_version": revision.get("adapter_version", "2.1.0"),
        }

    def _runner_environment(self) -> Dict[str, str]:
        environment = {
            name: value
            for name, value in os.environ.items()
            if name.upper() in RUNNER_ENVIRONMENT_ALLOWLIST
        }
        environment["NODE_NO_WARNINGS"] = "1"
        return environment

    @staticmethod
    def _read_pipe(pipe, channel: str, messages: queue.Queue) -> None:
        try:
            for line in iter(pipe.readline, ""):
                encoded = line.encode("utf-8", errors="replace")
                messages.put((channel, encoded[:MAX_LOG_LINE_BYTES].decode("utf-8", errors="replace").rstrip()))
        finally:
            pipe.close()

    def _execute(self, job: Dict[str, Any]) -> None:
        job_id = job["job_id"]
        expected_attempt = int(job["attempt_count"])
        revision = self.store.get_catalog_revision(job["catalog_revision_id"])
        if revision is None:
            raise JobManagerError("job catalog revision is unavailable")
        job_directory = self._job_directory(job)
        input_path = job_directory / "input.json"
        output_path = job_directory / "result.json"
        envelope = {
            "schema_version": "2.1.0",
            "job_id": job_id,
            "catalog_revision": self._catalog_envelope(revision),
            "request": job["request"],
        }
        _atomic_json(input_path, envelope)
        command = [
            self.node_executable,
            str(self.runner_path),
            "--input", str(input_path),
            "--output", str(output_path),
            "--runtime-root", str(self.runtime_root),
        ]
        process = subprocess.Popen(
            command,
            cwd=str(self.root),
            env=self._runner_environment(),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        with self._process_lock:
            self._active_process = process
            self._active_job_id = job_id

        messages: queue.Queue = queue.Queue()
        stdout_thread = threading.Thread(
            target=self._read_pipe, args=(process.stdout, "stdout", messages), daemon=True
        )
        stderr_thread = threading.Thread(
            target=self._read_pipe, args=(process.stderr, "stderr", messages), daemon=True
        )
        stdout_thread.start()
        stderr_thread.start()
        deadline = time.monotonic() + self._timeout_seconds(job)
        stderr_lines = []
        final_record = None
        try:
            while process.poll() is None:
                def receive(record):
                    nonlocal final_record
                    if record.get("type") in {"result", "error"}:
                        final_record = record

                self._drain_messages(job_id, expected_attempt, messages, stderr_lines, receive)
                if self._stop.is_set():
                    self._flush_progress(job_id, expected_attempt)
                    self._clear_progress_state(job_id, expected_attempt)
                    self._terminate(process)
                    return
                try:
                    state = self.store.get_job(job_id)["state"]
                except JobNotFoundError:
                    self._clear_progress_state(job_id, expected_attempt)
                    self._terminate(process)
                    return
                if state == "CANCEL_REQUESTED":
                    self._terminate(process)
                    self._flush_progress(job_id, expected_attempt)
                    try:
                        self.store.finish_attempt(
                            job_id,
                            "CANCELLED",
                            error=_bounded_error("JOB_CANCELLED", "Job was cancelled by request."),
                            expected_attempt=expected_attempt,
                            worker_id=self.worker_id,
                            actor_id=self.worker_id,
                        )
                    finally:
                        self._clear_progress_state(job_id, expected_attempt)
                    return
                if time.monotonic() >= deadline:
                    self._terminate(process)
                    self._finish_or_retry(
                        job_id,
                        expected_attempt,
                        "TIMED_OUT",
                        _bounded_error("JOB_TIMEOUT", "Screening exceeded its configured timeout."),
                    )
                    return
                time.sleep(min(self.poll_seconds, 0.1))
            stdout_thread.join(timeout=1.0)
            stderr_thread.join(timeout=1.0)
            final_record = self._consume_remaining(
                job_id, expected_attempt, messages, stderr_lines, final_record
            )
            if process.returncode != 0:
                structured = final_record.get("error") if (
                    isinstance(final_record, dict)
                    and final_record.get("type") == "error"
                    and isinstance(final_record.get("error"), dict)
                ) else {}
                code = str(structured.get("code") or "RUNNER_FAILED").upper()
                if not re.fullmatch(r"[A-Z][A-Z0-9_]{0,79}", code):
                    code = "RUNNER_FAILED"
                message = str(structured.get("message") or "Runner exited with status %d." % process.returncode)
                if stderr_lines and not structured:
                    message += " " + " ".join(stderr_lines[-3:])[:1000]
                self._finish_or_retry(
                    job_id,
                    expected_attempt,
                    "FAILED",
                    _bounded_error(code, message, stage=structured.get("stage")),
                )
                return
            result = self._read_result(output_path, final_record)
            self._import_result(job_id, expected_attempt, result)
        finally:
            with self._process_lock:
                self._active_process = None
                self._active_job_id = None

    def _timeout_seconds(self, job: Dict[str, Any]) -> float:
        configuration = (job.get("request") or {}).get("configuration") or {}
        value = configuration.get("timeout_seconds", 1800)
        try:
            return min(7200.0, max(10.0, float(value)))
        except (TypeError, ValueError):
            return 1800.0

    def _progress_state(self, job_id: str, expected_attempt: int) -> _ProgressState:
        key = (job_id, expected_attempt)
        state = self._progress_states.get(key)
        if state is not None:
            return state
        current = self.store.get_job(job_id)
        current_fraction = float(current.get("progress_fraction", 0.0))
        timeout_seconds = self._timeout_seconds(current)
        state = _ProgressState(
            observed_fraction=current_fraction,
            persisted_fraction=current_fraction,
            latest_stage=current.get("progress_stage"),
            latest_details={},
            persisted_stage=current.get("progress_stage"),
            persisted_details={},
            last_persisted_at=time.monotonic(),
            heartbeat_seconds=max(self.progress_heartbeat_seconds, timeout_seconds / 256.0),
        )
        self._progress_states[key] = state
        return state

    def _persist_progress(
        self,
        job_id: str,
        expected_attempt: int,
        state: _ProgressState,
        *,
        force: bool = False,
    ) -> bool:
        record_limit = self.max_progress_records_per_attempt if force else (
            self.max_progress_records_per_attempt - 1
        )
        if state.persisted_count >= record_limit or state.latest_stage is None:
            return False
        unchanged = (
            state.latest_stage == state.persisted_stage
            and state.observed_fraction == state.persisted_fraction
            and state.latest_details == state.persisted_details
        )
        if unchanged:
            return False
        self.store.update_progress(
            job_id,
            state.latest_stage,
            state.observed_fraction,
            state.latest_details,
            expected_attempt=expected_attempt,
            worker_id=self.worker_id,
            actor_id=self.worker_id,
        )
        state.persisted_fraction = state.observed_fraction
        state.persisted_stage = state.latest_stage
        state.persisted_details = dict(state.latest_details)
        state.last_persisted_at = time.monotonic()
        state.persisted_count += 1
        return True

    def _flush_progress(self, job_id: str, expected_attempt: int) -> None:
        state = self._progress_states.get((job_id, expected_attempt))
        if state is not None:
            self._persist_progress(job_id, expected_attempt, state, force=True)

    def _clear_progress_state(self, job_id: str, expected_attempt: int) -> None:
        self._progress_states.pop((job_id, expected_attempt), None)

    def _record_progress(self, job_id: str, expected_attempt: int, record: Dict[str, Any]) -> None:
        payload = record.get("progress") if isinstance(record.get("progress"), dict) else record
        stage = str(payload.get("stage") or "RUNNING")[:100]
        try:
            fraction = min(1.0, max(0.0, float(payload.get("fraction", 0.0))))
        except (TypeError, ValueError):
            return
        state = self._progress_state(job_id, expected_attempt)
        fraction = max(state.observed_fraction, fraction)
        details = {
            key: value for key, value in payload.items()
            if key not in {"type", "stage", "fraction"}
        }
        state.observed_fraction = fraction
        state.latest_stage = stage
        state.latest_details = details
        first_stage = stage not in state.seen_stages and len(state.seen_stages) < MAX_EARLY_PROGRESS_STAGES
        if first_stage:
            state.seen_stages.add(stage)
        now = time.monotonic()
        if (
            state.persisted_count == 0
            or first_stage
            or fraction - state.persisted_fraction >= self.progress_fraction_step
            or now - state.last_persisted_at >= state.heartbeat_seconds
        ):
            self._persist_progress(job_id, expected_attempt, state)

    def _parse_message(
        self,
        job_id: str,
        expected_attempt: int,
        channel: str,
        line: str,
        stderr_lines: list,
    ) -> Optional[Dict[str, Any]]:
        if not line:
            return None
        if channel == "stderr":
            if len(stderr_lines) < 100:
                stderr_lines.append(line[:2000])
            return None
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            if len(stderr_lines) < 100:
                stderr_lines.append("non-JSON runner output")
            return None
        if not isinstance(record, dict):
            return None
        if record.get("job_id") not in (None, job_id):
            return None
        if record.get("type") == "progress":
            try:
                self._record_progress(job_id, expected_attempt, record)
            except StateTransitionError:
                pass
        return record

    def _drain_messages(
        self,
        job_id: str,
        expected_attempt: int,
        messages: queue.Queue,
        stderr_lines: list,
        receive,
    ) -> None:
        while True:
            try:
                channel, line = messages.get_nowait()
            except queue.Empty:
                return
            record = self._parse_message(job_id, expected_attempt, channel, line, stderr_lines)
            if record is not None:
                receive(record)

    def _consume_remaining(
        self,
        job_id: str,
        expected_attempt: int,
        messages: queue.Queue,
        stderr_lines: list,
        current,
    ):
        latest = current

        def receive(record):
            nonlocal latest
            if record.get("type") in {"result", "error"}:
                latest = record

        self._drain_messages(job_id, expected_attempt, messages, stderr_lines, receive)
        return latest

    def _read_result(self, output_path: Path, final_record: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if not output_path.is_file():
            raise JobManagerError("runner did not create a result artifact")
        size = output_path.stat().st_size
        if size < 2 or size > MAX_RESULT_BYTES:
            raise JobManagerError("runner result artifact is outside the supported size bound")
        checksum = _sha256_file(output_path)
        reported_checksum = None if not final_record else (
            final_record.get("result_sha256") or final_record.get("sha256")
        )
        if reported_checksum not in (None, checksum):
            raise JobManagerError("runner result checksum does not match its completion record")
        try:
            result = json.loads(output_path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise JobManagerError("runner result artifact is invalid JSON") from exc
        if not isinstance(result, dict):
            raise JobManagerError("runner result must be an object")
        result["artifact_sha256"] = checksum
        return result

    @staticmethod
    def _candidate_for_store(candidate: Dict[str, Any]) -> Dict[str, Any]:
        value = dict(candidate)
        value.setdefault("object_a_id", value.get("primary_object_id"))
        value.setdefault("object_b_id", value.get("secondary_object_id"))
        value.setdefault("interval_start_utc", value.get("interval_start"))
        value.setdefault("interval_end_utc", value.get("interval_end"))
        return value

    @staticmethod
    def _event_for_store(
        job_id: str,
        expected_attempt: int,
        event: Dict[str, Any],
    ) -> Dict[str, Any]:
        value = dict(event)
        value.setdefault("object_a_id", value.get("primary_object_id"))
        value.setdefault("object_b_id", value.get("secondary_object_id"))
        value.setdefault("tca_utc", value.get("tca"))
        engine_event_id = value.get("engine_event_id") or value.get("event_revision_id") or value.get("event_id")
        if isinstance(engine_event_id, str) and engine_event_id.strip():
            engine_event_id = engine_event_id.strip()
            value["engine_event_id"] = engine_event_id
            material = json.dumps(
                {
                    "job_id": job_id,
                    "attempt_number": expected_attempt,
                    "engine_event_id": engine_event_id,
                },
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
            ).encode("utf-8")
            value["event_revision_id"] = "event_" + hashlib.sha256(material).hexdigest()[:32]
        else:
            value.setdefault("event_revision_id", value.get("event_id"))
        return value

    @staticmethod
    def _error_for_store(error: Dict[str, Any]) -> Dict[str, Any]:
        value = dict(error)
        value.setdefault("stage", value.get("context", {}).get("stage") if isinstance(value.get("context"), dict) else "screening")
        value.setdefault("code", "SCREENING_ERROR")
        return value

    def _import_result(self, job_id: str, expected_attempt: int, result: Dict[str, Any]) -> None:
        job = self.store.get_job(job_id)
        configuration = (job.get("request") or {}).get("configuration") or {}
        persistence_limit = int(configuration.get("max_persisted_candidates", 100_000))
        source_candidates = result.get("candidates") if isinstance(result.get("candidates"), list) else []
        candidates = [self._candidate_for_store(item) for item in source_candidates[:persistence_limit]]
        events = [
            self._event_for_store(job_id, expected_attempt, item)
            for item in result.get("events", [])
            if isinstance(item, dict)
        ]
        errors = [self._error_for_store(item) for item in result.get("errors", []) if isinstance(item, dict)]
        summary = {key: value for key, value in result.items() if key not in {"candidates", "candidate_partitions", "events", "errors"}}
        summary["persisted_candidate_count"] = len(candidates)
        summary["detected_candidate_count"] = len(source_candidates)
        if len(source_candidates) > persistence_limit:
            flags = set(summary.get("quality_flags") or [])
            flags.add("PERSISTED_CANDIDATE_LIMIT_APPLIED")
            summary["quality_flags"] = sorted(flags)
        self._flush_progress(job_id, expected_attempt)
        try:
            self.store.import_result(
                job_id,
                candidates=candidates,
                events=events,
                errors=errors,
                summary=summary,
                expected_attempt=expected_attempt,
                worker_id=self.worker_id,
                actor_id=self.worker_id,
            )
        finally:
            self._clear_progress_state(job_id, expected_attempt)

    def _finish_or_retry(
        self,
        job_id: str,
        expected_attempt: int,
        state: str,
        error: Dict[str, object],
    ) -> None:
        self._flush_progress(job_id, expected_attempt)
        current = self.store.get_job(job_id)
        if current["state"] == "CANCEL_REQUESTED":
            try:
                self.store.finish_attempt(
                    job_id,
                    "CANCELLED",
                    error=error,
                    expected_attempt=expected_attempt,
                    worker_id=self.worker_id,
                    actor_id=self.worker_id,
                )
            finally:
                self._clear_progress_state(job_id, expected_attempt)
            return
        try:
            terminal = self.store.finish_attempt(
                job_id,
                state,
                error=error,
                expected_attempt=expected_attempt,
                worker_id=self.worker_id,
                actor_id=self.worker_id,
            )
        finally:
            self._clear_progress_state(job_id, expected_attempt)
        if terminal["attempt_count"] < terminal["max_attempts"] and not self._stop.is_set():
            self.store.retry_job(job_id, actor_id=self.worker_id)
            self.notify()

    def _handle_failure(
        self,
        job_id: str,
        expected_attempt: int,
        error: Dict[str, object],
    ) -> None:
        try:
            state = self.store.get_job(job_id)["state"]
            if state in {"RUNNING", "CANCEL_REQUESTED"}:
                self._finish_or_retry(job_id, expected_attempt, "FAILED", error)
        except (JobNotFoundError, StateTransitionError):
            return

    def _terminate(self, process: subprocess.Popen[str]) -> None:
        if process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=self.terminate_grace_seconds)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=self.terminate_grace_seconds)
