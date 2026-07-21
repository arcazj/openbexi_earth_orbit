# Test and Integration Plan

## Purpose

This file preserves the historical regression and manual-test record through Version 1.7.6. It is not the authoritative v2.0 release gate. Current v2.0 authority is `docs/engineering/RELEASE_CHECKLIST.md`, the scripts selected by `npm run check` and `npm test`, and retained evidence under `release/evidence/`. Historical statements below are not current dependency, version, or publication requirements.

## Version 2.0 Candidate Verification

- Run `npm ci`, `npm run check`, and `npm test` from a clean clone for promotion evidence.
- Source/server-capable startup must prefer the exact integrity-checked files under `vendor/` and make zero routine CDN requests; exact-version CDN URLs are an explicit source-mode fallback only. The curated `dist/` artifact must not execute remote runtime code.
- A dependency or application module-graph failure must show a visible accessible error with a `Retry` action rather than a silent black screen. Browser coverage must prove retry restores a nonblank canvas.
- Conjunction output remains Experimental TLE-based close-approach screening, with collision probability unavailable and operational use prohibited.
- The current local candidate summary records 40/40 unit files, 14/14 Python API/security tests, and 8 browser journeys passing with 4 project-inapplicable skips. Unchecked external and human gates remain in `docs/engineering/RELEASE_CHECKLIST.md`.
- If only one browser shows a blank page while the same URL works elsewhere, hard-refresh or clear that origin's site data before diagnosing a general compatibility failure. The reported Microsoft Edge case rendered after its stale cache was cleared; this manual result is not an additional automated release gate.

Version 1.4 adds selected-satellite observer framing and Earth-facing orientation. In 3D mode, selected satellites should transition to a close observer view with Earth centered behind the satellite. In 2D/Mercator mode, selected satellites should be clearly highlighted without applying 3D-only camera-distance logic.

Version 1.4.1 fixes selected-satellite detailed model resolution. When a selected satellite has a related local OBJ/MTL or GLB asset under `obj/`, the app should load that local model; otherwise the selected TLE sprite must remain visible as the fallback.

Version 1.4.2 fixed the selected-satellite model visibility regression with close observer targeting and `display_satellite.html` as an isolated local OBJ/MTL and GLB model viewer. Version 1.5.9 supersedes the old fallback-distance behavior by requiring the selected detailed-model observer eye to remain at the exact converted 100 m default distance.

Version 1.4.3 cleans up prompt/release structure and dependency versioning. `PROMPT_Instructions.md` must contain the general execution prompt and project-compatible execution rules, release history must live in `PROMPT_History.md`, `index.html` must display the latest release version, and all browser import maps must use matching Three.js core/addon versions.

Version 1.4.4 fixes the `Show orbit` regression. 3D orbit geometry must reject non-finite, invalid, decayed, or below-Earth propagated samples before building line vertices. Mercator ground tracks must split across invalid samples and must identify the selected satellite by stable selected NORAD ID even when a detailed 3D model hides the selected sprite.

Version 1.4.5 fixes remaining `Show Orbit` rendering and filter menu issues. GEO orbit paths should keep their physical propagation radius but render with normal Earth depth occlusion, Mercator should show a visible GEO fallback track when the true ground track is nearly stationary, the Orbit filter should include `ALL`, and the filter menu should not expose an `Active` button.

Version 1.5 optimizes `index.html` startup performance. The 3D scene, menu, controls, and first animation frame should render before full TLE sprite processing, decay prediction, and timeline setup complete. Startup timing diagnostics are exposed through `window.openbexiStartupPerformance.summary()` when the page is opened with `?perf=1` or `localStorage.openbexiStartupPerf = "1"`.

Version 1.5.1 improves the left menu user experience. The menu is organized into compact colored tabs/onglets, keeps controls grouped by workflow, adds a searchable satellite selector, converts timeline buttons into checkbox toggles, adds filter reset/status/empty states, improves selected tag styling, and persists useful menu tab/collapse state.

Version 1.5.2 stabilizes the menu redesign. It removes mojibake from UI labels, narrows the menu while preserving internal scrolling, orders tabs as Filters, Satellite, View, Timelines, Other, Settings, makes launch and re-entry timelines mutually exclusive, preserves Yaw/Pitch/Roll slider visibility and values after satellite selection, and filters generated `Active` tag chips from the menu.

Version 1.5.3 replaces the vertical tab rail with independent accordion-style menu sections. Multiple sections may remain open at the same time, expanding one section must not collapse another, `Filters` and `Satellite Selection` always start expanded on page load, and the legacy dark navy/blue section colors with colored left accents are preserved.

Version 1.5.4 fixes expanded accordion header readability. Expanded headers such as `Filters - Satellites Found` and `Satellite Selection` must use dark high-contrast text on the light metallic expanded background while preserving the legacy collapsed header colors and left accents.

Version 1.5.5 makes the `Filters - Satellites Found` count red and bold, and narrows the accordion menu again while preserving internal scrolling, time-slider readability, accordion behavior, and existing app controls.

Version 1.5.6 fixes two blocking regressions: the satellite search/autocomplete dropdown must close after selection, `Escape`, `Tab`, or outside click without blocking controls behind it; and the selected-satellite 3D orbit must be explicitly occluded by Earth so behind-globe trajectory segments are not visible through the planet.

Version 1.5.7 moves the `View` accordion section directly below `Filters` so globe/Mercator/display controls are reachable near the top of the left menu while preserving existing accordion behavior and default expanded sections.

Version 1.5.8 moves the `View` accordion section to the very top of the left menu, above `Filters`, while preserving existing accordion behavior and default expanded sections.

Version 1.5.9 fixes selected-satellite detailed-model visibility at close range. For local OBJ/MTL or GLB selected models, the camera/observer eye must stay exactly 100 real-world meters from the selected satellite target by default. Model bounds and camera FOV are used for visual-scale fitting, near-plane safety, zoom limits, and visibility checks instead of moving the observer farther away. The selected model must remain centered while it moves, and automated tests must confirm at least one known local model is in front of the camera, inside the viewport, and large enough to inspect.

Version 1.5.10 corrects Starlink selected-model orientation and observer placement. Starlink local `+X` must align with propagated velocity, local `+Z` must align with nadir toward Earth, and local `+Y` must complete the right-handed frame. The default Starlink selected view must stay at the 100 m observer-eye distance but use an oblique reference-style camera offset so Earth/horizon appears behind and below the satellite instead of centered directly behind it.

Version 1.5.11 tightens selected-satellite UX. Any satellite selection must automatically enable `Show only selected satellite`, keep that checkbox synchronized with `simParams.showOnlySelectedSatellite`, and keep only the selected satellite visible even when the current filters would otherwise hide it. Selecting a non-`MEO`/non-`GEO` satellite must automatically enable `High Def.` Earth without forcing that setting off for MEO/GEO selections. The selected-satellite observer frame must continue to keep Earth visible behind the satellite. The `View` menu must group `Globe`/`Mercator`, `High Def.`/`ECEF Axes`/`Day/Night`, and `First Starlink`/`ISS` shortcuts on three compact rows. The shortcuts must select the same satellites through the same path as the regular selector. After a satellite selection, the next focus, click, typing, paste, or clear action in the search field must clear only the prior selected label so the user can search for another satellite without clearing the active selection.

Version 1.5.12 adds a Help section and improves shortcut/orientation clarity. The Starlink shortcut must display the resolved NORAD ID as `Starlink (<NORAD ID>)`, with unavailable fallbacks for Starlink and ISS. ISS selected models must use the live velocity/nadir/right-handed orbital frame with ISS-specific calibration diagnostics. The Help accordion must appear after Settings and include GitHub, README, Prompt History, License, and a concise legal disclaimer about data, model, visualization, and `satellite.js` limitations.

Version 1.5.13 adds an optional Python server, server status UI, Share menu, and Swagger/API documentation links. The app must load server-provided TLE and satellite metadata when connected, but must fall back to the current local files without behavioral regressions when the server is disconnected, slow, invalid, or unavailable.

Version 1.5.14 improves the Python server UI path and Share UX. Swagger/API docs must use high-contrast readable endpoint rows, server status must use `icons/server_*.svg`, Other Selections must keep the same header text style as other accordion sections, and Share must support current-canvas preview, download, copy, and native image sharing when supported.

Version 1.5.15 makes launch accordion state deterministic and improves Help documentation. View, Filters, and Satellite Selection start expanded; Timelines, Other Selections, Settings, Share, and Help start collapsed even if previous local accordion state exists. Help renders README and Releases History Markdown in the app, and the Close, version, and server status controls align on one compact row.

Version 1.5.16 revises the menu UX. All accordion sections must start collapsed by default, `View` is renamed to `Views & Time`, Settings is removed, selected-satellite controls stay hidden until a satellite is selected, Help uses document-style actions, Swagger/API/Licenses open separate pages, and the centered GitHub/version header aligns with the Close and server status controls. Connected status uses `icons/power_green.png`; disconnected/error status uses `icons/power_red.png`.

Version 1.5.17 revises the menu order and launch defaults. `Satellite Selection` appears directly under `Views & Time`, `Filters - Satellites Found` appears directly under `Satellite Selection`, and those three sections start expanded on every launch or refresh while the remaining sections start collapsed. `Views & Time` includes a menu `Time x` slider synchronized with the canvas-top `Time x` slider. The obsolete visible orbit-filter and satellite-search helper text is removed without removing controls or accessible names.

Version 1.5.18 removes the launch offline banner while preserving silent local-data fallback and the server status panel. Starlink and ISS shortcuts move from `Views & Time` into `Satellite Selection`; the satellite search results render above other menu elements; selecting a satellite displays a transparent right-side data/TLE panel under the UTC clock; README and Releases History open rendered Markdown in `markdown_viewer.html`; `LICENSE.md` backs the Licenses action; and `SSL_1300.glb` is restricted to app satellite identifier `20`.

Version 1.5.19 removes the detailed metadata/TLE table from Satellite Selection and keeps full selected-satellite details only in the right-side canvas panel. The right-side panel must match the UTC clock width and show TLE line 1 and TLE line 2 only once. `SSL_1300.glb` is restricted to `INTELSAT 20 (IS-20)` and `INTELSAT 18 (IS-18)` only.

Version 1.5.20 moves the combined Globe + Mercator overlay to the bottom-right of the canvas so it is not hidden by the left menu. Selected detailed satellite models must use the Sun as the dominant light source, update Sun lighting before each 3D render, preserve a minimal non-washing camera fill only as fallback, and add subtle Earth-reflected albedo toward solar panels when possible.

Version 1.5.21 makes the right-side selected-satellite data and TLE details independently collapsible and expanded by default whenever a satellite is selected, using `<details open>`. Starlink and ISS selections add an expanded `Source detail` section after TLE details with bold red attribution text for the model source and license/courtesy. ISS selected-model orientation swaps yaw and pitch control inputs so ISS `Yaw` applies the previous pitch behavior and ISS `Pitch` applies the previous yaw behavior, while roll remains unchanged. ISS local `+Y` is the pitch axis and stays pointed toward Earth/nadir as ISS propagates. It also captures the ADCS/attitude visualization layout correction requirements from the screenshot: unclipped title, non-overlapping Attitude table, centered satellite model, readable yaw/pitch/roll labels, aligned headers and units, and responsive layout. The ADCS page-specific correction is blocked in this workspace because no HTML/JS file contains the screenshot's `ADCS`, `Attitude`, `Commanded`, or `CMG Torque` UI text.

Version 1.5.22 keeps the Earth-centered scene frame fixed, disables OrbitControls panning, keeps Earth mode targeted at `(0, 0, 0)`, keeps Moon mode targeted at `moon.position` without moving the Moon object to the origin, and preserves selected-satellite target priority. It allows Earth zoom to approximately 100 km above the surface, uses a large finite maximum zoom and far clipping plane, replaces spherical helper math with WGS84 geodetic/ECF calculations, distinguishes GEO/MEO/LEO/HEO/Other orbit classes without treating every slow object as GEO, filters invalid propagated positions out of visible sprites/paths, and makes Mercator markers, ground tracks, footprints, coverage overlays, and day/night shading use one Web Mercator helper. The earlier O3b sprite-only fallback is superseded by the local `o3b.glb` mapping. Selected detailed model roots remain fixed to the canonical propagated satellite scene coordinate, model centering is applied only to child geometry, hidden selected sprites are synchronized with the same propagated coordinate, and `orbitAlignDebug` can log orbit alignment diagnostics. It documents that `satellite.js` returns TEME-like coordinates and the app treats them as ECI-like visualization coordinates unless a higher-fidelity transform is implemented later.

Version 1.5.23 adds `Mars` to `Other Selections`. Mars mode displays a Mars globe using the local source texture `textures/March.jpg`, targets `mars.position` for orbit/zoom controls like Moon mode, preserves the Earth-centered frame, does not move Earth/Moon/Mars to `(0, 0, 0)`, and documents that the Mars texture is local project-provided with exact source/license to be confirmed.

Version 1.6 adds the optional `Stars & Milky Way` view layer to the main `index.html` app. `Stars & Milky Way` is placed in Views & Time beside `Globe` and `Mercator`, remains unchecked by default, and reveals `RA/Dec Grid`, `Bright Labels`, `Atmosphere`, and initial magnitude controls only while enabled. Mars now loads optimized `textures/March_8k.jpg` generated from local source `textures/March.jpg` to avoid WebGL upload-time resizing of the oversized source texture. Regression checks must confirm existing Earth, Moon, Mars, satellite, Mercator, server, Help, Share, timeline, selected-satellite, orbit, footprint, and model-loading behavior remains unchanged.

Version 1.6.1 removes the integrated `Magnitude limit` slider from the main app because the bundled catalog currently contains 46 reference stars and the slider does not add useful visual detail. The integrated `Stars & Milky Way` view renders all 46 bundled real RA/Dec stars from `data/stars/bright-stars-demo.js`, shows a catalog summary computed from `BRIGHT_STARS_DEMO.length`, keeps `RA/Dec Grid`, `Bright Labels`, and `Atmosphere` hidden until enabled, and keeps Bright Labels internally limited to bright stars for readability. Standalone `Earth_Stars_MilkyWay.html` may keep its own magnitude controls for experimentation.

Version 1.6.2 integrates Solar System Overview into the main app while keeping `SolarSystemOverview.html` as a standalone debug page. `Views & Time` removes the menu Time x slider and keeps the top/canvas Time x slider as the single simulation-speed control. The new layout is row 1: `Solar System`, `Stars & Milky Way`; row 2: `Globe`, `High Def.`, `ECEF Axes`; row 3: `Mercator`, `Day/Night`. Solar System mode is off by default, stores the previous Earth/satellite state, hides Earth-specific satellite layers while active, and restores state on exit. It renders textured Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, and Uranus with local textures, orbit paths, labels, Sun glow, Saturn rings, selected-body HUD/highlight, and approximate Kepler/visual positions. Earth selection exits to normal Globe mode, Moon selection exits to existing Moon-centered mode, Mars selection exits to existing Mars mode, and other planet selections focus inside Solar System mode. The old `Other Selections` menu section is removed; Earth/Moon/Mars context switching is preserved through Solar System selection. The `Displaying 46 bundled reference stars` summary appears only when both `Stars & Milky Way` and `Bright Labels` are checked.

Version 1.7 upgrades Solar System textures and adds bundled JPL-derived ephemeris data. Mercury uses `textures/mercury.png`, Venus uses `textures/venus.png`, and Jupiter uses `textures/jupiter.jpg`. Integrated Solar System mode loads local `data/ephemeris/solar_system_jpl_horizons_2020_2035_6h.json`, uses shared `SIM_DATE`, shows ephemeris source/range in the UI, and labels fallback clearly if data is missing, loading, invalid, or out of range. Moon is derived from Earth/Moon ephemeris vectors. Existing Version 1.6.2 menu behavior, removed `Other Selections`, Earth/Moon/Mars reachability through Solar System selection, and legacy satellite/Mercator/Stars/Share/Help behavior must remain intact.

Version 1.7.1 consolidates `Filters - Satellites Found` into `Satellites Selection - Found`. The standalone Filters accordion is removed; orbit, tag, debris, reset, and zero-result controls live inside Satellite Selection; the found count is red/bold in the Satellite Selection heading; `Reset Filters` is on the same row as `Show`, `Hide`, and `Debris only`; the old active summary text and visible helper paragraphs are removed. Multi-check filter combinations must update the found count, hidden select options, and visible search dropdown from the same filtered satellite set.
The main `Views & Time` checkboxes are aligned in a 3x3 table/grid: `Solar System`, `Stars & Milky Way`, empty; `Globe`, `High Def.`, `ECEF Axes`; `Mercator`, `Day/Night`, empty.
When search text is active, the red found count must match the visible dropdown result list. If results are capped, the count must show `visible / total`, such as `40 / 126`.

Version 1.7.2 moves `Debris` into the orbit/category row as `ALL`, `GEO`, `MEO`, `LEO`, `HRO`, `Debris`, `Others`. The old separate `Show`, `Hide`, and `Debris only` buttons are removed. Selecting `Debris` shows debris objects only. `Reset Filters` moves to the satellite search row immediately after `Clear` and keeps reset/search/count/dropdown/hidden-select behavior consistent. The release adds local standard Swagger/OpenAPI-style static documentation at `swagger.html`, keeps `SWAGGER.md` as the Markdown companion renderable through `markdown_viewer.html?source=SWAGGER.md&title=Swagger%20API`, and requires both local documentation paths to display without starting `server.py`; live Swagger UI and OpenAPI JSON still require the optional Python server.

