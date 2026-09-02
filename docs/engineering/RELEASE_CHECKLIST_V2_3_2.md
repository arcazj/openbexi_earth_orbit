# Version 2.3.2 Development Release Checklist

Version `2.3.2` is a `development` build with Experimental scientific maturity and a non-operational safety class. It is not a release candidate or stable release. The exact Version 2.3.1 publication approval is historical and does not authorize Version 2.3.2 bytes.

## Release Identity

- [x] `release/version.json`, package metadata, feature flags, generated browser metadata, static API documentation, and the Version 2.3.2 SBOM identify `2.3.2` development with null candidate and release dates.
- [x] The existing experimental tracked-object and screening flags retain their maturity and safety boundaries.
- [x] Repository/data/release owner `arcazj` approved exactly one publication of the final post-recording Version 2.3.2 repository source, checked-in data, validation, release-evidence, governance, documentation, and workflow bytes to `origin/master`; the warned pre-approval manifest SHA-256 is `c456703d12602e83a73233f693cf684315565436d8c08c645a0b7e5d984d8177`.
- [ ] Manual GitHub Pages artifact deployment has a separate exact-byte decision and remote attestation. The source-only approval does not close this gate.

## Browser Workflow

- [x] The persistent coverage HUD reports matched, positioned, and position-unavailable counts plus scope, snapshot state, and available generation time without implying provider completeness.
- [x] The virtualized results drawer provides All matches, On map, and Position unavailable modes, sortable fields, keyboard navigation, focus restoration, and narrow-viewport behavior.
- [x] Globe and Mercator clicks select only a positioned marker within a bounded hit tolerance and reuse the normal tracked-object selection path.
- [x] Debris facets activate for exact object type `DEBRIS` across any nonempty orbit selection and round-trip through shared state.
- [x] The 120,000-record scale guard includes virtualized result ordering/window preparation with `resultsMs <= 3,000 ms` and raises the combined build/filter/search/facet/results ceiling only to `totalMs <= 16,000 ms`.
- [x] The reviewed browser source budget measures `index.html` at 314,194/315,000 bytes and modular first-party JavaScript at 904,188/915,000 bytes across 54 files; the measured increase includes the fail-closed catalog parser and cross-runtime record validation and is not a final runtime or static-artifact seal.
- [x] Metadata-only records remain details-only. No UI path supplies synthetic position, orbit, footprint, model, ground track, or screening state.
- [x] RCS remains provider-reported radar cross-section; no mass, weight, diameter, hazard, or risk inference is introduced.
- [x] The final browser matrix records the automated keyboard-only and accessibility checks in scope; this does not claim complete nonvisual alternatives for every canvas or historical timeline.

## Runtime Data Plane

- [x] Scheduled refreshes stage in a private revisioned candidate root and leave checked-in release data unchanged.
- [x] Required revision pairs and the complete tracked closure/current GP-SATCAT lineage validate before promotion.
- [x] Rejected, degraded, drifted, interrupted, cancelled, and pointer-write-failed candidates preserve the prior current pointer.
- [x] API and server-static data routes resolve through one registered coherent root, with the checked-in closure as fallback when no valid private pointer exists.
- [x] Candidate import, staging, and promotion critical sections share one persistent regular lock file and a nonblocking Windows/POSIX OS advisory lock; a live holder rejects contention, and no path unlinks or reclaims the file based on owner text or age.
- [x] Default `serve` rechecks the verified pointer before mutable data and `/api/v1` requests, commits a changed root only after V21 bootstrap/transactional activation, retains the prior coherent root on failure, retries on the next qualifying request, and supports A to B to A existing-revision activation.
- [x] A transient scheduler-path post-promotion V21 registration callback failure retains the promoted pointer, reports a degraded public data-update state with registration pending, and retries on the next scheduler pass even when no new candidate is promoted; manual/default coordinator errors are not published there.
- [x] Scheduler shutdown cooperatively cancels before publication and waits for its worker.
- [x] Exact-commit candidate `20260902T014734Z-9faea7cdb724` is pinned, no-network, `VALIDATED`, deliberately unpromoted, and not quarantined: raw revision `sha256:4fa944e1283feb2a8dd5a09e51c5d8c8fc332f4f96d0e119347afa994e1193f2`, 24 artifacts/131,613,453 bytes, zero source-copy mismatches, tracked revision `sha256:8fd7f619f16e714a9d170a8eb538a183e240051830430b09b1201bbf0d36e4a4`, 70,475 total/19,111 propagatable/12,488 current debris/2,640 positioned GP debris.
- [x] Dirty-runtime candidate `20260902T011924Z-8c8d999bf6df` is separately pinned, no-network, `QUARANTINED`, and unpromoted for malformed `json/tle/TLE.meta.json`: raw revision `sha256:e27ff6b5c34bdaa715f3924ea5cafa67fec6fd83ea0ddd7ff63340b80e08683c`, 24 artifacts/131,692,789 bytes, zero import-time copy mismatches, tracked revision `sha256:de60852484cc6ccee624380286080b993543ad6c412016710673ccd1b75f4cb7`, 70,532 total/19,106 propagatable/51,426 metadata-only/12,488 current debris/2,640 positioned GP debris.
- [x] The private pointer is absent, and the checked-in 12-file data/pointer closure remains restored from strict last-known-good `ef98cfe`.
- [x] The selected checked-in tracked baseline is revision `sha256:7c1a20d93d1eb5faf7e2b964b13c7b4f0478f2eec95cc701ea1b1e57ef0d730c`: 70,474 total, 16,470 propagatable, 54,004 metadata-only, 12,490 current debris, and zero positioned debris.
- [ ] Final retention, disk-pressure, restart, and long-running provider rehearsal evidence is recorded on representative hardware.

