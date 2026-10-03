"""Persistent, serialized provider admission; no automatic retries on HTTP errors."""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from urllib.parse import urlparse


class ProviderHTTPError(RuntimeError):
    def __init__(self, message, *, status=None, retry_after=None):
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after


class ProviderPaused(RuntimeError):
    pass


def timestamp(value):
    return value.isoformat().replace("+00:00", "Z")


class ProviderQueries:
    """One shared request cache and durable admission ledger per update cycle.

    HTTP failures open the provider circuit until an operator explicitly resumes
    it. Network failures have exponential cooldowns. Neither force nor restart
    bypasses the admission ledger. The ledger survives rejected candidates.
    """

    def __init__(self, path, fetcher, *, now=None, dry_run=False, on_saved=None):
        self.path = Path(path)
        self.fetcher = fetcher
        self.now = now or dt.datetime.now(dt.timezone.utc)
        self.dry_run = dry_run
        self.on_saved = on_saved
        self.responses = {}
        self.failed = False
        self.state = self.read(self.path)

    @staticmethod
    def read(path):
        try:
            value = json.loads(Path(path).read_text(encoding="utf-8"))
            if isinstance(value, dict) and isinstance(value.get("urls", {}), dict):
                value.setdefault("urls", {})
                return value
        except FileNotFoundError:
            pass
        except (ValueError, OSError) as exc:
            raise ProviderPaused("Provider admission state is unreadable; investigate before querying.") from exc
        return {"urls": {}, "blocked": False}

    def save(self):
        if self.dry_run:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(self.state, indent=2), encoding="utf-8")
        temporary.replace(self.path)
        if self.on_saved:
            self.on_saved(self.path)

    def __call__(self, url, headers=None):
        if self.dry_run:
            return self._query(url, headers)
        from tools.satellite_data_plane import _data_plane_lock
        with _data_plane_lock(self.path.parent / "provider-lock"):
            self.state = self.read(self.path)
            return self._query(url, headers)

    def _query(self, url, headers=None):
        if url in self.responses:
            return self.responses[url]
        if self.failed or self.state.get("blocked"):
            raise ProviderPaused(self.state.get("error") or "Provider queries are paused pending investigation.")
        item = self.state["urls"].get(url, {})
        next_allowed = item.get("next_allowed_at")
        if next_allowed and dt.datetime.fromisoformat(next_allowed.replace("Z", "+00:00")) > self.now:
            cached = item.get("response")
            if isinstance(cached, dict):
                from tools.satellite_data_tools import FetchResponse
                response = FetchResponse(**cached)
                self.responses[url] = response
                return response
            raise ProviderPaused(f"Provider query deferred until {next_allowed}: {url}")
        hours = 24 if urlparse(url).path.endswith("satcat.csv") else 2
        item = {**item, "last_attempt_at": timestamp(self.now),
                "next_allowed_at": timestamp(self.now + dt.timedelta(hours=hours))}
        self.state["urls"][url] = item
        # Persist admission before contacting the provider, including across crashes.
        self.save()
        try:
            response = self.fetcher(url, headers=headers)
            if response.status not in (200, 304):
                raise ProviderHTTPError(f"HTTP {response.status}: {url}", status=response.status,
                                        retry_after=response.headers.get("retry-after"))
        except Exception as exc:
            self.failed = True
            failures = int(item.get("failures", 0)) + 1
            delay = min(24 * 3600, 2 * 3600 * 2 ** min(failures - 1, 4))
            retry_after = getattr(exc, "retry_after", None)
            if retry_after:
                from email.utils import parsedate_to_datetime
                try:
                    delay = max(delay, float(retry_after))
                except ValueError:
                    try:
                        delay = max(delay, (parsedate_to_datetime(retry_after) - self.now).total_seconds())
                    except (TypeError, ValueError, OverflowError):
                        pass
            item.update(failures=failures, next_allowed_at=timestamp(self.now + dt.timedelta(seconds=delay)))
            self.state.update(error=str(exc)[:2000], blocked=getattr(exc, "status", None) is not None)
            self.save()
            raise
        item.update(failures=0, status=response.status, last_success_at=timestamp(self.now))
        if response.status == 200 and len(response.text.encode("utf-8")) <= 32 * 1024 * 1024:
            item["response"] = {"url": url, "text": response.text, "status": response.status,
                                "headers": response.headers, "not_modified": False}
        self.state.pop("error", None)
        self.responses[url] = response
        self.save()
        return response
