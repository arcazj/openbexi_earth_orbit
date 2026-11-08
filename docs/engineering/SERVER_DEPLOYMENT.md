# Local server and durable service

The supported default is a loopback development server. Start with `npm run serve` or `node scripts/python.mjs server.py --host 127.0.0.1 --port 8000`. Use `--no-data-update` for offline work and `--no-v21-service` for the legacy/static API boundary.

## Roles and storage

The durable full-catalog API requires configured bearer tokens. Set independent random values of at least 24 characters in `OPENBEXI_API_VIEWER_TOKEN`, `OPENBEXI_API_ANALYST_TOKEN` and `OPENBEXI_API_ADMIN_TOKEN`. The server reads its environment, not `.env.example`. Never put tokens in URLs, localStorage, source or logs.

Viewer reads results; analyst submits/cancels/replays jobs; administrator controls privileged operations. Mutating creates/replays require `Idempotency-Key`. Public `/api/v1/health/live`, `/api/v1/health/ready` and `/api/v1/capabilities` disclose readiness/limits. See [API reference](../SWAGGER.md) for full route names and authorization.

Private storage defaults to `runtime/openbexi-v21.sqlite3` with bounded catalog/acquisition/job files under the runtime root. Catalog byte identities and acquisition observations are separate. Worker environment is allowlisted and excludes API/provider secrets and Node injection options. Stop the service before copying/restoring the entire runtime root; no online-backup or downgrade migration is promised.

## Updates and failure handling

Background maintenance evaluates independent daily clocks, seeds a private candidate, validates complete source pairs and tracked closure/lineage, and atomically promotes a private pointer. Cancellation, partial data, shrink guards, provider errors and write failure preserve last-good data. Repository snapshots stay unchanged. See [maintenance](DATA_MAINTENANCE.md) and [health](DATA_HEALTH_V1.md).

Default mutable data and `/api/v1` requests recheck the verified pointer. Durable-service activation completes before a new root is selected; a failed request-time rebind retains the previous root and retries later. Scheduler post-promotion registration errors are reported separately and retried. Incoherent tracked data returns bounded `503 TRACKED_CATALOG_UNAVAILABLE` while the browser retains GP fallback.

The server uses eight handlers, a 64-connection backlog and a two-second admission wait. An unused socket has one second to provide its request line; active transfers retain a 30-second timeout. These limits prevent idle preconnections from exhausting the service and do not make it a public production server.

Before hosted use, separately review identity, TLS, proxy trust, CORS, storage/retention, concurrency, provider terms, audit/alerts and recovery. The optional Docker/cloud path is not published or qualified by v2.5. See [security](../SECURITY.md) and [rollback](ROLLBACK.md).
