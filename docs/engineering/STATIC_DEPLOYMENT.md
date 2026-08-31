# Static Deployment

## Build Contract

`release/static-artifact.json` is the source manifest for the curated Version 2.3.1 development static artifact. Build it with:

```text
npm ci
npm run check
npm run build
```

The deterministic builder recreates `dist/`, copies only approved runtime files, changes the entrypoint deployment marker from `server-capable` to `static`, rewrites dependency URLs to exact same-origin files under `vendor/`, removes mutable remote asset/catalog fallbacks from packaged runtime modules, and writes `dist/asset-manifest.json` with the Version 2.3.1 development identifier, sorted paths, byte counts, and SHA-256 values. The marker prevents static hosts from probing nonexistent same-origin API routes or fetching provider data; an explicit `apiBase` query or stored configuration still takes precedence. Static mode continues to fetch its own packaged files from the artifact origin. `dist/.nojekyll` keeps GitHub Pages from applying Jekyll path rules.

Serve the artifact locally from its own document root:

```text
py -m http.server 8001 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:8001/index.html`.

## Browser Support

Current checks use the pinned Playwright Chromium desktop profile and Pixel 7 Chromium emulation. A browser must support ES modules, module Web Workers, WebGL 2, `fetch`, `crypto.subtle`, and the standard APIs used by Three.js 0.184.0 and satellite.js 6.0.2. Microsoft Edge was manually confirmed after clearing stale browser cache, but it is not a separate automated gate. Current Firefox and Safari releases are expected to run the visualization but are not release-gated; treat manual or expected behavior as unverified support. Hardware acceleration is recommended. The recorded SwiftShader run proves functional rendering only and is not a hardware-GPU performance claim.

## Publication Boundary

Publish the contents of `dist/`, never the repository or a branch root. The artifact includes the application entrypoint, browser modules, curated visualization assets, the preferred static GP/OMM catalog, tracked-object manifest/metadata and exactly its referenced content-addressed chunks, SATCAT-backed launch events, confirmed decay data, deprecated TLE compatibility data, their metadata, satellite model metadata, the local JPL-derived Solar System ephemeris, user-facing help/license files, and the exact vendored Three.js and satellite.js browser files. GP metadata binds any compatibility group/tag enrichment to its source/tag-map revisions and counts. Independent orbit/object-type/history/tag filtering, special exact-`ALL` plus `DEBRIS` facets, lazy tracked discovery, virtualized selection, consolidated selected details, the signed simulation clock, tracked-object display interpolation/recovery, one density-aware batched Globe point layer, object-type-colored Mercator detailed/density paths, and bounded orbit/track refresh are entirely local browser behavior and add no provider request or credential boundary. The artifact retains canonical `obj/SSL_1300.glb` and must not contain the removed byte-identical `obj/loral.glb` duplicate.

The artifact deliberately excludes the server-only full-catalog engine, source adapters, lifecycle and job contracts, Python services, SQLite state, runtime artifacts, credentials, tests, and validation sources. Without an explicit API base, the browser Full-Catalog Screening workspace reports that a server is required, while the v2.0 selected-object Worker remains available against the packaged catalog. An explicit query or stored API base may connect the static page to a separately operated service.

This technical publication boundary is not scientific, stable-release, or operational approval. Repository owner `arcazj` explicitly approved one publication of the exact final post-recording Version 2.3.1 source, tracked closure, validation, and `dist/` bytes through Git push to `origin/master` in `arcazj/openbexi_earth_orbit` and repository-root GitHub Pages at `https://arcazj.github.io/openbexi_earth_orbit/`. The approval binds the final resealed bytes, not later rebuilt, refreshed, regenerated, or otherwise changed bytes and not another channel. Future data, builds, and sources require renewed review. Visual-asset provenance, independent scientific/security review, target-host security configuration, and monitoring remain separate gates. Rollback rehearsal is not complete and has a waiver for this publication only; it remains required for a later publication or promotion unless a new named decision says otherwise.

The builder and tests reject source-control metadata, `node_modules`, scripts, tests, validation sources, prompts, `ROADMAP.md`, `release/` internals, `json/ops/`, backups, and temporary files. Vendored integrity manifests remain source-side; their MIT license files are included in the artifact.

