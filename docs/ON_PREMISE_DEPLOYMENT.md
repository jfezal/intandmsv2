# On-premise deployment and operations

**Status:** architecture proposal, 2026-10-08. On-premise/offline requirements confirmed; no images, Compose files, installer, or infrastructure changes created.

## 1. Confirmed deployment contract

IntanDMS V2 targets customer-owned physical servers or VMs running Ubuntu/Linux, private LAN/intranet access, Docker Compose installation, and full operation without public Internet. No cloud, mandatory IdP/Keycloak, external API, public certificate issuer, or external telemetry is required.

Local users, filesystem/NAS/SMB/NFS, PostgreSQL FTS, Tesseract/previews/workers, administration/health, capacity planning, and backup/restore belong to the baseline. LDAP/AD, OIDC, S3, and OpenSearch are optional. Customer LAN access remains necessary; offline means no Internet dependency, not no networking or unauthenticated workstation copies.

## 2. Proposed baseline topology

One approved customer server/VM can run a reviewed Compose stack:

- **Reverse proxy/web:** bundled React assets and internal HTTPS entry point.
- **API:** local authentication, RBAC, business operations, streaming content, health/admin API.
- **PostgreSQL:** metadata, users/password hashes/sessions, permissions, workflows, audit, outbox/jobs, text chunks/FTS.
- **Local queue:** compatibility-tested Valkey/BullMQ, private endpoint, bounded persistence/resources.
- **Dispatcher/scheduler/workers:** local durable job execution and reconciliation.
- **Isolated processors:** local scanner, extraction, Tesseract, preview generation; bounded resources/scratch and no external egress.
- **Persistent storage:** dedicated managed/quarantine/scratch/config/log roots and approved SMB/NFS mounts.
- **Local monitoring:** health/admin views and redacted logs by default; optional customer-local metrics/dashboard/trace services.

Only LAN HTTPS is published by default; dependency ports are private container-network endpoints, not open database/queue/scanner ports. SSH/host administration is separately controlled by the customer. Optional services are opt-in and cannot make baseline Compose health depend on them.

One host is not high availability. RAID protects against some disk failures, not host loss/ransomware/operator error; VM snapshots are not independent verified backups. Multi-host failover requires D-08 design, shared/durable storage review, networking, and restore/failover tests. No automatic Kubernetes dependency.

## 3. Customer prerequisites and installation ownership

Agree and document before installation:

- Supported Ubuntu releases, CPU architectures, kernel/filesystem requirements, offline Docker Engine/Compose versions, and platform support lifecycle.
- Server CPU/RAM/usable disk/IOPS/network, source-share protocols/ACLs, host service UID/GID, and mount ownership.
- Internal DNS/hostname or approved addressing, customer-local TLS certificates/trust distribution, and local time synchronization.
- Approved data/backup paths, encryption/key custody, local operator/admin bootstrap process, and maintenance windows.
- Customer operator responsible for patching, signatures, capacity/alerts, account recovery, backups, incident response, and offline-media custody.

No customer specification or hardware minimum has been validated yet. Provide all supported OS/Docker prerequisites through an approved offline package repository/bundle or explicitly require customer-provisioned offline prerequisites; do not hide an Internet `apt` step inside “offline installation.”

## 4. Offline release bundle

Proposed release artifact contains:

1. Versioned image archives for all baseline services and selected CPU architecture, pinned image digests, and image inventory.
2. Compose definitions with no mandatory build/pull-at-install step, approved limits/volumes/networks, optional profiles separated, and harmless environment/configuration templates.
3. Bundled frontend JS/CSS/icons/fonts/PDF workers/help/OpenAPI viewer assets; no CDN runtime references.
4. Processor binaries/native libraries, approved OCR language data/fonts, local scanner plus initial compatible signatures, and required Prisma/native runtime assets.
5. Migration/backup/restore/health tooling, local documentation, version/schema compatibility matrix, upgrade and rollback/recovery instructions.
6. Licenses/notices, redistribution approvals, SBOM, checksums, and signed release manifest/provenance verified against a customer-trusted key provisioned independently.
7. Offline prerequisites or an explicit supported customer prerequisite inventory and verification checklist.

Optional LDAP/OIDC/S3/OpenSearch support has its own artifacts/configuration, no compulsory startup/network connection. There is no online activation, license ping, vendor analytics, crash upload, automatic update call, public ACME request, runtime package/image/model/font download, or required hosted secret/backup/monitoring service. Future commercial license policy must preserve offline functionality and requires separate review.

Build/release production may use approved connected development infrastructure; **customer install/run/update must not need it**. Development GitHub/npm services are not deployed product dependencies. Provide locally runnable verification/checks for restricted sites.

## 5. Proposed installation workflow

Not executable instructions yet; no installer/Compose files exist:

