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
- Do not describe a capability as operational, safety-grade, or certified without the independent evidence required by `docs/governance/V2_POLICY.md`.
- Update the ADR, release checklist, validation corpus, performance budget, or rollback procedure when a change alters those contracts.
- For Version 2.2 catalog, scheduler, reconciliation, timeline, or browser-continuity work, run the required matrix in `Test_and_Integration.md` and `docs/engineering/RELEASE_CHECKLIST_V2_2.md`; a live provider smoke test is separate, guarded operator evidence. Do not infer that GitHub Pages can execute the Python scheduler.
