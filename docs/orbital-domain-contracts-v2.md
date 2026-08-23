# Orbital Domain Contracts v2

The v2 domain boundary is defined in `js/domain/` and is intentionally independent of the UI and server. Import its public API from `js/domain/index.js`. Versioned JSON Schema documents are exposed as `DOMAIN_SCHEMAS`; runtime normalizers and validators enforce the same closed object shapes without adding a runtime validation dependency.

## Scientific status

The capability maturity labels describe scientific evidence, not general software quality:

| Capability | Maturity | Enabled in v2 | Permitted output |
| --- | --- | --- | --- |
| Catalog visualization | Visualization | Yes | Catalog metadata and visual positions/orbits |
| GP OMM/TLE SGP4 propagation | Experimental | Yes | TEME position and velocity with provenance |
| Selected-object screening | Experimental | Yes | TCA, miss distance, and relative state |
| Collision probability | Experimental | No | None until covariance/HBR inputs and an independent benchmark are available |
| Maneuver recommendation | Experimental | No | None until validated mission and secondary-screening models exist |

`CAPABILITY_POLICIES` is the authoritative machine-readable policy. A successful contract check does not establish orbit accuracy, collision likelihood, operational readiness, or suitability for maneuver decisions.

## Time and frames

- Every instant is an ISO-8601 date-time with an explicit offset and is normalized to UTC.
- Supported OMM/TLE SGP4 states are labeled `TEME`; ambiguous `ECI` labels are rejected.
- v2 screening requires both object states at the same UTC instant in TEME.
- GCRF, ITRF, RTN, encounter-plane transforms, and Earth-orientation inputs are planned but not implemented by this boundary.
- Element-set freshness thresholds are diagnostic experimental gates, not error bounds. Stale records are retained with flags by default; callers can quarantine them. Screening re-evaluates freshness at the window boundaries and at each TCA; signed `age_days` values preserve future-epoch conditions instead of clamping them to zero.

## Identity and ingestion

`object_id` is an internal stable identifier derived from NORAD, COSPAR, or an explicit provider identifier. Names never establish identity. Pair keys are canonical regardless of primary/secondary ordering, while conjunction events retain the requested roles and immutable display names.

Version 2.2 preserves NORAD identifiers as canonical decimal strings without imposing the fixed TLE width. The supported CelesTrak OMM JSON profile retains raw canonical fields under `element_set.omm`, normalizes only documented omitted constants, and rejects invalid identity, epoch, numeric, frame, time-system, or theory values per record. Duplicate TLE/OMM records are resolved by normalized identity and newest valid element epoch under a deterministic tie policy. OMM is initialized with satellite.js `json2satrec`; TLE uses `twoline2satrec`. Converting OMM to synthetic TLE, truncating an identifier, or silently coercing it through Alpha-5 is outside the contract. Temporary compatibility group/tag enrichment also joins only by the complete canonical NORAD string and records its source/tag-map revisions and match counts; it is display metadata, not orbital state or operator identity.

`validateCatalog` performs fixed-column TLE validation, including the line-1 separators, derivative, implied-exponent, BSTAR, ephemeris-type, and element-set-number fields, both checksum checks, epoch parsing, catalog-ID matching, finite/range checks, derived-field consistency checks, provenance validation, freshness classification, and duplicate detection. The supported ingestion profile requires ephemeris type `0` and explicit implied-exponent values such as ` 00000+0`; although some TLE specifications treat an all-space second derivative or BSTAR as zero, those forms are quarantined because the pinned `satellite.js` parser produces non-finite fields for them. Runtime ingestion also initializes each structurally valid TLE with the pinned `satellite.js` SGP4 implementation and quarantines records that throw, return no satellite record, report an invalid/nonzero initialization error, or contain a non-finite critical satellite-record field. Every record sharing a duplicate canonical identity is quarantined; the validator does not choose one silently. The output status is one of `VALID`, `DEGRADED`, `PARTIAL`, or `INVALID` and includes accepted objects, their source-record indices, quarantine reasons, and deterministic quality counts.

Legacy catalog `type` is interpreted only as a fallback orbit class. Object type, orbit class, and lifecycle status remain separate fields and use explicit `UNKNOWN` values when source data is absent. Generated GP and compatibility TLE outputs re-derive orbit class from finite mean motion, eccentricity, inclination, period, and derived altitude/perigee/apogee metrics under the documented deterministic thresholds; stale source labels do not override those metrics.

