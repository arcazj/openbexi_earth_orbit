# Release Notes

## Version 2.1.0 Development (Not a Release Candidate)

Version 2.1 development adds an optional authenticated, single-node full-catalog close-approach service. It freezes catalog revisions into private content-addressed storage, registers startup and successful scheduled TLE revisions, reconciles new/changed/reappeared observations, and permits `ABSENT` only after a successful explicit full-source snapshot. The current incremental source is `PARTIAL` and cannot infer absence. The service persists bounded jobs and event revisions in SQLite, executes screening in an isolated Node subprocess, and exposes versioned `/api/v1` health, catalog, job, replay, cancellation, SSE progress, and paginated event routes. Catalog responses omit private artifact paths, while capabilities expose normalized defaults and structured request limits. The browser adds a server-capability workspace with a page-memory bearer token, explicit Experimental/non-operational/Pc-unavailable labels, partial-coverage counts, and polling fallback; static hosting retains the Version 2.0 selected-object workflow.

The broad phase partitions time into slabs and uses bounded swept spatial hashing before synchronized TCA refinement. Multi-format contracts cover TLE JSON, CCSDS OMM JSON/KVN, CCSDS OEM KVN, and provider ephemeris JSON with strict provenance, frame, UTC, unit, size, and interpolation rules. Only the bundled TLE snapshot is registered automatically; implementing adapters does not admit a provider feed or resolve licensing.

Initial development evidence includes brute-force candidate-recall oracles on tractable deterministic catalogs, a direct-engine 16,443-object 60-second observation, and a separate real loopback HTTP/store/worker run. The engine run completed in about 2.97 seconds and returned `PARTIAL`, with 1,492,127 pair intervals explicitly unscreened. The end-to-end worker completed in about 4.39 seconds and also correctly returned `PARTIAL`; the registered source was `PARTIAL` with `PARTIAL_SOURCE_DATASET`, and bounded persistence reduced the run to 22 progress rows and 26 total outbox rows with a 38.1 MB post-shutdown runtime. Consumer acknowledgement/pruning, retention automation, and representative storage budgets remain open. These are single-machine development observations, not portable performance or accuracy claims.

Version 2.1 remains Experimental, non-operational, and in development publication state with no candidate or release date. It does not provide collision probability, CDM/covariance analysis, operational risk scoring, reports, alerts, or maneuver recommendations. Open v2.0 promotion gates remain open; v2.2 has not been authorized.

## Version 2.0.0 Preview Candidate

The Version 2.0.0 candidate adds strict orbital-data contracts and Experimental selected-object close-approach screening in a module Web Worker. Results include time of closest approach, geometric miss distance, relative speed, data and algorithm provenance, quality flags, and synchronized 3D playback.

This preview is non-operational. Collision probability remains unavailable because the current TLE catalog does not provide validated covariance and hard-body-radius inputs. The feature does not provide operational alerts, maneuver advice, or a complete catalog guarantee.

The candidate also adds reproducible dependency installation, validation and asset gates, a curated static deployment artifact, dependency and SBOM policy, hardened local-server defaults, accessibility checks, and deployment/rollback guidance. A 2026-07-20 startup fix makes the source/server-capable browser bootstrap prefer vendored dependencies and replaces silent module-load black screens with a retryable error state. External clean-clone CI, independent reviews, asset redistribution approval, performance promotion, public deployment, and rollback rehearsal remain open.

## Version 1.7.6

Improved launch and re-entry timeline freshness, bounded incremental CelesTrak updates, local SATCAT launch-date enrichment, and startup behavior. The globe and controls become interactive before deferred timeline and decay work completes.

## Version 1.7

Added the Solar System Overview, local JPL Horizons-derived visualization ephemeris, startup instrumentation, selected-satellite model framing, and timeline workflows.

## Earlier Releases

Earlier releases established TLE visualization, orbit/category filtering, selected-satellite controls, launch and re-entry timelines, local API documentation, model loading, and Earth/Moon/Mars visualization modes. The source repository retains the detailed historical engineering prompts; they are intentionally excluded from production static artifacts.
