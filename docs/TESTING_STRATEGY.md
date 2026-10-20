# Testing and release evidence strategy

**CONFIRMED:** automated testing, synthetic data, failure scenarios and tested security. **PROPOSED:** suite organization/evidence gates. No application/tests/dependencies exist yet.

## Layers and tools

Retain proposed Vitest/unit/component, Fastify HTTP injection, Testcontainers for real PostgreSQL/local queue, Playwright browser and k6/performance. Pin supported tooling only after approval; preload images/browser/native dependencies for disconnected test environments. Lab SMB3/NFS fixtures verify actual protocol behavior; mocks cannot prove share semantics. Real customer NAS/documents require separate explicit authorization.

## Coverage contracts

- Authentication: one-time bootstrap/no defaults, password costs/recovery, login limiting/lockout races, session/CSRF/disable/revoke, optional MFA/LDAP and no provider downgrade.
- Authorization: role bundles versus permissions, scoped inheritance, group change/revocation, move source/destination, bulk item rechecks, virtual-folder boundaries, audit/preview/download/range/search/counts/history leakage.
- Connections: Synology/Windows/Samba SMB3 and Linux NFS qualification matrix, write-only secrets, connection test/root browser, invalid credentials/ACL/protocol, safe disable/update, mount identity/fallback/symlink/race and gateway privilege controls.
- Repository/file operations: Managed upload/rename/move/copy/delete/restore/version and partial ledger recovery; Indexed capability-negative endpoints and unchanged source manifests/no sidecars.
- Indexing: streamed frontier/checkpoints, pause/resume/cancel/retry, duplicate detection/no merge, incomplete-scan missing safety, ambiguous rename/reused file IDs, source changes/same-marker hashes, stale-generation jobs and truthful UI counts.
- Metadata: all field types/schema versions/defaults/options/reference scope/type conversion and old-value preservation; tags/categories/saved views/favorites/relationships remain authorized.
- Search: modes/filters/BM-English ranking/highlights/pagination/saved history, authorized aggregates, query limits/SQL/XSS safety, rebuild and generation fencing.
- OCR/preview: each priority format, BM/English trained data, native-text skip/reuse, large/corrupt/active/encrypted inputs, failure/retry, sandbox/network/temp limits, safe browser navigation and permission revocation.
- Workflow: required commands/comments/history/due/in-app notifications, approved sequential/parallel rules, double decisions, version/source-state staleness/reassignment and role changes.
- Audit/retention: required reads/actions/outcomes/requests, access intent/transfer completion, protected append-only evidence, no fabricated external actor, report/review/hold/purge races, logical Indexed removal versus source deletion.
- Recovery: coordinated DB/NAS backup, keys/config, isolated restore/revoked sessions, held/tombstoned content, queue/search rebuild, source-owner limitations, RPO/RTO evidence and offline installation/update.

## Required fault injection

NAS disconnect during enumeration/read/write; missing/wrong mount with writable fallback attempted; invalid/rotated credentials; worker crash/expired lease; DB/queue restart; interrupted upload/transfer; external concurrent edit/rename/remove; duplicates/hardlinks/file ID reuse; group revocation mid-job; full bytes/inodes/quota/scratch; scanner down/stale signatures; malformed decompression-heavy documents; stale preview/result; partial bulk success/cancel; restore to older DB plus newer files.

Assert invariants after each: no Indexed source mutation, no outage-driven deletion, no silent identity merge, no unauthorized metadata/count/bytes, no stale approval/version rewrite, no lost audit intent, no queue/memory explosion, and repairable durable state. “Retry succeeded” alone is insufficient.

## UX/accessibility/localization acceptance

Explorer/list/grid/lazy tree/multi-select/context menu/drag-drop by capability; viewer details/versions/observations/workflow; global/advanced/saved search; upload status/retry; storage/repository wizard; indexing controls/errors; all required screen states.

Exercise BM/English, keyboard-only, representative screen reader, text zoom/reflow/contrast, desktop/tablet/mobile essential viewing/tasks. Verify read-only labels, no generic decorative dashboard, truthful counts/percentages, destructive consequences, and clear concurrent-change/degraded feedback. Collect usability results against approved D-14 criteria.

## Performance and offline release gate

Run the defined [1,000,000-document suites](PERFORMANCE_STRATEGY.md) on approved minimum hardware with synthetic file/page/byte distributions and concurrent permission filters. Record actual corpus/resource/p95/p99/failure/recovery results; never treat fixtures/configuration as passed benchmarks.

Install/reboot/run/upgrade/restore using verified offline artifacts with external egress blocked and no optional IdP/S3/OpenSearch. Capture network/runtime evidence of no CDN/activation/telemetry/package calls, local TLS trust, bundled BM/English fonts/OCR data and verified scanner update. Offline server operation is not an unauthenticated offline browser cache.

## CI and evidence

Locally runnable format/lint/typecheck/boundary/unit/integration/build/migration/API-contract/security/secret/license/image/SBOM checks; optional GitHub development CI has no customer secrets/content. PR checks use synthetic principals/data and least privilege. No automatic production deployment.

Each requirement traces to suite/fixture/expected invariant and executed evidence (commit/configuration/environment/result/date/owner). Critical policy/failure tests matter more than an arbitrary coverage percentage. Release blockers include missing authorization evidence, unsafe source writes/mount fallback, broken migrations/recovery, and unqualified claimed formats/performance. Exceptions require documented owner/expiry/Product Owner security acceptance, not disabling checks globally.

Current evidence: documentation validation only. Feature/security/benchmark/offline-install tests remain **not run** until approved implementation.
