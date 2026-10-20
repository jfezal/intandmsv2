# ADR 0003 — PostgreSQL search and local processing

**Status: CONFIRMED** defaults/target from master prompt, 2026-10-08; chunk/query/tool details PROPOSED. No performance result or implementation authorization.

## Context and options

Offline operation and simple customer installation favor existing PostgreSQL rather than mandatory dedicated search/cloud conversion. Options: PostgreSQL FTS plus local pipeline versus additional search/remote OCR stacks.

## Decision

Default PostgreSQL FTS behind SearchPort; local Tesseract with Bahasa Melayu/English and local extraction/preview/scanning. Qualify at least 1,000,000 documents through real synthetic/lab benchmarks, not metadata counts alone. No mandatory OpenSearch/S3/MinIO/AI/API. Previously discussed optional adapters stay deferred, not prerequisites.

## Consequences and security

Proposed bounded chunk GIN indexes/live authorization joins, typed filters, safe highlighting/aggregates and generation-tagged rebuilds; BM tokenization and chunk/phrase limits require validation. Priority office previews justify a reviewed isolated local converter. Resource caps/no external fetch and offline fonts/data/signatures required. D-05/D-11/D-15 govern actual tool versions/fidelity/qualification.
