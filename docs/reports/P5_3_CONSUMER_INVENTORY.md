# P5.3 — Forensic Consumer Inventory (Wave 1 + Wave 2 — final states)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


Date: 2026-09-06 — Branch: `p5/forensic` — Baseline: `5121c52` (W1 approved) → Candidate: `4c581ef` (W2, no tag)
Evidence source: p5-3-inventory.log, p5-3-wave2.log (grep + tsc + vitest raw output this wave)

## A. Files DELETED in P5.3 (all after zero-consumer proof + green tests)
| File | Capability | Owner | Consumers (pre) | Canonical Replacement | Migration | Final State | Deletion Evidence |
|---|---|---|---|---|---|---|---|
| engines/reading-engine/src/index.ts | HTTP boot (Express 4) | engine | 0 external (W1) | apps/api (Express 5) | W1 | **DELETED** | INDEX_EXT_CONSUMERS=0; ENGINE_HTTP_BOOT_REMAINING=0; TSC=0 |
| engines/reading-engine/src/http/routes.ts | 13 reading routes | engine | engine index.ts (deleted W1) | apps/api/src/routes/reading.ts + engine service facade | W2 | **DELETED** | git rm; functional refs=0; TSC api/engine/worker=0; SHA ceaaa16c… (sec B) |
| engines/reading-engine/src/middleware/auth.ts | legacy auth middleware | engine | http/routes.ts | apps/api/src/middleware/auth.ts (verifyAccessToken, D-03) | W2 | **DELETED** | git rm; ENGINE_MW_SRC_POST=0; SHA d5586d2a… |
| engines/reading-engine/src/security/compat.ts | legacy jwt/bcrypt | engine | routes.ts + middleware/auth.ts | @workspace/security (tokens/password/rbac) | W2 | **DELETED** | git rm; COMPAT_SRC_POST=0; jwt now only in packages/security+tests; SHA 865a9e3e… |

## B. Files ADDED in P5.3 (canonical)
| File | Capability | Owner | Consumers | Notes |
|---|---|---|---|---|
| engines/reading-engine/src/service/reading-service.ts | transport-free engine service facade (12 domain functions) | engines/reading-engine | apps/api reading router (+ worker flow later) | handler logic moved verbatim from http/routes.ts; no redesign |
| apps/api/src/routes/reading.ts | 12 reading routes (Express 5) | apps/api | apps/api routes/index.ts (mounted /api) | thin controllers; auth via canonical middleware; ctx carries tenant/school/org |

## C. Files RETAINED (transitional — consumers ≠ 0, deletion deferred by rule)
| File | Capability | Current Owner | Consumers (count) | Canonical Replacement | Migration Action | Expected Final State |
|---|---|---|---|---|---|---|
| engines/reading-engine/src/observability/logger.ts | logger shim | engine | 16 | @workspace/observability | P5.4 | removed |
| engines/reading-engine/src/observability/metrics.ts | metrics shim | engine | 10 | @workspace/observability | P5.4 | removed |
| engines/reading-engine/src/queue/bullmq.ts | queue shim (re-export) | engine | socket.ts, service facade | @workspace/queue | P5.5 | removed |
| engines/reading-engine/src/db/index.ts (+ schema) | db shim + legacy reading tables | engine | analyze.processor, socket (2 post-W2) | @workspace/database | after P5.4/P5.5 | removed |
| apps/api/src/middleware/auth.ts | canonical auth middleware | apps/api | routes/auth.ts, routes/reading.ts | @workspace/security | LEGAL (not a shim) | kept |
| artifacts/api-server/* | legacy app copy (13 files) | rollback archive | 0 production | apps/api | archive/delete per P5.3D-11 | archived |

## D. Migration executed (Wave 2 chain, per rule)
IDENTIFY (inventory above) → REPLACE (service facade + apps/api reading router) → MIGRATE (12 routes 1:1; login → canonical D-03) → TEST (TSC api/engine/worker=0; Vitest 4+6+1) → PROVE ZERO (greps + import graph) → AUDIT (dup + direction + cycle) → DELETE (3 files, SHAs recorded). No "delete then fix breakages" anywhere.
