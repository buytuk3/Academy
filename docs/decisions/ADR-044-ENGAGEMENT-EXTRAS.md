# ADR-044 — PHASE-23: engagement extras (صرف النقاط / الملاحظات / الدعم) on the existing wallet + transactional idempotency (zero new dependencies)

- Date: 2026-09-20 · Phase: PHASE-23 (STUDENT-ENGAGEMENT-EXTRAS, governing doc §5.2.3 + §3.10 renumbered) · Status: ACCEPTED
- Base: BuyTuk Academy 1.25 @ `19b829c` (PHASE-22 close; verified at phase open: sha256
  `644c713baf928c9406e15a6e3ee1c93cb545c74b189f3e9aa404606e31328176`, size 457,421,298 B,
  tar -tzf exit 0 / 5,737 entries, dirty=0, 76 commits)

## Context
Governing doc §5.2.3 mandates a wallet/points system: كسب النقاط من الإنجازات (earning —
already live since PHASE-11 via creditWallet) and **صرف النقاط في المتجر** (spending —
this phase), plus staff notes about students and a support channel.

## Decision
1. **Zero new dependencies; the point balance stays in the EXISTING `wallet_accounts`**
   (0009 — balance + UNIQUE per student). No second balance store is created.
2. Migration `0018_phase23_engagement_extras.sql` (additive-only):
   `point_redemptions` (the redemption ledger: item, cost > 0, idempotency) +
   `student_notes` (authorship + category CHECK ACADEMIC/BEHAVIORAL/GENERAL) +
   `support_tickets` (subject/body, status OPEN/RESOLVED, resolve metadata). All RLS
   enabled+forced (0007 mechanism, fail-closed).
3. **THE atomic redemption** (P15-4 pattern + transactional guard):
   (a) INSERT the redemption row FIRST — UNIQUE(tenant,operation_key) + ON CONFLICT DO
   NOTHING → a replay returns the EXISTING redemption with NO second debit;
   (b) then ONE conditional debit UPDATE on wallet_accounts; an insufficient balance
   THROWS `INSUFFICIENT_BALANCE` (409) which ROLLS THE WHOLE TRANSACTION BACK — no
   phantom redemption row survives a failed debit; parallel same-key calls converge
   (PostgreSQL ON CONFLICT semantics: the loser either observes the winner's committed
   row or inserts its own if the winner aborted).
4. Notes and tickets are idempotent by (tenant, operation_key); the ticket resolve is
   the P15-4-proven CAS (single conditional UPDATE OPEN→RESOLVED with the resolve key
   persisted inside the same statement; parallel + replay converge).
5. Canonical capability `engagement/extras.ts` (ALL SQL, withTenant everywhere) + thin
   `/v1` surfaces: `/points/redeem` + `/points/redemptions/mine` (student-only),
   `/notes` (staff write/read), `/support/tickets` (+`/resolve`, staff; creation open to
   any authenticated member). Fire-and-forget §3.3 events (0011 ATTEMPT_SUBMIT class
   reuse — no new event class), operation keys derived from the SAME Idempotency-Key.

## Alternatives rejected
- **A new points/ledger store for redemptions**: would fork the balance of record —
  rejected (wallet_accounts IS the balance; redemptions are its audit trail).
- **Debit via read-modify-write (SELECT balance then UPDATE)**: a race window — the
  balance guard must live INSIDE the UPDATE (P15-4 binding) — rejected.
- **External ticketing/notes services**: new dependencies for two small tables —
  rejected (DEV-023).

## Consequences
- The gate `tests/core-32/p23-engagement-extras.e2e.test.ts` proves on a real app +
  real PG + real Redis (no mocks): exact atomic debit (100−30=70), replay convergence
  (same id, no second debit), over-redemption 409 with balance untouched (rollback),
  notes idempotency + visibility, ticket lifecycle with atomic resolve, RLS fail-closed
  (tenant-B zero rows), role gates, and exactly-one §3.3 event per unique key.
