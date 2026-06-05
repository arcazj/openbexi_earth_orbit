# OpenBEXI Earth Orbit

OpenBEXI Earth Orbit is a browser-based satellite visualization app built with plain HTML, CSS, JavaScript modules, Three.js, and satellite.js. It renders Earth, satellite positions from TLE data, orbit paths, footprints, day/night lighting, Moon context, and 2D Mercator map views.

## Live Demo

[OpenBEXI Earth Orbit on GitHub Pages](https://arcazj.github.io/openbexi_earth_orbit/index.html)

## Features

- 3D Earth globe with satellite markers propagated from TLE data.
- 3D orbit paths with explicit camera-aware Earth occlusion and Mercator ground tracks that reject invalid, non-finite, decayed, or below-Earth propagation samples before drawing.
- 2D Mercator map with satellite labels, selected-satellite highlighting, selected ground tracks, and day/night overlay.
- Multi-select orbit filters for `ALL`, `GEO`, `MEO`, `LEO`, `HEO`, and `Other`.
- Multi-select tag/operator filters such as `Starlink`, `One Web`, `SES`, `Intelsat`, `Weather`, and `Iridium`.
- Debris filtering modes: show all, hide debris, or debris only.
- Accordion-style menu sections for Views & Time, Filters, Satellite Selection, Other Selections, Timelines, Share, and Help, preserving the legacy colored section accents with section-matched metallic expanded backgrounds.
- Deterministic launch defaults: every accordion section starts collapsed, including Views & Time, Filters, and Satellite Selection.
- Optional Python server integration for live local API-backed TLE/satellite metadata loading, with automatic local-file fallback when the server is unavailable.
- Aligned top menu header with Close, version/GitHub link, and server connection status in one compact desktop row.
- Server status indicator with connected, checking, offline, and error states; connected uses `icons/power_green.png`, offline/error uses `icons/power_red.png`, and the status panel shows server URL, data source, version, last load time, and reconnect/refresh.
- Share menu section for copying or natively sharing a safe link for the selected satellite, view mode, filters, simulation time, display settings, and a captured canvas image when supported.
- Searchable satellite selector with typeahead support for satellite name, NORAD ID, orbit type, and company/tag; selected results close cleanly after mouse, keyboard, Escape, Tab, or outside-click interactions.
- After selecting a satellite, the selector search field clears the previous selected label on the next search interaction without clearing the active selection.
- Selecting any satellite automatically enables `Show only selected satellite`, synchronizes the checkbox, and keeps the selected satellite visible even when current filters would otherwise hide it.
- Filter reset, active-filter summary, and zero-result empty states.
- Selected-satellite details, orbit path display, footprint display, LVLH orbit frame, and yaw/pitch/roll controls.
- Local detailed model loading for selected satellites using OBJ/MTL and GLB assets under `obj/`.
- Selected-satellite observer framing in 3D: selecting a satellite smoothly moves the camera to a close observer view with Earth centered behind the satellite.
- Selected detailed models place the camera/observer eye exactly 100 real-world meters from the selected satellite target by default, with FOV-aware model visual scaling so the model remains inspectable without moving the observer farther away.
- Starlink selected-model orientation uses the live orbital frame: local `+X` follows velocity, local `+Z` points nadir toward Earth, and local `+Y` completes the right-handed frame.
- ISS selected-model orientation also uses the live orbital frame: local `+X` follows velocity, local `+Y` points starboard/right-handed cross-track, and local `+Z` points nadir toward Earth. ISS orientation diagnostics are stored on the selected model for debugging.
- Starlink selected-model framing uses an oblique reference-style observer view at the same 100 m distance, so Earth/horizon sits behind and below the satellite instead of centered directly behind it.
- Nadir-oriented detailed satellite models: the selected model treats local `+Z` as the Earth-facing axis and points it toward Earth's center before applying yaw/pitch/roll bias.
- 2D/Mercator selected-satellite UX: selection is highlighted with a clear marker ring instead of applying 3D-only camera-distance behavior.
- Mercator selected-satellite state uses the selected NORAD ID, so ground tracks and marker rings still render when a detailed 3D model hides the selected sprite.
- High-definition Earth texture toggle, ECEF axes, Moon view, launch timeline, and re-entry timeline.
- Selecting non-MEO/GEO satellites automatically enables the high-definition Earth texture while MEO/GEO selections never force it off.
- View shortcuts can select the first loaded Starlink satellite or ISS/ZARYA through the same camera/model path as the normal satellite selector. The Starlink shortcut displays the resolved NORAD ID as `Starlink (<NORAD ID>)`.
- Help menu actions provide quick access to the GitHub project, rendered README Markdown, rendered Releases History Markdown, a Markdown license page, and Swagger/API pages that open separately even if the Python server still needs to be started.
- Timeline checkboxes are mutually exclusive: enabling the launch timeline hides the re-entry timeline, and enabling the re-entry timeline hides the launch timeline.
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

The selected satellite model axis convention is:

```text
local +Z = Earth-facing / nadir axis
```

Yaw, pitch, and roll are applied as a bias on top of that nadir-facing orientation.

## 3D Model Asset Matching

When a satellite is selected, the app first highlights the TLE sprite, then attempts to resolve a local detailed model from `obj/`.

Model matching is deterministic:

- Exact NORAD/metadata mappings are preferred when available.
- If exact metadata is unavailable, normalized satellite names, company/operator tags, and constellation aliases are used.
- Known local fallbacks include Starlink, OneWeb, O3b, ISS, and SSL 1300-style GEO satellites.
- OBJ/MTL assets are loaded as `obj/<asset>.obj` with optional `obj/<asset>.mtl`.
- GLB assets are loaded directly from `obj/<asset>.glb`.

The sprite remains visible while the model is loading. If the local model is missing, fails to load, or becomes stale because the user selected another satellite, the app keeps the selected sprite visible instead of showing the wrong model or a blank selection.

The app logs model visibility diagnostics for selected detailed models, including mesh count, bounding diameter, scale, and material visibility status. It also applies fallback material visibility settings and a camera-side fill light so models remain inspectable even when an asset material or texture is weak.

## Isolated Model Viewer

Use `display_satellite.html` to verify local satellite model assets independently from TLE propagation and satellite selection logic:

```text
http://127.0.0.1:8000/display_satellite.html
```

The viewer defaults to `obj/starlink_V1.obj` and `obj/starlink_V1.mtl`, but it can select current OBJ/MTL and GLB assets under `obj/`. It also supports a custom entry such as `ISS.glb`, `oneweb.obj`, or `starlink_V1` for newly added local assets. The viewer centers the model, adds inspection lighting, and fits the camera to the model bounds. If a model is visible in `display_satellite.html` but not after selecting a matching satellite in `index.html`, the issue is in the selected-satellite scene integration rather than the local model asset.

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
- `http://127.0.0.1:8000/api/decayed`
- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/openapi.json`

The frontend checks the server with a short timeout. If the check fails or server data is malformed, the app continues with `json/tle/TLE.json`, `json/satellites/`, and other local files. Configure a different API base URL with `?apiBase=http://host:port` or `localStorage.setItem('openbexi.apiBaseUrl', 'http://host:port')`.

Do not use `file://` for normal development because ES modules, JSON, textures, and model assets need HTTP-style loading.

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

The left menu is organized into compact colored accordion sections. Multiple sections can stay open at the same time; expanding one section does not collapse any other section. Every section starts collapsed when `index.html` loads, including `Views & Time`, `Filters`, and `Satellite Selection`; older local accordion state cannot reopen sections on refresh. Expanded panels use section-matched metallic gradients, and the live satellite count in the Filters header is red and bold.

- `Views & Time`: globe/Mercator controls on one row, high-definition texture/ECEF axes/day-night controls on the next row, `Starlink (<NORAD ID>)` plus `ISS` shortcut buttons on the third row, and the note to use the top time slider for simulation speed.
- `Filters`: orbit, tag, debris filters, active summary, and reset action.
- `Satellite Selection`: searchable satellite selector, selected-satellite status, metadata, and satellite-specific Yaw-Pitch-Roll, footprint, show-only, LVLH frame, and orbit controls that appear only after a satellite is selected.
- `Other Selections`: Earth/Moon context selection.
- `Timelines`: checkbox toggles for launch and re-entry timelines.
- `Share`: copy or natively share a safe URL that restores supported app state after satellite data loads, plus preview, download, or copy an image of the current canvas when the browser supports it.
- `Help`: GitHub, rendered README, rendered Releases History, Markdown Licenses, Swagger, API, and the app disclaimer.

The satellite selector is searchable. Type part of a satellite name, NORAD ID, orbit type, or tag, then use the mouse or keyboard arrow keys plus Enter to select a result. Selecting a result closes the dropdown immediately; Escape, Tab, or clicking outside the selector also closes the dropdown so it cannot block `Show Orbit`, `Show Footprint`, or other controls below it. After a satellite is selected, focusing, clicking, typing, pasting, or pressing `Clear` in the search field removes only the old selected label so a new search can start while the selected satellite remains active. Timeline controls are checkboxes: checked means the timeline is visible; unchecked means it is hidden. Only one timeline can be visible at a time. If Yaw-Pitch-Roll is enabled, selecting or switching satellites keeps the YPR sliders visible and preserves the current yaw, pitch, and roll values.

The Help section disclaimer is part of the application UI: OpenBEXI Earth Orbit is for visualization, educational, and experimental purposes only. It is not an authoritative source for navigation, safety, mission planning, collision avoidance, or operational satellite decisions.

The Help section opens Swagger and API documentation in separate pages using the best-known local server URLs. If the Python server is offline, start it and refresh the opened page. The README and Releases History actions fetch `README.md` and `PROMPT_History.md`, render safe Markdown inside the Help panel, and provide direct file links if Markdown cannot be loaded from the current launch mode. The Licenses action opens `LICENSE.md` as a Markdown page.

## Project Structure

- `index.html`: Main browser app and integration point for rendering, controls, selection, and animation.
- `display_satellite.html`: Isolated local OBJ/MTL and GLB viewer for direct satellite model visibility checks.
- `css/`: Styling for the app, menu, filters, labels, and map layout.
- `js/`: Browser modules for coordinates, satellite loading, models, menu, footprints, frames, day/night, Moon, timelines, and map rendering.
- `server.py`: Optional standard-library Python server for static hosting, API endpoints, CORS, Swagger/OpenAPI docs, and server-backed data loading.
- `js/startupPerformance.js`: Startup timing, deferred scheduling, and chunked-work helpers used to keep the first render responsive.
- `json/tle/`: TLE source data.
- `json/satellites/`: Satellite metadata and model configuration.
- `textures/`: Earth, Moon, satellite, and material textures.
- `icons/`: Satellite and UI icon assets.
- `obj/`: OBJ, MTL, and GLB satellite model assets.
- `tests/`: Node-based deterministic regression tests.
- `tools/`: Utility scripts.

## Markdown Files

- `README.md`: Project overview, setup, features, testing commands, and documentation index.
- `LICENSE.md`: Markdown copy of the MIT license used by the Help Licenses action.
- `PROMPT.md`: General execution prompt only; release-specific content belongs in prompt history.
- `PROMPT_History.md`: Release-specific prompts and implementation requirements by date and version; shown in Help as `Releases History`.
- `Test_and_Integration.md`: Authoritative automated, browser, manual, domain, visual, and regression acceptance checklist.

## Development Notes

- For each new release in `PROMPT_History.md`, update the visible `index.html` version tag to match the latest release version.
- Keep browser import maps synchronized: `three` and `three/addons/` must use the same verified Three.js version.
- Keep `PROMPT.md` limited to the `General Execution Prompt`; put all release history in `PROMPT_History.md`.
- Keep reusable coordinate, scale, orientation, and framing math in `js/sceneFrame.js` when practical so browser behavior and automated tests stay aligned.
- Keep `Test_and_Integration.md` current whenever features, controls, or accepted verification procedures change.
- Keep `README.md` current when setup, usage, test commands, features, architecture, or known limitations change.
- Avoid mixing generated assets, build outputs, or unrelated untracked files into feature changes.

## License

This project is licensed under the [MIT License](LICENSE.md). The plain-text `LICENSE` file remains for standard repository tooling.
