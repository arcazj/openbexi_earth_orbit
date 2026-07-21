# OpenBEXI Earth Orbit Roadmap

Last reviewed: 2026-07-20

## Purpose

This roadmap is based on the repository as it exists at the review date. It prioritizes **Conjunction Detection and Collision-Risk Assessment**, while preserving the project's current value as an educational satellite visualization tool.

The roadmap deliberately separates three capability levels:

1. **Close-approach screening**: deterministic comparison of two propagated trajectories and reporting of time of closest approach (TCA), miss distance, and relative velocity.
2. **Collision-likelihood assessment**: probability of collision (Pc) computed from validated state uncertainty, covariance, coordinate frames, and hard-body radii.
3. **Operational decision support**: risk policy, alerting, maneuver analysis, and audited workflows suitable for trained operators.

The v2.0 preview implements the first level for one selected object against the validated browser catalog. It cannot responsibly claim the second or third level. Until the relevant validation gates are passed, all conjunction output remains labeled **experimental TLE-based screening**, not collision prediction or operational collision avoidance.

## v2.0 Implementation Status

Status at 2026-07-20: **2.0.0 local preview candidate implemented; external and human release gates remain open**. The authoritative record is `release/version.json`; scientific maturity is `Experimental` and safety class is `non-operational`. Work must stop at the v2.0 gate for human approval before any v2.1 implementation begins.

| Roadmap scope | Preview status | Evidence and remaining gate |
| --- | --- | --- |
| FND-1 reproducibility/CI | Implemented | Locked dependencies, full test discovery, static/Python/browser workflows, audit and SBOM commands; clean-clone CI evidence still must be reviewed at the gate |
| FND-2 contracts, identity, validation | Implemented for TLE preview | `js/domain/` defines closed, versioned catalog/state/request/event/result contracts, stable NORAD-backed identity, full request/configuration and source provenance, signed element ages, structured errors, freshness, and quarantine; OMM/OEM/covariance contracts remain later work |
| FND-3/FND-4 propagation and compute boundary | Implemented for selected-object screening | Pure `js/orbit/propagationService.js`, a catalog-chunked Web Worker with coalesced progress, cancellation and crash recovery, and ADR 0002; broader legacy rendering migration and higher-fidelity engines remain open |
| CA-1 terminology/data quality | Implemented | UI, exports, feature flag, and science documentation retain Experimental/non-operational labels and `collision_probability: null` |
| CA-2/CA-3 selected-object screening and TCA | Implemented for preview envelope | Synchronized TEME states, conservative interval admission, neighbor-confirmed local minima, half-open coarse-interval ownership, bounded refinement/deduplication, deterministic events, and reference/synthetic tests |
| CA-5 event UI/playback | Implemented for preview | Accessible controls, sortable/filterable results, event details, stale-result invalidation, numeric and Alpha-5 object lookup during playback, bounded event/request share identifiers, a self-contained frozen-catalog export, and display-only synchronized 3D playback; application import or cross-session resolution of exports is deferred beyond v2.0 |
| FEAT-1 catalog diagnostics | Partially implemented | Source, provider-supplied retrieval time (explicitly unknown rather than synthesized when absent), counts, quarantine, freshness, and partial/degraded state are available; broader history and provider governance remain open |
| v2.0 scientific/performance gate | Locally evidenced; external gate open | The checksum-consistent candidate manifest and official Vallado numeric TEME comparisons cover near-Earth, deep-space non-resonant, HEO half-day resonance, GEO synchronous resonance, and negative-BSTAR cases. Immutability still requires a committed/tagged publication. A fresh loopback run meets the initial visible-globe target, while the catalog-dependent interactive target remains unmet; neither single SwiftShader result is percentile evidence. Independent review, external clean-clone CI, 2x-catalog and hardware-GPU profiles, and human approval remain required before stronger maturity claims |
| CA-4 and CA-6 through CA-9 | Not started by design | Full-catalog server jobs, covariance/CDM, Pc, persistent history/alerts, and maneuver analysis are post-v2.0 and require separate release approval |

Detailed method and validation limits are in `docs/science/EXPERIMENTAL_CONJUNCTION_SCREENING_V2.md`. The auditable preview switch and rollback behavior are in `release/feature-flags.json` and `docs/engineering/ROLLBACK.md`.

Sections 1 through 8 retain the original audit baseline and longer-term roadmap so that implementation decisions remain traceable. The status table above is the current v2.0 record; a baseline evidence statement below does not override implemented v2.0 behavior or approve a later phase.

## 1. Baseline Project Assessment (Pre-v2.0)

### 1.1 System map

| Area | Current implementation | Evidence |
|---|---|---|
| Browser application | Plain HTML/CSS/ES modules with a 4,661-line integration file that owns state, controls, loading, rendering, and animation | `index.html:31`, `index.html:382`, `index.html:4352` |
| 3D and 2D visualization | Three.js globe, sprites, selected models, orbit paths, footprints, Mercator map, timelines, stars, Moon, Mars, and Solar System views | `index.html:70-145`, `js/mercatorMapLoader.js`, `js/satelliteFootprintLoader.js` |
| Orbit propagation | Pinned `satellite.js` 6.0.2 using TLE/SGP4 | `package.json:8-10`, `js/satelliteTLELoader.js:29-33` |
| Scene coordinates | Central distance-preserving axis mapping from ECI-like coordinates to Three.js scene coordinates | `js/sceneFrame.js:4-85` |
| Catalog ingestion | Python tool downloads CelesTrak GP data and SATCAT data, derives orbit metadata, and writes flat JSON/CSV | `tools/satellite_data_tools.py:37-112` |
| Runtime catalog | Local-first `json/tle/TLE.json` with optional reload from the Python API | `js/satelliteTLELoader.js:460-541`, `index.html:2731-2753` |
| Optional backend | Standard-library threaded Python server that serves static files and read-only JSON endpoints | `server.py:529-654` |
| Persistence | Generated files and browser local storage; no event database or analysis-job store | `js/decayPredictor.js:42-43`, `server.py:610-636` |
| Tests | Node test loader, deterministic math tests, source-structure assertions, Python subprocess tests, and a large manual checklist | `tests/runAll.js:1-14`, `tests/satelliteDataTools.test.js`, `Test_and_Integration.md` |
| Legacy/experimental surface | Java data exporters remain after Python replacement; numerous standalone viewers and beam-forming prototypes remain beside the main app | `README.md:105`, `pom.xml`, repository root HTML files |

### 1.2 Current data flow

The present flow is:

`CelesTrak GP/SATCAT -> satellite_data_tools.py -> flat JSON/CSV -> static fetch or Python file API -> satellite.js satrec -> Three.js`

The browser starts rendering before all deferred work, loads the local TLE file in chunks, parses every accepted row, creates a sprite for every object, and mutates the exported global `satellites` array (see `index.html:4580-4617` and `js/satelliteTLELoader.js:386-456`). A server connection is checked after the local interface is ready; server data is loaded only on reconnect.

At the review date:

- `json/tle/TLE.meta.json:12-21` reports 16,347 catalog records.
- `json/tle/TLE.json` is about 9.28 MB and contains unique NORAD IDs in the inspected snapshot.
- Records contain TLEs and derived orbit fields, but no covariance, hard-body radius, CDM, maneuverability, or uncertainty model.
- The latest successful generated metadata in the workspace is dated 2026-07-12 (see `json/tle/TLE.meta.json:2-4`). Freshness must be evaluated at analysis time, not inferred from a file name.
- Default incremental refresh uses only the CelesTrak `active` and `last-30-days` groups (see `tools/satellite_data_tools.py:103`). Existing records that disappear from those feeds are retained by the merge, so catalog status and completeness are not equivalent to a current full space-object catalog.

### 1.3 Runtime behavior and scaling

