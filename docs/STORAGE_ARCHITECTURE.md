# Storage architecture

**Status:** master-aligned NAS-primary storage, 2026-10-08. Managed/Indexed behavior CONFIRMED; layout/durability/capacity PROPOSED/OPEN.

## 1. Confirmed requirements

- Originals remain on customer NAS: Synology/Windows/Samba SMB3 and Linux NFS. Local app filesystem supports configuration, processing, DB and derived assets; it is not mandatory original relocation.
- S3-compatible storage is optional, not the default or installation prerequisite.
- Support **Managed Repository** and **Indexed Repository** (canonical name for earlier external-reference mode).
- Indexed originals remain in place/read-only, no forced migration or retained-original snapshots.
- Managed controlled versioning and Indexed honest observation/freshness limitations; checksum/provenance/server policy/audit.
- Operate without Internet/cloud dependencies; isolate processing and protect filesystem/share paths.

“NAS” describes a storage appliance/location, not a protocol; SMB and NFS access must each be validated on the customer's configuration.

## 2. Ownership modes

### Managed storage

The DMS controls a **dedicated approved namespace on customer NAS**. Proposed layout: physical working tree for actual current filenames/folders plus protected immutable accepted-version snapshots/staging/trash under a DMS control directory on the same NAS. Stable IDs map to both physical locations and retained versions. Immutable committed versions are content authority; working files are validated current presentation, not independent writable masters. Replacing accepted content creates a new version. D-04 reviews interoperability and copy overhead.

Managed data may be changed/deleted only through approved lifecycle/recovery procedures. A “managed share” never grants the DMS write authority over unrelated customer files. Expose no public/static content directory and discourage direct user edits to managed roots.

### Indexed storage

An existing source remains in its original location under its owner's control. The connector reads/discovers through read-only credentials/mounts, records observed provenance/change state, and maintains logical metadata inside the DMS. Indexed data adapters have no mutation methods. External direct access/audit is outside DMS control.

**Prohibited on source roots:** file creation, overwrite, rename, move, deletion, chmod/chown, xattr/metadata writeback, thumbnails/sidecars, lock files, quarantine relocation, “repair,” or automatic folder creation. Derivatives, checkpoints, processing state, and snapshots live in DMS-managed storage, never beside source files. Use read-only/no-atime behavior where supported and validate protocol/client semantics; no client action may intentionally update source metadata.

DMS permissions control DMS access, not direct user access to a source share. Share/OS ACL administration remains the customer's responsibility.

## 3. Indexed observations and optional snapshots

A pathname and timestamp are not historical binary versioning. Source owners can change/delete bytes, and timestamp resolution/change events are insufficient evidence of identity.

**Confirmed default: in-place read-only Indexed source, no retained original snapshot requirement.**

1. Discover approved entries and record stable internal ID plus source location/size/available markers.
2. Read into bounded transient local staging for hashing/scanning/extraction/rendering; compare pre/post source evidence. This temporary job input is not document migration or guaranteed historical storage.
3. Publish generation-tagged source observations/text/previews only if eligible; discard changed/stale results and retry/reconcile.
4. Remove temporary originals according to bounded cleanup policy; optional retained source snapshots require explicit consent/retention/coverage and are off by default.
5. Source changes append observations, not complete DMS-controlled versions. Missing/unavailable state preserves metadata/history and reports that old bytes may no longer be retrievable. Downloads verify current bytes against requested observation before response; cached previews/text carry freshness/eligibility.

Where source locking/snapshot primitives are unavailable, a double-read/hash consistency check may improve detection but is not absolute proof against concurrent/adversarial mutation. Validate provider behavior and document residual risk; never claim atomic source snapshots merely from equal mtimes.

Indexed snapshots are an optional evidence feature, not a prerequisite for discovery/search. Their absence limits historical downloads/evidence reproduction; show that honestly. Indexed workflows may bind an approved observation/hash representation and revalidate it, never pretend external content is immutable. High-assurance workflow evidence can use Managed versions or consented snapshots. D-04/D-06/D-13 cover layout/evidence/freshness, centralized in DECISION_REGISTER.md.

Source retention/backup belongs to the source owner. DMS retention applies to DMS snapshots/metadata/derivatives only; source deletion is never performed by a reference connector. Holds preserve eligible DMS snapshots but cannot stop independent source-owner edits without separate organizational controls.

