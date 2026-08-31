# v2.1 Durable Service Deployment with v2.3.1 Catalog Input

Last reviewed: 2026-08-30

## Supported Boundary

The Version 2.1 durable service remains a single-node local development deployment inside the Version 2.3.1 application. The Python standard-library server owns HTTP admission and SQLite persistence; one isolated Node subprocess at a time performs full-catalog screening. The server binds to loopback by default. This is not a distributed queue, multi-tenant service, or operational conjunction system. Tracked-object records without current GP/OMM remain outside the screening catalog. In the frozen snapshot, all 12,490 current and 23,348 historical debris records are metadata-only and zero debris is eligible for screening or map positioning.

By itself, and without an explicit API base, static deployment provides only the v2.0 selected-object browser screener. Full-catalog jobs, durable history, authenticated API reads, and server event streams require this local service; an explicitly configured static client may connect to it.

## Prerequisites

- Install the locked Node dependency graph with `npm ci`.
- Use a supported Python 3 runtime. Node.js 22 is recommended; the declared supported Node range is 20 through 24.
- Run `npm run check` before treating a source state as deployable.
- Generate independent random bearer values of at least 24 characters. The server reads the process environment and does not load `.env.example`.
- Keep `runtime/` on private local storage with enough capacity for the SQLite database, immutable catalog copies, runner inputs, and result artifacts.

`npm run serve`, `npm run check:python`, `npm run test:python`, `npm run benchmark:v21-service`, and `npm run test:browser` share `scripts/python-discovery.mjs`. It honors `OPENBEXI_PYTHON_COMMAND` first, then probes `py -3` on Windows, `python3`, `python`, and recognized installed Windows Python directories; each candidate must identify itself as Python 3. Set the environment variable to an executable path or command such as `py -3` when automatic discovery is unsuitable.

## Role Configuration

The development role hierarchy is `viewer < analyst < administrator`.

| Role | Current access |
| --- | --- |
| Viewer | Read catalog revisions, jobs, event details, and authenticated job streams |
| Analyst | Viewer access plus submit, cancel, retry, and replay jobs |
| Administrator | Analyst access; reserved for later administrative source and retention operations |

Configure only roles that are needed, using unique tokens:

```powershell
$env:OPENBEXI_API_VIEWER_TOKEN = "replace-with-an-independent-random-viewer-token"
$env:OPENBEXI_API_ANALYST_TOKEN = "replace-with-an-independent-random-analyst-token"
$env:OPENBEXI_API_ADMIN_TOKEN = "replace-with-an-independent-random-admin-token"
$env:OPENBEXI_CURSOR_SECRET = "replace-with-an-independent-random-cursor-secret"
npm run serve
```

`OPENBEXI_CURSOR_SECRET` is optional for loopback development. If omitted, a private stable key is generated under the runtime directory. Never place bearer credentials in a URL, query string, log, report, local storage, or committed shell script. The browser workspace keeps its entered token in page memory only and sends it with `Authorization: Bearer ...`.

Open `http://127.0.0.1:8000/index.html`. The Full-Catalog Screening workspace becomes ready only when the feature is enabled, at least one API token is configured, the worker is running, and a current catalog revision exists.

To choose another private directory inside the repository or disable the service entirely:

```powershell
py server.py --host 127.0.0.1 --port 8000 --runtime-dir runtime-v21
py server.py --host 127.0.0.1 --port 8000 --no-v21-service
```

## Startup and Storage

At startup the service:

1. Creates the private runtime directory if needed.
2. Applies the SQLite schema migration and enables WAL mode.
3. Snapshots the preferred bundled GP/OMM bytes, then performs semantic GP validation before SQLite current-revision registration. If GP is malformed or has no propagatable records, bootstrap accepts the packaged legacy TLE fallback only when it is a readable bounded nonempty array with at least one observation-shaped record. Strict TLE adapter/propagation validation remains a runner boundary, and startup fails closed when neither source reaches its stated boundary.
4. Reconciles current observations as new, changed, observed, absent, or reappeared. A bundled revision takes `COMPLETE`, `PARTIAL`, or `DEGRADED` from the first metadata frozen for that catalog byte hash. Normal scheduled GP refreshes are incremental `PARTIAL` upserts. Only a registered `COMPLETE` snapshot may emit absence; GP daily reconciliation can establish that state only after structurally valid, quarantine-free responses from `active`, `fengyun-1c-debris`, `iridium-33-debris`, and `cosmos-2251-debris`. Completeness remains bounded to that configured partial scope.
5. Recovers interrupted jobs according to their durable state and remaining attempt budget.
6. Starts one local screening worker when the server feature flag is enabled.

