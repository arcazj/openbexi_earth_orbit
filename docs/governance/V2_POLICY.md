# Version 2 Governance Policy

Last reviewed: 2026-08-30

## Planning Time Frames

Roadmap dates are ranges, not commitments. Re-estimate at each gate using measured capacity and validation results.

| Horizon | Typical range | Required outcome |
| --- | --- | --- |
| Now | 0-4 weeks | Reproducible builds, schemas, baselines, threat model, test fixtures |
| Next | 1-3 months | Deterministic capability behind an experimental flag with browser, API, and scientific validation |
| Later | 3-6 months | Independent scalability evidence, uncertainty support, reporting, alerts, and deployment hardening |
| Research | 6+ months | Independently reviewed models, avoidance studies, and external interoperability |

Work moves between horizons when evidence changes. A calendar date must identify an owner, dependencies, confidence, and a review date.

## Maturity Labels

| Label | Meaning | Permitted claim |
| --- | --- | --- |
| Prototype | Interfaces and algorithms may change; fixtures are incomplete | Demonstration only |
| Experimental | Reproducible and tested against an initial corpus; limitations are visible | Evaluation only |
| Validated | Versioned corpus, tolerances, provenance, performance, and independent review are complete | Validated within the published envelope |

`Validated` is not equivalent to flight safety, navigation suitability, or operational certification. `release/version.json` must retain `non-operational` unless a separately documented independent review explicitly changes it.

## Gate Ownership

- Engineering owner: reproducibility, security, observability, performance, rollback.
- Data owner: provenance, license, freshness, schema, quarantine, last-known-good recovery.
- Validation owner: corpus independence, expected values, tolerances, coverage gaps.
- Release owner: evidence bundle, maturity decision, approvals, deployment and rollback readiness.

One person may fill multiple roles for development builds, but a stable validated release requires an independent reviewer for validation evidence.

## Feature Flags

`release/feature-flags.json` is the auditable registry for gated v2 capabilities. Every enabled flag must identify its release version and allowed channel, scope, owner, scientific maturity, safety class, limitations document, and rollback behavior. An enabled flag may not claim a higher maturity or safety class than `release/version.json`.

The v2.0 `experimental_conjunction_screening` browser flag remains enabled for development/preview evaluation. `npm run version:sync` emits a browser-safe effective flag in `js/releaseVersion.js`; enablement fails closed unless configured state, release channel, maturity, and safety class agree. Disabling it leaves core satellite visualization and catalog diagnostics usable and requires no result migration because v2.0 screening is not persisted.

The v2.1 `experimental_full_catalog_screening` flag is server scoped and enabled only on the development channel. Server-only flags must not be emitted into browser release metadata or the curated static artifact. Disabling it stops worker admission while preserving private catalog/job/event history. `--no-v21-service` is the incident-level boundary that does not open the v2.1 store at all.

Version 2.2 development authorization covered GP/OMM catalog continuity, six-digit identity support, deterministic compatibility-tag enrichment/orbit reclassification, SATCAT-backed lifecycle events, revision-driven refresh, compatibility paths, and the bounded browser follow-up for unified filters/virtualized search, selected GP details, Mercator layering and render budgets, authoritative signed simulation time, visual satellite interpolation with failure recovery, bounded orbit/track refresh, ephemeris-range handling, tests, and obsolete-path removal. Visual interpolation and display caches do not change screening states or scientific claims. Repository-owner confirmation dated 2026-08-29 separately authorizes redistribution of the exact Version 2.2.1 bundled-source snapshot through repository-root GitHub Pages; it does not cover future refreshes or promote v2.0/v2.1.