1. Review server/mount/capacity/TLS/backup prerequisites and customer-authorized change window.
2. Transfer the release via approved media/customer-local distribution, verify trusted manifest signatures/checksums, and inspect version/platform compatibility.
3. Verify/preinstall approved Ubuntu/Docker prerequisites offline; load pinned image archives and check inventory/digests.
4. Create restrictive managed/config/secret roots and approved host-managed mounts. Reference roots are read-only; managed roots are dedicated DMS namespaces; verify mount identity to prevent fallthrough writes.
5. Generate unique local secrets and provision TLS/encryption keys through restricted customer procedures. Do not seed known credentials or put secrets in image layers/command arguments.
6. Start dependencies on private networks; apply reviewed migrations with a dedicated migration identity under a recorded change process.
7. Initialize the first local admin through the restricted audited bootstrap flow, then close bootstrap capability.
8. Start API/worker/proxy and verify local login, RBAC, upload/quarantine, FTS, OCR/preview, health, capacity, and backups using synthetic data.
9. Record release/configuration evidence and hand over runbooks/operator ownership. Enable optional integrations only after their configuration/access/security review.

Installation/deployment requires explicit authorization. This document does not authorize connections to customer systems or creating mounts/firewall rules.

## 6. Network, TLS, time, and secrets

- Use approved private LAN bindings and host firewall restrictions; public Internet exposure is not the baseline.
- Customer-provided/private-CA certificates or approved internal issuance secure browser/API traffic. Distribute the trust chain to customer browsers; do not turn off TLS/certificate validation to make air-gapped sites work.
- Validate optional directory/share TLS/transport security. Keep reverse-proxy forwarded-header trust narrowly configured.
- Permit only required internal destinations for API/connector traffic; processors have no Internet/document-linked-resource egress. Default deny external egress where practical and verify actual calls.
- Use customer-local DNS and reliable internal time; time affects sessions, audit, TOTP, schedules, and TLS. Do not require public NTP.
- Mount restricted secret files/Compose secrets from customer-controlled host custody; Compose secrets alone do not encrypt host files. Optional customer-local vault may be used, but never required hosted secrets.
- Back up encryption/signing key material separately under custodians, and test recovery; losing keys can make backups useless.

## 7. Offline maintenance and upgrade

Air-gapped operation still needs security updates. Establish a customer-approved media/local-mirror process for OS/container/library patches, OCR data, and scanner signatures, including trusted verification, compatibility checks, dry-run/staging, import audit, and rollback/recovery.

Define scanner maximum signature age/warning/fail-closed policy under D-05/D-09. A fresh local update must be installable without Internet; never disable scanning silently or pretend outdated signatures are current. Offline vulnerability database updates may similarly be delivered through approved verified artifacts.

Before upgrade: verify bundle/schema compatibility, measure free space including image/rebuild/backfill staging, record current config/digests, back up consistently, and obtain a change window. Use expand/contract migrations and compatible previous images. Irreversible schema/data changes need approved recovery plans; rollback is not always an image downgrade. Test restart/reboot and pending-job reconciliation.

Disable automatic unattended dependency/version changes unless the customer approves a tested maintenance policy. No new push/deployment authorization is inferred from this roadmap.

## 8. Capacity planning and resource isolation

Collect actual users, file sizes/counts, versions, daily growth, retention, reference-snapshot duplication, OCR page complexity/languages, query rate, share throughput, backup window, and RPO/RTO. Benchmark representative files on supported hardware before setting minimums.

Budget:

- managed originals/reference snapshots and immutable versions;
- previews/derivatives, bounded quarantine, concurrent scratch/decoded pages;
- PostgreSQL metadata/audit/text/FTS indexes, maintenance/backfill/rebuild headroom, WAL retention;
- queue state, rotating local telemetry, image/update staging;
- backup copies/retention/media and restore-test workspace on a separate failure domain;
- CPU/RAM for hashing, API/DB/cache, OCR/rendering, and optional services without starving login/admin/recovery.

See the formulas in [Storage architecture](STORAGE_ARCHITECTURE.md). Account for raw-versus-usable RAID capacity, filesystem quotas/inodes, share IOPS/latency, backup growth, and restore throughput. No speculative fixed storage multiplier or universal hardware minimum is approved.

Set measured worker concurrency and cgroup CPU/memory/temp-disk limits. Stop/defer ingestion at approved low-space/inode thresholds while leaving recovery/admin headroom; never automatically delete versions/holds/audit to recover disk. Monitor trend/runway and expose capacity status locally. OpenSearch capacity is included only if enabled.

## 9. Health monitoring and administration

Provide authenticated local admin views for service/version state, login failures/lockout, database/FTS freshness, queue depth/oldest age, OCR/preview failures, mount identity/access, free bytes/inodes, source capture lag, checksum failures, signature/certificate expiry, backup status, and last restore evidence.

