-- ============================================================
-- CORE-07 — Learning Loop (migration 006). EXTENDS packages/database —
-- NO second database, NO evidence copy, NO SLR table, NO overall score.
-- Every table stores evidence REFERENCES only; every table is
-- (tenant_id, operation_key) UNIQUE for database-backed idempotency.
-- Staging-only artifact: never executed in Production without review.
-- ============================================================

CREATE TABLE IF NOT EXISTS learning_diagnoses (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id       TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  skill            TEXT NOT NULL,
  objective_id     TEXT,
  signal_key       TEXT NOT NULL,
  detected_at      TIMESTAMPTZ NOT NULL,
  evidence_refs    JSONB NOT NULL,                    -- evidence id refs only
  confidence       REAL NOT NULL,
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'candidate',
  source           TEXT NOT NULL,
  previous_diagnosis_id TEXT REFERENCES learning_diagnoses(id) ON DELETE SET NULL,
  operation_key    TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT learning_diagnoses_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS learning_diagnoses_student_idx ON learning_diagnoses (tenant_id, student_id);

CREATE TABLE IF NOT EXISTS intervention_proposals (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id       TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  diagnosis_id     TEXT NOT NULL REFERENCES learning_diagnoses(id) ON DELETE RESTRICT,
  skill            TEXT NOT NULL,
  activity_type    TEXT NOT NULL,
  config           JSONB,
  suggested_by     TEXT NOT NULL DEFAULT 'learning-loop',
  status           TEXT NOT NULL DEFAULT 'PENDING',
  original_proposal JSONB,
  decision         JSONB,   -- { action, actorId, actorRole, decidedAt, modifications?, rejectionReason? }
  decided_at       TIMESTAMPTZ,
  operation_key    TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intervention_proposals_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS intervention_proposals_student_idx ON intervention_proposals (tenant_id, student_id);

CREATE TABLE IF NOT EXISTS learning_reassessments (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id       TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  diagnosis_id     TEXT NOT NULL REFERENCES learning_diagnoses(id) ON DELETE RESTRICT,
  intervention_id  TEXT NOT NULL REFERENCES intervention_proposals(id) ON DELETE RESTRICT,
  skill            TEXT NOT NULL,
  activity_used    TEXT,
  occurred_at      TIMESTAMPTZ NOT NULL,
  baseline_evidence_ref      TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  reassessment_evidence_ref  TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  indicators       JSONB,
  trend            TEXT,
  operation_key    TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT learning_reassessments_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS learning_reassessments_student_idx ON learning_reassessments (tenant_id, student_id);

CREATE TABLE IF NOT EXISTS learning_outcomes (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id       TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  diagnosis_id     TEXT NOT NULL REFERENCES learning_diagnoses(id) ON DELETE RESTRICT,
  intervention_id  TEXT NOT NULL REFERENCES intervention_proposals(id) ON DELETE RESTRICT,
  reassessment_id  TEXT NOT NULL REFERENCES learning_reassessments(id) ON DELETE RESTRICT,
  result           TEXT NOT NULL,
  evidence_refs    JSONB NOT NULL,
  comparison       JSONB,
  occurred_at      TIMESTAMPTZ NOT NULL,
  confidence       REAL NOT NULL,
  source           TEXT NOT NULL,
  operation_key    TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT learning_outcomes_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS learning_outcomes_student_idx ON learning_outcomes (tenant_id, student_id);
