# ADR-037 — PHASE-16 new migration 0011: dedicated interaction-events table

- Date: 2026-09-19 · Phase: PHASE-16 (INTERACTION-EVENT-LOG) · Status: ACCEPTED
- Base: BuyTuk Academy 1.18 @ `baf4247` (verified byte-by-byte at phase open: sha256
  `8f4255ee…56a99`, size 456,683,607 B, extract exit 0, carried `.git` @ baf4247 dirty=0)

## Context
Governing doc v2.1 §3.3 mandates a DEDICATED interaction event stream recording every
login/attempt/error/retry with its real wall-clock timestamp — explicitly separate from
the canonical evidence table. The zero-new-migrations discipline (PHASE-7..15) holds
"unless essential — ADR mandatory". This ADR documents essentiality.

## Decision
Migration `0011_phase16_interaction_event_log.sql` adds ONE tenant-scoped table
(`interaction_events`, RLS enabled+forced per the 0007 mechanism) with:
- 7-class event vocabulary (LOGIN / LOGIN_FAILED / LOGOUT / ATTEMPT_START /
  ATTEMPT_SUBMIT / ATTEMPT_FAILED / ERROR) enforced by CHECK;
- `(tenant_id, operation_key)` UNIQUE idempotency (0008/0009 template) — replays
  (e.g. an idempotent attempt-start retry) collapse to one row;
- real `occurred_at timestamptz DEFAULT now()` (DB clock, not client clock) +
  (tenant, student, occurred_at) and (tenant, event_type, occurred_at) indexes;
- loose text references (school/class/attempt) so the log survives deletions —
  it is an audit stream, not a live relational graph.

## Alternatives rejected
- **Reuse `evidence`**: evidence rows are canonical FINAL results with chain-of-custody
  semantics and engine-owned writers (CORE-25 WAVE-4A). Mixing high-frequency behavioral
  events into it would corrupt the evidence contract §3.3 explicitly forbids.
- **App-level file/stdout logging**: not tenant-scoped, not queryable by the teacher/
  principal surfaces, no RLS — fails the security model.
- **Reusing BullMQ job records**: queue metadata is transport state, not an interaction
  audit stream; jobs are ephemeral by design.
- **No migration (defer)**: §3.3 cannot exist without persistence.

## Consequences
- Event writes are fire-and-forget at the adapter (`logInteractionEvent` never throws) —
  the learning loop can never fail because of logging; log gaps would surface via the
  PHASE-12 metrics counters, never via a broken request.
- Additive-only; no existing table altered; Express 5 gateway (ADR-029) untouched.
