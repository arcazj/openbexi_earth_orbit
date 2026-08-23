# Version 2 Governance Policy

Last reviewed: 2026-08-22

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

Version 2.2 development authorization covers GP/OMM catalog continuity, six-digit identity support, deterministic compatibility-tag enrichment/orbit reclassification, SATCAT-backed lifecycle events, revision-driven refresh, compatibility paths, and the bounded browser follow-up for unified filters/virtualized search, selected GP details, Mercator layering and render budgets, authoritative signed simulation time, visual satellite interpolation with failure recovery, bounded orbit/track refresh, ephemeris-range handling, tests, and obsolete-path removal. Visual interpolation and display caches do not change screening states or scientific claims. This scope does not promote v2.0 or v2.1, approve a candidate/release, admit public redistribution, or authorize Pc/CDM/covariance, alert, report, or maneuver capabilities. The v2.0 and v2.1 checklists remain open beside `docs/engineering/RELEASE_CHECKLIST_V2_2.md`.

## Data and Result Claims

- An implemented adapter is not an admitted provider. Provider license, access, retention, redistribution, integrity, cadence, and owner records must be approved independently.
- A successfully executed job is not necessarily a complete scientific result. API/job state and scientific result status are separate; partial coverage must remain visible.
- Exact-looking TCA and miss distance remain geometric results under the stated source/model. They do not imply collision likelihood.
- Missing covariance or hard-body radius must remain unavailable, never zero or inferred.
- Static/browser, loopback single-node, hosted multi-user, validated scientific, and operational capabilities are separate promotion boundaries.

## Current Gate State

Version `2.2.0` is `development`, `Experimental`, and `non-operational`, with null candidate/release dates. The mixed GP/OMM, lifecycle-event, and bounded browser-correctness work is available only for local development evaluation until its checklist is completed. Clean-clone evidence, current-source admission, public redistribution review, representative performance, independent scientific/security review, backup/restore, public deployment, and rollback rehearsal remain open. Collision probability, CDM/covariance analysis, operational reporting, alert delivery, and maneuver recommendations remain outside the authorized scope.
