# PHASE-22 CHARTER — VIDEO-LESSON-CONTENT (governing doc v2.1, §3.8)

- Date: 2026-09-20 · Base: BuyTuk Academy 1.24 @ `28f98a5` (byte-verified this phase: sha256 `418fc2c0…3191`, 457,327,608 B, tar -tzf exit 0 / 5,669 entries, dirty=0, 73 commits)
- Constraints honored: additive-only migration (0017, ADR-043 — the roadmap-mandated own
  ADR); RLS enabled+forced fail-closed (0007 mechanism); atomic publish (single
  conditional UPDATE — P15-4 pattern; publish key persisted in the same statement);
  idempotency by (tenant, operation_key); fire-and-forget §3.3 logging; thin SQL-free
  adapters; the video rides the EXISTING content registry (loose reference) with a LOOSE
  storage pointer (attempts.audio_key convention — bytes live in the deployment object
  store); ZERO new dependencies (DEV-022).

## Gates (fixed in advance — OPEN gates never PASS)
| Gate | Definition of PASS |
|---|---|
| MIG-1 | migration 0017 applies (idempotent re-run safe); RLS enabled+forced on `video_lessons`; `video_lessons_op_uniq` UNIQUE present |
| P22-1 | §3.8 register: staff creates a video lesson over a REAL content row (201, PROCESSING); replay with the SAME Idempotency-Key → the SAME id (existed=true, one row) |
| P22-2 | §3.8 atomic publish + student gating: publish → READY (CAS changed=true; replay same key → changed=false); the PROCESSING lesson is INVISIBLE to students (404); the READY lesson is readable by the student |
| P22-3 | RLS fail-closed: tenant-B staff sees zero tenant-A rows; student cannot create/publish (403); tenant-B student sees zero published lessons |
| P22-4 | §3.3 fire-and-forget: exactly one event per unique key on the interaction stream (create + publish; replays collapse) |
| REG-0 | typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file (15 files through p21 + p22), secret scans 0+0, diff-check clean — all exit 0 |
| CLOSURE | STAGE_STATUS/CDR/PROJECT_VERSION (1.25 adoption) + MASTER_ROADMAP updated + independent closeout report + single-file archive uploaded in-conversation (sha256/size/tar -tzf proof) + uploaded to the OWNER'S gofile account via the saved token with server-side md5/size echo match |
