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
- a reconciliation/full GP, TLE, or SATCAT replacement is promoted against an established catalog of at least 1,000 records while either candidate size or canonical NORAD overlap is below 75%; `--force` bypasses this guard; or unattended `maybe-update`/server operation gains a shrink override;
- changed-artifact backups can collide, fail to retain the newest seven per artifact, or rotate a newer backup before an older one; an accepted `304` fails to reset due age or changes data/revision/backup state;
- `/api/data-update-status` loses persisted GP/TLE/SATCAT/launch/decay failure history after restart, omits nested cycle errors, or exposes credential-like/control-character content without recursive public sanitization;
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

1. Disable scheduled updates with `--no-data-update` or stop `server.py` before changing generated data. Confirm `/api/data-update-status` reports the worker stopped/disabled and no update lock is owned by a live process.
2. Preserve logs, `release/version.json`, the complete public `/api/data-update-status` response (composite `data_revision`, compatibility `catalog_revision`, all per-dataset revisions and restart-persistent errors, and recursively redacted nested results), source revision, GP tag-enrichment source/tag-map revisions and counts, and SHA-256 hashes for current GP, TLE compatibility, SATCAT, launch, decay, and metadata files. Preserve private raw diagnostics only in an access-controlled location; do not copy secrets into the release record.
3. Preserve the failed provider response only in an approved private evidence location; do not commit credentials, private paths, or data whose redistribution is unapproved.
4. Keep the browser/server in an explicit degraded or offline state while the artifact set is inconsistent. Do not label legacy TLE fallback as complete current coverage.

## Restore Last-Known-Good Data

1. Select one coherent archived artifact set. GP JSON and metadata, launch JSON and metadata, decay JSON and metadata, SATCAT provenance, and any compatibility TLE files must come from the same recorded promotion decision.
2. Verify the archive hashes before restoration. Do not combine a new metadata sidecar with an older data file.
3. Restore through the repository's atomic promotion/backup workflow. Select the intended collision-safe backup by artifact and timestamp/suffix; the automatic rotation retains only the newest seven matching backups per artifact. Do not hand-edit generated orbital records.
4. Run the focused data/API/browser tests, then `npm run check`, `npm test`, and `npm run build` before serving the restored artifact.
5. Restart the local server if used, confirm `/api/gp-metadata` matches the restored GP sidecar, and confirm `/api/data-update-status` names the restored composite and per-dataset revisions plus degraded/recovery history truthfully. When GP metadata is absent, a packaged TLE file larger than the empty `[]` sentinel yields `fallback-tle`; treat that as availability only and validate the TLE separately. Without such a file require `unavailable`; with GP metadata present require normal `current`/`partial`/`degraded` evaluation. Force clients/CDNs to revalidate the composite data revision.

## Application Rollback

If the mixed-format or browser-state runtime itself is unsafe, restore one complete checksummed prior application artifact and its matching packaged data. Preserve the 2.2 artifacts for diagnosis. Do not combine an older `index.html` with newer category, clock, motion, ephemeris, menu, CSS, or share-state modules. A Version 2.1 application may use its legacy TLE snapshot only; it cannot safely consume 2.2 mixed GP records or six-digit-only objects. The reduced coverage must remain visible and must not be used as evidence that no newer launches or conjunctions exist.

After an application rollback, verify the restored default and shared filter behavior, selected details, Globe/Mercator interaction, signed pause/forward/reverse time, selected satellite propagation, Solar System range handling, and absence of unintended data/provider requests. Older shared links may use the bounded legacy debris compatibility input; they must not inject unknown category or local-path values.

Do not delete or downgrade the Version 2.1 runtime database. Stop the service and preserve the complete private runtime directory as required by `ROLLBACK_V2_1.md`.

## Re-enable Updates

Re-enable scheduled or manual promotion only after the defect has a regression test, all replacement artifacts validate coherently, request guards remain intact, and the data owner approves the provider/schema response. Recheck exact-identity enrichment, orbit classification, one-request-per-format reconciliation, one-fetch SATCAT derivation, complete-only pruning, the 1,000-record dual 75% candidate-size/NORAD-overlap guard, the absence of a scheduler override, history retention, accepted-304 due-age reset, collision-safe seven-backup rotation, restart-persistent/redacted five-dataset status, stale-lock handling, retry/reset, and graceful stop. For a browser defect, rerun the documented visualization matrix. Record commands, hashes, counts, newest dates, reconciliation metadata, quarantine reasons, operator, reviewer, elapsed recovery time, cache invalidation, and any data loss or coverage reduction. Use `--allow-large-catalog-shrink` only in a reviewed direct `export-gp`, `export-tle`, or `refresh-satcat` recovery when the below-threshold replacement is intentional; `--force` is not a substitute.

Until an archived rehearsal demonstrates these steps, rollback readiness remains an open v2.2 gate.
