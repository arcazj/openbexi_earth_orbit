# Experimental Full-Catalog Screening in Version 2.1

Last reviewed: 2026-07-21

## Claim Boundary

Version `2.1.0` development adds asynchronous, durable, server-side **geometric close-approach screening**. It reports synchronized time of closest approach (TCA), miss distance, relative velocity, immutable input identity, algorithm/configuration provenance, and data-quality diagnostics for supported orbital inputs.

It does not compute collision probability, ingest CCSDS Conjunction Data Messages (CDMs), validate covariance, assign an operational risk score, deliver alerts, or recommend maneuvers. All output is `Experimental` and `non-operational`. A small miss distance is not a probability of collision, a prediction of physical contact, or an instruction to act.

Version 2.1 is in development publication state. It is neither a release candidate nor a release. Its implementation does not retroactively close the open v2.0 promotion gates and does not authorize v2.2.

## Supported Computation

The durable runner accepts a frozen, checksummed catalog revision and a normalized Version 2.1 request. The current screening path requires UTC timestamps and a common TEME frame.

- Legacy TLE JSON uses the locked `satellite.js` SGP4 implementation.
- CCSDS OMM JSON or KVN is supported only for explicit SGP4 theory, UTC time, and TEME output accepted by the adapter.
- CCSDS OEM KVN and provider ephemeris adapters preserve bounded tabulated states, original records, frame, time scale, units, and interpolation policy. The multi-format propagation service can interpolate supported TEME, GCRF, or ITRF tables without extrapolation or frame conversion; the full-catalog runner rejects a catalog unless every selected record is already TEME.
- Source adapters require explicit provenance, enforce byte/record/line/sample limits, reject ambiguous identities and duplicate objects, and can apply unambiguous SATCAT classification enrichment.
- The bundled server bootstrap currently registers the local TLE snapshot. The adapters do not by themselves admit a provider, fetch external data, resolve its license, or provide a public catalog-upload API.

The screening engine proceeds through bounded stages:

1. Normalize catalog scope and configuration, enforce maximum horizon/grid/work/result limits, and sort object identity deterministically.
2. Partition the UTC window into synchronized time slabs and propagate object endpoints.
3. Build motion- and threshold-expanded swept axis-aligned bounds and insert them into a bounded three-dimensional spatial hash.
4. Deduplicate canonical pairs admitted from shared cells, apply the relative-chord bound, and persist candidate interval identity.
5. Reuse the bounded pair-interval refinement method to compute local TCA, geometric miss distance, and relative velocity.
6. Sort results deterministically and record coverage, caps, failures, quality flags, and immutable algorithm/configuration/catalog identities.

The production runner does not enumerate every pair as its broad phase. The reported `pair_intervals_total` is a combinatorial coverage denominator; actual spatial and canonical pair checks are measured separately. A brute-force path exists only as a tractable deterministic test oracle.

## Durable Execution Semantics

- Catalog revisions are copied into private content-addressed storage and tied to a SHA-256 dataset identity.
- Startup and successful scheduled TLE refreshes register immutable revisions and reconcile observed records as `NEW`, `CHANGED`, or `REAPPEARED` (with stable observations recorded separately). Current incremental metadata is `PARTIAL`; `ABSENT` is generated only from a successful explicit full (`mode=all`) source snapshot.
- Jobs have explicit `QUEUED`, `RUNNING`, `CANCEL_REQUESTED`, `CANCELLED`, `SUCCEEDED`, `FAILED`, and `TIMED_OUT` states.
- A normalized request plus principal-scoped idempotency key prevents accidental duplicate admission; a key reused for different input is rejected.
- One local worker claims durable jobs. Attempt number and worker ownership fence every progress update, result import, and completion so a stale worker cannot complete a later attempt.
- Cancellation, bounded retry, timeout, and restart recovery are state transitions recorded in SQLite with progress, outbox, and audit records.
- The runner writes its result atomically. The service verifies the reported checksum and imports candidates, events, errors, and summary in one transaction.
- Replay creates a new job tied to the original frozen request and catalog revision. Persisted event-revision IDs are namespaced by job and attempt while the engine event ID remains in the payload, so a completed replay cannot overwrite or collide with the original history. This is deterministic input replay, not a claim that floating-point output will match across every unqualified platform or future engine version.

SQLite WAL and the single worker form a local development boundary. They do not provide distributed exactly-once execution, horizontal scaling, tenant isolation, or a production availability guarantee.

