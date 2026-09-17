# PHASE-8 — PARENT-CAPABILITIES — CLOSEOUT (2026-09-16; delivery verification finalized 2026-09-17 UTC)

**Version adopted: BuyTuk Academy 1.12** · Status: **CLOSED / PASS** · Protocol: READ → TRACE → PLAN → IMPLEMENT → TEST → PROVE → CLOSE → ARCHIVE → DOWNLOAD → VERIFY (ADR-028 + D-12)

## READ (from the approved 1.11 reference — no memory)
- **D-7 barrier:** 1.11 archive SHA-256 re-computed from the real file = `7032c8ec608163bccac0e033e4cfe246f0ce68f4d00ad544e13f1b2bb97cc414` (**exact match**). The owner-facing 1.11 reference bundle re-materialized from its live download link: SHA-256 `e9da41ec518841769123f10f82396ae956df9594d4ba7a141c28afe8c3005c13` (**exact**), `unzip -t` OK, extracted repo HEAD = `94ade3ba3bf9ee14366015236fa95a01e1bc6f51` — **recoverability proven**. Live HEAD at phase open = `94ade3ba3bf9ee14366015236fa95a01e1bc6f51`, tree CLEAN; tag `BuyTuk.V0.1.3` unchanged (object `77e58b00e456dbad9b77df500d3eda54afca3902` → commit `41b0bba3501eb221d16f474299e44d39c709b104`).
- `MASTER_ROADMAP.md:39` (verbatim): `| PHASE-8 | PARENT-CAPABILITIES | A | Parent visibility follows once student + teacher loops are stable | PHASE-6 | parent access and visibility gates pass |`
- `STAGE_STATUS.md:21` (pre-phase): `PHASE-8 … NOT STARTED | Parent portal proof not verified | Depends on PHASE-6` — dependency **satisfied** (PHASE-6 CLOSED/PASS).
- `TRACEABILITY_MATRIX.md` PAR-001: «Parent portal» — PARTIAL (shell root verified; capabilities PHASE-8).
- V1 §5.1.4 «بوابة ولي الأمر»: متابعة تقدم الأبناء · تقارير دورية · تواصل مع المعلمين · إشعارات فورية.
- `PROJECT_VERSION.md` + `ADR-028`: «expected: PHASE-8 → BuyTuk Academy 1.12».
- Deviations: DEV-008 (parent portal, target PHASE-8); DEV-005/006/007 → PHASE-11; DEV-009 → PHASE-9; DEV-013 CLOSED (PHASE-6).
- **Conflict check (mandate §3):** Roadmap = Stage Status = Traceability = ADR-028 = Project Version — **no conflict** → no halt.

## TRACE (V1 → ADR → Roadmap → Traceability → requirement → code → gap → test → proof)
- **Existing/reusable:** the parent ROLE exists (`users.role` enum); PHASE-3 shell routes the parent root and DENIES parent JWTs on staff surfaces (P3-8/P7-3 → 403 — proven); the canonical learner-builder composition (`buildLearnerModel`/`buildStudentTimeline`/`listMasteryRecords`/`buildStudentPatterns`/`listStudentAttempts`/`buildLearningPathProposals`) proven in PHASE-6/7; `withTenant` + RLS mechanism (migration 0007); `audit_logs` channel; seed patterns (core-28/32).
- **Code-verified gap:** NO parent→child link exists anywhere in the schema (grep for parentstudent/guardian/link tables: zero matches) and `assertStudentDetailAccess` verifies STAFF memberships only → a parent could see NOTHING (PAR-001 PARTIAL; DEV-008 GAP). V1 §5.1.4 therefore needs the link backbone + read-only visibility surfaces — NOT a rebuild of any proven capability.
- **Integration:** parent root/children/progress/reports render REAL data; communication stays a placeholder (PHASE-11 per DEV-006).

