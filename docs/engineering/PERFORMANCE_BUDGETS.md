# Performance Budgets

Last reviewed: 2026-08-23

`release/asset-budgets.json` contains CI-enforced regression ceilings based on the current repository. They are ceilings, not optimization targets.

## Runtime Profile

Before v2.0 preview, record the browser, CPU, GPU, memory, viewport, device-pixel ratio, network profile, catalog version/count, and cold/warm cache state. Store raw traces with the release evidence.

Initial targets for the named reference profile:

- First visible globe: p75 at or below 2.5 seconds with a warm dependency cache
- Core controls interactive: p75 at or below 4 seconds with a cold data cache
- Default 3D frame time: p95 at or below 33 milliseconds after startup
- Main-thread long tasks: no task above 200 milliseconds after initial catalog ingestion
- Browser errors: zero uncaught exceptions and zero WebGL context loss in the smoke journey

Targets become release gates only after a repeatable baseline is checked into the evidence bundle. Until then, any regression over 10% needs a written waiver and follow-up owner.

## Scale Gates

- Test at the current catalog size and at 2x projected size.
- Report peak heap, GPU resource count, ingestion duration, update duration, and frame percentiles.
- All-pairs work must document pruning complexity and candidate-reduction metrics.
- Asset growth beyond a CI ceiling requires compression or a reviewed budget update with measured user impact.

## v2.0 Browser Source Baseline

The v2.0 preview adds versioned domain contracts, catalog validation, the pure SGP4 adapter, Worker screening, event UI, visualization modules, and the static trust-boundary policy. On 2026-07-20, `npm run check:budgets` measured `624,689` bytes across first-party browser JavaScript under `js/`. The reviewed preview regression ceiling is `625,000` bytes, leaving 311 bytes, or about 0.05 percent, of headroom. Exact vendored browser runtime files are measured separately against the `2,600,000` byte ceiling. These are unminified source/runtime file sizes, not transfer size, startup time, or runtime heap; the increased preview ceiling records implemented scope and is not an optimization claim or a waiver of the runtime budgets above.

The deployable dependency fallback contains `2,443,800` bytes of JavaScript: the exact satellite.js 6.0.2 browser files and the Three.js 0.184.0 core plus the directly/transitively imported addon closure. Its regression ceiling is `2,600,000` bytes. These files replace runtime access to generated `node_modules`; the size is not added to the application-source ceiling. `dist/asset-manifest.json` records the exact full artifact byte count after each build because catalog, ephemeris, texture, and model updates legitimately change deployment size.

## v2.0 Local Browser Diagnostic

The current single-run local diagnostic uses Playwright Chromium 149 at 1280 x 720, DPR 1, Windows, WebGL2 through SwiftShader, local locked dependencies, and the bundled 16,440-object catalog. The bootstrap selected same-origin vendored dependencies and made no routine CDN request. The selected-object screen uses the UI default one-hour window, 300-second coarse step, 100 km radius, one-second test refinement tolerance, and a 10-event output cap. This run is not a repeatable reference profile or percentile baseline.

| Measure | Preview ceiling | Observed local run on 2026-07-20 | 2026-07-19 observation |
| --- | ---: | ---: | ---: |
| TLE load | 30 s | 21.274 s | 19.239 s |
| First interactive | 30 s | 21.630 s | 19.608 s |
| Selected-object screen, including transport | 45 s | 27.736 s | 29.727 s |
| Screening engine report | Informational | 24.1 s | 25.7 s |
| Approximate used JS heap | 250 MB | 177 MB | 199 MB |
| Main-thread timer gap during Worker screen | 2.5 s | 1.848 s | 1.924 s |
| WebGL event readback | 25 ms | 3.7 ms | 3.6 ms |

