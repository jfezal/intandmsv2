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

## Still open for full enterprise spec

- Remote SMB/NFS connector agent (non-mountPath)
- LibreOffice headless previews for Office formats
- Playwright/Testcontainers/k6 at 1M scale
- Full UI/UX spec screens and WCAG acceptance
- Customer-signed offline release process

See [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md).
