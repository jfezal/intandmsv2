# System architecture proposal

**IntanDMS V2 — Sisi Awan Technologies Sdn Bhd**

**Status:** proposed for Product Owner review; no implementation authorized.

**Date:** 2026-10-08

## 1. Executive recommendation

Build an **API-first modular monolith with independently deployed background workers**. Keep business state in PostgreSQL, binaries in managed storage, and indexes/queues as derived infrastructure. Use centralized identity with consistent resource authorization.

This balances enterprise controls and maintainability without the premature cost of microservices. API and workers may share application/domain packages while running in separate processes and security boundaries. Document processing has a narrower trust boundary than the API.

The repository was empty when inspected. This proposal is a greenfield baseline, not an assessment of existing application architecture. V1 code reuse, data migration, and business compatibility are not assumed.

Major recommendations require D-01 through D-11 review in [Requirements](REQUIREMENTS.md). In particular, tenancy and authorization semantics must precede initial data-model migrations.

## 2. Logical topology

```text
User browser                         Integration client
     | HTTPS, same-origin                 | OAuth access token
     v                                    v
Reverse proxy / web assets --------> NestJS/Fastify REST API
                                           |
          Enterprise OIDC IdP <------------+ (login/session flow)
                                           |
                  +------------------------+----------------------+
                  |                        |                      |
             PostgreSQL              Binary storage          OpenSearch
         business state, ACL,         managed S3,            derived index
         sessions, audit, outbox       approved adapters
                  |
             Outbox dispatcher ----> BullMQ / Valkey
                                           |
                       +-------------------+-------------------+
                       |                   |                   |
                  Job workers       Connector workers    Lifecycle workers
                       |
                isolated processors
          scan / extract / OCR / render

All services -> redacted logs, metrics, traces, alerts
Durable systems -> encrypted off-host backup and tested restoration
```

This is a logical dependency map, not a confirmed VPS layout. IdP, object storage, and telemetry may be external approved services. The API never sends unapproved content to external processors.

## 3. Module boundaries

Proposed backend modules:

- **Identity and sessions:** OIDC login, session lifecycle, identity mappings, integration principals.
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
- `users` linked by the immutable OIDC issuer/subject pair; email is not an identity key.
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
- connector checkpoints/source mappings and index projection watermarks.

One repository has folders/documents; one document has many immutable versions; a version references managed content and derived artifacts. Workflow instances pin their definition version and target document version. Audit/job history must survive ordinary document soft deletion.

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

Do not claim tenant safety before D-01 is resolved. If shared multi-tenancy is approved, propagate `organization_id` through tenant-owned tables, composite foreign keys/uniqueness, job payloads, indexes, storage namespaces, and authorization contexts. Validate tenant context from a trusted session/principal, never the request body alone.

Consider PostgreSQL RLS as defense in depth, with transaction-local context, least-privilege roles, and tests for connection-pool reuse and service/admin bypass. RLS does not protect object storage, search, queues, or caches by itself. If one organization per deployment is chosen, repository-scoped authorization remains mandatory.

### 4.4 Migrations and recovery

Every schema change is a versioned migration. Production schema auto-synchronization is prohibited. Use expand/backfill/contract changes for compatibility; test fresh setup and upgrade from the previous supported release.

Separate schema-owner/migration credentials from runtime credentials. Runtime roles must not have unrestricted DDL privileges. Changes affecting audit, holds, tenant boundaries, or constraints need explicit risk review.

Backup strategy must include PostgreSQL full backups and WAL/PITR where approved RPO requires it. Coordinate recovery with immutable object inventory and lifecycle deletion records. A database snapshot alone cannot recover missing binaries.

## 5. Storage architecture

### 5.1 Managed storage

Place originals and derivatives in private S3-compatible storage. Use opaque object keys derived from server-controlled object/version IDs and, if required, organization boundaries. User filenames must never control a filesystem path or object namespace.

Logical application versions are distinct from bucket versioning. Bucket versioning is a recovery tool, not the application version model. Encrypt at rest and in transit with approved key ownership/rotation; test provider-specific capabilities rather than assuming them.

Separate original, quarantine, and derivative namespaces and credentials as needed. Default to application-authorized downloads; very short-lived presigned URLs are an optional optimization only after review of revocation windows and leakage risks. URLs are bearer capabilities and cannot generally be revoked instantly.

### 5.2 Ingestion transaction boundary

The database and object store have no shared transaction. Proposed upload saga:

