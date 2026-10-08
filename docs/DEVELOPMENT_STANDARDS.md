# Development and coding standards

**Status:** proposed engineering baseline; applicable implementation starts only after approval.

**Date:** 2026-10-08

## 1. Repository structure recommendation

The following is a **planned structure**, not directories or files already implemented:

```text
intandmsv2/
├── AGENTS.md
├── README.md
├── package.json                 # approved npm workspaces/scripts
├── package-lock.json
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── modules/         # controllers and module composition
│   │   │   ├── config/          # validated environment configuration
│   │   │   └── main.ts
│   │   └── test/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/             # routing, providers, application shell
│   │   │   ├── features/        # document/search/workflow/admin UI
│   │   │   └── components/      # genuinely shared accessible UI
│   │   └── test/
│   └── worker/
│       ├── src/
│       │   ├── handlers/        # thin job entry points
│       │   └── bootstrap/       # queue/scheduler/dispatcher wiring
│       └── test/
├── packages/
│   ├── core/                   # domain modules + application services
│   │   └── src/modules/
│   │       └── documents/
│   │           ├── domain/
│   │           ├── application/
│   │           └── ports/
│   ├── database/               # Prisma schema, SQL migrations, repositories
│   ├── storage/                # adapters implementing core storage ports
│   ├── identity/               # OIDC/session integration adapters
│   ├── processing/             # sandbox processor integration adapters
│   ├── search/                 # index/query adapters
│   ├── jobs/                   # queue and outbox infrastructure adapters
│   ├── contracts/              # reviewed schemas/generated API types
│   ├── observability/          # redacted logging, tracing, metrics
│   └── config/                 # shared lint/typecheck/config conventions
├── tests/
│   ├── integration/
│   ├── e2e/
│   ├── security/
│   └── performance/
├── infra/
│   ├── docker/                 # image definitions and processor isolation
│   ├── compose/                # local/reviewed environment topologies
│   └── observability/          # approved dashboards and alerts
├── scripts/                    # reviewed tooling, not hidden business logic
├── docs/
│   ├── PRODUCT_VISION.md
│   ├── REQUIREMENTS.md
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── TECHNOLOGY_STACK.md
│   ├── DEVELOPMENT_STANDARDS.md
│   ├── DEVELOPMENT_ROADMAP.md
│   ├── adr/                    # proposed -> accepted/superseded decisions
│   ├── api/
│   ├── security/
│   └── runbooks/
└── .github/workflows/           # reviewed CI; no automatic prod deployment
```

Create packages only when they have a real responsibility. The layout is a growth plan, not a requirement to scaffold empty packages. Place migrations in one owning package; avoid competing schema definitions.

Dependency direction: API/worker composition -> application/domain and adapters; adapters -> core ports; core must not import Nest, React, queue clients, or cloud SDKs. Web uses API contracts, never database or backend internal entities. Avoid API-to-worker imports; shared use cases belong in core. Boundary tests/linting enforce this.

## 2. Coding conventions

- Strict TypeScript; use `unknown` and runtime narrowing for untrusted values. Avoid `any`, unsafe casts, and non-null assertions without a documented invariant.
- Prefer explicit public signatures, small cohesive functions, and immutable values where practical.
- Use PascalCase for types/components, camelCase for functions/variables, UPPER_SNAKE_CASE for true constants, and consistent kebab-case filenames except framework conventions.
- Use a single documented SQL naming strategy, proposed snake_case; preserve stable migration identifiers.
- Organize backend code by domain rather than one global services directory.
- Keep business validation and authorization in application/domain services; transport validation is a separate boundary.
- Never leave swallowed exceptions, empty catches, debug logging, placeholder authorization, or skipped security checks in release code.
- Comments explain why, especially policy, concurrency, and security constraints; do not narrate obvious code.
- Use structured error types and translate them at transport boundaries; preserve causes internally without exposing sensitive implementation details.
- Handle streaming backpressure, client disconnects, cancellation, and temporary-file cleanup.
- Invoke subprocesses with argument arrays, not shell interpolation; bound execution and sanitize environment access.

