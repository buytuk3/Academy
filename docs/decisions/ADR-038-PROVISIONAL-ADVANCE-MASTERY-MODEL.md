# ADR-038 — PHASE-17: provisional-advance mastery model on the interaction log (reuse-first, ZERO new dependencies)

- Date: 2026-09-19 · Phase: PHASE-17 (PROVISIONAL-ADVANCE-MASTERY-MODEL, governing doc v2.1 §3.4) · Status: ACCEPTED
- Base: BuyTuk Academy 1.19 @ `22512d2` (verified byte-by-byte at phase open: sha256
  `1e58d4d76178d672dd23ec878de699910aa134529ccb1a3d4e179df5ee2f8740`, size 456,830,446 B,
  `tar -tzf` exit 0 / 5,307 entries, extract exit 0, carried `.git` @ 22512d2 dirty=0, 58 commits)

## Context
Governing doc v2.1 §3.4 mandates the Provisional-Advance-with-Backfill progression model:
3 failed attempts on a stage grant AT MOST ONE provisional advance (consuming exactly one
attempt from the next stage's budget); a provisionally-entered stage repeats automatically
until passed; on success NO intermediate stage is re-visited; and the educational debt is
NEVER cleared by the provisional advance — only a real pass closes the gap.

## Decision
1. **Zero new dependencies.** The §3.4 engine rides entirely on existing approved
   capabilities: `withTenant` (0007 RLS mechanism, fail-closed), the interaction event
   stream (`interaction_events`, PHASE-16 migration 0011) as the attempt data source,
   and the 0009/0010/0011 DDL template. **No package.json change** — hence no
   dev-dep exception either.
2. Migration `0012_phase17_provisional_advance_mastery_model.sql` (additive-only):
   `stage_progressions` (§3.4 state machine; UNIQUE(tenant,student,stage) = the atomic
   lock; status CHECK vocabulary ACTIVE/PROVISIONAL/ADVANCED/REPEATING/CLOSED;
   debt_status NONE/PROVISIONAL_PENDING/CLEARED_BY_REAL_PASS/CLEARED_BY_REAL_PASS_WITH_DEBT_CARRIED) +
   `stage_promotions` (append-only ledger, mode PROVISIONAL/REAL, debt_carried flag).
   Both RLS enabled+forced (0007 mechanism, fail-closed).
3. The advance itself is the P15-4-proven database-level atomic pattern: the
   provisional budget guard lives INSIDE the single conditional UPDATE's WHERE
   (status='ACTIVE' AND provisional_budget_used=0), so two concurrent 3rd-fail records
   yield exactly ONE PROVISIONAL winner — no application-level locks, no
   read-modify-write races.
4. Canonical capability `packages/database/src/provisional/capability.ts` (ALL SQL,
   withTenant everywhere) + `provisional/stage-attempts.ts` (read-only facts feed from
   `interaction_events` ATTEMPT_SUBMIT rows). Thin `/v1/provisional-advance` adapter:
   NO SQL, zod-validated, student `/mine` surface + staff scope-checked surfaces.

## §3.4 semantics (fixed by the governing doc, asserted by the gate)
- 3 attempts on a stage (attempt_count reaching the threshold while ACTIVE) → the
  advance consumes exactly ONE budget unit (`provisional_budget_used` 0→1, enforced
  in-UPDATE) — the attempt is deducted from the next stage's budget;
- a provisionally-entered stage REPEATS (`status REPEATING` on subsequent failures)
  until a real pass (`passed=true`) clears it;
- the provisional advance CARRIES the debt (`debt_status=PROVISIONAL_PENDING`,
  ledger `debt_carried=true`) — the debt is never erased by progression; a real pass
  on a provisional origin records `CLEARED_BY_REAL_PASS_WITH_DEBT_CARRIED`;
- a real pass on any stage records a REAL promotion with `budget_used=0`.

## Alternatives rejected
- **New data source / own attempt-outcome table**: §3.4 needs attempt history that
  PHASE-16 already records (ATTEMPT_SUBMIT + the real measured engine echo in
  `detail`). Duplicating it would create a second store and violate the reuse-first
  contract — rejected.
- **App-level locking (per-student mutex in Redis/process)**: fails the P15-4 binding
  rule (DB-level atomic lock only) and is unprovable under concurrency — rejected.
- **New npm dependency (e.g. a state-machine lib)**: the §3.4 machine is one policy
  rule around ONE conditional UPDATE; a dependency cannot be justified — rejected.

## Consequences
- The accompanying interaction event for a promotion is written fire-and-forget
  (§3.3 semantics) and never breaks the advance response.
- The gate `tests/core-32/p17-provisional-advance-mastery-model.e2e.test.ts` proves the
  whole machine on a real app + real PG + real Redis with no mocks, including the
  P17-3 REAL parallel 3rd-fail race (exactly one advance).
