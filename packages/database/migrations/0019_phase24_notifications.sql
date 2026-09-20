-- PHASE-24 — NOTIFICATIONS (governing doc v2.1 §5.2.4: notification center +
-- per-role customization). Non-destructive; additive only (ADR-045).
-- Templates: 0009-0018 — (tenant_id, operation_key) UNIQUE idempotency;
-- RLS enabled+forced per the 0007 mechanism (fail-closed). REUSE-FIRST
-- (DEV-024): this is the notification CENTER (persistence + read model +
-- atomic mark-read + per-user channel prefs). The TRANSPORTS (WebSocket /
-- email / Push-FCM) are deferred — zero new dependencies (no socket.io, no
-- nodemailer, no firebase-admin in package.json).

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_id text NOT NULL,
  recipient_role text NOT NULL,
  type text NOT NULL DEFAULT 'GENERAL' CHECK (type IN ('GENERAL','ACADEMIC','BEHAVIORAL','SUPPORT','SYSTEM')),
  title text NOT NULL,
  body text NOT NULL,
  ref jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz,
  read_operation_key text,
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx
  ON notifications (tenant_id, recipient_id, created_at);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'notifications'
                   AND policyname = 'notifications_tenant_isolation') THEN
    CREATE POLICY notifications_tenant_isolation ON notifications
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;

-- §5.2.4 تخصيص الإشعارات حسب الدور: per-USER channel preferences
-- (naturally idempotent by UNIQUE(tenant,user) upsert — no operation key).
CREATE TABLE IF NOT EXISTS notification_prefs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  prefs jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_prefs_user_uniq UNIQUE (tenant_id, user_id)
);

ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_prefs FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'notification_prefs'
                   AND policyname = 'notification_prefs_tenant_isolation') THEN
    CREATE POLICY notification_prefs_tenant_isolation ON notification_prefs
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;
