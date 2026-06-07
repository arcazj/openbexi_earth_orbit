# Prompt History

## Release Date: 2026-06-07  Version 1.7.1

Implement Version `1.7.1` as a menu consolidation and satellite filtering maintenance release.

Preserve all existing Earth, Moon, Mars, satellite, Mercator, server, Help, Share, timeline, selected-satellite, orbit, footprint, model-loading, Stars & Milky Way, Solar System, ephemeris, and `Time x` behavior unless explicitly changed below. Do not break legacy behavior from Versions `1.5.x`, `1.6`, `1.6.1`, `1.6.2`, and `1.7`.

Requirements:

1. Versioning
   - Update visible app version to `1.7.1`.
   - Update `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` to report version `1.7.1`.

2. Menu Consolidation
   - Remove the standalone `Filters - Satellites Found` accordion section.
   - Move all orbit, tag/company, debris, reset, and zero-result filter controls under the `Satellite Selection` accordion.
   - Rename the Satellite Selection heading to `Satellites Selection - Found <number>`.
   - Keep the found number red, bold, and accessible with an updated `aria-label`.
   - `Views & Time` and `Satellites Selection - Found` must launch expanded by default.
   - `Timelines`, `Share`, and `Help` must launch collapsed by default.
   - Remove all `filtersContent` accordion-state/default behavior.

3. Filter Layout
   - Move `Reset Filters` to the same line as `Show`, `Hide`, and `Debris only`.
   - Remove the visible text:
     - `Debris filter:`
     - `Show all objects, hide debris, or inspect debris only.`
     - `Tag filter (multi-select):`
     - `Use tags to narrow by constellation, operator, or mission group.`
   - Remove active summary text such as `MEO + All tags + Debris shown | 44 satellites`.
   - Keep accessible names for orbit, tag, debris, and search controls.

4. Search and Filter Consistency
   - The Satellite Selection search dropdown must display only satellites matching the active orbit/tag/debris filters.
   - The hidden legacy `select` options must match the same filtered satellite set used by the visible search dropdown.
   - Multi-check combinations must update the visible count, search dropdown, empty state, satellite visibility, and hidden select from one canonical filtered list.
   - Reset filters must restore default filters and immediately refresh the count, dropdown, hidden select, and visible satellites.

5. Regression Safety
   - Do not change selected-satellite details on the right-side canvas panel.
   - Do not change Starlink/ISS shortcuts, model loading, selected-satellite tracking, orbit rendering, Mercator rendering, Share, Help, server status, Stars & Milky Way, Solar System, or ephemeris behavior.
   - Add or update tests for the new menu structure, removed summary/helper text, default accordion state, found-count styling/accessibility, reset/debris row layout, and multi-check search/filter consistency.
   - Run the full automated test suite and fix regressions before delivery.

Acceptance criteria:

- The menu order is `Views & Time`, `Satellites Selection - Found`, `Timelines`, `Share`, `Help`.
- The standalone `Filters - Satellites Found` section does not exist.
- `filtersContent`, `filtersAccordionSection`, and `filterStatusSummary` are not in generated menu markup.
- `Reset Filters` appears beside `Show`, `Hide`, and `Debris only`.
- The old helper paragraphs and active summary string are absent.
- Search results, hidden select options, visible satellite count, and satellite visibility all match active multi-check filters.
- Existing features from Version `1.7` and earlier still pass their automated tests.

## Release Date: 2026-06-07  Version 1.7

Implement Version `1.7` as a Solar System texture and JPL-derived ephemeris upgrade.

This release builds on Version `1.6.2`. Preserve all existing Earth, Moon, Mars, satellite, Mercator, server, Help, Share, timeline, selected-satellite, orbit, footprint, model-loading, Stars & Milky Way, Solar System menu, and `Time x` behavior unless explicitly changed below.

Do not break legacy behavior. Existing features from Versions `1.5.x`, `1.6`, `1.6.1`, and `1.6.2` must continue to work unless this prompt explicitly changes them.

Requirements:

1. Versioning
   - Update visible app version to `1.7`.
   - Update `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` to report version `1.7`.

2. Planet Textures
   - Use `textures/mercury.png` for Mercury.
   - Use `textures/venus.png` for Venus.
   - Use `textures/jupiter.jpg` for Jupiter.
   - Keep Earth using `textures/earthmap1k.jpg`.
   - Keep Moon using `textures/moon_map2.jpg`.
   - Keep Mars using `textures/March_8k.jpg`.
   - Keep Saturn, Uranus, Sun, and Saturn rings using existing local texture paths.
   - Do not fetch any planet texture remotely at runtime.
   - Apply `THREE.SRGBColorSpace` and anisotropy where available.
   - Keep fallback colored materials if any texture fails to load.
   - Tests must fail if Mercury, Venus, or Jupiter texture files are missing or exceed browser-safe dimensions.
   - Support JPEG and PNG dimension checks in tests.
   - Document texture provenance/license as local project-provided unless exact source is known.
   - Ensure `SolarSystemOverview.html` and `js/solarSystemOverviewLoader.js` use matching Mercury, Venus, and Jupiter texture paths.

3. Ephemeris Approach
   - Use bundled precomputed JPL Horizons-derived ephemeris tables under `data/ephemeris/`.
   - Do not implement remote JPL/Horizons fetch at runtime.
   - Do not silently use arbitrary phase angles or decorative visual orbits as if they were ephemeris.
   - Label the implementation as `JPL-derived ephemeris`, not operational, unless the full source/toolchain justifies operational wording.
   - Keep approximate fallback only as a clearly labeled `approximate visual fallback`.

4. Ephemeris Data Requirements
   - Include local ephemeris records for Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, and Uranus.
   - Document source, generation date, supported date range, sample cadence, reference frame, time scale, origin, units, interpolation method, and license.
   - Date range: `2020-01-01` through `2035-12-31`.
   - Sample cadence: 6-hour samples.
   - Interpolation: linear interpolation between 6-hour Horizons samples.
   - Source vectors use ICRF/ecliptic, Sun-centered Horizons center `500@10`, kilometers and kilometers-per-second units.
   - Moon must be computed from authoritative Moon and Earth vectors, not from a decorative circular orbit.
   - Define scene conversion from ephemeris kilometers to Solar System scene units.
   - Do not close an ephemeris orbit path unless the bundled ephemeris covers at least one full orbital period for that body.
   - Keep Saturn, Uranus, Moon, and any other incomplete-range body on clean analytical orbit guides to avoid diagonal chords across the Solar System view.

5. Time Behavior
   - Integrated Solar System mode must compute body positions from shared app `SIM_DATE`.
   - On Solar System startup, all body positions initialize from the current shared `SIM_DATE`.
   - `Time x = 0` must be a true zero-speed freeze of `SIM_DATE`; all Solar System body positions remain fixed.
   - Higher `Time x` values advance `SIM_DATE`; all Solar System bodies move according to the ephemeris.
   - Integrated Solar System mode must not use `Date.now()` or `performance.now()` to drive body positions.
   - The Solar System HUD/UTC display must use the same simulation date as the main app UTC clock.

6. Loading and Error UI
   - Ephemeris data must load locally and asynchronously without blocking initial Earth/satellite startup.
   - Show a clear Solar System ephemeris loading state when Solar System mode is enabled and ephemeris data is still loading.
   - Show ephemeris source and supported date range in the Solar System HUD or selection summary.
   - If ephemeris data is missing, invalid, or outside the supported date range, show a clear warning.
   - Do not silently fall back to approximate data.
   - If approximate fallback is used, label it visibly as `approximate visual fallback`.
   - Planet names in Solar System mode must use discreet compact callouts with a pin/arrow pointer.
   - The callout sprite anchor must be the actual pin point, and the pin must sit on or near the planet edge.
   - Planet labels must use projected screen-space sizing with a minimum visible text height near `18 px`, preferred size near `28 px`, and maximum near `42 px`.
   - Planet labels must reduce scale at close camera zoom so text does not dominate or cover the planets.
   - Planet labels must increase scale within a capped range for distant planets so names remain readable far from the Sun.
   - Avoid large opaque black text panels behind planet names.
   - The Solar System planet HUD must match the UTC clock/horloge width, right alignment, monospace font family, and compact font sizing.
   - The Solar System planet HUD must sit directly under the UTC clock and wrap long ephemeris text cleanly inside the clock width.

7. Legacy Behavior Preservation
   - Preserve `Other Selections` removal from Version `1.6.2`.
   - Preserve Earth, Moon, and Mars reachability through Solar System selection.
   - Preserve Earth selection returning to normal Globe mode.
   - Preserve Moon selection returning to the existing Moon-centered mode.
   - Preserve Mars selection returning to the existing Mars mode with Mars texture/progress behavior.
   - Preserve `Displaying 46 bundled reference stars` visibility rule: show it only when `Stars & Milky Way` and `Bright Labels` are both checked.
   - Preserve the top/canvas `Time x` slider as the only simulation-speed control.
   - Preserve local/server satellite loading, server status, silent local fallback, Globe, Mercator bottom-right overlay, High Def Earth, ECEF axes, Day/Night/Sun lighting, satellite search portal, Starlink/ISS shortcuts, show-only-selected mode, right-side selected-satellite data/TLE/source panel, orbit display and occlusion, footprints, LVLH frame, Yaw/Pitch/Roll and ISS yaw/pitch swap, detailed model loading, SSL 1300 IS-18/IS-20 restriction, OB3/O3b sprite-only behavior, timeline exclusivity, Share, Help, menu order/default state, and startup/deferred loading behavior.

8. Validation and Tests
   - Add tests confirming Mercury uses `textures/mercury.png`.
   - Add tests confirming Venus uses `textures/venus.png`.
   - Add tests confirming Jupiter uses `textures/jupiter.jpg`.
   - Add tests confirming all planet texture paths are local.
   - Add tests confirming PNG and JPEG texture dimensions are validated.
   - Add tests confirming integrated and standalone Solar System texture paths match.
   - Add tests confirming ephemeris metadata exists and documents source, date range, cadence, frame, time scale, origin, units, interpolation, and license.
   - Add tests comparing bundled JPL-derived ephemeris vectors against reference sample vectors for multiple dates and all supported bodies.
   - Define acceptable kilometer error thresholds:
     - Inner planets and Moon: target less than `5,000 km`.
     - Outer planets: target less than `50,000 km`.
   - Add tests confirming Moon position is derived from Moon/Earth ephemeris vectors.
   - Add tests confirming closed JPL-derived orbit guides are used only when the ephemeris covers a complete orbital period, and incomplete Saturn/Uranus/Moon arcs do not create diagonal chord artifacts.
   - Add tests confirming planet scene positions change between `2026-06-07T00:00:00Z`, `2026-07-07T00:00:00Z`, and `2030-06-07T00:00:00Z`.
   - Add tests confirming `Time x = 0` freezes simulation milliseconds and `Time x > 0` advances them.
   - Add tests confirming Solar System labels satisfy the `18 px` minimum and capped maximum readable screen-height rule.
   - Add tests confirming the Solar System HUD is width/right/top aligned from the UTC clock measurement and uses clock-compatible typography.
   - Add tests confirming `SIM_DATE` drives all integrated Solar System positions.
   - Add tests confirming integrated Solar System code does not use independent `Date.now()` or `performance.now()` for body positions.
   - Add regression tests proving existing Earth, Moon, Mars, satellite, Mercator, Stars & Milky Way, menu, Share, Help, server, timeline, selected-satellite, model-loading, and `Time x` behavior still passes.

9. Documentation
   - Update `README.md`.
   - Update `Test_and_Integration.md`.
   - Update `PROMPT_History.md`.
   - Document texture sources/licenses.
   - Document JPL-derived ephemeris source and limitations.
   - Document date range, interpolation method, expected error thresholds, and fallback behavior.
   - Document that this is a visualization using JPL-derived ephemeris data and is not a certified flight-dynamics or navigation system unless independently validated.

Acceptance Criteria:

- App version is `1.7`.
- Mercury renders with `textures/mercury.png`.
- Venus renders with `textures/venus.png`.
- Jupiter renders with `textures/jupiter.jpg`.
- Earth, Moon, Mars, Saturn, Uranus, Sun, and Saturn rings keep their local texture behavior.
- No planet texture or ephemeris data is fetched remotely at runtime.
- Solar System positions are computed from documented local JPL-derived ephemeris data.
- Moon position is derived from Earth/Moon ephemeris vectors.
- Orbit paths do not show diagonal closing chords for incomplete ephemeris arcs.
- Solar System motion follows the existing top/canvas `Time x` slider through shared `SIM_DATE`.
- `Time x = 0` freezes Solar System body positions.
- UI displays ephemeris source and supported date range.
- UI warns clearly if ephemeris is unavailable, invalid, outside range, or fallback mode is active.
- Planet labels remain compact when zooming, use discreet pin/arrow callouts instead of large billboard text, keep the pin anchored on the planet edge, and stay readable for planets far from the Sun.
- Solar System planet HUD aligns with the UTC clock width, right edge, font, and directly-under-clock placement.
- `Other Selections` remains removed.
- Earth, Moon, and Mars remain reachable through Solar System selection.
- Existing Earth, Moon, Mars, satellite, Mercator, Stars & Milky Way, filters, selected-satellite details, timelines, Share, Help, server, model-loading, and menu behavior remains functional.
- Automated tests pass.

## Release Date: 2026-06-07  Version 1.6.2

Integrate Solar System Overview into the main OpenBEXI Earth Orbit app.

This release builds on Version 1.6.1. Preserve all existing Earth, Moon, Mars, satellite, Mercator, server, Help, Share, timeline, selected-satellite, orbit, footprint, model-loading, Stars & Milky Way, and menu behavior unless explicitly changed below.

Requirements:

1. Update visible app, JavaScript, menu server panel, and Python server version to `1.6.2`.
2. Keep `SolarSystemOverview.html` as a standalone debug/experimental page.
3. Refactor reusable solar-system logic into `js/solarSystemOverviewLoader.js`.
4. Integrate Solar System Overview into `index.html` as explicit `simParams.solarSystemOverview` mode.
5. Remove the menu `Time x` slider from `Views & Time`; keep the top/canvas `Time x` slider unchanged.
6. Reorganize `Views & Time`: first row `Solar System` unchecked and `Stars & Milky Way` unchecked; second row `Globe` checked, `High Def.` unchecked, `ECEF Axes` unchecked; third row `Mercator` unchecked and `Day/Night` checked.
7. Keep `RA/Dec Grid`, `Bright Labels`, and `Atmosphere` visible only when `Stars & Milky Way` is checked.
8. Keep the integrated magnitude slider removed.
9. Add Solar System-only sub-controls visible only while Solar System is enabled: `Planet Labels`, `Orbit Paths`, `Planet Textures`, and `Sun Glow`.
10. Store previous Earth/Moon/Mars/satellite view state when entering Solar System mode and restore it when exiting without selecting a planet.
11. While Solar System mode is active, hide Earth-specific satellite layers: satellite sprites, selected model, Earth orbit paths, footprints, LVLH/YPR frames, Mercator overlay, and selected-satellite panel.
12. Do not mutate TLE data, filters, or satellite lists.
13. Disable satellite picking behavior while Solar System mode is active.
14. Share should capture the active Solar System canvas when active.
15. Show the Sun centered with glow/halo.
16. Show orbit paths and textured planets for Mercury, Venus, Earth, Mars, Jupiter, Saturn, and Uranus.
17. Add readable labels, hover/click feedback, selected-planet highlight, and selected-planet HUD.
18. Display approximate UTC simulation time using the existing app time flow where practical.
19. Use approximate Kepler/heliocentric calculations first and document that positions are not operational ephemerides.
20. Use separate visual scale for orbit distances and planet radii.
21. Saturn must include tilted readable rings.
22. Use local textures only; do not fetch planet textures remotely at runtime.
23. Reuse existing Earth texture and Mars `textures/March_8k.jpg`.
24. Add local textures for Mercury, Venus, Jupiter, Saturn, Uranus, Sun, and Saturn rings under `textures/planets/`.
25. Use equirectangular/proper spherical maps where possible.
26. Set `texture.colorSpace = THREE.SRGBColorSpace` and anisotropy where available.
27. Avoid oversized textures; keep planet textures within common WebGL limits.
28. Add fallback colored materials if texture loading fails.
29. Document texture sources/licenses as project-generated procedural visual maps unless replaced later by verified public-domain assets.
30. User can select a planet by clicking marker or label.
31. Selecting Earth smoothly transitions to normal Earth Globe mode.
32. Selecting Mars smoothly transitions to existing Mars mode and reuses existing Mars target/camera/progress behavior.
33. Selecting Mercury, Venus, Jupiter, Saturn, or Uranus keeps Solar System mode active and focuses that planet.
34. Add `Back to Solar System Overview`, `Exit Solar System Overview`, and Escape handling.
35. Add tests for new `Views & Time` row order/defaults, removed menu Time x, retained top Time x, Solar System module/planets/textures, Earth/Mars selection mappings, other-planet focus, hidden/restored Earth-specific layers, and Version 1.6.1 Stars & Milky Way behavior preservation.
36. Update `README.md`, `Test_and_Integration.md`, and automated tests.

Acceptance Criteria:

- App version is `1.6.2`.
- Normal startup remains Earth satellite view.
- `Views & Time` has the corrected three-row layout.
- Solar System mode shows textured planets, orbit paths, labels, Sun glow, and star background.
- Earth and Mars selections transition into their existing app modes.
- Other planets focus inside Solar System mode.
- Exiting restores the correct previous state.
- Existing Globe, Mercator, Moon, Mars, Stars & Milky Way, filters, selected-satellite details, timelines, Share, and Help remain functional.
- `SolarSystemOverview.html` still works standalone.
- Automated tests pass.

### Version 1.6.2 Correction

Correct and finalize the Version `1.6.2` Solar System integration.

Preserve all existing Version `1.6.2` behavior unless explicitly changed below.

Requirements:

1. Show the text `Displaying 46 bundled reference stars` only when both `Stars & Milky Way` and `Bright Labels` are checked.
2. Hide the reference-star text on launch, when `Stars & Milky Way` is unchecked, and when `Bright Labels` is unchecked.
3. Keep Bright Labels readable, using large text equivalent to the previous `72px` correction.
4. Remove the `Other Selections` menu section.
5. Do not regress Moon access when removing `Other Selections`.
6. Add Moon as a selectable body in Solar System Overview, or provide another explicit Moon selection path.
7. Selecting Earth from Solar System must transition to the same normal Earth Globe view as checking `Globe`.
8. Selecting Mars from Solar System must transition to the same Mars view previously reached from `Other Selections`.
9. Selecting Moon from Solar System must transition to the same Moon-centered view previously reached from `Other Selections`.
10. Solar System planet and Moon movement must use the existing top/canvas `Time x` simulation time, not an independent animation clock.
11. `Time x = 0` must pause or nearly pause Solar System movement.
12. Increasing `Time x` must visibly accelerate Solar System movement proportionally.
13. Preserve existing Globe, Mercator, High Def., ECEF Axes, Day/Night, Stars & Milky Way, RA/Dec Grid, Bright Labels, Atmosphere, satellite filters, selected-satellite details, orbit paths, footprints, timelines, Share, Help, and server behavior.
14. Update `README.md`, `Test_and_Integration.md`, `PROMPT_History.md`, and automated tests.

Acceptance Criteria:

- `Other Selections` no longer appears in the menu.
- Earth, Moon, and Mars remain reachable after removing `Other Selections`.
- Earth selection from Solar System returns to normal Earth Globe mode.
- Moon selection from Solar System opens the existing Moon-centered view.
- Mars selection from Solar System opens the existing Mars view.
- `Displaying 46 bundled reference stars` appears only when `Stars & Milky Way` and `Bright Labels` are both checked.
- Solar System motion follows the existing top/canvas `Time x` slider.
- `Time x = 0` pauses or nearly pauses Solar System motion.
- Higher `Time x` values accelerate Solar System motion.
- Existing Version `1.6.2` features remain functional.
- Automated tests pass.

## Release Date: 2026-06-07  Version 1.6.1

Implement Version `1.6.1` as a focused Stars & Milky Way usability update.

This release builds on Version 1.6. Preserve all existing Earth, Moon, Mars, satellite, Mercator, server, Help, Share, timeline, selected-satellite, orbit, footprint, model-loading, and menu behavior unless explicitly changed below.

Requirements:

