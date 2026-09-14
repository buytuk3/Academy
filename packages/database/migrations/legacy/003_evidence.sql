-- 003_evidence.sql — Canonical Evidence table (CORE-03A).
-- Migration NUMBERING: 001 and 002 are the only migrations on disk (verified),
-- so this is 003. It is a DESIGN artifact for Staging: the canonical identity/
-- session/reading tables it references are created by the eventual canonical
-- migration; it is NOT applied to any live database in this environment
-- (CORE-01A: LIVE DATABASE NOT VERIFIED) and MUST NOT be run on Production
-- before backup/validation.

CREATE TABLE IF NOT EXISTS evidence (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  actor_id text,
  actor_role text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  subject text,
  grade text,
  curriculum_book text,
  unit_id text,
  lesson_id text,
  objective_id text,
  activity_id text,
  session_id text REFERENCES reading_sessions(id) ON DELETE SET NULL,
  attempt_id text REFERENCES attempts(id) ON DELETE SET NULL,
  passage_id text REFERENCES passages(id) ON DELETE SET NULL,
  in_response_to_id text REFERENCES evidence(id) ON DELETE SET NULL,
  evidence_type text NOT NULL,
  action text,
  response jsonb,
  result text,
  duration_ms integer,
  error_type text,
  confidence real,
  source_engine text NOT NULL,
  tool text,
  teacher_decision jsonb,
  follow_up jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_student_idx ON evidence (tenant_id, student_id);
CREATE INDEX IF NOT EXISTS evidence_time_idx ON evidence (student_id, occurred_at);
CREATE INDEX IF NOT EXISTS evidence_attempt_idx ON evidence (attempt_id);
CREATE INDEX IF NOT EXISTS evidence_type_idx ON evidence (student_id, evidence_type, occurred_at);

COMMENT ON TABLE evidence IS
  'Canonical longitudinal Evidence log (CORE-03A) — single source for the Student Learning Record';
