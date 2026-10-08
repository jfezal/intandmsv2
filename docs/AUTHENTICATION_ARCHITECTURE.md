# Authentication and authorization architecture

**Status:** revised proposal, 2026-10-08. Local authentication and security capabilities are confirmed; detailed policies/implementation need review.

## 1. Confirmed baseline

- Local users/authentication are supported by default and operate without Internet, email service, directory, cloud, or third-party IdP.
- Secure password hashing, sessions, account lockout/rate limiting, RBAC, server-side authorization, and audit are required.
- LDAP/Windows Active Directory and OIDC are optional. Keycloak is not required.
- Credentials, sessions, security events, and telemetry stay inside customer infrastructure.

Use established password/protocol libraries; do not invent cryptography. This document specifies proposed controls, not implemented endpoints or verified security claims.

## 2. Identity model

Assign every human/service principal an immutable internal ID. Separate identity, credential source, account status, and permission assignments.

Candidate records:

- `users`: internal ID, login/display identifier, enabled state, security revision, timestamps, and approved contact metadata.
- `password_credentials`: user ID, Argon2id encoded hash/parameters, credential-change time, reset-required state; no plaintext/recoverable password.
- `identity_links`: provider ID/type and stable external identifier, such as AD objectGUID or OIDC issuer/subject.
- `sessions`: token digest, user ID, expiry/activity/security revision, creation context, revocation state.
- rate-limit/lockout state, reset-token digests, and authentication/security events with bounded retention.
- `service_principals` and service-token digests, expiry, scopes/role assignments, and revocation.
- group memberships, role/permission definitions, and repository/folder-scoped assignments.

Local/directory/OIDC users must not be merged by email or display name. Define normalization/uniqueness and login-source selection before implementation. A provider identity may map to an existing user only through explicit privileged, audited linking with ownership verification. A directory outage is never permission to set a local password on that account automatically.

## 3. Password storage and policy

Recommend **Argon2id** through a maintained implementation supporting approved Node 24/container architectures. Use a cryptographically random per-password salt, encoded version/parameters/hash, and constant-time verification through the library.

- Select memory/time/parallelism parameters by benchmark on the smallest supported customer hardware, not a copied latency promise. Meet current OWASP/RFC guidance at version approval; record the chosen policy in an ADR.
- Bound simultaneous expensive verifications and input sizes to prevent memory/CPU denial of service.
- Rehash after successful login when parameters are outdated; never downgrade costs silently.
- Store only hashes. Passwords do not appear in logs, audit payloads, job queues, analytics, support diagnostics, or reversible encrypted columns.
- A pepper is optional, not mandatory: if used, keep it outside the database under separate customer-controlled custody and define backup/rotation. Losing it can invalidate all password verification.
- Proposed password policy: long passphrases, generous bounded maximum length, no silent truncation, and a bundled/local common-password blocklist. No mandatory online breach-check API or arbitrary periodic change rule; require reset on compromise. Minimum length/MFA/history policy requires D-02 approval.
- Never ship default credentials or derive an administrator password from a machine identifier.

## 4. Login, limiting, and lockout

Proposed local login flow:

1. Require customer-local HTTPS; validate request and CSRF/login-flow protections; determine credential source explicitly.
2. Apply source/IP/network and normalized-account limits **before** expensive hashing, plus global verification concurrency limits.
3. Verify credentials or use a bounded dummy verification path for unknown users; return equivalent safe errors without revealing account existence/state.
4. Update failed-attempt/backoff state atomically. Record a redacted auth event with actor where known, outcome, time, and correlation context.
5. On success, check enabled/reset/MFA state, rotate the session, reset appropriate failure state, and issue the secure cookie.

Use layered progressive delays/temporary lockout with audited unlock/recovery. Permanent lockout after a small fixed attempt count can let attackers deny service to victims; choose bounded policies and support local recovery. Never sleep while holding a DB transaction/lock. Prevent multi-instance bypass with durable/shared state; a process-local counter alone is insufficient.

Trust forwarded IP headers only from the configured reverse proxy; intranet NATs/shared workstations mean IP alone is not account identity. Rate-limit state must not be lost simply by restarting one API instance. Define failure policy if the limiter dependency fails; authentication must not become unlimited. Thresholds, durations, reset rules, and network exemptions remain D-02 decisions.

## 5. Session architecture

Prefer opaque random application sessions over browser JWT/localStorage tokens:

- Generate high-entropy tokens with a cryptographically secure RNG; store only a lookup digest and metadata in PostgreSQL.
- Use host-only cookies with `Secure`, `HttpOnly`, approved `SameSite`, and restricted scope. Internal HTTPS is still required offline.
- Rotate on sign-in/privilege elevation, reject session fixation, enforce server-side idle/absolute lifetime, and implement explicit revocation.
- Check account enabled/security revision on requests; credential reset/disable/logout and relevant role changes revoke sessions or force live policy recomputation as appropriate.
- All unsafe cookie-authenticated requests validate CSRF token and Origin/Referer according to a reviewed policy; SameSite is not the sole defense.
- Never put session secrets in URLs/logs. Clear browser query caches on logout/account change and use private/no-store policy for sensitive responses.
- Provide authorized session listing/revocation if approved; concurrent session limits are policy decisions, not assumed.

