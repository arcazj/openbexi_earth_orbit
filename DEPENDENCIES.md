# Dependency and SBOM Policy

## Reproducible Installation

Use `npm ci`, not `npm install`, for CI and release evidence. Runtime and development dependencies use exact versions in `package.json` and integrity hashes in `package-lock.json`. `node_modules/` is generated and must not be committed.

Supported tooling is declared in `package.json#engines`. CI currently exercises Node 22 and Python 3.12.

## Required Checks

```text
npm run audit:dependencies
npm run sbom -- --output openbexi-node-sbom.cdx.json
npm run check
npm run test:all
```

The audit covers both runtime and development dependencies. The release SBOM intentionally records shipped runtime dependencies only; build an additional toolchain SBOM when release policy requires CI tooling provenance. SBOMs are release artifacts, not source files. Archive them with the version record, commit SHA, validation report, and dependency audit result.

Dependabot proposes monthly npm and GitHub Actions updates. Updates must retain exact versions, pass local-first vendored dependency delivery in Chromium, and preserve Three.js core/addon version parity.

## Runtime Delivery

The source/server-capable browser bootstrap loads controlled vendored files first and uses pinned CDN URLs only as an explicit fallback. Three.js `0.184.0` core plus the directly and transitively imported addon subset is copied byte-for-byte into `vendor/three/0.184.0/`. satellite.js `6.0.2` is copied the same way into `vendor/satellite.js/6.0.2/` for both classic-page and ES-module Worker use. The bootstrap awaits the application module graph and exposes a retryable startup failure if it cannot load. The `dist/` builder enforces same-origin vendored runtime files and removes the mutable raw-GitHub fallback, so static deployment does not depend on unpkg, raw GitHub, or generated `node_modules` content.

`npm run vendor:browser` intentionally regenerates the browser files and manifests from the installed locked packages. `npm run check:vendor` works without `node_modules`, verifies each committed SHA-256 and the lockfile's npm integrity value, checks both ES-module APIs, and rejects runtime URLs that point back into `node_modules`. Each MIT license is shipped alongside its vendored files.

A future fully bundled build may still simplify delivery, and the current inline-script architecture cannot use a complete strict CSP without further changes. The current local-first vendored delivery is compatible with static hosting and a policy that blocks third-party dependency requests; the pinned CDN path is reserved for explicit source/development fallback.

`npm run build` consumes `release/static-artifact.json` and recreates the curated `dist/` deployment root. It includes only declared runtime/help/data assets and the files named by the two vendor manifests; the manifests themselves remain outside the public artifact. Publish `dist/` rather than the repository root. `npm run check:artifact` and the static artifact unit/browser tests enforce this boundary.
