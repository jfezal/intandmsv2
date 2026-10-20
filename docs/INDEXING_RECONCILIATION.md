# Indexing and reconciliation engine

**CONFIRMED:** at least **1,000,000 documents** is a design/benchmark target, not achieved performance. Full/incremental indexing, durable checkpoints, schedules, pause/resume/cancel/retry, throttling, and truthful progress are required.

## 1. Processing state model

Document processing states: `discovered`, `pending`, `processing`, `indexed`, `failed`, `skipped`, `source_unavailable`. Store stage-specific state for validation/scan/extraction/OCR/preview/search so a successful stage is reusable and “indexed” does not imply every preview succeeded.

Source availability/identity states are separate: present, modified/pending verification, missing-confirmed, unavailable, ambiguous, access-denied, or excluded. Job state is separate: queued, leased/running, retry-wait, completed, failed, canceled. A canceled job is not a missing document; unavailable NAS is not an empty folder.

## 2. Durable traversal and scheduling

1. Create a scan run with repository/configuration/mount generation, scope, full/incremental reason, schedule occurrence ID, and start time.
2. Validate connection/root, then traverse with streaming/paged provider enumeration. Persist directory frontier/cursors and bounded batches of observations/checkpoints in PostgreSQL; never build the complete million-file tree in memory.
3. Adapter cursors may expire or be unstable after changes/reconnect. Resume at a safe directory boundary with replay/dedup rather than claiming exactly-once enumeration. Persist per-directory progress/completeness and scope exclusions.
4. Commit discovered/source-observation records and processing intent with audit/outbox where needed. Dispatcher enqueues only bounded due work; queue payloads contain IDs/generations, not file content/secrets.
5. Apply per-connection and global caps for queued/running jobs, bytes/sec, read IOPS, traversal batches, concurrent OCR/rendering, DB writes, and scratch usage. Backpressure pauses discovery before queue/memory grows without limit.
6. Reconcile scan evidence only for successfully enumerated eligible scopes; record completion/partial state and a resume frontier. Directory-level access-denied/skipped scopes never become missing evidence.

Recommend at most one active reconciliation generation per repository/scope unless disjoint scopes are proven safe. Stable scheduled occurrence IDs and DB leases prevent overlap. Host/gateway generation and profile revision fence old jobs. Schedules respect configured time zone/DST; no invented frequency is mandatory.

## 3. Source observation and content generation

Track internal document ID, repository/root/relative physical location, provider identity hint, size, mtime precision, discovery/index times, observed hash and hash algorithm, source/processing state, metadata revision, and content generation.

Cheap size/mtime/identity markers prioritize candidates, not guarantee unchanged content. Hash when content is read for extraction/OCR/download and perform configurable periodic checksum verification where required. Source markers may be manipulated or coarsely resolved; surface last verification time and residual limitations.

Indexed processing stages read into bounded transient local job staging, compare pre/post source evidence, scan and hash the exact staged bytes, then publish an observation/derived generation only if still eligible. Delete staged originals under bounded job/cache policy; **no mandatory retained original snapshot**. If bytes change during read, retry/report conflict. Provider-native coherent snapshots/reads improve assurance where available; no universal atomic read claim.

Idempotency identity includes repository/document, content checksum or validated source generation, stage, engine/profile version, and output schema. Reuse successful extraction/OCR/preview only when content and configuration identity match; retrying/reindexing metadata alone must not repeat OCR. Do not share content artifacts across permission scopes without a reviewed leakage/isolation model.

## 4. Reconciliation rules

- **New path:** create a new internal document identity unless strong reviewed evidence links an existing one; paths are references, not IDs.
- **Same path changed content:** append an observation and advance generation, invalidate stale search/preview/workflow eligibility, reprocess; Indexed observations are not DMS-controlled versions.
- **Potential rename/move:** correlate within the same repository/root using provider ID evidence, old/new existence, hash/size, prior generation, and scan completeness. A provider ID can be reused; checksum equality can represent duplicates. Require unique corroborated evidence before relinking an identity.
- **Ambiguous match:** preserve both observations/records in an explicit conflict with no silent merge or reassignment of approvals/permissions. Admin resolution is evidence-based, authorized, and audited. Default safe action is separate identities plus possible-match information restricted by permissions.
- **Duplicate content:** label checksum/size duplicates within authorized scope; do not merge records, deduplicate physical originals, or reveal inaccessible duplicate existence. Business handling for duplicate managed upload is separate.
- **Missing path:** mark missing only after a successful authorized enumeration of that directory plus a bounded confirming probe/reconciliation under policy. Keep tombstone/history; no physical source deletion. NAS/permissions/exclusion failures cannot confirm absence.
- **Root/provider identity changed:** fence run, mark unavailable/mismatch, request controlled re-registration/reconciliation. Do not silently associate a replacement NAS volume with old document IDs.

