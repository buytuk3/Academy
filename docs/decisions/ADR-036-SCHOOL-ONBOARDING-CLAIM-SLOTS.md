# ADR-036 — PHASE-15 new migration 0010 (school onboarding + teacher claim slots)

- Date: 2026-09-18 · Phase: PHASE-15 (SCHOOL-ONBOARDING-AND-TEACHER-ASSIGNMENT) · Status: ACCEPTED
- Base: BuyTuk Academy 1.17 @ `9425131` (verified byte-by-byte at phase open, dirty=0)

## Context
The governing doc v2.1 (§3.1 + §3.2) mandates two new canonical capabilities:
pending-by-default school requests with explicit approval, and a subject×school
exclusive claim engine with a REAL atomic lock and an audited principal override.
The zero-new-migrations discipline (PHASE-7..14) holds "unless essential" — this
ADR documents why a new migration (0010) IS essential, per the binding rule
("new migration only when essential — ADR mandatory").

## Decision
Migration `0010_phase15_school_onboarding_teacher_assignment.sql` adds exactly
three tenant-scoped tables (RLS enabled+forced, 0007 mechanism):
1. `school_requests` — §3.1 pending-by-default requests; the approval decision
   (CAS on status='PENDING') is the ONLY activation path; approval creates the
   school in the same transaction.
2. `teaching_slots` — canonical subject×school board. The DB-level UNIQUE
   `(tenant_id, school_id, subject)` constraint IS the atomic lock, backed by a
   single-statement conditional UPDATE (CAS `claim_status='OPEN'→'CLAIMED'`) —
   two concurrent claims can never both win (structurally impossible, proven by
   the P15-4 real-concurrency test).
3. `teaching_slot_overrides` — the §3.2 principal exception (second/assistant
   teacher on a claimed slot) as an explicitly-flagged, audited row.

## Alternatives rejected
- **Reuse `staff_memberships`**: wrong semantics — memberships are access scopes,
  not exclusive per-subject claims; adding a uniqueness there would corrupt the
  PHASE-6..12 RBAC model.
- **JSON column on `schools`**: no atomic row lock, no RLS granularity, no
  idempotency keys — a concurrency bug by construction.
- **App-level locking (Redis/queue)**: the lock must survive process crashes and
  be enforceable by the DB itself (fail-closed), not by an orchestrator.
- **No migration (defer)**: §3.1/§3.2 cannot exist without persistence; deferral
  would fake the gate.

## Consequences
- Non-destructive, additive-only; no existing table/column altered; RLS policy
  names follow the 0007 template; idempotency via `(tenant_id, operation_key)`
  UNIQUE everywhere (0008/0009 template).
- Teachers remain multi-school by design (no uniqueness on teacher×anything).