## 4. Storage interface and adapter separation

Proposed core-owned ports, not implemented interfaces:

- **ManagedBlobStore:** stage/stream writes with bounds, publish a blob without overwrite, stat/checksum/read range, health/capacity, and policy-authorized deletion. Operations use validated opaque handles, not arbitrary client paths.
- **IndexedSource:** list approved entries, obtain source evidence, bounded read-only streams and health/checkpoints; **no write/delete/rename method**.
- **SourceObservationService:** coordinates transient staging/verification/generation publication/reconciliation; optional snapshot retention is explicit and separate.
- **ManagedOperationService:** physical-tree operation ledger, NAS version publication, current presentation verification and recovery, preserving provider-specific semantics.

Baseline adapters: approved SMB3/NFS mounts or restricted connector access; local app workspace for temporary/derived assets. Local-original and S3 extensions are not customer migration requirements or baseline acceptance blockers. Capabilities/durability differ and must be tested per provider.

Separate reference and managed-root configuration/credentials. The same physical appliance can host both only with distinct namespaces and mount/access policies; reject overlaps and managed/quarantine/scratch roots inside a reference root.

## 5. Candidate physical layout

Illustrative administrator-controlled Linux layout, **not created by this task**:

```text
/srv/intandms/
  config/                 # restricted non-secret configuration
  secrets/                # restricted files; separately governed backup
  data/
    postgres/             # dedicated volume/local disk policy
    queue/                # local queue state, rebuildable from DB intent
    derivatives/          # generation/version-scoped safe previews
    optional-snapshots/   # only if Indexed retention consent/profile enables
    quarantine/           # exclusive staged uploads/captures
    scratch/              # bounded per-job local processing files
    logs/                 # local rotated redacted telemetry

/mnt/intandms-managed/<approved-root>/  # dedicated customer NAS namespace
  current/                            # actual physical working tree
  .intandms/versions/                  # immutable Managed accepted versions
  .intandms/staging-or-trash/          # protected operation working/evidence
/mnt/intandms-indexed/<source-id>/     # existing read-only customer folders

Customer-controlled backup target on a separate failure domain/media
```

Use provider/root ID plus opaque relative blob identity in DB records; avoid embedding deployment-specific absolute paths into every document. Migrations/remounts update controlled root configuration. Never return physical paths, UNC credentials, or source secrets in ordinary API responses.

## 6. Filesystem and share security

- Admin web UI configures/tests/browses approved roots via restricted host gateway or preprovisioned mounts; host operator installs privilege/UID/GID/endpoint envelope once. No arbitrary user-selected host mounts. See NAS_CONNECTOR_ARCHITECTURE.md.
- Reject absolute/relative traversal, separator tricks, NUL/invalid encoding, symlink/hardlink escape, mount changes, and overlapping roots. Canonicalization/string-prefix checks alone do not protect against TOCTOU.
- Use safe descriptor-relative/exclusive/no-follow operations or a narrow audited helper where the Node API lacks required guarantees, combined with OS-level isolation. Review the actual implementation before claiming confinement.
- Validate mount identity/filesystem/provider marker and access mode; reject missing/wrong/read-only/unhealthy managed mounts. Do not write into the local directory exposed when a network mount disappears. Revalidate during transfers and on reconnect.
- Host administrators mount SMB/NFS; application/processor containers do not receive privileged mount capability, host root, Docker socket, or broad host filesystem access.
- SMB3: approved signing/encryption/authentication; no SMB1 or plaintext credential exposure. NFSv4: approved exports, UID/GID or Kerberos mapping where required, root squashing, network ACLs, and transport protection; never assume protocol name alone provides adequate security.
- Processors receive narrow job input/output mounts, preferably read-only input. Share credentials are not exposed to browsers/processors.
- Encrypt disks/backups and protect share transport under approved customer policy; define local key custody and recovery.

Physical/host administrators can bypass many application controls; this trust boundary must be documented, not hidden by RBAC claims.

## 7. Publication and distributed consistency

For managed writes:

