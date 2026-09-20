# PHASE-23 CLOSEOUT — STUDENT-ENGAGEMENT-EXTRAS (§5.2.3 + §3.10 renumbered) — 2026-09-20

- Base: BuyTuk Academy 1.25 @ `19b829c` (PHASE-22 close; byte-verified at phase open: sha256
  `644c713baf928c9406e15a6e3ee1c93cb545c74b189f3e9aa404606e31328176`, size 457,421,298 B,
  tar -tzf exit 0 / 5,737 entries, dirty=0, 76 commits)
- Code commit: `8bbb667` · Close commit: recorded in the version chain below
- Preamble (binding): PHASE-13 (AI-RUNTIME-PROOF / DEP-001) remains OPEN — LAST after PHASE-26 (2026-09-19 ruling).

## What was built (additive-only; ADR-044 — ZERO new dependencies, DEV-023)
1. Migration `0018_phase23_engagement_extras.sql`: `point_redemptions` (redemption
   ledger) + `student_notes` (category CHECK) + `support_tickets` (status lifecycle +
   resolve metadata). All RLS enabled+forced (0007 mechanism, fail-closed).
2. The balance stays in the EXISTING wallet_accounts (0009). THE ATOMIC REDEMPTION:
   the redemption-row INSERT is the idempotency guard (ON CONFLICT DO NOTHING — a
   replay returns the SAME redemption with NO second debit), then ONE conditional
   debit UPDATE (balance>=cost inside the UPDATE — the P15-4 pattern); an insufficient
   balance THROWS INSUFFICIENT_BALANCE (409) rolling the whole transaction back —
   no phantom redemption row.
3. Ticket resolve = the P15-4-proven CAS (single conditional UPDATE with the resolve
   key persisted inside the same statement; parallel + replay converge).
4. Canonical capability `engagement/extras.ts` (ALL SQL, withTenant everywhere) + thin
   /v1 adapter (Idempotency-Key required; row keys AND §3.3 event keys derive from it;
   fire-and-forget ATTEMPT_SUBMIT-class events — 0011 vocabulary reuse).

## Gates (all exit 0 — full register in /home/user/phase23_logs/exit_codes.txt)
MIG-1 (migrate+RLS+policy checks), P23 gate 4/4 PASS, REG-0 full matrix
(typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file ×17
incl. p15 6/6 + p16 + p17 + p18 + p19 + p20 + p21 + p22 + p23, auth-security,
secret-diff 0, secret-tree 0, diff-check clean).
