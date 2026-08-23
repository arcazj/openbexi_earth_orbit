# Security Policy

## Supported Work

The current Version 2.2 development line receives security fixes. Historical demonstration pages are not guaranteed to receive the same hardening as `index.html` and `server.py`.

Report suspected vulnerabilities privately to the repository maintainer before opening a public issue. Include affected version, reproduction steps, impact, and any known workaround. Do not include credentials or sensitive local data.

## Server Boundary

`server.py` is local-first. Its unversioned catalog/health routes are read-only; the optional authenticated Version 2.1 durable-service routes admit bounded screening job mutations and private SQLite/runtime state. It binds to `127.0.0.1` by default; a non-loopback host requires `--allow-public`. Public deployment also requires TLS termination, an explicit CORS origin, managed identity/secrets, rate and resource limits, an immutable static artifact, monitoring, backup/restore, provider/data review, and review of the static allowlist.

The built-in bearer roles are development controls, not a production identity service. Do not add new mutations, upload/provider credentials, alert delivery, or privileged data routes without a threat model, object authorization, secret lifecycle, negative tests, resource limits, and audit/rollback design.

The repository-grounded browser, Worker, GP/OMM/SATCAT ingestion, dependency, export, and static/local-read analysis is in `docs/engineering/THREAT_MODEL_V2.md`. The authenticated durable-service boundary is in `THREAT_MODEL_V2_1.md`. Independent review remains required before public deployment.

## Known Constraint

A strict Content Security Policy is not yet enabled because current pages rely on inline module/bootstrap code and inline styles. Baseline anti-sniffing, framing, referrer, permissions, path-confinement, cache, and CORS controls are enforced by the Python server. Any public release requires either CSP-compatible page extraction or a documented, reviewed CSP exception. Version 2.2 also requires provider/redistribution approval and a rehearsed coherent GP/launch/decay data-revision plus complete application-artifact rollback.
