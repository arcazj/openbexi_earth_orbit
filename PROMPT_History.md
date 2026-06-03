# Prompt History

## Release Date: 2026-06-03  Version 1.4.5

Analyze the attached screenshot and fix the remaining `Show Orbit` rendering issues. Also update the filter menu behavior.

Important clarification:
This does not appear to be primarily an orbit calculation problem. The GEO orbit radius looks plausibly large enough, but the red 3D orbit line is rendered visually on top of the Earth instead of being hidden when it is behind the globe. Treat this first as a rendering/depth/occlusion/layering issue, not as a TLE propagation or orbital-radius issue.

Visible issues:

1. GEO 3D orbit rendering:
   - Selected satellite: `INTELSAT 10-02`.
   - The red GEO orbit line appears to cut across the Earth.
   - The likely issue is that the orbit line is drawn through/on top of the Earth because of depth testing, render order, material settings, or scene layering.
   - If part of the orbit is behind Earth from the camera viewpoint, Earth should occlude it.
   - Do not "fix" this by changing the physical GEO orbit radius unless a test proves the radius is wrong.

2. Mercator ground track:
   - The Mercator inset shows the selected satellite and footprint rings.
   - The selected satellite orbit/ground track is not visible.
   - When `Show Orbit` is enabled, Mercator must show a visible selected-satellite ground track.
   - For GEO satellites, if the ground track is almost stationary, show a clear small segment, marker, or GEO track fallback that is visible at the inset size.

3. Filter menu updates:
   - Remove the `Active` button/control from the filter menu.
   - Add an `ALL` option to the Orbit filter, alongside `GEO`, `MEO`, `LEO`, `HEO`, and `Other`.
   - Selecting `ALL` should enable all orbit categories.
   - Selecting a specific orbit category should clear `ALL` unless the intended behavior is explicitly documented otherwise.
   - The default orbit filter can remain `MEO` unless the app requirements say otherwise.
   - Update filtering logic, UI state, and tests so `ALL` behaves consistently.

Please investigate:

- Whether the 3D orbit material has `depthTest: false`, `depthWrite: false`, transparent rendering, high `renderOrder`, or another setting that makes it draw over Earth.
- Whether Earth material or renderer settings prevent proper depth occlusion.
- Whether the orbit line is being added to a scene/layer that bypasses normal depth testing.
- Whether the first orbit sample still matches the selected satellite's current propagated scene position.
- Whether GEO orbit radius is physically plausible, only as a verification step.
- Whether Mercator ground-track points are generated but hidden, too small, covered by footprint rings, cleared every frame, or drawn in the wrong order.
- Where the `Active` filter button is generated and whether removing it affects saved filter state or tests.
- Whether the orbit filter normalization already has partial `ALL` support that only needs a visible button.

Acceptance criteria:

- GEO orbit is physically unchanged unless proven wrong.
- 3D orbit line is properly occluded by Earth when behind the globe.
- The visible portion of the orbit no longer appears to cut through Earth.
- First orbit point still aligns with the selected satellite marker/model.
- Mercator ground track is visible when `Show Orbit` is enabled.
- GEO satellites have a visible Mercator fallback if the true ground track is nearly stationary.
- `Active` button/control is removed from the filter menu.
- Orbit filter includes `ALL`, `GEO`, `MEO`, `LEO`, `HEO`, and `Other`.
- `ALL` selects all orbit categories and updates count, markers, dropdown, and tags correctly.
- Selecting specific orbit categories behaves predictably with `ALL`.
- Switching satellites refreshes both 3D orbit and Mercator ground track.
- Turning `Show Orbit` off clears both 3D and Mercator orbit/track visuals.
- Add or update tests for orbit rendering assumptions, GEO radius sanity, Mercator GEO track visibility, and Orbit filter `ALL` behavior.
- Update `README.md` and `Test_and_Integration.md`.
- Document manual screenshot verification in `Test_and_Integration.md`.

---

## Release Date: 2026-06-03  Version 1.4.4

Fix the "Show orbit" regression while keeping `satellite.js@6.0.2`.

When a satellite is selected and `Show orbit` is enabled, the 3D orbit trajectory must remain physically coherent and the Mercator ground track must render reliably for the selected satellite. Recent release work introduced selected-model visibility changes and shared frame utilities; verify those changes did not break orbit rendering or selected-satellite state.