Version 1.7.3 corrects 3D `Show Orbit` so the selected satellite displays exactly one complete propagated orbital revolution from the current shared simulation date. Orbit generation uses validated TLE mean motion when available, samples from `SIM_DATE` through `SIM_DATE + one orbital period`, keeps adaptive bounded sampling, skips/splits invalid samples without artificial closure, preserves Earth occlusion, and refreshes/replaces the existing orbit path as `Time x` advances instead of accumulating duplicate trails. `Stars & Milky Way` is checked by default on launch while `RA/Dec Grid`, `Bright Labels`, and `Atmosphere` remain unchecked.

Version 1.7.4 replaces legacy Java data maintenance with `tools/satellite_data_tools.py`. The Python tool must run standalone and be importable by `server.py`, preserve legacy `export-tle --all` and `build-decayed-db --all` behavior, use incremental default TLE updates with metadata freshness checks, preserve last-known-good data when CelesTrak is unavailable, keep optional Space-Track fallback disabled by default, and expose default-off scheduled server refresh controls that obey the 24-hour server rule and the 2-hour CelesTrak guard before any startup query.

Version 1.7.5 makes `Show Launch Timeline` and `Show Re-entry Timeline` data-fresh. Launch Timeline must derive and highlight the latest valid launch date from currently loaded satellite/TLE data. Re-entry Timeline must derive and highlight the latest valid confirmed or predicted decay event from active satellites plus local/server decayed records, and it must show inactive decayed-record details without attempting active TLE propagation.

Version 1.7.6 historically required CDN-first dependencies with local `node_modules` fallbacks. Version 2.0 supersedes that delivery rule with exact vendored runtime files and a local-only curated static artifact.

## Test Environment

- Run from the repository root.
- Serve the app over HTTP. Do not use `file://` because ES modules and local JSON/assets require a web server.
- Recommended local server:

```powershell
py -m http.server 8000 --bind 127.0.0.1
```

- Optional Python API server:

```powershell
py server.py --host 127.0.0.1 --port 8000
```

- Open:

```text
http://127.0.0.1:8000/index.html
```

## Static Checks

- Run JavaScript syntax checks for browser modules:

```powershell
Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }
```

- Run the existing unit test:

```powershell
npm test
```

- Confirm `index.html`, `js/SatelliteMenuLoader.js`, and `css/style.css` contain no obvious malformed tags, missing closing braces, or duplicated filter IDs.
- Confirm `PROMPT_Instructions.md` contains the `General Execution Prompt` section and no release history.
- Confirm `PROMPT_History.md` contains the latest release entry.
- Confirm the visible `index.html` version number matches the latest `PROMPT_History.md` release.
- Confirm every browser import map uses the same Three.js version for `three` and `three/addons/`.
- Confirm the verified Three.js version is documented when it changes.
- Confirm `index.html` starts the animation loop before awaiting TLE setup.
- Confirm startup timing marks include `first-visible-globe-render`, `satellite-data-ready`, and `first-interactive-ui`.
- Confirm TLE sprite setup and deferred decay work use named chunk sizes instead of one unbounded synchronous pass.
- Confirm UI-facing HTML, CSS, JavaScript, generated menu markup, `README.md`, and this file pass the automated mojibake scan for common corrupted markers.
- Run Python syntax checks:

```powershell
py -m py_compile server.py
py -m py_compile tools/satellite_data_tools.py
```

- With the optional Python server running, confirm these endpoints return successful responses:
  - `/api/health`
  - `/api/version`
  - `/api/tle`
  - `/api/satellites`
  - `/api/satellite-metadata`
  - `/api/decayed`
  - `/api/data-update-status`
  - `/docs`
  - `/openapi.json`

## Deep Automated Tests

Add and maintain focused tests under `tests/`. `npm test` must run all tests, not only a single file.

### Coordinate Frames

- Test shared coordinate transforms for finite outputs and consistent units.
- Test ECI/ECEF/scene conversion for the same satellite and simulation time.
- Test Earth mesh remains at `(0, 0, 0)`.
- Test Earth axes originate from `(0, 0, 0)`.
- Test Earth-mode controls target remains `(0, 0, 0)`.
- Test OrbitControls panning is disabled or constrained so mouse movement cannot pan Earth away from center.
- Test Moon mode keeps the Moon visually centered by using `controls.target = moon.position`.
- Test Moon mode does not move the Moon object to `(0, 0, 0)`.
- Test Mars mode keeps Mars visually centered by using `controls.target = mars.position`.
- Test Mars mode does not move Earth, Moon, or Mars to `(0, 0, 0)`.
- Test Mars keeps the local source texture asset `textures/March.jpg` and loads optimized runtime texture `textures/March_8k.jpg`.
- Test selected-satellite target priority still works while Earth/Moon target enforcement is active.
- Test Earth minimum zoom is `EARTH_SCENE_RADIUS + metersToSceneUnits(100000)`.
- Test maximum zoom is finite and very large.
- Test camera near/far planes do not clip Earth, Moon, GEO, MEO, LEO, HEO, or selected satellites in normal use.
- Test that the live selected satellite scene position and the first/generated current orbit-trail point agree within a small tolerance.
- Include at least one GEO, one MEO, and one LEO example from `json/tle/TLE.json`.
- Test that all scene positions use the same `KM_TO_SCENE_UNITS` scale.

### Orbit Trail Generation

- Test orbit generation uses the supplied simulation date, not wall-clock `Date.now()`.
- Test the selected 3D orbit duration is exactly one validated orbital period for LEO, MEO, GEO, and HEO cases.
- Test generated 3D orbit sampling starts at the supplied simulation date and ends at `SIM_DATE + one orbital period`, inclusive.
- Test the selected satellite's current propagated scene position matches the first generated 3D orbit point within tolerance.
- Test adaptive orbit sampling is bounded and does not create excessive vertices for GEO or long-period objects.
- Test generated orbit paths are finite, non-empty, and in scene units.
- Test non-finite propagated positions are rejected and never become 3D geometry vertices.
- Test below-Earth propagated positions split or stop an orbit path instead of creating a line through Earth.
- Test all-invalid propagated samples create no orbit geometry.
- Test orbit generation does not add an artificial closing segment from the final sample back to the first sample.
- Test split orbit paths create separate `THREE.Line` children rather than one connected line.
- Test orbit line materials keep `depthTest` enabled, use normal render order, and do not force overlay rendering through Earth.
- Test selected orbit visibility is split against Earth occlusion from the active camera viewpoint.
- Test behind-Earth orbit points are removed from visible selected-orbit segments.
- Test front-side and side-of-silhouette orbit points remain visible.
- Test selected-orbit occlusion refreshes from camera state before rendering.
- Test Earth material continues to use `depthWrite = true`.
- Test GEO orbit radius remains plausible and unchanged while rendering fixes are applied.
- Test orbit generation does not use frame-specific exceptions that make GEO and non-GEO paths incompatible with live satellite positions.
- Test switching selected satellites removes or replaces previous orbit geometry.
- Test refreshing selected-orbit geometry while `Time x` advances replaces the existing `selectedOrbitTrajectoryRoot` instead of accumulating duplicate roots.
- Test `Time x = 0` keeps the displayed selected orbit stable while the simulation date is frozen.
- Test positive `Time x` advances the simulation date and causes stale selected-orbit geometry to refresh from the updated `SIM_DATE`.
- Test WGS84 geodetic/ECF conversion at the equator and poles.
- Test high-latitude WGS84 look geometry.
- Test GEO, MEO, LEO, HEO, Other, and Unknown classification cases.
- Test HEO/Molniya-style orbit duration renders a meaningful full orbit.
- Test invalid, decayed, below-Earth, or non-finite propagated positions are hidden or omitted instead of frozen.
- Test O3b/OB3 satellites resolve to `o3b.glb` and display the selected detailed model when the local asset exists.
- Test selected detailed model roots use the same propagated scene coordinate as the selected orbit trajectory.
- Test model visual centering offsets child geometry only and does not change the detailed model root position.
- Test selected hidden TLE sprite positions are synchronized with the detailed model root position.
- Test selected model root-to-propagated-position distance remains below `0.01` scene units.

### Day/Night and Sun Direction

- Test GMST normalization stays in `[0, 2 * Math.PI)`.
- Test Sun vectors are normalized.
- Test Web Mercator high-latitude projection clamps at the supported latitude limit and remains finite.
- Test `drawDayNightMercator()` terminator math remains finite near equinox/subsolar-latitude singularities.
- Test the Sun/light scene direction uses the same scene-frame transform convention as satellites.
- Test day/night behavior at a known UTC time does not produce NaN or inverted vectors.

### Moon Positioning

- Test Moon position returns finite scene coordinates.
- Test Moon distance stays within the documented expected range.
- If the Moon model is approximate, test and document that approximation explicitly.
- Test Moon coordinates use the same scene transform convention as the rest of the 3D scene.

### Mars Positioning

- Test Mars position returns finite scene coordinates.
- Test Mars distance stays within a plausible simplified Earth-to-Mars range.
- Test Mars uses local project textures and does not fetch remote textures at runtime.
- Test Version 1.6 Stars & Milky Way controls are added without changing existing Views & Time control order except the explicit new checkbox beside Globe and Mercator.
- Test Stars & Milky Way is checked by default and its RA/Dec Grid, Bright Labels, and Atmosphere controls are visible but unchecked by default.
- Test unchecking Stars & Milky Way hides the sub-controls and star field, and rechecking it reveals the sub-controls while keeping RA/Dec Grid, Bright Labels, and Atmosphere unchecked.
- Test Version 1.6.1 removes the integrated Magnitude limit slider and renders all 46 bundled reference stars.
- Test the star-options panel shows a catalog summary computed from `BRIGHT_STARS_DEMO.length`.
- Test magnitude `<18` is documented as external Gaia DR3 tiled/LOD/binary future work only.
- Test Mars mode targets `mars.position` and preserves Earth-centered scene coordinates.
- Document that the Mars position and texture provenance are approximate/local unless later replaced with a verified source.

### Solar System Overview Integration

- Test Version 1.7.3 `Views & Time` row order and defaults: `Solar System` unchecked, `Stars & Milky Way` checked; `Globe` checked, `High Def.` unchecked, `ECEF Axes` unchecked; `Mercator` unchecked, `Day/Night` checked.
- Test the menu Time x slider is removed and the top/canvas Time x slider remains functional.
- Test `js/solarSystemOverviewLoader.js` defines Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, and Uranus.
- Test every integrated planet has a local texture path, no remote runtime URL, fallback material, SRGB color space handling, anisotropy handling, and browser-safe dimensions.
- Test Mercury uses `textures/mercury.png`, Venus uses `textures/venus.png`, and Jupiter uses `textures/jupiter.jpg`.
- Test `data/ephemeris/solar_system_jpl_horizons_2020_2035_6h.json` exists, is local runtime data, covers `2020-01-01` through `2035-12-31`, uses 6-hour cadence, and documents source/frame/time/origin/units/license.
- Test ephemeris interpolation against off-grid Horizons reference samples, with less than `5,000 km` error for Mercury, Venus, Earth, Moon, and Mars, and less than `50,000 km` for Jupiter, Saturn, and Uranus.
- Test Moon scene position is derived from Moon minus Earth ephemeris vectors.
- Test closed JPL-derived orbit guides are used only when the bundled ephemeris covers at least one complete orbital period; Saturn, Uranus, Moon, and other incomplete-range bodies must not show diagonal chord artifacts.
- Test `Other Selections` is absent from the menu and from default accordion collapse state.
- Test the `Displaying 46 bundled reference stars` summary is hidden by default and appears only when `Stars & Milky Way` and `Bright Labels` are both checked.
- Test Solar System mode is off on startup and normal Earth satellite view remains active.
- Test enabling Solar System mode hides Earth-specific satellite sprites, selected model, selected orbit path, footprints, LVLH/YPR frames, Mercator overlay, and selected-satellite panel.
- Test exiting Solar System mode restores previous Earth/satellite state without mutating TLE data, filters, or satellite lists.
- Test selecting Earth from Solar System mode exits to normal Globe mode.
- Test selecting Moon from Solar System mode exits to existing Moon-centered mode and targets `moon.position`.
- Test selecting Mars from Solar System mode exits to existing Mars mode and preserves Mars progress/target behavior.
- Test selecting Mercury, Venus, Jupiter, Saturn, or Uranus keeps Solar System mode active, focuses the selected planet, shows a HUD, and can return to overview.
- Test Solar System planet names render as discreet compact pin/arrow callouts, pin anchors sit on or near the planet edge, labels stay readable for planets far from the Sun, and labels shrink at close zoom so they do not cover planets or orbit paths.
- Test Solar System body motion is driven from shared `SIM_DATE`, which is advanced by the top/canvas `Time x` slider through `simParams.timeWarp`.
- Test `Time x = 0` maps to true zero simulation advance and freezes Solar System positions.
- Test `Time x > 0` advances simulation milliseconds and changes Solar System positions.
- Test inner planets move between `2026-06-07T00:00:00Z` and `2026-07-07T00:00:00Z`.
- Test Jupiter, Saturn, and Uranus move between `2026-06-07T00:00:00Z` and `2030-06-07T00:00:00Z`.
- Test integrated Solar System body positions are not driven by independent `Date.now()` or `performance.now()` code in the Solar System modules.
- Test Solar System UI reports JPL-derived ephemeris source/range or a clear fallback/loading warning.
- Test Escape exits selected-planet focus or Solar System mode where practical.
- Test Version 1.6.1 Stars & Milky Way behavior remains: no integrated magnitude slider, 46 bundled stars, readable Bright Labels.

### Standalone Solar System Overview

- Test `SolarSystemOverview.html` exists as a standalone page.
- Test it uses Three.js `0.184.0` and `OrbitControls`.
- Test it defines Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, and Uranus.
- Test it renders orbit paths, planet markers, readable labels, a Sun glow, and a UTC clock.
- Test it reuses local star/Milky Way assets when available and has a procedural star fallback.
- Test it does not use or display external third-party logos or watermarks.
- Test it remains available as a standalone debug page after the main app integration.

### Satellite Model Scaling

- Test OBJ and GLB unit conversion helpers for `m`, `cm`, `mm`, `km`, and numeric factors.
- Test visual-scale factors are named/configurable and applied exactly once.
- Test detailed satellite models use shared scale constants from `SatelliteConstantLoader.js`.

### Selected-Satellite Model Resolution

- Test normalized model matching is case-insensitive and ignores spaces, hyphens, underscores, and file extensions.
- Test Starlink satellites resolve to the local Starlink model assets.
- Test OneWeb satellites resolve to the local OneWeb OBJ/MTL assets.
- Test O3b/OB3 satellites resolve to `o3b.glb` and keep the selected sprite fallback only if the local GLB is missing or fails to load.
- Test ISS resolves to the local ISS GLB asset.
- Test GOES/Intelsat/SES-style GEO satellites can resolve to the SSL 1300 fallback asset.
- Test unknown satellites return no model mapping so the selected sprite remains the visible fallback.
- Test OBJ/MTL verification accepts a present OBJ even if the MTL check fails, because the OBJ can load without materials.
- Test GLB verification requires the GLB file to exist.

### Selected-Satellite Framing and Orientation

- Test real-meter to scene-unit conversion for the 75 to 100 m selected-satellite observer range and the 100 m selected-model target.
- Test selected detailed-model framing preserves the exact converted 100 m observer-eye distance by default and does not use the old visual fallback that moved the observer farther away.
- Test selected detailed-model visual fitting uses loaded model bounds and camera FOV to keep the model within the target viewport-size range.
- Test selected-satellite camera framing places the observer outward from Earth through the selected satellite, with Earth behind the satellite.
- Test detailed-model framing can use a reduced camera near plane so the model is not forced into the old Earth-radius fallback distance.
- Test Starlink visual framing uses the local Starlink OBJ bounds and keeps the model large enough to inspect at the 100 m observer distance.
- Test at least one known local model projects in front of the camera, inside the viewport, and at a non-trivial screen-space size.
- Test Starlink orbital-frame orientation maps local `+X` to propagated velocity, local `+Z` to nadir, and local `+Y` to the right-handed cross-track axis.
- Test default Starlink yaw/pitch/roll values preserve the base orbital-frame alignment before user slider bias is applied.
- Test Starlink selected-view camera offset is oblique, includes velocity and cross-track components, preserves the 100 m observer distance, and is not the old pure radial Earth-centered placement.
- Test the configured model Earth-facing axis maps to the nadir direction toward Earth's center.
- Test yaw-only bias preserves nadir pointing for the configured Earth-facing axis.

### Footprint Math

- Test footprint angular radius for representative LEO, MEO, and GEO altitudes.
- Test footprint calculations reject invalid, below-surface, NaN, and Infinity inputs safely.
- Test 3D footprint satellite position uses the shared scene-frame transform.
- Test Mercator footprint output remains finite and handles dateline wrapping.

### Mercator Ground Tracks