The automated journey fails when the worst 100 ms monitor interval exceeds the declared 2.5-second preview ceiling. The observed run completed the full journey in 80.191 seconds, rendered 44 animation frames and 15 distinct progress values during the monitored screen, and reported 1,252 failed state propagations as a partial result rather than hiding them. The 1.848-second worst interval gap passes the provisional preview ceiling but remains noticeable and is not evidence of smooth interaction. A separate fresh 1440 x 900 loopback verification rendered the first visible globe in 0.189 seconds and reached catalog-dependent interactive state in 20.214 seconds with zero external requests; the 4-second interactive target is not met. The performance release gate remains open because this is one SwiftShader run, not repeated percentile evidence, and no 2x-catalog or hardware-GPU resource profile has been completed. Stable promotion requires a hardware-GPU profile, repeated percentile runs, a materially tighter input-latency budget, and investigation of Worker catalog-clone, garbage-collection, catalog-ingestion, and deferred-render contention. Current raw diagnostic evidence is recorded in `docs/engineering/evidence/v2.0-browser-profile-2026-07-20.json`; the 2026-07-19 file remains historical.

The Pixel 7 emulation profile at 412 x 839 and DPR 2.625 runs a deterministic two-object Worker screen, selects its event, moves synchronized playback, verifies 129 conjunction-marker pixels, and confirms that the 356 px panel has no outer horizontal overflow. Named CSS-width checks at 320, 390, and 768 px, plus a 384 px 200-percent-zoom reflow equivalent, found no overflowing controls or selected-detail overlap. These are functional workflow, rendering, accessibility, and layout checks, not a full-catalog mobile performance claim.

## v2.1 Development Guardrails

The v2.1 server path has hard request and artifact bounds, not a production service-level objective:

- catalog snapshots: at most 100 MiB;
- API JSON body: at most 64 KiB;
- horizon: 60 through 21,600 seconds with at most 721 synchronized coarse-grid points;
- timeout: 10 through 7,200 seconds;
- attempts: 1 through 3;
- spatial cells per object: at most 512;
- cell memberships per slab and spatial pair checks per slab: at most 10,000,000 each;
- candidate intervals: at most 500,000;
- persisted candidates: at most 100,000;
- detected events: at most 100,000 and returned results at most 10,000;
- imported result artifact: at most 256 MiB;
- execution concurrency: one local Node screening subprocess per service process.

Coverage-affecting spatial, candidate-interval, or detected-event work bounds must fail the job or produce explicit partial coverage; they must never be represented as a complete no-event result. `max_results` and `max_persisted_candidates` are retention/transport bounds applied after the relevant detection work: they publish explicit truncation counts and `RESULT_LIMIT_APPLIED` or `PERSISTED_CANDIDATE_LIMIT_APPLIED` rather than changing scientific status by themselves. Oversized result artifacts fail import. These maxima are denial-of-service and failure-containment controls, not recommended operating points. No OS/process memory cap is implemented; the measured RSS below is observation only, and memory isolation remains a promotion gate.

The curated v2.1 static artifact excludes server-only full-catalog engine, source-adapter, lifecycle, contract, and multi-format propagation modules. On 2026-07-21, `npm run check:budgets` measured 648,396 bytes of included first-party browser JavaScript against the 660,000-byte development ceiling, leaving 11,604 bytes of headroom. The added authenticated browser client remains included. This source-byte ceiling is not transfer-size, parse-time, or heap evidence.

## v2.2 GP/OMM Development Gate

The historical v2.0/v2.1 measurements below remain evidence for those exact TLE snapshots and implementations; they are not a Version 2.2 baseline. Before any v2.2 candidate decision, record GP/OMM file and metadata bytes, accepted/quarantined counts, TLE/OMM/six-digit counts, parse and `json2satrec` initialization duration, time to first interactive catalog, peak browser heap, batched-Globe/Mercator frame percentiles, timeline refresh duration, and static artifact growth at current and projected 2x catalog size. Compare cold start, warm cache, unchanged revision, and changed revision paths on the named desktop/mobile profiles.

