# Version 2 Governance Policy

Last reviewed: 2026-09-01

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

The v2.3 `experimental_tracked_object_catalog` browser flag is enabled only for development. It authorizes local construction and evaluation of a SATCAT-scoped searchable inventory, independent orbit/object-type/history/tag filters, metadata-only details, explicit population accounting, lazy content-addressed chunks, allowlisted read APIs, static packaging, and opt-in daily reconciliation. Version 2.3.1 added client-derived position, reported-RCS, owner/country, launch-year, launch-site, provider-status, and designator/tag facets without changing the tracked Version 2.3.0 schema or manifest/chunk API. Version 2.3.2 makes those facets available whenever `DEBRIS` is the sole object type and the orbit selection is nonempty; ordinary filter dimensions remain independent. It also adds a persistent coverage HUD, virtualized sortable availability views, direct Globe/Mercator marker selection through the existing object-selection path, keyboard navigation, focus restoration, and narrow-viewport behavior. The configured position scope is `active` plus three event-specific debris collections, explicitly a partial positioned-debris subset. Missing GP is a propagation-availability fact, not permission to synthesize an orbit. `ALL` is bounded to every accepted record in the selected current/history scope of the bundled SATCAT snapshot; it is not a provider-completeness or physical-debris claim. Selected-object screening summary/export fields may report the current tracked denominator, GP-eligible numerator, metadata-only exclusions, and their ratio only as input coverage; they must not be labeled pair-screening completeness or collision probability. If the tracked manifest is unavailable or slow, those tracked/exclusion/ratio fields remain unknown rather than implying zero exclusions or complete coverage. Disabling the flag restores the v2.2 GP-only browser path without deleting audit artifacts.

The optional server may expose tracked bytes only while manifest, metadata, referenced chunks, pointer revisions, and current GP/SATCAT source lineage are coherent. Version 2.3.2 scheduled maintenance operates in an isolated private revisioned candidate and replaces one private current pointer only after the entire candidate validates; cancellation, rejection, degradation, source drift, interruption, or pointer failure preserves the prior pointer and immutable checked-in data. API and equivalent `server.py` static routes resolve through the same pointer and fall back to the checked-in closure only when no pointer exists. Any tracked inconsistency returns bounded `503 TRACKED_CATALOG_UNAVAILABLE`, degrades health, and leaves the browser GP-only; it must never be treated as a partial tracked result. Plain static deployment remains subject to the curated builder's equivalent frozen-artifact gate.

Repository owner `arcazj` separately approved one publication of the exact final post-recording Version 2.3.1 source, manifest, metadata, quarantine, chunks, validation, and static-artifact bytes through `origin/master` in `arcazj/openbexi_earth_orbit` and repository-root GitHub Pages. That historical decision does not extend the Version 2.2.1 approval by derivation and does not cover any Version 2.3.2 refresh, rebuild, changed byte, or deployment. It also does not approve a candidate/stable release or authorize Pc/CDM/covariance, alert, report, or maneuver capabilities. The Version 2.3.1 rollback-rehearsal waiver applies only to that publication; independent review and every separate checklist gate remain open.

Repository owner `arcazj` separately approved exactly one publication of the final post-recording Version 2.3.2 repository source, checked-in data, validation, release-evidence, governance, documentation, and workflow bytes to `origin/master` after the pre-approval manifest SHA-256 warning `c456703d12602e83a73233f693cf684315565436d8c08c645a0b7e5d984d8177`. This is a source-only decision. The authenticated GitHub Pages API was switched from legacy branch-root publishing to `workflow` before the push, but the decision does not dispatch or approve the manual Pages artifact, remote deployment/attestation, or required-reviewer/self-review environment settings. It covers no private candidate, future refresh, later changed byte, different channel, candidate/stable promotion, scientific claim, or operational use. No rollback waiver is granted.

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

Version `2.3.2` is `development`, `Experimental`, and `non-operational`, with null candidate/release dates and one narrowly scoped `origin/master` source-publication approval. Two pinned no-network private imports exist and neither is pointer-selected. Exact-commit candidate `20260902T014734Z-9faea7cdb724` is `VALIDATED` and deliberately unpromoted, not quarantined; its raw revision `sha256:4fa944e1283feb2a8dd5a09e51c5d8c8fc332f4f96d0e119347afa994e1193f2` covers 24 artifacts/131,613,453 bytes with zero source-copy mismatches, while tracked revision `sha256:8fd7f619f16e714a9d170a8eb538a183e240051830430b09b1201bbf0d36e4a4` reports 70,475 total, 19,111 propagatable, 12,488 current debris, and 2,640 positioned GP debris. The distinct dirty-runtime candidate `20260902T011924Z-8c8d999bf6df` is `QUARANTINED` for malformed TLE metadata; it records 24 artifacts/131,692,789 bytes, zero import-time copy mismatches, and tracked revision `sha256:de60852484cc6ccee624380286080b993543ad6c412016710673ccd1b75f4cb7` with 70,532 total, 19,106 propagatable, 51,426 metadata-only, 12,488 current debris, and 2,640 positioned GP debris. The checked-in 12-file closure remains strict last-known-good `ef98cfe`, tracked revision `sha256:7c1a20d93d1eb5faf7e2b964b13c7b4f0478f2eec95cc701ea1b1e57ef0d730c`, with 70,474 total, 16,470 propagatable, 54,004 metadata-only, 12,490 current debris, and zero positioned debris. The Version 2.3.1 decision remains historical; the separate Version 2.3.2 source decision does not approve either private candidate or any Pages artifact. Local verification records 63/63 JavaScript unit files, 151 passes plus one intentional skip across 152 Python cases in 83.452 seconds, 49 Playwright declarations with 29 passes and 20 intentional skips in 595,996.319 ms, 147 syntax-checked JavaScript files, zero dependency vulnerabilities, passing release engineering, the reviewed source budget, and a passing 976.75 ms/95.89 MiB standalone 120k observation. Exact final static-artifact, rollback, and local-attestation values are retained in their dedicated evidence JSON and the validation manifest; remote verification remains false. The validation inventory is 334 artifacts, 17 executable contracts, and 94 evidence records, with exact manifest bytes bound only by the sidecar rather than self-embedded here. Remote Pages deployment/attestation, required-reviewer/self-review environment settings, clean-commit binding, named-hardware profiles, and independent scientific/security review remain pending. Passing the artifact-only workflow does not itself grant Pages approval. Collision probability, CDM/covariance analysis, operational reporting, alert delivery, maneuver recommendations, provider-universe completeness, and operational readiness remain outside the authorized scope.
