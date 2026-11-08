# Public data health contract v1

`GET /api/data-update-status` retains its existing fields and adds `health` (`schemaVersion: 1`). The UI uses that contract; plain static hosting derives the same display fields from packaged metadata and `data/health/policy.json`. Polling performs no provider requests. Revision watching coalesces requests and reloads catalogs only after an accepted revision change; selection, filters, camera and simulation clock are preserved by existing reconciliation.

Top-level fields: `observedAt` (UTC wall time), `clock: wall-utc`, `mode` (`live` or `snapshot`), aggregate `state`, six `datasets`, and bounded code-only `diagnostics`. Keys are `gp`, `tle`, `satcat`, `tracked`, `launch`, `decay`. Each row includes:

| Field | Meaning |
| --- | --- |
| `revision` | Accepted content identity; null when unavailable |
| `contentAt` / `contentAgeHours` | When these bytes were obtained or built; not an assertion about the epoch of every element |
| `checkedAt` / `checkAgeHours` | Last successful validation/revalidation; failures do not advance it |
| `lineageState`, `freshnessAt` / `freshnessAgeHours` | Derived data may reuse revalidation of its exact input revisions; its own check/content times remain unchanged. An older source revision is degraded. Unknown linkage cannot borrow a source's freshness. |
| `attemptedAt` | Last reported attempt, which may have failed |
| `nextPermittedAttemptAt` | Provider-ledger admission time if known; null for unknown/local derivations/paused requests |
| `nextScheduledCheckAt` | Scheduler wake time if known; distinct from permission to contact a provider |
| `thresholdHours` | Source-check age threshold; defaults to 48 hours for each dataset |
| `coverage` | Limited admitted scope, partial scope, or unknown; never inferred global completeness |
| `state` | Current, stale, partial, degraded, unavailable, or unknown; static aggregate is snapshot |
| `updateState`, `reason`, `dependencyIssues` | Bounded diagnostics; derived data cannot hide an unhealthy parent |

Configure each threshold using `OPENBEXI_HEALTH_<GP|TLE|SATCAT|TRACKED|LAUNCH|DECAY>_HOURS`, clamped to 2–8760 hours. Invalid/nonfinite values use defaults. Thresholds **do not change request admission or schedules**. Provider cooldown, persistent HTTP pause, validated candidate promotion and last-known-good retention remain authoritative. A 304 can advance `checkedAt` while preserving `contentAt` and revision. Element age for propagation remains relative to the calculation epoch.

Static mode promises no scheduled updates; SATCAT metadata is not shipped, so its check is explicitly unknown. The details panel distinguishes this from a failed live service. Event dates represent admitted observations; missing elements do not prove decay, and new metadata-only objects receive no synthetic positions. Predicted reentry remains distinct from confirmed decay.

The bottom disclosure lists UTC times, threshold, revision and action. Repeated unchanged polls do not rebuild its DOM or announce identical status. Structured server completion logs and health diagnostic codes support operators; external notifications are deferred. Existing scheduler errors report storage/publication failure while retaining the prior accepted pointer.
