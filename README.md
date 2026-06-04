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
- Accordion-style menu sections for Filters, Satellite Selection, View, Timelines, Other Selections, and Settings, preserving the legacy colored section accents.
- Searchable satellite selector with typeahead support for satellite name, NORAD ID, orbit type, and company/tag; selected results close cleanly after mouse, keyboard, Escape, Tab, or outside-click interactions.
- Filter reset, active-filter summary, and zero-result empty states.
- Selected-satellite details, orbit path display, footprint display, LVLH orbit frame, and yaw/pitch/roll controls.
- Local detailed model loading for selected satellites using OBJ/MTL and GLB assets under `obj/`.
- Selected-satellite observer framing in 3D: selecting a satellite smoothly moves the camera to a close observer view with Earth centered behind the satellite.
- Selected detailed models use a close 100 m observer target where practical, with a documented visual fallback when model scale or clipping would otherwise make the model unreadable.
- Nadir-oriented detailed satellite models: the selected model treats local `+Z` as the Earth-facing axis and points it toward Earth's center before applying yaw/pitch/roll bias.
- 2D/Mercator selected-satellite UX: selection is highlighted with a clear marker ring instead of applying 3D-only camera-distance behavior.
- Mercator selected-satellite state uses the selected NORAD ID, so ground tracks and marker rings still render when a detailed 3D model hides the selected sprite.
- High-definition Earth texture toggle, ECEF axes, Moon view, launch timeline, and re-entry timeline.
- Timeline checkboxes are mutually exclusive: enabling the launch timeline hides the re-entry timeline, and enabling the re-entry timeline hides the launch timeline.
- Faster initial startup path: the globe and core controls render before the full TLE sprite pass, while timelines and decay estimates are prepared as deferred work.
- Optional startup timing diagnostics through `?perf=1` or `localStorage.openbexiStartupPerf = "1"`.

## Orbit and Ground-Track Notes

The app uses `satellite.js@6.0.2` for TLE propagation. Some TLEs can return invalid propagated samples, especially for decayed or unstable objects. Orbit and Mercator rendering reject non-finite positions and below-Earth samples before drawing. When invalid samples occur in the middle of a path, the app splits the line instead of connecting through Earth or across an invalid Mercator segment.

The 3D selected-orbit line uses normal depth testing plus camera-aware Earth occlusion splitting so Earth hides portions of the orbit that are behind the globe. GEO orbit fixes should not change the physical propagated orbit radius unless tests prove the propagation radius is wrong.

GEO Mercator ground tracks can be nearly stationary. When the generated GEO ground track collapses below visible inset size, the Mercator renderer draws a short visible fallback segment around the sub-satellite point so `Show Orbit` does not appear blank.

## Selected-Satellite View Notes

Version 1.4.2 targets an apparent real-world observer distance of 100 meters from the selected detailed satellite model. The exact real-world distance is converted to scene units through `KM_TO_SCENE_UNITS`.

Because the app uses visual scaling for readability, the implementation applies a minimum visual fallback distance when the literal 100-meter scene distance would clip the camera or make the satellite unreadable. For detailed models, the selected view temporarily reduces the camera near plane so the model can be framed close instead of being forced hundreds of kilometers away by default clipping settings. The selected satellite remains in the foreground, and the camera is placed outward from Earth through the satellite so Earth appears behind it.

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
- Python 3 or another local static HTTP server for browser smoke testing.

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

The left menu is organized into compact colored accordion sections. Multiple sections can stay open at the same time; expanding one section does not collapse any other section. `Filters` and `Satellite Selection` always start expanded when `index.html` loads. Expanded headers use dark high-contrast text on the light metallic background for readability, and the live satellite count in the Filters header is red and bold.

- `Filters`: orbit, tag, debris filters, active summary, and reset action.
- `Satellite Selection`: searchable satellite selector, selected-satellite status, orbit/footprint/YPR controls, and satellite metadata.
- `View`: globe, Mercator, high-definition texture, ECEF axes, and day/night controls.
- `Timelines`: checkbox toggles for launch and re-entry timelines.
- `Other Selections`: Earth/Moon context selection.
- `Settings`: simulation and diagnostic notes.

The satellite selector is searchable. Type part of a satellite name, NORAD ID, orbit type, or tag, then use the mouse or keyboard arrow keys plus Enter to select a result. Selecting a result closes the dropdown immediately; Escape, Tab, or clicking outside the selector also closes the dropdown so it cannot block `Show Orbit`, `Show Footprint`, or other controls below it. Timeline controls are checkboxes: checked means the timeline is visible; unchecked means it is hidden. Only one timeline can be visible at a time. If Yaw-Pitch-Roll is enabled, selecting or switching satellites keeps the YPR sliders visible and preserves the current yaw, pitch, and roll values.

## Project Structure

- `index.html`: Main browser app and integration point for rendering, controls, selection, and animation.
- `display_satellite.html`: Isolated local OBJ/MTL and GLB viewer for direct satellite model visibility checks.
- `css/`: Styling for the app, menu, filters, labels, and map layout.
- `js/`: Browser modules for coordinates, satellite loading, models, menu, footprints, frames, day/night, Moon, timelines, and map rendering.
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
- `PROMPT.md`: General execution prompt only; release-specific content belongs in prompt history.
- `PROMPT_History.md`: Release-specific prompts and implementation requirements by date and version.
- `PROMPT4beamFormingSimulator3DWithMercatorMap_V2.MD`: Expert RF/beamforming prompt and roadmap for the separate `beamFormingSimulator3DWithMercatorMap_V2.html` simulator.
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

This project is licensed under the [MIT License](LICENSE).
