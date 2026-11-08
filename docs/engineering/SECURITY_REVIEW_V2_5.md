# 2.5 security and recovery review scope

The static artifact exposes only allowlisted application/public data. It contains no authenticated write service. The optional Python server binds loopback by default; it is not a hosted identity/TLS boundary. Existing v2.1 authenticated operations, request/resource limits, safe source IDs and path confinement remain in force. Browser metadata and provider responses are untrusted; rendering uses `textContent`, schemas admit bounded values, and private candidates become selected only after closure/lineage verification.

The local server retains eight request handlers and a 64-connection listen backlog. Unused connections have one second to supply a request line; active requests retain the 30-second transfer timeout. At capacity, the accept loop waits at most two seconds for a handler slot before rejecting the socket; it does not create queued worker threads. Previously, both short handler overlap and idle browser preconnections could reset module requests. Three-tab startup and real-socket idle-capacity regressions, overload rejection and slot-release tests are recorded in the delivery evidence.

| ASVS 5.0 review area | Local control / evidence | Status |
| --- | --- | --- |
| Encoding and sanitization | Health details use text nodes; errors use fixed diagnostic codes; existing XSS/input tests | Passed local automated checks; see delivery evidence |
| Validation/business logic | Strict JSON, coherent revision pairs, content-addressed chunks, budgets and atomic promotion | Passed local automated checks |
| Authentication/access control | Existing API token boundary and scope tests; no new admin endpoint | Passed local checks; hosted identity pending |
| Secure communication | Provider HTTPS; loopback default; no hosted deployment performed | Hosted TLS configuration/review pending |
| File/resource handling | Private path confinement, bounded uploads/archive members, candidate locks and storage failure retention | Passed local checks and isolated recovery rehearsal |
| Logging/error handling | Bounded/redacted legacy errors plus v1 code-only health diagnostics | Passed local redaction checks; external alerts deferred |
| Configuration/dependencies | Locked vendors; npm audit; runtime and tool inventory; explicit static exclusions | Passed local checks; independent review pending |

This maps relevant control areas, not a claim of ASVS certification. [OWASP ASVS](https://asvs.owasp.org/) is the review framework. Local reports distinguish failed/passed checks from unexecuted reviews. A successful audit is a point-in-time dependency check, not proof of absence of vulnerabilities.

`node scripts/python.mjs tools/rehearse_v25_recovery.py` exercises a synthetic accepted candidate, local tar backup, bounded restore, idempotent restore and restart in disposable roots. It never changes the user's data pointer or uploads a backup. `npm run rehearse:rollback` verifies the built static artifact and a reversible GP-only feature rollback, including integrity and licensing notices. Private customer agreements, runtime data and prompts are forbidden in the deployment artifact. Real hosted recovery, representative GPU testing and external scientific/security review remain separate qualification gates.