1. Authorize contributor and destination; validate intended size/type against policy; reserve an upload session with expiry and idempotency identity.
2. Stream to a server-generated quarantine key or use a narrowly scoped direct-upload capability if explicitly approved. Enforce byte limits even when `Content-Length` is absent or false.
3. Verify actual size, content signature/MIME, and a cryptographic checksum. Multipart ETags are not reliably content hashes.
4. Register a pending immutable version, its storage reference, audit event, and processing outbox entry in one PostgreSQL transaction. It is not yet readable as an accepted document version.
5. Scan content in an isolated processor. Promote the object/state using idempotent transitions only after required checks pass. Copy/promotion and DB updates are reconcilable, not falsely atomic.
6. Publish the accepted current-version pointer in a transaction, recording audit and next-stage jobs. Extraction/preview failures must be visible independently of upload acceptance.
7. Reconcile stale uploads, failed promotions, duplicate requests, and orphan objects. Cleanup cannot delete committed versions; use age grace periods and confirmed references.

Default scan outage policy is fail-closed for visibility: leave the file pending/quarantined, alert, and retry. Administrative bypass would require an explicit policy and audit. Some dangerous but malware-free files remain unsafe for inline rendering.

### 5.3 NAS and SMB

Use a connector boundary separate from interactive API file access:

- Restrict configuration to approved roots/endpoints; users do not supply arbitrary hosts, shares, or mount paths.
- Keep connector credentials in an approved secret store or encrypted secret mechanism with the key outside the database.
- Use SMB3 with approved encryption/signing settings; disable obsolete/insecure protocol options.
- Run mounts/connector agents under dedicated OS accounts with minimal network and filesystem scope. If mounting requires elevated privileges, perform it outside ordinary API/processing containers under operator control.
- Enforce path containment, reject traversal, and prevent symlink/TOCTOU escape with OS-level containment and safe path operations; string-prefix checks alone are insufficient.
- Track source identity, modification markers, size, hashes where available, and scan checkpoints.
- Compare pre/post-copy source markers; detect source changes during read and retry rather than certify a mixed version.
- Perform periodic full reconciliation; timestamps or event notifications alone are not reliable change detection.
- Source errors/offline shares do not imply source deletions. Use explicit tombstone confirmation and policy.

### 5.4 Connector ownership modes

- **Import:** read source, copy into managed immutable storage, retain provenance. Recommended initial NAS/SMB mode.
- **Reference:** source remains authoritative. Fast access may be possible, but permissions, mutation, outage, and retention guarantees are weaker. To guarantee historical versions, capture managed snapshots; otherwise expose the limitation explicitly.
- **Managed/write:** DMS owns approved paths or bucket namespace and writes under defined policies. Requires separate approval, concurrency semantics, and recovery procedures.

No remote deletion, remote renaming, or bidirectional sync is authorized by this proposal. S3 event notifications are optional accelerators, not a substitute for reconciliation. External credentials must never be exposed to browsers.

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

Use native text extraction where reliable; OCR is conditional on format/page content and policy, not blindly applied to every file. Record language, page coverage, detected failures, and confidence where the engine actually provides meaningful values. Validate quality on representative business documents; OCR output is not guaranteed evidence of the original text.

Apply CPU, memory, wall-clock, byte, archive-expansion, page, pixel, and temporary-disk limits. Disable processor egress by default and give it access only to the required input/output. Treat parser libraries and conversion engines as patch-sensitive attack surfaces. Never interpolate filenames into shell commands.

Serve generated previews on a separate controlled origin or appropriately sandboxed context with restrictive CSP. Do not embed untrusted HTML/SVG or active office content under the authenticated application origin. Preview caches and range endpoints need the same authorization as original downloads.

### 6.2 Index projection

Index stable document/version IDs, approved metadata, extracted text, language/analyzer context, lifecycle state, organization/repository scope, projection revision, and proposed permission visibility tokens. Avoid indexing secrets or unnecessary personal information.

Use database events/outbox to drive updates. Index version/revision checks reject stale messages that would restore old metadata or deleted content. Permission/move/delete changes generate invalidation and reindex work. Rebuild into a new index and atomically switch aliases after consistency checks; preserve mapping/analyzer versions.

Track oldest pending projection, update failures, missing/stale records, and permission-sync lag. Background reconciliation compares authoritative database state to index projection. Search is eventually consistent; the UI must show pending processing where appropriate.

