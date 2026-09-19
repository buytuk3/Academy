-- PHASE-18 — SPACED-REVIEW-ENGINE (governing doc v2.1 §3.5)
-- Non-destructive; additive only (ADR-039). Templates: 0009/0010/0011/0012 —
-- (tenant_id, operation_key) UNIQUE idempotency; RLS enabled+forced per the
-- 0007 mechanism (fail-closed). §3.5 semantics (fixed by the governing doc):
-- review items are derived ONLY from real attempt outcomes (the §3.4
-- stage_progressions stream — no new data source); a correct recall expands
-- the interval on the fixed ladder [1,3,7,14,30] days; a lapse resets the
-- item to box 1 (1 day); mastery = a correct recall at the top of the ladder.

CREATE TABLE IF NOT EXISTS review_items (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  stage_key text NOT NULL,
  item_key text NOT NULL,
  box integer NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
  interval_days integer NOT NULL DEFAULT 1 CHECK (interval_days IN (1,3,7,14,30)),
  due_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'DUE' CHECK (status IN ('DUE','SNOOZED','MASTERED')),
  last_outcome text NOT NULL DEFAULT 'FAILED_ATTEMPTS'
    CHECK (last_outcome IN ('FAILED_ATTEMPTS','REAL_PASS','REVIEW_PASS','REVIEW_LAPSE')),
  last_attempt_id text,
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- the atomic lock: at most ONE review item per (student, stage, item)
  CONSTRAINT review_items_lock UNIQUE (tenant_id, student_id, stage_key, item_key),
  CONSTRAINT review_items_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS review_items_due_idx
  ON review_items (tenant_id, student_id, status, due_at);

ALTER TABLE review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_items FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'review_items'
                   AND policyname = 'review_items_tenant_isolation') THEN
    CREATE POLICY review_items_tenant_isolation ON review_items
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;

-- §3.5 review ledger — append-only audit of every completion (box transitions)
CREATE TABLE IF NOT EXISTS review_completions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  item_id text NOT NULL,
  passed boolean NOT NULL,
  box_from integer NOT NULL CHECK (box_from BETWEEN 1 AND 5),
  box_to integer NOT NULL CHECK (box_to BETWEEN 1 AND 5),
  interval_days integer NOT NULL CHECK (interval_days IN (1,3,7,14,30)),
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_completions_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS review_completions_student_idx
  ON review_completions (tenant_id, student_id, created_at);

ALTER TABLE review_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_completions FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'review_completions'
                   AND policyname = 'review_completions_tenant_isolation') THEN
    CREATE POLICY review_completions_tenant_isolation ON review_completions
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;
