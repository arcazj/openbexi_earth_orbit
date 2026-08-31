# Experimental Conjunction Screening in v2.0

## Claim Boundary

Version 2.0 provides **Experimental TLE-based close-approach screening** for evaluating one selected catalog object against the loaded catalog. It is an evaluation aid, not operational collision prediction, a collision warning service, or a basis for maneuver decisions.

The software reports synchronized geometric close approaches. It does not report physical contact, consequence, operational priority, or probability of collision. `collision_probability` and `hard_body_radius_km` are `null`, covariance status is `UNAVAILABLE`, and the UI and exports must display probability as unavailable. No percentage or heuristic is substituted.

The v2.0 capability record is `preview`, with `Experimental` scientific maturity and `non-operational` safety class. The authoritative application record has since advanced to Version 2.3.1 development; that change does not promote the v2.0 scientific claim. Software version, software quality, and scientific maturity are separate claims.

## Supported Calculation

The implemented path is:

`validated TLE catalog -> satellite.js SGP4 propagation -> Web Worker screening -> synchronized TEME states -> bounded TCA refinement -> event list and 3D playback`

- Inputs are a selected primary object, a normalized catalog snapshot, a UTC interval, screening radius, coarse step, refinement tolerance, subdivision count, result limit, and complete source/dataset provenance. The closed, versioned request contract records all effective refinement, curvature, padding, work-yield, frame, and time-scale settings.
- In Version 2.3.1, the visible catalog summary, request metadata, and frozen export also record `tracked_count`, `propagatable_count`, `metadata_only_excluded_count`, and `screening_coverage_fraction` for the current SATCAT-scoped population. This makes missing-current-element exclusions visible. If the tracked manifest is unavailable or slow, the denominator, exclusion, and fraction remain unknown rather than reporting zero excluded or complete coverage. It is an input-eligibility ratio, not the engine's pair-interval coverage, accuracy, collision probability, or a provider-completeness claim.
- `js/orbit/propagationService.js` prepares TLEs once and returns state vectors in kilometers and kilometers per second at an explicit UTC instant.
- SGP4 output is labeled `TEME`. The implementation does not relabel it GCRF, J2000, ITRF, or high-precision inertial truth.
- `js/conjunction/conjunctionWorker.js` keeps catalog screening off the browser main thread. Its client uploads the catalog in bounded chunks, coalesces progress messages, supports request-scoped cancellation, and discards a crashed Worker so the next request can create a fresh instance.
- `js/conjunction/conjunctionScreening.js` compares primary and secondary states at identical UTC instants. Scene coordinates, object-type colors, rendered/in-place-refreshed orbit lines, cached Mercator ground tracks, per-record state proxies, batched/density marker buffers, marker radii, and visual scale are never screening inputs. Version 2.3.1 retains bounded Hermite interpolation for non-selected display positions, but that interpolation remains outside the Worker calculation; the selected display object continues to use an exact per-frame SGP4 state. SATCAT-only tracked records have no GP state and are excluded from the Worker rather than receiving a synthetic position. Red debris rendering is a taxonomy cue, not a hazard or collision-risk input. Hiding/retrying a failed visual propagation does not change the Worker's explicit error/result state.
- Results contain the complete typed request and effective configuration, TCA, miss distance, relative position and velocity, relative speed, element epochs and signed ages, input element-set IDs, full dataset-source and algorithm provenance, structured propagation errors, maturity, statistics, and quality flags.

## Screening and Refinement Method

For each eligible secondary object, the engine evaluates a common coarse time grid that includes both interval boundaries. It skips the primary object and deterministically resolves duplicate catalog entries to one element set.

Within each coarse interval, the engine finds the closest point on the straight relative-position chord. It admits the interval when the chord distance is within the configured screening radius plus explicit padding and a curvature margin:

`margin = maximum_relative_acceleration * interval_duration^2 / 8`

The default acceleration bound is based on twice surface gravitational acceleration with a 1.25 multiplier. This is a conservative software screening assumption, not an uncertainty model. Lowering the configured bound or otherwise violating the documented motion assumption can create false negatives.

Each admitted interval is sampled at bounded deterministic subdivisions plus neighboring samples. A candidate must be a neighbor-confirmed local basin or an actual screening-window boundary minimum. Half-open ownership assigns shared coarse-boundary samples to only one interval. Candidate basins are refined with a bounded golden-section search until the configured time tolerance or iteration limit is reached, and overlapping brackets that converge to the same minimum are deduplicated. Only refined minima at or below the screening radius are returned. Results are deterministically sorted and capped; truncation and incomplete propagation/refinement coverage are explicit quality flags.

The current broad phase is an interval-level conservative chord test for every prepared catalog object. It is not a spatial index and remains approximately proportional to catalog size times coarse samples. The preview rejects requests beyond a 24-hour horizon, 100,000 grid points, 100,000 catalog objects, or 500,000 estimated coarse catalog propagations. Server-side full-catalog and all-pairs scaling are deferred beyond v2.0.

## Data-Quality Behavior

