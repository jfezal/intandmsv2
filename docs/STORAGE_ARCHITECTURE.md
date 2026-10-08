# Storage architecture

**Status:** on-premise proposal, 2026-10-08. Storage types/modes are confirmed; physical layout, durability settings, snapshot policy, and capacity targets require review.

## 1. Confirmed requirements

- Support local filesystem storage and customer NAS/SMB/NFS.
- S3-compatible storage is optional, not the default or installation prerequisite.
- Support managed and external-reference modes.
- External-reference mode must not modify source files.
- Preserve document versioning, checksum/provenance, server-side access control, and audit integrity.
- Operate without Internet/cloud dependencies; isolate processing and protect filesystem/share paths.

“NAS” describes a storage appliance/location, not a protocol; SMB and NFS access must each be validated on the customer's configuration.

## 2. Ownership modes

### Managed storage

The DMS owns a **dedicated approved namespace** on local disk or a customer share, or optionally S3. Only DMS services/operators under policy write there. Uploads, imports, versions, derivatives, and reference snapshots use opaque internally generated blob IDs/paths. Files are immutable after publication; replacing bytes creates a new version/blob.

Managed data may be changed/deleted only through approved lifecycle/recovery procedures. A “managed share” never grants the DMS write authority over unrelated customer files. Expose no public/static content directory and discourage direct user edits to managed roots.

### External-reference storage

An external source remains under its owner's control. The connector reads/discovers it through read-only credentials and mounts, records provenance/change state, and maintains metadata inside the DMS.

**Prohibited on source roots:** file creation, overwrite, rename, move, deletion, chmod/chown, xattr/metadata writeback, thumbnails/sidecars, lock files, quarantine relocation, “repair,” or automatic folder creation. Derivatives, checkpoints, processing state, and snapshots live in DMS-managed storage, never beside source files. Use read-only/no-atime behavior where supported and validate protocol/client semantics; no client action may intentionally update source metadata.

DMS permissions control DMS access, not direct user access to a source share. Share/OS ACL administration remains the customer's responsibility.

## 3. External references and immutable versions

A pathname and timestamp are not historical binary versioning. Source owners can change/delete bytes, and timestamp resolution/change events are insufficient evidence of identity.

**Proposed default: reference with immutable managed snapshots.**

1. Discover an allowlisted source entry and record source identity, relative path, size, and available change/version markers.
2. Copy it read-only into DMS-owned quarantine; calculate hash/size over copied bytes. Check pre/post source markers and stable-read facilities available from the provider; retry/report changes during copy.
3. Scan/process the captured bytes, not a later live read from the pathname. Publish immutable snapshot with provenance and a new logical version only after validation.
4. Keep accepted historical snapshots according to approved policy. Source changes create new versions; missing/offline source changes status, not old history.
5. Serve accepted versions/previews/search from the validated snapshot. A changed/unscanned live source is never silently substituted for an approved version.

Where source locking/snapshot primitives are unavailable, a double-read/hash consistency check may improve detection but is not absolute proof against concurrent/adversarial mutation. Validate provider behavior and document residual risk; never claim atomic source snapshots merely from equal mtimes.

Reference mode is still read-only: managed copies do not modify the source. **Open D-04:** customer permission to retain copies, eligible roots, snapshot frequency, retention, and required source consistency. If copies are prohibited, require verified source-native immutable version retrieval or resolve/document unavailable historical binary guarantees before enabling version-bound approvals. Metadata change history alone cannot satisfy immutable binary versioning.

Source retention/backup belongs to the source owner. DMS retention applies to DMS snapshots/metadata/derivatives only; source deletion is never performed by a reference connector. Holds preserve eligible DMS snapshots but cannot stop independent source-owner edits without separate organizational controls.

## 4. Storage interface and adapter separation

Proposed core-owned ports, not implemented interfaces:

- **ManagedBlobStore:** stage/stream writes with bounds, publish a blob without overwrite, stat/checksum/read range, health/capacity, and policy-authorized deletion. Operations use validated opaque handles, not arbitrary client paths.
- **ReferenceSource:** list approved entries, obtain source identity/markers, open bounded read-only streams, verify stable capture where supported, and report health/checkpoints. It has **no write/delete/rename method**.
- **SnapshotCaptureService:** coordinates source read, managed staging, verification, scan state, provenance, version publication, and reconciliation.

Adapters: local filesystem, host-mounted SMB, host-mounted NFS, and optional S3. Capabilities/durability differ by adapter and must be exposed/tested explicitly; “implements the interface” is not proof of identical guarantees.

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
    managed/
      originals/          # immutable blobs, including reference snapshots
      derivatives/        # generation/version-scoped safe previews
    quarantine/           # exclusive staged uploads/captures
    scratch/              # bounded per-job local processing files
    logs/                 # local rotated redacted telemetry

