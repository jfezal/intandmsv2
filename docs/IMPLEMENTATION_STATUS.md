# Implementation status

**Updated:** 2026-10-21

## Push / repo

- GitHub: `jfezal/intandmsv2` — `main` includes foundation + production core commits.

## Ready for pilot (managed + indexed local mount)

- Auth, CSRF, Valkey-backed login rate limits (fallback memory)
- Scoped RBAC, quarantine upload, ClamAV hook (`clamscan`, `REQUIRE_CLAMAV` for strict prod)
- Worker: publish, FTS index, preview artifacts, indexed read-only scan
- Workflow tasks (admin sequential templates; no self-approval), retention report/holds, audit/admin/connectors health
- Web: BM/EN labels, explorer, search, workflow task list
- OCR: **implemented but off by default** (`OCR_ENABLED=true` + Tesseract)
- Offline bundle script: `npm run bundle:offline` (stages images + compose; sign manifest operationally)

## Sprint 2026-10-20 (gateway + previews + e2e smoke)

- **LibreOffice** headless PDF previews for Office MIME/extensions (`LIBREOFFICE_*` env)
- **Connector gateway** (`apps/connector-gateway`): SMB list/test via `@marsaud/smb2`, optional CIFS mount (`CONNECTOR_ALLOW_CIFS_MOUNT`)
- API: `POST /connectors/:id/credentials`, `connect-test`, `mount` (forwards to gateway; passwords never stored in DB)
- **Playwright** smoke: `npm run test:e2e` (login UI; optional API health when stack up)

## Internal messaging (D-16)

- Migration `20261020170000_messaging`: conversations, participants, messages, revisions, document links; triggers block message deletion and revision changes; `messages.audit` granted to the `auditor` role
- API `/api/v1/messages/*`: user directory, direct/group/document conversations, send/edit/read, unread summary, `GET /messages/stream` (SSE, ids only, session re-checked every heartbeat, max 5 streams/user, Valkey channel `intandms:messages` or in-memory)
- Investigation: `/messages/investigation/*?reason=` (reason 5–500 chars, audited `messages.investigate_list` / `messages.investigate_read`)
- Web: `#/messages`, document discussion and "Share" in the explorer details panel, `#/admin/messages` (investigation)
- Topbar inbox: message icon with unread-conversation badge, dropdown of the 8 latest conversations, pop-up when another person's message arrives in a conversation that is not open, unread count in the browser tab title
- Playwright two-user suite `e2e/messages-two-user.spec.ts`: admin↔staff send/receive; non-member 404 after group removal; staff without `messages.audit` gets 403 on investigation; staff cannot list admin users; document links the staff cannot read return `{ id: null, available: false }`; UI hides Message investigation / Users for staff. Requires `E2E_ADMIN_PASSWORD` and `E2E_STAFF_PASSWORD`.

## Review flows (D-06)

- Admin `#/admin/workflows` (`users.manage`): sequential templates; each step eligible pool is a user, role or department.
- Send for review picks a template and one person per step. Submitter cannot be a reviewer. Snapshot on the instance so later template edits do not change in-flight reviews.
- Approve opens the next step; reject ends the instance. One `in_progress` review per document.
- Playwright `e2e/workflow-two-user.spec.ts` (same `E2E_*` credentials as messaging).

## Indexed upload (D-03 / D-04, uncommitted)

- Product Owner: Google Drive-style Indexed sharing. Contributor (or admin) can create folders and upload **new** files onto the source. No overwrite, rename, move or delete from DMS.
- Upload is scanned (ClamAV) in a temp file before exclusive-create on the source. `REQUIRE_CLAMAV=true` refuses skipped scans.
- Explorer Upload / New folder follow `documents.write` and repository capabilities. Access grants still control who may do that.

## Departments (D-03, uncommitted)

- `departments` / `department_members`; scoped grants may target a user **or** a department
- Members inherit department grants on the next request (explorer + search)
- Admin UI: `#/admin/departments`; repository access panel can grant a department a Viewer/Contributor role

## Local indexed folder picker (uncommitted)

- `INDEXED_LOCAL_ROOTS` is optional. Unset: administrator picks any readable host folder from **Sambungan storan**. Set: picker stays inside those roots.
- `GET /api/v1/connectors/browse-host` lists host subfolders (names of files are not returned). `/proc`, `/sys`, `/dev` are refused.

## Security fix (uncommitted)

- CSRF: mutations now require the `X-CSRF-Token` header; the `intandms_csrf` cookie alone is refused (it is sent automatically on forged same-site requests). Signature check is constant-time. Unit test `apps/api/src/common/csrf.guard.test.ts`.

## Still open for full enterprise spec

- NFS gateway mount + full gateway hardening checklist (NAS_CONNECTOR_ARCHITECTURE)
- Testcontainers/k6 at 1M scale
- Full UI/UX spec screens and WCAG acceptance
- Customer-signed offline release process

See [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md).
