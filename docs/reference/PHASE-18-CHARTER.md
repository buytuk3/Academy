# PHASE-18 CHARTER — SPACED-REVIEW-ENGINE (governing doc v2.1, §3.5)

- Date: 2026-09-19 · Base: BuyTuk Academy 1.20 @ `82c8498` (byte-verified this phase: sha256 `e8533133…95f46`, 456,920,243 B, tar -tzf exit 0 / 5,377 entries, extract dirty=0, 60 commits)
- Constraints honored: additive-only migration (0013, ADR-039); RLS enabled+forced
  fail-closed (0007 mechanism); DB-level atomic lock (UNIQUE(tenant,student,stage,item));
  fire-and-forget secondary logging (§3.3 semantics); thin SQL-free adapters; the §3.4
  stage_progressions stream is the ONLY derivation source (real attempt outcomes — no
  synthetic data); ZERO new dependencies (ADR-039, DEV-018).

## Gates (fixed in advance — OPEN gates never PASS)
| Gate | Definition of PASS |
|---|---|
| MIG-1 | migration 0013 applies (idempotent re-run safe); RLS enabled+forced on `review_items` + `review_completions`; `review_items_lock` UNIQUE present |
| P18-1 | §3.5 derivation: review items come ONLY from real §3.4 stage attempts (staff refresh after REAL record-attempt calls → box-1 DUE items; no synthetic seeds) |
| P18-2 | §3.5 ladder: a correct recall expands the interval on the fixed ladder (box1→2 = 3d, box2→3 = 7d); ledger rows record every box transition; replay of the same Idempotency-Key converges (no second write) |
| P18-3 | §3.5 lapse: a failed recall resets the item to box 1 (1 day, DUE); mastery at box 5 (MASTERED status) |
| P18-4 | RLS fail-closed: tenant-B reads zero tenant-A review rows; student cannot use staff surfaces (403); completion logging is fire-and-forget on the interaction stream (exactly one event per completion) |
| REG-0 | typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file (incl. p15+p16+p17+p18), secret scans 0+0, diff-check clean — all exit 0 |
| CLOSURE | STAGE_STATUS/CDR/PROJECT_VERSION/MASTER_ROADMAP updated + independent closeout report + single-file archive uploaded in-conversation with sha256/size/tar -tzf proof + NEW gofile link with MANDATORY real round-trip byte-verification in the same session (binding 2026-09-19 channel ruling) |
