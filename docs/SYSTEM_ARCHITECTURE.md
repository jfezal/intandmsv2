# System architecture proposal

**IntanDMS V2 — Sisi Awan Technologies Sdn Bhd**

**Status:** revised on-premise proposal for review; product constraints confirmed, no implementation authorized.

**Date:** 2026-10-08

## 1. Executive recommendation

Build an **on-premise API-first modular monolith with independently deployed local workers** on customer-owned Ubuntu/Linux physical servers or VMs. Keep business state and default full-text search in PostgreSQL; store managed binaries on local filesystem or approved DMS-owned shares. Default to local users, secure password hashing, opaque sessions, and consistent server-side RBAC.

**Confirmed correction:** IntanDMS V2 is not cloud-first SaaS. It must work fully without Internet, cloud services, external APIs, or third-party identity providers. LDAP/AD, OIDC, S3-compatible storage, and OpenSearch are optional. Keycloak is not required. Docker Compose installation, assets, processing, updates, monitoring, and backups must support disconnected customer environments; telemetry never leaves customer infrastructure.

This balances enterprise controls and maintainability without the premature cost of microservices. API and workers may share application/domain packages while running in separate processes and security boundaries. Document processing has a narrower trust boundary than the API.

The repository was empty when inspected. This proposal is a greenfield baseline, not an assessment of existing application architecture. V1 code reuse, data migration, and business compatibility are not assumed.

Detailed recommendations require D-01 through D-11 review in [Requirements](REQUIREMENTS.md). Confirmed defaults are not reopened as choices. Internal organization boundaries, permission semantics, and local account policy must be resolved before initial migrations. This revision supersedes the initial mandatory OIDC/S3/OpenSearch direction.

## 2. Logical topology

```text
Customer LAN browser                 Intranet integration client
     | HTTPS, same-origin                 | scoped local service credential
     v                                    v
Reverse proxy / web assets --------> NestJS/Fastify REST API
                                           |
            Local authentication <--------+ (password/session flow)
                                           |
                  +------------------------+----------------------+
                  |                        |                      |
             PostgreSQL              Managed filesystem     Read-only sources
         business state, RBAC,        local / NAS mounts     NAS / SMB / NFS
         sessions, audit, outbox,     immutable versions     snapshot ingestion
         text chunks / FTS
                  |
             Outbox dispatcher ----> BullMQ / Valkey
                                           |
                       +-------------------+-------------------+
                       |                   |                   |
                  Job workers       Connector workers    Lifecycle workers
                       |
                isolated processors
          scan / extract / OCR / render

All services -> customer-local redacted logs, metrics, traces, alerts
Durable systems -> customer-controlled backup and tested restoration
Optional adapters: LDAP/AD, OIDC, S3-compatible storage, OpenSearch
```

This is a logical dependency map, not a confirmed server sizing/layout. Baseline services run inside customer infrastructure. Optional adapters are disabled by default and absent from baseline startup requirements. No public endpoint, CDN, hosted observability, remote license check, or external processor is needed.

## 3. Module boundaries

Proposed backend modules:

- **Identity and sessions:** local password verification/account lifecycle, session security, optional directory/OIDC adapters, integration principals.
- **Authorization:** role assignments, scoped grants, policy evaluation, effective access calculation.
- **Organizations/workspaces:** optional organization/tenant boundary, dependent on D-01.
- **Repositories and folders:** hierarchy, ownership, moves, lifecycle state.
- **Documents and versions:** stable document identity, immutable content versions, upload state.
- **Metadata and classification:** schema versions, typed validation, classification catalog.
- **Storage and connectors:** storage contracts, credentials references, synchronization state.
- **Processing:** scan, extraction, OCR, preview task orchestration and provenance.
- **Search:** index projection, permission-aware query orchestration, reconciliation.
- **Workflow:** versioned definitions, tasks, transitions, decisions, authorized participants.
- **Retention:** evaluation, holds, disposition proposals, approved execution.
- **Audit:** durable business/security events, authorized queries and evidence export.
- **Jobs and outbox:** durable task intent, dispatch, execution state, retry/replay.
- **Administration:** application services for policy/configuration changes, not a privileged data bypass.

Each module exposes application-level operations and defined contracts. Other modules must not directly mutate its tables or rely on internal ORM models. Shared packages contain true cross-cutting primitives, not a dumping ground for unrelated business logic.

