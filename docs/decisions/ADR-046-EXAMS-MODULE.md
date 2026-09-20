# ADR-046 — EXAMS-MODULE (governing doc §5.2.1)

- Status: ACCEPTED — 2026-09-20 (PHASE-25)
- Base: BuyTuk Academy 1.27 @ `6da840f` (PHASE-24 close)

## Context
§5.2.1 requires an exams module. The reference stack suggests a scheduler
(node-cron), external proctoring services and a separate grading worker —
new runtime dependencies and a new moving part for every exam window.

## Decision (REUSE-FIRST — zero new dependencies, DEV-025)
1. **The exam lifecycle is DATA-DRIVEN, not cron-driven**: `opens_at` /
   `closes_at` are checked INSIDE the submission transaction (fail-closed) —
   a submission outside the window is rejected (409 WINDOW_CLOSED) without
   any scheduler process. Status transitions (DRAFT→PUBLISHED→CLOSED) are a
   CHECK-constrained column.
2. **Auto-grading happens INSIDE the submission transaction**: the exam
   carries an `answer_key` (jsonb); the submission score is computed by
   exact key comparison in the same `withTenant` transaction that inserts
   the submission row — no grading worker, no eventual inconsistency.
3. **The double-submit guard is ATOMIC**: UNIQUE(tenant_id, exam_id,
   student_id) + INSERT ... ON CONFLICT DO NOTHING (the P15-4-proven
   pattern). A SAME-key replay returns the SAME submission (existed=true);
   a DIFFERENT key for an already-submitted exam is a genuine 409
   ALREADY_SUBMITTED. No race can create a second submission.
4. **ANSWER-KEY CONFIDENTIALITY**: student-facing views (capability-level
   view types) NEVER expose `answer_key` — only the staff view carries it.
   The E2E gate asserts the leak cannot happen over HTTP.
5. **RLS enabled+forced** on `exams` + `exam_submissions` (0007 mechanism,
   fail-closed) — tenant isolation is enforced by the database, verified by
   the gate (tenant-B staff sees zero tenant-A rows).

## Consequences
- No scheduler, no proctoring, no grading-worker dependencies — the module
  is fully covered by the existing runtime; transports/proctoring can be
  added later ONLY with an approved dependency decision (recorded DEV-025).
- Manual grading / essay questions are out of scope for this phase (the
  score model is exact-key); extending the grading function later does not
  change the data model.
- §3.3 fire-and-forget events reuse the 0011 vocabulary (ATTEMPT_SUBMIT
  class) with keys derived from the idempotency key (replays collapse).
