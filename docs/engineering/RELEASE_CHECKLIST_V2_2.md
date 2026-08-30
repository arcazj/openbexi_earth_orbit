# v2.2 Development Release Checklist

## Claim Boundary

Version `2.2.1` is authorized only as a `development` patch with `Experimental` scientific maturity and a `non-operational` safety class. It is not a release candidate or stable release. This checklist does not close the v2.0 or v2.1 gates, admit a provider for validated redistribution, or authorize Pc/CDM/covariance, alerts, reports, or maneuver work.

## Development Scope

- [x] `release/version.json`, package metadata, feature-flag metadata, and generated browser metadata identify Version 2.2.1 development with null candidate and release dates.
- [x] CelesTrak GP OMM JSON is the preferred feed and produces `json/gp/GP.json` plus truthful retrieval metadata.
- [x] Full NORAD identifiers, including `69999`, `100000`, `100001`, and a nine-digit fixture, round-trip unchanged as strings.
- [x] OMM records preserve canonical source fields; no synthetic TLE, identifier truncation, or hidden Alpha-5 conversion exists.
- [x] Mixed TLE/OMM loading uses `twoline2satrec` and `json2satrec` respectively, quarantines invalid records independently, and deterministically prefers the newest valid epoch.
- [x] `/api/gp` and `export-gp` are primary, and `/api/satellites` selects preferred GP with legacy fallback. `/api/tle`, `TLE.json`, and `export-tle` remain documented deprecated compatibility paths for this development release.
- [x] SATCAT-backed launch events include valid post-2026-07-11 records independently of orbit availability; details-only selection cannot call propagation.
- [x] Confirmed decay and launch timeline caches refresh when the composite `data_revision` changes, including launch-only or decay-only changes while the GP-only compatibility `catalog_revision` remains constant, without requiring a page reload and while preserving confirmed-over-predicted precedence.
- [x] `/api/data-update-status` reports the five-component server `data_revision`, GP-only compatibility `catalog_revision`, GP/TLE/SATCAT/launch/decay revisions, effective intervals, worker/retry/reconciliation state, retrieval/newest-event fields, counts, and restart-persistent errors for all five datasets without presenting partial failure as complete. Its public projection recursively bounds and credential-redacts nested results; `fallback-tle` remains an artifact-availability signal rather than validation.
- [x] One normalized category contract drives `ALL`/`GEO`/`MEO`/`LEO`/`HRO` (`HEO` domain)/`Debris`/`Others`, group/tag intersection, visible search/counts, shared state, and safe selected-object clearing; fresh page load defaults to `MEO`, the hidden selector is virtualized, and a category-colliding raw tag key keeps its filter/share value while receiving a qualified UI label.
- [x] Selected GP/TLE details have one de-duplicated surface, the combined Mercator overlay remains above timeline/detail visualization layers, and fixed `Time x`/server controls remain usable above Mercator-only fullscreen.
- [x] One signed simulation clock, exact selected SGP4 state, bounded catalog interpolation, current-epoch render readiness, finite ephemeris bounds, and display-only/scientific-state separation implement the accepted ADR 0005 contract.

## Automated Verification

