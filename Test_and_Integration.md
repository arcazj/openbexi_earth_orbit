# Test and Integration Plan

## Purpose

This plan verifies that the `openbexi_earth_orbit` application still works after filter, coordinate-frame, orbital math, rendering, scaling, and UI changes. It is the acceptance checklist for implementation work: all automated tests, browser checks, and manual regression items in this file must pass, or any remaining limitation must be documented before the task is considered complete.

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

### Footprint Math

- Test footprint angular radius for representative LEO, MEO, and GEO altitudes.
- Test footprint calculations reject invalid, below-surface, NaN, and Infinity inputs safely.
- Test 3D footprint satellite position uses the shared scene-frame transform.
- Test Mercator footprint output remains finite and handles dateline wrapping.

### Menu and UI State

- Test generated menu markup contains no duplicate IDs.
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
  - Camera navigation still works.
  - Orbit display still works when enabled.
- Toggle `Show Footprint`.
- Toggle `Show only selected satellite`.
- Toggle `Orbit Frame (LVLH)`.
- Toggle `Yaw-Pitch-Roll` and move yaw, pitch, and roll sliders.
- Use `Other Selections` to switch to `Moon`, then back to `Earth`; confirm filters return to the default startup state.
- Open and close the launch timeline.
- Open and close the re-entry timeline.
- Select a satellite from a timeline and confirm the app resets filters broadly enough to reveal that satellite.

## Domain Regression

- Select a representative LEO satellite and confirm:
  - Its marker position updates smoothly.
  - Its 3D orbit trail passes through or very near the marker at the simulation time.
  - Its footprint is plausible for a low Earth orbit.
- Select a representative MEO satellite and confirm:
  - Its altitude and orbit radius are visually between LEO and GEO.
  - Its orbit trail remains aligned with the marker.
  - Its footprint is larger than LEO and smaller than GEO.
- Select a representative GEO satellite and confirm:
  - It remains near a fixed longitude in Mercator view.
  - Its orbit trail is visually consistent with an equatorial/geosynchronous path.
  - Its footprint is wider than LEO/MEO and remains finite.
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
  - Toggle Mercator view.
  - Toggle Yaw-Pitch-Roll on and off.

## Completion Checklist

Before reporting completion, go through this file and record which checks were performed.

- `npm test` passes.
- JavaScript syntax checks pass for all `js/*.js`.
- Deep automated tests cover the coordinate-frame, orbit, Sun, Moon, scaling, footprint, menu, and URL-helper requirements above.
- Browser smoke test over HTTP passes.
- Filter UI regression passes.
- Existing feature regression passes.
- Domain regression passes or any intentional approximation is documented.
- Visual regression passes on desktop and a narrower viewport.
- Any test not performed is listed with a reason.

## Acceptance Criteria

- The app loads over HTTP without runtime errors.
- The new filter UI works with multi-select orbit and tag combinations.
- Debris filtering works and defaults to the previous inclusive behavior.
- Satellite count, visible markers, and dropdown stay consistent after each filter change.
- Existing non-filter controls continue to work.
- Deep automated tests pass through `npm test`.
- Browser smoke testing over HTTP passes.
- The full checklist in this file has been followed, and any pre-existing unrelated failures or intentional approximations are documented.
