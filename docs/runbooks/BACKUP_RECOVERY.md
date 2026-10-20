# Backup, disaster recovery, and NAS reconnection runbook specification

**PROPOSED:** operator procedure contract, not executable commands. No tools/backups/restores exist or have run yet. Use customer authorization/change windows and resolve D-07/D-08/D-09 before live use.

## Backup inventory and responsibilities

- DMS operations: PostgreSQL metadata/users/hashes/RBAC/audit/workflows/holds/jobs/checkpoints/search text, configuration/connection-root mappings/release-schema manifest, derived artifacts if needed for RTO, optional retained Indexed snapshots, restricted credentials/keys under separate custodians.
- Managed NAS owner + DMS operations: physical current tree, immutable accepted versions, trash/pending operation evidence, and storage/hash manifest aligned with DB recovery point.
- Indexed source owner: original files in existing folders and independent NAS backup history. DMS DB/text/previews do not protect those originals. No mandatory copy/migration; optional source snapshots provide only actual configured coverage.
- Keys/secrets: separate encrypted custody/recovery tests; backup role is least privilege, not application superuser. Protect audit exports independently if assurance requires it.

Backup destination is separate customer-controlled failure domain/media; same-disk directory/RAID/VM snapshot alone is insufficient. Define schedules/retention/off-site custody/PITR/RPO/RTO and local alert owner; no Internet/cloud dependency.

## Coordinated backup procedure

1. Verify authorized scope, target/key access/capacity, release/schema compatibility and previous backup state; record run ID.
2. For initial safe quiesced method: pause DMS writes, workflows changing content, workers/connectors and purge; drain or durably record in-flight operations. Quiescing DMS does not stop independent Indexed/NAS writers—coordinate source-owner snapshots/markers separately if required.
3. Record DB recovery point, policy/hold/tombstone state and manifest of Managed version/hash/root references. Capture consistent NAS snapshots or verified immutable-file inventory; retain files needed for that DB point until backup verification.
4. Capture DB/config/release evidence and keys under restricted processes; WAL/base backup alignment for PITR where approved. Do not assume two independently scheduled DB/NAS snapshots match.
5. Back up Managed versions/current tree/trash/evidence and selected derivatives/optional snapshots. Source-owner Indexed backup remains separate with documented coverage/capture times.
6. Encrypt/verify archive/manifests, record counts/bytes/errors/time/recovery point/key reference, then resume safely and alert on failure. A failed partial backup is not a successful restore point.

Online method requires a separately tested retained-blob/WAL/manifest protocol with purge fencing and source consistency limitations. No unverified “hot backup” guarantee.

## Isolated restoration

1. Obtain authorization/custodians and verified compatible offline bundle/backups; keep traffic closed and source connections/dispatch/schedules/purge paused.
2. Restore database/configuration/keys and matching Managed NAS data into isolated approved roots. Never write/repair/delete Indexed source folders during recovery.
3. Validate root/mount identity, Managed version/current-tree hashes, unresolved ledger state, account/RBAC/audit continuity, holds/tombstones/deletion policy and release/schema compatibility. Newer NAS plus older DB needs explicit reconciliation, not automatic mass import or purge.
4. Revoke restored sessions, review service/provider secret/password/key rotation if compromise is involved, and verify restricted administrator recovery.
5. Reconstruct queue intent from PostgreSQL; expire/fence old leases and replay idempotently. Rebuild FTS from eligible retained text/Managed versions; Indexed re-extraction requires currently accessible unchanged source and must be labeled when old content is unavailable.
6. Run synthetic smoke/negative policy tests, validate actual loss/recovery time against approved RPO/RTO, review incomplete source backup/evidence limitations and obtain return-to-service approval.
7. Reenable verified mounts/connectors/jobs gradually, run bounded reconciliation, observe health and record operator/results locally.

## NAS disconnect and reconnect

Fence Managed writes and new source I/O on unhealthy/mismatched mount; preserve operation ledger, traversal checkpoints, metadata and history. Do not infer file disappearance from a failed scan or use exposed local mountpoint fallback.

Operator/admin reviews safe connection diagnostics/credentials/config generation. On reconnect verify remote identity/export/access and new mount generation, fence old jobs, reconcile pending Managed publication/physical operations and resume Indexed enumeration from safe replayable boundaries. A different NAS/export identity requires reviewed re-registration, not silent relinking.

## Index/job recovery and space exhaustion

Pause admission at approved capacity thresholds; preserve login/admin/recovery headroom. Identify retained originals/holds/audit versus disposable bounded temp/obsolete derivatives before cleanup. Only approved cleanup may remove staged/derived/release/log files; never auto-delete evidence/originals to make room.

Index rebuild creates new projection generation in bounded batches with live-update reconciliation/safe switch. Job replay uses stable IDs/generations and current scope, preventing duplicate approvals/purge. Record replay/rebuild/cancel actions and completion/failures.

## Drill evidence and handoff

Periodically test disconnected restore with simulated NAS unavailable, worker/DB restart, mismatch/full-volume and older-backup cases. Record backup/run/release/schema IDs, manifests/hashes, custodians, steps/time/failures, permission/hold/source-read-only validation and actual RPO/RTO. Green backup jobs are not proof of recovery.

Runbook command details will be written only after tooling exists and is tested. [On-premise deployment](../ON_PREMISE_DEPLOYMENT.md) owns installation/update topology; this file owns recovery procedure, avoiding competing instructions.
