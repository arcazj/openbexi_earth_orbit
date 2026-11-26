# Testing and evidence

Run from the repository root with locked dependencies installed. Tests use local fixtures; do not point test or recovery tools at the user's active runtime data.

```powershell
npm run check
npm run test:unit
npm run test:python
npm run test:browser
npm run test:release
npm run audit:dependencies
npm run rehearse:rollback
```

Browser coverage uses Chromium, mobile emulation, Firefox and Playwright WebKit. Install engines with `npx playwright install chromium firefox webkit`. CI installs platform dependencies. Linux Firefox runs under Xvfb with software WebGL explicitly enabled in its isolated test profile; a rendered-pixel preflight fails immediately if WebGL 2 is unavailable. This is functional coverage, not physical-GPU qualification. Profile skips are explicit; mobile emulation and Playwright WebKit do not qualify physical iOS/Safari.

## 2.6.1 verification

Selection tests compare the returned OMM epoch and derived TLE with the persisted SQLite row, including a catalog update inside the provider cooldown. Ledger tests exercise a failed disk flush and corrupted current or legacy request history. Browser checks cover the updated model views and the packaged flight inventories. [Release verification and downloads](https://github.com/arcazj/openbexi_earth_orbit/releases/tag/2.6.1)

## 2.6.0 verification

Catalog visibility tests use the epoch in their synthetic OMM data. The HEO regression also checks two invalid propagation times and the return to a valid position. Live tracking uses an advancing clock across measured passes.

The official release verification record identifies the tested Git commit, CI run, archive checksums and rollback result. The November 24 comparison fixtures preserve the public orbital elements for two communications spacecraft and one servicing vehicle. [Exact-commit results and downloads](https://github.com/arcazj/openbexi_earth_orbit/releases/tag/2.6.0) · [Archived CelesTrak elements](../release/evidence/v2.6.0-celestrak-2026-11-24.tle)

### Local baseline before dependency integration

| Check | November 22 development build |
| --- | --- |
| JavaScript and Python | All 71 JavaScript test files passed. Python had 202 passes and one directory-symlink test skipped for a missing Windows privilege. |
| Browsers | 113 cases across Chromium desktop and mobile, Firefox and WebKit. All 89 applicable cases passed across the matrix and single-worker confirmation. The other 24 were profile-specific skips. |
| Catalog and scene | The globe matched the reference image at three angles after a catalog filter removed the low-orbit spacecraft shown in close-up. Tests also cover panel alignment, high-latitude tracking, GEO pointing and orbit centering. |
| Model library | All 27,400 payloads resolved to a model. The 1,308 physical files have distinct hashes and every file has a catalog assignment. Viewer checks loaded prototype and production designs, a communications spacecraft cataloged in MEO, a two-reflector model and a GEO model with a measured 46 m span. Five other spacecraft on the same platform share a family model. |
| Satellite Model Viewer | Opening the packaged app with the 46 m GEO model selected left the preview collapsed above Catalog data. Expanding it loaded one preview. The full viewer's diagnostic panel measured 316 px on desktop and 296 px at a 320 px viewport, with no horizontal overflow. |
| Local API | Current OMM retrieval, historical records, shared models, pagination across revisions, read-only methods and the offline reference were checked. |
| Numerical checks | 544 frozen JPL Horizons and 48 SGP4 comparisons passed. |
| Package and recovery | Verified 1,479 packaged files against the manifest and rehearsed rollback. Release engineering passed. The npm audit found zero vulnerabilities. |

The initial browser run passed 86 cases. Two panel-order checks had loaded the previous order before the layout moved. The offline catalog screening case exceeded its time limit with two workers. All three passed in the final single-worker run with retries disabled. That run also covered keyboard rotation, closing the preview and switching between shared models. [2.6.0 local regression results](../release/evidence/v2.6.0-development-checks.json)

## 2.5 evidence

The [delivery checks](../release/evidence/v2.5.0-delivery-1-checks.json) preserve the pre-publication implementation record and earlier failures. The [2.5.1 publication record](../release/publication-v2.5.1.json) describes that release’s scope. Its GitHub release links to the CI and artifact checks for the published commit.

| Check | Recorded delivery result |
| --- | --- |
| JS / Python | 67 files passed; 197 Python passed, one Windows symlink-privilege skip |
| Browsers | 60 passed, 20 profile skips, zero failed/flaky/retried; four profiles |
| Science | 544 JPL + 48 SGP4 comparisons within unchanged sampled limits |
| Recovery | Synthetic 23-artifact backup/restore/restart and static fallback rehearsal passed |
| Dependency audit | Zero npm findings at the recorded run; rerun for publication |
| Performance | All four software-rendered startup/frame samples missed targets |

[Scientific results](../release/evidence/v2.5.0-scientific-results.json), [performance](../release/evidence/v2.5.0-browser-performance.json), [recovery](../release/evidence/v2.5.0-isolated-recovery.json), [frozen corpus](validation/V2_5_ACCEPTANCE.md). Independent scientific/security review, representative hardware, interactive Windows keyboard review and application-wide accessibility remain pending.

## Core regression journeys

Validate first MEO render; Globe/Mercator switching; canonical search/selection; tracked matches/positioned/unavailable counts; filters and virtualized results; direct map picking; shared URLs; orbit display; launch and confirmed-decay timelines; models; stars and Mars; Solar System precise/educational modes and bounded playback. Startup opens Tracked Objects - Matches and only one menu section expands at a time. Check clock, selection, camera and filters survive coherent data revision changes.

For playback, check true 1 sec/s against elapsed frame time, UTC resynchronization, pause/resume, explicit accelerated units, reverse playback, restored Live/historical state and JPL boundary stops. `liveTime.spec.js` covers integrated and standalone controls in all four profiles, including the educational default, illustrative radii, all physical body radii, close focus and mode restoration, all five units, no-seek unit changes, signed rate and pause preservation, native keyboard selection, readable announcements, scoped automated accessibility and a 320 px viewport. Physical touch and assistive-technology qualification remain pending. Nominal spin tests cover periods and direction.

README and Releases History open rendered Markdown in `markdown_viewer.html`. Verify `swagger.html`, the rendered API reference, required notices, keyboard focus and narrow layout from the built artifact as well as the source server. Only explicitly allowlisted Markdown is publicly served; roadmap, prompt history, credentials and private storage stay unavailable through the application server.

## Data Maintenance Tools

Cover incremental upserts versus `--all` reconciliation, provider cooldown/pause, conditional responses, independent source clocks, stale lineage, confirmed-decay history retention, partial/shrinking catalog rejection, candidate locking, atomic promotion and last-good retention. Health failures must not advance successful check times. Static snapshots never claim live refresh.

## Coverage Traceability Audit

Legacy behavior is exercised by executable tests, not release-name strings in documentation. Earlier per-release prose logs are available in Git history. Frozen corpus manifests retain their historical artifact names and hashes even when current documentation moves.

## Performance and release checks

`npm run benchmark:v25-browser` measures current/doubled fixtures. Use native performance clocks and an independent wall timer; Playwright Clock invalidates timing measurements. The Date-only fixture is deliberate. See [performance budgets](engineering/PERFORMANCE_BUDGETS.md).

Before publication, run `npm run check:release-tree -- --tree HEAD --require-clean`, build from that exact commit, verify the asset manifest and rollback, audit incoming history for private files/secrets, and wait for Windows/Linux and browser CI on that commit. See [release checklist](engineering/RELEASE_CHECKLIST.md).
