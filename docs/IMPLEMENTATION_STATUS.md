# Implementation status

**Updated:** 2026-10-20

## Ringkas

| Lapisan | Status |
|---------|--------|
| **MVP demo** (login → managed repo → upload → search) | **Siap** |
| **Production core** (bukan MVP) | **Dalam repo — major upgrade** |
| **OCR (Tesseract)** | **Belum — intentionally last** |
| **100% spec FR-01–FR-20** | **Belum** (offline bundle, 1M bench, BM/EN penuh, ClamAV production, SMB remote agent, dll.) |

## Production-grade (implemented now)

- **CSRF** double-submit (`GET /auth/csrf`, cookie + header)
- **Repository-scoped RBAC** (`scoped_role_assignments` + server checks)
- **Upload quarantine → scan gate → publish** (worker; ClamAV hook point — dev marks `clean`)
- **Indexed repository** + connector registry + read-only filesystem scan worker
- **Workflow** start review + task decide + my tasks
- **Retention** report-only + legal holds (no purge)
- **Preview** inline for image/pdf/text (no OCR)
- **Audit** query API, **admin** users + scoped role assign
- **Connectors** CRUD (mount path on host — SMB/NFS via customer mount)

## Still deferred (not “MVP-only” target — real work remaining)

- Tesseract OCR + office preview pipeline (last)
- ClamAV integration + signature offline update policy
- Remote SMB/NFS connector agent (bukan local mountPath sahaja)
- Full UI/UX spec (BM/EN, design system, explorer states)
- Offline signed release bundle + install wizard
- Testcontainers / Playwright / k6 at scale

See [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md).
