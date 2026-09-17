# PHASE-7 — TEACHER-CAPABILITIES — CLOSEOUT (2026-09-16; delivery verification finalized 2026-09-17 UTC)

**Version adopted: BuyTuk Academy 1.11** · Status: **CLOSED / PASS** · Protocol: READ → TRACE → PLAN → IMPLEMENT → TEST → PROVE → CLOSE → ARCHIVE → DOWNLOAD → VERIFY (ADR-028 + D-12)

## READ (from the approved 1.10 reference — no memory)
- **D-7 barrier:** reference archive `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-6-2026-09-16.tar.gz` SHA-256 re-computed from the real file = `104b69cb09d75bfe672d1e7f196fdefb2ee1a7f01dd985c73d4c89b2433687dd` (**exact match**); live HEAD at phase open = `3222dd7342f74bfaf5481f999f13c961e2984f46`, tree CLEAN; lineage commits (`812539e`, `abe5a17`, `3222dd7`) present in `.git`; tag `BuyTuk.V0.1.3` unchanged (object `77e58b00e456dbad9b77df500d3eda54afca3902` → commit `41b0bba3501eb221d16f474299e44d39c709b104`).
- `MASTER_ROADMAP.md:38` (verbatim): `| PHASE-7 | TEACHER-CAPABILITIES | A | Teachers operationalize the platform's intervention loop | PHASE-6 | teacher review/report/remediation gates pass |`
- `STAGE_STATUS.md:20` (pre-phase): `PHASE-7 … NOT STARTED | Teacher API surfaces exist; stage not opened | Depends on PHASE-6` — dependency **satisfied** (PHASE-6 CLOSED/PASS).
- `TRACEABILITY_MATRIX.md` TCH-001: «Teacher portal capabilities including review queue and reports» — PARTIAL; «full capability gate → PHASE-7».
- V1 §5.1.3 «بوابة المعلم»: إدارة الفصول والطلاب · إنشاء دروس وتمارين · تقييم أداء الطلاب · تقارير تحليلية · جدول الحصص · تسجيل الحضور.
- `PROJECT_VERSION.md` + `ADR-028`: «expected: PHASE-7 → BuyTuk Academy 1.11».
- Deviations: DEV-005/006/007 → PHASE-11; DEV-008 → PHASE-8; DEV-009 → PHASE-9; DEV-011 deferred; DEV-013 CLOSED (PHASE-6).
- **Conflict check (mandate §3):** Roadmap = Stage Status = Traceability = ADR-028 = Project Version — **no conflict** → no halt; owner command authorized IMPLEMENT after PLAN.

## TRACE (V1 → ADR → Roadmap → Traceability → requirement → code → gap → test → proof)
- **review:** `GET /v1/teacher/review-queue` (`apps/api/src/v1/teacher.ts:77` — `authenticate` + `authorize("teacher","principal","admin")` + `assertStudentDetailAccess`) — E1-proven (core-28).
- **remediation:** `POST /v1/interventions/:proposalId/decision|feedback|delivery` (teacher.ts:109/181/214) — full canonical loop proven by `tests/core-28/e1-full-cycle-e2e.test.ts` (decision APPROVED → V-3 resume, feedback, delivery, RBAC 403, idempotency 200, FINAL 409, cross-tenant 404).
- **report:** canonical staff-authorized surface `GET /v1/students/:studentId/dashboard` (`resolveStudent` + `assertStudentDetailAccess` — staff CLASS scope authorized; PHASE-2 boundaries) — **exists, reused** (zero new endpoints).
- **Code-verified gap:** the teacher staff dashboard rendered only the pending COUNT (`app.js:469`) — no real queue list, no report view; teacher capability-phase map misaligned with later-phase governance.
- **Reuse inventory:** learning-loop tables (`learning_diagnoses`, `intervention_proposals` — exported via `packages/database/src/schema/index.ts:19`), `@workspace/security` `hashPassword`, `staffMembershipsTable` + membership start (core-28 seed pattern), PHASE-3 portal shell machinery (`renderPortalNav`/`openPortalCapability`/`renderStaffDashboard`), proven test runners/invocation patterns.