`npm run check:budgets` remains an enforced regression ceiling, but passing it alone does not establish acceptable OMM ingestion or rendering performance. Any ceiling adjustment requires a measured before/after record and reviewed user-impact rationale. `npm run benchmark:full-catalog` prefers the packaged GP/OMM catalog and records its selected format, status, revision, and wrapper count; focused regression tests separately exercise deterministic normalized GP/OMM and deprecated TLE inputs. A benchmark `PASS` is development evidence, not a scientific or operational promotion.

The reviewed Version 2.2 development ceilings are `265,000` bytes for `index.html` and `800,000` bytes for included first-party browser JavaScript. Frozen-tree measurement on 2026-08-23 found `263,749` bytes for `index.html` and `799,798` bytes across the included JavaScript group, leaving `1,251` and `202` bytes of headroom respectively. The generated 16,400-record GP/OMM catalog measured `23,035,692` bytes and the 27,471-record payload launch catalog measured `10,137,055` bytes against ceilings of `24,000,000` and `10,500,000` bytes. The compatibility TLE catalog measured `9,381,327` of `10,500,000` bytes, and the local Solar System ephemeris measured `15,558,309` of `17,500,000` bytes. `npm run check:budgets` passed these frozen measurements. The final static build contained 122 files totaling `205,908,666` bytes. These are source/data and aggregate artifact byte observations, not startup, compressed transfer, heap, responsiveness, or provider-growth claims. In particular, the browser-JavaScript margin is intentionally reported as narrow rather than treated as optimization evidence. A future catalog or implementation that legitimately exceeds a ceiling requires a new measurement and reviewed budget change.

The packaged-GP Chromium smoke profile has two conservative startup gates: `default-meo-visible` plus a finite known MEO marker in less than `12 s`, and full `satellite-data-ready` in less than `20 s`. Its full-catalog rendering check requires more than 16,000 point-cloud records with exact diagnostic membership, compact Globe density mode at point size `0.025`, zero render-visible unready/origin markers, and a nonblank Mercator density canvas. The same isolated local Playwright Chromium/SwiftShader observation reported 16.24 FPS for `ALL` Globe, 14.43 FPS for `ALL` plus Mercator, 16.39 FPS for `MEO+LEO` Globe, and 14.25 FPS for `MEO+LEO` plus Mercator; the Mercator cases had approximately 100 ms p95/max frame gaps, no long stalls, and a visible map. The automated full-catalog journey retains looser regression bounds of `150 ms` p95 and `200 ms` maximum. This is one functional software-renderer observation, not named-hardware percentile evidence, a mobile profile, or a candidate performance baseline.

Version 2.2 avoids one rendered sprite/material per catalog record by retaining stable state/selection proxies and updating one `THREE.Points` buffer. Through 1,000 drawn Globe markers it retains the icon texture; above 1,000 it uses compact colored points. Mercator similarly switches above 1,000 drawable records to one compact non-selected density path plus the detailed selected marker, skipping per-object icons, sorting, and non-selected labels. These bounds reduce draw-call and canvas work but do not move catalog propagation off the main thread. The byte-identical `obj/loral.glb` copy was removed after matching canonical `obj/SSL_1300.glb` at `8,517,244` bytes and SHA-256 `651b30cebf57bd08fedcfb34c31127f7a466b7897ccac2aafa8ea9908cccfcf0`; this is duplicate-asset cleanup, not a model-quality change.

### Frozen Local Benchmark Observations

The final frozen-tree `npm run benchmark:full-catalog` observation used the preferred 16,400-record OMM catalog. It reported `PASS` in 3.60805 seconds (`4,545.391` objects/second) with a `121,446,400`-byte peak RSS increase. The scientific result remained truthfully `PARTIAL`: 188 propagation failures left 1,618,650 pair intervals unscreened. The corresponding `npm run benchmark:v21-service` observation reached service state `SUCCEEDED` with the same 16,400 OMM records, 3,042.99 ms for bootstrap plus Worker execution, 5,470.789 ms from queueing to terminal state, and 266 returned events. Its scientific result also remained `PARTIAL`. These are single local development observations and harness-success results, not completeness, portable throughput, or candidate performance claims.