The browser category filter is a visualization projection, not a replacement for those domain fields. Its values are `GEO`, `MEO`, `LEO`, `HEO`, `DEBRIS`, and `OTHER`; `ALL` expands to their union, while the visible `HRO` label is an alias for the canonical `HEO` value. An authoritative debris or rocket-body object type takes precedence over orbit class. An authoritative non-debris type takes precedence over debris-like name text; name heuristics are used only when object type is missing or explicitly unknown. Unknown/unclassified orbit values map to `OTHER` rather than being discarded. The fresh browser selection is `MEO`, but explicit shared state is restored after normalization. If a later filter change excludes the selected object, the browser clears that selection and its dependent display state rather than preserving an object outside the filtered set. Visible search is the catalog-discovery surface; the hidden compatibility selector holds only `None` and the active canonical identity.

At runtime, the mixed catalog loader prefers `GP.json` and its metadata, computes a deterministic content digest over the actual records, validates the complete source before scene mutation, and creates a stable `Object3D` state/selection proxy for each accepted record plus one batched `THREE.Points` render layer. It materializes fresh-page-default `MEO` records first and may publish that first chunk before the remainder, but every proxy starts non-renderable: filter eligibility is separate from finite-position readiness, and point-layer membership begins only after the shared motion pass commits a valid exact state or interpolation window covering the current simulation UTC. Up to 1,000 drawn markers use the icon texture; denser Globe views use compact per-marker colors. Filter re-admission after a discontinuous paused-time jump cannot expose an old-epoch sample. The deprecated TLE catalog may be used only as a visible reduced-coverage fallback. Each accepted record receives a frozen `catalogObject`, while display metadata remains intact. Active and last-attempt validation snapshots expose quarantine/rejected reload results without replacing the last usable scene. SHA-256 is used when Web Crypto is available, with a deterministic FNV-1a fallback for environments without it.

Browser simulation time is also separate from source/domain time. One signed clock owns the current visualization UTC instant; Solar System mode bounds it to the local JPL-derived table and pauses at a reached range edge. Hermite interpolation of non-selected satellite scene positions, Mercator reuse of those positions, cached ground tracks, and bounded in-place orbit-line refresh are visual rendering policies only. A failed Mercator selected-track rebuild clears its prior visual path and suppresses repeat work for the same failed satellite/instant. Failed display propagation is hidden and retried rather than represented by a stale state. Domain propagation, screening, element age, provenance, exports, and selected-object state remain functions of explicit UTC and raw supported propagation states, never interpolated scene coordinates.

## Screening contracts

`ScreeningRequest` is a closed, versioned contract. It requires the primary identity, optional candidate identities, UTC/TEME conventions, window, dataset ID/hash, full `DatasetProvenance`, and the complete effective configuration: configuration version, radius, horizon, coarse step, refinement tolerance/subdivisions/iterations, result limit, acceleration bound, padding, work-yield cadence, and start/end timestamps. The execution boundary rejects a typed request whose window or configuration differs from the options actually executed.

`ScreeningResult` retains the canonical request and effective configuration alongside events, statistics, bounded structured propagation errors, dataset provenance, computation provenance, and result quality flags. Every event also carries complete dataset provenance, state/computation provenance, participant element-set identity/epoch/signed age, and analysis diagnostics. Dataset identity/hash mismatches between primary, catalog, request, event, result, or computation provenance are rejected rather than silently combined.

The preview request boundary also rejects a horizon above 24 hours, a grid above 100,000 points, a catalog above 100,000 objects, or more than 500,000 estimated coarse catalog propagations. These are resource controls, not scientific accuracy guarantees.

## Contract use

Use `normalize*` functions at trusted construction boundaries and `validate*` functions for untrusted or serialized values. Normalizers return deeply frozen canonical values and throw on invalid input. Validators return `{ valid, value, issues, errors, warnings }`. Contracts reject unknown fields, non-finite numbers, implicit time zones, unit ambiguity, unsupported screening frames, inconsistent state/event vectors, and collision probability in the current OMM/TLE workflow.

Dataset and computation provenance are required. A request/result/event must retain provider, source identifier and URI when known, retrieval time when supplied by the provider, source status, partial-update state, dataset ID/hash, and license identifier when known. `retrieved_at` is explicitly `null` when provider metadata does not contain a retrieval instant; the loader does not substitute the current time, and the dataset is marked degraded. A state or event must also identify its dataset hash, algorithm name/version/configuration hash, input element-set IDs, generation time, physical units, time scale, and frame. Unknown license metadata remains explicit and does not imply redistribution approval.
