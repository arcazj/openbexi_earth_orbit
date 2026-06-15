# OpenBEXI Earth Orbit

OpenBEXI Earth Orbit is a browser-based satellite visualization app built with plain HTML, CSS, JavaScript modules, Three.js, and satellite.js. It renders Earth, satellite positions from TLE data, orbit paths, footprints, day/night lighting, Moon and Mars context, and 2D Mercator map views.

## Live Demo

[OpenBEXI Earth Orbit on GitHub Pages](https://arcazj.github.io/openbexi_earth_orbit/index.html)

## Features

- 3D Earth globe with satellite markers propagated from TLE data.
- 3D `Show Orbit` paths draw one propagated revolution for the selected satellite, with explicit camera-aware Earth occlusion and rejection of invalid, non-finite, decayed, or below-Earth propagation samples before drawing.
- 2D Mercator map with satellite labels, selected-satellite highlighting, selected ground tracks, and day/night overlay.
- When Globe and Mercator are both enabled, the Mercator map appears as a bottom-right canvas overlay instead of being hidden by the left menu.
- Multi-select orbit/category filters for `ALL`, `GEO`, `MEO`, `LEO`, `HRO`, `Debris`, and `Others`.
- Multi-select tag/operator filters such as `Starlink`, `One Web`, `SES`, `Intelsat`, `Weather`, and `Iridium`.
- Debris filtering through the `Debris` category button in the orbit/category row.
- Accordion-style menu sections ordered as Views & Time, Satellites Selection - Found, Timelines, Share, and Help, preserving the legacy colored section accents with section-matched metallic expanded backgrounds.
- Deterministic launch defaults: Views & Time and Satellites Selection - Found start expanded, while Timelines, Share, and Help start collapsed.
- Optional Python server integration for live local API-backed TLE/satellite metadata loading, with automatic local-file fallback when the server is unavailable and no launch-time offline banner.
- Standard-library Python satellite data maintenance tool for standalone or server-imported TLE and decayed-database updates.
- Aligned top menu header with Close, version/GitHub link, and server connection status in one compact desktop row.
- Server status indicator with connected, checking, offline, and error states backed by `icons/server_*.svg`, and the status panel shows server URL, data source, version, last load time, and reconnect/refresh.
- Share menu section for copying or natively sharing a safe link for the selected satellite, view mode, filters, simulation time, display settings, and a captured canvas image when supported.
- Searchable satellite selector with typeahead support for satellite name, NORAD ID, orbit type, and company/tag; the result list is portaled above other menu controls and closes cleanly after mouse, keyboard, Escape, Tab, or outside-click interactions.
- After selecting a satellite, the selector search field clears the previous selected label on the next search interaction without clearing the active selection.
- Selecting any satellite automatically enables `Show only selected satellite`, synchronizes the checkbox, and keeps the selected satellite visible even when current filters would otherwise hide it.
- Filter reset and zero-result empty states inside Satellites Selection - Found.
- Selected-satellite menu controls plus a transparent right-side data/TLE detail panel under the UTC clock; satellite data and TLE details are independently expandable and expanded by default on each selection. Starlink and ISS selections add an expanded red bold `Source detail` attribution section.
- Local detailed model loading for selected satellites using OBJ/MTL and GLB assets under `obj/`.
- Selected-satellite observer framing in 3D: selecting a satellite smoothly moves the camera to a close observer view with Earth centered behind the satellite.
- Selected detailed models place the camera/observer eye exactly 100 real-world meters from the selected satellite target by default, with FOV-aware model visual scaling so the model remains inspectable without moving the observer farther away.
- Starlink selected-model orientation uses the live orbital frame: local `+X` follows velocity, local `+Z` points nadir toward Earth, and local `+Y` completes the right-handed frame.
- Selected detailed satellite models use Sun-driven lighting with subtle Earth-reflected albedo when possible, so solar panels can show direct sunlight and low blue Earth reflection without camera-fill washout.
- ISS selected-model orientation also uses the live orbital frame: local `+X` follows velocity, local `+Y` is the pitch axis and points nadir toward Earth, and local `+Z` is the right-handed negative cross-track complement. ISS orientation diagnostics are stored on the selected model for debugging.
- Starlink selected-model framing uses an oblique reference-style observer view at the same 100 m distance, so Earth/horizon sits behind and below the satellite instead of centered directly behind it.
- Nadir-oriented detailed satellite models: the selected model treats local `+Z` as the Earth-facing axis and points it toward Earth's center before applying yaw/pitch/roll bias.
- 2D/Mercator selected-satellite UX: selection is highlighted with a clear marker ring instead of applying 3D-only camera-distance behavior.
- Mercator selected-satellite state uses the selected NORAD ID, so ground tracks and marker rings still render when a detailed 3D model hides the selected sprite.
- High-definition Earth texture toggle, ECEF axes, Moon/Mars context through Solar System selection, latest-launch timeline, and latest-decay re-entry timeline.
- Optional Stars & Milky Way view layer in Views & Time, with 46 bundled real RA/Dec reference stars, Milky Way sphere, RA/Dec grid, bright labels, and atmosphere.
- Selecting non-MEO/GEO satellites automatically enables the high-definition Earth texture while MEO/GEO selections never force it off.
- Satellite Selection shortcuts can select the first loaded Starlink satellite or ISS/ZARYA through the same camera/model path as the normal satellite selector. The Starlink shortcut displays the resolved NORAD ID as `Starlink (<NORAD ID>)`.
- Help menu actions provide quick access to the GitHub project, rendered README Markdown, rendered Releases History Markdown, a Markdown license page, local standard Swagger UI, local rendered Swagger Markdown, and live API JSON when the optional Python server is running.
- Timeline checkboxes are mutually exclusive: enabling the launch timeline hides the re-entry timeline, and enabling the re-entry timeline hides the launch timeline. The launch timeline opens on the latest valid launch date in the loaded satellite data, and the re-entry timeline opens on the latest valid confirmed or predicted decay event, including confirmed decayed records that are no longer active TLE satellites.
- Faster initial startup path: the globe and core controls render before the full TLE sprite pass, while timelines and decay estimates are prepared as deferred work.
- Optional startup timing diagnostics through `?perf=1` or `localStorage.openbexiStartupPerf = "1"`.

## Orbit and Ground-Track Notes

The app uses `satellite.js@6.0.2` for TLE propagation. Some TLEs can return invalid propagated samples, especially for decayed or unstable objects. Orbit and Mercator rendering reject non-finite positions and below-Earth samples before drawing. When invalid samples occur in the middle of a path, the app splits the line instead of connecting through Earth or across an invalid Mercator segment.

The 3D selected-orbit line uses normal depth testing plus camera-aware Earth occlusion splitting so Earth hides portions of the orbit that are behind the globe. GEO orbit fixes should not change the physical propagated orbit radius unless tests prove the propagation radius is wrong.

GEO Mercator ground tracks can be nearly stationary. When the generated GEO ground track collapses below visible inset size, the Mercator renderer draws a short visible fallback segment around the sub-satellite point so `Show Orbit` does not appear blank.

## Selected-Satellite View Notes

Version 1.5.9 targets an exact default observer distance of 100 real-world meters from the selected detailed satellite target point. The camera position is the observer eye point, and the 100-meter distance is converted to scene units through `KM_TO_SCENE_UNITS`.

Because the app uses visual scaling for readability, detailed models are scaled for the selected view using the loaded model bounds, camera field of view, and a target viewport height. The selected view preserves the 100-meter observer distance instead of moving the camera farther away as a fallback. It also reduces the camera near plane for selected models, keeps the selected satellite centered while it moves, and places the observer outward from Earth through the satellite so Earth appears behind it.

For Starlink models, Version 1.5.10 replaces the pure radial observer start with an oblique orbital-frame view. Starlink local `+X` is aligned to velocity, local `+Z` is aligned to nadir, and local `+Y` completes the right-handed frame. The yaw, pitch, and roll sliders remain user bias controls applied after that base orbital-frame alignment.

Version 1.5.11 keeps the selected-satellite observer workflow consistent across the search selector, timeline selections, and `View` shortcuts. Selecting any satellite automatically switches to show-only-selected mode; selecting LEO/HEO/Other satellites such as Starlink or ISS also enables High Def. Earth so the observer keeps better Earth context behind the satellite.

Version 1.5.12 updates the shortcut labels and Help menu. The Starlink shortcut resolves the first loaded Starlink target and displays its NORAD ID. ISS uses the same velocity/nadir orbital-frame orientation convention as the reference picture, with ISS-specific calibration diagnostics in `detailedSatelliteModel.userData`.

Version 1.5.13 adds an optional Python server data path. When the server is connected, TLE and satellite metadata requests can be served by the local API; when the server is unavailable, slow, invalid, or blocked, the app falls back to the existing local JSON files and keeps the same offline behavior.

Version 1.5.14 improves the server status UI, adds status icons from `icons/`, improves Swagger/OpenAPI documentation contrast, keeps `Other Selections` visually consistent with other accordion headers, and adds Share image preview, download, copy, and native image sharing when the browser supports it.

Version 1.5.15 makes the menu launch state deterministic, renders README and Releases History Markdown inside Help, renames the Prompt History action to `Releases History`, and aligns Close, version, and server status on one compact row.

Version 1.5.16 revises the menu UX. All accordion sections start collapsed by default, `View` is renamed to `Views & Time`, Settings is removed, selected-satellite controls stay hidden until a satellite is selected, Help uses document-style actions, and the centered GitHub/version header aligns with the Close and server status controls.

Version 1.5.17 moves Satellite Selection directly under Views & Time, places Filters - Satellites Found immediately below Satellite Selection, restores deterministic launch defaults with those three sections expanded, adds a synchronized `Time x` slider at the top of Views & Time while keeping the existing canvas-top slider, and removes obsolete visible helper text from the orbit filter and satellite search areas.

Version 1.5.18 removes the launch offline banner while keeping silent local-data fallback and the server status panel. It moves the Starlink and ISS shortcuts into Satellite Selection, portals the satellite-search dropdown above other menu controls, adds the transparent right-side selected-satellite data/TLE panel under the UTC clock, fixes the Licenses action with `LICENSE.md`, and makes README and Releases History open through `markdown_viewer.html` as separate rendered Markdown pages.

Version 1.5.19 removes the detailed metadata/TLE table from Satellite Selection so the full selected-satellite details appear only in the right-side canvas panel. The right-side panel matches the UTC clock width, shows TLE line 1 and TLE line 2 only once, and restricts `SSL_1300.glb` to INTELSAT 20 (IS-20) and INTELSAT 18 (IS-18).

Version 1.5.20 moves the combined Globe + Mercator overlay to the bottom-right of the canvas so the menu does not hide it. It also makes the Sun the dominant selected-model light source, keeps Sun lighting updated before render, adds subtle Earth-reflected albedo for solar-panel visibility when possible, and preserves the selected-satellite camera tracking and zoom/orbit controls.

Version 1.5.21 makes the right-side selected-satellite data and TLE sections collapsible and expanded by default after each satellite selection using `<details open>`. Starlink and ISS selections also add an expanded `Source detail` section after TLE details with bold red attribution text: Starlink cites `https://sketchfab.com/malacodart` with CC Attribution / Creative Commons Attribution, and ISS cites `https://github.com/nasa/NASA-3D-Resources` courtesy of NASA (National Aeronautics and Space Administration). ISS selected-model orientation swaps yaw and pitch control inputs so ISS `Yaw` applies the previous pitch behavior and ISS `Pitch` applies the previous yaw behavior, while roll remains unchanged; ISS local `+Y` is the pitch axis and stays pointed toward Earth/nadir as ISS propagates. Starlink and other models keep the standard mapping. The release also records the ADCS/attitude visualization correction requirements from the attached screenshot, but no repository HTML/JS source file currently contains the ADCS `Attitude`, `Commanded`, or `CMG Torque` UI text, so that page-specific layout correction remains blocked until the source file is added or identified.

Version 1.5.22 keeps the Earth-centered scene frame fixed: the Earth mesh and ECEF axes remain at `(0, 0, 0)`, panning is disabled so mouse interaction cannot shift the active target, Earth mode targets the origin, Moon mode targets `moon.position` without moving the Moon object to the origin, and selected-satellite tracking keeps priority when a satellite/model is selected. Earth zoom can approach about 100 km above the surface, maximum zoom is a very large finite distance, and the camera far plane is widened for Earth, Moon, LEO, MEO, GEO, HEO, and selected-satellite views. Orbit helper math now uses WGS84 geodetic/ECF calculations, orbit classification distinguishes LEO/MEO/GEO/HEO/Other from mean motion plus eccentricity/inclination when metadata is missing, invalid propagated positions are hidden instead of frozen, and Mercator markers, footprints, coverage overlays, ground tracks, and day/night shading share one Web Mercator projection helper. The earlier O3b sprite-only fallback has been superseded by the local `o3b.glb` mapping. Selected detailed model roots now stay at the canonical propagated satellite scene coordinate, while model visual centering is applied only to child geometry, so detailed models and sprite fallbacks remain aligned with the selected red orbit trajectory. Add `?orbitAlignDebug=1` to log selected-model orbit alignment diagnostics.

Version 1.5.23 adds `Mars` to `Other Selections`. Selecting Mars displays a Mars globe, uses the local source texture asset `textures/March.jpg`, targets `mars.position` for orbit/zoom controls like Moon mode, starts the observer close to the Mars globe, and preserves the Earth-centered scene frame without moving Earth, Moon, or Mars to the origin. Mars texture loading is silent during initial `index.html` launch while Earth is active. When the user selects Mars, the app shows a centered progress bar labeled `Loading Mars map/texture...`, keeps it visible long enough for fast cached/local loads to be seen, shows a short confirmation state if the texture already loaded silently before selection, hides it after successful load, and reports a fallback message if the texture fails. Mars context also switches the Mercator background to the shared Mars texture and suppresses Earth-specific satellite markers, footprints, ground tracks, and day/night shading on the Mars map. The Mars position is an approximate visual model using simplified circular heliocentric Earth-to-Mars relative motion. `textures/March.jpg` is treated as a local project-provided Mars texture source; its exact source and license still need to be confirmed.

Version 1.6 adds an optional `Stars & Milky Way` checkbox to the `Views & Time` row beside `Globe` and `Mercator`. It is unchecked by default. When enabled, the main app displays a Milky Way celestial sphere and real RA/Dec demo-star field without changing the Earth-centered scene, satellites, Moon/Mars behavior, Mercator, orbit, footprint, selected-satellite, timeline, Share, or Help flows. The `RA/Dec Grid`, `Bright Labels`, `Atmosphere`, and `Magnitude limit` controls were introduced for the initial integrated view. Mars now loads the optimized runtime texture `textures/March_8k.jpg` generated from the local source `textures/March.jpg` so WebGL does not resize the original `21339x10670` image at upload time.

Version 1.6.1 removes the integrated main-app `Magnitude limit` slider because the bundled catalog currently contains only 46 stars and the slider does not add useful visual detail. When `Stars & Milky Way` is enabled, the main app displays all 46 bundled reference stars from `data/stars/bright-stars-demo.js` and shows a menu note based on the catalog length. `RA/Dec Grid`, `Bright Labels`, and `Atmosphere` remain hidden until `Stars & Milky Way` is enabled and unchecked by default. Bright Labels remain internally limited to bright stars so the sky is readable. Magnitude filtering can return later when a larger local preprocessed catalog is added.

Version 1.6.2 integrates `Solar System Overview` into the main `Views & Time` section while keeping `SolarSystemOverview.html` available as a standalone debug page. The menu Time x slider is removed; the top/canvas Time x slider remains the single simulation-speed control for Earth and Solar System motion. `Views & Time` now has `Solar System` and `Stars & Milky Way` on the first row, `Globe`, `High Def.`, and `ECEF Axes` on the second row, and `Mercator` plus `Day/Night` on the third row. Solar System mode is off by default, stores the previous Earth/satellite state, hides Earth-specific satellite layers while active, and restores the previous state when exited. The integrated mode uses `js/solarSystemOverviewLoader.js` to render the Sun, orbit paths, readable labels, selected-body highlight/HUD, Saturn rings, and textured Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, and Uranus with approximate Kepler/visual positions. Earth selection exits into normal Globe mode, Moon selection exits into the existing Moon-centered mode, Mars selection exits into the existing Mars mode, and other planet selections focus the planet inside Solar System mode. The old `Other Selections` menu section is removed; Earth/Moon/Mars context switching is now reached through Solar System selection. The `Displaying 46 bundled reference stars` menu note is hidden by default and appears only when both `Stars & Milky Way` and `Bright Labels` are checked. Planet textures are local only; Mercury, Venus, Jupiter, Saturn, Uranus, Sun, and Saturn ring visual maps under `textures/planets/` are project-generated procedural visual assets, Earth reuses `textures/earthmap1k.jpg`, Moon reuses `textures/moon_map2.jpg`, and Mars reuses `textures/March_8k.jpg`.

Version 1.7 upgrades Solar System textures and uses bundled JPL-derived ephemeris data. Mercury now uses `textures/mercury.png`, Venus uses `textures/venus.png`, and Jupiter uses `textures/jupiter.jpg`; Earth, Moon, Mars, Saturn, Uranus, Sun, and Saturn rings keep local texture behavior. Integrated Solar System mode loads `data/ephemeris/solar_system_jpl_horizons_2020_2035_6h.json` locally at runtime, displays the ephemeris source/date range in the Solar System summary or HUD, and computes Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, and Uranus positions from shared `SIM_DATE`. `Time x = 0` is a true freeze, and larger `Time x` values advance the shared simulation date. Moon position is derived from Moon and Earth Horizons vectors, then visually scaled for readability in the compressed Solar System view. Closed JPL-derived orbit guides are rebuilt only when the bundled ephemeris covers at least one full orbital period for that body; Saturn, Uranus, Moon, and other incomplete-range bodies keep analytical orbit guides so partial ephemeris arcs do not create diagonal closing chords. Solar System planet names use compact pin/arrow callouts anchored on the planet edge, use projected screen-space sizing to stay near an `18-42 px` readable range, shrink at close zoom, and grow within a cap for distant planets so names remain readable without large billboard text panels. The Solar System planet HUD is measured from and aligned to the UTC clock/horloge width, right edge, placement, and monospace typography. No texture or ephemeris data is fetched remotely at runtime. If the local ephemeris is missing, invalid, still loading, or out of range, the UI labels the mode as an approximate visual fallback instead of silently claiming JPL-derived positions.

Version 1.7.1 consolidates satellite filters into `Satellites Selection - Found`. The standalone `Filters - Satellites Found` accordion is removed, the found count is red and bold in the Satellite Selection heading, orbit/tag/debris filters live directly inside Satellite Selection, `Reset Filters` is on the same row as `Show`, `Hide`, and `Debris only`, and obsolete filter helper text plus the old active summary string are removed. The main `Views & Time` checkboxes use a stable 3x3 table/grid so `Solar System`, `Stars & Milky Way`, `Globe`, `High Def.`, `ECEF Axes`, `Mercator`, and `Day/Night` stay aligned. The satellite search dropdown and hidden legacy select are populated from the same filtered satellite set, so multi-check filter results, visible count, and selectable results stay synchronized. When search text is active, the red count follows the visible dropdown result list; capped search results display as `visible / total`, such as `40 / 126`, instead of showing a misleading single total.

Version 1.7.2 moves `Debris` into the orbit/category row as `ALL`, `GEO`, `MEO`, `LEO`, `HRO`, `Debris`, `Others`. The old separate `Show`, `Hide`, and `Debris only` buttons are removed. Selecting `Debris` shows debris objects only, while `Reset Filters` now sits in the satellite search row immediately after `Clear`. The release also adds `swagger.html` as a local standard Swagger/OpenAPI-style static page and keeps `SWAGGER.md` as the Markdown companion, available through `markdown_viewer.html?source=SWAGGER.md&title=Swagger%20API`; neither local documentation page requires starting `server.py`, while live `/docs` and `/openapi.json` still require the optional Python server.

Version 1.7.3 corrects 3D `Show Orbit` so the selected satellite displays one complete propagated orbital revolution from the current simulation date instead of multi-period trails. Orbit geometry refreshes from shared simulation time as `Time x` advances, replaces the existing path instead of accumulating duplicates, and keeps invalid-sample splitting plus Earth occlusion behavior. `Stars & Milky Way` is checked by default on launch while `RA/Dec Grid`, `Bright Labels`, and `Atmosphere` remain unchecked.

Version 1.7.4 replaces the legacy Java satellite data maintenance workflows with `tools/satellite_data_tools.py`. The tool can run standalone or be imported by `server.py`, supports legacy-compatible `export-tle --all` and `build-decayed-db --all` modes, and uses incremental default TLE updates with metadata freshness checks, atomic writes, backups, dry-run support, CelesTrak failure preservation, and optional scheduled server refresh that is disabled by default.

Version 1.7.5 refreshes the Launch and Re-entry timelines around the newest dataset events. `Show Launch Timeline` derives the latest launch from loaded TLE/satellite metadata and anchors the HUD around that event. `Show Re-entry Timeline` merges active-satellite decay estimates with confirmed decayed records from local or server `/api/decayed` data, anchors on the latest valid decay event, highlights it, and allows inactive decayed objects to show details without attempting active TLE propagation.

The selected satellite model axis convention is:

```text
local +Z = Earth-facing / nadir axis
```

Yaw, pitch, and roll are applied as a bias on top of that nadir-facing orientation.

For ISS selected models only, the yaw and pitch control inputs are swapped to match the corrected ISS visual orientation: the `Yaw` slider drives the previous pitch behavior, the `Pitch` slider drives the previous yaw behavior, and `Roll` is unchanged. The ISS pitch axis is local `+Y`; it points to Earth/nadir and keeps tracking Earth as time changes.

## Orbital Accuracy Notes

- TLE propagation remains on the existing `satellite.js` SGP4 path.
- `satellite.js` returns TEME-like coordinates. The app treats those coordinates as ECI-like scene coordinates for visualization unless a higher-fidelity TEME-to-ITRF/ECI transform is explicitly added later.
- TLE/SGP4 results are suitable for educational visualization and short-term screening, not operational flight dynamics or conjunction assessment.
- The Moon remains a simplified visual model inside the Earth-centered scene; Moon mode changes the camera target to the Moon center but does not recenter the physical scene frame.
- Mars remains a simplified visual model inside the Earth-centered scene; Mars mode changes the camera target to the Mars center but does not recenter the physical scene frame.
- Mars texture source: `textures/March.jpg`, local project-provided texture, exact source/license to be confirmed.
- Mars runtime texture: `textures/March_8k.jpg`, optimized to `8192x4096` to stay inside common WebGL maximum texture size limits and avoid Three.js upload-time resizing.

## 3D Model Asset Matching

When a satellite is selected, the app first highlights the TLE sprite, then attempts to resolve a local detailed model from `obj/`.

Model matching is deterministic:

- Exact NORAD/metadata mappings are preferred when available.
- If exact metadata is unavailable, normalized satellite names, company/operator tags, and constellation aliases are used.
- Known local mappings include Starlink, OneWeb, O3b, and ISS. Starlink 30xxx-series or explicit V2 metadata resolves to `starlink_v2.glb`; older/non-30xxx Starlink records continue to use the Starlink V1 OBJ/MTL model. O3b/OB3 satellite selections resolve to `o3b.glb`. `SSL_1300.glb` resolves only for `INTELSAT 20 (IS-20)` and `INTELSAT 18 (IS-18)` through exact selected-satellite name metadata, not through generic Intelsat, SSL, GEO, GOES, SES, manufacturer, bus, or alias matching.
- OBJ/MTL assets are loaded as `obj/<asset>.obj` with optional `obj/<asset>.mtl`.
- GLB assets are loaded directly from `obj/<asset>.glb`.

The sprite remains visible while the model is loading. If the local model is missing, fails to load, or becomes stale because the user selected another satellite, the app keeps the selected sprite visible instead of showing the wrong model or a blank selection.

The app logs model visibility diagnostics for selected detailed models, including mesh count, bounding diameter, scale, and material visibility status. It also applies fallback material visibility settings and a camera-side fill light so models remain inspectable even when an asset material or texture is weak.

Selected detailed models use a root object whose world position is reserved for the propagated satellite coordinate. Any model centering correction is applied to child geometry under that root. This prevents visual model assets such as SSL 1300, Starlink, and ISS from drifting away from the selected orbit trajectory.

## Isolated Model Viewer

Use `display_satellite.html` to verify local satellite model assets independently from TLE propagation and satellite selection logic:

```text
http://127.0.0.1:8000/display_satellite.html
```

The viewer first asks the optional server for `/api/display-satellite-models`, which scans `obj/` recursively for every `.glb` model and every `.obj` model with a matching `.mtl`. If the server is not running, it falls back to `json/display_satellite_models.json`. It provides search, reload, reset, auto-fit, axes/grid, wireframe, background, and copyable diagnostics controls. The diagnostics panel reports the active asset path, required files, loaded textures, mesh/material counts, triangles, bounds, and loader warnings.

Custom entries still support newly added local assets without code changes. Use examples such as `ISS.glb`, `starlink_V1`, `starlink_v2.glb`, or `oneweb.glb` to load from `obj/`. The viewer centers the model, adds inspection lighting, repairs weak/invisible materials where possible, normalizes extremely small or large assets such as `SSL_1300.glb` to an inspectable display size, and fits the camera to the model bounds. If a model is visible in `display_satellite.html` but not after selecting a matching satellite in `index.html`, the issue is in the selected-satellite scene integration rather than the local model asset.

## Earth Stars Milky Way Viewer

Use `Earth_Stars_MilkyWay.html` for a standalone Three.js Earth and celestial-sphere view:

```text
http://127.0.0.1:8000/Earth_Stars_MilkyWay.html
```

The viewer keeps Earth centered, renders a Milky Way sky sphere, and places stars from real RA/Dec catalog rows using a reusable J2000/ICRS fixed-sphere conversion. The default magnitude limit is `<10`, and the browser slider is capped at `<11.5`. Magnitude `<18` is documented as external-only because Gaia DR3-scale data requires tiled/LOD/binary preprocessing rather than inline HTML. The bundled demo catalog is intentionally small; use `tools/preprocess_star_catalog.py` to convert licensed Tycho-2-style or Gaia-derived CSV exports into browser-friendly RA tiles.

## Solar System Overview

Use `SolarSystemOverview.html` for a standalone experimental Three.js heliocentric overview:

```text
http://127.0.0.1:8000/SolarSystemOverview.html
```

The page renders a Sun-centered visual scene with thin colored orbit paths, JPL-derived positions when the local ephemeris has loaded, readable labels, UTC time, Sun glow, and a star/Milky Way background. It includes Mercury, Venus, Earth, Moon, Mars, Jupiter, Saturn, and Uranus. The main app also integrates Solar System Overview starting in Version 1.6.2; the standalone page remains useful as a focused debug/inspection page.

Planet texture attribution: Mercury uses `textures/mercury.png`, Venus uses `textures/venus.png`, and Jupiter uses `textures/jupiter.jpg` as local project-provided texture assets. Saturn, Uranus, Sun, and Saturn rings use local project-generated procedural visual maps under `textures/planets/`. Earth reuses `textures/earthmap1k.jpg`, Moon reuses `textures/moon_map2.jpg`, and Mars reuses `textures/March_8k.jpg`, generated from the local project Mars source texture. No planet texture is fetched remotely at runtime.

Solar System ephemeris: Version 1.7 uses local JPL Horizons-derived vectors in `data/ephemeris/solar_system_jpl_horizons_2020_2035_6h.json`, generated by `tools/generate_jpl_ephemeris.py`. The dataset covers `2020-01-01` through `2035-12-31` at 6-hour cadence in the ICRF/ecliptic frame, centered on the Sun (`500@10`) with kilometers and kilometers-per-second units. Runtime interpolation is linear in UTC milliseconds. Validation samples in `data/ephemeris/solar_system_jpl_horizons_reference_samples.json` target less than `5,000 km` error for Mercury, Venus, Earth, Moon, and Mars, and less than `50,000 km` for Jupiter, Saturn, and Uranus. Orbit guides use JPL-derived samples only when the 2020-2035 table contains a complete orbital period; otherwise they remain analytical visual guides. This is a JPL-derived visualization ephemeris, not a certified navigation or flight-dynamics product.

## Requirements

- A modern browser with ES module support.
- Node.js for automated tests.
- Python 3 for the optional local API server or another local static HTTP server for browser smoke testing.

Browser runtime dependencies are loaded by `index.html`:

- Three.js `0.184.0` via import map. Keep `three` and `three/addons/` on the same version.
- satellite.js `6.0.2` via CDN script.

Node test dependencies are declared in `package.json`.

## Setup

Install Node dependencies:

```powershell
npm install
```

Serve the app locally:

```powershell
py -m http.server 8000 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8000/index.html
```

Optional API server mode:

```powershell
py server.py --host 127.0.0.1 --port 8000
```

Open:

```text
http://127.0.0.1:8000/index.html
```

The Python server uses only the standard library. It serves the existing static app plus local API routes:

- `http://127.0.0.1:8000/api/health`
- `http://127.0.0.1:8000/api/version`
- `http://127.0.0.1:8000/api/tle`
- `http://127.0.0.1:8000/api/satellites`
- `http://127.0.0.1:8000/api/satellite-metadata`
- `http://127.0.0.1:8000/api/display-satellite-models`
- `http://127.0.0.1:8000/api/decayed`
- `http://127.0.0.1:8000/api/data-update-status`
- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/openapi.json`

Static Swagger/API documentation is also available without the Python server:

```text
swagger.html
markdown_viewer.html?source=SWAGGER.md&title=Swagger%20API
```

The frontend checks the server with a short timeout. If the check fails or server data is malformed, the app continues with `json/tle/TLE.json`, `json/satellites/`, and other local files. Configure a different API base URL with `?apiBase=http://host:port` or `localStorage.setItem('openbexi.apiBaseUrl', 'http://host:port')`.

Do not use `file://` for normal development because ES modules, JSON, textures, and model assets need HTTP-style loading.

## Data Maintenance

Use `tools/satellite_data_tools.py` to update generated satellite data without Java:

```powershell
py tools/satellite_data_tools.py export-tle --dry-run
py tools/satellite_data_tools.py export-tle --all
py tools/satellite_data_tools.py export-tle --refresh-launch-dates --force
py tools/satellite_data_tools.py refresh-satcat --force
py tools/satellite_data_tools.py build-decayed-db --refresh-satcat --force
py tools/satellite_data_tools.py build-decayed-db --all
```

Default `export-tle` is incremental. It reads `json/tle/TLE.json`, `json/tle/TLE.meta.json`, and existing TLE epochs, respects a 2-hour CelesTrak guard unless `--force` is used, then queries smaller CelesTrak GP groups such as `active` and `last-30-days` to add missing TLEs and update newer records. `export-tle --all` refreshes N2YO launch dates by default, keeps the legacy Java source group order, and keeps first-seen NORAD behavior; use `--skip-launch-dates` only when intentionally reusing the existing local launch-date file. `build-decayed-db` reads `json/satcat.csv` and writes `json/decayed/decayed.json` using the legacy `DECAY_DATE` plus `OBJECT_TYPE=PAY` filter.

`satellite_launch_dates.json` is intentionally not refreshed by a normal incremental `export-tle --force`; use `export-tle --refresh-launch-dates --force` or full `export-tle --all` when launch-date history must be refreshed. Decayed data is separate from TLE updates. Use `refresh-satcat --force` to update `json/satcat.csv` from CelesTrak raw SATCAT CSV, then `build-decayed-db --force`, or combine both with `build-decayed-db --refresh-satcat --force`.

Generated data writes are atomic and create backups; `--dry-run` does not write data, metadata, temp files, or backups. If CelesTrak is unavailable, the tool preserves the last-known-good local JSON files and records failed attempts in metadata without replacing the last successful timestamp. Optional Space-Track fallback is disabled unless credentials are explicitly configured; unverified mirrors are not used automatically.

The server can run the same Python code in a background scheduler:

```powershell
py server.py --host 127.0.0.1 --port 8000 --update-data-on-schedule
```

Scheduled updates are disabled by default. When enabled, startup only checks local freshness metadata; it queries remote TLE data only when the configured 24-hour server interval and the 2-hour CelesTrak guard both allow it. Decayed scheduled updates refresh `json/satcat.csv` first, then rebuild `json/decayed/decayed.json`. The scheduler runs in the background, uses `json/.satellite_data_update.lock` to avoid overlap, never uses `--all`, and exposes state at `/api/data-update-status`.

## Testing

Run automated tests:

```powershell
npm test
```

Run JavaScript syntax checks:

```powershell
Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Run the browser and manual regression checklist in `Test_and_Integration.md` before considering a release complete.

## Startup Performance

`index.html` starts the animation loop before waiting for all satellite sprites, decay estimates, and timeline data. This makes the first globe render visible earlier while the satellite list, filters, and optional timeline data continue preparing.

To inspect startup timings, open:

```text
http://127.0.0.1:8000/index.html?perf=1
```

Then run this in the browser console:

```javascript
window.openbexiStartupPerformance.summary()
```

The timing summary includes lifecycle and app-specific marks such as `dom-content-loaded`, `window-load`, `first-visible-globe-render`, `satellite-data-ready`, and `first-interactive-ui`.

## Menu Usage

The left menu is organized into compact colored accordion sections. Multiple sections can stay open at the same time; expanding one section does not collapse any other section. `Views & Time` and `Satellites Selection - Found` start expanded when `index.html` loads; `Timelines`, `Share`, and `Help` start collapsed. Older local accordion state cannot override those launch defaults on refresh. Expanded panels use section-matched metallic gradients, and the live satellite count in the Satellite Selection header is red and bold.

- `Views & Time`: Solar System and Stars & Milky Way controls, Globe/High Def./ECEF Axes, Mercator/Day-Night, plus mode-specific sub-controls. Stars & Milky Way is enabled by default; the top/canvas `Time x` slider is the single simulation-speed control.
- `Satellites Selection - Found`: searchable satellite selector, dynamic found count, Starlink/ISS shortcut buttons, orbit/tag/debris filters, reset action, zero-result empty state, selected-satellite status, and satellite-specific Yaw-Pitch-Roll, footprint, show-only, LVLH frame, and orbit controls that appear only after a satellite is selected. Detailed metadata and TLE lines are not duplicated in the menu.
- `Timelines`: checkbox toggles for launch and re-entry timelines. Opening Launch highlights the latest valid launch in the loaded satellite data; opening Re-entry highlights the latest valid confirmed or predicted decay event, including decayed objects no longer present in active TLE data.
- `Share`: copy or natively share a safe URL that restores supported app state after satellite data loads, plus preview, download, or copy an image of the current canvas when the browser supports it.
- `Help`: GitHub, rendered README, rendered Releases History, Markdown Licenses, local Swagger UI, Swagger Markdown companion, Live API, and the app disclaimer.

The satellite selector is searchable. Type part of a satellite name, NORAD ID, orbit type, or tag, then use the mouse or keyboard arrow keys plus Enter to select a result. Selecting a result closes the dropdown immediately; Escape, Tab, or clicking outside the selector also closes the dropdown so it cannot block `Show Orbit`, `Show Footprint`, or other controls below it. The result list renders above the accordion panels so it stays visible while searching in the Satellite Selection section. After a satellite is selected, focusing, clicking, typing, pasting, or pressing `Clear` in the search field removes only the old selected label so a new search can start while the selected satellite remains active. Timeline controls are checkboxes: checked means the timeline is visible; unchecked means it is hidden. Only one timeline can be visible at a time. If Yaw-Pitch-Roll is enabled, selecting or switching satellites keeps the YPR sliders visible and preserves the current yaw, pitch, and roll values.

After a satellite is selected, the right side of the canvas shows a translucent selected-satellite detail panel below the UTC clock with the same width as the clock. It includes name, NORAD ID, orbit type, tag/company, launch date, scalar metadata fields, and TLE line 1 plus TLE line 2 exactly once. Satellite data and TLE details are expanded by default. Starlink and ISS selections add an expanded `Source detail` section with bold red model-source attribution text. Clearing the selection hides the panel.

The Help section disclaimer is part of the application UI: OpenBEXI Earth Orbit is for visualization, educational, and experimental purposes only. It is not an authoritative source for navigation, safety, mission planning, collision avoidance, or operational satellite decisions.

The Help section opens Swagger and API documentation in separate pages. `Swagger` opens the local standard `swagger.html` page without requiring the Python server, `Swagger MD` opens the companion `SWAGGER.md` through `markdown_viewer.html`, and `Live API` opens the connected server `/openapi.json` URL when the optional Python server is running. README and Releases History open through `markdown_viewer.html` as separate rendered Markdown pages for `README.md` and `PROMPT_History.md`. The Licenses action opens `LICENSE.md` as a Markdown page.

## Project Structure

- `index.html`: Main browser app and integration point for rendering, controls, selection, and animation.
- `display_satellite.html`: Manifest-backed isolated local OBJ/MTL and GLB viewer for direct satellite model visibility checks.
- `Earth_Stars_MilkyWay.html`: Standalone Three.js Earth, Milky Way, and real RA/Dec star-field viewer.
- `SolarSystemOverview.html`: Standalone experimental Three.js heliocentric solar-system overview.
- `markdown_viewer.html`: Static rendered Markdown viewer used by Help for README, Releases History, and Swagger Markdown companion pages.
- `swagger.html`: Local standard Swagger/OpenAPI-style static API page that displays without starting `server.py`.
- `css/`: Styling for the app, menu, filters, labels, and map layout.
- `js/`: Browser modules for coordinates, satellite loading, models, menu, footprints, frames, day/night, Moon/Mars, timelines, and map rendering.
- `server.py`: Optional standard-library Python server for static hosting, API endpoints, CORS, Swagger/OpenAPI docs, and server-backed data loading.
- `js/startupPerformance.js`: Startup timing, deferred scheduling, and chunked-work helpers used to keep the first render responsive.
- `json/tle/`: TLE source data.
- `json/tle/TLE.meta.json`: Generated TLE update metadata when the Python data tool runs.
- `json/satellites/`: Satellite metadata and model configuration.
- `json/display_satellite_models.json`: Model manifest used by `display_satellite.html`.
- `json/decayed/decayed.meta.json`: Generated decayed-database update metadata when the Python data tool runs.
- `json/satcat.meta.json`: Generated SATCAT source metadata when the Python data tool refreshes `json/satcat.csv`.
- `data/stars/`: Small real-star demo catalog and optional preprocessed star tiles.
- `textures/`: Earth, Moon, Mars, satellite, and material textures.
- `data/ephemeris/`: Local JPL Horizons-derived Solar System ephemeris and validation samples.
- `textures/planets/`: Local project-generated procedural visual maps for integrated Solar System Overview outer planets, Sun, and rings.
- `icons/`: Satellite and UI icon assets.
- `obj/`: OBJ, MTL, and GLB satellite model assets.
- `tests/`: Node-based deterministic regression tests.
- `tools/`: Utility scripts, including `satellite_data_tools.py` for TLE and decayed satellite data maintenance.

## Markdown Files

- `README.md`: Project overview, setup, features, testing commands, and documentation index.
- `LICENSE.md`: Markdown copy of the MIT license used by the Help Licenses action.
- `PROMPT_Instructions.md`: General execution prompt and project-compatible execution rules; release-specific content belongs in prompt history.
- `PROMPT4beamFormingSimulator3DWithMercatorMap_V2.MD`: Supplemental beam-forming/Mercator simulator prompt kept in the workspace when present.
- `PROMPT_History.md`: Release-specific prompts and implementation requirements by date and version; shown in Help as `Releases History`.
- `SWAGGER.md`: Local static Swagger/API Markdown companion; render with `markdown_viewer.html?source=SWAGGER.md&title=Swagger%20API` without starting the Python server.
- `Test_and_Integration.md`: Authoritative automated, browser, manual, domain, visual, and regression acceptance checklist.

## Development Notes

- For each new release in `PROMPT_History.md`, update the visible `index.html` version tag to match the latest release version.
- Keep browser import maps synchronized: `three` and `three/addons/` must use the same verified Three.js version.
- Keep `PROMPT_Instructions.md` limited to the `General Execution Prompt` and project-compatible execution rules; put all release history in `PROMPT_History.md`.
- Keep reusable coordinate, scale, orientation, and framing math in `js/sceneFrame.js` when practical so browser behavior and automated tests stay aligned.
- Keep `Test_and_Integration.md` current whenever features, controls, or accepted verification procedures change.
- Keep `README.md` current when setup, usage, test commands, features, architecture, or known limitations change.
- Avoid mixing generated assets, build outputs, or unrelated untracked files into feature changes.

## License

This project is licensed under the [MIT License](LICENSE.md). The plain-text `LICENSE` file remains for standard repository tooling.
