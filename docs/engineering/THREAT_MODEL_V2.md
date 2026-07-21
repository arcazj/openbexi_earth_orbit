# v2.0 Threat Model

## Scope and Security Posture

This model covers the v2.0 preview browser application, its module Worker, legacy local read APIs, catalog-update tooling, curated static artifact, exports, and shipped browser dependencies. The capability is Experimental and non-operational. Version 2.1 authentication, durable jobs, SQLite, subprocess, and SSE boundaries are modeled separately in `THREAT_MODEL_V2_1.md`. Neither model has received independent security review.

The v2.0 capability has no login, write API, shared workspace, alert destination, or credential store. Version 2.1 development adds a separate local authenticated job boundary; it does not change the v2.0 static/browser trust claim.

## Assets and Trust Boundaries

| Boundary | Protected asset | Untrusted input |
| --- | --- | --- |
| Provider to update tool | Last-known-good TLE/SATCAT data, provenance, update metadata | HTTPS responses, headers, provider schema changes, malformed or oversized records |
| Static files or API to browser | Catalog identity, application code, visual assets | Hosted bytes, stale caches, deployment mistakes |
| Main page to module Worker | UI availability, request identity, bounded compute | Screening configuration, catalog records, cancellation and progress messages |
| Browser to export | Reproducible request/result data | Provider object names and source metadata included in downloaded JSON |
| HTTP client to Python server | Local files and diagnostics | URL paths, encoding, `Host`, `Origin`, query strings, request rate |
| Locked package to shipped runtime | Propagation and rendering implementation integrity | Registry packages and transitive module imports |

## Threats and Current Controls

### Catalog ingestion and scientific-input abuse

- `js/domain/catalogValidation.js` validates fixed-width TLE structure, checksums, object identity, epochs, ranges, duplicates, provenance, and pinned SGP4 initialization before scene mutation. Invalid records are quarantined with countable reason codes.
- `js/satelliteTLELoader.js` publishes a validated snapshot atomically and preserves the prior active catalog when a replacement has no usable records. Missing provider metadata is represented as degraded provenance with an unknown retrieval time, not as a fresh provider retrieval.
- `tools/satellite_data_tools.py` uses HTTPS, conditional requests, a minimum provider interval, atomic writes, a process lock, and last-known-good preservation. Scheduled updates are disabled by default.
- Catalog and screening limits bound record count, forecast horizon, grid points, output count, structured errors, Worker chunk size, and estimated coarse propagations. These reduce memory and compute denial-of-service risk but are not a substitute for server-side quotas in later releases.
- Residual risks: provider compromise, very large compressed responses before parsing, semantic but checksum-valid bad data, and incomplete six-digit-object coverage. Public redistribution approval is also pending.

### Worker messages, cancellation, and availability

- `js/conjunction/conjunctionWorkerProtocol.js` defines explicit message kinds and validates client-created identifiers, catalog counts, chunk indices, and chunk sizes.
- `js/conjunction/conjunctionWorkerClient.js` uses unique transport IDs, bounded chunk uploads, request-scoped cancellation, synchronous-clone error cleanup, crash termination, and Worker recreation. Cancellation during a yielded upload has an attached rejection handler.
- `js/conjunction/conjunctionWorker.js` assembles catalog transfers by request, rejects incomplete transfers, coalesces progress crossing the thread boundary, and reports structured errors.
- The page uses `createRoundRobinFrameProcessor` from `js/startupPerformance.js` so bulk sprite propagation has a per-frame time budget while Worker screening runs.
- Residual risks: another script already executing in the same origin can create or message its own Worker, exhaust allowed preview work repeatedly, or tamper with browser state. v2.0 has no cross-user isolation or durable job admission control.

### Static and local-server exposure

- `server.py` defaults to loopback, requires explicit public binding, restricts CORS, validates `Host`, resolves and confines paths, blocks traversal and symlink escape, and serves only exact root/runtime allowlists with controlled content types, cache behavior, and security headers.
- `tests_python/test_server_security.py` exercises traversal encodings, CORS, cache validators, allowed runtime files, and denial of prompts, roadmap, tools, tests, release metadata, operations data, backups, vendor manifests, and arbitrary prototype pages.
- `release/static-artifact.json` and `scripts/build-static.mjs` generate `dist/` from an explicit manifest. Negative tests reject repository internals, prompts, backups, `node_modules`, and undeclared imports. Deployment documentation requires publishing `dist/` contents only.
- Source/server-capable pages load exact vendored dependencies first and may use exact-version unpkg URLs only as an explicit fallback. The builder enforces packaged-only dependency resolution, removes the mutable raw-GitHub fallback, and the static browser test aborts every non-artifact origin. A missing packaged dependency, module graph, or TLE catalog fails visibly and closed in the static artifact.
- Residual risks: the inline application prevents a strict Content Security Policy, the Python server has no production rate limiter, and TLS/monitoring depend on the target host. Serving the repository root with a different server bypasses the Python allowlist.

### Script, markup, and export injection

- Catalog/provider values are inserted into the conjunction UI with `textContent`; screening does not interpret rendered HTML, orbit polylines, or scene-space values as scientific input.
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
