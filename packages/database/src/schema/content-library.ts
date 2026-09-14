/**
 * CORE-24 / Wave 1 (ACR-24/001, ADR-004) — Persistent Content & Exercise
 * Library (owner: core-platform).
 *
 * THE SEPARATION INVARIANT (unbreakable, owner decision):
 *   Content ≠ Exercise ≠ Activity ≠ Assignment ≠ Attempt ≠ Evidence ≠ Assessment
 *
 * These tables store DEFINITIONS ONLY:
 *   - NO Evidence rows, NO attempt results, NO scores, NO responses, NO
 *     student-owned columns — Evidence stays the single canonical learning
 *     fact via recordEvidence ((tenant_id, operation_key) dedup).
 *   - Curriculum stays canonical (CORE-13 / 21-O): every row carries the
 *     MANDATORY immutable `curriculum_version` reference — never free text.
 *   - Media is NEVER inline (R-003/R-004): `body_ref` is an Object Storage
 *     REFERENCE (audio stays owned by reading-engine per ADR-004) — binaries
 *     are never stored in PostgreSQL.
 *   - Versioning: lineage = (root_*_id, version); parent_version_id points at
 *     the previous version; lifecycle DRAFT → PUBLISHED → SUPERSEDED —
 *     published rows are immutable; a change creates a NEW row and marks the
 *     old one SUPERSEDED (history is never rewritten, always queryable).
 *   - Idempotency: (tenant_id, operation_key) unique — the EXISTING platform
 *     pattern (CORE-18/19/20/21/23); no new idempotency system.
 *   - Tenant isolation at the DB level: composite tenant-safe FKs
 *     (users_id_tenant_uniq target) — cross-tenant references are impossible
 *     by constraint, not by application logic alone.
 *
 * Open vocabularies (kind, source, subject, activity_type) are registries
 * validated in the capability layer (21-D pattern); `engine_binding` and
 * `status` are DB CHECKs (closed by design, ACR-24/001 §2.3).
 */
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants.js";
import { usersTable } from "./users.js";

// ===== content_definitions (ACR-24/001 §2.2) =====

export const contentDefinitionsTable = pgTable(
  "content_definitions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    // lineage (versioning)
    rootContentId: text("root_content_id").notNull(),
    parentVersionId: text("parent_version_id"),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("DRAFT"),
    // open registries (validated in code — 21-D pattern)
    kind: text("kind").notNull(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    // Object Storage REFERENCE ONLY — never inline media (R-003/R-004, ADR-004)
    bodyRef: text("body_ref"),
    language: text("language").notNull().default("ar"),
    // curriculum anchor — MANDATORY immutable version (21-O)
    curriculumId: text("curriculum_id").notNull(),
    curriculumVersion: text("curriculum_version").notNull(),
    country: text("country"),
    educationSystem: text("education_system"),
    stageKey: text("stage_key").notNull(),
    gradeKey: text("grade_key"),
    gradeLevel: text("grade_level").notNull(),
    subject: text("subject").notNull(),
    bookId: text("book_id"),
    unitId: text("unit_id"),
    lessonId: text("lesson_id"),
    objectiveId: text("objective_id"),
    skill: text("skill"),
    dimension: text("dimension"),
    createdBy: text("created_by").notNull(),
    operationKey: text("operation_key").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Tenant-safe FK target (lineage + exercises pin rows per tenant).
    idTenantUniq: unique("content_id_tenant_uniq").on(t.id, t.tenantId),
    // Version integrity: ONE row per (lineage, version) — version constraints (Wave-1 directive §1).
    lineageVersionUniq: unique("content_lineage_version_uniq").on(t.tenantId, t.rootContentId, t.version),
    // Idempotency (existing platform pattern — no new system).
    opUniq: unique("content_op_key_tenant_uniq").on(t.tenantId, t.operationKey),
    // created_by MUST be a user of the SAME tenant (composite FK pattern of staff.ts).
    createdByTenantFk: foreignKey({
      name: "content_created_by_tenant_fk",
      columns: [t.createdBy, t.tenantId],
      foreignColumns: [usersTable.id, usersTable.tenantId],
    }),
    // parent version MUST be in the SAME tenant (self-referencing composite FK — 19-J pattern).
    parentTenantFk: foreignKey({
      name: "content_parent_tenant_fk",
      columns: [t.parentVersionId, t.tenantId],
      foreignColumns: [t.id, t.tenantId],
    }),
    noSelfParent: check(
      "content_no_self_parent",
      sql`parent_version_id is null or parent_version_id <> id`,
    ),
    statusCheck: check(
      "content_status_check",
      sql`status in ('DRAFT', 'PUBLISHED', 'SUPERSEDED')`,
    ),
    versionPositive: check(
      "content_version_positive",
      sql`version >= 1`,
    ),
    // search/filter paths (ACR-24/001 §2.2)
    tenantIdx: index("content_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("content_tenant_status_idx").on(t.tenantId, t.status),
    tenantKindIdx: index("content_tenant_kind_idx").on(t.tenantId, t.kind),
    tenantSubjectIdx: index("content_tenant_subject_idx").on(t.tenantId, t.subject),
    curriculumIdx: index("content_curriculum_idx").on(t.tenantId, t.curriculumId, t.curriculumVersion),
    rootVersionIdx: index("content_root_version_idx").on(t.tenantId, t.rootContentId, t.version),
    lessonIdx: index("content_lesson_idx").on(t.tenantId, t.lessonId),
    createdByIdx: index("content_created_by_idx").on(t.tenantId, t.createdBy),
  }),
);

