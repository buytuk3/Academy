# ADR-045 — NOTIFICATIONS (governing doc §5.2.4)

- Status: ACCEPTED — 2026-09-20 (PHASE-24)
- Base: BuyTuk Academy 1.26 @ `00161f2` (PHASE-23 close)

## Context
§5.2.4 requires a notification center with immediate notifications and
per-role customization. The reference stack suggests socket.io (WebSocket),
Nodemailer (email) and Firebase Admin (push) — three new runtime dependencies.

## Decision (REUSE-FIRST — zero new dependencies, DEV-024)
1. **PHASE-24 builds the NOTIFICATION CENTER**: persistence (`notifications`,
   `notification_prefs` — migration 0019, additive-only), the canonical
   capability (ALL SQL inside withTenant — 0007 RLS fail-closed), a thin /v1
   adapter (zero SQL; Idempotency-Key required; atomic CAS mark-read), and a
   REAL E2E gate (real Express + real PostgreSQL + real Redis).
2. **The balance of the atomicity pattern**: mark-read is ONE conditional
   UPDATE (read_at IS NULL inside the WHERE; read_operation_key persisted in
   the same statement) — the P15-4-proven CAS; replays and parallel calls
   converge (changed=false, existed=true).
3. **Per-user channel prefs** (§5.2.4 تخصيص الإشعارات): upsert by
   UNIQUE(tenant,user) — naturally idempotent, no operation key needed.
4. **TRANSPORTS ARE DEFERRED**: WebSocket/email/PUSH delivery is explicitly
   deferred (recorded as DEV-024 in the CDR). No socket.io, no nodemailer,
   no firebase-admin in package.json — ZERO new dependencies. The center's
   read model is the only surface the transports will consume when a later
   phase (with an approved dependency decision) adds them.

## Consequences
- The notification center is real, tested and RLS-isolated now; delivery
  channels arrive later without re-shaping the data model.
- Fail-closed recipient validation: a notification can only target a user of
  the SAME tenant (usersTable check inside the same transaction) — no
  cross-tenant targeting even by a buggy staff client.
- §3.3 fire-and-forget events reuse the 0011 vocabulary (ATTEMPT_SUBMIT
  class) with keys derived from the idempotency key (replays collapse).
