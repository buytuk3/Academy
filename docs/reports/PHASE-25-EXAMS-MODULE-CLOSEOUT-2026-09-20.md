# PHASE-25 CLOSEOUT — EXAMS-MODULE (§5.2.1) — 2026-09-20

- Base: BuyTuk Academy 1.27 @ `6da840f` (PHASE-24 close; byte-verified at phase open: sha256
  `4e248811e3494004d2e8aa142def5fb9e48b44171c2224572b100691233a1c4b`, size 457,620,386 B,
  tar -tzf exit 0 / 5,866 entries, dirty=0, 81 commits)
- Code commit: `7e0bafb` · Close commit: recorded in the version chain below
- Preamble (binding): PHASE-13 (AI-RUNTIME-PROOF / DEP-001) remains OPEN — LAST after PHASE-26 (2026-09-19 ruling).

## What was built (additive-only; ADR-046 — ZERO new dependencies, DEV-025)
1. Migration `0020_phase25_exams_module.sql`: `exams` (status CHECK; window
   timestamps; staff-only answer_key jsonb) + `exam_submissions` (answers,
   score/max_score). Both RLS enabled+forced (0007 mechanism, fail-closed).
2. DATA-DRIVEN LIFECYCLE: opens_at/closes_at checked INSIDE the submission
   transaction (fail-closed 409 WINDOW_CLOSED) — NO scheduler process.
3. IN-TRANSACTION AUTO-GRADING: the submission score is computed by exact
   comparison against answer_key inside the same withTenant transaction that
   inserts the row — no grading worker, no eventual inconsistency.
4. THE ATOMIC DOUBLE-SUBMIT GUARD: UNIQUE(tenant, exam, student) + INSERT ...
   ON CONFLICT DO NOTHING (the P15-4 CAS pattern) — a SAME-key replay returns
   the SAME submission (existed=true); a different key → 409 ALREADY_SUBMITTED.
5. ANSWER-KEY CONFIDENTIALITY: student-facing views never expose answer_key —
   asserted over HTTP in the gate.
6. Canonical capability `exams/capability.ts` (ALL SQL, withTenant everywhere)
   + thin /v1 adapter (Idempotency-Key required; row keys AND §3.3 event keys
   derive from it; fire-and-forget ATTEMPT_SUBMIT-class events — 0011
   vocabulary reuse; literal routes before :examId routes). SCHEDULER and
   PROCTORING DEFERRED (DEV-025).

## Gates (all exit 0 — full register in /home/user/phase25_logs/exit_codes.txt)
MIG-1 (migrate + RLS=2/2 forced + policies=2/2), P25 gate 4/4 PASS, REG-0 full
matrix (typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file
×19 incl. p15 6/6 + p16 + p17 + p18 + p19 + p20 + p21 + p22 + p23 + p24 + p25,
auth-security, secret-diff 0, secret-tree 0, diff-check clean).