1. Keep the release date and version exactly `Release Date: 2026-06-07  Version 1.6.1`.
2. Update the visible application, JavaScript, menu server panel, and Python server version to `1.6.1`.
3. Remove the integrated main-app `Magnitude limit` slider from `Views & Time`.
4. Remove the visible `Magnitude limit <10.0` value text and all integrated main-app slider event wiring.
5. Remove `starMagnitudeLimit` from main-app `simParams`.
6. Remove unused `DEFAULT_STAR_MAGNITUDE_LIMIT` and `MAX_INTEGRATED_STAR_MAGNITUDE_LIMIT` imports from `index.html`.
7. Keep `starSkyUtils.js` magnitude helpers available for standalone `Earth_Stars_MilkyWay.html`, preprocessing tests, and future larger-catalog work.
8. When `Stars & Milky Way` is enabled in `index.html`, render all finite-magnitude stars from the bundled `BRIGHT_STARS_DEMO` catalog.
9. The current bundled catalog contains 46 reference stars; show a readable menu note computed from `BRIGHT_STARS_DEMO.length`, for example `Displaying 46 bundled reference stars`.
10. Keep `RA/Dec Grid`, `Bright Labels`, and `Atmosphere` visible only when `Stars & Milky Way` is enabled.
11. Keep `Stars & Milky Way`, `RA/Dec Grid`, `Bright Labels`, and `Atmosphere` unchecked by default.
12. Keep Bright Labels internally limited to bright stars, currently magnitude `<2.1`, so the sky is not overloaded with 46 labels.
13. Rename the integrated star update function if needed so it no longer implies user-controlled magnitude filtering.
14. Add tests proving the integrated menu no longer contains `starMagnitudeLimitSlider`, `starMagnitudeLimitValue`, or `.star-magnitude-control`.
15. Add tests proving the integrated main app renders the full bundled catalog without user-controlled magnitude filtering.
16. Document that the magnitude slider can return later only after a larger local preprocessed catalog is added.
17. Preserve standalone `Earth_Stars_MilkyWay.html` behavior if it still has its own magnitude controls.
18. Preserve all Version 1.6 Stars & Milky Way behavior except the removed integrated main-app magnitude slider.
19. Update `README.md`, `Test_and_Integration.md`, and automated tests for Version `1.6.1`.

Acceptance Criteria:

- Latest release is `Release Date: 2026-06-07  Version 1.6.1`.
- `index.html` displays `Version 1.6.1 - hosted at GitHub Repo`.
- `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` report app/API/server version `1.6.1`.
- No `Magnitude limit` slider appears in the integrated main app menu.
- No `starMagnitudeLimit` state or event listener remains in `index.html`.
- Enabling `Stars & Milky Way` displays all 46 bundled reference stars.
- The star-options panel shows a catalog summary based on `BRIGHT_STARS_DEMO.length`.
- `RA/Dec Grid`, `Bright Labels`, and `Atmosphere` still work and remain unchecked by default.
- Bright Labels are readable and remain limited to bright stars.
- Existing Earth/Moon/Mars/satellite/Mercator behavior remains unchanged.
- Full automated test suite passes.

### Non-Release Implementation Note: SolarSystemOverview.html

Implement a standalone Three.js page named `SolarSystemOverview.html`.

This is not Version 1.6.2 and must not change the main `index.html` release version, menu, or app flow.

Requirements:

1. Create `SolarSystemOverview.html` at the repository root.
2. Do not update the main app version.
3. Do not add this page into the main `index.html` menu yet.
4. Do not create a new release version for this feature.
5. Render a standalone heliocentric solar-system scene with the Sun near the center.
6. Render thin colored orbit paths for at least Mercury, Venus, Earth, Mars, Jupiter, Saturn, and Uranus.
7. Render planet markers/spheres at approximate orbital positions.
8. Add readable labels near each planet.
9. Add a bright Sun glow/lens halo effect.
10. Add a star/Milky Way background, reusing local project assets when possible.
11. Display the current simulation UTC time in the upper-left corner.
12. Add camera orbit/zoom controls around the solar system.
13. Use approximate heliocentric orbital calculations first if precise ephemerides are not available.
14. Use practical visual scaling so inner and outer planets are all visible.
15. Do not copy or display third-party logos or watermarks.
16. Keep this standalone page independent from satellite rendering, Earth-centered scene logic, Mercator, filters, timelines, Share, and Help.
17. Add tests confirming `SolarSystemOverview.html` exists, uses Three.js, defines the required planets, draws orbit paths, draws labels, displays UTC time, and does not change the main app version.
18. Update `README.md` and `Test_and_Integration.md` to mention the standalone experimental page only.

Acceptance Criteria:

- Opening `SolarSystemOverview.html` shows the Sun, colored planet orbit paths, labeled planets, and star background.
- Planet labels are readable.
- UTC time is visible.
- Orbit controls allow zoom and rotation.
- `index.html` remains unchanged except for no required changes.
- Main app version remains `1.6.1`.
- Automated tests pass.

## Release Date: 2026-06-07  Version 1.6

Implement a major Version `1.6` release that integrates the optional Stars & Milky Way view layer into the main `index.html` app.

This release builds on Version 1.5.23. Preserve all existing Earth, Moon, Mars, satellite, Mercator, server, Help, Share, timeline, selected-satellite, orbit, footprint, model-loading, and menu behavior unless explicitly changed below.

Requirements:

1. Keep the release date and version exactly `Release Date: 2026-06-07  Version 1.6`.
2. Update the visible application, JavaScript, menu server panel, and Python server version to `1.6`.
3. In `Views & Time`, place a new unchecked `Stars & Milky Way` checkbox on the same row as `Globe` and `Mercator`.
4. When `Stars & Milky Way` is unchecked, do not show stars, Milky Way, RA/Dec grid, bright labels, atmosphere, or magnitude controls.
5. When `Stars & Milky Way` is checked, show a star field and Milky Way celestial sphere while keeping Earth and satellites in the existing Earth-centered scene.
6. Under the existing `High Def.`, `ECEF Axes`, and `Day/Night` row, add a hidden-by-default star-options row visible only when `Stars & Milky Way` is checked.
7. The star-options row must contain three unchecked checkboxes: `RA/Dec Grid`, `Bright Labels`, and `Atmosphere`.
8. Make the new checkbox text large enough to read clearly in the menu.
9. Add a `Magnitude limit` slider directly under the star-options row, visible only when `Stars & Milky Way` is checked.
10. Default the magnitude limit to `<10.0`.
11. Allow the integrated main-app magnitude limit to increase up to `<13.0`.
12. Changing `Magnitude limit` must update the visible star field without reloading the app.
13. Use real RA/Dec star positions from the bundled demo catalog for the integrated view.
14. Use efficient `THREE.BufferGeometry` / `THREE.Points`; do not create one mesh per star.
15. Use a Milky Way celestial sphere with local texture `obj/Textures/starmap-4k.jpg` when available and a procedural fallback when not available.
16. Do not attempt magnitude `<18` in the main app. Document magnitude `<18` as a future external Gaia DR3 tiled/LOD/binary dataset only.
17. Document that full realism above the bundled demo catalog requires a larger licensed/preprocessed catalog.
18. Ensure all existing features from Versions 1.5.1 through 1.5.23 remain functional and are not broken by Version 1.6.
19. Preserve and regression-test at minimum: local/server satellite loading, server status, silent local fallback, Globe, Mercator and bottom-right overlay, High Def Earth, ECEF axes, Day/Night/Sun lighting, Moon/Mars selections, Mars texture progress behavior, satellite search portal, Starlink/ISS shortcuts, show-only-selected mode, right-side satellite data/TLE/source panel, orbit display and occlusion, footprints, LVLH frame, Yaw/Pitch/Roll and ISS yaw/pitch swap, detailed model loading, SSL 1300 IS-18/IS-20 restriction, OB3/O3b sprite-only behavior, timeline exclusivity, Share, Help, menu order/default state, synchronized Time x sliders, and startup/deferred loading behavior.
20. Add automated/static regression checks proving the new Stars & Milky Way UI does not reorder, remove, rename, or disable existing controls unless explicitly required.
21. Update `README.md`, `Test_and_Integration.md`, and automated tests for Version `1.6`.
22. Optimize Mars texture loading by using a browser-safe `textures/March_8k.jpg` runtime texture generated from local source `textures/March.jpg`, avoiding Three.js resizing warnings for the original `21339x10670` source image.

Acceptance Criteria:

- Latest release is `Release Date: 2026-06-07  Version 1.6`.
- `index.html` displays `Version 1.6 - hosted at GitHub Repo`.
- `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` report app/API/server version `1.6`.
- `Views & Time` row contains `Globe`, `Mercator`, and `Stars & Milky Way`.
- `Stars & Milky Way` is unchecked by default.
- `RA/Dec Grid`, `Bright Labels`, `Atmosphere`, and `Magnitude limit` are hidden by default.
- Those controls appear only when `Stars & Milky Way` is checked.
- `RA/Dec Grid`, `Bright Labels`, and `Atmosphere` are unchecked by default.
- `Magnitude limit` defaults to `<10.0` and can increase to `<13.0`.
- Star field and Milky Way render only when enabled.
- Existing Earth/Moon/Mars/satellite/Mercator behavior remains unchanged.
- Mars globe and Mars Mercator use `textures/March_8k.jpg` at runtime, while `textures/March.jpg` remains documented as the local source texture.
- Full automated test suite passes.

## Release Date: 2026-06-07  Version 1.5.23

Implement a Mars planet option in `Other Selections`, similar to the existing Moon option.

This release builds on Version 1.5.22. Preserve the optional Python server data path, silent offline/local fallback, server status icon and panel, Help Markdown viewer pages, Licenses action, metallic accordion styling, Version 1.5.22 menu order and launch defaults, synchronized `Time x` sliders, selected-satellite control gating, search dropdown portal behavior, filters, timelines, bottom-right Globe + Mercator overlay, Sun/Earth-reflection selected-model lighting, orbit, footprint, Yaw-Pitch-Roll orientation, Share behavior, selected-satellite right-side detail panel, SSL 1300 restriction behavior, selected-satellite observer tracking, model loading, ISS yaw/pitch correction, 1.5.22 Earth/Moon target enforcement, selected-model orbit alignment, and OB3/O3b sprite-only behavior unless explicitly changed below.

Requirements:

1. Keep the release date and version exactly `Release Date: 2026-06-07  Version 1.5.23`.
2. Update the visible application, JavaScript, menu server panel, and Python server version to `1.5.23`.
3. Add `Mars` to the `Other Selections` dropdown beside `Earth` and `Moon`.
4. When `Mars` is selected, display a textured Mars globe in the 3D scene.
5. Use the local texture asset `textures/March.jpg` for Mars.
6. Do not fetch any remote Mars texture at runtime.
7. Document `textures/March.jpg` as a local project-provided Mars texture with source/license to be confirmed unless exact provenance is later provided.
8. Preserve the Earth-centered scene frame; do not move Earth to accommodate Mars.
9. Preserve existing Moon behavior exactly.
10. Like Moon mode, Mars mode must visually center Mars by setting `controls.target` to `mars.position`.
11. Do not move Mars to `(0, 0, 0)`; preserve physical scene consistency.
12. Mouse orbit and zoom in Mars mode must orbit around Mars and keep Mars visually centered.
13. When leaving Mars mode, restore the correct Earth-centered or selected-satellite camera target behavior.
14. Preserve satellite selection, orbit display, footprints, Mercator view, selected-satellite tracking, time controls, and lighting.
15. Add or update automated tests/static checks confirming `Other Selections` includes `Mars`, Mars uses `textures/March.jpg`, Mars mode targets `mars.position`, Mars mode does not move Earth/Moon/Mars to the origin, and leaving Mars mode restores target priority.
16. Update `README.md` and `Test_and_Integration.md` for Version `1.5.23`.
17. When loading the Mars map/texture from `textures/March.jpg`, show a progress bar labeled `Loading Mars map/texture...` in the middle of the canvas.
18. Hide the Mars texture progress bar after successful load, and show a clear fallback message if the texture fails so the user knows the fallback Mars color is being used.
19. Do not show the Mars progress bar during initial `index.html` launch while `Other Selections` is `Earth`.
20. Defer visible Mars texture progress UI until the user selects `Mars`; Mars texture may still load silently in the background at startup.
21. If `textures/March.jpg` is already loaded by the time the user selects Mars, still show a short centered loading/confirmation state.
22. Keep the Mars progress bar visible long enough for cached/local loads to be seen; do not let fast local texture completion hide it immediately.
23. Make the Mars observer start closer than the previous 1.5.23 Mars view while keeping zoom, orbit controls, and Mars target tracking functional.
24. When Mars is selected and Mercator is enabled, display the Mars Mercator map using `textures/March.jpg` instead of the Earth map, and do not draw Earth-specific satellite footprints, ground tracks, day/night shading, or satellite markers on top of the Mars map.

Acceptance Criteria:

- Latest release is `Release Date: 2026-06-07  Version 1.5.23`.
- `index.html` displays `Version 1.5.23 - hosted at GitHub Repo`.
- `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` report app/API/server version `1.5.23`.
- `Other Selections` contains `Mars`.
- Selecting Mars shows a textured Mars globe using `textures/March.jpg`.
- Mars is centered in the camera like Moon mode.
- Mars starts close to the globe in the observer view, closer than the first 1.5.23 Mars fly-to distance.
- Zoom/orbit controls work around Mars.
- Mars loading progress does not appear on initial launch while Earth is active.
- Loading Mars texture displays a centered progress bar and a clear fallback message on failure.
- Selecting Mars displays the centered progress bar even if the Mars texture finished loading silently before selection.
- Fast cached/local Mars texture loads keep the progress bar visible long enough for the user to see it.
- Mars + Mercator displays `textures/March.jpg` as the map background, not the Earth map.
- Mars + Mercator does not overlay Earth satellite geometry on the Mars map.
- Existing Moon behavior is unchanged.
- Earth, Moon, and Mars are not moved to `(0, 0, 0)` by context switching.
- The texture path and source/license status are documented.
- Automated tests and syntax checks pass, or any limitation is explicitly documented.

## Release Date: 2026-06-06  Version 1.5.22

Implement Release Date: 2026-06-06 Version 1.5.22 orbital accuracy, Earth-frame, Moon-frame, and camera-control corrections.

This release builds on Version 1.5.21. Preserve the optional Python server data path, silent offline/local fallback, server status icon and panel, Help Markdown viewer pages, Licenses action, metallic accordion styling, Version 1.5.21 menu order and launch defaults, synchronized `Time x` sliders, selected-satellite control gating, search dropdown portal behavior, filters, timelines, bottom-right Globe + Mercator overlay, Sun/Earth-reflection selected-model lighting, orbit, footprint, Yaw-Pitch-Roll orientation, Share behavior, selected-satellite right-side detail panel, SSL 1300 restriction behavior, selected-satellite observer tracking, model loading, ISS yaw/pitch correction, and existing satellite visualization behavior unless explicitly changed below.

Requirements:

1. Keep the release date and version exactly `Release Date: 2026-06-06  Version 1.5.22`.
2. Update the visible application, JavaScript, menu server panel, and Python server version to `1.5.22`.
3. Preserve the existing `satellite.js` SGP4/TLE propagation path.
4. Document that `satellite.js` returns TEME-like coordinates and the app treats them as ECI-like coordinates for visualization unless a higher-fidelity transform is explicitly implemented.
5. Keep the global scene Earth-centered.
6. Keep the Earth globe mesh at scene coordinate `(0, 0, 0)` at all times.
7. Keep the X/Y/Z Earth axes originating from `(0, 0, 0)`.
8. Prevent mouse drag, orbit, pan, and zoom interactions from moving the Earth center away from `(0, 0, 0)`.
9. Disable or constrain panning so mouse interaction cannot shift the active controls target away from the correct target.
10. In Earth mode, keep `controls.target` at the Earth center `(0, 0, 0)`.
11. Do not move the Moon object to `(0, 0, 0)`.
12. Preserve the physical Earth-centered scene frame and Earth-Moon geometry.
13. In Moon mode, visually center the Moon by setting `controls.target` to `moon.position`.
14. Mouse drag/orbit and zoom in Moon mode must orbit around the Moon center without shifting the Moon away from the view center.
15. When leaving Moon mode, restore the correct Earth-centered or selected-satellite target behavior.
16. Define camera target priority clearly: Earth mode targets `(0, 0, 0)`, Moon mode targets `moon.position`, and selected satellite mode targets the selected satellite/model position.
17. Preserve selected-satellite observer and tracking behavior unless it conflicts with explicit Earth/Moon centering rules.
18. Allow Earth-mode zooming close to approximately `100 km` above Earth surface.
19. Interpret `100 km above Earth surface` as camera distance from Earth center equal to `EARTH_SCENE_RADIUS + metersToSceneUnits(100000)`, not `100 km` from Earth center.
20. Allow zooming far away using a very large safe finite maximum distance; do not use literal `Infinity`.
21. Adjust camera near/far clipping planes so Earth, Moon, GEO, MEO, LEO, HEO, and selected satellites are not clipped during normal use.
22. Replace spherical Earth helper math in `js/orbit/orbitLinkGeometry.js` with WGS84 ellipsoid geodetic/ECF calculations.
23. Improve orbit classification so GEO, MEO, LEO, HEO, and Other are distinguishable from mean motion, eccentricity, inclination, and altitude when metadata is unavailable.
24. Do not classify every object below `2.5 rev/day` as GEO.
25. Review `getOrbitDurationMinutes()` so HEO/Molniya-style orbits render a meaningful full orbit without being mislabeled as MEO/GEO.
26. Keep invalid, decayed, below-Earth, or non-finite propagated positions out of orbit paths, ground tracks, footprints, and visible satellite markers.
27. When `satellite.propagate()` returns invalid or decayed data in the 3D sprite update loop, hide or flag the sprite instead of leaving it frozen at the last valid position.
28. Use true Web Mercator consistently for Mercator marker placement, selected ground tracks, footprint polygons, coverage overlays, and day/night terminator shading.
29. Harden `drawDayNightMercator()` near equinox/subsolar latitude singularities.
30. Add automated tests or static checks for Earth/Moon centering, panning constraints, selected-satellite target priority, zoom/clipping safety, WGS84 look geometry, orbit classification, HEO orbit duration, Web Mercator high-latitude projection, invalid propagation handling, and day/night terminator stability.
31. Remove automatic OB3/O3b detailed model usage in the main satellite selection flow.
32. Keep OB3/O3b satellites represented by the standard satellite icon/sprite, like normal TLE satellites.
33. Do not delete OB3/O3b model asset files unless explicitly requested; only disable their automatic use in the app.
34. Update model resolver tests so OB3/O3b satellites no longer resolve to an OB3/O3b model.
35. Fix selected detailed-model orbit trajectory alignment so the selected model root and orbit trajectory use the same propagated satellite position, simulation date, scene frame, and `KM_TO_SCENE_UNITS` scale.
36. Do not apply model visual scale, bounding-box offset, camera offset, selected-view framing offset, `lookAt`, nadir orientation, or local centering corrections to the detailed model root world position.
37. The detailed model root object must be positioned only at the satellite ECI/TEME scene coordinate returned by `eciToSceneVector()`.
38. If a model requires visual centering or geometry offset correction, apply it only to child geometry under the root, not to the root position.
39. Keep selected-model tracking camera-only; it must update the camera and controls target without changing the satellite/model world position.
40. Keep the hidden selected TLE sprite synchronized with the detailed model root from the same propagated scene coordinate.
41. Regenerate or refresh the selected orbit trajectory when the detailed model replaces the selected sprite so stale orbit points are not reused.
42. Add an optional `orbitAlignDebug` diagnostic that reports propagated ECI/TEME position, detailed model world position, selected sprite world position, nearest orbit-line point distance, scene scale, and alignment tolerance.
43. Require selected detailed model root world position to remain within `< 0.01` scene units of the current propagated scene position.
44. Update `README.md` and `Test_and_Integration.md` for Version `1.5.22`.
45. Document remaining approximations clearly, especially TEME-as-ECI visualization, SGP4/TLE accuracy limits, simplified Moon model if still present, and non-operational visualization assumptions.

Acceptance Criteria:

- Latest release is `Release Date: 2026-06-06  Version 1.5.22`.
- `index.html` displays `Version 1.5.22 - hosted at GitHub Repo`.
- `js/serverConnection.js`, `js/SatelliteMenuLoader.js`, and `server.py` report app/API/server version `1.5.22`.
- Earth mesh remains at `(0, 0, 0)` and Earth axes originate from `(0, 0, 0)`.
- Earth-mode `controls.target` remains `(0, 0, 0)` and panning cannot shift the Earth center away from the active target.
- Moon mode keeps the Moon visually centered with `controls.target.copy(moon.position)` without moving the Moon object to `(0, 0, 0)`.
- Selected-satellite target priority and observer tracking continue to work.
- Earth minimum zoom supports approximately `100 km` altitude above the Earth surface.
- Maximum zoom is finite and very large.
- Camera far clipping is large enough for Earth, Moon, GEO, MEO, LEO, HEO, and selected satellites.
- WGS84 geodetic/ECF look geometry replaces spherical helper math.
- GEO, MEO, LEO, HEO, Other, and Unknown orbit classifications are distinguishable.
- HEO/Molniya-style orbit duration renders a full meaningful orbit.
- Invalid, decayed, below-Earth, or non-finite propagation results are not drawn as stale sprites, orbit paths, ground tracks, or footprints.
- Mercator markers, selected ground tracks, footprint polygons, coverage overlays, and day/night shading use one true Web Mercator helper.
- Day/night terminator drawing remains finite and stable near equinox conditions.
- Selecting an OB3/O3b satellite shows the standard satellite icon/sprite.
- No OB3/O3b detailed model is automatically loaded or rendered in the main app.
- Other satellite model mappings remain unchanged.
- The selected detailed model visually lies on the red orbit trajectory.
- No orbit line appears detached, offset, or parallel to the selected model path.
- Sprite-only satellites and detailed models use consistent orbit alignment.
- Existing model scale/framing remains visual-only and does not alter orbital position.
- Selected model root-to-propagated-position distance remains `< 0.01` scene units.
- Automated tests and syntax checks pass, or any limitation is explicitly documented.

## Release Date: 2026-06-06  Version 1.5.21

Implement Version 1.5.21 selected-satellite detail expanded/collapsible behavior and record the ADCS/attitude visualization correction requirements.