Permissions attached to physical folder scopes must be reevaluated on corroborated moves; do not carry old access grants across roots by accident. Newly discovered content follows approved repository grants, not source-owner ACL assumptions.

## 5. Publication and stale data

Publish text/FTS metadata and stage results using expected content/document/configuration generations. PostgreSQL projection+status updates can be transactional. Stale jobs cannot restore old search text or preview after change/delete/permission revocation.

Default proposed search serves only current eligible verified projections, with missing/changed/unavailable content excluded from ordinary results where safe freshness cannot be established. Authorized admin recovery views may show stale records with explicit state. D-13 determines whether explicitly labeled cached search during outages is permitted; never conflate last indexed text with current source evidence.

Before Indexed downloads, stage/hash/scan current source bytes and compare to the requested observation; return a source-changed conflict rather than stream unverified bytes while still hashing. Serve a fresh verified transient copy under authorization. For previews, recheck source markers/freshness and derived-generation eligibility; use bounded hash revalidation policy for same-marker changes. Changes between checks remain a documented external-writer limitation, not a claim of tamper-proof live preview.

## 6. Jobs, controls, and failure recovery

Leases/heartbeats and attempt records live in PostgreSQL. Local queue is a transport; outbox/durable stage intent supports reconstruction. At-least-once delivery requires idempotent output and stale-generation fencing.

- API/worker restart: replay safe checkpoints, expire abandoned leases, reconcile partially published artifacts.
- Database restart: no unauthorized local fallback; pause publication, retry bounded transactions, reload authoritative state.
- NAS disconnect: stop new I/O, mark unavailable, preserve checkpoint/frontier, use jittered retry; on reconnect verify mount generation and resume safe directory boundaries.
- Worker crash: reclaim lease and stage only after ownership fencing; cleanup bounded scratch without deleting evidence needed for repair.
- Low space/IOPS/overload: pause/defer work and alert; never treat a resource failure as success/skipped.
- Poison/malformed file: fail or policy-skip with reason, attempts and safe diagnostics; no infinite retries.

Admin controls: schedule/concurrency/bandwidth limits; pause stops new work with running jobs safely completing or explicitly canceling; resume continues checkpoints; cancel revokes run generation without deleting completed evidence. Retry failed stages/reindex selected folders/rebuild FTS create new scoped durable intent and audit. Changing profile invalidates only affected derived stages.

## 7. Progress and UI contract

Expose run/scope/generation, state, discovered/enqueued/running/indexed/failed/skipped counts, backlog/oldest age, bytes/pages, actual throughput window, last scan/verification, errors by safe code, and checkpoint/resume status. Separate “files discovered so far” from final total; file counts are not pages/stages.

During traversal show indeterminate discovery progress. A percentage is allowed only for a known fixed eligible workload, with basis displayed; no invented ETA. Counts may change as discovery progresses. Scope all statistics to authorized repositories; document-level counts/details require permitted visibility.

## 8. Scale and acceptance

Use batched upserts, indexed frontier/lease queries, bounded keyset pagination, GIN chunk projections, measured connection budgets, and regular ANALYZE/vacuum planning. Do not create one unbounded scheduled queue entry for every file at startup or run global recursive folder queries for each result.

Benchmark 1,000,000 synthetic documents across deep/wide directories, duplicates, same-marker changes, multilingual text, large PDFs, failed formats, concurrent users, ACL selectivity, and injected outages. Prove memory/backlog bounds, exact-state recovery, no source mutation, no ambiguous identity merge, no stale publication, and search permission safety. Latency/throughput/RPO targets are set in [Decision register](DECISION_REGISTER.md), not claimed here.