Business workflows remain in application/domain services, not controllers, React components, queue handlers, or storage SDK callbacks. Infrastructure adapters implement contracts owned by the consuming domain/application layer.

## 4. Database design approach

### 4.1 Relational model

Use PostgreSQL constraints and transactions as the primary integrity mechanism. The following are **candidate entities**, not an approved schema:

- `organizations` if D-01 requires an explicit organization/tenant entity.
- `users` with stable internal IDs/account state; local `password_credentials` with algorithm/parameters/hash, credential-change timestamps, and reset/lockout state.
- `identity_links` for optional directory immutable identifiers or OIDC issuer/subject; never auto-link accounts by email/display name.
- `groups`, `memberships`, `roles`, `permissions`, `role_permissions`, and scoped `role_assignments`.
- `repositories`, `folders` with parent links and repository boundary.
- `documents` with stable identity, current version pointer, lifecycle state, and concurrency revision.
- `document_versions` with immutable content reference, sequence, checksum, size, MIME determination, actor, and time.
- `storage_locations`, `storage_objects`, `upload_sessions`, and `connectors` with credential references, not plaintext secrets.
- `metadata_schemas`, `metadata_schema_versions`, `classifications`, and validated `document_metadata`.
- `processing_jobs`, `processing_artifacts`, `extraction_results`, and `outbox_events`.
- `workflow_definitions`, definition versions, instances, tasks, and transition/decision history.
- `retention_policies`, policy versions, assignments, proposed `legal_holds`, disposition requests, and execution records.
- `audit_events` and controlled export/checkpoint records.
- `sessions` with hashed opaque token identifiers, expiry, and revocation state.
- scoped local service-token digests, expiry/revocation, and permitted principals; security/rate-limit state as appropriate.
- bounded extracted-text chunks and `tsvector` search projections, language/analyzer versions, and projection revision.
- connector checkpoints/source mappings and index projection watermarks.

One repository has folders/documents; one document has many immutable versions. Each accepted binary version references managed immutable bytes, including snapshots captured from read-only external sources. Source mappings record provenance, not a mutable substitute for historical content. Workflow instances pin definition/document versions. Audit/job history survives ordinary soft deletion.

### 4.2 Data rules

- Use opaque server-generated IDs; opaque IDs do not replace authorization.
- Store time as PostgreSQL timezone-aware timestamps in UTC; display user-local time separately.
- Enforce unique document version numbers within a document and prevent cross-repository references.
- Validate folder cycles and move authorization transactionally; a foreign key alone cannot prevent cycles.
- Treat filenames as display metadata; enforce approved name conflict rules separately from object keys.
- Use typed relational columns for frequent filters and critical state. Use JSONB only for approved extensible metadata with schema-version validation and controlled indexes.
- Do not store binary documents or unbounded extraction text inside generic JSONB records.
- Retain version-level provenance for scan, extraction, OCR profile, preview generator, and source identity.
- Prefer foreign-key restrictions over cascading deletion of evidence or version history.
- Use optimistic revision checks for metadata updates, moves, approvals, and role changes; return an explicit conflict rather than silently overwriting concurrent work.
- Serialize version allocation with a row lock or equivalent transactional mechanism and a uniqueness constraint.
- Decide whether deduplication is acceptable; cross-organization deduplication and existence probes risk disclosure. No global deduplication is assumed.

### 4.3 Tenant boundary decision

Recommend one customer per installation; shared cloud SaaS is not the target. D-01 must settle whether multiple internal organizations are needed. If so, propagate `organization_id` through scoped tables, composite foreign keys/uniqueness, jobs, search, storage namespaces, and authorization. Validate context from a trusted session/principal, never the request body alone. Do not claim isolation before testing it.

Consider PostgreSQL RLS as defense in depth if organization separation requires it, with transaction-local context, least-privilege roles, and connection-pool/service-bypass tests. RLS does not protect filesystem, optional external search, queues, or caches by itself. Repository authorization is mandatory regardless of installation boundaries.

### 4.4 Migrations and recovery

Every schema change is a versioned migration. Production schema auto-synchronization is prohibited. Use expand/backfill/contract changes for compatibility; test fresh setup and upgrade from the previous supported release.