This release builds on Version 1.5.20. Preserve the optional Python server data path, silent offline/local fallback, server status icon and panel, Help Markdown viewer pages, Licenses action, metallic accordion styling, Version 1.5.20 menu order and launch defaults, synchronized `Time x` sliders, selected-satellite control gating, search dropdown portal behavior, filters, timelines, bottom-right Globe + Mercator overlay, Sun/Earth-reflection selected-model lighting, orbit, footprint, Yaw-Pitch-Roll orientation, Share behavior, selected-satellite right-side detail panel, SSL 1300 restriction behavior, selected-satellite observer tracking, model loading, and existing satellite visualization behavior unless explicitly changed below.

Requirements:

1. Keep the release date and version exactly `Release Date: 2026-06-06  Version 1.5.21`.
2. Update the visible application, JavaScript, and Python server version to `1.5.21`.
3. In the right-side selected-satellite detail panel, make satellite data and TLE details independently collapsible/expandable.
4. By default, when a satellite is selected, both satellite data and TLE details must be expanded by using `<details open>`.
5. Provide clear section headers/toggle controls for `Satellite data` and `TLE details`.
6. After `TLE details`, add a `Source detail` section only for selected satellites that use a known Starlink or ISS external model source.
7. The `Source detail` section must be expanded by default using `<details open>`.
8. For Starlink models, display bold red text: `Model downloaded from https://sketchfab.com/malacodart, license: CC Attribution / Creative Commons Attribution.`
9. For ISS models, display bold red text: `Model downloaded from https://github.com/nasa/NASA-3D-Resources, courtesy: NASA (National Aeronautics and Space Administration).`
10. Do not show the `Source detail` section for other satellite models unless a source attribution is explicitly defined.
11. For ISS selected-model orientation only, swap the yaw and pitch control mapping: the ISS `Yaw` slider must drive the behavior previously driven by pitch, and the ISS `Pitch` slider must drive the behavior previously driven by yaw.
12. The ISS pitch axis, local `+Y`, must point to Earth/nadir and keep pointing to Earth as the ISS position updates over time.
13. Keep ISS local `+X` aligned with velocity and keep local `+Z` as the right-handed negative cross-track complement.
14. Keep ISS `Roll` unchanged.
15. Do not change Starlink or other satellite yaw/pitch/roll behavior.
16. Preserve the transparent right-side panel styling, UTC-clock width matching, and existing selected-satellite metadata/TLE content without duplication.
17. Preserve TLE line 1 and TLE line 2 display exactly once when the TLE section is expanded.
18. Capture the ADCS/attitude screenshot correction requirements: fix any clipped title/header, prevent the Attitude table from hiding the satellite model or attitude axes, center the satellite model with enough margin, keep yaw/pitch/roll labels readable and attached to the correct axes, keep dashed reference lines from interfering with the table, align table headers and numeric columns, use `(deg)`, `(deg/s)`, and `(N m)` units consistently, add or preserve a small blue-axis legend, and keep the layout responsive.
19. If the ADCS/attitude visualization source file is not present in the repository, document that limitation in `README.md` and `Test_and_Integration.md` rather than guessing at an unrelated page.
20. Update automated tests, `README.md`, and `Test_and_Integration.md` for Version `1.5.21`.

Acceptance Criteria:

- Latest release is `Release Date: 2026-06-06  Version 1.5.21`.
- `index.html` displays `Version 1.5.21 - hosted at GitHub Repo`.
- The selected-satellite detail panel shows `Satellite data` and `TLE details` expanded by default after each satellite selection, using `<details open>`.
- Expanding `Satellite data` reveals the existing metadata rows.
- Expanding `TLE details` reveals TLE line 1 and TLE line 2 exactly once.
- Selecting a Starlink model shows an expanded `Source detail` section after `TLE details` with bold red Sketchfab/Creative Commons Attribution text.
- Selecting an ISS model shows an expanded `Source detail` section after `TLE details` with bold red NASA 3D Resources courtesy text.
- Other models do not show `Source detail` unless source attribution is explicitly defined.
- ISS selected-model orientation swaps yaw and pitch control inputs while keeping roll unchanged.
- ISS local `+Y`/pitch axis points to Earth/nadir and keeps tracking Earth as the satellite propagates.
- Starlink and other selected models keep the standard yaw/pitch/roll mapping.
- The right-side panel keeps transparent styling and matches the UTC clock width.
- ADCS/attitude source availability is explicitly documented if the source file is missing.
- Automated tests and syntax checks pass, or any limitation is explicitly documented.

## Release Date: 2026-06-06  Version 1.5.20

Implement Version 1.5.20 Mercator overlay placement and selected-model Sun/Earth-reflection lighting update.

This release builds on Version 1.5.19. Preserve the optional Python server data path, silent offline/local fallback, server status icon and panel, Help Markdown viewer pages, Licenses action, metallic accordion styling, Version 1.5.19 menu order and launch defaults, synchronized `Time x` sliders, selected-satellite control gating, search dropdown portal behavior, filters, timelines, Mercator view, orbit, footprint, Yaw-Pitch-Roll orientation, Share behavior, selected-satellite right-side detail panel, SSL 1300 restriction behavior, selected-satellite observer tracking, model loading, and existing satellite visualization behavior unless explicitly changed below.

Requirements:

1. Keep the release date and version exactly `Release Date: 2026-06-06  Version 1.5.20`.
2. Update the visible application, JavaScript, and Python server version to `1.5.20`.
3. When `Globe` and `Mercator` are both selected, place the Mercator map overlay on the bottom-right of the canvas so it is not hidden by the left menu.
4. Keep Mercator-only mode fullscreen and Globe-only mode unchanged.
5. Make the Sun the dominant light source for selected detailed satellite models, including Starlink solar panels.
6. Update Sun lighting before the 3D render so satellite model lighting is not one frame stale when time changes.
7. Keep any camera-attached fill light minimal so it cannot wash out solar panels or become the primary light source.
8. Add subtle Earth-reflected albedo light for selected detailed models when possible, so solar panels can show visible Earth reflection without overexposure.
9. Preserve selected-satellite tracking, zoom, and orbit controls while `Time x` changes.
10. Include all updates since Version 1.5.19 in `README.md`, `Test_and_Integration.md`, and automated tests.

Acceptance Criteria:

- Latest release is `Release Date: 2026-06-06  Version 1.5.20`.
- `index.html` displays `Version 1.5.20 - hosted at GitHub Repo`.
- Combined Globe + Mercator mode shows the Mercator overlay at the bottom-right of the canvas.
- Mercator-only mode remains fullscreen.
- Selected detailed satellite lighting is Sun-driven, with Earth albedo available as a subtle secondary reflection when possible.
- Starlink solar panels should not be washed out by camera fill light.
- Automated tests and syntax checks pass, or any limitation is explicitly documented.

## Release Date: 2026-06-06  Version 1.5.19

Implement Version 1.5.19 selected-satellite detail cleanup and SSL 1300 model restriction update.

This release builds on Version 1.5.18. Preserve the optional Python server data path, silent offline/local fallback, server status icon and panel, Help Markdown viewer pages, Licenses action, metallic accordion styling, Version 1.5.18 menu order and launch defaults, synchronized `Time x` sliders, selected-satellite control gating, search dropdown portal behavior, filters, timelines, Mercator view, orbit, footprint, Yaw-Pitch-Roll orientation, Share behavior, and existing satellite visualization behavior unless explicitly changed below.

Requirements:

1. Keep the release date and version exactly `Release Date: 2026-06-06  Version 1.5.19`.
2. Update the visible application, JavaScript, and Python server version to `1.5.19`.
3. After selecting a satellite, remove the detailed selected-satellite data/TLE table from the `Satellite Selection` menu. Do not duplicate detailed satellite metadata or TLE lines inside the menu.
4. Keep selected-satellite data and TLE details only in the right-side panel on the canvas under the UTC clock.
5. Make the right-side selected-satellite detail panel the same width as the UTC clock/horloge.
6. Keep the existing transparent/semi-transparent styling of the right-side detail panel.
7. Fix the right-side detail panel so TLE line 1 and TLE line 2 each appear only once.
8. Use `SSL_1300.glb` only for `INTELSAT 20 (IS-20)` and `INTELSAT 18 (IS-18)`. Do not use `SSL_1300.glb` for other Intelsat, SSL, GEO, GOES, SES, manufacturer, bus, metadata, or alias matches.
9. Preserve exact model resolution for Starlink, OneWeb, O3b, ISS, and other explicitly mapped assets.
10. Update automated tests, `README.md`, and `Test_and_Integration.md` for Version 1.5.19.

Acceptance Criteria:

- Latest release is `Release Date: 2026-06-06  Version 1.5.19`.
- `index.html` displays `Version 1.5.19 - hosted at GitHub Repo`.
- Satellite Selection no longer contains the detailed selected-satellite metadata/TLE table after selection.
- The right-side selected-satellite detail panel remains under the UTC clock, uses transparent styling, matches the UTC clock width, and shows each TLE line only once.
- `SSL_1300.glb` resolves only for `INTELSAT 20 (IS-20)` and `INTELSAT 18 (IS-18)`.
- Other Intelsat/SSL/GEO/GOES/SES/manufacturer/alias matches do not resolve to `SSL_1300.glb`.
- Automated tests and syntax checks pass, or any limitation is explicitly documented.

## Release Date: 2026-06-06  Version 1.5.18

Implement the Version 1.5.18 launch-status cleanup and Satellite Selection search-dropdown visibility fix.

This release builds on Version 1.5.17. Preserve the optional Python server data path, offline/local fallback behavior, server status icon and panel, Share image capture, Swagger/API documentation behavior, Help document actions, metallic accordion styling, Version 1.5.17 menu order and launch defaults, synchronized `Time x` sliders, selected-satellite control gating, filters, timelines, Mercator view, orbit, footprint, Yaw-Pitch-Roll orientation, and existing satellite visualization behavior unless explicitly changed below.

Requirements:

1. Follow the repository execution flow.
   - Treat this `PROMPT_History.md` entry as the latest authoritative release entry.
   - Keep the release date and version exactly `Release Date: 2026-06-06  Version 1.5.18`.
   - Update the application version display to `Version 1.5.18 - hosted at GitHub Repo`.
   - Before code changes, inspect `git status` and do not mix unrelated existing work, generated files, staged files, or untracked assets into the implementation.
   - Update `Test_and_Integration.md` for every new behavior, regression risk, and verification step.
   - Update `README.md` when usage, controls, menu behavior, testing, or documentation references change.
   - Ensure `README.md` references every repository Markdown file with a short explanation.

2. Remove the automatic offline notice/tag on launch.
   - When `index.html` launches and the Python server is unavailable, do not show the visible tag/banner/message:
     `Server unavailable. Using local satellite data.`
   - The app must still silently fall back to local satellite data exactly as before.
   - Keep the server status icon/control visible and accessible so users can still inspect connected, checking, offline, and error states.
   - The server status panel may still report offline/local-data state when the user opens or focuses the status control, but the launch screen must not show an unsolicited offline tag/banner.
   - Do not use blocking alerts, repeated notifications, or layout-shifting offline messages during startup.
   - Keep console diagnostics for server connection failure and local-data fallback if they already exist.

3. Fix Satellite Selection search dropdown stacking and visibility.
   - When the user searches in the `Satellite Selection` combo box, the dropdown/list of matching satellites must be clearly visible.
   - The dropdown must render above other menu elements, accordion panels, filters, buttons, metadata, and nearby controls.
   - The dropdown must not be clipped by parent containers, accordion content overflow, menu scroll containers, metallic panel backgrounds, or z-index stacking contexts.
   - If needed, change the dropdown positioning strategy, z-index, overflow rules, or render target so search results remain visible while preserving the existing menu layout.
   - Keep the dropdown aligned with the search input and constrained to the viewport/menu width so it remains usable on desktop and narrow screens.
   - Keep the result list scrollable when many results match.
   - Preserve existing search behavior:
     - search by satellite name, NORAD ID, orbit type, or tag
     - mouse selection
     - keyboard arrow navigation
     - Enter to select
     - Escape, Tab, outside click, or selection closes the dropdown
     - no closed dropdown should block clicks on controls behind it
   - Preserve selected-satellite workflow, selected-satellite summary, metadata display, show-only-selected behavior, shortcuts, timeline selection, and shared-link restoration.

4. Move Starlink and ISS shortcut buttons into Satellite Selection.
   - Move the `Starlink (<NORAD ID>)` shortcut button, such as `Starlink (44714)`, from `Views & Time` into the `Satellite Selection` section.
   - Move the `ISS` shortcut button from `Views & Time` into the `Satellite Selection` section.
   - Place these shortcut buttons near the satellite search combo so they are part of the satellite-selection workflow.
   - Remove the Starlink and ISS shortcut row from `Views & Time`.
   - Preserve the existing shortcut behavior:
     - Starlink resolves dynamically to the first loaded Starlink target and displays its NORAD ID when available.
     - Starlink shows its unavailable fallback when no Starlink target can be resolved.
     - ISS resolves to ISS/ZARYA, preferring NORAD `25544`.
     - ISS shows its unavailable fallback when no ISS target can be resolved.
     - Both shortcuts select satellites through the same normal selection path as the combo box, timeline selection, and shared-link restoration.
     - Selecting either shortcut still updates selected-satellite summary, metadata, show-only-selected state, camera/model framing, orbit, footprint, Yaw-Pitch-Roll gating, and high-definition Earth behavior as before.
   - Keep the shortcut buttons visually consistent with the `Satellite Selection` metallic section styling and usable on desktop and narrow screens.
   - Keep the `Views & Time` section focused on view mode, display, and time controls after the shortcuts are moved.

5. Add a right-side selected-satellite data and TLE detail panel.
   - After a satellite is selected, display all available data and TLE details for the selected satellite on the right side of the canvas.
   - Position the panel under the UTC time clock/horloge area so it does not overlap the clock.
   - Use a transparent or semi-transparent background so the canvas remains visible behind the panel.
   - Keep the styling consistent with the existing OpenBEXI CSS: compact text, readable contrast, existing colors, borders, shadows, and spacing.
   - The panel must include at minimum:
     - satellite name
     - NORAD ID
     - orbit type
     - tag/operator/company when available
     - launch date when available
     - selected satellite metadata already available to the app
     - TLE line 1
     - TLE line 2
   - If additional selected-satellite fields are available, show them in a compact readable key/value layout.
   - Preserve the existing Satellite Selection menu details unless intentionally mirrored; do not remove existing selected-satellite summary or metadata from the menu unless the implementation explicitly keeps equivalent access.
   - The right-side panel must update whenever selection changes through the combo box, Starlink shortcut, ISS shortcut, timeline selection, globe/map selection, or shared-link restoration.
   - Hide or clear the panel when no satellite is selected.
   - The panel must not block canvas interaction more than necessary; use pointer-events carefully so text can be selected if practical while the canvas remains usable outside the panel.
   - Keep the panel responsive on narrow screens; if the right side is too small, stack or constrain the panel without covering essential menu controls, the clock, or the Time x slider.
   - Keep TLE text readable and copyable where practical, with wrapping or horizontal scrolling that does not break layout.

6. Restrict `SSL_1300.glb` model resolution.
   - In `js/satelliteModelResolver.js`, use `SSL_1300.glb` only when the selected satellite's app satellite identifier is exactly `20`.
   - Treat `20` as an exact identifier match, not as a partial text match.
   - Do not use `SSL_1300.glb` as a generic GEO, SSL, SSL 1300, manufacturer, company, metadata, name, alias, or fallback model for other satellites.
   - Remove or disable broad aliases that cause `SSL_1300.glb` to be selected for satellites other than identifier `20`.
   - If the current data schema has multiple possible identifier fields, inspect the loaded satellite data and document which field represents the requested satellite identifier `20`.
   - Do not confuse this requirement with NORAD ID unless the existing data confirms the selected satellite's intended identifier field is `norad_id`.
   - Satellites other than identifier `20` that previously matched the generic SSL 1300 fallback must use their exact configured model, another valid exact mapping, or the normal sprite fallback.
   - Preserve exact model resolution for Starlink, OneWeb, O3b, ISS, and other explicitly mapped assets.
   - Log or expose diagnostics explaining when `SSL_1300.glb` is skipped because the selected satellite identifier is not `20`.

7. Fix Help Licenses action error response.
   - Use the attached screenshot as evidence that selecting `Licenses` currently opens `http://127.0.0.1:8000/LICENSE.md` and receives an HTTP 404 error response:
     `Error response`
     `Error code: 404`
     `Message: File not found.`
   - Correct the Help `Licenses` / `Licences` action so it opens a valid existing license resource instead of a 404 page.
   - Prefer adding or serving a real Markdown license page at `LICENSE.md` if the Help action targets `LICENSE.md`.
   - If the app keeps the existing plain-text `LICENSE` file as the source of truth, the Help action may target `LICENSE` directly, but the visible Help behavior must not lead users to a missing page.
   - Keep the visible Help label consistent with the current UI spelling, and support the user-facing `Licences` wording if that is what appears in the menu.
   - The license page/action must work when served by `py -m http.server`, by the optional Python server, and by static hosting such as GitHub Pages.
   - If Markdown rendering is used, keep it safe by escaping raw HTML and sanitizing links before injecting rendered content.
   - Do not break the existing Help actions for GitHub, README, Releases History, Swagger, API, or the disclaimer.

8. Open README and Releases History Markdown in a separate page.
   - When the user selects `README` in the Help menu, display the rendered Markdown content in a new page or separate browser view, similar to the way Swagger opens separately.
   - When the user selects `Releases History` in the Help menu, display the rendered `PROMPT_History.md` content in a new page or separate browser view, similar to the way Swagger opens separately.
   - Do not render README or Releases History inline inside the compact Help accordion panel as the primary behavior.
   - The new page/view must render Markdown as readable HTML, not raw plain text, when served over HTTP.
   - Provide a safe fallback link or message if Markdown cannot be loaded, such as when the app is opened through a restricted local mode.
   - Keep Markdown rendering safe by escaping raw HTML and sanitizing links before injecting rendered content.
   - Preserve the existing Help menu labels `README` and `Releases History`.
   - Preserve Swagger, API, Licenses/Licences, GitHub, and disclaimer behavior.
   - The separate Markdown page/view must work with the optional Python server, a simple static HTTP server, and static hosting such as GitHub Pages.

9. Documentation and tests.
   - Add or update automated tests confirming the latest release entry is Version 1.5.18.
   - Add tests confirming the visible offline launch text `Server unavailable. Using local satellite data.` is not shown automatically on startup.
   - Add tests confirming server status icon/panel hooks still exist and offline/local-data status remains accessible without an unsolicited launch tag.
   - Add tests confirming the satellite search dropdown has CSS/markup/runtime hooks that keep it above other menu elements.
   - Add tests confirming hidden search results cannot block pointer events on controls behind them.
   - Add tests confirming the search dropdown remains keyboard accessible and closes on Escape, Tab, outside click, and selection.
   - Add tests confirming Starlink and ISS shortcut buttons are in `Satellite Selection`, not `Views & Time`.
   - Add tests confirming Starlink and ISS shortcuts still use the normal satellite-selection path and dynamic/unavailable labels.
   - Add tests confirming the right-side selected-satellite detail panel exists, is positioned under the UTC clock, and is hidden when no satellite is selected.
   - Add tests confirming the right-side detail panel displays selected satellite metadata and TLE line 1/line 2 when a satellite is selected.
   - Add tests confirming the right-side detail panel updates for combo-box selection, Starlink shortcut, ISS shortcut, timeline selection, and shared-link restoration where practical.
   - Add tests or CSS checks confirming the panel uses transparent/semi-transparent styling and remains responsive.
   - Add model resolver tests confirming `SSL_1300.glb` resolves only for satellite identifier `20`.
   - Add model resolver tests confirming generic SSL, SSL 1300, GEO, manufacturer, alias, or metadata fallback does not resolve `SSL_1300.glb` for any other satellite.
   - Add regression tests confirming Starlink, OneWeb, O3b, ISS, and other exact model mappings still resolve correctly.
   - Add tests confirming the Help Licenses/Licences action targets an existing resource and does not produce a `/LICENSE.md` 404.
   - Add tests confirming README and Releases History Help actions open a separate Markdown page/view instead of rendering inline in the Help accordion.
   - Add tests confirming the separate Markdown page/view can render both `README.md` and `PROMPT_History.md` safely.
   - Add server/static smoke checks for the license target used by the Help action.
   - Update `Test_and_Integration.md` with manual desktop and narrow-screen checks for:
     - launch with no Python server running
     - no visible offline tag/banner at startup
     - server status icon/panel still communicates offline/local fallback
     - satellite search dropdown visibility above Filters and other menu controls
     - dropdown scrolling with many matches
     - mouse and keyboard selection
     - Escape, Tab, outside click, and selection close behavior
     - Starlink and ISS shortcut buttons appear in `Satellite Selection`
     - Starlink and ISS shortcut buttons no longer appear in `Views & Time`
     - Starlink and ISS shortcuts still select satellites correctly
     - selected satellite metadata and TLE details appear on the right side under the UTC clock after selection
     - the right-side detail panel updates when switching selected satellites
     - the right-side detail panel hides or clears when no satellite is selected
     - the right-side detail panel uses transparent/semi-transparent styling and does not obscure essential canvas/menu controls
     - `SSL_1300.glb` loads only for satellite identifier `20`
     - other satellites that previously matched generic SSL/GEO fallback do not load `SSL_1300.glb`
     - selecting Help Licenses/Licences opens a valid license page without the 404 error response shown in the screenshot
     - selecting Help README opens rendered README Markdown in a separate page/view
     - selecting Help Releases History opens rendered `PROMPT_History.md` Markdown in a separate page/view
   - Update `README.md` with the revised launch-status behavior and any dropdown behavior notes if user-visible behavior changes.
   - Keep existing server, local fallback, Share, Swagger/API docs, Help actions, menu order, accordion defaults, synchronized `Time x` sliders, selected-satellite options, shortcut, orbit, footprint, timeline, Mercator, model, and orientation tests passing.

