"""Isolate refresh CPU/memory from HTTP threads; optionally persist Cloud Run state."""
from __future__ import annotations

import contextlib
import io
import json
import multiprocessing as mp
import os
import tarfile
import threading
import time
from pathlib import Path

from tools.satellite_data_plane import DataPlaneCancelled, SatelliteDataPlane, validate_data_root


class CloudRefreshState:
    """A generation-checked global lease and private immutable snapshot in GCS.

    Local candidates retain POSIX locking; GCS is only durable object storage.
    No FUSE filesystem or public bucket is involved.
    """
    def __init__(self, bucket_name):
        from google.cloud import storage
        self.bucket = storage.Client().bucket(bucket_name)
        self.lease = self.bucket.blob("refresh-lease.json")
        self.generation = None
        self.stop = threading.Event()
        self.lost = threading.Event()

    def acquire(self):
        from google.api_core.exceptions import NotFound, PreconditionFailed
        try:
            self.lease.reload(timeout=30)
            generation = int(self.lease.generation)
            value = json.loads(self.lease.download_as_bytes(if_generation_match=generation, timeout=30))
            if float(value.get("expires_at", 0)) > time.time():
                return False
        except NotFound:
            generation = 0
        try:
            self.lease.upload_from_string(json.dumps({"expires_at": time.time() + 300}),
                                          if_generation_match=generation, timeout=30)
        except PreconditionFailed:
            return False
        self.generation = int(self.lease.generation)
        self.thread = threading.Thread(target=self._renew, daemon=True)
        self.thread.start()
        return True

    def _renew(self):
        while not self.stop.wait(60):
            try:
                self.lease.upload_from_string(json.dumps({"expires_at": time.time() + 300}),
                                              if_generation_match=self.generation, timeout=30)
                self.generation = int(self.lease.generation)
            except Exception:
                self.lost.set()
                return

    def close(self):
        self.stop.set()
        self.thread.join(timeout=35)
        if not self.lost.is_set():
            with contextlib.suppress(Exception):
                self.lease.delete(if_generation_match=self.generation, timeout=30)

    def ledger_saved(self, path):
        if self.lost.is_set():
            raise DataPlaneCancelled("Cloud refresh lease was lost.")
        self.bucket.blob("provider-queries.json").upload_from_filename(str(path), timeout=30)

    def restore(self, plane):
        from google.api_core.exceptions import NotFound
        state_root = plane.state_root
        state_root.mkdir(parents=True, exist_ok=True)
        try:
            body = self.bucket.blob("current-data.tar").download_as_bytes(timeout=120)
        except NotFound:
            body = None
        if body:
            restore_snapshot(body, plane)
        try:
            body = self.bucket.blob("provider-queries.json").download_as_bytes(timeout=30)
        except NotFound:
            return
        value = json.loads(body)
        if not isinstance(value, dict) or not isinstance(value.get("urls"), dict):
            raise ValueError("Cloud provider ledger is invalid.")
        path = state_root / "provider-queries.json"
        temporary = path.with_suffix(".restore")
        temporary.write_bytes(body)
        temporary.replace(path)

    def publish(self, plane):
        if self.lost.is_set():
            raise DataPlaneCancelled("Cloud refresh lease was lost before persistence.")
        pointer = plane.pointer()
        if not pointer:
            return
        candidate = plane.state_root / "candidates" / pointer["candidate_id"]
        validate_data_root(candidate)
        archive_path = plane.state_root / "snapshot.tar"
        try:
            with tarfile.open(archive_path, "w") as archive:
                for path in sorted(candidate.rglob("*")):
                    if path.is_file() and not path.is_symlink() and ".bak-" not in path.name:
                        archive.add(path, arcname=path.relative_to(plane.state_root).as_posix(), recursive=False)
                archive.add(plane.state_root / "current.json", arcname="current.json")
            self.bucket.blob("current-data.tar").upload_from_filename(str(archive_path), timeout=180)
        finally:
            archive_path.unlink(missing_ok=True)


