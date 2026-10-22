# Consolidated decision register

**Date:** 2026-10-08. This is the **only authoritative register of unresolved choices**. Other specifications link here; they must not invent separate policy decisions. CONFIRMED records master requirements; PROPOSED recommends a safe technical default; OPEN identifies actual business/qualification inputs. No implementation/deployment/new push authorization is implied.

## Confirmed baseline and precedence

Master specification supersedes previous mandatory Indexed snapshots/local-original-storage-first recommendations. Dedicated customer Linux app server, NAS-primary Managed and existing in-place read-only Indexed repositories, React/TypeScript, NestJS/TypeScript, PostgreSQL/FTS, local Tesseract/BM-English processing, Compose/offline/local accounts, optional LDAP/AD, and no mandatory cloud/IdP/AI/API/telemetry.

One million documents is a required measured design target; priority preview formats, bilingual accessible file UX, detailed indexing/metadata/workflow/audit/hold capabilities are confirmed. Existing S3/OpenSearch/OIDC extensions remain deferred possibilities, not new dependencies or current delivery commitments. Exact package/processor choices and customer/business policies still need validation.

## D-01 — Installation and internal boundaries

- CONFIRMED: one customer-owned dedicated Ubuntu/Linux application server, physical/VM/private infrastructure, Compose/offline.
- PROPOSED: one customer per isolated installation, explicit repository/department scopes; no shared SaaS tenancy/RLS complexity by default.
- OPEN: multiple internal organizations needing hard isolation, approved Ubuntu/CPU support matrix and HA need.
- Owner/gate: Product Owner/customer operations, before identity/schema foundation. Implement the single-installation model unless hard isolation is requested/approved.

## D-02 — Local account and recovery policy

- CONFIRMED: local accounts, secure hashing/sessions/reset/activation/rate limits/lockout, optional local MFA, one-time bootstrap/no default credentials, no Internet recovery.
- PROPOSED: maintained Argon2id (benchmarked current safe parameters), opaque DB sessions, layered source/account limiting with temporary progressive backoff, local audited recovery, optional TOTP and separate LDAP identities.
- OPEN: password/session/lockout thresholds, MFA role requirements, reset/bootstrap custodian/dual control, directory group mappings and deprovisioning interval.
- Owner/gate: Product Owner/security, before authentication acceptance. No cloud email or fallback password requirement.

## D-03 — Effective permissions

- CONFIRMED: permissions not role names; repository/folder scope, backend service checks, group/revocation/move tests, no implicit NAS ACL synchronization.
- CONFIRMED (Product Owner, 2026-10-20): departments (named staff groups) may receive the same scoped grants as a user. Membership is additive: every member inherits the department’s repository/folder role; search and explorer use the same effective permissions, so a file uploaded into a granted folder is visible in other members’ search. Direct user grants remain. This is a DMS department, not an LDAP/AD group mapping.
- CONFIRMED (Product Owner, 2026-10-20): sharing is this grant path (user or department). Viewer: open, preview, download, search. Contributor: also create folders and upload new files (Managed storage or onto an Indexed source). Grants inherit down the folder tree.
- PROPOSED: additive scoped grants inherited down physical folders, deny by default, no explicit-deny/document-override/public-share initially; virtual membership grants no access. Suggested role bundles are customizable. Broad ancestor grants cannot be revoked by a child under this simple model—make that visible.
- OPEN: whether restricted children/explicit denies are necessary, role bundle authority, audit viewers, directory provisioning and break-glass policy.
- Owner/gate: Product Owner/security, before permission migrations and repository features. Accept/revise one defined inheritance model rather than coding ambiguous precedence.

## D-04 — Managed NAS layout and source evidence

- CONFIRMED: dedicated Managed NAS namespace, actual physical file operations and stable IDs; Indexed originals remain in place with no forced migration; versioning primarily Managed, Indexed history incomplete.
- CONFIRMED (Product Owner, 2026-10-20, revised): Google Drive-style Indexed sharing. DMS may create folders and add **new** files onto the Indexed source when the caller has `documents.write`. Exclusive create only (no overwrite). No DMS rename, move, or delete on the source. Malware scan before a file is published onto the source. Connector must be mounted and writable. Files added outside DMS still appear after scan.
- PROPOSED: Managed physical working tree plus controlled immutable accepted-version snapshots on the same customer NAS. Immutable committed version is content authority; physical working copy is validated current presentation, not a second independently writable master. Indexed bounded transient staging/derived data only, no retained-original snapshots by default.
- OPEN: acceptable managed working-copy/version overhead, visibility/interoperability of current tree, required coherent-read assurance, optional Indexed snapshot consent/retention and source-native history.
- Owner/gate: Product Owner/operations, before Managed storage publication; ordinary Indexed discovery is not blocked on optional snapshot consent.

