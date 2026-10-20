# Search, OCR, and preview specification

**CONFIRMED:** PostgreSQL FTS, local Tesseract, Bahasa Melayu/English, local rendering, priority formats and search modes. **PROPOSED:** bounded processing/query design; performance and fidelity not yet measured.

## Search contract

Application-owned `SearchPort`: validated domain query/filter/sort, trusted principal scope, bounded cursor, authorized result IDs/snippets/ranking, capability/status, projection upsert/remove and rebuild. PostgreSQL adapter is baseline; optional OpenSearch is deferred, not necessary for 1,000,000-document qualification and never introduced instead of benchmarking PostgreSQL.

Required modes: simple, advanced, filename, metadata, full text, OCR content. Filters: repository, physical/virtual folder context, document type, category, tags, date range, DMS owner/custodian, processing state. Saved searches retain query intent, not frozen authorization. Search history is per-user and policy-controlled; its terms/results are potentially sensitive.

Proposed PostgreSQL strategy:

- Store bounded page/text chunks with content target/generation, offsets, language/configuration and `tsvector`; GIN indexes plus relational filter indexes. Chunk sizes are benchmark-selected to respect PostgreSQL vector/position limits and memory/time budgets.
- Use English configuration for English text and tested `simple` configuration for Malay initially; no built-in Malay stemming guarantee. Mixed-language query/tokenization, diacritics, phrase boundaries, OCR noise and ranking are validated with BM/English synthetic relevance fixtures before language claims.
- Filename exact/prefix/case behavior is explicit; optional `pg_trgm` substring/fuzzy acceleration is a proposed extension only if measured filename requirements justify it. Do not promise indexed arbitrary `%substring%` performance using a B-tree alone.
- Typed metadata values/option/tag/type/category joins provide advanced filters; avoid a global JSONB scan or one SQL query per result.
- Deduplicate chunk hits by document/content target; stable ranking tie-break uses document ID. Limit candidate expansion, query complexity, wildcard syntax, highlight length, statement duration and result/export size.
- Define ranking weights for filename/title/metadata/body and chunk aggregation with fixtures, not unverifiable relevance claims. Phrase matches spanning chunks may need overlap/dedup or documented boundary limits.
- Keyset pagination for deterministic filename/date explorer sorts; search ranking uses a bounded cursor/result generation strategy and stable tie-break. Changed corpus may require a new search rather than pretending cursor results are a snapshot forever.
- Compute counts/facets/suggestions/dashboard aggregates only over live authorized records. Expensive aggregates can be omitted or asynchronously computed with generation/policy revalidation, never globally returned then visually hidden.
- Safely encode all highlights; OCR/file text is untrusted. No raw engine HTML injection into React.

## Permission and source eligibility

Join live repository/folder/resource policy and eligible content generation **before** ranking, snippets, pagination and counts. Permission hints/role names/virtual membership are not authority. Filter DMS-deleted/missing/stale content under approved freshness policy; Indexed text is labeled with last source verification where relevant.

Revocation invalidates server/client result caches, but every returned/read resource remains reauthorized. Index rebuilds must not restore old ACLs or generations. Scoped cached queries include principal/security revision; no sharing cached previews/search history across users without resource checks. Direct NAS ACLs are not automatically synchronized with DMS RBAC.

Optional suggestions derive only from authorized content or non-sensitive static UI vocabulary. Optional OpenSearch must reauthorize IDs against PostgreSQL and suppress unsafe raw totals/facets/snippets. No browser search endpoint receives a broad index credential.

## Local processing pipeline

Eligible Managed version or Indexed transient source capture -> format/signature/size validation -> local malware scan -> native extraction -> conditional Tesseract (`msa`/`eng` trained data, pinned and bundled) -> normalized text/FTS projection. Thumbnail and safe preview generation are independent idempotent stages with visible failures.

Identity for reuse includes checksum, content target, engine/data/profile version, and output schema. Unchanged content/configuration reuses successful stages; metadata-only reindex does not rerun OCR. OCR is page-aware, asynchronous, resource-limited and records page coverage/profile/errors; reported confidence is engine-specific, not a proof of accuracy.

Indexed original staging is transient and bounded, not compulsory migration/version snapshot storage. Compare source evidence before/after read; discard stale publication and reconcile changes. Retained optional original snapshots need consent and explicit coverage; generation-tagged derivatives do not imply old source downloads are possible.

## Tooling recommendation and offline security

Retain current candidates: Tesseract (confirmed engine), local Tika where broad extraction is justified, a reviewed PDF/image rasterizer (Poppler candidate), isolated LibreOffice for required office previews, and local ClamAV as proposed scanning implementation. Select exact packages only after license/security/format/offline compatibility checks, not install during this task.

Disable processor external egress, macros/scripts/external links/resource fetch, and access to source secrets. Use narrow read-only input/staged output, argument arrays, no shell interpolation, non-root isolated runtimes, CPU/memory/wall-clock/page/pixel/decompression/scratch bounds and cleanup. Bundle BM/English OCR data, fonts, converters and compatible scan signatures; define verified offline updates/signature freshness under D-05/D-09.

## Preview format contract

- PDF: safe generated preview or hardened bundled local PDF viewer for eligible scanned content; page/zoom/navigation/fullscreen and metadata panel.
- JPEG/PNG: safe decoded/re-encoded derivatives; respect pixel limits and correct orientation.
- TIFF: bounded multi-page rendering, navigation and format/codec limitations reported.
- DOCX/PPTX: local headless conversion to controlled PDF/images, no macros/remote links; font/layout differences explicitly documented.
- XLSX: local spreadsheet conversion with selected sheets/page navigation and declared print-area/formula/font limitations. Preview is not a full spreadsheet editor or guaranteed Excel-fidelity execution environment.

Provide zoom, page navigation, rotation only where supported, fullscreen and permitted download. Encrypted/password-protected/corrupt/unsupported formats get clear status and authorized original download only when safely eligible, not “preview succeeded.” Maximum file/page/sheet sizes, fidelity and accessibility of rendered content require D-05 validation.

## Preview/download access

Private generation-tagged artifact lookup always checks source document/content target permissions. No public static directory, permanent bearer URL, or cache key bypass. Range requests recheck access. Browser caches use appropriate private/no-store policies; logout/revocation clears sensitive application caches.

Managed previews pin immutable version hash. Indexed previews pin verified observation/generation and freshness policy; source changes invalidate eligibility and never silently show old preview as current. Fresh Indexed downloads stage/hash/scan bytes and compare requested observation before responding; unverified raw streaming while hashing cannot guarantee source identity. Size/resource limits and download cancellation remain explicit.

## Search rebuild and acceptance

Build new PostgreSQL projection generations in bounded batches, maintain live updates or a brief controlled switch window, validate document/generation coverage, then transactionally switch active projection. Retain rollback generation under bounded policy. Check stale jobs and scope/permission safety; never double-process originals to rebuild existing text vectors unnecessarily.

Tests: BM/English relevance and highlighting; 1,000,000-file query plans with chunk growth and selective ACLs; all filters/saved searches/history privacy; counts/suggestions leakage; Indexed source modifications/revocation; malformed/large/active documents; each priority format; offline fonts/languages/signatures; OCR reuse; stale artifact rejection; rebuild/restart recovery. No performance/fidelity result is claimed yet.
