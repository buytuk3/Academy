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

## BINDING ROADMAP — PHASE-13..PHASE-18 (management decision, 2026-09-18 — supersedes any prior PHASE-13+ ordering)

Governing rules for every phase (no exceptions): (1) build ONLY on the last closed, byte-verified approved reference — never from memory, no parallel branches; (2) reuse-first — any new dependency or architectural change requires an ADR stating the reason and the rejected alternatives; (3) closure requires a new REAL E2E gate (tests/core-32/pXX-*.e2e.test.ts) + zero regressions (official matrix incl. per-file core-32 + E1 + E4 + secret scans + diff-check); (4) documentation: STAGE_STATUS.md + CHANGE_DEVIATION_RECORD + PROJECT_VERSION.md + a standalone closeout report; (5) new reference archive: single file, trusted external channel, VERIFIED proof (SHA-256 + exact size + tar -tzf) BEFORE sharing the link; (6) mandatory stop: never start the next phase before explicit management approval of the current phase's closeout report.

| Phase | Objective | Dependencies / notes |
|---|---|---|
| **PHASE-13 (highest priority)** | AI-RUNTIME-PROOF — closes DEP-001: run inference-gateway (gateway.py + workers/whisper_worker.py + workers/alignment_worker.py) on a REAL GPU/CUDA environment; real Whisper on ≥10 REAL Arabic audio samples with measured WER; phoneme-level forced-alignment + Arabic G2P proof; full path via the existing queue to a real student with real analysis evidence. Mandatory disclosure if no GPU (document + request environment — never claim success without real audio evidence attached) | none — starts first |
| PHASE-14 | PRODUCTION-DEPLOYMENT-CLOSURE — real external deployment target (≥1 container) + @vitest/coverage-v8 provider (documented exception: measurement tooling, no production-logic change) | after PHASE-13 explicit approval |
| PHASE-15 | STUDENT-ENGAGEMENT-EXTRAS — points-store spend + student notes + support; reuse wallet_ledger/messages from migration 0009 | after PHASE-14 approval |
| PHASE-16 | NOTIFICATIONS — real email/in-app over existing messages/observability | after PHASE-15 approval |
| PHASE-17 | EXAMS-MODULE — independent of exercises/assessment-engine; new migration only with a mandatory ADR | after PHASE-16 approval |
| PHASE-18 | CI/CD-AND-LOAD-TESTING — GitHub Actions + k6 (infrastructure tooling only, no app-code changes) | after PHASE-17 approval |

Note (2026-09-18): PHASE-14 groundwork (coverage provider + container target, commits bfeeaf9/e3fdeb1/2d692be) landed under the superseded numbering and is reattributed to PHASE-14; git history is not rewritten.
