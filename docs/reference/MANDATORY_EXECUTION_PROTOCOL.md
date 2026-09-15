# MANDATORY EXECUTION PROTOCOL — BuyTuk Academy

## Official role of this document
This file defines the mandatory project protocol for all future work on BuyTuk Academy.
It is the binding governance layer for execution inside this repository.

## Baseline / Contract / Minimum Requirement
- Immutable reference requirement document: `docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`
- This reference is the minimum contractual baseline.
- It is not the ceiling of product evolution.
- Any capability beyond the document is allowed only when classified and documented as an approved enhancement.

## Operating rule
`READ → TRACE → PLAN → IMPLEMENT → TEST → PROVE → CLOSE → NEXT`

## Non-negotiable rules
1. No requirement without traceability.
2. No claim without evidence.
3. No enhancement without classification and documentation.
4. No stage change before the current stage is closed.
5. No reopening of a closed stage without regression evidence.
6. No fix outside current scope.
7. Reuse first: reuse → integrate → extend → rebuild only if proven necessary.
8. Baseline preserved.
9. Git history preserved.
10. Scope discipline is mandatory.

## Classification for every task
Each task must be classified as one of:
- **A — Document Requirement**
- **B — Required Dependency**
- **C — Quality/Security Requirement**
- **D — Approved Enhancement**

If a task does not fit one of the four categories, it must not be executed until formally approved.

## Stage model
Each stage must follow:
`Stage → Implement → Test → Prove → Close → Next`

Each stage must have:
1. Scope
2. Inputs
3. Tasks
4. Dependencies
5. Acceptance Criteria
6. Tests
7. Security checks when applicable
8. Regression checks
9. Closeout report
10. SHA/Tag status

## Stage status vocabulary
Allowed status values:
- `NOT STARTED`
- `IN PROGRESS`
- `BLOCKED`
- `READY FOR GATE`
- `CLOSED / PASS`

## Closeout rule
A stage cannot be marked `CLOSED / PASS` until all of the following are present:
- implementation evidence
- test evidence
- regression evidence
- security evidence when applicable
- acceptance criteria result
- closeout document
- git evidence (branch / sha / tag status)

## Reopen rule
A closed stage may only be reopened if regression evidence proves that a later change broke it.
When this happens, the project must record:
- what broke
- why it broke
- which change caused it
- why existing tests did not catch it
- which new test prevents recurrence

## Governance documents required in-repo
- `docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`
- `docs/reference/MANDATORY_EXECUTION_PROTOCOL.md`
- `docs/reference/EXECUTION-REFERENCE.md`
- `docs/buytuk-master/TRACEABILITY_MATRIX.md`
- `docs/buytuk-master/MASTER_ROADMAP.md`
- `docs/buytuk-master/STAGE_STATUS.md`
- `docs/buytuk-master/CHANGE_DEVIATION_RECORD.md`
- `docs/reports/PHASE-0-GOVERNANCE-CLOSEOUT-2026-09-15.md`

## Priority order for execution when dependencies conflict
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
