# PHASE-27 CHARTER — STUCK-POINT-DETECTION-AND-MANAGER-ALERT-ENGINE (§3.10 addition)

- Date: 2026-09-21 · Base: BuyTuk Academy 1.29 @ `feb764f` (PHASE-26 close, byte-verified this chain: sha256 `c0ef5967…df7a`, 457,843,174 B, tar -tzf exit 0 / 6,014 entries, dirty=0, 92 commits)
- Management insertion (2026-09-21): this phase runs BEFORE PHASE-13; after its
  closure PHASE-13 (GPU) becomes the only remaining phase.
- Constraints honored: single source = interaction_events (0011 classes
  LOGIN_FAILED/ERROR — CHECK untouched); immediate first-failure trigger (no
  threshold); recipients ALWAYS principal(s)+admin(s) together; delivery ONLY
  via the PHASE-24 notifications table (0019) in the same transaction; alert
  payload mandatory (actor identity + operation type + real timestamp + source
  event id); additive migration 0021 with the atomic dedup UNIQUE(tenant,
  source_event_id) + RLS enabled+forced; ZERO new dependencies (ADR-048/DEV-027).

## Gates (fixed in advance — OPEN gates never PASS)
| Gate | Definition of PASS |
|---|---|
| MIG-1 | migration 0021 applies (idempotent re-run safe); RLS enabled+forced on `stuck_point_alerts`; source_uniq + op_uniq UNIQUEs present |
| P27-1 | a REAL failed student login (cross-tenant identity) → LOGIN_FAILED event → IMMEDIATE alert visible right after the 4xx: operationType LOGIN, actorId = attempted identity, real occurredAt, sourceEventId set; principal AND admin notification centers EACH show exactly one SYSTEM alert whose ref.sourceEventId === the alert's and whose body carries the actor id + ISO timestamp; idempotent evaluate replay → existed=true, notified=[], and NO second notification (no double delivery) |
| P27-2 | a REAL insufficient-balance redemption → 409 INSUFFICIENT_BALANCE → ERROR event on the 0011 path → alert operationType PAYMENT, failureReason INSUFFICIENT_BALANCE; the alert's sourceEventId EXISTS in the staff interaction-events listing (real linkage); principal center now shows exactly two SYSTEM alerts |
| P27-3 | fail-closed: student 403 on /v1/stuck-points; tenant-B staff sees ZERO tenant-A alerts; evaluate with a non-existent sourceEventId → 404 STUCK_EVENT_NOT_FOUND (no fabricated alerts) |
| REG-0 | typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file (21 files through p26 + p27), secret scans 0+0, diff-check clean — all exit 0 |
| CLOSURE | STAGE_STATUS/CDR/PROJECT_VERSION (1.30 adoption) + MASTER_ROADMAP updated (PHASE-27 row inserted; PHASE-13 note updated) + independent closeout report + single-file archive uploaded in-conversation (sha256/size/tar -tzf proof) + uploaded to the OWNER'S gofile account via the saved token with the RAW server-response md5 compared character-by-character |