Separate schema-owner/migration credentials from runtime credentials. Runtime roles must not have unrestricted DDL privileges. Changes affecting audit, holds, tenant boundaries, or constraints need explicit risk review.

Backup strategy includes customer-local PostgreSQL backups/WAL where approved RPO requires it, coordinated with filesystem/share snapshot inventory and deletion records. A database snapshot cannot recover missing binaries. See [On-premise deployment](ON_PREMISE_DEPLOYMENT.md) for consistent restore sequencing and offline delivery.

## 5. Storage architecture

### 5.1 Managed storage

Use **local filesystem storage by default**, with supported NAS/SMB/NFS adapters and optional S3-compatible storage behind a common interface. Managed originals/versions/snapshots/derivatives live under dedicated administrator-approved roots; quarantine and scratch are separate. User filenames are display metadata, never paths. Host operators mount network shares; ordinary application containers have no mount privilege.

Logical versions refer to immutable stored bytes; filesystem/share snapshots and optional bucket versioning are recovery mechanisms, not the version model. Use staged writes, checked sizes/hashes, exclusive non-overwriting publication, and durability operations appropriate to the provider. Validate same-filesystem rename/fsync and share failure semantics; PostgreSQL and file writes are not atomic together. Encrypt at rest/in transit under customer policy with local key recovery.

Serve content through authorized API streaming, never a public static root or raw share URL. Workers receive narrow inputs, not repository-wide credentials. Presigned URLs exist only for optional S3 and require revocation-window review. See [Storage architecture](STORAGE_ARCHITECTURE.md) for root containment, mount health, ownership, reference snapshots, and capacity accounting.

### 5.2 Ingestion transaction boundary

The database and filesystem/share/optional object store have no shared transaction. Proposed upload saga:

1. Authorize contributor and destination; validate intended size/type against policy; reserve an upload session with expiry and idempotency identity.
2. Stream to a server-generated exclusive quarantine file with space checks and byte limits even when `Content-Length` is absent/false. Direct S3 upload is optional and not the baseline.
3. Verify actual size, content signature/MIME, and cryptographic checksum over received bytes. Multipart ETags on optional S3 are not reliably content hashes.
4. Register a pending immutable version, its storage reference, audit event, and processing outbox entry in one PostgreSQL transaction. It is not yet readable as an accepted document version.
5. Scan content in an isolated processor. Promote the object/state using idempotent transitions only after required checks pass. Copy/promotion and DB updates are reconcilable, not falsely atomic.
6. Publish the accepted current-version pointer in a transaction, recording audit and next-stage jobs. Extraction/preview failures must be visible independently of upload acceptance.
7. Reconcile stale uploads, failed promotions, duplicate requests, and orphan objects. Cleanup cannot delete committed versions; use age grace periods and confirmed references.

Default scan outage policy is fail-closed for visibility: leave the file pending/quarantined, alert, and retry. Administrative bypass would require an explicit policy and audit. Some dangerous but malware-free files remain unsafe for inline rendering.

### 5.3 NAS, SMB, and NFS

Use a connector boundary separate from interactive API file access:

- Restrict configuration to approved roots/endpoints; users do not supply arbitrary hosts, shares, or mount paths.
- Keep connector credentials in an approved secret store or encrypted secret mechanism with the key outside the database.
- Use SMB3 with approved encryption/signing settings; disable obsolete/insecure protocol options.
- Validate NFSv4 identity mapping/export access, root squashing, mount reliability, and approved transport protection. Do not assume NFS on a private LAN is authenticated/encrypted adequately.
- Run mounts/connector agents under dedicated OS accounts with minimal network and filesystem scope. If mounting requires elevated privileges, perform it outside ordinary API/processing containers under operator control.
- Enforce path containment, reject traversal, and prevent symlink/TOCTOU escape with OS-level containment and safe path operations; string-prefix checks alone are insufficient.
- Track source identity, modification markers, size, hashes where available, and scan checkpoints.
- Compare pre/post-copy source markers; detect source changes during read and retry rather than certify a mixed version.
- Perform periodic full reconciliation; timestamps or event notifications alone are not reliable change detection.
- Source errors/offline shares do not imply source deletions. Use explicit tombstone confirmation and policy.
- Validate expected mount identity before every transfer and monitor it continuously; a missing mount must not cause writes into an underlying local directory. Managed writes fail closed on mount mismatch/full/read-only/unavailable states.

