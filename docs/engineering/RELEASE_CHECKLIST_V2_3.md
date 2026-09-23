# Version 2.3.1 Tracked-Object Catalog Release Checklist

Version `2.3.1` is a `development` build with Experimental scientific maturity and a non-operational safety class. It is not a release candidate or stable release. Repository owner `arcazj` supplied the required new byte-specific decision for one publication of the final post-recording Version 2.3.1 closure through `origin/master` in `arcazj/openbexi_earth_orbit` and repository-root GitHub Pages. Future changed/refreshed bytes and other channels require a new review.

## Release Identity

- [x] `release/version.json`, package metadata, feature flags, and generated browser metadata identify Version 2.3.1 development with null candidate and release dates.
- [x] `experimental_tracked_object_catalog` is independently disableable and falls back to the Version 2.2 GP/OMM browser path.
- [ ] A named reviewer has approved the final Version 2.3.1 checksum corpus and scientific claims.

## Frozen Development Snapshot

- Tracked revision: `sha256:7c1a20d93d1eb5faf7e2b964b13c7b4f0478f2eec95cc701ea1b1e57ef0d730c`.
- Local accounting: 70,474 accepted = 34,960 current + 35,514 `history_total` = 16,470 propagatable + 54,004 metadata-only. All 35,514 history-scope rows are decay-dated `historical`, `absent` is zero, current propagatable is 16,470, current metadata-only is 18,490, and quarantine/duplicate counts are zero.
- Current types: 19,989 payload, 12,490 debris, 2,425 rocket body, 0 mission-related, and 56 unknown. Current metadata-only count is 18,490.
- All 12,490 current and 23,348 historical debris records are metadata-only with `NO_CURRENT_ELEMENTS`; the frozen real scene has zero positioned debris.
- Current debris coverage includes 7,852 published RCS values below 0.1 m2 and 3,123 missing RCS values. These are metadata counts, not size estimates.
- Historical Version 2.3.0 referenced data closure: 13 files and 74,565,443 bytes. The current Version 2.3.1 closure is 13 files and 74,565,511 bytes; the largest chunk remains 24,215,754 bytes. `provider_completeness_claim` is false and the expected upstream/provider count is unknown.
- Final post-hardening local verification passed 59 of 59 JavaScript unit test files. Python discovered 129 cases and completed in 32.119 seconds with 128 passes, one intentional Windows directory-symlink capability skip, and zero failures. The complete 47-declaration Playwright matrix finished in exactly 532467.509 ms (8:52.468, or 8.874458483 minutes) with 28 passes, 19 explicit-reason intentional skips, zero unexpected failures, zero flaky results, zero report errors, and one attempt each. Syntax validation covered 136 JavaScript files and dependency audit reported zero vulnerabilities. The final fixed-point static build contains 135 files totaling 280,508,022 bytes. The strict Version 2.3.1 corpus/check passes and binds 307 artifacts, 13 executable declarations, and 64 evidence records. Version 2.3.0 results remain historical and are not promoted as 2.3.1 evidence.

## Data Contract

- [x] The tracked-object manifest represents every accepted row in the configured bundled SATCAT snapshot and explicitly sets `provider_completeness_claim` to false.
- [x] `total == current + history_total`, `total == propagatable + metadata_only`, and `current == current_propagatable + current_metadata_only` reconcile exactly across the manifest and referenced chunks. Decay-dated `historical` and membership-`absent` are bounded, potentially overlapping diagnostics within `history_total`, not additive partitions.
- [x] Object type, orbit class, lifecycle state, observation transition, and propagation availability remain independent fields.
- [x] Debris records are retained regardless of small or missing radar cross-section; no physical diameter is inferred from RCS.
- [x] No mass/weight field or filter is inferred from RCS or `physical_size_estimate`; RCS remains provider-reported radar cross-section only.
- [x] Six-digit, longer numeric, and Alpha-5-compatible NORAD identities remain lossless strings and duplicate resolution is deterministic.
- [x] Only validated newest-epoch GP/OMM records are marked propagatable. SATCAT-only records never receive synthetic elements or positions.
- [x] Preferred GP scope is `active` plus three event-specific debris groups as a partial positioned subset. Metadata separates configured `source_groups` from accepted-byte `catalog_source_groups`, and tracked provenance carries the latter.
- [x] Content-addressed chunks are hash/count verified before the manifest is atomically promoted; failure and no-change paths preserve the last-known-good catalog without backup churn.
- [x] Only complete, guarded SATCAT reconciliation can move an omitted current object into historical/absent state; incremental updates do not prune.

## Browser And API