1. Check permissions, limits, expected mount/space/inodes, and create an exclusive server-generated staging file.
2. Stream with backpressure, enforce byte count, compute content hash, and handle cancellation/cleanup.
3. Persist pending DB version/audit/outbox intent; scan before readability.
4. Publish immutable NAS version without overwrite using validated exclusive/same-filesystem rename/fsync semantics. Coordinate physical working-tree update through durable operation state; concurrent direct NAS changes yield integrity/conflict evidence, not rewritten old hashes. Cross-filesystem copies require verify/durable publication, not an atomicity claim.
5. Finalize accepted version/current pointer and audit in PostgreSQL; workers publish generation-tagged results idempotently.
6. Reconcile crashes between file and DB transitions, abandoned staging, and orphaned files under grace periods with reference/hold checks.

Filesystem durability varies across local filesystems, NFS, SMB clients, and storage controllers. Test power/network failures and document guarantees before certification. Coordinate concurrency through PostgreSQL constraints/locks, not assumptions about cross-client file locks. Filesystem state and DB commits are never a single ACID transaction.

Checksum mismatches/tampering quarantine the affected DMS version from normal access, preserve evidence, alert, and audit. Do not “fix” it by changing a historical hash or fetching unrelated current source bytes.

## 8. Capacity planning

Inventory actual file counts, size distribution, maximum file/page sizes, versions per document, growth, OCR throughput, source scan windows, and retention. Avoid assuming deduplication/compression savings before policy and measurement.

Proposed sizing model:

```text
NAS data        = Managed current presentation + retained Managed version bytes
                + approved managed staging/trash + existing Indexed originals
App work/data   = derivatives + bounded quarantine/download/job scratch
                + optional retained Indexed snapshot bytes
Database        = metadata/RBAC/workflow/audit + extracted text/FTS indexes
                + database maintenance/rebuild headroom + retained WAL
Operations      = logs + queue state + release/upgrade staging
Capacity per target >= that target's NAS or App work/data + DB if placed there
                     + Operations + approved safety/growth reserve
Backup capacity >= retained Managed NAS/source-owner backup + DB/WAL copies
                 + configuration/audit/key archives + restore-test workspace
```

Size each actual placement separately. Indexed originals already exist and are not forcibly duplicated; optional retained snapshots add cost only if enabled. Managed current/immutable-history presentation overhead is explicit, not hidden dedup savings. NAS/app disks/RAID usable space/replicas/backups/retention affect physical demand; logical bytes are not raw-disk sizing.

Bound scratch by concurrent jobs and worst-case decoded page/pixel/archive expansion, not just compressed upload size. Include full rebuild/backfill, backup staging, and maintenance overhead. Measure IOPS/share latency/bandwidth as well as space. Monitor bytes, inodes, quotas, mount health, and growth; warning/stop thresholds are D-08 policy. Stop/defer new ingestion before exhaustion while preserving login/admin/recovery headroom. Never evict originals/holds/audit automatically to free space.

## 9. Backup, restore, and administration

Back up Managed NAS current/immutable versions and aligned DB/hash manifest. Optional retained Indexed snapshots and required derivatives have declared coverage. Existing Indexed original backup belongs to source owner; DMS DB/preview does not protect it or guarantee historical retrieval. See runbooks/BACKUP_RECOVERY.md.

Restore under isolated traffic with workers/connectors/purge paused. Validate mount identities, root mapping, hashes, pending/accepted versions, holds/tombstones, and policy state before enabling access. Reconcile orphans conservatively; restore must not write to reference sources. See [On-premise deployment](ON_PREMISE_DEPLOYMENT.md).

Admin UI should show provider/mode, approved roots without secrets, capacity/health, source/snapshot freshness, capture failures, checksum failures, and backup coverage. Audit root/credential/mode changes. Switching modes or relocating managed data requires an explicit verified migration, not changing a boolean and granting new source-write rights.

## 10. Acceptance evidence and open decisions

Required tests: SMB3/NFS platform capability/durability matrix, unchanged Indexed source manifests, optional snapshot/history coverage, source changes during transient read, ambiguous rename, mount races/reconnect/no fallback, low space/inodes, partial physical/DB operations, concurrent Managed versions, hash drift, aligned restore and Indexed purge never touching source.

Optional S3 gets its own compatibility/security/recovery suite; its absence cannot block baseline installation. No adapter/file feature or test is implemented during this revision.

Resolve D-04/D-07/D-08/D-09: roots and protocols, snapshot-copy permission/stable-source guarantees, managed/source retention boundaries, capacity/headroom, share credential ownership, encryption, and backup targets. See [Requirements](REQUIREMENTS.md).
