# Implementation Prompt: Full Roadmap Starting with v2.0

> **Status:** This is the archived accepted execution prompt. Version 2.1 development was explicitly authorized on 2026-07-20 and its local development implementation is recorded on 2026-07-21. It is not a candidate or release; v2.0 external promotion gates remain open, and v2.2 is not authorized. Current status is recorded in `release/version.json`, `ROADMAP.md`, `PROMPT_History.md`, and the separate v2.0/v2.1 release checklists. The prompt body below is preserved unchanged.

```text
Implement the complete plan in `ROADMAP.md` as an incremental release train beginning with version 2.0. Do not stop after analyzing the repository or writing another plan. Make the code, test, documentation, data-contract, and deployment changes required by each release, and verify every release gate before moving to the next one.

Work from the repository as it exists. Preserve unrelated user changes, follow established project conventions where they are sound, and keep commits and patches narrowly scoped. Treat `ROADMAP.md` as the source of product scope, but validate its assumptions against the current code before implementation. If the implementation reveals a conflict or a scientifically invalid requirement, document the finding, choose the safest defensible alternative, and update the roadmap or an architecture decision record accordingly.

## Delivery rules

1. Start with v2.0 and complete its acceptance criteria before beginning v2.1. After each version, stop and obtain explicit human approval before starting the next version.
2. Implement releases in small, reviewable vertical slices that leave the application usable.
3. Maintain a release checklist in the repository and update it as work progresses.
4. Add or update automated tests with every behavioral change.
5. Update user, developer, API, deployment, and scientific-method documentation with each release.
6. Keep the application deployable as a static site where that mode is supported. Put server-only capabilities behind explicit services and configuration.
7. Never expose credentials, provider tokens, or notification secrets to browser code.
8. Do not label experimental screening as operational collision prediction.
9. Do not claim scientific accuracy without traceable validation against trusted reference results.
10. At the end of each release, run all applicable checks and provide a concise completion report listing changes, tests, performance results, limitations, unresolved risks, rollback readiness, and the next release gate.
11. Do not combine multiple release gates into one approval. A later version may not compensate for incomplete acceptance criteria in an earlier version.

## Required architecture direction

Evolve the project toward this explicit data flow:

`source adapters -> validation and provenance -> normalized catalog -> propagation service -> asynchronous screening -> TCA and probability analysis -> event store and API -> visualization and alerts`

Separate domain calculations from Three.js rendering and UI state. Use typed, versioned contracts for catalog objects, propagated states, screening requests, conjunction candidates, refined events, uncertainty inputs, risk assessments, and API messages. Keep units, time scales, reference frames, data provenance, and algorithm versions explicit at every boundary.

Use Web Workers for browser-side propagation and selected-object screening. Use server-side background jobs for full-catalog screening, persistence, alert delivery, and other workloads that cannot be reliable in a browser session. Use established, independently validated libraries for orbit propagation, CCSDS parsing, frame transformations, covariance handling, and collision-probability calculations where practical. Record important choices in architecture decision records.

## Non-negotiable scientific constraints

- Never detect conjunctions from rendered orbit-line intersections, nearest points between display polylines, sprite geometry, or scene-space distances.
- Compare both objects at the same UTC instant using raw state vectors expressed in a documented common reference frame.
- Perform calculations in physical units such as kilometers, kilometers per second, seconds, and square kilometers. Do not use Three.js scene scale or sprite size as physical data.
- Treat TLE and SGP4 output according to its actual frame and fidelity. Do not silently describe TEME-like output as high-precision inertial truth.
- Use conservative broad-phase screening followed by synchronized coarse sampling and bounded refinement of time of closest approach.
- Report time of closest approach, miss distance, relative velocity, screening thresholds, propagation epoch age, data source, and algorithm version.
- Distinguish miss distance, collision likelihood, consequence, data quality, and operational priority. They are not interchangeable.
- Do not invent covariance, hard-body radius, maneuverability, mass, object dimensions, or provider confidence.
- If valid uncertainty data is absent, collision probability must be explicitly unavailable. Do not substitute a heuristic percentage.
- Reject or clearly flag stale elements, propagation failures, malformed inputs, invalid covariance, frame mismatches, extrapolation outside policy, and numerical non-convergence.
- Preserve source provenance and historical revisions so every event can be reproduced.

## Additional cross-cutting requirements

### Orbital formats, time, and reference frames

- Design source adapters and normalized contracts to support CCSDS OMM and OEM plus provider ephemerides in addition to TLE. Do not force higher-fidelity data into TLE-shaped fields or silently reduce its precision.
- Define which formats are supported, experimental, or planned in each release. Preserve the original source record alongside normalized values.
- Establish a version-controlled time and reference-frame policy covering UTC, TAI, UT1, leap seconds, Earth-orientation parameters, TEME, GCRF, ITRF, epoch interpretation, interpolation, and transformation libraries.
- Record the Earth-orientation and leap-second data versions used for any calculation that depends on them. Define behavior when these inputs are missing, stale, or outside their validity interval.
- Require explicit frame and time-scale metadata at calculation boundaries. Reject ambiguous inputs instead of guessing.

### Object identity reconciliation

- Create a stable internal object identity distinct from mutable provider identifiers.
- Reconcile NORAD catalog numbers, COSPAR international designators, provider-specific identifiers, aliases, renamed objects, duplicate records, catalog mergers, fragmentation events, decayed objects, and reappearing objects.
- Preserve identity evidence, confidence, source precedence, merge and split history, and manual overrides in an auditable form.
- Never merge records solely because their names are similar. Test identifier reuse, conflicting providers, missing identifiers, and identity corrections.

### Scientific validation corpus and maturity labels

- Maintain a version-controlled scientific validation corpus containing propagation, frame-transform, TCA, covariance, and collision-probability cases as those capabilities are introduced.
- For every fixture, document its origin, license, input format, units, frames, expected result, tolerance, independent reference implementation, and known limitations.
- Assign each user-facing capability and result one of these maturity levels: `Visualization`, `Experimental`, `Validated`, or `Operationally Reviewed`.
- Display maturity in the UI, API, exports, and reports. Define objective promotion criteria and prevent marketing or release labels from overriding scientific maturity.
- A capability may be production-quality software while remaining scientifically experimental. Track software readiness and scientific validation separately.

### Feature flags, migrations, and rollback

- Put new screening algorithms, source adapters, risk policies, notification channels, and expensive workflows behind auditable feature flags until their release gate passes.
- Version database schemas, configuration, API contracts, scientific policies, and stored result formats. Provide forward migration, rollback, compatibility, and backup requirements.
- Define a rollback plan for every release, including how to handle data written by the newer version. Test restoration from backup before approving migrations that modify persistent state.
- Record which flags, algorithms, configurations, and schema versions produced each stored result.

### Authentication and authorization

- Define an authorization model before introducing write APIs or shared workspaces. At minimum, consider viewer, analyst, alert manager, scenario editor, and administrator roles.
- Separate browser sessions, service accounts, and scoped API credentials. Store only hashed or encrypted credentials as appropriate and support rotation and revocation.
- Enforce authorization server-side for every protected action and object, including exports, alerts, scenarios, audit records, and administrative data-source operations.
- Add negative permission tests, object-level access tests, rate limits, session-expiry behavior, and audit events for security-sensitive actions.

### Supply-chain and data security

- Pin dependencies and runtime versions, generate a software bill of materials for releases, scan dependencies and deployment images, and define a vulnerability-triage and patch policy.
- Verify the origin and integrity of downloaded catalogs, orbital messages, application assets, and deployment artifacts where providers make verification possible.
- Threat-model catalog ingestion, report rendering, webhooks, API inputs, file paths, cross-origin behavior, worker messages, dependency loading, and denial-of-service risks.
- Do not render untrusted provider text as executable markup. Bound decompression, parsing, upload, query, and export resource use.

### Operational and cost budgets

- Define measurable budgets per release for supported catalog size, ingestion duration, screening duration, broad-phase recall, memory, storage growth, API latency, UI responsiveness, notification delay, data age, recovery time, and recovery point.
- Define representative hardware and datasets for every benchmark so results are comparable.
- Estimate infrastructure and external-provider costs for scheduled screening, storage, notifications, and data delivery. Add quotas or backpressure before enabling unbounded workloads.
- Treat a budget regression as a release-gate failure unless explicitly reviewed and documented.

### Alert quality and human factors

- Design alerts around material event changes rather than every recalculation. Correlate revisions of the same conjunction and explain why an alert was emitted.
- Support configurable material-change thresholds, deduplication, cooldowns, suppression, escalation, quiet periods, acknowledgements, expiry, and policy simulation.
- Provide preview and dry-run modes that report expected alert volume before a policy is enabled.
- Measure duplicate rate, delivery latency, acknowledgement time, false escalation rate, and alert volume per event. Include these measures in release reviews.

### Data governance

- Maintain a source registry documenting ownership, license, attribution, permitted use, redistribution restrictions, update cadence, authentication, retention, deletion, geographic or contractual constraints, and outage behavior.
- Preserve source provenance through normalization, screening, event storage, exports, and historical playback.
- Define retention and deletion policies for raw source records, normalized revisions, screening results, alerts, audit records, user scenarios, and diagnostics.
- Prevent deployment modes from redistributing data when the provider license permits access but not republication.
- Document fallback and degraded-operation behavior for provider outages, revoked access, schema changes, delayed updates, and conflicting sources.

## v2.0: Experimental Conjunction Screening

Deliver a defensible browser-based selected-satellite versus catalog screening workflow.

### Foundation and reproducibility

- Make dependency installation reproducible and ensure the standard test command runs the full intended suite.
- Add a suitable `.gitignore` for dependency folders, generated output, caches, backups, IDE artifacts, logs, and local secrets without deleting files that may belong to the user.
- Add continuous integration for dependency installation, linting or static checks, JavaScript tests, Python checks, build verification, and browser smoke tests.
- Split critical domain behavior out of the monolithic page into focused modules without unrelated visual redesign.
- Establish one authoritative application version source and expose it consistently in diagnostics and release documentation.
- Add typed or schema-validated domain contracts. At minimum, separate `object_type` from `orbit_class` and define units, timestamps, frames, provenance, and nullability.
- Establish the initial time and reference-frame policy, stable internal object identity model, source registry, capability-maturity labels, and scientific validation corpus during v2.0 rather than deferring them until probability analysis.
- Validate catalog ingestion strictly, including TLE line structure, catalog identifiers, epochs, duplicates, source metadata, freshness, parse failures, and lifecycle status.
- Surface catalog freshness, source, retrieval time, retained records, rejected records, and partial-update status in application diagnostics.

### Propagation and screening engine

- Create a pure propagation service that accepts an object record and UTC time and returns a documented state vector or a structured error.
- Keep propagation independent from rendering, camera state, sprite visibility, animation speed, and display coordinate transforms.
- Run selected-object versus catalog screening in a Web Worker so the UI remains responsive.
- Use a conservative broad phase, such as spatial bins, bounding volumes, or another justified method, to reduce candidates without missing threshold crossings under the documented assumptions.
- For surviving pairs, sample both trajectories at identical times over a configurable forecast window.
- Refine candidate minima within bounded intervals to calculate time of closest approach, miss distance, and relative velocity.
- Handle interval boundaries, multiple local minima, propagation errors, duplicate objects, epoch changes, cancellation, progress reporting, and superseded requests.
- Version screening configuration and include it in every result.

### User experience

- Add controls for primary object, forecast start and duration, coarse step, screening radius, refinement tolerance, and cancellation.
- Provide clear idle, loading, progress, completed, empty, partial, stale-data, and error states.
- Show a sortable and filterable event list with object identity, TCA, miss distance, relative velocity, element age, status, and data-quality indicators.
- Visualize a selected event in 3D with synchronized playback at and around TCA. Make visual exaggeration explicit and keep it out of calculations.
- Support keyboard operation, useful focus management, readable tables, reduced motion, mobile layouts, and non-color-only severity cues.
- Label the capability `Experimental TLE-based close-approach screening` or equivalent. Display collision probability as `Unavailable` in v2.0.

### Diagnostics, security, and operations

- Add structured client diagnostics for catalog loading, propagation failures, worker duration, candidates examined, events refined, cancellations, and errors without collecting sensitive data.
- Tighten local server path handling, CORS, cache policy, content types, and error responses. Do not expose repository internals unnecessarily.
- Document static hosting limitations, supported browsers, data-update procedures, scientific limitations, and troubleshooting steps.

### v2.0 required tests and gate

- Verify SGP4 behavior with trusted Vallado reference vectors and cover near-Earth, deep-space, resonant, GEO, HEO, negative-BSTAR, stale-input, and propagation-error cases.
- Test analytic synthetic encounters with known TCA, miss distance, and relative velocity.
- Cover fast and slow encounters, multiple minima, time-window boundaries, reversed pair order, refinement convergence, and invalid states.
- Compare the optimized broad phase with brute-force results on deterministic small catalogs and demonstrate zero missed events for the supported threshold and assumptions.
- Add worker cancellation, supersession, progress, and error-recovery tests.
- Add Playwright tests for the primary desktop and mobile workflows, blocked optional CDN assets, worker startup, accessible controls, console errors, WebGL rendering, and a nonblank canvas pixel check.
- Establish recorded performance budgets for catalog load, selected-versus-catalog screening, UI responsiveness, and memory on representative hardware.
- Do not advance to v2.1 until tests pass, the application runs locally, event results are reproducible, and limitations are visible in both the UI and documentation.

## v2.1: Scalable Full-Catalog Screening

Move screening that exceeds reliable browser limits into a server-side asynchronous pipeline.

- Expand ingestion to the intended payload, debris, and rocket-body catalog sources with source-specific adapters and licensing or redistribution notes. Add CCSDS OMM/OEM and provider ephemeris support where suitable data is available.
- Add lifecycle reconciliation for newly observed, changed, decayed, absent, and reappearing objects. Do not retain objects silently without status metadata.
- Implement durable background screening jobs with explicit states, progress, cancellation, retries, timeouts, idempotency, and versioned configuration.
- Use conservative spatial indexing, time bins, swept volumes, or an equivalently justified algorithm. A production full-catalog pass must not be an unbounded all-pairs `O(N^2)` loop.
- Persist catalog revisions, screening runs, candidates, refined conjunction events, errors, and algorithm metadata.
- Add a versioned `/api/v1` for catalog status, job submission and status, event queries, event details, and health information.
- Use pagination, filtering, stable ordering, request validation, rate limits where appropriate, structured errors, and documented schemas.
- Provide Server-Sent Events or another justified mechanism for job progress and live event updates. Use WebSockets only when bidirectional behavior is needed.
- Keep the static-browser mode functional with clearly reduced capabilities.
- Add benchmark datasets and measure candidate-reduction ratio, screening throughput, memory, persistence volume, API latency, and broad-phase recall against brute force.

The v2.1 gate requires deterministic job replay, no missed supported encounters in recall tests, bounded resource usage for the documented catalog size, authenticated administrative operations where needed, and complete API and deployment documentation.

## v2.2: Validated Collision-Likelihood Assessment

Add probability only after valid uncertainty inputs and independent validation are available.

- Ingest and validate CCSDS Conjunction Data Messages through a proven parser.
- Preserve message identifiers, creation time, object metadata, reference frame, covariance, hard-body radius inputs, maneuver information, provider comments, and source provenance.
- Transform states and covariance into the selected common encounter representation using a validated frame and time library.
- Validate covariance symmetry, units, ordering, positive semidefiniteness, conditioning, epoch consistency, and applicability.
- Select and document a collision-probability method appropriate to the supported encounter assumptions. Record the algorithm name and version with every result.
- Require valid covariance and hard-body radius inputs. If either is missing or invalid, return an explicit reason that probability is unavailable.
- Report applicability warnings for nonlinear motion, long encounters, poor covariance geometry, numerical instability, or assumptions outside the selected method.
- Separate collision probability from miss distance, consequence, data confidence, and review priority.
- Introduce versioned risk-policy configuration with explainable thresholds and no hidden scoring constants.
- Validate parser output, frame transforms, covariance transforms, and probability results against trusted independent examples and reference implementations. Include malformed messages, singular or ill-conditioned covariance, unit errors, frame mismatches, and extreme probabilities.

The v2.2 gate requires traceable scientific references, reproducible benchmark results within documented tolerances, independent review of the method and test vectors, and UI wording that prevents probability from being interpreted as certainty.

## v2.3: Event Operations

Turn validated events into an auditable workflow.

- Store immutable event revisions and preserve links among source messages, catalog revisions, screening runs, policy versions, acknowledgements, and status changes.
- Add historical search, timeline comparison, revision diffs, and event playback.
- Export machine-readable JSON or CSV plus a human-readable report containing all material inputs, units, provenance, methods, limitations, and timestamps.
- Add in-app, webhook, and email notifications with configurable policy, deduplication, cooldowns, retries, delivery status, escalation, quiet periods, and test delivery.
- Keep provider credentials and destination secrets server-side and encrypted using the deployment platform's supported secret mechanism.
- Add acknowledgement, assignment, notes, resolution state, and an append-only audit trail.
- Add scenario workspaces that allow users to save, compare, share, and reproduce screening configurations and event views with authorization controls.
- Add tests for notification retries, duplicate suppression, policy changes, permissions, audit integrity, export reproducibility, and historical playback.

The v2.3 gate requires reliable delivery accounting, reproducible reports, complete audit history, permission tests, retention policies, and operational runbooks.

## v2.4: Platform and Additional Features

Implement the remaining high-value capabilities from the roadmap without weakening the conjunction pipeline.

- Add ground-station definitions and pass prediction with AOS, LOS, maximum elevation, range, range rate, and Doppler estimates using explicit station coordinates and time standards.
- Add RF-link and coverage analysis only with documented antenna, frequency, propagation, obstruction, and visualization assumptions.
- Support historical element revisions and reproducible playback tied to the data that was available at the selected time.
- Improve search, filtering, object comparison, visualization controls, deep links, saved preferences, and export ergonomics.
- Provide graceful behavior without WebGL and test keyboard, touch, reduced-motion, forced-colors, zoom, and screen-reader workflows.
- Optimize asset and catalog delivery with compression, caching, chunking, incremental loading, integrity checks, and an explicit offline or degraded-data policy.
- Complete deployment automation, health checks, backups, restoration tests, logs, metrics, traces where justified, alerting, data-retention controls, incident response, and upgrade documentation.
- Keep architecture, API, data-source, scientific-method, contribution, testing, and release documentation current.

The v2.4 gate requires cross-browser and mobile verification, documented numerical validation for pass predictions, tested restore procedures, monitored production-like deployment, and accessibility checks on all critical workflows.

## v2.5: Maneuver What-If Research

Treat maneuver analysis as research-oriented decision support, not autonomous operational guidance. Begin it only after the v2.2 validation gate is satisfied.

- Create explicit maneuver scenarios with burn epoch, delta-v vector, reference frame, execution uncertainty, constraints, and provenance.
- Use a propagation model appropriate to the maneuver horizon and required fidelity. Document where TLE/SGP4 is no longer suitable.
- Re-screen the modified trajectory against the relevant catalog and compare before-and-after TCA, miss distance, probability where valid, and secondary conjunctions.
- Support side-by-side alternatives, sensitivity analysis, constraint violations, and reproducible scenario export.
- Include operational constraints such as lead time, fuel proxy, allowed burn windows, communications or visibility windows, and protected-orbit considerations only when the data is real and sourced.
- Never issue an automatic `recommended maneuver` without validated optimization criteria, authoritative inputs, human review, and an explicit operational governance model. Prefer `what-if alternative` wording.
- Validate maneuver propagation and re-screening against independent high-fidelity tools and reviewed test cases before any production-ready claim.

The v2.5 gate requires independent scientific review, explicit research labeling, reproducible scenarios, secondary-event analysis, documented fidelity limits, and a clear prohibition on autonomous command generation.

## Testing and validation requirements across all releases

- Keep unit tests deterministic and independent from live external services.
- Use fixed fixtures with documented origin, license, units, frames, and expected tolerances.
- Add integration tests that start the real API and worker processes rather than only checking source strings.
- Add contract tests for catalog, event, API, export, and notification schemas.
- Add end-to-end browser tests for desktop and mobile, including failure and degraded-data paths.
- Test numeric invariants, pair-order symmetry where applicable, boundary behavior, cancellation, stale jobs, duplicate inputs, and reproducibility.
- Maintain brute-force comparison suites for screening recall on tractable catalogs.
- Track performance regressions with representative catalog sizes and committed budgets.
- Run security checks for dependencies, path traversal, input validation, CORS, secret exposure, injection, authorization, rate abuse, and unsafe report rendering.
- Record validation evidence and tolerances in version-controlled documentation.

## Implementation workflow

For each release:

1. Re-read the relevant `ROADMAP.md` items and inspect the affected code and tests.
2. Write a short implementation plan that maps roadmap acceptance criteria to concrete files, modules, migrations, tests, and documentation.
3. Identify current worktree changes and preserve anything unrelated.
4. Implement the smallest end-to-end slice first, then iterate.
5. Run focused tests after each slice and the complete applicable suite before declaring the release complete.
6. Inspect the application in a real browser at desktop and mobile sizes. For WebGL views, verify the canvas is nonblank, correctly framed, and free from incoherent overlaps or console errors.
7. Measure the release's stated performance and scientific-validation criteria.
8. Update `ROADMAP.md`, changelog or release notes, version metadata, API documentation, deployment instructions, and known limitations.
9. Produce a completion report with:
   - implemented roadmap item IDs;
   - important architectural decisions;
   - files and public contracts changed;
   - tests and validation results;
   - measured performance against budgets;
   - security and accessibility checks;
   - remaining limitations and open risks;
   - migration or operator actions;
   - readiness decision for the next version.

Do not mark a roadmap item complete merely because a UI placeholder or interface exists. Its acceptance criteria, tests, documentation, error handling, and validation must also be complete. Do not silently skip items that are blocked; document the blocker, evidence, impact, and the concrete condition required to resume.

Start implementing v2.0 now. Do not proceed to v2.1 until the v2.0 gate passes. When v2.0 is complete, start the local development server, verify the main workflows in a browser, provide the URL and completion report, then stop and wait for explicit human approval before continuing the release train.
```
