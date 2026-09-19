# PHASE-17 CHARTER — PROVISIONAL-ADVANCE-MASTERY-MODEL (governing doc v2.1, §3.4)

- Date: 2026-09-19 · Base: BuyTuk Academy 1.19 @ `22512d2` (byte-verified this phase: sha256 `1e58d4d…f8740`, 456,830,446 B, tar -tzf exit 0 / 5,307 entries, extract dirty=0, 58 commits)
- Constraints honored: additive-only migration (0012, ADR-038); RLS enabled+forced
  fail-closed (0007 mechanism); DB-level atomic lock (UNIQUE + single conditional
  UPDATE — the P15-4 pattern); fire-and-forget secondary logging (§3.3 semantics);
  thin SQL-free adapters; interaction_events (PHASE-16) is the ONLY attempts data
  source; ZERO new dependencies (none added → no dep-exception ADR needed).

## Gates (fixed in advance — OPEN gates never PASS)
| Gate | Definition of PASS |
|---|---|
| MIG-1 | migration 0012 applies (idempotent re-run safe); RLS enabled+forced on `stage_progressions` + `stage_promotions`; `stage_progressions_lock` UNIQUE present |
| P17-1 | §3.4 policy: 2 fails stay ACTIVE; the 3rd fail advances PROVISIONALLY exactly once, consumes 1 budget unit, carries the debt (PROVISIONAL_PENDING; promotion event debtCarried=true) |
| P17-2 | §3.4 repeat+backfill: a provisionally-entered stage REPEATS on further failure (REPEATING, no budget change, no new advance); a REAL pass clears it (ADVANCED; debt carried — never erased) |
| P17-3 | REAL atomic concurrency: two PARALLEL 3rd-fail records → exactly ONE provisional advance (budget 1, advanceSeq 1) — the P15-4 DB-level lock, no app lock |
| P17-4 | RLS fail-closed: tenant-B reads zero tenant-A progression rows (existence-hiding 404); staff surfaces role-gated (student 403) |
| REG-0 | typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file (incl. p15+p16+p17), secret scans 0+0, diff-check clean — all exit 0 |
| CLOSURE | STAGE_STATUS/CDR/PROJECT_VERSION/MASTER_ROADMAP updated + independent closeout report + single-file archive uploaded in-conversation with sha256/size/tar -tzf proof (the 2026-09-19 channel ruling: no gofile) |
