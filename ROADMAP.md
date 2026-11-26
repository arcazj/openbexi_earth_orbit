# OpenBEXI Earth Orbit Roadmap

**Version 2.6.1 was released on November 26, 2026.** Its scientific classification is experimental and non-operational.

## Delivered in 2.6.1

- Flight-by-flight spacecraft model reviews, textured downloads and catalog filters in both viewers.
- On-selection persistence of newer orbital elements and durable provider admission writes for incremental updates. [Release notes](docs/RELEASE_NOTES.md)

## Delivered in 2.6.0

| Area | Implemented and checked locally |
| --- | --- |
| Local catalog and model API | Versioned, read-only search, NORAD details and shared model downloads ship with 2.6. The REST API accordion below Timelines includes the offline OpenAPI contract. [API walkthrough](docs/SWAGGER.md#catalog-and-models) |
| Catalog search and controls | Tracked-object results support multi-term search, availability tabs and keyboard selection. The right panel aligns with the UTC clock, puts the expandable model viewer above Catalog data and resets OMM details on selection. Clear restores the active tab and sort order. The search and Clear controls fit at 320 px. |
| Satellite Model Viewer | The bundled manifest maps 1,926 profiles to 1,313 distinct model file sets. Two broadband prototypes share one model, and the 396 production spacecraft in the snapshot share another. Two other constellations share models by hardware generation. |
| GEO models | Revised models cover several communications platforms and their flight configurations. One has a 46 m deployed span, cross-shaped solar wings and side-mounted reflector banks. Model diagnostics identify illustrated designs, estimated dimensions and catalog outlines. |
| Communications fleet | Eighteen cataloged spacecraft use eleven illustrated exteriors, including compact C-band, hybrid communications and dual-reflector configurations. |
| Globe and orbit | The selected orbit crosses the spacecraft center. A face-on view shows the full orbit. Live tracking follows high-latitude communications and navigation passes. Filtering out a spacecraft restores the globe camera's depth precision. A GEO test checked Earth-facing antenna orientation. |

The official GitHub release provides runnable static archives, checksums and the verification record for the tagged commit. [2.6.0 downloads](https://github.com/arcazj/openbexi_earth_orbit/releases/tag/2.6.0) · [Prerelease regression results](release/evidence/v2.6.0-development-checks.json) · [Release checklist](docs/engineering/RELEASE_CHECKLIST.md)

## Delivered in 2.5

- 2.5.1: visible Solar System unit selectors beside Play/Pause and Live in both views, explicit rate labels, Advanced year/s, keyboard operation and narrow-screen checks. Unit changes preserve UTC, multiplier and playback state. Educational mode is now the default with unchanged illustrative sizes; precise mode enforces physical body radii and supports close inspection.

- Six-source health reporting with UTC content/check/attempt times, lineage, provider delays, failure retention and a quiet bottom disclosure.
- Lazy Solar System playback loading, shared requests/cache and retry; precise mode and complete JPL guides retained from 2.4.
- Live UTC and true 1× in both views, explicit accelerated units, elapsed-time recovery and nominal per-body spin rates. Precise body orientation/libration remains outside the qualified scope.
- 544 frozen JPL interpolation checks plus 48 independently implemented SGP4 holdouts, with unchanged sampled tolerances.
- Bounded server admission and idle-preconnection handling, revision continuity, recovery rehearsals and four browser profiles.
- Commercial notice for new material, public source, retained MIT/upstream rights, concise documentation and isolated private history.

## Next qualification work

| Priority | Work | Completion evidence |
| --- | --- | --- |
| 1 | Reduce startup and frame cost | Measure the 2.6 build on named hardware with current and doubled catalogs. The targets are 4 s for core readiness and 33 ms for the p95 globe frame. The last recorded browser performance baseline is from 2.5. |
| 1 | Independent science review | Review frames, timescales, interpolation/propagation errors and reference independence; approval on pinned data/code |
| 1 | Rights provenance | Resolve exact origin/terms of legacy visual assets and customer data redistribution; optional hosted dependency/container inventory |
| 1 | Security review | Independent assessment of API authorization, input/resource limits, provider updates and private storage |
| 2 | Physical-device and accessibility coverage | Real GPU, Safari/iOS and Windows keyboard checks; application-wide accessibility audit |
| 2 | Hosted operations | Explicit identity/TLS design, backups, restore drills, alerting and deployment approval |
| 3 | Collision-risk research | Covariance/CDM provenance and validated uncertainty handling before any probability or maneuver recommendation |

No SLA, operational certification, billing, DRM or hosted identity service is delivered. Preserve legacy views, single-section menus, filters, timelines and last-known-good data while addressing these gaps. See [release checklist](docs/engineering/RELEASE_CHECKLIST.md) and [evidence](docs/TESTING.md).
