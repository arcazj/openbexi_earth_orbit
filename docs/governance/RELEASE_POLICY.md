# Release policy

`release/version.json` is authoritative for version, channel, publication state, scientific maturity and safety class. Generate browser metadata with `npm run version:sync`. Package/lock, API docs and flags must agree.

Version **2.6.0** uses the development channel and the experimental, non-operational classification. It is a local, uncommitted preparation. Its candidate and release dates are unset. [Version metadata](../../release/version.json) · [Local release checks](../../release/evidence/v2.6.0-development-checks.json)

The owner authorized public source and the commercial model for 2.5 on 2026-11-08. The publication records identify the scope of each historical release. The npm package is private. [2.5 publication record](../../release/publication-v2.5.json) · [2.5.1 publication record](../../release/publication-v2.5.1.json)

Publish only sanitized, verified commits and explicit artifacts. Keep private history, agreements, tokens and runtime state out of public refs/assets. Preserve old public tags and upstream/MIT rights. Do not move existing release tags or overwrite concurrent master work.

Pages, containers, packages, provider admissions, operational claims and customer redistribution have separate boundaries. Unmet performance, independent review, physical-device and provenance gates stay visible in [the roadmap](../../ROADMAP.md). See [release checklist](../engineering/RELEASE_CHECKLIST.md) and [licensing transition](LICENSING_TRANSITION_V2_5.md).
