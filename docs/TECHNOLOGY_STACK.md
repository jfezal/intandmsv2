# Technology stack recommendation

**Status:** revised on-premise proposal; product defaults confirmed, dependency choices/versions not installed or approved.

**Date:** 2026-10-08. Exact package/image versions will be selected after compatibility and security checks.

## Default versus optional components

Confirmed baseline: customer-owned Ubuntu/Linux servers/VMs, Docker Compose, offline operation, local authentication, local filesystem/NAS/SMB/NFS, PostgreSQL Full-Text Search, local Tesseract/previews/workers, and customer-local monitoring/backups. No mandatory cloud/Internet/API/IdP, Keycloak, or outbound telemetry.

Optional: LDAP/AD, OIDC, S3-compatible storage, OpenSearch, and richer local observability. Optional components must not appear as dependencies of the baseline Compose startup, release installation, or login/search/storage paths. All framework/library recommendations below remain subject to validation.

## Runtime and repository

- **Node.js 24 and npm 11:** align with the confirmed development environment. Pin approved patch versions consistently in developer tooling, CI, and container builds. Check the release support schedule before production use.
- **TypeScript, strict mode:** common language across frontend, API, and orchestration workers; document processing may use isolated non-Node executables.
- **npm workspaces:** monorepo dependency management with a committed lockfile and `npm ci`. Prefer the existing npm toolchain over introducing pnpm or a build orchestrator initially.
- Build release images in a controlled build environment; customer offline installation loads prebuilt verified images, not packages from npm. Account for native binaries, image CPU architecture, and Prisma engines in the bundle.
- **ESLint and Prettier:** deterministic style and static checks. Add boundary rules and dependency-cycle checks.

## Backend

**Recommend NestJS with its Fastify adapter.** Nest supplies module composition, dependency injection, validation integration, and OpenAPI generation; Fastify provides efficient HTTP handling and streaming facilities.

Use thin controllers, explicit application commands/queries, domain policies, persistence repositories, and external adapters. Do not treat framework guards as the only authorization layer. Verify multipart, sessions, CSRF, and OpenAPI plugin compatibility with Fastify; Express-only recipes such as Multer-based upload interception must not be copied unmodified.

Alternative: plain Fastify with explicit modular conventions has fewer abstractions but requires more discipline and custom infrastructure. No justification for independently deployed business microservices exists yet.

## Database and persistence

**Recommend PostgreSQL with Prisma for typed persistence and migration workflow.** PostgreSQL provides ACID transactions, foreign keys, indexing, JSONB, and optional RLS. Prisma offers a consistent TypeScript developer experience.

- Validate current Prisma support for Node 24 and chosen PostgreSQL before selecting versions.
- Database constraints remain authoritative; use reviewed SQL migrations where ORM abstractions are insufficient.
- Explicit SQL is permitted for row locking, recursive folder queries, outbox claims, specialized indexes, and RLS. Parameterize and test it; never concatenate user input.
- JSONB is appropriate for schema-validated extensible metadata, not a substitute for relational identities, permission edges, or lifecycle state.
- Alternatives: Drizzle or a query builder if the approved design needs SQL-first control beyond Prisma's practical limits. Decide before initial migrations.

PostgreSQL version, pooling, connection budgets, extensions, and backup tooling must be selected against deployment support and operating budget.

## Frontend

**Recommend React with Vite**, TypeScript, React Router, TanStack Query, React Hook Form, and Zod (or an approved equivalent) for client-side form validation.

- An authenticated enterprise SPA does not currently require SEO or server-side rendering; Vite is simpler than Next.js for this use case.
- Same-origin delivery with the API simplifies cookie-based sessions and avoids unnecessary token storage in the browser.
- Generate API client types from the reviewed OpenAPI contract; frontend validation never replaces server validation.
- Choose a maintained accessible UI component system after design review; prefer accessible primitives with a consistent theme over bespoke controls.
- Virtualize large document lists, use server-side pagination/filtering, and test keyboard/screen-reader behavior.
- PDF.js is a candidate PDF viewer, but safe generated preview rendering should be the default for hostile or unsupported originals.
- Bundle all JS/CSS, fonts, icons, PDF workers, and any help/API-viewer assets; no CDN, external fonts, analytics, or runtime package downloads.

Next.js remains an alternative if validated SSR or public-content requirements emerge, not the default.

## Identity

