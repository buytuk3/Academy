-- ============================================================
-- CORE-08 — Teacher Decision Boundary (migration 007). EXTENDS
-- intervention_proposals from migration 006 with the BOUND Delivery
-- Authorization. NO new database, NO evidence copy, NO SLR table,
-- NO overall score. Staging-only artifact: not applied in Production
-- without review/backup (Migration Code Verified ≠ Migration Applied).
-- ============================================================

ALTER TABLE intervention_proposals
  ADD COLUMN IF NOT EXISTS delivery_authorization JSONB;

CREATE INDEX IF NOT EXISTS intervention_proposals_status_idx
  ON intervention_proposals (tenant_id, status);