## Complete and Partial Results

`SUCCEEDED` means the worker and atomic import completed; scientific result status and quality must still be inspected. A result is `PARTIAL` when any supported pair interval cannot be screened or when a configured scientific/resource bound prevents complete coverage.

Conditions that prevent a complete-coverage claim include:

- source records rejected or missing from the selected scope;
- endpoint or refinement propagation failure;
- unsupported frame, time scale, theory, units, or interpolation range;
- acceleration or kinematic bound violation;
- dense-cell, membership, spatial-check, candidate-interval, or detected-event work cap that stops broad-phase or refinement coverage;
- cancellation, timeout, or runner failure;
- partial/stale source status or incomplete legacy identifier coverage.

`max_results` truncates the returned event array only after detected events have been evaluated and reports `RESULT_LIMIT_APPLIED` plus `events_truncated`; it does not by itself change scientific coverage status. `max_persisted_candidates` truncates retained intermediate candidate rows after screening and reports `PERSISTED_CANDIDATE_LIMIT_APPLIED`; it does not omit refined events or by itself make the result `PARTIAL`. Structured-error detail is also bounded with an explicit truncated count. The service rejects an oversized result artifact, but it does not implement an OS/process memory cap.

Unscreened intervals, propagation failures, detected and persisted candidate counts, event/result/error truncation, and motion-bound violations are explicit statistics or quality flags. A partial result must never be described as no conjunctions or complete catalog coverage, and a truncated result set must never be described as the full event/candidate history.

## Accuracy Limits

- TLE/OMM SGP4 states are catalog-screening inputs, not precision ephemerides or orbit-determination products.
- Element age, maneuvers, drag, model mismatch, propagation horizon, source omissions, and shared catalog errors can dominate geometric miss-distance accuracy.
- The legacy bundled TLE feed cannot represent newly assigned six-digit catalog identifiers. A successful bundled-catalog run is not current official full-catalog coverage.
- The bundled TLE snapshot does not reliably classify every payload, rocket body, debris object, or lifecycle state; the server preserves unknown classification instead of guessing.
- No position covariance, cross-correlation model, hard-body radius, encounter-plane probability, or independently reviewed risk policy is available.
- Tabulated ephemeris interpolation is bounded and linear in position/velocity between explicit samples. Extrapolation, ambiguous metadata, frame conversion, and time-scale conversion are rejected.
- The broad phase assumes the configured acceleration/curvature bound covers supported motion over each slab. A detected violation makes coverage partial.
- Broad-phase recall is established only inside the declared deterministic test envelope. It is not proof over every orbit, catalog, threshold, step, or malformed input.

## Development Validation Evidence

`validation/v2.1.0/manifest.json` binds the engine, runner, adapter, propagation, and benchmark artifacts by checksum. Its review status is pending.

Current executable evidence includes:

- `tests/fullCatalogScreening.test.js`: deterministic small catalogs compared with a brute-force relative-chord candidate oracle, analytic linear encounters, pair ordering, boundaries, caps, cancellation, and partial coverage;
- `tests/fullCatalogRunner.test.js`: frozen input checksum, private path confinement, atomic output identity, structured progress, TLE/OMM behavior, and fail-closed rejection of non-TEME provider ephemeris;
- `tests/orbitalSourceAdapters.test.js` and `tests/multiFormatPropagationService.test.js`: supported formats, original-record preservation, SATCAT enrichment, strict frame/time/unit policy, bounded interpolation, and rejection paths;
- Python store, manager, security, and API tests: migrations, lifecycle reconciliation, idempotency, state transitions, ownership fencing, cancellation, timeout, recovery, completed replay with distinct persisted event IDs, signed pagination, authorization, rate/body bounds, and SSE resume behavior;
- `tools/benchmark_v21_service.py`: fresh-runtime execution through the real loopback handler, bearer roles, SQLite store, worker, job polling, paginated event reads, clean shutdown, and persistence accounting.

The committed local observation at `validation/v2.1.0/benchmarks/local-full-catalog-60s-2026-07-20.json` used:

- 16,443 selected source records and one 60-second slab;
- 135,177,903 possible pair intervals;
- an Intel Core i7-9700, 8 logical CPUs, 34.2 GB system memory, Windows, and Node 24.13.0;
- 2.973 seconds wall time, about 371.5 MB peak observed RSS, and a 3,128,543-byte result;
- 309,398 spatial pair checks, a 99.7686% reduction relative to the valid pair-interval denominator;
- 835 coarse/persisted candidates and 214 reported geometric events.

