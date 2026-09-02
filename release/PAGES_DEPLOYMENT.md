# GitHub Pages deployment

Production publishing is intentionally manual. Run **Deploy verified GitHub Pages artifact** from the `master` branch and enter the full commit SHA shown by GitHub. The workflow resolves that value to a commit object, requires it to equal both the dispatch SHA and checked-out `master` SHA, records the resolved object ID, and uses that immutable ID for every later source verification, release build, attestation, evidence name, and verifier checkout. No post-confirmation release operation uses movable `HEAD`.

Dependency installation, tests, browser execution, audit, and SBOM generation run only in the validation job. The deployment build then starts in a separate job with a fresh checkout of the confirmed object ID; its first command invokes the stdlib-only strict builder, before any dependency installation, repository test, lifecycle script, or evidence download can mutate its executable. That builder derives its manifest, release metadata, vendor manifests, recursive trees, tracked closure, and semantic validation inputs from regular blobs in the commit. It materializes those blobs into an isolated temporary source snapshot before creating `dist`, so ignored files and worktree races cannot enter the artifact. After `actions/upload-pages-artifact` creates the immutable `github-pages` artifact, a separate job downloads it by artifact ID, parses and extracts `artifact.tar`, rejects links, unsafe paths, missing files, byte drift, and extras, and compares the complete result to `asset-manifest.json`. Deployment depends on that verification. The tar SHA-256 and verification record are preserved, and signing-only jobs attest the asset manifest, uploaded tar, verification record, and post-deploy evidence.

Configure the repository Pages source as **GitHub Actions**. Protect the `github-pages` environment with required reviewers, prevent self-review, restrict deployment branches to `master`, and keep administrator bypass disabled. These repository settings are required because environment protection rules cannot be declared in workflow YAML.

Each run preserves the commit-tree report, pre-deploy artifact attestation, rollback rehearsal, SBOM, uploaded-archive verification, archive digest, and post-deploy byte attestation as workflow artifacts and signed attestations. A failed upload-archive or post-deploy comparison fails the workflow; inspect the named path before retrying.

All external actions are pinned to immutable release commits. Dependabot checks npm and GitHub Actions weekly; its grouped action updates must retain the full commit pin and exact release-version comment.

The rollback rehearsal is disposable and does not modify Pages. It proves that a corrupt tracked candidate fails readiness and tracked access closed, that a GP-only slot remains ready with tracked loading disabled, and that restoring the prior tracked slot recovers its revision, cache policy, conditional ETag, and health state. It is not a Pages application rollback rehearsal.

## Pages rollback

This workflow has no supported archived-`dist` redeployment path. The one-day `github-pages` artifact is transport for its originating run, not a retained rollback release. To reverse an already deployed application defect:

1. Create a rollback branch from current `master` and prepare a reviewed Git revert that restores the complete last-known-good source/data state. Do not rewrite `master` or assemble files from separate releases.
2. Run the normal checks and obtain the required code, data, and release approval for the revert bytes.
3. Merge the revert through the protected `master` path and record the resulting full commit SHA now at `master`.
4. Dispatch **Deploy verified GitHub Pages artifact** from `master` with that exact revert commit SHA. A historical commit that is not current `master` is deliberately rejected.
5. Complete the protected `github-pages` environment review and require the uploaded-archive and remote byte attestations to pass.

This procedure creates and verifies a new deployment from a reviewed commit. Until a separate retained-artifact workflow is implemented and tested, operators must not claim that an older archived Pages artifact can be redeployed directly.