## D-05 — Processing formats and quality

- CONFIRMED: local Tesseract BM/English; PDF/JPEG/PNG/TIFF/DOCX/XLSX/PPTX priorities, local thumbnails/previews/text/conditional OCR, no external fetch, bounds/scanning/retry/reuse.
- PROPOSED: pinned `msa`/`eng` data; bounded local converters/rasterizers, fail-closed unsafe content, explicit unsupported/encrypted/fidelity limitations.
- OPEN: size/page/pixel/sheet limits, quality/fidelity thresholds, customer fonts, handwriting expectations and format-specific rules.
- Owner/gate: Product Owner/QA/security, before processing acceptance; review representative synthetic samples and tool redistribution.

## D-06 — Workflow business rules

- CONFIRMED: submit/review/approve/reject/return/reassign/comments/history/due/notifications; sequential/parallel where approved, version/source-state target and stale prevention.
- CONFIRMED (2026-10-21 Product Owner slice): admin-configured sequential templates; each step’s eligible pool is a named user, a role, or a department; the submitter picks one person per step from that pool; the submitter cannot review or approve their own document; approve opens the next step, reject ends the instance.
- PROPOSED: versioned simple definition/state machine, persistent in-app notifications; Indexed decision revalidates observation/hash, blocks changed/unavailable source, high-assurance use prefers Managed/explicit snapshot evidence.
- OPEN: parallel quorum, delegation/escalation, due-date rules, notification channels, return/reassign rules, approval-sensitive metadata and acceptable Indexed evidence guarantees.
- Owner/gate: Product Owner/business records owner, before remaining workflow rules; no invented parallel quorum.

## D-07 — Retention, holds, disposition

- CONFIRMED: policy/start event/expiry/review/holds/reports; no auto irreversible deletion without approved policy; Indexed sources never deleted, logical removal distinct.
- PROPOSED: report-only first, Managed soft-delete/trash, holds before purge, separate evidence/snapshot/derivative/backup retention, approval-gated physical purge.
- OPEN: durations/start triggers/precedence, hold authority, purge review/custodians, trash/backup expiry and evidence/legal obligations.
- Owner/gate: Product Owner/records/legal/security, before policy release/destructive enablement. No fixed duration is invented.

## D-08 — Capacity, recovery and host sizing

- CONFIRMED: capacity/health, NAS and DB backup coordination, offline restore/runbooks, one million-document target.
- PROPOSED: measured lowest qualification hardware, bounded concurrency/I/O, separate customer-controlled backup failure domain, warning/defer thresholds with recovery headroom.
- OPEN: CPU/RAM/usable disk/IOPS/LAN/NAS hardware, growth/page/byte/version/optional-snapshot load, availability/RPO/RTO, backup windows/media/site and operations owner.
- Owner/gate: Product Owner/operations, before qualification/deployment. RAID/single VM is not HA or independent backup.

## D-09 — Security, audit and offline maintenance

- CONFIRMED: all listed read/mutation/admin/auth audit categories, local TLS, source/path safety, scanning/isolation, no external telemetry or complete outside-NAS audit claim.
- PROPOSED: ASVS-derived verification, durable access intent and transfer completion, atomic DB mutation audit, append-only runtime privileges, customer-local separately protected evidence, verified offline patches/signatures.
- OPEN: regulatory/privacy requirements, audit/history/evidence retention, signature-age warning/block policy, key custody, incident owner and privileged maintenance process.
- Owner/gate: Product Owner/security/operations, before security acceptance. No compliance certification inferred.

## D-10 — Release scope and coexistence

- CONFIRMED: no forced migration of existing Indexed documents, incremental working phases, master scope.
- PROPOSED: early read-only NAS explorer/index/search value, then processing and Managed operations; every phase has real authorization/audit/tests.
- OPEN: first release subset and explicit deferred features, V1 coexistence/import requirements and commercial license/support terms.
- Owner/gate: Product Owner, before release scope. No V1 repository/data access authorized.

## D-11 — Dependency approval

- CONFIRMED: React/NestJS/TypeScript/PostgreSQL/FTS/Tesseract/Compose; avoid unnecessary technology.
- PROPOSED: retain Vite, Fastify adapter, Prisma with reviewed SQL, Argon2id, local BullMQ/Valkey, Nginx and current test tooling; local converter/scanner dependencies justified by formats/security. Benchmark simpler local queue alternative only if queue footprint is a real issue; no routine stack churn.
- OPEN: exact versions/license redistribution/native compatibility/Valkey semantics, processor/font data packaging and minimal supported offline bundle.
- Owner/gate: technical lead/Product Owner, before dependency manifests. Optional cloud/search/object-store/IdP components stay deferred, no baseline transitive dependency.

## D-12 — Web-managed connector privilege boundary

