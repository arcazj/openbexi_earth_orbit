# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Install dependencies:**
```powershell
npm install
```

**Run tests:**
```powershell
npm test
```

**JavaScript syntax check (all browser modules):**
```powershell
Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }
```

**Python syntax checks:**
```powershell
py -m py_compile server.py
py -m py_compile tools/satellite_data_tools.py
```

**Serve locally (no API):**
```powershell
py -m http.server 8000 --bind 127.0.0.1
# open http://127.0.0.1:8000/index.html
```

**Optional Python API server:**
```powershell
py server.py --host 127.0.0.1 --port 8000
# with scheduled data refresh:
py server.py --host 127.0.0.1 --port 8000 --update-data-on-schedule
```

**Data maintenance (satellite TLE + decayed DB):**
```powershell
py tools/satellite_data_tools.py export-tle --dry-run
py tools/satellite_data_tools.py export-tle --all
py tools/satellite_data_tools.py build-decayed-db --all
py tools/satellite_data_tools.py build-decayed-db --refresh-satcat --force
```

**Startup performance diagnostics:**
Open `http://127.0.0.1:8000/index.html?perf=1`, then in the browser console:
```javascript
window.openbexiStartupPerformance.summary()
```

## Architecture

### Scene coordinate system

All 3D positions use an Earth-centered inertial (ECI) frame with Three.js Y/Z axes swapped:
```
scene = (ECI.x, ECI.z, ECI.y) × KM_TO_SCENE_UNITS
```
Earth mesh stays at `(0, 0, 0)` always. ECF geometry is rotated about scene Y by `-GMST`. All scale and frame math is centralized in `js/sceneFrame.js`; use it for any coordinate/orientation/framing work so browser modules and tests stay consistent.

Shared scale constants (e.g. `KM_TO_SCENE_UNITS`, `EARTH_SCENE_RADIUS`) live in `js/SatelliteConstantLoader.js`.

### Key JS modules

| Module | Role |
|---|---|
| `js/sceneFrame.js` | Coordinate transforms, GMST, WGS84, Web Mercator — canonical math |
| `js/SatelliteConstantLoader.js` | Shared scale/physics constants |
| `js/satelliteTLELoader.js` | TLE loading (server or local JSON fallback) |
| `js/SatelliteMenuLoader.js` | Left-menu accordion, satellite selector, filter UI |
| `js/satelliteModelResolver.js` | Satellite name → local OBJ/MTL or GLB mapping |
| `js/satelliteModelLoader.js` | Three.js model loading, centering, orientation, lighting |
| `js/mercatorMapLoader.js` | 2D Mercator canvas, ground tracks, footprints, day/night |
| `js/solarSystemOverviewLoader.js` | Integrated Solar System mode (planets, orbits, labels) |
| `js/solarSystemEphemeris.js` | JPL ephemeris interpolation from `data/ephemeris/` |
| `js/serverConnection.js` | Optional Python API server health check and data routing |
| `js/ganttTimelineLoader.js` / `js/reentryTimeline.js` | Launch and re-entry timelines |
| `js/startupPerformance.js` | Startup timing marks and deferred/chunked-work scheduler |
| `js/decayPredictor.js` | Decay estimates for active satellites |
| `js/shareState.js` | URL share serialization/restore |

### Entry points

- `index.html` — main app; starts animation loop before TLE sprite pass completes for fast first render
- `display_satellite.html` — isolated OBJ/MTL + GLB model viewer for asset validation
- `SolarSystemOverview.html` — standalone Solar System debug page
- `Earth_Stars_MilkyWay.html` — standalone star/Milky Way viewer
- `markdown_viewer.html` — static Markdown renderer used by Help links
- `swagger.html` — local Swagger/OpenAPI static page (no server needed)
- `server.py` — optional Python stdlib API server; also importable by `tools/satellite_data_tools.py`

### Runtime dependencies

- **Three.js `0.184.0`** via import map in `index.html`. Keep `three` and `three/addons/` on the exact same version — mismatches break addon loading silently.
- **satellite.js `6.0.2`** via CDN `<script>`. Returns TEME-like coordinates; the app treats them as ECI-like for visualization.
- No bundler; all JS is plain ES modules loaded directly by the browser.
- Never use `file://` — ES modules, JSON, and binary assets require HTTP.

### Data files

- `json/tle/TLE.json` — primary TLE dataset (source of truth for satellite list)
- `json/satellites/*.json` — satellite metadata and model configuration
- `json/decayed/decayed.json` — confirmed decayed satellite database
- `json/satcat.csv` — CelesTrak SATCAT source used by `build-decayed-db`
- `data/ephemeris/solar_system_jpl_horizons_2020_2035_6h.json` — local JPL-derived ephemeris (2020–2035, 6 h cadence)
- `obj/` — local GLB and OBJ/MTL satellite models

## Development rules

- Update the visible version tag in `index.html` to match the latest release in `PROMPT_History.md` for every release.
- `PROMPT_Instructions.md` contains only the general execution prompt; all release history goes in `PROMPT_History.md`.
- Add reusable coordinate/scale/orientation/framing math to `js/sceneFrame.js` rather than inline in modules.
- Keep `Test_and_Integration.md` current whenever features, controls, or verification procedures change. It is the authoritative acceptance checklist — all items must pass before a release is complete.
- `npm test` auto-discovers every `tests/*.test.js` file. Run it and the JS syntax check after any JS change.