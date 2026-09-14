# Architecture Findings — CORE-17 (Platform Integration & Runtime Verification)

- Date: 2026-09-09 · Baseline: 9994d5713cc3514d9096ff1269cfb6ae6640d562 (CORE-16 approved)
- Scope: Integration + Runtime + Production-Readiness Verification. NO new engines, NO new event bus, NO UI, NO microservices, NO AI/LLM.

## 1. Runtime infrastructure verified (REAL, not mocked)

| Infrastructure | Version | Result |
|---|---|---|
| PostgreSQL (local server, port 5432) | PostgreSQL 16.15 | Real server started; canonical drizzle schema pushed; 32/32 runtime tests PASS |
| Redis (local server, port 6379) | Redis 7 (canonical `@workspace/queue` client, BullMQ) | Real server; enqueue → worker → completed; failure → failed state; idempotent re-submission PASS |

Verification suites (auto-skip unless `CORE17_RUNTIME=1`):
- `tests/core-17/runtime-infra.test.ts` (9) — connectivity, canonical tables, FK web, evidence unique index, BullMQ job lifecycle, dedupe.
- `tests/core-17/e2e-learning-loop.test.ts` (11) — full learning loop end-to-end on real DB (below).
- `tests/core-17/security-tenant-concurrency.test.ts` (12) — isolation, RBAC, auth tokens, audio encryption, audit, recovery.

## 2. E2E learning loop — PROVEN on real PostgreSQL

Path executed through REAL code paths (no hand-built objects for the platform itself; engines/loop/decisions/intelligence all real, only UUID seed rows inserted):

Student → Activity → Response →
- Dictation Engine ×3 (`runDictationAttempt` → canonical writer) → evidence rows (accuracy 0.75, Grade 4 context)
- Numeracy Engine ×3 (`analyzeNumeracy` + `recordNumeracyEvidence`) → evidence rows (mathematics, Grade 5 context)
- Assessment Engine ×2 (`evaluateAssessment` + `recordAssessmentEvidence`) → assessment evidence
→ Evidence (single canonical `evidence` table) → Outbox events (`publishEvent` → `event_outbox`) → `processEventOutbox` → evidence-consumer → canonical Evidence (response + mistake rows)
→ Learner Model (`buildLearnerModel`): reading=weak, dictation=developing, mathematics=strong, insufficient dims — **multidimensional, no single level**
→ Learning Intelligence (`buildStudentPatterns`) over real cross-domain evidence → PERSISTENCE_PATTERN (references only)
→ Learning Loop: `stageDetect` → `createDiagnosis` → `proposeIntervention` (PENDING) → Teacher APPROVED (`applyTeacherDecision`) → Delivery Authorization → `assertDeliveryAuthorized` (correct student OK / wrong student BLOCKED) → Reassessment evidence → `recordReassessment` → `compareBeforeAfter` (improved, noOverallScore) → `recordOutcome` (IMPROVED) → `adaptNextAction` (continue-progression) → outcome Evidence + `InterventionOutcomeMeasured` event processed
→ Longitudinal continuity: Grade 4 + Grade 5 evidence coexist for the same student; model IMPROVING without reset.

## 3. Findings

### F-01 — REAL DEFECT (fixed): BullMQ rejects ioredis-level `keyPrefix` — `packages/queue` was broken at runtime
`packages/queue/src/client.ts` passed `keyPrefix` to the ioredis client; BullMQ v5 throws
`Error: BullMQ: ioredis does not support ioredis prefixes, use the prefix option instead.`
at `new Queue(...)` — i.e. `@workspace/queue` (and therefore `apps/worker`) could not even import in a real environment. Never surfaced before because worker unit tests mock the queue layer.
**Fix (minimal, no ownership/contract change):** namespace moved to BullMQ's own `prefix` option (`queuePrefix` exported from client, applied in `factories.ts` and the three canonical queues). Verified: real Redis enqueue → worker → completed; idempotent re-submission (same correlationId → same job id, count=1); failing job → observable `failed` state. TSC queue = 0.

### F-02 — R-006 CLOSED (config-only): reading-engine vitest aliases
`engines/reading-engine/vitest.config.ts` now resolves `@workspace/decisions`, `@workspace/learning-loop`, `@workspace/intelligence`, `@workspace/curriculum`, `@dictation-engine`, `@numeracy-engine`, `@assessment-engine`. Full own-config run: **330 passed | 34 skipped (364), exit 0** (was 3 files failing to load). No business logic touched. api/worker configs gained the same engine aliases (unified resolution model).

### F-03 — MIGRATIONS DRIFT (NOT fixed here — ARCHITECTURE DECISION REQUIRED)
Applying SQL migrations `001→007` in order on a clean database FAILS: `002` alters `refresh_tokens` (does not exist in `001`), and `003/005/006/007` reference a `tenants` table that no SQL migration creates. The canonical schema lives in the drizzle schema files (`packages/database/src/schema/*`), which `drizzle-kit push` applies correctly (26 tables, 66 FKs, `evidence_operation_key_uniq`). Per the CORE-17 rule ("no migration without approval"), I did NOT touch the migration chain. **Decision required:** declare drizzle schema push the canonical deployment path and regenerate/reconcile the SQL migration chain (or add the missing base migration) in a dedicated approved change.

### F-04 — Tenant transfer (recorded, not solved): cross-tenant school move needs an ownership/transfer model
Evidence rows are immutable and tenant-keyed (FK + reader filters); a student moving to a school in ANOTHER tenant must not mutate history. Consistent with `docs/ARCHITECTURE-QUESTIONS-CORE-09.md` — a Transfer/Link/Authorization model is an architecture decision, out of CORE-17 scope.

### F-05 — PERF baseline (first measurement, no optimization; real DB)
`evidence_query=1–2ms · learner_projection=1–2ms · intelligence_analysis=3–6ms · outbox_processing=0–1ms`. No bottlenecks at current scale; recorded for future comparison only.

## 4. One Table → One Owner (verified from `packages/database/src/evidence/ownership.ts` + schema)

| Data | Owner |
|---|---|
| reading measurements | reading-engine |
| evidence | core-platform (single canonical `evidence` table; all 4 engines write via `recordEvidence` ONLY) |
| student-learning-record / learner-model | core-platform (read-only projection over evidence) |
| assessment | assessment-engine |
| mastery / diagnosis / intervention | mastery-engine / learning-diagnosis / intervention-engine (keys reserved; loop is transitional core-platform owner) |
| event outbox | core-platform (`event_outbox` in the SAME database — no second store) |
| dictation / numeracy engine storage | NONE — zero persistence by design (CORE-14/15) |

No duplicate evidence stores, no second student history, no engine-local databases (scan: `no_second_store=0`).

## 5. Production status

Remaining OPEN (unchanged, evidence-based): production PostgreSQL hosting, managed Redis, production Outbox workers at scale, concurrency under load, recovery drills. What CORE-17 adds: these capabilities are now **verified against real local PostgreSQL 16 + Redis 7** — no longer "mock-only". Still NOT Production-Validated (no real managed environment).