### 6.3 Preventing authorization leakage

Search authorization is a major review item, not a simple post-filter:

1. Build scope from the authenticated principal using authoritative policy data; never accept client-selected access tokens or organization scope as proof of access.
2. Apply index-side visibility filtering to reduce the candidate set; ACL fields are a projection, not authorization truth.
3. Reauthorize candidate document/version IDs against PostgreSQL before returning titles, snippets, highlights, metadata, or downloadable references.
4. Overfetch within bounded limits for pagination when candidates are rejected; opaque continuation state must not disclose excluded records.
5. Do **not** return raw engine totals, facets, or suggestions unless their authorized-only computation is proven. Initially omit totals/facets/suggestions or compute them from the authoritative allowed-ID set with safe bounded queries. Counts from the returned authorized page may be labeled only as page counts.
6. On permission revocation, invalidate permission caches immediately and deny live resource access even while index updates lag. A stale index must not expose old permissions.
7. Test titles, snippets, autocomplete, spelling suggestions, counts, sort order, exports, caches, timing/error behavior, and tenant boundaries as potential disclosure channels.

If secure arbitrary scoped authorization cannot be implemented efficiently in OpenSearch at the expected scale, simplify the permission model or adopt PostgreSQL-authorized search after review; do not weaken security to preserve a search feature. D-03/D-08 must settle this tradeoff before advanced search.

## 7. Authentication and authorization

### 7.1 Browser identity

Use OIDC Authorization Code + PKCE through the backend. Validate discovery/issuer configuration against an allowlist, exact redirect URIs, `state`, `nonce`, issuer/audience, signature algorithms, key rotation, and token expiry. Do not treat user-supplied discovery URLs as safe.

The backend holds tokens server-side only if needed, encrypts sensitive token material, and issues an opaque random session identifier via Secure/HttpOnly/SameSite cookies. Store only a digest of the application session token for lookup. Rotate sessions on login and privilege changes; enforce idle/absolute expiry and server-side revocation. Choose cookie/site behavior compatible with OIDC redirects and test the complete flow.

Validate CSRF tokens and Origin/Referer for unsafe cookie-authenticated requests; do not rely on SameSite alone. Do not store bearer/refresh tokens in `localStorage`. Require deliberate logout, expired-session behavior, IdP outage policy, and deprovisioning propagation. Email changes must not create or hijack an identity.

### 7.2 Integration identity

Use IdP-issued OAuth access tokens for service clients with expected issuer, API audience, permitted algorithms, scopes, and expiry. Client-credentials flow is a candidate for nonhuman clients; user delegation needs a separately approved flow. Service accounts are auditable principals, not superuser API keys. Apply resource authorization in addition to token scopes. Design revocation and short token lifetimes according to risk.

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
- Enforce rate limits, concurrency limits, API-client scopes, and per-repository quotas only after quota policies are approved.
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
- **Connectors:** endpoint/root allowlists, SSRF protection including redirects/DNS/private-network policy, least-privilege secrets, isolated agents.
- **Search/cache:** scoped projections, live authorization, no unauthorized counts/snippets, sensitive-cache invalidation.
- **Infrastructure:** private service networks, authenticated dependency endpoints, secret rotation, encrypted storage/backups, patching, monitored restore procedures.
- **Supply chain:** reviewed licenses, pinned dependencies/images/actions, SBOM, vulnerability scans, integrity/provenance checks.

Logs must not contain document text, cookies, tokens, passwords, connection strings, raw connector secrets, or unredacted sensitive metadata. Error monitoring has the same data-handling restrictions as ordinary logs.

### 12.2 Audit integrity

Business audit is distinct from operational telemetry. Successful sensitive changes must atomically record an audit event or fail; define read/download/denial audit handling and failure behavior in D-09. Unavailability of an asynchronous log sink must not silently remove required evidence.

Use append-only application behavior and dedicated audit write/read privileges. The ordinary runtime must not update/delete prior audit records; an approved maintenance/retention process uses separately controlled credentials. Database administrators can still alter data: append-only tables alone are not tamper-proof.

If stronger evidence is required, use externally anchored signed/hash checkpoints and separately protected immutable exports with verified retention controls. A local hash chain without trusted external anchoring does not prove integrity against privileged tampering. Audit payloads themselves must obey privacy/minimization rules.

### 12.3 Verification and incident response