def restore_snapshot(body, plane):
    """Restore bounded regular files, verify the closure, replace the pointer last."""
    root = plane.state_root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(body), mode="r") as archive:
        members = archive.getmembers()
        if len(members) > 2000 or sum(item.size for item in members) > 1024 ** 3:
            raise ValueError("Cloud data snapshot exceeds its bounds.")
        pointer = None
        for member in members:
            target = (root / member.name).resolve()
            if not member.isfile() or root not in target.parents or member.name.startswith("/"):
                raise ValueError("Cloud snapshot contains an unsafe member.")
            if member.name != "current.json" and not member.name.startswith("candidates/"):
                raise ValueError("Unexpected Cloud snapshot path.")
            contents = archive.extractfile(member).read()
            if member.name == "current.json":
                pointer = contents
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                # Candidate IDs are immutable; refuse to overwrite different bytes.
                if target.exists() and target.read_bytes() != contents:
                    raise ValueError("Cloud candidate identity conflicts with local bytes.")
                target.write_bytes(contents)
        if pointer is None:
            raise ValueError("Cloud snapshot has no current-data pointer.")
        value = json.loads(pointer)
        candidate_id = value.get("candidate_id", "")
        from tools.satellite_data_plane import CANDIDATE_ID_PATTERN
        if not CANDIDATE_ID_PATTERN.fullmatch(candidate_id):
            raise ValueError("Invalid Cloud candidate ID.")
        verification = validate_data_root(root / "candidates" / candidate_id)
        if verification["candidate_revision"] != value.get("candidate_revision"):
            raise ValueError("Cloud snapshot pointer does not match its candidate.")
        temporary = root / "current.restore"
        temporary.write_bytes(pointer)
        temporary.replace(root / "current.json")


def _refresh_child(repository_root, state_root, kwargs, events, cancel):
    cloud = None
    try:
        events.send(("progress", {"phase": "checking", "message": "Checking freshness in the background.", "worker_pid": os.getpid()}))
        if hasattr(os, "nice"):
            os.nice(10)
            import resource
            resource.setrlimit(resource.RLIMIT_AS, (1536 * 1024 ** 2, 1536 * 1024 ** 2))
            resource.setrlimit(resource.RLIMIT_CPU, (600, 600))
        if hasattr(os, "sched_getaffinity"):
            allowed = os.sched_getaffinity(0)
            if len(allowed) > 1:
                os.sched_setaffinity(0, {max(allowed)})
        plane = SatelliteDataPlane(repository_root=repository_root, state_root=state_root)
        bucket = os.environ.get("OPENBEXI_REFRESH_BUCKET")
        if bucket:
            cloud = CloudRefreshState(bucket)
            if not cloud.acquire():
                cloud.restore(plane)
                events.send(("result", {"skipped": True, "degraded": False, "next_check_in_seconds": 60,
                                       "promoted": bool(plane.pointer()),
                                       "message": "Another Cloud instance owns the refresh lease; serving the persisted snapshot."}))
                return
            cloud.restore(plane)
            kwargs["provider_state_saved"] = cloud.ledger_saved
        cancelled = lambda: cancel.is_set() or bool(cloud and cloud.lost.is_set())
        repair = plane.repair_tracked_lineage(cancel_requested=cancelled,
            on_progress=lambda item: events.send(("progress", item)))
        result = plane.stage_update(promote=True, cancel_requested=cancelled,
                                    on_progress=lambda item: events.send(("progress", item)), **kwargs)
        if repair and repair.get("promoted"):
            result["local_repair_promoted"] = True
        if cloud:
            cloud.publish(plane)
        events.send(("result", result))
    except Exception as exc:
        events.send(("error", str(exc)))
    finally:
        if cloud and cloud.generation is not None:
            cloud.close()


class IsolatedDataPlane:
    def __init__(self, plane):
        self.plane = plane

    def __getattr__(self, name):
        return getattr(self.plane, name)

    def repair_tracked_lineage(self, **kwargs):
        # The isolated normal cycle repairs derived data and validates lineage.
        return None

    def stage_update(self, *, cancel_requested=None, on_progress=None, publication_guard=None, **kwargs):
        kwargs.pop("promote", None)
        context = mp.get_context("spawn")
        events, sender = context.Pipe(duplex=False)
        cancel = context.Event()
        child = context.Process(target=_refresh_child,
                                args=(str(self.plane.repository_root), str(self.plane.state_root), kwargs, sender, cancel))
        child.start()
        sender.close()
        deadline = time.monotonic() + 1800
        try:
            while True:
                if cancel_requested and cancel_requested():
                    cancel.set()
                    raise DataPlaneCancelled("Background refresh cancelled before publication.")
                if time.monotonic() > deadline:
                    cancel.set()
                    raise RuntimeError("Background refresh exceeded its 30-minute resource limit.")
                if not events.poll(0.25):
                    if not child.is_alive():
                        raise RuntimeError(f"Background refresh exited without a result ({child.exitcode}).")
                    continue
                kind, payload = events.recv()
                if kind == "progress":
                    if on_progress:
                        on_progress(payload)
                elif kind == "error":
                    raise RuntimeError(payload)
                else:
                    return payload
        finally:
            cancel.set()
            child.join(timeout=5)
            if child.is_alive():
                child.terminate()
                child.join(timeout=5)
            events.close()
