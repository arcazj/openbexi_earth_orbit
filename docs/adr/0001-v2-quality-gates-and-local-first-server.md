# ADR 0001: v2.0 Quality Gates and Local-First Server

- Status: Accepted
- Date: 2026-07-19
- Owners: Project maintainers

## Context

The application can run as a static site or through a standard-library Python server. The prior workflow documented many manual checks but did not enforce them in CI, and the server could expose the repository root when bound outside localhost.

## Decision

1. `release/version.json` is the source of truth for the application version, release channel, candidate/release publication state and date, scientific maturity, and safety class. Browser metadata is generated with `npm run version:sync`, package metadata is checked against it, and the Python server reads it directly. Version 2.0 completes the earlier `1.7.6` runtime migration without promoting scientific maturity beyond `Experimental`.
2. Locked Node installation, JavaScript checks, Python integration tests, dependency audit, SBOM generation, and a real Chromium smoke test are required CI gates.
3. The Python server remains local-first. Non-loopback binding requires explicit `--allow-public`; cross-origin access is loopback-only unless an origin is configured.
4. Static serving uses an allowlist and blocks repository metadata, source tooling, tests, generated backups, traversal, symlink escape, and directory listings.
5. Maturity and safety claims are governed independently. No release is operationally certified by reaching a software version or test-coverage threshold.

## Consequences

- Clean-clone setup requires `npm ci`; partial checked-in `node_modules` content is removed from version control.
- Public deployments need a reviewed reverse proxy, TLS, explicit CORS, immutable artifacts, and the release checklist.
- A strict CSP is deferred because current pages contain inline scripts and styles. The v2 architecture should remove that constraint before public deployment.
- Browser smoke coverage is intentionally small; feature-specific and scientific validation suites remain separate gates.
- `npm run check:version` fails when package, lockfile, generated browser metadata, server wiring, static API documentation, or the feature-flag registry drifts from the authoritative release record.