Acceptance Criteria:

- Latest release is `Release Date: 2026-06-06  Version 1.5.18`.
- `index.html` displays `Version 1.5.18 - hosted at GitHub Repo`.
- Launching `index.html` with the Python server unavailable does not show the visible tag/banner/message `Server unavailable. Using local satellite data.`
- Offline/local fallback behavior still works exactly as before.
- The server status icon/control remains visible, accessible, and able to expose offline/local-data state through its status panel.
- No startup offline notice causes layout shift or blocks menu controls.
- Satellite Selection search results are visible when typing in the combo box.
- The search dropdown appears above other menu elements and is not clipped by accordion/menu overflow.
- The dropdown remains aligned with the search input and usable on desktop and narrow screens.
- Mouse selection and keyboard selection still work.
- Escape, Tab, outside click, and satellite selection close the dropdown.
- Hidden/closed search results do not intercept clicks or focus.
- `Starlink (<NORAD ID>)`, including examples such as `Starlink (44714)`, and `ISS` shortcut buttons appear in `Satellite Selection`.
- Starlink and ISS shortcut buttons no longer appear in `Views & Time`.
- Starlink and ISS shortcuts preserve their dynamic labels, unavailable fallbacks, and normal satellite-selection behavior.
- After selecting a satellite, a right-side panel under the UTC clock displays selected-satellite data and TLE details.
- The right-side panel includes TLE line 1 and TLE line 2 plus available metadata such as name, NORAD ID, orbit type, tag/operator/company, and launch date.
- The right-side panel has transparent/semi-transparent styling consistent with the existing OpenBEXI CSS.
- The right-side panel updates for every supported satellite-selection path and hides or clears when no satellite is selected.
- The right-side panel remains readable and responsive without covering essential controls.
- `SSL_1300.glb` is used only for the selected satellite whose app satellite identifier is exactly `20`.
- No other satellite resolves to `SSL_1300.glb` through generic SSL, GEO, manufacturer, alias, metadata, or fallback matching.
- Starlink, OneWeb, O3b, ISS, and other explicit model mappings still resolve correctly.
- Selecting Help `Licenses` / `Licences` opens an existing license resource and does not show the HTTP 404 error response from `/LICENSE.md`.
- The license target works with the optional Python server, a simple static HTTP server, and static hosting.
- Selecting Help `README` opens rendered README Markdown in a separate page/view, not inline as the primary Help accordion behavior.
- Selecting Help `Releases History` opens rendered `PROMPT_History.md` Markdown in a separate page/view, not inline as the primary Help accordion behavior.
- The separate Markdown page/view escapes raw HTML, sanitizes links, and works with the optional Python server, a simple static HTTP server, and static hosting.
- Satellite selection, selected-satellite controls, metadata, shortcuts, timeline selection, and shared-link restoration still work.
- `README.md`, `Test_and_Integration.md`, and automated tests are updated.
- Automated tests and syntax checks pass, or any limitation is explicitly documented.

---

## Release Date: 2026-06-06  Version 1.5.17

Implement the Version 1.5.17 menu ordering, launch defaults, time-speed control placement, and menu text cleanup.

This release builds on Version 1.5.16. Preserve the optional Python server data path, offline/local fallback behavior, Share image capture, Swagger/API documentation behavior, Help document actions, metallic accordion styling, selected-satellite control gating, filters, timelines, Mercator view, orbit, footprint, Yaw-Pitch-Roll orientation, and existing satellite visualization behavior unless explicitly changed below.

Interpret the requested launch state wording `elapsed` as expanded/open on page load.

Requirements:

1. Follow the repository execution flow.
   - Treat this `PROMPT_History.md` entry as the latest authoritative release entry.
   - Keep the release date and version exactly `Release Date: 2026-06-06  Version 1.5.17`.
   - Update the application version display to `Version 1.5.17 - hosted at GitHub Repo`.
   - Before code changes, inspect `git status` and do not mix unrelated existing work, generated files, or untracked assets into the implementation.
   - Update `Test_and_Integration.md` for every new behavior, regression risk, and verification step.
   - Update `README.md` when usage, controls, menu behavior, testing, or documentation references change.
   - Ensure `README.md` references every repository Markdown file with a short explanation.

2. Move `Satellite Selection` directly under `Views & Time`.
   - In the menu accordion order, place `Satellite Selection` immediately after `Views & Time`.
   - Place `Filters - Satellites Found` immediately after `Satellite Selection`.
   - The required menu order is:
     - `Views & Time`
     - `Satellite Selection`
     - `Filters - Satellites Found`
     - `Other Selections`
     - `Timelines`
     - `Share`
     - `Help`
   - If the Filters section header dynamically includes the number of satellites found, preserve that dynamic count while keeping the section in the required position.
   - Do not move satellite-search controls into another section unless needed to preserve the `Satellite Selection` accordion section directly below `Views & Time`.
   - Preserve keyboard accessibility, focus states, accordion semantics, and the ability for multiple sections to remain open after user interaction.

3. Change the default accordion launch state.
   - When `index.html` launches or refreshes, these sections must start expanded/open:
     - `Views & Time`
     - `Satellite Selection`
     - `Filters - Satellites Found`
   - `Other Selections`, `Timelines`, `Share`, and `Help` must start collapsed.
   - Persisted accordion state must not override these launch defaults on page load or refresh.
   - After launch, user accordion interactions may still open or close any section without forcing only one section open.

4. Add a synchronized `Time x` slider inside `Views & Time`.
   - Remove the visible instructional text from `Views & Time`:
     `Use the time slider at the top of the screen to control simulation speed.`
   - Replace that text with a real `Time x` slider at the top of the `Views & Time` section.
   - Keep the existing `Time x` slider at the top of the canvas unchanged.
   - Both `Time x` sliders must control the same simulation-speed state.
   - Changing either slider must immediately update the other slider, its label/value display, and the simulation speed.
   - Keep both sliders consistent in range, step size, default value, keyboard behavior, accessible label, tooltip/title, formatting, and persistence behavior.
   - Do not create duplicate simulation timers, duplicate animation loops, or conflicting speed state.
   - Keep the added menu slider visually consistent with the compact metallic `Views & Time` section styling.

5. Remove obsolete visible helper text without removing required controls.
   - In `Filters - Satellites Found`, remove this visible text:
     `Orbit filter (multi-select):`
     `Choose one or more orbit families. ALL enables every orbit category.`
   - Keep the orbit filter controls and existing multi-select behavior unless another requirement explicitly changes them.
   - If a visible label is removed, preserve an accessible name using `aria-label`, `aria-labelledby`, or equivalent markup.
   - In `Satellite Selection`, remove this visible text:
     `Select Satellite:`
     `Search by name, NORAD ID, orbit type, or tag.`
   - Keep satellite search, dropdown selection, shortcut selection, timeline selection, selected-satellite restoration, and selected-satellite gating behavior working.
   - Do not leave empty placeholder gaps where the removed text used to appear.

6. Documentation and tests.
   - Add or update automated tests confirming the latest release entry is Version 1.5.17.
   - Add tests confirming the menu order is `Views & Time`, `Satellite Selection`, `Filters - Satellites Found`, `Other Selections`, `Timelines`, `Share`, `Help`.
   - Add tests confirming `Views & Time`, `Satellite Selection`, and `Filters - Satellites Found` launch expanded/open, while the remaining sections launch collapsed.
   - Add tests confirming persisted accordion state does not override the required launch defaults.
   - Add tests confirming the menu `Time x` slider and canvas `Time x` slider stay synchronized in both directions.
   - Add tests confirming the removed visible helper text no longer appears.
   - Add tests confirming orbit filter controls and satellite search/selection still work after the text cleanup.
   - Add accessibility tests or checks for labels/names on the remaining filter and satellite-selection controls.
   - Update `Test_and_Integration.md` with manual checks for the new menu order, launch defaults, duplicated synchronized `Time x` sliders, removed text, desktop layout, mobile layout, keyboard navigation, and regression behavior.
   - Update `README.md` with the revised menu order, launch defaults, `Time x` slider placement, and Markdown-file reference index.
   - Keep existing server, Share, Swagger/API docs, Help actions, selected-satellite options, shortcut, orbit, footprint, timeline, Mercator, model, and orientation tests passing.

Acceptance Criteria:

- Latest release is `Release Date: 2026-06-06  Version 1.5.17`.
- `index.html` displays `Version 1.5.17 - hosted at GitHub Repo`.
- `Satellite Selection` appears immediately under `Views & Time`.
- `Filters - Satellites Found` appears immediately under `Satellite Selection`.
- On every launch or refresh, `Views & Time`, `Satellite Selection`, and `Filters - Satellites Found` start expanded/open.
- On every launch or refresh, `Other Selections`, `Timelines`, `Share`, and `Help` start collapsed.
- Persisted accordion state does not override the required launch defaults.
- The visible text `Use the time slider at the top of the screen to control simulation speed.` no longer appears in `Views & Time`.
- A real `Time x` slider appears at the top of `Views & Time`.
- The existing canvas-top `Time x` slider remains in place.
- The menu `Time x` slider and canvas-top `Time x` slider stay synchronized in both directions and drive one shared simulation-speed state.
- The visible text `Orbit filter (multi-select): Choose one or more orbit families. ALL enables every orbit category.` no longer appears.
- Orbit filter controls and multi-select behavior still work.
- The visible text `Select Satellite: Search by name, NORAD ID, orbit type, or tag.` no longer appears.
- Satellite search, dropdown selection, shortcut selection, timeline selection, and restored shared-link selection still work.
- Removed text does not leave empty layout gaps.
- Remaining controls keep accessible names and keyboard support.
- `README.md`, `Test_and_Integration.md`, and automated tests are updated.
- Automated tests and syntax checks pass, or any limitation is explicitly documented.

---

## Release Date: 2026-06-04  Version 1.5.16

Implement the Version 1.5.16 menu UX revision, selected-satellite control gating, Help documentation redesign, and header alignment updates.

This release builds on Version 1.5.15. Preserve the optional Python server data path, offline/local fallback behavior, Share image capture, Swagger contrast improvements, selected-satellite camera/model workflow, filters, timelines, Mercator view, orbit, footprint, Yaw-Pitch-Roll orientation, and existing satellite visualization behavior unless explicitly changed below.

Requirements:

1. Follow the repository execution flow.
   - Treat this `PROMPT_History.md` entry as the latest authoritative release entry.
   - Keep the release date and version exactly `Release Date: 2026-06-04  Version 1.5.16`.
   - Before code changes, inspect `git status` and do not mix unrelated existing work, generated files, or untracked assets into the implementation.
   - Update `Test_and_Integration.md` for every new behavior, regression risk, and verification step.
   - Update `README.md` when setup, usage, controls, Help, or documentation references change.
   - Ensure `README.md` references every repository Markdown file with a short explanation.

2. Fix the top menu header layout.
   - The `Version 1.5.16 - hosted at GitHub Repo` text/link must be visually centered in the menu header.
   - The external `Close` menu button, version/GitHub text, and server status control must align on one compact row on desktop.
   - Online and offline server states must use these icon assets from `./icons/`:
     - Online/connected: `power_green.png`
     - Offline/disconnected/error: `power_red.png`
   - The server status icon/control must align with the `Close` button at the same visual height.
   - Keep spacing stable when server status changes between checking, connected, disconnected, and error.
   - On narrow screens, allow wrapping only when needed while keeping the header controls readable.

3. Change the default accordion launch state.
   - `Views & Time`, `Filters`, and `Satellite Selection` must be collapsed by default on every page load.
   - `Other Selections`, `Timelines`, `Share`, and `Help` must also start collapsed.
   - Persisted accordion state must not reopen sections on launch or refresh.
   - Multiple accordion sections must still be allowed to remain open after user interaction.
   - Accordion toggles must remain keyboard accessible with clear focus states.

4. Update menu section naming and order.
   - Rename `View` to `Views & Time`.
   - Remove the `Settings` accordion section from markup, CSS hooks, tests, README, and integration docs.
   - Add this instruction under `Views & Time`: `Use the time slider at the top of the screen to control simulation speed.`
   - The menu order must be:
     - `Views & Time`
     - `Filters`
     - `Satellite Selection`
     - `Other Selections`
     - `Timelines`
     - `Share`
     - `Help`
   - `Other Selections` must appear immediately after `Satellite Selection`.
   - `Share` must appear immediately after `Timelines`.

5. Gate selected-satellite options.
   - The following controls must be visible only when a satellite is selected:
     - `Yaw-Pitch-Roll`
     - `Show Footprint`
     - `Show only selected satellite`
     - `Orbit Frame (LVLH)`
     - `Show Orbit`
   - Default states:
     - `Show Footprint`: unchecked by default.
     - `Show only selected satellite`: checked by default whenever a satellite becomes selected.
     - `Orbit Frame (LVLH)`: unchecked by default.
     - `Show Orbit`: unchecked by default.
     - `Yaw-Pitch-Roll`: preserve existing default and persistence behavior unless no satellite is selected.
   - Define satellite selection consistently across dropdown/search selection, shortcut selection, timeline selection, map/globe selection, and shared/restored URL selection.
   - Hidden controls must be removed from layout and from the accessible tree using `hidden`, `aria-hidden`, or equivalent semantics; do not only make them transparent.
   - Remove the visible `No satellite selected` text below the checkbox area and do not leave empty placeholder space.
   - Yaw, pitch, and roll sliders must still only appear when `Yaw-Pitch-Roll` is enabled and a satellite is selected.

6. Redesign accordion visual backgrounds.
   - Each expanded accordion content area must visually reflect the color of its header accent.
   - `Views & Time` must use a light metallic yellow gradient that softly fades toward the bottom.
   - `Filters` must use a light metallic blue gradient that softly fades toward the bottom.
   - `Satellite Selection`, `Other Selections`, `Timelines`, `Share`, and `Help` must each use subtle metallic gradients matching their existing accent colors.
   - Keep text, controls, hover states, active states, and selected states readable with strong contrast.
   - Preserve the established OpenBEXI compact dark/metallic visual identity; do not replace it with generic browser accordion styling.
   - Verify desktop and mobile widths.

7. Redesign Help with document-style actions.
   - Redesign Help as a cleaner smart/document view while preserving the existing OpenBEXI visual language.
   - Keep the `Disclaimer` block at the bottom of Help.
   - Keep the `README` and `Releases History` actions; `Releases History` must still target `PROMPT_History.md`.
   - Add or preserve a Markdown license target so Licenses can open as a Markdown page.
   - `Swagger`, `API`, and `Licenses` actions must open a separate page or view.
   - Do not add or display this text: `Swagger / API DocumentationSwagger and OpenAPI documentation are available from the connected Python server.`
   - Do not disable Swagger/API actions solely because the Python server is offline; instead, open the best-known documentation URL/page and let the user start the server if the new page cannot connect.
   - Keep Markdown rendering safe: escape raw HTML and sanitize links before injecting rendered Markdown.

8. Documentation and tests.
   - Update automated tests for the new accordion defaults, section order, removed Settings section, Help link behavior, power icon filenames, selected-satellite option visibility, and default checkbox states.
   - Update `Test_and_Integration.md` with manual checks for desktop, mobile, Help document actions, server online/offline icons, and selected-satellite option visibility.
   - Update `README.md` with the revised launch defaults, menu order, selected-satellite controls, Help document actions, and Markdown-file reference index.
   - Keep existing server, Share, Swagger/API docs, satellite selection, shortcut, orbit, footprint, timeline, Mercator, model, and orientation tests passing.

Acceptance Criteria:

- Latest release is `Release Date: 2026-06-04  Version 1.5.16`.
- `index.html` displays `Version 1.5.16 - hosted at GitHub Repo`.
- The GitHub/version text is centered in the menu header and aligned with the `Close` and server status controls.
- Connected server status uses `./icons/power_green.png`; disconnected/error status uses `./icons/power_red.png`.
- All accordion sections launch collapsed by default, including `Views & Time`, `Filters`, and `Satellite Selection`.
- Persisted accordion state cannot reopen sections on page refresh.
- The menu order is `Views & Time`, `Filters`, `Satellite Selection`, `Other Selections`, `Timelines`, `Share`, `Help`.
- `Settings` no longer appears as a menu section.
- The time-slider instruction appears under `Views & Time`.
- Selected-satellite checkboxes are hidden until a satellite is selected.
- `Show only selected satellite` is checked when a satellite is selected.
- `Show Footprint`, `Orbit Frame (LVLH)`, and `Show Orbit` start unchecked.
- The visible `No satellite selected` placeholder below the checkboxes no longer appears and leaves no spacing gap.
- Expanded accordion content backgrounds match their section accent colors with subtle metallic fading gradients.
- Help uses document-style actions, keeps the disclaimer at the bottom, opens Swagger/API/Licenses in a separate page or view, and does not display the prohibited Swagger/API sentence.
- `README.md`, `Test_and_Integration.md`, and automated tests are updated.
- Automated tests and syntax checks pass, or any limitation is explicitly documented.

---

## Release Date: 2026-06-04  Version 1.5.15

Implement the Version 1.5.15 menu launch, Help Markdown, and header alignment updates.

This release builds on Version 1.5.14. Preserve the optional Python server data path, offline fallback behavior, Share image capture, Swagger contrast improvements, server status icons, and existing satellite visualization behavior.

Requirements:

1. Change the initial accordion launch state.
   - When `index.html` launches, only these menu sections must start expanded:
     - `View`
     - `Filters`
     - `Satellite Selection`
   - `Timelines`, `Other Selections`, `Settings`, `Share`, and `Help` must start collapsed.
   - Persisted accordion state must not reopen non-default sections on page launch.
   - Multiple accordion sections must still be allowed to remain open after user interaction.

2. Render Help Markdown content.
   - In the Help section, `README.md` and `PROMPT_History.md` must be displayed as rendered Markdown, not as raw plain text.
   - Keep Markdown rendering local to the app and safe: do not inject untrusted raw HTML from Markdown.
   - Provide a clear fallback message or direct file link if Markdown content cannot be loaded, such as when opened through `file://`.
   - Keep the Help section styling consistent with the current menu CSS.

3. Rename the Prompt History Help action.
   - Rename the visible Help action text from `Prompt History` to `Releases History`.
   - The action must still load or reference `PROMPT_History.md`.

4. Fix the top menu header alignment.
   - Use the attached screenshot as evidence that `Close`, `Version 1.5.14 - hosted at GitHub Repo`, and server connection status are currently misaligned.
   - For Version 1.5.15, align `Close`, `Version 1.5.15 - hosted at GitHub Repo`, and the server status icon/text on the same row on desktop.
   - Make spacing, vertical centering, icon size, and button height consistent.
   - On narrow screens, allow wrapping only if required, but preserve the order: `Close`, version, server status.
   - Avoid layout shifts when server status changes between checking, connected, disconnected, and error.

5. Version and documentation updates.
   - Update visible version text, frontend constants, server constants, and tests to Version `1.5.15`.
   - Update `README.md` with the new launch defaults, Help Markdown viewer, `Releases History` label, and header alignment behavior.
   - Update `Test_and_Integration.md` with automated and manual checks for this release.
   - Ensure `README.md` still references every repository Markdown file with a short explanation.

6. Tests and verification.
   - Add or update tests confirming Version `1.5.15` is the latest release.
   - Add or update tests confirming only `View`, `Filters`, and `Satellite Selection` are default-expanded on launch.
   - Add or update tests confirming non-default sections start collapsed even if persisted accordion state exists.
   - Add or update tests confirming Help contains rendered Markdown controls for `README.md` and `PROMPT_History.md`.
   - Add or update tests confirming the visible Prompt History action is renamed to `Releases History`.
   - Add or update tests confirming header alignment CSS hooks exist for the Close/version/server row.
   - Keep existing server, Share, Swagger, satellite selection, shortcut, orbit, timeline, and model tests passing.

Acceptance Criteria:

- Latest release is `Release Date: 2026-06-04  Version 1.5.15`.
- `index.html` displays `Version 1.5.15 - hosted at GitHub Repo`.
- On page launch, only `View`, `Filters`, and `Satellite Selection` are expanded.
- `Timelines`, `Other Selections`, `Settings`, `Share`, and `Help` launch collapsed.
- The Help section displays `README.md` and `PROMPT_History.md` as rendered Markdown through in-app controls.
- The visible Help action for `PROMPT_History.md` is `Releases History`.
- `Close`, version text, and server connection status are horizontally aligned and vertically centered on desktop.
- Server status icons from `./icons` still represent connected, disconnected, checking, and error states.
- Offline behavior, local-data fallback, Share, Swagger/API docs, and existing visualization behavior remain unchanged.
- `README.md` and `Test_and_Integration.md` are updated.
- Automated tests and syntax checks pass, or any limitation is documented.