- Every visible satellite is propagated in the browser animation loop (see `index.html:4404-4416`).
- Mercator rendering repeats propagation at roughly 30 FPS (see `index.html:4535-4551` and `js/mercatorMapLoader.js:301-328`).
- All TLE rows receive individual Three.js sprites with cloned materials (see `js/satelliteTLELoader.js:411-444`).
- Selected orbit paths are display geometry sampled over one period. Their samples discard timestamps, and their geometric nearest-point helper does not establish simultaneity (see `js/satelliteTLELoader.js:108-177`).
- Legacy globe and Mercator propagation still run on the main thread. The v2.0 conjunction workflow now uses a module Web Worker, but no server-side analysis process, spatial index, conjunction job queue, or event store exists.

A catalog of 16,347 objects has 133,604,031 unordered pairs at a single time sample. A naive all-pairs scan, especially inside the render loop, is not viable.

### 1.4 Accuracy posture

The repository already documents the correct limitation: `satellite.js` output is TEME-like but is treated as ECI-like for visualization, and TLE/SGP4 output is not presented as operational conjunction data (see `README.md:121-125`). The Help UI also warns against navigation, safety, mission-planning, and collision-avoidance use (see `js/SatelliteMenuLoader.js:234-237`).

That posture must remain in place. The scene axis swap preserves distance, but scene coordinates, exaggerated sprites, visual orbit lines, and non-simultaneous path intersections must never be used as conjunction-analysis inputs. Screening should operate on both objects' raw propagated states in the same frame, units, and UTC instant.

### 1.5 Verification snapshot

The original audit found a local dependency-installation gap. That blocker has been removed: dependencies are locked, the exact browser runtime files are integrity-checked under `vendor/`, CI and local commands use `npm ci`, and the curated static artifact is tested without `node_modules` or CDN access. The authoritative v2.0 gate is now `npm run check`, `npm run test:all`, dependency audit/SBOM evidence, and the explicit approvals in `docs/engineering/RELEASE_CHECKLIST.md`; documentation does not treat the existence of these checks as proof that the external release gate has passed.

## 2. Baseline Strengths and Technical Debt

### 2.1 Strengths to preserve

1. **Defensive data maintenance.** Atomic replacement, backups, conditional requests, last-known-good preservation, dry-run support, and an update lock already exist (see `tools/satellite_data_tools.py:194-224` and `tools/satellite_data_tools.py:1208-1223`).
2. **Pinned core dependencies.** Three.js and satellite.js are exactly pinned in `package.json` and `package-lock.json`.
3. **Central scene math.** `js/sceneFrame.js` and `js/orbit/orbitLinkGeometry.js` provide a useful starting point for explicit unit and frame contracts.
4. **Invalid-state handling.** Non-finite and below-Earth propagated positions are rejected instead of drawn through Earth (see `js/satelliteTLELoader.js:91-147`).
5. **Responsive-startup primitives.** Deferred scheduling and chunked work already exist in `js/startupPerformance.js:90-139`.
6. **Accessibility baseline.** The menu has labels, live regions, keyboard-accessible accordions, a modeled search combobox, focus styles, and mobile CSS.
7. **Honest domain disclaimers.** The product does not currently overstate the scientific validity of its output.
8. **Useful deterministic modules.** Orbit geometry, link-budget, coverage, share-state, and ephemeris functions already have isolated tests and can support future features.

### 2.2 Principal debt and impact

| Severity | Debt | Evidence | Impact |
|---|---|---|---|
| Critical | No covariance/CDM/hard-body-radius model | Current TLE schema and `server.py:325-400` | Pc cannot be calculated responsibly |
| Critical | Ambiguous time/frame/unit semantics for analysis | `README.md:121-125`, `js/sceneFrame.js:4-65` | Miss distance and covariance transformations cannot be certified |
| Medium | Clean-clone CI evidence still requires gate review | `.github/workflows/ci.yml`, `package.json`, `docs/engineering/RELEASE_CHECKLIST.md` | A configured workflow is not proof of a passing external run |
| High | Browser orchestration monolith | `index.html` is 4,661 lines | Scientific logic would be difficult to isolate and validate |
| High | Main-thread repeated propagation | `index.html:4404-4455`, `js/mercatorMapLoader.js:301-328` | Poor scaling and UI stalls |
| High | Weak catalog contract and batch validation | `js/serverConnection.js:58-68` accepts a batch if any row looks valid | Invalid/stale data can be mixed into analysis |
| High | Incomplete catalog status semantics | `tools/satellite_data_tools.py:103` and incremental merge behavior | Missing, inactive, debris, and retired-object coverage is unclear |
| High | Server remains local-first rather than a hosted analytics service | `server.py`, `docs/adr/0001-v2-quality-gates-and-local-first-server.md` | The strict allowlist reduces file exposure, but public deployment still needs reviewed TLS, CORS, authentication, monitoring, and operations |
| High | Tests emphasize source strings and manual checks | `tests/menuUx.test.js`, `tests/serverApiStructure.test.js` | Browser behavior and WebGL output are under-tested |
| Medium | Python and legacy Java responsibilities overlap | `README.md:105`, `src/com`, `pom.xml` | Toolchain and ownership are unclear |
| Medium | Version and release metadata are duplicated | `index.html:196`, `server.py:22`, `js/serverConnection.js:1` | Drift is likely |
| Medium | Asset/data provenance is incomplete | `README.md:128` | Redistribution and licensing risk |
| Medium | Observability is console/in-memory only | `js/startupPerformance.js:24-85`, `server.py:40-57` | Data or analysis degradation is hard to detect |

## 3. Recommended Architectural Improvements

Each item below is a roadmap item with its own value, evidence, implementation direction, dependencies, risks, effort, priority, phase, and acceptance criteria.

### FND-1. Reproducible toolchain and continuous integration

- **Objective and user value:** Make every release buildable and testable from a clean clone so scientific and UI regressions are caught before users see them.
- **Evidence:** The baseline had one test command and no CI. v2.0 now supplies locked local checks, full test discovery, Playwright/Python workflows, and `.github/workflows/ci.yml`; clean external CI evidence remains an unchecked release gate.
- **Recommended approach:** Define supported Node, Python, and Java versions; add `check`, unit, integration, end-to-end, lint, format, and serve scripts; use `npm ci`; add CI for JavaScript, Python, and browser smoke tests; run Java only if it remains supported. Remove generated/dependency artifacts from version control in a separate, reviewed cleanup.
- **Dependencies and prerequisites:** Decide whether Java remains part of the supported product; identify generated data that releases intentionally include.
- **Risks and limitations:** Repository cleanup can create a large diff and must not remove intentional assets or user data.
- **Effort / priority / phase:** **Medium / Critical / Quick Wins and Foundational Work**
- **Acceptance criteria:** A clean clone passes one documented check command; CI runs on pull requests; local and CDN-blocked boot paths are tested; test reports retain all failures instead of stopping at the first import; no dependency, IDE, cache, bytecode, backup, or build output is tracked unintentionally.

### FND-2. Versioned catalog, state, covariance, and event contracts

