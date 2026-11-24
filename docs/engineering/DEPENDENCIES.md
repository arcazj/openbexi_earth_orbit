# Dependency and SBOM Policy

## Reproducible Installation

Use `npm ci`, not `npm install`, for CI and release evidence. Runtime and development dependencies use exact versions in `package.json` and integrity hashes in `package-lock.json`. `node_modules/` is generated and must not be committed.

Supported tooling is declared in `package.json#engines`. CI currently exercises Node 22 and Python 3.12.

CI sets `OPENBEXI_PYTHON_COMMAND=python` and verifies the selected interpreter version after setup, so a system-wide Windows launcher cannot override the configured Python. For a local explicit interpreter, set the same variable to its executable path.

## Required Checks

```text
npm run audit:dependencies
npm run sbom -- --output release/evidence/openbexi-node-sbom-2.6.0-development.cdx.json
npm run check
npm run test:all
```

The November 24 audit of locked runtime and development dependencies reported zero findings. The 2.6.0 CycloneDX inventory identifies the two runtime packages, Three.js 0.187.0 and satellite.js 7.1.0. The GitHub release verification records the commit, archive hashes and rollback result. [Release SBOM](../../release/evidence/openbexi-node-sbom-2.6.0.cdx.json) · [Release verification](https://github.com/arcazj/openbexi_earth_orbit/releases/tag/2.6.0)

Dependabot proposes weekly npm and GitHub Actions updates. Updates must retain exact npm versions and immutable GitHub Action commit pins, pass local-first vendored dependency delivery in Chromium, and preserve Three.js core/addon version parity.

## Runtime Delivery

The source/server-capable browser bootstrap loads controlled vendored files first and uses pinned CDN URLs only as an explicit fallback. Three.js `0.187.0` core plus the directly and transitively imported addon subset is copied byte-for-byte into `vendor/three/0.187.0/`. The pinned esbuild development dependency bundles the satellite.js 7.1.0 JavaScript propagation, time and coordinate modules into one ESM file. The page and conjunction Worker load that same file from `vendor/satellite.js/7.1.0/`. The bootstrap awaits the application module graph and exposes a retryable startup failure if it cannot load. The `dist/` builder enforces same-origin vendored runtime files and removes the mutable raw-GitHub fallback, so static deployment does not depend on unpkg, raw GitHub, or generated `node_modules` content.

`npm run vendor:browser` intentionally regenerates the browser files and manifests from the installed locked packages. `npm run check:vendor` works without `node_modules`, verifies each committed SHA-256 and the lockfile's npm integrity value, rebuilds the satellite.js bundle for a byte comparison when the locked dependencies are installed, checks both ES-module APIs, and rejects runtime URLs that point back into `node_modules`. Each MIT license is shipped alongside its vendored files.

A future fully bundled build may still simplify delivery, and the current inline-script architecture cannot use a complete strict CSP without further changes. The current local-first vendored delivery is compatible with static hosting and a policy that blocks third-party dependency requests; the pinned CDN path is reserved for explicit source/development fallback.

`npm run build` consumes `release/static-artifact.json` and recreates the curated `dist/` deployment root. It includes only declared runtime/help/data assets and the files named by the two vendor manifests; the manifests themselves remain outside the public artifact. Publish `dist/` rather than the repository root. `npm run check:artifact` and the static artifact unit/browser tests enforce this boundary. The manual Pages workflow verifies a confirmed clean commit, uploads only that exact artifact, and attests remote bytes against `dist/asset-manifest.json`; these controls do not themselves grant publication approval.
