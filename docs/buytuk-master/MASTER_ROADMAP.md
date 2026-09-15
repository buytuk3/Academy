# MASTER ROADMAP — BuyTuk Academy Execution Roadmap

## Governance note
This file is the dependency-ordered execution roadmap for the current unified project.
It supersedes ad-hoc sequencing and must be read with:
- `docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`
- `docs/reference/MANDATORY_EXECUTION_PROTOCOL.md`
- `docs/buytuk-master/TRACEABILITY_MATRIX.md`
- `docs/buytuk-master/STAGE_STATUS.md`

## Ordering principle
Execution order follows dependency risk, not document section numbering.
Priority order:
1. Build / runtime blockers
2. Security / tenant isolation
3. Core architecture
4. Shared infrastructure
5. Student learning loop
6. Teacher capabilities
7. Parent capabilities
8. Principal / admin capabilities
9. Assessment / dictation / diagnosis / content / lesson
10. Gamification / messaging / attendance
11. Production / performance / observability
12. Approved enhancements

## Stage roadmap
| Stage ID | Title | Category | Why now | Dependencies | Exit gate |
|---|---|---|---|---|---|
| PHASE-0 | GOVERNANCE | B | Establish in-repo baseline, protocol, traceability, roadmap, status, deviation record, and closeout discipline | None | Governance docs complete + closeout written + git evidence captured |
| PHASE-1 | FIX-BUILD-TS6307 | B/C | Root build failure blocks trustworthy execution and release proof | PHASE-0 | `pnpm run build` = exit 0 on clean repo |
| PHASE-2 | SECURITY-RLS-TENANCY | A/C | Tenant isolation is a hard safety boundary and must move to DB-level proof | PHASE-1 | RLS migrations + cross-tenant tests pass |
| PHASE-3 | CORE-WEB-PORTAL-SHELL | A/B | Portals cannot be proven without a real frontend shell | PHASE-1 | role-aware web shell works for all portal roots |
| PHASE-4 | API-GATEWAY-ALIGNMENT | A/B | Align runtime architecture with documented gateway direction without breaking working domains | PHASE-1 | chosen gateway architecture documented + contract tests green |
| PHASE-5 | SHARED-INFRA-AND-INFERENCE | B/C | Shared infra and inference gateway proof are needed before broad portal and engine rollout | PHASE-1 | gateway smoke / observability / storage contracts green |
| PHASE-6 | STUDENT-LEARNING-LOOP-E2E | A | Student learning journey is the first educational end-to-end value path | PHASE-2, PHASE-3, PHASE-5 | student flow passes end-to-end with evidence |
| PHASE-7 | TEACHER-CAPABILITIES | A | Teachers operationalize the platform’s intervention loop | PHASE-6 | teacher review/report/remediation gates pass |
| PHASE-8 | PARENT-CAPABILITIES | A | Parent visibility follows once student + teacher loops are stable | PHASE-6 | parent access and visibility gates pass |
| PHASE-9 | PRINCIPAL-ADMIN-CAPABILITIES | A | Oversight depends on lower-level flows producing reliable data | PHASE-7, PHASE-8 | oversight/admin gates pass |
| PHASE-10 | ENGINES-ASSESSMENT-DICTATION-DIAGNOSIS-CONTENT-LESSON | A | Engines must be surfaced as product capabilities, not code islands | PHASE-6, PHASE-7 | per-engine functional gates pass |
| PHASE-11 | GAMIFICATION-MESSAGING-ATTENDANCE | A/D | Engagement and coordination layers sit on top of core learning flows | PHASE-6, PHASE-7, PHASE-8 | feature gates pass |
| PHASE-12 | PRODUCTION-PERFORMANCE-OBSERVABILITY | C | Production claims require deployment, load, security, and monitoring proof | PHASE-1 through PHASE-11 core paths | perf/security/deploy gates pass |
| PHASE-13+ | APPROVED ENHANCEMENTS | D | Only after baseline platform proof is stable | Relevant closed stages | enhancement-specific gates |

## Current next-stage proposal
The next proposed execution stage after PHASE-0 is:
- `PHASE-1 — FIX-BUILD-TS6307`

Reason:
- root build is currently failing in verified evidence,
- it blocks trustworthy full-repo proof,
- and it is the top item in the dependency order.