### 5.4 Connector ownership modes

- **Managed:** DMS owns a dedicated approved local/share/optional S3 namespace. Authorized writes create immutable versions; lifecycle deletion is policy-controlled.
- **External-reference:** DMS discovers source content read-only, never modifies/renames/deletes it or writes sidecars/locks. Capture a stable read-only source into managed quarantine, scan those exact bytes, and preserve immutable snapshots for accepted historical versions. New source changes create new snapshots/versions; missing/unreachable sources produce audited state, not history deletion.
- **Import:** an explicit read-only ingestion operation into managed storage; source provenance is retained. It is not permission to mutate the source.

Reference mode and versioning are required together; a mutable source path alone cannot guarantee past versions. Snapshot-copy permission/retention must be reviewed under D-04. If copies are forbidden and the source lacks verified immutable history, resolve that conflict before promising historical downloads/approvals. Managed-share writes are limited to declared DMS roots; no mutation of reference roots is permitted. S3 is optional; no bucket is needed for baseline operation.

## 6. OCR, preview, and search architecture

### 6.1 Processing pipeline

```text
quarantine -> validate/scan -> accepted original
                                  |
                      text extraction / page inspection
                                  |
                  OCR where needed and policy permits
                                  |
                     normalized text + provenance
                                  |
                          index projection

accepted original -> isolated preview generation -> safe derivative
```

Each stage has explicit pending/running/succeeded/failed/quarantined state, attempt records, timestamps, and engine/profile version. Failures do not erase originals or silently change previous successful artifacts. Reprocessing writes a new artifact generation and only publishes a completed generation.

Use local native extraction where reliable and **local Tesseract** OCR where needed. Bundle engines, language data, renderers, fonts, and any local scanner signatures; never download them at runtime or fetch document-linked remote resources. Record page coverage, language, failures, and confidence only where meaningful. Validate accuracy on business samples; OCR text is not guaranteed evidence of the original.

Apply CPU, memory, wall-clock, byte, archive-expansion, page, pixel, and temporary-disk limits. Disable processor egress by default and give it access only to the required input/output. Treat parser libraries and conversion engines as patch-sensitive attack surfaces. Never interpolate filenames into shell commands.

Offline security maintenance uses verified customer-local signature/package updates. Define maximum signature age, warnings, and ingestion fail-closed policy under D-05/D-09; disconnected operation must not silently disable malware scanning or pretend bundled signatures remain current forever.

Serve generated previews on a separate controlled origin or appropriately sandboxed context with restrictive CSP. Do not embed untrusted HTML/SVG or active office content under the authenticated application origin. Preview caches and range endpoints need the same authorization as original downloads.

### 6.2 Index projection

**Default: PostgreSQL Full-Text Search.** Store bounded extracted-text chunks with version/page/offset provenance and `tsvector` fields, supported language configurations, and GIN indexes. Chunking bounds vector size/lexeme positions and large-document work. Use explicit parameterized SQL migrations/queries where Prisma lacks FTS support. Validate tokenization for required languages; `simple` is a candidate for languages without an approved stemmer, not an accuracy guarantee.

An application-owned **SearchPort** defines scoped query, authorized results/continuation, capabilities, projection upsert/remove, status, and rebuild operations. `PostgresFtsAdapter` is default; optional customer-local `OpenSearchAdapter` implements the same contract. Keep provider SDK/query syntax out of controllers/business services. Unsupported capabilities are explicit; do not silently downgrade access controls.

Extraction publishes revision-tagged projections via durable jobs. PostgreSQL can publish text/vector/state atomically once processing completes; content extraction itself remains asynchronous. Reject stale generation updates. Rebuild PostgreSQL projections into versioned tables/generations and switch active generation transactionally after checks; optional OpenSearch uses versioned indexes/aliases. Track freshness/failures and reconcile with documents. Search is unavailable/pending explicitly, not falsely complete.

### 6.3 Preventing authorization leakage

With PostgreSQL FTS, join authorized resource scope/current lifecycle and accepted-version records **before** ranking, pagination, snippets, and aggregates. Deduplicate chunk matches by document/version. Use parameterized safe query construction, bounded complexity, timeouts, and controlled highlighting output. Counts/facets may be exposed only when computed over the same authorized set. Permission revocations take effect through authoritative policy queries, not delayed index ACL updates.

