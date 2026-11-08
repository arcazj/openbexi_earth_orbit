# GitHub Pages deployment

The v2.5 publication authorizes GitHub source and a development prerelease only. Pages deployment remains manual and separate. Publishing a tag or release does not run this workflow.

## Exact-commit workflow

Dispatch **Deploy verified GitHub Pages artifact** from master with its full commit SHA. The workflow resolves that immutable commit, verifies it matches the dispatch and checkout, and uses it throughout verification, build and evidence.

Validation installs locked dependencies, runs tests, audit and SBOM. A separate deployment-build job starts from a fresh checkout and uses the standard-library strict builder before dependency lifecycle/test code can modify inputs. Only the curated artifact is uploaded.

An unsigned verification job downloads the exact uploaded artifact, rejects unsafe paths/links/extras, and verifies the full asset manifest and tar digest. Signing/deployment jobs retain attestations and verify deployed bytes. Environment required reviewers, self-review prevention and bypass controls are repository settings; workflow YAML alone cannot establish them.

Record commit/tree, manifest hash, uploaded tar hash, file/byte counts, approvals, workflow URL, deployed URL and remote attestation. A green job is technical evidence, not independent scientific or commercial-asset qualification.

## Recovery

The workflow has no direct archived-dist restore path and accepts only current master. Prepare/test a revert as a new master commit, obtain deployment authorization, dispatch that exact SHA and repeat the full verification. See [rollback](ROLLBACK.md) and `release/pages-deployment.json`.
