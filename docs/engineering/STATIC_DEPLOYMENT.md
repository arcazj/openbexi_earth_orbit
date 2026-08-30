# Static Deployment

## Build Contract

`release/static-artifact.json` is the source manifest for the curated Version 2.2 development static artifact. Build it with:

```text
npm ci
npm run check
npm run build
```

The deterministic builder recreates `dist/`, copies only approved runtime files, changes the entrypoint deployment marker from `server-capable` to `static`, rewrites dependency URLs to exact same-origin files under `vendor/`, removes mutable remote asset/catalog fallbacks from packaged runtime modules, and writes `dist/asset-manifest.json` with the Version 2.2.1 development identifier, sorted paths, byte counts, and SHA-256 values. The marker prevents static hosts from probing nonexistent same-origin API routes or fetching provider data; an explicit `apiBase` query or stored configuration still takes precedence. Static mode continues to fetch its own packaged files from the artifact origin. `dist/.nojekyll` keeps GitHub Pages from applying Jekyll path rules.

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

This technical publication boundary is not scientific, stable-release, or operational approval. Repository-owner confirmation dated 2026-08-29 records data-owner redistribution approval for the exact Version 2.2.1 bundled-source snapshot through the repository-root GitHub Pages configuration. Future refreshed data and new sources require renewed review; visual-asset provenance, independent scientific review, target-host security configuration, monitoring, and rollback rehearsal remain separate gates.

The builder and tests reject source-control metadata, `node_modules`, scripts, tests, validation sources, prompts, `ROADMAP.md`, `release/` internals, `json/ops/`, backups, and temporary files. Vendored integrity manifests remain source-side; their MIT license files are included in the artifact.

The builder requires the GP, compatibility TLE, launch, and decay metadata sidecars beside their exact data files. A missing required packaged catalog or sidecar fails the build. Operators must separately verify that each generated data file and metadata sidecar belongs to the same coherent revision. A missing preferred catalog may use only the packaged deprecated TLE fallback with a visible reduced-coverage status; it never contacts an undeclared remote fallback.

## Data Updates

Update data from the repository root before building an artifact. Start with a non-writing check, then use the intended refresh scope:

```text
py tools/satellite_data_tools.py export-gp --dry-run
py tools/satellite_data_tools.py export-gp --all
py tools/satellite_data_tools.py refresh-satcat --dry-run
py tools/satellite_data_tools.py build-launches --dry-run
```

The tool enforces provider request guards, validates output, writes coherent artifacts atomically, retains last-known-good catalogs on failure, and records retrieval, revision, format, newest-date, identity, tag-enrichment, orbit-reclassification, reconciliation, and quarantine status. Normal GP/TLE updates are non-pruning; complete reconciliation makes one `active` request per orbital format and prunes only after strict validation. For any established GP, TLE, or SATCAT catalog with at least 1,000 records, full replacement requires both candidate size and canonical NORAD overlap of at least 75%. `--force` cannot bypass that rule. The emergency `--allow-large-catalog-shrink` option is limited to reviewed direct `export-gp`, `export-tle`, or `refresh-satcat` operation and is unavailable to scheduled maintenance. Changed artifacts use collision-safe backups with the newest seven retained; accepted `304` revalidation resets due age without changing data or backups. One SATCAT response feeds launch and decay derivation while retaining historical events. Re-run `npm run check` and archive the resulting GP, TLE, SATCAT, launch, decay, and artifact hashes before publishing a new static snapshot.

## Verification

`npm run check:artifact` rebuilds the artifact. `tests/staticArtifact.test.js` verifies deterministic output, every generated checksum, packaged GP/launch/decay/OMM dependencies, local static imports, absence of unpkg and `node_modules` runtime URLs, and negative exposure rules. `tests_browser/staticDeployment.spec.js` serves only `dist/`, aborts every request outside the artifact origin, boots the app with zero external requests, and exercises the conjunction module Worker through the vendored satellite.js import. Its missing-catalog journey makes both packaged GP and TLE unavailable and requires an explicit fail-closed state with no undeclared remote fallback. `tests_browser/timelines.spec.js` polls same-origin GP metadata, changes launch/decay metadata and payload fixtures while the page remains open, and verifies that the resulting composite revision replaces timeline data without duplicate events or a document reload.

