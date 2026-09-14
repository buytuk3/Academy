import { foreignKey, index, pgTable, text, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { studentIdentitiesTable } from "./identity";
import { organizationsTable } from "./organization";

export const schoolsTable = pgTable("schools", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  city: text("city"),
  region: text("region"),
  // CORE-19 (19-D): school INSIDE the organization hierarchy — REFERENCE only
  // (organizationId), never a copy of organization data. Nullable: legacy
  // schools pre-date organizations.
  organizationId: text("organization_id"),
  code: text("code"),
  country: text("country"),
  educationSystem: text("education_system"),
  status: text("status").notNull().default("active"),
  operationKey: text("operation_key"), // 19-X idempotent create/retry
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => ({
  // CORE-18 (R-009-a): FK target for tenant-safe composite keys.
  idTenantUniq: unique("schools_id_tenant_uniq").on(t.id, t.tenantId),
  // CORE-19 (19-J): school may only attach to an organization of the SAME tenant.
  orgTenantFk: foreignKey({
    name: "schools_organization_tenant_fk",
    columns: [t.organizationId, t.tenantId],
    foreignColumns: [organizationsTable.id, organizationsTable.tenantId],
  }),
  codeUniq: unique("schools_tenant_code_uniq").on(t.tenantId, t.code),
  opUniq: unique("schools_operation_key_uniq").on(t.tenantId, t.operationKey),
  // 19-M: organization-scope resolution (schools of an org/directorate).
  orgIdx: index("schools_organization_idx").on(t.tenantId, t.organizationId),
}));

export const classesTable = pgTable("classes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  schoolId: text("school_id")
    .notNull()
    .references(() => schoolsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  gradeLevel: text("grade_level").notNull(),
  section: text("section"),
  // CORE-19 (19-E/19-Q): configuration/curriculum REFERENCE — packages/curriculum
  // defines EducationStageKey as config data ("primary", "key-stage-2", …).
  // Deliberately NOT a closed enum: KINDERGARTEN/TECHNICAL/VOCATIONAL/… can be
  // added by configuration without touching the core.
  stageKey: text("stage_key"),
  academicYear: text("academic_year").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => ({
  // CORE-18 (R-009-a): FK target for tenant-safe composite keys.
  idTenantUniq: unique("classes_id_tenant_uniq").on(t.id, t.tenantId),
  // CORE-19 (19-J): School(Tenant A) → Class(Tenant B) impossible at DB level.
  schoolTenantFk: foreignKey({
    name: "classes_school_tenant_fk",
    columns: [t.schoolId, t.tenantId],
    foreignColumns: [schoolsTable.id, schoolsTable.tenantId],
  }),
}));

export const studentsTable = pgTable("students", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  classId: text("class_id")
    .notNull()
    .references(() => classesTable.id, { onDelete: "restrict" }),
  // CORE-18 (ADR-002): link to the GLOBAL identity — nullable, platform-minted
  // UUID, never an email/phone. The student record itself stays tenant-scoped.
  identityId: text("identity_id").references(() => studentIdentitiesTable.id, { onDelete: "restrict" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  studentCode: text("student_code").notNull(),
  displayName: text("display_name"), // C-01b merged from reading-engine students
  grade: text("grade"), // C-01b merged from reading-engine students
  nativeLanguage: text("native_language").default("ar"), // C-01b merged from reading-engine students
  isActive: boolean("is_active").notNull().default(true), // C-07 fixed timestamp->boolean
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => ({
  // CORE-18 (R-009-a): DB-level tenant integrity — a student row can only
  // reference a class in the SAME tenant (composite FK), and memberships pin
  // students via (id, tenant_id). No API-bug cross-tenant edges.
  idTenantUniq: unique("students_id_tenant_uniq").on(t.id, t.tenantId),
  identityTenantUniq: unique("students_identity_tenant_uniq").on(t.identityId, t.tenantId),
  classTenantFk: foreignKey({
    name: "students_class_tenant_fk",
    columns: [t.classId, t.tenantId],
    foreignColumns: [classesTable.id, classesTable.tenantId],
  }),
}));

export type School = typeof schoolsTable.$inferSelect;
export type Class = typeof classesTable.$inferSelect;
export type Student = typeof studentsTable.$inferSelect;
