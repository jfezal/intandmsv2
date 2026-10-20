# Product vision

**Project:** IntanDMS V2

**Company:** Sisi Awan Technologies Sdn Bhd

**Owner:** human Product Owner

**Document status:** master-aligned specification, 2026-10-08; core product decisions CONFIRMED, details PROPOSED/OPEN.

## Vision

Deliver a secure, maintainable, usable **on-premise-first** enterprise DMS over customer-owned NAS/network folders. Customers are not forced to migrate existing documents to a proprietary platform. Managed and Indexed Repositories have distinct controls, history, source ownership and user experience.

The platform should make document ownership, access, version history, workflow state, and lifecycle decisions explainable and auditable. Operational simplicity and recoverability take precedence over premature architectural complexity.

The primary environment is customer-owned physical servers or virtual machines running Ubuntu/Linux, accessed over private LAN/intranet. IntanDMS V2 is **not a cloud-first SaaS platform**. Core capabilities must work without Internet access, cloud subscriptions, or a third-party identity provider. All telemetry stays inside customer infrastructure.

Target customers: government agencies, local authorities, public institutions and enterprises using Synology NAS, Windows File Servers or Linux Samba/NFS servers. A dedicated application server hosts the DMS; existing customer NAS remains physical document storage. Priorities in order: usability, security, reliability, maintainability, performance, scalability, operational simplicity.

## Confirmed on-premise baseline

- Local users/authentication by default, with secure password hashing, sessions, account lockout/rate limiting, RBAC, and auditing.
- Optional LDAP/Windows Active Directory integration; OIDC optional; Keycloak is never required.
- Managed Repository: dedicated approved NAS namespace, physical document operations, primary controlled versioning.
- Indexed Repository: original customer folders remain in place/read-only; discovery/search/logical organization with no mandatory retained source snapshots or migration. External history/audit may be incomplete.
- Synology/Windows/Samba through SMB3, Linux shares through NFS, web-managed server-side connections; local application filesystem supports bounded processing/derived assets, not compulsory relocation of NAS originals.
- PostgreSQL Full-Text Search by default behind a search abstraction; OpenSearch optional.
- React/TypeScript, NestJS/TypeScript, PostgreSQL, modular monolith/separate local workers and Compose are confirmed core technology.
- Local Tesseract OCR in Bahasa Melayu/English; local previews/processing, no external API calls.
- At least 1,000,000 documents is a benchmark target, not achieved capacity. BM/English polished file-management UI, physical/virtual organization and detailed admin/indexing controls are required.
- Docker Compose-based offline installation, backup/restore, storage capacity planning, health monitoring, and system administration.
- Secure server-side authorization, protected filesystem/share paths, isolated processing, and comprehensive audit logs.

These are confirmed requirements, not choices awaiting reconfirmation. Detailed implementation and business rules remain proposals. This revision supersedes the original cloud-service/IdP/storage/search defaults.

## Confirmed scope

The Product Owner requested:

1. Document repository management.
2. File and folder management.
3. Synology/Windows/Samba SMB3 and Linux NFS connectors with web configuration.
4. Document metadata and classification.
5. Full-text search and indexing.
6. OCR integration.
7. Document preview.
8. Document versioning.
9. Role-based access control.
10. Audit trails and activity logging.
11. Document workflow and approval.
12. Document retention policies.
13. REST APIs and integrations.
14. Background workers and scheduled jobs.
15. Administration dashboard.
16. Enterprise security controls.

Confirmed engineering principles include modularity, API-first design, migrations, secure defaults, structured errors, automated testing, Docker readiness, observability, environment configuration, no hardcoded credentials, and documentation.

The master confirms required document/search/workflow/admin features, BM/English, priority PDF/JPEG/PNG/TIFF/DOCX/XLSX/PPTX previews, metadata field types, and holds. Approval sequences/quorum, retention durations, organization boundaries, exact format limits/fidelity, optional directory mappings, regulatory obligations and benchmark budgets remain OPEN. Do not reconfirm settled core choices.

## Proposed users and responsibilities

Validate these personas before designing role bundles:

- **Document contributor:** submits files and maintains permitted metadata.
- **Document reader:** searches and views authorized records.
- **Reviewer/approver:** acts on explicitly assigned workflow steps.
- **Repository manager:** manages selected repositories and classification schemes.
- **Records manager:** maintains approved retention policies and holds.
- **Security/audit reviewer:** reviews access and audit evidence under separate permissions.
- **Platform operator:** maintains infrastructure without automatically receiving document access.

No fixed role names, approval limits, or separation-of-duty exceptions are confirmed.

## Proposed product outcomes

- Authorized users can reliably find relevant documents without learning internal storage layouts.
- Managed changes preserve immutable controlled versions; Indexed changes expose honest observations/freshness and incomplete external history.
- Access and lifecycle operations can be reconstructed from audit records.
- External systems integrate through explicit, versioned contracts.
- Operators can detect processing failures, restore data, and measure indexing freshness.
- Customers retain control of credentials, documents, processing, telemetry, backups, and updates inside their infrastructure.
- A verified installation and update bundle supports disconnected sites without runtime downloads or online activation.
- Growth in document volume can be addressed by scaling processing independently of the API.

Qualification includes the confirmed 1,000,000-document target with measured workloads. User load, latency/OCR/freshness, usability criteria, availability/recovery and budget need approved baselines; no benchmark or training-time promise is invented.

## Initial boundaries

**In scope for planning:** architecture, requirements discovery, security model, delivery phases, testing strategy, and operational design.

**Not authorized now:** application features, deployment, infrastructure modification, external-source mutation, GitHub push, or destructive data operations.

**Not assumed as product requirements:** multi-tenant SaaS, billing, native mobile apps, real-time document co-editing, e-signatures, AI chat/RAG, automated AI classification, office-document editing, Kubernetes, or migration from IntanDMS V1.

Additional capabilities require explicit prioritization and a documented risk assessment. Generative AI is not part of the proposed baseline; document content must not be sent to an external model provider without an approved data-processing policy.

## Product principles

- Permission checks must apply consistently to viewing, downloading, searching, previews, exports, APIs, and background actions.
- No processing result overrides the authoritative access policy.
- No failed asynchronous step should masquerade as completed processing.
- Lifecycle deletion must be policy-controlled, reversible where feasible, and blocked by applicable holds.
- Connector failures must not be interpreted as source deletion.
- Each release must be usable, supportable, and tested before its scope expands.

## Discovery priorities

1. Define customer installation sizing, organization/repository boundaries, and operations ownership within the confirmed on-premise model.
2. Define local account lifecycle/recovery and optional directory integration; no IdP is required.
3. Define repository/folder access semantics and administrative powers.
4. Inventory NAS protocols/formats/page complexity, BM/English scan quality, Managed version layout, optional Indexed evidence snapshots, and processing limits.
5. Define workflow, classification, retention, legal hold, and disposition policies.
6. Establish workload, offline update procedures, customer-local security/monitoring, capacity, and disaster-recovery expectations.
7. Agree the first useful release and what is explicitly deferred.

See [Requirements](REQUIREMENTS.md) for acceptance scope and the single [Decision register](DECISION_REGISTER.md) for remaining approvals.