- Test selected-satellite lookup prefers `simParams.selectedSatelliteNoradId` over sprite visibility or `isSelected` state.
- Test the selected satellite can still be found when its 3D sprite is hidden because a detailed model is visible.
- Test non-finite Mercator propagation samples create ground-track gaps instead of connected lines.
- Test below-Earth Mercator propagation samples create ground-track gaps.
- Test `drawGroundTrack()` starts a new path segment after an invalid sample gap.
- Test nearly stationary GEO ground tracks expand to a visible fallback segment at Mercator inset scale.
- Test selected ground tracks can be redrawn after footprint rendering so footprints do not hide the track.

### Menu and UI State

- Test generated menu markup contains no duplicate IDs.
- Test generated menu markup and UI source files contain no common mojibake markers.
- Test the Orbit/category filter includes one row ordered as `ALL`, `GEO`, `MEO`, `LEO`, `HRO`, `Debris`, `Others`.
- Test the filter menu does not contain an `Active` button/control.
- Test generated company/tag chips exclude `Active`, not only the static markup.
- Test the `Views & Time` section has one collapsible container containing Solar System, Stars & Milky Way, Globe, Mercator, High Def., ECEF Axes, Day/Night controls, and mode-specific sub-controls, with no menu `Time x` slider.
- Test the main `Views & Time` checkboxes render in a stable 3x3 table/grid so columns are aligned across all three rows.
- Test the top/canvas `Time x` slider updates the shared simulation-speed state after the Version 1.7 Solar System ephemeris integration.
- Test menu CSS keeps the narrowed menu width, legacy colored accordion headers, and scrollable long panels.
- Test the vertical tab rail is removed and the menu uses stacked accordion sections.
- Test accordion section order is `Views & Time`, `Satellites Selection - Found`, `Timelines`, `Share`, `Help`.
- Test the standalone `Filters - Satellites Found` accordion, `filtersContent`, and active summary text are absent.
- Test orbit/category, tag, reset, and zero-result controls are inside `Satellites Selection - Found`.
- Test the old separate `Show`, `Hide`, and `Debris only` debris buttons are absent.
- Test `Debris` appears immediately before `Others` in the orbit/category row and filters to debris objects only.
- Test `Reset Filters` appears in the search row immediately after `Clear`, with DOM/tab order `Search satellite`, `Clear`, `Reset Filters`.
- Test the found count in `Satellites Selection - Found` is red, bold, and updates its accessible label.
- Test multi-check filtering in Search satellite: the visible dropdown list of satellites must match the requested orbit/tag/debris filtering exactly, and the hidden legacy select must contain the same filtered satellite set.
- Test active search text updates the red found count from the same search result state used to render the visible dropdown.
- Test capped search results show a `visible / total` count instead of a misleading total-only count.
- Test clearing search restores the red count to the active filter total.
- Test the Settings accordion section is absent.
- Test multiple accordion sections can be open simultaneously.
- Test expanding one accordion section does not collapse another section.
- Test `Views & Time` and `Satellites Selection - Found` are expanded on initial page load.
- Test `Timelines`, `Share`, and `Help` are collapsed on initial page load.
- Test persisted accordion state cannot override the required launch defaults on initial page load.
- Test the visible text `Use the time slider at the top of the screen to control simulation speed.` is absent.
- Test the visible text `Orbit filter (multi-select): Choose one or more orbit families. ALL enables every orbit category.` is absent while orbit filter controls remain usable.
- Test the visible text `Select Satellite: Search by name, NORAD ID, orbit type, or tag.` is absent while satellite search remains usable and accessible.
- Test expanded accordion headers use dark high-contrast text and do not inherit the light global heading color.
- Test the satellite count in the Filters header is red and bold.
- Test the accordion menu width is thinner than the previous `420px` release width.
- Test selected-satellite controls (`Yaw-Pitch-Roll`, `Show Footprint`, `Show only selected satellite`, `Orbit Frame (LVLH)`, and `Show Orbit`) are hidden until a satellite is selected.
- Test Yaw/Pitch/Roll sliders are hidden by default, shown only when enabled with a selected satellite, and hidden again when disabled or when no satellite is selected.
- Test Yaw/Pitch/Roll slider visibility is restored after satellite selection when the YPR toggle is enabled.
- Test satellite selection does not reset yaw, pitch, or roll slider values unless the user resets them.
- Test satellite search uses explicit dropdown open state so programmatic rerenders cannot reopen a closed result list.
- Test selecting a satellite from search closes the dropdown and preserves the selected-satellite summary.
- Test keyboard `Enter` selection closes the dropdown.
- Test `Escape`, `Tab`, and outside click close the dropdown.
- Test hidden satellite search results use `display: none` and `pointer-events: none` so they cannot block `Show Orbit`, `Show Footprint`, or other controls below the selector.
- Test satellite search keeps combobox/listbox accessibility hooks: `aria-expanded`, `aria-controls`, `role="listbox"`, `role="option"`, and active-descendant state.
- Test launch and re-entry timeline checkbox logic is mutually exclusive and exposes HUD visibility state.
- Test `getFullGitHubUrl()` handles `null`, `undefined`, non-string values, absolute URLs, and relative paths without throwing.
- Test the View section lays out Globe/Mercator on one row, High Def./ECEF Axes/Day-Night on one row, and First Starlink/ISS shortcut buttons on one row.
- Test selecting any satellite automatically checks `Show only selected satellite`, synchronizes `simParams.showOnlySelectedSatellite`, and leaves only that selected satellite visible.
- Test `Show only selected satellite` visibility is not constrained by the current orbit/tag/debris filters.
- Test selecting a non-`MEO`/non-`GEO` satellite automatically enables `High Def.` Earth and synchronizes the checkbox.
- Test selecting `MEO` or `GEO` satellites does not force `High Def.` off.
- Test First Starlink and ISS shortcut buttons locate satellites from loaded TLE data and dispatch the normal selection path.
- Test the ISS shortcut prefers NORAD `25544`.
- Test the satellite search field clears the prior selected label on the next focus/click/type/paste/clear action without clearing the current selected satellite.
- Test selected-satellite camera metadata confirms Earth remains visible in the selected observer frame.
- Test the Starlink shortcut dynamic state helper emits `Starlink (<NORAD ID>)` for a resolved Starlink target and `Starlink unavailable` when no target exists.
- Test the ISS shortcut dynamic state helper emits `ISS` for a resolved ISS target and `ISS unavailable` when no target exists.
- Test generated menu markup does not contain `Other Selections`.
- Test generated menu markup contains `Share` immediately after `Timelines` and before `Help`.
- Test the server status icon exposes connected, checking, disconnected, and error states through CSS and accessible text.
- Test connected status uses `icons/power_green.png` and disconnected/error status uses `icons/power_red.png`.
- Test the server status panel includes server URL, connection state, data source, app version, API version, last data load, and reconnect/refresh.
- Test the Share section includes `Copy Link`, native share fallback behavior, generated link output, and copied/error feedback.
- Test Share links serialize selected satellite, view mode, filters, simulation time, and display settings without local paths, credentials, or server configuration.
- Test shared links restore supported app state only after satellite data loads and fail safely if the referenced satellite is unavailable.
- Test the Help section contains GitHub, README Markdown, Releases History Markdown, Licenses, Swagger, and API document actions.
- Test README and Releases History open rendered Markdown in `markdown_viewer.html`, with raw HTML escaped and rendered links sanitized.
- Test the Releases History action targets production-safe `RELEASE_NOTES.md` and no Help action displays the old `Prompt History` text.
- Test Swagger/API/Licenses actions open separate pages or views and are not disabled solely because the Python server is offline.
- Test the prohibited concatenated Swagger/API sentence is absent.
- Test the GitHub Help link uses `target="_blank"` and `rel="noopener noreferrer"`.
- Test the Help section contains the legal disclaimer and mentions `satellite.js`.
- Test Close, version text, and server status align horizontally and vertically on desktop and wrap only as needed on narrow screens.
- Test ISS selected-model orientation maps local `+X` to velocity, local `+Y`/pitch to nadir/Earth, and local `+Z` to the right-handed negative cross-track complement.
- Test ISS orientation diagnostics include `orientationMode`, `modelAxisMapping`, `calibrationYawDeg`, `calibrationPitchDeg`, and `calibrationRollDeg`.

### Server Data Path

- Test `/api/health` returns status `ok` and version metadata.
- Test `/api/version` returns app/API version `1.7.6` and release date `2026-06-15`.
- Test `/api/tle` and `/api/satellites` return valid TLE records with `norad_id`, `tle_line1`, and `tle_line2`.
- Test `/api/satellite-metadata` lists known metadata files.
- Test `/api/satellite-metadata/starlink_V1.json` returns one known metadata payload.
- Test `/api/decayed` returns the confirmed decay dataset.
- Test `/api/data-update-status` returns scheduler state and reports disabled/default-off behavior unless scheduling is explicitly enabled.
- Test `/docs` serves the live Swagger/API documentation page.
- Test `/openapi.json` contains OpenAPI paths for all supported API endpoints.
- Test `swagger.html` exists and displays a standard Swagger/OpenAPI-style local page with API title, version badge, OAS badge, base URL/schema notes, grouped endpoint sections, colored method badges, and expandable endpoint details without starting `server.py`.
- Test `SWAGGER.md` exists and documents `/api/health`, `/api/version`, `/api/tle`, `/api/satellites`, `/api/satellite-metadata`, `/api/decayed`, `/api/data-update-status`, `/docs`, and `/openapi.json`.
- Test `markdown_viewer.html?source=SWAGGER.md&title=Swagger%20API` renders the companion Swagger Markdown without starting `server.py`.
- Test frontend disconnected mode falls back to local `json/tle/TLE.json`.
- Test frontend startup retries `http://127.0.0.1:8000` when the initially resolved local static or IDE host has no API routes.
- Test frontend initial startup uses the static `json/tle/TLE.json` route first, then checks server status after the first interactive satellite UI.
- Test the reconnect/refresh action can replace the loaded satellite set with validated server-provided `/api/tle` data.
- Test malformed server TLE data is rejected and local fallback remains active.
- Test model metadata and decay-data fetches use server routes only when the server is connected and fall back to local paths on failure.

### Data Maintenance Tools

- Test `tools/satellite_data_tools.py` compiles with `py -m py_compile`.
- Test `export-tle --all` support is present, uses HTTPS for every CelesTrak group, keeps the legacy group source order and first-seen NORAD behavior, and does not refresh N2YO launch dates by default.
- Test default `export-tle` uses incremental source groups such as `active` and `last-30-days`, not the full legacy group sweep.
- Test TLE transformation preserves frontend fields: `company`, `satellite_name`, `norad_id`, `launch_date`, `type`, `orbit_class`, orbit metric fields, `tle_line1`, and `tle_line2`.
- Test orbit metric formulas and classification rules match the legacy Java behavior for LEO, MEO, GEO, HEO, and DECAYING cases.
- Test metadata freshness skips default TLE fetching when the last successful update is newer than the 2-hour CelesTrak guard unless `--force` is used.
- Test CelesTrak failure preserves existing `json/tle/TLE.json`, records a failed attempt, and does not replace the last successful timestamp.
- Test optional Space-Track fallback remains disabled unless credentials are explicitly configured.
- Test normal incremental TLE refresh fills or updates `satellite_launch_dates.json` from local SATCAT data for touched NORAD records when SATCAT launch metadata is available; test N2YO HTML enrichment requires the explicit `export-tle --refresh-launch-dates` opt-in and remains excluded from release evidence.
- Test `refresh-satcat --force` downloads CelesTrak raw SATCAT CSV to `json/satcat.csv` with metadata and preserves the local file on source failure.
- Test `build-decayed-db --all` reads `json/satcat.csv`, filters `DECAY_DATE` plus `OBJECT_TYPE=PAY`, groups by `OBJECT_NAME`, sorts top-level keys, and writes the Java-compatible schema.
- Test `build-decayed-db --refresh-satcat --force` sends conditional SATCAT headers from stored metadata, refreshes SATCAT before rebuilding when changed, and skips the decayed rebuild when SATCAT returns unchanged and a valid decayed DB already exists.
- Test `--dry-run` does not write generated data, metadata, temp files, or backups.
- Test server scheduling is disabled by default, uses importable Python functions when enabled, runs incremental mode only, refreshes SATCAT before scheduled decayed rebuilds, uses `json/.satellite_data_update.lock`, and does not block static/API serving.
- Test server startup with scheduling enabled checks the 24-hour freshness rule before any remote TLE query and still respects the 2-hour CelesTrak guard.

### Regression Coverage

- Keep the existing day/night unit tests passing.
- Add clear test names and failure messages.
- Avoid tests that depend on the current wall-clock time unless the time is explicitly injected.
- Keep browser smoke tests separate from deterministic unit tests.
- Test startup timing/deferred-work helpers.
- Test the `index.html` startup structure so first render starts before awaiting TLE setup.
- Test accordion headers, accessible accordion semantics, searchable satellite selector markup, timeline checkbox toggles, filter reset/status/empty state, and selected tag active styling.
- Test the menu toggle and time slider use ASCII-safe visible labels.

### Coverage Traceability Audit

- Audit every release entry in `PROMPT_History.md` before delivery and confirm each release-level behavior maps to an automated test, manual/integration check, or explicit limitation.
- Confirm prior-release coverage includes Version 1.5.21 selected-satellite details/source attribution, Version 1.5.22 Earth-centered frame/orbit math, Version 1.5.23 Mars mode, Version 1.6 Stars & Milky Way, Version 1.6.1 star catalog behavior, Version 1.6.2 integrated Solar System, Version 1.7 JPL-derived ephemeris, Version 1.7.1 filter/search consistency, Version 1.7.2 Debris/search-row/local Swagger UI and Markdown changes, Version 1.7.3 one-revolution 3D `Show Orbit`/`Time x` synchronization, Version 1.7.4 Python data maintenance plus scheduled server freshness checks, Version 1.7.5 latest launch/re-entry timeline anchoring, and Version 1.7.6 timeline data freshness, conditional data updates, and Re-entry Timeline startup-latency fixes.
- Expand shallow checks where a release only has a summary but no concrete automated, browser, manual, or server verification step.
- Document limitations when a behavior cannot be automated in this repository, including external browser rendering, optional live server checks, and unavailable source pages.

### Startup Performance

- Open `http://127.0.0.1:8000/index.html?perf=1`.
- Confirm `window.openbexiStartupPerformance.summary()` returns timing entries.
- Confirm `first-visible-globe-render` occurs before `satellite-data-ready`.
- Confirm `first-interactive-ui` occurs after TLE data is loaded and the satellite dropdown/filter state has been populated.
- Confirm the launch timeline button is temporarily disabled only while launch timeline data is being prepared, then opens and closes normally.
- Confirm the re-entry timeline button is temporarily disabled while confirmed decay data and decay estimates are prepared in chunks, then opens and closes normally.
- Confirm deferred timeline preparation does not break satellite selection from either timeline.
- Confirm the UTC clock and camera controls remain responsive while TLE and deferred timeline work is still preparing.

## Startup Regression

- Load `index.html` through the local HTTP server.
- Confirm the 3D globe renders.
- Confirm the first visible globe render occurs before all 15,728 TLE records have completed sprite setup.
- Confirm satellite markers render around the globe.
- Confirm the UTC clock updates.
- Confirm the left menu opens and closes with the menu button.
- Confirm the default filter state is:
  - Orbit: `MEO` selected.
  - Tags: `All tags` selected.
  - Debris category: not selected.
- Confirm the satellite count and satellite dropdown populate after TLE data loads.

## Menu UX Regression