- Separate process liveness, required-dependency readiness, and optional integration degradation.
- Keep dependency diagnostics/secrets out of unauthenticated health responses; operators get detailed authorized views.
- Redact/rotate local logs and bound retention/capacity. Trace/metric exporters are local-only or disabled; no vendor ingestion URL.
- Local dashboard alerts work without email. Optional customer-local SMTP/syslog/monitoring integration can notify operators; no mandatory external chat/mail service.
- Audit configuration, role/account, connector/mount-mode, job replay, restore, and retention actions.
- Document operator runbooks for boot/start/stop, paused workers, queue reconstruction, index rebuild, mount repair, space recovery, signature import, account recovery, and incident handling.

Customer support diagnostics are explicit local redacted exports, never automated upload. Customer-controlled manual sharing needs approval and privacy review.

## 10. Backup architecture

**Required recoverable set:** PostgreSQL data including local credential hashes/RBAC/audit/workflows/holds/job intent/text, managed immutable originals/reference snapshots, configuration/root/provider mappings, offline release/schema inventory, required audit exports, and separately held keys/secrets. Optional provider state needs separate policy. Derivatives/FTS/queue are rebuildable if originals/provenance/intent remain; retaining them may reduce RTO.

Use encrypted customer-controlled targets on a separate failure domain, such as an independently administered backup server/appliance or approved removable/offline media. A different folder on the same disk is not an independent backup. Define off-host/off-site custody if recovery objectives require it; neither cloud nor Internet is mandatory.

### Consistent recovery point

Database and files must recover to a consistent set:

- Initial proposed method: approved quiesced backup window pauses new mutations, processors/connectors and retention/purge; drain/record in-flight work, capture a recovery point and immutable file/hash manifest with DB/config backup, then verify and resume.
- An online alternative needs a tested coordinated protocol: retain all blobs referenced by the database recovery point, prevent purge during backup, track manifests and pending states, and align file snapshots/WAL replay. Do not assume unrelated DB and share snapshots are consistent.
- PostgreSQL PITR requires tested base backups/WAL and corresponding retained binaries. Record backup recovery point, release/schema version, completion/verification, encryption key reference, and retention under customer policy.
- Reference-source backups remain the source owner's task. DMS snapshots are backed up as managed content; if source snapshots are used instead, prove immutable version retrieval and backup coverage.
- Retention/holds/deletion policy must cover backup copies. Restores must not resurrect already-purged content into service without tombstone/disposition reconciliation.

Schedules, backup retention, RPO/RTO, media rotation, restore frequency, and custodians are open D-07/D-08/D-09 decisions.

## 11. Restore architecture

Proposed isolated recovery procedure:

1. Obtain approval, compatible verified release bundle, clean target infrastructure, backup manifest, and keys from custodians; keep user access closed.
2. Restore matching DB/config and managed file snapshot/recovery set. Pause schedules/connectors/purge/dispatch; restore must never write to external-reference sources.
3. Validate schema/release compatibility, root/mount identity/permissions, encrypted data access, manifest/content hashes, accepted/pending versions, audit continuity, roles/accounts, holds/tombstones, and deleted-content policy.
4. Revoke restored browser sessions; evaluate reset/rotation of service/provider secrets and compromise-related passwords/keys. Verify restricted admin access/recovery.
5. Reconcile pending outbox/jobs, missing/orphan blobs, and optional integrations conservatively. Rebuild FTS/previews from retained inputs where required; do not duplicate irreversible external side effects.
6. Run local login/permission/search/version/download/processing smoke tests, record measured recovery loss/time, and compare with approved RPO/RTO.
7. Obtain release-to-service approval, reopen traffic, reenable permitted workers/connectors, and observe health/alerts. Record operator/actions/outcome locally.

Periodic isolated restores prove recoverability; backup-file existence or green scheduled jobs do not. Include recovery without Internet and with source shares unavailable using retained managed snapshots.

## 12. Offline acceptance gate

Before production readiness, demonstrate with synthetic representative data and external egress blocked:

- clean prerequisite/bundle verification, install/start/reboot and local HTTPS/login/bootstrap/recovery;
- upload/quarantine/scan/version/download, PostgreSQL FTS, Tesseract/preview, local audit/admin/health;
- no optional IdP/S3/OpenSearch dependency, CDN/download/activation calls, or telemetry leaving customer networks;
- mounted storage disconnect/full/inode exhaustion/reconnect behavior and immutable reference history;
- verified offline update and scanner-data import, compatible migration and documented rollback limits;
- aligned encrypted backup and isolated restore, verified keys/access/holds/hashes/job recovery, measured RPO/RTO;
- operational runbooks, local alert ownership, capacity headroom, and security acceptance.

These are future acceptance tests, not executed results. Only documentation was prepared in this revision. See [Roadmap](DEVELOPMENT_ROADMAP.md) and the [decision register](REQUIREMENTS.md#decision-register) for approval gates.