The builder requires the GP, compatibility TLE, launch, decay, and tracked metadata sidecars beside their exact data files. A missing required packaged catalog or sidecar fails the build. The tracked manifest is the only chunk publication pointer: the builder rejects malformed descriptors, path escape, missing or orphan-selected references, byte/hash/count mismatch, wrong chunk type/scope, duplicate NORAD identities, or a partition inconsistent with the manifest. It copies only the current manifest closure, not every retained source-tree chunk. The builder hashes packaged GP bytes, requires the GP metadata dataset/catalog revisions to match those bytes and both tracked GP lineage fields, and requires the tracked manifest and metadata to agree on their SATCAT revision. Operators must still verify the remaining generated data files and metadata sidecars form one coherent release snapshot. A missing preferred catalog may use only the packaged deprecated TLE fallback with a visible reduced-coverage status; it never contacts an undeclared remote fallback. A missing or invalid tracked manifest disables tracked discovery rather than fabricating metadata or positions.

## Data Updates

Update data from the repository root before building an artifact. Start with a non-writing check, then use the intended refresh scope:

```text
py tools/satellite_data_tools.py export-gp --dry-run
py tools/satellite_data_tools.py export-gp --all
py tools/satellite_data_tools.py refresh-satcat --dry-run
py tools/satellite_data_tools.py build-launches --dry-run
py tools/satellite_data_tools.py build-tracked --dry-run
py tools/satellite_data_tools.py build-tracked --all
```

The tool enforces provider request guards, validates output, writes coherent artifacts atomically, retains last-known-good catalogs on failure, and records retrieval, revision, format, newest-date, identity, tag-enrichment, orbit-reclassification, reconciliation, and quarantine status. Normal GP/TLE updates are non-pruning. GP reconciliation requests `active` plus the three configured event-specific debris groups and prunes only after all four responses pass strict validation without quarantines; TLE retains its own configured scope. During migration from active-only metadata, failed, partial, quarantined, or `304`-only responses preserve the last-known-good bytes, remain due, and retry without inherited validators. Configured `source_groups` remain distinct from accepted-byte `catalog_source_groups`. For any established GP, TLE, or SATCAT catalog with at least 1,000 records, full replacement requires both candidate size and canonical NORAD overlap of at least 75%. `--force` cannot bypass that rule. The emergency `--allow-large-catalog-shrink` option is limited to reviewed direct `export-gp`, `export-tle`, or `refresh-satcat` operation and is unavailable to scheduled maintenance. Changed fixed-name artifacts use collision-safe backups with the newest seven retained; accepted `304` revalidation resets due age only for a verified source scope without changing data or backups. One SATCAT response feeds launch, decay, and local tracked derivation while retaining historical events. Tracked chunks are written and verified before atomic manifest promotion; unchanged inputs retain the same pointer. Re-run `npm run check` and archive the resulting GP, TLE, SATCAT, tracked, launch, decay, and artifact hashes before requesting approval for a new static snapshot.

## Verification

`npm run check:artifact` rebuilds the artifact. `tests/staticArtifact.test.js` verifies deterministic output, every generated checksum, packaged GP/tracked/launch/decay/OMM dependencies, complete tracked closure and source-lineage validation, local static imports, absence of unpkg and `node_modules` runtime URLs, and negative exposure rules. `tests_browser/staticDeployment.spec.js` serves only `dist/`, aborts every request outside the artifact origin, boots the app with zero external requests, and exercises the conjunction module Worker through the vendored satellite.js import. Its missing-catalog journey makes both packaged GP and TLE unavailable and requires an explicit fail-closed state with no undeclared remote fallback. Browser catalog/timeline journeys poll same-origin revision inputs, replace controlled fixtures while the page remains open, and verify that the resulting composite revision refreshes tracked metadata and lifecycle data without duplicate events or a document reload.

