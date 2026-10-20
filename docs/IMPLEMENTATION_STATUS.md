# Implementation status

**Updated:** 2026-10-20

## Push / repo

- GitHub: `jfezal/intandmsv2` — `main` includes foundation + production core commits.

## Ready for pilot (managed + indexed local mount)

- Auth, CSRF, Valkey-backed login rate limits (fallback memory)
- Scoped RBAC, quarantine upload, ClamAV hook (`clamscan`, `REQUIRE_CLAMAV` for strict prod)
- Worker: publish, FTS index, preview artifacts, indexed read-only scan
- Workflow tasks, retention report/holds, audit/admin/connectors health
- Web: BM/EN labels, explorer, search, workflow task list
- OCR: **implemented but off by default** (`OCR_ENABLED=true` + Tesseract)
- Offline bundle script: `npm run bundle:offline` (stages images + compose; sign manifest operationally)

## Sprint 2026-10-20 (gateway + previews + e2e smoke)

- **LibreOffice** headless PDF previews for Office MIME/extensions (`LIBREOFFICE_*` env)
- **Connector gateway** (`apps/connector-gateway`): SMB list/test via `@marsaud/smb2`, optional CIFS mount (`CONNECTOR_ALLOW_CIFS_MOUNT`)
- API: `POST /connectors/:id/credentials`, `connect-test`, `mount` (forwards to gateway; passwords never stored in DB)
- **Playwright** smoke: `npm run test:e2e` (login UI; optional API health when stack up)

## Still open for full enterprise spec

- NFS gateway mount + full gateway hardening checklist (NAS_CONNECTOR_ARCHITECTURE)
- Testcontainers/k6 at 1M scale
- Full UI/UX spec screens and WCAG acceptance
- Customer-signed offline release process

See [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md).