## PLAN (A–E) — executed within scope
- **A Reuse:** E1 remediation loop (NOT rebuilt — owner mandate), `assertStudentDetailAccess`, review-queue + report surfaces, PHASE-3 shell, seed patterns, matrix runners.
- **B Integrate:** teacher staff dashboard renders the REAL pending proposal list + opens the REAL student report from the queue (teacher JWT → staff-authorized dashboard surface).
- **C Complete:** teacher capability-phase alignment in `app.js` (students/reports → PHASE-7 real; passages/lessons/exercises/voice-qa/ratings/analytics → PHASE-10; attendance/schedule → PHASE-11; classes/settings → PHASE-9) — honest placeholders for everything outside this phase's AC.
- **D New:** one new test only — `tests/core-32/p7-teacher-capabilities.e2e.test.ts` (the phase gate).
- **E Deferred (governance-recorded, untouched):** wallet/points/badges (DEV-005), messages (DEV-006), attendance/schedule (DEV-007) → PHASE-11; lesson/exercise authoring + engines → PHASE-10; parent → PHASE-8; principal/admin → PHASE-9; advanced analytics (DEV-011). No NestJS (ADR-029: Express 5 canonical). No new frameworks/dependencies.

## IMPLEMENT (actual changes — phase commit `ac00b9baa7f508ceaaffc2a86b47b6ff63bc63ba`, 4 files, +321/−5)
1. `apps/api/src/public/app.js` — (a) teacher capability-phase map aligned; (b) `openPortalCapability` routes teacher students/reports to the real view; (c) `renderStaffDashboard` renders the REAL pending-proposal list from `/v1/teacher/review-queue` (skill, activityType, status, studentId, createdAt) with per-student «عرض تقرير الطالب» buttons; (d) new `renderTeacherReports()` + `renderTeacherReport(studentId)` — REAL report via `GET /v1/students/:id/dashboard` (evidence/strengths/weaknesses/gaps counts, mastery records, recommendations, next activity), 401-refresh-retry, 403/404 real-error rendering, zero mock data, back-to-queue navigation.
2. `tests/core-32/p7-teacher-capabilities.e2e.test.ts` — NEW phase gate (real Playwright Chromium + real Express app serving /v1 AND /ui + real core32_verify PostgreSQL + real Redis; seeds: tenants/schools/classes/users/membership/student + one real diagnosis + one PENDING proposal in the canonical learning-loop tables).
3. `docs/buytuk-master/STAGE_STATUS.md` — PHASE-7 → CLOSED / PASS (full evidence row).
4. `docs/buytuk-master/TRACEABILITY_MATRIX.md` — TCH-001 → VERIFIED.
**Zero production API changes. Zero new endpoints. Zero new dependencies. Zero schema/migration changes. No V1/_history/tag/archive modifications.**

## TEST (actual exit codes — `/home/user/phase7_logs/exit_codes.txt`, sequential matrix)
| Check | Exit | Evidence |
|---|---|---|
| root-typecheck / tsc-composite-build / root-build | 0 / 0 / 0 | logs |
| tsc --noEmit: api / worker / reading-engine / config / security / observability / queue / artifacts-api-server | 0 ×8 | logs |
| packages/database | 0 — 55/55 | test-db.log |
| packages/observability | 0 — 6/6 | test-obs.log |
| apps/worker | 0 — 1/1 | test-worker.log |
| apps/api (incl. gateway-contract) | 0 — 8/8 | test-api.log |
| engines/reading-engine | 0 — 24/24 | test-engine.log |
| E2E p1-student-ui (real browser) | 0 — 5/5 (incl. P1-5 full loop, P1-2 real-4xx) | e2e log |
| E2E p2-voice | 0 — 1/1 | e2e log |
| E2E p3-role-shell | 0 — 8/8 | e2e log |
| **E2E p7-teacher-capabilities (NEW phase gate)** | **0 — 5/5** | P7-1 review+report from the REAL queue; P7-2 report 200 (teacher JWT, CLASS scope); P7-3 parent denied 403/404; P7-4 cross-tenant 403/404 no-leak; P7-5 placeholders keep roadmap phases |
| **Remediation gate: core-28 E1 full cycle (re-proven, NOT rebuilt)** | **0 — 11/11** | real PG (core28_verify: 35 tables, real seeded rows) + real Redis + real HTTP |
| secret-diff / secret-newfiles | 1 / 1 (= zero hits) | empty hit files |
| `git diff --check` | 0 | |