- [x] `npm run check` passes, including version, syntax, Python compilation, artifact, validation, vendor, and budget checks.
- [x] `npm test` passes all required unit, Python, browser, accessibility, and static-deployment journeys with no newly skipped required test.
- [x] `npm run build`, `npm run benchmark:full-catalog`, and `git diff --check` pass.
- [x] Tests use fixed fixtures or mocked fetches and do not require live CelesTrak access in CI.
- [x] OMM defaults, malformed JSON/identity/epoch/numeric/frame/theory quarantine, duplicate epoch choice, 404 handling, conditional requests, dry run, atomic write, collision-safe backup rotation retaining the newest seven per artifact, partial failure, metadata, and last-known-good preservation are covered.
- [x] The durable registry freezes content-addressed catalog, first-supplied source-metadata, and descriptor files; appends distinct acquisition records without rewriting a revision; semantically validates preferred GP before SQLite registration; and limits TLE bootstrap fallback to a readable bounded nonempty array with an observation-shaped record before strict runner validation.
- [x] Explicit opt-in daily maintenance evaluates GP, compatibility TLE, SATCAT, launch, decay, and reconciliation due work independently; coalesces SATCAT-derived work into one fetch; binds before background catch-up; applies bounded retry and stale-lock recovery; and stops the worker gracefully. An accepted `304` revalidation resets daily due age without data/revision/backup churn.
- [x] Normal GP/TLE maintenance is a newest-epoch `PARTIAL` upsert. Reconciliation/full replacement prunes only after a validated complete response. For an established GP, TLE, or SATCAT catalog with at least 1,000 records, candidate size and canonical NORAD overlap must each retain at least 75%; `--force` cannot bypass the guard. Only direct `export-gp`, `export-tle`, and `refresh-satcat` expose `--allow-large-catalog-shrink`, never `maybe-update` or the server. Unsafe conditional/shrink results preserve last-known-good artifacts and launch/decay history.
- [x] Python-backed npm commands share Python 3 discovery, honor `OPENBEXI_PYTHON_COMMAND`, and the browser-test runner owns only the loopback server process it starts.
- [x] An OMM-only satellite propagates, renders, selects, draws an orbit, and participates in every supported consumer; any intentionally unsupported consumer exposes a documented tested limitation.
- [x] Launch fixture `100401` at `2026-08-20` appears without an active orbit and opens metadata without propagation errors.
- [x] Timeline refresh replaces stale launch and confirmed-decay data without reload, avoids duplicates, preserves filters/mutual exclusion, and anchors to the newest valid event in connected and same-origin static metadata modes.
- [x] GP, GP-metadata, launch, decay, compatibility, cache-header, composite-revision, per-dataset-revision, and data-health API contracts are covered.
- [x] The curated static artifact includes GP, launch, decay, OMM runtime dependencies, and metadata; without an explicit API base it polls only same-origin sidecars for deployment changes and makes no API/provider or prohibited remote fallback request.
- [x] Desktop and mobile Playwright runs show readable non-overlapping timelines, visible latest fixtures, a nonblank WebGL scene, and no unexpected console errors.
- [x] MEO-first publication keeps every state proxy out of the batched Globe point layer until a finite sample covers the current simulation UTC; paused-time filter re-admission cannot expose an old position, and diagnostics show no visible unready or origin marker.
- [x] The Globe uses stable per-record state/selection proxies plus one `THREE.Points` layer with detailed through-1,000 and compact colored density modes; checksum-bound source evidence records ownership-aware point geometry/material and loader-owned texture cleanup without disposing injected/shared resources.
- [x] Mercator reuses shared positions, switches above 1,000 drawable records to one compact density path plus the detailed selected marker, respects adaptive redraw/track bounds, and clears/suppresses a failed same-satellite track rebuild.
- [x] Selected propagation failure has a bounded retry that is not postponed by intervening frames and recovers at the same simulation UTC when finite; non-selected failures hide/retry/recover under current filters.
- [x] The selected one-revolution orbit retains its root/material and refreshes geometry in place at bounded cadence; the obsolete `getOrbitECIPoints()` helper and duplicate time/menu/debris paths are absent.
- [x] The packaged-GP Chromium smoke gate reaches finite default MEO markers in less than `12 s`, full catalog readiness in less than `20 s`, validates exact point-buffer membership above 16,000 records, renders a nonblank Mercator density canvas, and records frame-gap diagnostics; strict host-timing bounds require `OPENBEXI_ENFORCE_TIMING_BUDGETS=1`.
- [x] The obsolete byte-identical `obj/loral.glb` copy is absent; canonical `obj/SSL_1300.glb` remains `8,517,244` bytes with SHA-256 `651b30cebf57bd08fedcfb34c31127f7a466b7897ccac2aafa8ea9908cccfcf0` and is the only retained SSL 1300 payload.

