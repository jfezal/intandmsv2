# Security architecture and threat model

**CONFIRMED:** secure defaults, server policy, safe mounts/files, local authentication/TLS, scanning/isolation, audit and local-only telemetry. **PROPOSED:** verification controls/failure protocols; no certification claimed.

## Assets and adversaries

Protect document bytes/text/metadata, credentials/keys/sessions, permission/workflow/retention state, audit evidence, customer source integrity, availability and backups. Threats include unauthorized LAN users, overprivileged insiders, malicious documents, compromised source shares, external file writers, hostile connector configuration, dependency compromise and host failures. Customer host/NAS administrators are privileged trust actors; DMS cannot magically constrain their independent access.

## Trust boundaries

- Browser -> LAN proxy/API: TLS, secure cookies/CSRF, bounded validated requests, output encoding/CSP and safe errors.
- API -> application policy/DB: live principal/resource/capability checks, typed contracts, parameterized SQL, runtime/migration roles and scoped query limits.
- API -> connector gateway: narrow authenticated commands/root/network allowlists, server-side secrets, no arbitrary shell/host mounts or Docker socket.
- Workers -> NAS/staged bytes: least privilege, mount/generation validation, path containment and Indexed read-only methods.
- Staged content -> scanner/extractor/renderers: hostile parser boundary, no external fetch/macros, narrow file access, CPU/RAM/page/pixel/temp/time caps.
- Search/preview/cache -> user: authorized-only title/snippets/counts/URLs, live read checks, generation freshness and private cache scope.
- Operators -> backups/evidence: separate credentials/custody, encrypted targets/keys, verified offline packages and restores.

## Authorization default recommendation

Permission-based scoped grants, deny by default; proposed role bundles are System Administrator, Document Administrator, Department Manager, Contributor, Viewer and Auditor. Bundle names do not grant powers automatically. System configuration and document readership are separate permissions.

Proposed initial inheritance: repository grants inherited by descendants; folder-scoped grants add access within their subtree; no explicit-deny/document-override/public-link feature initially. Virtual folders never grant access. Revoke/remove effective grants transactionally, increment policy revision, invalidate caches, and recheck current policy at every sensitive request/job. This additive model cannot create restricted children beneath a broad grant; report that limitation and seek D-03 approval before code. Do not quietly invent deny precedence.

Moves check source/destination and resulting policy before publication, including expected revisions and group changes. Bulk operations reauthorize each item at execution. Internal service principals are scoped and audited, not “system bypass.” NAS ACL and DMS RBAC are independently administered; DMS service account read access does not imply every user may read every file.

## File/source protection

Indexed connector has no source-write operation. Managed writes only use the dedicated approved NAS namespace. Reject root overlap/traversal/symlink/hardlink/mount escape and race attacks with descriptor/OS-level containment plus generation fencing; string sanitization is not sufficient.

Validate actual bytes/MIME/limits, quarantine unsafe managed input, scan exact processing/download bytes and safely render derivatives. Indexed live content changes between observation/reads are explicitly detected/rejected where evidence permits; no guarantee against arbitrary source-owner mutation. No cached preview/version substitute may silently approve new bytes.

Use customer-local encrypted transport/storage/backups under approved policy; do not disable certificate validation for offline use. Host mountpoint fallback directories are non-writable and validated against expected remote identity. SMB/NFS guarantees are tested independently.

## Audit protocol

Required event categories include login attempts, view, preview, download, upload, rename/move/copy/delete/restore, metadata/permissions/workflow/admin actions. Events contain server actor/action/target/time/outcome/request ID/redacted context, repository/type and content identity where relevant. Unknown/external source actors remain unknown; reconciliation records detection, not complete external activity.

Successful sensitive DB mutations atomically commit audit and outbox/operation intent. NAS mutation outcome is captured in durable ledger/evidence even if final DB completion is delayed. Before authorized content transfer/view response, durably record access attempt; completion/disconnect/failure is a correlated subsequent event. Fail closed for sensitive access when required audit intent cannot be recorded. Denied/invalid-login events use bounded durable security logging where DB policy allows; DB outage never becomes permissive access. Operational logs alone are not audit evidence.

Runtime has append-only audit privileges, no update/delete. Authorized retention/evidence maintenance uses separate credentials under policy. DB/host admins can tamper; optional signed checkpoints anchored to separately administered customer-local evidence storage/offline immutable media strengthen assurance. Same-host hash chains are not tamper-proof proof. Review audit retention and privacy before storing full before/after metadata.

## Privacy and secrets

Passwords/tokens/bind/share secrets/document text never appear in telemetry, job payloads, UI error detail or routine support exports. Stored connector secrets remain server-side; write-only UI entry returns only presence/status. Encrypted secret key stays outside DB custody with tested recovery/rotation. User search history/recent activity has explicit retention/access policy.

No vendor analytics/crash upload/external exporters/automatic diagnostics or customer document use in CI. All processing local; no AI/cloud API. Support sharing is an explicit customer-controlled redacted export with approval.

## Supply chain and offline maintenance

Pinned dependencies/images/actions, SBOM/license checks, current vulnerability review, trusted offline signatures/checksums and documented patch ownership. Bundle scanner signatures/engine data/fonts; update by verified local media/mirror and report freshness. Do not claim an isolated installation never needs patches. Do not add public ACME/activation/CDN/remote NTP requirements.

## Security acceptance and incident handling

Propose OWASP ASVS Level 2 verification adapted to customer risk, not certification. Test BOLA/IDOR and aggregates, role/group revocation, session fixation/CSRF, path/mount races, LDAP injection/referrals, connector SSRF/secret handling, malformed/active formats, parser escape, resource exhaustion, search/highlight XSS, held-file purge, stale workflow and aligned restore.

Define local incident owner/process: isolate affected connection/process, preserve audit/managed/source-state evidence without modifying Indexed sources, revoke/rotate secrets, verify package/backup integrity, notify under approved obligations, restore safely and record lessons. Security D-02/D-03/D-09/D-12/D-13 decisions and release blockers are centralized in [Decision register](DECISION_REGISTER.md).
