# PHASE-23 CHARTER — STUDENT-ENGAGEMENT-EXTRAS (governing doc §5.2.3 + §3.10 renumbered)

- Date: 2026-09-20 · Base: BuyTuk Academy 1.25 @ `19b829c` (byte-verified this phase: sha256 `644c713b…8176`, 457,421,298 B, tar -tzf exit 0 / 5,737 entries, dirty=0, 76 commits)
- Constraints honored: additive-only migration (0018, ADR-044); RLS enabled+forced
  fail-closed (0007 mechanism) on all three new tables; the balance stays in the
  EXISTING wallet_accounts (0009) — redemption is a SINGLE conditional debit UPDATE
  inside a transaction whose idempotency guard is the redemption row itself;
  fire-and-forget §3.3 logging; thin SQL-free adapters; ZERO new dependencies (DEV-023).

## Gates (fixed in advance — OPEN gates never PASS)
| Gate | Definition of PASS |
|---|---|
| MIG-1 | migration 0018 applies (idempotent re-run safe); RLS enabled+forced on `point_redemptions` + `student_notes` + `support_tickets`; op_uniq UNIQUEs present |
| P23-1 | §5.2.3 صرف: real redeem → exact atomic debit (100−30=70); replay with the SAME key → the SAME id, NO second debit (balance unchanged); over-redemption (cost>balance) → 409 INSUFFICIENT_BALANCE with the balance untouched (transaction rollback); redemption history = one row; staff 403 on the student surface |
| P23-2 | الملاحظات: staff adds a note for a tenant student (idempotent replay → same id); staff list + the audit trail show exactly one row |
| P23-3 | الدعم: the student opens a ticket (OPEN); staff list tenant-scoped; tenant-B staff sees ZERO tenant-A tickets (RLS fail-closed); atomic resolve (CAS; replay converges; RESOLVED + resolvedAt) |
| P23-4 | §3.3 fire-and-forget: exactly one event per unique key on the interaction stream (replays collapse) |
| REG-0 | typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file (16 files through p22 + p23), secret scans 0+0, diff-check clean — all exit 0 |
| CLOSURE | STAGE_STATUS/CDR/PROJECT_VERSION (1.26 adoption) + MASTER_ROADMAP updated + independent closeout report + single-file archive uploaded in-conversation (sha256/size/tar -tzf proof) + uploaded to the OWNER'S gofile account via the saved token with server-side md5/size echo match |
