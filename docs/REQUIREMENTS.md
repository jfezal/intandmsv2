# Requirements and decision register

**Status:** master-aligned specification, 2026-10-08. CONFIRMED product scope; PROPOSED implementation/acceptance detail; OPEN business/qualification policies. No application implementation authorized.

## Status vocabulary

- **Confirmed:** explicitly requested by the Product Owner.
- **Proposed:** architectural recommendation or candidate acceptance criterion; approval required.
- **Open:** missing requirement or choice; must be resolved or explicitly deferred.

FR-01 through FR-16 retain historical capability IDs; FR-17 onward capture explicit master additions. Core behavior from the master is CONFIRMED. Recommendations/unspecified policy values are PROPOSED/OPEN. [Decision register](DECISION_REGISTER.md) is the sole register; examples do not invent business rules.

## Confirmed architecture correction

The final master supersedes earlier storage/snapshot defaults while retaining approved on-premise technology:

- Customer-owned physical/virtual Ubuntu/Linux servers; private LAN/intranet access; not cloud-first SaaS.
- Fully functional without Internet, mandatory cloud services, or a third-party IdP.
- Local authentication by default, secure password hashing, sessions, account lockout/rate limiting, RBAC, and audit; LDAP/AD and OIDC optional; Keycloak not required.
- NAS-primary Managed Repository in a dedicated authorized namespace and Indexed Repository on existing unchanged paths/read-only, no mandatory migration or retained source snapshots. Synology/Windows/Samba SMB3 and Linux NFS, web-configured connections.
- PostgreSQL Full-Text Search is the default with a search abstraction; OpenSearch optional.
- React/NestJS/TypeScript/PostgreSQL, modular monolith/separate local workers, local Tesseract BM/English and local previews; no external document API.
- Docker Compose offline installation, backup/restore, capacity planning, health monitoring, and system administration.
- No telemetry outside customer infrastructure; server-side authorization, path/share protection, isolated processing, and comprehensive audit logs.
- 1,000,000-document benchmark target; BM/English polished accessible explorer/viewer/admin UX. Priority previews: PDF/JPEG/PNG/TIFF/DOCX/XLSX/PPTX.

These requirements are **confirmed**, not optional candidates. Exact versions, policy values, sizing, and business semantics remain open.

## Functional requirements

### FR-01 — Document repositories

CONFIRMED: multiple clearly separated Managed/Indexed repositories, name/description/type/connection/root/status/permissions/indexing/processing/retention/health. PROPOSED: revision-checked create/update/disable/archive; no silent content deletion/type conversion. Acceptance: type capability-negative tests/UI labels and safe connection disable. See REPOSITORY_MODELS.md.

### FR-02 — Files and folders

CONFIRMED: browse/navigate/upload/download/rename/move/copy/delete where permitted/restore where supported, bulk actions, details/metadata/classification/tags/favorites/recent/relationships/history, all capability/policy-gated. Indexed physical writes/restores are unsupported; logical changes stay in DB. PROPOSED: bounded asynchronous bulk manifests, soft-delete/trash for Managed, ledger recovery and expected revisions. Collision/trash/size policies OPEN; no fake resumable transfer.

### FR-03 — External storage

CONFIRMED: SMB3 Synology/Windows/Samba and Linux NFS, UI add/test/validate/browse/select/health/failures/update/disable; credentials server-side, path/symlink/root/write protection, explicit mount identity/no local fallback. Indexed sources never altered; no compulsory original snapshots. PROPOSED: restricted host gateway and preprovisioned mode, transient staged verification, provider-specific guarantees. See [Storage](STORAGE_ARCHITECTURE.md) and [connectors](NAS_CONNECTOR_ARCHITECTURE.md).

### FR-04 — Metadata and classification

CONFIRMED: configurable document types/fields (text, number, date, boolean, dropdown, multi-select, reference), required/validation/default/options/searchable settings, schema versions, logical classification/tags. PROPOSED: typed values/stable field IDs, additive/schema-impact review and explicit backfills; no silent corruption on type/option changes. Classification security/retention semantics OPEN; labels are not clearance by default.

### FR-05 — Search and indexing

CONFIRMED: default PostgreSQL FTS, simple/advanced/filename/metadata/full-text/OCR search; repository/folder/type/category/tags/date/owner/processing filters; ranking/highlighting/pagination/saved searches and history where permitted; authorization on all metadata/aggregates. PROPOSED: SearchPort, bounded chunks/GIN, typed filter indexes, live policy joins, safe encoding/generation rebuild. See [Search/OCR/preview](SEARCH_OCR_PREVIEW.md); latency/relevance budgets OPEN, OpenSearch deferred.

### FR-06 — OCR

