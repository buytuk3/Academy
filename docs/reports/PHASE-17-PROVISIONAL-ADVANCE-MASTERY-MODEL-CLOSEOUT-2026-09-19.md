# PHASE-17 CLOSEOUT — PROVISIONAL-ADVANCE-MASTERY-MODEL (governing doc v2.1 §3.4) — 2026-09-19

- Base: BuyTuk Academy 1.19 @ `22512d2` (byte-verified at phase open: sha256 `1e58d4d76178d672dd23ec878de699910aa134529ccb1a3d4e179df5ee2f8740`,
  size 456,830,446 B, tar -tzf exit 0 / 5,307 entries, extract dirty=0, 58 commits)
- Code commit: `79b51e5` · Close commit: recorded in the version chain below
- Preamble (binding): PHASE-13 (AI-RUNTIME-PROOF / DEP-001) remains OPEN — LAST after PHASE-26 (2026-09-19 ruling).

## What was built (additive-only; ADR-038 — ZERO new dependencies)
1. Migration `0012_phase17_provisional_advance_mastery_model.sql`: `stage_progressions`
   (§3.4 state machine; UNIQUE(tenant,student,stage) = the atomic lock) + `stage_promotions`
   (append-only ledger). RLS enabled+forced on both (0007 mechanism, fail-closed).
2. Canonical capability `packages/database/src/provisional/capability.ts` — ALL SQL inside
   withTenant; the provisional advance is a SINGLE conditional UPDATE whose WHERE carries
   the budget guard (P15-4-proven pattern; proven under REAL parallel contention in P17-3).
3. `provisional/stage-attempts.ts` — attempts feed over the PHASE-16 interaction_events
   stream (reuse-first: NO new data source).
4. Thin `/v1/provisional-advance` adapter — NO SQL; zod-validated; staff surfaces
   role-gated + student `/mine`; promotion logging is fire-and-forget (§3.3 semantics).

## §3.4 semantics proven (real app + real PG + real Redis — no mocks)
- 3 fails on a stage → exactly ONE provisional advance; budget 0→1 inside the UPDATE;
- debt carried: PROVISIONAL_PENDING on advance; a REAL pass → ADVANCED with
  CLEARED_BY_REAL_PASS_WITH_DEBT_CARRIED — the debt is NEVER erased by progression;
- the provisionally-entered stage REPEATS on further failure (no new advance, no budget change);
- on success NO stage in between is re-visited (single-row state machine — chain continuity by design);
- RLS fail-closed: tenant-B sees zero tenant-A rows (existence-hiding 404).

## Gates (all exit 0 — full register in /home/user/phase17_logs/exit_codes.txt)
MIG-1 (migrate+RLS+policy checks), P17 gate 4/4 PASS, REG-0 full matrix
(typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file ×11
incl. p15 6/6 + p16 + p17, auth-security, secret-diff 0, secret-tree 0, diff-check clean).
