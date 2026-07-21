# Release Notes

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
