# OpenBEXI Earth Orbit

Interactive Earth-orbit visualization, tracked-object search and Solar System time exploration. **2.5.1 is a development prerelease, experimental and non-operational.** Public source remains available; new owner-controlled 2.5 material uses commercial licensing.

## Live Demo

[Open the hosted application](https://arcazj.github.io/openbexi_earth_orbit/index.html). The hosted version may differ from this checkout; publishing a GitHub release does not deploy Pages.

## Features

- Globe and Mercator views, orbit filters, search, satellite models, launch and confirmed-decay timelines.
- Tracked inventory separates matches, positioned objects and metadata-only records; missing elements never imply decay.
- One expanded menu section at a time; startup opens **Tracked Objects - Matches**.
- Solar System starts in educational mode with the existing illustrative sizes. Uncheck Educational mode for a bounded JPL-derived Solar System ephemeris, complete orbit guides and physical Sun/planet sizes. Precise playback stays inside its validated dataset; guide coverage does not extend playback.
- Satellite and Solar System views start **Live at 1 sec/s**: one simulated second per real second, following system UTC. Solar System units sit beside Play/Pause: sec/s, min/s, hour/s and day/s, with year/s under Advanced. Pause and reverse remain available. Live follows the clock; data freshness is reported separately.
- A bottom data-health disclosure shows source checks, content ages, partial coverage and update failures. The Python server checks for updates in the background; static hosting uses packaged snapshots.
- Experimental browser and authenticated server close-approach screening. No operational collision-risk or collision-probability claim.

## Images

[![Earth orbit view](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_ex1.png)](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_ex1.png)
[![Starlink view](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_STARLINK.PNG)](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_STARLINK.PNG)
[![OneWeb view](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_ONEWEB.PNG)](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_ONEWEB.PNG)

## Requirements

Node 20–24 with npm 10+, Python 3 (CI uses 3.12), and a modern WebGL 2 browser. CI uses Node 22. See [dependencies](docs/engineering/DEPENDENCIES.md) and [licensing](LICENSE.md) before reuse.

## Quick Start

```powershell
npm ci
npm run serve
# Open http://127.0.0.1:8000/index.html
```

The server starts background maintenance by default and evaluates each source on its own daily clock. Validated candidates are promoted atomically in private runtime storage; repository snapshots stay unchanged. Provider cooldowns, errors and incomplete responses can delay fresh data. Use `node scripts/python.mjs server.py --no-data-update` for offline work.

`npm run build` creates the curated `dist/` app. Serve that directory over HTTP; file URLs are unsupported. Static hosting cannot update providers. See [server setup](docs/engineering/SERVER_DEPLOYMENT.md), [static hosting](docs/engineering/STATIC_DEPLOYMENT.md), and [Solar System Ephemeris](docs/science/SOLAR_SYSTEM.md).

## API

Start the API with `npm run serve` or `py server.py --host 127.0.0.1 --port 8000`.

The server is loopback-only by default. `--allow-public` requires an explicit deployment/security review. Send scoped tokens through `Authorization: Bearer ...`; never place them in URLs, browser storage, source files or logs. See [server configuration](docs/engineering/SERVER_DEPLOYMENT.md).

- [Static Swagger UI](swagger.html)
- [API reference](docs/SWAGGER.md)
- [Rendered API reference](markdown_viewer.html?source=docs/SWAGGER.md&title=Swagger%20API)
- [Live Swagger UI](http://127.0.0.1:8000/docs) - requires the Python server
- [OpenAPI JSON](http://127.0.0.1:8000/openapi.json) - requires the Python server

| Endpoint | Purpose | Authentication |
| --- | --- | --- |
| [`GET /api/health`](http://127.0.0.1:8000/api/health), [`GET /api/version`](http://127.0.0.1:8000/api/version) | Server health and authoritative release metadata | None |
| [`GET /api/gp`](http://127.0.0.1:8000/api/gp), [`GET /api/gp-metadata`](http://127.0.0.1:8000/api/gp-metadata) | Primary GP/OMM catalog and metadata | None |
| [`GET /api/satellites`](http://127.0.0.1:8000/api/satellites) | Preferred GP catalog with legacy TLE fallback | None |
| [`GET /api/tle`](http://127.0.0.1:8000/api/tle) | Deprecated numeric/Alpha-5 TLE compatibility subset; not complete six-digit coverage | None |
| [`GET /api/launches`](http://127.0.0.1:8000/api/launches), [`GET /api/decayed`](http://127.0.0.1:8000/api/decayed) | SATCAT-backed launch events and confirmed decays | None |
| [`GET /api/tracked-objects/manifest`](http://127.0.0.1:8000/api/tracked-objects/manifest), `GET /api/tracked-objects/chunks/{file_name}` | Tracked-object manifest and allowlisted chunks; incoherent pointer, closure, or current GP/SATCAT lineage fails closed with bounded `503 TRACKED_CATALOG_UNAVAILABLE` | None |
| [`GET /api/satellite-metadata`](http://127.0.0.1:8000/api/satellite-metadata), [`GET /api/display-satellite-models`](http://127.0.0.1:8000/api/display-satellite-models) | Satellite metadata and supported model manifest | None |
| [`GET /api/data-update-status`](http://127.0.0.1:8000/api/data-update-status) | Scheduler lifecycle, per-dataset due/status/error fields, six-component data revision, freshness, and reconciliation diagnostics | None |
| `GET /api/v1/health/live`, `/health/ready`, `/capabilities` | Durable-service discovery, readiness, and supported limits | None |
| `GET /api/v1/catalog-revisions`, `/screening-jobs`, `/conjunction-events` | Revision, job, and event queries | Viewer bearer token or higher |
| `POST`, `DELETE`, retry, and replay job routes | Submit, cancel, retry, or replay durable screening jobs | Analyst bearer token or higher; mutating creates/replays require `Idempotency-Key` |
| `GET /api/v1/screening-jobs/{job_id}/stream` | Resumable server-sent job progress | Viewer bearer token or higher; resume with `Last-Event-ID` |

## Tools

Use `tools/satellite_data_tools.py` for maintained data commands and `server.py` for the local service. `npm run serve:update` remains compatible with the default daily scheduler.

Subcommands: `export-gp`, `export-tle`, `refresh-satcat`, `build-launches`, `build-decayed-db`, `build-tracked`, `maybe-update`, `stage-update`, `plan`, `resume-provider`, `import-candidate`, `validate-candidate`, `promote-candidate`. The normal GP/TLE path is incremental; `--all` reconciles the configured scope and does not promise global coverage. See [data maintenance](docs/engineering/DATA_MAINTENANCE.md) for options and failure handling.

`tools/generate_jpl_ephemeris.py` builds bounded JPL tables; `tools/preprocess_star_catalog.py` prepares star data. Performance tools: `npm run benchmark:full-catalog`, `npm run benchmark:v21-service`, `npm run benchmark:v25-browser`. Keep benchmark data and private runtime snapshots out of publications.

## Testing

`npm run check` validates syntax, metadata, documentation, notices, vendors, artifact closure, frozen science and size budgets. `npm test` runs JavaScript, Python and browser suites. See [testing and evidence](docs/TESTING.md) for results and limitations. Software-rendered startup/frame targets remain unmet; independent scientific, security and physical-device qualification remain pending.

## All Project Documentation

[Documentation index](docs/README.md) · [Release notes](docs/RELEASE_NOTES.md) · [Roadmap](ROADMAP.md) · [Prompt history](PROMPT_History.md) · [Contributing](docs/CONTRIBUTING.md) · [Security](docs/SECURITY.md).

## License

[Commercial licensing notice](LICENSE.md): Jean-Christophe Arcaz, [arcazj@gmail.com](mailto:arcazj@gmail.com). New owner-controlled 2.5 material requires a written commercial agreement. Earlier MIT rights and [third-party terms](docs/THIRD_PARTY_NOTICES.md) remain. Public source visibility is intentional.

The app and results are supplied as is, without an accuracy, completeness or timeliness warranty. To the extent permitted by law, the author and OpenBEXI contributors disclaim liability for use of or reliance on inaccurate, incomplete or unavailable results. Independently verify results; do not use this experimental app as the sole basis for operational or safety-critical decisions. The full notice preserves liabilities and statutory rights that cannot lawfully be excluded.
