# Release notes

## v2.6.0 — official release, November 24, 2026

- Compare two spacecraft at a shared UTC. The viewer shows their independently propagated TLE positions, straight-line distance, relative motion, Earth occultation and optional orbital paths. Camera views and the underlying elements can be shared in a snapshot link.
- Inspect Astra 3B, Horizons 3e, Intelsat 10-02, the Mission Extension Vehicle and the Mission Extension Pod. Horizons 3e includes aft and Earth-facing close-ups. The Horizons 3e, Intelsat 10-02 and MEP downloads include a Wavefront OBJ, materials and texture maps. [Model references](THIRD_PARTY_NOTICES.md)
- The life-extension catalog records the reported Optus D3 and MEV-1 undocking. Documented assemblies can be inspected together. Divergent independent TLE positions are displayed separately. The optional Earth view uses a metre-scale WGS84 globe. The optional beam controls link to Satbeams for the two documented beams.

The Horizons 3e previews show the aft hardware, opposite face, deployed wings and Earth from its propagated location at 20:44 UTC on November 24. [Aft view](https://github.com/arcazj/openbexi_earth_orbit/blob/2.6.0/release/evidence/screenshots/v2.6.0-horizons-3e-aft.png) · [Earth-facing side](https://github.com/arcazj/openbexi_earth_orbit/blob/2.6.0/release/evidence/screenshots/v2.6.0-horizons-3e-earth-facing.png) · [Deployed spacecraft](https://github.com/arcazj/openbexi_earth_orbit/blob/2.6.0/release/evidence/screenshots/v2.6.0-horizons-3e-deployed.png) · [Earth view](https://github.com/arcazj/openbexi_earth_orbit/blob/2.6.0/release/evidence/screenshots/v2.6.0-horizons-3e-earth-at-2044-utc.png)

The official GitHub release uses tag `2.6.0`. The preceding prerelease is archived under `v2.6.0`. The software retains its experimental, non-operational scientific classification. [Official archives, verification and checksums](https://github.com/arcazj/openbexi_earth_orbit/releases/tag/2.6.0) · [Prerelease](https://github.com/arcazj/openbexi_earth_orbit/releases/tag/v2.6.0)

## v2.6.0 — development prerelease

- The local server adds read-only catalog search, NORAD lookup and shared spacecraft model resources under `/api/v1`. Open **REST API** below **Timelines** for the endpoint reference and downloadable OpenAPI contract. The section starts collapsed. [Catalog and model API](SWAGGER.md#catalog-and-models)

- Open **Browse catalog results** and enter a name, NORAD ID, international designator or owner in **Filter results**. Terms can be combined in any order. In the bundled MEO payload catalog, `GLONASS-K2` finds two spacecraft and `GLONASS-K2 63130` narrows the list to COSMOS 2584. **Clear** restores the current availability tab and sort order, including on a 320 px screen.
- The right-hand catalog panel lines up with the UTC clock. Above **Catalog data**, expand **Satellite Model Viewer** to inspect the selected spacecraft in place or open it in a new tab. The preview follows selection while open. The full viewer places design references, dimensions and mesh statistics in a compact diagnostics panel. OMM details start collapsed, and the tracked counts and legend are in the summary at the bottom.
- Live spacecraft tracking uses the orbital frame to stabilize the camera through high-latitude passes, including OneWeb and GLONASS-K2. The selected orbit stays centered during close inspection. **View full orbit** shows it face-on and **View spacecraft** returns to the close-up.
- Returning from a spacecraft close-up by changing catalog filters restores the globe's depth range. This fixes the moving dark polygons that could appear over land and ocean.
- Selecting SES-17 (NORAD 49332) loads its deployed 46 m solar wings, gold-blanketed body and two side-mounted reflector banks. Five other Spacebus NEO spacecraft continue to share the family model. [SES-17 in the viewer](../display_satellite.html?catalog=geo&norad=49332)
- The two original Kuiper prototypes and the production Amazon Leo spacecraft have separate shared models. Eighteen AMC spacecraft now resolve to eleven illustrated exteriors, including AMC-14 in the MEO catalog and the former AMC-12 and AMC-23 under their later names. The viewer and API expose the design sources and estimated details. [Model references](THIRD_PARTY_NOTICES.md)
- The Satellite Model Viewer groups current and historical LEO, MEO and GEO spacecraft by shared hardware. Starlink V1, V2 and V3 each have one primary model. The V1 geometry, material and four textures match the originals byte for byte. Revised GEO exteriors include Intelsat 23, 25 and 28 and Galaxy 17, 33 and 34. Diagnostics identify reference imagery, estimated dimensions and catalog outlines. [Satellite Model Viewer](../display_satellite.html) · [Spacecraft model references](THIRD_PARTY_NOTICES.md)

The page and conjunction Worker share the packaged satellite.js 7.1.0 engine. Three.js 0.187.0 supplies the globe and model viewer. The catalog result rows expose all visible columns to assistive technology.

Regression coverage includes filter changes during close-up tracking, pixel comparisons of the globe at three viewing angles, shared model assignments, and the catalog API against the bundled data. The GitHub release includes the tested commit, CI run, runnable archives and their SHA-256 checksums. [Downloads](https://github.com/arcazj/openbexi_earth_orbit/releases/tag/v2.6.0)

## v2.5.1 — development prerelease

Solar System playback units now sit beside Play/Pause and Live in both integrated and standalone views. Choose sec/s (default), min/s, hour/s or day/s; year/s remains under Advanced. Readouts show explicit rates such as `-2 hour/s`. Changing units preserves the UTC instant, signed multiplier and paused/running state. Live resets to current UTC at `1 sec/s`; historical playback never claims Live.

Educational mode is now the default with its existing illustrative Sun/planet sizes. Turning it off uses physical mean radii at the orbital distance scale, disables enlargement and decorative Sun glow, and adjusts focus/zoom for close inspection. Native keyboard selection, readable rate announcements and narrow-screen controls accompany the change. Precise mode, JPL boundaries, orbit guides and legacy satellite playback remain intact. Version metadata, API examples and the runtime dependency inventory are updated. Prior v2.5 and v2.5.0 tags/downloads remain unchanged.

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
