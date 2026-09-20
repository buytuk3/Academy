-- PHASE-25 — EXAMS-MODULE (governing doc §5.2.1: الامتحانات). Non-destructive;
-- additive only (ADR-046). Templates: 0009-0019 — (tenant_id, operation_key)
-- UNIQUE idempotency; RLS enabled+forced per the 0007 mechanism (fail-closed).
-- REUSE-FIRST (DEV-025): NO scheduler/proctoring dependencies — the exam
-- lifecycle is data-driven (opens_at/closes_at checked INSIDE the submission
-- transaction, fail-closed); auto-grading compares the submission answers
-- against the exam answer_key INSIDE the same transaction; the double-submit
-- guard is ATOMIC: UNIQUE(tenant_id, exam_id, student_id) + ON CONFLICT DO
-- NOTHING (the P15-4-proven pattern — replays with the SAME operation key
-- return the SAME submission; a different key is a genuine 409).

CREATE TABLE IF NOT EXISTS exams (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  class_id text,
  title text NOT NULL,
  subject text NOT NULL,
  answer_key jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')),
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exams_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS exams_class_idx
  ON exams (tenant_id, class_id);

ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'exams'
                   AND policyname = 'exams_tenant_isolation') THEN
    CREATE POLICY exams_tenant_isolation ON exams
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS exam_submissions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  exam_id text NOT NULL,
  student_id text NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}',
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  max_score integer NOT NULL DEFAULT 0 CHECK (max_score >= 0),
  operation_key text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_submissions_student_uniq UNIQUE (tenant_id, exam_id, student_id),
  CONSTRAINT exam_submissions_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS exam_submissions_exam_idx
  ON exam_submissions (tenant_id, exam_id, submitted_at);

ALTER TABLE exam_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_submissions FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'exam_submissions'
                   AND policyname = 'exam_submissions_tenant_isolation') THEN
    CREATE POLICY exam_submissions_tenant_isolation ON exam_submissions
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;
