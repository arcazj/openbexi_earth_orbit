# Data Source Governance

Last reviewed: 2026-08-23

## Admission Record

Every runtime or validation data source must record:

- Stable source identifier and authoritative URL
- Provider, license, attribution, and redistribution terms
- Transport and authentication method
- Coordinate frame, time scale, units, epoch semantics, and precision
- Schema version and required fields
- Refresh cadence, maximum usable age, and expected availability
- Integrity metadata such as checksum, ETag, Last-Modified, and fetch time
- Parser version, transformations, rejected-record count, and output checksum
- Named owner and fallback or retirement plan

HTTPS is required. Exceptions need a time-limited security waiver and must not feed a validated release.

## Ingestion States

1. `received`: bytes fetched but not trusted.
2. `validated`: transport, schema, range, duplicate, and domain checks passed.
3. `quarantined`: malformed, stale, inconsistent, or provenance-incomplete input.
4. `published`: atomically promoted with metadata and a last-known-good predecessor.
5. `retired`: retained only for reproducibility under its original license.

Partial validation must not publish a mixed batch silently. Reports must expose accepted, rejected, stale, and duplicate counts.

## Current Source Registry

### `celestrak-gp-catalog`

The current private registry identifies the preferred Version 2.2 OMM instance as `celestrak-gp-omm-bundled`; `celestrak-gp-bundled` remains the legacy TLE fallback ID. These distinct runtime IDs do not imply different providers or an approved redistribution license. Local implementation and retrieval do not by themselves approve public redistribution.

