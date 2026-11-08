# OpenBEXI Earth Orbit Roadmap

Current version: **2.5.0 development / experimental / non-operational**. The GitHub prerelease label does not qualify the app for operational decisions.

## Delivered in 2.5

- Six-source health reporting with UTC content/check/attempt times, lineage, provider delays, failure retention and a quiet bottom disclosure.
- Lazy Solar System playback loading, shared requests/cache and retry; precise mode and complete JPL guides retained from 2.4.
- 544 frozen JPL interpolation checks plus 48 independently implemented SGP4 holdouts, with unchanged sampled tolerances.
- Bounded server admission and idle-preconnection handling, revision continuity, recovery rehearsals and four browser profiles.
- Commercial notice for new material, public source, retained MIT/upstream rights, concise documentation and isolated private history.

## Next qualification work

| Priority | Work | Completion evidence |
| --- | --- | --- |
| 1 | Reduce startup and frame cost | Repeat current/doubled workloads on named hardware; meet 4 s core readiness and 33 ms p95 globe frame targets without synthetic clocks |
| 1 | Independent science review | Review frames, timescales, interpolation/propagation errors and reference independence; approval on pinned data/code |
| 1 | Rights provenance | Resolve exact origin/terms of legacy visual assets and customer data redistribution; optional hosted dependency/container inventory |
| 1 | Security review | Independent assessment of API authorization, input/resource limits, provider updates and private storage |
| 2 | Physical-device and accessibility coverage | Real GPU, Safari/iOS and Windows keyboard checks; application-wide accessibility audit |
| 2 | Hosted operations | Explicit identity/TLS design, backups, restore drills, alerting and deployment approval |
| 3 | Collision-risk research | Covariance/CDM provenance and validated uncertainty handling before any probability or maneuver recommendation |

No SLA, operational certification, billing, DRM or hosted identity service is delivered. Preserve legacy views, single-section menus, filters, timelines and last-known-good data while addressing these gaps. See [release checklist](docs/engineering/RELEASE_CHECKLIST.md) and [evidence](docs/TESTING.md).
