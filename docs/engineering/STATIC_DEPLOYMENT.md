# Static deployment

`npm run build` creates `dist/` from `release/static-artifact.json`. The builder verifies GP/TLE/lifecycle pairs, the complete tracked closure and JPL guide metadata. It ships pinned browser vendors and required notices, excludes server tools/private storage, and writes `asset-manifest.json`.

Serve `dist/` over HTTP with correct JavaScript MIME types. Browser modules, workers, textures and data must share the artifact root. Do not serve the repository root as a public production site. Use [Pages deployment](PAGES_DEPLOYMENT.md) for the strict exact-commit workflow.

Static hosting cannot run provider updates, the Python API or durable jobs. The UI reports snapshot mode and polls only packaged revisions. Publish a complete coherent replacement to update data. An explicit API base opts into a separately configured server; do not imply live freshness from packaged bytes.

Help serves README, release notes, API reference and licensing notices. Source-only documentation links open the public repository. Root prompt history, roadmap and private artifacts are not packaged.

Verification: `npm run check`, full browser journeys, exact-commit build, `npm run rehearse:rollback`, then local/deployed-byte attestation for a deployment. Current browser profiles cover Chromium, Firefox, Playwright WebKit and mobile emulation; physical devices remain unqualified.

Troubleshooting: use HTTP rather than file URLs; check WebGL 2 and hardware acceleration; check module/worker MIME types and network failures; retry a fresh profile when a stale module graph is cached. A strict CSP still requires extracting legacy inline scripts/styles. No Pages deployment is part of the v2.5 GitHub publication.
