# Version 2.3.1 Tracked-Object Catalog Rollback

This runbook covers the Version 2.3 tracked-object manifest, Version 2.3.1 facets/colors/four-group GP scope, content-addressed chunks, browser metadata index, API routes, scheduler integration, and their relationship to the existing GP/OMM visualization. It supplements the general, Version 2.1 service, and Version 2.2 browser/data rollback documents.

The rollback rehearsal was not completed before the final Version 2.3.1 publication decision. Repository owner `arcazj` waived that prerequisite only for the single approved `origin/master` and repository-root GitHub Pages publication. This records no successful rehearsal evidence; the gap remains open and applies again to any later publication or promotion.

## Abort Triggers

Disable or roll back the tracked-object feature when any of these conditions occurs:

- the manifest/chunk hashes, record counts, or current/history accounting invariants disagree;
- accepted SATCAT rows are silently omitted, small or missing-RCS debris is filtered out, or duplicate identity resolution is nondeterministic;
- a metadata-only record receives a synthetic orbit, scene marker, footprint, ground track, detailed model, or screening state;
- an invalid or stale position appears at Earth center or remains visible after a simulation-time revision;
- orbit class, object type, lifecycle scope, and tag filters contaminate one another or a stale asynchronous request overwrites the latest selection;
- debris facets activate outside exact orbit `ALL` plus object type `DEBRIS`, fail to round-trip that parent state, or add/infer mass or weight;
- red renders a non-debris record or is labeled as hazard, collision risk, proximity, physical size, mass, or RCS rather than authoritative debris type;
- a configured GP group fails, quarantines, or returns an unsafe migration `304` yet partial bytes are promoted, `source_scope_verified` becomes true, or accepted-byte `catalog_source_groups` are replaced by the desired configuration;
- an unreferenced chunk, path traversal, symlink escape, provider URL, or private filesystem path is served by the chunk API;
- an incoherent manifest/metadata/chunk closure or stale GP/SATCAT lineage returns tracked bytes instead of bounded `503 TRACKED_CATALOG_UNAVAILABLE`, or the client accepts that error as a partial tracked index instead of staying GP-only;
- an incomplete, failed, or interrupted build replaces the last-known-good manifest;
- default MEO startup, large-filter interaction, search, memory, or static-artifact budgets exceed the reviewed limits; or
- the published bytes fall outside the recorded provider-data redistribution approval.

## Immediate Containment

1. Stop scheduled updates and preserve the public data-update status plus private logs in an access-controlled location.
2. Set `experimental_tracked_object_catalog` to false, regenerate browser release metadata, rebuild, verify, and deploy the GP-only fallback artifact.
3. Do not delete the failing manifest, referenced chunks, source snapshots, quarantine report, or metadata until hashes and failure evidence are recorded.
4. If the core GP/OMM catalog is also suspect, follow `ROLLBACK_V2_2.md` and restore one coherent GP/TLE/SATCAT/lifecycle set.

## Restore A Prior Tracked Revision

1. Select a previously verified manifest whose source revisions, schema, chunk hashes, counts, and redistribution approval are recorded.
2. Verify every referenced current and historical chunk before promotion. Never reconstruct fixed-name chunks from partial backups.
3. Atomically promote the prior manifest only after all referenced chunks are present. Retain newer failed bytes for investigation outside the served pointer.
4. Confirm `/api/tracked-objects/manifest`, every referenced chunk, `/api/data-update-status`, and the static build expose the same tracked revision.
5. Clear browser caches or advance the composite data revision so open pages cannot retain an incompatible metadata index.

## Verification

After rollback, verify:

- default MEO startup remains GP-priority and no tracked chunk is required before first interaction;
- representative payload, debris, rocket-body, unknown, small-RCS, and missing-RCS records match the restored manifest;
- exact `ALL` plus `DEBRIS` exposes the bounded position/RCS/owner/year/site/status/designator facets while other orbit/type states do not; matched, positioned, and metadata-only counts reconcile;
- object-type colors match the documented key, and the real frozen snapshot draws zero debris because all 12,490 current and 23,348 historical debris records are metadata-only;
- metadata-only records are searchable/details-only and absent from Globe, Mercator, propagation, and screening populations;
- all count invariants reconcile and current/history scope changes do not leak stale asynchronous results;
- chunk allowlisting rejects unreferenced names and traversal attempts, while manifest/metadata/closure/revision/source-lineage incoherence makes every tracked API and `server.py` static alias return bounded `503 TRACKED_CATALOG_UNAVAILABLE` and leaves the client GP-only;
- accepted `304`, provider failure, interrupted build, and unchanged input leave the restored manifest byte-identical; and
- an unverified active-only GP scope remains due and validator-free after failed, quarantined, partial, or `304`-only migration, while only a coherent four-group success may mark the scope verified; and
- the full Version 2.3.1 unit, Python, browser, static-build, budget, version, vendor, and validation gates pass.

## Re-enable Criteria

Re-enable tracked-object loading or scheduled promotion only after the defect has a deterministic regression test, a coherent manifest and chunk set passes all invariants, performance remains within the reviewed scale budgets, and any new provider-derived bytes have explicit redistribution approval. Record the operator, reviewer, source and catalog revisions, hashes, counts, quarantines, elapsed recovery time, cache action, and any coverage reduction.
