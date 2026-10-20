# Document lifecycle, versions, workflow, and retention

**CONFIRMED:** master capabilities. **PROPOSED:** state/operation protocols. Business durations, approver rules, and destructive policy remain in [Decision register](DECISION_REGISTER.md).

## Managed lifecycle

Candidate content states: pending-upload, quarantined/validating, accepted, processing-derived, active, logically-deleted/trash, disposition-review, purge-pending, purged-evidence-only, integrity-conflict. Processing failures are independent of accepted original availability.

Managed documents have stable IDs, current immutable version, physical/logical folder context, metadata revision, and lifecycle revision. Version records contain ID/sequence/time/actor/description/hash/size/NAS storage reference/processing state. Physical display paths are not identity or the only version locator.

Upload stages bytes outside accepted storage, validates/scans, publishes non-overwriting immutable NAS content with verified durability capability, and finalizes pointer/audit/outbox in a DB transaction. DB/share partial states are repaired through an operation ledger; see [Storage](STORAGE_ARCHITECTURE.md).

Operations:

- **Rename/move:** check action, source and destination/folder scope, capability and expected revision; conflict on collisions, cycles, external changes, or mismatched mount. Cross-repository move is a reviewed copy/verify/destination-publication/source-disposition saga, not assumed atomic rename.
- **Copy:** create a new document identity and destination policy/metadata selection with explicit provenance. Content sharing/dedup is not assumed; copying must not leak inaccessible history or inherit privileged source grants silently.
- **Delete:** proposed soft-delete/trash first, hide from ordinary search, retain approved version/evidence; separate logical removal from eventual physical purge.
- **Restore deleted document:** check trash availability, holds/policy, collision/destination access and integrity; record a new lifecycle transition. Distinguish this from restoring old content.
- **Restore earlier content:** read an authorized retained version and create a new current version with origin reference and new processing identity; never overwrite historical records.
- **Compare:** metadata/provenance comparison is required; binary/text side-by-side diff is not assumed.
- **Bulk:** bounded request or asynchronous manifest; per-item policy and expected revision at execution, stable idempotency, truthful success/failure/cancel counts. No all-or-nothing promise across NAS operations.

Recommend virtual/logical metadata revisions retained independently of binary versions. Workflow must pin the content identity and relevant metadata-schema/revision context; approval-sensitive metadata changes invalidate eligibility according to approved policy.

## Indexed lifecycle

Indexed physical state is discovered/present/modified/missing/unavailable/ambiguous/excluded. Source observations capture what DMS saw with hash/markers/times, not complete externally controlled file history.

No DMS physical delete/restore/version-create on the source. Logical hide/unregister changes DMS records only; display “Source file is not deleted.” Search/preview/extraction can be regenerated from current accessible bytes; missing old bytes may be unrecoverable. Optional retained snapshots are separately consented and labeled, not a compulsory indexing requirement.

Favorites, recent activity, relationships, categories, tags, virtual folders and saved views operate on internal IDs and live permissions; inaccessible targets contribute no hidden titles/counts. “Owner” filter means configured DMS custodian/contributor metadata, not an assumed NAS filesystem owner identity.

## Workflow state machine

Required commands: submit, review, approve, reject, return-for-correction, reassign, comment, due-date update where allowed, notification, history. Versioned definitions support reviewed sequential and parallel stages; no generic BPM platform is required.

Proposed instances: draft/submitted/in-review/returned/rejected/approved/canceled/stale. Tasks: open/claimed if policy requires/decided/reassigned/canceled/expired where policy permits. Due dates inform tasks, not implicit approval or deletion. Notifications persist in-app for offline operation; optional customer-local SMTP is additional delivery.

Every transition validates actor/action/assignment, definition version, current instance/task revision, document eligibility, and target content identity. Concurrency controls prevent double/stale decisions; audit task/assignment/comment changes. Exact parallel quorum, self-approval/separation of duties, delegation/escalation, and resubmission rules are business choices, not invented defaults.

Managed workflows pin version ID/hash and relevant metadata revision. Indexed workflows pin an **approved source-state representation** (observation ID/hash/verification time); reverify eligible source state before decisions. If changed/unavailable/ambiguous, stop the decision and mark stale/blocked rather than transfer approval. Without a retained/coherent source representation, declare limits on evidence reproduction; recommend high-assurance approvals on Managed versions or explicitly retained source snapshots, while keeping ordinary Indexed discovery usable without snapshots.

## Retention and holds

Required: versioned policies, start-event selection, expiry calculation, review before disposition, legal/administrative holds, and reporting. No default retention duration or automatic irreversible deletion.

Policies attach to approved repository/classification/type/document scope with explicit precedence; missing/conflicting rules require review. Evaluate in report-only mode initially. Holds block applicable managed purge and evidence expiration. Hold creation and purge eligibility serialize on authoritative state; document the irreversible execution boundary.

Managed purge is a policy-authorized, auditable, retry-safe multi-stage operation: eligibility/review, final hold check and execution claim, NAS deletion only within managed namespace, derivative/search invalidation, verification, and retained approved tombstone/audit. Partial failures remain visible; storage locks are not bypassed.

Indexed retention may hide/unregister DMS entries, expire derivatives/optional snapshots under policy, and report source-owner obligations. **Never delete the external source**. A DMS hold cannot prevent an external NAS owner modifying/removing source content; present that boundary and evidence coverage.

Backups need approved expiry/disposition handling. Restore reconciles holds/tombstones before traffic and never resurrects purged content silently. Records/audit are not casually cascade-deleted with a file row.

## Audit scope

Record login, view/preview/download, upload, rename/move/copy/delete/restore, metadata/permission changes, workflow and admin actions with actor/action/target/time/outcome/request ID and redacted change context. Successful mutations commit audit/ledger/outbox with DB state; read/transfer events record attempt plus completion/failure (including disconnect) without pretending all bytes were viewed.

Reconciliation records system observations such as “external change detected,” not a fabricated human actor/action. Direct NAS operations are outside complete DMS audit. See [Security](SECURITY_ARCHITECTURE.md) for required durable audit/failure behavior.

## Acceptance

Test all commands against type/capability/policy matrices, concurrent edits/approvals/holds, NAS ledger recovery, missing versions, indexed source changes mid-decision, trash collisions, bounded bulk partial outcomes, no source purge, and backups restoring correct policy/history state.
