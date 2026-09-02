# OpenBEXI Earth Orbit Swagger API

`SWAGGER.md` is the local, static Markdown companion for the optional OpenBEXI Earth Orbit Python API.

The Help `Swagger` action opens `swagger.html`, a standard Swagger/OpenAPI-style static page that does not require `server.py`.

You do not need to run `server.py` to read this Markdown companion. Open it directly as Markdown or use:

```text
markdown_viewer.html?source=SWAGGER.md&title=Swagger%20API
```

Live endpoint requests and the generated OpenAPI JSON still require the optional Python server.

## Server Startup

```powershell
py server.py --host 127.0.0.1 --port 8000
```

Default base URL:

```text
http://127.0.0.1:8000
```

## Static Documentation

- Local standard Swagger UI page: `swagger.html`
- Local Markdown page: `SWAGGER.md`
- Rendered local Markdown page: `markdown_viewer.html?source=SWAGGER.md&title=Swagger%20API`
- Live Swagger UI, server required: `http://127.0.0.1:8000/docs`
- Live OpenAPI JSON, server required: `http://127.0.0.1:8000/openapi.json`

## Endpoints

| Method | Path | Server Required | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Yes | Returns local API health, app name, version, and publication state/date. |
| `GET` | `/api/version` | Yes | Returns app/API version metadata, publication state/date, repository URL, and server identifier. |
| `GET` | `/api/gp` | Yes | Returns the preferred mixed GP/OMM tracked-object element dataset from `json/gp/GP.json`. |
| `GET` | `/api/gp-metadata` | Yes | Returns the exact preferred-catalog sidecar from `json/gp/GP.meta.json`; returns `404` when it has not been exported. |
| `GET` | `/api/tle` | Yes | Deprecated Version 2.2 numeric/Alpha-5 compatibility subset from `json/tle/TLE.json`; it is not complete six-digit coverage. |
| `GET` | `/api/satellites` | Yes | Generic catalog route that returns preferred GP/OMM with deprecated TLE fallback. |
| `GET` | `/api/launches` | Yes | Returns SATCAT-backed launch events, including details-only records with no propagatable orbit. |
| `GET` | `/api/tracked-objects` | Yes | Alias for the current tracked-object manifest; Version 2.3.2 retains tracked schema Version 2.3.0. Returns bounded `503 TRACKED_CATALOG_UNAVAILABLE` when the publication is incoherent. |
| `GET` | `/api/tracked-objects/manifest` | Yes | Returns the selected root's atomic tracked-object publication manifest, coverage/accounting invariants, counts, provenance, and referenced chunks only after closure/revision/current-source-lineage verification. Version 2.3.2 facets and result views are client-derived and do not change this API. |
| `GET` | `/api/tracked-objects/chunks/{file_name}` | Yes | Returns one content-addressed chunk referenced by the current manifest after whole-publication coherence plus allowlist, byte, SHA-256, and record-count validation. |
| `GET` | `/api/satellite-metadata` | Yes | Lists available metadata JSON files under `json/satellites/`. |
| `GET` | `/api/satellite-metadata/{file_name}` | Yes | Returns one metadata JSON file by safe file name. |
| `GET` | `/api/display-satellite-models` | Yes | Returns a live manifest of `.glb` and `.obj`/`.mtl` models under `obj/`. |
| `GET` | `/api/decayed` | Yes | Returns confirmed decayed satellite data from `json/decayed/decayed.json`. |
| `GET` | `/api/data-update-status` | Yes | Returns scheduler lifecycle and backoff, effective intervals, restart-persistent GP/TLE/SATCAT/tracked/launch/decay status/errors, recursively sanitized nested cycle results, private-candidate promotion status, reconciliation time, a six-component data revision, freshness/count diagnostics, and newest dates. Private candidate paths and pointer details are not exposed. |
| `GET` | `/openapi.json` | Yes | Returns the generated OpenAPI 3.0.3 schema. |
| `GET` | `/docs` | Yes | Serves the live Swagger UI page. |
| `GET` | `/api/v1/health/live` | Yes | Process liveness for API v1. |
| `GET` | `/api/v1/health/ready` | Yes | Store, catalog, feature, and worker readiness. |
| `GET` | `/api/v1/capabilities` | Yes | Public capability and limit discovery without private paths. |
| `GET` | `/api/v1/catalog-revisions` | Yes | Authenticated, paginated catalog revision history. |
| `GET` | `/api/v1/catalog-revisions/{revision_id}` | Yes | Authenticated catalog revision details. |
| `POST` | `/api/v1/screening-jobs` | Yes | Submit an idempotent full-catalog screening job. |
| `GET` | `/api/v1/screening-jobs` | Yes | Query jobs with stable keyset pagination. |
| `GET` | `/api/v1/screening-jobs/{job_id}` | Yes | Read job state, attempts, progress, and result summary. |
| `DELETE` | `/api/v1/screening-jobs/{job_id}` | Yes | Request cancellation of a queued or running job. |
| `POST` | `/api/v1/screening-jobs/{job_id}/retry` | Yes | Retry an eligible failed or timed-out job. |
| `POST` | `/api/v1/screening-jobs/{job_id}/replay` | Yes | Create an idempotent deterministic replay from the frozen request and catalog. |
| `GET` | `/api/v1/screening-jobs/{job_id}/stream` | Yes | Authenticated Server-Sent Events with `Last-Event-ID` resume. |
| `GET` | `/api/v1/conjunction-events` | Yes | Filtered, stably ordered, paginated event revisions. |
| `GET` | `/api/v1/conjunction-events/{event_id}` | Yes | Read one immutable event revision. |