**Default: local application authentication**, with a maintained **Argon2id** password-hashing implementation and PostgreSQL-backed opaque sessions. Use random salts, encoded/tuned cost parameters, bounded verification concurrency, server-side revocation, CSRF protection, rate limiting, lockout/backoff, and audited local account administration. Do not build custom cryptography.

Proposed local API service credentials use random secrets stored as digests, scopes, expiry, and revocation; a third-party token issuer is unnecessary. Password recovery must work via audited local administration without Internet or mandatory email. Optional offline TOTP MFA requires approved enrollment/recovery policy.

**Optional LDAP/AD:** maintained LDAP integration using certificate-validated LDAPS or mandatory verified StartTLS, narrow bind accounts, immutable directory identifiers, escaped filters, and explicit group mappings. Use existing customer directories directly where appropriate; no identity broker is required.

**Optional OIDC:** maintained client with Authorization Code + PKCE and full token/redirect validation when the customer enables it. Keycloak is one possible customer-selected IdP, **not a required dependency or baseline container**. No automatic downgrade of directory/OIDC accounts to local passwords.

See [Authentication architecture](AUTHENTICATION_ARCHITECTURE.md) for credential, session, lockout, bootstrap, and lifecycle controls.

## Binary storage and connectors

**Default: local filesystem** behind an application-owned storage interface. Supported network-share adapters use customer-administered NAS/SMB/NFS mounts or a reviewed isolated connector. Provide managed immutable content and read-only external-reference modes with managed version snapshots. Filesystem durability, mount validation, root containment, and recovery are first-class responsibilities.

- Prefer Linux filesystem primitives with staged writes, exclusive creation, safe path handling, verified checksums, and tested durability semantics. No user-supplied absolute paths or shell interpolation.
- SMB uses approved SMB3 signing/encryption settings; NFS uses approved NFSv4 exports/identity/security. Host operators own mounting, UID/GID mapping, export/share ACLs, and reconnect policy.
- Use read-only mounts/credentials for external-reference roots; do not place derivatives or sidecars there. A mount/client must not modify source files as a side effect.
- S3-compatible storage is **optional**, using a maintained SDK. No baseline object-store container/bucket/cloud subscription is required. Validate provider-specific multipart, checksum, range, versioning, and retention behavior if enabled.
- A self-hosted optional S3 implementation still requires license, capacity, maintenance, and restore review; no product is selected.

See [Storage architecture](STORAGE_ARCHITECTURE.md).

## Queues and scheduling

**Recommend local BullMQ with local Valkey**, subject to pinned-version integration validation. Both run inside the customer environment. BullMQ uses Redis semantics; compatibility must be demonstrated under disconnects, retries, scheduling, and recovery, not assumed.

Valkey is a candidate to simplify open-source licensing choices; an approved customer-local Redis implementation is an alternative. No managed/cloud queue service is required. Check current licenses, offline distribution rights, and native/image dependencies.

PostgreSQL outbox/job records preserve durable processing intent. Queue persistence improves recovery but cannot replace database reconciliation. Start with application-managed schedules and stable occurrence IDs; introduce a workflow orchestration platform only if long-running processes justify it.

## Full-text search

**Default: PostgreSQL Full-Text Search** with bounded text chunks, `tsvector`, GIN indexes, parameterized query construction, explicit language configurations, and authoritative authorization joins before pagination/snippets/counts. Use reviewed SQL for FTS where Prisma support is insufficient. Assess actual languages and document sizes; the `simple` configuration is not a stemming/ranking guarantee.

A core-owned **SearchPort** separates domain-level queries, scope, results/capabilities, projection updates, and rebuild/status from engine-specific queries. PostgreSQL is the default adapter in the proposed design; nothing is installed yet. Optional customer-local OpenSearch implements the contract only after workload/analyzer requirements justify its JVM memory, disk, upgrade, and operations cost.

Optional OpenSearch requires live database reauthorization and safe totals/facets/snippets despite eventual ACL projection. It must not be required for local login, browsing, or PostgreSQL search. Record enabling/migration as an ADR; no cloud search service is part of the baseline.

## Extraction, OCR, previews, and malware scanning

