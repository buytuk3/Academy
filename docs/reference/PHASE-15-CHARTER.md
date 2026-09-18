# PHASE-15 CHARTER — SCHOOL-ONBOARDING-AND-TEACHER-ASSIGNMENT (governing doc v2.1, §3.1 + §3.2)

Base: verified BuyTuk Academy 1.17 @ `9425131` (byte-verified at phase open: HEAD/TOTAL=43/dirty=0,
tag `BuyTuk.V0.1.3` intact, PG+Redis up). PHASE-13 (DEP-001) stays OPEN-BLOCKED per DEV-014 —
binding preamble on every closeout.

## Gates (fixed in advance — OPEN gates never PASS)
- **ONB-1 (§3.1 pending-by-default)** — school request → PENDING; idempotent retry; the requested
  school never auto-activates (must not appear in the schools dropdown until explicit approval).
- **ONB-2 (§3.1 explicit approval)** — principal/admin decision (APPROVED/REJECTED); APPROVED creates
  + links the school in the same transaction; idempotent same-decision 200; conflicting decision 409.
- **CLM-1 (§3.2 exclusivity)** — one slot per (subject × school): first claim 201, second claim 409
  `SLOT_ALREADY_CLAIMED`; different subject in the same school remains claimable.
- **CLM-2 (§3.2 atomic lock under real concurrency)** — two simultaneous claims on ONE slot →
  exactly one 201 and one 409 (both-winning structurally impossible).
- **CLM-3 (multi-school + audited override)** — a teacher holding Math@S1 can claim Math@S2 (201);
  principal override (SECOND/ASSISTANT/SPECIALIST) on a CLAIMED slot → audited row (idempotent dup 200);
  override on an OPEN slot → 409 `OVERRIDE_SLOT_NOT_CLAIMED`.
- **ISO-1 (RLS fail-closed)** — tenant-B sees zero slots of tenant-A; cross-tenant claim → 404.
- **MIG-1** — new migration 0010 justified by **ADR-036** (essential, alternatives rejected).
- **REG-0** — full matrix exit 0: typecheck, build, db/obs/worker/api/engine, ALL core-32 official
  files per-file (p1…p11 + auth-sec + p15), E1, E4, secret scans, diff-check.
- **Closeout** — STAGE_STATUS (PHASE-15 CLOSED/PASS per v2.1 numbering), CDR (DEV-014 preamble
  + DEV-015 renumbering record), PROJECT_VERSION (**BuyTuk Academy 1.18**), standalone closeout
  report + gates ledger + raw exit codes, and the new single-file reference via D-3/D-12
  (sha256 + exact size + `tar -tzf` verified BEFORE any link is shared).
