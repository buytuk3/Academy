# P5.3 — HTTP Boundary + Authentication Canonicalization Report (Wave 1 + Wave 2 — combined)

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)


Status: **WAVE 1 GREEN (approved) + WAVE 2 CANDIDATE — awaiting gate decision**
Date: 2026-09-06 — Branch: `p5/forensic`
Baseline (P5.1 approved): `6de79ca` — Wave 1 commit: `5121c52` — Wave 2 commit: `4c581ef` — **NO TAG** (per Git gate)

## 1. Baseline & candidate commits
- P5.3 baseline: `5121c52` (Wave 1, approved).
- Wave 2 candidate: `4c581ef` — clean working tree (0 changes), **no tag** — awaits review.

## 2. Route inventory (Reading Engine HTTP surface — 13 legacy routes)
| # | Route | Method | Current Location (pre-W2) | Current Consumer (pre-W2) | Canonical Destination | Auth Requirement | RBAC | Tenant/School Context | Request Contract | Response Contract | Migration Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | /health | GET | engines/reading-engine/src/http/routes.ts | engine index.ts (deleted W1) | apps/api/src/routes/reading.ts | none | none | — | — | HealthStatus JSON | **MIGRATED (W2)** |
| 2 | /metrics | GET | same | same | apps/api/src/routes/reading.ts | none | none | — | — | text/plain Prometheus | **MIGRATED (W2)** |
| 3 | /passages | GET | same | same | apps/api/src/routes/reading.ts | Bearer (authenticate) | any authenticated | ctx: tenantId/schoolId/org forwarded; row-scoping deferred (P5.3D-09) | query: classroomId, grade, limit, offset | Passage[] | **MIGRATED (W2)** |
| 4 | /passages | POST | same | same | apps/api/src/routes/reading.ts | Bearer | admin, principal, teacher | ctx; teacherId defaults to ctx.userId | PassageInput (zod) | Passage (201) | **MIGRATED (W2)** |
| 5 | /passages/:id | GET | same | same | apps/api/src/routes/reading.ts | Bearer | any | ctx | param: id | Passage | **MIGRATED (W2)** |
| 6 | /sessions/student/:studentId | GET | same | same | apps/api/src/routes/reading.ts | Bearer | any | ctx | param: studentId | Session[] | **MIGRATED (W2)** |
| 7 | /attempts/:id | GET | same | same | apps/api/src/routes/reading.ts | Bearer | any | ctx | param: id | Attempt | **MIGRATED (W2)** |
| 8 | /analyze | POST | same | same | apps/api/src/routes/reading.ts | Bearer | admin, principal, teacher | ctx | AnalyzeInput (zod) | 202 {jobId, attemptId} | **MIGRATED (W2)** |
| 9 | /analyze/:jobId | GET | same | same | apps/api/src/routes/reading.ts | Bearer | any | ctx | param: jobId | JobStatus | **MIGRATED (W2)** |
| 10 | /reports/student/:studentId | GET | same | same | apps/api/src/routes/reading.ts | Bearer | any | ctx | param: studentId | Report[] | **MIGRATED (W2)** |
| 11 | /reports/:id | GET | same | same | apps/api/src/routes/reading.ts | Bearer | any | ctx | param: id | Report | **MIGRATED (W2)** |
| 12 | /audio/presign | GET | same | same | apps/api/src/routes/reading.ts | Bearer | any | ctx | query: key, op | {url} | **MIGRATED (W2)** |
| 13 | /auth/login (legacy username/password) | POST | same | same | **REPLACED** by canonical D-03 auth (apps/api/src/routes/auth.ts) | n/a | n/a | tenantId from register payload | EmailLogin (canonical) | {accessToken, refreshToken} canonical | **REPLACED (P5.3D-06)** |

Legacy route surface: **13** → 12 migrated into `apps/api` reading router, 1 replaced by the canonical D-03 auth flow (login capability preserved at `POST /api/auth/login`; legacy JWT issuance retired per C-A2 grace).