- **Tesseract:** confirmed local OCR engine; select maintained pinned version and bundle approved language data. Accuracy/handwriting support remain sample-dependent, not guaranteed.
- **Apache Tika:** candidate text/metadata extraction service for approved formats; deploy in an isolated worker boundary with strict limits.
- **PDF rasterization tooling:** choose a maintained engine after fidelity, parser-security, and licensing review. Poppler or MuPDF are candidates, not preapproved dependencies.
- **LibreOffice headless:** optional isolated office-to-preview conversion only if office-format requirements justify it; do not run it inside the API container.
- **ClamAV:** candidate local malware scanner with initial signatures and a verified offline update process. Define signature-age warning/block policy and recovery; a clean result is not proof of safety.
- No mandatory commercial/cloud OCR, document-conversion API, remote fonts, or external resource fetch. Any future remote integration requires separate Product Owner/customer security approval and may not break offline baseline operation.

Run processors with network egress disabled by default, read-only runtimes where practical, bounded temporary storage, CPU/memory/time/page limits, and no repository-wide credentials.

## Testing and delivery

- **Vitest:** proposed unit tests and frontend/component tests; verify API test integration before standardization.
- **Fastify injection or equivalent:** HTTP-level backend tests.
- **Testcontainers:** real PostgreSQL/FTS and local queue dependencies, plus filesystem/mounted-share integration fixtures; optional engines/storage only in optional suites. Preload all test images/browser binaries for offline test environments.
- **Playwright:** browser acceptance, authorization journeys, upload/preview, and accessibility checks.
- **k6:** candidate performance/load testing after workload targets are approved.
- **GitHub Actions:** optional development CI after approval, not a customer deployment/runtime requirement. Provide locally runnable equivalent checks; customer data, secrets, and telemetry must not be uploaded.
- **Container scanning/SBOM:** choose approved tools such as Trivy and Syft after checking licensing and workflow fit.

## Deployment and observability

- Docker multi-stage images and Docker Compose for on-premise installation on approved Ubuntu/Linux physical servers or VMs; verified offline image/bundle loading, no automatic registry pulls.
- Recommend Nginx with customer-provided/private-CA certificates; Caddy is optional with internal/manual issuance explicitly configured. Never require public ACME/DNS or insecure HTTP because Internet is absent.
- Local structured logging (Pino candidate), health/admin status, disk/inode/mount and backup monitoring. OpenTelemetry exporters must be local-only or disabled, with no vendor endpoint.
- Optional local Prometheus/Grafana/Loki/trace backend; bundle images/assets if enabled. No managed/cloud telemetry or external analytics.
- Separate persistent bind mounts/volumes from images; customer-controlled encrypted backup target on a separate failure domain, local key recovery, and tested restore. See [On-premise deployment](ON_PREMISE_DEPLOYMENT.md).

Kubernetes, distributed event streaming, service mesh, and cross-region active-active deployment are deferred unless approved requirements justify their complexity.

## Version, compatibility, and license gate

Before adding any dependency:

1. Verify maintained releases, Node 24 support, platform/architecture support, and required native binaries.
2. Review direct/transitive licenses, container contents, font/language data licenses, and service terms for the intended distribution model.
3. Review known vulnerabilities and patch/upgrade pathways.
4. Pin package versions, commit the lockfile, pin production image digests, and generate an SBOM.
5. Exercise integration compatibility, fault behavior, capacity, backups/restores, and clean offline install/update with external egress blocked. Verify runtime assets/native binaries, offline scanner updates, and no hidden telemetry/license/network calls.
6. Record versions, rationale, limitations, and operational ownership in an ADR.

No dependency compatibility, license suitability, build success, or runtime performance has been certified during this documentation-only task.

## Reference entry points

These are official documentation entry points for later validation, not evidence of version testing:

Web links are maintainer research references, **not customer runtime dependencies**. Include the required operating documentation in offline release bundles.

- <https://nodejs.org/en/about/previous-releases>
- <https://docs.nestjs.com/>
- <https://fastify.dev/docs/latest/>
- <https://www.postgresql.org/docs/>
- <https://www.prisma.io/docs>
- <https://react.dev/> and <https://vite.dev/guide/>
- <https://www.rfc-editor.org/rfc/rfc9106> and <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html>
- <https://docs.bullmq.io/> and <https://valkey.io/>
- <https://docs.opensearch.org/>
- <https://tesseract-ocr.github.io/> and <https://tika.apache.org/>
- <https://opentelemetry.io/docs/>
- <https://owasp.org/www-project-application-security-verification-standard/>
