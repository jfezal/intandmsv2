# ADR 0002 — Managed and Indexed repositories

**Status: CONFIRMED** repository semantics by Product Owner master prompt, 2026-10-08; detailed storage layout PROPOSED. Implementation authorization: none.

## Context and alternatives

Customers must retain existing NAS folders without forced migration. Treating all sources as snapshot-backed Managed content would duplicate storage and misrepresent external audit/version control. Alternative: one generic writable repository versus explicit Managed/Indexed behavior.

## Decision

Managed: dedicated approved customer NAS namespace, controlled physical operations and primary immutable versioning. Indexed: original paths remain, read-only source operations, logical DMS organization, source observation/reconciliation, no mandatory retained original snapshots. Stable internal IDs, capability-gated services/UI, optional snapshots explicit/provenanced. This supersedes the earlier mandatory immutable Indexed-snapshot proposal.

## Consequences and security

No Indexed physical write/delete/restore. Temporary bounded staging/derived artifacts are not migration or historical originals. Observed history is incomplete and not attributed to unknown external actors; Indexed workflow decisions pin/revalidate approved source state. Direct NAS ACL access bypasses DMS policy/audit; customer ACL configuration is independent. Managed layout/interoperability/optional snapshot policy remain D-04/D-13 proposals.