## Artifact-Only Deployment

- [x] The Pages workflow requires a manually confirmed `master` commit and uploads only verified `dist/` bytes.
- [x] Clean commit-tree verification, exact local artifact verification, SBOM generation, disposable rollback rehearsal, and post-deploy byte comparison are represented in scripts/tests.
- [x] Deterministic local rollback rehearsal and local exact-artifact verification passed against the final fixed-point `dist/`; rollback restored the GP-only fallback and then the checked-in tracked revision.
- [x] Final local reports are retained as `release/evidence/v2.3.2-static-rollback.json` and `release/evidence/v2.3.2-local-static-attestation.json` with the exact identifiers recorded under Final Evidence.
- [x] Authenticated GitHub API verification confirms Pages `build_type=workflow`; legacy branch-root publishing was disabled before the source push.
- [ ] Required reviewers, no-self-review enforcement, and administrator-bypass policy are configured and independently verified for the `github-pages` environment.
- [ ] The final workflow run archives commit-tree, artifact, rollback, SBOM, and post-deploy attestations and all attestations match the published commit.

## Final Evidence

- [x] JavaScript unit total: 63 of 63 test files passed.
- [x] Python total: 152 discovered in 83.452 seconds, with 151 passes, one intentional Windows directory-symlink capability skip, and zero failures.
- [x] Playwright clean HTML aggregate: `playwright-report/index.html` is 677,198 bytes with SHA-256 `893b507b3c29b511f190655643539e66b20c84dcb715723790ac1cdfe6394170`; 49 declarations across Chromium and Mobile Chromium in 6 spec files produced 29 passes, 20 explicit-reason intentional skips, zero unexpected results, zero flaky results, zero top-level errors, `ok=true`, and one attempt per declaration in exactly 595,996.319 ms (595.996319 seconds, 00:09:55.996319, 9.933271983333334 minutes). Project totals are Chromium 27 = 25 pass + 2 skip and Mobile Chromium 22 = 4 + 18; spec totals are conjunction 10 = 5 + 5, satellite filters 30 = 16 + 14, smoke 2 = 2 + 0, static deployment 2 = 2 + 0, timelines 4 = 3 + 1, and time simulation 1 = 1 + 0. The machine-readable aggregate is `release/evidence/v2.3.2-playwright-aggregate.json`.
- [x] Syntax and dependency audit: 147 JavaScript files passed syntax validation and the dependency audit reported zero vulnerabilities.
- [x] Release-engineering checks passed.
- [x] Reviewed browser source-budget measurements: recorded under Browser Workflow above.
- [x] Static artifact exact payload count, byte total, and manifest digest are recorded in `dist/asset-manifest.json`, `release/evidence/v2.3.2-release-metrics.json`, and the validation manifest rather than duplicated in this hashed checklist.
- [x] Final browser-source and tracked-closure measurements: `index.html` is 314,194/315,000 bytes, browser JavaScript is 904,188/915,000 bytes across 54 files, and the tracked closure is 13 files/74,565,511 bytes with a 24,215,754-byte largest chunk.
- [ ] Named browser performance profiles remain **pending** and are not replaced by source/static byte measurements.
- [x] Authoritative standalone 120,000-record observation: 57.56 ms build, 245.79 ms filter, 53.86 ms search, 288.86 ms facets, 330.68 ms results, 976.75 ms total, and 95.89 MiB heap growth.
- [x] Validation corpus inventory: 334 artifacts, 17 executable contracts, and 94 evidence records. Exact manifest bytes are bound by `validation/v2.3.2/manifest.sha256`; its digest is intentionally not embedded in this hashed checklist.
- [x] Checked-in tracked fallback revision and population counts: recorded under Runtime Data Plane above.
- [x] GP/SATCAT source revisions, the checked-in data-plane closure, and final local release evidence are exact-hash bound by the validation manifest and their dedicated sidecars/evidence records.
- [x] Final fixed-point rollback passed; exact bytes, digest, and timestamp are retained in `release/evidence/v2.3.2-static-rollback.json` and the validation manifest.
- [x] Final local static attestation records `localExact=true` and `remoteExact=false`; exact bytes, digest, and timestamp are retained in `release/evidence/v2.3.2-local-static-attestation.json` and the validation manifest.
- [ ] Remote deployment attestation remains **pending**; the local record's `remoteExact=false` does not close it.

Do not substitute Version 2.3.1 totals, hashes, approvals, or deployment evidence for any pending Version 2.3.2 field.

## Decision

Current decision: **implementation and local verification may continue; one exact final post-recording Version 2.3.2 source publication to `origin/master` is approved**. The authenticated GitHub Pages API was switched from legacy branch-root publishing to `workflow` before the push. Manual Pages deployment and remote attestation, required-reviewer/self-review environment settings, clean committed-tree binding, named-hardware profiles, candidate/stable promotion, provider completeness, independent scientific/security review, and operational use remain open.
