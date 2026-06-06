# Test and Integration Plan

## Purpose

This plan verifies that the `openbexi_earth_orbit` application still works after filter, coordinate-frame, orbital math, rendering, scaling, and UI changes. It is the acceptance checklist for implementation work: all automated tests, browser checks, and manual regression items in this file must pass, or any remaining limitation must be documented before the task is considered complete.

Version 1.4 adds selected-satellite observer framing and Earth-facing orientation. In 3D mode, selected satellites should transition to a close observer view with Earth centered behind the satellite. In 2D/Mercator mode, selected satellites should be clearly highlighted without applying 3D-only camera-distance logic.

Version 1.4.1 fixes selected-satellite detailed model resolution. When a selected satellite has a related local OBJ/MTL or GLB asset under `obj/`, the app should load that local model; otherwise the selected TLE sprite must remain visible as the fallback.

Version 1.4.2 fixed the selected-satellite model visibility regression with close observer targeting and `display_satellite.html` as an isolated local OBJ/MTL and GLB model viewer. Version 1.5.9 supersedes the old fallback-distance behavior by requiring the selected detailed-model observer eye to remain at the exact converted 100 m default distance.

Version 1.4.3 cleans up prompt/release structure and dependency versioning. `PROMPT.md` must contain only the general execution prompt, release history must live in `PROMPT_History.md`, `index.html` must display the latest release version, and all browser import maps must use matching Three.js core/addon versions.

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
- Confirm `PROMPT.md` contains only the `General Execution Prompt` section and no release history.
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
```

- With the optional Python server running, confirm these endpoints return successful responses:
  - `/api/health`
  - `/api/version`
  - `/api/tle`
  - `/api/satellites`
  - `/api/satellite-metadata`
  - `/api/decayed`
  - `/docs`
  - `/openapi.json`

## Deep Automated Tests

Add and maintain focused tests under `tests/`. `npm test` must run all tests, not only a single file.

### Coordinate Frames

- Test shared coordinate transforms for finite outputs and consistent units.
- Test ECI/ECEF/scene conversion for the same satellite and simulation time.
- Test that the live selected satellite scene position and the first/generated current orbit-trail point agree within a small tolerance.
- Include at least one GEO, one MEO, and one LEO example from `json/tle/TLE.json`.
- Test that all scene positions use the same `KM_TO_SCENE_UNITS` scale.

### Orbit Trail Generation

- Test orbit generation uses the supplied simulation date, not wall-clock `Date.now()`.
- Test generated orbit paths are finite, non-empty, and in scene units.
- Test non-finite propagated positions are rejected and never become 3D geometry vertices.
- Test below-Earth propagated positions split or stop an orbit path instead of creating a line through Earth.
- Test all-invalid propagated samples create no orbit geometry.
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

### Day/Night and Sun Direction

- Test GMST normalization stays in `[0, 2 * Math.PI)`.
- Test Sun vectors are normalized.
- Test the Sun/light scene direction uses the same scene-frame transform convention as satellites.
- Test day/night behavior at a known UTC time does not produce NaN or inverted vectors.

### Moon Positioning

- Test Moon position returns finite scene coordinates.
- Test Moon distance stays within the documented expected range.
- If the Moon model is approximate, test and document that approximation explicitly.
- Test Moon coordinates use the same scene transform convention as the rest of the 3D scene.

### Satellite Model Scaling

- Test OBJ and GLB unit conversion helpers for `m`, `cm`, `mm`, `km`, and numeric factors.
- Test visual-scale factors are named/configurable and applied exactly once.
- Test detailed satellite models use shared scale constants from `SatelliteConstantLoader.js`.

### Selected-Satellite Model Resolution

- Test normalized model matching is case-insensitive and ignores spaces, hyphens, underscores, and file extensions.
- Test Starlink satellites resolve to the local Starlink model assets.
- Test OneWeb satellites resolve to the local OneWeb OBJ/MTL assets.
- Test O3b satellites resolve to the local O3b OBJ/MTL assets.
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
- Test the Orbit filter includes `ALL`, `GEO`, `MEO`, `LEO`, `HEO`, and `Other`.
- Test the filter menu does not contain an `Active` button/control.
- Test generated company/tag chips exclude `Active`, not only the static markup.
- Test the `Views & Time` section has one collapsible container containing the menu `Time x` slider, Globe, Mercator, High Def., ECEF Axes, Day/Night controls, and shortcuts.
- Test the menu `Time x` slider and canvas-top `Time x` slider stay synchronized in both directions and update one shared simulation-speed state.
- Test menu CSS keeps the narrowed menu width, legacy colored accordion headers, and scrollable long panels.
- Test the vertical tab rail is removed and the menu uses stacked accordion sections.
- Test accordion section order is `Views & Time`, `Satellite Selection`, `Filters - Satellites Found`, `Other Selections`, `Timelines`, `Share`, `Help`.
- Test the Settings accordion section is absent.
- Test multiple accordion sections can be open simultaneously.
- Test expanding one accordion section does not collapse another section.
- Test `Views & Time`, `Satellite Selection`, and `Filters - Satellites Found` are expanded on initial page load.
- Test `Other Selections`, `Timelines`, `Share`, and `Help` are collapsed on initial page load.
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
- Test generated menu markup contains `Other Selections` immediately after `Satellite Selection`.
- Test generated menu markup contains `Share` immediately after `Timelines` and before `Help`.
- Test the server status icon exposes connected, checking, disconnected, and error states through CSS and accessible text.
- Test connected status uses `icons/power_green.png` and disconnected/error status uses `icons/power_red.png`.
- Test the server status panel includes server URL, connection state, data source, app version, API version, last data load, and reconnect/refresh.
- Test the Share section includes `Copy Link`, native share fallback behavior, generated link output, and copied/error feedback.
- Test Share links serialize selected satellite, view mode, filters, simulation time, and display settings without local paths, credentials, or server configuration.
- Test shared links restore supported app state only after satellite data loads and fail safely if the referenced satellite is unavailable.
- Test the Help section contains GitHub, README Markdown, Releases History Markdown, Licenses, Swagger, and API document actions.
- Test README and Releases History render safe Markdown in the Help panel, with raw HTML escaped.
- Test the Releases History action targets `PROMPT_History.md` and no Help action displays the old `Prompt History` text.
- Test Swagger/API/Licenses actions open separate pages or views and are not disabled solely because the Python server is offline.
- Test the prohibited concatenated Swagger/API sentence is absent.
- Test the GitHub Help link uses `target="_blank"` and `rel="noopener noreferrer"`.
- Test the Help section contains the legal disclaimer and mentions `satellite.js`.
- Test Close, version text, and server status align horizontally and vertically on desktop and wrap only as needed on narrow screens.
- Test ISS selected-model orientation maps local `+X` to velocity, local `+Y` to the right-handed cross-track/starboard axis, and local `+Z` to nadir.
- Test ISS orientation diagnostics include `orientationMode`, `modelAxisMapping`, `calibrationYawDeg`, `calibrationPitchDeg`, and `calibrationRollDeg`.

### Server Data Path

- Test `/api/health` returns status `ok` and version metadata.
- Test `/api/version` returns app/API version `1.5.17` and release date `2026-06-06`.
- Test `/api/tle` and `/api/satellites` return valid TLE records with `norad_id`, `tle_line1`, and `tle_line2`.
- Test `/api/satellite-metadata` lists known metadata files.
- Test `/api/satellite-metadata/starlink_V1.json` returns one known metadata payload.
- Test `/api/decayed` returns the confirmed decay dataset.
- Test `/docs` serves the Swagger/API documentation page.
- Test `/openapi.json` contains OpenAPI paths for all supported API endpoints.
- Test frontend disconnected mode falls back to local `json/tle/TLE.json`.
- Test frontend connected mode uses server-provided TLE data.
- Test malformed server TLE data is rejected and local fallback remains active.
- Test model metadata and decay-data fetches use server routes only when the server is connected and fall back to local paths on failure.

### Regression Coverage

- Keep the existing day/night unit tests passing.
- Add clear test names and failure messages.
- Avoid tests that depend on the current wall-clock time unless the time is explicitly injected.
- Keep browser smoke tests separate from deterministic unit tests.
- Test startup timing/deferred-work helpers.
- Test the `index.html` startup structure so first render starts before awaiting TLE setup.
- Test accordion headers, accessible accordion semantics, searchable satellite selector markup, timeline checkbox toggles, filter reset/status/empty state, and selected tag active styling.
- Test the menu toggle and time slider use ASCII-safe visible labels.

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
  - Debris: `Show` selected.
- Confirm the satellite count and satellite dropdown populate after TLE data loads.

## Menu UX Regression

- Compare the menu against the problem screenshot and confirm the red-circled menu toggle shows readable text such as `Close` or `Menu`, not corrupted characters.
- Confirm the time slider label is readable as `Time x` and is not obscured by the narrowed menu.
- Confirm headings, accordion labels, helper text, toggle icons, time slider labels, and menu buttons render without visible mojibake.
- Confirm the left menu is thinner than Version 1.5.1 but still usable on desktop and narrow viewports.
- Confirm the `Filters - Satellites Found` numeric count is red and bold in both expanded and collapsed filter states.
- Confirm `Views & Time`, `Satellite Selection`, and `Filters - Satellites Found` start expanded on every `index.html` load, even after previously changing accordion states.
- Confirm `Other Selections`, `Timelines`, `Share`, and `Help` start collapsed on every `index.html` load.
- Confirm the Settings accordion section is not present.
- Confirm multiple accordion sections can stay open at the same time.
- Confirm selecting filters, tags, debris modes, timelines, and view toggles does not collapse unrelated accordion sections.
- Confirm the accordion order is `Views & Time`, `Satellite Selection`, `Filters - Satellites Found`, `Other Selections`, `Timelines`, `Share`, `Help`.
- Confirm `Satellite Selection` appears immediately under `Views & Time`.
- Confirm `Filters - Satellites Found` appears immediately under `Satellite Selection`.
- Confirm the visible orbit-filter helper text `Orbit filter (multi-select): Choose one or more orbit families. ALL enables every orbit category.` is gone.
- Confirm the visible satellite-search helper text `Select Satellite: Search by name, NORAD ID, orbit type, or tag.` is gone.
- Confirm the `Views & Time` section keeps `Globe` and `Mercator` on one row.
- Confirm the `Views & Time` section keeps `High Def.`, `ECEF Axes`, and `Day/Night` on one row.
- Confirm the `Views & Time` section keeps `First Starlink` and `ISS` shortcut buttons on one row.
- Confirm the `Views & Time` section includes a real menu `Time x` slider at the top.
- Confirm the existing canvas-top `Time x` slider remains visible.
- Move the menu `Time x` slider and confirm the canvas-top slider, displayed value, and simulation speed update.
- Move the canvas-top `Time x` slider and confirm the menu slider, displayed value, and simulation speed update.
- Confirm the satellite-specific checkbox block is hidden before selecting a satellite.
- Click `First Starlink` and confirm the first loaded Starlink is selected, `Show only selected satellite` becomes checked, only that satellite remains visible, `High Def.` becomes checked, and the selected-satellite camera/model path matches normal satellite selection.
- Click `ISS` and confirm ISS/ZARYA NORAD `25544` is selected through the normal selection path, `Show only selected satellite` becomes checked, only ISS remains visible, and `High Def.` becomes checked because ISS is not MEO/GEO.
- Select a MEO or GEO satellite after High Def. is enabled and confirm the app does not force High Def. off.
- Select a satellite that is outside the current filter selection through a shortcut and confirm the selected satellite remains visible even though the filter list is different.
- After selecting a satellite, focus or click the satellite search field and confirm the previous selected label clears for a new search while the selected-satellite summary and selected marker/model remain active.
- After selecting a satellite, type or paste into the already-focused search field and confirm the previous selected label clears before the new query is entered.
- Confirm the Starlink shortcut label updates to `Starlink (<NORAD ID>)` after TLE data loads.
- Confirm the Starlink shortcut shows `Starlink unavailable` if no Starlink target can be resolved.
- Confirm the ISS shortcut shows `ISS unavailable` if no ISS target can be resolved.
- Confirm `Other Selections` appears immediately after `Filters - Satellites Found`.
- Confirm `Share` appears immediately after `Timelines` and immediately before `Help`.
- Confirm `Close`, `Version 1.5.17 - hosted at GitHub Repo`, and the server status icon/text are aligned on one compact row on desktop.
- Confirm the version/GitHub text is centered in the menu header.
- Confirm the server status indicator appears above the accordion menu and does not shift layout when changing between checking, offline, connected, and error states.
- Confirm connected status uses `power_green.png` and offline/error status uses `power_red.png`.
- Confirm the status panel shows server URL, connection state, data source, version values, last load time, and reconnect/refresh.
- Confirm `Copy Link` produces a URL that restores supported state after data loads.
- Confirm native share is enabled only when the browser supports it.
- Open Help and confirm the `GitHub`, `README`, `Releases History`, `Licenses`, `Swagger`, and `API` actions are readable and clickable.
- Click `README` and confirm the README content renders as Markdown inside Help, not as raw plain text.
- Click `Releases History` and confirm `PROMPT_History.md` content renders as Markdown inside Help, not as raw plain text.
- Confirm no visible Help action uses the old `Prompt History` label.
- Open Help while the Python server is disconnected and confirm Swagger/API actions still open separate pages using the default local server URLs.
- Open Help while the Python server is connected and confirm Swagger and API links open the connected server pages.
- Confirm the GitHub Help link opens in a new tab and the Markdown/license links use relative repository paths.
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
- Rotate the 3D camera until part of the selected red orbit should pass behind Earth.
- Confirm the behind-Earth orbit arc is hidden by Earth.
- Confirm the front-side selected orbit arc remains visible.
- Confirm no red orbit segment appears across Earth unless it is physically in front of the globe from the current camera viewpoint.
- Repeat the orbit-occlusion check with at least one LEO satellite, one MEO satellite, and one GEO satellite.
- Confirm beam, footprint, satellite marker, Earth rendering, filters, timelines, YPR controls, and view controls still work.
- Confirm dense panels, satellite metadata, and search results scroll internally after menu narrowing.
- Confirm the vertical tab rail is gone.
- Confirm the left menu shows stacked accordion sections for Views & Time, Filters, Satellite Selection, Other Selections, Timelines, Share, and Help.
- Confirm each accordion header keeps the legacy dark navy/blue style and colored left accent.
- Confirm expanded accordion headers are readable, especially `Filters - Satellites Found` and `Satellite Selection` on initial page load.
- Confirm the numeric satellite count in `Filters - Satellites Found` is red and bold in both expanded and collapsed states.
- Confirm the menu is visibly thinner than Version 1.5.4 while filters, reset button, search, YPR sliders, timeline checkboxes, metadata, and view controls remain usable.
- Confirm the time slider remains readable and unobscured after the menu narrowing.
- Confirm the expanded header chevron/toggle marker remains visible.
- Confirm collapsed accordion headers remain readable.
- Confirm every section is collapsed immediately after loading `index.html`.
- Expand `Views & Time`, expand `Timelines`, then expand `Other Selections`; confirm multiple sections remain open simultaneously.
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
- Confirm `Other Selections` is blue-styled and collapsible.
- Confirm changing `Earth`/`Moon` is not reset by collapsing or expanding accordion sections.

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

- Confirm `Show Launch Timeline` and `Show Re-entry Timeline` appear in the `Timelines` accordion section before `Other Selections`.
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

### Debris Filter

- Confirm `Show` displays normal satellites and debris candidates.
- Confirm `Hide` excludes debris candidates such as names containing `DEB`, `DEBRIS`, `R/B`, `ROCKET BODY`, or `STAGE`.
- Confirm `Debris only` shows only debris candidates and updates the satellite count and dropdown.
- Confirm switching debris modes preserves a valid tag selection or safely returns to `All tags` when the selected tag is no longer available.

## Cross-Filter Regression

- Test `LEO` plus `Starlink`.
- Test `LEO` plus `One Web`.
- Test `GEO` plus `SES`.
- Test `GEO` plus `Intelsat`.
- Test `MEO` plus `Galileo`.
- Test multiple orbit selections plus multiple tag selections.
- Test each of the above with `Show`, `Hide`, and `Debris only`.
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
  - An `O3b` satellite loads the O3b OBJ/MTL model from `obj/`.
  - `ISS` loads the ISS GLB model from `obj/` when available in the filtered selection.
  - `ISS` visually uses the reference orbital orientation: `+X` velocity, `+Y` starboard/right-handed cross-track, and `+Z` nadir.
  - ISS selected-model diagnostics report `orientationMode: "iss-velocity-nadir-frame"` plus yaw, pitch, and roll calibration values.
  - From at least two camera angles, ISS remains inspectable and Earth remains visible in the initial selected view.
  - A GOES/Intelsat/SES-style GEO satellite loads the SSL 1300 fallback model when applicable.
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
- Use `Other Selections` to switch to `Moon`, then back to `Earth`; confirm filters return to the default startup state.
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
  - Switch debris mode to `Debris only`.
  - Select one satellite and enable orbit display.
  - Confirm selecting the satellite auto-checks `Show only selected satellite`, leaves only the selected object visible, and keeps the selected satellite active after clearing the search field for a new query.
  - Confirm selecting a LEO/Starlink/ISS satellite auto-checks `High Def.` and selecting MEO/GEO afterward does not force High Def. off.
  - Confirm the 3D orbit path has no visible line through Earth caused by invalid propagation samples.
  - Select a Starlink satellite and confirm a local detailed model appears.
  - Confirm the Starlink detailed model is visually centered, close to the camera, uses the reference-image orientation, has Earth/horizon behind and below it instead of centered directly behind it, and remains visible while moving.
  - Confirm the selected-model camera/observer eye is using the 100 m default distance in the console `selectedView` diagnostics.
  - Confirm the selected Starlink diagnostics report `observerPlacement: "starlink-oblique-orbital-frame"` and orientation mode `starlink-velocity-nadir-frame`.
  - Confirm the Starlink shortcut label includes the resolved NORAD ID.
  - Select ISS from the shortcut and confirm the selected ISS diagnostics report `orientationMode: "iss-velocity-nadir-frame"` and the ISS model visually follows the reference velocity/nadir/starboard orientation.
  - Open Help and confirm GitHub, README, Releases History, Licenses, Swagger, API, and the disclaimer are present.
  - Click README and Releases History and confirm each document renders as Markdown in the Help panel.
  - Open Share and confirm Copy Link creates a safe share URL.
  - Open Help and confirm Swagger/API docs open separate pages even when the Python server is not running.
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
```

