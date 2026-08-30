# Security Policy

## Supported Work

The current Version 2.2 development line receives security fixes. Historical demonstration pages are not guaranteed to receive the same hardening as `index.html` and `server.py`.

Report suspected vulnerabilities privately to the repository maintainer before opening a public issue. Include affected version, reproduction steps, impact, and any known workaround. Do not include credentials or sensitive local data.

## Server Boundary

`server.py` is local-first. Its unversioned catalog/health routes are read-only; the optional authenticated Version 2.1 durable-service routes admit bounded screening job mutations and private SQLite/runtime state. It binds to `127.0.0.1` by default; a non-loopback host requires `--allow-public`. Provider maintenance is separately default-off and starts only with `--update-data-on-schedule` or `npm run serve:update`. Public deployment also requires TLS termination, an explicit CORS origin, managed identity/secrets, rate and resource limits, outbound-provider policy, monitoring, backup/restore, provider/data review, and review of the static allowlist.

The built-in bearer roles are development controls, not a production identity service. The scheduler uses public HTTPS sources and must keep credential-gated or scraper fallbacks disabled. Its shared lock, content-aware atomic promotion, complete-source reconciliation boundary, dual size/identity shrink guard, collision-safe seven-backup retention, last-known-good preservation, restart-persistent five-dataset errors, recursive public diagnostic redaction, and bounded retry reduce but do not remove local filesystem, provider-compromise, or resource-exhaustion risk. `--force` cannot bypass the shrink guard, and the direct-command recovery override must remain unavailable to unattended maintenance. Do not add new mutations, upload/provider credentials, alert delivery, or privileged data routes without a threat model, object authorization, secret lifecycle, negative tests, resource limits, and audit/rollback design.

The repository-grounded browser, Worker, GP/OMM/SATCAT ingestion, dependency, export, and static/local-read analysis is in `docs/engineering/THREAT_MODEL_V2.md`. The authenticated durable-service boundary is in `THREAT_MODEL_V2_1.md`. Independent review remains required before public deployment.

## Known Constraint

A strict Content Security Policy is not yet enabled because current pages rely on inline module/bootstrap code and inline styles. Baseline anti-sniffing, framing, referrer, permissions, path-confinement, cache, and CORS controls are enforced by the Python server. Any public release requires either CSP-compatible page extraction or a documented, reviewed CSP exception. Version 2.2 also requires provider/redistribution evidence and a rehearsed coherent GP/TLE/SATCAT/launch/decay data-revision plus complete application-artifact rollback. Static hosting cannot execute the Python scheduler and must receive new data through a separately reviewed deployment workflow.
