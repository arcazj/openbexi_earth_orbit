# Conjunction Screening v2.0

> Historical method note: this document describes the Version 2.0 TLE-only browser workflow. Version 2.3.1 retains the preferred mixed GP/OMM application catalog and display-only interpolation, and adds SATCAT-scoped metadata discovery whose metadata-only records are excluded from screening. The three event-specific debris GP groups remain a partial positioned subset and do not make metadata-only debris screenable. It does not promote screening maturity or add collision probability. Current decisions are in ADRs 0004 through 0006 and `RELEASE_CHECKLIST_V2_3.md`.

## Capability and scope

The v2.0 browser capability screens one selected catalog object against a TLE catalog. It is an experimental close-approach screen, not an operational conjunction assessment. It does not calculate collision probability, infer physical attachment, recommend maneuvers, or replace operator data and validated covariance analysis.

All propagated states explicitly use:

- UTC timestamps at JavaScript millisecond resolution.
- The SGP4-native TEME frame.
- Kilometers for position and kilometers per second for velocity.
- The pinned `satellite.js` 6.0.2 implementation.

The propagation service returns `{ ok: true, value }` or `{ ok: false, error }`. Errors identify the stage, object, element set, timestamp, propagator code when available, and whether the failure is recoverable.

## Screening algorithm

1. Prepare TLE records, skip the primary self-pair, and deterministically select the newest element set when a catalog repeats an object ID.
2. Propagate primary and secondary states at the same UTC grid instants in TEME.
3. Compute the minimum of the relative-position chord for each coarse interval.
4. Admit an interval when its chord minimum is no greater than the report radius plus a conservative curvature allowance and configured padding.
5. Search each admitted interval using deterministic subdivisions plus neighboring samples. Only neighbor-confirmed local basins or actual screening-window boundary minima are eligible; half-open coarse-interval ownership prevents a shared sample from becoming two events.
6. Apply bounded golden-section refinement, sort events by TCA and canonical pair key, deduplicate overlapping brackets that converge to the same minimum within the refinement tolerance, and apply the configured result cap.

The curvature allowance is:

```text
margin_km = max_relative_acceleration_km_s2 * interval_seconds^2 / 8
```

This bound assumes the relative acceleration magnitude does not exceed the configured value throughout the interval. Maneuvers, bad element sets, or an underestimated bound invalidate the broad-phase recall argument. The default bound is based on twice the surface gravitational acceleration with a 25 percent allowance.

The default local-minimum scan uses 16 subdivisions only after broad-phase admission. The setting is capped at 128. It handles multiple sampled basins in one coarse interval and avoids duplicate flat/shared-boundary minima across adjacent intervals, but distinct minima narrower than the subdivision cadence may not be separated. Tighten the coarse step or increase subdivisions for a validation study; do not interpret either setting as a guarantee of operational accuracy.

The v2.0 preview also enforces bounded request resources: at most a 24-hour horizon, 100,000 grid points, 100,000 catalog objects, and 500,000 estimated coarse catalog propagations (`catalog size * grid points`). A request beyond these bounds is rejected before screening rather than consuming unbounded browser resources.

## Quality and provenance

The closed, versioned `ScreeningRequest` records the full configuration, UTC window, TEME/UTC conventions, primary identity, optional candidate identities, and complete dataset provenance. The versioned result retains that request, the effective configuration, structured propagation errors, statistics, events, dataset provenance, computation provenance, and quality flags. Dataset identity/hash mismatches are rejected instead of mixing catalog sources. Every state and event carries dataset, element-set, algorithm-version, and configuration-hash provenance. Input catalog quality flags survive propagation. Event flags prefix participant-specific input concerns with `PRIMARY_` or `SECONDARY_`.

Important result and event flags include:

