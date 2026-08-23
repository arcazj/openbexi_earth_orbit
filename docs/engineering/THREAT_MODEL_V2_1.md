# v2.1 Full-Catalog Service Threat Model

> Current application context: Version 2.2 reuses this durable-service boundary with preferred GP/OMM catalog input. Its provider/update, mixed-format validation, lifecycle-cache, static-packaging, and browser state/time/motion risks are covered by `THREAT_MODEL_V2.md`, ADR 0004, ADR 0005, and `RELEASE_CHECKLIST_V2_2.md`. This historical v2.1 model does not grant provider admission or operational approval.

Last reviewed: 2026-08-23

## Scope and Trust Boundary

This model covers the development `/api/v1` service, private runtime directory, SQLite store, catalog snapshot registry, Node screening subprocess, browser client, and SSE connection. It supplements the v2.0 browser/static model in `THREAT_MODEL_V2.md`.

The supported deployment is one trusted local machine on a loopback bind. Bearer tokens distinguish viewer, analyst, and administrator capability but do not provide production identity, tenancy, revocation workflows, or account recovery. Non-loopback exposure is outside the approved boundary.

## Assets

- bearer tokens, cursor-signing secret, and future provider credentials;
- original orbital messages and immutable catalog snapshots;
- job request/configuration, candidate, event, error, progress, audit, and replay records;
- SQLite database and per-attempt input/result artifacts;
- scientific integrity of complete/partial status, provenance, checksums, and attempt ownership.

## Threats and Current Controls

| Threat | Current development controls | Remaining gap |
| --- | --- | --- |
| Unauthorized read or mutation | Header bearer authentication, ordered roles, constant-time digest comparison, minimum token length, negative permission tests | No production identity provider, token expiry, revocation API, tenant isolation, or object-level sharing model |
| Credential disclosure | Process environment, tokens rejected in URLs, browser page-memory token, no-store/no-referrer fetch, explicit child-environment allowlist excluding API/provider secrets and `NODE_OPTIONS` | Environment inspection and local process compromise remain possible; no managed secret store integration |
| Request/resource exhaustion | Loopback default, per-principal rate limits, bounded JSON/query/cursor fields, normalized job limits, one worker, catalog/result caps, coalesced progress with a 512-record-per-attempt ceiling | No global queue quota, disk quota, reverse-proxy limit, admission cost model, outbox retention automation, or multi-user fairness |
| Path traversal or artifact exposure | Runtime path confinement, safe job IDs, immutable content-addressed catalog/metadata/descriptor files, append-only acquisition records, static allowlist, and negative-exposure tests | Target filesystem permissions and backup handling remain operator responsibilities |
| Catalog/parser abuse | Explicit format, provenance requirement, byte/record/line/sample limits, preferred-GP semantic validation before registration, observation-shaped TLE bootstrap checks, and strict runner validation before screening | Bootstrap does not perform full fixed-column/checksum/satellite.js TLE validation; no sandbox beyond the Node subprocess, file-content malware scanning, provider signature verification, or admitted remote ingestion path |
| Stale worker corruption | Durable claims, worker/attempt fencing on progress/import/completion, transactional import, restart recovery tests | Single SQLite process boundary only; distributed leasing is unsupported |
| Result substitution or partial-as-complete | Immutable input hash, atomic output, result checksum, versioned configuration, explicit errors/coverage/quality | Independent scientific review and external truth-set comparison remain open |
| SSE replay or cursor tampering | Header authentication, `Last-Event-ID`, signed filter-bound cursors, bounded streams, query-token rejection | No reverse-proxy buffering/timeout qualification or public reconnect capacity evidence |
| Database loss or rollback failure | WAL, referential constraints, audit records, conservative retention APIs | No automated backup, online snapshot, restore tooling, encryption-at-rest policy, or rehearsed recovery |
| Cross-origin/public exposure | Loopback bind default, exact loopback CORS defaults, non-loopback acknowledgement required | No approved TLS proxy, CSP completion, public WAF, monitoring, incident response, or security review |

## Scientific Abuse Cases

- Treating `SUCCEEDED` job state as proof of complete pair coverage.
- Treating no returned events as proof of safety when source, propagation, motion bounds, or coverage-affecting caps made the result partial, or when a result-retention cap truncated the response.
- Treating miss distance as collision probability or a maneuver threshold.
- Mixing frames or time scales because an adapter can parse them; the runner requires a common UTC/TEME scope.
- Assuming the legacy TLE snapshot covers six-digit identifiers or reliably classifies every object.
- Replaying old frozen inputs as though they were current provider data.

UI, API, exports, and operator documentation must preserve maturity, safety class, source age, catalog revision, algorithm/configuration identity, result status, quality flags, and unavailable Pc state.

## Public-Deployment Blockers

Before any non-loopback deployment, require independent security review, TLS, managed identity and secrets, token rotation/revocation, tenant/object authorization, request and disk quotas, subprocess/resource isolation, monitoring and alerting, retention/deletion policy, encrypted backups, restore rehearsal, dependency/container scanning, incident ownership, and approved data-provider terms.

Any catalog upload, remote ingestion, report rendering, webhook, alert, or CDM endpoint requires a new threat-model review. Version 2.1 implements none of those public surfaces.