API v1 uses bearer credentials configured through `OPENBEXI_API_VIEWER_TOKEN`, `OPENBEXI_API_ANALYST_TOKEN`, and `OPENBEXI_API_ADMIN_TOKEN`. Tokens must contain at least 24 characters. Supply them only in the `Authorization: Bearer ...` header; query-string credentials are rejected. Job submission and replay also require an `Idempotency-Key` header. Browser clients use authenticated `fetch` for SSE because native `EventSource` cannot attach the required header.

## Examples

Health:

```http
GET /api/health HTTP/1.1
Host: 127.0.0.1:8000
```

Example response:

```json
{
  "status": "ok",
  "app": "openbexi_earth_orbit",
  "version": "2.3.2",
  "release_date": null,
  "candidate_date": null,
  "publication_state": "development"
}
```

Version:

```http
GET /api/version HTTP/1.1
Host: 127.0.0.1:8000
```

Example response:

```json
{
  "app_version": "2.3.2",
  "api_version": "1.0.0",
  "release_date": null,
  "candidate_date": null,
  "publication_state": "development",
  "release_channel": "development",
  "maturity": "experimental",
  "safety_class": "non-operational",
  "repository": "https://github.com/arcazj/openbexi_earth_orbit",
  "server": "OpenBEXIHTTP/2.3.2"
}
```

Preferred GP/OMM dataset:

```http
GET /api/gp HTTP/1.1
Host: 127.0.0.1:8000
```

Response shape:

```json
[
  {
    "name": "EXAMPLE",
    "norad_id": "100001",
    "element_set": {
      "format": "OMM",
      "epoch": "2026-08-20T00:00:00.000Z",
      "omm": {
        "OBJECT_ID": "2026-001A",
        "NORAD_CAT_ID": "100001",
        "MEAN_MOTION": 15.1
      }
    }
  }
]
```

Preferred GP metadata sidecar:

```http
GET /api/gp-metadata HTTP/1.1
Host: 127.0.0.1:8000
```

Representative response shape (the route returns the generated sidecar unchanged):

```json
{
  "schema_version": "2.2.0",
  "dataset_format": "CCSDS_OMM_JSON",
  "provider": "CelesTrak",
  "retrieval_timestamp": "2026-08-29T23:55:59Z",
  "last_attempt_at": "2026-08-30T20:33:29Z",
  "last_status": "failed",
  "last_error": "HTTP 503 from one or more configured groups",
  "source_status": "DEGRADED",
  "partial_update": false,
  "source_groups": [
    "active",
    "fengyun-1c-debris",
    "iridium-33-debris",
    "cosmos-2251-debris"
  ],
  "catalog_source_groups": ["active"],
  "source_scope_verified": false,
  "provider_completeness_claim": false,
  "catalog_revision": "sha256:gp-example",
  "counts": {
    "total": 16470,
    "omm": 16470,
    "tle": 0,
    "six_digit_ids": 421,
    "quarantined": 0
  }
}
```

Deprecated TLE compatibility dataset:

```http
GET /api/tle HTTP/1.1
Host: 127.0.0.1:8000
```

Response shape:

```json
[
  {
    "name": "ISS (ZARYA)",
    "tle_line1": "1 ...",
    "tle_line2": "2 ..."
  }
]
```

Tracked-object manifest:

```http
GET /api/tracked-objects/manifest HTTP/1.1
Host: 127.0.0.1:8000
```

Representative frozen-snapshot response excerpt. The descriptor arrays are abbreviated to one example entry each; the real response includes every descriptor required to reconcile the declared counts.

```json
{
  "schema_version": "2.3.0",
  "catalog_kind": "provider_tracked_objects",
  "catalog_revision": "sha256:7c1a20d9...d730c",
  "provider_completeness_claim": false,
  "default_membership": "CURRENT",
  "scope": {
    "current_records": 34960,
    "historical_records": 35514,
    "historical_decayed_records": 35514,
    "absent_records": 0
  },
  "counts": {
    "total": 70474,
    "current": 34960,
    "historical": 35514,
    "history_total": 35514,
    "absent": 0,
    "propagatable": 16470,
    "metadata_only": 54004,
    "current_propagatable": 16470,
    "current_metadata_only": 18490,
    "quarantined": 0
  },
  "chunks": [
    {
      "id": "current-payload",
      "path": "json/tracked/chunks/<sha256>-current-payload.json",
      "scope": "CURRENT",
      "object_type": "PAYLOAD",
      "count": 19989,
      "sha256": "sha256:<digest>",
      "bytes": 21789231
    }
  ],
  "history_chunks": [
    {
      "id": "historical-debris",
      "path": "json/tracked/chunks/<sha256>-historical-debris.json",
      "scope": "HISTORICAL",
      "object_type": "DEBRIS",
      "count": 23348,
      "sha256": "sha256:<digest>",
      "bytes": 24215754
    }
  ],
  "quarantine": {
    "path": "json/tracked/chunks/<sha256>-quarantine.json",
    "count": 0,
    "sha256": "sha256:<digest>",
    "bytes": 39
  }
}
```

`history_total` is the authoritative history-chunk partition, so `total == current + history_total`. `historical` counts records with a published decay date, while `absent` counts identities moved out of current membership by a complete guarded reconciliation. Both are diagnostics within `history_total`; they can overlap and must not be added to derive the history partition. In the frozen snapshot, every history-scope record is decay-dated, so `historical == history_total == 35,514` and `absent == 0`. Availability partitions are independent: `total == propagatable + metadata_only` and `current == current_propagatable + current_metadata_only`.

Request a chunk with the descriptor's basename, not its full path:

```http
GET /api/tracked-objects/chunks/<sha256>-current-payload.json HTTP/1.1
Host: 127.0.0.1:8000
```

The route returns `404` for traversal or unsafe names and for files not referenced by an otherwise coherent current manifest. Every public data route resolves from the same atomically selected root: a validated private runtime candidate when one is promoted, otherwise the checked-in release closure. Every tracked manifest, metadata, referenced chunk, and equivalent `server.py` static alias first requires a complete valid closure, matching manifest/metadata revisions, raw GP/SATCAT bytes matching their metadata hashes, and source revisions/groups matching those current sidecars. The server responds with the exact manifest/metadata snapshot that passed these checks. A missing, mismatched, corrupt, or escaping referenced chunk, stale lineage, changed check/use snapshot, or other pointer incoherence returns `503` with bounded `application/problem+json`; the client retains its GP-only fallback and does not accept a partial tracked index. Metadata-only records returned by this API have no implied position or screening eligibility. No public endpoint lists, writes, promotes, or deletes private candidates.

```json
{
  "type": "https://openbexi.example/problems/tracked-catalog-unavailable",
  "title": "Tracked-object catalog unavailable",
  "status": 503,
  "detail": "The tracked-object catalog is temporarily unavailable because its manifest, metadata, chunks, or source lineage is not coherent.",
  "code": "TRACKED_CATALOG_UNAVAILABLE",
  "instance": "/api/tracked-objects/manifest"
}
```

Satellite metadata index:

```http
GET /api/satellite-metadata HTTP/1.1
Host: 127.0.0.1:8000
```

Response shape:

```json
{
  "count": 1,
  "files": [
    {
      "name": "example.json",
      "path": "json/satellites/example.json",
      "url": "/api/satellite-metadata/example.json",
      "bytes": 1234
    }
  ]
}
```

