# NAS connector architecture

**CONFIRMED:** Synology, Windows File Server, Linux Samba via SMB3; Linux shared directories via NFS; administrative web configuration. **PROPOSED:** restricted connector/mount-control design.

## Separation of responsibilities

- API: authorized configuration, validation, root selection, test/browse requests, and audited desired state; no arbitrary shell/mount execution.
- Storage data adapter: bounded enumeration/read and Managed-only write operations through approved handles, with path/mount checks.
- Host connector gateway: narrow locally installed component controlling only configured SMB3/NFS mounts. This is an operating/security boundary, not a new business microservice or general remote-execution facility.
- Host operator: initial gateway installation/trust, allowed network/share envelope, OS UID/GID/export ACLs and escalation/recovery. Routine connection management then uses the web UI.

Retain host-preprovisioned mounts as a supported hardened deployment option. The web UI can manage/test/browse approved connection records even where a customer prohibits dynamic mounting; it must explain that new host roots require operator provisioning. Do not pretend UI configuration already mounted a share.

## Web administration flow

1. Add connection: protocol/provider label, allowlisted server/export/share, credential reference, approved path/root envelope, and access mode.
2. Accept write-only credential input over TLS; save encrypted/restricted server-side. Never return saved passwords/service secrets to JavaScript, logs, error details, configuration exports, or browser storage. Blank password on edit means unchanged; explicit replace/clear actions are audited. A password typed by an admin is transient input, not a readable saved credential API.
3. Test connectivity, authentication, protocol/security negotiation, and read/list capability within time limits. Indexed tests never write a probe file. Managed write probes require explicit permission and use only a dedicated DMS-owned probe location with cleanup/audit.
4. Browse authorized roots with pagination; reject paths above the approved envelope and avoid listing arbitrary host files. Return opaque directory handles plus display-relative paths.
5. Select root, repository type, permissions, indexing schedule/concurrency, processing profile, and retention settings; validate mode/root overlap.
6. Activate through a durable desired-state command; show pending/applying/healthy/degraded/error states truthfully. Record configuration revision and gateway acknowledgement.
7. Update secrets/configuration with staged tests; drain/cancel incompatible work, activate a new mount/configuration generation, and reconcile. Never replace a live mount beneath in-flight jobs without fencing.
8. Disable safely: stop new dispatch/ingestion, release or expire active leases, retain checkpoints/evidence, then unmount only when safe. Reenable verifies identity and resumes reconciliation.

Generic failed-connection errors stay safe; authorized operators get redacted causes such as auth failed, certificate/protocol mismatch, unavailable host, root denied, mount mismatch, or capacity full.

## Gateway hardening

- Authenticate API-to-gateway using protected local IPC or mutually authenticated private channel; authorize operations separately from UI visibility.
- Fixed command vocabulary: configure/test/list/status/mount/unmount for approved connection IDs. No arbitrary command strings, mount options, targets, shell interpolation, host paths, or executable selection from requests.
- Parse/validate protocol/server/share/export separately; restrict endpoints/referrals/DNS resolution to the customer-approved network. Private LAN targets are intentional, not a reason to disable SSRF defenses.
- Least-privilege service identity and narrow audited privilege helper where Linux mounts require elevation. The main API/processor must not be privileged, mount-capable, or have the Docker socket.
- Use restricted credential files or approved OS secret mechanisms; never pass secrets in command arguments/process listings. Keys stay outside DB backups under separate custody.
- Restrict mount targets to precreated configured slots with non-writable underlying directories; validate mount identity before exposing data handles. Reject managed/indexed root overlap and nested mount escape.
- Limit parallel connection tests, list size, request time, mounts, and transient retries; expose health without leaking credentials.
- Gateway events include actor/request/configuration revision and safe outcome; root/credential changes require audit.

## Protocol-specific guarantees

SMB3: supported dialect/signing/encryption/authentication policy, share and NTFS/Samba ACL interaction, case sensitivity/collisions, file handles/IDs, range access, rename/copy semantics, open-file behavior, and reconnect must be tested per platform.

NFS: supported version (recommend NFSv4 where compatible), export/UID/GID or Kerberos identity, root squashing, permission model, cache coherency, root identity, timeout/retry/mount behavior, and rename/durability must be tested. Network-isolated NFS without approved security is not automatically confidential/authenticated.

Neither protocol guarantees globally stable file IDs, identical locking, safe concurrent writers, or a distributed transaction with PostgreSQL. Capability descriptors report validated behavior. Source reads must not create sidecars, alter ACLs, or rely on write locks in Indexed roots.

## Mount identity and disconnect safety

Validate approved mount ID/source/export/filesystem/device plus gateway configuration generation; provider markers are additional evidence, not sole security. Pin operations to safe directory/file handles where possible, monitor mount state, and reject unknown/remounted targets. A pre-operation string path check alone does not prevent a mid-operation mount race.

Mount disappearance or mismatch fences writes immediately, fails/degrades in-flight operations, and does **not** write into the newly exposed local mountpoint directory. On reconnect require a fresh mount generation/health check and reconcile pending ledger state. Stale jobs from an old generation may not publish new results.

For source outages, mark source unavailable at repository/connection level; preserve discovered records/checkpoints. Do not run a missing-file sweep from a failed/partial traversal. See [Indexing and reconciliation](INDEXING_RECONCILIATION.md).

## Acceptance and operational evidence

Use synthetic/lab Synology-equivalent SMB behavior plus customer-approved actual-device testing before certifying Synology support; Windows/Samba/NFS tests cover invalid credentials, ACL denies, path/case collisions, symlinks, source edits, disconnect during list/read/write, mount fallback/races, safe disable/secret rotation, restart and reconnection.

No NAS access or connector dependency installation is performed now. Exact protocols/OS versions and gateway privilege model are reviewed under D-04/D-09/D-12 in [Decision register](DECISION_REGISTER.md).