Expected:

- `index.html` loads from the Python server.
- The status icon changes from checking to connected.
- Satellite data source shows live server.
- Swagger/API docs links open separate documentation pages from Help.
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

- Confirm the default `obj/starlink_V1.obj` loads with either its MTL material or fallback material.
- Use the model selector to load at least one OBJ/MTL model and one GLB model from `obj/`.
- Use the custom model field with examples such as `ISS.glb`, `oneweb.obj`, or `starlink_V1` and confirm local assets can be loaded without changing code.
- Confirm each loaded model is centered, lit, nonblank, and orbit/zoom controls work.
- Compare this isolated view with selecting the matching satellite in `index.html`; both should show a visible model.

## Completion Checklist

Before reporting completion, go through this file and record which checks were performed.

- `npm test` passes.
- JavaScript syntax checks pass for all `js/*.js`.
- Extracted module syntax checks pass for `index.html` and `display_satellite.html`.
- Deep automated tests cover the coordinate-frame, orbit, Sun, Moon, scaling, selected-satellite model resolution, selected-satellite framing/orientation, footprint, menu, and URL-helper requirements above.
- Automated tests cover Starlink OBJ visual bounds, selected camera distance behavior for exact 100 m target framing, deterministic satellite-visibility projection checks, Starlink velocity/nadir orientation, and oblique non-radial observer placement.
- Browser smoke test over HTTP passes.
- Isolated `display_satellite.html` local model viewer checks pass for Starlink default, another OBJ/MTL model, a GLB model, and a custom entry.
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
- `PROMPT.md` was reduced to only the `General Execution Prompt` section.
- `PROMPT_History.md` contains the latest `Release Date: 2026-06-03 Version 1.4.3` entry.
- `index.html` visible version tag was updated to `1.4.3`.
- `index.html` import map uses `three@0.184.0` for both `three` and `three/addons/`.
- `display_satellite.html` import map uses `three@0.184.0` for both `three` and `three/addons/`.
- `npm test`: passed, including `releaseStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `node --check .\tests\releaseStructure.test.js`: passed.
- Extracted `index.html` module script plus `node --check`: passed.
- Extracted `display_satellite.html` module script plus `node --check`: passed.
- Local HTTP smoke check with `py -m http.server 8000 --bind 127.0.0.1`: `http://127.0.0.1:8000/index.html` returned `HTTP 200 OK`.
- Local HTTP smoke check with `py -m http.server 8000 --bind 127.0.0.1`: `http://127.0.0.1:8000/display_satellite.html` returned `HTTP 200 OK`.