- **Objective and user value:** Give every orbital calculation explicit, machine-validatable semantics and provenance.
- **Evidence:** Legacy TLE/display paths still overload `type` with orbit category and accept looser objects, while the v2.0 conjunction boundary now uses closed domain contracts and validates/quarantines the complete screening catalog.
- **Recommended approach:** Define versioned JSON Schemas or equivalent typed models for `CatalogObject`, `ElementSet`, `StateVector`, `Covariance`, `ScreeningJob`, and `ConjunctionEvent`. Separate `object_type` from `orbit_class`. Require units, frame, time scale, source epoch, ingestion time, source URL/provider, dataset ID/hash, validation flags, and nullable uncertainty/HBR fields. Add provider adapters for the complete supported screening catalog, including payloads, debris, and rocket bodies; preserve authoritative status/type and reconcile disappearance, decay, and retirement instead of retaining records indefinitely without status.
- **Dependencies and prerequisites:** Choose the schema/versioning mechanism and migration policy; define authorized catalog providers, coverage, credentials, and redistribution terms.
- **Risks and limitations:** Existing generated files and frontend consumers require a compatibility adapter during migration.
- **Effort / priority / phase:** **Medium / Critical / Quick Wins**
- **Acceptance criteria:** Every row is validated; TLE line numbers, matching NORAD IDs, checksums, parseability, finite derived fields, duplicates, epoch age, object type, and source status are checked; invalid rows are quarantined with reason counts; expected provider/object-type coverage and reconciled retirements are reported; API responses declare schema and dataset versions; missing covariance is represented as unknown, never zero.

### FND-3. Pure propagation, clock, frame, and unit service

- **Objective and user value:** Ensure rendering, screening, maps, footprints, and tests consume the same deterministic orbital state without duplicating propagation or silently mixing frames.
- **Evidence:** Propagation is called independently from `index.html`, `js/mercatorMapLoader.js`, `js/satelliteFootprintLoader.js`, `js/decayPredictor.js`, and `js/satelliteTLELoader.js`; TEME-like states are described as ECI-like for display.
- **Recommended approach:** Extract a side-effect-free orbital-state API that accepts a versioned element set and UTC instant and returns position/velocity in kilometers and kilometers per second with explicit frame, epoch, validity, and source identity. Put scene conversion behind a rendering adapter. Centralize the simulation clock. Cache states by object, element-set identity, and time tick.
- **Dependencies and prerequisites:** FND-2 contracts; an architecture decision on the propagation engine.
- **Risks and limitations:** Refactoring the animation path has a broad regression surface; TEME-to-Earth-fixed and covariance transforms need external reference validation.
- **Effort / priority / phase:** **Large / Critical / Foundational Work**
- **Acceptance criteria:** No feature directly calls the global satellite library outside the propagation adapter; identical inputs produce identical typed states; rendering parity is demonstrated; frame and unit names appear in APIs and tests; Vallado/SGP4 reference vectors pass within documented tolerances.

### FND-4. Astrodynamics engine decision record and compute boundary

- **Objective and user value:** Use a proven, supportable engine for scientific calculations rather than growing collision mathematics inside UI code.
- **Evidence:** The active Python server has no orbital dependency; legacy Java/Maven remains; the browser uses satellite.js; no CDM or Pc implementation exists.
- **Recommended approach:** Benchmark and document three roles: satellite.js for browser/Node TLE screening parity; a dedicated background service for scheduled/full-catalog work; and a validated library such as Orekit or an equivalently mature stack for CDM, frames, covariance, and Pc. Treat Java/Orekit and a pinned Python astrodynamics stack as candidates, not foregone conclusions. Evaluate numerical agreement, CDM support, licensing, deployment, Earth-orientation data, maintainability, and throughput.
- **Dependencies and prerequisites:** FND-2, reference fixtures, and a decision on static-only versus server-backed product scope.
- **Risks and limitations:** Multiple engines can drift; adopting a scientific stack introduces data files and operational dependencies.
- **Effort / priority / phase:** **Medium / Critical / Foundational Work**
- **Acceptance criteria:** An ADR names the engine for each capability; cross-engine golden tests cover representative LEO, MEO, GEO, HEO, and decay/error cases; supported accuracy and non-goals are documented; no Pc algorithm is hand-rolled without independent benchmark vectors.

### FND-5. Scalable propagation and rendering pipeline

- **Objective and user value:** Keep the UI responsive with large catalogs and create a safe execution path for screening.
- **Evidence:** All records still become sprites with cloned materials, visible objects are propagated per animation frame, and Mercator repeats the work. The v2.0 conjunction screen now has a dedicated Worker; shared render-state buffers and a spatial index remain open.
- **Recommended approach:** Separate catalog data, propagated-state buffers, and render objects. Use Web Workers for browser screening/propagation, transfer typed arrays, share one state snapshot between globe and Mercator, update at an adaptive cadence, use Points/instancing and shared materials, cap device-pixel ratio, and add label/camera culling. Use background jobs for full-catalog screening.
- **Dependencies and prerequisites:** FND-3; agreed performance profiles and budgets.
- **Risks and limitations:** Worker/module loading must work both on GitHub Pages and with the optional server; premature optimization can obscure correctness.
- **Effort / priority / phase:** **Large / High / Foundational Work**
- **Acceptance criteria:** Named desktop and mobile profiles have repeatable startup, memory, and frame-time baselines; UI input remains responsive during screening; globe and Mercator do not propagate the same object/time twice; all-pairs screening is explicitly prohibited; performance budgets are enforced in CI.

### FND-6. Versioned API, analysis jobs, persistence, and deployment boundary

- **Objective and user value:** Support long-running screens, event history, exports, and alerts without blocking HTTP requests or the animation loop.
- **Evidence:** `server.py:610-636` serves whole files and in-memory scheduler status; there is no database, pagination, job model, or event history.
- **Recommended approach:** Introduce `/api/v1` contracts and asynchronous screening jobs with create/status/cancel/result semantics. Start with generated versioned result files for a single-user experiment, then use SQLite for durable local history; consider a service database only if multi-user deployment is required. Prefer Server-Sent Events for job/status updates unless bidirectional WebSocket behavior is justified.
- **Dependencies and prerequisites:** FND-2, FND-4, deployment decision, and retention policy.
- **Risks and limitations:** A stateful backend is incompatible with GitHub Pages alone and adds migrations, backups, and concurrency concerns.
- **Effort / priority / phase:** **Large / High / Core and Advanced Features**
- **Acceptance criteria:** Jobs survive page navigation and report progress; results are paginated/filterable; every event stores dataset hash, input element epochs, engine/algorithm version, configuration, creation time, and supersession status; API compatibility and migrations are tested.

### FND-7. Security and production deployment hardening

- **Objective and user value:** Prevent data, credential, and host exposure if server-backed analytics or alerts are deployed beyond localhost.
- **Evidence:** The pre-v2.0 server exposed an overly broad repository-root boundary. v2.0 now defaults to loopback, requires explicit public binding, restricts CORS, validates `Host`, confines paths, serves exact runtime allowlists, returns controlled errors, and applies tested security headers. The curated static artifact also excludes repository metadata and source-only files. Authentication, production rate limits, target-host TLS/monitoring, and a strict CSP remain open.
- **Recommended approach:** Preserve the implemented local-server and static-artifact controls. Before any hosted analytics, mutation, or notification deployment, add a reviewed reverse-proxy/TLS profile, resource and request-size limits, structured internal logs, authentication, authorization, CSRF policy, secret management, and audit logs. Keep provider credentials in server-side secrets, never browser storage.
- **Dependencies and prerequisites:** Deployment model and user/tenant model.
- **Risks and limitations:** Authentication is unnecessary complexity for a strictly local read-only tool but mandatory for remote operational data.
- **Effort / priority / phase:** **Medium / Critical / Foundational Work**
- **Acceptance criteria:** Public artifacts cannot expose `.git`, IDE state, backups, source-only tools, or credentials; security headers and CORS are integration-tested; secret and dependency scans run in CI; a container/service profile, health probes, writable data volume, backup, rollback, and incident runbook exist for any hosted backend.

### FND-8. Scientific, browser, accessibility, and operational validation

