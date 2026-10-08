# Technology stack recommendation

**Status:** proposed, not installed or approved.

**Date:** 2026-10-08. Exact package/image versions will be selected after compatibility and security checks.

## Runtime and repository

- **Node.js 24 and npm 11:** align with the confirmed development environment. Pin approved patch versions consistently in developer tooling, CI, and container builds. Check the release support schedule before production use.
- **TypeScript, strict mode:** common language across frontend, API, and orchestration workers; document processing may use isolated non-Node executables.
- **npm workspaces:** monorepo dependency management with a committed lockfile and `npm ci`. Prefer the existing npm toolchain over introducing pnpm or a build orchestrator initially.
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

Next.js remains an alternative if validated SSR or public-content requirements emerge, not the default.

## Identity

**Recommend an existing enterprise OIDC identity provider**, with Keycloak as a candidate self-hosted broker if needed. Integrate SAML/LDAP through a supported IdP rather than maintaining bespoke protocol implementations.

Browser authentication uses Authorization Code + PKCE through the backend and opaque server-side sessions. Integrations use properly scoped OAuth access tokens; an ID token is not an API access token. PostgreSQL stores application memberships and permission assignments; identity and authorization are distinct responsibilities.

MFA, IdP availability, licensing, provisioning, and operator responsibilities are D-02 decisions. Self-hosting Keycloak adds database, upgrade, backup, and incident responsibilities.

## Binary storage and connectors

**Recommend S3-compatible object storage** for managed originals and derivatives, using a maintained S3 SDK behind an internal storage interface.

- Prefer an approved managed service when residency, budget, connectivity, and contract terms allow.
- A self-hosted S3-compatible implementation requires separate compatibility, durability, maintenance, and license review. No product is selected by this document.
- Test multipart upload, checksum semantics, range reads, signed URL restrictions, object versioning, and retention-lock capabilities on the chosen provider; “S3-compatible” does not guarantee full parity.
- NAS support should use an isolated mounted-filesystem/import adapter.
- SMB support should use an approved SMB3 client/mount or dedicated connector agent after security and protocol review. Do not choose an unmaintained npm SMB library simply for convenience.

## Queues and scheduling

**Recommend BullMQ with Valkey**, subject to integration validation for the pinned versions and command set. BullMQ is designed around Redis semantics; compatibility must be demonstrated under disconnects, failover, retries, and scheduling, not assumed from branding.

Valkey is a candidate to simplify open-source licensing choices; alternatives include an approved Redis offering or a managed queue service. Check current licenses and service terms for every choice.

PostgreSQL outbox/job records preserve durable processing intent. Queue persistence improves recovery but cannot replace database reconciliation. Start with application-managed schedules and stable occurrence IDs; introduce a workflow orchestration platform only if long-running processes justify it.

## Full-text search

**Recommend OpenSearch as the target dedicated search engine** for indexed metadata, OCR text, analyzers, and faceted queries. Keep all authorization authoritative in PostgreSQL and explicitly design secure search/count/facet behavior.

Tradeoff: additional JVM memory, disk, backups/configuration, upgrades, and on-call burden. Validate supported engine releases and capacity on the intended VPS. Prefer managed search if justified and permitted.

For a small first installation, **PostgreSQL full-text search is an alternative**, not an automatic fallback. It reduces operational overhead and makes relational authorization easier, but language/analyzer and ranking needs must be evaluated. D-08/D-11 should approve the engine before search implementation. Document and test any later migration.

## Extraction, OCR, previews, and malware scanning

- **Tesseract:** candidate local OCR engine with language data pinned and accuracy evaluated on representative samples. Does not establish handwriting support or accuracy guarantees.
- **Apache Tika:** candidate text/metadata extraction service for approved formats; deploy in an isolated worker boundary with strict limits.
- **PDF rasterization tooling:** choose a maintained engine after fidelity, parser-security, and licensing review. Poppler or MuPDF are candidates, not preapproved dependencies.
- **LibreOffice headless:** optional isolated office-to-preview conversion only if office-format requirements justify it; do not run it inside the API container.
- **ClamAV:** candidate malware scanner; signature updates and outage behavior must be operated. A clean result is not proof that a file is harmless.
- **Commercial OCR:** a future adapter if local quality fails acceptance, contingent on residency, privacy, contracts, cost, and explicit permission to transmit documents.

Run processors with network egress disabled by default, read-only runtimes where practical, bounded temporary storage, CPU/memory/time/page limits, and no repository-wide credentials.

## Testing and delivery

- **Vitest:** proposed unit tests and frontend/component tests; verify API test integration before standardization.
- **Fastify injection or equivalent:** HTTP-level backend tests.
- **Testcontainers:** real PostgreSQL, queue, search, and S3-compatible dependencies in integration tests where supported; requires approved Docker access.
- **Playwright:** browser acceptance, authorization journeys, upload/preview, and accessibility checks.
- **k6:** candidate performance/load testing after workload targets are approved.
- **GitHub Actions:** proposed CI after approval; secretless checks first, minimally scoped permissions, pinned action references, no production credentials in pull-request jobs.
- **Container scanning/SBOM:** choose approved tools such as Trivy and Syft after checking licensing and workflow fit.

## Deployment and observability

- Docker multi-stage images and Docker Compose for initial local/staging topology.
- Choose one reverse proxy after operational review: Caddy for simpler certificate handling or Nginx where existing expertise favors it.
- OpenTelemetry instrumentation, redacted structured logs (Pino candidate), Prometheus-compatible metrics, and Grafana dashboards.
- Use managed observability or Loki/trace backend if appropriate; do not force a heavy self-hosted telemetry stack onto an undersized VPS.
- Separate durable data from container filesystems; use encrypted off-host backups and tested restore procedures.

Kubernetes, distributed event streaming, service mesh, and cross-region active-active deployment are deferred unless approved requirements justify their complexity.

## Version, compatibility, and license gate

Before adding any dependency:

1. Verify maintained releases, Node 24 support, platform/architecture support, and required native binaries.
2. Review direct/transitive licenses, container contents, font/language data licenses, and service terms for the intended distribution model.
3. Review known vulnerabilities and patch/upgrade pathways.
4. Pin package versions, commit the lockfile, pin production image digests, and generate an SBOM.
5. Exercise integration compatibility, fault behavior, resource usage, and backups/restores.
6. Record versions, rationale, limitations, and operational ownership in an ADR.

No dependency compatibility, license suitability, build success, or runtime performance has been certified during this documentation-only task.

## Reference entry points

These are official documentation entry points for later validation, not evidence of version testing:

- <https://nodejs.org/en/about/previous-releases>
- <https://docs.nestjs.com/>
- <https://fastify.dev/docs/latest/>
- <https://www.postgresql.org/docs/>
- <https://www.prisma.io/docs>
- <https://react.dev/> and <https://vite.dev/guide/>
- <https://www.keycloak.org/documentation>
- <https://docs.bullmq.io/> and <https://valkey.io/>
- <https://docs.opensearch.org/>
- <https://tesseract-ocr.github.io/> and <https://tika.apache.org/>
- <https://opentelemetry.io/docs/>
- <https://owasp.org/www-project-application-security-verification-standard/>
