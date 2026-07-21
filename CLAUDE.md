# CLAUDE.md

This file provides repository guidance for Claude Code and other coding agents working on OpenBEXI Earth Orbit.

## Commands

Install the locked dependency graph:

```powershell
npm ci
```

Run the complete policy/build checks and test suites:

```powershell
npm run check
npm test
```

Run focused suites when iterating:

```powershell
npm run test:unit
npm run test:python
npm run test:browser
npm run benchmark:full-catalog -- --output artifacts/full-catalog-benchmark.json
npm run benchmark:v21-service -- --output artifacts/v21-service-benchmark.json
```

Supply-chain and static-artifact commands:

```powershell
npm run audit:dependencies
npm run sbom
npm run build
py -m http.server 8001 --bind 127.0.0.1 --directory dist
```

Serve the source application with the optional Python API:

```powershell
npm run serve
# http://127.0.0.1:8000/index.html
```

The v2.1 full-catalog workspace requires at least one configured token; job submission requires an analyst or administrator token. Values must be unique and at least 24 characters. `server.py` reads the process environment and does not load `.env.example`:

```powershell
$env:OPENBEXI_API_VIEWER_TOKEN = "replace-with-an-independent-random-viewer-token"
$env:OPENBEXI_API_ANALYST_TOKEN = "replace-with-an-independent-random-analyst-token"
$env:OPENBEXI_API_ADMIN_TOKEN = "replace-with-an-independent-random-admin-token"
npm run serve
```

Use `--no-v21-service` for the legacy/static API boundary. Keep `runtime/`, tokens, cursor secrets, database files, and runner artifacts private and uncommitted.

For static source hosting without API routes:

```powershell
py -m http.server 8000 --bind 127.0.0.1
```

Data maintenance:

```powershell
py tools/satellite_data_tools.py export-tle --dry-run
py tools/satellite_data_tools.py export-tle --all
py tools/satellite_data_tools.py build-decayed-db --all
py tools/satellite_data_tools.py build-decayed-db --refresh-satcat --force
```

For startup performance diagnostics, open `http://127.0.0.1:8000/index.html?perf=1`, then run:

```javascript
window.openbexiStartupPerformance.summary()
```

## Architecture

### Runtime and deployment

The source application is plain HTML, CSS, and browser ES modules. There is no JavaScript bundler, but `npm run build` creates the curated deterministic `dist/` artifact defined by `release/static-artifact.json`.

`js/dependencyBootstrap.js` prefers exact integrity-checked Three.js and satellite.js files under `vendor/`. Source/server mode can use exact-version CDN URLs only as an explicit fallback. The generated static artifact is packaged-only, same-origin-only, and must not execute remote runtime code. Never use `file://`; modules, Workers, JSON, textures, and models require HTTP.

### Coordinate and scientific boundaries

Visualization positions use an Earth-centered frame with Three.js Y/Z axes swapped:

```text
scene = (orbital.x, orbital.z, orbital.y) * KM_TO_SCENE_UNITS
```

Earth remains at `(0, 0, 0)`. ECF visualization geometry is rotated about scene Y by `-GMST`. Reusable visualization coordinate, orientation, and framing math belongs in `js/sceneFrame.js`; shared scale constants belong in `js/SatelliteConstantLoader.js`.

Conjunction calculations do not use scene coordinates. They propagate both objects at the same UTC instant and compare raw satellite.js/SGP4 TEME position and velocity states in kilometers and kilometers per second. Keep frame, time, units, provenance, element age, and algorithm version explicit. Never infer physical encounters from orbit lines, sprites, camera state, or scene scale.

Version 2.0 browser screening and Version 2.1 durable screening are `Experimental` and non-operational. They report geometric TCA, miss distance, and relative velocity. Collision probability is unavailable without validated covariance and hard-body-radius inputs. Do not present either workflow as operational collision prediction, maneuver advice, or complete catalog coverage.