| Field | Admission record |
| --- | --- |
| Provider and upstream | CelesTrak GP data derived from U.S. Space Force catalog products; durable HTTPS endpoint templates and group names are defined in `tools/satellite_data_tools.py`, while each generated snapshot records the URLs actually attempted in its GP or legacy TLE metadata sidecar |
| Authoritative documentation | [GP formats](https://celestrak.org/NORAD/documentation/gp-data-formats.php) and [CelesTrak usage policy](https://celestrak.org/usage-policy.php) |
| Runtime format | Preferred CelesTrak OMM JSON profile under `json/gp/GP.json`, with canonical source fields preserved under `element_set.omm`; legacy fixed-width TLE remains a deprecated compatibility dataset. Both represent UTC/TEME SGP4 mean elements at the supported calculation boundary. Derived orbit class is recomputed from finite numeric mean-element metrics for each output. GP group/tag enrichment may use only an exact full-string NORAD join to the compatibility catalog and does not supply orbital state. |
| Authentication and transport | Public HTTPS; no browser or server credential required |
| Update policy | The local tool enforces a two-hour minimum between successful refreshes unless explicitly forced and sends conditional request metadata where available. Preferred GP and default incremental TLE compatibility updates each request the CelesTrak `active` group once; the prior overlapping/failing `last-30-days` incremental request is removed. Explicit `export-tle --all` retains the historical multi-group compatibility workflow. The tool does not claim to know the provider's publication boundary. |
| Registry completeness | Successful incremental metadata is registered as `PARTIAL`; only a successful explicit `mode=all` snapshot is `COMPLETE`. Failed or unrecognized modes are `DEGRADED`. |
| License and redistribution | CelesTrak describes the data as freely available, but the repository has not recorded an explicit redistribution license for bundled GP snapshots. Public redistribution approval remains pending and is a release-review item. |
| Retention | Atomic last-known-good GP JSON plus fetch metadata, SATCAT-derived launch/decay artifacts, and the deprecated TLE compatibility files. A coherent promoted revision must not mix old data with new metadata. The local durable registry freezes the catalog bytes, first source metadata supplied for that catalog byte hash, and revision descriptor; distinct later acquisitions of identical catalog bytes are append-only records and do not rewrite those frozen files. |
| Integrity and validation | HTTPS, provider ETag/Last-Modified when supplied, release-evidence SHA-256 hashes, OMM schema/identity/epoch/frame/theory/range validation, TLE compatibility structure/checksum validation, deterministic newest-epoch deduplication, exact-string enrichment joins, deterministic tag-map/source revisions and match counts, numeric orbit reclassification, record quarantine, and freshness/count diagnostics |
| Freshness and outage | Source metadata records last attempt/success. Network or parse failure preserves the prior dataset and exposes degraded/partial state. |
| Owner | Project maintainers; no external service-level agreement |

**Coverage restriction:** CelesTrak reports that the official catalog crossed into six-digit catalog numbers in July 2026. Legacy TLE cannot represent those identifiers, so the bundled TLE compatibility catalog necessarily omits newly assigned six-digit objects. Version 2.2 preserves non-fixed-width identifiers through the preferred OMM profile and launch catalog. That closes the application-format blocker only; provider completeness, SATCAT profile compatibility, licensing, redistribution, and independently verified current coverage remain open gates.

`/api/gp-metadata` exposes the generated `json/gp/GP.meta.json` sidecar unchanged. `/api/data-update-status` publishes a deterministic composite `data_revision` over the current GP, launch, and decay revision values, plus `gp_revision`, `launch_revision`, `decay_revision`, and matching `datasets` entries. The older `catalog_revision` field is retained for compatibility and names the GP revision only. Consumers should use `data_revision` for cross-dataset refresh detection.

During the one-release TLE compatibility window, `export-gp` can enrich its UI-facing `company` group/tag from the first meaningful compatibility record with the same complete canonical NORAD string. If no compatibility match exists, a prior meaningful GP tag is retained before the current provider placeholder is used. `GP.meta.json.tag_enrichment` binds the compatibility file, its catalog revision, a deterministic tag-map revision, and available/matched/tagged/unmatched counts. This is a temporary display-filter enrichment boundary, not TLE-derived orbital state, not an operator-identity claim, and not a reason to truncate or exclude six-digit GP records. Raw tag keys remain stable for filtering and shared links, while category-colliding labels are qualified in the UI; the raw `GEO` tag is displayed as `Geosynchronous group` and does not change orbit classification. The current checked-in snapshot contains 190 GP records classified as `MEO`; that count is regression context for these bytes, not an authoritative provider-coverage invariant.

All CelesTrak endpoints configured by `tools/satellite_data_tools.py`, including the single default `active` request and legacy-compatible `export-tle --all` group list, use HTTPS. The shared fetch boundary rejects non-HTTPS and credential-bearing ingestion URLs before any request or injected fetcher is called.

### v2.1/v2.2 Orbital-Source Adapter Registry

`js/domain/orbitalSourceAdapters.js` implements bounded normalization contracts. `js/orbit/multiFormatPropagationService.js` implements the matching propagation/interpolation dispatch. Version 2.2 reuses these contracts for the preferred CelesTrak OMM JSON profile. Parser support and a configured local feed remain distinct from provider admission and public redistribution approval.

| Format | Implemented behavior | Admission and screening status |
| --- | --- | --- |
| `TLE_JSON` | Validates legacy TLE pairs and identity, preserves explicit provenance, and propagates with satellite.js SGP4 in UTC/TEME | Deprecated compatibility snapshot; cannot represent six-digit IDs and cannot establish current complete coverage |
| `CCSDS_OMM_JSON` | Requires canonical OMM SGP4 fields, normalizes only the documented CelesTrak omitted constants, preserves complete string identity and original JSON, and propagates through `json2satrec` | Preferred Version 2.2 local-development GP profile; provider terms and public redistribution remain unapproved |
| `CCSDS_OMM_KVN` | Parses one bounded KVN message, rejects duplicate/unsupported fields, and preserves the original KVN text | Same open admission gates as OMM JSON |
| `CCSDS_OEM_KVN` | Parses bounded tabulated states with explicit frame/time/units and original-message preservation | Multi-format service supports bounded linear interpolation without extrapolation or frame conversion; full-catalog screening currently requires TEME; no OEM provider is admitted |
| `PROVIDER_EPHEMERIS_JSON` | Parses bounded provider records and samples with explicit provenance, frame, UTC, km, and km/s | Contract only; no provider schema/profile, license, authentication, retention, or redistribution approval exists |
| SATCAT enrichment and launch catalog | Builds an unambiguous identity index, preserves launch/object/lifecycle metadata, and emits details-only events independently of orbit availability | Local CelesTrak SATCAT use remains governed separately; exact profile compatibility, completeness, and redistribution review remain open |

Default adapter ceilings are 32 MiB per input, 100,000 records, 250,000 KVN lines, 16,384 bytes per line, 20,000 samples per ephemeris, and 200,000 SATCAT rows. Deployment policy may reduce these limits but must not raise them without resource and denial-of-service review.

Supported tabulated frames are TEME, GCRF, and ITRF. The adapter and propagation service do not perform frame or time-scale conversion. The durable full-catalog runner currently rejects selected records that are not already UTC/TEME, so merely parsing a GCRF or ITRF ephemeris does not make it eligible for a mixed-catalog screen.

Before any new source is registered for real jobs, its admission record must resolve:

1. authoritative endpoint and provider identity;
2. automated-access and credential terms;
3. storage, derived-result, retention, deletion, and redistribution rights;
4. message profile, frame, time scale, units, identifier policy, update cadence, and outage behavior;
5. integrity/signature mechanism and raw-message preservation policy;
6. quarantine, last-known-good promotion, rollback, and named data owner;
7. independent fixtures and expected propagation/interpolation results.

No public catalog-upload route exists in Version 2.2. Adding one changes the attack, privacy, licensing, and operational boundary and requires a separate review.

For bundled GP revision registration, Version 2.2 retains the Version 2.1 `NEW`, `CHANGED`, stable observed, `ABSENT`, and `REAPPEARED` semantics by stable object/element identity. Current scheduled updates are incremental, so those revisions are `PARTIAL` and never generate `ABSENT`. `ABSENT` is generated only from a successful explicit full (`mode=all`) source snapshot; failed, partial, or unrecognized source modes must not turn missing records into absence. Authenticated catalog API documents omit private snapshot and metadata paths.

Durable-service bootstrap semantically validates preferred packaged GP/OMM records before SQLite registration. Malformed GP or GP with no propagatable observations falls back to a readable bounded nonempty packaged TLE array with at least one observation-shaped record and visible reduced coverage; strict TLE adapter/propagation validation remains a runner boundary. If neither source reaches its stated boundary, registration fails closed. This local compatibility fallback does not change source admission, completeness, or redistribution status.

Scheduled GP, launch, and confirmed-decay freshness checks are independent. When launch and decay work are both due, both run in the same scheduler cycle. A component revision changes only after that dataset is promoted successfully; the composite revision then changes without requiring an unrelated GP promotion.

### `n2yo-launch-date-html` (legacy optional enrichment)

| Field | Admission record |
| --- | --- |
| Provider and endpoint | N2YO monthly browse pages under `https://www.n2yo.com/browse/` |
| Purpose | Legacy launch-date sidecar enrichment only; never orbital state, propagation, or conjunction input |
| Format and parser | Public HTML table parsed by a repository-specific regular expression; no versioned API or stable schema is available |
| Authentication and transport | Public HTTPS with no credentials |
| Default behavior | Disabled for incremental updates and `export-tle --all`. It runs only when the operator explicitly supplies `--refresh-launch-dates`; direct Python calls must pass `allow_n2yo=True`. |
| Governance state | Not admitted for validated release evidence. Provider terms, automated-access permission, schema stability, attribution, and redistribution rights have not been approved. |
| Failure and replacement | Failure does not replace the local sidecar. Prefer launch metadata from the governed local CelesTrak SATCAT refresh path; remove this scraper once that migration is complete. |
| Owner | Project maintainers; no external service-level agreement |

Outputs produced with this optional scraper must be labeled Experimental and non-operational and must not be promoted as validated or authoritative launch metadata.

### Other Bundled Sources

| Source | Purpose | Governance state |
| --- | --- | --- |
| JPL Horizons-derived ephemeris | Solar-system visualization only; never a conjunction input | Generation method and frame/units are documented in `README.md`; redistribution and validation evidence remain release-review items |
| Local textures and 3D models | Visual presentation only; never a screening input | Known attribution is shown where available; unresolved texture provenance remains explicitly documented and blocks a complete asset-governance sign-off |
| Vallado/CelesTrak SGP4 verification subset | Executable propagation validation | Source, tolerances, checksums, and license status are tracked by the v2.0 validation corpus manifest |

## Freshness and Failure

- Freshness thresholds are source-specific and versioned with the admission record.
- Screening evaluates element age at the window boundaries and for each participant at TCA. Ages are signed so a future element epoch remains distinguishable from a fresh past epoch.
- The UI and result contracts distinguish complete, partial, degraded, stale, future-epoch, and unavailable states; source status and full dataset provenance remain attached to events and exports.
- When GP metadata is absent, local data health reports `fallback-tle` if the packaged TLE file is larger than the empty `[]` sentinel and `unavailable` if no such artifact exists. With GP metadata present, normal `current`/`partial`/`degraded` evaluation applies. The fallback field reports artifact availability, not successful TLE parsing or propagation.
- Network or parser failure preserves the last-known-good dataset and its original timestamp.
- Screening results and release evidence must record source retrieval time or explicitly mark it unknown. Synthetic/reference validation cases instead record their fixed element epochs and source-package checksums.
- Credentials are read from the environment or an external secret store and are never logged, shared, or committed.
- Private durable-service catalog snapshots, revision descriptors, acquisition records, original source records, SQLite state, and job artifacts remain under `runtime/` and are excluded from the static artifact. Their retention must follow the provider admission record; repository inclusion is not permitted by default.
- Unknown object type or lifecycle remains `UNKNOWN`. The service does not infer payload, rocket-body, debris, active, or decayed status from a name.