- **Objective and user value:** Make accuracy claims traceable and ensure critical workflows work in real browsers and assistive technology.
- **Evidence:** v2.0 now includes published Vallado/CelesTrak numeric TEME comparisons, analytic and dense-oracle conjunction cases, Worker protocol tests, native Python API/security tests, and Playwright desktop/mobile journeys with nonblank WebGL pixel checks, conjunction-marker checks, console-error capture, keyboard/reflow coverage, and Axe checks. Independent scientific review, automated coverage reporting, broader browser coverage, named hardware-GPU profiles, a 2x-catalog profile, and later covariance/Pc reference suites remain open.
- **Recommended approach:** Retain the implemented deterministic and browser evidence, then add coverage reporting, independent cross-tool TCA cases across orbit regimes, repeated percentile and hardware profiles, broader supported-browser journeys, and scientific reference suites as transforms, covariance, and Pc are introduced. Keep vendored-first, blocked-CDN, module-graph failure/retry, accessibility, and deterministic-time paths in regression coverage.
- **Dependencies and prerequisites:** FND-1 through FND-4 and licensed/shareable reference fixtures.
- **Risks and limitations:** Screenshot tests can be noisy; scientific tolerances must reflect model fidelity rather than be tuned merely to pass.
- **Effort / priority / phase:** **Large / Critical / All phases**
- **Acceptance criteria:** Tests cover actual browser and API behavior; core math meets agreed coverage thresholds; every scientific metric has provenance, reference result, tolerance, and failure diagnostic; no serious/critical automated accessibility findings remain; the release checklist is generated from current supported behavior rather than stale release history.

### FND-9. Operational health, logging, and diagnostics

- **Objective and user value:** Make stale data, invalid propagation, slow screens, failed jobs, and notification problems detectable before users mistake degraded service for a clean result.
- **Evidence:** Browser timings are opt-in and console-only in `js/startupPerformance.js:24-85`; the server relies on default request logs and startup prints; scheduler state is in-memory; `/api/health` does not assess data readiness.
- **Recommended approach:** Separate liveness from readiness. Add structured logs with request/job IDs, route/status/duration, dataset ID, screening configuration hash, candidate counts, rejection reasons, and scheduler outcome. Expose a local diagnostics/metrics summary for dataset age, invalid TLE/propagation counts, frame-time percentiles, worker/job duration, candidate reduction, event counts, and alert delivery. Keep browser telemetry opt-in and privacy-preserving.
- **Dependencies and prerequisites:** FND-2 identifiers, FND-5 performance baselines, FND-6 job model, and a retention/privacy policy.
- **Risks and limitations:** Orbital inputs or provider identifiers may be sensitive; high-cardinality per-object metrics can create cost and privacy problems.
- **Effort / priority / phase:** **Medium / High / Foundational and Advanced Features**
- **Acceptance criteria:** Health reports process and data states separately; all jobs have traceable start/progress/end records; credentials, raw restricted messages, and local paths are redacted; metrics have bounded labels and retention; stale/failed data and jobs are visible in UI/API; alert-delivery failure triggers an independent operational signal.

### FND-10. Architecture ownership and developer documentation

- **Objective and user value:** Reduce regression risk and make it clear where orbital truth, rendering state, generated data, and supported deployment behavior belong.
- **Evidence:** v2.0 establishes `release/version.json` as the authoritative version source and adds ADRs, `CONTRIBUTING.md`, `SECURITY.md`, governance, validation, deployment, release, and rollback documentation. `index.html`, `server.py`, and `tools/satellite_data_tools.py` still carry broad responsibilities; Java/Maven ownership remains unresolved; and no single `ARCHITECTURE.md` or maintained architecture/API diagram traces all module, data-flow, frame, and deployment boundaries.
- **Recommended approach:** Add `ARCHITECTURE.md` and maintained diagrams that link the existing ADRs and policy documents, then extract the inline app controller/state/render adapters incrementally after tests protect current behavior. Decide whether Java is a supported Orekit module or retired legacy, and keep version-derived surfaces generated from `release/version.json`.
- **Dependencies and prerequisites:** FND-1 and the FND-4 engine decision.
- **Risks and limitations:** Documentation decays unless CI and code-review ownership require updates; a large rewrite of `index.html` would create unnecessary risk.
- **Effort / priority / phase:** **Medium / High / Quick Wins and Foundational Work**
- **Acceptance criteria:** A new contributor can run checks and trace catalog-to-render flow from documentation; every shared module has a named responsibility; one generated version value feeds UI/API/docs; Java status is explicit; ADRs are linked from roadmap items; architecture and API diagrams are updated by relevant pull requests.

## 4. Priority Feature: Conjunction Detection and Collision-Risk Assessment

### 4.1 Functional requirements

The eventual capability should support:

- Orbit propagation and trajectory forecasting over a configurable, explicitly qualified horizon.
- Configurable primary object, catalog scope, screening start/end, and screening volume.
- Detection of close approaches within configurable distance and screening-volume thresholds.
- Asynchronous progress, cancellation, deterministic reruns, and stale-result indication.
- TCA, three-dimensional miss distance, relative position, relative velocity, input epochs, data ages, and quality flags.
- Conservative candidate generation that is demonstrably free of false negatives within its declared test envelope.
- Selected-object versus catalog screening before full-catalog screening.
- Filterable event list, details, playback at TCA, and pair visualization.
- Collision probability using positional uncertainty/covariance only when validated inputs are available, with a nullable Pc, method, covariance source/frame, hard-body radius, and validity flags.
- Policy-versioned screening priority/severity that exposes its underlying metrics.
- Alerts and notifications for policy-qualified high-priority events, with explicit delivery state.
- Historical event versions, acknowledgement, analysis, playback, export, and alert lifecycle.
- Experimental maneuver what-if analysis only after the state/covariance pipeline is validated.

### 4.2 Implemented event contract and planned extensions

The closed v2.0 `ConjunctionEvent` currently includes:

- Event ID, request ID, and canonical pair key.
- Primary and secondary internal catalog IDs plus immutable display names.
- TCA in explicit UTC and synchronized primary/secondary state vectors in TEME.
- Miss distance, relative position vector, relative velocity vector, and relative speed with explicit physical units.
- The screening radius and bounded refinement diagnostics.
- Nullable collision probability, probability method, and hard-body radius fields, with covariance explicitly `UNAVAILABLE` in the TLE-only workflow.
- Input element-set IDs, epochs, and signed ages at TCA.
- Full dataset/source and computation provenance, including dataset hash and algorithm name, version, configuration hash, generation time, and input element-set IDs.
- Experimental maturity, structured quality flags, and optional analysis diagnostics.

Post-v2.0 event-contract extensions remain roadmap work:

- Revision and supersession relationships plus durable event identity across recomputations.
- Object type, maneuverability, and other operator-approved object attributes when known.
- Validated covariance frames/epochs/quality, sourced hard-body radii, supported Pc methods, and method-validity diagnostics.
- Separate screening-priority, likelihood, consequence, data-quality, and operational-priority classifications with a policy version.
- Created, updated, acknowledged, resolved, expired, and invalidated lifecycle timestamps.

### 4.3 Processing pipeline

The target flow is:

`source adapters -> validation/provenance -> normalized catalog -> pure propagation -> conservative broad phase -> same-time coarse screen -> TCA refinement -> optional covariance/Pc -> event store/API -> visualization/alerts`

Screening must not use rendered orbit-path intersections or `selectedOrbitNearestPointDistance`. A path crossing can occur at different times, and the current display sampling can skip a fast encounter. At every comparison, both states must be propagated to the same time. A coarse interval should use relative-motion/swept-volume logic to bracket candidate minima, followed by refinement of squared separation or the root of relative-position dot relative-velocity.

### CA-1. Accuracy contract, terminology, and data-quality gate

