# P3 — Infrastructure Foundation Decisions (P3D)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)

Version 1.0 — date: 2026-09-06 — status: CANDIDATE (awaiting explicit user decision: APPROVE P3 / REQUEST CHANGES / STOP)
Baseline: P2 tag merge-p2-approved (commit b6224e1). See P3_INFRASTRUCTURE_REPORT.md for evidence.

## P3D-01 — packages/config is the single owner of infrastructure/runtime configuration
Typed env validation (strict in production, dev defaults elsewhere). Business config (audio/scoring/pipeline/models) stays in the owning Engines. Captured keys: DB, Redis, JWT, S3/storage, inference, queue, observability, security/CORS/rate-limit. Direction: leaf — config imports nothing from the monorepo.

## P3D-02 — packages/queue is the canonical queue owner
Single Redis client (ioredis) + BullMQ factories (createQueue/createWorker/createQueueEvents/makeQueueOptions), canonical queues analyze/realtime/DLQ, DLQ forwarding on failure, idempotent submission keyed on correlationId. Depends on config+observability+contracts only. The bullmq->config cycle from pre-P3 is structurally removed (config never imports queue).

## P3D-03 — Security/Auth hierarchy follows D-03
Identity -> Authentication -> Authorization/RBAC -> Tenant isolation. packages/security provides access token (15 min) + rotating refresh token (family + jti + reuse detection -> family revocation), password hashing (bcryptjs), platform-wide RBAC (admin/principal/teacher/student/parent) detached from any Engine. tenantId/schoolId/organizationId preserved in token payload.

## P3D-04 — packages/observability is the canonical owner
Logger (pino), metrics (prom-client, single registry), request/correlation context (AsyncLocalStorage), trace primitives (manual spans, OTel-ready), pino-http middleware. Enables Request -> API -> Engine -> Queue -> Worker -> Inference -> DB chaining.

## P3D-05 — Temporary compatibility layers (documented removal)
| Layer | Location | Canonical owner | Removal target |
|---|---|---|---|
| logger shim | artifacts/reading-engine/src/observability/logger.ts | packages/observability | P5 |
| legacy metrics shim | artifacts/reading-engine/src/observability/metrics.ts | packages/observability | P5 |
| bullmq re-export shim | artifacts/reading-engine/src/queue/bullmq.ts | packages/queue | P5 |
| legacy token/password compat | artifacts/reading-engine/src/security/compat.ts | packages/security | P5 |
| middleware/auth (rewired) | artifacts/reading-engine/src/middleware/auth.ts | packages/security (RBAC) | P5 |
Rule: an implementation is never deleted until grep shows zero importers.

## P3D-06 — Engine worker stays the business processor
The analyze worker remains in the engine (it owns pipeline/scoring logic). Its queue/Redis infrastructure now comes from the canonical owner through the compat shim. Worker adoption of createWorker factory is a P5 cleanup, not a P3 duplicate.

## P3D-07 — No Event Bus in P3
Queue infrastructure is NOT a domain event bus. Event contracts remain in packages/contracts (P1). A full event bus is explicitly out of P3 scope.

## P3D-08 — Security hardening
Helmet + CORS + rate-limit + input validation (zod) preserved; secrets via env only (no real secrets committed; .env excluded); encryption readiness (AES-256-GCM KEK/DEK + signed S3 URLs) preserved; child-data protection noted for D-03 tenant policy.

## P3D-09 — Consumers
artifacts/reading-engine (index, routes, socket, middleware) migrated to canonical packages through shims. artifacts/api-server remains a consumer with its own legacy auth/logger (documented in report §14/§16) — migrated in P5, not deleted in P3.
