# Contributing

New contributions must have a clear author and rights basis compatible with the [commercial notice](../LICENSE.md); earlier MIT and third-party material retains its terms. Do not submit third-party code or assets without provenance. Contact [Jean-Christophe Arcaz](mailto:arcazj@gmail.com) for licensing questions.

Use `npm ci`, then `npm run check` and the suites in [Testing](TESTING.md) appropriate to the change. Node 22 / Python 3.12 are the CI profile. Preserve legacy journeys, the default Tracked Objects - Matches section, bounded Solar System playback and last-known-good catalog behavior.

Keep frozen validation artifacts unchanged. Add a fresh holdout round when scientific behavior changes; do not tune against acceptance samples or loosen tolerances for a pass. Document frame, time scale, units, source coverage and numerical limits.

For spacecraft models, check the existing LEO, MEO and GEO profiles before adding a mesh. Map spacecraft with the same exterior to a shared asset, keep the source references with the profile and label estimates or catalog outlines. The generator updates the manifest and compact NORAD index together. [Model references and regeneration](THIRD_PARTY_NOTICES.md)

Treat provider responses and metadata as untrusted. Preserve bounded parsing, provider admission, private candidates, atomic publication, lineage and the static allowlist. Test cancellation, malformed data, partial sources and failure recovery.

Keep credentials, private agreements, runtime pointers and databases, and private run artifacts out of Git. The repository keeps concise public verification records under `release/evidence/`. Source publication and Pages deployment each follow their documented workflow. [Release checklist](engineering/RELEASE_CHECKLIST.md) · [Pages deployment](engineering/PAGES_DEPLOYMENT.md)

Documentation belongs under `docs/` except README, LICENSE, PROMPT_History and ROADMAP. Root `CLAUDE.md` is a short tool-discovery exception; upstream licenses stay in their original vendor paths. Update [the index](README.md), relative links, Help routes and artifact allowlists when moving public documents.