Optional OpenSearch needs stricter defense because its permissions are projected, not live:

1. Build scope from the authenticated principal using authoritative policy data; never accept client-selected access tokens or organization scope as proof of access.
2. Apply index-side visibility filtering to reduce the candidate set; ACL fields are a projection, not authorization truth.
3. Reauthorize candidate document/version IDs against PostgreSQL before returning titles, snippets, highlights, metadata, or downloadable references.
4. Overfetch within bounded limits for pagination when candidates are rejected; opaque continuation state must not disclose excluded records.
5. Do **not** return raw engine totals, facets, or suggestions unless their authorized-only computation is proven. Initially omit totals/facets/suggestions or compute them from the authoritative allowed-ID set with safe bounded queries. Counts from the returned authorized page may be labeled only as page counts.
6. On permission revocation, invalidate permission caches immediately and deny live resource access even while index updates lag. A stale index must not expose old permissions.
7. Test titles, snippets, autocomplete, spelling suggestions, counts, sort order, exports, caches, timing/error behavior, and tenant boundaries as potential disclosure channels.

Never weaken authorization to enable optional OpenSearch or advanced features. Benchmark PostgreSQL FTS first; enable OpenSearch only for approved customer-local scale/analyzer needs after permission-leakage testing and capacity review. It is not a baseline container or install prerequisite.

## 7. Authentication and authorization

### 7.1 Browser identity

**Default local authentication:** maintain internal users and password credentials in PostgreSQL; hash passwords with a maintained Argon2id implementation, per-password random salt, encoded parameters, and tuned bounded cost. Never store recoverable passwords. Provide audited account creation/disable/unlock/reset, safe first-admin bootstrap without seeded passwords, generic login errors, account/source rate limiting, and bounded lockout/backoff against brute force and lockout abuse.

Issue opaque random sessions via Secure/HttpOnly/SameSite cookies; store only token digests and server-side state. Enforce idle/absolute expiry and revoke on logout, disable, credential recovery, and security-sensitive changes. Do not persist tokens in browser storage. Local authentication requires no mail service, cloud, IdP, or Internet. Optional LDAP/AD uses validated LDAPS/StartTLS and distinct linked identities; OIDC uses Authorization Code + PKCE when enabled. Keycloak is not required.

Validate CSRF tokens and Origin/Referer for unsafe cookie-authenticated requests; SameSite alone is insufficient. Directory outages fail closed for directory sign-in, never create local password fallback for that account. Local users remain functional. Directory deprovisioning/group mapping and existing-session behavior require explicit policy. See [Authentication architecture](AUTHENTICATION_ARCHITECTURE.md) for full controls and recovery.

### 7.2 Integration identity

Provide scoped, random, expiring/revocable local service credentials as a proposed offline API mechanism; store digests, display secrets once, and audit issuance/usage/revocation. Service principals receive explicit role/scope assignments and the same resource policies as users. Never reuse browser passwords or create a universal admin API key. Optional OAuth access tokens validate issuer/audience/signature/scopes; ID tokens are not access tokens. No IdP is required for baseline integrations.

### 7.3 Resource policies

Recommended policy: deny by default, explicit permissions in role bundles, and scoped assignments. Example candidate permissions include `document.read`, `document.download`, `document.create`, `metadata.update`, `version.create`, `workflow.approve`, `retention.manage`, and `audit.read`; names and bundles are not approved.

Evaluate action, principal, organization if applicable, repository/folder/document, classification policy if approved, lifecycle state, and workflow assignment. Centralize policy semantics; application services enforce them even when invoked by jobs or internal code.

Pending D-03, do not invent inheritance/deny rules. Moves must check both source and destination and apply reviewed resulting permissions before publishing the move. Role changes must invalidate access caches and trigger index projection updates. Break-glass access is not an automatic administrator privilege; it requires explicit policy, expiry, approvals where needed, and strong auditing.

## 8. API architecture