- Compare the menu against the problem screenshot and confirm the red-circled menu toggle shows readable text such as `Close` or `Menu`, not corrupted characters.
- Confirm the time slider label is readable as `Time x` and is not obscured by the narrowed menu.
- Confirm headings, accordion labels, helper text, toggle icons, time slider labels, and menu buttons render without visible mojibake.
- Confirm the left menu is thinner than Version 1.5.1 but still usable on desktop and narrow viewports.
- Confirm the `Satellites Selection - Found` numeric count is red and bold in the Satellite Selection header.
- Confirm `Views & Time` and `Satellites Selection - Found` start expanded on every `index.html` load, even after previously changing accordion states.
- Confirm `Timelines`, `Share`, and `Help` start collapsed on every `index.html` load.
- Confirm the Settings accordion section is not present.
- Confirm multiple accordion sections can stay open at the same time.
- Confirm selecting filters, tags, the Debris category, timelines, and view toggles does not collapse unrelated accordion sections.
- Confirm the accordion order is `Views & Time`, `Satellites Selection - Found`, `Timelines`, `Share`, `Help`.
- Confirm `Satellite Selection` appears immediately under `Views & Time`.
- Confirm orbit/tag/debris filters appear inside `Satellites Selection - Found`.
- Confirm the visible orbit-filter helper text `Orbit filter (multi-select): Choose one or more orbit families. ALL enables every orbit category.` is gone.
- Confirm the visible satellite-search helper text `Select Satellite: Search by name, NORAD ID, orbit type, or tag.` is gone.
- Confirm the `Views & Time` section keeps `Globe` and `Mercator` on one row.
- Confirm the `Views & Time` section keeps `High Def.`, `ECEF Axes`, and `Day/Night` on one row.
- Confirm the `Views & Time` section does not contain the Starlink or ISS shortcut buttons.
- Confirm the `Satellite Selection` section keeps `Starlink (<NORAD ID>)` and `ISS` shortcut buttons below the search field.
- Confirm the `Views & Time` section includes a real menu `Time x` slider at the top.
- Confirm the existing canvas-top `Time x` slider remains visible.
- Move the menu `Time x` slider and confirm the canvas-top slider, displayed value, and simulation speed update.
- Move the canvas-top `Time x` slider and confirm the menu slider, displayed value, and simulation speed update.
- Confirm the satellite-specific checkbox block is hidden before selecting a satellite.
- Click `Starlink (<NORAD ID>)` in Satellite Selection and confirm the first loaded Starlink is selected, `Show only selected satellite` becomes checked, only that satellite remains visible, `High Def.` becomes checked, and the selected-satellite camera/model path matches normal satellite selection.
- Click `ISS` and confirm ISS/ZARYA NORAD `25544` is selected through the normal selection path, `Show only selected satellite` becomes checked, only ISS remains visible, and `High Def.` becomes checked because ISS is not MEO/GEO.
- Select a MEO or GEO satellite after High Def. is enabled and confirm the app does not force High Def. off.
- Select a satellite that is outside the current filter selection through a shortcut and confirm the selected satellite remains visible even though the filter list is different.
- After selecting a satellite, focus or click the satellite search field and confirm the previous selected label clears for a new search while the selected-satellite summary and selected marker/model remain active.
- After selecting a satellite, type or paste into the already-focused search field and confirm the previous selected label clears before the new query is entered.
- Confirm the satellite search result dropdown remains visible above the rest of the menu while open and does not get clipped by the accordion panel.
- Confirm Satellite Selection does not show the detailed selected-satellite metadata/TLE table after selection.
- Confirm the right-side selected-satellite detail panel appears under the UTC clock after selection, has a transparent background, matches the UTC clock width, shows independently expandable Satellite data and TLE details sections expanded by default using `<details open>`, shows metadata plus TLE line 1 and line 2 exactly once, and hides again when the selection is cleared.
- Confirm the Solar System planet HUD appears directly under the UTC clock after selecting a planet, exactly matches the UTC clock width and right edge, uses clock-compatible monospace typography, and wraps long ephemeris text inside the clock width.
- Select a Starlink model and confirm an expanded `Source detail` section appears after `TLE details` with bold red text: `Model downloaded from https://sketchfab.com/malacodart, license: CC Attribution / Creative Commons Attribution.`
- Select an ISS model and confirm an expanded `Source detail` section appears after `TLE details` with bold red text: `Model downloaded from https://github.com/nasa/NASA-3D-Resources, courtesy: NASA (National Aeronautics and Space Administration).`
- Select another model without explicit attribution and confirm no `Source detail` section is shown.
- Select ISS, enable `Yaw-Pitch-Roll`, move the `Yaw` slider, and confirm it drives the orientation behavior previously associated with ISS pitch.
- Select ISS, move the `Pitch` slider, and confirm it drives the orientation behavior previously associated with ISS yaw.
- Confirm ISS `Roll` behavior is unchanged and Starlink/other selected models still use the normal yaw/pitch/roll mapping.
- Confirm `SSL_1300.glb` loads for `INTELSAT 20 (IS-20)` and `INTELSAT 18 (IS-18)` only, not for other Intelsat, SSL, GEO, GOES, SES, manufacturer, bus, or alias matches.
- Confirm the Starlink shortcut label updates to `Starlink (<NORAD ID>)` after TLE data loads.
- Confirm the Starlink shortcut shows `Starlink unavailable` if no Starlink target can be resolved.
- Confirm the ISS shortcut shows `ISS unavailable` if no ISS target can be resolved.
- Confirm `Timelines` appears immediately after `Satellites Selection - Found`.
- Confirm `Share` appears immediately after `Timelines` and immediately before `Help`.
- Historical 1.7.6 check: confirm `Close`, the version label, and the server status icon/text are aligned on one compact row on desktop. Current version text is generated from `release/version.json`.
- Confirm the version/GitHub text is centered in the menu header.
- Confirm the server status indicator appears above the accordion menu and does not shift layout when changing between checking, offline, connected, and error states.
- Confirm connected status uses `power_green.png` and offline/error status uses `power_red.png`.
- Confirm the status panel shows server URL, connection state, data source, version values, last load time, and reconnect/refresh.
- Confirm `Copy Link` produces a URL that restores supported state after data loads.
- Confirm native share is enabled only when the browser supports it.
- Open Help and confirm the `GitHub`, `README`, `Releases History`, `Licenses`, `Swagger`, `Swagger MD`, and `Live API` actions are readable and clickable.
- Click `README` and confirm a separate `markdown_viewer.html?source=README.md&title=README` page renders the README as Markdown, not as raw plain text.
- Click `Releases History` and confirm a separate `markdown_viewer.html?source=RELEASE_NOTES.md&title=Releases%20History` page renders `RELEASE_NOTES.md` as Markdown, not as raw plain text.
- Confirm no visible Help action uses the old `Prompt History` label.
- Open Help while the Python server is disconnected and confirm `Swagger` opens `swagger.html` without requiring the server.
- Open Help while the Python server is disconnected and confirm `Swagger MD` opens `markdown_viewer.html?source=SWAGGER.md&title=Swagger%20API` without requiring the server.
- Open Help while the Python server is connected and confirm `Live API` opens the connected server `/openapi.json` page.
- Confirm the GitHub Help link opens in a new tab, README and Releases History use `markdown_viewer.html`, and the license link opens the relative `LICENSE.md` page.
- Confirm the `Licenses` action opens `LICENSE.md`.
- Confirm Help does not display the prohibited concatenated Swagger/API sentence.
- Confirm the Help disclaimer is readable at the current menu width and on narrow screens.

## Version 1.5.6 Manual Regression

- Load `http://127.0.0.1:8000/index.html`.
- Open the `Satellite Selection` accordion section.
- Search for `INTELSAT`.
- Select `INTELSAT 902 (IS-902)`.
- Confirm the autocomplete dropdown closes immediately after selection.
- Confirm the selected satellite remains visible in the search field and selected-satellite summary.
- Click `Show Orbit` and confirm it toggles without obstruction from the closed dropdown.
- Click `Show Footprint` and confirm it toggles without obstruction from the closed dropdown.
- Search again, press `Escape`, and confirm the dropdown closes without changing the selected satellite.
- Search again, press `Tab`, and confirm focus moves normally and the dropdown closes.
- Search again, click outside the selector, and confirm the dropdown closes.
- Click `Clear` and confirm search/filter behavior still works.
- Enable `Show Orbit` for the selected satellite.
- Confirm only one complete 3D orbit revolution is visible around Earth.
- Set `Time x = 0` and confirm the selected orbit remains stable without accumulating duplicate trails.
- Increase `Time x`, wait for the simulation time to advance, and confirm the displayed orbit remains synchronized with the selected satellite and still shows only one revolution.
- Rotate the 3D camera until part of the selected red orbit should pass behind Earth.
- Confirm the behind-Earth orbit arc is hidden by Earth.
- Confirm the front-side selected orbit arc remains visible.
- Confirm no red orbit segment appears across Earth unless it is physically in front of the globe from the current camera viewpoint.
- Repeat the orbit-occlusion check with at least one LEO satellite, one MEO satellite, and one GEO satellite.
- Confirm beam, footprint, satellite marker, Earth rendering, filters, timelines, YPR controls, and view controls still work.
- Confirm dense panels, satellite metadata, and search results scroll internally after menu narrowing.
- Confirm the vertical tab rail is gone.
- Confirm the left menu shows stacked accordion sections for Views & Time, Satellites Selection - Found, Timelines, Share, and Help.
- Confirm each accordion header keeps the legacy dark navy/blue style and colored left accent.
- Confirm expanded accordion headers are readable, especially `Satellites Selection - Found` on initial page load.
- Confirm the numeric satellite count in `Satellites Selection - Found` is red and bold.
- Confirm the menu is visibly thinner than Version 1.5.4 while filters, reset button, search, YPR sliders, timeline checkboxes, metadata, and view controls remain usable.
- Confirm the time slider remains readable and unobscured after the menu narrowing.
- Confirm the expanded header chevron/toggle marker remains visible.
- Confirm collapsed accordion headers remain readable.
- Confirm every section is collapsed immediately after loading `index.html`.
- Expand `Views & Time`, expand `Timelines`, then expand `Share`; confirm multiple sections remain open simultaneously.
- Expand one section and confirm no other section collapses.
- Change filters, reset filters, select a satellite, clear satellite search, toggle YPR, toggle view controls, and toggle timeline checkboxes; confirm accordion state is not reset.
- Collapse and expand sections, refresh, and confirm every section returns to the collapsed launch state.
- Confirm accordion focus outlines are visible and Enter/Space toggles each section header.
- Confirm the menu remains usable on a narrow viewport with stacked accordion sections and no clipped section labels.
- Confirm no filter or tag control named `Active` remains.
- Confirm `Active` does not reappear after changing orbit/debris filters and regenerating tag chips from satellite data.
- Confirm selected tag chips use the brighter blue metallic/light active style.
- Confirm `Reset Filters` restores Orbit `MEO`, Tags `All tags`, and Debris `Show`.
- Confirm the active-filter summary updates after each filter change.
- Choose a filter combination with zero results and confirm the empty state appears with a reset shortcut.
- Confirm `Other Selections` is absent.
- Confirm selecting `Earth`/`Moon`/`Mars` from Solar System mode is not reset by collapsing or expanding accordion sections.

## Satellite Search Regression

- Expand the `Satellite Selection` accordion section.
- Confirm the `Select Satellite` search field appears between the `Satellite Selection` heading and the satellite-specific checkboxes.
- Search by satellite name.
- Search by NORAD ID.
- Search by orbit type such as `GEO`, `MEO`, or `LEO`.
- Search by company/tag such as `Starlink`, `One Web`, `SES`, or `Intelsat`.
- Use Arrow Down, Arrow Up, Enter, Escape, and Tab with the search field.
- Confirm a no-results message appears for a query with no matches.
- Use the clear action and confirm the search query is reset.
- Select a satellite from search and confirm satellite info, selected marker/model behavior, selected summary, orbit, and Mercator selected state still work.
- Confirm selecting a satellite from search checks `Show only selected satellite` and leaves only the selected satellite visible.
- Confirm selecting a non-MEO/GEO satellite from search checks `High Def.`.
- Select a satellite from a timeline and confirm the search field and selected summary reflect that selection.
- Confirm selecting a satellite from a timeline also checks `Show only selected satellite` and uses the same camera/model behavior as the main selector.
- Enable `Yaw-Pitch-Roll`, move yaw, pitch, and roll sliders away from zero, then select a satellite from search and confirm the sliders remain visible and keep their values.
- With `Yaw-Pitch-Roll` enabled, select a satellite from a timeline and confirm the `Satellite Selection` accordion section remains or becomes expanded without collapsing any other open section.
- Switch between two satellites while `Yaw-Pitch-Roll` is enabled and confirm the sliders remain visible, usable, and unchanged.

## Timeline Checkbox Regression

- Confirm `Show Launch Timeline` and `Show Re-entry Timeline` appear in the `Timelines` accordion section immediately after Filters.
- Confirm both timeline controls are checkboxes, not buttons.
- Check `Show Launch Timeline` and confirm the launch timeline opens.
- While launch is checked, check `Show Re-entry Timeline` and confirm launch unchecks and the launch HUD hides.
- Uncheck `Show Launch Timeline` and confirm the launch timeline hides.
- Check `Show Re-entry Timeline` and confirm the re-entry timeline opens.
- While re-entry is checked, check `Show Launch Timeline` and confirm re-entry unchecks and the re-entry HUD hides.
- Uncheck `Show Re-entry Timeline` and confirm the re-entry timeline hides.
- Confirm only one timeline HUD is visible at a time.
- Confirm checkbox state always matches HUD visibility.
- Reload the app and confirm timeline loading/deferred startup states are clear while data is preparing.
- Confirm disabled timeline checkboxes cannot be toggled while timeline data is not ready.

## Timeline Latest Event Regression

- Check `Show Launch Timeline` and confirm the HUD status identifies the latest valid launch date and satellite from the currently loaded dataset.
- Confirm the Launch Timeline detail viewport opens around that latest launch and the latest launch marker/label is visibly highlighted.
- Confirm invalid, missing, `N/A`, or clearly malformed launch dates are skipped without breaking the timeline.
- Click the highlighted latest launch event and confirm it selects the matching active satellite when that satellite exists in the active TLE list.
- Check `Show Re-entry Timeline` and confirm the HUD status identifies the latest valid confirmed or predicted decay event from active satellite decay estimates plus local/server decayed records.
- Confirm the Re-entry Timeline detail viewport opens around that latest decay event and the latest re-entry marker/label is visibly highlighted.
- Confirm tooltip/details for the latest decayed record include satellite/object name, NORAD catalog ID, object ID, object type, launch date, launch site, and decay date when available.
- Confirm a decayed record that is no longer present in active TLE data can still be clicked and displayed in the right-side details panel without trying to render, propagate, or show active-satellite controls for it.
- Run the timeline freshness automated tests to confirm latest-date detection and invalid-date handling do not depend on wall-clock timeline ranges.

## Filter UI Regression

### Orbit Filter

- Select and deselect `GEO`, `MEO`, `LEO`, `HEO`, and `Other`.
- Select `ALL` and confirm all orbit categories are active and the satellite count/dropdown reflect all orbit categories.
- With `ALL` active, click a specific orbit category and confirm `ALL` clears and the specific category becomes the narrowed selection.
- Confirm multiple orbit buttons can be active at the same time.
- Confirm changing orbit filters updates:
  - Satellite count.
  - Visible satellite markers.
  - Satellite dropdown options.
  - Available tag chips.
- Confirm `MEO` alone shows MEO satellites.
- Confirm `LEO` alone shows LEO satellites.
- Confirm `GEO` alone shows GEO satellites.
- Confirm `HEO` and `Other` do not break the app even when no matching satellites are present.

### Tag Filter

- Confirm tags render as compact pill chips.
- Confirm `All tags` is active by default.
- Select a specific tag such as `Starlink`, `One Web`, `SES`, `Intelsat`, `Weather`, or `Iridium`.
- Confirm selecting a specific tag clears `All tags`.
- Confirm selecting `All tags` clears other tag selections.
- Confirm multiple tags can be selected at the same time.
- Confirm tag combinations update the satellite count, visible markers, and dropdown.

### Debris Category Filter

- Confirm no standalone debris filter row or `Show`, `Hide`, `Debris only` buttons appear.
- Confirm the orbit/category row order is `ALL`, `GEO`, `MEO`, `LEO`, `HRO`, `Debris`, `Others`.
- Confirm selecting `Debris` shows only debris candidates such as names containing `DEB`, `DEBRIS`, `R/B`, `ROCKET BODY`, or `STAGE`.
- Confirm selecting `Debris` updates the satellite count, visible search dropdown, hidden legacy select, and visible markers from the canonical filtered list.
- Confirm switching away from `Debris` preserves a valid tag selection or safely returns to `All tags` when the selected tag is no longer available.

## Cross-Filter Regression

- Test `LEO` plus `Starlink`.
- Test `LEO` plus `One Web`.
- Test `GEO` plus `SES`.
- Test `GEO` plus `Intelsat`.
- Test `MEO` plus `Galileo`.
- Test multiple orbit selections plus multiple tag selections.
- Test `Debris` alone and after switching from each orbit/tag combination above.
- Test `Reset Filters` after `Debris`, active search text, and specific tag selections.
- Confirm no JavaScript errors appear in the browser console.

## Existing Feature Regression

- Toggle `Globe` off and on.
- Toggle `Mercator` on and off.
- Toggle `High Def.` texture on and off.
- Toggle `ECEF Axes` on and off.
- Toggle `Day/Night` on and off.
- Select a satellite from the dropdown and confirm:
  - Satellite info updates.
  - Selected marker is highlighted.
  - The selected marker remains visible while any detailed model is still loading.
  - If a detailed model fails or has no local mapping, the selected marker remains visible and selected.
  - In 3D mode, the camera smoothly frames the selected satellite in the foreground with Earth centered behind it.
  - The close selected-satellite view does not clip through the satellite or Earth.
  - Manual orbit/zoom/pan controls work after the automatic transition completes.
  - Camera navigation still works.
  - Orbit display still works when enabled.
  - Enabling `Show orbit` does not create console warnings about non-finite orbit vertices.
  - If propagation becomes invalid for a satellite, the orbit path stops or splits instead of drawing through Earth.
  - For GEO satellites such as `INTELSAT 10-02`, the orbit path keeps a plausible GEO radius but Earth occludes any portion behind the globe.
