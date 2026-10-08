# Product vision

**Project:** IntanDMS V2

**Company:** Sisi Awan Technologies Sdn Bhd

**Owner:** human Product Owner

**Document status:** proposal for review, 2026-10-08

## Vision

Deliver a secure, maintainable, enterprise-grade document management platform that enables authorized users to organize, discover, review, and govern documents across managed repositories and approved external storage systems.

The platform should make document ownership, access, version history, workflow state, and lifecycle decisions explainable and auditable. Operational simplicity and recoverability take precedence over premature architectural complexity.

## Confirmed scope

The Product Owner requested:

1. Document repository management.
2. File and folder management.
3. NAS, SMB, and S3 external-storage connectors.
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

These capabilities do not confirm detailed business behavior. Approval sequences, retention durations, tenant boundaries, supported file types, languages, identity sources, regulatory obligations, or deployment scale remain unknown.

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
- Document changes preserve traceable, immutable versions rather than silently replacing evidence.
- Access and lifecycle operations can be reconstructed from audit records.
- External systems integrate through explicit, versioned contracts.
- Operators can detect processing failures, restore data, and measure indexing freshness.
- Growth in document volume can be addressed by scaling processing independently of the API.

Success metrics require approved baselines: user counts, repository size, ingestion volume, search latency, OCR turnaround, availability, recovery objectives, and operating budget. This proposal supplies no invented numerical commitments.

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

1. Confirm intended organizations, installation model, and tenant isolation needs.
2. Confirm identity provider, account lifecycle, and enterprise directory requirements.
3. Define repository/folder access semantics and administrative powers.
4. Inventory file formats, languages, scan quality, source systems, and ingestion paths.
5. Define workflow, classification, retention, legal hold, and disposition policies.
6. Establish workload, security, compliance, data residency, and disaster-recovery expectations.
7. Agree the first useful release and what is explicitly deferred.

See [Requirements](REQUIREMENTS.md) for tracked decisions and proposed acceptance criteria.