Version 2.1 full-catalog screening requires UTC and a common TEME frame. OMM is eligible only under the explicit SGP4/UTC/TEME contract. OEM/provider tables can be parsed and interpolated in supported explicit frames, but the runner rejects non-TEME selected records and performs no frame/time conversion. A `SUCCEEDED` job can contain a `PARTIAL` scientific result; always preserve errors, unscreened intervals, motion-bound violations, caps, source status, and quality flags.

### Key browser modules

| Module | Role |
|---|---|
| `js/dependencyBootstrap.js` | Local-first dependency resolution, module-graph completion, and retryable startup failure state |
| `js/domain/contracts.js` | Versioned orbital and conjunction data contracts |
| `js/domain/catalogValidation.js` | Strict catalog validation, quarantine, provenance, and quality summary |
| `js/domain/objectIdentity.js` | Stable object identity and identifier evidence |
| `js/domain/orbitalPolicy.js` | Time, frame, maturity, and screening policy metadata |
| `js/domain/v21Contracts.js` | Versioned full-catalog source, scope, configuration, and job-state contracts |
| `js/domain/catalogLifecycle.js` | Deterministic observation and lifecycle reconciliation |
| `js/domain/orbitalSourceAdapters.js` | Bounded TLE, OMM, OEM, provider-ephemeris, provenance, and SATCAT adapters |
| `js/orbit/propagationService.js` | Pure satellite.js/SGP4 TEME propagation service |
| `js/orbit/multiFormatPropagationService.js` | OMM SGP4 dispatch and bounded tabulated interpolation without conversion/extrapolation |
| `js/conjunction/conjunctionScreening.js` | Broad-phase admission and bounded TCA refinement |
| `js/conjunction/conjunctionWorker*.js` | Worker execution, protocol, progress, cancellation, and supersession |
| `js/conjunction/fullCatalogScreening.js` | Server-run time-slab spatial broad phase and bounded full-catalog refinement |
| `js/conjunction/fullCatalogClient.js` | Browser capability, authenticated job/SSE, polling, cancellation, and event client |
| `js/conjunction/conjunctionPanel.js` | Close Approaches controls, progress, sorting/filtering, details, and export |
| `js/conjunction/conjunctionVisualization.js` | Selected-event geometry and synchronized playback around TCA |
| `js/sceneFrame.js` | Canonical visualization transforms, GMST, WGS84, Web Mercator, and framing math |
| `js/satelliteTLELoader.js` | Static-first catalog loading with optional validated server refresh |
| `js/SatelliteMenuLoader.js` | Left-menu accordion, selector, filters, and workflow controls |
| `js/satelliteModelResolver.js` | Satellite name to local OBJ/MTL or GLB mapping |
| `js/satelliteModelLoader.js` | Three.js model loading, centering, orientation, and lighting |
| `js/mercatorMapLoader.js` | 2D Mercator view, ground tracks, footprints, and day/night |
| `js/solarSystemOverviewLoader.js` | Integrated Solar System view |
| `js/solarSystemEphemeris.js` | Local JPL-derived ephemeris interpolation |
| `js/serverConnection.js` | Optional Python API health check and data routing |
| `js/ganttTimelineLoader.js` / `js/reentryTimeline.js` | Launch and re-entry timelines |
| `js/startupPerformance.js` | Startup timing and deferred/chunked-work scheduling |
| `js/decayPredictor.js` | Bounded decay estimates for likely candidates |
| `js/shareState.js` | URL share-state serialization and restore |

### Entry points and services

- `index.html`: main application and integration point.
- `display_satellite.html`: isolated manifest-backed OBJ/MTL and GLB model viewer.
- `SolarSystemOverview.html`: standalone Solar System diagnostic page.
- `Earth_Stars_MilkyWay.html`: standalone star and Milky Way viewer.
- `markdown_viewer.html`: static Markdown renderer used by Help.
- `swagger.html`: local static Swagger/OpenAPI page.
- `server.py`: optional Python standard-library static/API server with explicit runtime allowlists.
- `services/v21/job_store.py`: SQLite WAL catalog/job/attempt/candidate/event/error/outbox/audit persistence and migrations.
- `services/v21/job_manager.py`: one-at-a-time subprocess supervision, cancellation, timeout, retry, checksum import, and restart recovery.
- `services/v21/api.py` / `http_api.py`: role authorization, rate limits, signed cursors, structured problems, `/api/v1`, and SSE.
- `scripts/run-full-catalog-screening.mjs`: isolated immutable-input runner.
- `scripts/benchmark-full-catalog.mjs`: named-environment development measurement driver.
- `tools/benchmark_v21_service.py`: real loopback API/store/worker/persistence benchmark with a disposable private runtime.