The Version 2.2 browser follow-up verifies that the curated artifact contains the category, clock, and motion-interpolation modules plus the ephemeris table; materializes the fresh-page-load `MEO` population first without exposing any marker before a finite current-epoch sample; keeps an old sample hidden after paused-time filter re-admission; retains explicit shared-filter restore; virtualizes the hidden selector; keeps one stable state/selection proxy per record and one Globe point layer with icon-textured through-1,000 and compact colored above-1,000 modes; performs reverse/pause/forward motion without a catalog refetch; hides/retries/recovers propagation failures; reuses shared motion in Mercator with its above-1,000 compact density path plus selected marker, bounded redraw/track refresh, and failed-track clearing/suppression; refreshes selected-orbit geometry in place; clamps and pauses at ephemeris boundaries; keeps combined Globe/Mercator interaction above timeline/detail visualization layers; and keeps fixed `Time x`/server controls usable above Mercator-only fullscreen. The frozen development manifest/checklist checksum-bind the corresponding source and test evidence, but that does not close the remaining candidate, governance, performance, or operational gates.

Archive `asset-manifest.json` with the commit SHA, dependency audit, SBOM, validation report, and release approval. Because asset filenames are not content-addressed, invalidate deployment caches when replacing a release. Roll back by restoring the previously archived `dist/` artifact and checksum manifest.

## Limits

Static hosting itself does not provide the Python API, durable jobs/history, scheduler, or direct provider access. `npm run serve:update` affects only a running Python server and cannot update GitHub Pages. With no explicit `apiBase`, the browser reports the server as offline and polls only same-origin packaged GP-or-TLE, launch, and decay metadata. An operator or deployment workflow must replace coherent files before the document can observe a new packaged revision. An explicit API base opts into server health/data behavior; the browser still never fetches providers directly. A complete strict CSP remains future work because the legacy entrypoint contains inline scripts and styles.

## Troubleshooting

- **The startup error is shown or modules fail to load:** Serve `dist/` over HTTP; do not open `index.html` through a `file:` URL. Confirm the host returns JavaScript with a JavaScript MIME type and does not rewrite module or Worker requests to HTML, then use **Retry** to reload the full document and reset failed module state.
- **The globe is blank:** Confirm WebGL 2 is enabled, hardware acceleration is available, and the browser has not lost the WebGL context. The automated smoke test requires a nonblank canvas and zero WebGL errors.
- **Only one browser remains blank:** Hard-refresh the page or clear site data for the origin, then reload. A cached pre-fix bootstrap or failed ES-module graph can persist in one browser profile even while other browsers work. If the problem remains, compare its failed requests and console errors with a fresh profile before treating it as a browser-engine incompatibility.
- **The conjunction Worker does not start:** Confirm `js/conjunction/conjunctionWorker.js`, its imported modules, and the vendored satellite.js ES module are present under the same artifact root. Check that Worker scripts are not blocked by host CSP or incorrect MIME types.
- **The server indicator says offline:** This is expected for static hosting without an explicit reachable API base. Screening uses the packaged catalog. Run `npm run serve` and configure `?apiBase=http://127.0.0.1:8000` or stored `openbexi.apiBaseUrl` only when the optional local API is required.
- **Full-Catalog Screening says server required:** This is the intended unconfigured static fallback. Use the selected-object Close Approaches workflow, or run the authenticated local service described in `SERVER_DEPLOYMENT_V2_1.md` and configure its API base explicitly.
- **The catalog is invalid, partial, or stale:** Read the catalog summary and quality flags before using results. Rebuild from a validated source snapshot; do not suppress quarantine or freshness diagnostics. A partial screening result is not complete coverage.
- **New launches are missing while legacy TLE loads:** Confirm that the artifact contains the GP/OMM and SATCAT-backed launch catalogs and that their revisions match their metadata. Alpha-5 TLE supports only a limited identifier subset and cannot replace current GP/OMM coverage.
- **A deployment still shows an older release:** Purge or version the host cache and service/CDN cache, then compare the deployed files with `dist/asset-manifest.json`.