## v2.1 Local Full-Catalog Observation

The committed observation in `validation/v2.1.0/benchmarks/local-full-catalog-60s-2026-07-20.json` used the bundled 16,443-record catalog, one 60-second slab, a 10 km threshold, Windows, Node 24.13.0, and an Intel Core i7-9700 with eight logical CPUs.

| Measure | Observed development value |
| --- | ---: |
| Wall time | 2.973 s |
| Peak observed RSS | 371,527,680 bytes |
| Peak RSS increase | 206,905,344 bytes |
| Result JSON | 3,128,543 bytes |
| Possible pair intervals | 135,177,903 |
| Valid endpoint pair intervals | 133,685,776 |
| Spatial pair checks | 309,398 |
| Spatial-check reduction | 99.7686% |
| Coarse/persisted candidates | 835 |
| Reported geometric events | 214 |
| Unscreened pair intervals | 1,492,127 |
| Source update / quality | incremental / `PARTIAL_SOURCE_DATASET` |
| Scientific result status | `PARTIAL` |

The `PARTIAL` result is material: 176 propagation failures and three motion-bound violations prevented a complete-coverage claim. The wall time, throughput, and memory values are one dirty-worktree observation, not percentiles or portable budgets.

## v2.1 End-to-End Service Observation

`validation/v2.1.0/benchmarks/local-v21-service-2026-07-20.json` exercises the real loopback HTTP handler, generated bearer roles, SQLite store, worker subprocess, event pagination, shutdown, and persistence measurement against the same 16,443-object snapshot and a 60-second window.

| Measure | Observed development value |
| --- | ---: |
| Service bootstrap and worker start | 1,661.613 ms |
| Worker execution | 4,392.365 ms |
| Submission to terminal observation | 4,530.350 ms |
| Job-status read p95 | 22.793 ms over 27 samples |
| Event-page read p95 | 47.521 ms over 2 samples |
| Candidates / events / errors | 846 / 241 / 100 |
| Unscreened pair intervals | 1,524,828 |
| Source status / quality | `PARTIAL` / `PARTIAL_SOURCE_DATASET` |
| Scientific status | `PARTIAL` |
| SQLite after shutdown | 25,501,696 bytes |
| Total runtime after shutdown | 38,059,874 bytes |
| Live SQLite WAL | 21,836,032 bytes |
| Live total runtime | 59,961,442 bytes |
| Progress / outbox / audit rows | 22 / 26 / 27 |

The single POST, readiness, capability, and catalog endpoint measurements are not percentiles. All endpoint timings are loopback-only and exclude TLS, proxy, network, concurrent users, and queue contention. Progress persistence is coalesced by first-stage, 1% advancement, and bounded-heartbeat rules and capped at 512 records per attempt; this run retained 22. Before promotion, representative profiles still need to validate that cap, and outbox consumer acknowledgement/pruning, retention automation, and storage budgets must be defined.

Run the repeatable driver with:

```powershell
npm run benchmark:full-catalog -- --output artifacts/full-catalog-benchmark.json
npm run benchmark:v21-service -- --output artifacts/v21-service-benchmark.json
```

The first command measures the engine directly and, for Version 2.2, prefers `json/gp/GP.json` plus matching metadata with a deprecated TLE fallback only when the GP pair is unavailable. The second uses a fresh private runtime to exercise the actual loopback HTTP handler, authentication, SQLite store, worker, event pagination, shutdown, and persistence accounting. Keep both reports when making a performance decision; neither substitutes for repeated representative profiles. A harness `PASS` means the run completed its internal checks, not that a candidate performance gate passed.

Before a candidate decision, define and pass named-hardware P50/P95 budgets for representative one-hour and six-hour windows, current and projected catalogs, queue latency, API latency, SQLite growth, result volume, cancellation latency, restart recovery, and backup/restore. Include a 2x-catalog or justified projected-scale profile. A regression threshold cannot be promoted from this single 60-second run.
