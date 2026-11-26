"""Durable per-object orbital refreshes, separate from published catalog generations."""
import json
import logging
import sqlite3
import time
from contextlib import closing
from datetime import datetime, timezone
from threading import Lock

from tools.provider_queries import ProviderQueries
from tools.satellite_data_tools import (CELESTRAK_GP_ENDPOINT, SatelliteDataError, canonicalize_omm_record,
                                       fetch_url, normalize_omm_epoch, omm_to_tle)


class SelectedElements:
    def __init__(self, runtime, hours=2, online=True, fetcher=fetch_url, clock=time.time):
        self.database = runtime / "selected-elements.sqlite3"
        self.ledger = runtime / "data-plane" / "provider-queries.json"
        self.interval = hours * 3600
        self.online, self.fetcher, self.clock = online, fetcher, clock
        self.locks = [Lock() for _ in range(64)]
        self.provider_lock = Lock()
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("""CREATE TABLE IF NOT EXISTS elements (
                norad TEXT PRIMARY KEY, epoch TEXT, data TEXT, checked REAL, attempted REAL, status TEXT)""")

    def lookup(self, detail):
        number = detail["norad_id"]
        if detail["scope"] != "current":
            return {"norad_id": number, "status": "historical", "element_set": None}
        with self.locks[int(number) % len(self.locks)], closing(sqlite3.connect(self.database)) as db:
            row = db.execute("SELECT data, checked, attempted, status FROM elements WHERE norad=?", (number,)).fetchone()
            saved, checked, attempted, status = row or (None, None, None, "local")
            local = detail.get("element_set")
            best = json.loads(saved) if saved else None
            saved_epoch = best["epoch"] if best else ""
            if local:
                local_epoch = normalize_omm_epoch(local["omm"]["EPOCH"])
                if local_epoch > saved_epoch:
                    best = {**local, "epoch": local_epoch}
            now = self.clock()
            refresh_due = self.online and (attempted is None or now - attempted >= self.interval)
            if refresh_due:
                try:
                    url = f"{CELESTRAK_GP_ENDPOINT}?CATNR={number}&FORMAT=JSON"
                    with self.provider_lock:
                        response = ProviderQueries(self.ledger, self.fetcher, now=datetime.fromtimestamp(now, timezone.utc))(url)
                    rows = [] if response.text.strip().lower().startswith("no gp data") else json.loads(response.text)
                    if not isinstance(rows, list):
                        raise ValueError("Expected a GP record list")
                    candidates = [canonicalize_omm_record(record) for record in rows]
                    if any(str(record["NORAD_CAT_ID"]) != number for record in candidates):
                        raise ValueError("Provider returned a different NORAD ID")
                    newest = max(candidates, key=lambda record: record["EPOCH"], default=None)
                    if newest and (not best or newest["EPOCH"] > best["epoch"]):
                        best = {"format": "OMM", "source": "CelesTrak CATNR", "epoch": newest["EPOCH"], "omm": newest}
                        status = "updated"
                    else:
                        status = "unchanged" if newest else "no_current_elements"
                    checked = now
                except (ValueError, OSError, RuntimeError) as exc:
                    logging.warning("Selected elements for NORAD %s: %s", number, exc)
                    status = "provider_unavailable"
            with db:
                if best and best["epoch"] > saved_epoch:
                    db.execute("""INSERT INTO elements (norad, epoch, data, status) VALUES (?, ?, ?, 'local')
                        ON CONFLICT(norad) DO UPDATE SET
                            epoch=excluded.epoch, data=excluded.data
                        WHERE excluded.epoch > COALESCE(elements.epoch,'')""",
                               (number, best["epoch"], json.dumps(best)))
                if refresh_due:
                    db.execute("""INSERT INTO elements (norad, checked, attempted, status) VALUES (?, ?, ?, ?)
                        ON CONFLICT(norad) DO UPDATE SET
                            checked=COALESCE(excluded.checked,elements.checked),
                            attempted=excluded.attempted, status=excluded.status
                        WHERE elements.attempted IS NULL OR excluded.attempted >= elements.attempted""",
                               (number, checked, now, status))
            if best:
                try:
                    best["line1"], best["line2"] = omm_to_tle(best["omm"])
                except SatelliteDataError:
                    pass  # The full OMM remains available for six-digit IDs.
            return {"norad_id": number, "element_set": best, "checked_at": checked, "status": status}
