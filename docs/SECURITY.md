# Security

Report vulnerabilities privately to [Jean-Christophe Arcaz](mailto:arcazj@gmail.com). Do not include credentials or private runtime datasets in public issues.

The application remains development / experimental / non-operational. The default server binds loopback. Its bearer roles are local development controls, not a hosted identity service; public deployment requires a separate identity, TLS, resource-limit and operations review.

Current controls include bounded parsing and requests, scoped authorization, path confinement, content-addressed tracked chunks, shared provider admission, strict candidate validation and atomic last-known-good promotion. Errors expose bounded diagnostics; source credentials and runtime paths stay private.

The static app includes an explicit file allowlist. The Python server serves selected Help documents only, not the whole docs tree or repository. Inline bootstrap/style code prevents a complete strict CSP today; a dependency audit is not independent security approval.

See [threat model](engineering/THREAT_MODEL.md), [2.5 review scope](engineering/SECURITY_REVIEW_V2_5.md), [server setup](engineering/SERVER_DEPLOYMENT.md) and [recovery](engineering/ROLLBACK.md).
