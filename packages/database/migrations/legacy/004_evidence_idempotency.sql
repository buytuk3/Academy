-- 004_evidence_idempotency.sql — CORE-05.
-- Adds the idempotency operation key to the canonical evidence table, enforced
-- by a tenant-scoped unique index: queue retries of the same logical event
-- (same operation_key) collide and resolve to the existing row; two DISTINCT
-- real events (distinct keys) are both recorded.
--
-- DESIGN artifact for Staging only: NOT applied to any live DB in this
-- environment (CORE-01A: LIVE DATABASE NOT VERIFIED); MUST NOT run on
-- Production before backup/validation.

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS operation_key text;

CREATE UNIQUE INDEX IF NOT EXISTS evidence_operation_key_uniq
  ON evidence (tenant_id, operation_key);

COMMENT ON COLUMN evidence.operation_key IS
  'Stable operation identity per (tenant, event): queue retries of the same logical event deduplicate via the unique index.';
