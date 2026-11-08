# Performance budgets

Targets: core/default-MEO readiness within **4 s**, globe frame **p95 <= 33 ms** on a named representative profile. These targets are not met by the recorded 2.5 software-rendered baseline.

| Fixture / cache | Core readiness | Globe frame p95 |
| --- | ---: | ---: |
| Current / cold | 7.9888 s | 50.1 ms |
| Current / warm | 8.0494 s | 50.1 ms |
| Doubled / cold | 14.2139 s | 66.7 ms |
| Doubled / warm | 12.232 s | 66.7 ms |

Profile: Intel Core i7-9700, 32 GB, Windows 10.0.26200, Chromium 149.0.7827.55 with SwiftShader, unthrottled loopback. Current/doubled default MEO populations are 189/378. Cold disables HTTP cache; OS cache is uncontrolled. Doubled route fulfillment disables HTTP caching for both samples. See the [raw report](../../release/evidence/v2.5.0-browser-performance.json) for exact per-run measurements.

Use native performance, timer and animation clocks plus an independent Node elapsed timer. The fixture changes Date only. Earlier measurements made under Playwright Clock are superseded and must not be used for qualification.

Four 60-second globe/Mercator runs sample V8 heap; after-GC readings are approximately 117 MB current and 214 MB doubled. They do not measure complete process/GPU memory, all workflows or long-duration retention. Repeated p75 startup and representative physical GPU qualification remain pending.

Commands: `npm run benchmark:v25-browser`, `npm run benchmark:full-catalog`, `npm run benchmark:v21-service`. The browser driver prepares isolated current/doubled fixtures; it must not update providers or change the user's runtime pointer. Historical full-catalog/service benchmark evidence stays in `validation/` and is not a current browser result.

`release/asset-budgets.json` enforces source/data byte ceilings. Changes need explanation and measurements, not silently relaxed budgets. Preserve lazy playback loading, bounded result DOM, worker limits and first-view MEO readiness while improving performance.
