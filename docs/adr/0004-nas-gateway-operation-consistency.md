# ADR 0004 — NAS gateway and operation consistency

**Status: PROPOSED** detailed mechanism, 2026-10-08. Confirmed needs: web-managed SMB3/NFS, server secrets, safe mount identity, bounded recoverable operations. Approval: awaiting consolidated review (D-04/D-12/D-13).

## Context and alternatives

Routine admin UI configuration cannot safely make the API a privileged arbitrary mount executor. NAS operations and PostgreSQL do not share ACID transactions; SMB/NFS locking/durability differs. Alternatives: API privileged mounts, operator-only mounts, or restricted local gateway plus preprovisioned mode.

## Recommendation

Narrow authenticated host gateway controls only allowlisted fixed connector/mount commands; retain preprovisioned mounts for restrictive customers. Source adapters have no write method. Managed operations use durable DB ledger/audit/outbox, expected revisions/mount generations, exclusive verified NAS publication and idempotent reconciliation. Local BullMQ/Valkey remains a compatible queue proposal, not authoritative state.

## Consequences/security/verification

Initial host trust/privilege envelope needs operator setup; routine test/browse/configuration then works in UI. No secrets returned to browser, arbitrary shell/Docker socket or unsafe fallthrough writes. Extra gateway security boundary is justified by confirmed web-management/host privilege needs, not speculative microservices. Validate TOCTOU/mount disconnect/case/protocol semantics and partial failure recovery before implementation certification. Working-tree/version physical layout remains proposed under D-04.