### Data and release sources

- `release/version.json`: authoritative product version, channel, publication state, maturity, and safety class.
- `release/feature-flags.json`: auditable feature flags.
- `release/static-artifact.json`: static publication allowlist and rewrite contract.
- `json/tle/TLE.json` and `json/tle/TLE.meta.json`: packaged catalog and retrieval/quality metadata.
- `json/satellites/*.json`: satellite metadata and model configuration.
- `json/decayed/decayed.json`: confirmed decayed-object data.
- `validation/v2.0.0/`: scientific fixture manifest and checksums.
- `validation/v2.1.0/`: development full-catalog executable evidence, checksums, and named-machine benchmark; review remains pending.
- `release/evidence/openbexi-node-sbom-2.1.0-development.cdx.json`: current development CycloneDX SBOM.
- `data/ephemeris/solar_system_jpl_horizons_2020_2035_6h.json`: local JPL-derived visualization ephemeris.
- `vendor/`: exact browser dependencies, integrity manifests, and license files.
- `obj/`: local GLB and OBJ/MTL model assets.

## Development Rules

- Change release identity in `release/version.json`, run `npm run version:sync`, and verify with `npm run check:version`. `PROMPT_History.md` is historical context, not a runtime version source.
- Treat `docs/engineering/RELEASE_CHECKLIST.md` and `docs/engineering/RELEASE_CHECKLIST_V2_1.md` as separate open gates. Version 2.1 authorization did not promote v2.0. `Test_and_Integration.md` preserves the historical regression record through Version 1.7.6.
- Keep the current release boundary: Version 2.1.0 is development, Experimental, and non-operational, with no candidate/release date. Do not begin v2.2, Pc/CDM/covariance, alerts, or maneuver recommendations without separate explicit approval and validation inputs.
- Add or update deterministic tests for every behavioral change. `npm run test:unit` auto-discovers `tests/*.test.js`; Python and browser suites run separately or through `npm test`.
- Preserve the single-node durable contract: SQLite is the queue/source of truth; all worker mutations require current attempt and worker ownership; result imports are atomic and checksum bound; static mode must remain functional.
- Namespace persisted event-revision IDs by job/attempt while retaining engine event identity. Completed replay must create distinct immutable rows rather than collide with or overwrite the original job.
- Preserve catalog privacy and lifecycle semantics: API responses strip private artifact paths; only a successful explicit full (`mode=all`) snapshot may reconcile `ABSENT`; current bundled and scheduled incremental snapshots are `PARTIAL` and may not. Startup and successful scheduled TLE refreshes still register new immutable revisions.
- Keep capability discovery synchronized with server validation defaults and structured configuration limits. The browser must retain explicit Experimental/non-operational/Pc-unavailable wording and show partial coverage/unscreened interval counts.
- Do not persist browser bearer tokens. Use authorization headers for JSON and SSE, never URL/query tokens. Do not pass API/provider secrets to the screening subprocess.
- An adapter is not an admitted provider. Update `docs/governance/DATA_SOURCES.md` before using a new source, including license, access, retention, redistribution, integrity, cadence, and fallback.
- Browser startup or rendering changes require a nonblank-canvas check plus page-error, console-error, request-failure, and unintended-external-request inspection.
- Keep dependency locks, vendored files, integrity metadata, license records, SBOM, and delivery documentation synchronized.
- Preserve unrelated worktree changes and do not delete user files merely because they are generated or untracked.
