# PHASE-27 CLOSEOUT — STUCK-POINT-DETECTION-AND-MANAGER-ALERT-ENGINE (§3.10) — 2026-09-21

- Base: BuyTuk Academy 1.29 @ `feb764f` (PHASE-26 close; chain byte-verified: sha256
  `c0ef596733863e72c85f615a2642c44ccb81687c576e0d461e6f4547a668df7a`, size 457,843,174 B,
  tar -tzf exit 0 / 6,014 entries, dirty=0, 92 commits)
- Code commit: `6fa9528` · Close commit: recorded in the version chain below
- Preamble (binding): PHASE-13 (AI-RUNTIME-PROOF / DEP-001) is the ONLY remaining phase —
  per the binding 2026-09-19 ruling (updated 2026-09-21: PHASE-27 inserted before it) it runs with the
  management-approved GPU budget ($3–5, RunPod); it cannot execute in this environment (no GPU) —
  DEP-001 stays NOT VERIFIED.

## What was built (additive-only; ADR-048 — ZERO new dependencies, DEV-027)
1. Migration `0021_phase27_stuck_point_alerts.sql`: `stuck_point_alerts` —
   UNIQUE(tenant, source_event_id) = the ATOMIC dedup (+ UNIQUE(tenant,
   alert_operation_key)); alert-level operation_type CHECK (LOGIN/READING/
   DICTATION/NUMERACY/ASSESSMENT/PAYMENT/SUPPORT/GENERAL); notified rosters.
   RLS enabled+forced (0007 mechanism, fail-closed).
2. SINGLE-SOURCE HOOK on the ONE interaction_events write path
   (logInteractionEvent): failure classes are the 0011 vocabulary's OWN
   LOGIN_FAILED/ERROR — the 0011 CHECK is NOT altered; the alert is raised
   FROM the real event row (actor, role, real DB-clock timestamp, student→school
   chain, reason) — unknown id → 404 STUCK_EVENT_NOT_FOUND (zero fabrication).
   Redemption failures (INSUFFICIENT_BALANCE, PHASE-23) now log REAL ERROR
   events (surface points/redeem) on the same path.
3. IMMEDIATE first-failure trigger — no aggregation, no threshold, no cron.
4. RECIPIENTS ALWAYS BOTH: every tenant principal + every tenant admin — no
   exception by failure kind.
5. DELIVERY RIDES PHASE-24 ONLY: fan-out into the 0019 notifications table in
   the SAME transaction (all-or-nothing); mandatory payload (actor identity +
   operation type + real timestamp + source event id) in ref AND body.
6. Thin /v1/stuck-points adapter (zero SQL): staff listing + idempotent
   evaluate (replay converges — no double delivery).

## Gates (all exit 0 — full register in /home/user/phase27_logs/exit_codes.txt)
MIG-1 (migrate + RLS 1/1 forced + policies 1/1), P27 gate 3/3 PASS, REG-0 full
matrix (typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file
×21 incl. p15 6/6 + p16 + p17 + p18 + p19 + p20 + p21 + p22 + p23 + p24 + p25 +
p26 + p27, auth-security, secret-diff 0, secret-tree 0, diff-check clean).
