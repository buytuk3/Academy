# ADR-042 — PHASE-21: exam-behavioral analytics derived ONLY from the interaction_events stream (one aggregate table, zero new dependencies, zero new access logic)

- Date: 2026-09-20 · Phase: PHASE-21 (EXAM-BEHAVIORAL-ANALYTICS, governing doc v2.1 §3.9) · Status: ACCEPTED
- Base: BuyTuk Academy 1.23 @ `79c787a` (PHASE-20 close; verified at phase open: sha256
  `0c2dabd7017340b5320988c02f171a1f518c17c8add9d40951933da0006e3cae`, size 457,220,670 B,
  tar -tzf exit 0 / 5,599 entries, dirty=0, 70 commits)

## Context
§3.9 mandates behavioral analytics over exams/questions: time-per-question, answer-change
counts, and the chronological correct/wrong sequence — for the principal's class/school
dashboard. The binding constraint (management directive 2026-09-20): the ONLY data source
is `interaction_events` (PHASE-16, migration 0011); no new data source, no synthetic
seeding; the dashboard must reuse existing RLS read paths with zero new access logic.

## Decision
1. **All metrics derive from the REAL stream** (`interaction_events`, DB-clock
   `occurred_at`):
   - `ATTEMPT_START` (detail {exerciseId, created}) → questions started + the t₀ anchor;
   - `ATTEMPT_SUBMIT` (detail {mode, durationMs}; operation key random per call, so a
     converged RESUBMIT logs another event with the SAME attempt_id) → submissions,
     per-question wall-clock time (last submit − first start), and **answer changes =
     max(0, submits-per-attempt − 1)** — each resubmit after the first IS an answer
     change on that question (the only honest real-data signal; documented semantics);
   - correct/wrong classification: attempt → `activity_attempts.evidence_ref` →
     `evidence.errorType` (E4-proven: `FINAL_ANSWER_ERROR` = wrong; null = correct) —
     the canonical chain, read inside withTenant (existing RLS paths only);
   - `ATTEMPT_FAILED` stays in the derivation (counted as failed_events; currently 0 in
     real data because no adapter writes it yet — honestly reported, never fabricated);
   - the chronological sequence = classified attempts ordered by first-submit
     `occurred_at`.
2. **One aggregate table** (`0016_phase21_exam_behavioral_analytics.sql`, additive-only):
   `exam_behavior_snapshots` — scalar metric columns (dashboard filters: class_id/
   school_id copied from the student's REAL membership at compute time) + sequence/metrics
   jsonb; UNIQUE(tenant, operation_key) idempotency; RLS enabled+forced (0007 mechanism,
   fail-closed). JUSTIFICATION: the principal dashboard must not re-scan the full event
   stream per request; one snapshot row per student per compute key.
3. Canonical capability `analytics/capability.ts` (ALL SQL, withTenant everywhere):
   `computeExamBehavior` (pure derivation), `recordExamBehaviorSnapshot` (compute +
   record once; replays return the SAME row), `listExamBehaviorSnapshots` (class/school
   dashboard — RLS read of the aggregate only).
4. Thin `/v1/exam-analytics` adapter — NO SQL; zod-validated; Idempotency-Key required
   at compute (row key AND §3.3 event key derive from it → replays collapse on both);
   students compute/read /mine; staff surfaces (school dashboard with optional classId
   filter) ride the EXISTING role gates + RLS — zero new access logic.

## Alternatives rejected
- **New event types (ANSWER_CHANGED) or client-side instrumentation**: would write new
  data the current runtime never produces (fake-ish) and touch the 0011 CHECK contract —
  rejected; resubmit-count semantics are real and sufficient (documented above).
- **External analytics store (timeseries/ClickHouse) or a scheduler**: new dependency +
  moving parts for one aggregate query — rejected (DEV-021).
- **New authorization path for the dashboard**: forbidden by the directive — the
  dashboard reuses role gates + RLS reads exactly as every prior phase — rejected.

## Consequences
- The gate `tests/core-32/p21-exam-behavioral-analytics.e2e.test.ts` proves on a real
  app + real PG + real Redis (no mocks): REAL numeracy attempts (one correct "92", one
  wrong "91" + one resubmit) → exact metrics (questionsStarted=2, submissions=3,
  answerChanges=1, correct/wrong sequence in DB-clock order), replay convergence (same
  snapshot id), school dashboard + class filter, RLS fail-closed (tenant-B zero rows),
  role gates, and exactly-one §3.3 event per unique key.
