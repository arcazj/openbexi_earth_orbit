# ADR 0002: Browser Selected-Object Conjunction Screening

- Status: Accepted for v2.0 preview
- Date: 2026-07-19
- Owners: Project maintainers
- Scientific maturity: Experimental
- Safety class: Non-operational

## Context

The v2.0 milestone needs a useful close-approach workflow while preserving static hosting and avoiding unsupported collision-probability claims. The legacy page mixes visualization, propagation, and UI state, and a catalog screen on the main thread would interrupt rendering and interaction. The available catalog supplies TLEs but no validated covariance or hard-body radius.

## Decision

1. v2.0 supports one selected primary object versus the currently validated catalog in a browser Web Worker. Full-catalog all-pairs screening, persistence, schedules, and alerts are deferred to a server-side architecture.
2. `satellite.js@6.0.2` is wrapped by a pure propagation service. Calculation boundaries use UTC, TEME, kilometers, and kilometers per second; Three.js coordinates are display-only.
3. The engine uses synchronized coarse sampling, a chord-distance broad phase with an explicit acceleration-bound curvature margin, neighbor-confirmed local basins, half-open ownership at shared coarse boundaries, overlapping-bracket deduplication, and bounded TCA refinement.
4. The closed typed request and result retain the full effective configuration, source/dataset and computation provenance, input element-set identity, signed element ages, bounded structured propagation errors, statistics, and quality flags. Mixed dataset identities are rejected.
5. Miss distance and relative velocity are geometric screening outputs. Collision probability remains unavailable until valid covariance, hard-body radius, frame transformation, method selection, and independent validation exist.
6. The capability is recorded in `release/feature-flags.json`. `npm run version:sync` generates a browser-safe effective flag that fails closed unless enabled state, release channel, maturity, and safety class match. It can be disabled without a data migration because v2.0 does not persist screening results.
7. Browser requests are capped at a 24-hour horizon, 100,000 grid points, 100,000 catalog objects, and 500,000 estimated coarse catalog propagations. These limits bound the preview execution surface; they are not a scale or accuracy claim.
8. The Worker client transfers catalog records in bounded chunks, coalesces progress across the transport boundary, scopes cancellation to unique transport IDs, and recreates the Worker after a crash. The export embeds a frozen catalog and full request/result for external replay, but application import and durable storage are deferred.

## Rejected Alternatives

- Rendered orbit-line intersections, sprite overlap, and Three.js scene distance were rejected because they are asynchronous visual approximations with arbitrary scale.
- Main-thread catalog screening was rejected because it would block the interactive visualization.
- A heuristic risk percentage was rejected because TLEs do not provide the uncertainty and hard-body-radius inputs needed for defensible probability.
- Browser all-pairs screening was rejected for v2.0 because bounded resource use and catalog-scale recall have not been established.
- Relabeling TEME as generic ECI/GCRF was rejected because it hides a material frame limitation.

## Consequences

- Static deployments retain the experimental selected-object workflow and remain usable without the Python server.
- Chunked Worker transfer, coalesced progress, cancellation, and crash recovery reduce main-thread stalls and contain failures, but total screening time still grows with catalog size, forecast samples, and admitted refinement intervals.
- The result is reproducible only with the exact dataset, element sets, configuration, and algorithm version. The self-contained export preserves those inputs for external replay; v2.0 cannot import it back into the application.
- Stale or incomplete inputs can still produce geometric events, but the quality state must remain visible and prevents a stronger scientific claim.
- A future server implementation may reuse domain contracts but must add job durability, storage migrations, authentication, quotas, recall benchmarks, and observability.

## Rollback

Disable `experimental_conjunction_screening` in `release/feature-flags.json`, run release policy checks, and redeploy. No screening database or catalog migration must be reversed. Existing visualization and catalog diagnostics remain available.
