# ADR-048 — STUCK-POINT-DETECTION-AND-MANAGER-ALERT-ENGINE (§3.10 addition)

- Status: ACCEPTED — 2026-09-21 (PHASE-27; management decision inserting this
  phase BEFORE PHASE-13)
- Base: BuyTuk Academy 1.29 @ `feb764f` (PHASE-26 close)

## Context
Management requirement (§3.10 addition): monitor any REAL failure any user hits
at any interaction point (login, reading, dictation, payment/points) and alert
the school manager AND the system manager TOGETHER at the FIRST failure — no
repeat threshold. Possible shapes: a new delivery pipeline (email/queue/push —
new dependencies), a cron scanner over interaction_events, or per-request
direct sends (double-delivery risk).

## Decision (REUSE-FIRST — zero new dependencies, DEV-027)
1. **SINGLE SOURCE, ZERO FABRICATION**: the detector is a HOOK on the existing
   `interaction_events` write path (the single `logInteractionEvent` wrapper —
   every adapter already funnels through it). Failure classes are the 0011
   vocabulary's OWN `LOGIN_FAILED` and `ERROR` — **the 0011 CHECK is NOT
   altered**. `INSUFFICIENT_BALANCE` (PHASE-23) is a capability error code, so
   its redemption-failure path now logs a REAL `ERROR` event (surface
   `points/redeem`) on the same 0011 path — the alert derives EVERYTHING from
   the real event row (actor, role, real DB-clock timestamp, student→school
   chain, reason) inside the transaction; an unknown event id is a hard 404
   (`STUCK_EVENT_NOT_FOUND`) — nothing is ever invented.
2. **IMMEDIATE**: the hook fires per event write — the FIRST failure raises
   the alert at once; no aggregation, no threshold, no cron scanner.
3. **RECIPIENTS ALWAYS BOTH**: every tenant principal (school management,
   resolved via the stuck student's real class→school chain when present) AND
   every tenant admin (role='admin') — no exception by failure kind.
4. **DELIVERY RIDES PHASE-24 ONLY**: the fan-out inserts into the 0019
   notifications table inside the SAME transaction as the alert row —
   all-or-nothing; recipients read their centers via the EXISTING
   `/v1/notifications/mine`. NO new channel (no email/queue/push deps).
5. **ATOMIC DEDUP**: new table `stuck_point_alerts` (migration 0021,
   additive-only) with UNIQUE(tenant_id, source_event_id) + INSERT ... ON
   CONFLICT DO NOTHING (the P15-4 pattern) — the same source event can NEVER
   alert twice; replays converge (existed=true, notified=[]). RLS enabled+
   forced per the 0007 mechanism (fail-closed).
6. **MANDATORY PAYLOAD**: stuck user identity (actorId+role), operation type
   (alert-level taxonomy: LOGIN/READING/DICTATION/NUMERACY/ASSESSMENT/PAYMENT/
   SUPPORT/GENERAL — derived from the real event), the event's REAL timestamp,
   and the source event id — in the notification ref AND body, linking every
   alert to its original event log.

## Consequences
- Zero new dependencies, zero package.json changes; no scheduler; no new
  delivery channel. The alert surface (`/v1/stuck-points` + `evaluate`) is
  staff-only; tenant isolation is DB-enforced and gate-asserted.
- Alert volume equals real failure volume (immediate, per-event) — the dedup
  table is the audit trail and the replay guard at once.
- PHASE-13 (AI-RUNTIME-PROOF / DEP-001) remains the ONLY phase after this —
  per the binding 2026-09-19 ruling (updated 2026-09-21: PHASE-27 inserted
  before it) it runs with the management-approved GPU budget ($3–5, RunPod)
  and cannot start in this environment.
