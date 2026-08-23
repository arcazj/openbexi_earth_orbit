# Static Deployment

## Build Contract

`release/static-artifact.json` is the source manifest for the curated Version 2.2 development static artifact. Build it with:

```text
npm ci
npm run check
npm run build
```

The deterministic builder recreates `dist/`, copies only approved runtime files, changes the entrypoint deployment marker from `server-capable` to `static`, rewrites dependency URLs to exact same-origin files under `vendor/`, removes mutable remote asset/catalog fallbacks from packaged runtime modules, and writes `dist/asset-manifest.json` with the Version 2.2.0 development identifier, sorted paths, byte counts, and SHA-256 values. The marker prevents static hosts from probing nonexistent same-origin API routes or fetching provider data; an explicit `apiBase` query or stored configuration still takes precedence. Static mode continues to fetch its own packaged files from the artifact origin. `dist/.nojekyll` keeps GitHub Pages from applying Jekyll path rules.

Serve the artifact locally from its own document root:

```text
py -m http.server 8001 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:8001/index.html`.

## Browser Support

Current checks use the pinned Playwright Chromium desktop profile and Pixel 7 Chromium emulation. A browser must support ES modules, module Web Workers, WebGL 2, `fetch`, `crypto.subtle`, and the standard APIs used by Three.js 0.184.0 and satellite.js 6.0.2. Microsoft Edge was manually confirmed after clearing stale browser cache, but it is not a separate automated gate. Current Firefox and Safari releases are expected to run the visualization but are not release-gated; treat manual or expected behavior as unverified support. Hardware acceleration is recommended. The recorded SwiftShader run proves functional rendering only and is not a hardware-GPU performance claim.

## Publication Boundary

Publish the contents of `dist/`, never the repository or a branch root. The artifact includes the application entrypoint, browser modules, curated visualization assets, the preferred static GP/OMM catalog, SATCAT-backed launch events, confirmed decay data, deprecated TLE compatibility data, their metadata, satellite model metadata, the local JPL-derived Solar System ephemeris, user-facing help/license files, and the exact vendored Three.js and satellite.js browser files. GP metadata binds any compatibility group/tag enrichment to its source/tag-map revisions and counts. Unified category filtering, virtualized selection, consolidated selected details, the signed simulation clock, satellite display interpolation/recovery, one density-aware batched Globe point layer, Mercator shared-position detailed/density paths, and bounded orbit/track refresh are entirely local browser behavior and add no provider request or credential boundary. The artifact retains canonical `obj/SSL_1300.glb` and must not contain the removed byte-identical `obj/loral.glb` duplicate.

The artifact deliberately excludes the server-only full-catalog engine, source adapters, lifecycle and job contracts, Python services, SQLite state, runtime artifacts, credentials, tests, and validation sources. Without an explicit API base, the browser Full-Catalog Screening workspace reports that a server is required, while the v2.0 selected-object Worker remains available against the packaged catalog. An explicit query or stored API base may connect the static page to a separately operated service.

This technical publication boundary is not public-release approval. Dataset/visual-asset redistribution review, independent scientific review, target-host TLS/CORS/security configuration, monitoring, and rollback rehearsal remain gates in the v2.0, v2.1, and v2.2 release checklists.

The builder and tests reject source-control metadata, `node_modules`, scripts, tests, validation sources, prompts, `ROADMAP.md`, `release/` internals, `json/ops/`, backups, and temporary files. Vendored integrity manifests remain source-side; their MIT license files are included in the artifact.

The builder requires the GP, launch, and decay metadata sidecars beside their exact data files and retains the TLE metadata requirement during the compatibility window. A missing required packaged catalog or sidecar fails the build. Operators must separately verify that each generated data file and metadata sidecar belong to the same coherent revision. A missing preferred catalog at runtime may use only the packaged deprecated TLE fallback with a visible reduced-coverage status; it never contacts an undeclared remote fallback.

## Data Updates

Update data from the repository root before building an artifact. Start with a non-writing check, then use the intended refresh scope:

```text
py tools/satellite_data_tools.py export-gp --dry-run
py tools/satellite_data_tools.py export-gp --all
py tools/satellite_data_tools.py refresh-satcat --dry-run
py tools/satellite_data_tools.py build-launches --dry-run
```

The tool enforces provider request guards, validates output, writes coherent artifacts atomically, retains last-known-good catalogs on failure, and records retrieval, revision, format, newest-date, identity, tag-enrichment, orbit-reclassification, and quarantine status in metadata. Default preferred GP and incremental compatibility TLE refreshes each make one `active`-group request. Re-run `npm run check` and archive the resulting GP, launch, decay, compatibility, and artifact hashes. Do not publish refreshed provider data until its redistribution approval is recorded in `docs/governance/DATA_SOURCES.md`.

## Verification

