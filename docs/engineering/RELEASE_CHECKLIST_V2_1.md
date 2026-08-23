# v2.1 Development Release Checklist

Last reviewed: 2026-08-22

Version `2.1.0` was implemented in `development` publication state with `Experimental` scientific maturity and a `non-operational` safety class. This checklist remains the evidence needed for any v2.1 promotion decision and does not close the separate v2.0 gates. The later Version 2.2 GP/OMM and bounded browser-continuity development authorization is tracked independently and does not satisfy this checklist.

## Implemented Development Scope

- [x] `release/version.json` identifies Version 2.1.0 as development, with null candidate and release dates.
- [x] `experimental_full_catalog_screening` is a server-scoped development flag with an explicit static-browser fallback.
- [x] ADR 0003 records the single-node Python/SQLite and isolated Node-runner boundary.
- [x] Versioned request/configuration/source/job contracts bound horizons, catalog scope, spatial work, candidate volume, result volume, attempts, and timeout.
- [x] Content-addressed catalog snapshots and private job artifacts remain under the configured `runtime/` directory; catalog API responses remove private snapshot/metadata paths.
- [x] Initial bootstrap and successful scheduled TLE refreshes register immutable revisions; current incremental metadata is `PARTIAL`, and only a successful explicit full (`mode=all`) snapshot may reconcile `ABSENT`.
- [x] SQLite persistence records catalog revisions, lifecycle observations, jobs, attempts, progress, candidates, event revisions, errors, outbox events, and audit records.
- [x] Worker ownership and attempt fencing prevent stale attempts from importing results or completing a newer attempt.
- [x] Job submission is idempotent for a principal and key; reusing a key for different normalized input is rejected.
- [x] Job progress, cancellation, bounded retry, timeout, restart recovery, replay, and atomic result import have focused tests.
- [x] Worker progress persistence is coalesced by first-stage, 1% advancement, and bounded-heartbeat rules, capped at 512 records per attempt, and preserves the latest snapshot before terminal state.
- [x] End-to-end original and completed replay jobs both succeed; persisted event-revision IDs are job/attempt scoped and retain the deterministic engine event ID without colliding across runs.
- [x] `/api/v1` exposes health, capabilities with defaults/structured configuration limits, catalog revisions, jobs, event queries, replay/retry/cancel, and resumable SSE progress.
- [x] Bearer roles, bounded bodies and queries, signed cursors, structured problem responses, rate limits, loopback defaults, and token-in-URL rejection have focused tests.
- [x] The browser can submit and monitor a job with a session-memory bearer token, use authenticated fetch-based SSE with bounded polling fallback, inspect returned events, show Experimental/non-operational/Pc-unavailable and partial/unscreened coverage state, and retain the v2.0 selected-object workflow when the server is absent.
- [x] TLE JSON, CCSDS OMM JSON/KVN, CCSDS OEM KVN, and provider-ephemeris adapters preserve original input and provenance under bounded parsing contracts.
- [x] The full-catalog path uses time slabs, swept spatial bounds, canonical pair admission, and bounded refinement rather than a global unbounded all-pairs production loop.

## Verification Evidence

- [x] `validation/v2.1.0/manifest.json` binds the development engine, runner, adapter, propagation, and benchmark artifacts by SHA-256.
- [x] Deterministic small-catalog tests compare broad-phase candidates with a brute-force chord oracle and expect zero missed supported candidate intervals.
- [x] Analytic linear-motion cases exercise event detection and bounded TCA refinement.
- [x] The isolated runner tests checksum validation, path confinement, atomic result identity, TLE/OMM input, and fail-closed rejection of non-TEME provider ephemeris.
- [x] A Version 2.1 development CycloneDX SBOM is archived at `release/evidence/openbexi-node-sbom-2.1.0-development.cdx.json`.
- [x] One named-machine full-catalog observation records candidate reduction, wall time, peak memory, result size, detected events, and explicit unscreened intervals.
- [x] `npm run benchmark:v21-service` exercises the real loopback HTTP/API/store/worker path with a fresh private runtime and reports endpoint latency, durable row counts, database/WAL size, job timing, and post-shutdown persistence. The current report is `validation/v2.1.0/benchmarks/local-v21-service-2026-07-20.json`.
- [ ] A clean-clone run archives machine-readable results for `npm run check`, unit, Python, and browser suites against the exact source, lockfile, catalog, validation manifest, and artifact hashes.
- [ ] A repeated named-hardware profile establishes percentiles for representative one-hour and six-hour windows, catalog growth, API latency, database growth, and recovery behavior.
- [ ] A 2x-catalog or justified projected-scale profile demonstrates bounded work and storage.
- [ ] Representative long-running and failure/recovery profiles validate the progress-record cap; outbox consumer acknowledgement/pruning, retention automation, and storage budgets are approved. The current one-job profile retained 22 progress rows and 26 total outbox rows.
- [ ] An independent reviewer approves broad-phase completeness assumptions, refinement evidence, partial-result semantics, and source-format handling.
- [ ] A trusted independent full-catalog truth set or cross-tool comparison is accepted with documented tolerances.

The committed 60-second observation is intentionally `PARTIAL`: incremental-source provenance retained `PARTIAL_SOURCE_DATASET`, while propagation failures and three motion-bound violations left reported pair intervals unscreened. A partial result is correct behavior for that input, not evidence of complete catalog coverage.

## Data, Security, and Operations

- [ ] Every provider intended for deployment has an approved source, license, attribution, permitted-use, storage, retention, and redistribution record.
- [ ] Current six-digit catalog coverage is demonstrated through an admitted OMM-capable source. The bundled legacy TLE snapshot cannot satisfy this gate.
- [ ] Catalog registration beyond the bundled local TLE bootstrap has a reviewed operator workflow with quarantine and last-known-good recovery.
- [ ] Secrets scanning confirms that bearer tokens, cursor secrets, provider credentials, runtime databases, and job artifacts are absent from source and static artifacts.
- [ ] The target deployment receives an independent authorization, CORS, path, denial-of-service, subprocess, SQLite, and reverse-proxy review, including OS CPU/memory isolation because no process memory quota is implemented.
- [ ] TLS termination, stronger multi-user identity, token rotation/revocation, quotas, monitoring, backup, restore, retention, and incident ownership are active for any non-loopback use.
- [ ] Database and artifact backup/restore are rehearsed from checksummed copies with the service stopped.
- [ ] The disable and rollback procedures in `ROLLBACK_V2_1.md` are rehearsed without modifying the source catalog or losing retained completed events.
- [ ] The static artifact is reverified to contain no server-only engine, adapter, database, runtime artifact, token, or operational data.

## Explicitly Outside v2.1

- [ ] CCSDS CDM ingestion, validated covariance, and sourced hard-body radius are not implemented.
- [ ] Collision probability and operational risk scoring are not implemented.
- [ ] Alert delivery, acknowledgement workflows, and human-readable conjunction reports are not implemented.
- [ ] Maneuver generation, avoidance recommendations, and operational decision support are not implemented.

These unchecked statements are scope boundaries, not tasks to complete under the current authorization. They require a separately approved later release and their own scientific and operational gates.

Current decision: **development implementation available for local evaluation; not a release candidate, not released, and not operational**.