- Select representative satellites with known local models and confirm the detailed model appears:
  - A `Starlink` satellite loads the Starlink model from `obj/`, appears centered, and is visually large enough to inspect.
  - A `OneWeb` satellite loads the OneWeb OBJ/MTL model from `obj/`.
  - An `O3b`/`OB3` satellite loads `obj/o3b.glb` as the detailed model and uses the selected sprite fallback only if the GLB is unavailable.
  - `ISS` loads the ISS GLB model from `obj/` when available in the filtered selection.
  - `ISS` visually uses the corrected orbital orientation: `+X` velocity, `+Y` pitch axis nadir toward Earth, and `+Z` right-handed negative cross-track.
  - ISS selected-model diagnostics report `orientationMode: "iss-velocity-pitch-nadir-frame"` plus yaw, pitch, roll, and pitch-axis Earth-facing calibration values.
  - From at least two camera angles, ISS remains inspectable and Earth remains visible in the initial selected view.
  - A GOES/Intelsat/SES-style GEO satellite loads the SSL 1300 fallback model when applicable.
  - For SSL 1300 / INTELSAT 18 and INTELSAT 20, the detailed model root sits directly on the selected red orbit trajectory without visible offset.
  - With `?orbitAlignDebug=1`, selected detailed model diagnostics report propagated ECI/TEME position, model world position, sprite world position, nearest orbit-line point distance, scene scale, and alignment tolerance.
- Confirm selecting a satellite with a detailed model lowers near-plane clipping enough that the model is not clipped when the camera is close.
- Confirm the selected-model fill light makes the model visible even when asset materials or texture lighting are weak.
- Confirm the selected-model diagnostics in the console report mesh count, bounding diameter, scale, attempted asset paths, and visibility status.
- Select a satellite with no model mapping and confirm the sprite fallback remains visible.
- Switch between two satellites quickly and confirm the app never displays a model for the previously selected satellite.
- Toggle `Show Footprint`.
- Toggle `Show only selected satellite`.
- Select a satellite after manually unchecking `Show only selected satellite` and confirm the checkbox is checked again automatically.
- Toggle `Orbit Frame (LVLH)`.
- Toggle `Yaw-Pitch-Roll` and move yaw, pitch, and roll sliders; confirm the selected model and YPR frame remain coherent with nadir/Earth-facing orientation.
- Switch to Mercator-only mode, select a satellite, and confirm the selected satellite is clearly highlighted without triggering 3D camera-distance behavior.
- With a selected detailed 3D model visible, switch to Mercator and confirm the selected satellite marker and ground track still render even though the 3D sprite is hidden.
- With `Show Footprint` enabled, confirm the selected Mercator ground track remains visible above or clearly through the footprint overlay.
- Toggle `Show orbit` off and confirm the 3D orbit is removed and the Mercator ground track stops drawing.
- Select a satellite in Mercator-only mode, turn the 3D globe back on, and confirm the selected-satellite close framing is applied.
- Use Solar System mode to select `Moon`, then select `Earth`; confirm filters return to the default startup state.
- Use Solar System mode to select `Mars`, then select `Earth`; confirm filters return to the default startup state.
- Open and close the launch timeline.
- Open and close the re-entry timeline.
- Select a satellite from a timeline and confirm the app resets filters broadly enough to reveal that satellite.

## Domain Regression

- Select a representative LEO satellite and confirm:
  - Its marker position updates smoothly.
  - Its 3D orbit trail passes through or very near the marker at the simulation time.
  - Its footprint is plausible for a low Earth orbit.
  - Selected-satellite framing keeps Earth centered behind the satellite and remains readable.
  - High Def. is automatically enabled when it was previously off.
- Select a representative MEO satellite and confirm:
  - Its altitude and orbit radius are visually between LEO and GEO.
  - Its orbit trail remains aligned with the marker.
  - Its footprint is larger than LEO and smaller than GEO.
  - Selected-satellite framing keeps Earth centered behind the satellite and remains readable.
  - High Def. is not forced off if it was already enabled.
- Select a representative GEO satellite and confirm:
  - It remains near a fixed longitude in Mercator view.
  - Its orbit trail is visually consistent with an equatorial/geosynchronous path.
  - Its footprint is wider than LEO/MEO and remains finite.
  - Selected-satellite framing keeps Earth centered behind the satellite and remains readable.
  - High Def. is not forced off if it was already enabled.
- Confirm the Sun/day-night terminator changes as simulation time advances.
- Confirm the Moon appears at the documented distance and follows the documented model.
- Confirm Mars appears with optimized runtime texture `textures/March_8k.jpg`, remains visually centered in Mars mode, and follows the documented simplified model.

## Visual Regression

- Confirm the filter panel matches the intended dark compact design:
  - Orbit and debris controls use segmented buttons.
  - Tags use pill chips.
  - Text remains readable.
  - Chips wrap cleanly inside the menu.
  - No controls overlap at desktop width.
- Resize the browser to a narrower viewport and confirm the menu remains usable with no clipped text in buttons or chips.

## Browser Smoke Test

Run the app through a local HTTP server and verify the browser runtime, not only static syntax.

- Start a local server:

```powershell
py -m http.server 8000 --bind 127.0.0.1
```

- Load `http://127.0.0.1:8000/index.html`.
- Confirm there are no console errors during startup.
- Capture or inspect the rendered page and confirm:
  - 3D globe is nonblank.
  - Satellite markers render.
  - Menu renders with the expected controls.
  - UTC clock updates.
  - Filter interactions update counts and dropdown entries.
- Exercise at least these browser interactions:
  - Switch `MEO` to `LEO`.
  - Select `Starlink`.
  - Switch orbit/category filter to `Debris`.
  - Click `Clear`, then `Reset Filters`, and confirm the reset button is immediately after `Clear`.
  - Select one satellite and enable orbit display.
  - Confirm selecting the satellite auto-checks `Show only selected satellite`, leaves only the selected object visible, and keeps the selected satellite active after clearing the search field for a new query.
  - Confirm selecting a LEO/Starlink/ISS satellite auto-checks `High Def.` and selecting MEO/GEO afterward does not force High Def. off.
  - Confirm the 3D orbit path has no visible line through Earth caused by invalid propagation samples.
  - Select a Starlink satellite and confirm a local detailed model appears.
  - Confirm the Starlink detailed model is visually centered, close to the camera, uses the reference-image orientation, has Earth/horizon behind and below it instead of centered directly behind it, and remains visible while moving.
  - Confirm the selected-model camera/observer eye is using the 100 m default distance in the console `selectedView` diagnostics.
  - Confirm the selected Starlink diagnostics report `observerPlacement: "starlink-oblique-orbital-frame"` and orientation mode `starlink-velocity-nadir-frame`.
  - Confirm the Starlink shortcut label includes the resolved NORAD ID.
  - Select ISS from the shortcut and confirm the selected ISS diagnostics report `orientationMode: "iss-velocity-pitch-nadir-frame"` and the ISS model keeps local `+Y`/pitch pointed to Earth while local `+X` follows velocity.
  - Open Help and confirm GitHub, README, Releases History, Licenses, Swagger, Swagger MD, Live API, and the disclaimer are present.
  - Click README and Releases History and confirm each document renders as Markdown in the Help panel.
  - Open Share and confirm Copy Link creates a safe share URL.
  - Open Help and confirm local Swagger UI and companion Swagger Markdown docs open separate pages even when the Python server is not running.
  - Confirm mouse orbit shows different faces of the selected model and zoom changes observer distance without losing centering.
  - Select a satellite without a model mapping and confirm the selected sprite stays visible.
  - Rapidly select two different satellites and confirm stale model loads do not attach to the scene.
  - Toggle Mercator view.
  - Confirm the selected satellite has a visible Mercator selection ring.
  - Confirm the selected satellite ground track remains visible in Mercator when the detailed 3D model hides the sprite.
  - Select `ALL` in the Orbit filter and confirm all orbit categories populate the count and dropdown.
  - Confirm there is no `Active` filter button/control.
  - Toggle Globe off, select a satellite in Mercator-only mode, then toggle Globe on and confirm 3D selected-satellite framing.
  - Toggle Yaw-Pitch-Roll on and off.

## Python Server Smoke Test

Start the optional server:

```powershell
py server.py --host 127.0.0.1 --port 8000
```

Then check:

```text
http://127.0.0.1:8000/api/health
http://127.0.0.1:8000/api/version
http://127.0.0.1:8000/api/tle
http://127.0.0.1:8000/docs
http://127.0.0.1:8000/openapi.json
http://127.0.0.1:8000/index.html
markdown_viewer.html?source=SWAGGER.md&title=Swagger%20API
swagger.html
```

Expected:

- `index.html` loads from the Python server.
- The status icon changes from checking to connected.
- Satellite data source shows local files after initial load because startup bootstraps from the static `json/tle/TLE.json` route before checking the optional server.
- The reconnect/refresh action loads validated live server data from `/api/tle` and then labels the data source as live server.
- When `index.html` is served from a different local static or IDE host with no API routes, the status check retries `http://127.0.0.1:8000` and connects to the Python server before switching to offline mode.
- Swagger/API docs links open separate local UI, local Markdown companion, and live API documentation pages from Help.
- If the server is stopped and the page is refreshed, the app returns to local/offline data behavior.

## Isolated Model Viewer Check

Use `display_satellite.html` to validate local model assets independent of TLE propagation and selected-satellite scene logic.

- Start a local server:

```powershell
py -m http.server 8000 --bind 127.0.0.1
```

- Open:

```text
http://127.0.0.1:8000/display_satellite.html
```

- Confirm the manifest-backed list loads from `json/display_satellite_models.json` and includes the configured standalone viewer models under `obj/`: Starlink V1, Starlink V2, OneWeb, O3b, ISS, and SSL 1300.
- Confirm the default `obj/starlink_V1.obj` loads with either its MTL material or fallback material.
- Use search to filter the model list, then load the Starlink OBJ/MTL model and at least one GLB model from `obj/`.
- Confirm diagnostics update with asset path, required files, texture count, mesh/material count, triangle count, bounds, diameter, and load warnings.
- Confirm `SSL_1300.glb` is visible after selection and diagnostics show the original diameter plus display scale normalization.
- Use the custom model field with examples such as `ISS.glb`, `starlink_V1`, `starlink_v2.glb`, or `oneweb.glb` and confirm local assets can be loaded without changing code.
- Confirm each loaded model is centered, lit, nonblank, and orbit/zoom plus reset/auto-fit/wireframe/grid/axes controls work.
- Compare this isolated view with selecting the matching satellite in `index.html`; both should show a visible model.
- In `index.html`, select an older Starlink such as `STARLINK-1008` and confirm it resolves to `starlink_V1`; select a 30xxx Starlink such as `STARLINK-30107` and confirm it resolves to `starlink_v2.glb`.

## Completion Checklist

Before reporting completion, go through this file and record which checks were performed.

- `npm test` passes.
- JavaScript syntax checks pass for all `js/*.js`.
- Extracted module syntax checks pass for `index.html` and `display_satellite.html`.
- Deep automated tests cover the coordinate-frame, orbit, Sun, Moon, scaling, selected-satellite model resolution, selected-satellite framing/orientation, footprint, menu, and URL-helper requirements above.
- Automated tests cover Starlink OBJ visual bounds, selected camera distance behavior for exact 100 m target framing, deterministic satellite-visibility projection checks, Starlink velocity/nadir orientation, and oblique non-radial observer placement.
- Browser smoke test over HTTP passes.
- Isolated `display_satellite.html` local model viewer checks pass for manifest coverage, Starlink OBJ/MTL default, GLB models, diagnostics, and a custom entry.
- Filter UI regression passes.
- Existing feature regression passes.
- Domain regression passes or any intentional approximation is documented.
- Visual regression passes on desktop and a narrower viewport.
- Any test not performed is listed with a reason.

## Release 1.4.1 Verification Log

Checks performed on 2026-06-03:

- `npm test`: passed, including `modelResolver.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --check`: passed.
- Local HTTP smoke check with `py -m http.server 8000 --bind 127.0.0.1`: `http://127.0.0.1:8000/index.html` returned `HTTP 200 OK`.

Checks not fully performed in this terminal:

- Interactive browser visual checks for selecting Starlink, OneWeb, O3b, ISS, SSL 1300 fallback, no-model fallback, and rapid selection switching. No headless browser executable was available on `PATH`, so these remain manual browser verification items.

## Release 1.4.2 Verification Log

Checks performed on 2026-06-03:

- `npm test`: passed, including `modelVisualFraming.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `node --check .\tests\modelVisualFraming.test.js`: passed.
- Extracted `index.html` module script plus `node --check`: passed.
- Extracted `display_satellite.html` module script plus `node --check`: passed.
- Local HTTP smoke check with `py -m http.server 8000 --bind 127.0.0.1`: `http://127.0.0.1:8000/index.html` returned `HTTP 200 OK`.
- Local HTTP smoke check with `py -m http.server 8000 --bind 127.0.0.1`: `http://127.0.0.1:8000/display_satellite.html` returned `HTTP 200 OK`.

Checks re-run after the generic `display_satellite.html` model selector update on 2026-06-03:

- `npm test`: passed, including `modelVisualFraming.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --check`: passed.
- Extracted `display_satellite.html` module script plus `node --check`: passed.
- Local HTTP smoke check with `py -m http.server 8000 --bind 127.0.0.1`: `http://127.0.0.1:8000/index.html` returned `HTTP 200 OK`.
- Local HTTP smoke check with `py -m http.server 8000 --bind 127.0.0.1`: `http://127.0.0.1:8000/display_satellite.html` returned `HTTP 200 OK`.

Checks not fully performed in this terminal:

- Interactive visual confirmation that selecting Starlink, OneWeb, O3b, ISS, and SSL 1300 mapped satellites in `index.html` shows the detailed model close to the camera with Earth behind it. No headless browser executable was available on `PATH`, so these remain manual browser verification items.
- Interactive visual confirmation that `display_satellite.html` renders nonblank selected OBJ/MTL and GLB models. The page is present and served over HTTP, but direct visual inspection requires a browser.

## Release 1.4.3 Verification Log

Checks performed on 2026-06-03:

- `npm view three version`: returned `0.184.0`.
- `PROMPT_Instructions.md` contains the `General Execution Prompt` section and no release history.
- `PROMPT_History.md` contains the latest `Release Date: 2026-06-03 Version 1.4.3` entry.
- `index.html` visible version tag was updated to `1.4.3`.
- Historical 1.7.6 behavior used unpkg and `node_modules` fallbacks. Version 2.0 runtime artifacts use integrity-checked files under `vendor/`, and `dist/` must remain local-only.
- `npm test`: passed, including `releaseStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `node --check .\tests\releaseStructure.test.js`: passed.
- Extracted `index.html` module script plus `node --check`: passed.
- Extracted `display_satellite.html` module script plus `node --check`: passed.
- Local HTTP smoke check with `py -m http.server 8000 --bind 127.0.0.1`: `http://127.0.0.1:8000/index.html` returned `HTTP 200 OK`.
- Local HTTP smoke check with `py -m http.server 8000 --bind 127.0.0.1`: `http://127.0.0.1:8000/display_satellite.html` returned `HTTP 200 OK`.

Checks not fully performed in this terminal:

- Historical note: the old CDN/`node_modules` fallback check is superseded by the v2.0 vendored-dependency and browser-artifact tests.

## Release 1.4.4 Verification Log

Checks performed on 2026-06-03:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-03 Version 1.4.4` entry.
- `index.html` visible version tag was updated to `1.4.4`.
- `npm test`: passed, including `orbitGeneration.test.js`, `mercatorGroundTrack.test.js`, and `releaseStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --input-type=module --check`: passed.
- Extracted `display_satellite.html` module script plus `node --input-type=module --check`: passed.
- Local HTTP smoke check with `py -m http.server 8000 --bind 127.0.0.1`: `http://127.0.0.1:8000/index.html` returned `HTTP 200 OK`.
- Local HTTP smoke check with `py -m http.server 8000 --bind 127.0.0.1`: `http://127.0.0.1:8000/display_satellite.html` returned `HTTP 200 OK`.

Checks not fully performed in this terminal:

- Interactive browser confirmation that `Show orbit` visually avoids lines through Earth for invalid/decayed satellites and that the Mercator ground track remains visible while a detailed 3D model hides the selected sprite. The automated tests cover the path-generation and selected-state logic, but direct visual confirmation remains a manual browser verification item.

## Release 1.4.5 Verification Log

Checks performed on 2026-06-03:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-03 Version 1.4.5` entry.
- `index.html` visible version tag was updated to `1.4.5`.
- `npm test`: passed, including `orbitGeneration.test.js`, `mercatorGroundTrack.test.js`, `menuState.test.js`, and `releaseStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --input-type=module --check`: passed.
- Extracted `display_satellite.html` module script plus `node --input-type=module --check`: passed.
- Local HTTP smoke check with `py -m http.server 8000 --bind 127.0.0.1`: `http://127.0.0.1:8000/index.html` returned `HTTP 200 OK`.
- Local HTTP smoke check with `py -m http.server 8000 --bind 127.0.0.1`: `http://127.0.0.1:8000/display_satellite.html` returned `HTTP 200 OK`.
- `git diff --check` on the touched release files reported only existing line-ending normalization warnings.

Checks not fully performed in this terminal:

- Interactive browser confirmation that `INTELSAT 10-02` GEO orbit depth occlusion looks correct from several camera angles remains manual. The automated tests verify that the GEO radius stays physically plausible and that the selected orbit line uses normal depth testing/render order, but screenshot-level visual confirmation requires a browser.
- Interactive browser confirmation that the Mercator selected ground track remains visible with footprint overlays enabled remains manual. Automated tests cover the stationary-GEO fallback segment and selected-track redraw path.

