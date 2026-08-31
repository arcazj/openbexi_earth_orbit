# Rollback Policy

Last reviewed: 2026-08-30

## Abort Triggers

Rollback or disable the affected feature when there is data corruption, schema incompatibility, sustained error-budget breach, security exposure, unexplained scientific divergence, unavailable last-known-good data, or a material performance regression.

## Application Rollback

1. Stop rollout and preserve logs, traces, version records, and checksums.
2. Repoint hosting to the previous immutable artifact; do not rebuild the old commit during an incident.
3. Confirm `/api/health`, the main page, dependency loading, and the browser smoke journey.
4. Invalidate only caches whose content changed.
5. Record incident time, scope, decision owner, restored version, and follow-up issue.

## Data Rollback

1. Quarantine the suspect dataset and metadata without overwriting it.
2. Atomically promote the previous checksum-verified last-known-good dataset.
3. Restore its original source and freshness timestamps; never label old data as newly fetched.
4. Re-run schema and scientific validation before resuming scheduled updates.

## Compatibility

Every schema migration must state whether the previous application can read the new data. Destructive migrations require dual-read or dual-write support during the rollback window. Stable releases keep at least the previous application artifact and data snapshot for the documented retention period.

## v2.0 Experimental Screening

The `experimental_conjunction_screening` record in `release/feature-flags.json` provides a build-time disable procedure, not a live runtime kill switch. Set `enabled` to `false`, run `npm run version:sync`, build and checksum a new artifact, run the release checks, and deploy that disabled artifact. The rollback leaves satellite visualization and catalog diagnostics available. No event-store rollback, catalog rewrite, or schema downgrade is required because v2.0 does not persist screening results. A prebuilt disabled artifact or external runtime flag would be required for immediate disablement without a rebuild; neither exists in v2.0.

## v2.1 Durable Service

The optional v2.1 service persists private catalog snapshots, jobs, event revisions, outbox messages, and audit records. Its immediate incident switch is to stop the server and restart with `--no-v21-service`; the static application and v2.0 selected-object workflow remain available. Do not delete or downgrade the SQLite store during application rollback. Preserve and checksum the complete runtime directory while the service is stopped.

Detailed worker recovery, feature disablement, backup/restore, data-retention, and rehearsal steps are in `ROLLBACK_V2_1.md`. The v2.1 procedure is not yet a rehearsed release gate.

## v2.2 GP/OMM, Timeline, and Browser Continuity

Version 2.2 adds a preferred GP/OMM catalog, SATCAT-backed launch events, revision-driven timeline refresh, and a bounded browser follow-up for unified filters/details, Mercator layering, signed simulation time, visual interpolation, and ephemeris limits while retaining deprecated TLE compatibility. Restore only a coherent checksummed data/metadata revision and complete application artifact; never convert OMM to TLE, present the legacy fallback as complete current coverage, or mix an older entrypoint with newer state/time/motion modules. Detailed containment, last-known-good restoration, cache invalidation, application rollback, and rehearsal requirements are in `ROLLBACK_V2_2.md`.

## v2.3.1 Tracked-Object Catalog

Version 2.3 adds a feature-gated SATCAT-scoped metadata inventory, content-addressed current/history chunks, a manifest allowlist API, independent taxonomy filters, and a sixth scheduler/revision component. Version 2.3.1 adds the special all-debris facets, object-type colors, and atomic four-group GP scope. The immediate browser fallback is to disable `experimental_tracked_object_catalog`, regenerate release metadata, and deploy the verified Version 2.3.1 build in its GP-only path. Abort GP promotion when configured and actual catalog source groups are confused, `source_scope_verified` is asserted without a coherent four-group success, or a partial/failed/quarantined response changes accepted bytes. Preserve the failed-attempt metadata and last-known-good files. Do not delete the suspect manifest, quarantine, or chunks before preserving hashes and status evidence. Restore only a previously verified manifest after every referenced chunk passes byte, SHA-256, record-count, and accounting checks. Never point an old manifest at newly generated chunks or expose retained orphan chunks. If the underlying GP/SATCAT revision is suspect, also follow `ROLLBACK_V2_2.md`. Detailed containment, cache invalidation, restoration, and re-enable criteria are in `ROLLBACK_V2_3.md`.
