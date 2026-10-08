# IntanDMS V2

Enterprise Document Management System proposed for **Sisi Awan Technologies Sdn Bhd**.

**Status: architecture proposal; awaiting Product Owner approval.** This repository contains planning documents only. No application, deployment, database schema, or dependency installation has been implemented.

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
7. [AI development instructions](AGENTS.md): mandatory rules for future agents.

## Recommended direction — not yet approved

- npm-workspace TypeScript monorepo; React/Vite frontend; NestJS/Fastify modular API; separately deployed workers.
- PostgreSQL for authoritative metadata, permissions, workflows, sessions, and audit records.
- S3-compatible managed binary storage with adapters for approved NAS/SMB modes.
- BullMQ with a compatibility-tested Valkey deployment for queues; transactional outbox for reliable dispatch.
- OpenSearch as a rebuildable full-text index; sandboxed text extraction, OCR, scanning, and preview processing.
- OpenID Connect with an enterprise identity provider; API-enforced RBAC and scoped resource authorization.
- Docker Compose for initial development and a reviewed VPS deployment; no Kubernetes requirement initially.

See the architecture and stack documents for qualifications. Exact dependency versions, resource sizing, performance targets, and operating costs require validation before implementation.

## Approval required

The Product Owner must review the proposal and resolve or explicitly defer the [decision register](docs/REQUIREMENTS.md#decision-register) before feature implementation. Approval to implement does not authorize production changes, deployments, destructive operations, or GitHub pushes.

## Getting started

Read the documents above. There are **no runnable application commands yet**: no `package.json`, Docker configuration, or application source exists. Setup and test commands will be documented after the foundation phase is approved and implemented.

## Licensing and confidentiality

The project's licensing and distribution policy is undecided. No open-source license is implied by this proposal. Do not add credentials, customer documents, personal information, or production exports to this repository.