Requirements:

1. Harden 3D orbit trajectory generation.
   - In `js/satelliteTLELoader.js`, reject propagated positions whose `x`, `y`, or `z` values are not finite before adding them to orbit geometry.
   - Do not create `THREE.BufferGeometry` with `NaN`, `Infinity`, or missing position values.
   - Stop or split the generated path when propagation becomes invalid or when the propagated radius is below Earth.
   - Keep the first generated orbit point aligned with the selected satellite's current propagated scene position.

2. Harden Mercator ground-track generation.
   - In `js/mercatorMapLoader.js`, reject non-finite propagated positions and non-finite geodetic latitude/longitude before drawing.
   - Do not connect line segments across invalid samples, antimeridian jumps, or decayed/below-Earth samples.
   - Keep the Mercator ground track synchronized with the current simulation time.

3. Fix selected-satellite state for Mercator.
   - The Mercator selected satellite must not depend only on sprite visibility.
   - If a detailed 3D model is displayed and the sprite is hidden, Mercator must still identify and draw the selected satellite and its ground track.
   - Persist a stable selected NORAD ID or equivalent state in `simParams`, and use it as the first-choice selected-satellite lookup.

4. Preserve current 3D selected-model behavior.
   - Keep the selected sprite visible while a detailed model loads.
   - Hide the sprite only after the detailed model is confirmed visible.
   - If detailed model loading fails, preserve the selected sprite and orbit behavior.

5. Add focused tests.
   - Add or update orbit-generation tests proving non-finite propagation samples are skipped or split safely.
   - Add tests proving below-Earth propagated samples do not create lines through Earth.
   - Add Mercator selection tests proving a selected satellite can be found by stable selected NORAD ID even when its mesh is hidden.
   - Keep existing tests passing.

6. Update documentation and verification.
   - Update the visible version in `index.html` to match this release.
   - Update `Test_and_Integration.md` with the new orbit and Mercator regression checks.
   - Update `README.md` if controls, testing, release/versioning, or known limitations changed.
   - Run `npm test` and JavaScript syntax checks.

Acceptance criteria:

- `Show orbit` produces no non-finite vertices in 3D orbit geometry.
- Invalid/decayed/below-Earth propagation samples do not create lines through Earth.
- Mercator ground track renders for the selected satellite even when a detailed 3D model hides the sprite.
- Switching satellites refreshes both the 3D orbit and Mercator ground track.
- Turning `Show orbit` off clears 3D orbit geometry and stops drawing the Mercator ground track.
- No new console errors are introduced.

---

## Release Date: 2026-06-03  Version 1.4.3

Clean up prompt/release structure and update Three.js versioning.

Requirements:

1. Keep `PROMPT.md` focused.
   - `PROMPT.md` must contain only the `General Execution Prompt` section.
   - Move all release-specific prompts, release requirements, and release history into `PROMPT_History.md`.
   - Do not duplicate release history in `PROMPT.md`.

2. Keep release versioning synchronized.
   - For every new release in `PROMPT_History.md`, update the visible version tag in `index.html`.
   - The `index.html` version number must always match the latest release version from `PROMPT_History.md`.
   - Example: if the latest release is `Version 1.4.2`, `index.html` must display `1.4.2`.

3. Update Three.js import map.
   - Verify the current latest stable `three` version from npm before changing it.
   - Update both core Three.js and addons to the same version.
   - Do not mix versions between `three` and `three/addons`.