- [x] The default MEO view is interactive before tracked chunks load, and rapid filter changes cannot publish stale asynchronous results.
- [x] Orbit class, object type, lifecycle/history scope, and catalog tag filters are independent and share-state compatible. Only exact orbit `ALL` plus object type `DEBRIS` activates and restores position/RCS/owner/year/site/status/designator facets.
- [x] `ALL` includes the entire selected tracked scope; Debris includes all accepted `DEBRIS` records, including small and missing-RCS entries.
- [x] Counts distinguish provider-current, historical, filtered, propagatable, metadata-only, render-ready, and quarantined records.
- [x] The UI uses tracked-object terminology and a compact payload-cyan/debris-red/rocket-body-amber/mission-related-green/unknown-gray/selected-white key. Detailed Globe samples only the alpha silhouette from the bundled same-origin `icons/ob_satellite.png` and applies the exact vertex color; a procedural white-alpha circle is the icon-load-failure fallback only. Detailed Mercator adds type glyphs/selection rings, while dense Mercator is color-only. Red denotes authoritative debris type only, never hazard, collision risk, proximity, physical size, mass, or RCS.
- [x] The Globe renders 0 through 499 drawn objects at a fixed 16 screen pixels with `sizeAttenuation: false`; at 500 it removes the map, restores `sizeAttenuation: true`, and switches to compact density size `0.025`. Mercator remains detailed through 1,000 drawable objects and switches to density above 1,000.
- [x] Metadata-only objects are searchable and selectable for details, but orbit/model/footprint/ground-track/screening controls remain unavailable. An authoritative current `NO_CURRENT_ELEMENTS` record suppresses an older same-NORAD GP mesh and screening entry.
- [x] Globe and Mercator layers contain only finite current-epoch positions and never show metadata-only or invalid objects at Earth center.
- [x] `/api/tracked-objects`, its manifest/chunk routes, and equivalent `server.py` static aliases reject unsafe/traversal/unreferenced request names with `404`; any referenced-chunk path escape or other manifest/metadata/closure/revision/raw GP-SATCAT hash/current-source-lineage incoherence fails the whole tracked route family closed with bounded `503 TRACKED_CATALOG_UNAVAILABLE`, and the client remains GP-only. Responses use the exact validated manifest/metadata snapshot so concurrent replacement cannot mix generations.
- [x] `/api/data-update-status` includes tracked pointer validity, manifest/metadata revision agreement, current source-lineage agreement, status, counts, due clock, retry/error state, and composite data revision without exposing private paths or credentials. Live OpenAPI and static Swagger include the tracked `503` response.

## Scale And Static Artifact

- [x] The 120,000-record scale guard measured 30.82 ms build, 154.15 ms filter, 51.28 ms search, 228.97 ms facet construction, 465.23 ms total, and 77.10 MiB heap growth within its conservative ceilings.
- [x] Real-snapshot tests assert coverage invariants and representative small/missing-RCS debris without pinning brittle provider counts.
- [x] Static build validation packages the tracked manifest plus only its referenced chunks, verifies every chunk hash/count/type/scope/identity partition, and rejects packaged GP byte/metadata or tracked GP/SATCAT lineage drift.
- [x] Source, browser JavaScript, tracked-catalog total, and per-chunk budgets pass with reviewed Version 2.3.1 ceilings. `index.html` is 307,962 of 315,000 bytes; included browser JavaScript is 864,848 bytes across 51 files against its 875,000-byte ceiling; the referenced tracked closure is 74,565,511 of 82,000,000 bytes; and the largest chunk is 24,215,754 of 27,000,000 bytes.
- [x] The complete JavaScript, Python, Playwright, fixed-point static build, version, vendor, strict Version 2.3.1 validation, and dependency-audit gates pass on the final post-hardening tree.

## Operations And Governance

- [x] Daily opt-in server maintenance requests each configured GP group at most once, then rebuilds the tracked catalog from the coalesced SATCAT/accepted-GP cycle without an additional provider request.
- [x] Active-only source-scope migration remains due and validator-free until one coherent four-group success. Failed, partial, quarantined, or `304`-only migration preserves last-known-good bytes and `source_scope_verified: false`; reconciliation cannot prune before verification.
- [x] The `2026-08-30T20:33:29Z` four-group live attempt returned HTTP 503, promoted no partial GP response, retained `catalog_source_groups: [active]`, and preserved the last-known-good GP bytes/revision. The later tracked provenance correction retained its catalog revision, chunks, and counts while producing new gated metadata/pointer bytes.
- [x] Accepted `304`, byte-identical input, provider failure, shrink rejection, and interrupted publication preserve the prior manifest and referenced chunks.
- [x] Scheduler stop, restart-persistent status, bounded retry, backup retention, and rollback-referenced chunk retention have deterministic tests.
- [x] Screening metadata, visible summary, and frozen exports report the tracked population excluded for missing current elements; unavailable/slow manifest state remains unknown, and no collision-probability or full-population coverage claim is made.
- [x] Data/release/repository owner `arcazj` approved at `2026-08-31T01:55:18Z` the exact final post-recording Version 2.3.1 manifest, 13-file referenced closure, metadata, quarantine, validation corpus/sidecar, static artifact, and current source bytes for one Git push to `origin/master` plus repository-root `https://arcazj.github.io/openbexi_earth_orbit/` publication. The explicit basis is `commit and push to github`; future bytes and channels are excluded.
- [ ] Rollback rehearsal has restored the Version 2.2 GP-only path and one coherent prior Version 2.3 tracked manifest. It was not performed; owner authorization supplies a waiver only for this one publication, so the gap remains open.

## Decision

Current decision: **The exact final post-recording Version 2.3.1 bytes are authorized for one `origin/master` and repository-root GitHub Pages publication**. Version 2.3.1 remains development, Experimental, and non-operational. Candidate/stable promotion, operational use, independent scientific/security review, successful live-provider rehearsal, provider completeness, and every later byte/channel remain open. Rollback rehearsal is pending under the one-publication waiver and is not represented as completed evidence.
