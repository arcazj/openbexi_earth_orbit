import io
import json
import unittest

from services.v21.security import (
    ApiProblem,
    BearerTokenAuthenticator,
    CursorCodec,
    SlidingWindowRateLimiter,
    read_json_body,
    validate_idempotency_key,
)


class V21SecurityTests(unittest.TestCase):
    def test_duplicate_tokens_across_roles_are_rejected(self):
        token = "same-token-value-000000000000"
        with self.assertRaises(ValueError):
            BearerTokenAuthenticator((("viewer", token), ("administrator", token)))

    def test_bearer_roles_and_constant_public_errors(self):
        auth = BearerTokenAuthenticator(
            {
                "viewer": "viewer-token-which-is-long-enough",
                "analyst": "analyst-token-which-is-long-enough",
                "administrator": "administrator-token-long-enough",
            }
        )
        viewer = auth.authenticate("Bearer viewer-token-which-is-long-enough")
        self.assertEqual(viewer.role, "viewer")
        analyst = auth.authenticate("bearer analyst-token-which-is-long-enough", required_role="analyst")
        self.assertTrue(analyst.permits("viewer"))
        with self.assertRaises(ApiProblem) as denied:
            auth.authenticate("Bearer viewer-token-which-is-long-enough", required_role="analyst")
        self.assertEqual(denied.exception.status, 403)
        with self.assertRaises(ApiProblem) as invalid:
            auth.authenticate("Bearer wrong-token-which-is-long-enough")
        self.assertEqual(invalid.exception.to_dict()["code"], "AUTH_INVALID")
        self.assertNotIn("wrong-token", json.dumps(invalid.exception.to_dict()))

    def test_unconfigured_auth_fails_closed(self):
        with self.assertRaises(ApiProblem) as unavailable:
            BearerTokenAuthenticator().authenticate(None)
        self.assertEqual(unavailable.exception.status, 503)

    def test_cursor_is_signed_and_bound_to_filters(self):
        codec = CursorCodec("cursor-secret-that-is-at-least-24-bytes")
        cursor = codec.encode({"tca": "2026-07-20T00:00:00Z", "id": "event:1"}, filter_hash="sha256:a")
        self.assertEqual(codec.decode(cursor, filter_hash="sha256:a")["id"], "event:1")
        with self.assertRaises(ApiProblem) as mismatch:
            codec.decode(cursor, filter_hash="sha256:b")
        self.assertEqual(mismatch.exception.to_dict()["code"], "CURSOR_FILTER_MISMATCH")
        with self.assertRaises(ApiProblem):
            codec.decode(cursor[:-2] + "aa", filter_hash="sha256:a")
        alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
        last_index = alphabet.index(cursor[-1])
        alias_index = (last_index & 0b110000) | ((last_index + 1) & 0b001111)
        noncanonical_alias = cursor[:-1] + alphabet[alias_index]
        self.assertEqual(codec._decode(cursor.rsplit(".", 1)[1]), codec._decode(noncanonical_alias.rsplit(".", 1)[1]))
        with self.assertRaises(ApiProblem) as alias:
            codec.decode(noncanonical_alias, filter_hash="sha256:a")
        self.assertEqual(alias.exception.to_dict()["code"], "CURSOR_INVALID")

    def test_rate_limit_has_deterministic_retry(self):
        clock = [10.0]
        limiter = SlidingWindowRateLimiter(limit=2, window_seconds=5, clock=lambda: clock[0])
        self.assertEqual(limiter.check("principal"), (True, 0.0))
        self.assertEqual(limiter.check("principal"), (True, 0.0))
        allowed, retry = limiter.check("principal")
        self.assertFalse(allowed)
        self.assertEqual(retry, 5.0)
        clock[0] = 15.1
        self.assertTrue(limiter.check("principal")[0])

    def test_idempotency_key_validation(self):
        self.assertEqual(validate_idempotency_key("job-request:1234"), "job-request:1234")
        for value in (None, "short", "bad key with spaces", "x" * 129):
            with self.subTest(value=value), self.assertRaises(ApiProblem):
                validate_idempotency_key(value)

    def test_json_body_is_bounded_and_typed(self):
        class Handler:
            def __init__(self, body, content_type="application/json"):
                self.headers = {"Content-Length": str(len(body)), "Content-Type": content_type}
                self.rfile = io.BytesIO(body)

        self.assertEqual(read_json_body(Handler(b'{"ok":true}')), {"ok": True})
        with self.assertRaises(ApiProblem) as oversized:
            read_json_body(Handler(b"{}"), max_bytes=1)
        self.assertEqual(oversized.exception.status, 413)
        with self.assertRaises(ApiProblem) as media:
            read_json_body(Handler(b"{}", "text/plain"))
        self.assertEqual(media.exception.status, 415)
        with self.assertRaises(ApiProblem) as invalid:
            read_json_body(Handler(b"{"))
        self.assertEqual(invalid.exception.status, 400)


if __name__ == "__main__":
    unittest.main()
