# Release checklist

**2.6.0 uses the development prerelease channel.** The release contains the exact-commit verification record and archive checksums. [2.6.0 release](https://github.com/arcazj/openbexi_earth_orbit/releases/tag/v2.6.0) · [2.6.0 checks](../../release/evidence/v2.6.0-development-checks.json) · [Runtime SBOM](../../release/evidence/openbexi-node-sbom-2.6.0-development.cdx.json) · [Previous publication](../../release/publication-v2.5.1.json)

1. Verify version/feature metadata, final license/contact, retained upstream notices and concise current docs. Keep frozen corpus bytes unchanged.
2. Review the changes since the previous public release for credentials, private agreements, internal prompts and unintended runtime data.
3. Run `npm run check`, the JavaScript, Python and browser suites, the dependency audit and release tests. Record failures, retries and profile or privilege skips.
4. When the release commit exists, run `npm run check:release-tree -- --tree HEAD --require-clean`. Build from that exact commit using the strict release builder, verify asset hashes and notices, and rehearse static rollback. Check the Windows, Linux and browser CI results for the same commit.
5. At publication, use the authorized source ref, verified commit and a new version tag. Include results and known limits with the release.
6. Read back master, tag, release, visibility and CI. Delete only branches whose work is merged or safely retained in a verified backup. Keep unmerged dependency PR branches.

Current limitations: software-rendered startup/frame targets fail; physical GPU/Safari/iOS, interactive Windows keyboard, full accessibility, independent scientific/security approval and comprehensive legacy asset provenance remain open. Passing release automation does not remove these limits.

Pages deployment follows a separate [manual workflow](PAGES_DEPLOYMENT.md). Scientific maturity is recorded in the version metadata.
