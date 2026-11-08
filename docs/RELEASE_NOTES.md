# Release notes

## v2.5.1 — development prerelease

Solar System playback units now sit beside Play/Pause and Live in both integrated and standalone views. Choose sec/s (default), min/s, hour/s or day/s; year/s remains under Advanced. Readouts show explicit rates such as `-2 hour/s`. Changing units preserves the UTC instant, signed multiplier and paused/running state. Live resets to current UTC at `1 sec/s`; historical playback never claims Live.

Native keyboard selection, readable rate announcements and narrow-screen controls accompany the change. Precise mode, JPL boundaries, orbit guides and legacy satellite playback remain intact. Version metadata, API examples and the runtime dependency inventory are updated. Prior v2.5 and v2.5.0 tags/downloads remain unchanged.

This remains an experimental, non-operational development prerelease under the existing commercial notice and retained MIT/upstream rights. Qualification limits below still apply. Exact-commit verification is attached to the GitHub release.

## v2.5.0 — development prerelease

Application version **2.5.0**, experimental, non-operational. Source is public; new owner-controlled material is commercially licensed by Jean-Christophe Arcaz ([contact](mailto:arcazj@gmail.com)). Earlier MIT and upstream rights remain.

The corrected v2.5.0 snapshot includes the Live/time changes below; the earlier published v2.5 tag remains unchanged. Exact-commit verification belongs to each release's attached report.

The [license](../LICENSE.md) expressly disclaims accuracy, completeness and timeliness warranties and limits liability for reliance on results to the extent permitted by law, preserving mandatory statutory rights. Results require independent verification.

- Added six-source data health, last successful checks, content times, lineage and provider delay diagnostics in the bottom disclosure. Scheduled updates retain the last good revision on failure.
- Deferred the 17.5 MB Solar System playback table until needed; retained precise default mode, educational toggle and complete guides with bounded playback.
- Corrected playback in 2.5.0: Live starts at current UTC, 1× means one second per second, and background delays no longer discard elapsed time. Satellite minutes/second and Solar System seconds/minutes/hours/days/years per second remain explicit choices. Manual dates pause; returning from Solar System restores the previous Live or historical clock.
- Planet symbols use individual nominal sidereal spin periods, including retrograde Venus/Uranus. Spin-axis orientation, texture phase and lunar libration remain illustrative; the JPL orbital validation does not qualify body attitude.
- Added 544 JPL interpolation and 48 synthetic SGP4 holdouts without relaxing tolerances.
- Fixed bounded server admission under browser connection bursts and idle preconnections; preserved legacy UI, filters, clocks and revision continuity.
- Consolidated docs under `docs/` and updated Help, packaging and notice paths. Private review materials are absent from public 2.5 commits and release assets.
- Corrected exact-commit verification for Windows short temporary paths and directory aliases while retaining root and byte-integrity checks.

Recorded delivery evidence: 67 JavaScript files passed; 197 Python tests passed with one Windows privilege skip; four browser profiles reported 60 passed and 20 profile skips, no failures/flakes/retries. These are implementation-baseline results; the publication checks record the final source separately.

Known limits: software-rendered core readiness 7.99–14.21 s versus a 4 s target; globe p95 50.1–66.7 ms versus 33 ms. Representative GPU, real Safari/iOS, full accessibility and independent scientific/security review remain pending. Legacy asset provenance is incomplete. This release performs no Pages/container/package deployment and supplies no operational collision-risk guarantee.

See [testing](TESTING.md), [roadmap](../ROADMAP.md), [licensing scope](governance/LICENSING_TRANSITION_V2_5.md) and [release checklist](engineering/RELEASE_CHECKLIST.md).

## v2.4

Added astronomical playback with an educational mode, flexible validated time ranges and JPL complete orbit guides. [Release](https://github.com/arcazj/openbexi_earth_orbit/releases/tag/v2.4), commit `f7724f5`. Guide coverage does not permit playback extrapolation.

Earlier notes and exact-version verification remain in [GitHub releases](https://github.com/arcazj/openbexi_earth_orbit/releases) and immutable validation/evidence records.
