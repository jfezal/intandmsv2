# Requirements and decision register

**Status:** revised proposal for review, 2026-10-08. On-premise constraints are confirmed; detailed business rules and implementation remain subject to approval.

## Status vocabulary

- **Confirmed:** explicitly requested by the Product Owner.
- **Proposed:** architectural recommendation or candidate acceptance criterion; approval required.
- **Open:** missing requirement or choice; must be resolved or explicitly deferred.

All sixteen functional capabilities below are confirmed at capability level. Their behavior and acceptance criteria are proposed unless separately approved. Decision IDs are shared across the documentation.

## Confirmed architecture correction

The Product Owner's correction supersedes the earlier OIDC/S3/OpenSearch-first proposal:

- Customer-owned physical/virtual Ubuntu/Linux servers; private LAN/intranet access; not cloud-first SaaS.
- Fully functional without Internet, mandatory cloud services, or a third-party IdP.
- Local authentication by default, secure password hashing, sessions, account lockout/rate limiting, RBAC, and audit; LDAP/AD and OIDC optional; Keycloak not required.
- Local filesystem, NAS/SMB, NFS support; S3 optional. Managed and external-reference modes are required; reference mode must not modify source files.
- PostgreSQL Full-Text Search is the default with a search abstraction; OpenSearch optional.
- Local Tesseract OCR, local previews/workers, and no mandatory external API calls.
- Docker Compose offline installation, backup/restore, capacity planning, health monitoring, and system administration.
- No telemetry outside customer infrastructure; server-side authorization, path/share protection, isolated processing, and comprehensive audit logs.

These requirements are **confirmed**, not optional candidates. Exact versions, policy values, sizing, and business semantics remain open.

## Functional requirements

### FR-01 — Document repositories

Confirmed: repository management. Proposed: create, update, archive, and list authorized repositories; track ownership and lifecycle status. Archiving must not silently delete content. Repository names, quotas, and administrative scope are open.

### FR-02 — Files and folders

Confirmed: file/folder management. Proposed: upload, organize, move, rename, list, download, and controlled soft deletion. Reject cycles, invalid paths, unauthorized destination moves, and concurrency conflicts. Conflict rules, maximum hierarchy depth, size limits, and recycle-bin behavior are open.

### FR-03 — External storage

Confirmed: local filesystem, NAS/SMB, NFS, optional S3-compatible storage; managed and external-reference modes. External-reference mode must never modify source files, including rename, delete, metadata writeback, lock files, or sidecars. Proposed: approved roots/endpoints, least-privilege credentials, host-managed mounts, health checks, incremental discovery, and reconciliation. Managed roots must be explicitly DMS-owned. Historical reference versions use immutable managed snapshots with provenance; snapshot retention/storage permission must be agreed. See [Storage architecture](STORAGE_ARCHITECTURE.md).

### FR-04 — Metadata and classification

Confirmed: metadata/classification. Proposed: controlled classifications and versioned typed metadata schemas; validate required fields, types, and allowed values on the server. Whether classification affects authorization or retention is open; do not equate descriptive labels with security clearance.

### FR-05 — Search and indexing

Confirmed: full-text search/indexing with PostgreSQL Full-Text Search as default, optional OpenSearch, and a search abstraction interface. Proposed: chunked text/tsvector projection, indexed metadata, authorization joins before ranking/snippets/counts, bounded pagination, and rebuild support. All returned information must obey live permissions. Latency, language configuration, ranking, and advanced features remain open.

### FR-06 — OCR

Confirmed: local Tesseract OCR with no mandatory external API calls. Proposed: asynchronous page-aware extraction, bundled language data, engine/profile provenance, bounded execution, retries, and visible failure states. Formats, languages, handwriting expectations, and quality thresholds remain open. Baseline processors have no Internet dependency or egress.

### FR-07 — Preview

Confirmed: local preview generation. Proposed: safe derived previews for an approved format list, per-request authorization and processing status, bundled renderers/fonts, and isolated processing. Never execute embedded scripts, fetch external document resources, or return unsafe originals inline. Fidelity, office formats, watermarking, and browser support are open.

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

Confirmed: REST API/integrations usable on the intranet without an IdP. Proposed: `/api/v1`, OpenAPI, validated requests, consistent errors, pagination, limits, scoped revocable local service credentials, idempotency, and authorized job status. OAuth/OIDC service identities are optional. Public Internet exposure is outside the baseline; webhooks require separate scope approval.

### FR-14 — Jobs and scheduling