Scheduled provider maintenance is disabled by default. `npm run serve:update` opts into daily GP, compatibility TLE, SATCAT, tracked, launch, decay, and complete configured-scope reconciliation clocks. `--tracked-update-interval-hours` is independent and defaults to the effective SATCAT interval. The server binds before background catch-up, requests every configured GP group at most once per due cycle, coalesces SATCAT-derived work, derives tracked chunks locally without a further provider request, retries isolated failures with bounded jittered backoff, recovers stale locks, and joins the worker during shutdown. A successful GP or TLE promotion invokes private snapshot registration. Normal upserts are `PARTIAL`; only a validated complete reconciliation can infer absence. During active-only to four-group migration, `source_scope_verified` remains false and the cycle remains retry-eligible until all groups succeed together; failed, partial, quarantined, or `304`-only responses retry without inherited validators. Metadata distinguishes configured `source_groups` from accepted-byte `catalog_source_groups`, and a tracked rebuild carries only the latter. Historical launch and decay events are retained. Changed GP/TLE/SATCAT/tracked/launch/decay bytes update the six-component server `data_revision`, while `catalog_revision` remains GP-only. Conditional, identical, failed, malformed, interrupted, or rejected operations preserve the last-known-good manifest/data and do not fabricate completion.

The SQLite file is `runtime/openbexi-v21.sqlite3` by default. Each catalog hash owns a private `catalogs/<sha256>/` directory. `catalog.json`, the first `source-metadata.json` supplied for that catalog byte hash, and `revision.json` are immutable; a later distinct retrieval of identical catalog bytes writes a separate immutable `acquisitions/<sha256>.json` record and does not rewrite the frozen descriptor or metadata. Repeating the same acquisition is idempotent. A rejected semantic GP snapshot may therefore remain as private diagnostic material without becoming the current SQLite revision. Per-attempt input/result files are stored below the same runtime root. Paths are confined to that root and result imports are checksum checked. The child runner receives only an explicit process-environment allowlist (`PATH` and required platform/locale/temp variables plus forced `NODE_NO_WARNINGS=1`); API tokens, cursor/provider secrets, arbitrary unlisted variables, and `NODE_OPTIONS` are excluded.

There is no supported online-backup command or downgrade migration in v2.1. For a development backup, stop the service and checksum-copy the entire runtime directory. Restore only while the service is stopped, and retain the source revision and release metadata that can read the schema.

## API Verification