## Release 1.5 Verification Log

Checks performed on 2026-06-03:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-03 Version 1.5` entry.
- `index.html` visible version tag was updated to `1.5`.
- `npm test`: passed, including `startupPerformance.test.js`, `startupStructure.test.js`, and `releaseStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `Get-ChildItem -File .\tests -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --input-type=module --check`: passed.
- Extracted `display_satellite.html` module script plus `node --input-type=module --check`: passed.
- Local HTTP smoke check with `py -m http.server 8000 --bind 127.0.0.1`: `http://127.0.0.1:8000/index.html` returned `HTTP 200 OK`.
- Headless Chrome DevTools timing check loaded `http://127.0.0.1:8000/index.html?perf=1` and reached `first-interactive-ui`.

Performance measurements from the final headless Chrome run:

- Pre-change baseline lower bound: in Version 1.4.5, `animate()` was called only after `setupTLESatellites`, `loadConfirmedDecays`, `computeDecayEstimates`, launch timeline initialization, and re-entry timeline initialization. In the Release 1.5 timing run, satellite data alone completed at `37.63 s` after module start, so the previous first visible render was blocked until at least `>37.63 s`, plus decay and timeline work.
- Release 1.5 `first-visible-globe-render`: `1.47 s` after module start (`8.46 s` from navigation start in this headless run).
- Release 1.5 `window-load`: `2.46 s` after module start.
- Release 1.5 `satellite-data-ready`: `37.63 s` after module start for `15,728` TLE records.
- Release 1.5 `first-interactive-ui`: `37.65 s` after module start for `15,728` TLE records.

Checks not fully performed in this terminal:

- Full interactive visual regression for filters, selected models, orbit display, Mercator, launch timeline, and re-entry timeline remains manual. Headless Chrome verified startup timing and first-interactive reachability, but it did not perform screenshot-level visual inspection or all UI interactions.
- Browser console was not exhaustively captured during the timing run. Automated syntax/tests passed and the headless page reached `first-interactive-ui`.

## Release 1.5.1 Verification Log

Checks performed on 2026-06-03:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-03 Version 1.5.1` entry.
- `index.html` visible version tag was updated to `1.5.1`.
- `npm test`: passed, including `menuUx.test.js`, `startupPerformance.test.js`, `startupStructure.test.js`, and `releaseStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `Get-ChildItem -File .\tests -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --input-type=module --check`: passed.
- Extracted `display_satellite.html` module script plus `node --input-type=module --check`: passed.
- `git diff --check`: passed with only existing LF-to-CRLF normalization warnings.
- Local HTTP smoke check with `py -m http.server 8000 --bind 127.0.0.1`: `http://127.0.0.1:8000/index.html` returned `HTTP 200 OK`.
- Headless Chrome DevTools runtime check reached `first-interactive-ui`, found 6 menu tabs, confirmed active tab `menuTabFilters`, confirmed the satellite search input exists, confirmed launch and re-entry timeline controls are `checkbox`, and confirmed visible version text `version 1.5.1 - hosted at GitHub Repo`.
- Headless Chrome DevTools search check queried `MEO` after `first-interactive-ui`; the search combobox expanded and returned 40 visible result options.

Checks not fully performed in this terminal:

- Full visual inspection of the tab rail, blue metallic chip styling, narrow viewport behavior, and manual keyboard navigation remains a browser/manual verification item. Static tests validate the markup/CSS hooks and headless Chrome validates runtime presence, but screenshot-level visual quality requires a visible browser.
- Full click-through of all domain behaviors after the menu redesign remains manual: detailed model loading, orbit visual rendering, Mercator visual state, footprints, and timeline satellite selection.

## Release 1.5.2 Verification Log

Checks performed on 2026-06-03:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-03 Version 1.5.2` entry.
- `index.html` visible version tag was updated to `1.5.2`.
- Automated mojibake scan across `index.html`, `css/style.css`, `js/SatelliteMenuLoader.js`, `js/ganttTimelineLoader.js`, `js/reentryTimeline.js`, `README.md`, `Test_and_Integration.md`, and generated menu markup: passed with no matches.
- `npm test`: passed, including `encodingUx.test.js`, `menuUx.test.js`, `startupPerformance.test.js`, `startupStructure.test.js`, and `releaseStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `Get-ChildItem -File .\tests -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --check`: passed.
- Extracted `display_satellite.html` module script plus `node --check`: passed.
- `git diff --check`: passed with only existing LF-to-CRLF normalization warnings.
- Local HTTP smoke check with `py -m http.server 8765 --bind 127.0.0.1`: `http://127.0.0.1:8765/index.html` returned `HTTP 200 OK`.
- Headless Chrome desktop screenshot check at `1280x900`: confirmed readable `Close` menu button, `Time x` label, visible `version 1.5.2`, thinner menu, no visible mojibake, and tab order `Filters`, `Satellite`, `View`, `Timelines`, `Other`, `Settings`.
- Headless Chrome narrow screenshot check at `500x900`: confirmed the time slider is readable and unobscured above the menu, the menu starts below the top controls, and the horizontal tab rail remains usable.
- Resume validation after final narrowing to a `420px` menu and `72px` tab rail: `npm test`, JavaScript syntax checks for `js/` and `tests/`, extracted HTML module syntax checks, `git diff --check`, and the local HTTP smoke check all passed.

Checks not fully performed in this terminal:

- Full interactive visible-browser click-through for timeline exclusivity remains manual. Static and automated tests verify the checkbox exclusivity wiring and timeline handle visibility APIs, but the actual HUD show/hide visual interaction should still be checked in a browser.
- Full interactive visible-browser click-through for Yaw/Pitch/Roll persistence remains manual. Static and automated tests verify that satellite selection reopens the Satellite Selection section and does not reset slider values, but model orientation and slider usability should still be checked in a browser with a selected satellite.

## Release 1.5.3 Verification Log

Checks performed on 2026-06-03:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-03 Version 1.5.3` entry.
- `index.html` visible version tag was updated to `1.5.3`.
- The generated menu markup no longer contains the vertical tab rail, `role="tablist"`, `role="tab"`, `role="tabpanel"`, or `data-tab-target`.
- The generated menu markup uses stacked accordion sections with `role="button"`, `aria-controls`, and `aria-expanded` on section headers.
- Static tests verify `Filters` and `Satellite Selection` start expanded, other sections have collapsed defaults, and persisted collapsed state cannot close those two default-expanded sections on page load.
- Static tests verify the legacy colored left accents remain for Satellite, View, Timelines, Other, and Settings and the narrowed `420px` menu width remains in place.
- `npm test`: passed, including `encodingUx.test.js`, `menuUx.test.js`, `startupPerformance.test.js`, `startupStructure.test.js`, and `releaseStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `Get-ChildItem -File .\tests -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --input-type=module --check`: passed.
- Extracted `display_satellite.html` module script plus `node --input-type=module --check`: passed.
- `git diff --check`: passed with only existing LF-to-CRLF normalization warnings.
- Local HTTP smoke check with `py -m http.server 8765 --bind 127.0.0.1`: `http://127.0.0.1:8765/index.html` returned `HTTP 200 OK`.

Checks not fully performed in this terminal:

- Full visible-browser confirmation that the accordion headers visually match the supplied legacy color screenshot remains manual.
- Full visible-browser interaction confirming multiple sections remain open while changing filters, selecting satellites, toggling YPR, view controls, and timeline controls remains manual. Static tests cover the markup and state wiring, but visual click-through should still be performed in a browser.

## Release 1.5.4 Verification Log

Checks performed on 2026-06-03:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-03 Version 1.5.4` entry.
- `index.html` visible version tag was updated to `1.5.4`.
- Expanded accordion header CSS now uses a selector specific enough to override the global `#controlsContainer h3` color.
- Static tests verify expanded accordion headers use `#06182c` high-contrast text with `!important`, so light blue text cannot render on the light metallic background.
- Static tests verify the expanded chevron/toggle marker has an explicit dark readable color.
- Static tests continue to verify stacked accordion structure, default-expanded `Filters` and `Satellite Selection`, legacy left accents, menu width, mojibake scan, timeline exclusivity, YPR persistence, and `Active` chip exclusion.
- `npm test`: passed, including `encodingUx.test.js`, `menuUx.test.js`, `startupPerformance.test.js`, `startupStructure.test.js`, and `releaseStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `Get-ChildItem -File .\tests -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --input-type=module --check`: passed.
- Extracted `display_satellite.html` module script plus `node --input-type=module --check`: passed.
- `git diff --check`: passed with only existing LF-to-CRLF normalization warnings.
- Local HTTP smoke check with `py -m http.server 8765 --bind 127.0.0.1`: `http://127.0.0.1:8765/index.html` returned `HTTP 200 OK`.

Checks not fully performed in this terminal:

- Full visible-browser confirmation that `Filters - Satellites Found` and `Satellite Selection` are visually readable on initial page load remains manual.

## Release 1.5.5 Verification Log

Checks performed on 2026-06-03:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-03 Version 1.5.5` entry.
- `index.html` visible version tag was updated to `1.5.5`.
- Static tests verify the menu width is `380px`, thinner than the previous `420px` release width.
- Static tests verify the `#satelliteCountDisplay` style hook is red (`#ff2a2a`) and bold (`font-weight: 900`).
- Static tests continue to verify accordion structure, default-expanded `Filters` and `Satellite Selection`, expanded-header contrast, legacy left accents, mojibake scan, timeline exclusivity, YPR persistence, and `Active` chip exclusion.
- `npm test`: passed, including `encodingUx.test.js`, `menuUx.test.js`, `startupPerformance.test.js`, `startupStructure.test.js`, and `releaseStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `Get-ChildItem -File .\tests -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --input-type=module --check`: passed.
- Extracted `display_satellite.html` module script plus `node --input-type=module --check`: passed.
- `git diff --check`: passed with only existing LF-to-CRLF normalization warnings.
- Local HTTP smoke check with `py -m http.server 8765 --bind 127.0.0.1`: `http://127.0.0.1:8765/index.html` returned `HTTP 200 OK`.

Checks not fully performed in this terminal:

- Full visible-browser confirmation that the satellite count is red/bold and the thinner menu remains usable remains manual.

## Release 1.5.8 Verification Log

Checks performed on 2026-06-04:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-03 Version 1.5.8` entry at the top.
- `index.html` visible version tag is `1.5.8`.
- Generated menu markup in `js/SatelliteMenuLoader.js` orders accordion sections as `View`, `Filters`, `Satellite Selection`, `Timelines`, `Other Selections`, `Settings`.
- Static menu tests verify `View` appears above `Filters`, `Filters` and `Satellite Selection` remain default-expanded, `View` remains default-collapsed, and accordion sections remain independently collapsible.
- `npm test`: passed, including `encodingUx.test.js`, `menuUx.test.js`, `modelResolver.test.js`, `modelVisualFraming.test.js`, `releaseStructure.test.js`, `satelliteOrbitOcclusion.test.js`, `selectedSatelliteView.test.js`, `startupPerformance.test.js`, and `startupStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `Get-ChildItem -File .\tests -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --check`: passed.
- Extracted `display_satellite.html` module script plus `node --check`: passed.
- `git diff --check`: passed with only the LF-to-CRLF normalization warning for `tests/releaseStructure.test.js`.
- Local HTTP smoke check with `py -m http.server 8878 --bind 127.0.0.1`: `http://127.0.0.1:8878/index.html` returned `HTTP 200 OK`.

Checks not fully performed in this terminal:

- Full visible-browser click-through remains manual for Globe, Mercator, High Def., ECEF Axes, Day/Night, satellite search, orbit, footprint, YPR, timeline, and settings interactions. Static tests verify order and state wiring, and HTTP smoke verifies the page serves, but screenshot-level visual confirmation still requires a browser.

## Release 1.5.9 Verification Log

Checks performed on 2026-06-04:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-04 Version 1.5.9` entry at the top.
- `index.html` visible version tag is `1.5.9`.
- Selected detailed-model framing now preserves the converted 100 m observer-eye distance by passing `preservePhysicalDistance` into the selected-satellite camera-frame math.
- Selected-model visual fitting uses loaded model bounds, camera FOV, and the 100 m observer distance to scale the model into the target viewport-size range without moving the observer farther away.
- Selected-model tracking keeps the OrbitControls target on the moving detailed model and applies only satellite motion delta to the camera, preserving user zoom and orbit offsets.
- Static and deterministic tests verify Starlink OBJ bounds, corrected meter-to-scene model scaling, exact 100 m selected-model camera distance, viewport-size fitting, and projected visibility in front of the camera.
- `npm test`: passed, including `encodingUx.test.js`, `menuUx.test.js`, `modelResolver.test.js`, `modelVisualFraming.test.js`, `releaseStructure.test.js`, `satelliteOrbitOcclusion.test.js`, `selectedSatelliteView.test.js`, `startupPerformance.test.js`, and `startupStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `Get-ChildItem -File .\tests -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --check`: passed.
- Extracted `display_satellite.html` module script plus `node --check`: passed.
- `git diff --check`: passed with only LF-to-CRLF normalization warnings for edited files.
- Local HTTP smoke check with `py -m http.server 8879 --bind 127.0.0.1`: `http://127.0.0.1:8879/index.html` returned `HTTP 200 OK`.

Checks not fully performed in this terminal:

- Full visible-browser confirmation that Starlink, OneWeb, ISS, and SSL 1300 detailed models are centered, visible, and inspectable at the 100 m observer-eye distance remains manual. Automated tests cover deterministic framing math and Starlink projected visibility, but screenshot-level visual inspection requires a browser.

## Release 1.5.10 Verification Log

Checks performed on 2026-06-04:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-04 Version 1.5.10` entry at the top.
- `index.html` visible version tag is `1.5.10`.
- Shared scene-frame math now builds a Starlink-style orbital frame from propagated position and velocity: local `+X` maps to velocity, local `+Z` maps to nadir, and local `+Y` completes the right-handed frame.
- Starlink selected models use `starlink-velocity-nadir-frame` orientation mode when velocity is available, while non-Starlink models keep the previous nadir-pointing behavior.
- Starlink selected-camera framing uses `starlink-oblique-orbital-frame` placement at the same 100 m observer-eye distance instead of the old pure radial Earth-centered observer line.
- Static and deterministic tests verify Starlink orbital-frame axes, right-handedness, yaw-bias behavior, non-radial oblique observer direction, reference-style camera-up vector, and exact 100 m selected-camera distance.
- `npm test`: passed, including `encodingUx.test.js`, `menuUx.test.js`, `modelResolver.test.js`, `modelVisualFraming.test.js`, `releaseStructure.test.js`, `satelliteOrbitOcclusion.test.js`, `selectedSatelliteView.test.js`, `startupPerformance.test.js`, and `startupStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `Get-ChildItem -File .\tests -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --check`: passed.
- Extracted `display_satellite.html` module script plus `node --check`: passed.
- `git diff --check`: passed with only LF-to-CRLF normalization warnings for edited files.
- Local HTTP smoke check with `py -m http.server 8881 --bind 127.0.0.1`: `http://127.0.0.1:8881/index.html` returned `HTTP 200 OK`.

Checks not fully performed in this terminal:

- Full visible-browser confirmation that the selected Starlink model visually matches the attached reference image remains manual. Automated tests verify the orbital-frame math and oblique camera placement, but screenshot-level visual matching requires a browser.

## Release 1.5.11 Verification Log

Checks performed on 2026-06-04:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-04 Version 1.5.11` entry at the top.
- `index.html` visible version tag is `1.5.11`.
- Generated menu markup in `js/SatelliteMenuLoader.js` lays out the `View` controls as three rows: `Globe`/`Mercator`, `High Def.`/`ECEF Axes`/`Day/Night`, and `First Starlink`/`ISS`.
- Normal satellite selection, search selection, timeline selection, and shortcut selection use the same selected-satellite path.
- Automated tests cover show-only auto-selection, non-MEO/GEO High Def. auto-enable, shortcut wiring, search-field clearing, selected visibility outside filters, and Earth-in-view camera metadata.
- `npm test`: passed, including `encodingUx.test.js`, `menuUx.test.js`, `modelResolver.test.js`, `modelVisualFraming.test.js`, `releaseStructure.test.js`, `satelliteOrbitOcclusion.test.js`, `selectedSatelliteView.test.js`, `startupPerformance.test.js`, and `startupStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `Get-ChildItem -File .\tests -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --input-type=module --check`: passed.
- Extracted `display_satellite.html` module script plus `node --input-type=module --check`: passed.
- `git diff --check`: passed with only LF-to-CRLF normalization warnings for edited files.
- Local HTTP smoke check with `py -m http.server 8882 --bind 127.0.0.1`: `http://127.0.0.1:8882/index.html` returned `HTTP 200`.
- README Markdown index was checked against repository Markdown files including `PROMPT_Instructions.md`, `PROMPT_History.md`, `README.md`, and `Test_and_Integration.md`.

Checks not fully performed in this terminal:

- Full visible-browser confirmation of the new View-row layout, First Starlink/ISS shortcut clicks, auto High Def. behavior, show-only visibility, and search-field clearing remains manual unless a browser automation environment is available.

