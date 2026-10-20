# Repository operating models

**CONFIRMED:** master specification, 2026-10-08. **PROPOSED:** detailed contracts below. No implementation authorized.

## Product invariant

Customers keep documents on their NAS/file servers. They are not required to migrate existing files into an object store or proprietary platform. Repository type is a business/security boundary, not a storage-driver flag. Every API operation evaluates repository capabilities and permissions independently.

## Managed Repository

- Dedicated customer-authorized NAS namespace; DMS controls operations within it. SMB3 or NFS are transports, not identity/version models.
- Upload/download, physical rename/move/copy, permitted delete/restore, immutable version history, metadata, workflow, audit, search/OCR/preview.
- Stable internal document IDs survive rename/move; physical paths are references.
- Proposed layout: dedicated NAS physical working tree reflects actual current folders/names; protected `.intandms/` holds immutable accepted-version blobs/staging/trash. A committed immutable version is authoritative content; the working file is a checksum-validated current presentation, not a second independently writable master. Both remain customer-owned NAS data, not an S3 migration. D-04 reviews interoperability and working-copy/version capacity overhead before implementation.
- Successful content restore publishes a new version with provenance; never rewrite an old version or hash.
- DMS authorization cannot prevent direct NAS edits granted by NAS ACLs. Recommend limiting direct writes to service/operators; detect integrity drift and show limitations. Do not attribute an external change to a DMS user.
- Physical operations use a durable operation ledger, expected revisions, observed NAS state, audit/outbox, and reconciliation. Never claim a DB/share transaction.

## Indexed Repository

- Existing customer root, files stay in place; no migration and no mandatory retained source snapshots.
- Discover physical folders/files, extract metadata/text, OCR, index/search, preview/download, and DMS-only tags/classification/virtual organization.
- **Sharing** is D-03 grants (user or department). Viewer may open, search and download. Contributor may also create folders and upload **new** files onto the source (exclusive create; no overwrite). Recipients do not need NAS Explorer access.
- No physical rename/move/copy/delete, physical restore, or DMS-controlled version creation on that repository. A separately authorized explicit copy into a Managed Repository is an import/new document, not a source mutation.
- Logical metadata updates are stored in PostgreSQL, not file metadata/sidecars. Logical hiding/removal affects DMS visibility only; explain that source bytes remain.
- Track immutable **source observations** with size/hash/markers/times and current state. Observations are records of what was seen, not guaranteed recoverable file versions or a complete external audit.
- Transient bounded local staging is allowed for scanning/OCR/rendering/verified download, deleted after the job/cache policy. Derived previews/text may be retained under policy; this does not imply retained original history.
- Optional retained source snapshots are off by default, explicitly configured/consented, separate from observed history, and labeled with provenance/coverage/retention. Historical bytes are available only if actually retained/retrievable and authorized.
- Source change, missing file, ambiguous identity, NAS unavailable, or stale derivative state is visible. No outage triggers record deletion. Past approvals never silently apply to changed bytes.

## Capability contract

Backend publishes a repository capability description plus action-specific permission hints. Hints are not authorization proof; application services recheck at execution. UI displays type/read-only badges and reasoned disabled actions.

- Both: authorized browse/read/search/details, logical metadata/tags/relationships/favorites/saved views, processing status/retry when permitted, and workflow only against an eligible version/source observation.
- Managed only: physical writes, upload queue, managed versions and restore, physical trash/disposition according to policy.
- Indexed only: source discovery/reconciliation controls, source-status/observation history and explicit incomplete-history notices.
- Per-provider: range reads, durable publication, physical trash/recovery, stable source identifiers, and source snapshots are advertised only after adapter validation.
- Bulk actions intersect per-item capabilities and permissions; show eligible/ineligible counts and item outcomes, never silently skip unsafe items.

Return a stable `REPOSITORY_OPERATION_UNSUPPORTED` problem code for forbidden-by-type commands even if a caller bypasses the UI. A type change is not an editable toggle: require an explicit migration/re-registration plan, policy review, and audit. Disabled connections stop new work without discarding checkpoints/history.

## Repository configuration

Required fields: name, description, type, storage-connection ID, approved root reference, enabled/lifecycle status, permissions, indexing/processing/retention settings, and health. Changes are validated, revision-checked, audited, and trigger scoped reconciliation rather than global restart.

Separate configuration status from connection health, scan status, and content processing state. “Active” must not imply “NAS reachable” or “fully indexed.” Reject overlapping managed/indexed roots that let managed writes enter an Indexed Repository; explicit overlap exceptions require a reviewed isolation design.

## Physical versus logical organization

Physical folder references represent actual NAS structure; virtual folders/categories/tags/saved views represent DMS organization. A document may belong to multiple virtual collections without physical relocation. Physical drag/drop is allowed only for eligible Managed Repository actions; virtual drag/drop assigns membership and uses different action labels/confirmation.

Virtual membership never grants document access. A virtual collection may contain inaccessible documents but must not expose their titles/counts/metadata. Physical folder permissions and DMS logical taxonomy are separate; moving a physical item reevaluates destination access before publication.

## Identity, completeness, and ownership

Use internal UUID/opaque IDs. Reconciliation uses repository, path observations, provider identity hints, hash/size, and scan-generation evidence, never path/file ID/checksum alone. Hash equality is duplicate content, not proof that two files are the same document. Ambiguous rename/move creates a conflict requiring safe handling, not automatic merging.

Direct SMB/NFS access bypasses DMS RBAC, workflow, audit, and holds. Customer source ACLs/backups are independently administered. Indexed holds preserve DMS evidence/optional snapshots and report obligations; they do not claim to block source-owner deletion.

## Acceptance

Test both repository types on synthetic SMB3/NFS fixtures; verify capability-negative endpoints, unchanged indexed source manifests, metadata without sidecars, history labels, managed version restore, ambiguous rename handling, no outage-driven deletion, and no virtual-folder permission leakage.

Related specifications: [Storage](STORAGE_ARCHITECTURE.md), [connectors](NAS_CONNECTOR_ARCHITECTURE.md), [indexing](INDEXING_RECONCILIATION.md), [lifecycle](DOCUMENT_LIFECYCLE.md). Decisions are centralized in [Decision register](DECISION_REGISTER.md).
