# PHASE-21 CLOSEOUT — EXAM-BEHAVIORAL-ANALYTICS (governing doc v2.1 §3.9) — 2026-09-20

- Base: BuyTuk Academy 1.23 @ `79c787a` (PHASE-20 close; byte-verified at phase open: sha256
  `0c2dabd7017340b5320988c02f171a1f518c17c8add9d40951933da0006e3cae`, size 457,220,670 B,
  tar -tzf exit 0 / 5,599 entries, dirty=0, 70 commits)
- Code commit: `7c68f57` · Close commit: recorded in the version chain below
- Preamble (binding): PHASE-13 (AI-RUNTIME-PROOF / DEP-001) remains OPEN — LAST after PHASE-26 (2026-09-19 ruling).

## What was built (additive-only; ADR-042 — ZERO new dependencies, DEV-021)
1. Migration `0016_phase21_exam_behavioral_analytics.sql`: `exam_behavior_snapshots`
   (scalar metrics + sequence/metrics jsonb; class_id/school_id copied from the student's
   REAL membership; UNIQUE(tenant, operation_key) idempotency). RLS enabled+forced
   (0007 mechanism, fail-closed).
2. Canonical capability `analytics/capability.ts` — ALL SQL inside withTenant; ALL
   metrics derive ONLY from the REAL interaction_events stream (0011) + the canonical
   attempt→evidenceRef→evidence.errorType chain: questionsStarted (distinct ATTEMPT_START
   attempt_ids), submissions + answerChanges (submits-per-attempt − 1 — the real resubmit
   semantics), avgTimeMs (last submit − first start per attempt, DB clock), correct/wrong
   (evidence.errorType null → correct / FINAL_ANSWER_ERROR → wrong) and the chronological
   sequence ordered by first-submit occurred_at. NO synthetic seeds, NO new data source.
3. Principal class/school dashboard: `listExamBehaviorSnapshots` (optional classId
   filter) — EXISTING RLS read paths only, zero new access logic (binding directive).
4. Thin `/v1/exam-analytics` adapter — NO SQL; zod-validated; Idempotency-Key required
   (row key AND §3.3 event key derive from it → replays collapse on both); students
   compute/read /mine; staff compute for a tenant student + school dashboard +
   live per-student metrics.

## Gates (all exit 0 — full register in /home/user/phase21_logs/exit_codes.txt)
MIG-1 (migrate+RLS+policy checks), P21 gate 3/3 PASS, REG-0 full matrix
(typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file ×15
incl. p15 6/6 + p16 + p17 + p18 + p19 + p20 + p21, auth-security, secret-diff 0,
secret-tree 0, diff-check clean).
