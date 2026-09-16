# PHASE-3 — CLOSE RECORD (OWNER APPROVAL) — 2026-09-16

## Ruling
The owner reviewed "PHASE-3 — CORE-WEB-PORTAL-SHELL — FINAL CLOSEOUT" and formally adopted
PHASE-3 as **CLOSED / PASS** per its approved scope. No re-execution or reopening of PHASE-3
is requested. This record is the governance CLOSE/RECORD only — no code changes, no V1
changes, no `_history/` changes, no tag changes, no push.

## Adopted phase commit
- Commit: `ad538c9ab1eaaf909b0aa8ee24382c714413d07a`
- Message: `phase3(core-web-portal-shell): role-aware portal shell for 5 roots per ACR-E5-001 + P3 role-shell E2E`
- Adopted scope (as proven): Role-aware Web Portal Shell · 5 roots (Student/Teacher/Parent/Principal/Admin) · role-based navigation · role guards · 401/403 behavior · reuse of `/v1/auth/me` · JWT-derived role/tenant context · real API integration · P3 Role Shell E2E 8/8 · security isolation proof · typecheck/build/regression verification · governance & traceability updates · clean working tree · preservation of Git history and previous references.

## Formal exception (recorded, not hidden)
P1 Student UI historical regression = **4/5** with the single failure P1-2 classified under
**DEV-013** (pre-existing UI message text mismatch at baseline HEAD + rate-limit sensitivity;
see `docs/buytuk-master/CHANGE_DEVIATION_RECORD.md`).

**Formal statement:** "PHASE-3 PASS does not mean all historical phase suites are 100% green."
It means PHASE-3's own Acceptance Criteria are met, with the historical exception DEV-013
documented and deferred OUTSIDE PHASE-3 scope. Do not fix DEV-013 within PHASE-3 and do not
open a new scope for it — unless later regression evidence proves it breaks a future phase's
Acceptance Criteria.

## Adopted official reference archive
- Archive: `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-3-2026-09-16.tar.gz`
- SHA-256: `9feb51aa11eb1862cfb4d0337d38fccd2902ec5791d3ea30c26b82d8529edb63`
- HEAD represented: `ad538c9ab1eaaf909b0aa8ee24382c714413d07a`
- No archive re-creation is required (owner ruling).

## Governance changes in this record commit (documentation only)
- `docs/buytuk-master/CHANGE_DEVIATION_RECORD.md` — DEV-013 pinned as **DEFERRED (OPEN)**:
  historical item, NOT a PHASE-3 failure; PHASE-3 re-verification evidence (4/5; P1-2
  pre-existing text mismatch proven at baseline) and the owner's ruling recorded verbatim.
- `docs/reports/PHASE-3-CLOSE-RECORD-2026-09-16.md` — this record.
- `docs/buytuk-master/STAGE_STATUS.md` — verified: PHASE-3 row already reads `CLOSED / PASS`
  with full evidence (committed in `ad538c9`); no change needed.
- `docs/buytuk-master/TRACEABILITY_MATRIX.md` — verified: ARCH-001/TCH-001/PAR-001/ADM-001
  rows already reflect exactly what PHASE-3 proved (committed in `ad538c9`); no change needed.

## Git verification (at this record)
- HEAD: `ad538c9ab1eaaf909b0aa8ee24382c714413d07a` (record commit = HEAD + governance docs)
- Tag `BuyTuk.V0.1.3` → `41b0bba3501eb221d16f474299e44d39c709b104` (unchanged, untouched)
- Working tree: CLEAN before and after this record commit

## Continuation rule
`READ → TRACE → PLAN → IMPLEMENT → TEST → PROVE → CLOSE → ARCHIVE → NEXT` — and there is
**no NEXT** without the owner's explicit `START NEXT PHASE` command. PHASE-4 = NOT STARTED.