## Release 1.5.12 Verification Log

Checks performed on 2026-06-04:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-04 Version 1.5.12` entry at the top.
- `index.html` visible version tag is `1.5.12`.
- Starlink shortcut dynamic state returns `Starlink (<NORAD ID>)` and `Starlink unavailable`.
- ISS shortcut dynamic state returns `ISS` and `ISS unavailable`.
- Help accordion section appears after Settings and includes GitHub, README, Prompt History, License, and disclaimer content.
- ISS selected-model orientation uses `iss-velocity-pitch-nadir-frame` diagnostics with yaw/pitch/roll calibration values and pitch-axis Earth-facing metadata.
- `npm test`: passed, including `encodingUx.test.js`, `menuUx.test.js`, `modelResolver.test.js`, `modelVisualFraming.test.js`, `releaseStructure.test.js`, `satelliteOrbitOcclusion.test.js`, `selectedSatelliteView.test.js`, `shortcutLabels.test.js`, `startupPerformance.test.js`, and `startupStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `Get-ChildItem -File .\tests -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --input-type=module --check`: passed.
- Extracted `display_satellite.html` module script plus `node --input-type=module --check`: passed.
- `git diff --check`: passed with only LF-to-CRLF normalization warnings for edited files.
- Local HTTP smoke check with `py -m http.server 8883 --bind 127.0.0.1`: `http://127.0.0.1:8883/index.html` returned `HTTP 200`.
- README Markdown index was checked against repository Markdown files including `PROMPT_Instructions.md`, `PROMPT_History.md`, `README.md`, and `Test_and_Integration.md`.

Checks not fully performed in this terminal:

- Full visible-browser confirmation of ISS model visual orientation from multiple camera angles, Help link navigation on GitHub Pages, and unavailable shortcut states with altered TLE data remains manual unless browser automation and alternate fixture data are available.

## Release 1.5.13 Verification Log

Checks to perform for this release:

- Confirm `PROMPT_History.md` contains the latest `Release Date: 2026-06-04 Version 1.5.13` entry at the top.
- Confirm `index.html` visible version tag is `1.5.13`.
- Confirm `server.py` compiles and serves API, OpenAPI, Swagger docs, and static app routes.
- Confirm server-connected mode uses `/api/tle` data and enables Help Swagger/API links.
- Confirm disconnected mode falls back to local files and keeps existing app behavior.
- Confirm invalid/malformed server TLE data falls back to local files.
- Confirm Share appears before Help and Copy Link restores supported state after satellite data loads.
- Confirm status icon states, tooltip text, status panel fields, and reconnect/refresh behavior.
- Run `npm test`.
- Run JavaScript syntax checks.
- Run Python syntax checks.
- Run browser/static HTTP smoke checks.

## Release 1.5.14 Verification Log

Checks to perform for this release:

- Confirm `PROMPT_History.md` contains `Release Date: 2026-06-04 Version 1.5.14`.
- Confirm `index.html`, `js/serverConnection.js`, and `server.py` use version `1.5.14`.
- Confirm Swagger/API docs have high-contrast GET labels, route text, descriptions, response text, and expanded endpoint details.
- Confirm server status uses `icons/server_connected.svg`, `icons/server_offline.svg`, `icons/server_checking.svg`, and `icons/server_error.svg`.
- Confirm Other Selections uses the same accordion header text style as other sections.
- Confirm Share can preview the current canvas, download it, copy it with ClipboardItem when supported, and include it in native Web Share only when `navigator.canShare({ files })` confirms support.
- Run `npm test`.
- Run JavaScript syntax checks.
- Run Python syntax checks.
- Run Python server smoke checks for API, Swagger docs, and static app routes.

## Release 1.7 Verification Log

Checks performed for this Version 1.7 implementation session:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-07 Version 1.7` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` use version `1.7`.
- Mercury uses `textures/mercury.png`, Venus uses `textures/venus.png`, and Jupiter uses `textures/jupiter.jpg`.
- The local JPL-derived ephemeris dataset is stored at `data/ephemeris/solar_system_jpl_horizons_2020_2035_6h.json`.
- The ephemeris metadata documents source, date range, cadence, reference frame, reference plane, origin, units, time handling, interpolation, thresholds, and license.
- Off-grid reference samples validate interpolation error below the documented thresholds.
- Moon position is derived from Moon and Earth ephemeris vectors.
- Integrated Solar System mode initializes and updates from shared `SIM_DATE`.
- Solar System UI reports ephemeris source/range or fallback/loading status.
- `Other Selections` remains removed, and Earth/Moon/Mars remain reachable through Solar System selection.
- Version 1.6.2 Stars & Milky Way and menu behaviors remain preserved.

Remaining manual verification:

- Browser-confirm enabling Solar System mode loads local ephemeris status and shows textured Mercury, Venus, and Jupiter.
- Browser-confirm `Time x = 0` freezes Solar System body positions and higher `Time x` values advance body motion.
- Browser-confirm Earth, Moon, and Mars selection paths still switch to their legacy views.
- Browser-confirm existing Globe, Mercator, Moon, Mars, satellite search, orbit, footprint, timelines, Share, and Help behavior remains unchanged.

## Release 1.6.2 Verification Log

Checks performed for this Version 1.6.2 implementation session:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-07 Version 1.6.2` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` use version `1.6.2`.
- `Views & Time` has the new row order: Solar System + Stars & Milky Way; Globe + High Def. + ECEF Axes; Mercator + Day/Night.
- The menu Time x slider is removed and the top/canvas Time x slider remains the simulation-speed control.
- Solar System mode is unchecked by default.
- Solar System sub-controls are hidden by default and visible only when Solar System mode is checked.
- The integrated Solar System module defines the required planets plus Moon, local texture paths, fallback materials, orbit paths, labels, Sun glow, Saturn rings, and selection helpers.
- `Other Selections` is removed from the menu; Timelines follows Filters.
- The bundled star catalog summary is hidden by default and only shown when `Stars & Milky Way` and `Bright Labels` are both checked.
- Earth-specific satellite layers are suppressed while Solar System mode is active.
- Earth, Moon, and Mars selections route to their existing app modes; other planets remain focused inside Solar System mode.
- Solar System motion uses the shared top/canvas `Time x` simulation state.
- Version 1.6.1 Stars & Milky Way behavior remains: no integrated magnitude slider and all 46 bundled reference stars render.

Remaining manual verification:

- Browser-confirm enabling Solar System mode displays textured planets, labels, Sun glow, orbit paths, and star background.
- Browser-confirm Earth selection exits to normal Globe view.
- Browser-confirm Moon selection exits to existing Moon-centered view.
- Browser-confirm Mars selection exits to existing Mars view with Mars texture/progress behavior.
- Browser-confirm the star catalog summary appears only when both `Stars & Milky Way` and `Bright Labels` are checked.
- Browser-confirm Mercury, Venus, Jupiter, Saturn, and Uranus focus inside Solar System mode and return to overview.
- Browser-confirm existing Globe, Mercator, Moon, Mars, satellite search, orbit, footprint, timelines, Share, and Help behavior remains unchanged.

## Release 1.6.1 Verification Log

Checks performed for this Version 1.6.1 implementation session:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-07 Version 1.6.1` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` use version `1.6.1`.
- `Views & Time` contains `Globe`, `Mercator`, and unchecked `Stars & Milky Way` on the same row.
- `RA/Dec Grid`, `Bright Labels`, and `Atmosphere` are hidden by default and visible only when `Stars & Milky Way` is checked.
- `RA/Dec Grid`, `Bright Labels`, and `Atmosphere` are unchecked by default.
- The integrated `Magnitude limit` slider has been removed from the main app.
- The star layer renders all 46 bundled real RA/Dec reference stars with `THREE.Points` / `BufferGeometry`.
- The star-options panel shows a catalog summary based on `BRIGHT_STARS_DEMO.length`.
- The Milky Way layer uses `obj/Textures/starmap-4k.jpg` when available and a procedural fallback otherwise.
- Future magnitude filtering remains documented as dependent on a larger local preprocessed catalog.
- Static regression checks confirm existing menu order, satellite selection, Mercator overlay, Mars behavior, selected-satellite panel, timelines, Share, Help, and server fallback hooks remain present.

Remaining manual verification:

- Browser-confirm enabling `Stars & Milky Way` displays the star field and Milky Way behind Earth without hiding satellites.
- Browser-confirm toggling RA/Dec Grid, Bright Labels, and Atmosphere works visually on desktop and mobile.
- Browser-confirm existing Globe, Mercator, Moon, Mars, satellite search, orbit, footprint, timelines, Share, and Help behavior remains unchanged.

## Release 1.5.23 Verification Log

Checks performed for this Version 1.5.23 implementation session:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-07 Version 1.5.23` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` use version `1.5.23`.
- `Other Selections` includes `Mars`.
- Mars keeps local source texture `textures/March.jpg` and uses optimized runtime texture `textures/March_8k.jpg`.
- Mars texture loading does not show a visible progress bar on initial `index.html` launch while Earth is active.
- Selecting Mars shows a progress bar labeled `Loading Mars map/texture...` in the middle of the canvas, remains visible long enough for cached/local loads, shows a short confirmation state if the texture already loaded silently before selection, and reports fallback color use on texture load failure.
- Mars mode targets `mars.position` and does not move Earth, Moon, or Mars to `(0, 0, 0)`.
- Mars observer fly-to starts close to the Mars globe while preserving orbit/zoom controls.
- Mars Mercator uses `textures/March_8k.jpg` instead of the Earth map and suppresses Earth-specific satellite markers, footprints, ground tracks, and day/night shading.
- Mars position uses a documented simplified circular heliocentric Earth-to-Mars relative visual model.
- The local Mars texture source/license status is documented as to be confirmed.

Remaining manual verification:

- Browser-confirm selecting Mars shows the textured Mars globe.
- Browser-confirm the Mars progress bar is not visible during default Earth launch.
- Browser-confirm the Mars texture progress bar is centered on the canvas, visible during load, and hidden after completion.
- Browser-confirm Mars + Mercator shows the Mars map, not Earth.
- Browser-confirm mouse orbit and zoom remain centered on Mars and leaving Mars restores Earth-centered target behavior.

## Release 1.5.22 Verification Log

Checks performed for this Version 1.5.22 implementation session:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-06 Version 1.5.22` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` use version `1.5.22`.
- Earth-centered scene controls now define 100 km above-surface minimum zoom, a large finite maximum zoom, disabled panning, and a safe finite camera far plane.
- Static checks confirm Earth mesh origin enforcement, Earth-mode target `(0, 0, 0)`, Moon-mode target `moon.position`, no Moon recentering to origin, and selected-satellite target priority.
- WGS84 geodetic/ECF helper math replaces spherical look geometry in `js/orbit/orbitLinkGeometry.js`.
- Orbit classification distinguishes GEO, MEO, LEO, HEO, Other, and Unknown without classifying all slow objects as GEO.
- HEO/Molniya-style orbit duration renders one full orbit.
- Invalid or below-Earth propagated positions are rejected for orbit generation and hidden/flagged in the 3D sprite update loop.
- Mercator map, footprints, coverage overlays, and day/night shading use the shared Web Mercator helper.
- Day/night terminator math is finite near equinox.
- O3b/OB3 satellites now resolve to the local `obj/o3b.glb` model in the main app.
- Selected detailed model roots and hidden selected sprites are synchronized to the same propagated scene coordinate.
- Model geometry centering preserves the detailed model root position, preventing selected models from drifting away from the selected orbit trajectory.

Remaining manual verification:

- Browser-confirm Earth and Moon mouse orbit/zoom behavior on desktop and mobile.
- Browser-confirm no clipping for representative LEO, MEO, GEO, HEO, Moon, and selected high-detail satellite views.

## Release 1.5.21 Verification Log

Checks performed for this Version 1.5.21 implementation session:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-06 Version 1.5.21` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` use version `1.5.21`.
- Static tests confirm the right-side selected-satellite detail panel has independent collapsible `Satellite data` and `TLE details` sections.
- Static tests confirm both selected-satellite detail sections are expanded by default using `<details open>` and preserve the existing transparent panel styling and UTC-clock width sync.
- Static tests confirm Starlink and ISS add an expanded `Source detail` section with red bold attribution text and defined source/license/courtesy strings.
- Static tests confirm ISS selected-model yaw and pitch control inputs are swapped while roll remains unchanged and non-ISS models keep the standard mapping.
- Static repository search found no HTML/JS source containing the ADCS screenshot text (`ADCS`, `Attitude`, `Commanded`, or `CMG Torque`), so ADCS page-specific layout edits could not be applied in this workspace.
- `npm test`: passed.
- Recursive `node --check` over `js/` and `tests/`: passed.
- `py -m py_compile server.py`: passed.
- `git diff --check`: passed after removing one extra trailing blank line from `PROMPT_History.md`; remaining output was only LF-to-CRLF normalization warnings for edited files.

Checks not fully performed in this terminal:

- Full browser confirmation that expanding/collapsing the selected-satellite panel remains usable on desktop and narrow screens remains manual.
- ADCS/attitude screenshot-specific browser correction remains blocked until the source page/file is available in the repository.

## Release 1.5.20 Verification Log

Checks performed for this Version 1.5.20 implementation session:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-06 Version 1.5.20` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` use version `1.5.20`.
- Static tests confirm combined Globe + Mercator mode applies the `globe-overlay` class and anchors the Mercator overlay to the bottom-right of the canvas.
- Static tests confirm selected-model lighting uses configured Sun intensity, updates Sun light before rendering, keeps camera fill minimal, and creates a named directional Earth-albedo light.
- Static tests confirm model material loading still decodes diffuse textures as sRGB and clamps high MTL specular/shininess response to avoid white solar-panel washout.
- `npm test`: passed.
- Recursive `node --check` over `js/` and `tests/`: passed.
- `py -m py_compile server.py`: passed.
- `git diff --check`: passed after removing one extra trailing blank line from `PROMPT_History.md`; remaining output was only LF-to-CRLF normalization warnings for edited files.
- Python server smoke checks are not run unless requested; static API/version tests cover the release constants.

Checks not fully performed in this terminal:

- Full browser confirmation that Globe + Mercator places the Mercator overlay in the visible bottom-right canvas corner, and that Starlink solar panels show Sun and subtle Earth-reflection lighting, remains manual.

## Release 1.5.19 Verification Log

Checks performed for this Version 1.5.19 implementation session:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-06 Version 1.5.19` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` use version `1.5.19`.
- Static tests confirm Satellite Selection no longer contains the detailed selected-satellite metadata/TLE table or `satelliteInfo` hook.
- Static tests confirm the right-side `selectedSatelliteDetailPanel` remains the only detailed selected-satellite metadata/TLE display.
- Static tests confirm the right-side detail panel syncs its width to the UTC clock/horloge and keeps transparent styling.
- Static tests confirm TLE line 1 and TLE line 2 are excluded from generic metadata rows and displayed once in the TLE block.
- Static tests confirm `SSL_1300.glb` resolves for `INTELSAT 20 (IS-20)` and `INTELSAT 18 (IS-18)` only, and does not resolve for other Intelsat/SSL/GEO/GOES/SES/manufacturer/alias matches or app id `20` alone.
- `npm test`: passed.
- Recursive `node --check` over `js/` and `tests/`: passed for 44 files.
- `py -m py_compile server.py`: passed.
- Python server smoke check with `curl.exe` on `127.0.0.1:8765`: `/api/version` returned `1.5.19` and `2026-06-06`; `/docs`, `/index.html`, `/LICENSE.md`, and `/markdown_viewer.html?source=README.md&title=README` returned HTTP 200.
- `git diff --check`: passed with only LF-to-CRLF normalization warnings for edited files.

Checks not fully performed in this terminal:

- Full visible-browser confirmation that the right-side panel visually matches the UTC clock width, stays readable on narrow screens, and does not obscure essential canvas interaction remains manual unless browser automation is available.

## Release 1.5.18 Verification Log

Checks performed for this Version 1.5.18 implementation session:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-06 Version 1.5.18` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` use version `1.5.18`.
- Static tests confirm the visible `Server unavailable. Using local satellite data.` launch banner and `serverOfflineNotice` hook are removed while the server status panel remains.
- Static tests confirm Starlink and ISS shortcut buttons are under `Satellite Selection`, not `Views & Time`, and still use the normal selection path.
- Static tests confirm satellite search results are portaled to `document.body`, use fixed positioning, sit above menu elements, and preserve Escape, Tab, keyboard, mouse, and outside-click behavior.
- Static tests confirm the right-side `selectedSatelliteDetailPanel` renders selected satellite metadata and TLE details below the UTC clock and hides when no satellite is selected.
- Static tests confirm README and Releases History open rendered Markdown in `markdown_viewer.html`, raw HTML is escaped, rendered links are sanitized, and the viewer restricts allowed Markdown source files.
- Static tests confirm `LICENSE.md` exists and the Licenses Help action targets it.
- Static tests confirm `SSL_1300.glb` is restricted to app satellite identifier `20`, does not match generic GOES/Intelsat/name aliases, and does not confuse NORAD `20` with app satellite id `20`.
- `npm test`: passed.
- Recursive `node --check` over `js/` and `tests/`: passed for 44 files.
- `py -m py_compile server.py`: passed.
- Python server smoke check with `curl.exe` on `127.0.0.1:8765`: `/api/version` returned `1.5.18` and `2026-06-06`; `/docs`, `/index.html`, `/LICENSE.md`, and `/markdown_viewer.html?source=README.md&title=README` returned HTTP 200.
- `git diff --check`: passed with only LF-to-CRLF normalization warnings for edited files.