## 3. Configuration and secrets

- Validate all required environment settings at startup, including type, range, allowlist, and cross-field constraints; fail clearly on invalid configuration.
- Provide `.env.example` with harmless placeholders after implementation. Never provide working passwords, tokens, or production endpoints as defaults.
- Ignore local environment/secret files and include secret scanning in approved CI.
- Keep secrets out of image layers, Git history, logs, telemetry, and frontend bundles; Vite-exposed values are public.
- Document ownership and rotation of DB, storage, IdP, queue, connector, encryption, and signing credentials.
- Prefer a reviewed secret manager; if encrypted secret records are needed, store the key outside the database and define rotation/recovery.
- Development/staging/production must not share credentials or real customer document fixtures.

## 4. Security and policy conventions

- Every resource operation has explicit authentication and authorization tests, including jobs, bulk operations, range reads, exports, search, preview, and downloads.
- Filter listings by policy and check individual resource access; non-guessable IDs are not access control.
- Do not trust client-provided role names, organization IDs, file MIME types, object keys, or arbitrary redirect/connector URLs.
- Centralize approved permission inheritance semantics; prohibit divergent copies in frontend, worker, and API.
- Use restrictive CSP, secure cookies, CSRF validation, explicit CORS policy, and safe output encoding.
- Disable unsafe inline serving of active formats and avoid raw HTML rendering unless there is a reviewed sanitization boundary.
- Do not expand ZIP/archive ingestion or external-network access without an approved threat model.
- Retention/connector deletion paths require separate policy review, dry-run, hold checks, and explicit execution authorization.
- Sanitize untrusted strings in logs and audit display to prevent injection; avoid logging content merely to aid debugging.

## 5. Persistence, migrations, and concurrency

- Use foreign keys, uniqueness, check constraints, and appropriate indexes alongside application validation.
- Review query plans for core lists, scoped authorization, hierarchy traversal, job claiming, and audit queries; avoid N+1 access patterns.
- Keep transactions short; do not hold database locks while uploading, OCRing, or awaiting an external network service.
- Declare concurrency behavior for versioning, moves, metadata edits, approvals, role changes, and holds.
- Use transactions for state + audit + outbox; make outbox/job retry behavior idempotent.
- Version all migrations; test fresh database setup and upgrade from the previous supported schema with realistic non-sensitive fixtures.
- Prohibit ORM auto-sync, ad hoc production schema editing, and unreviewed destructive migrations.
- Apply expand/backfill/contract: compatible additions, resumable bounded backfills, verified code rollout, then approved removal.
- Document lock/timeout risk, estimated affected data, backup/recovery plan, and rollback limitations. Prefer forward repair when downgrade risks data loss.
- Seeds must be explicit, environment-aware, and credential-free; never seed a known production admin password.

## 6. API and frontend standards

- OpenAPI describes approved authentication, permission expectations, errors, pagination, and examples.
- Review contract changes and check drift between generated contracts and runtime responses.
- Reject unknown/malformed inputs and cap collection/bulk operation sizes.
- Return stable machine-readable errors and user-safe messages with a support request ID.
- Generate frontend API types/client from reviewed contracts; do not expose persistence models.
- Model loading, failure, empty, forbidden, expired-session, processing-pending, and concurrency-conflict states explicitly.
- Client-side permission checks are display hints; server checks remain mandatory.
- Use accessible semantics, keyboard paths, focus management, labels, contrast, and testable error feedback.
- Use backend pagination/filtering for large datasets and scoped query caches; clear sensitive caches on logout/access changes.
- Document localization/date/time behavior instead of silently assuming a language or timezone.

## 7. Testing strategy

### Unit and policy tests