Frozen-tree local development evidence on 2026-08-23 passed 56 of 56 JavaScript unit cases and 69 of 69 Python cases. The full 27-declaration Playwright matrix completed in 7.3 minutes with 18 passes, 9 intentional project/profile skips, no failures, and no newly skipped required case. `npm run check` passed syntax, Python compilation, version, vendored dependency, static artifact, validation, and asset-budget gates; the final post-collision-fix build contained 122 files totaling 205,908,666 bytes. `npm run benchmark:full-catalog` passed its harness over 16,400 OMM records in 3.60805 seconds at 4,545.391 objects/second with a 121,446,400-byte peak RSS increase, while truthfully retaining scientific status `PARTIAL` for 188 propagation failures and 1,618,650 unscreened pair intervals. `npm run benchmark:v21-service` reached service state `SUCCEEDED` over the same 16,400 OMM records, with 3,042.99 ms for bootstrap plus Worker execution, 5,470.789 ms queue-to-terminal time, 266 events, and scientific status `PARTIAL`. The checksum-bound paths and 34 named evidence records are in `validation/v2.2.0/manifest.json`. Passing local development verification does not close the candidate, independent scientific review, provider-completeness, or operational gates below.

Version 2.2.1 final local verification on 2026-08-29 passed 56 of 56 JavaScript cases and 89 of 89 Python cases. The full 27-declaration Playwright matrix completed in 5.6 minutes with 18 passes, 9 intentional project/profile skips, no failures, and no newly skipped required case. The frozen static build contains 122 files totaling 205,788,178 bytes. This verification exercised independent scheduler clocks, one-fetch SATCAT derivation, strict complete-only reconciliation, production-scale shrink/identity rejection, direct-only recovery override confinement, collision-safe seven-backup rotation, accepted-304 due-age reset, restart-persistent/redacted dataset errors, stale-lock recovery, retry/reset, nonblocking startup, graceful stop, byte-exact CRLF SATCAT revision/no-churn behavior, and the browser/static journeys. The final `validation/v2.2.1/manifest.json` inventory contains 124 hashed artifacts and 46 named evidence records, and its strict checksum verification passes against the frozen publication tree. Independent review remains separately pending.

## Controlled Data Verification

- [x] `export-gp --dry-run` completes without writes and reports the expected plan.
- [x] A guarded live reconciliation on 2026-08-29/30 UTC updated GP, compatibility TLE, SATCAT, launch, and confirmed-decay artifacts without bypassing request limits. A later TLE retry returned HTTP 503 and preserved the successful 2026-08-30 TLE bytes/revision while recording failure metadata for retry.
- [x] Generated output contains an ID above `99999`, a launch after `2026-07-11`, unique normalized identities, valid metadata, and recorded quarantine counts.
- [x] Repository-owner confirmation dated 2026-08-29 records data-owner redistribution approval for the exact Version 2.2.1 bundled-source snapshot and repository-root GitHub Pages publication. The approval is byte/scope specific and does not automatically cover future refreshes or new sources.

## Operations and Rollback

- [ ] `docs/engineering/ROLLBACK_V2_2.md` is rehearsed against archived 2.2 and 2.1 artifacts, including checksum verification and cache invalidation.
- [ ] Scheduler success, unchanged, partial, malformed, timeout, HTTP 404, and recovery states are observed and do not overwrite last-known-good data.
- [ ] Data-health degraded/stale states are visible through the operational status UI and API.
- [x] Static and local-server deployment documentation, Swagger/OpenAPI, data-source governance, release notes, and operator commands match the shipped contracts.

## Candidate Decision

Current decision: **Version 2.2.1 development publication and redistribution of its exact bundled-source snapshot are authorized; candidate, stable release, validated, and operational decisions remain open**. Every unchecked item above remains a blocker unless a named owner records a reviewed waiver with scope, evidence, expiration, and rollback impact.
