# PHASE-24 CHARTER — NOTIFICATIONS (governing doc §5.2.4)

- Date: 2026-09-20 · Base: BuyTuk Academy 1.26 @ `00161f2` (byte-verified this phase: sha256 `f97e476c…4d04`, 457,528,144 B, tar -tzf exit 0 / 5,804 entries, dirty=0, 79 commits)
- Constraints honored: additive-only migration (0019, ADR-045); RLS enabled+forced
  fail-closed (0007 mechanism) on both new tables; atomic CAS mark-read (P15-4
  pattern); per-user channel prefs via UNIQUE upsert; fire-and-forget §3.3 logging;
  thin SQL-free adapters; ZERO new dependencies — transports (WebSocket/email/FCM)
  explicitly deferred (DEV-024).

## Gates (fixed in advance — OPEN gates never PASS)
| Gate | Definition of PASS |
|---|---|
| MIG-1 | migration 0019 applies (idempotent re-run safe); RLS enabled+forced on `notifications` + `notification_prefs`; op_uniq / user_uniq UNIQUEs present |
| P24-1 | staff creates a notification for a SAME-tenant user (idempotent replay → SAME id, no duplicate); cross-tenant recipient → 404 RECIPIENT_NOT_FOUND (fail-closed); student 403 on the staff surface |
| P24-2 | recipient center: /mine shows the row; unread-count 1 → atomic CAS mark-read (changed=true, readAt set) → replay converges (changed=false, existed=true) → unread-count 0 |
| P24-3 | §5.2.4 تخصيص: per-user channel prefs upsert (create → update, naturally idempotent); another tenant's user sees no prefs (null) |
| P24-4 | tenant isolation + §3.3 fire-and-forget: tenant-B staff sees ZERO tenant-A notifications; exactly one event per unique key on the interaction stream (create + read; replays collapse) |
| REG-0 | typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file (17 files through p23 + p24), secret scans 0+0, diff-check clean — all exit 0 |
| CLOSURE | STAGE_STATUS/CDR/PROJECT_VERSION (1.27 adoption) + MASTER_ROADMAP updated + independent closeout report + single-file archive uploaded in-conversation (sha256/size/tar -tzf proof) + uploaded to the OWNER'S gofile account via the saved token with the RAW server-response md5 compared character-by-character |