The Version 2.3.1 browser gate retains the Version 2.2 rendering/time requirements and adds tracked-catalog boundaries: the fresh-page `MEO` population becomes interactive without waiting for tracked chunks; current/history and object-type chunks load on demand; rapid filter changes cannot publish a stale generation; exact orbit `ALL` plus object type `DEBRIS` covers every accepted debris record in scope and alone activates the position/RCS/owner/year/site/status/designator facets; small/missing-RCS debris remains discoverable; metadata-only selection is details-only; and Globe/Mercator membership still requires a finite current-epoch GP state. For 0 through 499 render-ready/drawn objects, the Globe loads the bundled same-origin `icons/ob_satellite.png`, samples only its alpha silhouette, preserves exact canonical vertex colors, and renders at a fixed 16 screen pixels with `sizeAttenuation: false`. At 500 it removes the map, restores perspective attenuation, and switches to compact density size `0.025`; the procedural white-alpha circle is a load-failure fallback only. Mercator retains its independent threshold above 1,000 drawable objects. Counts separately expose matched, positioned, metadata-only, history, and quarantine populations. Object-type colors remain a display key only; red means authoritative debris type and never risk, proximity, physical size, mass, or RCS. The current frozen snapshot has zero positioned debris. The development validation manifest/checklist checksum-bind the corresponding source and test evidence, and the exact final resealed bytes have one-publication owner approval; candidate, governance, performance, independent-review, later-publication, and operational gates remain separate.

Archive `asset-manifest.json` with the commit SHA, dependency audit, SBOM, validation report, and release approval. Because asset filenames are not content-addressed, invalidate deployment caches when replacing a release. Roll back by restoring the previously archived `dist/` artifact and checksum manifest.

## Limits

Static hosting itself does not provide the Python API, durable jobs/history, scheduler, direct provider access, or the request-time tracked coherence check enforced by `server.py`. `npm run serve:update` affects only a running Python server and cannot update GitHub Pages. With no explicit `apiBase`, the browser reports the server as offline and polls only same-origin packaged GP-or-TLE, tracked, launch, and decay revision inputs, so a plain static deployment must publish only the prevalidated curated closure produced by the builder. An operator or deployment workflow must replace one coherent manifest closure and related files before the document can observe a new packaged revision. An explicit API base opts into server health/data behavior, including bounded `503 TRACKED_CATALOG_UNAVAILABLE` and GP-only fallback on incoherent tracked state; the browser still never fetches providers directly. A complete strict CSP remains future work because the legacy entrypoint contains inline scripts and styles.

## Troubleshooting

- **The startup error is shown or modules fail to load:** Serve `dist/` over HTTP; do not open `index.html` through a `file:` URL. Confirm the host returns JavaScript with a JavaScript MIME type and does not rewrite module or Worker requests to HTML, then use **Retry** to reload the full document and reset failed module state.
- **The globe is blank:** Confirm WebGL 2 is enabled, hardware acceleration is available, and the browser has not lost the WebGL context. The automated smoke test requires a nonblank canvas and zero WebGL errors.
- **Only one browser remains blank:** Hard-refresh the page or clear site data for the origin, then reload. A cached pre-fix bootstrap or failed ES-module graph can persist in one browser profile even while other browsers work. If the problem remains, compare its failed requests and console errors with a fresh profile before treating it as a browser-engine incompatibility.
- **The conjunction Worker does not start:** Confirm `js/conjunction/conjunctionWorker.js`, its imported modules, and the vendored satellite.js ES module are present under the same artifact root. Check that Worker scripts are not blocked by host CSP or incorrect MIME types.
- **The server indicator says offline:** This is expected for static hosting without an explicit reachable API base. Screening uses the packaged catalog. Run `npm run serve` and configure `?apiBase=http://127.0.0.1:8000` or stored `openbexi.apiBaseUrl` only when the optional local API is required.
- **Full-Catalog Screening says server required:** This is the intended unconfigured static fallback. Use the selected-object Close Approaches workflow, or run the authenticated local service described in `SERVER_DEPLOYMENT_V2_1.md` and configure its API base explicitly.
- **The catalog is invalid, partial, or stale:** Read the catalog summary and quality flags before using results. Rebuild from a validated source snapshot; do not suppress quarantine or freshness diagnostics. A partial screening result is not complete coverage.
- **Tracked records are missing or a chunk fails:** Compare the deployed manifest with `dist/asset-manifest.json`, then verify the requested file is referenced by that manifest and matches its byte, SHA-256, count, type, and scope descriptor. Do not expose or substitute an orphaned retained chunk. Metadata-only objects will never appear as Globe or Mercator markers.
- **New launches are missing while legacy TLE loads:** Confirm that the artifact contains the GP/OMM and SATCAT-backed launch catalogs and that their revisions match their metadata. Alpha-5 TLE supports only a limited identifier subset and cannot replace current GP/OMM coverage.
- **A deployment still shows an older release:** Purge or version the host cache and service/CDN cache, then compare the deployed files with `dist/asset-manifest.json`.
