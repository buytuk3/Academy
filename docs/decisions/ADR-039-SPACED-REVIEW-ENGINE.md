# ADR-039 — PHASE-18: spaced-review engine on the §3.4 progression stream (reuse-first, ZERO new dependencies)

- Date: 2026-09-19 · Phase: PHASE-18 (SPACED-REVIEW-ENGINE, governing doc v2.1 §3.5) · Status: ACCEPTED
- Base: BuyTuk Academy 1.20 @ `82c8498` (PHASE-17 close; verified byte-by-byte at phase open:
  sha256 `e853313367d9d27e81e76b96b41787b34f901796465dc6b2204bb93945695f46`, size 456,920,243 B,
  tar -tzf exit 0 / 5,377 entries, extract dirty=0, 60 commits)

## Context
Governing doc v2.1 §3.5 mandates a spaced-review engine: learned material is re-surfaced on an
expanding schedule; lapses reset the schedule; mastery is reached at the top of the ladder.

## Decision
1. **Zero new dependencies.** No package.json change — the engine rides on existing approved
   capabilities only: `withTenant` (0007 RLS mechanism, fail-closed), the §3.4
   `stage_progressions` stream as the ONLY derivation source (real attempt outcomes —
   PHASE-17), and the 0009-0012 DDL template.
2. Migration `0013_phase18_spaced_review_engine.sql` (additive-only):
   `review_items` (UNIQUE(tenant,student,stage,item) = the atomic lock; box 1..5 + the fixed
   interval ladder CHECK (1,3,7,14,30); status DUE/SNOOZED/MASTERED; outcome vocabulary
   FAILED_ATTEMPTS/REAL_PASS/REVIEW_PASS/REVIEW_LAPSE) + `review_completions`
   (append-only ledger of box transitions). Both RLS enabled+forced (0007 mechanism).
3. **The fixed §3.5 ladder**: `SPACED_INTERVAL_DAYS = [1,3,7,14,30]`. A correct recall moves
   the item one box UP (self-paced early revision is allowed — `due_at` is the
   recommendation, not a gate: real systems (e.g. Anki-style) never block an eager learner);
   a lapse resets to box 1 with the 1-day interval; a correct recall at box 5 = MASTERED.
4. **Derivation is real-data-only**: `refreshReviewSchedule` reads the student's REAL
   `stage_progressions` rows (PHASE-17): stages with failed attempts get a box-1 DUE item;
   a REAL pass (ADVANCED) promotes the item one box exactly once (`lastOutcome` guard makes
   replays idempotent). No synthetic seeds, no new data source.
5. Canonical capability `packages/database/src/spaced/capability.ts` (ALL SQL, withTenant
   everywhere) + thin `/v1/spaced-review` adapter (NO SQL; zod-validated; student `/mine`
   surfaces with mandatory Idempotency-Key; staff refresh/due surfaces role-gated;
   completion logging is fire-and-forget §3.3 semantics reusing the 0011 vocabulary).

## Alternatives rejected
- **A third-party SRS library (fsrs/ts-fsrs/smite)**: the §3.5 policy is ONE ladder + one
  reset rule around two small tables; a dependency cannot be justified and would violate
  the reuse-first contract — rejected (DEV-018).
- **Deriving items from synthetic/sampled content catalogs**: §3.5 requires review of
  ACTUALLY-attempted material; anything else is fake data — rejected.
- **Blocking early review**: pedagogically wrong and unenforceable without client clock
  trust — early completion is allowed and simply schedules the NEXT box from completion
  time — rejected as a gate.

## Consequences
- The gate `tests/core-32/p18-spaced-review-engine.e2e.test.ts` proves the full ladder
  (1→3→7), the lapse reset (→1), real-data derivation, idempotent replays, RLS fail-closed
  and role gates on a real app + real PG + real Redis with no mocks.