## PLAN (A–E) — executed within scope
- **A Reuse:** learner-builder composition (the exact PHASE-6/7 proven set), withTenant+RLS, audit_logs, portal shell machinery, seed/test patterns, matrix runners.
- **B Integrate:** parent portal root/children/progress/reports wired to REAL linked-children data; explicit PHASE-11 placeholder for communication.
- **C Complete:** the visibility backbone — migration 0008 `parent_student_links` (additive, RLS, idempotent operation_key) + canonical capability (`listParentChildren`/`assertParentStudentAccess` — withTenant, gate semantics mirroring the staff gate, audited) + thin adapters `GET /v1/parents/children(/:studentId/dashboard)` + openapi documentation + capability-phase map alignment.
- **D New:** one new E2E gate `tests/core-32/p8-parent-capabilities.e2e.test.ts` + **ADR-031** (link-table gate + canonical builder reuse; rejected alternatives documented: extending the staff gate, PARENT staff-scope, no-link access).
- **E Deferred (governance-recorded, untouched):** communication/notifications (DEV-006) → PHASE-11; wallet/points/badges (DEV-005) → PHASE-11; link-management UX/APIs (rows administrative in this phase); principal/admin → PHASE-9 (DEV-009); authoring/engines → PHASE-10. No NestJS (ADR-029). No new frameworks/dependencies.

## IMPLEMENT (actual changes — phase commit `eb91b8f5f3b1306758055aa41357f4982854c58a`)
1. `packages/database/migrations/0008_phase8_parent_links.sql` — NEW additive migration: table + 2 indexes + RLS ENABLE + policy `tenant_isolation_parent_student_links` (USING/WITH CHECK on `app.tenant_id`) + idempotency UNIQUE. Applied to core32_verify (verified in-DB: policy count = 1).
2. `packages/database/src/schema/parents.ts` — NEW drizzle table (exported via `schema/index.ts`).
3. `packages/database/src/parents/visibility.ts` — NEW canonical capability: `assertParentStudentAccess` (in-tenant existence → link check → 404 `STUDENT_NOT_FOUND_IN_TENANT` / 403 `PARENT_ACCESS_DENIED` + audit row) + `listParentChildren` (read-only projection) — both inside `withTenant` (RLS-enforced, fail-closed); exported via `packages/database/src/index.ts`.
4. `apps/api/src/v1/parents.ts` — NEW THIN adapter router (2 endpoints, `authorize("parent")`, the EXACT proven dashboard composition; NO SQL/business rules) — mounted additively in `v1/index.ts`.
5. `lib/api-spec/openapi.yaml` — the 2 new /v1 paths documented (additive; canonical v1.yaml 25 paths untouched per PHASE-4).
6. `apps/api/src/public/app.js` — parent capability-phase map (children/progress/reports → real; communication → PHASE-11) + `renderParentDashboard()` (REAL children list) + `renderChildReport()` (REAL child report; 401-refresh-retry; 403/404 real-error rendering; zero mock data).
7. `tests/core-32/p8-parent-capabilities.e2e.test.ts` — NEW phase gate (real browser + real API + real PG/Redis; seeds canonical rows incl. the parent link).
8. `tests/core-32/p3-role-shell.e2e.test.ts` + `p7-…` — EVOLVED for the approved parent-root evolution (P3-3 now expects the REAL parent root; P3-8/P7-3 wait on the real root) — alignment with the newly-proven behavior, NOT red-to-green hiding (the P8 gate independently proves it; P7-3 still proves parent DENIAL on the TEACHER surface).
9. Governance: STAGE_STATUS (PHASE-8 CLOSED/PASS), TRACEABILITY (PAR-001 VERIFIED), CHANGE_DEVIATION_RECORD (DEV-008 CLOSED, history preserved), ADR-031.
**Zero destructive changes. Zero new dependencies. Zero alterations to existing tables. No V1/_history/tag/archive modifications.**

## TEST (actual exit codes — `/home/user/phase8_logs/exit_codes.txt`, sequential matrix)
| Check | Exit | Evidence |
|---|---|---|
| root-typecheck / tsc-composite-build / root-build | 0 / 0 / 0 | logs |
| tsc --noEmit: api / worker / reading-engine / config / security / observability / queue / artifacts | 0 ×8 | logs |
| packages/database | 0 — **55/55** | test-db.log |
| packages/observability | 0 — 6/6 | test-obs.log |
| apps/worker | 0 — 1/1 | test-worker.log |
| apps/api (incl. gateway-contract — openapi alignment holds with the 2 new documented paths) | 0 — 8/8 | test-api.log |
| engines/reading-engine | 0 — 24/24 | test-engine.log |
| E2E p1-student-ui (real browser) | 0 — 5/5 (incl. P1-5 full loop, P1-2 real-4xx) | e2e log |
| E2E p2-voice | 0 — 1/1 | e2e log |
| E2E p3-role-shell (evolved) | 0 — 8/8 | e2e log |
| E2E p7-teacher-capabilities (evolved P7-3) | 0 — 5/5 | e2e log |
| **E2E p8-parent-capabilities (NEW phase gate)** | **0 — 5/5** | P8-1 linked-only list; P8-2 real child report; P8-3 unlinked parent 403/404; P8-4 cross-tenant 403/404 no-leak; P8-5 401 + teacher-JWT 403 + PHASE-11 placeholder |
| **Remediation gate: core-28 E1 full cycle (re-proven, NOT rebuilt)** | **0 — 11/11** | real PG (core28_verify) + real Redis + real HTTP |
| secret-diff / secret-newfiles | 1 / 1 (= zero hits) | empty hit files |
| `git diff --check` | 0 | |

