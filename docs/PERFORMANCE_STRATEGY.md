# Performance and capacity strategy

**CONFIRMED:** at least **1,000,000 documents** indexing capability is the qualification target. **OPEN:** hardware/workload/latency/throughput budgets. No benchmark has been run.

## Target meaning

A “document” is a distinct internal document/source-file record, not one OCR page, chunk or version. Demonstrate traversal/reconciliation, state persistence, text/index growth, UI browsing/search, processing/resource recovery and access safety at that count. A metadata-only million-row insert does not prove million-document OCR/search/NAS capability.

Use representative synthetic distributions: wide/deep trees, many small files, large multi-page PDFs/TIFF/office files, BM/English OCR/native text, duplicate content, changed/missing/renamed files, permission scopes, versions/optional snapshots, and concurrent users/jobs. Record seed/generator/profile so measurements are reproducible without customer documents.

## Bounded architecture

- Streaming/paged NAS traversal and persisted frontier; bounded batch upserts/outbox dispatch and per-repository queue admission.
- Separate CPU-heavy OCR/render and I/O-heavy discovery/extraction/download limits; per-connection bytes/sec/IOPS/concurrency and quiet schedules avoid saturating NAS.
- Keyset explorer pagination, lazy trees and virtualized/paged views; bounded bulk manifests. No client-wide tree/data load or OFFSET-only million-row browsing.
- Typed metadata/search filter indexes, chunk GIN FTS, batched projection, authorization ancestry/query plans and stable ranking tie-break. Avoid N+1/recursive policy expansion per result.
- DB connection budget across API/workers/dispatcher/migrations; short transactions, batched lease claiming, realistic vacuum/ANALYZE/WAL and index bloat monitoring.
- Content+profile reuse prevents repeated OCR; retries do not duplicate side effects. Rebuild search vectors from retained extracted text where valid.
- No premature sharding/Kubernetes/OpenSearch/service mesh. Add partitioning/extra search infrastructure only after profiling demonstrates a bottleneck and approval.

## Benchmark suites

1. Initial 1,000,000-file discovery on lab SMB3 and NFS, with memory/frontier/backlog bounds and partial failures.
2. Incremental changes/reconciliation: controlled new/modify/rename/duplicate/missing proportions, mid-run NAS disconnect and worker/DB restart; verify identity/completeness, not just speed.
3. Processing: native text versus BM/English OCR, different page/pixel sizes, preview formats, malformed files, cache reuse and scratch pressure.
4. Browsing/search: selective and broad ACLs, all required filters, filename exact/prefix/substrings where implemented, ranked OCR text, counts, saved views, concurrent tasks and admin controls.
5. Managed uploads/downloads/version/move/copy/trash recovery under concurrent NAS/DB load, with same-name conflicts and share disconnects.
6. Rebuild/backfill/backup/restore while preserving workload headroom and policy state; offline install/update on minimum proposed platform.

Report hardware/OS/images/DB settings/NAS/protocol/network/filesystems/corpus/text chunk sizes/cache warmth/concurrency/security policy. Capture p50/p95/p99 latency, queries/jobs/bytes/pages per time, failures, CPU/RAM peak, NAS latency/IOPS/bandwidth, disk/inodes/scratch, DB size/FTS/WAL/locks/vacuum, queue age, completeness/recovery time and source integrity.

Define cold/warm runs and repeated measurements; no cherry-picked average. Validate permission filtering before interpreting counts or throughput. UI acceptance includes interaction responsiveness on large folders, not only API response timings.

## Acceptance budgets and reporting

D-08/D-15 approve minimum qualification hardware, user/query/job load, corpus formats/pages/bytes, latency/throughput/freshness and resource/recovery budgets before tests. Use measured sustainable rates with headroom, not “one million in X minutes” speculation. Fail qualification on unbounded memory/queues, lost progress, stale/unauthorized results or source modification even if latency is good.

Publish benchmark report with provenance, pass/fail against approved budgets and limitations. No product performance claim until reproducible lab/device evidence is recorded.

## Capacity model

NAS: managed retained versions + physical working/staging/trash and source originals. Indexed originals remain at existing locations; no mandatory full copy. Application disk: PostgreSQL metadata/audit/observations/text/GIN/WAL/maintenance + derived artifacts + bounded transient source/upload/download staging + scratch + queue/log/image upgrade space + approved headroom. Optional snapshots add explicit retained-byte cost; no assumed dedup/compression multiplier.

Backups: coordinated DB + managed NAS version inventory + configuration/keys/evidence, separate source-owner backups, retention horizons, restore-test space and separate failure-domain media. Check raw-versus-usable RAID/quota/inodes and restoration throughput. Stop/defer new processing/ingestion before exhaustion while preserving admin/login/recovery; never evict original versions/holds/audit to meet throughput.

See [Storage](STORAGE_ARCHITECTURE.md), [indexing](INDEXING_RECONCILIATION.md), [testing](TESTING_STRATEGY.md), and [backup runbook](runbooks/BACKUP_RECOVERY.md).
