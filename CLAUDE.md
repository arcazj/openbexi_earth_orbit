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

Python-backed npm commands share `scripts/python-discovery.mjs`: `OPENBEXI_PYTHON_COMMAND` is tried first, followed by `py -3` on Windows, `python3`, `python`, and recognized installed Windows Python directories. Only Python 3 is accepted. `npm run test:browser` reuses an existing healthy loopback server on `OPENBEXI_TEST_PORT` when one is available; otherwise its lifecycle runner starts Python directly and terminates only the server child it created.

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
npm run serve:update
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
py tools/satellite_data_tools.py export-gp --dry-run
py tools/satellite_data_tools.py export-gp --force
py tools/satellite_data_tools.py export-tle --dry-run
py tools/satellite_data_tools.py export-tle --all
py tools/satellite_data_tools.py build-launches --dry-run
py tools/satellite_data_tools.py build-decayed-db --all
py tools/satellite_data_tools.py build-decayed-db --refresh-satcat --force
py tools/satellite_data_tools.py maybe-update --dry-run --interval-hours 24 --reconciliation-interval-hours 24
```

`export-gp` is primary in Version 2.2. `export-tle` is deprecated compatibility coverage. Numeric and Space-Track Alpha-5 fields are decoded to canonical full NORAD strings, but TLE remains an incomplete subset of current six-digit GP/OMM coverage.

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

`js/simulationClock.js` owns the browser simulation instant and signed rate. Advance it once per animation frame, mirror its state into the reused `SIM_DATE`, and make every time-dependent visualization consume that instant. Solar System mode applies the finite bundled ephemeris bounds and pauses at a reached boundary; never extrapolate JPL-derived positions. `js/orbit/satelliteMotionInterpolator.js` is a display scheduler: the selected object uses an exact SGP4 state at each simulation frame, while other filter-visible objects may use Hermite interpolation between asynchronously sampled SGP4 states under an orbit-period-fraction window cap. Treat filter eligibility and current-epoch render readiness separately; a newly materialized per-record `Object3D` state/selection proxy starts hidden, and filter re-admission after a paused UTC jump stays hidden until a finite sample covering that instant commits. The Globe renders ready proxies through one batched `THREE.Points` layer: retain the local icon texture through 1,000 drawn markers and use compact per-marker colors above that threshold. On replacement, dispose point geometry/material; dispose its source material/texture only when `openbexiOwned` marks loader ownership, never when injected/shared. Cancel superseded sampling jobs on rate/selection changes without hiding valid in-window interpolation. Expose cadence-limited coverage at high warp rather than stretching the window silently. Hide invalid propagation instead of displaying a stale/Earth-center marker, retry with bounded backoff, and restore only after finite recovery under the current filters. Do not reset the selected retry deadline on every frame; corrected propagation must be able to recover at the unchanged simulation instant after backoff. Mercator consumes the same display positions; it does not start another catalog propagation pass. Above 1,000 drawable records it uses one compact density path plus the detailed selected marker and skips per-object icons, sorting, and non-selected labels. A failed selected-track rebuild clears the prior cached path and records the attempted satellite/instant so a redraw loop cannot retry it continuously. Interpolated scene positions must never enter screening, exports, provenance, or scientific result calculation.

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
| `js/orbit/satelliteMotionInterpolator.js` | Exact selected-object display state plus bounded asynchronous sampling, Hermite interpolation, and invalid-propagation retry/recovery for other visible satellites |
| `js/simulationClock.js` | Single signed simulation instant/rate, frame-gap cap, and optional ephemeris bounds |
| `js/conjunction/conjunctionScreening.js` | Broad-phase admission and bounded TCA refinement |
| `js/conjunction/conjunctionWorker*.js` | Worker execution, protocol, progress, cancellation, and supersession |
| `js/conjunction/fullCatalogScreening.js` | Server-run time-slab spatial broad phase and bounded full-catalog refinement |
| `js/conjunction/fullCatalogClient.js` | Browser capability, authenticated job/SSE, polling, cancellation, and event client |
| `js/conjunction/conjunctionPanel.js` | Close Approaches controls, progress, sorting/filtering, details, and export |
| `js/conjunction/conjunctionVisualization.js` | Selected-event geometry and synchronized playback around TCA |
| `js/sceneFrame.js` | Canonical visualization transforms, GMST, WGS84, Web Mercator, and framing math |
| `js/satelliteTLELoader.js` | Mixed GP/OMM and legacy TLE loading, MEO-first chunk publication, per-record state proxies, density-aware batched Globe points, bounded in-place selected-orbit refresh, and optional validated server revision refresh |
| `js/satelliteCategoryFilter.js` | Unified orbit/object category normalization, debris precedence, `HRO` alias handling, and union matching |
| `js/SatelliteMenuLoader.js` | Left-menu accordion, selector, filters, and workflow controls |
| `js/satelliteModelResolver.js` | Satellite name to local OBJ/MTL or GLB mapping |
| `js/satelliteModelLoader.js` | Three.js model loading, centering, orientation, and lighting |
| `js/mercatorMapLoader.js` | 2D Mercator view using shared display positions, detailed and dense rendering paths, bounded labels, and selected-track caching with stale-path clearing and failed-instant suppression |
| `js/solarSystemOverviewLoader.js` | Integrated Solar System view |
| `js/solarSystemEphemeris.js` | Local JPL-derived ephemeris interpolation, finite range discovery, and boundary clamping |
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
- `json/gp/GP.json` and its metadata: preferred Version 2.2 mixed GP/OMM catalog plus retrieval/quality and compatibility-tag-enrichment revisions/counts.
- `json/tle/TLE.json` and `json/tle/TLE.meta.json`: deprecated Version 2.2 numeric/Alpha-5 compatibility subset; temporarily used only for exact-NORAD group/tag enrichment and reduced-coverage fallback, never preferred orbital state.
- SATCAT-backed launch data and `json/decayed/decayed.json`: lifecycle-event datasets independent of orbit availability.
- `json/satellites/*.json`: satellite metadata and model configuration.
- `json/decayed/decayed.json`: confirmed decayed-object data.
- `validation/v2.0.0/`: scientific fixture manifest and checksums.
- `validation/v2.1.0/`: development full-catalog executable evidence, checksums, and named-machine benchmark; review remains pending.
- `validation/v2.2.0/`: archived Version 2.2.0 development evidence and immutable sidecar.
- `validation/v2.2.1/`: current checksum-bound Version 2.2.1 development evidence; independent review remains pending.
- `release/evidence/openbexi-node-sbom-2.1.0-development.cdx.json`, `release/evidence/openbexi-node-sbom-2.2.0-development.cdx.json`, and `release/evidence/openbexi-node-sbom-2.2.1-development.cdx.json`: archived and current dependency evidence; checksum-bound promotion evidence remains open.
- `data/ephemeris/solar_system_jpl_horizons_2020_2035_6h.json`: local JPL-derived visualization ephemeris.
- `vendor/`: exact browser dependencies, integrity manifests, and license files.
- `obj/`: local GLB and OBJ/MTL model assets.

## Development Rules

- Change release identity in `release/version.json`, run `npm run version:sync`, and verify with `npm run check:version`. `PROMPT_History.md` is historical context, not a runtime version source.
- Treat the v2.0, v2.1, and v2.2 engineering checklists as separate open gates. Later development authorization never promotes an earlier version. `Test_and_Integration.md` preserves the historical regression record and current v2.2 integration matrix.
- Keep the current release boundary: Version 2.2.1 is development, Experimental, and non-operational, with no candidate/release date. Its authorization covers GP/OMM/lifecycle continuity, the bounded filtering/details/layering/time/motion browser follow-up, and opt-in daily server maintenance; Pc/CDM/covariance, alerts, reports, and maneuver recommendations remain unauthorized.
- Add or update deterministic tests for every behavioral change. `npm run test:unit` auto-discovers `tests/*.test.js`; Python and browser suites run separately or through `npm test`.
- Preserve the single-node durable contract: SQLite is the queue/source of truth; all worker mutations require current attempt and worker ownership; result imports are atomic and checksum bound; static mode must remain functional.
- Namespace persisted event-revision IDs by job/attempt while retaining engine event identity. Completed replay must create distinct immutable rows rather than collide with or overwrite the original job.
- Preserve catalog privacy and lifecycle semantics: API responses strip private artifact paths; normal GP/TLE updates are incremental `PARTIAL` upserts, while only a structurally valid complete `active` reconciliation may prune that active set and record `COMPLETE`. Launch and confirmed-decay history is never pruned by a later SATCAT omission. Coalesce SATCAT-derived work into one request per scheduler cycle. Successful GP, compatibility TLE, SATCAT, launch, or decay promotion changes the server composite `data_revision`, while `catalog_revision` remains GP-only compatibility. Conditional, byte-identical, failed, or rejected updates keep data bytes/revisions and last-known-good artifacts stable; metadata may record the check. Never synthesize TLE or truncate identifiers. Decode explicit Alpha-5 TLE fields to canonical full strings, but do not treat that compatibility subset as complete six-digit coverage. GP group/tag enrichment may join only by the complete canonical NORAD string and must record its compatibility source/tag-map revisions and match counts.
- Preserve the production-scale replacement guard for GP, TLE, and SATCAT: once the prior catalog has at least 1,000 records, full/reconciliation candidates need both 75% size and 75% canonical NORAD overlap. `--force` never bypasses it. Keep `--allow-large-catalog-shrink` confined to reviewed direct `export-gp`, `export-tle`, and `refresh-satcat` recovery; do not add it to `maybe-update` or server arguments. Keep collision-safe backups at the newest seven per changed artifact, treat accepted `304` revalidation as successful freshness that resets due age without byte/revision/backup churn, and preserve restart-persistent, recursively redacted status errors for GP/TLE/SATCAT/launch/decay including nested results.
- Keep scheduled provider access explicit: `npm run serve` is offline/default, `npm run serve:update` opts into daily GP/TLE/SATCAT update and complete reconciliation, and `--no-data-update` wins. Preserve per-dataset status, bounded retry/backoff, stale-lock recovery, background startup after bind, and worker shutdown before HTTP close. Static hosting, including GitHub Pages, cannot run this scheduler.
- Keep capability discovery synchronized with server validation defaults and structured configuration limits. The browser must retain explicit Experimental/non-operational/Pc-unavailable wording and show partial coverage/unscreened interval counts.
- Do not persist browser bearer tokens. Use authorization headers for JSON and SSE, never URL/query tokens. Do not pass API/provider secrets to the screening subprocess.
- An adapter is not an admitted provider. Update `docs/governance/DATA_SOURCES.md` before using a new source, including license, access, retention, redistribution, integrity, cadence, and fallback.
- Browser startup or rendering changes require a nonblank-canvas check plus page-error, console-error, request-failure, and unintended-external-request inspection.
- Keep one category state for menu buttons, visibility, count, search, and share restore. The UI label `HRO` maps to domain `HEO`; authoritative debris/rocket-body object type takes precedence over orbit class, and the fresh state begins at `MEO` without changing explicit shared state. A filter change that excludes the selected object clears selection, model/detail, and show-only state coherently. Full-catalog discovery belongs to the visible search; keep the hidden compatibility selector virtualized to `None` plus the active NORAD.
- Do not add a second simulation accumulator or restore staggered sprite snapping. Materialize the fresh default MEO population first, but never expose a state proxy in the batched point layer at its construction/origin position or from an old epoch after filter re-admission: filter eligibility and current-epoch finite-position render readiness are separate. Keep one stable proxy per record and one Globe `THREE.Points` layer; do not restore individual rendered sprites/material clones. Catalog replacement and discontinuous time invalidate stale positions; selection, rate-direction, and job changes cancel superseded sampling while preserving usable in-window interpolation. Selected orientation, footprint, orbit, and detail consumers reuse the exact selected propagation state. Mercator reuses the shared motion pass, switches above 1,000 drawable records to the compact density path plus selected marker, caps track/redraw work, clears a stale track after failed rebuilding, and selected-orbit refresh updates existing geometry at bounded cadence rather than rebuilding every animation frame.
- Keep `obj/SSL_1300.glb` as the single canonical SSL 1300 model. Do not restore the removed byte-identical `obj/loral.glb` copy or another duplicate payload; model aliases belong in metadata/resolution logic, not duplicate assets.
- Keep dependency locks, vendored files, integrity metadata, license records, SBOM, and delivery documentation synchronized.
- Preserve unrelated worktree changes and do not delete user files merely because they are generated or untracked.
