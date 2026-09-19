# PHASE-18 CLOSEOUT — SPACED-REVIEW-ENGINE (governing doc v2.1 §3.5) — 2026-09-19

- Base: BuyTuk Academy 1.20 @ `82c8498` (PHASE-17 close; byte-verified at phase open: sha256
  `e853313367d9d27e81e76b96b41787b34f901796465dc6b2204bb93945695f46`, size 456,920,243 B,
  tar -tzf exit 0 / 5,377 entries, extract dirty=0, 60 commits)
- Code commit: `d857f75` · Close commit: recorded in the version chain below
- Preamble (binding): PHASE-13 (AI-RUNTIME-PROOF / DEP-001) remains OPEN — LAST after PHASE-26 (2026-09-19 ruling).

## What was built (additive-only; ADR-039 — ZERO new dependencies)
1. Migration `0013_phase18_spaced_review_engine.sql`: `review_items` (§3.5 schedule;
   UNIQUE(tenant,student,stage,item) = the atomic lock; fixed ladder CHECK (1,3,7,14,30)) +
   `review_completions` (append-only ledger). RLS enabled+forced on both (0007 mechanism, fail-closed).
2. Canonical capability `packages/database/src/spaced/capability.ts` — ALL SQL inside
   withTenant; derivation reads ONLY the real §3.4 `stage_progressions` stream (failed
   attempts → box-1 DUE items; a REAL pass promotes one box exactly once — idempotent by
   `lastOutcome` guard). NO synthetic data, NO new data source.
3. The fixed §3.5 ladder [1,3,7,14,30]: a correct recall moves one box UP (self-paced early
   revision allowed — due_at is a recommendation); a lapse resets to box 1 (re-study now);
   mastery = a correct recall at box 5 (MASTERED).
4. Thin `/v1/spaced-review` adapter — NO SQL; zod-validated; completions require an
   Idempotency-Key (replays converge — one ledger row, one interaction event); promotion
   logging is fire-and-forget (§3.3 semantics, 0011 vocabulary reused).

## Gates (all exit 0 — full register in /home/user/phase18_logs/exit_codes.txt)
MIG-1 (migrate+RLS+policy checks), P18 gate 4/4 PASS, REG-0 full matrix
(typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file ×12
incl. p15 6/6 + p16 + p17 + p18, auth-security, secret-diff 0, secret-tree 0, diff-check clean).
