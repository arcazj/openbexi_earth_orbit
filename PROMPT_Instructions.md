# General Execution Prompt

This file contains the general execution prompt and project-compatible execution rules for OpenBEXI Earth Orbit. Release-specific prompts and implementation requirements belong in `PROMPT_History.md`, not here.

## Project Overview

OpenBEXI Earth Orbit is a browser-based satellite visualization app using plain HTML, CSS, ES modules, Three.js, and satellite.js. There is no build step and no bundler. All browser code is served directly over HTTP.

## Execution Rules

### Before Starting Any Task

- Read `PROMPT_History.md` to understand the latest release and any open requirements.
- Read `Test_and_Integration.md` to understand the acceptance criteria for the current release.
- Run `npm test` to confirm all tests pass before making changes.
- Run JavaScript syntax checks: `Get-ChildItem -File .\js -Filter *.js | ForEach-Object { node --check $_.FullName }`

### Code Changes

- Keep all reusable coordinate, scale, orientation, and framing math in `js/sceneFrame.js`. Do not duplicate this logic in other modules.
- Keep shared scale and physics constants in `js/SatelliteConstantLoader.js`.
- Do not mix generated data files, build outputs, or unrelated untracked files into feature changes.
- Never use `file://` URLs for development or testing. Always serve over HTTP.
- Keep Three.js `three` and `three/addons/` import map entries on the same version in every HTML file. Mismatched versions break addon loading silently.
- Earth must stay at `(0, 0, 0)` in scene coordinates. Pan is disabled. Do not move Earth to follow any selection.

### Version Bump Procedure

When a new release version is assigned, update all of the following in a single commit:

1. `index.html` — `const versionNumber = "X.Y.Z";`
2. `js/serverConnection.js` — `export const APP_VERSION = 'X.Y.Z';`
3. `js/SatelliteMenuLoader.js` — hardcoded version in the status panel HTML
4. `server.py` — `APP_VERSION = "X.Y.Z"`
5. `swagger.html` — version badge and all JSON version fields
6. `SWAGGER.md` — example response version fields
7. `README.md` — add a Version X.Y.Z feature paragraph in the Features section
8. `Test_and_Integration.md` — add a Version X.Y.Z paragraph in the preamble, update the `/api/version` test assertion, update the menu version confirm line, add a Release X.Y.Z Verification Log, and extend the Coverage Traceability Audit
9. `PROMPT_History.md` — add a Release Date / Version X.Y.Z entry at the top
10. Test files — update any hardcoded version assertions in `tests/releaseStructure.test.js`, `tests/menuUx.test.js`, `tests/serverApiStructure.test.js`, and `tests/serverConnection.test.js`

### After Making Changes

- Run `npm test` and confirm all tests pass.
- Run JavaScript syntax checks for all modules in `js/`.
- Run Python syntax checks: `py -m py_compile server.py` and `py -m py_compile tools/satellite_data_tools.py`
- Follow the browser and manual regression checklist in `Test_and_Integration.md` before considering a release complete.

### Commit Message Format

```
Release Date: YYYY-MM-DD Version X.Y.Z - <short description>

<body describing what changed and why>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

### Documentation Rules

- `PROMPT_Instructions.md` — general execution prompt and project rules only. No release history.
- `PROMPT_History.md` — release-specific prompts and implementation requirements by date and version.
- `README.md` — keep current whenever setup, usage, test commands, features, architecture, or known limitations change. Every `.md` file at the repository root must be listed in the Markdown Files index.
- `Test_and_Integration.md` — keep current whenever features, controls, or accepted verification procedures change. It is the authoritative acceptance checklist.
- `CLAUDE.md` — Claude Code guidance: commands, architecture, and development rules. Update when tooling or architecture conventions change.
