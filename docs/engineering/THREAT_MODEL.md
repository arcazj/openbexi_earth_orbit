# Threat model

Scope: browser/worker, static artifact, local Python API, provider ingestion, private candidate storage and authenticated durable jobs. Scientific maturity is experimental; public multi-user hosting is outside the qualified boundary.

| Boundary / threat | Controls and residual risk |
| --- | --- |
| Provider data, catalog metadata and Markdown | Bounded schemas, canonical IDs, safe text rendering and sanitized links; malformed/partial sources retained as failures, never promoted |
| Files and static serving | Explicit allowlists, traversal/symlink confinement, content-addressed chunks and complete closure/hash checks; local filesystem compromise remains possible |
| Updates and concurrent readers | Persistent OS advisory writer lock, candidate validation, cancellation/drift checks and atomic pointer; last-good root retained on activation failure |
| Authenticated jobs | Independent role tokens, object authorization, idempotency, bounded requests/jobs/results and isolated worker environment; hosted identity/revocation design remains pending |
| Resource exhaustion | Bounded catalog/archive sizes, eight request handlers, finite admission/idle/transfer timeouts and worker budgets; deployment capacity still requires load testing |
| Dependencies | Exact npm versions, vendored hashes/notices, CI audit and SBOM; audit success is not proof of safety |
| Exports/logs | Bounded diagnostics and secret/path redaction; private backups and runtime artifacts must remain private |
| Release supply chain | Exact-commit build, curated static closure, uploaded-tar verification and deployed-byte attestation; environment approvals must be configured separately |

No public upload/provider-credential or candidate-management endpoint is added. Such changes require explicit authorization design, threat review, negative tests and recovery planning. Strict CSP, independent assessment, production identity/TLS and complete third-party provenance remain open. See [2.5 review](SECURITY_REVIEW_V2_5.md).