- Malformed TLEs, checksum failures, identifier inconsistencies, duplicate records, and source metadata are handled by the catalog validation/quarantine boundary.
- Propagation failures do not silently become valid states. They are retained as bounded structured error records and mark result coverage incomplete.
- Dataset identity/hash mismatches are rejected. Complete source provenance and partial/degraded source status propagate through requests, events, results, and exports.
- Freshness is evaluated at screening-window boundaries and again for each participant at TCA. Stale, future-epoch, and missing-epoch conditions are explicit; element `age_days` is signed, so an element epoch after TCA produces a negative age rather than being hidden.
- Non-converged refinement is returned only with an explicit `REFINEMENT_NOT_CONVERGED` flag.
- Nearly identical geometry and relative velocity are flagged `COLOCATED_OR_COMMON_TLE_GEOMETRY`; this can represent attached objects, formation members, or duplicated/common element geometry and must not be interpreted as a predicted collision.
- A result limit retains the earliest events in the engine's deterministic TCA/pair-key ordering; detected, reported, and truncated counts remain distinct. This ordering is not a risk-priority score.

## Validation Evidence

The current automated evidence is intentionally initial rather than comprehensive:

| Evidence | Coverage | Acceptance used in v2.0 |
| --- | --- | --- |
| Vallado/CelesTrak SGP4 verification cases 00005 and 21897 | Vanguard near-Earth path and a negative-BSTAR resonant path | Numeric TEME position within 5 m and velocity within 5 mm/s of published output at the manifest's epoch/offset samples; tolerances include JavaScript millisecond epoch resolution |
| Official SGP4 verification cases 28129, 26975, and 28626 | Deep-space non-resonant, HEO half-day resonant, and GEO synchronous resonant paths | Numeric TEME position within 5 m and velocity within 5 mm/s of published output at epoch and +120 minutes |
| Analytic synthetic relative-motion cases | Known TCA, miss distance, relative speed, slow/fast passes, boundaries, reversed ordering, and result limits | Deterministic results within the tolerances encoded in `tests/conjunctionScreening.test.js` |
| Dense deterministic oracle comparison | Threshold inclusion and conservative curved encounter | No missed supported event in the checked small synthetic corpus |
| Multiple/minimum-ownership synthetic cases | Multiple local minima, flat/co-located geometry, and a minimum shared by coarse intervals | Neighbor-confirmed supported minima are found once; shared boundaries use half-open ownership and overlapping refinements deduplicate |
| Negative and degraded cases | Invalid TLE/state, propagation failure, stale/future/missing epochs, degraded source provenance, mixed dataset identity, incomplete refinement, cancellation, and preview work limits | Structured rejection/error retention or explicit quality flag |
| Worker protocol tests | Chunked catalog transport, progress delivery, completion, error serialization, cancellation/rerun, crash recovery, and client fallback | Deterministic message behavior without stale completion acceptance; a failed Worker can be recreated |
| Browser journeys | Desktop/mobile controls, worker startup, completion, playback, and rendered markers | Preview workflow functions without using scene values in the calculation |

Primary test locations are `tests/propagationService.test.js`, `tests/conjunctionScreening.test.js`, `tests/conjunctionWorkerProtocol.test.js`, and `tests_browser/conjunction.spec.js`. Fixture provenance and corpus promotion requirements are tracked in `docs/validation/VALIDATION_CORPUS.md`.

## Known Limitations

1. TLE/SGP4 accuracy degrades with element age, maneuvers, drag uncertainty, catalog errors, and propagation distance from epoch. A small computed miss distance can be far below the real position uncertainty.
2. Two objects derived from the same provider or estimation process can have correlated errors that are not represented here.
3. TEME states are compared consistently, but v2.0 does not ingest Earth-orientation parameters, leap-second tables, covariance frames, or high-fidelity force models.
4. Catalog completeness, object type, lifecycle state, maneuvers, dimensions, mass, maneuverability, covariance, and hard-body radius are not guaranteed by the current feed.
5. The v2.0 frozen export and original source adapter consume legacy TLE. That format cannot encode six-digit catalog identifiers. Version 2.2 adds preferred OMM to the shared application catalog, but historical v2.0 exports and TLE-only compatibility runs remain incomplete.
6. The subdivision and acceleration-bound assumptions are tested over a declared synthetic envelope; they are not a proof for arbitrary trajectories or user-weakened configuration.
7. Browser execution is selected-object versus catalog only. It does not provide durable scheduling, event history, alert delivery, independent availability, or full-catalog all-pairs coverage.
8. Reported decimal precision is computational output, not a claim that TLE truth is known to that precision.
9. Visual markers and trajectories are deliberately exaggerated for inspection. They do not represent object size, uncertainty volume, or collision geometry.

## Reproduction

Run the release and scientific checks with locked dependencies:

```powershell
npm ci
npm run check
npm test
```

A reproducible event also requires the same catalog dataset/hash, element-set IDs, UTC window, complete screening configuration, and algorithm version. The schema 2.0.0 JSON export embeds a frozen catalog with exact TLEs plus the full request and result, so external tooling can replay the recorded inputs. The application cannot import that payload in v2.0, and v2.0 does not provide a durable event store.

## Promotion Criteria

The v2.0 candidate includes a checksum-consistent corpus manifest with source/checksum/tolerance metadata, but it is not immutable until committed and published under a tag, archive, or signature, and its review state remains `pending`. `Experimental` must not be promoted to `Validated` until licensed-reference compatibility is approved, an independent reviewer approves the corpus and expected results across supported orbit regimes, an automatically generated error-distribution report is archived, and representative named-hardware performance evidence passes its declared gates. Operational use additionally requires a separate safety case, governance, provider agreements, monitoring, and human procedures; it is not implied by validation.