**Total green: 129 test cases across 11 suites + 11 type/build probes — all exit 0. Zero skipped in mandatory gates. Classification: NO new regressions; no historical failures observed.**

## PROVE
- **P8 gate (real browser + real API + real PG/Redis):** parent A lists ONLY the linked child (real link row — «الأبناء المرتبطون» with the REAL name); the child report opens with REAL counts (no «غير مدعومة بعد», no error); parent B (same tenant, UNLINKED) → 403/404; cross-tenant student → 403/404 with the body NOT containing tenant-B data; unauthenticated → 401; teacher JWT → 403 on the parent surface; communication → «غير مدعومة بعد» + PHASE-11.
- **Security:** RLS policy active on the new table (DB-verified); `withTenant` everywhere (fail-closed); audit rows on access; secret scan 0; no secrets in tree.
- **Regression:** the full 1.11 baseline green (p1/p2/p3/p7 + db/obs/worker/api/engine + E1).

## CLOSE
- **Phase commit:** `eb91b8f5f3b1306758055aa41357f4982854c58a` (16 files; tree CLEAN after).
- **Close commit:** recorded in Git HEAD (registry + this report).
- Tag `BuyTuk.V0.1.3` unchanged; **no push** (REMOTE = BLOCKED / PENDING ACCESS); no reset/rebase/squash/force-push anywhere.

## ARCHIVE — BuyTuk Academy 1.12 (per ADR-028 + D-12)
- Filename: `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-8-2026-09-16.tar.gz`
- **SHA-256: `b46db8e8f6a175f21a84d442f04cb28f39a170cc4025dd4336dffb21e4b317d8`** · Size: **453,830,248 bytes**
- `tar -tzf` **exit 0** · **4,099 entries** (repo `.git/` = 494 entries at the phase-commit state `eb91b8f…`; `_history/` = 2,760 entries preserved verbatim from the 1.11 reference; node_modules = 0; dist = 0; real `.env` absent; `.env.example` present)
- **In-archive gates (extracted + verified):** p8 test present; `0008_phase8_parent_links.sql` present; ADR-031 present; `PHASE-8 | PARENT-CAPABILITIES | CLOSED / PASS` row present; PHASE-6 + PHASE-7 closeouts present; V1 hash `50fd2e8638103a5dc20f6ae42a6c6fb1fc357aabc84c0e0f643f297969e8a144` unchanged. (The copy of this report inside the archive was captured at the phase commit — the 1.10/1.11 precedent; the close commit carries the registry + this report.)
- 1.11 archive untouched (`7032c8ec…` re-verified pre-phase).

## DOWNLOAD (D-12) — verified parts channel
Platform limitation (proven in 1.10/1.11, re-proven here): single-file serving truncates large files; large batch uploads occasionally store truncated (repaired by individual re-upload rounds with unique names). Canonical delivery = **29 parts (≤15 MiB) + `parts.sha256`**: every part downloaded from its live link + per-part SHA matched + reassembly = **exact official size (453,830,248 B) + exact official SHA-256 (`b46db8e8…`)** + `cmp` **byte-identical** + `tar -tzf` exit 0 (local proof completed before upload; the post-upload round-trip verification registered in MANIFEST/SIDECAR).
- Reassembly: `cat buytuk-academy-1.12.tar.gz.part-00 … part-28 > buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-8-2026-09-16.tar.gz`, then `sha256sum` must print `b46db8e8f6a175f21a84d442f04cb28f39a170cc4025dd4336dffb21e4b317d8`.

## VERSION
**BuyTuk Academy 1.12 = official** (adopted at this closeout per D-4/D-5/D-12). 1.11 preserved as history (D-9). **PHASE-9 NOT STARTED — STOP, awaiting `START NEXT PHASE`.**
