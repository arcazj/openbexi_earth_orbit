# v2.0 Release Checklist

This checklist remains the independent v2.0 preview promotion gate. Authorization and implementation of later development versions did not mark any unchecked v2.0 item complete. Version 2.1 and Version 2.2 evidence are tracked separately in their dedicated checklists.

## Evidence

- [x] The retained v2.0 candidate evidence and release history identify its preview/Experimental/non-operational state. `release/version.json` has since advanced to Version 2.2 development and does not represent a v2.0 promotion.
- [x] Package, browser, server, API-documentation, and feature-flag drift is enforced by `npm run check:version`.
- [x] Scope, known limitations, assumptions, and unsupported uses are published in `docs/science/EXPERIMENTAL_CONJUNCTION_SCREENING_V2.md`.
- [ ] CI passes from a clean clone using only locked dependencies.
- [ ] Machine-readable unit, Python API/security, browser, accessibility, and scientific validation reports are archived and bound to the exact source, lockfile, catalog, and artifact hashes. `release/evidence/v2.0-local-verification.md` is a local narrative summary only.
- [x] Validation corpus version, source package checksum, fixture checksums, expected values, and tolerances are recorded in `validation/v2.0.0/manifest.json`.
- [ ] An independent reviewer approves the validation corpus and scientific evidence.
- [ ] Performance budgets pass on the named reference profiles.
- [x] `npm run audit:dependencies` passes locally and the CycloneDX SBOM is archived under `release/evidence/`.
- [ ] Data and visual assets have source, license, attribution, and redistribution records.
- [x] Domain request/result/data schemas and v2.0 compatibility boundaries are versioned and documented.
- [x] Exact browser dependencies are vendored with integrity manifests, and the curated static artifact has deterministic checksum and negative-exposure tests.
- [x] Local browser startup prefers vendored dependencies, makes zero routine CDN requests, and shows a tested retry state when the module graph fails.

Current gate state: **local v2.0 preview verification retained; external and human promotion gates open**. Separate human authorizations allowed Version 2.1 and the scoped Version 2.2 development work without marking these v2.0 items complete. Checked local artifacts do not prove clean external CI, `Validated` maturity, public/stable promotion, or operational use. Unchecked evidence remains release-blocking unless a named owner records a waiver.

## Security and Deployment

- [x] The local server and generated static artifact enforce explicit runtime allowlists with negative-exposure regression tests.
- [ ] The threat model and allowlists receive independent security review for the target deployment.
- [ ] Public hosting uses an immutable artifact, TLS, explicit CORS, security headers, and no repository metadata.
- [ ] Secrets scan is clean and deployment credentials are external.
- [ ] Health/readiness reports data age and last-known-good state without leaking internal errors.
- [ ] Monitoring, ownership, and incident contacts are active.

## Rollout and Rollback

- [ ] Previous application and data artifacts remain available by checksum.
- [ ] Migration is backward compatible or has a rehearsed downgrade procedure.
- [ ] Canary scope, observation window, abort thresholds, and decision owner are recorded.
- [ ] Rollback procedure in `ROLLBACK.md` has been rehearsed in the target environment.
- [ ] Post-release verification and review dates are scheduled.
