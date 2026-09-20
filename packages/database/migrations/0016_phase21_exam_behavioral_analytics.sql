-- PHASE-21 — EXAM-BEHAVIORAL-ANALYTICS (governing doc v2.1 §3.9)
-- Non-destructive; additive only (ADR-042). Templates: 0009-0015 —
-- (tenant_id, operation_key) UNIQUE idempotency; RLS enabled+forced per the
-- 0007 mechanism (fail-closed). §3.9 semantics: ALL analytics are derived
-- ONLY from the REAL interaction_events stream (PHASE-16, migration 0011 —
-- ATTEMPT_START / ATTEMPT_SUBMIT / ATTEMPT_FAILED with occurred_at = the DB
-- clock) joined through the canonical attempt→evidence chain for
-- correct/wrong classification. NO synthetic seeds, NO new data source.
-- The snapshot table exists so the principal class/school dashboard reads
-- ONE pre-computed row per student instead of re-scanning the whole stream;
-- the dashboard uses ONLY existing RLS read paths (no new access logic).

CREATE TABLE IF NOT EXISTS exam_behavior_snapshots (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  class_id text,
  school_id text,
  questions_started integer NOT NULL DEFAULT 0 CHECK (questions_started >= 0),
  submissions integer NOT NULL DEFAULT 0 CHECK (submissions >= 0),
  answer_changes integer NOT NULL DEFAULT 0 CHECK (answer_changes >= 0),
  avg_time_ms bigint NOT NULL DEFAULT 0 CHECK (avg_time_ms >= 0),
  correct_count integer NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  wrong_count integer NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
  failed_events integer NOT NULL DEFAULT 0 CHECK (failed_events >= 0),
  sequence jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  engine_version text NOT NULL,
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_behavior_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS exam_behavior_class_idx
  ON exam_behavior_snapshots (tenant_id, class_id, created_at);
CREATE INDEX IF NOT EXISTS exam_behavior_student_idx
  ON exam_behavior_snapshots (tenant_id, student_id, created_at);

ALTER TABLE exam_behavior_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_behavior_snapshots FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'exam_behavior_snapshots'
                   AND policyname = 'exam_behavior_snapshots_tenant_isolation') THEN
    CREATE POLICY exam_behavior_snapshots_tenant_isolation ON exam_behavior_snapshots
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;
