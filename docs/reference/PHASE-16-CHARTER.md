# PHASE-16 CHARTER — INTERACTION-EVENT-LOG (governing doc v2.1 §3.3)

Base: verified BuyTuk Academy 1.18 @ `baf4247` (byte-verified at phase open: archive sha256
`8f4255ee…56a99`, 456,683,607 B, extract exit 0, carried `.git` @ `baf4247` dirty=0; fresh
`sha256sum` + `git log -1` re-run this phase, never from memory). PHASE-13 (DEP-001) stays
OPEN-BLOCKED per DEV-014 and the 2026-09-19 final ruling (PHASE-13 executes LAST, after
PHASE-26) — binding preamble on every closeout.

## Gates (fixed in advance — OPEN gates never PASS)
- **EVT-1 (dedicated stream, real timestamps)** — migration 0011 `interaction_events`
  (separate from `evidence` per ADR-037); every event carries DB-clock `occurred_at`
  within the real test window; proven by the new E2E gate on the real app+PG.
- **EVT-2 (coverage of §3.3 verbs)** — real logins (staff + student) → LOGIN; failed
  student login → LOGIN_FAILED; attempt start (idempotent replay collapses, no dup row);
  attempt submit → ATTEMPT_SUBMIT. All through the REAL /v1 endpoints.
- **EVT-3 (fire-and-forget)** — logging failures never break the main request
  (`logInteractionEvent` swallows; the request contract is unchanged).
- **EVT-4 (isolation)** — tenant-B sees ONLY tenant-B events (RLS fail-closed);
  student `/mine` returns own rows only; staff listing is role-gated (student → 403).
- **MIG-1** — new migration 0011 justified by **ADR-037** (essential; alternatives rejected).
- **REG-0** — zero regressions: typecheck, build, db/obs/worker/api/engine, ALL core-32
  official files per-file (p1…p11 + auth-sec + p15 + p16), E1, E4, secret scans, diff-check.
- **Closeout** — STAGE_STATUS (PHASE-16 CLOSED/PASS per v2.1), CDR (DEV-016 final
  sequencing ruling: PHASE-13 LAST after PHASE-26), PROJECT_VERSION (**BuyTuk Academy 1.19**),
  closeout report + gates ledger + raw exit codes, and the new single-file reference via
  D-3/D-12 — sha256 + exact size + `tar -tzf` verified BEFORE any link, **and the archive
  itself uploaded in-conversation for byte-level verification (ruling 2026-09-19 §4)**.
