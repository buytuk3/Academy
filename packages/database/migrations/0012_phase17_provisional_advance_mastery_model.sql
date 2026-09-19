-- PHASE-17 — PROVISIONAL-ADVANCE-MASTERY-MODEL (governing doc v2.1 §3.4)
-- Non-destructive; additive only (ADR-038). Templates: 0009/0010/0011 —
-- (tenant_id, operation_key) UNIQUE idempotency; RLS enabled+forced per the
-- 0007 mechanism (fail-closed). The §3.4 state machine:
--   3 attempts on a stage → AT MOST ONE PROVISIONAL advance (exactly one
--   attempt consumed from the next stage's budget) → a PROVISIONAL stage
--   repeats automatically until passed → on success NO stage in between is
--   re-visited → the educational debt is NEVER cleared by the provisional
--   advance (debt_status carries it; only a real pass closes the gap).

CREATE TABLE IF NOT EXISTS stage_progressions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  stage_key text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','PROVISIONAL','ADVANCED','REPEATING','CLOSED')),
  advanced_from_stage text,
  advance_seq integer NOT NULL DEFAULT 0,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  provisional_budget_used integer NOT NULL DEFAULT 0 CHECK (provisional_budget_used IN (0,1)),
  debt_status text NOT NULL DEFAULT 'NONE'
    CHECK (debt_status IN ('NONE','PROVISIONAL_PENDING','CLEARED_BY_REAL_PASS','CLEARED_BY_REAL_PASS_WITH_DEBT_CARRIED')),
  last_attempt_id text,
  chain_head text,
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- THE §3.4 atomic lock: at most ONE progression row per (student, stage)
  CONSTRAINT stage_progressions_lock UNIQUE (tenant_id, student_id, stage_key),
  CONSTRAINT stage_progressions_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS stage_progressions_student_idx
  ON stage_progressions (tenant_id, student_id, status);

ALTER TABLE stage_progressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_progressions FORCE ROW LEVEL SECURITY;
-- idempotent policy creation (PostgreSQL has no CREATE POLICY IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'stage_progressions'
                   AND policyname = 'stage_progressions_tenant_isolation') THEN
    CREATE POLICY stage_progressions_tenant_isolation ON stage_progressions
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;

-- §3.4 promotion ledger — append-only audit of every provisional/real transition
CREATE TABLE IF NOT EXISTS stage_promotions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  from_stage text NOT NULL,
  to_stage text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('PROVISIONAL','REAL')),
  budget_used integer NOT NULL DEFAULT 0 CHECK (budget_used IN (0,1)),
  debt_carried boolean NOT NULL DEFAULT false,
  source_attempt_id text,
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stage_promotions_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS stage_promotions_student_idx
  ON stage_promotions (tenant_id, student_id, created_at);

ALTER TABLE stage_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_promotions FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'stage_promotions'
                   AND policyname = 'stage_promotions_tenant_isolation') THEN
    CREATE POLICY stage_promotions_tenant_isolation ON stage_promotions
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;
