# Requirements and decision register

**Status:** proposal for review, 2026-10-08. No detailed business rule is approved by this document.

## Status vocabulary

- **Confirmed:** explicitly requested by the Product Owner.
- **Proposed:** architectural recommendation or candidate acceptance criterion; approval required.
- **Open:** missing requirement or choice; must be resolved or explicitly deferred.

All sixteen functional capabilities below are confirmed at capability level. Their behavior and acceptance criteria are proposed unless separately approved. Decision IDs are shared across the documentation.

## Functional requirements

### FR-01 — Document repositories

Confirmed: repository management. Proposed: create, update, archive, and list authorized repositories; track ownership and lifecycle status. Archiving must not silently delete content. Repository names, quotas, and administrative scope are open.

### FR-02 — Files and folders

Confirmed: file/folder management. Proposed: upload, organize, move, rename, list, download, and controlled soft deletion. Reject cycles, invalid paths, unauthorized destination moves, and concurrency conflicts. Conflict rules, maximum hierarchy depth, size limits, and recycle-bin behavior are open.

### FR-03 — External storage

Confirmed: NAS, SMB, S3 connectors. Proposed: configure allowlisted endpoints, least-privilege credentials, connectivity checks, incremental synchronization, reconciliation, and explicit connector health. Each connector requires a declared mode: managed writes, import, or read-only reference. Remote deletion and bidirectional synchronization are not approved.

### FR-04 — Metadata and classification

Confirmed: metadata/classification. Proposed: controlled classifications and versioned typed metadata schemas; validate required fields, types, and allowed values on the server. Whether classification affects authorization or retention is open; do not equate descriptive labels with security clearance.

### FR-05 — Search and indexing

Confirmed: full-text search/indexing. Proposed: search authorized metadata and extracted text with filtering, pagination, and indexing status. Titles, snippets, suggestions, counts, facets, and exports must obey authorization. Indexes are rebuildable; latency and supported languages are open.

### FR-06 — OCR

Confirmed: OCR integration. Proposed: asynchronous, page-aware extraction with language/profile configuration, engine provenance, bounded execution, retries, and visible failure states. Approved formats, languages, handwriting support, confidence thresholds, and external-provider permission are open.

### FR-07 — Preview

Confirmed: document preview. Proposed: safe derived previews for an approved format list, with per-request authorization and processing status. Never execute embedded scripts or return unsafe originals inline. Fidelity, office formats, watermarking, and browser support are open.

### FR-08 — Versioning

Confirmed: versioning. Proposed: immutable binary versions, checksum, uploader, timestamp, reason, and current-version pointer. Restore creates a new version rather than rewriting history. Whether metadata is versioned, checkout is required, and storage savings are acceptable is open.

### FR-09 — RBAC

Confirmed: RBAC. Proposed: permission-based roles plus repository/folder scope; deny by default; no implicit document access for infrastructure operators. Inheritance, explicit denies, document overrides, delegation, and organization boundaries require D-01 and D-03 approval.

### FR-10 — Audit and activity

Confirmed: audit trails and activity logging. Proposed: actor, action, target, outcome, server time, request/trace ID, policy context, and appropriately redacted changes. Sensitive successful mutations are committed with their audit event; denied attempts and reads follow an explicit audit policy. Retention, evidence integrity, export format, and authorized viewers are open.

### FR-11 — Workflow and approval

Confirmed: workflow/approval. Proposed: versioned definitions, assigned tasks, permitted state transitions, optimistic concurrency, and traceable decisions bound to a document version. Rejection, delegation, self-approval, notifications, escalation, and parallel steps require business definitions.

### FR-12 — Retention

Confirmed: retention policies. Proposed: explicit start event, rule version, disposition review, hold overrides, dry-run reports, and controlled purge. No default retention period is assumed. Legal holds are a proposed safety control, not an assertion of a legal obligation.

### FR-13 — REST API and integrations

Confirmed: REST API. Proposed: `/api/v1`, OpenAPI contracts, validated requests, consistent errors, documented pagination, rate limits, integration identity/scopes, idempotency for relevant commands, and authorized job-status endpoints. Webhooks and public Internet exposure are open.

### FR-14 — Jobs and scheduling

Confirmed: background workers/scheduled jobs. Proposed: durable intent, idempotent execution, bounded retries, failure quarantine, cancellation, resource isolation, and replay tools. Queue backlog and oldest-job age must be observable. Schedules/time zones need product agreement.

### FR-15 — Administration

Confirmed: administration dashboard. Proposed: authorized views for users/roles, repositories, connectors, schemas, workflow definitions, policies, job health, audit review, and configuration validation. Admin changes require auditing and validation, not direct database editing.

### FR-16 — Enterprise security

Confirmed: enterprise security controls. Proposed: centralized identity, MFA policy at the identity provider, scoped authorization, CSRF protection, secure session handling, TLS, file quarantine/scanning, connector isolation, rate limiting, secret management, and tested incident/recovery procedures.

## Proposed nonfunctional requirements

### NFR-01 — Security and privacy

Threat model all trust boundaries; use OWASP ASVS Level 2 as a proposed verification baseline, adapted after risk review. Test object-level authorization, upload handling, session lifecycle, search leakage, and tenant isolation if applicable. No compliance certification is claimed. Confirm applicable law and customer obligations, including whether Malaysian PDPA obligations apply.

