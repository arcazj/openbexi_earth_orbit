# Static deployment

`npm run build` creates `dist/` from `release/static-artifact.json`. The builder verifies GP/TLE/lifecycle pairs, the complete tracked closure and JPL guide metadata. It ships pinned browser vendors and required notices, excludes server tools/private storage, and writes `asset-manifest.json`.

Serve `dist/` over HTTP with correct JavaScript MIME types. Browser modules, workers, textures and data must share the artifact root. Do not serve the repository root as a public production site. Use [Pages deployment](PAGES_DEPLOYMENT.md) for the strict exact-commit workflow.

Static hosting cannot run provider updates, the Python API or durable jobs. The UI reports snapshot mode and polls only packaged revisions. Publish a complete coherent replacement to update data. An explicit API base opts into a separately configured server; do not imply live freshness from packaged bytes.

Help serves the README, release notes, API reference and licensing notices. The Satellite Model Viewer opens from `display_satellite.html` and reads the bundled model manifest, catalog files and shared meshes from the same artifact. Source-only documentation links in Help open the public repository. The roadmap and prompt history are available in the source checkout.

The **REST API** section below **Timelines** links to the packaged endpoint reference and machine-readable schema using deployment-relative paths. Its catalog search and model examples appear when the configured Python server advertises these resources. [Catalog and model contract](../catalog-api.openapi.json)

Verification: `npm run check`, full browser journeys, exact-commit build, `npm run rehearse:rollback`, then local/deployed-byte attestation for a deployment. Current browser profiles cover Chromium, Firefox, Playwright WebKit and mobile emulation; physical devices remain unqualified.

For startup problems, check the HTTP origin, WebGL 2 availability, hardware acceleration and the module and worker MIME types. A fresh browser profile can isolate a stale module graph. A strict CSP still requires extracting legacy inline scripts and styles. The 2.6.0 artifact was built and verified locally. Pages deployment follows its own manual workflow.
