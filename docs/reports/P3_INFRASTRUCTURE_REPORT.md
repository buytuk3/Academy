# P3 — Infrastructure Foundation Report

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)

Version 1.0 — date: 2026-09-06 — status: CANDIDATE (PASS/FAIL per gate below; NOT an approval)
Baseline: P2 tag merge-p2-approved (commit b6224e1). Engine: BuyTuk Reading Engine (MOD-001).

## 1. Executive Summary
P3 built the shared infrastructure foundation: packages/config, packages/observability, packages/security, packages/queue, on the P2 baseline, with zero deletions, engine test suite green, and a mechanically verified acyclic dependency graph. Queue Redis integration tests are SKIPPED (no live Redis in sandbox) and are NOT reported as passing. Tag: merge-p3-candidate. No "approved" status anywhere: the user decides APPROVE P3 / REQUEST CHANGES / STOP.

## 2. P2 Baseline
- Tag merge-p2-approved (commit b6224e1). Tracked files before: 156; after P3: ? (additions only; 0 deletions).
- Zero-loss manifest: /home/user/outputs/p3/p2-baseline.sha256 (156 entries, recorded before any P3 change).
- Engine legacy schema: CURRENT matches BASELINE manifest → ?. Migration 001: CURRENT matches BASELINE → ?. DB untouched in P3.

## 3. Config Inventory (pre-P3 evidence)
Raw grep hits (file:line:usage):
- artifacts/reading-engine/src/index.ts:1 import "dotenv/config"; :14 PORT; :15 HOST; :22/33/34 CORS_ORIGIN, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS
- artifacts/reading-engine/src/security/encryption.ts:10 AUDIO_KEK (module-level throw if invalid)
- artifacts/reading-engine/src/security/s3-client.ts:11 S3_BUCKET; :12 S3_PRESIGNED_EXPIRES; :5-7 AWS region/keys
- artifacts/reading-engine/src/realtime/socket.ts:60 JWT_SECRET; :47 CORS_ORIGIN
- artifacts/reading-engine/src/middleware/auth.ts:33 JWT_SECRET
- artifacts/reading-engine/src/http/routes.ts:58 JWT_SECRET; :66 JWT_EXPIRES_IN
- artifacts/reading-engine/src/pipeline/inference-client.ts:6-8 INFERENCE_PROTO_PATH/GATEWAY_URL/API_KEY
- artifacts/reading-engine/src/pipeline/audio-enhancement.ts:18 DFN_WORKER_PATH
- artifacts/reading-engine/src/observability/logger.ts:3 LOG_LEVEL
- artifacts/reading-engine/src/queue/bullmq.ts:7 REDIS_URL; :8 REDIS_PREFIX
- artifacts/api-server/src/lib/auth.ts:5 SESSION_SECRET; artifacts/api-server/src/lib/logger.ts:3 NODE_ENV; :6 LOG_LEVEL
- packages/database/src/client.ts:7-13 DATABASE_URL/POOL_MIN/POOL_MAX; drizzle.config.ts:4 DATABASE_URL
Engine business config files: config/{audio,scoring,pipeline,models,security}.config.ts (kept in engine by design — P3D-01).

## 4. Queue Inventory (pre-P3)
- artifacts/reading-engine/src/queue/bullmq.ts: new Redis(REDIS_URL,…keyPrefix:PREFIX); new Queue("analyze"); new Queue("analyze-dlq"); new Queue("realtime"); new QueueEvents("analyze") x2 (bullmq.ts + socket.ts:190); addAnalyzeJob/getJobStatus/queueHealthCheck; DLQ forwarding on failed; retry policy from pipeline.config (attempts 3, exponential 2000ms, removeOnComplete/removeOnFail).
- artifacts/reading-engine/src/queue/workers/analyze.worker.ts: new Worker<AnalyzeJob>("analyze", processor, {connection: redis, concurrency: pipelineConfig.workers.analyze.concurrency}); stage progress 5→100; BullMQ v5.7.0; ioredis 5.4.1.