/mnt/intandms-managed/<approved-root>/  # dedicated DMS-owned share if enabled
/mnt/intandms-reference/<source-id>/    # read-only approved customer sources

Customer-controlled backup target on a separate failure domain/media
```

Use provider/root ID plus opaque relative blob identity in DB records; avoid embedding deployment-specific absolute paths into every document. Migrations/remounts update controlled root configuration. Never return physical paths, UNC credentials, or source secrets in ordinary API responses.

## 6. Filesystem and share security

- Administrator approves roots/endpoints and creates required directories/mounts with dedicated service UID/GID and restrictive permissions; DMS never mounts arbitrary user-selected paths.
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
4. Publish without overwriting an existing blob. Use same-filesystem atomic rename/exclusive semantics and appropriate file/directory fsync where supported; cross-filesystem movement requires copy/verify/durable publication, not an atomicity claim.
5. Finalize accepted version/current pointer and audit in PostgreSQL; workers publish generation-tagged results idempotently.
6. Reconcile crashes between file and DB transitions, abandoned staging, and orphaned files under grace periods with reference/hold checks.

Filesystem durability varies across local filesystems, NFS, SMB clients, and storage controllers. Test power/network failures and document guarantees before certification. Coordinate concurrency through PostgreSQL constraints/locks, not assumptions about cross-client file locks. Filesystem state and DB commits are never a single ACID transaction.

Checksum mismatches/tampering quarantine the affected DMS version from normal access, preserve evidence, alert, and audit. Do not “fix” it by changing a historical hash or fetching unrelated current source bytes.

## 8. Capacity planning

Inventory actual file counts, size distribution, maximum file/page sizes, versions per document, growth, OCR throughput, source scan windows, and retention. Avoid assuming deduplication/compression savings before policy and measurement.

Proposed sizing model:

```text
Managed content = retained uploaded/imported version bytes
                + retained external-reference snapshot bytes
Working data    = derivatives + quarantine + concurrent job scratch
Database        = metadata/RBAC/workflow/audit + extracted text/FTS indexes
                + database maintenance/rebuild headroom + retained WAL
Operations      = logs + queue state + release/upgrade staging
Primary usable capacity >= Managed content + Working data + Database
                         + Operations + approved safety/growth reserve
Backup capacity >= retained full/incremental content + DB/WAL copies
                 + configuration/audit/key archives + restore-test workspace
```

Do not double-count the same managed snapshot as both upload and reference bytes. Source-original capacity is separate unless on the same physical appliance, where aggregate demand matters. RAID usable space, replicas, snapshots, backup targets, retention horizons, and deleted-but-open files affect physical capacity; logical byte totals are not raw-disk sizing.

Bound scratch by concurrent jobs and worst-case decoded page/pixel/archive expansion, not just compressed upload size. Include full rebuild/backfill, backup staging, and maintenance overhead. Measure IOPS/share latency/bandwidth as well as space. Monitor bytes, inodes, quotas, mount health, and growth; warning/stop thresholds are D-08 policy. Stop/defer new ingestion before exhaustion while preserving login/admin/recovery headroom. Never evict originals/holds/audit automatically to free space.

## 9. Backup, restore, and administration

Back up managed originals/reference snapshots together with a version/hash manifest and aligned PostgreSQL recovery point. Snapshot/backup derivatives if RTO needs it; otherwise rebuild. Reference-source owner backup is distinct and cannot substitute for DMS historical snapshots without verified version identity.

Restore under isolated traffic with workers/connectors/purge paused. Validate mount identities, root mapping, hashes, pending/accepted versions, holds/tombstones, and policy state before enabling access. Reconcile orphans conservatively; restore must not write to reference sources. See [On-premise deployment](ON_PREMISE_DEPLOYMENT.md).

Admin UI should show provider/mode, approved roots without secrets, capacity/health, source/snapshot freshness, capture failures, checksum failures, and backup coverage. Audit root/credential/mode changes. Switching modes or relocating managed data requires an explicit verified migration, not changing a boolean and granting new source-write rights.

## 10. Acceptance evidence and open decisions

Required tests: local/SMB/NFS read/write/durability matrix, read-only-source manifest preservation, source changes during capture, missing/wrong mount and reconnect, path/symlink escape, low bytes/inodes, interrupted publication, duplicate/concurrent versions, snapshot history after source deletion, hash mismatch, isolated restore, and reference purge never touching source.

Optional S3 gets its own compatibility/security/recovery suite; its absence cannot block baseline installation. No adapter/file feature or test is implemented during this revision.

Resolve D-04/D-07/D-08/D-09: roots and protocols, snapshot-copy permission/stable-source guarantees, managed/source retention boundaries, capacity/headroom, share credential ownership, encryption, and backup targets. See [Requirements](REQUIREMENTS.md).