The result was correctly `PARTIAL`: the incremental source carried `PARTIAL_SOURCE_DATASET`, while 176 propagation failures and three motion-bound violations contributed to 1,492,127 explicitly unscreened pair intervals. This is one dirty-worktree, one-machine, one-snapshot development observation. It is not percentile evidence, an operational capacity claim, proof of a one-hour service budget, or independent scientific validation.

The separate end-to-end observation at `validation/v2.1.0/benchmarks/local-v21-service-2026-07-20.json` used the same 16,443-object snapshot through the real loopback HTTP, authentication, SQLite, worker, event-query, shutdown, and persistence path. The worker completed in 4.392 seconds; the job state was `SUCCEEDED`, but its scientific status was correctly `PARTIAL` with 1,524,828 unscreened pair intervals, 178 propagation failures, four motion-bound violations, 846 candidates, 241 events, and 100 persisted errors. Registry provenance was `source_status: PARTIAL`, and the result retained `PARTIAL_SOURCE_DATASET`.

After clean shutdown the disposable runtime occupied 38,059,874 bytes, including a 25,501,696-byte SQLite database, 9,337,154 catalog bytes, and 3,221,024 job-artifact bytes. Before shutdown, SQLite plus WAL/shared-memory occupied 47,403,264 bytes and the complete runtime occupied 59,961,442 bytes. One job retained 22 progress rows, 26 total outbox rows, and 27 audit rows. The manager persists first-stage, 1% advancement, and bounded-heartbeat snapshots and enforces a hard limit of 512 progress records per attempt while reserving the latest pre-terminal snapshot. Consumer acknowledgement/pruning, retention automation, and representative database-growth budgets remain explicit promotion work.

The service report contains 27 job-status reads with 22.793 ms local p95 and two event-page reads with 47.521 ms local p95. Other endpoint labels have only one sample. These loopback, uncontrolled, dirty-worktree observations exclude TLS, proxy, network, concurrency, queue contention, and longer horizons. `benchmark_status: PASS` means the development harness completed its assertions; it is not release-gate, capacity, or scientific approval.

Reproduce a local measurement with:

```powershell
npm run benchmark:full-catalog -- --output artifacts/full-catalog-benchmark.json
npm run benchmark:v21-service -- --output artifacts/v21-service-benchmark.json
```

The first command measures the engine. Use `--limit`, `--start-time`, `--horizon-seconds`, `--coarse-step-seconds`, and `--screening-radius-km` to name a different bounded profile. The second command exercises the real loopback API, SQLite store, worker, event query, shutdown, and persistence path in a fresh private runtime. Use `--object-limit` for a smaller service profile and `--keep-runtime` only when private-state inspection is required. Keep raw output with the exact source, catalog, metadata, lockfile, and validation-manifest hashes.

## Open Validation Gates

- Repeat representative one-hour and six-hour profiles on named hardware and projected catalog sizes.
- Establish API-latency, queue, database-growth, recovery-time, and retention budgets.
- Validate progress coalescing under representative long-running and failure/recovery profiles, and define outbox consumer acknowledgement/pruning and retention behavior.
- Accept an independent orbital truth set or cross-tool full-catalog comparison with tolerances.
- Independently review the swept-bound assumptions, brute-force oracle, refinement method, and partial-result semantics.
- Admit an OMM-capable source that covers current identifiers under reviewed license, retention, and redistribution terms.
- Rehearse backup, restore, feature disablement, and rollback on the target environment.
- Archive a clean-clone evidence bundle bound to a commit or immutable source identifier.

Until these gates close, no production-ready, validated, complete-catalog, collision-probability, or operational-use claim is permitted.

## Data and Credential Handling

Catalog revisions, job inputs, result artifacts, and SQLite data stay under the private runtime directory and are excluded from the curated static artifact. Source input is preserved only subject to its provider terms; implementing an adapter does not grant storage or redistribution rights.

Authenticated catalog status responses remove private snapshot and metadata paths. The public capability document exposes supported values, default configuration, and structured configuration limits without exposing runtime locations.

Bearer credentials belong in process environment variables or a deployment secret system. They must not appear in URLs, logs, exports, catalog provenance, browser persistent storage, or source control. The local UI stores its entered token only in page memory and uses authenticated fetch for both JSON and SSE responses.
