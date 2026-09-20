-- PHASE-19 — CROSS-STAGE-ESCALATION-ENGINE (governing doc v2.1 §3.6)
-- Non-destructive; additive only (ADR-040). Templates: 0009-0013 —
-- (tenant_id, operation_key) UNIQUE idempotency; RLS enabled+forced per the
-- 0007 mechanism (fail-closed). §3.6 semantics (fixed by the governing doc):
-- a SIGNIFICANT learning gap is detected from the REAL §3.4 progression
-- stream only: an open educational debt (PROVISIONAL_PENDING) on one stage
-- PLUS persistent failure (>= ESCALATION_GAP_ATTEMPT_THRESHOLD failed
-- attempts) on ANOTHER stage = a cross-stage gap → the engine AUTOMATICALLY
-- raises ONE escalation row to the teaching staff (atomic lock; idempotent
-- re-evaluation never duplicates); the teacher acknowledges (single
-- conditional UPDATE — the P15-4 pattern). No scheduler/queue dependency —
-- evaluation is explicit and idempotent (ADR-040, DEV-019).

CREATE TABLE IF NOT EXISTS stage_escalations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  from_stage text NOT NULL,
  to_stage text NOT NULL,
  severity text NOT NULL DEFAULT 'HIGH' CHECK (severity IN ('HIGH','CRITICAL')),
  debt_status_snapshot text NOT NULL,
  failed_attempts_total integer NOT NULL DEFAULT 0 CHECK (failed_attempts_total >= 0),
  trigger_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  acknowledged_by text,
  acknowledged_at timestamptz,
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- THE §3.6 atomic lock: ONE escalation per (student, debt-stage, gap-stage)
  CONSTRAINT stage_escalations_lock UNIQUE (tenant_id, student_id, from_stage, to_stage),
  CONSTRAINT stage_escalations_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS stage_escalations_status_idx
  ON stage_escalations (tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS stage_escalations_student_idx
  ON stage_escalations (tenant_id, student_id, created_at);

ALTER TABLE stage_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_escalations FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'stage_escalations'
                   AND policyname = 'stage_escalations_tenant_isolation') THEN
    CREATE POLICY stage_escalations_tenant_isolation ON stage_escalations
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;