## 3. Consumer inventory (P5.3.0 — full matrix)
Full matrix: `P5_3_CONSUMER_INVENTORY.md` (File / Capability / Owner / Consumers / Canonical Replacement / Migration Action / Final State). Raw greps recorded this wave: pre-W2 consumers — `http/routes` 1 source file, `middleware/auth` 2, `security/compat` 2, observability logger 16, metrics 10, queue/bullmq consumers incl. packages/queue (legal re-export) + engine internals, engine db shim 3 (analyze.processor, routes, socket), `artifacts/api-server` **0 production consumers**.

## 4. Consumer migration matrix (Wave 2 — this candidate)
| Legacy | Consumers (pre) | Canonical Replacement | Migration | Final Consumers | Deletion Evidence |
|---|---|---|---|---|---|
| engines/reading-engine/src/http/routes.ts | engine index.ts (deleted W1) | apps/api/src/routes/reading.ts (Express 5) + engine service facade | W2: transport moved verbatim, handlers delegated 1:1 to service | 0 (source), 0 (tsc) | `git rm`; post-delete grep: no functional refs; **TSC api/engine/worker = 0** |
| engines/reading-engine/src/middleware/auth.ts | http/routes.ts | apps/api/src/middleware/auth.ts (canonical `verifyAccessToken`, D-03) | W2 | 0 | `git rm` (2nd of 3); `ENGINE_MW_SRC_POST=0` |
| engines/reading-engine/src/security/compat.ts | http/routes.ts + middleware/auth.ts | @workspace/security (tokens/password/rbac) | W2 (incl. realtime adapter from W1) | 0 | `git rm`; `COMPAT_SRC_POST=0`; jwt hits now only in packages/security + tests |
| engines/reading-engine/src/observability/logger.ts | 16 internal | @workspace/observability | **deferred → P5.4** | 16 | retained (consumers ≠ 0) |
| engines/reading-engine/src/observability/metrics.ts | 10 internal | @workspace/observability | **deferred → P5.4** | 10 | retained |
| engines/reading-engine/src/queue/bullmq.ts | engine internals + packages/queue re-export | @workspace/queue | **deferred → P5.5** | >0 | retained |
| engines/reading-engine/src/db/* | analyze.processor, routes, socket | @workspace/database | **deferred** (after queue/observability consumers migrate) | 3 → 2 | retained |
| artifacts/api-server/* | 0 production consumers | apps/api | archiving decision (P5.3D-11) | 0 | kept on disk as rollback archive; deletion only after final P5 decision |

## 5. HTTP boundary proof
`ENGINE_HTTP_BOOT_REMAINING=0` (W1). W2 adds transport re-hosting WITHOUT restoring any boot: no `app.listen`/`server.listen`/`http.createServer` inside engines (probe: `\.listen\(` → 1 file = `apps/api/src/index.ts`; `express\(\)` → 1 file = `apps/api/src/app.ts`). Engine package.json de-bootstrapped (P5.3D-07): `main` → service module, `start` script → "Engine is a library — run via apps/api or apps/worker". Production HTTP boundary = **Client → apps/api (Express 5.2.1) → contracts → engines/reading-engine → packages**.

## 6. Express runtime proof
apps/api declared/installed/loaded **5.2.1** (P5.2 evidence: resolved path, no symlink to engine). Wave 2 adds no Express dependency to the engine source tree; engine `node_modules/express@4.22.2` remains only as transitional install (removal listed in P5.1 risks — requires clean npm prune in P5.5+).

## 7. Auth ownership proof
`packages/security` = sole owner (tokens.ts: access 15 min iss/aud ver-2, rotating refresh family+jti, reuse detection; rbac.ts; password.ts). New reading transport uses `apps/api/src/middleware/auth.ts` → `verifyAccessToken` (D-03). **No JWT implementation outside packages/security** (post-W2 hits: tokens.ts canonical + 2 test fixtures). Realtime adapter (W1) verifies via @workspace/security with C-A2 grace.

## 8. Legacy auth inventory
`security/compat.ts` (legacy jwt.sign/verify + bcrypt) — **DELETED W2** (consumers migrated: transport → apps/api canonical middleware; realtime → W1 adapter). No legacy auth remains in engine source.

## 9. Shim inventory (retained, with owners and consumers)
- `observability/logger.ts` — 16 consumers — P5.4.
- `observability/metrics.ts` — 10 consumers — P5.4.
- `queue/bullmq.ts` — engine internals (re-exports @workspace/queue; packages/queue itself imports relative factory paths, NOT this shim) — P5.5.
- `db/index.ts` (+ engine schema) — 2 consumers post-W2 (analyze.processor, socket) — after observability/queue migration, then DELETE.
No shim deleted before zero-consumer proof (Wolf rule upheld).

## 10. Zero-consumer proof (Wave 2)
Pre-delete source refs (self-contained): routes 1, compat 2, engine middleware 1 (all within the files being deleted or the deleted file). Post-delete: `COMPAT_SRC_POST=0`, `ENGINE_MW_SRC_POST=0`, routes functional refs = 0; **TSC api/engine/worker all exit 0** after deletion (import-graph proof). 1 non-executable text mention of `http/routes` remains (classified in evidence — comment/doc path, no import).

## 11. Deletion proof (Wave 2)
`git rm engines/reading-engine/src/http/routes.ts engines/reading-engine/src/middleware/auth.ts engines/reading-engine/src/security/compat.ts` — DELETED=3, pre-delete SHAs in manifest Section B. `src/http/` directory removed. Nothing else deleted; no test deleted.

## 12. API route verification
All 12 migrated routes registered in `apps/api/src/routes/reading.ts` (mounted at `/api` via `routes/index.ts`) with identical method/path/auth/RBAC/status-code behavior; Zod body validators retained (route-layer only, same pattern as auth.ts); handler logic delegated to engine service (no business logic in controllers — P5.3D-07).

## 13. Worker verification
`apps/worker` untouched this wave; worker + engine tests still green (worker tsc 0, vitest 1 passed). Worker remains sole worker runtime (P5.5 boundary preserved).

## 14. Security verification
Canonical middleware path now used by all reading routes (Bearer → verifyAccessToken → req.user {sub, role, tenantId, schoolId, organizationId, email} → ctx). RBAC via `authorize(...roles)` → `hasRole` (packages/security). Error codes preserved to match legacy behavior where applicable (INVALID_BODY / NOT_FOUND / INSUFFICIENT_ROLE / JOB_NOT_FOUND / key required / PRESIGN_FAILED).

## 15. Observability verification
No change (shims retained; P5.4). `getHealth/getMetrics` still flow through engine observability shims as before (behavior preserved).

## 16. Queue verification
No change (P5.5). `/analyze` still enqueues via `addAnalyzeJob` (engine → @workspace/queue re-export), returns 202 {jobId, attemptId}; jobId type normalized `String(...)` (Express 5 params typing) — runtime-identical.

## 17. Database verification
No schema change; no new migration. Engine db shim retained (consumers 2). All queries moved verbatim into `reading-service.ts` (drizzle select/insert/join identical). `apps/api` reading transport uses NO direct db access (all through the engine facade) — single database owner `packages/database` preserved.

## 18. Dependency direction
apps → engines → packages. Source-file probe (md excluded): `PACKAGES_IMPORT_ENGINES=0`, `ENGINES_IMPORT_APPS=0` (the only text mentions are doc/README/comments — non-import). Engine `package.json` script `worker` references `buytuk-worker` by workspace filter name, not a source import.

## 19. Cycle check
No new edges introduced (W2 adds apps/api → engine service facade — the canonical direction). Prior full-graph cycle check: CYCLES=NONE.

## 20. Duplication audit (post-W2, classified)
| Pattern | File(s) | Capability | Owner | Reason | Verdict |
|---|---|---|---|---|---|
| express() | apps/api/src/app.ts | HTTP app factory | apps/api | sole production HTTP boundary | LEGAL |
| .listen( | apps/api/src/index.ts | HTTP bootstrap | apps/api | sole production entrypoint | LEGAL |
| http.createServer( | — | 0 | — | — | NONE |
| new Pool( | — | 0 | — | — | NONE |
| new Redis( | packages/queue/src/client.ts | redis client | packages/queue | canonical factory | LEGAL |
| new Queue( | packages/queue/src/index.ts (analyze, dlq, realtime) | queues | packages/queue | canonical factory | LEGAL |
| new QueueEvents( | packages/queue/src/factories.ts | events | packages/queue | canonical factory | LEGAL |
| new Worker( | — (0 direct) | workers via createWorker in apps/worker | apps/worker | factory pattern | LEGAL |
| jwt.sign | packages/security/src/tokens.ts; security.test.ts; apps/api/test/auth.test.ts | tokens | packages/security (+tests) | canonical owner + test fixtures | LEGAL |
| jwt.verify | packages/security/src/tokens.ts | tokens | packages/security | canonical owner | LEGAL |

vs Wave 1 baseline: no new duplicate introduced (`jwt.sign` 4→3 files: compat.ts deleted; `jwt.verify` 2→1: compat.ts deleted).

## 21. TSC
Post-W2: API=0, ENGINE=0, WORKER=0 (all components compiling — reading-service + reading.ts + legacy-file removal verified).

## 22. Vitest
Post-W2: API 4/4, ENGINE 6/6, WORKER 1/1 — all pass, **no test deleted**.

## 23. Zero-loss
W1: 62/62 identical + socket.ts auth-import change + index.ts removed (zero consumers). W2: 3 files deleted with pre-delete SHAs recorded; 2 canonical files added (engine service facade + apps/api reading transport); pipeline 11 stages, scoring, mastery, gap, STT, G2P, forced-alignment, DTW, VAD, audio, DB schema, migrations, contracts text: **unchanged** (extraction only). Login capability preserved via canonical D-03 flow (P5.3D-06).

## 24. SHA / manifest
`P5_3_ZERO_LOSS_MANIFEST.sha256` — Section A: canonical additions (live SHA); Section B: pre-delete SHA of the 3 deleted files (routes.ts `ceaaa16c…`, middleware/auth.ts `d5586d2a…`, security/compat.ts `865a9e3e…`); Section C: retained transitional shims (SHA).

## 25. Redis / PostgreSQL validation status
**OPEN VALIDATION ⚠️ (SKIPPED ≠ PASS)** on both — unchanged. Real CI/Staging integration (connect, enqueue/dequeue, retry, backoff, DLQ, DB read/write, failure/recovery, idempotency) required before any PASS.

## 26. Remaining risks / unresolved
1) Engine `node_modules/express@4.22.2` transitional install — prune in P5.5+ (no code path uses it). 2) Observability + queue + engine-db shims retained (consumers ≠ 0) — P5.4/P5.5. 3) Realtime socket production attach in apps/api pending (wiring item). 4) Row-level tenant scoping deferred (schema unification) — P5.3D-09. 5) Reading DTO contracts not yet in packages/contracts — recorded, not duplicated (P5.3D-10). 6) Redis/PostgreSQL real integration open.

## 27. Deferred items
P5.4 observability canonicalization (logger 16 + metrics 10 consumers); P5.5 queue canonicalization + engine-db deletion; P5.6 config (process.env); artifacts/api-server archival decision; contracts extension for reading DTOs; OpenAPI route-surface update for the 12 migrated reading routes.

## 28. Rollback procedure
`git checkout 5121c52` restores Wave-1 state (engine routes/middleware/compat retained); full pre-P5.3 rollback: `git checkout 6de79ca`. No destructive DB/migration change was made in W1/W2, so rollback is source-only and safe.

## 29. Recommendation for P5.4
Approve Wave 2 → proceed to P5.4 (observability canonicalization: migrate 16 logger + 10 metrics consumers to @workspace/observability, prove zero consumers, delete shims), keeping the same IDENTIFY→REPLACE→MIGRATE→TEST→ZERO→AUDIT→DELETE discipline. Redis/PostgreSQL remain OPEN VALIDATION until CI/Staging.