Checks not fully performed in this terminal:

- Runtime browser confirmation that `OrbitControls`, `OBJLoader`, `MTLLoader`, `GLTFLoader`, and `CSS2DRenderer` load from `three@0.184.0`. No headless browser executable was available on `PATH`, so direct browser runtime validation remains manual.

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
- README Markdown index was checked against repository Markdown files: `PROMPT.md`, `PROMPT_History.md`, `README.md`, and `Test_and_Integration.md`.

Checks not fully performed in this terminal:

- Full visible-browser confirmation of the new View-row layout, First Starlink/ISS shortcut clicks, auto High Def. behavior, show-only visibility, and search-field clearing remains manual unless a browser automation environment is available.

## Release 1.5.12 Verification Log

Checks performed on 2026-06-04:

- `PROMPT_History.md` contains the latest `Release Date: 2026-06-04 Version 1.5.12` entry at the top.
- `index.html` visible version tag is `1.5.12`.
- Starlink shortcut dynamic state returns `Starlink (<NORAD ID>)` and `Starlink unavailable`.
- ISS shortcut dynamic state returns `ISS` and `ISS unavailable`.
- Help accordion section appears after Settings and includes GitHub, README, Prompt History, License, and disclaimer content.
- ISS selected-model orientation uses `iss-velocity-nadir-frame` diagnostics with yaw/pitch/roll calibration values.
- `npm test`: passed, including `encodingUx.test.js`, `menuUx.test.js`, `modelResolver.test.js`, `modelVisualFraming.test.js`, `releaseStructure.test.js`, `satelliteOrbitOcclusion.test.js`, `selectedSatelliteView.test.js`, `shortcutLabels.test.js`, `startupPerformance.test.js`, and `startupStructure.test.js`.
- `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- `Get-ChildItem -File .\tests -Filter *.js | ForEach-Object { node --check $_.FullName }`: passed.
- Extracted `index.html` module script plus `node --input-type=module --check`: passed.
- Extracted `display_satellite.html` module script plus `node --input-type=module --check`: passed.
- `git diff --check`: passed with only LF-to-CRLF normalization warnings for edited files.
- Local HTTP smoke check with `py -m http.server 8883 --bind 127.0.0.1`: `http://127.0.0.1:8883/index.html` returned `HTTP 200`.
- README Markdown index was checked against repository Markdown files: `PROMPT.md`, `PROMPT_History.md`, `README.md`, and `Test_and_Integration.md`.

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
- Static tests confirm Help includes GitHub, README, Releases History, Licenses, Swagger, API, and a bottom disclaimer.
- Static tests confirm `Releases History` targets `PROMPT_History.md` and the old visible `Prompt History` label is not used.
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
- The optional Python server exposes `/api/health`, `/api/version`, `/api/tle`, `/api/satellites`, `/api/satellite-metadata`, `/api/decayed`, `/docs`, and `/openapi.json`.
- Connected mode loads TLE data from the Python server and labels the active data source as server-backed.
- Disconnected, invalid, slow, or unavailable server states fall back to local file loading without breaking existing behavior.
- The status icon exposes checking, connected, disconnected/offline, and error states with tooltip text and accessible labels.
- The status panel shows server URL, connection state, data source, app/API version, last load time, and reconnect/refresh.
- Close, version text, and server status are horizontally aligned and vertically centered on desktop.
- The Share accordion appears immediately before Help and its UI matches the existing accordion/menu styling.
- Share links copy and restore supported state without including local filesystem paths, tokens, or private server configuration.
- Share can preview, download, copy, and natively share the current canvas image when the browser supports those APIs.
- Help includes Swagger/API documentation links that open separate pages and remain clickable while offline.
- Help renders README and Releases History Markdown inside the app and keeps `PROMPT_History.md` available through the `Releases History` action.
- The Views & Time menu keeps a synchronized menu Time x slider, Globe/Mercator, High Def./ECEF Axes/Day-Night, and First Starlink/ISS controls.
- The canvas-top Time x slider remains visible, and both Time x sliders control one shared simulation-speed state.
- The obsolete visible helper text for Views & Time, the orbit filter, and Satellite Selection is removed without leaving empty layout gaps.
- Selecting any satellite automatically checks `Show only selected satellite` and hides all non-selected satellites.
- The selected satellite remains visible in show-only mode even when current filters would otherwise hide it.
- Selecting a non-MEO/GEO satellite automatically enables `High Def.` Earth, and MEO/GEO selections never force High Def. off.
- First Starlink and ISS shortcuts use the normal satellite selection path and move the observer to the selected satellite.
- The Starlink shortcut displays `Starlink (<NORAD ID>)` after TLE data loads and `Starlink unavailable` when unresolved.
- The ISS shortcut displays `ISS` when resolved and `ISS unavailable` when unresolved.
- ISS selected-model orientation maps `+X` to velocity, `+Y` to starboard/right-handed cross-track, and `+Z` to nadir.
- ISS orientation diagnostics include `iss-velocity-nadir-frame` and yaw/pitch/roll calibration values.
- The Help accordion appears after Share and contains GitHub, README, Releases History, Licenses, Swagger, API, and disclaimer content.
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