### NFR-02 — Data integrity

PostgreSQL is authoritative. Use constraints, transactions, immutable version identifiers, checksums, an outbox, and periodic reconciliation. The database, storage, queue, and search engine do not share a transaction; partial states must be visible and repairable.

### NFR-03 — Availability and recovery

Approve RPO, RTO, maintenance windows, and dependency-failure behavior before sizing a deployment. Back up metadata, originals, required configuration, audit evidence, identity data where self-hosted, and key material. Restore testing is mandatory; search indexes can be reconstructed.

### NFR-04 — Performance and scalability

Approve workloads before commitments: concurrent users, file count, total bytes, largest upload, daily growth, OCR page volume, query rate, and index lag. API/web and worker processes scale independently. Heavy processing must not run inside request handlers.

### NFR-05 — Operability

Structured redacted logs, correlation IDs, traces, metrics, dependency health, alert ownership, and runbooks. Instrument queue delay, processing failures, permission failures, storage errors, index freshness, backup success, and restore verification. No document content in telemetry.

### NFR-06 — Maintainability and delivery

Strict TypeScript, modular boundaries, documented APIs, reproducible builds, reviewed migrations, automated tests, dependency/security checks, and backward-compatible releases. Accessibility target WCAG 2.2 AA is proposed; required languages/localization remain open.

## Decision register

All decisions below are **open**. Recommendations are not approvals. Record Product Owner decisions and dates here; add ADRs for technical consequences.

### D-01 — Installation and tenancy
- Question: single organization per installation, isolated installations, or shared multi-tenant service?
- Recommendation: start with one organization per deployment unless multi-tenancy is required; model repository boundaries explicitly. If shared tenancy is required, approve tenant-keyed schema, isolation tests, and defense-in-depth RLS before migrations.
- Gate: data model and identity foundation.

### D-02 — Identity and account lifecycle
- Question: existing OIDC/Entra ID/other IdP? Is SAML or LDAP needed through a broker? MFA, provisioning, deprovisioning, break-glass policy?
- Recommendation: OIDC Authorization Code + PKCE; existing enterprise IdP preferred, Keycloak if a self-hosted broker is needed. No bespoke password system initially.
- Gate: authentication implementation.

### D-03 — Authorization semantics
- Question: role catalog, folder inheritance, explicit denies, overrides, operator access, sharing, and move behavior?
- Recommendation: scoped grants, deny by default, inherited permissions with no ad hoc public links. Explicit-deny semantics require separate approval; do not silently implement them.
- Gate: repositories, search, and previews.

### D-04 — Storage ownership and connector modes
- Question: canonical store/provider, external import versus reference, remote write permission, snapshots, and consistency expectations?
- Recommendation: managed S3-compatible immutable objects; external NAS/SMB read-only import first. Review referenced-content limitations before enabling that mode.
- Gate: uploads and connectors.

### D-05 — Formats, OCR, preview, and classification
- Question: file types/limits, OCR languages, confidential classes, rendering fidelity, and cloud processing permission?
- Recommendation: explicit allowlist, local processing initially, bounded resources, configurable profiles. Candidate PDF and common raster image support must be validated against samples.
- Gate: ingestion acceptance and processing engines.

### D-06 — Workflow policy
- Question: approval steps, approver eligibility, separation of duties, parallelism, delegation, reminders, and changes during approval?
- Recommendation: start with an explicitly defined sequential workflow pinned to a document version; no generic visual workflow designer initially.
- Gate: workflow implementation.

### D-07 — Retention, holds, and deletion
- Question: legal basis, durations, start events, hold authority, purge approvals, backup expiry, storage locks, and audit retention?
- Recommendation: report-only evaluation before enabling deletion; holds block purge; reconcile deletion across replicas, derivatives, indexes, and backups under an approved policy.
- Gate: lifecycle implementation; destructive processing remains disabled meanwhile.

### D-08 — Capacity, hosting, budget, and recovery
- Question: workload baselines, VPS specs, HA expectations, availability targets, RPO/RTO, data residency, budget, and operations owner?
- Recommendation: benchmark representative files, isolate resource-intensive workers, and define backup/restore first. A single VPS is not high availability.
- Gate: performance acceptance and deployment design.

### D-09 — Security, audit, and compliance
- Question: regulatory/customer controls, encryption requirements, audit readers/retention, immutable evidence, external providers, and incident policy?
- Recommendation: review threat model and ASVS-based controls; keep content out of telemetry; export audit evidence to separately protected storage where required.
- Gate: security acceptance and external integrations.

### D-10 — First release and migration
- Question: initial user journeys, source-data migration, coexistence with V1, localization, and accessibility obligations?
- Recommendation: secure repository core first; include essential capability slices or explicitly defer them. No automatic access to or reuse of V1.
- Gate: release scope and migration work.

### D-11 — Technology and licensing
- Question: approve the recommended stack and operational/licensing footprint, including search, queues, database ORM, and conversion tools?
- Recommendation: adopt the modular TypeScript baseline; validate exact versions, Node 24 support, Valkey/BullMQ compatibility, and all redistribution/use licenses before pinning.
- Gate: package manifests, images, and foundation implementation.

## Approval record

No approvals recorded. The Product Owner may approve the baseline, request changes, and resolve/defer decisions explicitly. A deferral must specify which work remains blocked and who will resolve it. Approval to plan is not approval to implement or deploy.
