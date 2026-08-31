# Data Source Governance

Last reviewed: 2026-08-30

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

The current private registry identifies the preferred GP/OMM instance as `celestrak-gp-omm-bundled`; `celestrak-gp-bundled` remains the legacy TLE fallback ID. Version 2.3.1 configures the GP instance from CelesTrak `active` plus three event-specific debris collections and continues to derive a searchable tracked-object inventory from the bundled CelesTrak SATCAT snapshot and accepted GP snapshot. These distinct runtime IDs, groups, and products do not imply different providers or complete provider/debris coverage. Local implementation, retrieval, or derivation does not by itself approve public redistribution.

### Bundled Version 2.2.1 redistribution approval

On 2026-08-29, the repository owner confirmed that data-owner redistribution approval exists and authorized publication of the current checked-in bundled-source artifacts through the repository-root GitHub Pages configuration. This closes the redistribution gate for the exact Version 2.2.1 data bytes, including GP/OMM, compatibility TLE, SATCAT, SATCAT-derived launch and confirmed-decay catalogs, bundled visualization ephemeris, and their metadata. The approval does not automatically cover a later provider refresh, a new source or profile, private runtime snapshots, credentials, quarantined responses, visual assets, or a different publication channel. Each future changed snapshot must retain its provenance and pass the same data-owner/release review before publication.

### Version 2.3.1 derived-byte one-publication approval

Repository/data/release owner `arcazj` explicitly instructed `commit and push to github` on local date `2026-08-30`, recorded at `2026-08-31T01:55:18Z`. This approves one publication of the exact final post-recording Version 2.3.1 bytes through Git push to `origin/master` in `arcazj/openbexi_earth_orbit` and repository-root GitHub Pages at `https://arcazj.github.io/openbexi_earth_orbit/`. The scope includes the final source tree, tracked manifest, metadata, quarantine file, 13-file referenced closure, validation manifest/sidecar, and curated static artifact. The pre-approval seal `14185ed9ef5969eb50dfffc162ea3a3495fad75a4008575569e865a94c6269d2` identifies the reviewed development state; the approval binds the final resealed bytes after this record and the static/validation fixed point are regenerated. Future refreshed, regenerated, or otherwise changed bytes and every other channel remain subject to renewed exact-byte provenance and release review. An empty quarantine remains a generated data artifact inside the approved closure. The rollback rehearsal is pending under a waiver limited to this publication; independent review and promotion are not waived.

