# PHASE-24 CLOSEOUT — NOTIFICATIONS (§5.2.4) — 2026-09-20

- Base: BuyTuk Academy 1.26 @ `00161f2` (PHASE-23 close; byte-verified at phase open: sha256
  `f97e476cb0fdb9d23e6e4f64c019da708631c7dd64143d640f6f351a4e944d04`, size 457,528,144 B,
  tar -tzf exit 0 / 5,804 entries, dirty=0, 79 commits)
- Code commit: `3fad020` · Close commit: recorded in the version chain below
- Preamble (binding): PHASE-13 (AI-RUNTIME-PROOF / DEP-001) remains OPEN — LAST after PHASE-26 (2026-09-19 ruling).

## What was built (additive-only; ADR-045 — ZERO new dependencies, DEV-024)
1. Migration `0019_phase24_notifications.sql`: `notifications` (recipient-scoped
   center; type CHECK; read metadata) + `notification_prefs` (per-user channel
   prefs, jsonb). Both RLS enabled+forced (0007 mechanism, fail-closed).
2. THE ATOMIC MARK-READ: ONE conditional UPDATE (read_at IS NULL inside the
   WHERE — the P15-4 CAS pattern) with read_operation_key persisted inside the
   same statement; replays and parallel calls converge (changed=false,
   existed=true); a non-recipient gets NOTIFICATION_NOT_FOUND (404).
3. §5.2.4 تخصيص الإشعارات: per-user channel prefs via UNIQUE(tenant,user)
   upsert — naturally idempotent.
4. Fail-closed recipient validation: the recipient must be a user of the SAME
   tenant (usersTable check inside the same transaction) — cross-tenant
   targeting → RECIPIENT_NOT_FOUND (404).
5. Canonical capability `notifications/capability.ts` (ALL SQL, withTenant
   everywhere) + thin /v1 adapter (Idempotency-Key required; row keys AND §3.3
   event keys derive from it; fire-and-forget ATTEMPT_SUBMIT-class events —
   0011 vocabulary reuse). TRANSPORTS (WebSocket/email/FCM) DEFERRED (DEV-024).

## Gates (all exit 0 — full register in /home/user/phase24_logs/exit_codes.txt)
MIG-1 (migrate + RLS=2/2 forced + policies=2/2), P24 gate 4/4 PASS, REG-0 full
matrix (typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file
×18 incl. p15 6/6 + p16 + p17 + p18 + p19 + p20 + p21 + p22 + p23 + p24,
auth-security, secret-diff 0, secret-tree 0, diff-check clean).
