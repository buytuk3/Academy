-- PHASE-20 — GRAMMAR-PARSING-ENGINE / الإعراب (governing doc v2.1 §3.7)
-- Non-destructive; additive only (ADR-041 — own ADR per the roadmap ruling).
-- Templates: 0009-0014 — (tenant_id, operation_key) UNIQUE idempotency; RLS
-- enabled+forced per the 0007 mechanism (fail-closed). §3.7 semantics: the
-- engine runs a REAL deterministic rule-based i'rab analysis (pure TS —
-- morphological rules + a bounded canonical lexicon + جار/مجرور tracking);
-- tokens the rules cannot classify are stamped NEEDS_REVIEW — NEVER guessed
-- (no fake data); every real parse is recorded once (idempotent replays).

CREATE TABLE IF NOT EXISTS grammar_parsings (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id text,
  input_text text NOT NULL,
  tokens jsonb NOT NULL DEFAULT '[]'::jsonb,
  token_count integer NOT NULL DEFAULT 0 CHECK (token_count >= 0),
  review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  engine_version text NOT NULL,
  operation_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grammar_parsings_op_uniq UNIQUE (tenant_id, operation_key)
);
CREATE INDEX IF NOT EXISTS grammar_parsings_student_idx
  ON grammar_parsings (tenant_id, student_id, created_at);

ALTER TABLE grammar_parsings ENABLE ROW LEVEL SECURITY;
ALTER TABLE grammar_parsings FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'grammar_parsings'
                   AND policyname = 'grammar_parsings_tenant_isolation') THEN
    CREATE POLICY grammar_parsings_tenant_isolation ON grammar_parsings
      USING (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;
