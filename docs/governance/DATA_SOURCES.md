# Data sources and scope

2.5 retains the public v2.4 catalog, playback, guide and visual-asset bytes. New scientific additions are frozen numerical holdouts. Owner authorization covers this public GitHub source/prerelease; it does not establish new provider rights or qualify future customer redistribution.

| Source | Admitted use / limits |
| --- | --- |
| CelesTrak GP/OMM | Preferred position source: active plus fengyun-1c-debris, iridium-33-debris and cosmos-2251-debris groups. Event debris groups are partial coverage, not a global inventory |
| CelesTrak TLE | Deprecated numeric/Alpha-5 compatibility subset; no complete six-digit coverage |
| SATCAT | Object identity, launch and confirmed-decay metadata; metadata-only objects have no fabricated position |
| Tracked/launch/decay derivatives | Derived from exact accepted source revisions; prior confirmed events retained; missing elements are not decay evidence |
| NASA/JPL Horizons | Bounded playback, complete-orbit guide tables and independent-query holdouts; same physical model and no extrapolation beyond playback bounds |
| Historical SGP4 references | Frozen test inputs/expected vectors with original upstream record; runtime uses MIT satellite.js |

## Provider access

[CelesTrak's usage policy](https://celestrak.org/usage-policy.php) limits repeated retrieval and requires investigating HTTP errors. The shared persistent ledger, conditional requests and pause/resume controls prevent retries from bypassing admission. Default daily schedules and health thresholds are separate from provider publication cadence. A current check never proves all orbital elements are fresh.

The policy describes access, not a blanket sublicensing grant. Existing exact-version approvals remain in Git history; broader commercial redistribution of provider data requires an exact-scope rights review. No Space-Track credentials, scraping or alternative provider are silently admitted.

[NASA/JPL SSD publication guidance](https://ssd.jpl.nasa.gov/faq.html#gen2) identifies its data as public domain and requests source attribution. Retrieval dates, request parameters, reference frames, units, response hashes and generated-table modifications accompany the JPL data. No NASA/Caltech/JPL endorsement is implied.

## Update integrity

Incremental PARTIAL upserts preserve absent identities. Reconciliation marks absence only for a complete configured scope after structural, quarantine and dual count/identity guards; it is not confirmed decay. Normal updates cannot bypass provider pauses or shrink guards. Source groups that produced accepted bytes remain distinct from requested groups.

Candidates must contain coherent data/metadata revision pairs, all tracked chunks and current GP/SATCAT lineage. Private promotion is atomic; cancellation, drift, invalid responses or storage failure leave the accepted root intact. Static deployments receive a prevalidated closure and cannot run the scheduler.

## Formats and future admission

TLE_JSON and the documented CelesTrak CCSDS_OMM_JSON profile are current position inputs. OMM KVN, OEM KVN and provider ephemeris contracts exist; parser support is not provider admission. Tabulated TEME/GCRF/ITRF support does not imply frame/time conversion; durable screening requires UTC/TEME. No new OEM/provider feed is admitted.

Before adding a provider, record authoritative endpoint, access/credential and retention/redistribution terms, source owner, schema/frame/time/units, cadence/outage behavior, integrity, quarantine/rollback and independent fixtures. Default adapters cap input at 32 MiB, 100,000 records, 250,000 KVN lines, 16,384 bytes/line, 20,000 ephemeris samples and 200,000 SATCAT rows; increasing limits requires resource review.

See [maintenance](../engineering/DATA_MAINTENANCE.md), [health contract](../engineering/DATA_HEALTH_V1.md), [domain contracts](../orbital-domain-contracts-v2.md) and [third-party notices](../THIRD_PARTY_NOTICES.md).
