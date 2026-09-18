-- PHASE-15 — SCHOOL-ONBOARDING-AND-TEACHER-ASSIGNMENT (non-destructive; additive only)
--
-- §3.1 school onboarding: students may request a school that does not exist yet;
-- the request is PENDING until an explicit approval (system admin OR school principal).
-- No auto-activation anywhere.
-- §3.2 teacher claim engine: canonical subject×school slot table with a DB-level
-- UNIQUE constraint as the real atomic lock; claims are validated in a SERIALIZABLE
-- transaction so a concurrent second claim always loses. Teachers stay multi-school.
-- Principal override (second teacher on the same slot) is allowed ONLY through an
-- explicitly-flagged, audited override row.
-- All tables follow the 0008/0009 template: tenant-scoped → RLS policy (0007
-- mechanism, fail-closed), (tenant_id, operation_key) UNIQUE idempotency.

-- ============ §3.1 pending school requests ============
CREATE TABLE IF NOT EXISTS school_requests (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by text NOT NULL,            -- user/identity id of the requester
  school_name text NOT NULL CHECK (length(school_name) BETWEEN 2 AND 200),
  governorate text,
  stage_key text NOT NULL CHECK (stage_key IN ('PRIMARY','PREPARATORY','SECONDARY')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  decided_by text,                       -- approver (system admin / principal)
  decided_at timestamptz,
  decision_note text,
  school_id text,                        -- set on approval (the created/linked school)
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_requests_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS school_requests_status_idx ON school_requests (tenant_id, status);

-- ============ §3.2 canonical claim slots (subject × school) ============
CREATE TABLE IF NOT EXISTS teaching_slots (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (length(subject) BETWEEN 2 AND 80),
  claimed_by text,                       -- users.id of the teacher holding the slot
  claim_status text NOT NULL DEFAULT 'OPEN' CHECK (claim_status IN ('OPEN','CLAIMED')),
  opened_by_request_id text,             -- §3.1 request that surfaced this school
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  -- THE atomic lock: one slot per (tenant, school, subject)
  CONSTRAINT teaching_slots_lock UNIQUE (tenant_id, school_id, subject)
);
CREATE INDEX IF NOT EXISTS teaching_slots_teacher_idx ON teaching_slots (tenant_id, claimed_by);

-- secondary/assistant claim authorized by a principal (audited exception path)
CREATE TABLE IF NOT EXISTS teaching_slot_overrides (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slot_id text NOT NULL REFERENCES teaching_slots(id) ON DELETE CASCADE,
  granted_to text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by text NOT NULL,              -- principal (users.id)
  role_label text NOT NULL CHECK (role_label IN ('SECOND','ASSISTANT','SPECIALIST')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 4 AND 400),
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teaching_slot_overrides_op_uniq UNIQUE (tenant_id, operation_key)
);

-- ============ RLS (0007 mechanism — fail-closed, tenant-scoped) ============
ALTER TABLE school_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY school_requests_tenant_isolation ON school_requests
  USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE teaching_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_slots FORCE ROW LEVEL SECURITY;
CREATE POLICY teaching_slots_tenant_isolation ON teaching_slots
  USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE teaching_slot_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_slot_overrides FORCE ROW LEVEL SECURITY;
CREATE POLICY teaching_slot_overrides_tenant_isolation ON teaching_slot_overrides
  USING (tenant_id = current_setting('app.tenant_id', true));