**Total green: 124 test cases across 10 suites + 11 type/build probes — all exit 0. Zero skipped in mandatory gates.**
Honest notes: `core28-push:1` = the runner passed `--force`, unsupported by this drizzle-kit version — non-blocking (schema pre-existing: 35 tables, real rows). Per-file E2E invocation used (proven PHASE-6 pattern) to avoid runner-timeout artifacts.

## PROVE
- **P7 gate:** the seeded PENDING proposal (skill «ضرب») rendered in the teacher dashboard from the REAL API response; the report opened from the queue shows REAL counts (no «غير مدعومة بعد», no error text); parent JWT → 403/404 (real backend boundary, not UI hiding); cross-tenant student → 403/404 with the body NOT containing tenant-B data; attendance placeholder → «غير مدعومة بعد» + PHASE-11; passages placeholder → PHASE-10.
- **Remediation:** E1 11/11 re-proven on real infrastructure (decision/feedback/delivery/state-machine/idempotency/RBAC/tenant-isolation).
- **Security:** secret scan 0 hits; RBAC + tenant isolation proven in-suite; PHASE-2 boundaries untouched.
- **Regression:** p1 5/5, p2 1/1, p3 8/8 (all PHASE-3/6 proofs intact) + db/obs/worker/api/engine green. **No NEW regressions; no HISTORICAL failures observed.**

## CLOSE
- **Phase commit:** `ac00b9baa7f508ceaaffc2a86b47b6ff63bc63ba` (4 files, +321/−5; tree CLEAN after).
- **Close commit** (registry + this report): recorded in Git HEAD (see final state below).
- Tag `BuyTuk.V0.1.3` unchanged; **no push** (REMOTE = BLOCKED / PENDING ACCESS); no reset/rebase/squash/force-push anywhere.

## ARCHIVE — BuyTuk Academy 1.11 (per ADR-028 + D-12)
- Filename: `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-7-2026-09-16.tar.gz`
- **SHA-256: `7032c8ec608163bccac0e033e4cfe246f0ce68f4d00ad544e13f1b2bb97cc414`** · Size: **453,729,458 bytes**
- `tar -tzf` **exit 0** · **4,020 entries** (repo `.git/` = 426 entries, captured at the phase-commit state `ac00b9b…`; `_history/` = 2,760 entries preserved verbatim from the 1.10 reference; node_modules = 0; dist = 0; real `.env` absent; `.env.example` present)
- **In-archive gates (extracted + verified):** the p7 test present; `PHASE-7 | TEACHER-CAPABILITIES | CLOSED / PASS` row present; PHASE-5 + PHASE-6 closeouts present; ADR-028 present; V1 hash `50fd2e8638103a5dc20f6ae42a6c6fb1fc357aabc84c0e0f643f297969e8a144` unchanged.
- First build attempt was REJECTED by in-archive gates (stale staging copy — sandbox snapshot rollback) and rebuilt from scratch with strict presence gates; 1.10 archive untouched (`104b69cb…` re-verified pre-phase).