export type ContentDefinitionRow = typeof contentDefinitionsTable.$inferSelect;

// ===== exercise_definitions (ACR-24/001 §2.3 + owner directive Wave-1 §3) =====

export const exerciseDefinitionsTable = pgTable(
  "exercise_definitions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    // lineage (versioning)
    rootExerciseId: text("root_exercise_id").notNull(),
    parentVersionId: text("parent_version_id"),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("DRAFT"),
    // OPTIONAL link to library content (Exercise ≠ Content — reference, not merge)
    contentId: text("content_id"),
    // CORE-21 open activity vocabulary
    activityType: text("activity_type").notNull(),
    // closed by design: READING | DICTATION | NUMERACY | ASSESSMENT (CHECK)
    engineBinding: text("engine_binding").notNull(),
    // CORE-22 ExpectedResponseConfig (type + policy — validated in capability code)
    expectedResponseType: text("expected_response_type").notNull(),
    expectedResponseConfig: jsonb("expected_response_config"),
    // OPTIONAL assessment REFERENCE (never an embedded definition — reference only)
    assessmentRef: text("assessment_ref"),
    maxAttempts: integer("max_attempts"),
    timeLimitMs: integer("time_limit_ms"),
    // open registry (21-Q sources)
    source: text("source").notNull(),
    // curriculum anchor — MANDATORY immutable version (21-O)
    curriculumId: text("curriculum_id").notNull(),
    curriculumVersion: text("curriculum_version").notNull(),
    country: text("country"),
    educationSystem: text("education_system"),
    stageKey: text("stage_key").notNull(),
    gradeKey: text("grade_key"),
    gradeLevel: text("grade_level").notNull(),
    subject: text("subject").notNull(),
    bookId: text("book_id"),
    unitId: text("unit_id"),
    lessonId: text("lesson_id"),
    objectiveId: text("objective_id"),
    skill: text("skill"),
    dimension: text("dimension"),
    createdBy: text("created_by").notNull(),
    operationKey: text("operation_key").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idTenantUniq: unique("exercise_id_tenant_uniq").on(t.id, t.tenantId),
    lineageVersionUniq: unique("exercise_lineage_version_uniq").on(t.tenantId, t.rootExerciseId, t.version),
    opUniq: unique("exercise_op_key_tenant_uniq").on(t.tenantId, t.operationKey),
    createdByTenantFk: foreignKey({
      name: "exercise_created_by_tenant_fk",
      columns: [t.createdBy, t.tenantId],
      foreignColumns: [usersTable.id, usersTable.tenantId],
    }),
    // linked content MUST be a row of the SAME tenant (ACR-24/001 §2.3).
    contentTenantFk: foreignKey({
      name: "exercise_content_tenant_fk",
      columns: [t.contentId, t.tenantId],
      foreignColumns: [contentDefinitionsTable.id, contentDefinitionsTable.tenantId],
    }),
    parentTenantFk: foreignKey({
      name: "exercise_parent_tenant_fk",
      columns: [t.parentVersionId, t.tenantId],
      foreignColumns: [t.id, t.tenantId],
    }),
    statusCheck: check(
      "exercise_status_check",
      sql`status in ('DRAFT', 'PUBLISHED', 'SUPERSEDED')`,
    ),
    engineCheck: check(
      "exercise_engine_check",
      sql`engine_binding in ('READING', 'DICTATION', 'NUMERACY', 'ASSESSMENT')`,
    ),
    noSelfParent: check(
      "exercise_no_self_parent",
      sql`parent_version_id is null or parent_version_id <> id`,
    ),
    versionPositive: check(
      "exercise_version_positive",
      sql`version >= 1`,
    ),
    maxAttemptsCheck: check(
      "exercise_max_attempts_check",
      sql`max_attempts is null or max_attempts >= 1`,
    ),
    tenantIdx: index("exercise_tenant_idx").on(t.tenantId),
    tenantStatusIdx: index("exercise_tenant_status_idx").on(t.tenantId, t.status),
    engineIdx: index("exercise_engine_idx").on(t.tenantId, t.engineBinding),
    activityTypeIdx: index("exercise_activity_type_idx").on(t.tenantId, t.activityType),
    curriculumIdx: index("exercise_curriculum_idx").on(t.tenantId, t.curriculumId, t.curriculumVersion),
    contentIdx: index("exercise_content_idx").on(t.tenantId, t.contentId),
  }),
);

export type ExerciseDefinitionRow = typeof exerciseDefinitionsTable.$inferSelect;
