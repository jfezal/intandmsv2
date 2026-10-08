# Development roadmap and approval gates

**Status:** proposed sequencing, 2026-10-08. No implementation, time estimate, or release scope has been approved.

## Delivery policy

Work proceeds through explicit gates. Dependencies and security prerequisites take precedence over a fixed calendar. Estimates follow discovery, staffing, representative samples, and capacity/budget decisions.

All sixteen capabilities remain in overall product scope. A smaller first release must explicitly identify deferred capabilities; “enterprise-ready” cannot be inferred from an early prototype.

## Phase 0 — Discovery and architecture review (current)

Deliver:

- Repository/environment inspection and the initial proposal/documentation set.
- Confirmed-versus-proposed requirements and decision register.
- Review of tenancy, identity, permissions, storage ownership, file formats, workflow, retention, hosting, and security obligations.
- Proposed delivery scope, operating model, and dependency/license validation plan.

Exit gate:

- Product Owner approves or revises the architectural direction and authorizes a specific implementation phase.
- D-01, D-02, D-03, and D-11 resolved before schema/security foundation; D-04/D-05 resolved before ingestion.
- Other decisions are resolved or explicitly deferred with named blockers/owners.

**Current stop point:** documentation prepared; wait for approval. No application code begins automatically.

## Phase 1 — Engineering and security foundation

Proposed deliverables:

- Approved ADRs, initial module contracts, reviewed entity model, and threat model.
- npm-workspace TypeScript baseline, formatting/lint/typecheck, environment validation, and documented local setup.
- Reviewed local Docker topology and reproducible dependency versions; no production deployment.
- PostgreSQL migrations and migration tests; separated migration/runtime credentials.
- OIDC login/session lifecycle, scoped authorization skeleton, audit writer, Problem Details errors, OpenAPI baseline.
- Outbox/job intent, queue compatibility tests, logging/tracing, CI quality gates if approved.

Exit evidence:

- Reproducible clean setup; actual lint/typecheck/tests/build recorded.
- Positive/negative policy tests, session/CSRF tests, secret handling verified, and schema upgrades exercised.
- Pinned dependency compatibility/license review and minimum operational ownership agreed.

Dependency: Phase 0 approval and foundation decisions. No default admin account/password or placeholder security bypass.

## Phase 2 — Secure document repository core

Proposed deliverables (FR-01, FR-02, FR-04, FR-08, FR-09, FR-10, FR-13):

- Repository/folder hierarchy and approved scoped permission behavior.
- Managed-storage adapter, upload sessions, quarantine validation/scanning, checksums, and atomic publication semantics.
- Authorized listing/download/move/rename and controlled lifecycle operations.
- Immutable document versions, current-version pointer, restore-as-new-version, conflict handling.
- Typed metadata/classification schemas and basic frontend journeys.
- Audit coverage and upload/object reconciliation.

Exit evidence:

- Authorization matrix covers source/destination moves, versions, metadata, and downloads.
- Malicious/malformed inputs remain blocked; scanner/storage failures cannot publish content.
- Duplicate requests, concurrent versions, abandoned uploads, and partial failures are tested.
- End-to-end upload/version/download journeys pass with synthetic fixtures.

Dependency: D-03, D-04, D-05, and applicable D-09 controls. Soft-delete/purge behavior is limited by D-07; no physical purge is enabled by default.

## Phase 3 — Processing, preview, and full-text search

Proposed deliverables (FR-05, FR-06, FR-07, FR-14):

- Sandboxed extraction/OCR/preview adapters with profiles, provenance, limits, and visible job status.
- Approved format/language support and quality validation against representative samples.
- Search projection, safe authorization filtering/rechecks, and authorized pagination.
- Worker concurrency controls, bounded retries, failure quarantine, replay, and reconciliation.
- Index mapping versioning, rebuild procedure, telemetry, and protected preview delivery.

Exit evidence:

- Search exposes no unauthorized titles/snippets/counts/suggestions on revocation or move; unsafe aggregates are omitted.
- Parser/processor timeouts, source failures, stale/duplicate events, and queue outages are tested.
- Approved OCR accuracy and preview-fidelity acceptance is recorded; limits are documented.
- Search rebuild and durable-job recovery demonstrated.

Dependency: D-05, D-08, D-09, D-11 search-engine choice and queue validation. Core scanning already exists in Phase 2; it is not deferred until advanced OCR.

## Phase 4 — External storage integration

Proposed deliverables (FR-03):

- Approved NAS, SMB, and external S3 adapters with explicit modes and source provenance.
- Least-privilege secret handling, connectivity diagnostics, allowlisted endpoints/roots, and isolated connector agents.
- Checkpoints, incremental sync, change-during-copy detection, full reconciliation, and health dashboards.
- Import snapshots/version creation and documented reference-mode limitations if that mode is approved.

Exit evidence:

- Real representative connector tests cover authentication failure, network interruption, source changes, path escape, duplicate events, and scan-state recovery.
- No remote deletion or write capability unless separately approved and tested.
- Source outages cannot falsely delete records; managed history semantics remain intact.

Dependency: D-04 and approved network/data access. Connector prototypes may be scheduled earlier for risk discovery, but not against production shares without permission.

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

## Phase 6 — Administration, integration, and production readiness

Proposed deliverables (FR-13, FR-15, FR-16 and all NFRs):

- Complete role-scoped administration for delivered modules; basic admin capabilities are built alongside earlier phases, not delayed until this phase.
- Reviewed API integration documentation, service-client lifecycle, rate limits, and contract compatibility.
- Accessibility/localization requirements, acceptance journeys, and workload benchmarks.
- Security verification, penetration-test plan/execution as approved, dependency/SBOM review, and incident runbooks.
- Reviewed production topology, capacity plan, recovery targets, monitoring alerts, backup/restore drills, and release/rollback procedures.
- Migration plan only if V1/source migration is requested and separately scoped.

Exit evidence:

- Product Owner signs off delivered and explicitly deferred capability scope.
- Security and operations owners approve unresolved risks; high-risk defects are fixed or explicitly accepted under policy.
- Restore proves approved RPO/RTO on a representative dataset with consistent originals, permissions, and audit evidence.
- Staging user acceptance and performance tests meet agreed targets.

**Separate authorization required:** configuring staging/VPS resources, deploying a staging release, running tests against external infrastructure, and deploying production each require explicit approval. This roadmap authorizes none of those actions by itself.

## Phase 7 — Controlled release and continuous improvement

Only after deployment approval:

- Controlled release, monitored smoke tests, incident readiness, and rollback/recovery rehearsal.
- Track processing quality, access/audit outcomes, capacity, and support feedback.
- Prioritize future HA, richer workflows, advanced analytics, new connectors, or commercial OCR from measured need.
- Reassess architecture extraction into services only when independent scaling, ownership, security, or release needs justify it.

## Cross-cutting work in every phase

Authorization, audit, automated tests, observability, documentation, dependency hygiene, privacy, recovery thinking, and migration discipline are continuous work—not a final hardening sprint.

## Product Owner review checklist

Before approving implementation, confirm:

1. Modular monolith plus workers and the proposed technology direction are acceptable.
2. Installation/tenancy model, IdP, access inheritance, and administrative powers.
3. Canonical storage/provider and allowed external connector modes.
4. File formats, limits, languages, and whether any external content processing is allowed.
5. Workflow/retention policies and what is deferred from the first release.
6. Workload/budget, recovery targets, compliance requirements, and operational ownership.
7. Which phase may start and which actions still require separate approval.

No timeline or cost is asserted until these inputs are available.
