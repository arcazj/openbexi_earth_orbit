# v2.1 Service Rollback

Last reviewed: 2026-08-22

## Scope

This runbook covers the optional Version 2.1 full-catalog service retained inside Version 2.2. It supplements `ROLLBACK.md`, while `ROLLBACK_V2_2.md` covers GP/launch/decay catalog revisions, cache invalidation, and the bounded Version 2.2 browser-continuity artifact. Version 2.1 never reached candidate or release status, and this procedure has not yet been rehearsed in a target deployment.

## Abort Triggers

Stop admission when any of the following occurs:

- catalog snapshot, job, event, or audit data is corrupt or cannot be tied to its checksum and source revision;
- stale worker ownership or an attempt-fencing violation is suspected;
- a `COMPLETED` scientific result is emitted despite unscreened intervals, propagation gaps, a coverage-affecting work/event cap, or motion-bound violations;
- bearer credentials, cursor secrets, private artifacts, or database content are exposed;
- unexplained scientific divergence, candidate-recall failure, path escape, unbounded resource growth, or sustained service instability occurs.

## Immediate Disablement

1. Stop accepting new jobs and record the time, active job ID, source revision, application version, and decision owner.
2. Stop `server.py`. Preserve stdout/stderr, the complete runtime directory, and source/catalog/release hashes before modifying configuration.
3. Restart the visualization without the v2.1 service:

```powershell
py server.py --host 127.0.0.1 --port 8000 --no-v21-service
```

4. Confirm that `index.html`, the legacy read APIs, and v2.0 selected-object screening still work. The Full-Catalog Screening workspace must state that the server capability is unavailable.
5. Rotate any credential that may have been exposed. Do not reuse a cursor secret as a bearer token.

Stopping the worker can interrupt an active subprocess. On a later re-enable, durable recovery will cancel a pending cancellation, requeue an interrupted attempt when budget remains, or fail it when the attempt budget is exhausted. Preserve this evidence; do not manually rewrite job states.

## Feature Disable Build

For a reviewed disabled development build, set `experimental_full_catalog_screening.enabled` to `false` in `release/feature-flags.json`, run `npm run version:sync`, run the complete applicable checks, and restart. This preserves the database and completed private history while preventing the worker from starting. `--no-v21-service` is the stronger incident switch because it avoids opening or serving the v2.1 store at all.

## Application Rollback

1. Stop the Version 2.1 process and checksum-copy the complete runtime directory.
2. Restore the previously archived application/static artifact by checksum. Do not rebuild an old source state during an incident.
3. Do not point v2.0 code at the v2.1 SQLite database. Version 2.0 does not require or understand the durable store.
4. Keep the v2.1 runtime copy private for analysis and possible forward recovery. There is no destructive downgrade migration.
5. Verify the restored page, vendored dependency loading, nonblank canvas, packaged catalog identity, v2.0 Worker flow, and applicable health endpoint.

## Data Recovery

- Never replace `json/tle/TLE.json` as part of job rollback. The service snapshots the catalog into private storage and does not modify the source catalog.
- Quarantine a suspect catalog revision and every dependent job artifact together. Preserve original retrieval timestamps and hashes.
- Restore a runtime backup only with the server stopped and only as a complete checksummed set. SQLite database, WAL-related state, catalog snapshots, and job artifacts must remain mutually consistent.
- Completed conjunction event revisions are retained by default. Store retention APIs refuse active jobs and immutable event history; unconsumed outbox deletion requires an explicit data-loss choice.
- Re-enable only after schema checks, source checksums, focused store/runner/API tests, and the original abort condition are resolved.

## Rehearsal Evidence

A candidate decision requires a recorded rehearsal that demonstrates:

- no new job can be admitted after disablement;
- static visualization and v2.0 selected-object screening remain available;
- interrupted-job recovery is deterministic and does not allow a stale attempt to import;
- a checksummed runtime backup can be restored on a clean local instance;
- retained completed events and audit records remain readable;
- no token or private artifact enters `dist/`, logs, URLs, or browser persistent storage.

Record exact commands, source and artifact hashes, elapsed recovery time, data-loss result, operator, reviewer, and follow-up issues. Until this is completed, rollback readiness remains an open v2.1 gate.
