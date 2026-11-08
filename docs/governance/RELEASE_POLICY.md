# Release policy

`release/version.json` is authoritative for version, channel, publication state, scientific maturity and safety class. Generate browser metadata with `npm run version:sync`. Package/lock, API docs and flags must agree.

v2.5 is **2.5.0 / development / experimental / non-operational**. A GitHub prerelease can publish development work without setting candidate/released dates or declaring validated science. The npm package stays private to prevent accidental registry publication.

Public source and the commercial model were owner-authorized on 2026-11-08. [The publication record](../../release/publication-v2.5.json) identifies destination, scope and licensor. Prior exact-version approvals and frozen evidence retain their historical meaning; they are not current blanket approvals.

Publish only sanitized, verified commits and explicit artifacts. Keep private history, agreements, tokens and runtime state out of public refs/assets. Preserve old public tags and upstream/MIT rights. Do not move existing release tags or overwrite concurrent master work.

Pages, containers, packages, provider admissions, operational claims and customer redistribution have separate boundaries. Unmet performance, independent review, physical-device and provenance gates stay visible in [the roadmap](../../ROADMAP.md). See [release checklist](../engineering/RELEASE_CHECKLIST.md) and [licensing transition](LICENSING_TRANSITION_V2_5.md).
