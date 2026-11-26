# Performance budgets

The 2.6 REST API accordion brings the uncompressed browser JavaScript group to 978,141 bytes on the Windows checkout. Its ceiling is 979,000 bytes. Opening the globe does not request the API reference or model metadata.

The single-spacecraft orbit toolbar, camera tracking and position marker bring the globe entry page to approximately 333,000 bytes and the uncompressed browser JavaScript group to 1,100,000 bytes on Windows. Their respective ceilings are 334,000 and 1,101,000 bytes. The marker reuses the packaged satellite icon.

Manual comparison cameras and catalog drawer tags bring browser JavaScript to approximately 1,105,000 bytes, with a ceiling of 1,105,500 bytes. The comparison reuses the packaged OrbitControls. The drawer prepares tag choices when it opens.

Shared catalog browsing, station selection, model downloads and single-object orbital updates brought browser JavaScript to approximately 1,126,300 bytes. With Galileo flight aliases, Argos host membership and Amazon Leo family matching, the uncompressed group measures approximately 1,128,000 bytes on Windows. Its ceiling is 1,128,500 bytes. The globe entry page has a 335,800-byte ceiling. Both pages use the same tag labels and windowed results drawer.

The targets are **4 s** for default-MEO readiness and **33 ms** for the p95 globe frame on a named representative profile. The measurements below are the 2.5 software-rendered baseline. The 2.6.0 local run checked asset-size ceilings and functional behavior. A new timing run on representative hardware is pending. [2.6.0 checks](../../release/evidence/v2.6.0-development-checks.json)

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
