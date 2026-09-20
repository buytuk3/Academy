# PHASE-21 CHARTER — EXAM-BEHAVIORAL-ANALYTICS (governing doc v2.1, §3.9)

- Date: 2026-09-20 · Base: BuyTuk Academy 1.23 @ `79c787a` (byte-verified this phase: sha256 `0c2dabd7…3cae`, 457,220,670 B, tar -tzf exit 0 / 5,599 entries, dirty=0, 70 commits)
- Constraints honored (management directive 2026-09-20): data source = interaction_events
  (0011) ONLY — no new source, no synthetic seeds; metrics from REAL DB-clock
  occurred_at of ATTEMPT_START/ATTEMPT_SUBMIT/ATTEMPT_FAILED; one additive aggregate
  migration (0016, ADR-042) with RLS enabled+forced fail-closed; the principal class/
  school dashboard uses EXISTING RLS read paths only (zero new access logic); thin
  SQL-free adapters; ZERO new dependencies (DEV-021).

## Gates (fixed in advance — OPEN gates never PASS)
| Gate | Definition of PASS |
|---|---|
| MIG-1 | migration 0016 applies (idempotent re-run safe); RLS enabled+forced on `exam_behavior_snapshots`; `exam_behavior_op_uniq` UNIQUE present |
| P21-1 | §3.9 derivation from REAL attempts (real numeracy submits: one correct "92", one wrong "91"): questionsStarted=2, submissions=3, avgTimeMs≥0, correct/wrong sequence in DB-clock order [true, false] — snapshot recorded once; replay with the SAME Idempotency-Key → same id (existed=true) |
| P21-2 | answer-change semantics (real resubmit): the converged second submit of attempt-1 (different finalAnswer) logs a real second ATTEMPT_SUBMIT event → answerChanges=1 — documented in ADR-042, never fabricated |
| P21-3 | principal dashboard on existing RLS reads ONLY: school view lists the snapshot; classId filter matches the student's REAL class; tenant-B sees zero rows; student surfaces 403 on staff endpoints; /mine works |
| P21-4 | §3.3 fire-and-forget: exactly ONE PHASE-21 event per unique key on the interaction stream (replays collapse) |
| REG-0 | typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file (14 files through p20 + p21), secret scans 0+0, diff-check clean — all exit 0 |
| CLOSURE | STAGE_STATUS/CDR/PROJECT_VERSION (1.24 adoption) + MASTER_ROADMAP updated + independent closeout report + single-file archive uploaded in-conversation (sha256/size/tar -tzf proof) + uploaded to the OWNER'S gofile account via the saved token with server-side md5/size echo match |
