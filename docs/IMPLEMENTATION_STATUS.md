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

## Internal messaging (D-16, uncommitted)

- Migration `20261020170000_messaging`: conversations, participants, messages, revisions, document links; triggers block message deletion and revision changes; `messages.audit` granted to the `auditor` role
- API `/api/v1/messages/*`: user directory, direct/group/document conversations, send/edit/read, unread summary, `GET /messages/stream` (SSE, ids only, session re-checked every heartbeat, max 5 streams/user, Valkey channel `intandms:messages` or in-memory)
- Investigation: `/messages/investigation/*?reason=` (reason 5–500 chars, audited `messages.investigate_list` / `messages.investigate_read`)
- Web: `#/messages`, document discussion and "Share" in the explorer details panel, `#/admin/messages` (investigation)
- Not yet covered: API integration tests for the two-user flow and non-member/non-auditor refusals (no API test harness yet)

## Security fix (uncommitted)

- CSRF: mutations now require the `X-CSRF-Token` header; the `intandms_csrf` cookie alone is refused (it is sent automatically on forged same-site requests). Signature check is constant-time. Unit test `apps/api/src/common/csrf.guard.test.ts`.

## Still open for full enterprise spec

- NFS gateway mount + full gateway hardening checklist (NAS_CONNECTOR_ARCHITECTURE)
- Testcontainers/k6 at 1M scale
- Full UI/UX spec screens and WCAG acceptance
- Customer-signed offline release process

See [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md).
