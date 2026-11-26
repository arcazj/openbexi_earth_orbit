# Release notes

## v2.6.1 — November 26, 2026

- Inspect revised spacecraft exteriors and download their textured Wavefront models. The flight inventories link NORAD IDs to the corresponding model and explain which dimensions or hardware positions are estimates. [SES](SES_MODEL_REVIEW.md) · [Galileo](GALILEO_MODEL_REVIEW.md) · [Argos and Kinéis](ARGOS_MODEL_REVIEW.md) · [Amazon Leo / Kuiper](KUIPER_MODEL_REVIEW.md)
- Filter catalog results by orbit, object type and tag in the globe or model viewer. Open a spacecraft’s facts and camera views from its result. The model library also includes revised BeiDou spacecraft, Tiangong modules, Telesat LEO-1 and Gravitas.
- Conjunction actions wrap on narrow screens, and the planet details panel leaves the Solar System exit control accessible. Holding Pause across animation frames also pauses playback in WebKit.
- With the Python server running, selecting a current satellite saves the newest validated orbital epoch to SQLite. A newer catalog epoch is saved even during the two-hour CelesTrak interval. The server requests an individual NORAD ID when due and derives TLE lines when the format supports them. [Catalog API](SWAGGER.md#catalog-and-models)
- Incremental updates flush provider request history to disk before replacing the ledger. An unreadable ledger now reports the affected file and parsing error. [Server setup](https://github.com/arcazj/openbexi_earth_orbit/blob/2.6.1/docs/engineering/SERVER_DEPLOYMENT.md)

The ZIP and TAR.GZ each contain the static app. The tagged source includes the Python server for live orbital updates. [Downloads and checksums](https://github.com/arcazj/openbexi_earth_orbit/releases/tag/2.6.1) · [Tagged source](https://github.com/arcazj/openbexi_earth_orbit/tree/2.6.1)

## v2.6.0 — official release, November 24, 2026

- Compare two spacecraft at a shared UTC. The viewer shows their independently propagated TLE positions, straight-line distance, relative motion, Earth occultation and optional orbital paths. Camera views and the underlying elements can be shared in a snapshot link.
- Inspect geostationary communications spacecraft, a servicing vehicle and a propulsion pod. One spacecraft has aft and Earth-facing close-ups. Wavefront downloads for two spacecraft and the pod include geometry, materials and texture maps. [Model references](THIRD_PARTY_NOTICES.md)
- The life-extension catalog records a reported undocking. The viewer shows documented docked assemblies together and displays independent orbits when the published TLE positions diverge. The optional Earth view uses a metre-scale WGS84 globe. The beam controls link to external coverage maps for two documented beams.

The previews show a spacecraft’s aft hardware, Earth-facing side and deployed wings. The Earth view uses its propagated position at 20:44 UTC on November 24. [Aft view](https://github.com/arcazj/openbexi_earth_orbit/blob/2.6.0/release/evidence/screenshots/v2.6.0-horizons-3e-aft.png) · [Earth-facing side](https://github.com/arcazj/openbexi_earth_orbit/blob/2.6.0/release/evidence/screenshots/v2.6.0-horizons-3e-earth-facing.png) · [Deployed spacecraft](https://github.com/arcazj/openbexi_earth_orbit/blob/2.6.0/release/evidence/screenshots/v2.6.0-horizons-3e-deployed.png) · [Earth view](https://github.com/arcazj/openbexi_earth_orbit/blob/2.6.0/release/evidence/screenshots/v2.6.0-horizons-3e-earth-at-2044-utc.png)

The official GitHub release uses tag `2.6.0`. The `v2.6.0` source tag identifies the earlier prerelease commit. The software retains its experimental, non-operational scientific classification. [Official archives, verification and checksums](https://github.com/arcazj/openbexi_earth_orbit/releases/tag/2.6.0) · [Prerelease source](https://github.com/arcazj/openbexi_earth_orbit/tree/v2.6.0)

## v2.6.0 — development prerelease

- The local server adds read-only catalog search, NORAD lookup and shared spacecraft model resources under `/api/v1`. Open **REST API** below **Timelines** for the endpoint reference and downloadable OpenAPI contract. The section starts collapsed. [Catalog and model API](SWAGGER.md#catalog-and-models)

- Open **Browse catalog results** and enter a name, NORAD ID, international designator or owner in **Filter results**. Combine terms in any order. Add a NORAD ID to a family name to narrow the results to one spacecraft. **Clear** restores the current availability tab and sort order, including on a 320 px screen.
- The right-hand catalog panel lines up with the UTC clock. Above **Catalog data**, expand **Satellite Model Viewer** to inspect the selected spacecraft in place or open it in a new tab. The preview follows selection while open. The full viewer places design references, dimensions and mesh statistics in a compact diagnostics panel. OMM details start collapsed, and the tracked counts and legend are in the summary at the bottom.
- Live spacecraft tracking uses the orbital frame to stabilize the camera through high-latitude passes. The selected orbit stays centered during close inspection. **View full orbit** shows it face-on and **View spacecraft** returns to the close-up.
- Returning from a spacecraft close-up by changing catalog filters restores the globe's depth range. This fixes the moving dark polygons that could appear over land and ocean.
- One GEO model has a 46 m deployed solar span, a gold-blanketed body and two side-mounted reflector banks. Five other spacecraft on the same platform share a family model. [Inspect the deployed wings](../display_satellite.html?catalog=geo&norad=49332)
- Two prototype communications spacecraft share one model and the production fleet uses another. A separate fleet of 18 spacecraft resolves to 11 illustrated exteriors, including a spacecraft cataloged in MEO and two listed under later names. The viewer and API identify the design sources and estimated details. [Model references](THIRD_PARTY_NOTICES.md)
- The Satellite Model Viewer groups current and historical LEO, MEO and GEO spacecraft by shared hardware. One constellation has a primary model for each of three generations. Its first-generation geometry, material and four textures match the originals byte for byte. The release also revised the models used by six GEO communications spacecraft. Diagnostics identify reference imagery, estimated dimensions and catalog outlines. [Satellite Model Viewer](../display_satellite.html) · [Spacecraft model references](THIRD_PARTY_NOTICES.md)

The page and conjunction Worker share the packaged satellite.js 7.1.0 engine. Three.js 0.187.0 supplies the globe and model viewer. The catalog result rows expose all visible columns to assistive technology.

Regression coverage includes filter changes during close-up tracking, pixel comparisons of the globe at three viewing angles, shared model assignments, and the catalog API against the bundled data. The prerelease source and its regression record are available at the original tag. [Tagged source](https://github.com/arcazj/openbexi_earth_orbit/tree/v2.6.0)

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