CONFIRMED: local asynchronous Tesseract Bahasa Melayu/English, native extraction/OCR where needed, thumbnails/previews/status/failure/retry, no repeated OCR for unchanged content/configuration, restricted tools/limits/scanning/no unauthorized network fetch. PROPOSED: checksum/profile generation reuse, pinned `msa`/`eng`, staged exact-byte scanning. Handwriting/quality/size limits OPEN.

### FR-07 — Preview

CONFIRMED: locally hosted secure PDF/JPEG/PNG/TIFF/DOCX/XLSX/PPTX priorities, zoom/pages/rotation where supported/fullscreen/info/permitted download, clear limitations and no cloud viewer. PROPOSED: safe generated derivatives, local office conversion, generation/freshness and every cache/range authorization. Exact fidelity/font/encrypted-format/size support OPEN and tested before claims.

### FR-08 — Versioning

CONFIRMED: primarily Managed version ID/sequence/time/author/description/hash/storage/processing, history/download/restore-as-new-version/metadata comparison. Indexed external observations must not masquerade as controlled complete versions; optional snapshots explicitly labeled. PROPOSED: immutable accepted NAS snapshots and metadata revision history, physical working-tree integrity checks. Checkout/dedup not assumed.

### FR-09 — RBAC

Confirmed: RBAC. Proposed: permission-based roles plus repository/folder scope; deny by default; no implicit document access for infrastructure operators. Inheritance, explicit denies, document overrides, delegation, and organization boundaries require D-01 and D-03 approval.

### FR-10 — Audit and activity

CONFIRMED: login attempts/view/preview/download/upload/rename/move/delete/restore/metadata/permission/workflow/admin events, actor/action/target/time/outcome/request/context, protected evidence and no complete outside-NAS audit claim. PROPOSED: durable read/transfer intent plus outcome, atomic DB mutation audit/outbox, NAS operation ledger and append-only roles. Retention/privacy/evidence assurance OPEN; observed external actor stays unknown.

### FR-11 — Workflow and approval

CONFIRMED: configurable submit/review/approve/reject/return/reassign/comments/history/due dates/notifications; sequential/parallel where approved, decisions pinned to version or approved source state, stale prevention. PROPOSED: versioned definitions, expected task revisions, persistent in-app notifications, Indexed source revalidation. Quorum/assignments/self-approval/escalation OPEN; do not silently apply old approval to new bytes.

### FR-12 — Retention

CONFIRMED: retention rules/start event/expiry/review/legal-administrative holds/reports, no automatic irreversible deletion without approved policies; Indexed sources never deleted and logical removal distinct. PROPOSED: report-only first, hold-serialized Managed purge/trash, retained disposition evidence. Durations/authority/precedence/backup expiry OPEN; no legal compliance claimed.

### FR-13 — REST API and integrations

Confirmed: REST API/integrations usable on the intranet without an IdP. Proposed: `/api/v1`, OpenAPI, validated requests, consistent errors, pagination, limits, scoped revocable local service credentials, idempotency, and authorized job status. OAuth/OIDC service identities are optional. Public Internet exposure is outside the baseline; webhooks require separate scope approval.

### FR-14 — Jobs and scheduling

CONFIRMED: local workers/schedules, persistent/resumable bounded indexing, pause/resume/cancel/retry/backoff/concurrency/throttling/admin controls/statistics/errors/freshness. PROPOSED: outbox/durable stage state, leases/fencing/generation idempotency, bounded local dispatch. Schedules/limits are configurable policies; see FR-17 and INDEXING_RECONCILIATION.md.

### FR-15 — Administration

CONFIRMED: guided web configuration without routine terminal use, storage/repository/users/roles/metadata/workflow/indexing/health/audit/settings, validation/defaults/security consequences; future installation/setup wizard. PROPOSED: secure host-installed gateway envelope and one-time admin bootstrap, local capacity/signature/certificate/backup dashboards, actionable errors. Privileged installation/disaster recovery remain explicit operator tasks.

### FR-16 — Enterprise security

Confirmed: local authentication, secure password hashing/sessions, account lockout/rate limiting, RBAC, server-side authorization, path/share protection, isolated processing, and comprehensive audit. Proposed: Argon2id, secure opaque sessions, CSRF defense, customer-local TLS, quarantined scanning, local secret handling, and tested recovery. MFA is a proposed optional local TOTP control, not dependent on an IdP. Detailed controls are in [Authentication architecture](AUTHENTICATION_ARCHITECTURE.md).

### FR-17 — Indexing and reconciliation

CONFIRMED: full/incremental/scheduled scans, durable checkpoints/resume/retry/cancel/bounded concurrency/resource throttle/duplicate detection/stats/errors/freshness; new/modify/missing/rename where evidence supports/unavailable/reconnect, no outage deletion. States: discovered/pending/processing/indexed/failed/skipped/source unavailable, with separate source/job status. PROPOSED: streamed durable frontier, complete-scope missing evidence, corroborated rename, explicit ambiguous conflict, generation-fenced publication. See [Indexing](INDEXING_RECONCILIATION.md).

