# Release checklist

Current target: **2.5.1 development prerelease**, experimental and non-operational. Public source/commercial model is owner-authorized in [the publication record](../../release/publication-v2.5.1.json). Qualification and deployment remain distinct.

1. Verify version/feature metadata, final license/contact, retained upstream notices and concise current docs. Keep frozen corpus bytes unchanged.
2. Inspect every incoming commit for credentials, private agreements, internal prompts and unintended runtime data. Build the public history from v2.4; never push the private review branch or bundle.
3. Run `npm run check`, JavaScript/Python/browser suites, dependency audit and release tests. Record failures and profile/privilege skips honestly. Wait for final Windows/Linux and browser CI.
4. Commit the final tree and run `npm run check:release-tree -- --tree HEAD --require-clean`. Build from that exact commit using the strict release builder, verify asset hashes/notices, and rehearse static rollback.
5. Push only the sanitized source ref. Fast-forward master without overwriting concurrent work, then create annotated v2.5.1 at the verified commit; preserve the published v2.5 and v2.5.0 snapshots. Publish a GitHub prerelease with the exact commit, results and known limits. Never upload the private review package.
6. Read back master, tag, release, visibility and CI. Delete only branches whose work is merged or safely retained in a verified backup. Keep unmerged dependency PR branches.

Current limitations: software-rendered startup/frame targets fail; physical GPU/Safari/iOS, interactive Windows keyboard, full accessibility, independent scientific/security approval and comprehensive legacy asset provenance remain open. Passing release automation does not remove these limits.

Pages is manual and has not been authorized by this publication. Use [Pages deployment](PAGES_DEPLOYMENT.md) only for a separately authorized deployment. Source release and a GitHub prerelease do not mark scientific maturity validated.
