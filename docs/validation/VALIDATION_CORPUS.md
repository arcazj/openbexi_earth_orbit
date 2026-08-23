# Validation Corpus Policy

## Corpus Tiers

| Tier | Purpose | Minimum content |
| --- | --- | --- |
| Unit fixtures | Deterministic algorithm behavior | Nominal, boundary, invalid, missing, and numerical-stability cases |
| Reference vectors | Scientific comparison | Independently generated inputs, expected outputs, units, frame/time metadata, tolerances |
| Cross-tool cases | Implementation independence | Results from at least one separately implemented trusted tool |
| Regression cases | Prevent recurrence | A minimized fixture and issue reference for every corrected defect |
| Scale corpus | Performance and memory | Representative catalog sizes, density extremes, and repeatable hardware profile |

## Manifest Requirements

Each corpus candidate must include a checksum-consistent manifest containing a corpus version, source and license, generation command and tool version, SHA-256 checksums, expected values, absolute and relative tolerances, excluded cases with reasons, and an explicit review state. Immutability requires a committed, tagged, archived, or signed publication; a corpus cannot support `Validated` maturity until that publication exists and an independent reviewer records approval. The v2.0 preview manifest deliberately remains `pending`.

Training, tuning, and acceptance sets must be identified separately. A case used to tune an algorithm cannot be the only evidence used to accept it.

## Existing Seeds

The checksum-consistent v2.0 candidate manifest is `validation/v2.0.0/manifest.json`, with its own sidecar digest, the official AIAA-2006-6753 package checksum, and SHA-256 checksums for the executable fixture files. The historical v2.1 manifest retains its original source hashes and immutable benchmark-file checks while allowing current source files to be superseded by v2.2. The v2.2 development manifest at `validation/v2.2.0/manifest.json` binds the current GP/OMM ingest and generated data, composite data revisions, same-origin metadata watcher and timeline refresh, immutable registry acquisitions and bootstrap fallback, API and scheduler contracts, GP benchmark input, shared Python discovery, offline static closure, unified browser categories/details/share state, authoritative time and ephemeris bounds, exact-selected/interpolated-catalog motion, current-epoch readiness and failure recovery, batched Globe and dense Mercator rendering, selected-orbit continuity, canonical model-asset cleanup, packaging, and tests. `npm run check:validation` verifies all three manifest sidecars, rejects drift in the current v2.2 artifacts, requires the named executable and evidence records, enforces removal of the duplicate `obj/loral.glb`, and preserves each `pending` independent-review state. Coordinated edits remain possible until a corpus is committed and published under an immutable tag, archive, or signature.

- `data/ephemeris/solar_system_jpl_horizons_reference_samples.json` seeds ephemeris comparison.
- Deterministic TLE and update fixtures in `tests/` seed parsing and failure-preservation cases.
- Version 2.2 includes checksum-bound deterministic OMM/GP fixtures for IDs `69999`, `100000`, `100001`, and a nine-digit identity; omitted-default normalization; malformed identity/epoch/numeric/frame/theory quarantine; mixed TLE/OMM newest-epoch deduplication; and `json2satrec` propagation. They are development regression evidence, not candidate approval.
- Version 2.2 lifecycle fixtures include a details-only `100401` launch dated `2026-08-20`, stale-cache replacement for launch/confirmed-decay timelines, confirmed-over-predicted precedence, revision refresh, provider 404/partial/malformed responses, and coherent last-known-good restoration.
- Version 2.2 browser-state fixtures cover normalized category unions and debris precedence, category-colliding raw tag keys with qualified UI labels and lossless shared-link restore, selected-object clearing, hidden-selector virtualization, one authoritative signed clock, finite ephemeris clamp/pause/reversal, exact selected state, bounded Hermite interpolation, stale-job rejection, current-epoch hidden-until-finite admission, same-UTC failure recovery, and in-place selected-orbit refresh. Interpolated scene state remains outside screening evidence.
- Version 2.2 render fixtures bind proxy-to-point-buffer membership across filter and catalog changes, detailed/density mode thresholds, zero visible unready/origin markers, nonblank full-catalog Mercator density output, adaptive map/track behavior, failed-track clearing/suppression, and ownership-aware point-resource cleanup. Canonical `obj/SSL_1300.glb` is checksum-bound and the byte-identical `obj/loral.glb` duplicate is required to remain absent.
- `tests_python/test_server_security.py` seeds serving-security regression coverage.
- `tests/propagationService.test.js` includes published numeric TEME vectors with explicit 5 m position and 5 mm/s velocity tolerances: Vanguard 00005 at epoch, plus deep-space non-resonant 28129, HEO half-day resonant 26975, GEO synchronous resonant 28626, and negative-BSTAR 21897 at epoch and +120 minutes.
- `tests/conjunctionScreening.test.js` includes analytic linear, curved, threshold, actual-window-boundary, slow/fast, duplicate, multiple-minimum, adjacent-interval ownership/deduplication, freshness, mixed-provenance, incomplete-coverage, resource-limit, and cancellation cases. Its dense deterministic comparison is an initial small-corpus recall check, not independent operational validation.
- `tests/conjunctionWorkerProtocol.test.js` covers message validation, chunked catalog transport, progress delivery, completion, cancellation/rerun, serialized failure, crash recovery, client behavior, and the documented no-Worker fallback.

The detailed v2.0 evidence and limitations are recorded in `docs/science/EXPERIMENTAL_CONJUNCTION_SCREENING_V2.md`.

These seeds support only `Experimental` maturity and do not constitute a complete independently reviewed scientific validation corpus. The Version 2.2 fixtures and exact source hashes are archived in the development manifest, and the local browser/build/benchmark result is recorded in the development release checklist. Candidate performance evidence still requires repeated named-hardware desktop/mobile and projected-scale profiles, while independent review remains open. Before `Validated` maturity, publish an automatically generated validation report with pass/fail and error distributions and a new independently reviewed corpus version. Independent TCA cases across orbit regimes, official-source license compatibility review, and independent reviewer approval also remain open.