- **Objective and user value:** Prevent experimental output from being mistaken for operational collision risk.
- **Evidence:** The current catalog has no validated covariance or hard-body radius. The repository now supports explicitly Experimental selected-object close-approach screening while disclaiming physical collision prediction, operational conjunction assessment, alerts, and collision-avoidance decisions. Scene and orbit-path helpers remain visualization-only.
- **Recommended approach:** Maintain the implemented accuracy contract defining `screening`, `conjunction`, `TCA`, `miss distance`, `Pc`, screening priority, and risk. Keep source age, frame, model, and quality beside every result; keep Pc unavailable when covariance or HBR is missing or invalid; and use `Unknown` rather than `0` or `Low`.
- **Dependencies and prerequisites:** FND-2 and agreement on intended educational versus operational audience.
- **Risks and limitations:** Users may still over-trust precise-looking numbers; visual language and exports must repeat the qualification.
- **Effort / priority / phase:** **Small / Critical / Quick Wins**
- **Acceptance criteria:** Terminology is consistent in UI/API/docs; no screen says `collision probability` without validated uncertainty inputs; every result carries source/age/model labels; experimental exports include the same warning; automated tests reject unqualified Pc.

### CA-2. Selected-object versus catalog close-approach MVP

- **Objective and user value:** Let a user select one satellite and find potential close approaches against the loaded catalog without attempting 133 million pairs per time step.
- **Evidence:** v2.0 implements a rendering-independent satellite.js propagation service, a pure screening engine, and a module Web Worker that screens one selected primary against the validated eligible catalog with progress, cancellation, crash recovery, deterministic configuration, and bounded resources.
- **Implemented v2.0 approach:** Prepare each eligible TLE once, evaluate both objects on the same UTC/TEME coarse grid, admit intervals with a relative-position chord test plus explicit curvature margin and padding, then return deterministic geometric events and quality flags rather than Pc. This selected-object path is not a spatial index, scheduled service, or full-catalog all-pairs screen.
- **Dependencies and prerequisites:** The TLE-preview portions of FND-2, FND-3, FND-5, and CA-1 are implemented. Independent scientific review, broader scale evidence, and any server-side catalog job architecture remain prerequisites for a stronger claim.
- **Risks and limitations:** TLE errors, stale elements, unmodeled maneuvers, missing catalog objects, and overly large coarse steps can create false confidence.
- **Effort / priority / phase:** **Large / Critical / Core Collision-Risk Capability**
- **Acceptance criteria:** The UI remains responsive; cancellation works; identical dataset/configuration produces identical results; no self-pairs or duplicate pairs appear; both states are evaluated at identical timestamps; result provenance is complete; candidate recall is 100% on the bounded synthetic/reference corpus; results are labeled TLE-based screening.

### CA-3. TCA refinement and encounter metrics

- **Objective and user value:** Replace coarse alerts with accurate local closest-approach time, miss distance, and relative velocity for the selected propagation model.
- **Evidence:** Display orbit sampling remains unsuitable for temporal closest approach, so v2.0 instead brackets candidates from synchronized raw states and re-propagates both objects during bounded refinement. The engine returns TCA, miss distance, relative position/velocity, relative speed, convergence, boundary, and incomplete-coverage diagnostics.
- **Implemented v2.0 approach:** Sample deterministic subdivisions and neighboring points inside each admitted interval, accept neighbor-confirmed local basins or actual screening-window boundary minima, assign shared coarse boundaries with half-open ownership, refine squared separation with bounded golden-section search, and deduplicate overlapping brackets that converge to the same minimum.
- **Dependencies and prerequisites:** CA-2 and the initial propagation/reference fixtures are implemented. Independent TCA cases across orbit regimes and stronger cross-tool validation remain open.
- **Risks and limitations:** Multiple local minima, low-relative-speed/co-orbital encounters, HEO boundaries, invalid SGP4 spans, and time-window edges require explicit handling.
- **Effort / priority / phase:** **Medium / Critical / Core Collision-Risk Capability**
- **Acceptance criteria:** Analytic straight-line and synthetic orbital cases meet documented TCA/miss-distance tolerances; results are stable as the coarse cadence is tightened; boundary and multiple-minimum cases are identified; relative speed and vectors use documented units/frame; invalid refinement cannot silently become a safe result.

### CA-4. Full-catalog broad-phase screening

- **Objective and user value:** Detect candidate conjunctions across the supported catalog on a schedule without freezing clients or using naive all-pairs computation.
- **Evidence:** The inspected catalog has 16,347 objects and 133,604,031 possible pairs per time sample; no job worker or spatial index exists.
- **Recommended approach:** Run outside request/render threads. Apply conservative static pruning using perigee/apogee and supported orbit envelopes, then time-indexed spatial hashing or swept bounding volumes with neighboring-cell comparisons. Refine only candidates. Partition work deterministically, checkpoint jobs, deduplicate pair/time neighborhoods, and measure candidate-reduction ratio and recall.
- **Dependencies and prerequisites:** CA-2, CA-3, FND-5, FND-6, complete object status/type data, and performance baselines.
- **Risks and limitations:** Aggressive pruning can cause false negatives; high-eccentricity and co-orbital cases stress simple bins; catalog growth changes capacity needs.
- **Effort / priority / phase:** **Large / High / Core then Advanced Features**
- **Acceptance criteria:** No O(N squared) production path exists; brute-force comparison on smaller reference catalogs proves broad-phase recall; a documented hardware profile meets a defined screening-window latency and memory budget; jobs resume or fail cleanly; results carry catalog snapshot identity.

### CA-5. Conjunction event dashboard, visualization, and playback

- **Objective and user value:** Make events understandable and actionable without requiring users to interpret raw JSON.
- **Evidence:** v2.0 implements pair/event state in `js/conjunction/conjunctionPanel.js` and display-only synchronized visualization in `js/conjunction/conjunctionVisualization.js`. The workspace provides filter/sort controls, event details, quality states, input invalidation, a frozen-catalog JSON export, event selection, TCA playback on the shared simulation clock, short pair trajectories, and a closest-approach connector.
- **Implemented v2.0 approach:** Use the compact Close Approaches workspace and its table/details as the accessible text alternative; render deliberately exaggerated inspection markers, synchronized trajectory arcs, and the connector without treating them as physical object size or calculation input. Keep covariance, HBR geometry, durable event history, and cross-session event resolution unavailable.
- **Dependencies and prerequisites:** The v2.0 portions of CA-1 through CA-3 and the accessible UI design are implemented. Persistent event identity and later uncertainty/risk displays depend on CA-6 through CA-8.
- **Risks and limitations:** Scale exaggeration can mislead; dense event lists can overwhelm; red/green alone is inaccessible.
- **Effort / priority / phase:** **Large / High / Core Collision-Risk Capability**
- **Acceptance criteria:** Selecting an event synchronizes table, details, clock, camera, and both objects; true numeric distance is always shown independently of visual scaling; keyboard and touch workflows work; no overlap at 320/390/768 px and 200% zoom; WebGL pixel tests prove the pair/connector renders; URL share state can retain bounded event/request context without embedding the frozen catalog or result.

### CA-6. CDM, covariance, and hard-body-radius ingestion

- **Objective and user value:** Add the uncertainty inputs required for defensible collision-likelihood calculations.
- **Evidence:** Current TLE records contain no covariance or HBR; Space-Track support in `tools/satellite_data_tools.py:1197-1205` is only a disabled placeholder.
- **Recommended approach:** Add pluggable server-side adapters for user-supplied CCSDS CDM first, then authorized providers subject to credentials and terms. Parse KVN/XML as required, preserve raw messages, validate schema/units/epochs/object IDs, transform both covariances to a common frame at TCA, validate symmetry and positive semidefiniteness, and record HBR source/assumption. Add OMM/OEM/OPM support only through explicit contracts.
- **Dependencies and prerequisites:** FND-2, FND-4, secure secret handling, provider terms, Earth-orientation/time data, and reference CDMs.
- **Risks and limitations:** Covariances may be absent, stale, non-realistic, correlated, or expressed in different frames; HBR may be unknown; provider data may prohibit redistribution.
- **Effort / priority / phase:** **Large / Critical / Advanced Features**
- **Acceptance criteria:** Official/synthetic CDM fixtures round-trip without semantic loss; unit/frame transformations match independent reference results; invalid or non-positive-definite covariances are rejected or explicitly remediated under a named policy; raw/source access is audited; credentials never reach the browser or logs.

