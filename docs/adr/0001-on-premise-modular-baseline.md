# ADR 0001 — On-premise modular baseline

**Status: CONFIRMED** core architecture by Product Owner master prompt, 2026-10-08. Implementation authorization: none.

## Context and options

Customers need offline intranet DMS on their own Linux infrastructure. Cloud SaaS/mandatory IdP/microservices would add connectivity and operational dependencies without approved need. Options: cloud-first/distributed platform versus local modular application with separate workers.

## Decision

React/TypeScript frontend, NestJS/TypeScript modular monolith, PostgreSQL authoritative state, local accounts by default/optional LDAP-AD, separate executable local workers, Compose on dedicated customer Ubuntu/Linux app server. Local TLS/telemetry/backups/offline images/assets; no mandatory cloud/Keycloak/Kubernetes/AI API/Internet. Vite/Fastify/Prisma/queue/version choices remain PROPOSED under D-11, not falsely accepted by this ADR.

## Consequences and security

Domain/application ports preserve module boundaries without business microservices. Customer operations owns certificate/key/patch/signature/media/backup custody. One host is not HA. Server authorization/local sessions/CSRF/audit and processing isolation are continuous requirements, not late hardening.

Approval evidence is the master specification; no deployment/benchmark or certification claimed. See D-01/D-02/D-08/D-11.
