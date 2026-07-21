"""HTTP routing adapter for the versioned v2.1 application service."""

from __future__ import annotations

import json
import time
from http import HTTPStatus
from typing import Any, Dict, Optional
from urllib.parse import parse_qs, unquote, urlparse

from .api import API_VERSION, TERMINAL_JOB_STATES, V21ApiService
from .security import ApiProblem, read_json_body


def _one(query: Dict[str, list[str]], name: str, default: Optional[str] = None) -> Optional[str]:
    values = query.get(name)
    if not values:
        return default
    if len(values) != 1:
        raise ApiProblem(400, "QUERY_INVALID", "Invalid query", "%s may be supplied only once." % name)
    return values[0]


def _integer(query: Dict[str, list[str]], name: str, default: int, minimum: int, maximum: int) -> int:
    raw = _one(query, name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ApiProblem(400, "QUERY_INVALID", "Invalid query", "%s must be an integer." % name) from exc
    if value < minimum or value > maximum:
        raise ApiProblem(400, "QUERY_INVALID", "Invalid query", "%s must be between %d and %d." % (name, minimum, maximum))
    return value


def _number(query: Dict[str, list[str]], name: str) -> Optional[float]:
    raw = _one(query, name)
    if raw is None:
        return None
    try:
        value = float(raw)
    except ValueError as exc:
        raise ApiProblem(400, "QUERY_INVALID", "Invalid query", "%s must be numeric." % name) from exc
    if value < 0 or value != value or value in (float("inf"), float("-inf")):
        raise ApiProblem(400, "QUERY_INVALID", "Invalid query", "%s must be a finite non-negative number." % name)
    return value


class V21HttpRouter:
    def __init__(self, service: V21ApiService, *, stream_seconds: float = 25.0) -> None:
        self.service = service
        self.stream_seconds = max(0.1, min(60.0, float(stream_seconds)))

    @staticmethod
    def _remote_key(handler) -> str:
        return str(handler.client_address[0] if handler.client_address else "local")

    def _principal(self, handler, role: str):
        return self.service.authenticate(
            handler.headers.get("Authorization"),
            role,
            remote_key=self._remote_key(handler),
        )

    @staticmethod
    def _send(handler, payload: object, *, status: int = 200, head_only: bool = False, headers: Optional[Dict[str, str]] = None) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
        handler.send_response(int(status))
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.send_header("Content-Length", str(len(body)))
        handler.send_header("X-OpenBEXI-API-Version", API_VERSION)
        for name, value in (headers or {}).items():
            handler.send_header(name, value)
        handler.end_headers()
        if not head_only:
            handler.wfile.write(body)

    @staticmethod
    def _problem(handler, problem: ApiProblem, *, head_only: bool = False) -> None:
        body = json.dumps(problem.to_dict(), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        handler.send_response(problem.status)
        handler.send_header("Content-Type", "application/problem+json; charset=utf-8")
        handler.send_header("Content-Length", str(len(body)))
        handler.send_header("X-OpenBEXI-API-Version", API_VERSION)
        if problem.status == 401:
            handler.send_header("WWW-Authenticate", 'Bearer realm="openbexi-api-v1"')
        retry_after = problem.extra.get("retry_after_seconds")
        if retry_after is not None:
            handler.send_header("Retry-After", str(retry_after))
        handler.end_headers()
        if not head_only:
            handler.wfile.write(body)

    @staticmethod
    def _query(parsed, allowed: set[str]) -> Dict[str, list[str]]:
        try:
            query = parse_qs(parsed.query, keep_blank_values=True, max_num_fields=50)
        except ValueError as exc:
            raise ApiProblem(400, "QUERY_INVALID", "Invalid query", "The query contains too many fields.") from exc
        if "access_token" in query or "token" in query:
            raise ApiProblem(400, "TOKEN_IN_URL_REJECTED", "Credential rejected", "Bearer credentials must not be placed in URLs.")
        unknown = set(query) - allowed
        if unknown:
            raise ApiProblem(400, "QUERY_INVALID", "Invalid query", "Unsupported query fields: %s." % ", ".join(sorted(unknown)))
        return query

    def handle(self, handler, *, method: str, head_only: bool = False) -> bool:
        parsed = urlparse(handler.path)
        path = parsed.path.rstrip("/") or "/"
        if not path.startswith("/api/v1"):
            return False
        try:
            return self._route(handler, method=method.upper(), path=path, parsed=parsed, head_only=head_only)
        except ApiProblem as problem:
            if not problem.instance:
                problem.instance = parsed.path
            self._problem(handler, problem, head_only=head_only)
            return True
        except Exception as exc:
            handler.log_error("API v1 failure: %s", type(exc).__name__)
            self._problem(
                handler,
                ApiProblem(500, "INTERNAL_ERROR", "Internal server error", "The request could not be completed.", instance=parsed.path),
                head_only=head_only,
            )
            return True

    def _route(self, handler, *, method: str, path: str, parsed, head_only: bool) -> bool:
        if path == "/api/v1/health/live" and method in {"GET", "HEAD"}:
            status, payload = self.service.health(ready=False)
            self._send(handler, payload, status=status, head_only=head_only)
            return True
        if path == "/api/v1/health/ready" and method in {"GET", "HEAD"}:
            status, payload = self.service.health(ready=True)
            self._send(handler, payload, status=status, head_only=head_only)
            return True
        if path == "/api/v1/capabilities" and method in {"GET", "HEAD"}:
            self._send(handler, self.service.capabilities(), head_only=head_only)
            return True

        if path == "/api/v1/catalog-revisions" and method in {"GET", "HEAD"}:
            self._principal(handler, "viewer")
            query = self._query(parsed, {"limit", "cursor", "source_id", "source_status"})
            page = self.service.list_catalogs(
                limit=_integer(query, "limit", 50, 1, 200),
                cursor=_one(query, "cursor"),
                source_id=_one(query, "source_id"),
                source_status=_one(query, "source_status"),
            )
            self._send(handler, page, head_only=head_only)
            return True
        if path.startswith("/api/v1/catalog-revisions/") and method in {"GET", "HEAD"}:
            self._principal(handler, "viewer")
            revision_id = unquote(path.split("/", 4)[-1])
            self._send(handler, self.service.get_catalog(revision_id), head_only=head_only)
            return True

        if path == "/api/v1/screening-jobs":
            if method == "POST":
                principal = self._principal(handler, "analyst")
                created, job = self.service.submit_job(
                    read_json_body(handler),
                    handler.headers.get("Idempotency-Key"),
                    principal,
                )
                self._send(
                    handler,
                    job,
                    status=HTTPStatus.ACCEPTED,
                    headers={
                        "Location": "/api/v1/screening-jobs/%s" % job["job_id"],
                        "Idempotent-Replayed": "false" if created else "true",
                    },
                )
                return True
            if method in {"GET", "HEAD"}:
                principal = self._principal(handler, "viewer")
                query = self._query(parsed, {"limit", "cursor", "state", "catalog_revision_id"})
                states = [value.upper() for value in query.get("state", []) if value]
                page = self.service.list_jobs(
                    principal,
                    limit=_integer(query, "limit", 50, 1, 200),
                    cursor=_one(query, "cursor"),
                    states=states,
                    catalog_revision_id=_one(query, "catalog_revision_id"),
                )
                self._send(handler, page, head_only=head_only)
                return True

        if path == "/api/v1/conjunction-events" and method in {"GET", "HEAD"}:
            self._principal(handler, "viewer")
            query = self._query(
                parsed,
                {"limit", "cursor", "job_id", "object_id", "tca_from", "tca_to", "max_miss_distance_km", "order"},
            )
            page = self.service.list_events(
                limit=_integer(query, "limit", 50, 1, 200),
                cursor=_one(query, "cursor"),
                job_id=_one(query, "job_id"),
                object_id=_one(query, "object_id"),
                tca_from=_one(query, "tca_from"),
                tca_to=_one(query, "tca_to"),
                max_miss_distance_km=_number(query, "max_miss_distance_km"),
                order=_one(query, "order", "tca_asc") or "tca_asc",
            )
            self._send(handler, page, head_only=head_only)
            return True
        if path.startswith("/api/v1/conjunction-events/") and method in {"GET", "HEAD"}:
            self._principal(handler, "viewer")
            event_id = unquote(path.split("/", 4)[-1])
            self._send(handler, self.service.get_event(event_id), head_only=head_only)
            return True

        prefix = "/api/v1/screening-jobs/"
        if path.startswith(prefix):
            remainder = path[len(prefix):]
            parts = remainder.split("/")
            job_id = unquote(parts[0])
            action = parts[1] if len(parts) == 2 else None
            if len(parts) > 2 or not job_id:
                raise ApiProblem(404, "ROUTE_NOT_FOUND", "Route not found", "The API route does not exist.")
            if action == "stream" and method in {"GET", "HEAD"}:
                principal = self._principal(handler, "viewer")
                query = self._query(parsed, {"once"})
                if head_only:
                    self._send(handler, {"job_id": job_id, "stream": "available"}, head_only=True)
                else:
                    self._stream(handler, job_id, principal, once=_one(query, "once", "false") == "true")
                return True
            if action == "retry" and method == "POST":
                principal = self._principal(handler, "analyst")
                self._send(handler, self.service.retry_job(job_id, principal), status=HTTPStatus.ACCEPTED)
                return True
            if action == "replay" and method == "POST":
                principal = self._principal(handler, "analyst")
                created, job = self.service.replay_job(job_id, handler.headers.get("Idempotency-Key"), principal)
                self._send(
                    handler,
                    job,
                    status=HTTPStatus.ACCEPTED,
                    headers={"Location": "/api/v1/screening-jobs/%s" % job["job_id"], "Idempotent-Replayed": "false" if created else "true"},
                )
                return True
            if action is None and method in {"GET", "HEAD"}:
                principal = self._principal(handler, "viewer")
                self._send(handler, self.service.get_job(job_id, principal), head_only=head_only)
                return True
            if action is None and method == "DELETE":
                principal = self._principal(handler, "analyst")
                self._send(handler, self.service.cancel_job(job_id, principal), status=HTTPStatus.ACCEPTED)
                return True

        if method not in {"GET", "HEAD", "POST", "DELETE"}:
            raise ApiProblem(405, "METHOD_NOT_ALLOWED", "Method not allowed", "The route does not support this method.")
        raise ApiProblem(404, "ROUTE_NOT_FOUND", "Route not found", "The API route does not exist.")

    def _stream(self, handler, job_id: str, principal, *, once: bool) -> None:
        raw_last = handler.headers.get("Last-Event-ID", "0")
        try:
            after_id = int(raw_last)
        except ValueError as exc:
            raise ApiProblem(400, "LAST_EVENT_ID_INVALID", "Invalid Last-Event-ID", "Last-Event-ID must be a non-negative integer.") from exc
        if after_id < 0:
            raise ApiProblem(400, "LAST_EVENT_ID_INVALID", "Invalid Last-Event-ID", "Last-Event-ID must be a non-negative integer.")
        self.service.get_job(job_id, principal)
        handler.send_response(HTTPStatus.OK)
        handler.send_header("Content-Type", "text/event-stream; charset=utf-8")
        handler.send_header("X-Accel-Buffering", "no")
        handler.send_header("X-OpenBEXI-API-Version", API_VERSION)
        handler.end_headers()
        deadline = time.monotonic() + (0.1 if once else self.stream_seconds)
        try:
            while time.monotonic() < deadline:
                records = self.service.outbox(job_id, after_id, principal)
                for record in records:
                    after_id = int(record["outbox_id"])
                    data = json.dumps(record["payload"], ensure_ascii=False, separators=(",", ":"))
                    frame = "id: %d\nevent: %s\ndata: %s\n\n" % (after_id, record["event_type"], data)
                    handler.wfile.write(frame.encode("utf-8"))
                if records:
                    handler.wfile.flush()
                state = self.service.get_job(job_id, principal)["state"]
                if once or (state in TERMINAL_JOB_STATES and not records):
                    return
                if not records:
                    handler.wfile.write(b": keep-alive\n\n")
                    handler.wfile.flush()
                time.sleep(0.25)
        except (BrokenPipeError, ConnectionResetError):
            return