Data update status:

```http
GET /api/data-update-status HTTP/1.1
Host: 127.0.0.1:8000
```

Example response:

```json
{
  "enabled": true,
  "running": true,
  "state": "succeeded",
  "interval_hours": 24,
  "intervals_hours": {
    "gp": 24,
    "tle": 24,
    "satcat": 24,
    "tracked": 24,
    "reconciliation": 24
  },
  "consecutive_failures": 0,
  "retry_delay_seconds": null,
  "next_check_at": "2026-08-30T13:00:00Z",
  "last_reconciled_at": "2026-08-29T12:00:00Z",
  "catalog_state": "current",
  "catalog_source_status": "COMPLETE",
  "data_revision": "sha256:composite-example",
  "catalog_revision": "sha256:gp-example",
  "gp_revision": "sha256:gp-example",
  "launch_revision": "sha256:launch-example",
  "decay_revision": "sha256:decay-example",
  "tle_revision": "sha256:tle-example",
  "satcat_revision": "sha256:satcat-example",
  "tracked_revision": "sha256:tracked-example",
  "tracked_revision_match": true,
  "datasets": {
    "gp": { "revision": "sha256:gp-example" },
    "launch": { "revision": "sha256:launch-example" },
    "decay": { "revision": "sha256:decay-example" },
    "tle": { "revision": "sha256:tle-example" },
    "satcat": { "revision": "sha256:satcat-example" },
    "tracked": { "revision": "sha256:tracked-example" }
  },
  "dataset_status": {
    "gp": { "interval_hours": 24, "state": "updated", "due": true },
    "tle": { "interval_hours": 24, "state": "updated", "due": true },
    "satcat": { "interval_hours": 24, "state": "updated", "due": true },
    "tracked": { "interval_hours": 24, "state": "updated", "due": true },
    "launches": { "interval_hours": 24, "state": "updated", "due": true },
    "decayed": { "interval_hours": 24, "state": "updated", "due": true },
    "reconciliation": { "interval_hours": 24, "state": "updated", "due": true }
  },
  "retrieval_timestamp": "2026-08-22T00:00:00Z",
  "newest_orbital_epoch": "2026-08-21T22:15:00Z",
  "newest_launch_date": "2026-08-20",
  "newest_confirmed_decay_date": "2026-08-20",
  "tle_count": 0,
  "omm_count": 0,
  "six_digit_id_count": 0,
  "quarantined_count": 0,
  "tracked_current_count": 34960,
  "tracked_metadata_only_count": 54004,
  "tracked_current_metadata_only_count": 18490,
  "last_error": null,
  "last_errors": []
}
```

Counts, times, state, and revision values are illustrative. GP metadata distinguishes configured `source_groups` from `catalog_source_groups`, the groups that produced the accepted bytes; consumers must not interpret an unverified configured scope as catalog provenance. The server `data_revision` is a deterministic digest of GP, compatibility TLE, SATCAT, tracked, launch, and decay revisions and is the preferred connected-browser refresh token. `catalog_revision` remains a compatibility field containing only the GP revision; the six named revision fields and `datasets` expose every component directly. `tracked_pointer_valid`, `tracked_revision_match`, and `tracked_source_revision_match` report closure validity, manifest/metadata revision agreement, and current GP/SATCAT lineage agreement. Any failure degrades catalog health and removes the tracked revision/counts from the usable projection. Dataset sidecar errors survive restart and are merged with current cycle state. Public `last_error`, `last_errors`, `dataset_status`, and nested `last_result` error text is bounded, control-character normalized, and credential-redacted recursively. A scheduled cycle may include bounded candidate phase/result metadata, but never private filesystem paths, pointer contents, or credentials. Static hosting computes its own packaged-file token because it has no scheduler or mutable provider state.

`catalog_state` is `current`, `partial`, `degraded`, `fallback-tle`, or `unavailable`. When GP metadata is absent, a packaged TLE file larger than the empty `[]` sentinel yields `fallback-tle`; if no such artifact exists, the state is `unavailable`. With GP metadata present, normal `current`/`partial`/`degraded` evaluation applies. The fallback status is an artifact-availability signal, not proof that TLE parsing or propagation will succeed. A failed or partial update must preserve last-known-good artifacts and expose a truthful degraded/error state rather than reporting completion or fabricating a new revision.

