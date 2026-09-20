-- PHASE-23 — STUDENT-ENGAGEMENT-EXTRAS (governing doc v2.1 §5.2.3 + §3.10
-- renumbered: points-spend / notes / support). Non-destructive; additive
-- only (ADR-044). Templates: 0009-0017 — (tenant_id, operation_key)
-- UNIQUE idempotency; RLS enabled+forced per the 0007 mechanism
-- (fail-closed). Reuse-first: the point balance lives in the EXISTING
-- wallet_accounts (0009); redemption = a SINGLE conditional debit UPDATE
-- (balance >= cost — the P15-4-proven atomic pattern) + this table's
-- redemption ledger row; a failed debit rolls the whole transaction back.

CREATE TABLE IF NOT EXISTS point_redemptions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  item text NOT NULL,
  cost integer NOT NULL CHECK (cost > 0),
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT point_redemptions_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS point_redemptions_student_idx
  ON point_redemptions (tenant_id, student_id, created_at);

ALTER TABLE point_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_redemptions FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'point_redemptions'
                   AND policyname = 'point_redemptions_tenant_isolation') THEN
    CREATE POLICY point_redemptions_tenant_isolation ON point_redemptions
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS student_notes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  author_id text NOT NULL,
  category text NOT NULL DEFAULT 'GENERAL' CHECK (category IN ('ACADEMIC','BEHAVIORAL','GENERAL')),
  body text NOT NULL,
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_notes_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS student_notes_student_idx
  ON student_notes (tenant_id, student_id, created_at);

ALTER TABLE student_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_notes FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'student_notes'
                   AND policyname = 'student_notes_tenant_isolation') THEN
    CREATE POLICY student_notes_tenant_isolation ON student_notes
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS support_tickets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by text NOT NULL,
  creator_role text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
  resolved_by text,
  resolved_at timestamptz,
  resolve_operation_key text,
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx
  ON support_tickets (tenant_id, status, created_at);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'support_tickets'
                   AND policyname = 'support_tickets_tenant_isolation') THEN
    CREATE POLICY support_tickets_tenant_isolation ON support_tickets
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;
