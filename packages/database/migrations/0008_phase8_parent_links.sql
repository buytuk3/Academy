-- PHASE-8 — PARENT-CAPABILITIES (non-destructive; additive only — no data dropped/rewritten)
--
-- parent_student_links: the parent↔student visibility backbone (CORE — parent
-- portal "متابعة تقدم الأبناء" / V1 §5.1.4). Read-only visibility rows:
--   - tenant-scoped (tenant_id) → RLS policy below (same mechanism as 0007),
--   - (tenant_id, operation_key) UNIQUE → database-backed idempotency
--     (same principles as CORE-05/06/07 — no in-memory dedupe),
--   - links a parent USER to a student; NO copied student data.
-- Classification: TENANT-SCOPED, single tenant_id column → protected.
CREATE TABLE IF NOT EXISTS parent_student_links (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parent_student_links_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS parent_student_links_parent_idx
  ON parent_student_links (tenant_id, parent_user_id);
CREATE INDEX IF NOT EXISTS parent_student_links_student_idx
  ON parent_student_links (tenant_id, student_id);
ALTER TABLE parent_student_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_parent_student_links ON parent_student_links;
CREATE POLICY tenant_isolation_parent_student_links ON parent_student_links
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