---
## Release Date: 2026-06-04  Version 1.5.14

Improve the Version 1.5.14 server UI, Share UX, menu consistency, light metallic menu section coloring, and Swagger/API documentation readability.

Use the attached screenshot as evidence that the Swagger page currently has poor contrast. The `GET` endpoint labels and API route text are difficult to read.

Requirements:

1. Improve Swagger/API documentation contrast.
   - Make the Swagger page readable in both endpoint headers and expanded endpoint details.
   - Ensure `GET`, route names, descriptions, response blocks, and schema text have enough contrast.
   - Keep styling consistent with the current OpenBEXI dark/blue visual theme.
   - Do not leave default Swagger colors if they conflict with readability.

2. Unify the top menu row.
   - Place these items on the same horizontal row:
     - `Close` menu button
     - `Version 1.5.14 - hosted at GitHub Repo`
     - server connection status
   - Keep the row compact and readable in the current menu width.
   - Avoid layout shifts when server status changes.
   - On narrow screens, allow wrapping only if needed, but keep the order: `Close`, version, server status.

3. Use server status icons from `./icons`.
   - Add or reuse icons under `./icons` for:
     - `server_connected.svg`
     - `server_offline.svg`
     - `server_checking.svg`
     - `server_error.svg`
   - The UI should use an icon plus accessible text/tooltip.
   - Do not rely only on color to communicate connection status.

4. Preserve existing behavior.
   - If the server is disconnected, the app must continue behaving exactly as it does today.
   - Keep local-data fallback unchanged.
   - Keep Share, Help, Swagger links, and server reconnect behavior working.

5. CSS consistency.
   - Reuse the existing menu colors, spacing, borders, shadows, and compact button styles.
   - The updated row and status icon must look like part of the current UI, not a separate design.
   - Keep the layout responsive on narrow screens.
   - Keep `Other Selections` text styled consistently with the other accordion section headers.
   - Remove or adjust any special CSS that makes `Other Selections` visually different from other accordion headers unless it is only the accent color.
   - Give each menu accordion section a subtle light metallic color treatment so adjacent sections are visually distinct without breaking the current dark/blue OpenBEXI theme.
   - Match each section's expanded content, border accent, hover state, and active tab/onglet styling to that section's header accent color.
   - Keep the metallic colors light, readable, and restrained; avoid saturated neon colors, flat unrelated colors, or contrast that makes labels hard to read.
   - Use CSS variables or shared section color tokens so the menu color system is maintainable and consistent across desktop and narrow layouts.

6. Add canvas image sharing.
   - In the `Share` section, include an image preview or captured image of what is currently visible in the main canvas.
   - Provide `Preview Image`, `Download Image`, and `Copy Image` actions when supported.
   - If possible, include the canvas image when using the native Web Share API.
   - The image capture should reflect the current rendered view, including globe/Mercator mode, selected satellite, model, orbit, footprint, and visible overlays where technically possible.
   - Support both the 3D globe canvas and Mercator canvas when active.
   - Capture the canvas after the next render frame, not before rendering completes.
   - Use `canvas.toBlob()` where possible instead of blocking base64 conversion.
   - If Clipboard image copy is unsupported, disable `Copy Image` and keep `Download Image`.
   - Native Web Share should include the image file only when `navigator.canShare()` confirms support.
   - If browser security blocks canvas export because of cross-origin textures/assets, show a clear non-blocking message and keep link sharing available.
   - Do not break normal rendering or animation while capturing the image.
   - Keep the preview and image actions styled consistently with the current Share panel and menu CSS.

7. Tests and documentation.
   - Add tests for Swagger contrast CSS hooks.
   - Add tests for icon filenames and status states.
   - Add tests for top-row menu layout.
   - Add tests for `Other Selections` header style consistency.
   - Add tests for section-specific menu accent classes or CSS variables.
   - Add tests confirming each accordion tab/onglet uses the same accent color family as its matching expanded section.
   - Add tests for Share canvas capture fallback states.
   - Update `README.md`.
   - Update `Test_and_Integration.md`.

Acceptance criteria:

- Latest release is `Release Date: 2026-06-04  Version 1.5.14`.
- Swagger/API docs are readable; `GET` labels and route text have clear contrast.
- `Close`, `Version 1.5.14 - hosted at GitHub Repo`, and server status appear on one compact row.
- Server status uses icons from `./icons`.
- Required icon files exist:
  - `icons/server_connected.svg`
  - `icons/server_offline.svg`
  - `icons/server_checking.svg`
  - `icons/server_error.svg`
- Server status still has tooltip and accessible text.
- Connected, disconnected, checking, and error states are visually distinct and accessible.
- `Other Selections` text uses the same CSS style treatment as the other menu section headers.
- Each menu section has a subtle light metallic accent color that differentiates it from adjacent sections.
- Each accordion tab/onglet, border accent, hover state, and expanded section panel uses a matching color family.
- The metallic menu colors remain readable, accessible, and consistent with the current dark/blue OpenBEXI visual theme.
- The Share section can generate an image capture of the current canvas view.
- Users can preview, download, and copy the canvas image when browser support/security rules allow it.
- If canvas image capture is blocked, the app shows a clear fallback message and link sharing still works.
- Offline/local fallback behavior is unchanged.
- README and Test_and_Integration are updated.

---

## Release Date: 2026-06-04  Version 1.5.13

Add an optional Python server integration while preserving the current local/offline application behavior exactly when the server is unavailable. The existing `index.html` page must be able to connect to the Python server, use server-provided satellite data when connected, and fall back to the current local file loading path without UI breakage or behavior regressions when disconnected.

The release builds on Version 1.5.12. Preserve the existing Help section, selected-satellite workflow, menu accordion behavior, shortcuts, model orientation behavior, local data loading behavior, and GitHub Pages/local static hosting compatibility.

Requirements:

1. Create a Python server for the app.
   - Add a Python server that can be started locally and accessed by the existing frontend.
   - Prefer a framework that provides OpenAPI/Swagger documentation, such as FastAPI, unless the repository already has a stronger Python server convention.
   - The server must support CORS for local frontend development.
   - The server must expose only known application data and static resources needed by this project. Do not add an arbitrary file-read endpoint.
   - The server should optionally serve `index.html` and related static assets, but the app must also continue working when hosted statically the current way.
   - Document the default host, port, startup command, API base URL, and how to change the server URL.

2. Add required API endpoints.
   - Add `/api/health` for frontend connectivity checks.
   - Add `/api/version` returning the app/API version, release date, and server metadata.
   - Add endpoints for all satellite-related data currently loaded directly from local files, including TLE data and satellite metadata used by the frontend.
   - Add an endpoint or documented route for the OpenAPI schema, such as `/openapi.json`.
   - Add Swagger UI documentation, such as `/docs`, if supported by the selected framework.
   - Keep API response shapes simple, documented, and validated before the frontend uses them.
   - If an API response is malformed, incomplete, times out, or returns an error, the frontend must fall back to local data.

3. Update frontend data loading.
   - Add a small server-connection layer used by `index.html` and the JavaScript data loaders.
   - On startup, check the Python server using a short timeout so app startup is not delayed.
   - Default to the current local-data behavior when the server is unavailable.
   - When connected, load satellite data, TLE data, and related satellite metadata from the Python server instead of reading those datasets directly from local files.
   - Do not make per-frame API calls for satellite propagation or rendering. Load/refresh data at startup, on reconnect, or on explicit refresh only.
   - Validate server data before replacing local data.
   - If server data fails validation, keep or restore the local data path.
   - Add clear browser console logs for connection success, connection failure, data-source selection, API errors, and fallback decisions.

4. Add a server connection status icon.
   - Add a visible status icon that shows whether the app is connected to the Python server.
   - States must include connected, disconnected/offline, loading/checking, and error.
   - The icon must include accessible text, `aria-label`, and a tooltip.
   - Suggested tooltip text:
     - `Connected to server`
     - `Offline mode - using local data`
     - `Checking server connection`
     - `Server error - using local data`
   - Clicking or focusing the icon should show a compact status panel with:
     - server URL
     - connection state
     - data source: local, live server, or cached server data if caching is implemented
     - app version
     - API/server version when connected
     - last successful satellite/TLE data load time
     - reconnect or refresh action
   - If the server is unavailable, the app must behave exactly as it does today except for the non-blocking status indicator.

5. Add graceful loading and fallback UX.
   - Show a small non-blocking loading indicator while checking the server or loading server data.
   - Do not show blocking browser alerts for server connection failures.
   - Show at most one subtle offline-mode message such as `Server unavailable. Using local satellite data.`
   - Avoid repeated failure notifications.
   - Add a manual reconnect or refresh action so users can start the server after the page is already open.
   - Show the active data source somewhere unobtrusive in the UI.
   - Show the last successful data load timestamp when available.
   - If cached server data is implemented, clearly label it as cached and never let it silently override safer local fallback behavior.

6. Update the menu version text.
   - Update the menu/version display to show:
     `Version 1.5.13 - hosted at GitHub Repo`
   - `GitHub Repo` should link to `https://github.com/arcazj/openbexi_earth_orbit`.
   - The GitHub link must open in a new tab and include `rel="noopener noreferrer"`.
   - Keep the version text readable in the existing thin menu layout.

7. Add a new `Share` accordion section before `Help`.
   - Place `Share` immediately before the existing `Help` section.
   - Use the same accordion behavior as the other menu sections.
   - Do not default-expand `Share` unless the current menu pattern requires it.
   - Do not collapse or reset any other accordion section.
   - Style `Share` consistently with the current menu and with the attached Share reference image.
   - Add a shareable-link workflow for the current app state.
   - The shareable state should include selected satellite, view mode, relevant filters, simulation time, and relevant display settings when practical.
   - If camera/view state can be serialized safely, include it; otherwise document the limitation.
   - Add `Copy Link`.
   - Add a native Web Share action when supported by the browser, with a graceful disabled or hidden fallback when unsupported.
   - Add clear copied/error feedback that matches the existing UI styling.
   - Shared links must not include local filesystem paths, credentials, private server tokens, or sensitive local configuration.
   - When the app opens with share parameters, restore the state after satellite data loads and fail safely if referenced data is unavailable.

8. Update the existing `Help` section with Swagger/API documentation.
   - Keep the Help section after `Share`.
   - Add a `Swagger` or `API Documentation` subsection inside Help similar to the attached reference image.
   - When connected to the Python server, link to the Swagger UI route such as `/docs`.
   - Also expose or link to the OpenAPI schema route such as `/openapi.json`.
   - When disconnected, show a disabled/offline state with a concise message:
     `API documentation is available when the Python server is running.`
   - Keep existing Help links and disclaimer behavior from Version 1.5.12.
   - Do not break the existing Help links for GitHub, README, Prompt History, and License.

9. Keep CSS and visual design consistent.
   - Reuse existing CSS variables, colors, fonts, spacing, borders, shadows, accordion styles, menu styles, button styles, and panel behavior.
   - Do not introduce a separate visual design language for Server Status, Share, or Swagger/API documentation.
   - New icons, tooltips, panels, banners, buttons, disabled states, copied states, loading states, connected states, disconnected states, and error states must match the current application styling.
   - Keep the additions readable at the current thin menu width and on narrow screens.
   - Avoid layout shifts when server status changes from checking to connected, disconnected, or error.
   - Use subtle inline indicators instead of disruptive popups.
   - Keep hover, active, focus, disabled, loading, connected, disconnected, and error states visually consistent.
   - Share and Swagger sections must align visually with the existing menu and Help content.
   - Do not add a new UI framework just for these additions.

10. Preserve existing local/offline behavior.
   - If the server is not running, blocked by CORS, unavailable, times out, returns invalid data, or returns an error, the app must behave exactly as it does today.
   - Static hosting, including GitHub Pages-style hosting, must continue to work without the Python server.
   - Existing local file paths must remain usable as the fallback data source.
   - Do not break filters, selected-satellite search/dropdown behavior, Starlink and ISS shortcuts, timelines, Mercator, View toggles, orbit display, footprint display, Yaw/Pitch/Roll controls, selected-model loading, Help links, or model fallback behavior.
   - Multiple accordion sections must still be allowed to remain open at the same time.
   - `Filters` and `Satellite Selection` must still load expanded.

11. Add accessibility and keyboard support.
   - Server status, Share actions, Swagger/API links, reconnect buttons, and disabled states must be keyboard reachable where interactive.
   - Add clear `aria-label`, `title`, or visible text for icon-only controls.
   - Focus styling must remain visible and consistent with the current UI.
   - Disabled Swagger/API actions must communicate why they are disabled.

12. Update tests.
   - Add or update tests confirming the latest release entry is Version 1.5.13.
   - Add or update frontend tests confirming disconnected mode falls back to the existing local data path.
   - Add or update frontend tests confirming connected mode uses server-provided satellite/TLE data.
   - Add or update tests confirming invalid server responses fall back to local data.
   - Add or update tests confirming the server status icon renders connected, disconnected, loading, and error states.
   - Add or update tests confirming the status icon tooltip, accessible labels, and status panel content.
   - Add or update tests confirming reconnect/refresh actions retry the server check without breaking current local data.
   - Add or update tests confirming `Share` appears immediately before `Help`.
   - Add or update tests confirming `Share` uses the existing accordion behavior and does not collapse other sections.
   - Add or update tests confirming `Copy Link` serializes and restores the supported app state.
   - Add or update tests confirming shared links do not include unsafe local paths or credentials.
   - Add or update tests confirming Help contains a Swagger/API documentation subsection.
   - Add or update tests confirming Swagger/API links are enabled when connected and disabled with an offline explanation when disconnected.
   - Add or update API/server tests or smoke checks for `/api/health`, `/api/version`, satellite-data endpoints, TLE endpoints, `/docs`, and `/openapi.json`.
   - Keep existing Help, Starlink shortcut, ISS shortcut, selected-satellite isolation, ISS orientation, High Def., search-clear, and shortcut-path tests passing.

13. Update documentation and integration checks.
   - Update `README.md` with:
     - how to start the Python server
     - default API base URL and how to configure it
     - offline/local fallback behavior
     - server status icon behavior
     - Share section behavior
     - Swagger/API documentation access
     - version text update
   - Ensure `README.md` still references every repository Markdown file with a short explanation.
   - Update `Test_and_Integration.md` with manual checks for:
     - app loading without the Python server
     - app loading with the Python server
     - server timeout/failure fallback
     - malformed server response fallback
     - server status icon states and tooltip
     - status panel data source and last-sync values
     - reconnect/refresh after starting the server late
     - Share link copy and restore
     - Share UI on narrow screens
     - Swagger/API docs enabled while connected
     - Swagger/API docs disabled while disconnected
     - CSS consistency for all new additions
     - existing selected-satellite, filter, timeline, Mercator, View, Help, and model behaviors
   - Add any Python dependency/setup notes needed to run the server and tests.

Acceptance criteria:

- The latest release entry is `Release Date: 2026-06-04  Version 1.5.13`.
- A Python server can be started locally and reached by the existing frontend.
- `/api/health`, `/api/version`, satellite-data endpoints, TLE endpoints, Swagger UI, and OpenAPI schema routes are available and documented.
- The app uses server-provided satellite/TLE data when connected.
- The app falls back to current local file data when the server is unavailable, slow, blocked, invalid, or disconnected.
- Offline/static behavior remains visually and functionally equivalent to the current app except for the subtle status indicator.
- The status icon shows connected, disconnected/offline, loading/checking, and error states with matching CSS, tooltip text, and accessible labels.
- The status panel shows server URL, connection state, data source, version information, last load time, and reconnect/refresh action.
- The menu displays `Version 1.5.13 - hosted at GitHub Repo` with a working GitHub link.
- A `Share` accordion section appears immediately before `Help`.
- Share link copy/restore works for the supported app state and avoids unsafe local/private data.
- The Help section includes Swagger/API documentation links that are enabled when connected and clearly disabled when disconnected.
- All new UI uses CSS consistent with the existing menu, Help section, and attached reference images.
- Existing Help links and disclaimer remain intact.
- Existing filters, selected-satellite behavior, Starlink shortcut, ISS shortcut, ISS orientation, timelines, Mercator, View toggles, orbit display, footprint display, Yaw/Pitch/Roll, and model fallback behavior remain unchanged.
- `npm test` passes.
- JavaScript syntax checks pass.
- Python server/API smoke checks pass or limitations are documented.
- `Test_and_Integration.md` and `README.md` are updated according to `PROMPT.md`.

---

## Release Date: 2026-06-04  Version 1.5.12

Improve the selected-satellite shortcut labels, correct ISS model orientation, and add a Help section at the end of the menu with project references, license access, and a concise legal notice.

The release builds on Version 1.5.11. Preserve the selected-satellite workflow where shortcut selection, satellite search/dropdown selection, and timeline selection all use the same selection path, enable `Show only selected satellite`, and move the observer to the selected satellite.

Requirements:

1. Rename the Starlink shortcut button dynamically.
   - Replace the static `First Starlink` button text with:
     `Starlink (<NORAD ID>)`
   - `<NORAD ID>` must be the NORAD number of the first loaded Starlink satellite that the shortcut will select.
   - Example label: `Starlink (12345)`.
   - Use the same deterministic Starlink match introduced in Version 1.5.11, such as satellite name or company/tag containing `STARLINK`.
   - Update the button `aria-label` and `title` whenever the dynamic label is updated.
   - The `aria-label` should clearly identify the selected shortcut target, for example:
     `Select Starlink satellite NORAD 12345`.
   - If no Starlink satellite is available, disable the button and set the visible text to `Starlink unavailable`.
   - Do not change the shortcut selection path. Clicking the button must still use the normal satellite-selection path.

2. Keep the ISS shortcut clear and robust.
   - The ISS shortcut should remain visible in the `View` menu.
   - If ISS is found, keep the visible label short, such as `ISS`.
   - The `aria-label` and `title` must include the resolved ISS name and NORAD ID when available.
   - Prefer NORAD `25544` when resolving ISS.
   - Also match common names such as `ISS (ZARYA)` and `ISS`.
   - If ISS is unavailable, disable the button and set the visible text to `ISS unavailable`.
   - Clicking ISS must still use the normal satellite-selection path.

3. Correct ISS model yaw/pitch/roll orientation according to the attached reference picture.
   - Use the attached picture as the visual reference for ISS in-orbit orientation.
   - ISS local/model axes should align as:
     - `+X` points along the velocity vector, the direction of travel.
     - `+Y` points to starboard and completes the right-handed frame.
     - `+Z` points toward Earth/nadir.
   - Compute the live ISS orbital frame from propagated position and velocity.
   - Apply an ISS-specific calibration yaw/pitch/roll or calibration quaternion so the loaded ISS model visually matches this orientation when user yaw, pitch, and roll sliders are all `0`.
   - User yaw/pitch/roll sliders must remain bias controls applied after the base ISS orbital-frame alignment and calibration.
   - Do not break the existing Starlink orientation behavior.
   - Non-Starlink and non-ISS models should keep the current selected-satellite orientation behavior unless a model-specific mapping already exists.

4. Add ISS orientation diagnostics.
   - When ISS is selected and the ISS-specific orientation calibration is applied, store diagnostics in `detailedSatelliteModel.userData`, including:
     - `orientationMode`
     - `modelAxisMapping`
     - `calibrationYawDeg`
     - `calibrationPitchDeg`
     - `calibrationRollDeg`
   - Use an `orientationMode` value that clearly identifies the behavior, for example `iss-velocity-nadir-frame`.
   - Log a concise console message when ISS orientation calibration is applied.
   - The diagnostics should make it easy to confirm that ISS uses velocity/nadir/right-handed frame alignment and not the generic fallback.

5. Keep Earth visible in the selected ISS observer view.
   - The initial selected ISS view must keep both ISS and part of Earth visible.
   - Preserve the selected-model default observer-eye distance behavior from previous releases.
   - Do not move the observer farther away only to make ISS readable unless an existing selected-model rule already requires it.
   - Mouse orbit and zoom should still allow inspection of ISS from all visible sides.

6. Add a `Help` accordion section at the end of the left menu.
   - The Help section must appear after `Settings`.
   - It must use the same accordion behavior as other sections.
   - It must not be default-expanded unless there is a clear reason.
   - It must not collapse or reset any other accordion section.
   - It must use readable styling consistent with the existing legacy menu colors.
   - It must remain readable at the current thin menu width and on narrow screens.

7. Add project references inside the Help section.
   - Add short, readable link labels:
     - `GitHub`
     - `README`
     - `Prompt History`
     - `License`
   - Link targets:
     - `GitHub`: `https://github.com/arcazj/openbexi_earth_orbit`
     - `README`: `README.md`
     - `Prompt History`: `PROMPT_History.md`
     - `License`: `LICENSE`
   - The external GitHub link must open in a new tab and include `rel="noopener noreferrer"`.
   - Internal repository links should use relative paths.
   - Add `title` attributes with the full target path or URL.
   - If an internal link cannot be resolved in a specific hosting environment, keep the link visible and use the raw path as the fallback.

