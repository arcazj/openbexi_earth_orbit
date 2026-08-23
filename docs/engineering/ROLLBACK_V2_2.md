# v2.2 GP/OMM and Browser Continuity Rollback

## Scope

This runbook covers the Version 2.2 preferred GP/OMM catalog, SATCAT-backed launch catalog, confirmed-decay catalog, revision-driven browser refresh, compatibility paths, and the unified filter/details/layering/time/motion browser follow-up. It supplements `ROLLBACK.md` and `ROLLBACK_V2_1.md`; it does not change the durable Version 2.1 SQLite rollback boundary.

Version 2.2 is Experimental, non-operational, and in development. This procedure has not satisfied a target-deployment rehearsal gate.

## Abort Triggers

Abort promotion of a refreshed dataset or application build when any of these occur:

- GP/OMM parsing changes identifiers, synthesizes TLE, selects an older duplicate epoch, or admits an unsupported frame/theory;
- GP group/tag enrichment matches a truncated/different identity, loses its source/tag-map revision or counts, overwrites a meaningful unmatched tag, or supplies orbital state; numeric orbit reclassification mislabels representative navigation/GEO/LEO/HEO records;
- a default incremental update repeats overlapping source requests or restores the removed `last-30-days` request instead of one `active` request;
- the replacement loses valid six-digit objects or regresses the newest orbital, launch, or confirmed-decay date without an explained provider correction;
- an HTTP, schema, quarantine-threshold, partial-write, or metadata failure replaces last-known-good artifacts or is reported as complete;
- a details-only timeline record attempts propagation, or cache/revision refresh duplicates or hides events;
- category controls/count/search/visibility diverge, explicit share state is lost, or debris/object classification silently excludes records;
- simulation layers disagree on UTC, reverse/pause is incorrect, a valid JPL-derived position is extrapolated beyond the bundled range, or visual interpolation reaches screening/export state;
- stale sampling work commits after a time/direction/catalog change, selected mesh/material identity churns, or motion produces material frame-to-frame snapping;
- MEO-first partial startup is lost, a filter-eligible state proxy enters the batched Globe point layer before a finite current-epoch position commits, filter re-admission exposes an old sample after a paused UTC jump, point-layer replacement/mode switching loses or duplicates markers, or resource cleanup disposes caller-owned material/texture or leaks loader-owned resources; failed propagation leaves stale/Earth-center marker or model current-position geometry, postpones its retry indefinitely, or cannot recover at the same simulation UTC under an allowed filter; Mercator repeats catalog propagation, violates its detailed/density/redraw/label/track bounds, retains a stale track after rebuild failure, retries the same failed instant every redraw, selected-orbit refresh recreates roots/materials every frame, or an invalid selected-orbit resample erases the last finite path;
- the hidden compatibility selector materializes filtered/full-catalog options instead of retaining only `None` plus the active NORAD;
- consolidated GP details duplicate or interpret provider markup, the combined Mercator overlay falls beneath a timeline/detail visualization layer, or Mercator-only fullscreen hides or blocks the fixed `Time x`/server controls;
- the removed byte-identical `obj/loral.glb` payload is restored or aliases stop resolving through canonical `obj/SSL_1300.glb`;
- static packaging omits GP/event data or attempts an unapproved remote runtime fallback;
- required unit, Python, browser, static-artifact, version, or data-integrity checks fail.

## Immediate Containment

1. Disable scheduled updates or stop `server.py` before changing generated data.
2. Preserve logs, `release/version.json`, the complete `/api/data-update-status` response (composite `data_revision`, compatibility `catalog_revision`, and all per-dataset revisions), source revision, GP tag-enrichment source/tag-map revisions and counts, and SHA-256 hashes for current GP, TLE compatibility, SATCAT, launch, decay, and metadata files.
3. Preserve the failed provider response only in an approved private evidence location; do not commit credentials, private paths, or data whose redistribution is unapproved.
4. Keep the browser/server in an explicit degraded or offline state while the artifact set is inconsistent. Do not label legacy TLE fallback as complete current coverage.

## Restore Last-Known-Good Data

1. Select one coherent archived artifact set. GP JSON and metadata, launch JSON and metadata, decay JSON and metadata, SATCAT provenance, and any compatibility TLE files must come from the same recorded promotion decision.
2. Verify the archive hashes before restoration. Do not combine a new metadata sidecar with an older data file.
3. Restore through the repository's atomic promotion/backup workflow. Do not hand-edit generated orbital records.
4. Run the focused data/API/browser tests, then `npm run check`, `npm test`, and `npm run build` before serving the restored artifact.
5. Restart the local server if used, confirm `/api/gp-metadata` matches the restored GP sidecar, and confirm `/api/data-update-status` names the restored composite and per-dataset revisions plus degraded/recovery history truthfully. When GP metadata is absent, a packaged TLE file larger than the empty `[]` sentinel yields `fallback-tle`; treat that as availability only and validate the TLE separately. Without such a file require `unavailable`; with GP metadata present require normal `current`/`partial`/`degraded` evaluation. Force clients/CDNs to revalidate the composite data revision.

## Application Rollback

If the mixed-format or browser-state runtime itself is unsafe, restore one complete checksummed prior application artifact and its matching packaged data. Preserve the 2.2 artifacts for diagnosis. Do not combine an older `index.html` with newer category, clock, motion, ephemeris, menu, CSS, or share-state modules. A Version 2.1 application may use its legacy TLE snapshot only; it cannot safely consume 2.2 mixed GP records or six-digit-only objects. The reduced coverage must remain visible and must not be used as evidence that no newer launches or conjunctions exist.

After an application rollback, verify the restored default and shared filter behavior, selected details, Globe/Mercator interaction, signed pause/forward/reverse time, selected satellite propagation, Solar System range handling, and absence of unintended data/provider requests. Older shared links may use the bounded legacy debris compatibility input; they must not inject unknown category or local-path values.

Do not delete or downgrade the Version 2.1 runtime database. Stop the service and preserve the complete private runtime directory as required by `ROLLBACK_V2_1.md`.

## Re-enable Updates

Re-enable scheduled or manual promotion only after the defect has a regression test, all replacement artifacts validate as one revision, request guards remain intact, and the data owner approves the provider/schema response. Recheck exact-identity tag enrichment, orbit classification, and one-request incremental behavior for a data defect. For a browser defect, rerun category/search virtualization, point-layer membership and density switching, selected-details, layering, signed-clock, interpolation failure/recovery, shared-position Mercator detailed/density budgets, in-place orbit refresh, ephemeris-boundary, static-network, and scientific-separation cases before redeployment. Record commands, hashes, counts by format, newest dates, quarantine reasons, operator, reviewer, elapsed recovery time, cache invalidation, and any data loss or coverage reduction.

Until an archived rehearsal demonstrates these steps, rollback readiness remains an open v2.2 gate.
