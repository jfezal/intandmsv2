# Database architecture

**CONFIRMED:** PostgreSQL authoritative, migrations, normalized relationships and concurrency. **PROPOSED:** model below; no schema/migration exists yet.

## Ownership and entity graph

Each domain owns writes to its records; adapters may use reviewed parameterized SQL. Runtime roles cannot perform DDL or alter audit history. Migration/evidence-maintenance credentials are separately governed. Use stable opaque UUIDs and UTC timezone-aware timestamps.

### Identity and policy

Users -> credential/session/provider-link records; groups -> user memberships; roles -> permission mappings; scoped assignments -> user/group/service principal and repository/folder. Preserve disabled identities for audit attribution. Service-token digests and reset/lockout state belong to identity/security modules.

### Storage and repositories

Storage connections hold provider/protocol/configuration revision, secret reference, desired state and health/mount generation. Repositories reference one connection/approved root and immutable operating type (`managed` or `indexed`), with lifecycle/configuration revision and indexing/processing/retention profiles.

Physical folder references form repository-scoped adjacency trees with parent, relative physical locator, provider identity hint, source state, and scan evidence. Virtual folders/categories have separate hierarchies and explicit document-membership relations; no virtual membership changes the physical path or permission boundary.

### Documents and content

Documents reference repository/physical folder, stable identity, display name, logical lifecycle, custodian where assigned, source/current-content state and optimistic revision.

- Managed `document_versions`: immutable version ID/sequence/hash/size/author/time/description/storage-object reference/processing state. Only managed documents can have DMS-controlled content versions.
- Indexed `source_observations`: document/location generation, hash/size/mtime/provider evidence/discovery/verification times/status. `current_observation_id` differs from `current_version_id`; observations do not guarantee stored original bytes.
- Source locations/path history are separate records; canonical internal IDs survive confirmed moves, ambiguous mappings remain distinct.
- Managed storage objects/operation ledger/upload sessions record publication state and physical handles. Optional Indexed snapshot records explicitly reference observation, consent/policy/storage and coverage.
- Processing results/previews/search records target either an immutable Managed version or an Indexed observation/generation with a constrained content-target relation, not an unenforced arbitrary polymorphic ID.

### Metadata and organization

Document types -> versioned schemas -> stable field definitions, types, required/validation/default rules, option sets and searchability. Field values are normalized typed rows (text/number/date/boolean/dropdown/multi-select/reference), with option/reference relations and schema revision. JSONB can store validated rule/configuration snapshots, not replace all searchable typed values.

Schema migration is explicit: additive fields/options, safe defaults, validation report/backfill, conversion review, and non-destructive retirement. Renaming uses stable field IDs; removing/changing type never silently truncates old values. Required new fields can leave old records in “metadata needs review,” not corrupt them.

Tags/categories/document relationships/favorites/recent events/saved views/searches have explicit memberships and visibility. User-owned recent/search history requires bounded retention/opt-out policy; search terms can be sensitive. References cannot cross repository/organization policies merely because a field accepts an ID.

### Processing, search, workflow, records

Scan runs -> directory frontier/checkpoints/scan evidence; stage jobs -> attempts/leases/results; durable outbox -> dispatch state. Search chunks reference eligible content generation/page/offset and `tsvector`/language/profile. Definition versions -> workflow instances -> tasks/decisions/comments/notifications pinned to target content/metadata state. Retention policies/assignments/holds -> reviews/dispositions/execution evidence. Audit events preserve actor/action/target/outcome/request IDs/redacted changes independently of document soft deletion.

## Constraints and scope

- Unique local login under explicit normalization/source policy; unique provider stable identity; token digests unique.
- Composite repository references prevent folder/document/role/metadata membership crossover; one customer installation is recommended, optional internal organization boundaries decided under D-01.
- Enforce valid Managed-versus-Indexed target combinations using check constraints plus constrained foreign keys/target tables and reviewed SQL where ORM is insufficient.
- Unique version sequence per document; immutable hash/storage references after acceptance. Unique stage identity by target/generation/profile and stable scheduled occurrence ID.
- Folder ancestry cycles and virtual/category cycles are rejected transactionally. Root/path uniqueness respects provider case behavior; do not universally lowercase paths.
- Identity hints/hash are indexed nonunique evidence, never automatic globally unique document identity.
- Audit/history/holds use restrictive deletes, not accidental ORM cascades. Protected audit owner role denies runtime update/delete.

## Proposed index/query plan

- B-tree repository/parent/name/ID for folder/explorer keyset pages; explicit allowlisted sort indexes for common name/date/size views.
- Scoped role/membership indexes; proposed ancestry closure/path projection maintained transactionally for bounded permission joins, with move cost measured before choosing closure versus materialized path. Do not expand every tree per request.
- Repository/path observations, provider ID hints, hash+size, source state and last seen generation for reconciliation; provider identity is not presumed unique forever.
- Due jobs/outbox partial indexes on state/next-attempt/lease expiry; claim bounded rows with `FOR UPDATE SKIP LOCKED` and ownership fencing.
- GIN on chunk `tsvector`, B-tree repository/content generation/status; typed metadata indexes for explicitly searchable fields, joins for tags/type/category.
- Workflow assignee/state/due and retention eligibility/hold indexes; audit actor/target/request/time access patterns.
- Measure table/index bloat, chunk count per million files, GIN write load, WAL, vacuum/ANALYZE, and metadata-filter selectivity. Add partitioning (for example time-based audit) only after measurements justify it; avoid per-repository table proliferation.

## Concurrency and consistency

Optimistic revision for metadata/configuration/moves/tasks; row locks/uniqueness for version allocation, identity relinking, purge/hold claims. Never hold locks during NAS reads/OCR. Operation ledger plus DB state/audit/outbox commits intent; filesystem outcome reconciliation follows. Partial operations expose state and recovery actions.

Publish generation-tagged text/FTS/state atomically inside PostgreSQL. Permission joins use current policy/security revision; no search cache bypass. Workers compare expected document/observation/configuration generation before publish. Queries and parameters are bounded; no unbounded recursive result sets or wildcard user SQL.

## Migrations and recovery

Single owning migration directory; versioned reviewed SQL/ORM migrations, no production auto-sync. Fresh-install and previous-supported-version upgrade tests, expand/backfill/contract, resumable batched backfills, lock budgets and backups required. FTS functions/indexes/security grants must be migration-controlled, not manually created production state.

Backup includes DB users/hashes/RBAC/audit/checkpoints/holds, configurations and separately governed keys, plus coordinated NAS managed content. Indexed sources remain a separate source-owner backup responsibility. See [Backup runbook](runbooks/BACKUP_RECOVERY.md).

## Acceptance

Test constraints against both repository types, scope crossover, cycles/case collisions, concurrent versions/tasks/holds, stale generation rejection, permission query plans at 1,000,000 documents, DB restart/queue replay, typed metadata schema upgrades, no cascade loss of evidence, and aligned restore.