- CONFIRMED: UI add/test/credential validation/root browsing/select/health/update/disable, source credentials server-side, mount identity/no fallback/path escape.
- CONFIRMED (Product Owner, 2026-10-20): a local indexed folder can be added from the DMS UI without listing it first in `INDEXED_LOCAL_ROOTS`. The path must exist, be a readable directory, and not be a kernel/virtual filesystem (`/proc`, `/sys`, `/dev`). Optional `INDEXED_LOCAL_ROOTS` still locks the picker to approved locations when operators set it.
- PROPOSED: narrow authenticated host gateway with fixed allowlisted operations plus preprovisioned-mount mode; host installs privileged envelope once, routine admin via UI.
- OPEN: customer-approved privilege/IPC/auth model, endpoint/root envelope, share ACL mappings and supported protocol/platform security settings.
- Owner/gate: operations/security/technical lead, before connector gateway implementation and any real NAS access.

## D-13 — Indexed freshness and observation confidence

- CONFIRMED: external new/modify/missing/rename-where-supported, outages not missing, ambiguous reconciliation explicit, incomplete external history/audit visible.
- PROPOSED: conservative corroborated relinking; no checksum-only merge; missing only after complete scope/probe; staged verified downloads; generation/freshness checks for previews/search/tasks; default unsafe-stale content hidden from ordinary results.
- OPEN: full reconcile/checksum/freshness intervals, allowed cached search/preview during outage, source-native coherence needs, ambiguous-resolution authority and source-state workflow evidence level.
- Owner/gate: Product Owner/security/operations, before indexing/source-serving acceptance. No universal stable file-ID/atomic external-read promise.

## D-14 — UX and metadata conventions

- CONFIRMED: BM/English, physical/virtual explorers, primary file UX, accessible desktop/tablet/mobile essentials, all screen states; all listed metadata types/schema versions.
- PROPOSED: restrained light design tokens, WCAG 2.2 AA measurable baseline, localized translation keys, UTC storage/user-zone display, in-app notifications and permission-safe dashboards.
- OPEN: brand palette/default locale/site timezone, browser support, customer taxonomy/field validation/defaults, history/privacy retention and usability acceptance metrics.
- Owner/gate: Product Owner/design/QA, before reference-screen approval and metadata template release. No assumed department/classification policy.

## D-15 — Million-document qualification budgets

- CONFIRMED: at least 1,000,000 distinct documents, benchmarks before claims, streaming/batching/pagination/concurrency/checkpoints/resource limits.
- PROPOSED: reproducible mixed synthetic corpus and lab SMB3/NFS runs, real ACL queries/processing/outages, p95/p99 plus memory/IO/backlog/recovery/correctness evidence.
- OPEN: workload format/page/byte proportions, concurrent users/query rate, freshness/OCR throughput/query latency targets and minimum hardware/device support criteria.
- Owner/gate: Product Owner/QA/operations, before performance qualification, not before basic implementation. No achieved speed/scale claim.

## D-16 — Internal messaging

- CONFIRMED (Product Owner, 2026-10-20): direct 1-to-1 conversations, groups and per-document discussion threads; every active user may message any active user; attachments are document links only, opened under the recipient's own D-03 permissions; messages are official records that cannot be deleted and authorised auditors may read them for investigations.
- PROPOSED/IMPLEMENTED: edits allowed for 15 minutes by the sender with every prior text kept as a revision; database triggers refuse message deletion and revision changes; group owner adds/removes, members may leave (owner leaving hands over to the earliest member); document threads readable only while the viewer can read the document; investigation requires `messages.audit`, a stated reason and writes an audit event per list/read; real-time delivery by Server-Sent Events carrying ids only, fanned out through Valkey (in-memory fallback); 4,000-character limit, 50-member groups, 5 links per message, 30 messages/minute per user.
- OPEN: whether `system.admin` should keep implicit `messages.audit` (today the admin superuser implies every permission — separation of duties); message retention period and legal-hold interaction with D-07; read receipts visibility; notification outside the app (email is not available offline).
- Owner/gate: Product Owner/security, before production pilot. No message purge path exists.

## Approval record

- Master prompt confirms product/core architecture and authorizes documentation finalization only.
- Prior commits `84ea9e8` and `c94a699` were pushed under separate explicit approvals. Those approvals do not authorize this revision's commit/push.
- Detailed recommendations/ADRs labeled PROPOSED await review; CONFIRMED ADRs record master decisions, not deployed/verified controls.
- No application code, dependency installation, production change, deployment, or customer NAS access is authorized now. Approval of one future phase does not imply permission for pushes/destructive operations/infrastructure access.

Record decision/date/owner/rationale here and technical consequences in ADRs; a deferral names blocked work. Prefer safe recommendations over repeated isolated questions; collect remaining policy approvals in one review.
