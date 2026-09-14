-- 002_add_refresh_rotation.sql
-- P4 (C-A3): add rotation fields to refresh_tokens so the canonical
-- @workspace/security rotator (family + jti + reuse detection) can persist
-- state through packages/database. Non-destructive (nullable columns only).
-- Owner: packages/security (tokens) / packages/database (storage).
-- Rollback: drop the three added columns; existing rows are untouched.

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS family_id text,
  ADD COLUMN IF NOT EXISTS jti text,
  ADD COLUMN IF NOT EXISTS token_version integer DEFAULT 2;

CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens (family_id);