Confirmed: local background workers/scheduled jobs with no mandatory external API. Proposed: customer-local queue, durable PostgreSQL intent, idempotent execution, bounded retries, failure quarantine, cancellation, isolation, and replay. Queue age/backlog must be visible locally. Schedules/time zones need product agreement.

### FR-15 — Administration

Confirmed: administration dashboard, health monitoring, system administration, and capacity planning. Proposed: local users/roles, optional directory configuration, repositories/connectors, schemas/workflows/policies, disk/inode/mount health, worker/search status, scan-signature age, backup/restore status, and audit review. Admin changes require authorization and audit; host administration is distinct from document access.

### FR-16 — Enterprise security

Confirmed: local authentication, secure password hashing/sessions, account lockout/rate limiting, RBAC, server-side authorization, path/share protection, isolated processing, and comprehensive audit. Proposed: Argon2id, secure opaque sessions, CSRF defense, customer-local TLS, quarantined scanning, local secret handling, and tested recovery. MFA is a proposed optional local TOTP control, not dependent on an IdP. Detailed controls are in [Authentication architecture](AUTHENTICATION_ARCHITECTURE.md).

## Nonfunctional requirements

Confirmed constraints below are explicitly labeled; quantitative acceptance targets remain open.

### NFR-01 — Security and privacy

Threat model all trust boundaries; use OWASP ASVS Level 2 as a proposed verification baseline, adapted after risk review. Test object-level authorization, upload handling, session lifecycle, search leakage, and tenant isolation if applicable. No compliance certification is claimed. Confirm applicable law and customer obligations, including whether Malaysian PDPA obligations apply.

### NFR-02 — Data integrity

PostgreSQL is authoritative. Use constraints, transactions, immutable version identifiers, checksums, an outbox, and reconciliation. PostgreSQL FTS projection updates may share a database transaction; filesystem/share writes, queues, and optional OpenSearch cannot. Partial states must be visible and repairable. Reference history must not silently resolve to changed source bytes.

### NFR-03 — Availability and recovery

Confirmed: backup/restore architecture. Proposed: approve RPO/RTO, maintenance windows, and failure behavior before sizing; customer-local encrypted backups on a separate failure domain, PostgreSQL data/WAL as needed, originals/snapshots, audit evidence, local account/configuration data, and separately protected keys. Restore testing is required. Source-owner backups are separate; DMS cannot guarantee source-reference recoverability without snapshots.

### NFR-04 — Performance and scalability

Confirmed: storage capacity planning. Proposed: workload inventory and measured sizing for users, file/version count, reference snapshots, growth, OCR pages, query rate, scratch/quarantine, database/FTS/WAL, and backups. Track free bytes/inodes and refuse unsafe new ingestion before space exhaustion. Approve thresholds/targets; no server size or performance promise is assumed.

### NFR-05 — Operability

Confirmed: health monitoring/system administration and no telemetry outside customer infrastructure. Proposed: local redacted logs, traces, metrics, health/alerts/runbooks covering jobs, failures, mounts, bytes/inodes, index lag, scanner updates, backups and restores. No document content in telemetry; no vendor analytics, crash upload, external exporters, or online status checks. Local dashboards/alert delivery must work offline.

### NFR-06 — Maintainability and delivery

Strict TypeScript, modular boundaries, documented APIs, reproducible builds, reviewed migrations, automated tests, dependency/security checks, and backward-compatible releases. Accessibility target WCAG 2.2 AA is proposed; required languages/localization remain open.

### NFR-07 — Offline installation and operation

Confirmed: Docker Compose-based installation and full operation without public Internet/cloud/IdP dependencies. Proposed: signed/checksummed release bundle containing all images, Compose definitions, runtime assets, OCR data/fonts, scan signatures, licenses/SBOM, and local instructions. Provide approved Ubuntu/Docker prerequisites offline or document a customer-provided offline prerequisite bundle. No runtime `npm install`, image pulls, CDN assets, public ACME, online activation, external telemetry, or mandatory mail service. Updates/signatures use verified offline media or customer-local mirrors. Test install, reboot, operation, update, and restore with Internet egress blocked.

## Decision register

Product direction is **confirmed** by the correction. Each decision distinguishes that fixed direction from open implementation details. Recommendations are not implementation approvals. Record later decisions/dates here and add ADRs for technical consequences.