## DOWNLOAD (D-12) — verified parts channel
Platform limitation (proven in 1.10 and re-proven here): **single-file serving truncates large files** on this platform, and large batch uploads occasionally store truncated (repaired by individual re-upload rounds with unique names). Canonical delivery = **29 parts (≤15 MiB) + `parts.sha256`**, proven end-to-end on 2026-09-17 UTC:
- Every part downloaded from its live link and SHA-256-matched against `parts.sha256` (10 parts repaired across re-upload rounds until their checksums matched; part-05 persistently truncated as a single file → delivered as two 7.5 MiB halves whose union equals the official part-05 SHA `e75e99db…`).
- Reassembly from the verified parts = **exact official size (453,729,458 B) + exact official SHA-256 (`7032c8ec…`)** + `tar -tzf` exit 0 + `cmp` **byte-for-byte IDENTICAL** to the official archive file.
- **Canonical part links** (verified-full-serving; full table in MANIFEST/SIDECAR):

| Part | Link | Part | Link | Part | Link |
|---|---|---|---|---|---|
| 00 | https://www.genspark.ai/api/files/s/xiQsrvQZ | 10 | https://www.genspark.ai/api/files/s/XQNFzatn | 20 | https://www.genspark.ai/api/files/s/qMiLT2ZL |
| 01 | https://www.genspark.ai/api/files/s/MdJcILb7 | 11 | https://www.genspark.ai/api/files/s/poI2fh3C | 21 | https://www.genspark.ai/api/files/s/Qg8pfw3k |
| 02 | https://www.genspark.ai/api/files/s/0JW5qVyY | 12 | https://www.genspark.ai/api/files/s/zdabpACI | 22 | https://www.genspark.ai/api/files/s/p7gHNJiE |
| 03 | https://www.genspark.ai/api/files/s/IN1qM4V2 | 13 | https://www.genspark.ai/api/files/s/SSDjgnvY | 23 | https://www.genspark.ai/api/files/s/a1GAWpO9 |
| 04 | https://www.genspark.ai/api/files/s/ehB4IH8M | 14 | https://www.genspark.ai/api/files/s/af4AJLYL | 24 | https://www.genspark.ai/api/files/s/hfXyuG21 |
| 05 | h1: https://www.genspark.ai/api/files/s/BD72yfPj + h2: https://www.genspark.ai/api/files/s/xfeHYLqK | 15 | https://www.genspark.ai/api/files/s/DWK9nHby | 25 | https://www.genspark.ai/api/files/s/KZJINFt1 |
| 06 | https://www.genspark.ai/api/files/s/cNk7UcSc | 16 | https://www.genspark.ai/api/files/s/YpW4Ayws | 26 | https://www.genspark.ai/api/files/s/m9eZmPyY |
| 07 | https://www.genspark.ai/api/files/s/pQhJKu8W | 17 | https://www.genspark.ai/api/files/s/kYrGoOxD | 27 | https://www.genspark.ai/api/files/s/mDHkX3eC |
| 08 | https://www.genspark.ai/api/files/s/KSwiOSZU | 18 | https://www.genspark.ai/api/files/s/da28REFy | 28 | https://www.genspark.ai/api/files/s/Q6Sk6cUS |
| 09 | https://www.genspark.ai/api/files/s/GSuN2dAy | 19 | https://www.genspark.ai/api/files/s/iKGwGUMF | checksums | https://www.genspark.ai/api/files/s/80ZyFdS6 |

- Reassembly: `cat buytuk-academy-1.11.tar.gz.part-00 … part-28 > buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-7-2026-09-16.tar.gz` (part-05 = `cat part05.h1 part05.h2`), then `sha256sum` must print `7032c8ec608163bccac0e033e4cfe246f0ce68f4d00ad544e13f1b2bb97cc414`.

## VERSION
**BuyTuk Academy 1.11 = official** (adopted at this closeout per D-4/D-5/D-12). 1.10 preserved as history (D-9). **PHASE-8 NOT STARTED — STOP, awaiting `START NEXT PHASE`.**