- `TLE_SGP4_SCREENING_ONLY`: TLE-based experimental screening.
- `COLLISION_PROBABILITY_UNAVAILABLE`: no validated covariance and hard-body-radius calculation.
- `INCOMPLETE_PROPAGATION_COVERAGE`: one or more states could not be propagated.
- `INCOMPLETE_REFINEMENT_COVERAGE`: a candidate interval could not be fully evaluated.
- `REFINEMENT_NOT_CONVERGED`: a reported event reached the iteration bound before the requested tolerance.
- `RESULT_LIMIT_APPLIED`: deterministic output truncation occurred.
- `PRIMARY_TLE_STALE_AT_TCA` or `SECONDARY_TLE_STALE_AT_TCA`: the signed element age at TCA exceeds the object/orbit freshness policy.
- `PRIMARY_TLE_EPOCH_AFTER_TCA` or `SECONDARY_TLE_EPOCH_AFTER_TCA`: TCA precedes the element epoch; the corresponding `age_days` value is negative.
- `STALE_INPUTS_AT_SCREEN_TIME`, `FUTURE_EPOCH_INPUTS_AT_SCREEN_TIME`, or `MISSING_ELEMENT_EPOCH_INPUTS`: at least one screened input has the stated freshness condition at the screening-window boundaries.
- `PARTIAL_SOURCE_DATASET` or `DEGRADED_SOURCE_DATASET`: source provenance says the catalog is not complete.
- `COLOCATED_OR_COMMON_TLE_GEOMETRY`: non-empty TLE lines match, or miss distance is at most 1 meter and relative speed is at most 1 millimeter per second. This means Review; it does not establish attachment, docking, or collision.

The Worker client uploads catalogs in bounded chunks and yields between small chunk batches so a full structured-clone operation does not monopolize the main thread. Worker progress is coalesced across the transport boundary, transport request IDs are unique across cancel/rerun cycles, cancellation is request-scoped, and a crashed Worker is terminated so a later request can create a fresh instance. The visible-object animation loop is also time-budgeted. These controls improve responsiveness and recovery; they do not make selected-object screening a durable background service or establish smooth full-catalog input latency.

Changing any screening input invalidates a completed or running result, clears its visualization/details, and disables export until a new screen completes. Share URLs can retain bounded conjunction event and request identifiers (`conjEvent` and `conjRequest`) without embedding the frozen catalog or result payload. They identify event context only; v2.0 has no durable event store, so a shared identifier is not a guarantee that another session can resolve or reproduce the event without its exported input bundle.

JSON export schema 2.0.0 embeds the exact frozen catalog objects and TLE lines, full request, result configuration, provenance, and result. The payload is therefore replayable by external tooling from its recorded inputs. The application does not import these exports in v2.0, and there is no durable event store.

## Validation evidence

`tests/propagationService.test.js` uses the official Vallado/CelesTrak SGP4 verification corpus:

- [SGP4-VER.TLE](https://github.com/CelesTrak/fundamentals-of-astrodynamics/blob/main/datalib/SGP4-VER.TLE)
- [Published MATLAB verification output](https://github.com/CelesTrak/fundamentals-of-astrodynamics/blob/main/software/matlab/SGP4/tmatverDec2015.out)
- [AIAA 2006-6753 publication page](https://celestrak.org/publications/AIAA/2006-6753/)

Numeric TEME comparisons cover Vanguard 00005 and official deep-space non-resonant 28129, HEO half-day resonant 26975, GEO synchronous resonant 28626, and negative-BSTAR 21897 cases at epoch and 120 minutes where encoded by the corpus. The 5 meter position and 5 millimeter-per-second velocity tolerances include the official fixtures' sub-millisecond epoch precision, which JavaScript `Date` cannot represent exactly.

`tests/conjunctionScreening.test.js` covers analytic TCA, a curvature-only interior pass, exact threshold inclusion, actual window boundaries, slow encounters, multiple minima, multi-interval monotonic/flat cases, half-open ownership and deduplication, deterministic result limits, reversed pair order, duplicate element-set selection, stale/future/degraded inputs, invalid states, incomplete and non-converged refinement, cancellation, and co-located geometry.

An earlier local Node profile on a 16,347-record catalog using a one-hour window, 300-second coarse step, and 100 km radius completed in about 8 seconds. Sixteen subdivisions added about 4.7 percent more propagation calls and 1.7 percent wall time than one subdivision in that run. This historical diagnostic is not a portable performance guarantee; current browser evidence and its limitations are recorded in `docs/engineering/PERFORMANCE_BUDGETS.md`.

Run the focused checks with:

```powershell
node tests/propagationService.test.js
node tests/conjunctionScreening.test.js
node tests/conjunctionWorkerProtocol.test.js
```
