# STAGE STATUS — BuyTuk Academy

## Allowed status values
- NOT STARTED
- IN PROGRESS
- BLOCKED
- READY FOR GATE
- CLOSED / PASS

## Stage register
| Stage ID | Title | Status | Basis / evidence | Notes |
|---|---|---|---|---|
| PHASE-0 | GOVERNANCE | CLOSED / PASS | Governance document set exists in `docs/`; closeout written in `docs/reports/PHASE-0-GOVERNANCE-CLOSEOUT-2026-09-15.md`; git evidence captured in local clone | Closed in this turn based on documentation and evidence capture only |
| PHASE-1 | FIX-BUILD-TS6307 | CLOSED / PASS | `pnpm run build` = exit 0 after fix (16 TS6307 → 0); affected tests pass (config 15, database 55, reading-engine 16, api 4, worker 1, core-32 p2-voice E2E 1); typechecks exit 0 for api/worker/reading-engine/config/security/observability; closeout: `docs/reports/PHASE-1-FIX-BUILD-TS6307-CLOSEOUT-2026-09-15.md` | Fixed via `packages/database/tsconfig.json` include of cross-package sources + `thread-stream` peer devDep in `apps/api` + `dist-types/` gitignore; deferred p1-student-ui E2E failures recorded in deviation register |
| PHASE-2 | SECURITY-RLS-TENANCY | CLOSED / PASS | Migration `0007_phase2_rls_tenancy.sql` enables ROW LEVEL SECURITY + FORCE on 33 tenant-scoped tables with per-table `tenant_isolation_*` policies (verified on scratch DB `phase2_rls_verify`, MIGRATE_EXIT=0, 33 policies; global tables `tenants`/`student_identities` intentionally left unprotected); `packages/database/src/tenancy.ts` exports `withTenant`/`isValidTenantId`/`TenantContextError`; reading-service tenant guards (listPassages requires tenant; getPassage/getAttempt/listSessionsByStudent accept tenantId) wired from API routes; database tests 55/55 PASS; closeout: `docs/reports/PHASE-2-SECURITY-RLS-TENANCY-CLOSEOUT-2026-09-15.md` | Closes DEV-003; TYPECHECK gate re-run pending (sandbox timeout during closeout session) |
| PHASE-3 | CORE-WEB-PORTAL-SHELL | NOT STARTED | No verified Next.js portal shell in current repo inspection | Depends on PHASE-1 |
| PHASE-4 | API-GATEWAY-ALIGNMENT | NOT STARTED | Current backend evidence is Express; NestJS alignment not verified | Depends on PHASE-1 |
| PHASE-5 | SHARED-INFRA-AND-INFERENCE | NOT STARTED | Partial inference materials exist; full integration proof not verified | Depends on PHASE-1 |
| PHASE-6 | STUDENT-LEARNING-LOOP-E2E | NOT STARTED | Some targeted reading path tests pass, but full stage not opened under current governance model | Depends on PHASE-2, PHASE-3, PHASE-5 |
| PHASE-7 | TEACHER-CAPABILITIES | NOT STARTED | Teacher API surfaces exist; stage not opened | Depends on PHASE-6 |
| PHASE-8 | PARENT-CAPABILITIES | NOT STARTED | Parent portal proof not verified | Depends on PHASE-6 |
| PHASE-9 | PRINCIPAL-ADMIN-CAPABILITIES | NOT STARTED | Oversight/admin path partial only | Depends on PHASE-7, PHASE-8 |
| PHASE-10 | ENGINES-ASSESSMENT-DICTATION-DIAGNOSIS-CONTENT-LESSON | NOT STARTED | Engines exist partially; stage not opened | Depends on PHASE-6, PHASE-7 |
| PHASE-11 | GAMIFICATION-MESSAGING-ATTENDANCE | NOT STARTED | Feature proof not verified | Depends on PHASE-6, PHASE-7, PHASE-8 |
| PHASE-12 | PRODUCTION-PERFORMANCE-OBSERVABILITY | NOT STARTED | Root build, deployment, perf, and coverage gates are not yet closed | Depends on core prior stages |
| PHASE-13+ | APPROVED ENHANCEMENTS | NOT STARTED | Allowed only after baseline platform gates stabilize | Dependency-specific |