Expected import map format:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.184.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.184.0/examples/jsm/"
  }
}
</script>
```

4. Verify compatibility.
   - Confirm `OrbitControls`, `OBJLoader`, `MTLLoader`, `GLTFLoader`, and `CSS2DRenderer` still load correctly after the Three.js update.
   - Confirm `index.html` and `display_satellite.html` still load over HTTP.
   - Run `npm test`.
   - Run JavaScript syntax checks.
   - Update `Test_and_Integration.md` with any new verification steps or known limitations.
   - Update `README.md` if setup, dependencies, versioning rules, or documentation structure changed.

Acceptance criteria:

- `PROMPT.md` contains only `General Execution Prompt`.
- `PROMPT_History.md` contains all release history.
- `index.html` displays the latest release version.
- `three` and `three/addons/` use the same latest verified version.
- Tests and HTTP smoke checks pass or limitations are documented.

---

## Release Date: 2026-06-03  Version 1.4.2

Fix the 3D selected-satellite model visibility regression.

When selecting a satellite that has a related local OBJ/MTL or GLB model, the model must be clearly visible in the 3D scene. The camera/observer should move close to the selected satellite, targeting an apparent real-world distance of about 100 meters, with Earth centered behind the satellite.

Investigate why the selected model is not visually appearing or is too small, hidden, transparent, clipped, incorrectly positioned, incorrectly scaled, incorrectly oriented, outside the camera view, or obscured by sprite/model visibility logic.

Requirements:

1. Verify model resolution and loading.
   - Confirm the correct local asset is resolved from `./obj`.
   - Confirm Starlink resolves to the Starlink model.
   - Confirm OneWeb, O3b, ISS, and SSL 1300 fallback mappings still work.
   - Log the selected satellite name, NORAD ID, resolved asset path, metadata path, and load result.

2. Verify the model is actually visible in 3D.
   - Confirm the model is added to the active Three.js scene.
   - Confirm it has visible geometry, materials, nonzero bounding box, and nonzero scale.
   - Confirm it is not transparent, fully black, unlit, frustum-culled, behind Earth, or clipped by camera near/far planes.
   - Add fallback material or lighting if textures/materials fail.

3. Fix selected-satellite camera framing.
   - Move the observer/camera close to the selected satellite, targeting approximately 100 meters.
   - Convert 100 meters into scene units using the app scale.
   - If the app's visual scaling makes the literal distance unusable, use a documented visual fallback while preserving the intended close-satellite view.
   - The selected model should be centered and large enough to see clearly, with Earth visible and centered behind it.
   - Camera controls should not immediately fight or reset the selected-satellite framing.

4. Fix selected model placement and updates.
   - Position the loaded model at the selected satellite's propagated position.
   - Keep the model following the selected satellite as simulation time advances.
   - Apply nadir/Earth-facing orientation and yaw/pitch/roll consistently.
   - Ensure rapid satellite selection does not display stale models.

5. Preserve fallback behavior.
   - Keep the selected sprite visible while the model loads.
   - Hide the sprite only after the detailed model is confirmed visible.
   - If the model fails to load or cannot be made visible, keep the selected sprite visible and selected.

6. Add visual verification tests.
   - Use or create an isolated model viewer such as `display_satellite.html` to load the Starlink model directly from `./obj`.
   - Verify Starlink is visually visible in `display_satellite.html`.
   - Compare the isolated viewer behavior with `index.html` selection behavior.
   - Add a browser/manual test that selects a Starlink satellite in `index.html` and confirms the detailed model is visible, centered, and close to the camera.
   - Where practical, add automated or screenshot-based checks that confirm the rendered selected model is not blank and occupies a meaningful screen area.

Update `Test_and_Integration.md` with these checks.

Acceptance criteria:

- Selecting a Starlink satellite visibly shows the Starlink 3D model in `index.html`.
- The camera moves close to the model, approximately 100 meters apparent observer distance, with Earth centered behind it.
- The model remains visible while simulation time advances.
- `display_satellite.html` or an equivalent isolated viewer can visually display the Starlink model from `./obj`.
- If the detailed model cannot be displayed, the selected sprite remains visible.
- Existing orbit, footprint, camera, Mercator, and yaw/pitch/roll behavior still works.

---

## Release Date: 2026-06-03  Version 1.4.1

Fix 3D model loading for selected satellites.

When a satellite is selected in `index.html`, the app should display its related local 3D model when one exists under `./obj`. For example, Starlink satellites should load the available Starlink OBJ/MTL or GLB model instead of showing only the default satellite sprite.

Inspect the full satellite-selection and model-loading flow, including `index.html`, `js/satelliteModelLoader.js`, satellite metadata under `json/satellites/`, and local assets under `obj/`.

Requirements:

1. Build a deterministic model-resolution strategy.
   - Match by NORAD ID when metadata exists.
   - Fall back to normalized satellite name, company/tag, or known constellation aliases such as `starlink`, `oneweb`, `o3b`, `iss`, and `ssl_1300`.
   - Matching must be case-insensitive and robust to spaces, hyphens, underscores, and file extensions.

2. Support local model assets.
   - Load OBJ/MTL pairs from `./obj`.
   - Load GLB files from `./obj`.
   - Prefer exact metadata mappings over generic constellation fallback models.
   - Do not depend on remote GitHub model files when a local model exists.

3. Fix selected-satellite display behavior.
   - Keep the fallback sprite visible while the model is loading.
   - Hide or de-emphasize the sprite only after the detailed model successfully loads.
   - If model loading fails, keep the sprite selected and visible.
   - Position, scale, and orient the loaded model at the selected satellite's current propagated position.
   - Keep the model updated as simulation time advances.

4. Prevent async selection bugs.
   - If the user selects another satellite while a model is still loading, ignore the stale load result.
   - Do not show a model for a previously selected satellite after selection changes.

5. Improve diagnostics.
   - Log which model path was attempted.
   - Log why a model was not found.
   - Log whether fallback sprite display was used.

6. Verify known local models.
   - Starlink satellites use the Starlink model in `./obj`.
   - OneWeb satellites use the OneWeb model when available.
   - O3b satellites use the O3b model when available.
   - ISS uses the ISS model when available.
   - GEO satellites with SSL 1300-style fallback mappings still load correctly.

7. Update tests and documentation.
   - Add automated tests for model-resolution logic where practical.
   - Update `Test_and_Integration.md` with manual checks for selecting Starlink, OneWeb, O3b, ISS, and a satellite without a model.
   - Update `README.md` if model asset conventions or limitations need documentation.

Acceptance criteria:

- Selecting a Starlink satellite visibly loads a Starlink 3D model from `./obj`.
- The selected model appears in the correct 3D position and follows the satellite over time.
- The app never leaves the user with no visible selected satellite if model loading fails.
- Switching selections quickly does not display the wrong model.
- Existing orbit, footprint, camera, and yaw/pitch/roll behavior still works.

---

## Release Date: 2026-06-03  Version 1.4

Improve selected-satellite framing, observer positioning, and Earth-facing orientation.

When a satellite is selected in 3D mode, smoothly move the observer/camera near the selected satellite, targeting an apparent real-world distance of approximately 75 to 100 meters from the satellite. Convert this distance into the app's scene units using the existing Earth/satellite scale model, and document the conversion or approximation if exact real-world scaling is not practical.

Frame the selected satellite clearly in the foreground while keeping Earth centered behind it. The final camera position should avoid clipping, keep the satellite readable, and make Earth visually prominent enough that the user immediately understands the satellite's relationship to Earth.

Orient the selected satellite so it is nadir-pointing toward Earth, meaning the configured Earth-facing axis of the satellite model points toward Earth's center. Define and document the model axis used for this orientation. Apply yaw, pitch, and roll consistently in the same scene coordinate frame used for satellite position, Earth position, orbit trails, and camera placement.

For 2D/Mercator mode, implement equivalent selected-satellite UX: center or highlight the selected satellite, keep the Earth/map context visible, and avoid applying 3D-only camera-distance logic where it does not make sense.

Preserve user control. The automatic camera move should happen on satellite selection or when an explicit follow/observer mode is enabled, but it should not continuously fight manual camera movement unless the user has enabled tracking.

Verify the behavior for LEO, MEO, GEO, and fast-moving satellites. Confirm that switching selected satellites, toggling between 2D and 3D views, enabling/disabling yaw-pitch-roll controls, and changing time/timeline state all keep the selected-satellite framing and Earth-facing orientation coherent.

Update `Test_and_Integration.md` with the new selected-satellite camera, orientation, 2D/3D view-switching, and manual-control regression checks. Add focused automated tests for reusable orientation/framing math where practical, and document any remaining visual-only limitations.

---

## Release Date: 2026-06-02  Version 1.3

Fix the issues found in the latest `openbexi_earth_orbit` code review and bring the app back to a fully tested state.

This is a broad physics/rendering refactor. Before implementing it, inspect `git status` and preserve the current filter/test-plan work by committing it, stashing it, or clearly documenting why it is safe to continue in the dirty worktree. Do not mix unrelated untracked/generated files into this work.

Implement Version 1.3 in small phases, with tests added before or alongside each phase:

1. Shared coordinate utilities and deterministic coordinate-frame tests.
2. 3D orbit trail alignment fixes and orbit-generation tests.
3. Sun/day-night frame fixes and Sun-direction tests.
4. Moon positioning and satellite model scaling fixes with domain tests.
5. UI cleanup fixes for duplicate View IDs, Yaw/Pitch/Roll visibility, and URL helper hardening.
6. Browser smoke testing and the full `Test_and_Integration.md` checklist.

After each major phase, run the relevant automated tests and update `Test_and_Integration.md` if the accepted procedure changes. Before reporting completion, go through `Test_and_Integration.md` from top to bottom and make sure every required automated test, browser smoke test, and manual regression item either passes or is explicitly documented as a remaining limitation.

### Required Fixes

1. Unify coordinate-frame handling across the app.
   - Define one clear scene-coordinate convention for Earth, satellites, orbit paths, Sun/day-night lighting, Moon, footprints, ECEF axes, orbit frame, and Mercator conversions.
   - Ensure live satellite markers, detailed satellite models, 3D orbit trails, footprints, Sun direction, and Moon position use consistent transforms.
   - Eliminate duplicated or contradictory ECI/ECEF/scene transform logic where practical.

2. Fix 3D orbit trail alignment.
   - Orbit lines must pass through the currently selected satellite marker/model at the current simulation time.
   - Use the same simulation date and scene transform as the live satellite update.
   - Avoid special GEO logic that leaves the orbit in a different frame unless it is physically justified and documented.

3. Fix 3D day/night and Sun direction.
   - Ensure the Sun vector, directional light, visible Sun, Earth rotation, and satellite positions are all in the same scene frame.
   - Confirm the rendered terminator is consistent with UTC time and Earth longitude.

4. Fix Moon positioning.
   - Either implement a more accurate low-precision lunar ephemeris or clearly isolate the current Moon as an approximate visual aid.
   - In either case, ensure its coordinates use the same scene transform convention as the rest of the 3D scene.

5. Fix satellite model scaling.
   - Remove hardcoded duplicate scale constants from `satelliteModelLoader.js`.
   - Import shared scale constants from `SatelliteConstantLoader.js`.
   - Make OBJ/GLB scale handling consistent.
   - Remove ignored scale calculations and undocumented legacy multipliers, or replace them with a named documented visual-scale factor.

6. Fix or remove broken `getOrbitECIPoints()`.
   - If kept, initialize its point array correctly, make it return useful data, and add a focused test.
   - If unused and unnecessary, remove it safely.

7. Fix duplicate `viewContent` IDs in the menu.
   - The View section must use one unique collapsible container containing all View controls.
   - Confirm Globe, Mercator, High Def., ECEF Axes, and Day/Night all collapse/expand together.

8. Fix Yaw/Pitch/Roll slider visibility.
   - Sliders should be hidden until the Yaw-Pitch-Roll toggle is enabled.
   - Toggling off should hide sliders and hide the YPR frame.
   - Toggling on should show sliders and update labels/frame state correctly.

9. Harden `getFullGitHubUrl()`.
   - Invalid or non-string paths must not throw.
   - Return `null` or a safe fallback consistently.

### Deep Test Requirements

Add focused automated tests for the fixes, not only browser smoke checks.

Required test coverage:

1. Coordinate-frame consistency:
   - Test that shared ECI/ECEF/scene transform functions produce consistent positions for the same satellite/time.
   - Test that a selected satellite marker and its generated orbit trail agree at the current simulation time within a small tolerance.
   - Test GEO, MEO, and LEO examples.

2. Orbit trail generation:
   - Test that orbit path generation starts from the simulation time, not wall-clock `Date.now()`.
   - Test that orbit path points are finite, non-empty, and scaled in scene units.
   - Test that switching selected satellites clears the old orbit geometry.

3. Day/night and Sun direction:
   - Test Sun vector normalization.
   - Test GMST conversion stays in `[0, 2 * Math.PI)`.
   - Test that the 3D Sun/light direction uses the same scene-frame transform convention as satellites.

4. Moon positioning:
   - Test Moon position returns finite scene coordinates.
   - Test Moon distance is within expected bounds.
   - If Moon remains approximate, add a test that documents the approximation and validates the expected model behavior.

5. Satellite model scaling:
   - Test OBJ/GLB unit conversion helpers for `m`, `cm`, `mm`, `km`, and numeric factors.
   - Test model visual scale is applied once and is named/configurable.

6. Footprint rendering math:
   - Test footprint angular radius for LEO, MEO, and GEO altitudes.
   - Test no NaN/Infinity values for valid satellite positions.
   - Test invalid/below-surface positions are rejected safely.

7. Menu/UI state:
   - Test there are no duplicate IDs in generated menu markup.
   - Test View collapse includes Globe, Mercator, High Def., ECEF Axes, and Day/Night controls.
   - Test YPR sliders are hidden by default and visible only when enabled.
   - Test `getFullGitHubUrl()` handles invalid inputs without throwing.

8. Regression tests:
   - Keep existing tests passing.
   - Add new tests under `tests/` with clear names.
   - Update `package.json` so `npm test` runs all tests.

### Verification

Use `Test_and_Integration.md` as the authoritative acceptance checklist. Update it when adding new automated tests or changing the test procedure.

Run at minimum:

```powershell
npm test
Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }
py -m http.server 8000 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8000/index.html
```

Verify the checklist in `Test_and_Integration.md`, including:

- App loads without console errors.
- Globe, satellites, menu, and UTC clock render.
- 3D orbit path aligns with the selected satellite.
- Day/night lighting and Sun direction look consistent with UTC time.
- Moon remains visible and behaves according to the documented model.
- Footprint rendering still works in 3D and Mercator views.
- View section collapses all view controls together.
- YPR sliders only show when enabled.
- Filters still update satellite count, markers, and dropdown.
- Existing timeline controls still open, close, and select satellites.

### Deliverable

Report:

1. Files changed.
2. What was fixed for each review finding.
3. The deep tests added and what each one covers.
4. The full `Test_and_Integration.md` checklist items completed.
5. Browser checks performed.
6. Any remaining limitations, especially intentional approximations in orbital mechanics or Moon modeling.

The implementation is not complete until all new deep tests pass, browser smoke testing passes, and the `Test_and_Integration.md` checklist has been followed.

---

## Release Date: 2026-06-02  Version 1.2

Analyze the full `openbexi_earth_orbit` codebase, starting from `index.html`.

Review the application for bugs, regressions, incorrect assumptions, and areas that can be improved. Pay special attention to issues related to the domain of the app, including satellite orbit simulation, orbital mechanics, TLE propagation, ECI/ECEF coordinate transforms, GMST/time handling, Earth rotation, Moon positioning, scaling, units, camera distance, satellite marker/model scale, footprint rendering, Mercator projection, and any mathematical or visual incoherence.

Also review the UI and interaction logic, especially filters, satellite selection, timelines, orbit display, footprint display, day/night rendering, and performance-sensitive animation loops.

For each issue found, report:

1. The file and line number.
2. The severity: critical, major, minor, or improvement.
3. What is wrong or risky.
4. Why it matters for this application.
5. A recommended fix.

If no issue is found in an area, say so clearly. Do not make code changes yet; produce a structured review report first.

---

## Release Date: 2026-06-02  Version 1.1

Update the `openbexi_earth_orbit` app filters and add a regression test plan.

1. Create a Markdown file named `Test_and_Integration.md`.
2. In that file, describe a comprehensive test and regression plan for the application, focused on making sure the app still works after the filter-menu redesign.
3. Replace the current filter design in the menu with a layout similar to the attached reference image:
   - A dark `Filters` section.
   - An `Orbit filter (multi-select)` control using segmented buttons such as `GEO`, `MEO`, `LEO`, `HEO`, and `Other`.
   - A `Tag filter (multi-select)` control using compact pill-style toggle chips for satellite tags/operators such as `BeiDou`, `Cosmos`, `Eutelsat`, `Galileo`, `Globalstar`, `GOES`, `Intelsat`, `Iridium`, `NOAA`, `O3b`, `One Web`, `SES`, `Starlink`, `Weather`, and similar existing filter categories.
   - A `Debris filter` control using segmented buttons: `Show`, `Hide`, and `Debris only`.
4. Preserve the existing filtering behavior while updating the UI.
5. After implementing the filter redesign, run through the checks in `Test_and_Integration.md` and confirm that nothing breaks, including:
   - Loading `index.html` through a local HTTP server.
   - Rendering the 3D globe, satellite markers, menu, and clock.
   - Orbit, tag/company, and debris filters updating the satellite count and satellite dropdown correctly.
   - Multi-select filter combinations working correctly.
   - Existing controls such as Globe/Mercator view, Day/Night, satellite selection, orbit display, footprint display, and timelines still working.
6. Report the files changed, the tests performed, and any remaining issues or limitations.