### CA-7. Probability of collision and policy-versioned risk classification

- **Objective and user value:** Provide a defensible likelihood metric and consistent prioritization when sufficient data exists.
- **Evidence:** No Pc engine exists, and miss distance alone is not probability or overall risk.
- **Recommended approach:** Use a validated library/reference implementation for the applicable short-term encounter method. Compute combined covariance in the encounter plane, use sourced HBR, test method assumptions, and return Pc plus method/validity diagnostics. Keep likelihood, consequence, data quality, and operational priority as separate fields. Make thresholds configurable and policy-versioned; do not embed a universal maneuver threshold.
- **Dependencies and prerequisites:** CA-6, FND-4, scientific benchmark suite, and domain review.
- **Risks and limitations:** Covariance dilution, shared-error correlation, curvilinear/long encounters, repeating conjunctions, uncertain HBR, and method misuse can make a small Pc falsely reassuring.
- **Effort / priority / phase:** **Large / Critical / Advanced Features**
- **Acceptance criteria:** Pc matches trusted Orekit/NASA CARA or equivalent benchmark cases within documented tolerance; unsupported encounter geometry returns an explicit status; missing inputs return `N/A`; method, assumptions, covariance epochs/frames, HBR, and policy version are visible; independent domain review signs off before any production-ready claim.

### CA-8. Event history, API, exports, and alerts

- **Objective and user value:** Track how an event evolves, integrate it with other tools, and notify users when configured conditions are met.
- **Evidence:** The server remains read-only and has no persistent event lifecycle. v2.0 adds a self-contained frozen-catalog JSON conjunction export for external replay, but no application import, event revision store, acknowledgement, scheduling, or alert delivery.
- **Recommended approach:** Persist immutable event revisions and a derived current-event view. Provide paginated REST endpoints, CSV/JSON and human-readable report export, acknowledgement/assignment notes for authenticated deployments, and Server-Sent Events for job/event changes. Deliver in-app alerts first, then opt-in webhook/email integrations with deduplication, escalation, quiet periods, retries, and audit logs.
- **Dependencies and prerequisites:** FND-6, FND-7, CA-5, retention policy, notification provider, and user model.
- **Risks and limitations:** Recomputed data can spam users; sensitive CDMs may not be exportable; notification failure can create false assurance.
- **Effort / priority / phase:** **Large / High / Advanced Features**
- **Acceptance criteria:** Every revision is reproducible from retained input identity; superseded events remain traceable; exports contain units/provenance/qualification; alert rules are tested against replay fixtures; duplicate updates do not duplicate notifications; delivery and acknowledgement are audited; failed delivery is visible.

### CA-9. Maneuver what-if analysis

- **Objective and user value:** Explore how a hypothetical maneuver changes conjunction geometry without issuing autonomous operational advice.
- **Evidence:** The current app provides visualization bias controls, not spacecraft dynamics, maneuver constraints, or high-fidelity orbit determination.
- **Recommended approach:** Accept a user-defined maneuver epoch and delta-v in an explicit frame, propagate the changed primary trajectory with an engine suitable for the analysis horizon, rescreen against all affected events, and compare before/after miss distance, Pc, secondary conjunctions, and mission constraints. Keep automatic maneuver generation and recommendations out of scope until a validated optimization/conops project is approved.
- **Dependencies and prerequisites:** CA-6 and CA-7, higher-fidelity propagator/force models, maneuver constraints, operator ephemerides, and domain review.
- **Risks and limitations:** TLEs are not a suitable source for precise post-maneuver prediction; optimizing one encounter can create another; operational constraints are mission-specific.
- **Effort / priority / phase:** **Large / Low / Long-Term Research**
- **Acceptance criteria:** Inputs and frames are explicit; baseline zero-delta-v reproduces the original event; deterministic reference maneuvers match an independent tool; all newly introduced conjunctions are reported; output is labeled experimental and never phrased as an execution recommendation.

### 4.4 Scientific validation strategy

Validation should be a release gate, not a final polish step.

| Layer | Required fixtures and checks |
|---|---|
| TLE/SGP4 | Vallado/CelesTrak verification TLEs across near-Earth, deep-space, resonant, GEO, HEO, negative-BSTAR, and decay/error cases |
| Time/frame/unit | UTC/leap-second policy, Julian date, TEME state identity, Earth-fixed transforms, axis/unit round trips, and cross-engine comparisons |
| Broad phase | Small brute-force catalogs and adversarial high-speed, cell-boundary, HEO, co-orbital, and window-boundary cases; measure false-negative rate |
| TCA | Analytic straight-line cases, synthetic orbital cases, multiple minima, low-relative-speed encounters, and independent engine results |
| CDM/covariance | CCSDS-conformant KVN/XML fixtures, frame/unit transformations, covariance symmetry/eigenvalue checks, missing fields, and bad inputs |
| Pc | Trusted NASA CARA/Orekit or equivalent benchmark cases, method applicability tests, dilution/correlation warnings, and HBR sensitivity |
| End to end | Frozen catalog/configuration -> expected event revisions/API/UI/export/alert behavior |
| Performance | Catalog-size matrix, candidate reduction, wall time, peak memory, worker responsiveness, API latency, and render frame percentiles |

Required scientific output rules:

- Do not derive a fake covariance from TLE age and label it operational Pc.
- Do not convert missing Pc to zero.
- Do not treat a geometric orbit-line crossing as a conjunction.
- Do not hide stale input, propagation failure, invalid covariance, or unsupported geometry.
- Do not use visual sprite/model size as hard-body radius.
- Preserve all epochs, frames, units, provider identities, hashes, and algorithm versions needed to reproduce a result.

### 4.5 External validation anchors

Use primary/reference sources when finalizing algorithms and test vectors:

