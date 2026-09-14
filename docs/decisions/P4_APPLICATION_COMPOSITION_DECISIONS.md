# P4 — Application Composition Decisions (P4D)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)

Version 1.0 — date: 2026-09-06 — status: CANDIDATE (awaiting APPROVE P4 / REQUEST CHANGES / STOP)
Baseline: P3 tag merge-p3-candidate (commit f758b49). Full evidence: P4_APPLICATION_COMPOSITION_REPORT.md.

## P4D-01 — apps/api = Express 5 Application Composition Layer (D-01)
Transport only: HTTP -> validation -> auth -> authorization -> orchestration -> engine/application call -> response. NO business logic in controllers. api-server legacy auth files removed from the app copy (replaced by canonical packages/security).

## P4D-02 — Ownership unchanged (P4.2)
Reading→reading-engine; Assessment/Mastery/Diagnosis/Intervention/Learning-Intelligence/Content/Lesson→their future engines; Database→packages/database; Auth→packages/security; Queue→packages/queue; Observability→packages/observability. API orchestrates only.

## P4D-03 — Unified Auth via packages/security (D-03; C-A2; C-A3)
- Access token 15 min (ver 2: issuer/audience asserted). Legacy tokens accepted during a grace period (C-A2) until they expire.
- Refresh: rotating family+jti; reuse detection revokes the whole family; DB-backed store (C-A3) via refreshTokensTable (family_id/jti/token_version added by migration 002 — non-destructive, reversible).
- RBAC platform-wide (admin/principal/teacher/student/parent); tenantId/schoolId/organizationId in payload.
- No competing auth implementations after migration; original artifact files remain only for rollback until the gate decision.

## P4D-04 — apps/worker = Unified Worker Runtime (C-A4; P4.5)
Heavy jobs run through canonical @workspace/queue createWorker. Business logic stays in the ENGINE (artifacts/reading-engine/src/queue/workers/analyze.processor.ts — the exact previous pipeline). Engine worker entry (index.ts) moved to apps/worker/src/index.ts. Worker ≠ Engine.

## P4D-05 — Queue canonical only (P4.6)
No new Redis client, no new Queue factory inside apps or engines. Idempotent submission keyed on correlationId.

## P4D-06 — Contracts (P4.7; C-A5)
All cross-part communication honors packages/contracts. openapi.yaml expanded to v1.0 (auth paths + bearer scheme); lib/api-zod + lib/api-client-react auth contracts added (hand-mirror until orval regen in CI). No duplicated shared types.

## P4D-07 — Database single source of truth (P4.8)
Only packages/database. client.ts sources DATABASE_URL/pool from @workspace/config and logger from @workspace/observability. Migration 002 additive. Engine legacy schema + migration 001 SHA unchanged (frozen).

## P4D-08 — Config (P4.9)
apps/api PORT/LOG_LEVEL/NODE_ENV + SESSION_SECRET→JWT_SECRET all through @workspace/config (classified in report §10). Remaining process.env reads (13 files) are P5.

## P4D-09 — Observability (P4.10)
apps/api uses canonical requestContext + httpLogger (requestId/correlationId/trace) for Request→API→Engine→Queue→Worker→Inference→DB.

## P4D-10 — Boundaries (P4.12/P4.13)
apps → engines → contracts/infrastructure. packages never import engines/apps (PACKAGES_IMPORT_APPS=0). No cycles (CYCLES=?). Modular Monolith first — no microservices.

## P4D-11 — Removal policy
Nothing deleted with live importers. Deletions in P4: engine worker entry index.ts (moved to apps/worker — C-A4 approved). Legacy api-server auth files + engine compat shims remain until gate approval, removed when zero importers (P5).
