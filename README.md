# OpenBEXI Earth Orbit

Interactive Earth-orbit visualization, tracked-object search and Solar System time exploration. **Version 2.6.0 was released on November 24, 2026.** The orbital analyses are experimental and non-operational. [Release notes](docs/RELEASE_NOTES.md) · [Downloads and SHA-256 checksums](https://github.com/arcazj/openbexi_earth_orbit/releases/tag/2.6.0)

## Live Demo

[Open the hosted application](https://arcazj.github.io/openbexi_earth_orbit/index.html). The hosted version may differ from this checkout; publishing a GitHub release does not deploy Pages.

## Features

- Globe and Mercator views show positioned spacecraft, orbital paths, launches and confirmed decays. In the globe close-up, **View full orbit** shows the path face-on. **View spacecraft** returns to the selected satellite.
- Open **Browse catalog results** below the UTC clock. Choose **All matches**, **On map** or **Position unavailable**, then type a name, NORAD ID, owner or international designator into **Filter results**. Terms can be combined. For example, `GLONASS-K2 63130` finds COSMOS 2584 in the bundled MEO payload catalog. **Clear** restores the current tab and sort order.
- **Satellite Model Viewer** starts collapsed above **Catalog data** in the right panel. Expand it to rotate the selected spacecraft or open the full viewer. **OMM details** starts closed on each selection. **Tracked record summary** contains coverage, counts and the map legend.
- Expand **REST API** below **Timelines** for the offline endpoint reference and OpenAPI schema. With the local Python server running, scripts can search tracked objects, read their current orbital elements and download a shared spacecraft model. [Catalog API walkthrough](docs/SWAGGER.md#catalog-and-models)
- In the Satellite Model Viewer, choose current or historical LEO, MEO or GEO spacecraft and search by name or NORAD ID. Spacecraft with the same exterior share a model. **Model Diagnostics** shows the reference basis and estimated dimensions when available. [Open the Satellite Model Viewer](display_satellite.html)
- Horizons 3e (NORAD 43633) has aft and Earth-facing inspection views. Its Wavefront package includes the geometry in metres, materials, textures and source notes. [Inspect the aft deck](display_satellite.html?norad=43633&detail=aft) · [Download the Horizons 3e OBJ package](obj/exports/horizons-3e.zip)
- **Show Earth** places the spacecraft in front of a metre-scale WGS84 globe. Enter a NORAD ID and press Enter to use its published TLE. The viewer shows the UTC, latitude, longitude and altitude. A link with an `at` UTC parameter opens a fixed instant. Unidentified models show a labeled reference altitude. [Open Intelsat 10-02 with Earth behind it](display_satellite.html?norad=28358&earth=1)
- **Compare with** opens a close-up of the primary spacecraft against true-scale Earth. **TLE positions** gives each independent orbit’s latitude, longitude and WGS84 altitude at the displayed UTC. **Orbit details** lists the element epochs. If a documented MEV pair’s published positions differ by more than 1 km, the comparison shows both independent orbits. Click a distant secondary’s locator to visit it or choose **Back to primary**. The locator and the panel report when Earth blocks the view.
- **View full orbit** frames both positions and their straight-line separation. **Show Orbit** adds one revolution for each spacecraft, with a solid or dashed path and a named legend. A documented docked pair stays together as one model assembly and shares one orbit. **Copy snapshot link** saves the camera, zoom, UTC, Earth and orbit settings, and the TLEs used for the comparison. [Compare Intelsat 10-02 and Astra 3B](display_satellite.html?norad=28358&compare=36581&view=overview&orbits=1&at=2026-11-24T12%3A00%3A00Z)
- Search for `63724` to inspect a production Kuiper spacecraft, `58013` for a Protoflight satellite, or `33275` for AMC-21. The Kuiper models use Amazon flight imagery. AMC-21 shows the two 2.3 m reflectors and four panels per solar wing specified by its manufacturer. [Spacecraft model references](docs/THIRD_PARTY_NOTICES.md)
- One expanded menu section at a time; startup opens **Tracked Objects - Matches**.
- Solar System starts in educational mode with the existing illustrative sizes. Uncheck Educational mode for a bounded JPL-derived Solar System ephemeris, complete orbit guides and physical Sun/planet sizes. Precise playback stays inside its validated dataset; guide coverage does not extend playback.
- Satellite and Solar System views start **Live at 1 sec/s**: one simulated second per real second, following system UTC. Solar System units sit beside Play/Pause: sec/s, min/s, hour/s and day/s, with year/s under Advanced. Pause and reverse remain available. Live follows the clock; data freshness is reported separately.
- A bottom data-health disclosure shows source checks, content ages, partial coverage and update failures. The Python server checks for updates in the background; static hosting uses packaged snapshots.
- Experimental browser and authenticated server close-approach screening. No operational collision-risk or collision-probability claim.

## Images

These screenshots show earlier Earth, Starlink and OneWeb views. The catalog controls described above are from 2.6.0.

[![Earth orbit view](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_ex1.png)](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_ex1.png)
[![Starlink view](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_STARLINK.PNG)](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_STARLINK.PNG)
[![OneWeb view](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_ONEWEB.PNG)](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_ONEWEB.PNG)

## Requirements

Use Node 20.19+, 22.13+ or 24.x with npm 10+, Python 3 (CI uses 3.12), and a modern WebGL 2 browser. CI uses Node 22. See [dependencies](docs/engineering/DEPENDENCIES.md) and [licensing](LICENSE.md) before reuse.

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

`tools/build_orbit_models.py` regenerates shared fleet meshes, the display manifest and the NORAD-to-model index. The model references and regeneration commands are in the [model notices](docs/THIRD_PARTY_NOTICES.md).

`tools/generate_jpl_ephemeris.py` builds bounded JPL tables; `tools/preprocess_star_catalog.py` prepares star data. Performance tools: `npm run benchmark:full-catalog`, `npm run benchmark:v21-service`, `npm run benchmark:v25-browser`. Keep benchmark data and private runtime snapshots out of publications.

## Testing

`npm run check` validates syntax, metadata, documentation, notices, vendors, artifact closure, frozen science and size budgets. `npm test` runs JavaScript, Python and browser suites. See [testing and evidence](docs/TESTING.md) for results and limitations. Software-rendered startup/frame targets remain unmet; independent scientific, security and physical-device qualification remain pending.

## All Project Documentation

[Documentation index](docs/README.md) · [Release notes](docs/RELEASE_NOTES.md) · [Roadmap](ROADMAP.md) · [Prompt history](PROMPT_History.md) · [Contributing](docs/CONTRIBUTING.md) · [Security](docs/SECURITY.md).

## License

The commercial notice introduced in 2.5 applies to new owner-controlled material after the 2.4.0 baseline. Contact Jean-Christophe Arcaz for a written commercial agreement. Earlier MIT grants and asset-specific terms continue to apply. [License](LICENSE.md) · [Licensing contact](mailto:arcazj@gmail.com) · [Third-party notices](docs/THIRD_PARTY_NOTICES.md)

The app and results are supplied as is, without an accuracy, completeness or timeliness warranty. To the extent permitted by law, the author and OpenBEXI contributors disclaim liability for use of or reliance on inaccurate, incomplete or unavailable results. Independently verify results; do not use this experimental app as the sole basis for operational or safety-critical decisions. The full notice preserves liabilities and statutory rights that cannot lawfully be excluded.
