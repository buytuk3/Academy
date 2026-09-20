# MASTER ROADMAP — BuyTuk Academy Execution Roadmap

## Governance note
This file is the dependency-ordered execution roadmap for the current unified project.
It supersedes ad-hoc sequencing and must be read with:
- `docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`
- `docs/reference/MANDATORY_EXECUTION_PROTOCOL.md`
- `docs/buytuk-master/TRACEABILITY_MATRIX.md`
- `docs/buytuk-master/STAGE_STATUS.md`
- `docs/decisions/ADR-028-REFERENCE-ARCHIVE-AND-VERSION-GOVERNANCE.md` (Complete Project Reference & sequential version governance — every closed phase requires a verified full reference archive; BuyTuk Academy 1.7 is the current Last Known Good; binding from the next phase closeout)

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

## BINDING ROADMAP — governing doc v2.1 (management decision 2026-09-18 — supersedes the morning PHASE-13..18 map; renumbering recorded as DEV-015 in CDR)

Governing rules per phase (unchanged): build ONLY on the last closed byte-verified reference; reuse-first with an ADR for any deviation; a new REAL E2E gate per phase; zero regressions (official matrix + E1 + E4 + secret scans + diff-check); full documentation (STAGE_STATUS/CDR/PROJECT_VERSION + closeout); verified single-file reference (D-3/D-12) BEFORE any link; explicit management approval gates every next phase.

| Phase | Name | Status / dependencies |
|---|---|---|
| PHASE-14 | PRODUCTION-DEPLOYMENT-CLOSURE (DEPL-2 + COV-1) | CLOSED / PASS — reference 1.17 @ `9425131` |
| PHASE-15 | SCHOOL-ONBOARDING-AND-TEACHER-ASSIGNMENT (§3.1+§3.2) | CLOSED / PASS — reference 1.18 (this phase; highest commercial priority block with 16-17) |
| PHASE-16 | INTERACTION-EVENT-LOG (§3.3) | CLOSED / PASS — reference 1.19 (interaction_events migration 0011 per ADR-037; fire-and-forget hooks; RLS fail-closed; real-timestamp proof) |
| PHASE-17 | PROVISIONAL-ADVANCE-MASTERY-MODEL (§3.4) | CLOSED / PASS — reference 1.20 (migration 0012 per ADR-038; atomic DB-level advance; debt carried; RLS fail-closed; interaction_events as the only attempts source) |
| PHASE-18 | SPACED-REVIEW-ENGINE (§3.5) | CLOSED / PASS — reference 1.21 (migration 0013 per ADR-039; fixed ladder 1/3/7/14/30; derivation ONLY from real §3.4 stage attempts; RLS fail-closed; ZERO new deps) |
| PHASE-19 | CROSS-STAGE-ESCALATION-ENGINE (§3.6) | CLOSED / PASS — reference 1.22 (migration 0014 per ADR-040; trigger ONLY from real §3.4 data; atomic ack; RLS fail-closed; ZERO new deps) |
| PHASE-20 | GRAMMAR-PARSING-ENGINE / الإعراب (§3.7) | CLOSED / PASS — reference 1.23 (migration 0015 per ADR-041; REAL deterministic rules engine, pure TS, ZERO new deps; NEEDS_REVIEW no-guessing; RLS fail-closed) |
| PHASE-21 | EXAM-BEHAVIORAL-ANALYTICS (§3.9) | CLOSED / PASS — reference 1.24 (migration 0016 per ADR-042; ALL metrics derived ONLY from the real interaction_events stream + canonical evidence chain; dashboard on existing RLS reads; ZERO new deps) |
| PHASE-22 | VIDEO-LESSON-CONTENT (§3.8) | CLOSED / PASS — reference 1.25 (migration 0017 per ADR-043; existing content registry + loose storage pointer; atomic CAS publish; students read READY only; RLS fail-closed; ZERO new deps) |
| PHASE-23 | STUDENT-ENGAGEMENT-EXTRAS (renumbered) | after PHASE-14 approval |
| PHASE-24 | NOTIFICATIONS | after PHASE-14 approval |
| PHASE-25 | EXAMS-MODULE | after PHASE-14 approval |
| PHASE-26 | CI/CD-AND-LOAD-TESTING | after PHASE-14 approval |
| PHASE-13 | AI-RUNTIME-PROOF (DEP-001) | **MOVED TO LAST (management ruling 2026-09-19)** — executes AFTER PHASE-26 closes; one consolidated GPU budget (approved $3–5) for a single final comprehensive proof on RunPod; never closes without real audio evidence (DEV-014 continues to apply until then) |
Final sequencing ruling (management decision 2026-09-19, binding): PHASE-13 (AI-RUNTIME-PROOF) is moved to the END of the roadmap — it runs after PHASE-26 closes, not in parallel; every phase that does not need a GPU completes first, then the limited GPU budget is spent on ONE final consolidated proof (RunPod, approved initial budget $3–5; environment provisioning tracked separately). PHASE-16 opens on reference 1.18 @ `baf4247`.


Commercial-priority note (v2.1): PHASE-15..17 enable the real pilot with the 120 founding teachers without waiting for PHASE-13 (GPU).
