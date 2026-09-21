-- PHASE-27 — STUCK-POINT-DETECTION-AND-MANAGER-ALERT-ENGINE (§3.10 addition,
-- management decision 2026-09-21). Non-destructive; additive only (ADR-048).
-- ONE dedup table: the ATOMIC guard that prevents double-delivery for the
-- same source event is UNIQUE (tenant_id, source_event_id) — the P15-4-proven
-- ON CONFLICT DO NOTHING pattern. RLS enabled+forced per the 0007 mechanism
-- (fail-closed). NO new delivery channel: fan-out rides the PHASE-24
-- notifications table (0019) inside the SAME transaction. The 0011 event
-- vocabulary is NOT altered — failure classes LOGIN_FAILED / ERROR already
-- exist in its CHECK; operation categories are alert-level (this table).

CREATE TABLE IF NOT EXISTS stuck_point_alerts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_event_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  actor_id text NOT NULL,
  actor_role text NOT NULL,
  student_id text,
  school_id text,
  operation_type text NOT NULL CHECK (operation_type IN
    ('LOGIN','READING','DICTATION','NUMERACY','ASSESSMENT','PAYMENT','SUPPORT','GENERAL')),
  failure_reason text NOT NULL,
  notified_principals jsonb NOT NULL DEFAULT '[]',
  notified_admins jsonb NOT NULL DEFAULT '[]',
  alert_operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stuck_point_alerts_source_uniq UNIQUE (tenant_id, source_event_id),
  CONSTRAINT stuck_point_alerts_op_uniq UNIQUE (tenant_id, alert_operation_key)
);
CREATE INDEX IF NOT EXISTS stuck_point_alerts_time_idx
  ON stuck_point_alerts (tenant_id, occurred_at);

ALTER TABLE stuck_point_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stuck_point_alerts FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'stuck_point_alerts'
                   AND policyname = 'stuck_point_alerts_tenant_isolation') THEN
    CREATE POLICY stuck_point_alerts_tenant_isolation ON stuck_point_alerts
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;