### FR-18 — Stable identity and organization

CONFIRMED: internal IDs not physical paths/NAS file IDs alone; repository/location/classification/metadata/checksum/size/mtime/discovery/index/source/processing tracking, documented safe reconciliation. Physical/virtual explorers, categories/subcategories/tags/types/custom metadata/saved views; logical organization without file moves. PROPOSED: observations/path history and separate virtual membership; no checksum-only identity merge or permission grant.

### FR-19 — Enterprise UI and localization

CONFIRMED: polished file-management experience, BM/English, coherent tokens/components, clean light default, accessible responsive desktop/tablet/mobile essentials; required Explorer/Viewer/Search/Upload/admin/indexing interactions and all screen states. PROPOSED: [UX/screen flows](UI_UX_SPECIFICATION.md), [design system](DESIGN_SYSTEM.md), WCAG 2.2 AA acceptance. No decorative CRUD dashboard/fabricated ETA/resume claims.

### FR-20 — Personal discovery and notifications

CONFIRMED: favorites/recent/relationships/saved views/searches/history where permitted, My Tasks and useful role-scoped dashboard/notifications. PROPOSED: per-user memberships/history with live authorization and bounded/privacy-controlled retention, persistent local in-app notifications. Search/user-history retention and delivery policy OPEN.

## Nonfunctional requirements

Confirmed constraints below are explicitly labeled; quantitative acceptance targets remain open.

### NFR-01 — Security and privacy

Threat model all trust boundaries; use OWASP ASVS Level 2 as a proposed verification baseline, adapted after risk review. Test object-level authorization, upload handling, session lifecycle, search leakage, and tenant isolation if applicable. No compliance certification is claimed. Confirm applicable law and customer obligations, including whether Malaysian PDPA obligations apply.

### NFR-02 — Data integrity

PostgreSQL is authoritative. Use constraints, transactions, immutable version identifiers, checksums, an outbox, and reconciliation. PostgreSQL FTS projection updates may share a database transaction; filesystem/share writes, queues, and optional OpenSearch cannot. Partial states must be visible and repairable. Reference history must not silently resolve to changed source bytes.

### NFR-03 — Availability and recovery

Confirmed: backup/restore architecture. Proposed: approve RPO/RTO, maintenance windows, and failure behavior before sizing; customer-local encrypted backups on a separate failure domain, PostgreSQL data/WAL as needed, originals/snapshots, audit evidence, local account/configuration data, and separately protected keys. Restore testing is required. Source-owner backups are separate; DMS cannot guarantee source-reference recoverability without snapshots.

### NFR-04 — Performance and scalability

CONFIRMED: **at least 1,000,000 distinct documents** design target, realistic benchmarks before claims, capacity planning/streaming/pagination/batching/checkpoints/resource limits. PROPOSED: mixed synthetic NAS/FTS/processing/concurrent-policy workload, measured CPU/RAM/IOPS/network/bytes/inodes/DB-WAL-FTS and recovery, no mandatory Indexed-original duplication. D-08/D-15 set hardware/latency/throughput budgets; no achieved result claimed.

### NFR-05 — Operability

Confirmed: health monitoring/system administration and no telemetry outside customer infrastructure. Proposed: local redacted logs, traces, metrics, health/alerts/runbooks covering jobs, failures, mounts, bytes/inodes, index lag, scanner updates, backups and restores. No document content in telemetry; no vendor analytics, crash upload, external exporters, or online status checks. Local dashboards/alert delivery must work offline.

### NFR-06 — Maintainability and delivery

CONFIRMED: strict maintainable modular code/migrations/tests/contracts, BM/English and accessible responsive product. PROPOSED: pinned reproducible builds/license/SBOM gates, backward-compatible schema/releases and WCAG 2.2 AA verification; exact brand/browser/timezone/quantitative UX criteria OPEN.

### NFR-07 — Offline installation and operation

Confirmed: Docker Compose-based installation and full operation without public Internet/cloud/IdP dependencies. Proposed: signed/checksummed release bundle containing all images, Compose definitions, runtime assets, OCR data/fonts, scan signatures, licenses/SBOM, and local instructions. Provide approved Ubuntu/Docker prerequisites offline or document a customer-provided offline prerequisite bundle. No runtime `npm install`, image pulls, CDN assets, public ACME, online activation, external telemetry, or mandatory mail service. Updates/signatures use verified offline media or customer-local mirrors. Test install, reboot, operation, update, and restore with Internet egress blocked.

## Decision register

All D-01 through D-15 decisions/owners/gates/approval records are consolidated in [DECISION_REGISTER.md](DECISION_REGISTER.md). Historical D identifiers are preserved there. No duplicate policy register remains here.
