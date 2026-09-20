# ADR-040 — PHASE-19: cross-stage escalation engine on the §3.4 progression stream (reuse-first, ZERO new dependencies)

- Date: 2026-09-20 · Phase: PHASE-19 (CROSS-STAGE-ESCALATION-ENGINE, governing doc v2.1 §3.6) · Status: ACCEPTED
- Base: BuyTuk Academy 1.21 @ `2e74584` (PHASE-18 close; verified at phase open: sha256
  `f872da5018b18937f324478988ccf3a9d68436ea73f5f355daefc893fbccede9`, size 457,011,129 B,
  tar -tzf exit 0 / 5,447 entries, dirty=0, 63 commits)

## Context
Governing doc v2.1 §3.6 mandates AUTOMATIC teacher escalation for significant learning gaps —
cross-stage: a student who carries an open educational debt (§3.4 provisional advance) while
the gap PERSISTS on another stage must be raised to the teaching staff without anyone having
to watch a dashboard.

## Decision
1. **Zero new dependencies, no scheduler/queue** (DEV-019): the §3.6 trigger is fully
   derivable from data the platform ALREADY records; evaluation is an explicit, idempotent
   staff/API call over the canonical capability — a future worker can call the SAME
   capability without any interface change. No npm dependency, no cron, no queue.
2. Migration `0014_phase19_cross_stage_escalation_engine.sql` (additive-only):
   `stage_escalations` — UNIQUE(tenant,student,from_stage,to_stage) = the atomic lock;
   severity CHECK (HIGH/CRITICAL); status OPEN/ACKNOWLEDGED/RESOLVED; a debt snapshot +
   trigger_summary jsonb so the record is self-explanatory at ack time; RLS enabled+forced
   (0007 mechanism, fail-closed).
3. **§3.6 trigger (real-data-only)**: OPEN debt (`debt_status = PROVISIONAL_PENDING` from
   §3.4) on stage X **AND** persistent failure (≥ `ESCALATION_GAP_ATTEMPT_THRESHOLD = 2`
   failed attempts, status not ADVANCED/CLOSED) on ANOTHER stage Y → ONE escalation
   (severity HIGH; CRITICAL when Y has ≥3 failures). Re-evaluation never duplicates
   (UNIQUE + onConflictDoNothing) and never re-raises an acknowledged row.
4. **Acknowledgement** is a single conditional UPDATE (status OPEN → ACKNOWLEDGED,
   acknowledged_by/at) — the P15-4-proven atomic pattern; Idempotency-Key required at the
   adapter so replays collapse (one write, one event).
5. Canonical capability `packages/database/src/escalation/capability.ts` (ALL SQL,
   withTenant everywhere) + thin `/v1/escalations` adapter (NO SQL; staff surfaces
   role-gated; fire-and-forget §3.3 events reusing the 0011 ERROR class — no new event
   class needed).

## Alternatives rejected
- **Cron/queue-based background scanner (BullMQ repeatable jobs)**: a scheduler dependency
  and moving parts for a trigger that is one idempotent query — rejected (DEV-019); the
  capability interface is worker-compatible if a later phase mandates background scans.
- **Synthetic gap scoring from content catalogs**: §3.6 requires escalation from REAL
  attempt outcomes; anything else is fake data — rejected.
- **Per-ack email/notification side effects now**: notifications belong to the roadmap's
  notifications phase; the §3.3 interaction-stream alert already surfaces the escalation
  to staff surfaces — deferred, not rejected.

## Consequences
- The gate `tests/core-32/p19-cross-stage-escalation-engine.e2e.test.ts` proves: real-data
  derivation (debt + persistent gap → exactly ONE escalation), idempotent re-evaluation,
  atomic ack + replay convergence, no-gap → zero escalations, RLS fail-closed and role
  gates, on a real app + real PG + real Redis with no mocks.