8. Add a legal notice/disclaimer inside the Help section.
   - Add a visually separated `Disclaimer` block inside Help.
   - Keep the notice concise and readable so it does not dominate the menu.
   - The notice must state that this application is provided for visualization, educational, and experimental purposes only.
   - The notice must state that the author is not responsible for inaccurate satellite data, TLE propagation, model rendering, orbital position, attitude/orientation, timing, or visualization results.
   - The notice must state that the author is not responsible for issues, inaccuracies, or limitations caused by third-party libraries, including `satellite.js`.
   - The notice must state that the app must not be used as an authoritative source for navigation, safety, mission planning, collision avoidance, or operational satellite decisions.

9. Preserve existing selected-satellite behavior.
   - Selecting any satellite must still automatically check `Show only selected satellite`.
   - Only the selected satellite should remain visible after selection, except when a detailed selected model intentionally hides the sprite.
   - Selecting non-`MEO`/non-`GEO` satellites must still automatically enable `High Def.` Earth.
   - Selecting `MEO` or `GEO` satellites must not force `High Def.` off.
   - The selected-satellite search field must still clear the previous selected label on the next focus/click/type/paste/clear interaction without clearing the active selected satellite.
   - Starlink and ISS shortcuts must still update the selected summary, search/dropdown state, model loading, orbit/footprint behavior, and observer camera consistently.
   - Multiple accordion sections must still be allowed to remain open at the same time.
   - `Filters` and `Satellite Selection` must still load expanded.
   - Do not break filters, timelines, Mercator, View toggles, orbit display, footprint display, Yaw/Pitch/Roll, or model fallback behavior.

10. Update tests.
   - Add or update menu tests confirming the Help section exists after `Settings`.
   - Add or update menu tests confirming the Help section contains links for GitHub, README, Prompt History, and License.
   - Add or update tests confirming the GitHub link uses `target="_blank"` and `rel="noopener noreferrer"`.
   - Add or update tests confirming the Help disclaimer text is present.
   - Add or update tests confirming the Starlink shortcut label is generated as `Starlink (<NORAD ID>)` after satellite data resolves a Starlink target.
   - Add or update tests confirming the Starlink shortcut disabled fallback label is `Starlink unavailable`.
   - Add or update tests confirming the ISS shortcut disabled fallback label is `ISS unavailable`.
   - Add or update selected-satellite orientation tests confirming ISS uses velocity/nadir/right-handed frame alignment with ISS-specific calibration.
   - Add or update tests confirming ISS orientation diagnostics are written to model `userData`.
   - Keep existing Starlink orientation tests passing.
   - Keep existing selected-satellite isolation, High Def., search-clear, and shortcut-path tests passing.

11. Update documentation and integration checks.
   - Update `README.md` with:
     - Dynamic `Starlink (<NORAD ID>)` shortcut behavior.
     - ISS orientation behavior and diagnostics.
     - Help section links.
     - License and disclaimer notice.
   - Update `Test_and_Integration.md` with manual checks for:
     - Starlink shortcut label and unavailable fallback.
     - ISS shortcut resolution and unavailable fallback.
     - ISS visual orientation from at least two camera angles.
     - Earth remains visible behind ISS in the initial selected view.
     - Help section appears after Settings.
     - Help links open correctly from a local HTTP server and from GitHub Pages.
     - Legal notice is readable.
     - Existing satellite selection behavior remains unchanged.
   - Ensure `README.md` still references every repository Markdown file with a short explanation.

Acceptance criteria:

- The latest release entry is `Release Date: 2026-06-04  Version 1.5.12`.
- The Starlink shortcut displays `Starlink (<NORAD ID>)` after satellite data loads.
- The Starlink shortcut uses `Starlink unavailable` when no Starlink target can be resolved.
- The ISS shortcut selects ISS/ZARYA/NORAD `25544` through the normal satellite-selection path.
- The ISS shortcut uses `ISS unavailable` when no ISS target can be resolved.
- ISS model orientation visually matches the attached reference: `+X` velocity, `+Y` starboard/right-handed cross-track, `+Z` nadir toward Earth.
- ISS orientation diagnostics are available in `detailedSatelliteModel.userData`.
- The initial selected ISS observer view keeps Earth visible.
- A Help accordion section appears after Settings.
- Help contains working links for GitHub, README, Prompt History, and License.
- Help contains a concise legal notice/disclaimer covering satellite data, models, visualization accuracy, and `satellite.js` limitations.
- Existing selected-satellite camera, visibility, High Def., shortcut, search-clear, and accordion behaviors remain unchanged.
- `npm test` passes.
- JavaScript syntax checks pass.

---

## Release Date: 2026-06-04  Version 1.5.11

Improve selected-satellite workflow by automatically isolating the selected satellite and adding quick-selection buttons for Starlink and ISS in the `View` menu.

When the user selects a satellite from any entry point, the app should immediately show only that selected satellite. The existing `Show only selected satellite` checkbox must be checked and synchronized with the internal state. The `View` accordion section must also provide shortcut buttons to select the first Starlink satellite in the loaded satellite list and to select `ISS (ZARYA)`.

Requirements:

1. Automatically enable `Show only selected satellite`.
   - When any satellite is selected from the satellite search/dropdown, timeline, shortcut button, or other selection path, set the `Show only selected satellite` checkbox to checked.
   - Synchronize the checkbox state with `simParams.showOnlySelectedSatellite`.
   - Immediately update visible satellite markers so only the selected satellite remains visible, except for required selected-model behavior where the sprite may be hidden because a detailed model is visible.
   - Clearing the selected satellite or selecting `None` must restore the existing non-isolated behavior and uncheck the checkbox unless the user explicitly selected another satellite.
   - Do not break orbit display, footprint display, selected-model loading, Yaw/Pitch/Roll, Mercator selection, or the satellite summary.

2. Automatically enable high-definition Earth for non-MEO/non-GEO selections.
   - When any selected satellite is not in `MEO` and not in `GEO`, turn on the existing `High Def.` Earth view toggle.
   - Synchronize the `High Def.` checkbox with the internal high-definition texture state.
   - Apply the high-definition Earth texture immediately after selection when the app is in 3D globe mode.
   - The behavior must apply to selection from satellite search/dropdown, timeline, `First Starlink` shortcut, `ISS` shortcut, or any other satellite-selection path.
   - Do not force high-definition Earth off when a `MEO` or `GEO` satellite is selected; preserve the user's existing High Def. setting for those orbits.
   - Clearing the selected satellite must not unexpectedly change the user's existing High Def. setting.

3. Keep Earth visible while observing a selected satellite.
   - Whenever the observer/camera moves to watch a selected satellite, Earth must remain visible somewhere in the camera view.
   - The observer should always have an eye on Earth while watching the satellite.
   - The selected satellite should remain the inspection target, but the camera framing must avoid views where only empty space or the model fills the screen and Earth is completely outside the view.
   - For Starlink, preserve the oblique reference-style view with Earth/horizon behind and below the satellite.
   - For ISS and other satellites, choose a camera offset or camera-up vector that keeps both the selected satellite and part of Earth visible.
   - Zoom and mouse orbit should still allow inspection, but the initial selected-satellite view must include Earth.
   - If a model is very close at the 100 m observer distance, use field-of-view, model visual-scale, camera-up, or slight target-offset adjustments to keep Earth visible without moving the observer farther than the default selected-model distance.

4. Clear the satellite combo/search field before selecting another satellite.
   - After a satellite is selected from the satellite combo/search field, keep the selected satellite summary visible, but treat the search input as ready for the next selection.
   - As soon as the user focuses, clicks, or starts typing in the satellite combo/search field to choose another satellite, clear the previous selected satellite text from the input.
   - The dropdown results should then show the normal unfiltered or newly typed search results instead of being stuck on the previously selected satellite name.
   - Clearing the combo/search field for the next search must not immediately clear the current selected satellite, selected model, orbit, footprint, or `Show only selected satellite` state.
   - Selecting a new satellite from the cleared field must still use the same normal satellite-selection path.
   - Pressing `Escape`, clicking outside, or tabbing away before selecting another satellite should leave the current selected satellite unchanged.

5. Add shortcut buttons in the `View` menu.
   - Add two compact buttons inside the `View` accordion section:
     - `First Starlink`
     - `ISS`
   - Keep the existing `View` controls for Globe, Mercator, High Def., ECEF Axes, and Day/Night unchanged.
   - Layout the `View` controls in compact rows:
     - Row 1: `Globe` and `Mercator` on the same line.
     - Row 2: `High Def.`, `ECEF Axes`, and `Day/Night` on the same line.
     - Row 3: `First Starlink` and `ISS` shortcut buttons on the same line.
   - The rows must remain readable and usable in the thin accordion menu.
   - On very narrow screens, the layout may wrap only if required to avoid clipping, but desktop/default menu width should show the requested rows.
   - The shortcut buttons must use the existing legacy menu styling and remain usable in the thin accordion menu.
   - The buttons must be disabled or show a clear unavailable state until satellite data is loaded and the target satellite can be resolved.

6. Implement `First Starlink` shortcut behavior.
   - Clicking `First Starlink` must select the first available Starlink satellite from the loaded satellite list.
   - Use a deterministic match such as satellite name or company/tag containing `STARLINK`.
   - The shortcut must call the same selection path used by normal satellite selection, not a separate partial implementation.
   - It must update the satellite search/dropdown state, selected-satellite summary, `Show only selected satellite`, detailed model loading, orbit/footprint behavior, and camera/observer movement.
   - If a Starlink local model is available, the observer should move to the selected Starlink using the same 100 m selected-model behavior and Starlink oblique orientation implemented in the previous release.

7. Implement `ISS` shortcut behavior.
   - Clicking `ISS` must select `ISS (ZARYA)` when it exists in the loaded satellite list.
   - Match robustly against common names such as `ISS (ZARYA)`, `ISS`, or NORAD `25544`.
   - The shortcut must call the same selection path used by normal satellite selection.
   - It must update the satellite search/dropdown state, selected-satellite summary, `Show only selected satellite`, detailed model loading, orbit/footprint behavior, and camera/observer movement.
   - If a local ISS model is available, the observer should move to ISS using the same selected-model camera behavior used for normal satellite selection.

8. Preserve existing behavior.
   - Do not change the default accordion section order.
   - Do not collapse any accordion section when a shortcut is clicked.
   - Do not break multi-open accordion behavior.
   - Do not break filters, search, selected satellite dropdown behavior, timelines, Mercator, View toggles, orbit display, footprint display, Yaw/Pitch/Roll, or model fallback behavior.

9. Update tests and documentation.
   - Add or update tests confirming satellite selection automatically checks `Show only selected satellite`.
   - Add or update tests confirming non-MEO/non-GEO satellite selection automatically enables the `High Def.` Earth toggle without forcing it off for `MEO` or `GEO`.
   - Add or update tests confirming the selected-satellite initial camera frame keeps Earth in view.
   - Add or update tests confirming the satellite combo/search input clears on the next focus/click/type after a selection without clearing the current selected satellite.
   - Add or update tests confirming the `View` menu contains `First Starlink` and `ISS` shortcut buttons.
   - Add or update tests confirming the `View` menu layout keeps `Globe`/`Mercator`, `High Def.`/`ECEF Axes`/`Day/Night`, and `First Starlink`/`ISS` grouped on their requested rows.
   - Add or update tests confirming shortcut buttons route through the same satellite-selection path as normal selection.
   - Add or update tests confirming shortcut selection updates the checkbox, selected satellite summary/search state, and camera/model selection path.
   - Update `Test_and_Integration.md` with shortcut-button and automatic-isolation checks.
   - Update `README.md` if menu usage or selected-satellite workflow is described.

Acceptance criteria:

- Selecting any satellite automatically checks `Show only selected satellite`.
- Selecting a non-`MEO`/non-`GEO` satellite automatically turns on `High Def.` Earth.
- Selecting a `MEO` or `GEO` satellite does not force `High Def.` off.
- The initial selected-satellite observer view always keeps Earth visible.
- After selecting a satellite, focusing/clicking/typing in the satellite combo/search field clears the previous input text so the user can immediately search for another satellite.
- Clearing the combo/search field for a new search does not clear the current selected satellite until a new satellite is selected or the user explicitly clears selection.
- Only the selected satellite remains visible after selection.
- Clearing selection restores the non-isolated behavior and unchecks `Show only selected satellite`.
- The `View` menu contains compact `First Starlink` and `ISS` shortcut buttons.
- The `View` menu shows `Globe`/`Mercator`, `High Def.`/`ECEF Axes`/`Day/Night`, and `First Starlink`/`ISS` as three compact rows at the default menu width.
- Clicking `First Starlink` selects the first loaded Starlink satellite and moves the observer exactly as normal satellite selection does.
- Clicking `ISS` selects `ISS (ZARYA)`/NORAD `25544` and moves the observer exactly as normal satellite selection does.
- Shortcut selection updates the search/dropdown, selected summary, model loading, orbit/footprint controls, and observer camera consistently.
- Existing filters, timelines, Mercator, View toggles, Yaw/Pitch/Roll, accordion behavior, and model fallback behavior remain unchanged.
- `npm test` passes.
- JavaScript syntax checks pass.

---

## Release Date: 2026-06-04  Version 1.5.10

Correct the Starlink selected-model yaw/pitch/roll orientation and change the default observer view to match the attached reference image instead of placing the observer on a straight Earth-center line.

The reference orientation is the typical in-orbit Starlink frame:

- `+X` points along the satellite velocity vector, the direction of travel.
- `+Z` points toward Earth, the nadir direction.
- `+Y` completes the right-handed frame.

Requirements:

1. Correct Starlink model orientation.
   - When a Starlink satellite with the local `starlink_V1` OBJ/MTL model is selected, the model must align to the orbital frame shown in the reference image.
   - Compute the live orbital frame from propagated satellite position and velocity, not from a fixed world rotation.
   - Define `+Z` as nadir, from the satellite toward Earth's center.
   - Define `+X` as the velocity direction, tangent to the orbit.
   - Define `+Y` as the right-handed cross-track axis so the final frame is orthonormal.
   - If the raw Starlink OBJ axes do not match this frame, add a Starlink-specific calibration quaternion or metadata setting so default yaw/pitch/roll values produce the reference orientation.
   - Yaw, pitch, and roll sliders must remain user bias controls applied after the base Starlink orbital-frame alignment.
   - With yaw, pitch, and roll all at `0`, Starlink must already appear in the reference in-orbit orientation.

2. Change the default observer placement for selected Starlink.
   - Keep the selected-model observer eye at the default 100 real-world meters from the selected satellite target point.
   - Do not place the observer exactly on the outward radial line from Earth through the satellite.
   - Do not make the satellite appear centered directly in front of Earth's center.
   - Use an oblique reference-image-style observer view: the satellite is in the foreground, Earth/horizon is behind and below it, `+X`/velocity reads roughly sideways across the screen, and `+Z`/nadir points down toward Earth.
   - The observer placement should be computed from the satellite's live `+X`, `+Y`, and `+Z` orbital-frame axes so it follows the satellite correctly as it moves.
   - The initial camera offset should be configurable, for example an oblique combination of anti-nadir, velocity, and cross-track components, instead of a pure anti-nadir/radial offset.
   - The selected satellite should remain centered or near-centered enough for inspection, but the Earth background must not be centered directly behind the satellite.

3. Preserve interaction behavior.
   - Mouse orbit must allow the user to inspect all faces of the Starlink model.
   - Zoom must keep the selected satellite as the target and must not break the 100 m default observer distance on initial selection.
   - Automatic tracking must follow the moving Starlink without fighting user orbit or zoom controls.
   - Existing Yaw/Pitch/Roll controls must continue to work for non-Starlink satellites.

4. Preserve existing fallback behavior.
   - If Starlink model loading fails, keep the selected TLE sprite visible.
   - If selected satellite velocity is unavailable or invalid, fall back safely to the previous nadir-only orientation and log a diagnostic.
   - Do not break selected satellite orbit, footprint, Mercator, filters, timelines, View controls, settings, or accordion behavior.

5. Update tests and documentation.
   - Add or update tests confirming the Starlink orbital frame maps `+X` to velocity, `+Z` to nadir, and `+Y` to the right-handed cross-track axis.
   - Add or update tests confirming Starlink Yaw/Pitch/Roll default values do not override or corrupt the base orbital-frame alignment.
   - Add or update tests/static checks confirming the selected Starlink observer offset is oblique and not the old pure radial Earth-centered view.
   - Update `Test_and_Integration.md` with the Starlink orientation and oblique observer-view checks.
   - Update `README.md` if selected-satellite viewing behavior or Yaw/Pitch/Roll behavior is described.

Acceptance criteria:

- Selecting a Starlink satellite shows the local Starlink model in the reference in-orbit orientation.
- Starlink `+X` aligns with velocity, `+Z` aligns with nadir toward Earth, and `+Y` completes the right-handed frame.
- Default Starlink yaw, pitch, and roll produce the correct reference orientation before any user slider adjustment.
- The camera starts 100 real-world meters from the selected Starlink target.
- The observer view is oblique like the reference image, with Earth/horizon behind and below the satellite, not centered directly behind it.
- Mouse orbit and zoom still work around the selected Starlink.
- Existing selected-satellite features, filters, orbit, footprint, Mercator, View controls, timelines, settings, and accordion behavior remain unchanged.
- `npm test` passes.
- JavaScript syntax checks pass.

---

## Release Date: 2026-06-04  Version 1.5.9

Fix selected-satellite 3D framing because the satellite model is still too far from the observer after selection.

When a satellite with an associated OBJ/MTL/GLB model under `obj/` is selected, the camera must move close enough that the satellite model is clearly visible and inspectable.

Requirements:

1. Make the selected 3D model visible and close.
   - The selected satellite model must remain centered in the viewport.
   - The model must appear close, not as a distant dot.
   - The observer eye point is the camera position.
   - The selected satellite target point must be 100 real-world meters from the observer eye point by default.
   - Convert the 100-meter observer distance through the existing scene-unit conversion and verify the camera-to-satellite target distance uses that converted value.
   - The loaded model bounding box and camera field of view must be used to validate visibility, near-plane safety, zoom limits, and visual fit, but they must not silently push the observer farther away than the 100-meter default.
   - By default, at the 100-meter observer distance, the model should fill approximately 35% to 60% of the viewport height while avoiding camera clipping.
   - If the model is very large or very small, preserve the 100-meter observer distance and use safe alternatives such as near-plane adjustment, control limits, model visual-scale correction, or field-of-view-aware framing instead of moving the observer farther away.

2. Preserve the Earth-behind-satellite view.
   - Earth must remain visible behind the satellite whenever possible.
   - The observer should start 100 meters from the selected satellite target point on the outward radial line from Earth through the satellite, so the satellite is in front and Earth is behind it.
   - The selected satellite should stay centered even while moving along its orbit.

3. Preserve interactive inspection controls.
   - The user must be able to zoom in and out around the selected satellite.
   - Mouse left/right movement should orbit around the satellite model so all faces of the satellite can be inspected.
   - Automatic tracking must not fight user zoom or orbit controls.

4. Preserve existing behavior.
   - Existing satellite selection, filters, orbit display, footprint display, Yaw/Pitch/Roll controls, View controls, timelines, settings, and accordion behavior must remain unchanged.
   - If no matching local model exists, keep the selected sprite fallback behavior.
   - If a model fails to load, keep the selected sprite visible and do not move the camera to an empty target.

5. Update tests and documentation.
   - Add or update tests/static checks confirming selected-model camera framing uses model bounds and camera field of view.
   - Add or update tests/static checks confirming the implementation no longer relies only on the old fixed-distance behavior.
   - Add a satellite-visibility test for at least one known local model mapping, such as Starlink, OneWeb, ISS, or an SSL 1300-style GEO satellite.
   - The satellite-visibility test must confirm the selected model loads, has visible mesh content, is in front of the camera, projects inside the viewport, and has a non-trivial screen-space size.
   - The satellite-visibility test must fail if the selected model is behind the camera, off-screen, clipped to zero size, hidden by stale sprite/model state, or too small to inspect.
   - When browser automation is available, validate the projected screen-space bounding box after selection and assert the model occupies approximately 35% to 60% of the viewport height at the default 100-meter observer distance.
   - If browser automation is not available in the automated test environment, add deterministic framing-math tests plus a documented manual browser check that selects the same known satellite and confirms the model is visibly centered.
   - Update `Test_and_Integration.md` with the selected-model visibility and framing checks.
   - Update `README.md` if selected-satellite viewing behavior or controls are described.

Acceptance criteria:

- Selecting a satellite with a local 3D model immediately brings the model close enough to inspect.
- The camera/observer eye is 100 real-world meters from the selected satellite target point by default.
- The model is centered and visibly large on screen.
- A satellite-visibility test confirms at least one known local 3D model is loaded, visible, in front of the camera, inside the viewport, and large enough to inspect.
- Earth is visible behind the selected satellite where geometry allows.
- Zooming changes the observer distance while keeping the satellite centered.
- Orbiting with the mouse shows different faces of the satellite model.
- The satellite remains centered while it moves.
- Existing satellite selection, filters, orbit, footprint, YPR, View controls, timelines, settings, and accordion behavior remain unchanged.
- `npm test` passes.
- JavaScript syntax checks pass.

---

## Release Date: 2026-06-03  Version 1.5.8

Move the `View` accordion section to the very top of the left menu, above `Filters`.

The visible menu order must now prioritize display controls first so Globe, Mercator, High Def., ECEF Axes, and Day/Night are immediately reachable at the top of the menu.

Requirements:

1. Change the accordion section order.
   - The left menu order must be: `View`, `Filters`, `Satellite Selection`, `Timelines`, `Other Selections`, `Settings`.
   - Move only the `View` section position.
   - Preserve all existing controls inside the `View` section.
   - Preserve the existing `View` section color/accent styling.
   - Preserve the existing collapsed/expanded behavior.

2. Preserve default expanded sections.
   - `Filters` must still start expanded on every `index.html` load.
   - `Satellite Selection` must still start expanded on every `index.html` load.
   - `View` may remain collapsed by default unless explicitly changed elsewhere.
   - Persisted accordion state must not collapse the default-expanded `Filters` or `Satellite Selection` sections.

3. Preserve behavior.
   - Moving the `View` section must not break Globe, Mercator, High Def., ECEF Axes, or Day/Night toggles.
   - Moving the `View` section must not break satellite search, selected-satellite summary, `Show Orbit`, `Show Footprint`, YPR controls, filters, timelines, or settings.
   - Multiple accordion sections must still be allowed to remain open at the same time.
   - Expanding or collapsing `View` must not collapse any other section.

4. Update tests and documentation.
   - Update tests that assert accordion section order.
   - Update `Test_and_Integration.md` with the new menu order.
   - Update `README.md` if it describes the menu order.
   - Keep existing tests for dropdown close behavior, selected-orbit Earth occlusion, default-expanded sections, multi-open accordion behavior, YPR persistence, and timeline exclusivity passing.

Acceptance criteria:

- The visible accordion order is `View`, `Filters`, `Satellite Selection`, `Timelines`, `Other Selections`, `Settings`.
- `View` appears at the very top of the menu, above `Filters`.
- `Filters` and `Satellite Selection` still start expanded.
- The `View` controls still work.
- Satellite selection, orbit, footprint, YPR, filters, timelines, and settings still work.
- `npm test` passes.
- JavaScript syntax checks pass.

---

## Release Date: 2026-06-03  Version 1.5.7

Move the `View` accordion section directly below `Filters` in the left menu.

The display controls for Globe, Mercator, High Def., ECEF Axes, and Day/Night should be easier to reach without scrolling past satellite-selection controls.

Requirements:

1. Change the accordion section order.
   - The left menu order must be: `Filters`, `View`, `Satellite Selection`, `Timelines`, `Other Selections`, `Settings`.
   - Move only the `View` section position.
   - Preserve all existing controls inside the `View` section.
   - Preserve the existing `View` section color/accent styling.
   - Preserve the existing collapsed/expanded behavior.

2. Preserve default expanded sections.
   - `Filters` must still start expanded on every `index.html` load.
   - `Satellite Selection` must still start expanded on every `index.html` load.
   - `View` may remain collapsed by default unless explicitly changed elsewhere.
   - Persisted accordion state must not collapse the default-expanded `Filters` or `Satellite Selection` sections.

3. Preserve behavior.
   - Moving the `View` section must not break Globe, Mercator, High Def., ECEF Axes, or Day/Night toggles.
   - Moving the `View` section must not break satellite search, selected-satellite summary, `Show Orbit`, `Show Footprint`, YPR controls, filters, timelines, or settings.
   - Multiple accordion sections must still be allowed to remain open at the same time.
   - Expanding or collapsing `View` must not collapse any other section.

4. Update tests and documentation.
   - Update tests that assert accordion section order.
   - Update `Test_and_Integration.md` with the new menu order.
   - Update `README.md` if it describes the menu order.
   - Keep existing tests for dropdown close behavior, selected-orbit Earth occlusion, default-expanded sections, multi-open accordion behavior, YPR persistence, and timeline exclusivity passing.

Acceptance criteria:

- The visible accordion order is `Filters`, `View`, `Satellite Selection`, `Timelines`, `Other Selections`, `Settings`.
- `View` appears immediately below `Filters`.
- `Filters` and `Satellite Selection` still start expanded.
- The `View` controls still work.
- Satellite selection, orbit, footprint, YPR, filters, timelines, and settings still work.
- `npm test` passes.
- JavaScript syntax checks pass.

---

## Release Date: 2026-06-03  Version 1.5.6

Fix two blocking defects shown in the attached screenshots: the satellite-selection dropdown can remain stuck open and block controls, and selected-satellite orbit trajectories can render through the front of Earth instead of being occluded by the globe.

These defects must be fixed before adding more pro-version features because they break operator interaction and visual correctness.

Requirements:

0. Inspect the likely target files and functions first.
   - Start with `index.html`, `css/style.css`, `js/SatelliteMenuLoader.js`, and any renderer/scene module that creates or updates the selected satellite orbit path.
   - Locate the exact satellite search/autocomplete DOM elements, event handlers, render function, and CSS classes.
   - Locate the exact `Show Orbit` checkbox handler, selected-orbit creation function, orbit-line material, Earth mesh/material setup, and render pass order.
   - If the implementation is spread across additional loaders or modules, identify them before changing behavior.
   - Document the suspected root cause for each defect before applying the fix.

1. Fix the stuck satellite dropdown.
   - In the screenshot, the red-circled satellite search/autocomplete dropdown remains open after selecting `INTELSAT 902 (IS-902)`.
   - The dropdown overlays the panel below it and prevents the user from clicking controls behind it, including `Show Orbit`, `Show Footprint`, and other satellite actions.
   - When the user selects a satellite from the dropdown, the autocomplete result panel must close immediately.
   - Clicking outside the satellite search field must close the dropdown.
   - Pressing `Escape` must close the dropdown.
   - The closed dropdown must not intercept pointer events.
   - The selected satellite must remain visible in the input or selected-satellite summary after the dropdown closes.
   - The dropdown must reopen only when the user focuses the search field or types a new query.
   - The behavior must work with mouse selection, keyboard selection, touch/click selection, and after clearing the selected satellite.
   - Keyboard selection with `Enter` must select the highlighted result and close the dropdown.

2. Inspect and fix likely dropdown root causes.
   - Review the satellite search input event handlers.
   - Review autocomplete/dropdown open/close state.
   - Review `z-index`, `position`, `pointer-events`, focus, and blur behavior.
   - Check whether a hidden overlay remains mounted and still intercepts clicks.
   - Check whether any handler calls `preventDefault`, traps focus, or reopens the dropdown after selection.
   - Add an explicit dropdown state such as `isSatelliteDropdownOpen` if needed.
   - Use `display: none` or equivalent for the hidden state, not only opacity.
   - Use `pointer-events: none` when the dropdown is hidden.
   - Ensure hidden dropdown parents do not leave an invisible overlay above checkboxes or buttons.
   - Add defensive cleanup when the satellite selector rerenders or filters change.
   - Preserve search filtering, the `Clear` button, selected-satellite summary, YPR controls, orbit controls, footprint controls, and timeline controls.

3. Add accessibility requirements for the satellite dropdown.
   - The search input or combobox wrapper should expose `aria-expanded`.
   - The dropdown should have a stable ID referenced by `aria-controls`.
   - The result list should use an appropriate listbox pattern, such as `role="listbox"` with result rows using `role="option"`, if compatible with the existing markup.
   - The active/highlighted result should be exposed through `aria-activedescendant` or an equivalent accessible pattern.
   - `Escape` must close the dropdown without changing the selected satellite.
   - `Tab` should move focus normally and must not trap the user inside the dropdown.
   - Closing the dropdown must not erase the selected satellite state.

4. Fix selected-satellite orbit rendering through Earth.
   - In the screenshot, when `Show Orbit` is enabled, red orbit trajectory segments that should be behind Earth are visible in front of Earth.
   - Earth must occlude orbit segments that are behind it from the camera point of view.
   - Orbit line segments behind Earth must not render on top of Earth.
   - Orbit line segments in front of Earth must remain visible.
   - The behavior must remain correct while rotating, zooming, and panning the 3D view.
   - The behavior must work for LEO, MEO, GEO, and highly elliptical orbits.
   - The orbit path must not use `depthTest: false` or forced foreground `renderOrder` settings that make it draw over Earth.
   - Earth mesh/material must write to the depth buffer, for example with `depthWrite: true`.
   - If the selected orbit is rendered in a separate overlay/HUD scene or after a depth clear, move it into the main depth-tested 3D scene or explicitly clip/occlude it against Earth.

5. Inspect and fix likely orbit-rendering root causes.
   - Review the `Show Orbit` rendering function and selected-orbit material.
   - Review Three.js material settings for orbit lines: `depthTest`, `depthWrite`, `transparent`, and `renderOrder`.
   - Confirm the Earth material writes to the depth buffer.
   - Confirm orbit lines are rendered in the same scene/depth pass as Earth, or otherwise correctly depth-tested.
   - Confirm the orbit path is parented to the correct scene/frame and transformed consistently with Earth.
   - Check camera near/far planes and depth precision, especially for GEO-scale rendering.
   - Preferred first fix: render orbit lines in the same 3D scene as Earth with `depthTest: true`, no forced foreground `renderOrder`, and Earth depth writing enabled.
   - If depth-buffer rendering is insufficient, split the orbit polyline into visible/invisible segments by testing Earth-sphere occlusion from the current camera viewpoint.
   - Do not solve this by lowering opacity; hidden orbit portions should not be visible through Earth.

6. Review camera and depth precision.
   - GEO orbit scale can create depth precision artifacts if the camera `near` plane is too small or `far` plane is too large.
   - Review camera `near` and `far` values for the orbit scene.
   - If needed, adjust scene scaling, logarithmic depth buffer usage, or near/far ratios without breaking LEO/MEO/GEO visibility.
   - Confirm orbit occlusion remains stable while zooming close to Earth and zooming out to GEO-scale views.

7. Add or update tests where practical.
   - Add DOM-level or unit tests for dropdown open/close behavior if the existing test setup supports it.
   - Test that satellite selection closes the dropdown.
   - Test that keyboard `Enter` selection closes the dropdown.
   - Test that `Escape` closes the dropdown.
   - Test that outside click closes the dropdown.
   - Test that hidden dropdown state does not intercept pointer events.
   - Add a deterministic geometry test for Earth/orbit occlusion if practical.
   - Test or manually verify that selected-orbit material does not use `depthTest: false`.
   - Test or manually verify that Earth depth writing remains enabled.
   - Keep existing tests for filters, satellite search, checkboxes, orbit display, footprints, and menu behavior passing.

8. Update documentation.
   - Update `Test_and_Integration.md` with manual QA steps for the stuck dropdown screenshot scenario.
   - Update `Test_and_Integration.md` with manual QA steps for the selected-orbit-through-Earth screenshot scenario.
   - Include checks for LEO, MEO, and GEO orbit occlusion.
   - Include a regression checklist confirming search, clear, selected summary, orbit, footprint, YPR, timeline, and filter behavior still works.

Manual QA sequence:

1. Load `index.html`.
2. Open the `Satellite Selection` accordion section.
3. Search for `INTELSAT`.
4. Select `INTELSAT 902 (IS-902)`.
5. Confirm the autocomplete dropdown closes immediately.
6. Click `Show Orbit` and confirm it toggles without obstruction.
7. Click `Show Footprint` and confirm it toggles without obstruction.
8. Search again, press `Escape`, and confirm the dropdown closes.
9. Search again, click outside the selector, and confirm the dropdown closes.
10. Enable `Show Orbit`.
11. Rotate the camera until part of the selected orbit should pass behind Earth.
12. Confirm the behind-Earth arc is hidden by Earth and the front-side arc remains visible.
13. Repeat the orbit occlusion check with at least one LEO satellite, one MEO satellite, and one GEO satellite.
14. Confirm the fixes do not break selected satellite summary, YPR controls, timelines, filters, footprints, or view controls.

Acceptance criteria:

- Select `INTELSAT 902 (IS-902)` or any satellite from the dropdown.
- The dropdown disappears immediately after selection.
- Keyboard `Enter` selection closes the dropdown.
- `Show Orbit` can be checked and unchecked without obstruction.
- `Show Footprint` and other controls behind the dropdown remain clickable.
- Pressing `Escape` closes the dropdown.
- Clicking outside the selector closes the dropdown.
- The dropdown does not reopen unexpectedly after a satellite is selected.
- Hidden dropdown state does not intercept pointer events.
- The `Clear` button still works.
- Satellite search still filters results.
- Selected satellite summary still updates correctly.
- Enable `Show Orbit` for a selected satellite and rotate the camera so part of the orbit passes behind Earth.
- The behind-Earth orbit arc is fully occluded by the Earth sphere.
- The front-side orbit arc remains visible.
- No red orbit segment appears across the Earth surface unless it is genuinely in front of Earth.
- The orbit-occlusion fix works for at least one LEO satellite, one MEO satellite, and one GEO satellite.
- Selected-orbit material does not force foreground rendering with `depthTest: false`.
- Earth rendering continues to write depth so orbit occlusion works.
- The fixes do not break beam, footprint, satellite marker, Earth rendering, filters, timelines, YPR controls, or menu behavior.
- `npm test` passes.
- JavaScript syntax checks pass.

---

## Release Date: 2026-06-03  Version 1.5.5

Improve satellite count visibility and make the accordion menu thinner.

The accordion menu is functional, but the satellite count in the `Filters - Satellites Found` header should stand out more, and the left menu should take less horizontal screen space.

Requirements:

1. Make the satellite count red and bold.
   - In the `Filters - Satellites Found: <count>` accordion header, style only the numeric satellite count.
   - The count must be red and bold.
   - Keep the rest of the header readable with the current expanded/collapsed accordion contrast rules.
   - Ensure the count remains red and bold when the `Filters` section is expanded and when it is collapsed.
   - Do not break live count updates from filtering or satellite loading.

2. Make the menu thinner.
   - Reduce the left menu width from the current value.
   - Keep all controls usable: filters, reset button, satellite search, YPR sliders, timeline checkboxes, metadata, and view controls.
   - Avoid clipping labels or buttons.
   - Preserve internal scrolling for long sections.
   - Preserve the narrow-viewport behavior where the menu stays below the time slider.
   - The time slider must remain readable and unobscured.

3. Preserve existing accordion behavior.
   - The vertical tab rail must remain removed.
   - The menu must remain stacked accordion sections.
   - Multiple sections must remain allowed to stay open simultaneously.
   - Expanding one section must not collapse any other section.
   - `Filters` and `Satellite Selection` must still start expanded on every `index.html` load.
   - Menu interactions must not reset accordion open/closed state.

4. Preserve existing visual behavior.
   - Keep the legacy accordion left accent colors.
   - Keep expanded accordion header text readable with the Version 1.5.4 contrast fix.
   - Keep collapsed accordion headers readable.
   - Keep the blue metallic/light selected tag-chip styling.
   - Keep the dark compact menu style.

5. Preserve existing app behavior.
   - Search, filters, reset filters, selected satellite summary, timelines, YPR controls, view toggles, orbit display, footprints, Mercator, and startup performance behavior must remain intact.
   - The `Active` tag/company chip must still be excluded.
   - Launch and re-entry timeline checkboxes must remain mutually exclusive.
   - YPR slider visibility and values must still persist after satellite selection.

6. Update tests.
   - Add or update tests asserting the satellite count span is styled red and bold.
   - Add or update tests asserting the menu width is thinner than the previous release value.
   - Keep existing tests for accordion structure, multi-open behavior, initial expanded sections, expanded-header contrast, legacy accents, mojibake scans, timeline exclusivity, YPR persistence, and `Active` chip exclusion.

7. Update documentation.
   - Update `Test_and_Integration.md` with manual checks for the red bold satellite count and thinner menu.
   - Include a manual check that the time slider remains unobscured after narrowing the menu.
   - Update `README.md` if menu usage or appearance documentation changes.

Acceptance criteria:

- The satellite count in `Filters - Satellites Found` is red and bold.
- The menu is visibly thinner while still usable.
- Long accordion sections still scroll internally.
- The time slider remains readable and unobscured.
- Accordion behavior remains independent and multi-open.
- `Filters` and `Satellite Selection` still start expanded.
- Existing filtering, search, timeline, YPR, view, and startup behavior still work.
- `npm test` passes.
- JavaScript syntax checks pass.

---

## Release Date: 2026-06-03  Version 1.5.4

Fix low-contrast expanded accordion header text.

The current accordion menu introduced in Version 1.5.3 has a readability regression. Expanded accordion headers such as `Filters - Satellites Found` and `Satellite Selection` use light blue text on a light blue/metallic expanded background, making labels hard to read.

Requirements:

1. Improve expanded accordion header contrast.
   - Review `css/style.css` and the accordion header classes generated by `js/SatelliteMenuLoader.js`.
   - When an accordion section is expanded, its header text must remain clearly readable.
   - Do not use light blue text on a light blue background.
   - Prefer a dark navy/near-black text color for expanded headers, or adjust the expanded background so the existing text remains readable.
   - Keep the expanded state visually obvious.

2. Preserve the legacy accordion color style.
   - Keep the dark navy/blue collapsed accordion header style.
   - Keep the colored left accents:
     - `Filters`: blue.
     - `Satellite`: teal/green-blue.
     - `View`: yellow.
     - `Timelines`: pink/red.
     - `Other`: blue.
     - `Settings`: gray-blue.
   - Do not replace the menu with a new palette or generic browser accordion styling.
   - The fix should be a targeted contrast correction, not a redesign.

3. Check all accordion states.
   - Verify expanded `Filters` is readable.
   - Verify expanded `Satellite Selection` is readable.
   - Verify expanded `View`, `Timelines`, `Other Selections`, and `Settings` are readable.
   - Verify collapsed headers remain readable.
   - Verify the chevron/toggle marker remains visible in both expanded and collapsed states.

4. Preserve Version 1.5.3 behavior.
   - The vertical tab rail must remain removed.
   - The menu must remain stacked accordion sections.
   - Multiple sections must still be allowed to stay open simultaneously.
   - Expanding one section must not collapse any other section.
   - `Filters` and `Satellite Selection` must still start expanded on every `index.html` load.
   - Menu interactions must not reset accordion open/closed state.
   - Search, filters, reset filters, selected satellite summary, timelines, YPR controls, view toggles, and startup performance behavior must remain intact.

5. Update tests.
   - Add or update tests that assert expanded accordion header text uses a readable high-contrast color.
   - Add or update tests that ensure expanded header styling does not use light text on the light metallic background.
   - Keep existing tests for accordion structure, multi-open behavior, initial expanded sections, legacy left accents, mojibake scans, timeline exclusivity, YPR persistence, and `Active` chip exclusion.

6. Update documentation.
   - Update `Test_and_Integration.md` with a manual visual check for expanded accordion header readability.
   - Include the screenshot scenario: `Filters - Satellites Found` and `Satellite Selection` expanded on page load must be readable.

Acceptance criteria:

- Expanded accordion headers are clearly readable.
- `Filters - Satellites Found` and `Satellite Selection` are readable on initial page load.
- Collapsed accordion headers remain readable.
- Legacy accordion color accents are preserved.
- Multiple accordion sections can still remain open at the same time.
- `Filters` and `Satellite Selection` still start expanded.
- `npm test` passes.
- JavaScript syntax checks pass.

---

## Release Date: 2026-06-03  Version 1.5.3

Replace the current vertical tab menu layout with accordion-style menu sections.

The current menu uses a vertical tab rail for `Filters`, `Satellite`, `View`, `Timelines`, `Other`, and `Settings`. Replace that tabbed layout with stacked accordion sections that are easier to scan and use in the left menu.

Requirements:

1. Remove the vertical tab rail.
   - Do not use the current `role="tablist"`, `role="tab"`, and `role="tabpanel"` layout for the main menu sections.
   - Convert the same functional groups into accordion sections: `Filters`, `Satellite Selection`, `View`, `Timelines`, `Other Selections`, and `Settings`.

2. Use accessible accordion controls.
   - Each section header should be a clickable and keyboard-usable control.
   - Use `aria-expanded`, `aria-controls`, and stable section IDs.
   - Support mouse click, Enter, and Space for expanding/collapsing.
   - Keep visible focus styling.

3. Multiple sections must be allowed to stay open at the same time.
   - Very important: do not implement a single-open accordion.
   - Expanding one section must not collapse any other section.
   - Collapsing one section must not affect any other section.

4. Each section must collapse and expand independently.
   - Store open/closed state per section.
   - A section should only change state when the user interacts with that section header or when an explicit UX requirement needs that section visible.

5. Preserve section state while interacting with the menu.
   - Changing a filter must not collapse or expand unrelated sections.
   - Selecting a satellite must not reset accordion state.
   - Toggling checkboxes must not reset accordion state.
   - Clicking reset buttons, search clear buttons, timeline checkboxes, view toggles, or other menu buttons must not collapse the menu sections.
   - If Yaw-Pitch-Roll is enabled and satellite selection needs the YPR sliders discoverable, opening `Satellite Selection` is allowed, but no other section may be collapsed.
   - The open/closed state of each section should be preserved while interacting with the menu during the current page session.

6. Preserve the legacy menu color styling exactly.
   - Keep the existing dark navy/blue accordion-header visual style shown in the reference screenshot.
   - Preserve the current section color treatment, including the colored left accents:
     - `Filters`: blue.
     - `Satellite`: teal/green-blue.
     - `View`: yellow.
     - `Timelines`: pink/red.
     - `Other`: blue.
     - `Settings`: gray-blue.
   - Do not introduce a new color palette.
   - Do not restyle the accordion into a generic browser/default accordion.
   - The new accordion headers should visually match the legacy vertical menu section colors as closely as possible.

