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

## 2.5 evidence

The [delivery checks](../release/evidence/v2.5.0-delivery-1-checks.json) preserve the pre-publication implementation record and earlier failures. Their old branch names, pending approvals and private local paths are historical evidence, not current publication instructions. The [publication record](../release/publication-v2.5.json) defines the new authorized scope; final exact-commit CI and source/artifact checks are linked in the GitHub release.

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

For 2.5.0 Live playback, check true 1× against elapsed frame time, UTC resynchronization, pause/resume, explicit accelerated units, reverse playback, restored Live/historical state and JPL boundary stops. `liveTime.spec.js` covers integrated and standalone controls in all four profiles. Nominal spin tests cover periods/direction only; absolute body attitude is not qualified.

README and Releases History open rendered Markdown in `markdown_viewer.html`. Verify `swagger.html`, the rendered API reference, required notices, keyboard focus and narrow layout from the built artifact as well as the source server. Only explicitly allowlisted Markdown is publicly served; roadmap, prompt history, credentials and private storage stay unavailable through the application server.

## Data Maintenance Tools

Cover incremental upserts versus `--all` reconciliation, provider cooldown/pause, conditional responses, independent source clocks, stale lineage, confirmed-decay history retention, partial/shrinking catalog rejection, candidate locking, atomic promotion and last-good retention. Health failures must not advance successful check times. Static snapshots never claim live refresh.

## Coverage Traceability Audit

Legacy behavior is exercised by executable tests, not release-name strings in documentation. Earlier per-release prose logs are available in Git history. Frozen corpus manifests retain their historical artifact names and hashes even when current documentation moves.

## Performance and release checks

`npm run benchmark:v25-browser` measures current/doubled fixtures. Use native performance clocks and an independent wall timer; Playwright Clock invalidates timing measurements. The Date-only fixture is deliberate. See [performance budgets](engineering/PERFORMANCE_BUDGETS.md).

Before publication, run `npm run check:release-tree -- --tree HEAD --require-clean`, build from that exact commit, verify the asset manifest and rollback, audit incoming history for private files/secrets, and wait for Windows/Linux and browser CI on that commit. See [release checklist](engineering/RELEASE_CHECKLIST.md).
