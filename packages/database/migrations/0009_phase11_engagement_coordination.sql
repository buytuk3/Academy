-- PHASE-11 — GAMIFICATION-MESSAGING-ATTENDANCE (non-destructive; additive only)
--
-- Canonical tables for DEV-005 (wallet/points), DEV-006 (messages), DEV-007
-- (attendance). No canonical table existed before (trace @ 1.14, ADR-034) —
-- this migration is therefore REQUIRED (documented exception to zero-migration).
-- All tables follow the 0008 template: tenant-scoped → RLS policy (0007
-- mechanism, fail-closed), (tenant_id, operation_key) UNIQUE idempotency.
-- Classification: TENANT-SCOPED, single tenant_id column → protected.

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_accounts_student_uniq UNIQUE (tenant_id, student_id)
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wallet_id text NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  delta integer NOT NULL,
  reason text NOT NULL,
  actor_id text NOT NULL,
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_ledger_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS wallet_ledger_student_idx ON wallet_ledger (tenant_id, student_id);

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  operation_key text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS messages_recipient_idx ON messages (tenant_id, recipient_id);
CREATE INDEX IF NOT EXISTS messages_sender_idx ON messages (tenant_id, sender_id);

CREATE TABLE IF NOT EXISTS attendance_records (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  class_id text NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  session_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('PRESENT','ABSENT','LATE','EXCUSED')),
  recorded_by text NOT NULL,
  note text,
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_records_day_uniq UNIQUE (tenant_id, student_id, session_date),
  CONSTRAINT attendance_records_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS attendance_records_class_idx ON attendance_records (tenant_id, class_id, session_date);

ALTER TABLE wallet_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_wallet_accounts ON wallet_accounts;
CREATE POLICY tenant_isolation_wallet_accounts ON wallet_accounts
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_wallet_ledger ON wallet_ledger;
CREATE POLICY tenant_isolation_wallet_ledger ON wallet_ledger
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_messages ON messages;
CREATE POLICY tenant_isolation_messages ON messages
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_attendance_records ON attendance_records;
CREATE POLICY tenant_isolation_attendance_records ON attendance_records
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- PHASE-11 — teacher_ratings (ADR-033 §3 re-target honored: the ratings cap
-- becomes real in PHASE-11; staff-only writes, scope-gated in capability).
CREATE TABLE IF NOT EXISTS teacher_ratings (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  class_id text NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  rated_by text NOT NULL,
  score integer NOT NULL CHECK (score BETWEEN 1 AND 5),
  note text,
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_ratings_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS teacher_ratings_student_idx ON teacher_ratings (tenant_id, student_id);
ALTER TABLE teacher_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_teacher_ratings ON teacher_ratings;
CREATE POLICY tenant_isolation_teacher_ratings ON teacher_ratings
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