- Versioned REST endpoints under `/api/v1`; OpenAPI is the reviewed integration contract.
- Consistent bounded pagination, allowlisted sorting/filtering, and response schemas; do not expose ORM entities.
- Validate body/query/path types, unknown fields, payload sizes, and metadata schemas on the server.
- Use RFC 9457-style Problem Details with stable application codes and request IDs; do not return stacks, SQL, object-store keys, or secret endpoint details.
- Document 401/403 behavior and when 404 is intentionally used to avoid resource enumeration.
- Use `409` for conflicts and conditional requests/ETags where appropriate; require expected revision on sensitive updates.
- Long-running actions return `202` and an authorized job-status resource, not an unbounded synchronous request.
- Upload/download endpoints stream and implement explicit size/range/cache controls. Request limits must be aligned across proxy and API.
- Idempotency keys for relevant creates/finalizations/transitions bind to principal, endpoint, payload digest, and expiry; reject conflicting reuse.
- Enforce secure rate/concurrency limits and API-client scopes; tune approved thresholds before release. Per-repository business quotas require a separately approved quota policy.
- Same-origin browser access is preferred. If CORS is needed, allow explicit origins; never combine credentialed requests with wildcard origin policy.
- Optional webhooks require signed payloads, replay protection, retry policy, endpoint SSRF controls, and a business requirement; they are not included by default.

## 9. Frontend architecture

Organize the React application by domain feature: repositories, documents, metadata, search, processing status, workflow, retention, audit, and administration. Centralize routing, API client, session state, accessibility patterns, and user-visible error handling.

Use server-managed query state, generated contract types, route-level code splitting, and component-level forms. UI permission hints improve usability but are never security enforcement. Avoid downloading entire repositories for filtering or loading huge binaries into browser memory.

Provide visible pending/failed job states, upload progress/cancellation, conflict handling, empty/error states, and recovery actions. Permission expiry or revoked access must close sensitive views rather than render cached content indefinitely. Partition/clear client caches by session/organization and clear on logout. Sensitive endpoints should use private/no-store cache policy as appropriate; no offline/service-worker document cache is proposed.

Confirm accessibility, localization, browser versions, user timezone presentation, and responsive/mobile requirements in D-10.

## 10. Background processing and consistency

### 10.1 Durable work intent

Commit business changes, audit events, and outbox intent within one database transaction. An outbox dispatcher publishes jobs after commit. Stable event/job IDs allow duplicate delivery; mark dispatch state only after publish acknowledgement. A crash after enqueue but before acknowledgement may cause a duplicate, which must be harmless.

Queue records carry IDs and minimal context, not full document text, secrets, or credentials. Workers load authoritative records and revalidate scope/state. A scheduled service action uses an explicitly scoped service principal; user-requested sensitive actions may need permissions rechecked at execution time.

### 10.2 Execution semantics

- Assume at-least-once processing; do not promise exactly-once side effects.
- Give every stage a uniqueness/idempotency identity such as version, stage, and profile generation.
- Persist attempts, lease/heartbeat state where needed, results, and failure codes in PostgreSQL.
- Use bounded exponential retry with jitter for transient failures; malformed files/policy failures require triage, not infinite retry.
- Use failure quarantine/dead-letter behavior with authorized inspection and replay.
- Separate ingestion, OCR, rendering, indexing, connector, and retention workloads; apply per-type concurrency limits and resource budgets.
- Prevent stale or canceled attempts from publishing results through revision/generation checks.
- Schedule stable occurrence IDs and use locks where required to prevent duplicated scheduled actions. Respect approved time zones and DST rules.
- Reconcile DB intent/job state with queue state after outages; rebuilding a queue must not lose tasks.
- Dangerous actions require fresh policy/hold checks in the execution transaction, not just when scheduled.

Long-running business approval waits live in PostgreSQL workflow state; a worker must not remain occupied while waiting for a person. A dedicated workflow engine is deferred until process complexity proves the need.

## 11. Workflow and retention

Use explicit state machines and versioned definitions. Workflow decisions record actor, task, target document version, definition version, outcome, comment policy, and timestamp. Concurrency controls prevent double approval. A changed document cannot silently inherit an approval granted to another version.

Retention evaluates approved start events/durations/classifications; missing policy cannot invent an expiry. Proposed legal holds override disposition. Start in report-only mode with dry-run previews and explicit approvals for enabling deletion.

Purge is a multi-stage audited process: recheck holds and permissions, lock/mark eligible records, remove live originals and derivatives through controlled adapters, invalidate indexes/caches, verify completion, and retain the minimum approved tombstone/evidence. Storage retention locks may legitimately block deletion and must be reported, not bypassed.

