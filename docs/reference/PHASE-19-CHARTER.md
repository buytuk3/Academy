# PHASE-19 CHARTER — CROSS-STAGE-ESCALATION-ENGINE (governing doc v2.1, §3.6)

- Date: 2026-09-20 · Base: BuyTuk Academy 1.21 @ `2e74584` (byte-verified this phase: sha256 `f872da50…cede9`, 457,011,129 B, tar -tzf exit 0 / 5,447 entries, dirty=0, 63 commits)
- Constraints honored: additive-only migration (0014, ADR-040); RLS enabled+forced
  fail-closed (0007 mechanism); DB-level atomic lock (UNIQUE(tenant,student,from,to)) +
  single conditional UPDATE for the ack (P15-4 pattern); fire-and-forget §3.3 logging;
  thin SQL-free adapters; the §3.4 stage_progressions stream is the ONLY derivation
  source (real attempt outcomes — no synthetic data); ZERO new dependencies, no
  scheduler/queue (DEV-019).

## Gates (fixed in advance — OPEN gates never PASS)
| Gate | Definition of PASS |
|---|---|
| MIG-1 | migration 0014 applies (idempotent re-run safe); RLS enabled+forced on `stage_escalations`; `stage_escalations_lock` UNIQUE present |
| P19-1 | §3.6 derivation: REAL debt (PROVISIONAL_PENDING from §3.4) + persistent gap (≥2 failed attempts on another stage) → exactly ONE escalation (severity HIGH/CRITICAL by tier); re-evaluation idempotent (no duplicates) |
| P19-2 | §3.6 ack: teacher acknowledges (atomic CAS); Idempotency-Key replay converges (no second write); student surfaces are 403 |
| P19-3 | §3.6 real-data-only: a student with no debt/gap yields ZERO escalations; RLS fail-closed — tenant-B sees zero tenant-A rows |
| P19-4 | §3.3 fire-and-forget: escalation + ack surface on the interaction stream exactly once each (replays collapse) |
| REG-0 | typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file (incl. p15+p16+p17+p18+p19), secret scans 0+0, diff-check clean — all exit 0 |
| CLOSURE | STAGE_STATUS/CDR/PROJECT_VERSION/MASTER_ROADMAP updated + independent closeout report + single-file archive uploaded in-conversation (sha256/size/tar -tzf proof) + uploaded to the OWNER'S gofile account via the saved token with server-side md5/size echo match |