Checks not fully performed in this terminal:

- Full visible-browser confirmation of dropdown stacking, right-side selected-satellite panel placement, separate Help Markdown pages, and responsive desktop/mobile layout remains manual unless browser automation is available.

## Release 1.5.17 Verification Log

Checks performed for this Version 1.5.17 implementation session:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-06 Version 1.5.17` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` use version `1.5.17`.
- Static tests confirm `index.html` displays `Version 1.5.17 - hosted at GitHub Repo`.
- Static tests confirm the order is Views & Time, Satellite Selection, Filters - Satellites Found, Other Selections, Timelines, Share, Help.
- Static tests confirm Views & Time, Satellite Selection, and Filters - Satellites Found start expanded, while Other Selections, Timelines, Share, and Help start collapsed.
- Static tests confirm persisted accordion state cannot override the required launch defaults.
- Static tests confirm the menu `Time x` slider and canvas-top `Time x` slider are wired to shared synchronization helpers.
- Static tests confirm the obsolete visible helper text for Views & Time, the orbit filter, and Satellite Selection is absent.
- Static tests confirm orbit filter controls and satellite search controls remain present with accessible names.
- `npm test`: passed.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `Get-ChildItem -File .\tests -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `py -m py_compile server.py`: passed.
- Python server smoke check with `curl.exe` on `127.0.0.1:8765`: `/api/version` returned `1.5.17` and `2026-06-06`; `/docs` returned HTTP 200; `/index.html` returned HTTP 200.
- `git diff --check`: passed with only LF-to-CRLF normalization warnings for edited files.

Checks not fully performed in this terminal:

- Full visible-browser confirmation of bidirectional slider interaction, desktop/mobile layout, keyboard navigation, and the visual absence of removed helper-text gaps remains manual unless browser automation is available.
- PowerShell `Invoke-WebRequest` hit a local client `NullReferenceException` while reading `/docs`; the same `/docs` route passed with `curl.exe` HTTP 200.

## Release 1.5.16 Verification Log

Checks performed for this Version 1.5.16 implementation session:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-04 Version 1.5.16` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` use version `1.5.16`.
- Static tests confirm `index.html` displays `Version 1.5.16 - hosted at GitHub Repo`.
- Static tests confirm every accordion section starts collapsed on page launch and persisted state cannot reopen sections.
- Static tests confirm Settings is removed and the order is Views & Time, Filters, Satellite Selection, Other Selections, Timelines, Share, Help.
- Static tests confirm selected-satellite controls stay hidden until a satellite is selected.
- Static tests confirm Help shows `README` and `Releases History` actions.
- Static tests confirm Help includes GitHub, README, Releases History, Licenses, Swagger, Swagger MD, Live API, and a bottom disclaimer.
- Static tests confirm `Releases History` targets `RELEASE_NOTES.md` and the old visible `Prompt History` label is not used.
- Static tests confirm README and Releases History use the in-app Markdown renderer, raw HTML escaping, and sanitized Markdown links.
- Static tests confirm Close, centered version text, and server status share the header alignment height and server status icon sizing hooks.
- Static tests confirm connected status uses `icons/power_green.png` and offline/error status uses `icons/power_red.png`.
- Static tests confirm `LICENSE.md` exists and is referenced from Help and README.
- `npm test`: passed.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `Get-ChildItem -File .\tests -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `py -m py_compile server.py`: passed.
- `git diff --check`: passed with only LF-to-CRLF normalization warnings for edited files.

Checks not fully performed in this terminal:

- Full visible-browser confirmation of the Close/version/server-status row alignment, section-specific metallic gradients, selected-satellite option visibility, and Help document-page navigation remains manual unless browser automation is available.
- Python server endpoint smoke checks remain manual for this session; static server structure tests and `py -m py_compile server.py` passed.

## Acceptance Criteria

- The app loads over HTTP without runtime errors.
- The new filter UI works with multi-select orbit and tag combinations.
- Debris filtering works and defaults to the previous inclusive behavior.
- Satellite count, visible markers, and dropdown stay consistent after each filter change.
- Existing non-filter controls continue to work.
- No visible mojibake remains in menu labels, tab labels, toggle labels, helper text, or the time slider label.
- The narrowed menu remains usable and long panels remain scrollable.
- The menu uses stacked accordion sections instead of the vertical tab rail.
- The satellite count in the Filters header is red and bold.
- The accordion menu is thinner than the previous release while staying usable.
- Multiple accordion sections can stay open at the same time.
- Views & Time, Satellite Selection, and Filters - Satellites Found start expanded on page load.
- Other Selections, Timelines, Share, and Help start collapsed on page load.
- The accordion order is Views & Time, Satellite Selection, Filters - Satellites Found, Other Selections, Timelines, Share, Help.
- Settings is not present as an accordion section.
- The optional Python server exposes `/api/health`, `/api/version`, `/api/tle`, `/api/satellites`, `/api/satellite-metadata`, `/api/decayed`, `/api/data-update-status`, `/docs`, and `/openapi.json`.
- Connected mode loads TLE data from the Python server and labels the active data source as server-backed.
- Disconnected, invalid, slow, or unavailable server states fall back to local file loading without breaking existing behavior.
- The status icon exposes checking, connected, disconnected/offline, and error states with tooltip text and accessible labels.
- The status panel shows server URL, connection state, data source, app/API version, last load time, and reconnect/refresh.
- Close, version text, and server status are horizontally aligned and vertically centered on desktop.
- The Share accordion appears immediately before Help and its UI matches the existing accordion/menu styling.
- Share links copy and restore supported state without including local filesystem paths, tokens, or private server configuration.
- Share can preview, download, copy, and natively share the current canvas image when the browser supports those APIs.
- Help includes Swagger/API documentation links that open separate local UI, Markdown companion, and live API pages, with local docs remaining clickable while offline.
- Help opens README and production-safe Releases History Markdown through `markdown_viewer.html`; source prompt history is not exposed by that action.
- The Views & Time menu uses the Version 1.6.2 Solar System/Stars, Globe/High Def./ECEF, and Mercator/Day-Night rows; First Starlink/ISS shortcuts live in Satellite Selection.
- The canvas-top Time x slider remains visible and controls the shared simulation-speed state.
- The obsolete visible helper text for Views & Time, the orbit filter, and Satellite Selection is removed without leaving empty layout gaps.
- Satellite Selection does not duplicate the detailed selected-satellite metadata/TLE table; full details live only in the right-side panel under the UTC clock.
- The right-side selected-satellite panel matches the UTC clock width and shows each TLE line once.
- Selecting any satellite automatically checks `Show only selected satellite` and hides all non-selected satellites.
- The selected satellite remains visible in show-only mode even when current filters would otherwise hide it.
- Selecting a non-MEO/GEO satellite automatically enables `High Def.` Earth, and MEO/GEO selections never force High Def. off.
- First Starlink and ISS shortcuts use the normal satellite selection path and move the observer to the selected satellite.
- The Starlink shortcut displays `Starlink (<NORAD ID>)` after TLE data loads and `Starlink unavailable` when unresolved.
- The ISS shortcut displays `ISS` when resolved and `ISS unavailable` when unresolved.
- ISS selected-model orientation maps `+X` to velocity, `+Y`/pitch to nadir/Earth, and `+Z` to the right-handed negative cross-track complement.
- ISS orientation diagnostics include `iss-velocity-pitch-nadir-frame`, pitch-axis Earth-facing metadata, and yaw/pitch/roll calibration values.
- The Help accordion appears after Share and contains GitHub, README, Releases History, Licenses, Swagger, Swagger MD, Live API, and disclaimer content.
- The satellite search field clears the prior selected label on the next search interaction without clearing the active selected satellite.
- Selected-satellite camera metadata confirms Earth remains visible behind the selected satellite.
- The generated tag/company filter never exposes an `Active` chip.
- Launch and re-entry timeline checkboxes are mutually exclusive and checkbox state matches HUD visibility.
- Yaw/Pitch/Roll sliders remain visible and preserve current values after selecting or switching satellites when YPR is enabled.
- Known local detailed models load from `obj/` for selected satellites.
- Detailed selected models are visibly inspectable in 3D and are not clipped by the default near plane.
- Detailed selected models preserve the default 100 m camera/observer-eye distance from the selected satellite target.
- The Starlink satellite-visibility test confirms a known local model is in front of the camera, inside the viewport, and large enough to inspect.
- Starlink selected-model orientation maps `+X` to velocity, `+Z` to nadir, and `+Y` to the right-handed cross-track axis.
- Starlink selected-model default observer placement is oblique and not centered directly in front of Earth.
- Selected satellites remain visible through the sprite fallback when no model exists or model loading fails.
- Stale asynchronous model loads do not attach after the user changes selection.
- Selected-satellite 3D framing, 2D/Mercator highlighting, and nadir-oriented YPR/model behavior work without fighting manual camera controls.
- Deep automated tests pass through `npm test`.
- Browser smoke testing over HTTP passes.
- The full checklist in this file has been followed, and any pre-existing unrelated failures or intentional approximations are documented.

## Release 1.7.6 Verification Log

Checks performed for this Version 1.7.6 release:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-15 Version 1.7.6` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, `server.py`, `swagger.html`, and `SWAGGER.md` use version `1.7.6`.
- Re-entry Timeline initializes from confirmed decayed records before filtered active prediction completes.
- SATCAT conditional unchanged responses skip repeated decayed DB rebuilds.
- Incremental TLE refresh can fill touched launch-date sidecar records from local SATCAT data.
- `js/serverConnection.js` added a default API base URL and fallback server check so local static/IDE hosts without API routes retry `http://127.0.0.1:8000` before offline mode.
- `index.html` uses the fallback connection check during startup, and `README.md` documents the retry behavior.
- `index.html` uses `js/dependencyBootstrap.js` so Three.js `0.184.0` and `satellite.js` `6.0.2` try `unpkg.com` first, then fall back to local `./node_modules/` paths before the main app module starts.
- `README.md`, `PROMPT_History.md`, and this verification log document the Version `1.7.6` runtime dependency fallback behavior.
- `tests/serverConnection.test.js` covers the static-host-miss to Python-server-fallback path.
- All 25 automated tests pass through `npm test`.
- Live API smoke check confirmed `http://127.0.0.1:8000/api/version` returns Version `1.7.6`.

## Release 1.7.5 Verification Log

Checks performed for this Version 1.7.5 implementation session:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-15 Version 1.7.5` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, `server.py`, `swagger.html`, and `SWAGGER.md` use version `1.7.5`.
- Launch timeline tests confirm latest valid launch detection, invalid/future launch-date rejection, and viewport anchoring around the latest dataset launch.
- Re-entry timeline tests confirm latest confirmed decay detection from decayed data, invalid decay-date rejection, inactive decayed-record metadata preservation, and viewport anchoring around the latest decay event.
- Static selection tests confirm inactive decayed timeline records are handled as details-only records instead of active propagated TLE satellites.
- Full visible-browser confirmation of the latest-event timeline highlight remains manual.

## Release 1.7.4 Verification Log

Checks performed for this Version 1.7.4 implementation session:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-14 Version 1.7.4` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, `server.py`, and `swagger.html` use version `1.7.4`.
- `tools/satellite_data_tools.py` exists as a standalone and importable standard-library Python data tool.
- Static and fixture tests confirm legacy TLE transformation fields, first-seen NORAD behavior, incremental freshness skip, CelesTrak failure preservation, and decayed SATCAT filtering/grouping.
- Static server tests confirm scheduled data updates are disabled by default, server flags exist, and `/api/data-update-status` is documented.
- `py -m py_compile server.py tools/satellite_data_tools.py`: passed.
- `node .\tests\satelliteDataTools.test.js`: passed.
- `node .\tests\serverApiStructure.test.js`: passed.
- `node .\tests\releaseStructure.test.js`: passed.
- `node .\tests\serverConnection.test.js`: passed.
- `node .\tests\menuUx.test.js`: passed.
- `node .\tests\solarSystemOverview.test.js`: passed.
- All test files except `displaySatelliteViewer.test.js` were run individually and passed.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `Get-ChildItem -File .\tests -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `py .\tools\satellite_data_tools.py --help`: passed.
- `py .\tools\satellite_data_tools.py maybe-update --dry-run --interval-hours 999999`: passed and skipped writes because local data was newer than the configured interval.

Checks not fully performed in this terminal:

- The previous `displaySatelliteViewer.test.js` asset/manifest mismatch has been resolved by aligning `json/display_satellite_models.json` with the current `obj/` contents.
- Live CelesTrak, N2YO, and optional Space-Track requests were not run; automated coverage uses fixtures/mocks and static checks to avoid live network dependencies.
- Full visible-browser confirmation and long-running scheduled server refresh behavior remain manual.

## Release 1.7.3 Verification Log

Checks performed for this Version 1.7.3 implementation session:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-14 Version 1.7.3` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` use version `1.7.3`.
- `server.py` and `js/serverConnection.js` use release date `2026-06-14`.
- Static orbit tests confirm LEO, MEO, GEO, and HEO selected-orbit durations use one orbital period from validated mean motion.
- Static orbit tests confirm selected-orbit sampling starts at the injected simulation date and ends at `SIM_DATE + one orbital period`.
- Static orbit tests confirm invalid propagated samples split the orbit path instead of fabricating missing geometry.
- Static orbit tests confirm `Time x`-driven stale orbit refresh replaces the existing `selectedOrbitTrajectoryRoot` instead of accumulating duplicate orbit roots.
- Static menu tests confirm `Stars & Milky Way` is checked by default while `RA/Dec Grid`, `Bright Labels`, and `Atmosphere` remain unchecked.
- `README.md` documents Version 1.7.3 one-revolution 3D `Show Orbit` behavior and `Time x` synchronization.
- `node .\tests\satelliteOrbitOcclusion.test.js`: passed.
- `node .\tests\releaseStructure.test.js`: passed.
- `node .\tests\serverApiStructure.test.js`: passed.
- `node .\tests\menuUx.test.js`: passed.
- `node .\tests\serverConnection.test.js`: passed.
- `node .\tests\solarSystemOverview.test.js`: passed.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `py -m py_compile server.py`: passed.
- All test files except `displaySatelliteViewer.test.js` were run individually and passed.

Manual checks not performed in this terminal:

- Full visible-browser confirmation that representative LEO, MEO, GEO, HEO, and debris selections each show one visible 3D revolution, stay synchronized while `Time x` changes, and preserve camera-aware Earth occlusion remains manual.
- The previous `displaySatelliteViewer.test.js` asset/manifest mismatch has been resolved by aligning `json/display_satellite_models.json` with the current `obj/` contents.

## Release 1.7.2 Verification Log

Checks performed for this Version 1.7.2 implementation session:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-08 Version 1.7.2` entry at the top.
- `index.html`, `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` use version `1.7.2`.
- `server.py` and `js/serverConnection.js` use release date `2026-06-08`.
- Static menu tests confirm the orbit/category row order is `ALL`, `GEO`, `MEO`, `LEO`, `HRO`, `Debris`, `Others`.
- Static menu tests confirm the old separate `Show`, `Hide`, and `Debris only` buttons are absent from generated Satellite Selection markup.
- Static menu tests confirm `Reset Filters` appears in DOM/tab order immediately after `Clear` in the satellite search row.
- Static filter tests confirm the `Debris` category uses the canonical filtered-list path and switches away cleanly when a normal orbit category is clicked.
- Static Help tests confirm `Swagger` opens `swagger.html`, `Swagger MD` opens `markdown_viewer.html?source=SWAGGER.md&title=Swagger%20API`, and `Live API` remains the server-backed `/openapi.json` link.
- `swagger.html` exists and displays the local standard Swagger/OpenAPI-style page with API title, version badge, OAS badge, base URL/schema notes, colored method badges, grouped endpoints, and expandable endpoint details without starting `server.py`.
- `SWAGGER.md` exists as the Markdown companion and documents local display without starting `server.py`, plus live API endpoint usage when the optional server is running.
- `markdown_viewer.html` allowlists `SWAGGER.md` for local static rendering.
- `README.md` documents Version 1.7.2, the local Swagger UI and Markdown workflow, and the repository documentation index including `swagger.html` and `SWAGGER.md`.
- Coverage audit updates add traceability requirements for all prior release entries in `PROMPT_History.md`.
- `json/display_satellite_models.json` now exists and matches the available local standalone viewer assets.
- `display_satellite.html` fallback model manifest and custom model examples no longer advertise missing generic, O3b mPOWER HD, extra ISS, ISS High Definition, or Hubble assets.
- `npm test`: passed, 23 test files.
- `python -m py_compile server.py`: not run because `python` is not on PATH in this shell.
- `py -m py_compile server.py`: passed.

Manual checks not performed in this terminal:

- Full visible-browser confirmation of desktop/mobile row wrapping, satellite marker visibility, and Help link clicks remains manual.
- Live Python server endpoint smoke checks remain manual; static server structure tests and Python syntax checks passed.