### D-01 — Installation and tenancy
- Confirmed: on-premise customer-owned Ubuntu/Linux servers/VMs, private LAN, offline installation; not cloud-first SaaS.
- Open: one customer organization per installation versus multiple internal organizations; supported Ubuntu releases/CPU architectures and HA topology.
- Recommendation: one customer per isolated installation; explicit repository boundaries. Multiple internal organizations require a reviewed isolation model, not assumed SaaS tenancy.
- Gate: data model and identity foundation.

### D-02 — Identity and account lifecycle
- Confirmed: local authentication default; secure hashing/sessions/lockout/rate limiting; LDAP/AD and OIDC optional; no required IdP/Keycloak.
- Open: account identifiers, password/session/lockout settings, bootstrap/recovery operator, local MFA policy, directory mapping/deprovisioning latency, and enabled optional providers.
- Recommendation: Argon2id using a maintained implementation, PostgreSQL-backed opaque sessions, audited local administration, and distinct local/directory identity sources with no automatic password fallback.
- Gate: authentication implementation.

### D-03 — Authorization semantics
- Question: role catalog, folder inheritance, explicit denies, overrides, operator access, sharing, and move behavior?
- Recommendation: scoped grants, deny by default, inherited permissions with no ad hoc public links. Explicit-deny semantics require separate approval; do not silently implement them.
- Gate: repositories, search, and previews.

### D-04 — Storage ownership and connector modes
- Confirmed: local filesystem, NAS/SMB, NFS; S3 optional; managed and external-reference modes; reference sources never modified.
- Open: actual mount roots/protocols, dedicated managed namespaces, snapshot duplication permission/retention, source change detection, and capacity.
- Recommendation: managed local immutable blobs plus read-only references with immutable managed snapshots for version/scan integrity. Any prohibition on snapshot copies requires explicit limitations/resolution before claiming historical binary versioning.
- Gate: uploads and connectors.

### D-05 — Formats, OCR, preview, and classification
- Confirmed: local Tesseract, local preview generation/workers, no mandatory external API calls.
- Open: file types/limits, languages, confidential classes, rendering fidelity, bundled fonts, and offline scanner freshness policy.
- Recommendation: allowlisted formats, local-only bounded processors, verified offline language/signature updates; validate PDF and common raster samples before committing format support.
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
- Confirmed: customer-owned physical/virtual servers, Docker Compose, offline installation, backup/restore, capacity and health administration.
- Open: server/VM inventory, storage/network/IOPS, workload, HA, RPO/RTO, backup media/site, maintenance windows, and operations owner.
- Recommendation: measured capacity model and separate-failure-domain backups; prove offline install/update/restore. A single server/VM is not HA; RAID and VM snapshots are not independent backups.
- Gate: performance acceptance and deployment design.

### D-09 — Security, audit, and compliance
- Confirmed: secure defaults, server authorization, protected paths/shares, isolated processing, audit, and no outbound telemetry.
- Open: customer/regulatory controls, local TLS/at-rest encryption/key recovery, audit readers/retention/evidence protection, scan freshness thresholds, and incident procedure.
- Recommendation: ASVS-based review, local-only telemetry, append-only audit and separately protected customer-local evidence exports. No cloud dependency for security controls.
- Gate: security acceptance and external integrations.

### D-10 — First release and migration
- Question: initial user journeys, source-data migration, coexistence with V1, localization, and accessibility obligations?
- Recommendation: secure repository core first; include essential capability slices or explicitly defer them. No automatic access to or reuse of V1.
- Gate: release scope and migration work.

### D-11 — Technology and licensing
- Confirmed: PostgreSQL FTS default with an interface, optional OpenSearch/S3/OIDC, local Tesseract, Docker Compose offline delivery.
- Open: approve framework/ORM/queue choices, exact versions, processor licensing/distribution, and offline bundle maintenance/support.
- Recommendation: modular TypeScript, PostgreSQL/Prisma with explicit SQL for FTS, local BullMQ/Valkey after compatibility testing, all baseline images/assets bundled; optional modules must not become transitive runtime requirements.
- Gate: package manifests, images, and foundation implementation.

## Approval record

- Confirmed by Product Owner correction: on-premise/offline/local-auth/local-storage/PostgreSQL-FTS/local-processing baseline and optional integrations recorded above.
- Historical action: initial documentation was committed/pushed with explicit approval; that approval does not authorize this revision's push.
- Revised implementation proposal: awaiting review. No feature implementation, deployment, or new push is approved.

A deferral must specify blocked work and its owner. Approval of product requirements is not approval to implement, deploy, or push.
