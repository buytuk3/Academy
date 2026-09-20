# PHASE-25 CHARTER — EXAMS-MODULE (governing doc §5.2.1)

- Date: 2026-09-20 · Base: BuyTuk Academy 1.27 @ `6da840f` (byte-verified this phase: sha256 `4e248811…1c4b`, 457,620,386 B, tar -tzf exit 0 / 5,866 entries, dirty=0, 81 commits)
- Constraints honored: additive-only migration (0020, ADR-046); RLS enabled+forced
  fail-closed (0007 mechanism) on both new tables; data-driven lifecycle (window checks
  INSIDE the transaction — no scheduler); in-transaction auto-grading; ATOMIC
  double-submit guard (UNIQUE(tenant,exam,student) + ON CONFLICT DO NOTHING);
  answer-key confidentiality in student views; thin SQL-free adapters; fire-and-forget
  §3.3 logging; ZERO new dependencies — scheduler/proctoring explicitly deferred (DEV-025).

## Gates (fixed in advance — OPEN gates never PASS)
| Gate | Definition of PASS |
|---|---|
| MIG-1 | migration 0020 applies (idempotent re-run safe); RLS enabled+forced on `exams` + `exam_submissions`; op_uniq / student_uniq UNIQUEs present |
| P25-1 | staff creates an exam (idempotent replay → SAME id, no duplicate); DRAFT exams invisible to students; student 403 on the staff creation surface |
| P25-2 | student /mine shows PUBLISHED exams for the own class WITHOUT answerKey (no leak over HTTP); submit → in-transaction auto-grade (exact score 2/3); replay with the SAME key → SAME submission id (no duplicate); a DIFFERENT key → 409 ALREADY_SUBMITTED; closed-window exam → 409 WINDOW_CLOSED |
| P25-3 | staff submissions list for the exam shows exactly one submission with the exact score; student /submissions/mine shows the same row; tenant-B staff sees ZERO tenant-A exams AND submissions (RLS fail-closed) |
| P25-4 | §3.3 fire-and-forget: exactly one event per unique key on the interaction stream (3 creates + 1 submit; replays collapse) |
| REG-0 | typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file (19 files through p24 + p25), secret scans 0+0, diff-check clean — all exit 0 |
| CLOSURE | STAGE_STATUS/CDR/PROJECT_VERSION (1.28 adoption) + MASTER_ROADMAP updated + independent closeout report + single-file archive uploaded in-conversation (sha256/size/tar -tzf proof) + uploaded to the OWNER'S gofile account via the saved token with the RAW server-response md5 compared character-by-character |
