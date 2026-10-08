# Development roadmap and approval gates

**Status:** revised on-premise sequencing, 2026-10-08. Product constraints confirmed; no implementation, time estimate, release deployment, or new push approved.

## Delivery policy

Work proceeds through explicit gates. Dependencies and security prerequisites take precedence over a fixed calendar. Estimates follow discovery, staffing, representative samples, and capacity/budget decisions.

All sixteen capabilities remain in overall product scope. A smaller first release must explicitly identify deferred capabilities; “enterprise-ready” cannot be inferred from an early prototype.

Confirmed baseline: customer-owned Ubuntu/Linux physical servers/VMs, intranet/offline operation, local authentication, filesystem/NAS/SMB/NFS, managed/read-only reference modes, PostgreSQL FTS, local Tesseract/previews/workers, Compose offline installation, backup/capacity/health administration, and no outbound telemetry. LDAP/AD/OIDC/S3/OpenSearch are optional enhancements, not prerequisites. Keycloak/cloud services are not required.

## Phase 0 — Discovery and architecture review (current)

Deliver:

- Repository/environment inspection and revised on-premise proposal, including deployment, storage, and local-authentication documents.
- Confirmed-versus-proposed requirements and decision register.
- Review of internal organization boundaries, local account/recovery policy, permissions, managed roots/reference snapshots, formats, workflow, retention, server sizing, and offline security maintenance.
- Proposed delivery scope, operating model, and dependency/license validation plan.

Exit gate:

- Product Owner approves or revises the architectural direction and authorizes a specific implementation phase.
- D-01, D-02, D-03, and D-11 implementation details resolved before foundation; D-04/D-05 before ingestion. Do not treat confirmed local-auth/FTS/on-premise defaults as still undecided.
- Other decisions are resolved or explicitly deferred with named blockers/owners.

**Current stop point:** documentation prepared; wait for approval. No application code begins automatically.

## Phase 1 — Engineering and security foundation

Proposed deliverables:

- Approved ADRs, initial module contracts, reviewed entity model, and threat model.
- npm-workspace TypeScript baseline, formatting/lint/typecheck, environment validation, and documented local setup.
- Reviewed baseline Compose topology and reproducible offline-capable images/assets; no optional IdP/S3/OpenSearch required, no production deployment.
- PostgreSQL migrations and migration tests; separated migration/runtime credentials.
- Local account/bootstrap/password hashing/login/lockout/rate limiting/recovery, secure session lifecycle, CSRF, scoped authorization, audit writer, Problem Details, and OpenAPI.
- Outbox/job intent, queue compatibility tests, logging/tracing, CI quality gates if approved.

Exit evidence:

- Reproducible clean setup; actual lint/typecheck/tests/build recorded.
- Positive/negative policy tests, session/CSRF tests, secret handling verified, and schema upgrades exercised.
- Pinned dependency compatibility/license review and minimum operational ownership agreed.
- Baseline starts with external Internet blocked, local certificates, preloaded images/assets, and no optional services; no telemetry leaves customer infrastructure.

Dependency: Phase 0 approval and foundation decisions. No default admin account/password or placeholder security bypass.

## Phase 2 — Secure document repository core

Proposed deliverables (FR-01, FR-02, FR-04, FR-08, FR-09, FR-10, FR-13):

- Repository/folder hierarchy and approved scoped permission behavior.
- Managed local-filesystem adapter, upload sessions, quarantine/scanning, checksums, non-overwriting file publication, and transactional DB acceptance with reconciliation.
- Authorized listing/download/move/rename and controlled lifecycle operations.
- Immutable document versions, current-version pointer, restore-as-new-version, conflict handling.
- Typed metadata/classification schemas and basic frontend journeys.
- Audit coverage, upload/file reconciliation, free-byte/inode checks, missing-mount safeguards, and local capacity/health administration.

Exit evidence:

- Authorization matrix covers source/destination moves, versions, metadata, and downloads.
- Malicious/malformed inputs remain blocked; scanner/storage failures cannot publish content.
- Duplicate requests, concurrent versions, abandoned uploads, and partial failures are tested.
- End-to-end upload/version/download journeys pass with synthetic fixtures.

Dependency: D-03, D-04, D-05, and applicable D-09 controls. Soft-delete/purge behavior is limited by D-07; no physical purge is enabled by default.

## Phase 3 — Processing, preview, and full-text search

Proposed deliverables (FR-05, FR-06, FR-07, FR-14):

- Local Tesseract/extraction/preview adapters with bundled languages/fonts/tools, isolation, limits, provenance, and job status.
- Approved format/language support and quality validation against representative samples.
- SearchPort and default PostgreSQL FTS with bounded text/vector chunks, GIN indexes, live permission joins, safe pagination/snippets/counts, and supported-language validation.
- Worker concurrency controls, bounded retries, failure quarantine, replay, and reconciliation.
- Projection/schema generations, local rebuild/health, protected previews, and verified offline scanner/language-data update procedures.

Exit evidence:

- Search exposes no unauthorized titles/snippets/counts/suggestions on revocation or move; unsafe aggregates are omitted.
- Parser/processor timeouts, source failures, stale/duplicate events, and queue outages are tested.
- Approved OCR accuracy and preview-fidelity acceptance is recorded; limits are documented.
- Search rebuild and durable-job recovery demonstrated.
- OCR/previews/FTS remain functional without Internet, optional search service, CDN fonts, or external document-resource fetches; stale scan signatures follow approved policy.

Dependency: D-05, D-08, D-09, D-11 implementation settings and local queue validation. PostgreSQL FTS is already the confirmed default. Core scanning exists in Phase 2; it is not deferred until advanced OCR.

