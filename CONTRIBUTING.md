# Contributing

## Setup

1. Install a supported Node.js and Python 3 version.
2. Run `npm ci`.
3. Run `npm run serve` and open `http://127.0.0.1:8000/index.html`.

Python-backed npm commands use the shared `scripts/python-discovery.mjs` resolver. It honors `OPENBEXI_PYTHON_COMMAND`, then probes the Windows `py -3` launcher when applicable, `python3`, `python`, and recognized installed Windows Python directories, accepting only Python 3. Set `OPENBEXI_PYTHON_COMMAND` to an executable path or command when automatic discovery is unsuitable.

Before submitting a change, run:

```text
npm run check
npm test
npm run audit:dependencies
```

## Change Discipline

- Keep generated dependencies, IDE state, caches, backup data, reports, and credentials out of commits.
- Preserve unrelated work in a dirty worktree.
- Add deterministic tests at the narrowest useful layer, then add a browser test for user-visible workflows.
- Record coordinate frame, time scale, units, source, and tolerance for scientific calculations.
- Treat new data and visual assets according to `docs/governance/DATA_SOURCES.md`.
- Preserve NORAD identifiers as strings, keep OMM canonical fields, and never manufacture TLE or bypass provider request guards. Explicit Alpha-5 TLE fields may be decoded to canonical full numeric strings but remain compatibility-subset data. External-data and scheduler tests use fixed fixtures, injected clocks/jitter, or mocked fetches.
- Keep tracked-object type, orbit class, lifecycle, observation transition, and current-element availability independent. Preserve small, missing, or invalid radar cross-section as source metadata; never infer physical diameter, mass, or weight or fabricate a position for a SATCAT-only record. Red denotes authoritative debris type only, never hazard, collision risk, proximity, size, mass, or RCS magnitude.
- Do not describe a capability as operational, safety-grade, or certified without the independent evidence required by `docs/governance/V2_POLICY.md`.
- Update the ADR, release checklist, validation corpus, performance budget, or rollback procedure when a change alters those contracts.
- For Version 2.3.2 catalog, scheduler, filter, interaction, or release work, run the required matrix in `Test_and_Integration.md` and `docs/engineering/RELEASE_CHECKLIST_V2_3_2.md`; a live provider smoke test is separate, guarded operator evidence. GP changes must preserve the fail-closed four-group source-scope migration and distinguish configured groups from groups that produced accepted bytes. Scheduled updates must mutate only an isolated private candidate and may replace the private current pointer only after complete validation and a final cancellation/drift check. Tracked API and `server.py` static aliases must return bounded `503 TRACKED_CATALOG_UNAVAILABLE` instead of serving any manifest, metadata, or chunk when closure/revisions/current GP-SATCAT lineage are incoherent. Preserve keyboard navigation, focus restoration, narrow-viewport results, truthful coverage labels, canonical Globe/Mercator selection, and debris facets under every nonempty orbit selection with sole type `DEBRIS`. GitHub Pages cannot execute the Python scheduler and must receive only the verified artifact. Owner `arcazj` approved one final post-recording `origin/master` source publication only; that decision does not cover the manual Pages artifact, private candidates, later rebuilds, refreshes, contributions, or changed bytes. Every subsequent publication requires renewed exact-byte review.