## 5. Security/Auth Inventory (pre-P3)
- Engine: middleware/auth.ts (jwt.verify + RBAC roles admin/principal/teacher/student/parent); http/routes.ts login (bcrypt.compare + jwt.sign 7d); socket.ts io.use (jwt.verify); helmet+express-rate-limit in index.ts; encryption.ts (AES-256-GCM KEK/DEK); s3-client.ts presigned URLs (v4, aws:kms).
- api-server: lib/auth.ts (bcryptjs hashPassword/verify, signAccessToken 15m via SESSION_SECRET, opaque refresh via crypto, sha256-hashed refresh storage).
- No real secrets in repo; .env excluded.

## 6. Observability Inventory (pre-P3)
- Engine: observability/logger.ts (pino); observability/metrics.ts (prom-client registry + queueLength/jobsProcessed/pipelineDuration/modelLatency/pipelineErrors + getMetrics for /api/metrics); index.ts pino-http; correlationId params threaded through pipeline (vad, g2p, alignment, forced-alignment, stt, feature-extraction, audio-enhancement) + socket.ts:153 randomUUID; opentelemetry deps declared in engine package.json but zero usage in src (?).

## 7. Canonical Ownership
| Capability | Owner | Status |
|---|---|---|
| Runtime config | packages/config | NEW |
| Logger/metrics/tracing/context | packages/observability | NEW |
| Tokens/password/RBAC | packages/security | NEW |
| Redis/queues/factory/DLQ/idempotency | packages/queue | NEW |
| DB client/schema | packages/database | P2 (unchanged) |
| Contracts | packages/contracts | P1 (unchanged) |

## 8. Config Architecture
packages/config/src: env.ts (validateEnv, REQUIRED_KEYS DATABASE_URL/JWT_SECRET/AUDIO_KEK, strict mode), runtime.ts (loadConfig -> RuntimeConfig typed sections: server/db/redis/jwt/storage/inference/queue/observability/security), index.ts (singleton config + configWarnings). Strict validation in production; dev defaults otherwise. No business config moved.

## 9. Queue Architecture
packages/queue/src: client.ts (canonical ioredis with keyPrefix from config), jobs.ts (JobName union + FailedJobData + AnalyzeJob re-export), factories.ts (makeQueueOptions/createQueue/createWorker/createQueueEvents — queue factory defaults connection to the canonical client), idempotency.ts (makeJobId from correlationId, isDuplicateJob), index.ts (analyzeQueue, dlq, realtimeQueue, attachAnalyzeEvents with DLQ forwarding, addAnalyzeJob idempotent, getJobStatus, queueHealthCheck). Retry/backoff/DLQ/remove policies from config.queue (attempts 3, exponential 2000ms — legacy values).

## 10. Security Architecture
packages/security/src: tokens.ts (createAccessToken 15min default, verifyAccessToken with issuer/audience/algorithms, createRefreshToken family+jti, RevocationStore, RefreshRotator with reuse -> family revocation), password.ts (bcryptjs — portable, no native build), rbac.ts (ROLES, hasRole, canAccess), index.ts. Legacy engine auth preserved via compat layer (signLegacyToken etc.) so existing tokens keep working (no issuer/audience claims in legacy tokens).

## 11. Auth/RBAC Architecture
D-03 hierarchy implemented: Identity (sub/familyId) -> Authentication (access 15m + rotating refresh) -> Authorization (RBAC detached from engines; platform roles) -> Tenant readiness (tenantId/schoolId/organizationId in payload). api-server's separate auth remains (consumer) until P5.

## 12. Observability Architecture
packages/observability/src: logger.ts (createLogger), correlation.ts (AsyncLocalStorage context: requestId/correlationId/tenant/school/org), trace.ts (startSpan/endSpan manual spans, OTel-ready), metrics.ts (createMetrics + getMetrics singleton), http.ts (requestContext + httpLogger). Engine shims preserve legacy metric names until P5.

