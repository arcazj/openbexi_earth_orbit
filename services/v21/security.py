"""Authentication, admission-control, cursor, and problem helpers for API v1."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Iterable, Mapping


IDEMPOTENCY_KEY_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")
ROLE_ORDER = {"viewer": 1, "analyst": 2, "administrator": 3}


class ApiProblem(Exception):
    """An RFC 9457-compatible API error without internal implementation details."""

    def __init__(
        self,
        status: int,
        code: str,
        title: str,
        detail: str,
        *,
        instance: str | None = None,
        extra: Mapping[str, object] | None = None,
    ) -> None:
        super().__init__(detail)
        self.status = int(status)
        self.code = str(code)
        self.title = str(title)
        self.detail = str(detail)
        self.instance = instance
        self.extra = dict(extra or {})

    def to_dict(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "type": f"https://openbexi.example/problems/{self.code.lower().replace('_', '-')}",
            "title": self.title,
            "status": self.status,
            "detail": self.detail,
            "code": self.code,
        }
        if self.instance:
            payload["instance"] = self.instance
        payload.update(self.extra)
        return payload


@dataclass(frozen=True)
class Principal:
    principal_id: str
    role: str
    token_fingerprint: str

    def permits(self, required_role: str) -> bool:
        return ROLE_ORDER.get(self.role, 0) >= ROLE_ORDER.get(required_role, 99)


class BearerTokenAuthenticator:
    """Authenticate a small configured token registry using constant-time digest checks."""

    def __init__(self, tokens: Mapping[str, str] | Iterable[tuple[str, str]] = ()) -> None:
        entries = tokens.items() if isinstance(tokens, Mapping) else tokens
        prepared: list[tuple[bytes, Principal]] = []
        seen_digests: list[bytes] = []
        for role, raw_token in entries:
            normalized_role = str(role).strip().lower()
            token = str(raw_token or "")
            if normalized_role not in ROLE_ORDER:
                raise ValueError(f"Unsupported API role: {role}")
            if len(token) < 24:
                raise ValueError(f"{normalized_role} token must contain at least 24 characters")
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            if any(hmac.compare_digest(digest, existing) for existing in seen_digests):
                raise ValueError("API bearer credentials must be unique across roles")
            seen_digests.append(digest)
            fingerprint = hashlib.sha256(digest).hexdigest()[:16]
            prepared.append(
                (
                    digest,
                    Principal(
                        principal_id=f"local:{normalized_role}:{fingerprint}",
                        role=normalized_role,
                        token_fingerprint=fingerprint,
                    ),
                )
            )
        self._tokens = tuple(prepared)

    @property
    def configured(self) -> bool:
        return bool(self._tokens)

    def authenticate(self, authorization: str | None, *, required_role: str = "viewer") -> Principal:
        if not self.configured:
            raise ApiProblem(
                503,
                "AUTH_NOT_CONFIGURED",
                "Authenticated API unavailable",
                "The server has no API bearer credentials configured.",
            )
        scheme, separator, token = str(authorization or "").partition(" ")
        if not separator or scheme.lower() != "bearer" or not token.strip():
            raise ApiProblem(401, "AUTH_REQUIRED", "Authentication required", "Supply a bearer token.")
        supplied = hashlib.sha256(token.strip().encode("utf-8")).digest()
        matched: Principal | None = None
        for expected, principal in self._tokens:
            if hmac.compare_digest(supplied, expected):
                matched = principal
        if matched is None:
            raise ApiProblem(401, "AUTH_INVALID", "Authentication failed", "The bearer token is invalid.")
        if required_role not in ROLE_ORDER:
            raise ValueError(f"Unsupported required role: {required_role}")
        if not matched.permits(required_role):
            raise ApiProblem(403, "AUTH_FORBIDDEN", "Permission denied", "The credential lacks the required role.")
        return matched


class SlidingWindowRateLimiter:
    def __init__(self, *, limit: int, window_seconds: float, clock=time.monotonic) -> None:
        if limit < 1 or window_seconds <= 0:
            raise ValueError("Rate limit and window must be positive")
        self.limit = int(limit)
        self.window_seconds = float(window_seconds)
        self.clock = clock
        self._entries: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> tuple[bool, float]:
        now = float(self.clock())
        cutoff = now - self.window_seconds
        with self._lock:
            entries = self._entries[str(key)]
            while entries and entries[0] <= cutoff:
                entries.popleft()
            if len(entries) >= self.limit:
                return False, max(0.0, self.window_seconds - (now - entries[0]))
            entries.append(now)
            return True, 0.0

    def require(self, key: str) -> None:
        allowed, retry_after = self.check(key)
        if not allowed:
            raise ApiProblem(
                429,
                "RATE_LIMITED",
                "Request rate exceeded",
                "Retry after the current admission window.",
                extra={"retry_after_seconds": max(1, int(retry_after + 0.999))},
            )


class CursorCodec:
    """Create filter-bound, tamper-evident opaque keyset cursors."""

    def __init__(self, secret: str | bytes) -> None:
        raw = secret.encode("utf-8") if isinstance(secret, str) else bytes(secret)
        if len(raw) < 24:
            raise ValueError("Cursor signing secret must contain at least 24 bytes")
        self._secret = raw

    @staticmethod
    def _encode(raw: bytes) -> str:
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    @staticmethod
    def _decode(value: str) -> bytes:
        encoded = value.encode("ascii")
        return base64.urlsafe_b64decode(encoded + b"=" * (-len(encoded) % 4))

    def encode(self, position: Mapping[str, object], *, filter_hash: str) -> str:
        payload = json.dumps(
            {"v": 1, "position": dict(position), "filter_hash": str(filter_hash)},
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        signature = hmac.new(self._secret, payload, hashlib.sha256).digest()
        return f"{self._encode(payload)}.{self._encode(signature)}"

    def decode(self, cursor: str, *, filter_hash: str) -> dict[str, object]:
        try:
            payload_part, signature_part = str(cursor).split(".", 1)
            payload = self._decode(payload_part)
            signature = self._decode(signature_part)
            if (
                not payload_part
                or not signature_part
                or self._encode(payload) != payload_part
                or self._encode(signature) != signature_part
            ):
                raise ValueError("cursor encoding is not canonical")
            expected = hmac.new(self._secret, payload, hashlib.sha256).digest()
            if not hmac.compare_digest(signature, expected):
                raise ValueError("signature mismatch")
            decoded = json.loads(payload)
        except (ValueError, TypeError, json.JSONDecodeError, UnicodeError) as exc:
            raise ApiProblem(400, "CURSOR_INVALID", "Invalid cursor", "The pagination cursor is invalid.") from exc
        if decoded.get("v") != 1 or decoded.get("filter_hash") != str(filter_hash):
            raise ApiProblem(
                400,
                "CURSOR_FILTER_MISMATCH",
                "Cursor does not match query",
                "Restart pagination after changing filters or ordering.",
            )
        position = decoded.get("position")
        if not isinstance(position, dict):
            raise ApiProblem(400, "CURSOR_INVALID", "Invalid cursor", "The pagination cursor is invalid.")
        return position


def validate_idempotency_key(value: str | None) -> str:
    key = str(value or "").strip()
    if not IDEMPOTENCY_KEY_PATTERN.fullmatch(key):
        raise ApiProblem(
            400,
            "IDEMPOTENCY_KEY_INVALID",
            "Invalid Idempotency-Key",
            "Idempotency-Key must contain 8 to 128 safe ASCII characters.",
        )
    return key


def read_json_body(handler, *, max_bytes: int = 65_536) -> object:
    raw_length = handler.headers.get("Content-Length")
    try:
        length = int(raw_length)
    except (TypeError, ValueError) as exc:
        raise ApiProblem(411, "CONTENT_LENGTH_REQUIRED", "Content-Length required", "Send a bounded JSON body.") from exc
    if length < 1:
        raise ApiProblem(400, "BODY_REQUIRED", "Request body required", "Send a JSON request body.")
    if length > max_bytes:
        raise ApiProblem(413, "BODY_TOO_LARGE", "Request body too large", f"JSON body exceeds {max_bytes} bytes.")
    content_type = str(handler.headers.get("Content-Type", "")).split(";", 1)[0].strip().lower()
    if content_type != "application/json":
        raise ApiProblem(415, "CONTENT_TYPE_UNSUPPORTED", "Unsupported media type", "Use application/json.")
    body = handler.rfile.read(length)
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ApiProblem(400, "JSON_INVALID", "Invalid JSON", "The request body is not valid UTF-8 JSON.") from exc
