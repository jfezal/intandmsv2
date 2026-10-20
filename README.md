# IntanDMS V2

On-premise enterprise Document Management System for **Sisi Awan Technologies Sdn Bhd**, designed for customer-owned Ubuntu/Linux servers or VMs on a private LAN/intranet.

**Status: Phase 1 foundation in progress.** Architecture/spec documents remain authoritative; an initial npm-workspace application baseline (API, web shell, database, worker placeholder) is being implemented per [DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md). See [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

## Repository baseline

- Repository: <https://github.com/jfezal/intandmsv2>
- SSH remote: `git@github.com:jfezal/intandmsv2.git`
- Inspected on 2026-10-08: remote repository had no commits, source code, or documentation.
- Development environment verified: Ubuntu/Linux, Node.js `24.21.0`, npm `11.19.0`, Git `2.43.0`.
- A separate `/home/jon/Projects/intanDMS` checkout is not this repository and was left unchanged.
- No relationship to the earlier system's data, code, or migration requirements has been assumed.

## Documentation

1. [Product vision](docs/PRODUCT_VISION.md): scope, stakeholders, outcomes, unresolved business decisions.
2. [Requirements](docs/REQUIREMENTS.md): confirmed capabilities, proposed acceptance criteria, decision register.
3. [System architecture](docs/SYSTEM_ARCHITECTURE.md): components, data model, storage, OCR/search, access control, APIs, security, and deployment.
4. [Technology stack](docs/TECHNOLOGY_STACK.md): recommendations, tradeoffs, dependencies, and licensing gates.
5. [Development standards](docs/DEVELOPMENT_STANDARDS.md): structure, coding conventions, testing, migrations, and delivery controls.
6. [Development roadmap](docs/DEVELOPMENT_ROADMAP.md): phased delivery and approval gates.
7. [On-premise deployment](docs/ON_PREMISE_DEPLOYMENT.md): offline installation, capacity, health monitoring, backup/restore, and administration.
8. [Storage architecture](docs/STORAGE_ARCHITECTURE.md): local filesystem, NAS/SMB/NFS, optional S3, managed and read-only reference modes.
9. [Authentication architecture](docs/AUTHENTICATION_ARCHITECTURE.md): default local users, password security, sessions, and optional LDAP/AD/OIDC.
10. [AI development instructions](AGENTS.md): mandatory rules for future agents.

## Confirmed product direction and proposed implementation

The Product Owner has confirmed on-premise-first, fully functional offline operation with no mandatory cloud service, third-party IdP, public Internet connectivity, or telemetry outside customer infrastructure. These constraints supersede the original S3/OIDC/OpenSearch-first recommendations. Implementation details remain subject to review.

- npm-workspace TypeScript monorepo; React/Vite frontend; NestJS/Fastify modular API; separately deployed workers.
- PostgreSQL for authoritative metadata, permissions, workflows, sessions, and audit records.
- Local filesystem managed storage plus NAS/SMB/NFS adapters; optional S3-compatible storage. External-reference sources are never modified.
- BullMQ with a compatibility-tested Valkey deployment for queues; transactional outbox for reliable dispatch.
- PostgreSQL Full-Text Search by default behind a search interface; OpenSearch is optional.
- Default local authentication with Argon2id password hashing, server-side sessions, rate limiting/lockout, RBAC, and audit. LDAP/AD and OIDC are optional; Keycloak is not required.
- Local Tesseract OCR, preview generation, scanning, workers, and customer-local observability.
- Docker Compose-based customer installation with an offline release bundle, customer-local TLS, capacity planning, and backup/restore. No Kubernetes requirement initially.

See the architecture and stack documents for qualifications. Exact dependency versions, resource sizing, performance targets, and operating costs require validation before implementation.

## Approval required

The Product Owner must review the proposal and resolve or explicitly defer the [decision register](docs/REQUIREMENTS.md#decision-register) before feature implementation. Approval to implement does not authorize production changes, deployments, destructive operations, or GitHub pushes.

## Getting started (local development)

1. Copy environment template: `cp .env.example .env` and adjust secrets.
2. Start dependencies: `npm run compose:up`
3. Install and build packages: `npm install && npm run build -w @intandms/identity -w @intandms/contracts -w @intandms/database && npm run db:generate`
4. Apply migrations: `npm run db:migrate -- --name init` (from repo root; answers prompts on first run)
5. Create first administrator (host-only): `npm run bootstrap:admin -- admin.login`
6. Run API: `npm run dev:api` — http://127.0.0.1:3000/api/v1/health , OpenAPI http://127.0.0.1:3000/api/docs
7. Run web shell: `npm run dev:web` — http://127.0.0.1:5173
8. Optional worker: `npm run dev:worker`

Read the architecture documents above before changing domain behavior. Phase 2+ features remain spec-only until implemented.

## Licensing and confidentiality

The project's licensing and distribution policy is undecided. No open-source license is implied by this proposal. Do not add credentials, customer documents, personal information, or production exports to this repository.
