# Version 2.3.2 Runtime and Deployment Rollback

This runbook supplements `ROLLBACK_V2_3.md`. It covers Version 2.3.2 coverage/results presentation, direct map selection, debris facets across orbit scopes, private revisioned data candidates, and artifact-only GitHub Pages deployment.

## Abort Triggers

Contain or roll back Version 2.3.2 when:

- matched/positioned/unavailable counts disagree with the selected catalog scope or imply that metadata-only objects are plotted;
- a Globe or Mercator click selects the wrong identity, selects through an occluded/ineligible state, or bypasses the normal selection boundary;
- the virtualized result set loses rows, focus, sort determinism, or availability classification;
- debris facets fail outside `ALL`, lose share-state round trips, contaminate non-debris filters, or infer mass/weight;
- a scheduled refresh mutates repository release data, exposes a partial candidate, promotes after cancellation, or serves mixed candidate generations;
- a Pages run uploads repository-root files, unverified bytes, or a commit other than the confirmed `master` SHA; or
- the remote deployment does not exactly match the recorded `dist/asset-manifest.json`.

## Immediate Containment

1. Disable scheduled updates or stop the local server. Preserve the active candidate pointer, candidate metadata, bounded status response, and private logs.
2. If tracked presentation or picking is unsafe, disable `experimental_tracked_object_catalog`, regenerate release metadata, rebuild, and verify the GP-only browser path.
3. Do not mutate the checked-in data closure to repair a private runtime candidate. Restore or select a previously validated private pointer.
4. Stop a Pages deployment before environment approval when any pre-deploy check fails. For an already published defect, prepare and review a complete revert on `master`, then dispatch the manual workflow with the exact resulting commit SHA. Do not publish a branch root or claim a direct archived-`dist` restore path.

## Runtime Candidate Recovery

1. Identify the last candidate whose recorded revision and artifact inventory pass complete validation.
2. Revalidate its GP/TLE/SATCAT/launch/decay revision pairs, tracked closure, raw-source hashes, and current GP/SATCAT lineage.
3. Atomically restore the pointer to that candidate. A failed pointer write must leave the prior pointer readable.
4. Restart the server after pointer restoration; this remains the recommended rollback procedure and produces the clearest operator boundary.
5. Confirm API and server-static data aliases return the same revision and that the durable catalog current revision matches it. A running default server can also detect the restored verified pointer on its next mutable data or `/api/v1` request, transactionally reactivate an existing A to B to A revision, and commit the root only after V21 activation succeeds. On request-time failure it retains the prior coherent root and retries the next qualifying request; that coordinator error is not published through `/api/data-update-status`.
6. When the scheduler performed the promotion or rollback, separately confirm `/api/data-update-status` has cleared any pending V21 registration callback error after a successful retry.

### Recorded Development Recovery

During Version 2.3.2 development, two pinned no-network imports preserved refresh evidence while the private pointer remained absent. Exact-commit candidate `20260902T014734Z-9faea7cdb724` is `VALIDATED` and deliberately unpromoted, not quarantined. Its raw revision `sha256:4fa944e1283feb2a8dd5a09e51c5d8c8fc332f4f96d0e119347afa994e1193f2` covers 24 artifacts/131,613,453 bytes with zero source-copy mismatches; tracked revision `sha256:8fd7f619f16e714a9d170a8eb538a183e240051830430b09b1201bbf0d36e4a4` reports 70,475 total, 19,111 propagatable, 12,488 current debris, and 2,640 positioned GP debris. The distinct dirty-runtime candidate `20260902T011924Z-8c8d999bf6df` is `QUARANTINED` for malformed `json/tle/TLE.meta.json`; raw revision `sha256:e27ff6b5c34bdaa715f3924ea5cafa67fec6fd83ea0ddd7ff63340b80e08683c` covers 24 artifacts/131,692,789 bytes with zero import-time copy mismatches, and tracked revision `sha256:de60852484cc6ccee624380286080b993543ad6c412016710673ccd1b75f4cb7` reports 70,532 total, 19,106 propagatable, 51,426 metadata-only, 12,488 current debris, and 2,640 positioned GP debris.

The checked-in 12-file data/pointer closure remains restored from strict last-known-good `ef98cfe`; selected tracked revision `sha256:7c1a20d93d1eb5faf7e2b964b13c7b4f0478f2eec95cc701ea1b1e57ef0d730c` reports 70,474 total, 16,470 propagatable, 54,004 metadata-only, 12,490 current debris, and zero positioned debris. Exact final static-artifact counts, bytes, and digest are recorded in `dist/asset-manifest.json` and `release/evidence/v2.3.2-release-metrics.json`. Exact rollback and local-attestation bytes, digests, and timestamps are retained in `release/evidence/v2.3.2-static-rollback.json`, `release/evidence/v2.3.2-local-static-attestation.json`, and the validation manifest. Local rollback passed after restoring the GP-only fallback and then the checked-in tracked revision; local attestation records `localExact=true` and `remoteExact=false`. This is development evidence, not Pages deployment approval or a Pages application rollback rehearsal. See `release/evidence/v2.3.2-data-candidate-recovery.json`.

## Pages Application Recovery

The Version 2.3.2 workflow does not retain or accept an older `dist/` artifact for direct redeployment. Its one-day `github-pages` artifact is run transport only, and the workflow deliberately accepts only the exact commit currently at `master`. The disposable rollback rehearsal validates tracked/GP fallback behavior; it does not exercise a Pages application rollback.

1. Identify the complete last-known-good source and data state, then create a rollback branch from current `master`.
2. Prepare a Git revert that restores that state as a new commit. Review and test the complete revert; do not force-push `master`, mix files from releases, or dispatch a historical commit.
3. Obtain the required code, data, release, and publication approval for the revert bytes, then merge through the protected `master` path.
4. Record the resulting full commit SHA at `master` and dispatch **Deploy verified GitHub Pages artifact** with that exact SHA.
5. Require commit-tree verification, commit-snapshot build validation, exact local artifact verification, uploaded `artifact.tar` round-trip verification and digest attestation, protected environment review, and remote byte attestation to pass.
6. Record the restored deployment URL, revert commit, tree ID, manifest hash, uploaded archive hash, file/byte totals, operator, reviewer, and elapsed recovery time.

## Re-enable Criteria

Re-enable the affected feature, scheduler, or deployment only after a deterministic regression test reproduces the defect, the complete local checks pass, the rollback rehearsal succeeds, the final artifact is checksum-bound, and any changed public bytes receive a new explicit release/data-owner decision. This procedure does not promote scientific maturity or authorize operational use.