## Notes

- The frontend can run from the curated static artifact over HTTP and uses its packaged JSON when the Python server is offline.
- The Python server is optional for using the static visualization, but it is required for API access, the live Swagger UI, and live OpenAPI JSON.
- Scheduled provider access is disabled by default. Use `npm run serve:update`, or start `server.py` with `--update-data-on-schedule` and the `--gp-update-interval-hours`, `--tle-update-interval-hours`, `--satcat-update-interval-hours`, `--tracked-update-interval-hours`, and `--reconciliation-interval-hours` controls. All default to daily operation; the legacy `--data-update-interval-hours` supplies the GP/TLE/SATCAT fallback and tracked defaults to the effective SATCAT interval. The server binds before background catch-up, requests each configured GP group at most once, coalesces SATCAT-derived work, derives tracked chunks locally inside one isolated revisioned candidate, validates every required revision pair and tracked closure/current lineage, and only then atomically replaces a private runtime pointer. It retries isolated failures with bounded jittered backoff and requests cooperative cancellation before joining the worker and closing the HTTP server. Checked-in release data is not mutated by scheduled execution.
- Normal GP/TLE cycles are incremental `PARTIAL` upserts. GP reconciliation requires valid, quarantine-free responses from `active`, `fengyun-1c-debris`, `iridium-33-debris`, and `cosmos-2251-debris`; TLE retains its configured compatibility scope. During active-only migration, failed, partial, quarantined, or `304`-only GP responses preserve the last-known-good bytes, remain due, and retry without inherited validators. Only one coherent four-group success may set `source_scope_verified: true`, and `COMPLETE` never means all-debris/provider completeness. For established GP, TLE, and SATCAT catalogs with at least 1,000 records, a full/reconciliation replacement must retain at least 75% candidate size and 75% canonical NORAD overlap. `--force` bypasses freshness only. The explicit direct-command `--allow-large-catalog-shrink` recovery option is unavailable to `maybe-update` and the server. Launch and confirmed-decay history is retained. Accepted `304` revalidation resets due age only for a verified scope without changing bytes/revisions/backups; changed artifacts retain the newest seven collision-safe backups per artifact; failures preserve last-known-good data.
- `/api/gp` remains the Version 2.3.2 position catalog for the atomically selected root. Tracked endpoints are metadata discovery and do not make SATCAT-only objects propagatable. The exact Version 2.3.1 frozen counts remain historical and are not asserted for a future runtime candidate. TLE routes remain temporary compatibility contracts. Numeric and Alpha-5 TLE identifiers are decoded to canonical full strings, but the format remains a reduced subset of current six-digit GP/OMM coverage.
- The tracked endpoint family and equivalent `server.py` static aliases fail closed together with bounded `503 TRACKED_CATALOG_UNAVAILABLE` whenever manifest closure, pointer revisions, or current GP/SATCAT lineage is incoherent. This response is a temporary catalog-integrity state, not permission to serve a partial index; the browser continues with the GP-only path.
- Version 2.3.2 debris facets are client projections over unchanged tracked fields and activate whenever `DEBRIS` is the sole object type and the orbit selection is nonempty; they are not API query parameters. The coverage HUD, virtualized availability views, and Globe/Mercator marker selection are also browser-only projections over these routes. No mass/weight field is inferred. A red marker means authoritative debris type only, not hazard, collision risk, proximity, size, mass, or RCS.
- Repository owner `arcazj` approved exactly one publication of the final post-recording Version 2.3.2 repository source bytes to `origin/master` after the warned pre-approval manifest SHA-256 `c456703d12602e83a73233f693cf684315565436d8c08c645a0b7e5d984d8177`. Before push, authenticated repository configuration changed Pages from legacy branch-root publishing to the manual workflow. The source-only decision does not approve or dispatch a Pages artifact, private runtime candidate, later refresh, or changed byte. Remote Pages deployment/attestation, required-reviewer/self-review settings, named profiles, and independent review remain pending. API availability is not a provider-completeness, scientific-validation, stable-release, or operational claim.
- GitHub Pages and other static hosts cannot run the Python scheduler; a deployment workflow must replace packaged data.
- This Markdown page is intentionally static so Help documentation remains available without the Python server.
- API responses are local development data for visualization and testing, not operational satellite products.