Unauthenticated discovery and health:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health/live
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health/ready
Invoke-RestMethod http://127.0.0.1:8000/api/v1/capabilities
Invoke-RestMethod http://127.0.0.1:8000/api/gp-metadata
Invoke-RestMethod http://127.0.0.1:8000/api/tracked-objects/manifest
Invoke-RestMethod http://127.0.0.1:8000/api/data-update-status
```

Readiness requires the enabled feature, healthy store, current catalog, and running worker. A server can be live while not ready.

`/api/gp-metadata` returns the generated `json/gp/GP.meta.json` sidecar unchanged and returns `404` if it has not been exported. `/api/tracked-objects` and `/api/tracked-objects/manifest` return the atomic tracked manifest. `/api/tracked-objects/chunks/{file_name}` and the equivalent `server.py` static manifest/metadata/chunk aliases return only a safe-name file referenced by the current manifest after path confinement plus byte, SHA-256, and record-count verification. Before any tracked response, the server validates the whole referenced closure, manifest/metadata revision agreement, raw GP and SATCAT bytes against their sidecar hashes, and source revisions/groups against those current sidecars. It serves the exact manifest/metadata snapshot that passed validation, so a concurrent replacement cannot mix checked and returned generations. Missing, corrupt, one-sided, stale-lineage, or otherwise incoherent tracked state returns bounded `503 TRACKED_CATALOG_UNAVAILABLE` as `application/problem+json`; retained/orphaned chunks remain private and the client stays on the GP-only fallback. `/api/data-update-status` exposes this as degraded health through `tracked_pointer_valid`, `tracked_revision_match`, `tracked_source_revision_match`, and a bounded public error. It also returns the six-component server `data_revision`; GP-only `catalog_revision`; GP/TLE/SATCAT/tracked/launch/decay revisions; worker, interval, retry, reconciliation, and per-dataset state; and matching values below `datasets`. It reconstructs persisted errors for all six datasets after restart, merges current cycle results, and recursively bounds, control-character normalizes, and credential-redacts the public nested result/error projection. When GP metadata is absent, a packaged TLE file larger than the empty `[]` sentinel yields `fallback-tle`; if no such artifact exists, `catalog_state` is `unavailable`. The fallback status is artifact availability, not TLE parse or propagation validation.

The capability document includes supported source formats, object/lifecycle values, the normalized default job configuration, and structured minimum/maximum/integer constraints. Treat it as discovery only; the server still validates every submitted request. Catalog documents intentionally strip private snapshot and metadata file locations.

Authenticated resources use an authorization header:

```powershell
$headers = @{ Authorization = "Bearer $env:OPENBEXI_API_ANALYST_TOKEN" }
Invoke-RestMethod http://127.0.0.1:8000/api/v1/catalog-revisions -Headers $headers
Invoke-RestMethod http://127.0.0.1:8000/api/v1/screening-jobs -Headers $headers
```

Job submission and replay each require an `Idempotency-Key`. Reusing a key with the same normalized request returns the existing job; reusing it for different input returns a conflict. Replay creates a new job against the original frozen request/catalog, with job/attempt-scoped persisted event revisions and the engine event identity retained in the payload. Paginated endpoints use opaque signed cursors bound to their filters. Job streams use `Last-Event-ID` for resume and require header authentication; tokens in query parameters are rejected. The browser uses authenticated `fetch` streaming and falls back to bounded polling when streaming is unavailable.

The generated route schema is published at `/openapi.json` and rendered by `/docs`. The static `swagger.html` and `SWAGGER.md` pages provide offline route summaries and examples; they are not substitutes for the live schema.

Exercise the complete local boundary without retaining credentials or runtime state:

```powershell
npm run benchmark:v21-service -- --output artifacts/v21-service-benchmark.json
```

The driver creates a fresh private runtime and generated role credentials, starts the real handler/store/worker, submits and polls one bounded job, reads event pages, closes the service, records persistence, and deletes the runtime by default. This is development measurement, not a health check or operational acceptance test.

## Operations and Limits

- Default job bounds include a one-hour horizon, 60-second coarse step, 10 km screening radius, 30-minute timeout, two attempts, and explicit spatial/candidate/result ceilings. Requests are normalized and validated server-side.
- One service process runs one screening subprocess at a time. Queue growth, disk growth, and latency have no production service-level objective.
- No OS/process CPU or memory quota is implemented. The 256 MiB result-artifact limit and engine work caps do not bound peak heap/RSS; process isolation and representative memory budgets remain deployment gates.
- Worker progress persistence records first-stage, 1% advancement, and bounded-heartbeat snapshots and is capped at 512 records per attempt. The current 60-second service diagnostic retained 22 progress rows and 26 total outbox rows for one full-catalog job. Monitor database/WAL growth; representative cap validation, outbox consumer acknowledgement/pruning, and retention policy remain candidate blockers.
- Mutations are limited to 30 requests per minute per local principal; viewer reads are limited to 240. These are development controls, not a public abuse-defense design.
- Completed results can be `PARTIAL`. Inspect quality flags, structured errors, propagation failures, motion-bound violations, unscreened intervals, truncation, and source status before interpreting any event list.
- The tracked manifest's metadata-only population is not screened. Any coverage statement must report that excluded population and must not treat a successful GP-only job as complete tracked-population coverage.
- Scheduled screening, report export, notifications, and operator workflow are not included. Daily GP/TLE/SATCAT/tracked/lifecycle maintenance is optional, guarded, and disabled by default. For established catalogs of at least 1,000 records, unattended full/reconciliation replacement requires both 75% candidate size and 75% canonical NORAD overlap. `--force` cannot bypass the guard, and the direct-command shrink override is unavailable to the server. Accepted `304` revalidation resets due age; changed fixed-name artifacts retain the newest seven collision-safe backups, while tracked content-addressed cleanup preserves current and bounded rollback references.
- Public exposure requires a reviewed TLS reverse proxy, stronger identity and authorization, token lifecycle management, quotas, monitoring, backups, retention, incident response, and provider license approval. `--allow-public` is an acknowledgement, not approval.

Use `ROLLBACK_V2_1.md` for durable-service disablement and restoration, `ROLLBACK_V2_2.md` for GP/TLE/SATCAT/launch/decay continuity, and `ROLLBACK_V2_3.md` for tracked manifest/chunk and browser fallback. All version checklists remain separate open gates before any candidate decision.