7. Initial page-load accordion state.
   - On every `index.html` load, `Filters` must start expanded.
   - On every `index.html` load, `Satellite Selection` must start expanded.
   - This must be true even if other accordion section state is remembered.
   - Do not allow persisted collapsed state to make `Filters` or `Satellite Selection` collapsed on initial load.
   - Other sections may start collapsed unless explicitly required otherwise.

8. Preserve existing Release 1.5.2 behavior.
   - No mojibake in menu labels, toggle labels, headings, helper text, time slider label, or buttons.
   - Keep the thinner menu width and internal scrolling behavior.
   - Keep the searchable satellite selector.
   - Keep filter reset, active-filter summary, and empty-state UX.
   - Keep generated `Active` tag/company chips excluded.
   - Keep selected tag chips styled with the blue metallic/light active style.
   - Keep launch and re-entry timeline checkboxes mutually exclusive.
   - Keep timeline checkbox state synchronized with actual HUD visibility.
   - Keep Yaw/Pitch/Roll slider visibility and values after satellite selection.
   - Keep startup performance/deferred timeline behavior intact.

9. Update tests.
   - Add or update tests proving the main menu no longer uses the vertical tab rail.
   - Test accordion headers expose independent `aria-expanded` state.
   - Test multiple accordion sections can be open at once.
   - Test expanding one section does not collapse another.
   - Test filters, satellite selection, checkbox toggles, reset buttons, and timeline toggles do not reset accordion state.
   - Add or update tests proving `Filters` and `Satellite Selection` are expanded on initial page load.
   - Add or update tests proving the legacy section color hooks/classes are still present.
   - Add or update tests proving accordion conversion does not remove the existing colored left-accent style.
   - Keep existing tests for mojibake, menu width, scrollable panels, timeline exclusivity, YPR persistence, and `Active` chip exclusion.

10. Update documentation.
   - Update `README.md` if it describes the tabbed menu.
   - Update `Test_and_Integration.md` with manual accordion checks.
   - Include a manual check that multiple sections remain open after interacting with filters, satellite search, YPR controls, view toggles, and timeline toggles.

Acceptance criteria:

- The vertical tab rail is removed.
- The menu is organized as stacked accordion sections.
- The legacy dark navy/blue section-header color styling and colored left accents are preserved.
- `Filters` and `Satellite Selection` are expanded on every `index.html` load.
- Multiple accordion sections can remain open simultaneously.
- Expanding one section never collapses another section.
- Each section preserves its open/closed state during normal menu interactions.
- Existing filters, satellite search, timelines, YPR controls, view controls, and startup behavior still work.
- `npm test` passes.
- JavaScript syntax checks pass.
- Manual accordion regression checks are documented in `Test_and_Integration.md`.

---

## Release Date: 2026-06-03  Version 1.5.2

Fix menu text encoding regressions, menu width, tab order, timeline exclusivity, and Yaw/Pitch/Roll control persistence.

The screenshot shows user-facing mojibake and several menu UX regressions after the `1.5.1` menu redesign. Treat this as a targeted stabilization release. Preserve the tabbed menu, searchable satellite selector, filter reset/status UX, startup performance behavior, and existing satellite/orbit/timeline functionality while fixing the issues below.

Visible issues from the screenshot:

1. Malformed characters in UI labels.
   - The menu close/toggle button shows mojibake such as `âœ•`.
   - The time control label shows mojibake such as `Time Ã—`.
   - Search the full UI code for common mojibake sequences such as `â`, `Ã`, `Â`, replacement characters, and corrupted arrow/toggle glyphs.
   - Replace malformed user-facing characters with safe readable text.
   - Prefer simple ASCII where practical for fragile controls, for example:
     - Use `Menu`, `Close`, `X`, `v`, `>`, or equivalent safe labels instead of corrupted icons.
     - Use `Time x` or a correctly encoded `Time ×`, but only if encoding is verified.
   - Ensure headings, tab labels, helper text, toggle icons, time slider labels, and menu buttons render cleanly in the browser.
   - Keep all edited HTML, CSS, JavaScript, and Markdown files encoded consistently as UTF-8.
   - Add or update automated checks that fail on common mojibake patterns such as `â`, `Ã`, `Â`, or `�` in user-facing UI files.
   - Include a screenshot/manual verification step comparing the fixed menu against the problem screenshot, especially the red-circled menu button and time slider label.

2. Make the menu thinner.
   - Reduce the left menu width so it takes less horizontal screen space.
   - Keep the tab rail usable and readable.
   - Avoid making the menu so narrow that filters, reset button, search results, or satellite metadata become unusable.
   - Validate desktop and narrow viewport behavior.
   - If needed, reduce padding, tab width, gaps, and button sizes rather than hiding required controls.
   - Ensure long panels still scroll internally, especially satellite metadata, search results, and dense filter sections.
   - Confirm the thinner menu does not overlap, obscure, or make the time slider unreadable.

3. Fix tab/onglet order.
   - Move the `Other` tab/onglet so it appears immediately before `Settings`.
   - Keep a logical order such as `Filters`, `Satellite`, `View`, `Timelines`, `Other`, `Settings`.
   - Update keyboard tab navigation and persisted selected-tab logic if the tab order changes.
   - Ensure persisted old tab IDs still resolve safely after the change.

4. Make timeline selection mutually exclusive.
   - `Show Launch Timeline` and `Show Re-entry Timeline` should behave as exclusive checkbox toggles.
   - Checking `Show Launch Timeline` must uncheck and hide `Show Re-entry Timeline`.
   - Checking `Show Re-entry Timeline` must uncheck and hide `Show Launch Timeline`.
   - Unchecking the currently active timeline should hide that timeline.
   - Only one timeline HUD may be visible at a time.
   - If needed, update timeline modules to expose or internally support reliable `show`/`hide` behavior so checkbox state and actual HUD visibility cannot diverge.
   - Preserve deferred timeline loading states from Release `1.5`: disabled/loading checkboxes should not be toggled while their data is still preparing.
   - Preserve selecting a satellite from either timeline.

5. Preserve Yaw/Pitch/Roll sliders after satellite selection.
   - Investigate why selecting a satellite causes the Yaw/Pitch/Roll sliders to disappear, reset, or become inaccessible.
   - If the Yaw-Pitch-Roll checkbox is enabled, selecting a satellite must keep the yaw, pitch, and roll sliders visible and usable.
   - Selecting a satellite must not switch away from the Satellite tab, collapse the Satellite Selection panel, reset the YPR checkbox, or hide the sliders.
   - If YPR is enabled and satellite selection happens from another tab or timeline, either keep the Satellite tab visible or automatically return to the Satellite tab so the sliders remain discoverable.
   - Switching satellites should preserve current yaw, pitch, and roll slider values unless the user explicitly resets them.
   - YPR frame/model orientation should still update for the newly selected satellite.
   - If no satellite is selected, YPR controls may remain visible but should communicate that they require a selected satellite, or they may be disabled consistently.

6. Verify previous menu acceptance items still hold.
   - The `Active` tag/filter chip should not appear as a filter control if it is still being generated from data.
   - Filter out `Active` from generated tag/company chips, not only from static menu markup.
   - Selected tag chips should keep the blue metallic/light active style.
   - Searchable satellite selection, reset filters, active filter summary, and empty states should still work.
   - `Other Selections` should remain collapsible and blue-styled.
   - Startup performance instrumentation and deferred startup behavior should remain intact.

7. Update tests and documentation.
   - Add or update tests that fail if mojibake appears in generated menu markup, `index.html` UI labels, or timeline labels.
   - Add or update tests that scan edited UI files for common mojibake sequences and replacement characters.
   - Add tests for thinner menu CSS constraints or expected menu width tokens.
   - Add tests that the menu and long panels retain scrollable overflow after narrowing.
   - Add tests for the tab order: `Other` must appear before `Settings`.
   - Add tests proving timeline checkboxes are mutually exclusive.
   - Add tests that checkbox state and timeline HUD visibility stay synchronized.
   - Add tests proving YPR slider visibility is not reset by satellite selection logic when YPR is enabled.
   - Add tests that generated filter/tag chips exclude `Active`.
   - Update `Test_and_Integration.md` with manual checks for text encoding, thinner menu layout, timeline exclusivity, and YPR persistence after satellite selection.
   - Add a manual screenshot comparison checklist for the red-circled mojibake areas in the provided screenshot.
   - Add a manual check that the time slider remains readable and unobscured after menu narrowing.
   - Update `README.md` if menu/timeline behavior documentation changes.
   - Update the visible version in `index.html` to match this release.

Acceptance criteria:

- No visible mojibake remains in the menu, time slider label, tab labels, toggle labels, headings, or helper text.
- Automated mojibake scans pass for UI-facing HTML, CSS, JavaScript, and Markdown files touched by the release.
- The menu is visibly thinner while still usable.
- Long menu panels remain scrollable after narrowing.
- The time slider remains readable and unobscured by the menu.
- The tab order places `Other` immediately before `Settings`.
- Timeline checkboxes are mutually exclusive and only one timeline can be visible at a time.
- Unchecking the active timeline hides it.
- Timeline checkbox state always matches actual timeline HUD visibility.
- Yaw/Pitch/Roll sliders remain visible after selecting or switching satellites when the YPR toggle is enabled.
- If YPR is enabled, satellite selection does not leave the sliders hidden in another tab or collapsed section.
- Yaw/Pitch/Roll values are preserved across satellite selection unless explicitly reset by the user.
- The `Active` tag/filter chip is not shown as a filter control.
- `Active` is filtered out from generated tag/company chips, not just static markup.
- Search, filters, reset filters, selected satellite summary, model loading, orbit display, footprints, Mercator, day/night, ECEF axes, and startup performance behavior still work.
- `npm test` passes.
- JavaScript syntax checks pass.
- Browser/manual verification results are documented in `Test_and_Integration.md`.

---

## Release Date: 2026-06-03  Version 1.5.1

Improve menu readability, filter styling, and control layout.

The left menu in `index.html` should be easier to scan and use. Redesign the relevant menu sections without changing the underlying satellite filtering, selection, timeline, orbit, footprint, or view behavior.

Requirements:

1. Improve overall menu readability.
   - Review `js/SatelliteMenuLoader.js`, `css/style.css`, and related menu code in `index.html`.
   - Make section spacing, labels, button states, checkbox alignment, and dropdown placement easier to read.
   - Preserve the existing dark compact style, but improve visual hierarchy and active-state contrast.
   - Ensure the menu remains usable at narrow viewport widths.

2. Add tabbed menu navigation inspired by the reference image.
   - Add `onglets`/tabs to the menu, using the attached reference image as inspiration rather than a pixel-perfect copy.
   - Prefer a compact vertical tab rail with colored tab labels along the left edge of the menu, similar to the reference.
   - Organize controls into clear tabs such as `Filters`, `Satellite`, `View`, `Timelines`, `Other`, and `Settings` or equivalent names that fit the current app.
   - Keep the default tab focused on the most common startup workflow, likely `Filters` or `Satellite`.
   - Switching tabs should show the selected tab panel and hide the other tab panels without losing control state.
   - Use accessible tab semantics where practical: `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, and keyboard navigation.
   - Make the active tab visually obvious with a blue/light metallic style that fits the updated menu.
   - Ensure tab labels remain readable and do not consume too much horizontal space.
   - On narrow screens, keep the tabs usable by allowing the tab rail to scroll or by converting it to a compact horizontal tab strip.

3. Add practical UX improvements while changing the menu.
   - Add clearer loading/disabled states for controls that depend on deferred startup data.
   - Add short helper text or tooltips for ambiguous controls such as orbit filters, debris modes, timelines, and `Other Selections`.
   - Add an obvious reset/default action for filters if it can be implemented without clutter.
   - Keep a concise visible status for selected satellite and satellite count.
   - Avoid adding visual noise; prioritize scanability over decoration.

4. Add a searchable satellite selector.
   - Replace or enhance the current `Select Satellite` dropdown with a searchable combobox/typeahead.
   - Search by satellite name, NORAD ID, orbit type, and company/tag.
   - Keep the selector usable with keyboard navigation: arrow keys, Enter, Escape, and Tab.
   - Show a clear empty state such as `No satellites match this search`.
   - Add a clear/reset search affordance.
   - Preserve existing selection behavior, detailed model loading, selected marker highlighting, Mercator selected state, orbit display, and timeline selection.

5. Add better filter reset, active-summary, and empty-state UX.
   - Add a visible `Reset Filters` action.
   - Reset filters to the documented defaults: Orbit `MEO`, Tags `All tags`, Debris `Show`.
   - Do not clear the selected satellite unless it no longer matches the reset state or clearing is required for consistency.
   - Show a compact active-filter summary such as `MEO + Starlink + Debris hidden | 243 satellites`.
   - If filters return zero satellites, show a clear empty state such as `No satellites match these filters`.
   - Include a shortcut from the empty state to reset filters.

6. Persist menu UI state where useful.
   - Remember the last selected tab/onglet across reloads.
   - Remember collapsed/expanded menu sections where practical.
   - Do not persist transient loading states.
   - Ensure persisted menu state never overrides valid satellite/filter state unexpectedly.

7. Improve accessibility and interaction polish.
   - Add visible focus outlines for tabs, chips, checkboxes, dropdown/combobox, and timeline toggles.
   - Ensure tab switching works from the keyboard.
   - Add ARIA labels or descriptions for tab panels, timeline toggles, filter reset, search field, and empty states.
   - Keep controls usable when satellite data or deferred timeline data is still loading.

8. Remove `Active` controls from filters.
   - Remove any remaining `Active` tag/filter button or control from the filter UI.
   - Confirm removing it does not break saved state, filter normalization, count updates, marker visibility, or dropdown population.
   - Keep valid filter controls for Orbit, Tags, and Debris.

9. Improve selected tag button styling.
   - When a tag chip is selected, make it visibly active with a brighter blue metallic/light style.
   - The selected state should be obvious but still readable against the dark menu.
   - Preserve keyboard accessibility and clear checked/pressed states.

10. Make `Other Selections` blue and collapsible.
   - Style the `Other Selections` section header/control with a blue visual treatment.
   - Make the section collapsible like the other menu sections.
   - Confirm expanding/collapsing does not reset the selected `Earth`/`Moon` state.

11. Reorganize satellite selection controls.
   - Keep a clear `Satellite Selection` section.
   - Place the `Select Satellite` label and satellite dropdown combo directly between the `Satellite Selection` section title and the related checkboxes.
   - Keep related checkboxes such as footprint, show-only-selected, orbit frame, yaw/pitch/roll, and similar satellite-specific controls grouped logically below the combo.
   - Do not break satellite selection, detailed model loading, selected-satellite highlighting, orbit display, Mercator selected state, or timeline selection.

12. Move timeline controls after `Other Selections`.
   - Move `Show Launch Timeline` and `Show Re-entry Timeline` controls so they appear after the `Other Selections` section.
   - Replace button-style timeline toggles with checkbox-style toggles.
   - A checked checkbox should show/open the corresponding timeline.
   - An unchecked checkbox should hide/close the corresponding timeline.
   - Preserve existing timeline behavior, including selecting a satellite from either timeline.
   - Ensure Release 1.5 deferred startup behavior still works with checkbox toggles: disabled/loading states must remain clear while timeline data is preparing.

13. Update tests and documentation.
   - Add or update tests for the generated menu structure.
   - Test the tab rail/tab strip exists and exposes accessible tab semantics.
   - Test tab switching hides inactive panels without resetting selected filters or selected satellite state.
   - Test searchable satellite combobox behavior, including name, NORAD ID, orbit type, and company/tag search.
   - Test keyboard navigation for tabs and satellite search.
   - Test `Reset Filters`, active-filter summary, and zero-result empty state.
   - Test persisted tab/collapse state without persisting transient loading states.
   - Test that no `Active` filter/tag control remains.
   - Test selected tag chips expose a distinct active class/state that can be styled blue.
   - Test `Other Selections` is collapsible and styled with a blue class or equivalent.
   - Test timeline controls are checkboxes and appear after `Other Selections`.
   - Test the satellite dropdown appears before the satellite-specific checkboxes.
   - Update `Test_and_Integration.md` with menu readability, tab navigation, layout, timeline checkbox, and responsive checks.
   - Update `README.md` if controls or menu usage documentation changes.
   - Update the visible version in `index.html` to match this release.

Acceptance criteria:

- The menu is more readable, with clearer spacing and visual hierarchy.
- The menu includes compact `onglets`/tabs inspired by the reference image.
- Tabs are accessible, visually clear, and usable on desktop and narrow screens.
- Switching tabs does not reset filter, selection, view, timeline, or other control state.
- Ambiguous controls have better labels, helper text, tooltip text, or status feedback where practical.
- Satellite selection is searchable by name, NORAD ID, orbit type, and company/tag.
- Satellite search supports keyboard navigation and clear empty states.
- A `Reset Filters` action restores documented filter defaults.
- Active filter state is summarized in a compact, readable status line.
- Zero-result filter/search states provide a useful message and reset shortcut.
- Last selected tab and useful collapsed-section state persist across reloads without preserving transient loading state.
- Focus states and ARIA labels make tabs, filters, search, and timeline toggles more accessible.
- No `Active` filter/tag button or control remains in the filter menu.
- Selected tag chips use a clear blue metallic/light active style.
- `Other Selections` is blue-styled and collapsible.
- `Select Satellite` and the satellite dropdown sit between the `Satellite Selection` header and the related checkboxes.
- `Show Launch Timeline` and `Show Re-entry Timeline` appear after `Other Selections`.
- Timeline controls are checkbox toggles, not button toggles.
- Checking a timeline checkbox opens/shows that timeline; unchecking it hides/closes the timeline.
- Timeline loading/deferred startup states remain clear and usable.
- Existing filtering, satellite selection, model loading, orbit display, footprints, Mercator, day/night, ECEF axes, and timeline satellite selection still work.
- `npm test` passes.
- JavaScript syntax checks pass.
- Browser/manual menu checks are documented in `Test_and_Integration.md`.

---

## Release Date: 2026-06-03  Version 1.5

Optimize `index.html` page-load performance.

The current application takes too long to load when opening `index.html`. Investigate the full startup path and reduce the time to first usable render without breaking existing satellite simulation, rendering, filtering, orbit display, Mercator, model loading, or timeline behavior.

Start by measuring the current load path before making changes. Identify which parts of startup are slow, including HTML parsing, JavaScript module loading, Three.js/addon imports, TLE or JSON loading, satellite marker creation, local model discovery, texture/model loading, filter/dropdown population, Mercator setup, and first-frame rendering.

Requirements:

1. Add repeatable performance measurement.
   - Measure baseline load timing for `index.html` over a local HTTP server.
   - Capture at least DOMContentLoaded, full load, first visible globe render, satellite data ready, and first interactive UI state where practical.
   - Prefer browser Performance API instrumentation or a small debug timing helper that can be disabled or kept low-noise.
   - Document the baseline and final measurements in `Test_and_Integration.md`.

2. Reduce blocking startup work.
   - Defer non-critical work until after the first globe render.
   - Avoid loading detailed satellite models, large optional assets, or expensive derived data during initial page load unless required for the first view.
   - Lazy-load selected-satellite models only when a satellite is selected.
   - Keep the initial UI responsive while satellite data and optional visuals continue loading.

3. Optimize data loading and processing.
   - Review TLE, JSON, metadata, and filter/tag loading for unnecessary repeated fetches or parsing.
   - Cache reusable parsed data in memory.
   - Avoid rebuilding satellite dropdowns, filters, geometries, or lookup maps more often than needed.
   - Preserve accurate satellite propagation and current filter behavior.

4. Optimize initial rendering.
   - Render a usable globe and menu as early as possible.
   - Batch satellite marker creation where practical to avoid long main-thread stalls.
   - Avoid expensive per-satellite work before the first frame unless it is required for correctness.
   - Confirm animation-loop changes do not introduce visual stutter, stale satellite positions, or broken orbit/footprint updates.

5. Preserve current behavior.
   - Existing 3D globe rendering, Mercator view, filters, satellite selection, `Show Orbit`, footprints, day/night, ECEF axes, detailed selected models, and timelines must keep working.
   - Do not remove features to improve load time unless a feature is explicitly optional and remains available through lazy loading.
   - Do not reduce orbital accuracy or replace TLE propagation with approximate placeholders.

6. Add focused tests or checks.
   - Add automated tests for any new caching, lazy-loading, or startup-state helpers.
   - Add regression checks proving deferred startup work still completes and updates the UI correctly.
   - Keep existing tests passing.

7. Update documentation and versioning.
   - Update the visible version in `index.html` to match this release.
   - Update `Test_and_Integration.md` with performance baseline, final measurements, manual browser checks, and any known limitations.
   - Update `README.md` if startup behavior, lazy loading, local server usage, or diagnostics changed.

Acceptance criteria:

- `index.html` reaches a visible, usable initial render faster than the measured baseline.
- Initial page load does not block on selected-satellite model loading or other non-critical assets.
- Satellite data, filters, dropdown, globe, and clock become usable without long main-thread freezes.
- Deferred work completes correctly after startup.
- Selecting a satellite still loads any available detailed model on demand.
- `Show Orbit`, Mercator ground track, footprints, filters, day/night, ECEF axes, timeline controls, and satellite switching still work.
- No new console errors are introduced.
- `npm test` passes.
- JavaScript syntax checks pass.
- Performance measurements and manual verification results are documented in `Test_and_Integration.md`.

---

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