The v2.3 `experimental_tracked_object_catalog` browser flag is enabled only for development. It authorizes local construction and evaluation of a SATCAT-scoped searchable inventory, independent orbit/object-type/history/tag filters, metadata-only details, explicit population accounting, lazy content-addressed chunks, allowlisted read APIs, static packaging, and opt-in daily reconciliation. Version 2.3.1 adds client-derived position, reported-RCS, owner/country, launch-year, launch-site, provider-status, and designator/tag facets only for exact orbit `ALL` plus object type `DEBRIS`, without changing the tracked Version 2.3.0 schema or manifest/chunk API; ordinary filter behavior remains independent outside that special panel. The configured position scope is `active` plus three event-specific debris collections, explicitly a partial positioned-debris subset. Missing GP is a propagation-availability fact, not permission to synthesize an orbit. `ALL` is bounded to every accepted record in the selected current/history scope of the bundled SATCAT snapshot; it is not a provider-completeness or physical-debris claim. Selected-object screening summary/export fields may report the current tracked denominator, GP-eligible numerator, metadata-only exclusions, and their ratio only as input coverage; they must not be labeled pair-screening completeness or collision probability. If the tracked manifest is unavailable or slow, those tracked/exclusion/ratio fields remain unknown rather than implying zero exclusions or complete coverage. Disabling the flag restores the v2.2 GP-only browser path without deleting audit artifacts.

The optional server may expose tracked bytes only while manifest, metadata, referenced chunks, pointer revisions, and current GP/SATCAT source lineage are coherent. Any inconsistency returns bounded `503 TRACKED_CATALOG_UNAVAILABLE` across tracked API and equivalent `server.py` static aliases, degrades health, and leaves the browser GP-only; it must never be treated as a partial tracked result. Plain static deployment remains subject to the curated builder's equivalent frozen-artifact gate.

Repository owner `arcazj` separately approved one publication of the exact final post-recording Version 2.3.1 source, manifest, metadata, quarantine, chunks, validation, and static-artifact bytes through `origin/master` in `arcazj/openbexi_earth_orbit` and repository-root GitHub Pages. This does not extend the Version 2.2.1 approval by derivation and does not cover a later refresh, rebuild, changed byte, or different channel. It also does not approve a candidate/stable release or authorize Pc/CDM/covariance, alert, report, or maneuver capabilities. The rollback rehearsal remains pending under a waiver for this publication only; independent review and the v2.0, v2.1, and v2.2 historical checklist gates remain open beside `docs/engineering/RELEASE_CHECKLIST_V2_3.md`.

## Data and Result Claims

- An implemented adapter is not an admitted provider. Provider license, access, retention, redistribution, integrity, cadence, and owner records must be approved independently.
- A successfully executed job is not necessarily a complete scientific result. API/job state and scientific result status are separate; partial coverage must remain visible.
- Exact-looking TCA and miss distance remain geometric results under the stated source/model. They do not imply collision likelihood.
- Missing covariance or hard-body radius must remain unavailable, never zero or inferred.
- Missing or small radar cross-section is catalog metadata, not object diameter. It must neither exclude a record nor be converted into a physical-size claim.
- No mass or weight filter may be inferred from radar cross-section or `physical_size_estimate`; the current admitted sources do not provide authoritative mass.
- Red rendering denotes authoritative debris object type only. It is not a hazard, collision-risk, proximity, physical-size, mass, or radar-cross-section scale.
- A complete local SATCAT accounting statement is not a provider-completeness statement. Publish received, accepted, duplicate, quarantine, current/history, propagatable, and metadata-only counts with the source revisions and `provider_completeness_claim: false`.
- Static/browser, loopback single-node, hosted multi-user, validated scientific, and operational capabilities are separate promotion boundaries.

## Current Gate State

Version `2.3.1` is `development`, `Experimental`, and `non-operational`, with null candidate/release dates. The tracked inventory contains all 70,474 accepted rows in the bundled SATCAT snapshot: 34,960 current and 35,514 `history_total`; all history-scope records are currently decay-dated and `absent` is zero. Only the 16,470 records joined to validated current GP/OMM are propagatable; 54,004 are metadata-only, including 18,490 current metadata-only records. All 12,490 current and 23,348 historical debris records are metadata-only, so the frozen real scene has zero positioned debris. The four-group live attempt at `2026-08-30T20:33:29Z` returned HTTP 503, left `source_scope_verified: false`, retained actual `catalog_source_groups: [active]`, and preserved the last-known-good bytes. These exact values describe the frozen development snapshot, not an upstream or future invariant. One exact-byte public repository/Pages publication is approved. Clean-clone evidence, current-source admission, representative named-hardware performance, independent scientific/security review, backup/restore, and rollback rehearsal remain open; the rollback gap is waived only for this publication. Collision probability, CDM/covariance analysis, operational reporting, alert delivery, and maneuver recommendations remain outside the authorized scope.