`npm run check:artifact` rebuilds the artifact. `tests/staticArtifact.test.js` verifies deterministic output, every generated checksum, packaged GP/launch/decay/OMM dependencies, local static imports, absence of unpkg and `node_modules` runtime URLs, and negative exposure rules. `tests_browser/staticDeployment.spec.js` serves only `dist/`, aborts every request outside the artifact origin, boots the app with zero external requests, and exercises the conjunction module Worker through the vendored satellite.js import. Its missing-catalog journey makes both packaged GP and TLE unavailable and requires an explicit fail-closed state with no undeclared remote fallback. `tests_browser/timelines.spec.js` polls same-origin GP metadata, changes launch/decay metadata and payload fixtures while the page remains open, and verifies that the resulting composite revision replaces timeline data without duplicate events or a document reload.

The Version 2.2 browser follow-up verifies that the curated artifact contains the category, clock, and motion-interpolation modules plus the ephemeris table; materializes the fresh-page-load `MEO` population first without exposing any marker before a finite current-epoch sample; keeps an old sample hidden after paused-time filter re-admission; retains explicit shared-filter restore; virtualizes the hidden selector; keeps one stable state/selection proxy per record and one Globe point layer with icon-textured through-1,000 and compact colored above-1,000 modes; performs reverse/pause/forward motion without a catalog refetch; hides/retries/recovers propagation failures; reuses shared motion in Mercator with its above-1,000 compact density path plus selected marker, bounded redraw/track refresh, and failed-track clearing/suppression; refreshes selected-orbit geometry in place; clamps and pauses at ephemeris boundaries; keeps combined Globe/Mercator interaction above timeline/detail visualization layers; and keeps fixed `Time x`/server controls usable above Mercator-only fullscreen. The frozen development manifest/checklist checksum-bind the corresponding source and test evidence, but that does not close the remaining candidate, governance, performance, or operational gates.

Archive `asset-manifest.json` with the commit SHA, dependency audit, SBOM, validation report, and release approval. Because asset filenames are not content-addressed, invalidate deployment caches when replacing a release. Roll back by restoring the previously archived `dist/` artifact and checksum manifest.

## Limits

Static hosting itself does not provide the optional Python API routes, `/api/v1` durable jobs/history, scheduled provider ingestion, or direct provider access. With no explicit `apiBase`, the browser reports the server as offline, polls only same-origin packaged GP-or-TLE, launch, and decay metadata sidecars, and needs no bearer token. When an operator replaces those files and their revisions change, the existing document reloads the affected packaged data and refreshes both timelines without a page reload. This is deployment-change detection, not a provider update: an immutable deployment cannot become newer until its hosted files are replaced, and stale intermediary caches may still delay observation. An explicit query or stored API base opts the page into normal server health/data/full-catalog behavior and may require a page-memory bearer token; the browser still never fetches providers directly. A complete strict CSP remains future work because the legacy entrypoint contains inline scripts and styles.

## Troubleshooting

- **The startup error is shown or modules fail to load:** Serve `dist/` over HTTP; do not open `index.html` through a `file:` URL. Confirm the host returns JavaScript with a JavaScript MIME type and does not rewrite module or Worker requests to HTML, then use **Retry** to reload the full document and reset failed module state.
- **The globe is blank:** Confirm WebGL 2 is enabled, hardware acceleration is available, and the browser has not lost the WebGL context. The automated smoke test requires a nonblank canvas and zero WebGL errors.
- **Only one browser remains blank:** Hard-refresh the page or clear site data for the origin, then reload. A cached pre-fix bootstrap or failed ES-module graph can persist in one browser profile even while other browsers work. If the problem remains, compare its failed requests and console errors with a fresh profile before treating it as a browser-engine incompatibility.
- **The conjunction Worker does not start:** Confirm `js/conjunction/conjunctionWorker.js`, its imported modules, and the vendored satellite.js ES module are present under the same artifact root. Check that Worker scripts are not blocked by host CSP or incorrect MIME types.
- **The server indicator says offline:** This is expected for static hosting without an explicit reachable API base. Screening uses the packaged catalog. Run `npm run serve` and configure `?apiBase=http://127.0.0.1:8000` or stored `openbexi.apiBaseUrl` only when the optional local API is required.
- **Full-Catalog Screening says server required:** This is the intended unconfigured static fallback. Use the selected-object Close Approaches workflow, or run the authenticated local service described in `SERVER_DEPLOYMENT_V2_1.md` and configure its API base explicitly.
- **The catalog is invalid, partial, or stale:** Read the catalog summary and quality flags before using results. Rebuild from a validated source snapshot; do not suppress quarantine or freshness diagnostics. A partial screening result is not complete coverage.
- **New launches are missing while legacy TLE loads:** Confirm that the artifact contains the GP/OMM and SATCAT-backed launch catalogs and that their revisions match their metadata. TLE cannot represent newly assigned six-digit identifiers and is only a reduced-coverage compatibility source.
- **A deployment still shows an older release:** Purge or version the host cache and service/CDN cache, then compare the deployed files with `dist/asset-manifest.json`.
