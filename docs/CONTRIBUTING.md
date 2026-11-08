# Contributing

New contributions must have a clear author and rights basis compatible with the [commercial notice](../LICENSE.md); earlier MIT and third-party material retains its terms. Do not submit third-party code or assets without provenance. Contact [Jean-Christophe Arcaz](mailto:arcazj@gmail.com) for licensing questions.

Use `npm ci`, then `npm run check` and the suites in [Testing](TESTING.md) appropriate to the change. Node 22 / Python 3.12 are the CI profile. Preserve legacy journeys, the default Tracked Objects - Matches section, bounded Solar System playback and last-known-good catalog behavior.

Keep frozen validation artifacts unchanged. Add a fresh holdout round when scientific behavior changes; do not tune against acceptance samples or loosen tolerances for a pass. Document frame, time scale, units, source coverage and numerical limits.

Treat provider responses and metadata as untrusted. Preserve bounded parsing, provider admission, private candidates, atomic publication, lineage and the static allowlist. Test cancellation, malformed data, partial sources and failure recovery.

Keep credentials, private agreements, runtime pointers/databases and local evidence packages out of Git. Publish only explicitly authorized source/artifacts after [release checks](engineering/RELEASE_CHECKLIST.md). The v2.5 source/prerelease authorization does not deploy Pages, containers or packages.

Documentation belongs under `docs/` except README, LICENSE, PROMPT_History and ROADMAP. Root `CLAUDE.md` is a short tool-discovery exception; upstream licenses stay in their original vendor paths. Update [the index](README.md), relative links, Help routes and artifact allowlists when moving public documents.
