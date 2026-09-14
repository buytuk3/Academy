-- CORE-35 / V0.1.7 Phase 1 Auth Hardening
-- Idempotent migration: preserve existing rows, add password_hash if missing,
-- and create password_reset_tokens for forgot/reset flow.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash text;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  tenant_id text NOT NULL REFERENCES tenants(id),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_hash_idx
  ON password_reset_tokens(token_hash);
