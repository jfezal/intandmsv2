# Implementation status

**Updated:** 2026-10-20  
**Phase:** 1–2 MVP delivered in-repo; phases 3–6 partially scaffolded

## Implemented (runnable)

- Monorepo: API (NestJS/Fastify), web (React/Vite), worker (BullMQ), packages (`core`, `identity`, `storage`, `database`, `contracts`)
- Local auth: Argon2id, sessions, bootstrap admin, RBAC permissions
- **Managed repositories**: create repository, folders, upload/download documents, immutable version row + storage object
- Outbox → worker indexing hook → PostgreSQL FTS chunks + `/api/v1/search`
- Audit events on repository/document actions
- Platform stubs: indexed connectors list, workflow definitions, retention policies (tables + read APIs)
- Dev Compose (Postgres/Valkey) and full stack Compose + Dockerfiles + nginx reverse proxy (`:8088`)

## Spec gaps (honest)

The master spec (FR-01–FR-20, NFRs, offline release bundle, NAS SMB/NFS connectors, Tesseract/OCR, previews, workflow execution, retention purge, CSRF hardening, multi-instance rate limits, 1M-doc benchmarks, BM/i18n UX, etc.) is **not fully implemented**. This repository is an **MVP foundation + document core**, not production-complete IntanDMS V2.

## Next engineering priorities

1. Folder-scoped RBAC (D-03) and CSRF for unsafe cookie requests  
2. Quarantine/malware scan boundary before publish  
3. NAS indexed connector workers (read-only)  
4. Tesseract/preview processors in isolated containers  
5. Offline verified release bundle and installation runbook execution  
6. Testcontainers + Playwright acceptance suites  

See [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md) for phase gates.
