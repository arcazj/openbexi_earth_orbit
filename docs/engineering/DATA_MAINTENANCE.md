# Data maintenance

The Python server checks source clocks on startup and then daily. `npm run serve` enables this by default; `npm run serve:update` and `--update-data-on-schedule` are compatible explicit forms. Use `--no-data-update` for offline service. Maintenance runs in a private candidate and promotes only a coherent validated closure; it never rewrites checked-in release data.

Server intervals: `--gp-update-interval-hours`, `--tle-update-interval-hours`, `--satcat-update-interval-hours`, `--tracked-update-interval-hours` and `--reconciliation-interval-hours`. Provider admission and pauses still apply; a short interval or `--force` cannot promise newer upstream data. Health thresholds are separate from schedules.

## Tool behavior

Run `node scripts/python.mjs tools/satellite_data_tools.py --help` and each subcommand's `--help` for exact options. Commands operate on `--root`; use an isolated root for experiments.

| Command | Behavior |
| --- | --- |
| `export-gp` | Preferred GP/OMM positions; incremental PARTIAL upserts by default, preserving identities not observed in that response |
| `export-tle` | Deprecated numeric/Alpha-5 compatibility subset; cannot cover all six-digit identities |
| `refresh-satcat` | Refresh authoritative lifecycle/launch metadata subject to provider admission |
| `build-launches` / `build-decayed-db` | Derive launch/confirmed-decay events; retain prior confirmed history when later snapshots omit it |
| `build-tracked` | Local derivation and GP availability join; does not request providers |
| `maybe-update` / `stage-update` | Evaluate independent due clocks and coordinate admitted work; candidate staging preserves release snapshots |
| `plan` / `resume-provider` | Inspect admission; resume only after investigating the provider failure |
| `import-candidate` / `validate-candidate` / `promote-candidate` | Import, verify and atomically select a private snapshot |

`--all` requests complete reconciliation for the configured source scope. It is not an unrestricted fresh download or a global-completeness claim. Normal incremental updates do not mark absent objects. Reconciliation requires complete, quarantine-free group responses plus shrink/identity guards before absence is admitted. Missing GP elements never establish decay.

Useful options: `--dry-run` previews work; `--force` bypasses local freshness only; `--refresh-satcat` and `--refresh-launch-dates` select enrichment. `--interval-hours`, `--gp-interval-hours`, `--tle-interval-hours`, `--satcat-interval-hours` and `--reconciliation-interval-hours` set tool clocks. `--allow-large-catalog-shrink` and `--allow-space-track-fallback` are explicit exceptional controls; investigate the source and credentials/terms before using them.

## Freshness and failures

Inspect `/api/data-update-status` and the bottom data-health details. Successful revalidation can advance `checkedAt` without changing bytes or `contentAt`. Failed attempts never advance successful checks. SATCAT-derived data must match source lineage; planned checks and next permitted provider attempts are different times. Provider errors pause requests, retain the accepted revision and expose bounded diagnostics. See [health contract](DATA_HEALTH_V1.md) and [data sources](../governance/DATA_SOURCES.md).

Static hosts have no scheduler or direct provider access; they change only when a coherent new artifact is deployed. No mode guarantees data that the provider has not published or admitted.
