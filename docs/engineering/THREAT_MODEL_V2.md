# v2.0 Threat Model

## Scope and Security Posture

This model covers the v2 browser application, its module Worker, local read APIs, GP/TLE/SATCAT catalog-update tooling, curated static artifact, exports, and shipped browser dependencies. The capability is Experimental and non-operational. Version 2.1 authentication, durable jobs, SQLite, subprocess, and SSE boundaries are modeled separately in `THREAT_MODEL_V2_1.md`. Version 2.2 adds mixed GP/OMM ingestion, lifecycle revision refresh, unified category/share state, consolidated selected details, and bounded clock/motion/ephemeris behavior to this browser/data boundary. Neither model has received independent security review.

The v2.0 capability has no login, write API, shared workspace, alert destination, or credential store. Version 2.1 development adds a separate local authenticated job boundary; it does not change the v2.0 static/browser trust claim.

## Assets and Trust Boundaries

| Boundary | Protected asset | Untrusted input |
| --- | --- | --- |
| Provider to update tool | Last-known-good GP/OMM, TLE compatibility, SATCAT launch/decay data, provenance, and coherent update metadata | HTTPS responses, headers, provider schema changes, malformed/partial/oversized records, identity confusion |
| Static files or API to browser | Catalog identity, application code, visual assets | Hosted bytes, stale caches, deployment mistakes |
| Main page to module Worker | UI availability, request identity, bounded compute | Screening configuration, catalog records, cancellation and progress messages |
| Browser to export | Reproducible request/result data | Provider object names and source metadata included in downloaded JSON |
| HTTP client to Python server | Local files and diagnostics | URL paths, encoding, `Host`, `Origin`, query strings, request rate |
| Locked package to shipped runtime | Propagation and rendering implementation integrity | Registry packages and transitive module imports |

## Threats and Current Controls

### Catalog ingestion and scientific-input abuse

- Catalog validation covers OMM/TLE identity, epochs, numeric ranges, supported Earth/TEME/UTC/SGP4 theory, duplicate/newest-epoch policy, provenance, and pinned satellite.js initialization before scene mutation. Invalid records are quarantined with countable reason codes.
- The mixed catalog loader publishes a validated snapshot atomically and preserves the prior active catalog when a replacement has no usable records. Missing provider metadata is represented as degraded provenance with an unknown retrieval time, not as a fresh provider retrieval. Deprecated TLE fallback exposes reduced coverage.
- `tools/satellite_data_tools.py` uses HTTPS, conditional requests, a minimum provider interval, atomic coherent writes, a process lock, per-record quarantine, and last-known-good preservation. Preferred GP and default incremental TLE compatibility maintenance each make one `active` request. Temporary GP group/tag enrichment is a full-string NORAD join with source/tag-map revisions and counts; it cannot supply orbital state or truncate identity. Scheduled updates are disabled by default. HTTP 404, malformed, or partial-promotion failures cannot report completion.
- Catalog and screening limits bound record count, forecast horizon, grid points, output count, structured errors, Worker chunk size, and estimated coarse propagations. These reduce memory and compute denial-of-service risk but are not a substitute for server-side quotas in later releases.
- Residual risks: provider compromise, very large compressed responses before parsing, semantic but structurally valid bad data, SATCAT/OMM identifier conflicts, stale client/CDN revisions, and incomplete provider coverage. Public redistribution approval is also pending.

### Worker messages, cancellation, and availability

- `js/conjunction/conjunctionWorkerProtocol.js` defines explicit message kinds and validates client-created identifiers, catalog counts, chunk indices, and chunk sizes.
- `js/conjunction/conjunctionWorkerClient.js` uses unique transport IDs, bounded chunk uploads, request-scoped cancellation, synchronous-clone error cleanup, crash termination, and Worker recreation. Cancellation during a yielded upload has an attached rejection handler.
- `js/conjunction/conjunctionWorker.js` assembles catalog transfers by request, rejects incomplete transfers, coalesces progress crossing the thread boundary, and reports structured errors.
- The loader prioritizes fresh-page-default `MEO` materialization, but each accepted record's stable `Object3D` state/selection proxy remains absent from the single batched `THREE.Points` layer until a finite shared-motion sample covering the current simulation UTC commits; filter eligibility cannot expose construction/origin geometry or an old sample after paused-time filter re-admission. The point layer uses the local icon texture through 1,000 drawn markers and compact per-marker colors above that threshold. Catalog replacement disposes point geometry/material and loader-owned source material/texture, while preserving injected/shared source resources. The page uses `js/orbit/satelliteMotionInterpolator.js` to schedule filter-visible non-selected satellite SGP4 samples in bounded batches with a propagation-time budget and orbit-period-fraction window cap, interpolate their scene positions between samples, and cancel or discard stale work after catalog, selection, discontinuous-time, or rate-direction changes while retaining usable in-window interpolation. Cadence-limited catalog coverage is exposed at high warp. The selected satellite uses an exact SGP4 state at each simulation frame and its state is reused by orientation and footprint consumers. Invalid propagation hides the marker/model and enters bounded retry rather than retaining stale or Earth-center geometry; finite recovery restores only filter-eligible display state, and intervening frames do not postpone selected recovery at an unchanged simulation instant. Mercator consumes this same display pass, switches above 1,000 drawable records to one compact density path plus the detailed selected marker, skips per-object icons/sorting/non-selected labels in that mode, and caches selected-track work; a failed same-satellite track rebuild clears the old path and suppresses repeat attempts at the unchanged failed instant. This display path remains separate from Worker screening.
- Residual risks: another script already executing in the same origin can create or message its own Worker, exhaust allowed preview work repeatedly, or tamper with browser state. v2.0 has no cross-user isolation or durable job admission control.

