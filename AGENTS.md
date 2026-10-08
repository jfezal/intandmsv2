# IntanDMS V2 — AI development instructions

## Authority and current status
- Company: Sisi Awan Technologies Sdn Bhd; the human user is the Product Owner.
- Current state: documentation-only architecture proposal, not approved implementation.
- Read README.md, requirements, system architecture, standards, and roadmap in docs/;
  also read ON_PREMISE_DEPLOYMENT.md, STORAGE_ARCHITECTURE.md, AUTHENTICATION_ARCHITECTURE.md.
- Distinguish confirmed requirements, proposals, and unknowns; never invent business rules.
- Obtain Product Owner approval before implementing application features or changing major architecture.
- Do not deploy, modify production infrastructure, push to GitHub, or perform irreversible
  operations without explicit approval for that action. Implementation approval is not push approval.
- Preserve existing files and user changes; inspect Git status and applicable instructions first.
- Do not access the separate intanDMS repository unless the user authorizes that scope.
- Do not delegate to subagents unless explicitly requested or required by applicable instructions.

## Engineering rules for approved implementation
- On-premise-first, customer-owned Ubuntu/Linux servers/VMs; fully functional without Internet.
- No mandatory cloud, third-party IdP, Keycloak, public DNS/ACME, or outbound telemetry.
- Local authentication is default: secure password hashing, sessions, lockout/rate limiting, RBAC/audit.
- LDAP/AD and OIDC are optional; never downgrade directory accounts to local authentication.
- Local filesystem and NAS/SMB/NFS storage are supported; S3-compatible storage is optional.
- Managed and external-reference modes are required; reference sources must NEVER be modified.
- Preserve versions via immutable snapshots; do not substitute current source bytes for historical content.
- PostgreSQL Full-Text Search is default behind an interface; OpenSearch is optional.
- OCR (Tesseract), previews, workers, dependencies, assets, and monitoring stay customer-local.
- Docker Compose installation must work offline using a verified release bundle and local TLS.
- Plan/test capacity, mount failures, local health, offline signature updates, backups, and restores.
- Follow the proposed modular boundaries only after approval; record deviations in an ADR.
- Use strict TypeScript, environment-validated configuration, and pinned dependency versions.
- Keep business logic out of controllers/UI; repositories own persistence, adapters own integrations.
- Enforce authentication and resource authorization server-side on every read and mutation.
- Never trust client-supplied organization IDs, document IDs, paths, MIME types, or permissions.
- Treat uploaded files, external connectors, OCR, and preview processors as hostile-input boundaries.
- Keep binaries out of PostgreSQL; never use a user filename as a storage key.
- Never expose a file before required scanning and permission checks have succeeded.
- Use migrations, transactions, concurrency controls, and an outbox for DB-to-job handoff.
- Make workers idempotent; queues and search projections are not authoritative business state.
- Do not log secrets, bearer tokens, raw document text, or unnecessary personal data.
- Audit sensitive actions; keep operational logs distinct from business audit records.
- Add positive and negative authorization tests and failure-path tests with each feature.
- No retention deletion without approved policy/controls; external-reference source deletion is prohibited.
- Keep API contracts, tests, configuration documentation, and operational notes synchronized.
- Review dependency licenses, vulnerabilities, Node 24 support, and Docker base images.
- Do not claim tests/builds passed unless actually executed; report blocked checks honestly.

## Completion and handoff
- Use small, reviewable changes; do not commit unrelated files or generated secrets.
- Run approved formatter, lint, typecheck, unit, integration, and applicable end-to-end checks.
- Inspect the final diff; report changed paths, tests run, risks, and decisions still required.
- Commands in planning documents are not proof that tooling exists; inspect before running.
- Stop at the current approval gate and wait for the Product Owner's direction.
