# P5.3 — Decisions (Wave 1 + Wave 2)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


## Wave 1 (approved)
- **P5.3D-01** — Engine HTTP bootstrap removed (index.ts) with HTTP_CONSUMERS=0 evidence; realtime capability retained.
- **P5.3D-02** — Realtime auth → @workspace/security via behavior-preserving adapter; C-A2 grace = signature-only verify.
- **P5.3D-03** — No shim deleted before zero-consumer proof (routes/middleware/compat/db/observability retained with recorded consumers).
- **P5.3D-04** — No tag until full P5.3 review (candidate commits only).
- **P5.3D-05** — Redis/PostgreSQL OPEN VALIDATION; MOD-002 closed until P8.

## Wave 2 (this candidate — awaiting gate)
- **P5.3D-06** — Legacy engine `POST /auth/login` (username/password → legacy JWT) NOT carried over. Login capability preserved at `POST /api/auth/login` (apps/api) using the canonical D-03 flow (`usersTable`, 15-min access + rotating refresh). Legacy token issuance retired; C-A2 grace keeps old tokens valid until expiry. Zero-loss claim scoped to capability, not to legacy artifact.
- **P5.3D-07** — Transport extraction pattern: engine exposes a transport-free service facade (`engines/reading-engine/src/service/reading-service.ts`); `apps/api` hosts thin Express-5 controllers that delegate 1:1. **No business logic moved into controllers.** Engine remains domain-logic-only, library-style (package.json de-bootstrapped: main → service module).
- **P5.3D-08** — Engine consumed as library only: `@reading-engine/*` path alias added to `apps/api/tsconfig.json` + vitest alias. No reverse or circular imports; apps→engines→packages holds.
- **P5.3D-09** — Tenant/School/Org context: `ReadingContext` carries `tenantId/schoolId/organizationId` + `role` from the D-03 token on every migrated route; no API boundary created that blocks multi-tenant expansion. Row-level tenant scoping on legacy engine tables deferred to the unified schema migration (no schema change in P5.3).
- **P5.3D-10** — Contract gap recorded: reading HTTP DTOs (Passage, AnalyzeInput, JobStatus, Report, Session, Attempt) are not yet in `packages/contracts`. **Not duplicated** this wave (Zod request validators kept route-layer only, same pattern as auth.ts). Contracts extension queued with OpenAPI route-surface update.
- **P5.3D-11** — `artifacts/api-server` has 0 production consumers; retained on disk purely as rollback archive until final P5 decision (archive/delete with evidence). Production API servers = 1 (`apps/api`).
