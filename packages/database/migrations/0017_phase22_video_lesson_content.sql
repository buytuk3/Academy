-- PHASE-22 — VIDEO-LESSON-CONTENT (governing doc v2.1 §3.8)
-- Non-destructive; additive only (ADR-043 — own ADR per the roadmap ruling).
-- Templates: 0009-0016 — (tenant_id, operation_key) UNIQUE idempotency; RLS
-- enabled+forced per the 0007 mechanism (fail-closed). §3.8 semantics: video
-- lessons ride the EXISTING content registry (content_definitions — created
-- with the proven LESSON recipe) via a loose reference; this table carries
-- the video-specific registry state (storage_key loose pointer — the same
-- convention as attempts.audio_key from PHASE-11; duration; lifecycle
-- status PROCESSING→READY via a single-statement conditional publish — the
-- P15-4-proven atomic pattern). The video BYTES live in the deployment's
-- object store (PHASE-12/DEPL-2 infra) — this phase governs the registry,
-- lifecycle and RLS-scoped reads, never the transport.

CREATE TABLE IF NOT EXISTS video_lessons (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lesson_content_id text,
  title text NOT NULL,
  storage_key text NOT NULL,
  duration_sec integer NOT NULL DEFAULT 0 CHECK (duration_sec >= 0),
  status text NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING','READY','BLOCKED')),
  published_at timestamptz,
  published_by text,
  publish_operation_key text,
  operation_key text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_lessons_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS video_lessons_status_idx
  ON video_lessons (tenant_id, status, created_at);

ALTER TABLE video_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_lessons FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'video_lessons'
                   AND policyname = 'video_lessons_tenant_isolation') THEN
    CREATE POLICY video_lessons_tenant_isolation ON video_lessons
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;
