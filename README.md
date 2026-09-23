# OpenBEXI Earth Orbit

OpenBEXI Earth Orbit is an interactive browser application for exploring Earth-orbiting objects, launch and re-entry events, propagated trajectories, and experimental conjunction-screening results. It uses CelesTrak GP/OMM for propagated positions, a SATCAT-derived tracked-object inventory for searchable metadata coverage, and a reduced-coverage TLE compatibility path.

> **Status:** Version `2.3.2` is a development build, not a release candidate or release. Its scientific maturity is **Experimental** and its safety class is **non-operational**. Do not use it for navigation, mission planning, collision avoidance, or safety decisions; collision probability is unavailable.

## Live Demo

[Launch OpenBEXI Earth Orbit](https://arcazj.github.io/openbexi_earth_orbit/index.html)

The live demo is a separately deployed Pages artifact and may remain on the approved Version 2.3.1 artifact. Repository owner `arcazj` approved exactly one publication of the final post-recording Version 2.3.2 source bytes to `origin/master`; that source-only approval does not dispatch or approve a Pages deployment. Before the source push, the authenticated GitHub Pages API changed the repository from legacy branch-root publishing to the manual workflow. Version 2.3.2 remains Experimental, non-operational, and in development publication state; manual artifact deployment, remote-byte attestation, and required-reviewer/self-review environment settings remain pending. Authenticated durable full-catalog jobs and revisioned scheduled data candidates require the optional local Python server.

## Features

- Search every accepted record in the bundled SATCAT snapshot, with current objects shown by default and historical/decayed records available by explicit opt-in, including payloads, debris, rocket bodies, unknown objects, and entries with small or missing radar cross-section.
- Plot only objects with validated current GP/OMM elements on the interactive 3D Earth globe or 2D Mercator map; metadata-only objects never receive synthetic positions. For 0 through 499 drawn objects, the Globe uses the bundled same-origin `icons/ob_satellite.png` alpha silhouette at a fixed 16 screen pixels and tints it by object type or selection; from 500 upward it uses compact perspective-attenuated density points. Positioned debris is red, and red identifies object type only, not risk, proximity, size, mass, or radar cross-section.
- Load mixed GP/OMM and legacy TLE elements without truncating six-digit NORAD identifiers.
- Combine independent orbit, object-type, history, and tag filters. Whenever `Debris` is the sole object type, narrow any selected orbit scope by position availability, reported RCS, owner/country, launch year, launch site, provider status, and designator/tag, with separate matched, positioned, and metadata-only counts. No mass or weight filter is offered because the admitted data does not supply authoritative mass.
- Keep matched, positioned, and position-unavailable coverage visible beside the globe, then browse a virtualized, sortable result set with All matches, On map, and Position unavailable views.
- Search by tracked-object name, NORAD ID, orbit class, or tag, select positioned objects directly from the Globe or Mercator map, and inspect consolidated object and orbital-element details.
- Display selected trajectories, footprints, ground tracks, day/night lighting, detailed models, and observer-oriented views.
- Move forward, pause, or reverse one shared simulation clock for tracked objects and the Solar System view.
- Explore launch and confirmed or predicted re-entry timelines that refresh when their data revisions change.
- Add stars, the Milky Way, Moon, Mars, and a bounded JPL-derived Solar System ephemeris to the scene.
- Run Experimental selected-object screening in the browser or optional authenticated full-catalog jobs through the local service; selected-object summaries and exports disclose how many current tracked records were excluded because they lack current elements.
- Share a reproducible view and run either as a curated static artifact or with the local API server. Opt-in server refreshes validate isolated private candidates before one atomic runtime-pointer promotion and do not rewrite the checked-in publication data.

## Images

[![OpenBEXI Earth Orbit globe with reference stars and launch timeline](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_ex1.png)](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_ex1.png)

*Main globe view with the star field and launch timeline.*

[![Starlink satellites around Earth with the Mercator map inset](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_STARLINK.PNG)](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_STARLINK.PNG)

*Starlink example across the 3D globe and 2D Mercator view.*

[![OneWeb constellation selected around Earth](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_ONEWEB.PNG)](https://arcazj.github.io/openbexi_earth_orbit/images/openbexi_earth_orbit_ONEWEB.PNG)

*OneWeb constellation filtered in the 3D globe.*

## Requirements

- A modern browser with ES modules, module Workers, WebGL 2, `fetch`, and `crypto.subtle`; hardware acceleration is recommended.
- Node.js `>=20 <25` and npm `>=10` for installation, checks, tests, benchmarks, and static builds. Node.js 22 is recommended.
- Python 3 for the local API server, Python tools, Python tests, and the managed browser-test server.

The public Live Demo requires no local installation. Do not open the source application with `file://`; modules, JSON, textures, and models require HTTP serving.

## Quick Start

Install the locked dependencies and start the loopback application/API server:

```powershell
npm ci
npm run serve
```

Open [http://127.0.0.1:8000/index.html](http://127.0.0.1:8000/index.html).

To build and inspect the curated static artifact instead:

```powershell
npm run build
node scripts/python.mjs -m http.server 8001 --bind 127.0.0.1 --directory dist
```

Open [http://127.0.0.1:8001/index.html](http://127.0.0.1:8001/index.html). Publish only the contents of `dist/`; see [Static Deployment](docs/engineering/STATIC_DEPLOYMENT.md) and [Pages Deployment](release/PAGES_DEPLOYMENT.md). One exact final Version 2.3.2 `origin/master` source publication is approved. A separate Pages deployment still requires a clean confirmed commit, exact artifact and remote-byte attestations, the manual workflow, and its own deployment decision; later changed source or data bytes require renewed approval.

## API

Start the API with `npm run serve` or `py server.py --host 127.0.0.1 --port 8000`.

- [Static Swagger UI](swagger.html)
- [API reference](SWAGGER.md)
- [Rendered API reference](markdown_viewer.html?source=SWAGGER.md&title=Swagger%20API)
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

The tracked manifest, metadata, every referenced chunk, and their current GP/SATCAT source revisions must form one coherent publication before either the tracked API routes or the equivalent `server.py` static aliases serve them. Data routes resolve through one atomically promoted private candidate when a verified pointer exists; the repository data remains the immutable fallback. The private data plane serializes candidate writers with one persistent lock file and a live cross-platform OS advisory lock; it never unlinks or reclaims the file to break contention. Even under default `npm run serve`, mutable data and `/api/v1` requests recheck the verified pointer. V21 bootstrap or transactional activation completes before the request coordinator commits a changed root, so a failed manual/default rebind serves the prior coherent root and retries on the next qualifying request without publishing a scheduler-status error. Scheduler-driven callback failures are separately visible in `/api/data-update-status` and retry on the next scheduler pass. A bounded `503 TRACKED_CATALOG_UNAVAILABLE` response makes the client retain its GP-only fallback instead of accepting a partial or stale tracked index.

Configure independently generated tokens of at least 24 characters with `OPENBEXI_API_VIEWER_TOKEN`, `OPENBEXI_API_ANALYST_TOKEN`, and `OPENBEXI_API_ADMIN_TOKEN`. Send tokens only in the `Authorization: Bearer ...` header; never place them in URLs, browser storage, source files, or logs. The built-in server is loopback-only by default and is not an approved public multi-user deployment. See [Security Policy](SECURITY.md), [Server Deployment](docs/engineering/SERVER_DEPLOYMENT_V2_1.md), and the [API reference](SWAGGER.md).

## Tools

The supported commands below are derived from the current CLI parsers. On systems without the Windows `py` launcher, use `python3` or the shared `node scripts/python.mjs` resolver.

<details>
<summary><strong>Satellite data maintenance</strong> - <code>tools/satellite_data_tools.py</code></summary>

[Source](tools/satellite_data_tools.py)

```text
py tools/satellite_data_tools.py [--root ROOT] <command> [options]
```

Global options:

| Option | Default | Description |
| --- | --- | --- |
| `-h`, `--help` | - | Show CLI or subcommand help. |
| `--root ROOT` | Repository containing the tool | Override the repository root; place this option before the subcommand. |

Every subcommand supports `-h` and `--help`.

| Subcommand | Purpose and outputs | Options |
| --- | --- | --- |
| `export-gp` | Update primary `json/gp/GP.json` and `GP.meta.json` from the CelesTrak active group plus three event-specific debris groups. | `--all` replaces from one complete response for each configured group; completeness applies only to that configured partial scope, never the provider universe; `--force` bypasses freshness checks only; `--dry-run` computes without writing; `--allow-large-catalog-shrink` explicitly overrides the production-scale shrink guard for this direct command. All default to false. |
| `export-tle` | Update deprecated `json/tle/TLE.json` compatibility data and metadata. | `--all` uses the legacy multi-group workflow; `--force` bypasses freshness checks only; `--dry-run`; `--allow-large-catalog-shrink` explicitly overrides the production-scale shrink guard for this direct command; `--allow-space-track-fallback` enables only the credential-gated fallback hook, which currently supplies no remote fallback; `--refresh-launch-dates` opts into legacy N2YO HTML enrichment that is not approved as release evidence. All default to false. |
| `refresh-satcat` | Refresh `json/satcat.csv` and metadata, then rebuild the launch catalog. | `--force` bypasses freshness checks only; `--dry-run`; `--allow-large-catalog-shrink` explicitly overrides the production-scale shrink guard for this direct command. All default to false. |
| `build-launches` | Build `json/launches/launches.json` and metadata from local SATCAT. | `--dry-run`, default false. |
| `build-decayed-db` | Build confirmed-decay JSON and metadata from SATCAT `PAY` rows with decay dates. | `--all` runs a full rebuild; `--force`; `--dry-run`; `--refresh-satcat` refreshes SATCAT first. All default to false. |
| `build-tracked` | Build the content-addressed tracked-object manifest and chunks from local SATCAT plus current GP/OMM without inventing positions or making a provider request. | `--all` reconciles a verified complete SATCAT snapshot and may mark missing prior identities absent; `--dry-run` computes without writing. Both default to false. |
| `maybe-update` | Run one scheduler-style GP, compatibility TLE, SATCAT, tracked-object, launch, confirmed-decay, and reconciliation cycle. | `--force` bypasses freshness checks only; `--dry-run`; `--interval-hours HOURS`, default `24`; optional `--gp-interval-hours`, `--tle-interval-hours`, `--satcat-interval-hours`, `--tracked-interval-hours`, and `--reconciliation-interval-hours` overrides. No catalog-shrink override is available. |
| `stage-update` | Seed a private revisioned candidate from the selected coherent closure, run one scheduler-style update only inside it, and validate the complete candidate without changing checked-in data. | `--promote` atomically selects the candidate only after successful validation; `--force` bypasses freshness only; `--dry-run`; the same interval overrides as `maybe-update`; `--data-plane-dir`, default `runtime/data-plane`. No catalog-shrink override is available. |
| `import-candidate` | Byte-snapshot the current local data closure into a private candidate without network access or pointer promotion; useful for quarantine, diagnosis, and reviewed recovery. | `--data-plane-dir`, default `runtime/data-plane`. |
| `validate-candidate` | Revalidate one private candidate's required revision pairs, artifact inventory, tracked closure, and current GP/SATCAT lineage, then record the result. | Required `candidate_id`; `--data-plane-dir`, default `runtime/data-plane`. It does not change the current pointer. |
| `promote-candidate` | Revalidate one private candidate and atomically switch the private current-data pointer only after it passes. | Required `candidate_id`; `--data-plane-dir`, default `runtime/data-plane`. It does not rewrite checked-in release data or grant publication approval. |

Common commands:

```powershell
py tools/satellite_data_tools.py export-gp --dry-run
py tools/satellite_data_tools.py export-gp --force
py tools/satellite_data_tools.py refresh-satcat --force
py tools/satellite_data_tools.py build-launches --dry-run
py tools/satellite_data_tools.py build-decayed-db --refresh-satcat --force
py tools/satellite_data_tools.py build-tracked --all --dry-run
py tools/satellite_data_tools.py maybe-update --dry-run
py tools/satellite_data_tools.py maybe-update --dry-run --interval-hours 24 --reconciliation-interval-hours 24
py tools/satellite_data_tools.py stage-update --dry-run
py tools/satellite_data_tools.py import-candidate
py tools/satellite_data_tools.py validate-candidate <candidate_id>
py tools/satellite_data_tools.py promote-candidate <candidate_id>
```

The tool uses HTTPS-only provider URLs, conditional ETag and Last-Modified requests, validation and per-record quarantine, a stale-owner-aware update lock inside a writable data root, atomic promotion, content-aware data writes, and last-known-good preservation. The outer private data-plane boundary is stricter: its persistent OS-advisory lock file is never unlinked or reclaimed, and stale text does not supersede a live holder. For an established GP, TLE, or SATCAT catalog with at least 1,000 records, every reconciliation or full replacement must contain at least 75% as many candidate records **and** retain at least 75% of the prior canonical NORAD identities. `--force` bypasses freshness only and never bypasses this guard. Only the direct `export-gp`, `export-tle`, and `refresh-satcat` commands expose the explicit `--allow-large-catalog-shrink` recovery override; `maybe-update`, `stage-update`, and the server scheduler never expose or pass it. Changed fixed-name data promotions create collision-safe timestamped backups and retain the newest seven backups per artifact. Tracked chunks are content addressed and verified before the manifest is promoted; unchanged input retains the pointer without backup churn. Unchanged provider data creates no backup; an accepted `304 Not Modified`/conditional revalidation records a successful revalidation time and resets the applicable daily due age without changing data bytes or revisions. A private candidate is not release data until it receives a separate exact-byte decision. Direct-command `--dry-run` writes no data, metadata, temporary files, locks, or backups; `stage-update --dry-run` may create its private candidate envelope but does not change candidate data artifacts, the selected pointer, or checked-in data.

GP and compatibility TLE refreshes retain the two-hour CelesTrak guard; server-managed checks default to 24 hours. GP requests `active`, `fengyun-1c-debris`, `iridium-33-debris`, and `cosmos-2251-debris` once each per due cycle. Those event groups are a documented partial positioned-debris subset, not complete debris or provider coverage. A normal incremental cycle upserts the newest validated record per exact NORAD identity and is `PARTIAL`. A due GP reconciliation accepts pruning only after all four configured responses are structurally valid and quarantine-free; TLE reconciliation retains its own configured scope. Metadata distinguishes configured `source_groups` from accepted-byte `catalog_source_groups`. During migration from active-only data, failed, quarantined, partial, or `304`-only responses preserve last-known-good bytes, remain due, and retry every group without inherited validators. SATCAT-derived launch and confirmed-decay history is retained even when a later source snapshot omits an older event. The `2026-08-30T20:33:29Z` live four-group GP refresh returned HTTP 503, so the last-known-good snapshot was preserved with actual catalog scope `[active]`: all 12,490 current debris records remain searchable and zero currently have a validated GP/OMM position. GP/OMM preserves full NORAD strings. TLE decoding supports numeric and explicit Alpha-5 catalog fields such as `A0001` to canonical `100001`, but remains a deprecated subset and never substitutes for complete six-digit GP/OMM coverage.

</details>

<details>
<summary><strong>Local API server</strong> - <code>server.py</code></summary>

[Source](server.py)

```powershell
npm run serve
npm run serve:update
# Equivalent direct command:
py server.py --host 127.0.0.1 --port 8000
py server.py --host 127.0.0.1 --port 8000 --update-data-on-schedule --gp-update-interval-hours 24 --tle-update-interval-hours 24 --satcat-update-interval-hours 24 --tracked-update-interval-hours 24 --reconciliation-interval-hours 24
```

| Option | Default | Description |
| --- | --- | --- |
| `-h`, `--help` | - | Show help. |
| `--host HOST` | `127.0.0.1` | Bind host. |
| `--port PORT` | `8000` | Bind port. |
| `--allow-public` | false | Required acknowledgement for a non-loopback bind. |
| `--cors-origin ORIGIN` | None | Add an exact allowed CORS origin; repeatable. Loopback HTTP(S) is allowed by default. Use `*` only for an intentionally public read-only deployment. |
| `--no-static` | false | Disable serving `index.html` and repository static files. |
| `--update-data-on-schedule` | false | After the HTTP bind, start background GP, compatibility TLE, SATCAT, tracked-object, launch, confirmed-decay, and reconciliation checks; continue until shutdown. |
| `--no-data-update` | false | Disable updates even when scheduling was requested. |
| `--data-update-interval-hours HOURS` | `24` | Legacy/fallback GP, TLE, and SATCAT interval; minimum `1` hour. |
| `--gp-update-interval-hours HOURS` | fallback interval | GP/OMM freshness interval; minimum `1` hour. |
| `--tle-update-interval-hours HOURS` | fallback interval | Deprecated compatibility TLE freshness interval; minimum `1` hour. |
| `--satcat-update-interval-hours HOURS` | fallback interval | SATCAT plus derived launch/confirmed-decay interval; minimum `1` hour. |
| `--tracked-update-interval-hours HOURS` | SATCAT interval | Tracked-object catalog rebuild interval; minimum `1` hour. |
| `--reconciliation-interval-hours HOURS` | `24` | Complete configured-source reconciliation interval; minimum `1` hour. |
| `--runtime-dir DIR` | `runtime` | Private v2.1 database and job-artifact directory; it must remain inside the project root. |
| `--no-v21-service` | false | Disable the authenticated durable screening service. |

Scheduled provider access is disabled by default; `npm run serve` never enables it, while `npm run serve:update` explicitly selects daily maintenance. Due work shares one lock and one SATCAT fetch per cycle; tracked data is derived locally without another provider request. The scheduler always retains the production-scale catalog guard and has no shrink override. Unchanged payloads keep their data bytes, revision, and backup count stable; an accepted conditional revalidation advances successful freshness and resets the daily due age. Dataset failures are isolated, persisted in the GP/TLE/SATCAT/tracked/launch/decay metadata sidecars, retained across server restart, and retried with jittered exponential backoff from a nominal five minutes up to six hours. `/api/data-update-status` exposes all six dataset histories plus live state, due flags, effective intervals, failure count, retry/next-check times, reconciliation time, worker state, and graceful-shutdown state. Its public errors and nested `last_result` values are recursively bounded, control-character normalized, and credential-redacted. A durable-service bootstrap failure leaves the static and unversioned APIs available while reporting the v1 service unavailable.

GitHub Pages and other static hosts cannot execute `server.py` or this scheduler. They serve the packaged snapshot until a separate deployment workflow replaces the generated files.

</details>

<details>
<summary><strong>Catalog and service benchmarks</strong></summary>

Sources: [direct catalog benchmark](scripts/benchmark-full-catalog.mjs) and [durable-service benchmark](tools/benchmark_v21_service.py).

Direct full-catalog engine benchmark:

```text
npm run benchmark:full-catalog -- [options]
```

| Option | Default | Description |
| --- | --- | --- |
| `--catalog PATH` | GP/OMM, then TLE fallback | Orbital JSON catalog. |
| `--meta PATH` | Catalog sibling metadata | Source metadata JSON. |
| `--output PATH` | None | Atomically write the JSON report. |
| `--limit COUNT` | All records | Deterministically use the first `2..100000` objects. |
| `--start-time ISO` | `2026-07-20T12:00:00.000Z` | Screening start time. |
| `--horizon-seconds COUNT` | `60` | Screening horizon, `1..86400`. |
| `--coarse-step-seconds COUNT` | `60` | Coarse slab size, `1..3600` and not greater than the horizon. |
| `--screening-radius-km NUMBER` | `10` | Event radius, `0.001..10000` km. |
| `--help` | - | Show help. |

Durable HTTP-service benchmark:

```text
npm run benchmark:v21-service -- [options]
```

| Option | Default | Description |
| --- | --- | --- |
| `--output PATH` | None | Atomically write the JSON report. |
| `--environment-name NAME` | `local-development` | Stable benchmark environment label. |
| `--object-limit COUNT` | `0` | `0` screens the full catalog; otherwise use `2..25000`. |
| `--start-time ISO` | Source retrieval time | Screening start time. |
| `--screening-radius-km NUMBER` | `10` | Screening radius, `0.001..1000` km. |
| `--job-timeout-seconds COUNT` | `120` | Worker timeout, `10..7200` seconds. |
| `--wait-timeout-seconds COUNT` | `180` | Positive client wait bound. |
| `--keep-runtime` | false | Preserve the generated private runtime for inspection. |
| `-h`, `--help` | - | Show help. |

Both benchmarks produce development evidence, not operational performance or safety certification.

</details>

<details>
<summary><strong>Star catalog and Solar System data helpers</strong></summary>

Sources: [star catalog preprocessor](tools/preprocess_star_catalog.py) and [ephemeris generator](tools/generate_jpl_ephemeris.py).

Star catalog preprocessing:

```text
py tools/preprocess_star_catalog.py --input CSV --output DIR [--limit 11.5] [--tile-deg 15]
```

| Option | Default | Description |
| --- | --- | --- |
| `-h`, `--help` | - | Show help. |
| `--input INPUT` | Required | Source CSV with name/source ID, RA, declination, magnitude, and optional B-V color. |
| `--output OUTPUT` | Required | Output directory for `ra_NN.json` tiles and `manifest.json`. |
| `--limit LIMIT` | `11.5` | Keep stars with magnitude below this value. |
| `--tile-deg TILE_DEG` | `15` | Right-ascension tile width in degrees. |

This helper creates the output directory and directly overwrites generated tile names; it has no dry-run, atomic promotion, backup, or stale-tile cleanup.

Solar System ephemeris regeneration:

```text
py tools/generate_jpl_ephemeris.py
```

This fixed-purpose helper has no CLI options. Passing `--help` starts the fixed network workflow rather than showing help. It performs multiple NASA/JPL Horizons requests for Mercury through Uranus plus the Moon, covering `2020-01-01` through `2035-12-31` at six-hour cadence, and overwrites the bundled ephemeris and reference-sample JSON files. It has no dry-run or backup. The browser never contacts Horizons at runtime.

`tools/save_obj_with_texture.py` is a legacy one-off with hard-coded OneWeb texture paths and undeclared NumPy/Pillow requirements. It has no supported CLI options and is not a maintained project tool.

</details>

<details>
<summary><strong>Common npm commands</strong></summary>

| Command | Purpose |
| --- | --- |
| `npm run serve` | Start the loopback static/API server through shared Python discovery. |
| `npm run serve:update` | Start the loopback server with explicit daily GP/TLE/SATCAT/tracked/launch/decay maintenance and reconciliation scheduling. |
| `npm run build` | Build the curated `dist/` artifact. |
| `npm run check` | Run syntax, Python compilation, version, dependency, artifact, validation, and budget gates. |
| `npm test` | Run JavaScript, Python, and Playwright browser suites. |
| `npm run audit:dependencies` | Fail on high or critical npm audit findings. |
| `npm run sbom` | Generate the Node CycloneDX SBOM evidence. |
| `npm run benchmark:full-catalog` | Run the direct catalog benchmark. |
| `npm run benchmark:v21-service` | Run the durable-service benchmark. |

See [Contributing](CONTRIBUTING.md) and the [Test and Integration Plan](Test_and_Integration.md) for focused commands and evidence requirements.

</details>

## Testing

Run the complete static gates and test matrix before delivery:

```powershell
npm run check
npm test
```

Focused commands are `npm run test:unit`, `npm run test:python`, and `npm run test:browser`. Python-backed npm commands honor `OPENBEXI_PYTHON_COMMAND` and otherwise discover a Python 3 interpreter. See [Test and Integration Plan](Test_and_Integration.md), [Performance Budgets](docs/engineering/PERFORMANCE_BUDGETS.md), and the versioned release checklists for scope and evidence.

## All Project Documentation

This index covers all 46 project-authored Markdown files in the source tree. Historical and archived documents are retained for traceability and do not override current release metadata, ADRs, or gates. Generated build copies, dependency documentation, and the vendored satellite.js license are excluded.

<details>
<summary><strong>Overview and project guidance (5)</strong></summary>

- [README](README.md) - Main project entry point for the demo, capabilities, setup, APIs, tools, and documentation.
- [Contributing](CONTRIBUTING.md) - Contributor setup, required checks, and change-discipline rules.
- [Repository Guide](CLAUDE.md) - Maintainer and coding-agent commands, architecture boundaries, data sources, and development conventions.
- [General Execution Instructions](PROMPT_Instructions.md) - Current project-wide execution, versioning, verification, and documentation rules.
- [Roadmap](ROADMAP.md) - Version 2 architecture, prioritized capabilities, delivery phases, risks, and current gate status.

</details>

<details>
<summary><strong>API (1)</strong></summary>

- [Swagger API Guide](SWAGGER.md) - Static API companion with server startup, endpoint groups, examples, authentication notes, and links to Swagger UI.

</details>

<details>
<summary><strong>Architecture decisions (7)</strong></summary>

- [ADR 0001: Quality Gates and Local-First Server](docs/adr/0001-v2-quality-gates-and-local-first-server.md) - Version 2.0 decision for authoritative release metadata, CI gates, and the local-first serving boundary.
- [ADR 0002: Browser Conjunction Screening](docs/adr/0002-browser-selected-object-conjunction-screening.md) - Version 2.0 decision for bounded selected-object screening in a Web Worker without collision-probability claims.
- [ADR 0003: Durable Full-Catalog Screening](docs/adr/0003-v2.1-durable-full-catalog-screening.md) - Version 2.1 decision for authenticated Python/SQLite job control and an isolated Node screening runner, retained in Version 2.3.
- [ADR 0004: GP/OMM Catalog Continuity](docs/adr/0004-v2.2-gp-omm-catalog-continuity.md) - Retained Version 2.2 decision for preferred GP/OMM data, lossless identities, lifecycle datasets, compatibility, and rollback.
- [ADR 0005: Browser State, Time, and Motion](docs/adr/0005-v2.2-browser-state-time-and-motion-continuity.md) - Retained Version 2.2 decision for unified filters, simulation time, display interpolation, render readiness, and ephemeris bounds.
- [ADR 0006: Provider-Tracked Object Catalog](docs/adr/0006-v2.3-tracked-object-catalog.md) - Version 2.3 decision, amended for 2.3.1 and 2.3.2, for SATCAT-scoped metadata coverage, exact GP-only positions, partial event-group debris coverage, content-addressed publication, and independent facets.
- [ADR 0007: Revisioned Runtime Data Candidates](docs/adr/0007-v2.3.2-revisioned-runtime-data-candidates.md) - Version 2.3.2 decision for isolated refresh roots, complete validation, cooperative cancellation, and atomic private-pointer promotion.

</details>

<details>
<summary><strong>Engineering and deployment (6)</strong></summary>

- [Dependency and SBOM Policy](DEPENDENCIES.md) - Reproducible installation, audit and SBOM checks, vendored runtime delivery, and static-build dependency policy.
- [Orbital Domain Contracts](docs/orbital-domain-contracts-v2.md) - Versioned identity, ingestion, propagation, screening, time/frame, provenance, and maturity contracts.
- [Performance Budgets](docs/engineering/PERFORMANCE_BUDGETS.md) - Enforced asset ceilings, runtime targets, scale limits, and versioned local benchmark observations.
- [Static Deployment](docs/engineering/STATIC_DEPLOYMENT.md) - Deterministic `dist/` build, publication boundary, browser support, verification, limits, and troubleshooting.
- [Pages Deployment](release/PAGES_DEPLOYMENT.md) - Manual confirmed-commit, artifact-only GitHub Pages workflow, attestation, environment controls, and disposable rollback rehearsal.
- [Server Deployment](docs/engineering/SERVER_DEPLOYMENT_V2_1.md) - Loopback durable-service prerequisites, roles, storage, health, operations, and public-exposure limits.

</details>

<details>
<summary><strong>Governance (2)</strong></summary>

- [Data Source Governance](docs/governance/DATA_SOURCES.md) - Provider admission, formats, provenance, licensing, update, retention, freshness, and failure policy.
- [Version 2 Governance Policy](docs/governance/V2_POLICY.md) - Maturity labels, gate ownership, feature flags, permitted claims, and current promotion state.

</details>

<details>
<summary><strong>Science and data (4)</strong></summary>

- [Solar System Ephemeris](data/ephemeris/README.md) - Local JPL Horizons-derived dataset, supported range, accuracy targets, interpolation policy, and limitations.
- [Conjunction Screening v2.0 Method](docs/conjunction-screening-v2.md) - Historical v2.0 TLE-only browser method, provenance, quality flags, and validation evidence.
- [Experimental Selected-Object Screening](docs/science/EXPERIMENTAL_CONJUNCTION_SCREENING_V2.md) - Scientific claim boundary, method, evidence, limitations, reproduction, and promotion criteria for selected-object screening.
- [Experimental Full-Catalog Screening](docs/science/EXPERIMENTAL_FULL_CATALOG_SCREENING_V2_1.md) - Scientific and durability semantics, partial-result meaning, evidence, limits, and open gates for full-catalog screening.

</details>

<details>
<summary><strong>Validation and evidence (3)</strong></summary>

- [Test and Integration Plan](Test_and_Integration.md) - Current Version 2.3.2 verification matrix plus retained historical regression procedures and logs.
- [Validation Corpus Policy](docs/validation/VALIDATION_CORPUS.md) - Corpus tiers, checksum-manifest requirements, existing fixtures, and independent-review requirements.
- [v2.0 Local Verification](release/evidence/v2.0-local-verification.md) - Historical local environment, checks, artifact hashes, browser measurements, screenshots, and unresolved v2.0 gates.

</details>

<details>
<summary><strong>Security (3)</strong></summary>

- [Security Policy](SECURITY.md) - Supported security work, private reporting guidance, server exposure boundary, and known CSP constraint.
- [v2.0 Browser and Data Threat Model](docs/engineering/THREAT_MODEL_V2.md) - Browser, Worker, mixed-catalog ingestion, local server, static artifact, export, and dependency risks and controls.
- [v2.1 Durable-Service Threat Model](docs/engineering/THREAT_MODEL_V2_1.md) - Authentication, runtime, SQLite, subprocess, API/SSE, and public-deployment risks for the durable service.

</details>

<details>
<summary><strong>Release and rollback (11)</strong></summary>

- [Release Notes](RELEASE_NOTES.md) - Current Version 2.3.2 development changes and concise summaries of earlier versions.
- [v2.0 Release Checklist](docs/engineering/RELEASE_CHECKLIST.md) - Version-specific v2.0 promotion evidence, open security/deployment gates, and rollout requirements.
- [v2.1 Release Checklist](docs/engineering/RELEASE_CHECKLIST_V2_1.md) - Version-specific v2.1 implementation evidence and remaining validation, data, security, and operations gates.
- [v2.2 Release Checklist](docs/engineering/RELEASE_CHECKLIST_V2_2.md) - Historical Version 2.2 scope, automated evidence, controlled-data checks, rollback readiness, and candidate decision.
- [v2.3 Release Checklist](docs/engineering/RELEASE_CHECKLIST_V2_3.md) - Version 2.3 tracked-catalog data, browser, API, scale, governance, and promotion gates.
- [v2.3.2 Release Checklist](docs/engineering/RELEASE_CHECKLIST_V2_3_2.md) - Current interaction, private-candidate, artifact-only deployment, verification, and pending promotion gates.
- [Rollback Policy](docs/engineering/ROLLBACK.md) - Cross-version abort triggers, application/data restoration rules, and compatibility expectations.
- [v2.1 Service Rollback](docs/engineering/ROLLBACK_V2_1.md) - Durable-service disablement, artifact preservation, data recovery, and rehearsal procedure.
- [v2.2 Data and Browser Rollback](docs/engineering/ROLLBACK_V2_2.md) - Coherent GP/lifecycle/browser containment, last-known-good restoration, re-enable criteria, and evidence requirements.
- [v2.3 Tracked-Catalog Rollback](docs/engineering/ROLLBACK_V2_3.md) - Feature disablement, manifest/chunk restoration, cache invalidation, and re-enable criteria for the tracked-object catalog.
- [v2.3.2 Runtime and Deployment Rollback](docs/engineering/ROLLBACK_V2_3_2.md) - Private candidate-pointer recovery, GP-only containment, and verified Pages artifact restoration.

</details>

<details>
<summary><strong>Historical prompts (3)</strong></summary>

- [Prompt History](PROMPT_History.md) - Historical source-only record of dated implementation authorizations, requirements, and outcomes.
- [Archived Version 2 Roadmap Prompt](PROMPT_IMPLEMENT_ROADMAP_V2.md) - Archived accepted release-train prompt, superseded where later ADRs and authorizations rebaseline scope.
- [Beamforming Simulator Prompt](PROMPT4beamFormingSimulator3DWithMercatorMap_V2.MD) - Source-only RF, orbital, visualization, UI, validation, and output requirements for the beamforming/Mercator prototype.

</details>

<details>
<summary><strong>License (1)</strong></summary>

- [MIT License](LICENSE.md) - Full MIT license text for the project.

</details>

## License

This project is licensed under the [MIT License](LICENSE.md). The plain-text `LICENSE` file remains available for standard repository tooling.