## Phase 4 — Network storage and external-reference integration

Proposed deliverables (FR-03):

- NAS/SMB/NFS adapters with approved host mounts, managed DMS roots, read-only external-reference roots, and provenance; S3 remains optional later work.
- Least-privilege secret handling, connectivity diagnostics, allowlisted endpoints/roots, and isolated connector agents.
- Checkpoints, incremental sync, change-during-copy detection, full reconciliation, and health dashboards.
- Reference discovery with stable-copy validation, scanned immutable managed snapshots, version creation/history, source-change/conflict/missing status, and documented source-versus-DMS retention boundaries.

Exit evidence:

- Real representative connector tests cover authentication failure, network interruption, source changes, path escape, duplicate events, and scan-state recovery.
- Reference roots remain unchanged byte-for-byte and no sidecars/locks/renames/deletes are written; verify with source manifests and read-only permissions/mounts.
- Source outages cannot falsely delete records; managed history semantics remain intact.
- Missing mounts cannot cause local-path fallthrough writes; recovery validates identity/permissions. Document snapshot-copy consent and capacity; resolve any ban on copies before claiming immutable source history.

Dependency: D-04 and approved customer-network/data access. Both managed/reference modes are confirmed requirements, not optional scope; detailed snapshot policies remain open. Prototypes may be scheduled earlier for risk discovery, not against production shares without permission.

## Phase 5 — Workflow and records governance

Proposed deliverables (FR-11, FR-12):

- Approved versioned workflow definitions, assignment rules, tasks, transitions, and version-bound decisions.
- Retention rule evaluation, hold management if approved, and disposition reports/dry-run.
- Notifications/escalations only where requirements and delivery channels are approved.
- Controlled purge execution only after a separate destructive-action gate and backup/source-copy policy review.

Exit evidence:

- Double approvals, unauthorized participants, self-approval policy, document changes, and definition upgrades are tested.
- Holds block eligible purge; hold/purge races and partial multi-store deletion have explicit tested behavior.
- Legal/business owners approve policy definitions, retention evidence, and backup-expiry constraints.
- Purge is disabled until authorized; report-only retention can be accepted without enabling deletion.

Dependency: D-06, D-07, and D-09. Human business rules cannot be inferred from technical examples.

## Phase 6 — Offline installation, administration, and production readiness

Proposed deliverables (FR-13, FR-15, FR-16 and all NFRs):

- Complete role-scoped administration for delivered modules; basic admin capabilities are built alongside earlier phases, not delayed until this phase.
- Reviewed intranet API documentation, scoped local service credentials/lifecycle, limits, and compatibility; no mandatory OAuth issuer.
- Accessibility/localization requirements, acceptance journeys, and workload benchmarks.
- Security verification, penetration-test plan/execution as approved, dependency/SBOM review, and incident runbooks.
- Customer server/VM inventory, capacity model (versions/reference snapshots/FTS/WAL/scratch/backups), local health/alerts, recovery targets, backup/restore drills, and upgrade/rollback procedures.
- Verified offline release bundle: image archives, Compose definitions, prerequisites, assets/fonts/OCR data, scanner signatures, migration tools, licenses/SBOM, checksums/signatures, and local installation/admin instructions.
- Customer-local certificates/trust distribution, local DNS/time, secret/key provisioning, and backup/media custody; no public ACME, activation, analytics, or cloud dependency.
- Migration plan only if V1/source migration is requested and separately scoped.

Exit evidence:

- Product Owner signs off delivered and explicitly deferred capability scope.
- Security and operations owners approve unresolved risks; high-risk defects are fixed or explicitly accepted under policy.
- Restore proves approved RPO/RTO on a representative dataset with consistent originals, permissions, and audit evidence.
- Staging user acceptance and performance tests meet agreed targets.
- Clean disconnected install, reboot, operation, offline update, scanner-signature import, and isolated restore pass with egress blocked; all bundle components are verified and no hidden downloads/telemetry occur.

**Separate authorization required:** modifying customer/test infrastructure, connecting real network shares/directories, staging installation, production deployment, destructive operations, and pushing this revision. No previous push approval carries forward to these changes.

## Phase 7 — Controlled release and continuous improvement

Only after deployment approval:

- Controlled release, monitored smoke tests, incident readiness, and rollback/recovery rehearsal.
- Track processing quality, access/audit outcomes, capacity, and support feedback.
- Prioritize customer-local HA, richer workflows, optional LDAP/AD/OIDC/S3/OpenSearch, and additional local formats from measured need. Optional integrations have separate acceptance/security/backup/offline-delivery tests and cannot weaken the baseline.
- Reassess architecture extraction into services only when independent scaling, ownership, security, or release needs justify it.

## Cross-cutting work in every phase

Authorization, audit, testing, local observability, offline operation/delivery, source read-only protection, capacity, security maintenance, backup/recovery, and migration discipline are continuous—not a final hardening sprint.

## Product Owner review checklist

Before approving implementation, confirm:

1. Modular monolith plus workers and the proposed technology direction are acceptable.
2. Internal organization boundaries, local account/session/lockout/recovery settings, optional directory scope, access inheritance, and administrative powers.
3. Managed local/share roots, source-reference snapshot-copy permission/retention, and required NAS/SMB/NFS configurations; S3 optional.
4. Local file-format/language/font coverage, limits, OCR quality, and offline scan-signature freshness/update policy.
5. Workflow/retention policies and what is deferred from the first release.
6. Workload/server budget, capacity/headroom, backup media/targets, RPO/RTO, offline package/patch custody, local certificates, compliance, and operations ownership.
7. Which phase may start and which actions still require separate approval.

No timeline or cost is asserted until these inputs are available.
