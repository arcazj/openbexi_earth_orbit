# Test and Integration Plan

## Purpose

This plan verifies that the `openbexi_earth_orbit` application still works after filter, coordinate-frame, orbital math, rendering, scaling, and UI changes. It is the acceptance checklist for implementation work: all automated tests, browser checks, and manual regression items in this file must pass, or any remaining limitation must be documented before the task is considered complete.

Version 1.4 adds selected-satellite observer framing and Earth-facing orientation. In 3D mode, selected satellites should transition to a close observer view with Earth centered behind the satellite. In 2D/Mercator mode, selected satellites should be clearly highlighted without applying 3D-only camera-distance logic.

Version 1.4.1 fixes selected-satellite detailed model resolution. When a selected satellite has a related local OBJ/MTL or GLB asset under `obj/`, the app should load that local model; otherwise the selected TLE sprite must remain visible as the fallback.

Version 1.4.2 fixes the selected-satellite model visibility regression. Detailed selected models must be visibly inspectable in 3D, with the observer targeting about 100 meters from the satellite when practical, a documented visual fallback when app scaling requires it, and `display_satellite.html` available as an isolated local OBJ/MTL and GLB model viewer.

Version 1.4.3 cleans up prompt/release structure and dependency versioning. `PROMPT.md` must contain only the general execution prompt, release history must live in `PROMPT_History.md`, `index.html` must display the latest release version, and all browser import maps must use matching Three.js core/addon versions.

Version 1.4.4 fixes the `Show orbit` regression. 3D orbit geometry must reject non-finite, invalid, decayed, or below-Earth propagated samples before building line vertices. Mercator ground tracks must split across invalid samples and must identify the selected satellite by stable selected NORAD ID even when a detailed 3D model hides the selected sprite.

Version 1.4.5 fixes remaining `Show Orbit` rendering and filter menu issues. GEO orbit paths should keep their physical propagation radius but render with normal Earth depth occlusion, Mercator should show a visible GEO fallback track when the true ground track is nearly stationary, the Orbit filter should include `ALL`, and the filter menu should not expose an `Active` button.

## Test Environment

- Run from the repository root.
- Serve the app over HTTP. Do not use `file://` because ES modules and local JSON/assets require a web server.
- Recommended local server:

```powershell
py -m http.server 8000 --bind 127.0.0.1
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
- Test the selected-satellite observer distance never falls below the physical target and uses a documented visual fallback when the literal distance would clip or make the satellite unreadable.
- Test selected-satellite camera framing places the observer outward from Earth through the selected satellite, with Earth behind the satellite.
- Test detailed-model framing can use a reduced camera near plane so the model is not forced into the old Earth-radius fallback distance.
- Test Starlink visual framing uses the local Starlink OBJ bounds and keeps the model large enough to inspect.
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
- Test the Orbit filter includes `ALL`, `GEO`, `MEO`, `LEO`, `HEO`, and `Other`.
- Test the filter menu does not contain an `Active` button/control.
- Test the View section has one collapsible container containing Globe, Mercator, High Def., ECEF Axes, and Day/Night controls.
- Test Yaw/Pitch/Roll sliders are hidden by default, shown when enabled, and hidden again when disabled.
- Test `getFullGitHubUrl()` handles `null`, `undefined`, non-string values, absolute URLs, and relative paths without throwing.

### Regression Coverage

- Keep the existing day/night unit tests passing.
- Add clear test names and failure messages.
- Avoid tests that depend on the current wall-clock time unless the time is explicitly injected.
- Keep browser smoke tests separate from deterministic unit tests.

## Startup Regression

- Load `index.html` through the local HTTP server.
- Confirm the 3D globe renders.
- Confirm satellite markers render around the globe.
- Confirm the UTC clock updates.
- Confirm the left menu opens and closes with the menu button.
- Confirm the default filter state is:
  - Orbit: `MEO` selected.
  - Tags: `All tags` selected.
  - Debris: `Show` selected.
- Confirm the satellite count and satellite dropdown populate after TLE data loads.

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
  - A GOES/Intelsat/SES-style GEO satellite loads the SSL 1300 fallback model when applicable.
- Confirm selecting a satellite with a detailed model lowers near-plane clipping enough that the model is not clipped when the camera is close.
- Confirm the selected-model fill light makes the model visible even when asset materials or texture lighting are weak.
- Confirm the selected-model diagnostics in the console report mesh count, bounding diameter, scale, attempted asset paths, and visibility status.
- Select a satellite with no model mapping and confirm the sprite fallback remains visible.
- Switch between two satellites quickly and confirm the app never displays a model for the previously selected satellite.
- Toggle `Show Footprint`.
- Toggle `Show only selected satellite`.
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
- Select a representative MEO satellite and confirm:
  - Its altitude and orbit radius are visually between LEO and GEO.
  - Its orbit trail remains aligned with the marker.
  - Its footprint is larger than LEO and smaller than GEO.
  - Selected-satellite framing keeps Earth centered behind the satellite and remains readable.
- Select a representative GEO satellite and confirm:
  - It remains near a fixed longitude in Mercator view.
  - Its orbit trail is visually consistent with an equatorial/geosynchronous path.
  - Its footprint is wider than LEO/MEO and remains finite.
  - Selected-satellite framing keeps Earth centered behind the satellite and remains readable.
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
  - Confirm the 3D orbit path has no visible line through Earth caused by invalid propagation samples.
  - Select a Starlink satellite and confirm a local detailed model appears.
  - Confirm the Starlink detailed model is visually centered, close to the camera, and has Earth centered behind it.
  - Select a satellite without a model mapping and confirm the selected sprite stays visible.
  - Rapidly select two different satellites and confirm stale model loads do not attach to the scene.
  - Toggle Mercator view.
  - Confirm the selected satellite has a visible Mercator selection ring.
  - Confirm the selected satellite ground track remains visible in Mercator when the detailed 3D model hides the sprite.
  - Select `ALL` in the Orbit filter and confirm all orbit categories populate the count and dropdown.
  - Confirm there is no `Active` filter button/control.
  - Toggle Globe off, select a satellite in Mercator-only mode, then toggle Globe on and confirm 3D selected-satellite framing.
  - Toggle Yaw-Pitch-Roll on and off.

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
- Automated tests cover Starlink OBJ visual bounds and selected camera distance behavior for 100 m target framing.
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

## Acceptance Criteria

- The app loads over HTTP without runtime errors.
- The new filter UI works with multi-select orbit and tag combinations.
- Debris filtering works and defaults to the previous inclusive behavior.
- Satellite count, visible markers, and dropdown stay consistent after each filter change.
- Existing non-filter controls continue to work.
- Known local detailed models load from `obj/` for selected satellites.
- Detailed selected models are visibly inspectable in 3D and are not clipped by the default near plane.
- Selected satellites remain visible through the sprite fallback when no model exists or model loading fails.
- Stale asynchronous model loads do not attach after the user changes selection.
- Selected-satellite 3D framing, 2D/Mercator highlighting, and nadir-oriented YPR/model behavior work without fighting manual camera controls.
- Deep automated tests pass through `npm test`.
- Browser smoke testing over HTTP passes.
- The full checklist in this file has been followed, and any pre-existing unrelated failures or intentional approximations are documented.