### Visualization state, time, and ephemeris bounds

- Category/share parsing accepts only the closed `ALL`/`GEO`/`MEO`/`LEO`/`HEO`/`DEBRIS`/`OTHER` vocabulary, normalizes the visible `HRO` alias to `HEO`, strips unsafe local-path values, and retains the legacy debris-only query only as a bounded compatibility input. Visible typeahead owns catalog discovery; the hidden legacy selector retains only `None` plus the active NORAD, bounding DOM option growth.
- One clock clamps the signed rate to `-60` through `60`, rejects invalid explicit dates, caps animation-frame gaps before applying time warp, and uses finite JPL table bounds while Solar System mode is active. A reached ephemeris boundary pauses visibly; no JPL-derived extrapolation is attempted.
- Non-selected satellite Hermite interpolation, per-record state proxies, the batched Globe point buffer, Mercator projection/density geometry, cached selected ground tracks, and in-place selected-orbit geometry are presentation state only. Scientific calculations, selected-object state, source ages, and exported screening results use explicit propagation at explicit UTC instants.
- Residual risks: large visible selections can still consume browser CPU, malicious same-origin scripts can mutate UI/clock state, and a background tab intentionally does not replay its full missed wall-clock interval after the frame-gap cap.

### Static and local-server exposure

- `server.py` defaults to loopback, requires explicit public binding, restricts CORS, validates `Host`, resolves and confines paths, blocks traversal and symlink escape, and serves only exact root/runtime allowlists with controlled content types, cache behavior, and security headers.
- `tests_python/test_server_security.py` exercises traversal encodings, CORS, cache validators, allowed runtime files, and denial of prompts, roadmap, tools, tests, release metadata, operations data, backups, vendor manifests, and arbitrary prototype pages.
- `release/static-artifact.json` and `scripts/build-static.mjs` generate `dist/` from an explicit manifest. Negative tests reject repository internals, prompts, backups, `node_modules`, and undeclared imports. Deployment documentation requires publishing `dist/` contents only.
- Source/server-capable pages load exact vendored dependencies first and may use exact-version unpkg URLs only as an explicit fallback. The builder enforces packaged-only dependency resolution, removes the mutable raw-GitHub fallback, and the static browser test aborts every non-artifact origin. Without an explicit API base, static mode polls only same-origin packaged GP-or-TLE, launch, and decay metadata; a composite change can refresh packaged data in the same document, but the browser never contacts a provider and cannot make an unchanged deployment newer. An explicit API base opts the page into the separately operated server path, not direct browser-to-provider ingestion. A missing packaged dependency or module graph fails visibly and closed. The primary GP catalog is required at build time; at runtime an unavailable GP catalog may use only the packaged deprecated TLE fallback with visible reduced coverage, and the application fails closed when both packaged catalogs are unavailable or invalid.
- Residual risks: the inline application prevents a strict Content Security Policy, the Python server has no production rate limiter, and TLS/monitoring depend on the target host. Serving the repository root with a different server bypasses the Python allowlist.

### Script, markup, and export injection

- Catalog/provider values are inserted into the conjunction UI with `textContent`; selected-satellite GP/details markup escapes scalar labels and values before assigning its generated HTML. Screening does not interpret rendered HTML, orbit polylines, state proxies, batched/density markers, or scene-space values as scientific input.
- The v2.0 JSON export is generated with `JSON.stringify` into a Blob and downloaded. The application does not import or render exported payloads.
- Share-state identifiers are length- and character-bounded, and URL state removes local server addresses and token/password/secret-like values in `js/shareState.js`.
- Residual risks: legacy pages outside the curated artifact have a broader historical surface, and any future report-import or HTML-report feature will need schema validation, output encoding, file-size limits, and content isolation.

### Dependency and artifact integrity

- `package.json` uses exact versions and `package-lock.json` records registry integrity. CI installs with `npm ci`, audits dependencies, and generates a CycloneDX SBOM.
- `scripts/vendor-browser-dependencies.mjs` verifies exact installed bytes, SHA-256/npm integrity, required APIs, transitive addon imports, and absence of runtime `node_modules` URLs for satellite.js 6.0.2 and Three.js 0.184.0.
- `dist/asset-manifest.json` records every deployed file and SHA-256. This detects drift but does not sign the release or secure the hosting control plane.
- Residual risks: compromised maintainer/CI credentials, unsigned artifacts, browser or GPU-driver vulnerabilities, and unresolved source/redistribution terms for some data and visual assets.

## Privacy and Secrets

The preview performs local visualization and screening and has no telemetry collector. Diagnostics contain catalog counts, object identifiers, timing, and structured failures, but should not include credentials. Optional provider credentials used by tooling must remain in environment or external secret storage and must never enter browser bundles, URLs, exports, or logs.

## Public-Deployment Blockers

Before public or stable deployment, the release owner must obtain independent security review, resolve or approve CSP policy, configure TLS and explicit origins, add target-host resource/rate controls and monitoring, run a secrets scan, approve data/asset redistribution, archive signed or otherwise authenticated artifacts, and rehearse rollback. These gates remain open in `docs/engineering/RELEASE_CHECKLIST.md`.

## Review Triggers

Review this model and `THREAT_MODEL_V2_1.md` before changing a write route, authentication, user upload/import, shared state, event persistence, notification destination, webhook, provider credential, CDM/covariance parser, background job, or public server deployment. Each new trust boundary requires negative authorization, object-access, resource-limit, injection, audit, and secret-rotation tests appropriate to that feature.