Maintain a threat model and ASVS-derived verification checklist. Test authentication bypass, broken object authorization, upload/parser attacks, SSRF, path traversal, search leakage, privilege escalation, secret exposure, and session revocation.

Define security incident ownership, quarantine procedures, credential/key rotation, evidence preservation, notification obligations, and post-incident review before production. No claim of certification or regulatory compliance is made by selecting this architecture.

## 13. Deployment and operations

### 13.1 Initial topology proposal

Separate development, staging, and production with distinct secrets, databases, buckets, identity clients, and DNS. Start with Docker Compose on an approved VPS or local environment; containers isolate processes but do not provide host-level redundancy.

Only the reverse proxy exposes public application ports. PostgreSQL, queue, search, scanners, and processor interfaces are private and authenticated; they must not bind publicly without a reviewed reason. Administrative host access requires operator-managed controls. Use non-root multi-stage images, read-only roots where possible, explicit volumes, resource limits, and health checks.

Separate services: proxy/web, API, dispatcher/scheduler, general workers, isolated processors, database, queue, and search when selected. IdP/object storage/telemetry may be external. Avoid placing all heavy services on a small VPS without measurement.

No deployment is performed in this task. Compose files, firewall rules, certificates, provisioning, and CI deployment credentials remain future approved work.

### 13.2 Scaling and failure modes

Scale stateless API/web instances and worker classes independently. Budget database connections across API, workers, dispatcher, and migrations. Tune queues based on actual CPU/memory/storage and provider limits. OpenSearch and OCR resource requirements must be benchmarked.

- Storage unavailable: reject/defer new transfers; do not claim writes succeeded.
- Scanner unavailable: retain quarantine; do not expose unscanned content.
- Search unavailable: return a clear search error; any approved repository listing fallback still uses live permissions.
- Queue unavailable: persist outbox intent and processing status; alert on backlog.
- Database unavailable: fail closed for authorization and business mutations.
- IdP unavailable: follow approved session continuity policy; no password fallback invented.
- Connector unavailable: mark degraded and retry; do not delete missing source records automatically.

A single VPS has a host failure domain and cannot meet a strict HA promise. Replication, managed services, multiple hosts, and failover require D-08 review.

### 13.3 Backup and restore

Cover database data/WAL, original objects and required object versions, audit exports, connector mappings, configurations, self-hosted IdP state, and encryption/signing key material through separately controlled procedures. Derivatives/search can be rebuilt if originals and provenance are intact; approve whether to back them up for faster recovery.

Encrypt backups, restrict backup identities, keep approved off-host copies, and test restoration in an isolated environment. Validate database/object inventory consistency, roles/access policies, held records, content hashes, and rebuild progress. Restore deletion/hold state before reopening traffic so recovery does not resurrect purged data accidentally.

Define RPO/RTO, backup/retention schedules, key recovery, incident roles, and recovery acceptance tests before production readiness. Backup presence is not proof of recoverability.

### 13.4 Observability and release safety

Emit structured logs, trace/request IDs, and metrics for API latency/errors, authorization denials, storage failures, queue age/depth, processor duration/errors, connector lag, index freshness, and backup/restore outcomes. Separate liveness from dependency readiness; avoid making a recoverable optional-service outage restart every container.

Use alert thresholds agreed against baselines, named owners, and runbooks. Perform health checks and smoke tests after approved releases. Use expand/contract migrations and retained compatible images for rollback; irreversible migrations require recovery plans, not a promise of automatic rollback.

## 14. Architecture decision summary

Proposed decisions for review:

1. Modular TypeScript monolith plus separate workers, not business microservices.
2. PostgreSQL as authoritative business/security state; Prisma subject to SQL needs and compatibility.
3. Private S3-compatible managed originals; external adapters with explicit ownership modes.
4. OIDC and server-side browser sessions; authorization remains in the DMS.
5. Immutable document versions; reliable outbox and idempotent processing.
6. Local sandboxed OCR/extraction/previews; no cloud content processing by default.
7. Dedicated OpenSearch target, with PostgreSQL FTS as a reviewed lower-cost alternative.
8. React/Vite SPA and reviewed OpenAPI integration contract.
9. Docker-ready VPS baseline without implying HA; off-host backups and restoration tests.
10. Tenancy, detailed permissions, workflow, retention, and capacity deferred to explicit Product Owner decisions.

After approval, capture decisions in `docs/adr/` before implementing consequences. This proposal is not a substitute for a threat model, approved schema, benchmark, or production readiness review.