| Field | Admission record |
| --- | --- |
| Provider and upstream | CelesTrak GP data derived from U.S. Space Force catalog products; durable HTTPS endpoint templates and group names are defined in `tools/satellite_data_tools.py`, while each generated snapshot records the URLs actually attempted in its GP or legacy TLE metadata sidecar |
| Authoritative documentation | [GP formats](https://celestrak.org/NORAD/documentation/gp-data-formats.php) and [CelesTrak usage policy](https://celestrak.org/usage-policy.php) |
| Runtime format | Preferred CelesTrak OMM JSON profile under `json/gp/GP.json`, with canonical source fields preserved under `element_set.omm`; legacy fixed-width TLE remains a deprecated compatibility dataset. The Version 2.3 tracked inventory is published through `json/tracked/TRACKED.manifest.json` plus content-addressed current/history/quarantine chunks. The inventory contains SATCAT metadata and exact-string GP availability joins, not duplicated or synthetic element sets. GP/OMM represents UTC/TEME SGP4 mean elements at the supported calculation boundary. |
| Authentication and transport | Public HTTPS; no browser or server credential required |
| Update policy | The local tool enforces a two-hour minimum between successful provider refreshes unless explicitly forced. Preferred GP requests `active`, `fengyun-1c-debris`, `iridium-33-debris`, and `cosmos-2251-debris` once each per due cycle; the event groups are only a partial positioned-debris subset. Default incremental TLE compatibility still requests `active` once, and explicit `export-tle --all` retains the historical multi-group compatibility workflow. GP incremental mode merges the newest validated epoch per exact identity. GP reconciliation requires valid, quarantine-free responses from every configured group before replacement. `build-tracked` reads local SATCAT and GP only and makes no provider request. Conditional validators are sent only after the complete configured source scope has been verified; an accepted `304` then advances successful freshness without replacing data. The tool does not claim to know the provider's publication boundary. |
| Registry completeness | Successful incremental GP/TLE metadata is registered as `PARTIAL`; only a successful full/reconciliation snapshot is `COMPLETE`, and GP completeness applies only to the four configured groups. `source_scope_verified` remains false while migrating an older active-only sidecar, after any incomplete group set, or after unsafe `304`-only responses; it becomes true only after one successful complete four-group cycle. For an established prior GP, TLE, or SATCAT catalog of at least 1,000 records, a full replacement must have both candidate size and canonical NORAD overlap at or above 75% of the prior catalog. Failed, unrecognized, or guard-rejected modes are `DEGRADED`. A tracked `VERIFIED_SNAPSHOT` means its local received/accepted/quarantine/duplicate accounting and chunk closure were verified; it always carries `provider_completeness_claim: false`. |
| License and redistribution | CelesTrak describes the data as freely available. Repository-owner confirmation dated 2026-08-29 records data-owner approval for the exact Version 2.2.1 bundled snapshot. Owner `arcazj` separately approved the final post-recording Version 2.3.1 source/tracked/static/validation bytes for one `origin/master` and repository-root GitHub Pages publication. Future changed snapshots, regenerated artifacts, and other channels require renewed byte-specific provenance and release review. |
| Retention | Atomic last-known-good GP JSON plus fetch metadata, SATCAT-derived launch/decay artifacts, tracked manifest/metadata/referenced chunks, and deprecated TLE compatibility files. Changed fixed-name artifacts use collision-safe timestamped backups with the newest seven retained per artifact; byte-identical or revalidated data creates no backup. Tracked chunks are content addressed and written before atomic manifest promotion. Cleanup preserves the current and bounded rollback-referenced closure and may remove unreferenced historical chunks. A coherent promoted revision must not mix old data with new metadata. The local durable registry freezes the catalog bytes, first source metadata supplied for that catalog byte hash, and revision descriptor; distinct later acquisitions of identical catalog bytes are append-only records and do not rewrite those frozen files. |
| Integrity and validation | HTTPS, provider ETag/Last-Modified when supplied, release-evidence SHA-256 hashes, OMM schema/identity/epoch/frame/theory/range validation, TLE compatibility structure/checksum validation, deterministic newest-epoch deduplication, exact-string enrichment joins, deterministic tag-map/source revisions and match counts, numeric orbit reclassification, record quarantine, freshness/count diagnostics, production-scale dual size/identity replacement guard, and tracked chunk byte/SHA-256/record-count plus population-invariant verification before manifest promotion |
| Freshness and outage | Source metadata records last attempt/success/revalidation. An accepted not-modified response resets due age; network, parse, shrink-guard, chunk-write, or publication failure preserves the prior dataset and exposes degraded/partial state. GP, TLE, SATCAT, tracked, launch, and decay sidecars retain their latest dataset error for restart-safe status. |
| Owner | Project maintainers; no external service-level agreement |

**Coverage restriction:** A TLE catalog field can encode only a limited Alpha-5 subset, which the application decodes to canonical full numeric strings; it cannot provide complete current six-digit coverage. The preferred OMM profile and tracked inventory preserve non-fixed-width identifiers. The tracked manifest's 70,474 accepted rows are complete accounting of this bundled SATCAT file, not proof that CelesTrak or any provider knows every physical object. `expected_provider_records` remains null and `provider_completeness_claim` remains false. A missing GP join means only that the identity has no valid element set in the accepted configured GP snapshot. It does not prove that no elements exist elsewhere. The three configured event groups do not represent every debris event or all debris. The scoped redistribution approval above is not a completeness or scientific-validation claim.

**Version 2.2.1 snapshot state:** GP/OMM, compatibility TLE, SATCAT, launch, and confirmed-decay artifacts completed reconciliation on `2026-08-29`/`2026-08-30` UTC. The compatibility TLE reconciliation succeeded at `2026-08-30T02:13:23.342346Z`; a later retry returned HTTP 503, retained that successful data/revision, and recorded the retry failure in `json/tle/TLE.meta.json`. This degraded retry state does not invalidate either orbital catalog and remains visible to operators until a later conditional check succeeds.

**Version 2.3.1 frozen tracked snapshot state:** tracked revision `sha256:7c1a20d93d1eb5faf7e2b964b13c7b4f0478f2eec95cc701ea1b1e57ef0d730c` remains unchanged and keeps tracked `schema_version: 2.3.0`. It accounts for all 70,474 accepted bundled SATCAT rows with zero quarantines and zero duplicates: 34,960 current plus 35,514 `history_total`, partitioned into 16,470 propagatable and 54,004 metadata-only records. Every history-scope row is currently decay-dated `historical`, `absent` is zero, and current availability splits into 16,470 propagatable plus 18,490 metadata-only. Decay-dated `historical` and membership-`absent` are diagnostics within `history_total`, not additive partitions. All 12,490 current and 23,348 historical debris records are metadata-only with `NO_CURRENT_ELEMENTS`, so zero real debris markers are positioned. Of the current debris population, 7,852 records have published RCS below 0.1 m2 and 3,123 have missing RCS; RCS is radar cross-section, not diameter or mass. The Version 2.3.0 referenced closure measured 74,565,443 bytes across 13 files. The current Version 2.3.1 closure measures 74,565,511 bytes across 13 files, with a largest chunk of 24,215,754 bytes. These values are exact frozen-snapshot evidence inside the one-publication approval; they are not an upstream or future invariant.

**Version 2.3.1 expanded-scope attempt:** at `2026-08-30T20:33:29Z`, the live `active` plus three-event-group GP attempt returned HTTP 503 for one or more groups. The tool promoted no partial GP response, kept accepted GP bytes and the GP catalog revision unchanged, recorded all attempted URLs, and set `source_scope_verified: false`. Metadata separates desired `source_groups` (all four configured groups) from `catalog_source_groups` (the groups that actually produced the current accepted bytes, still only `active`). The next cycle remains due and must make unconditional requests for every group; active-only validators or `304` responses cannot establish the expanded scope. A subsequent tracked build corrected manifest/metadata provenance to the actual accepted group while retaining its catalog revision, chunks, and counts; those changed publication-pointer/metadata bytes are included in the one-publication approval. This is outage and fail-closed evidence, not positioned-debris coverage.

**Version 2.3.1 presentation contract:** only exact orbit `ALL` plus object type `DEBRIS` activates the debris-oriented facets, which are derived in the client from unchanged tracked fields, so the tracked schema and raw manifest/chunk API remain at Version 2.3.0. Ordinary orbit/object/history/tag filtering remains independent outside that special panel. Reported-RCS bands include an explicit not-reported-or-invalid state. No mass or weight filter exists because the admitted sources do not supply authoritative mass. A red marker identifies only an authoritative `DEBRIS` object type with validated current elements; it is never a hazard, collision-risk, proximity, physical-size, mass, or RCS-magnitude signal.

`/api/gp-metadata` exposes the generated `json/gp/GP.meta.json` sidecar unchanged. `/api/tracked-objects/manifest` exposes the current atomic tracked pointer, and the chunk route exposes only manifest-referenced files after byte/hash/count validation. `/api/data-update-status` publishes a deterministic server `data_revision` over GP, compatibility TLE, SATCAT, tracked, launch, and decay revisions, exposes every component directly and under `datasets`, and retains GP-only `catalog_revision` for compatibility. It reconstructs all six dataset histories from their metadata after restart, merges live results, and recursively bounds, normalizes, and credential-redacts public nested error text. Consumers connected to the server should use `data_revision` for cross-dataset refresh detection. Static deployments compute a separate packaged-file token because they have no mutable provider state.

During the one-release TLE compatibility window, `export-gp` can enrich its UI-facing `company` group/tag from the first meaningful compatibility record with the same complete canonical NORAD string. If no compatibility match exists, a prior meaningful GP tag is retained before the current provider placeholder is used. `GP.meta.json.tag_enrichment` binds the compatibility file, its catalog revision, a deterministic tag-map revision, and available/matched/tagged/unmatched counts. This is a temporary display-filter enrichment boundary, not TLE-derived orbital state, not an operator-identity claim, and not a reason to truncate or exclude six-digit GP records. Raw tag keys remain stable for filtering and shared links, while category-colliding labels are qualified in the UI; the raw `GEO` tag is displayed as `Geosynchronous group` and does not change orbit classification. The current checked-in snapshot contains 190 GP records classified as `MEO`; that count is regression context for these bytes, not an authoritative provider-coverage invariant.

All CelesTrak endpoints configured by `tools/satellite_data_tools.py`, including the four preferred GP group requests, the default TLE `active` request, and the legacy-compatible `export-tle --all` group list, use HTTPS. The shared fetch boundary rejects non-HTTPS and credential-bearing ingestion URLs before any request or injected fetcher is called.

### v2.1-v2.3.1 Orbital-Source Adapter Registry

`js/domain/orbitalSourceAdapters.js` implements bounded normalization contracts. `js/orbit/multiFormatPropagationService.js` implements the matching propagation/interpolation dispatch. Version 2.3.1 retains these contracts for the preferred CelesTrak OMM JSON profile and separate Version 2.3.0 metadata-only SATCAT publication contract. Parser support and a configured local feed remain distinct from provider admission; redistribution is authorized for the exact Version 2.2.1 bytes and, separately, for the final Version 2.3.1 derivatives within the one-publication channel and byte scope recorded above.

| Format | Implemented behavior | Admission and screening status |
| --- | --- | --- |
| `TLE_JSON` | Validates legacy TLE pairs and identity, decodes numeric/Alpha-5 identifiers, preserves explicit provenance, and propagates with satellite.js SGP4 in UTC/TEME | Deprecated compatibility subset; Alpha-5 does not establish complete six-digit coverage |
| `CCSDS_OMM_JSON` | Requires canonical OMM SGP4 fields, normalizes only the documented CelesTrak omitted constants, preserves complete string identity and original JSON, and propagates through `json2satrec` | Preferred position profile; Version 2.2.1 bundled GP bytes have scoped redistribution approval, while completeness and future-refresh review remain open |
| `CCSDS_OMM_KVN` | Parses one bounded KVN message, rejects duplicate/unsupported fields, and preserves the original KVN text | Same open admission gates as OMM JSON |
| `CCSDS_OEM_KVN` | Parses bounded tabulated states with explicit frame/time/units and original-message preservation | Multi-format service supports bounded linear interpolation without extrapolation or frame conversion; full-catalog screening currently requires TEME; no OEM provider is admitted |
| `PROVIDER_EPHEMERIS_JSON` | Parses bounded provider records and samples with explicit provenance, frame, UTC, km, and km/s | Contract only; no provider schema/profile, license, authentication, retention, or redistribution approval exists |
| SATCAT enrichment, lifecycle events, and tracked inventory | Builds an unambiguous identity index, preserves launch/object/lifecycle/RCS metadata, emits details-only events independently of orbit availability, and publishes current/history tracked chunks with exact GP availability joins | Underlying Version 2.2.1 SATCAT/launch/decay bytes retain scoped approval; final post-recording Version 2.3.1 tracked manifest/chunks/quarantine have one-publication exact-byte approval. Provider completeness and every future-refresh review remain open. |

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

No public catalog-upload route exists in Version 2.3.1. Adding one changes the attack, privacy, licensing, and operational boundary and requires a separate review.

For bundled catalog registration, Version 2.3.1 retains the Version 2.1 `NEW`, `CHANGED`, stable observed, `ABSENT`, and `REAPPEARED` semantics by stable object/element identity. These observation transitions remain separate from SATCAT lifecycle and GP element availability. Normal scheduled GP/TLE updates are incremental `PARTIAL` upserts and never generate `ABSENT`. A scheduled GP reconciliation may emit absence only after structurally valid, quarantine-free responses from all four configured groups are promoted as `COMPLETE`; explicit full (`mode=all`) snapshots remain complete-source evidence only for their configured partial scope. If the prior catalog has at least 1,000 records, the candidate must also retain at least 75% of its record count and 75% of its canonical NORAD identities. The same dual guard protects SATCAT replacement. Failed, partial, conditional-without-matching-revision, guard-rejected, or unrecognized source modes must not turn missing records into absence. Authenticated catalog API documents omit private snapshot and metadata paths.

Durable-service bootstrap semantically validates preferred packaged GP/OMM records before SQLite registration. Malformed GP or GP with no propagatable observations falls back to a readable bounded nonempty packaged TLE array with at least one observation-shaped record and visible reduced coverage; strict TLE adapter/propagation validation remains a runner boundary. If neither source reaches its stated boundary, registration fails closed. This local compatibility fallback does not change source admission, completeness, or redistribution status.

Provider maintenance is disabled unless `--update-data-on-schedule` or `npm run serve:update` is selected. The daily profile evaluates GP, compatibility TLE, SATCAT, tracked, launch, confirmed-decay, and reconciliation clocks independently, requests each configured GP group at most once per due cycle, coalesces SATCAT-derived work into one provider request per cycle, rebuilds tracked data only from local accepted snapshots, and keeps historical launch/decay events when a later SATCAT snapshot omits them. During source-scope migration, a failed or `304`-only four-group cycle remains due and retries without inherited active-only validators. Content-identical results do not rewrite data or create backups; accepted conditional revalidation advances freshness only after the configured source scope is verified. Failures preserve last-known-good artifacts and retry with bounded jittered backoff; a dead or expired single-writer lock can be recovered. Scheduled maintenance always enforces the dual shrink/identity guard: `--force` does not bypass it, and the explicit direct-command `--allow-large-catalog-shrink` option is intentionally absent from `maybe-update` and `server.py`. A component revision changes only after its bytes change successfully, so the server composite revision can advance without an unrelated GP promotion. GitHub Pages and other static hosts cannot run this scheduler.

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
| JPL Horizons-derived ephemeris | Solar-system visualization only; never a conjunction input | Exact Version 2.2.1 bundled bytes are covered by the scoped 2026-08-29 data-owner redistribution approval; generation method and frame/units are documented, while independent validation remains open |
| Local textures and 3D models | Visual presentation only; never a screening input | Known attribution is shown where available; unresolved texture provenance remains explicitly documented and blocks a complete asset-governance sign-off |
| Vallado/CelesTrak SGP4 verification subset | Executable propagation validation | Source, tolerances, checksums, and license status are tracked by the v2.0 validation corpus manifest |

## Freshness and Failure

- Freshness thresholds are source-specific and versioned with the admission record.
- Screening evaluates element age at the window boundaries and for each participant at TCA. Ages are signed so a future element epoch remains distinguishable from a fresh past epoch.
- The UI and result contracts distinguish complete, partial, degraded, stale, future-epoch, and unavailable states; source status and full dataset provenance remain attached to events and exports.
- When GP metadata is absent, local data health reports `fallback-tle` if the packaged TLE file is larger than the empty `[]` sentinel and `unavailable` if no such artifact exists. With GP metadata present, normal `current`/`partial`/`degraded` evaluation applies. The fallback field reports artifact availability, not successful TLE parsing or propagation.
- Network, parser, or suspicious-shrink failure preserves the last-known-good dataset and its original successful content timestamp. A validated `304` records a separate successful revalidation time that resets due age without claiming new provider bytes.
- Screening results and release evidence must record source retrieval time or explicitly mark it unknown. Synthetic/reference validation cases instead record their fixed element epochs and source-package checksums.
- Credentials are read from the environment or an external secret store and are never logged, shared, or committed.
- Private durable-service catalog snapshots, revision descriptors, acquisition records, original source records, SQLite state, and job artifacts remain under `runtime/` and are excluded from the static artifact. Their retention must follow the provider admission record; repository inclusion is not permitted by default.
- Unknown object type or lifecycle remains `UNKNOWN`. The service does not infer payload, rocket-body, debris, active, or decayed status from a name. Mission-related remains zero unless the admitted source provides an independent classification.
- Small or missing `RCS` never excludes a SATCAT record. `rcs_m2` is provider-published radar cross-section, not diameter, and `physical_size_estimate` remains null.
