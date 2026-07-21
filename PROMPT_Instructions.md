# General Execution Prompt

This file contains the general execution prompt and project-compatible execution rules for OpenBEXI Earth Orbit. Dated release-specific prompt records belong in `PROMPT_History.md`; a named accepted standalone prompt may remain separate when it is indexed and clearly marked with its execution status.

## Project Overview

OpenBEXI Earth Orbit is a browser-based satellite visualization application built with plain HTML, CSS, ES modules, Three.js, and satellite.js, plus an optional Python standard-library API server. There is no JavaScript bundler. Source files can be served directly over HTTP, while `npm run build` creates the curated, deterministic `dist/` static artifact.

Source/server startup prefers the exact integrity-checked browser dependencies under `vendor/` and permits exact-version CDN URLs only as an explicit fallback. The generated static artifact is packaged-only and must not execute remote runtime code.

## Execution Rules

### Before Starting Any Task

- Inspect the working tree and preserve unrelated user changes.
- Read `release/version.json`, `RELEASE_NOTES.md`, `ROADMAP.md`, and `docs/engineering/RELEASE_CHECKLIST.md` for current release scope and gates.
- Use `PROMPT_History.md` for historical requirements and `Test_and_Integration.md` for the regression record through Version 1.7.6.
- Install the locked dependency graph with `npm ci` when setup is required.
- Run `npm run check` and the applicable part of `npm test` before changing behavior when the environment permits.

### Code Changes

- Keep reusable coordinate, scale, orientation, and framing math in `js/sceneFrame.js`; do not duplicate it in rendering modules.
- Keep shared scale and physics constants in `js/SatelliteConstantLoader.js`.
- Keep orbital calculations independent from Three.js rendering, camera state, sprite visibility, and scene-unit scaling.
- Use the versioned contracts under `js/domain/` at orbital-data and screening boundaries. Keep units, UTC timestamps, reference frames, provenance, maturity, and nullability explicit.
- Never derive conjunctions from rendered paths, sprite geometry, or scene-space distances. Collision probability must remain unavailable unless valid covariance, hard-body inputs, a documented method, and appropriate validation exist.
- Do not mix generated data files, build outputs, or unrelated untracked files into a change unless they are required evidence or artifacts for that task.
- Never use `file://` for development or testing. Serve source or `dist/` over HTTP.
- Keep Three.js core and addons on the same exact version. Update dependency locks, vendored files, integrity manifests, licenses, and documentation together.
- Keep source/server fallback behavior distinct from the packaged static boundary: `dist/` must use only files present in the artifact.
- Preserve the visible `Experimental` and non-operational limitations of conjunction screening until their documented promotion gates pass.

### Version Change Procedure

When a release version or publication state changes:

1. Edit the authoritative metadata in `release/version.json`.
2. Run `npm run version:sync` to update supported runtime and documentation copies.
3. Update `RELEASE_NOTES.md`, `README.md`, `ROADMAP.md`, `PROMPT_History.md`, the release checklist, API examples, and evidence where the change is relevant.
4. Run `npm run check:version` and review the diff for version or maturity drift.
5. Run `npm run check` and `npm test` before promotion.
6. Rebuild and archive the static manifest, validation evidence, dependency audit, and SBOM when required by the release checklist.

Do not treat `PROMPT_History.md` as a runtime version source, and do not hand-edit synchronized version copies as a substitute for `npm run version:sync`.

### After Making Changes

- Run `npm run check` for JavaScript syntax, Python compilation, version policy, vendor integrity, static artifact, validation-manifest, and asset-budget checks.
- Run `npm test`, or document any intentionally omitted suite and the remaining risk.
- Run `npm run audit:dependencies` after dependency or supply-chain changes.
- Exercise affected browser workflows over HTTP. Startup, WebGL, Worker, responsive-layout, accessibility, and static-deployment changes require their applicable Playwright journeys.
- Confirm the canvas is nonblank and inspect page errors, console errors, failed requests, and unintended external requests after startup or rendering changes.
- Update retained evidence and leave external, independent-review, deployment, and operational gates unchecked unless they were actually completed.

### Commit Message Format

```text
Release Date: YYYY-MM-DD Version X.Y.Z - <short description>

<body describing what changed and why>
```

### Documentation Rules

- `PROMPT_Instructions.md`: general execution prompt and project rules only; no release history.
- `PROMPT_History.md`: dated release-specific prompts and implementation requirements by version.
- `PROMPT_IMPLEMENT_ROADMAP_V2.md`: archived accepted standalone v2.0 execution prompt; its status banner must prevent accidental authorization of later releases.
- `README.md`: current setup, usage, commands, features, architecture, limitations, and an index of every root Markdown file.
- `RELEASE_NOTES.md`: concise user-facing candidate and release history.
- `ROADMAP.md`: approved scope, sequencing, status, risks, and acceptance criteria.
- `docs/engineering/RELEASE_CHECKLIST.md`: authoritative current v2.0 promotion gates.
- `release/evidence/`: retained evidence bound to the source, dependencies, data, and artifact under review.
- `Test_and_Integration.md`: historical regression/manual record through Version 1.7.6 plus a pointer to current v2.0 gates; it is not the v2.0 release authority.
- `CLAUDE.md`: repository commands, architecture, dependency delivery, and development rules; update it whenever those conventions change.
