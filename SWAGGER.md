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
| `GET` | `/api/gp` | Yes | Returns the preferred mixed GP/OMM satellite dataset from `json/gp/GP.json`. |
| `GET` | `/api/gp-metadata` | Yes | Returns the exact preferred-catalog sidecar from `json/gp/GP.meta.json`; returns `404` when it has not been exported. |
| `GET` | `/api/tle` | Yes | Deprecated Version 2.2 compatibility route for `json/tle/TLE.json`; it cannot represent six-digit NORAD identifiers. |
| `GET` | `/api/satellites` | Yes | Generic catalog route that returns preferred GP/OMM with deprecated TLE fallback. |
| `GET` | `/api/launches` | Yes | Returns SATCAT-backed launch events, including details-only records with no propagatable orbit. |
| `GET` | `/api/satellite-metadata` | Yes | Lists available metadata JSON files under `json/satellites/`. |
| `GET` | `/api/satellite-metadata/{file_name}` | Yes | Returns one metadata JSON file by safe file name. |
| `GET` | `/api/display-satellite-models` | Yes | Returns a live manifest of `.glb` and `.obj`/`.mtl` models under `obj/`. |
| `GET` | `/api/decayed` | Yes | Returns confirmed decayed satellite data from `json/decayed/decayed.json`. |
| `GET` | `/api/data-update-status` | Yes | Returns scheduler and catalog health, a composite data revision, compatibility GP revision, per-dataset revisions, freshness/count diagnostics, newest dates, and last error. |
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
  "version": "2.2.0",
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
  "app_version": "2.2.0",
  "api_version": "1.0.0",
  "release_date": null,
  "candidate_date": null,
  "publication_state": "development",
  "release_channel": "development",
  "maturity": "experimental",
  "safety_class": "non-operational",
  "repository": "https://github.com/arcazj/openbexi_earth_orbit",
  "server": "OpenBEXIHTTP/2.2.0"
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
  "retrieval_timestamp": "2026-08-23T01:58:06Z",
  "last_status": "ok",
  "last_error": null,
  "source_status": "COMPLETE",
  "partial_update": false,
  "catalog_revision": "sha256:gp-example",
  "counts": {
    "total": 16400,
    "omm": 16400,
    "tle": 0,
    "six_digit_ids": 331,
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
  "enabled": false,
  "state": "disabled",
  "interval_hours": 24,
  "catalog_state": "current",
  "catalog_source_status": "COMPLETE",
  "data_revision": "sha256:composite-example",
  "catalog_revision": "sha256:gp-example",
  "gp_revision": "sha256:gp-example",
  "launch_revision": "sha256:launch-example",
  "decay_revision": "sha256:decay-example",
  "datasets": {
    "gp": { "revision": "sha256:gp-example" },
    "launch": { "revision": "sha256:launch-example" },
    "decay": { "revision": "sha256:decay-example" }
  },
  "retrieval_timestamp": "2026-08-22T00:00:00Z",
  "newest_orbital_epoch": "2026-08-21T22:15:00Z",
  "newest_launch_date": "2026-08-20",
  "newest_confirmed_decay_date": "2026-08-20",
  "tle_count": 0,
  "omm_count": 0,
  "six_digit_id_count": 0,
  "quarantined_count": 0,
  "last_error": null
}
```

Counts and revision values are illustrative in this static example. `data_revision` is a deterministic digest of the GP, launch, and decay revision values and is the preferred browser refresh token. `catalog_revision` is retained as a compatibility field and contains the GP revision only; `gp_revision`, `launch_revision`, `decay_revision`, and `datasets` expose the components directly.

`catalog_state` is `current`, `partial`, `degraded`, `fallback-tle`, or `unavailable`. When GP metadata is absent, a packaged TLE file larger than the empty `[]` sentinel yields `fallback-tle`; if no such artifact exists, the state is `unavailable`. With GP metadata present, normal `current`/`partial`/`degraded` evaluation applies. The fallback status is an artifact-availability signal, not proof that TLE parsing or propagation will succeed. A failed or partial update must preserve last-known-good artifacts and expose a truthful degraded/error state rather than reporting completion or fabricating a new revision.

## Notes

- The frontend can run from local static files and falls back to repository JSON when the Python server is offline.
- The Python server is optional for using the static visualization, but it is required for API access, the live Swagger UI, and live OpenAPI JSON.
- Scheduled GP/SATCAT/launch/decayed-data updates are disabled by default; start `server.py` with `--update-data-on-schedule` to enable background freshness checks. GP, launch, and confirmed-decay work is due independently, so launch and decay updates may both execute in one scheduler cycle.
- `/api/gp` is the Version 2.2 primary orbital catalog. TLE routes remain temporary compatibility contracts and are not complete beyond the five-digit identifier boundary.
- This Markdown page is intentionally static so Help documentation remains available without the Python server.
- API responses are local development data for visualization and testing, not operational satellite products.
