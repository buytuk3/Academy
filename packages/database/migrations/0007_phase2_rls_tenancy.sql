-- PHASE-2 — SECURITY / RLS / TENANCY (non-destructive; no data dropped/rewritten)
--
-- Table classification (authoritative — derived from packages/database/src/schema
-- + migrations 0000..0006; no invented relationships):
--   GLOBAL (exempt — no tenant_id column exists by design):
--     tenants (the tenant root itself), student_identities (CORE-18 18-A
--     "PRE-TENANT" global identity; carries NO student data).
--   TENANT-SCOPED, single tenant_id column (protected below):
--     users, schools, classes, students, evidence, reading_sessions, attempts,
--     reports, phoneme_stats, mastery_records, exercise_assignments, passages,
--     api_keys, activity_assignments, activity_attempts, content_definitions,
--     exercise_definitions, gaps, remediation_plans, remediation_activities,
--     impact_measurements, learning_diagnoses, intervention_proposals,
--     learning_reassessments, learning_outcomes, event_outbox, audit_logs,
--     refresh_tokens, password_reset_tokens, organizations, staff_memberships,
--     student_memberships.
--   TENANT-SCOPED, dual tenant columns:
--     student_history_shares (source_tenant_id + target_tenant_id — CORE-18
--     18-J: history sharing is an AUTHORIZATION layer granting the TARGET
--     tenant READ access; ownership never transfers. Policy: a row is visible
--     to the tenant that owns it OR the tenant it was shared with; only the
--     SOURCE tenant may create/modify rows).
--   AUTH/PIPELINE TABLES (refresh_tokens, password_reset_tokens, audit_logs,
--     event_outbox): tenant-scoped by schema, but their canonical flows run
--     BEFORE a tenant context can exist (login by globally-unique email,
--     refresh rotation by globally-unique jti/family, outbox dispatch loop).
--     RLS is ENABLED + policy installed here (enforced for every non-owner
--     role); runtime-role enforcement gap is recorded as DEV-017.
--
-- Role/ownership evidence (probed live, PostgreSQL 16.15, core32_verify):
--   * Owner of every table = role `core27` (rolsuper=f, rolbypassrls=f).
--   * Table owners bypass plain RLS → full owner enforcement would need
--     FORCE ROW LEVEL SECURITY. NOT forced in this migration: the runtime
--     role IS the owner and still executes tenant-less auth/outbox queries;
--     forcing now would fail-closed break login/refresh/outbox. Recorded as
--     DEV-017 with the follow-up path (dedicated non-owner runtime role +
--     FORCE + full withTenant threading).
--   * Isolation is proven in PHASE-2 by a non-owner probe role
--     (rolsuper=f, rolbypassrls=f) executing SELECT/INSERT/UPDATE/DELETE —
--     never a superuser.
--
-- Behavior:
--   * app.tenant_id unset          → current_setting(..., true) = NULL →
--     policy false → zero rows visible (fail-closed); writes rejected.
--   * app.tenant_id = other tenant → other tenant's rows invisible;
--     cross-tenant INSERT/UPDATE/DELETE rejected by WITH CHECK.
-- Rollback: DROP POLICY tenant_isolation_<t> ON <t>;
--           ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users',
    'schools',
    'classes',
    'students',
    'evidence',
    'evidence_items',
    'reading_sessions',
    'attempts',
    'reports',
    'phoneme_stats',
    'mastery_records',
    'exercise_assignments',
    'passages',
    'api_keys',
    'activity_assignments',
    'activity_attempts',
    'content_definitions',
    'exercise_definitions',
    'gaps',
    'remediation_plans',
    'remediation_activities',
    'impact_measurements',
    'learning_diagnoses',
    'intervention_proposals',
    'learning_reassessments',
    'learning_outcomes',
    'event_outbox',
    'audit_logs',
    'refresh_tokens',
    'password_reset_tokens',
    'organizations',
    'staff_memberships',
    'student_memberships'
  ]
  LOOP
    -- Defensive on fresh-DB ordering: skip absent tables gracefully.
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation_' || t, t);
      EXECUTE format(
        'CREATE POLICY %I ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
        'tenant_isolation_' || t,
        t
      );
    END IF;
  END LOOP;

  -- student_history_shares: dual-tenant authorization table (18-J) —
  -- visible to source (owner) OR target (granted reader); writes restricted
  -- to the source tenant (a share must be created by its owner).
  IF to_regclass('public.student_history_shares') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE student_history_shares ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_student_history_shares ON student_history_shares';
    EXECUTE $f$
      CREATE POLICY tenant_isolation_student_history_shares ON student_history_shares
        USING (
          source_tenant_id = current_setting('app.tenant_id', true)
          OR target_tenant_id = current_setting('app.tenant_id', true)
        )
        WITH CHECK (source_tenant_id = current_setting('app.tenant_id', true))
    $f$;
  END IF;
END
$$;