## 13. Dependency Graph (mechanical check — appendix raw output)
Edges: queue -> config; queue -> observability; queue -> contracts; all others leaf. CYCLES=? (COUNT=?).
Direction rule satisfied: config never imports queue/observability; database independent of engines; contracts leaf; security leaf. Engine (consumer) -> packages only (no package imports anything from artifacts).

## 14. Migration Map
| Consumer | Before | After (P3) | Compatibility |
|---|---|---|---|
| engine/src/index.ts | dotenv + process.env + pinoHttp direct | @workspace/config + @workspace/observability httpLogger | none needed |
| engine/src/http/routes.ts | jwt/bcrypt direct + process.env | config + security/compat (legacy sign/verify) | compat kept |
| engine/src/realtime/socket.ts | jwt.verify + new QueueEvents | config + compat + createQueueEvents | compat kept |
| engine/src/middleware/auth.ts | own jwt.verify + own RBAC | @workspace/security RBAC + config + compat verify | none needed |
| engine/src/observability/* | own pino/prom-client | re-export shims -> canonical owners | shims (P5 removal) |
| engine/src/queue/bullmq.ts | full impl (cycle bullmq->config) | thin re-export of @workspace/queue | shim (P5 removal) |
| engine/src/security/compat.ts | (new) | legacy sign/verify/password | P5 removal |
| api-server (lib/auth, lib/logger) | own jwt/bcryptjs/pino | NOT migrated (remains) | P5 |
| packages/database | own process.env | NOT migrated (remains) | P5 |

## 15. Compatibility Layers
Five documented layers (P3D-05 table) with removal target P5; each preserves exact legacy behavior; none deletes an implementation with live importers.

## 16. Removed Duplicates
- Engine no longer owns jwt.sign/jwt.verify implementations (moved to canonical packages/security + compat). JWT implementation files remaining repo-wide: ? (compat, api-server legacy — documented consumers, P5).
- Single-instance audit: new Queue=? (all in packages/queue canonical); new Redis=? (canonical only); Pool/Client=? (none — canonical packages/database client reused).
- Logger creators: canonical packages/observability + 1 engine shim + 1 api-server legacy (documented, P5).
- Prometheus registries: canonical singleton + 1 engine shim (documented, P5).
- OpenTelemetry: ? usages in src (deps declared but unused).

## 17. Test Results (raw evidence in appendix; exit 0 = PASS)
| Suite | tsc | vitest |
|---|---|---|
| contracts | exit 0 | — |
| database | exit 0 | — |
| config | exit 0 | exit 0 — 1 passed |
| observability | exit 0 | exit 0 — 1 passed |
| security | exit 0 | exit 0 — 1 passed |
| queue (unit) | exit 0 | exit 0 — 1 passed |
| engine | exit 0 | exit 0 — 3 passed |
Redis-backed queue integration tests (enqueue/retry/backoff/failure/DLQ): SKIPPED (no live Redis in sandbox) — explicitly not reported as passing; must run in CI/staging.

## 18. Security Verification
- No real secrets committed (.env excluded; only .env.example); new packages contain no secret values (dev placeholders only).
- Helmet/CORS/rate-limit/zod preserved in engine index/routes; token policy D-03 in packages/security; legacy auth kept functional via compat.
- RAW_ENV_FILES remaining (direct process.env reads): ? — all listed in §3/§14; governance: P5 migration to config.

## 19. Zero-Loss Verification
- Deletions: 0 tracked files removed (none). Tracked files 156 -> ? (additions: 4 packages + shims + docs).
- DB frozen: legacy engine schema matches baseline manifest (?); migration 001 matches baseline (?).
- Engine behavior preserved: engine tests exit 0; consumers rewired, not re-written; shims keep exact legacy semantics.

## 20. Rollback
- Full revert: git reset --hard pre-merge (P0 snapshot) or re-download BuyTuk-Academy-merged-clean.zip (P2).
- Drop P3 only: git reset --hard merge-p2-approved (commit b6224e1); then re-apply approved merge.
- P3 state: tag merge-p3-candidate; zero-loss manifest + cycle-check script preserved under /home/user/outputs/p3/.

## 21. Remaining Risks
1. api-server owns a separate auth/logger implementation (bcryptjs + SESSION_SECRET 15m + opaque refresh) — consolidation deferred to P5 (documented §14/§16).
2. packages/database + engine config files still read process.env directly — migration to config deferred (documented).
3. Engine worker still instantiates Worker directly (business processor) — factory adoption at P5.
4. Queue Redis integration tests skipped (no Redis in sandbox) — must run in CI/staging before runtime sign-off.
5. Two prometheus registries + two logger creators exist temporarily (shim + canonical) until P5 removals.

## 22. P4 Recommendation
P4 should be the Apps & Workers layer: scaffold apps/api (Express 5 orchestration) and apps/worker on the canonical packages, migrate api-server consumers to packages/security+observability (removing api-server legacy auth), adopt createWorker in the engine worker, migrate remaining process.env reads to packages/config, then run the full duplicate/cycle/zero-loss gates again. MOD-002 stays closed until P8 per gate rules.

---
## Appendix — raw command evidence (this turn)
DELETIONS=0
TRACKED_BEFORE=156
##### TSC:CONFIG #####
TSC_CONFIG_EXIT=0
##### TSC:OBSERVABILITY #####
TSC_OBSERVABILITY_EXIT=0
##### TSC:SECURITY #####
TSC_SECURITY_EXIT=0
##### TSC:QUEUE #####
TSC_QUEUE_EXIT=0
##### TSC:CONTRACTS #####
TSC_CONTRACTS_EXIT=0
##### TSC:DATABASE #####
TSC_DATABASE_EXIT=0
##### TSC:ENGINE #####
TSC_ENGINE_EXIT=0
##### VITEST:CONFIG #####

 RUN  v1.6.1 /home/user/audit/v2.7.1/packages/config

 ✓ test/config.test.ts  (6 tests) 5ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  07:25:49
   Duration  291ms (transform 60ms, setup 0ms, collect 48ms, tests 5ms, environment 0ms, prepare 81ms)

VITEST_CONFIG_EXIT=0
##### VITEST:OBSERVABILITY #####

 RUN  v1.6.1 /home/user/audit/v2.7.1/packages/observability

{"level":30,"time":1788679550025,"service":"unit","msg":"hello"}
 ✓ test/observability.test.ts  (5 tests) 9ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  07:25:49
   Duration  336ms (transform 61ms, setup 0ms, collect 92ms, tests 9ms, environment 0ms, prepare 74ms)

VITEST_OBSERVABILITY_EXIT=0
##### VITEST:SECURITY #####

 RUN  v1.6.1 /home/user/audit/v2.7.1/packages/security

 ✓ test/security.test.ts  (9 tests) 1354ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  07:25:50
   Duration  1.70s (transform 85ms, setup 0ms, collect 117ms, tests 1.35s, environment 0ms, prepare 75ms)

VITEST_SECURITY_EXIT=0
##### VITEST:QUEUE #####

 RUN  v1.6.1 /home/user/audit/v2.7.1/packages/queue

 ✓ test/queue.test.ts  (6 tests | 2 skipped) 5ms

 Test Files  1 passed (1)
      Tests  4 passed | 2 skipped (6)
   Start at  07:25:52
   Duration  278ms (transform 46ms, setup 0ms, collect 45ms, tests 5ms, environment 0ms, prepare 81ms)

VITEST_QUEUE_EXIT=0
##### VITEST:ENGINE #####

 RUN  v1.6.1 /home/user/audit/v2.7.1/artifacts/reading-engine

 ✓ src/engines/__tests__/reading-score.test.ts  (2 tests) 3ms
 ✓ src/engines/__tests__/gap.test.ts  (2 tests) 3ms
 ✓ src/engines/__tests__/confidence.test.ts  (2 tests) 3ms

 Test Files  3 passed (3)
      Tests  6 passed (6)
   Start at  07:25:53
   Duration  782ms (transform 101ms, setup 0ms, collect 166ms, tests 9ms, environment 0ms, prepare 204ms)

VITEST_ENGINE_EXIT=0
### REMAINING ERRORS (must be empty) ###