Hold creation and purge eligibility must serialize on the affected record/policy state. Once irreversible physical deletion is in progress, new holds cannot restore deleted content; define that critical boundary and operator workflow before enabling purge. Backups and external sources need their own expiry/ownership policy; purging live data is not proof that all copies have disappeared.

## 12. Security architecture

### 12.1 Trust boundaries and controls

- **Browser/API:** TLS, secure sessions, CSRF, input validation, XSS/CSP controls, rate limits, object-level authorization.
- **API/database:** least-privilege roles, parameterized access, transactions, migration separation, bounded connection pools.
- **Binary ingestion:** quarantine, format/signature validation, malware scanning, parser sandbox, decompression/resource limits.
- **Workers/processors:** separate credentials, narrow file access, network isolation, bounded execution, non-root containers where possible.
- **Connectors:** approved customer-LAN endpoint/root allowlists, redirect/DNS/rebinding and SSRF defenses without indiscriminately blocking required private shares, least-privilege secrets, isolated agents.
- **Search/cache:** scoped projections, live authorization, no unauthorized counts/snippets, sensitive-cache invalidation.
- **Infrastructure:** private service networks, customer-local TLS/DNS/time, authenticated dependencies, local secrets, encrypted storage/backups, verified offline patch/signature updates, and restore drills.
- **Supply chain:** reviewed licenses, pinned dependencies/images/actions, SBOM, vulnerability scans, integrity/provenance checks.

Logs must not contain document text, cookies, tokens, passwords, connection strings, connector secrets, or unredacted sensitive metadata. All telemetry is customer-local; no external analytics, crash reporting, exporter endpoints, or automated support uploads. Diagnostics are opt-in local redacted exports with deliberate customer-controlled sharing only.

### 12.2 Audit integrity

Business audit is distinct from operational telemetry. Successful sensitive changes must atomically record an audit event or fail; define read/download/denial audit handling and failure behavior in D-09. Unavailability of an asynchronous log sink must not silently remove required evidence.

Use append-only application behavior and dedicated audit write/read privileges. The ordinary runtime must not update/delete prior audit records; an approved maintenance/retention process uses separately controlled credentials. Database administrators can still alter data: append-only tables alone are not tamper-proof.

If stronger evidence is required, use signed/hash checkpoints anchored in a **separately administered customer-local evidence store** or approved offline immutable media, with verified retention. No Internet service is required. A hash chain on the same writable server cannot prove integrity against privileged tampering. Audit payloads must obey minimization/privacy rules.

### 12.3 Verification and incident response

Maintain a threat model and ASVS-derived verification checklist. Test authentication bypass, broken object authorization, upload/parser attacks, SSRF, path traversal, search leakage, privilege escalation, secret exposure, and session revocation.

Define security incident ownership, quarantine procedures, credential/key rotation, evidence preservation, notification obligations, and post-incident review before production. No claim of certification or regulatory compliance is made by selecting this architecture.

## 13. Deployment and operations

### 13.1 Initial topology proposal

Install with Docker Compose on customer-owned Ubuntu/Linux physical servers or VMs. Separate development/test/production data roots, databases, secrets, and optional identity clients. The baseline includes proxy/web, API, PostgreSQL with FTS, local queue/dispatcher/workers, and local isolated processors. LDAP/OIDC/S3/OpenSearch are opt-in profiles/adapters, not baseline dependencies.

Only the reverse proxy exposes application HTTPS on approved customer LAN interfaces. PostgreSQL, queue, scanner, and processor endpoints are private/authenticated and not published to the LAN by default. Host admin access is operator-controlled. Use non-root images, read-only roots where practical, approved volumes, limits, and health checks. TLS uses customer CA/manual certificates or approved internal issuance, not public ACME.

A verified offline bundle contains all images and runtime assets, local instructions, Compose definitions, licenses/SBOM, signatures/checksums, migration tools, and compatible scanner/OCR data. Provide or explicitly document offline Ubuntu/Docker prerequisites. Installation/startup does not pull images/packages, use CDN assets/fonts, require online activation, or send telemetry. See [On-premise deployment](ON_PREMISE_DEPLOYMENT.md).

No deployment is performed in this task. Compose files, firewall rules, certificates, provisioning, and CI deployment credentials remain future approved work.

