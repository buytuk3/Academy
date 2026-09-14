-- 005_event_outbox.sql — CORE-06.
-- Durable transactional outbox for internal event-driven flows (Modular
-- Monolith + Event-Driven Internally). SAME database as evidence — no second
-- store. Outbox holds pending EVENT ENVELOPES; canonical evidence is written
-- ONLY via recordEvidence (evidence table). Correlation chain is persisted
-- (trace_id / request_id / correlation_id / job_id) and failures stay visible
-- for retry (status, attempts, last_error, error_class, next_attempt_at).
--
-- DESIGN artifact for Staging: NOT applied to any live DB in this environment
-- (CORE-01A: LIVE DATABASE NOT VERIFIED); MUST NOT run on Production before
-- backup/validation.

CREATE TABLE IF NOT EXISTS event_outbox (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL,
  envelope jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  error_class text,
  trace_id text,
  request_id text,
  correlation_id text,
  job_id text,
  evidence_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  next_attempt_at timestamptz
);

CREATE INDEX IF NOT EXISTS event_outbox_status_idx ON event_outbox (status, created_at);
CREATE INDEX IF NOT EXISTS event_outbox_tenant_idx ON event_outbox (tenant_id);

COMMENT ON TABLE event_outbox IS
  'Transactional outbox for internal learning events (CORE-06) — envelopes only; evidence is recorded via recordEvidence()';
