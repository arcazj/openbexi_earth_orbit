# Prompt History

This is a concise record of user intent and decisions. Full historical requests remain in published Git history; private agreements and internal implementation prompts are excluded from the public 2.5 history.

## Version 2.5.1 — visible playback units

The user requested sec/s by default, plus min/s, hour/s and day/s for Solar System playback, then accepted all recommendations for v2.5.1. Both integrated and standalone views expose units beside Play/Pause and Live; year/s remains under Advanced. Unit changes preserve UTC, signed multiplier and paused/running state; Live resets to 1 sec/s. Keyboard, narrow-screen and legacy behavior checks accompany concise documentation. Existing v2.5/v2.5.0 tags and downloads remain intact; the authorized public development-prerelease scope is unchanged.

## Version 2.5 — public commercial source

The user requested a first delivery toward professional quality: source freshness, independent reference checks, performance measurement, security/recovery work and concise documentation. Initial implementation was kept local pending publication approval. Performance targets and independent qualification were explicitly left open rather than declared complete.

On 2026-11-08 the user authorized implementing the publication prompt and recommendations, **keeping the code public**, and supplied **Jean-Christophe Arcaz / arcazj@gmail.com** as licensor/contact. Scope: publish GitHub v2.5, finalize the commercial notice for new owner-controlled material, retain MIT/upstream rights, streamline docs and safely remove redundant branches. This does not request a Pages, container or package deployment.

Publication preparation preserves the original unpublished work in a verified local bundle and rebuilds the public changes from v2.4 without the private agreement or internal prompt. Existing public history is retained. Unmerged branches remain until their work is safely incorporated.

The user also requested explicit legal wording covering inaccurate results and the author's/OpenBEXI project's responsibility. The notice includes accuracy/completeness/timeliness disclaimers, independent-verification guidance, reliance and damage limitations, and an exception for liabilities and statutory rights that cannot lawfully be excluded.

The user then requested that true real-time movement be implemented as part of **2.5.0**. The correction adds Live UTC and literal 1× in both satellite and Solar System views, preserves accelerated/reverse playback and validated JPL bounds, and replaces the shared 24-hour planet spin with nominal body-specific rates. Absolute body orientation remains illustrative.

## Version 2.4 — Solar System time exploration

User requested precise astronomical playback by default, an educational checkbox, flexible bounded time controls and legacy compatibility. Follow-up: use JPL to complete orbit guides first while keeping playback inside its validated dataset. Public tag/release: [v2.4](https://github.com/arcazj/openbexi_earth_orbit/releases/tag/v2.4), commit `f7724f5`. The requested obsolete `v2.3.3-qualification.20261023.1` tag was removed; v2.3.3 was preserved.

## Earlier milestones

| Version | User request / retained result |
| --- | --- |
| 2.3–2.3.3 | Tracked inventory and metadata-only boundaries, revised selection/results, safe private data candidates, scheduled incremental updates and complete reconciliation, single-open menus and bottom status messaging |
| 2.2 | GP/OMM as preferred position source, full NORAD identities and browser time/filter continuity; TLE retained as reduced compatibility coverage |
| 2.1 | Authenticated durable full-catalog screening, revision storage, scoped tokens, jobs and recovery |
| 2.0 | Local-first quality gates, domain contracts and experimental selected-object screening |
| Version 1.7.6 and earlier | Globe/Mercator, search, models, timelines, Python maintenance, star layers and Solar System view; detailed requests retained at historical tags |
| Version 1.6.2 / Version 1.7 | Integrated Solar System Overview, followed by improved textures and bounded JPL ephemeris |
| Version 1.7.4 / Version 1.7.5 | Python data maintenance replaced the Java path; launch/reentry timelines gained source refresh controls |

The current [roadmap](ROADMAP.md), [release notes](docs/RELEASE_NOTES.md) and [testing record](docs/TESTING.md) describe the implemented state. Historical corpus and evidence files retain the wording and approval state recorded when they were created.