### 13.2 Scaling and failure modes

Scale API/web and local worker classes independently within approved customer infrastructure. Budget DB connections, OCR memory/CPU, storage IOPS, share bandwidth, backup windows, and recovery throughput. Include versions/reference snapshots, quarantine/scratch, PostgreSQL FTS/WAL, audit/log growth, backups, and rebuild headroom in capacity planning; monitor both bytes and inodes. No unmeasured server size is prescribed.

- Storage unavailable: reject/defer new transfers; do not claim writes succeeded.
- Scanner unavailable: retain quarantine; do not expose unscanned content.
- Search unavailable: return a clear search error; any approved repository listing fallback still uses live permissions.
- Queue unavailable: persist outbox intent and processing status; alert on backlog.
- Database unavailable: fail closed for authorization and business mutations.
- Optional LDAP/AD/OIDC unavailable: local accounts still work; linked accounts fail sign-in closed, with existing-session revocation/expiry under approved policy. Never downgrade authentication.
- Connector unavailable: mark degraded and retry; do not delete missing source records automatically.

A single server/VM is a single failure domain, not HA. RAID or VM snapshots do not replace backup. Multiple customer hosts, replication, and failover require approved D-08 objectives. Unavailable shares must not fall through to writes under an unmounted local path.

### 13.3 Backup and restore

Cover PostgreSQL data/WAL including local account hashes/authorization/audit, managed originals/reference snapshots, required configuration, connector state, and customer-held encryption/signing keys through separately controlled procedures. Optional self-hosted integrations require their own backup policies. Derivatives/FTS may be rebuilt from retained originals/provenance. Reference source backups belong to the source owner; managed snapshots are part of DMS backup.

Encrypt backups, restrict identities, and keep copies on a separate customer-controlled failure domain/media. Quiesce mutation/purge and align DB recovery points with immutable file manifests/snapshots, or implement a tested online consistency protocol. Restore in isolation with connectors/schedules paused; validate version hashes, permissions, account recovery, holds/tombstones, mount identity, and rebuild state before traffic resumes. Revoke restored sessions/service secrets as appropriate. No cloud backup is mandatory.

Define RPO/RTO, backup/retention schedules, key recovery, incident roles, and recovery acceptance tests before production readiness. Backup presence is not proof of recoverability.

### 13.4 Observability and release safety

Emit customer-local redacted logs/traces/metrics for API errors/latency, auth failures/lockout, jobs, processors, mounts, free bytes/inodes, connector/index lag, scan-signature age, certificate expiry, and backup/restore. Provide a local health/admin view even without a full telemetry stack. Separate liveness from readiness; optional-service failure must not prevent baseline local login/listing. Alerts use local dashboard and optional customer-local delivery, not mandatory external mail/chat.

Use alert thresholds agreed against baselines, named owners, and runbooks. Perform health checks and smoke tests after approved releases. Use expand/contract migrations and retained compatible images for rollback; irreversible migrations require recovery plans, not a promise of automatic rollback.

## 14. Architecture decision summary

Proposed decisions for review:

1. Modular TypeScript monolith plus separate workers, not business microservices.
2. PostgreSQL as authoritative business/security state; Prisma subject to SQL needs and compatibility.
3. Local managed filesystem plus NAS/SMB/NFS support; read-only external references with immutable version snapshots; S3 optional.
4. Local password authentication and server-side sessions; LDAP/AD/OIDC optional, Keycloak not required; DMS-enforced RBAC.
5. Immutable document versions; reliable outbox and idempotent processing.
6. Local sandboxed OCR/extraction/previews; no cloud content processing by default.
7. PostgreSQL FTS default behind SearchPort; customer-local OpenSearch optional.
8. React/Vite SPA and reviewed OpenAPI integration contract.
9. Docker Compose on customer-owned physical/virtual Ubuntu servers, offline install/update, local TLS/monitoring, capacity and tested customer-controlled backup/restore.
10. No mandatory cloud/Internet/external IdP/API, and no telemetry outside customer infrastructure; organization boundaries, detailed policies, workflow, retention, and capacity targets remain open.

After approval, capture decisions in `docs/adr/` before implementing consequences. This proposal is not a substitute for a threat model, approved schema, benchmark, or production readiness review.