Test domain rules, permission evaluation, metadata validation, workflow transitions, retention evaluation, idempotency identities, and error mapping. Include denied and boundary cases, not just successful CRUD.

### Integration tests

Exercise real approved PostgreSQL, queue, object-store adapter, and search engine behavior. Test constraints, migrations, row locks, outbox publish crashes, duplicate delivery, queue reconstruction, stale index events, permission revocation, object promotion failures, and source changes during import. Mocks alone cannot prove distributed consistency.

### End-to-end tests

Cover login/logout/session revocation, upload/quarantine/scan, folder permissions/moves, version creation/restore, authorized search, previews/downloads, approvals, and retention dry-run/holds. Use synthetic fixtures and isolated test principals.

### Security tests

Maintain negative tests for IDOR/BOLA, tenant crossover if applicable, role escalation, CSRF, redirect manipulation, SQL injection, path traversal/symlink escape, MIME spoofing, decompression bombs, SSRF, session replay, and search metadata/count leakage. Safely isolate malicious-file fixtures and never use customer content.

### Reliability and operational tests

Test dependency outages, processor timeout/crash, storage-full conditions, canceled/stale jobs, recovery reconciliation, backup restore, and deployment compatibility. Assert that failures cannot publish unscanned files, lose required audit evidence, or purge held content.

### Performance and accessibility

Benchmark representative file sizes/page counts/languages and approved concurrency. Measure API/search latency, queue delay, OCR throughput, memory, and index lag. Agree budgets before setting pass/fail thresholds. Combine automated accessibility checks with keyboard/manual validation.

Coverage thresholds are proposed after the foundation baseline; no arbitrary global percentage is claimed as quality evidence. Critical policy and lifecycle paths must have meaningful positive, negative, concurrency, and failure tests regardless of overall coverage.

## 8. Git, review, and CI

- Default branch is the cloned repository's `main`; do not alter remote settings without approval.
- Use short-lived feature branches and small focused PRs after repository workflow approval.
- Proposed commit convention: Conventional Commits (`docs:`, `feat:`, `fix:`, `test:`, `refactor:`, `chore:`).
- Do not commit or push without authorization when the current task is documentation preparation only.
- Require review for authentication, authorization, storage, audit, retention, dependencies, schema changes, and deployment controls; arrange independent review for high-risk work where staffing permits.
- Proposed CI gates: formatting, lint, boundary checks, typecheck, unit/integration tests, frontend build, API contract check, migration tests, dependency/secret/container scans, and applicable end-to-end/security tests.
- CI jobs use least-privilege GitHub tokens, pinned actions, isolated environments, and no production secrets for fork/PR checks.
- Track findings and time-bounded risk acceptance; do not hide vulnerabilities by disabling scans globally.
- Branch protections, required checks, approval rules, and CI files are recommendations, not changes performed by this task.

## 9. Documentation and ADRs

- Keep setup, configuration, endpoints, test commands, module boundaries, and operational notes current with code.
- Record significant decisions in `docs/adr/NNNN-title.md`: context, status, options, decision, consequences, security impact, and approval/date.
- Trace work to FR/NFR and D identifiers; explicitly record changed business assumptions.
- Document runbooks for queue replay, index rebuild, connector repair, quarantined files, backup restore, incident response, and approved disposition.
- Do not claim a command, integration, security control, or restore is verified without recorded execution evidence.

## 10. Definition of ready and done

**Ready:** capability scope/acceptance criteria agreed; relevant D decisions resolved; contracts and threat boundary understood; dependencies/license fit reviewed; tests and operational consequences planned.

**Done:** reviewed implementation, passing applicable checks, negative permission/failure tests, migrations/recovery considerations, audit/observability, updated documentation, no secrets, and Product Owner acceptance. Deployment remains separately authorized.

During the current documentation phase, “done” means complete reviewable proposal files, valid internal links, clear status/decision tracking, and an approval handoff—not runnable software.