Persisted sessions aid local operation but database restoration can resurrect old sessions. Recovery procedures must revoke restored sessions and evaluate service-secret/key rotation before reopening access.

## 6. Bootstrap and recovery without Internet

### First administrator

Recommend an explicit local operator bootstrap command/process through a restricted host channel. It is enabled only for a fresh uninitialized installation, serializes initialization, and creates the first approved admin identity with an interactively supplied strong password or expiring one-time enrollment secret. Do not echo secrets, place them in process arguments, commit them, or expose an unauthenticated web setup wizard on the LAN. Close bootstrap access after completion and record the event.

No bootstrap tool exists yet. Operator trust, initial admin powers, secret distribution, and dual control need approval.

### Account reset/unlock

Recommend authorized, audited local administrator recovery with time-limited single-use reset secrets delivered through an approved local channel; store digests, bind to the user/action, expire/invalidate on use, and revoke sessions on reset. Never reveal an existing password or reset via security questions.

Email is optional using a customer-local relay; it is not required for account recovery. A locked sole administrator requires a restricted host-operated recovery procedure with explicit operator verification, local evidence, and no universal backdoor. Define physical/host admin trust and custodian procedure before production.

### Optional local MFA

TOTP is a proposed offline-capable option, with encrypted enrollment secrets, hashed one-use recovery codes, local time synchronization, and authorized recovery. Do not add a required cloud push/SMS service. Whether MFA is mandatory for administrators remains open.

## 7. Optional LDAP and Active Directory

Optional customer-configured directory adapter, disabled by default:

- Connect only to approved customer-local endpoints. Require certificate-validated LDAPS or mandatory validated StartTLS; reject insecure/plaintext fallback and invalid/expired certificates.
- Use a least-privilege search/bind service account where needed; escape LDAP filters/DNs using the library, cap results/depth/time, and restrict referrals to approved endpoints.
- Verify user credentials through the directory flow; do not persist/cache user directory passwords for offline fallback.
- Map stable directory IDs, not mutable distinguished names/email alone. Explicitly map approved groups to application roles/scopes; nested groups need bounded, tested semantics.
- Treat directory membership as input to DMS authorization, not blanket access to every document. Removal/disable must invalidate application access within an approved interval.
- Define sync cadence, login revalidation, session TTL/deprovisioning latency, directory outage behavior, and stale-group policy. New directory sign-ins fail closed during outages; existing sessions follow explicit policy and must not get unlimited stale privileges.
- Local users remain independent and operational when directories are disabled/unavailable. Emergency local administrators must be deliberately provisioned and governed, not auto-created on directory failure.

AD integration here means optional directory authentication/group mapping; integrated Windows/Kerberos SSO is not assumed and needs separate requirements/threat review.

## 8. Optional OIDC

If enabled by the customer, use a maintained client and Authorization Code + PKCE through the backend. Validate issuer/discovery allowlist, exact redirects, `state`, `nonce`, signatures/algorithms, audience, expiry, and key rotation; encrypt any server-held sensitive token material. Use the same local opaque session and DMS authorization policy after sign-in.

OIDC must not change the baseline dependency graph or require Keycloak. A customer-local IdP supports offline use; an optionally configured remote IdP may make that provider's sign-in Internet-dependent, but must not remove independent local-account functionality. No implicit local fallback for a linked provider identity. No unapproved telemetry/content is transmitted to the provider.

## 9. RBAC and integration principals

Central policy evaluation takes principal, action, resource scope, approved classification/workflow/lifecycle context, and current security revision. Enforce it in application services, not just routes/UI.

Propose scoped grants, deny by default, explicit permissions, and separate platform-operation/document-reader powers. Exact folder inheritance/overrides/denies/move behavior remains D-03. Audit changes to users, provider links, groups, roles, secrets, and policies. Recheck both source/destination on moves and target version on approval/download/preview.

For intranet integrations, propose random local service tokens issued once, stored as digests, scoped to explicit service principals/actions/resources, expiring/revocable, and visible to authorized admins. Do not reuse passwords, share a universal administrator key, or log bearer tokens. Rate-limit/audit usage and rotate via customer-local procedures. Optional OAuth access tokens require full issuer/audience/scope checks and the same resource policy.

## 10. Audit and verification

Record login success/failure, lockout/unlock, reset/bootstrap, account enable/disable, session revoke, MFA/provider linking, role/group changes, and service credential lifecycle. Payloads omit passwords, hashes, reset/session secrets, and raw directory bind material. Distinguish operational logs from retained audit evidence; authorize audit readers.

Required implementation evidence:

- Password/hash-parameter tests, bounded verification under load, generic errors, multi-instance limiting/lockout races.
- Session fixation/expiry/revocation, account disable/reset, CSRF, proxy header trust, unauthorized object/service-principal access.
- Local login/bootstrap/recovery working with Internet/LDAP/OIDC unavailable.
- LDAP filter/referral injection, certificate failure, group removal, outage/no-downgrade, and cross-provider account-linking tests.
- OIDC flow tests only when enabled; baseline starts with no IdP installed.
- Audited isolated restore with revoked prior sessions and tested credential/key recovery.

No authentication feature or security test has been implemented/run in this documentation revision. See D-02/D-03/D-09 in [Requirements](REQUIREMENTS.md) for unresolved policies.
