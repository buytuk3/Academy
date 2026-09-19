-- PHASE-16 — INTERACTION-EVENT-LOG (governing doc v2.1 §3.3; non-destructive; additive only)
--
-- A dedicated HIGH-FREQUENCY event stream, fully SEPARATE from the canonical
-- `evidence` table (evidence = final results with chain-of-custody semantics;
-- interaction_events = every login/attempt/error/retry with its REAL wall-clock
-- timestamp). Necessity documented in ADR-037.
-- Template: 0008/0009 — tenant-scoped → RLS (0007 mechanism, fail-closed),
-- (tenant_id, operation_key) UNIQUE idempotency.

CREATE TABLE IF NOT EXISTS interaction_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text REFERENCES students(id) ON DELETE SET NULL,
  actor_id text NOT NULL,
  actor_role text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN
    ('LOGIN','LOGIN_FAILED','LOGOUT','ATTEMPT_START','ATTEMPT_SUBMIT','ATTEMPT_FAILED','ERROR')),
  school_id text,
  class_id text,
  attempt_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  operation_key text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interaction_events_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS interaction_events_student_idx
  ON interaction_events (tenant_id, student_id, occurred_at);
CREATE INDEX IF NOT EXISTS interaction_events_type_idx
  ON interaction_events (tenant_id, event_type, occurred_at);

ALTER TABLE interaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_events FORCE ROW LEVEL SECURITY;
CREATE POLICY interaction_events_tenant_isolation ON interaction_events
  USING (tenant_id = current_setting('app.tenant_id', true));
