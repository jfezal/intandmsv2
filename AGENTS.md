# IntanDMS V2 — AI development instructions

## Authority and current status
- Company: Sisi Awan Technologies Sdn Bhd; the human user is the Product Owner.
- Current state: documentation-only architecture proposal, not approved implementation.
- Read README.md and docs/REQUIREMENTS.md, docs/SYSTEM_ARCHITECTURE.md,
  docs/DEVELOPMENT_STANDARDS.md, and docs/DEVELOPMENT_ROADMAP.md before work.
- Distinguish confirmed requirements, proposals, and unknowns; never invent business rules.
- Obtain Product Owner approval before implementing application features or changing major architecture.
- Do not deploy, modify production infrastructure, push to GitHub, or perform irreversible
  operations without explicit approval for that action. Implementation approval is not push approval.
- Preserve existing files and user changes; inspect Git status and applicable instructions first.
- Do not access the separate intanDMS repository unless the user authorizes that scope.
- Do not delegate to subagents unless explicitly requested or required by applicable instructions.

## Engineering rules for approved implementation
- Follow the proposed modular boundaries only after approval; record deviations in an ADR.
- Use strict TypeScript, environment-validated configuration, and pinned dependency versions.
- Keep business logic out of controllers/UI; repositories own persistence, adapters own integrations.
- Enforce authentication and resource authorization server-side on every read and mutation.
- Never trust client-supplied organization IDs, document IDs, paths, MIME types, or permissions.
- Treat uploaded files, external connectors, OCR, and preview processors as hostile-input boundaries.
- Keep binaries out of PostgreSQL; never use a user filename as a storage key.
- Never expose a file before required scanning and permission checks have succeeded.
- Use migrations, transactions, concurrency controls, and an outbox for DB-to-job handoff.
- Make workers idempotent; Redis/Valkey and search are not authoritative databases.
- Do not log secrets, bearer tokens, raw document text, or unnecessary personal data.
- Audit sensitive actions; keep operational logs distinct from business audit records.
- Add positive and negative authorization tests and failure-path tests with each feature.
- No retention deletion or remote-source deletion without approved policy and safety controls.
- Keep API contracts, tests, configuration documentation, and operational notes synchronized.
- Review dependency licenses, vulnerabilities, Node 24 support, and Docker base images.
- Do not claim tests/builds passed unless actually executed; report blocked checks honestly.

## Completion and handoff
- Use small, reviewable changes; do not commit unrelated files or generated secrets.
- Run approved formatter, lint, typecheck, unit, integration, and applicable end-to-end checks.
- Inspect the final diff; report changed paths, tests run, risks, and decisions still required.
- Commands in planning documents are not proof that tooling exists; inspect before running.
- Stop at the current approval gate and wait for the Product Owner's direction.