- [CCSDS active publications and Conjunction Data Message standard](https://ccsds.org/publications/allpubs/)
- [NASA Conjunction Assessment and Collision Avoidance Best Practices](https://www.nasa.gov/cara/)
- [NASA CARA publicly available analysis software and benchmark cases](https://www.nasa.gov/cara/publicly-available-cara-software/)
- [CelesTrak/Vallado SGP4 reference paper, code, and verification cases](https://celestrak.org/publications/AIAA/2006-6753/)
- [Orekit CDM parser documentation](https://orekit.org/static/apidocs/org/orekit/files/ccsds/ndm/cdm/CdmParser.html)

These references guide validation; citing them does not make this project operationally certified.

## 5. Additional Feature Recommendations

### FEAT-1. Catalog freshness and data-quality center

- **Objective and user value:** Show users whether their data is current, complete, and usable before they trust any visualization or screen.
- **Evidence:** Update metadata exists, but health reports only process/version; element age, invalid rows, catalog coverage, and last-known-good state are not visible together.
- **Recommended approach:** Add a data-quality view and `/api/v1/datasets/current` summary with provider, groups, record/object-type counts, min/median/max TLE age, invalid/quarantined counts, last success/attempt, checksum, and stale/degraded/unusable status. Add per-object age badges.
- **Dependencies and prerequisites:** FND-2 and freshness policies by orbit/use case.
- **Risks and limitations:** One global stale threshold is misleading; freshness is not the same as accuracy.
- **Effort / priority / phase:** **Medium / High / Quick Wins**
- **Acceptance criteria:** Health distinguishes liveness from readiness; stale data is visible before screening; quality status is consistent in UI/API/export; threshold configuration and degraded fallback are tested.

### FEAT-2. Ground-station pass and RF link planner

- **Objective and user value:** Turn existing geometry and link-budget modules into a practical satellite-access workflow.
- **Evidence:** `js/orbit/orbitLinkGeometry.js` already computes look geometry; `js/rf/rfLinkBudget.js`, `js/coverage/coverageGrid.js`, and `js/coverage/beamFootprint.js` provide deterministic RF/coverage functions; footprints and Mercator views already exist.
- **Recommended approach:** Add a versioned `GroundStation` model, AOS/LOS/max-elevation pass prediction, range/range-rate/Doppler, configurable link budget, footprint/coverage overlays, and CSV/JSON pass export. Keep RF assumptions visible.
- **Dependencies and prerequisites:** FND-3 contracts, a station editor, antenna/radio inputs, and domain fixtures.
- **Risks and limitations:** Atmospheric, terrain, antenna-pattern, interference, and regulatory effects are simplified unless explicitly modeled.
- **Effort / priority / phase:** **Medium / Medium / Advanced Features**
- **Acceptance criteria:** Analytic/reference pass cases match tolerances; all RF inputs/units are visible; invalid or below-horizon states are handled; keyboard/mobile workflows and export work.

### FEAT-3. Historical catalog and orbital-change analysis

- **Objective and user value:** Explain how element sets, altitude, orbit class, and conjunction events evolve rather than showing only the latest snapshot.
- **Evidence:** Current update logic overwrites the active TLE JSON with backups; launch/re-entry timelines and event playback patterns already exist.
- **Recommended approach:** Store compact versioned element-set history with provider epoch and hash, retention limits, object lifecycle state, and change metrics. Add altitude/perigee/apogee history and event trend views. Keep raw provider redistribution rules in mind.
- **Dependencies and prerequisites:** FND-2, persistence, storage/retention policy, and provider licensing review.
- **Risks and limitations:** Storage grows quickly; historical TLE differences do not equal precise maneuvers; provider terms may constrain sharing.
- **Effort / priority / phase:** **Large / Medium / Advanced Features**
- **Acceptance criteria:** Snapshots are immutable/deduplicated; object history handles renames/status changes; charts disclose gaps and source changes; retention and deletion are tested; event revisions link to exact input snapshots.

### FEAT-4. Accessible table, timeline, and non-WebGL alternatives

- **Objective and user value:** Make core satellite and conjunction workflows usable with keyboard, touch, screen readers, reduced motion, low-end devices, and failed WebGL.
- **Evidence:** Menu accessibility is a strength, but Mercator and timeline canvases lack complete keyboard/text alternatives, small timeline text is used, and no reduced-motion/forced-colors rules exist.
- **Recommended approach:** Provide synchronized data tables for map/timeline/events, semantic buttons for accordion headers, named canvases with descriptions, unified pointer events, keyboard timeline navigation, reduced-motion mode, forced-colors support, minimum target sizes, and a non-WebGL selected-satellite/event view.
- **Dependencies and prerequisites:** CA-5 UI model and automated accessibility tooling.
- **Risks and limitations:** Parallel visual and text representations can drift unless driven by one state model.
- **Effort / priority / phase:** **Medium / High / Foundational and Core Features**
- **Acceptance criteria:** Axe has no serious/critical findings; all core workflows work keyboard-only; screen-reader checks cover search, selection, screening, event details, and alerts; 200% zoom and mobile viewports have no overlap; reduced-motion stops nonessential camera/scene motion.

### FEAT-5. Scenario workspaces and reproducible sharing

- **Objective and user value:** Let users save and compare filters, time, selected objects, ground stations, screening settings, and event revisions.
- **Evidence:** `js/shareState.js` already serializes a safe subset of view state, but there is no named workspace, comparison, or analysis configuration model.
- **Recommended approach:** Extend versioned state schemas to local named scenarios, import/export, and side-by-side result comparison. Keep share URLs limited to non-sensitive identifiers; use server-side access-controlled workspaces only if multi-user collaboration becomes a requirement.
- **Dependencies and prerequisites:** FND-2, FND-6 for server workspaces, and a migration strategy for existing share URLs.
- **Risks and limitations:** URLs can leak sensitive configuration; old scenarios can reference expired data or algorithms.
- **Effort / priority / phase:** **Medium / Medium / Advanced Features**
- **Acceptance criteria:** Scenario export includes schema/dataset/algorithm versions; imports validate and migrate or fail clearly; sensitive values are excluded; comparisons identify configuration and input differences; old share URLs keep working.

### FEAT-6. Asset optimization and reliable offline/local operation

- **Objective and user value:** Reduce startup cost and make the documented local fallback dependable.
- **Evidence:** The repository contains large GLB, texture, ephemeris, and TLE assets. v2.0 now vendors integrity-checked Three.js and satellite.js runtime files and builds a curated static artifact, while large optional assets and startup cost remain optimization work.
- **Recommended approach:** Produce an immutable runtime artifact, self-host verified dependencies, lazy-load optional modes/models, compress/chunk catalog responses, add ETag/cache/compression at the server, optimize textures/models with visual checks, and consider an installable offline shell that clearly reports data age.
- **Dependencies and prerequisites:** FND-1, FND-5, asset provenance, and browser cache policy.
- **Risks and limitations:** Aggressive model/texture compression can damage inspection quality; offline data can become dangerously stale.
- **Effort / priority / phase:** **Medium / Medium / Foundational Work**
- **Acceptance criteria:** CDN-blocked E2E boot passes; runtime artifact contains only required/licensed files; size/startup budgets are met; visual regression detects asset degradation; offline mode prominently shows snapshot age and disables claims that require fresh data.

## 6. Phased Roadmap

No calendar estimate is provided because team size, operational target, provider access, and deployment scope are unknown. Relative effort is given on each item.

### Phase 0: Quick Wins (Locally Delivered for v2.0; External Gate Open)

Primary items: CA-1, FND-1, FND-2 design, FEAT-1, baseline security cleanup.

Delivered v2.0 slice:

- Accuracy/terminology contract and unchanged operational disclaimer.
- Closed TLE-preview contracts with separate object type/orbit class and nullable covariance/Pc.
- Reproducible dependency install, configured CI, and local static/Python/browser checks.
- Current data-quality/freshness summary and initial performance evidence for the current catalog.
- Accepted deployment and selected-object screening ADRs.

Gate status: local checks pass, current data health is visible, and no UI/export can represent missing covariance as a collision probability. External clean-clone CI evidence, independent reviews, asset/data approval, and human approval remain open.

### Phase 1: Foundational Work (Partially Delivered for v2.0)

Primary items: FND-2 through FND-5, FND-7 through FND-10, FEAT-4, FEAT-6.

Delivered and remaining scope:

- **Delivered:** Typed TLE catalog/state/request/event/result contracts, strict runtime validation/quarantine, and a pure UTC/TEME propagation service with published numeric reference tests.
- **Delivered:** Browser module-Worker compute boundary, hardened local/static serving boundary, vendored runtime artifact, and initial browser/API/scientific test harness.
- **Remaining:** Broader legacy-rendering migration to the propagation service, shared render-state buffers, a higher-fidelity astrodynamics-engine decision, hosted authentication/TLS/rate controls/monitoring, architecture ownership, independent validation, and representative scale/hardware evidence.

Gate status: the selected-object TLE-preview path passes its local reference and browser checks, screening runs in a Worker, and exported inputs are versioned and reproducible. The complete foundational exit gate remains open because legacy rendering has not fully migrated and the external, hosted-deployment, performance, and independent-review evidence is incomplete.

### Phase 2: Core Collision-Risk Capability (Delivered for v2.0 Preview Gate Review)

Primary items: CA-2, CA-3, CA-5, initial FND-6.

Delivered v2.0 slice:

- Selected object versus catalog experimental close-approach screening.
- Conservative coarse candidate generation and refined TCA.
- Miss distance, relative velocity, input age, and quality diagnostics.
- Conjunction list/details and synchronized TCA playback.
- Self-contained versioned frozen-catalog JSON result export for external replay; local persistent jobs and application import are not implemented.

Gate status: bounded local reference-corpus recall and TCA/miss tolerances pass, Worker execution provides progress and cancellation with provisional browser-responsiveness evidence, and results are reproducible and explicitly screening-only. Independent scientific review, external clean-clone evidence, repeated percentile performance, and human approval remain open; this gate does not authorize v2.1 or a `Validated` claim.

### Phase 3: Advanced Features

Primary items: CA-4, CA-6, CA-7, CA-8, full FND-6, FEAT-2, FEAT-3, FEAT-5.

Deliverables:

- Scheduled full-catalog broad-phase screens.
- CDM/covariance/HBR ingestion and validation.
- Validated Pc for supported cases only.
- Persistent event history, REST/SSE, exports, and audited alerts.
- Optional ground-station and historical analysis workflows.

Exit gate: full-catalog screening meets recall/performance budgets; Pc matches independent benchmark cases; domain/security reviews approve the claim level; alert replay/delivery tests pass.

### Phase 4: Long-Term Research

Primary items: CA-9 and advanced consequence/uncertainty research.

Possible work:

- Maneuver what-if comparison with higher-fidelity propagation.
- Maximum-Pc or 3D/Monte Carlo methods for explicitly supported special cases.
- Covariance realism and correlation studies.
- Collision-consequence modeling.
- Operator ephemeris and planned-maneuver integration.
- ML only for triage after deterministic baselines and explainability/validation gates exist.

Exit gate: no research output is promoted to production-ready without new acceptance criteria, independent reference validation, and an explicit operational concept.

## 7. Risks, Assumptions, and Open Questions

### 7.1 Major risks

1. **False confidence from TLE precision.** Exact-looking miss distances can exceed the actual accuracy of stale or independent TLE estimates.
2. **Incomplete catalog coverage.** Active/recent feeds and retained old records do not guarantee complete payload/debris/rocket-body coverage.
3. **Missing or unrealistic covariance.** Pc is not available from the current data and can be misleading even when covariance exists.
4. **Frame/time errors.** TEME, GCRF/ECI, Earth-fixed frames, UTC/UT1, and covariance frames must not be treated as interchangeable.
5. **False-negative broad phase.** Performance pruning is unacceptable unless conservatively designed and verified against brute force.
6. **Maneuvers and data latency.** Unmodeled maneuvers can invalidate a screen immediately.
7. **Scaling and cost.** Full-catalog windows multiply propagation, storage, and event volume.
8. **Notification trust.** A delayed or failed alert must never appear as evidence that no risk exists.
9. **Provider terms and sensitive data.** CDMs, ephemerides, and credentials may have access and redistribution constraints.
10. **Public server exposure.** The current server is appropriate for loopback development, not an authenticated hosted analytics service.
11. **Scope dilution.** Solar System, beam-forming, model viewing, and conjunction assessment have different priorities; foundational orbit/data quality should not be displaced by disconnected prototypes.
12. **Asset licensing.** Unknown provenance can block packaged distribution even when source code is MIT-licensed.

### 7.2 Decisions needed

1. Is the target product educational screening, professional analysis support, or an operational service?
2. Must the application remain deployable on GitHub Pages without a backend?
3. Is the first supported scope one protected satellite versus catalog, a user-selected set, or full catalog?
4. Which catalog/CDM providers are authorized, and may their data/results be stored or redistributed?
5. What screening windows and volumes are required for LEO, MEO, GEO, and HEO?
6. Which engine owns browser screening, scheduled screening, CDM parsing, and Pc?
7. Will Java be revived as an Orekit analytics module or retired after the Python migration?
8. What source supplies HBR, covariance, maneuverability, and owner ephemerides?
9. Who defines and approves priority/risk thresholds and their versioned policy?
10. Is single-user SQLite sufficient, or is a multi-user authenticated service required?
11. Which notification channels and delivery guarantees are required?
12. What reference tool/team can independently validate TCA and Pc results?
13. What retention, privacy, audit, and incident-response policies apply?

## 8. Suggested Success Metrics

### Scientific correctness

- Broad-phase candidate recall: 100% on the declared brute-force reference corpus.
- TCA absolute error and miss-distance error versus reference cases: thresholds defined before implementation and reported by orbit regime.
- Relative-velocity error versus reference cases.
- Pc agreement versus trusted benchmark implementations for every supported method.
- Unsupported/invalid-input detection rate: 100% for the maintained negative fixture suite.
- Reproducibility: same dataset, configuration, and engine version yields identical event revisions.

### Data quality

- Catalog record counts by object type/status and source.
- TLE age distribution and percentage within configured freshness policy.
- Invalid/quarantined/duplicate/missing-object counts.
- Percentage of events with both covariances, known covariance frames, and sourced HBR.
- Time from provider update to validated local availability.
- Percentage of results tied to immutable dataset and input hashes.

### Performance

- P50/P95 cold start, first interactive UI, and first visible globe render.
- P50/P95 frame time and input latency during normal use and active screening.
- Worker/job wall time, peak memory, propagations per second, candidate reduction ratio, and events refined per screen.
- Full-catalog job completion/failure/retry rates on named hardware.
- API P50/P95 latency and result payload size.

### Quality and accessibility

- Clean-clone CI pass rate and flaky-test rate.
- Coverage of propagation, frame, TCA, covariance, and Pc branches.
- Browser matrix pass rate in local-data and server-backed modes.
- Zero serious/critical axe findings and full keyboard completion of core workflows.
- Zero uncaught page/worker/server errors in end-to-end tests.
- Documentation/reference-fixture traceability for every scientific claim.

### Reliability, security, and operations

- Dataset readiness and analysis-job availability.
- Invalid-propagation, stale-result, and covariance-rejection rates.
- Alert delivery latency, deduplication rate, failure visibility, and acknowledgement audit coverage.
- Mean time to detect/recover from failed data refresh or screening job.
- Zero exposed secrets and zero high/critical known dependency vulnerabilities at release.
- Restore tests for event data and rollback tests for hosted deployments.

### Product usefulness

- Time from selecting a primary object to viewing a refined first event.
- Percentage of event views where users can identify input age, miss distance, relative speed, and Pc availability.
- Export/API use success rate.
- Reduction in manual steps to reproduce and compare a screening result.

## v2.0 Milestone Delivered for Gate Review

The implemented first milestone is **Experimental Selected-Satellite Close-Approach Screening**, not probability of collision.

It includes:

1. Strict, versioned TLE/catalog validation and visible freshness.
2. A pure, tested satellite.js propagation adapter operating in raw common-frame kilometers and UTC instants.
3. A catalog-chunked Web Worker that screens one selected primary against the eligible catalog over a bounded short window, coalesces progress, supports cancellation, and can be recreated after a crash.
4. Conservative candidate admission, neighbor-confirmed minima with half-open interval ownership, and refined TCA, miss distance, and relative velocity.
5. A compact accessible event list and synchronized 3D playback, verified at named mobile/tablet/reflow widths with invalid-catalog, stale-result, Alpha-5 identity, accessibility, and unexpected-console-error coverage.
6. Closed typed request/result contracts, full input/source/algorithm provenance, structured propagation errors, screen-time freshness flags with signed element ages, and an explicit `Pc unavailable: covariance/HBR not provided` state.
7. A self-contained frozen-catalog export that is replayable by external tooling; application import is not available in v2.0.
8. Synthetic, Vallado/SGP4, brute-force recall, browser, and performance gates in CI, plus a hard preview limit of 500,000 estimated coarse catalog propagations per request.

This milestone is implemented for preview gate review. It remains Experimental and non-operational until the outstanding evidence and approvals are completed; work on v2.1 requires explicit human approval.
