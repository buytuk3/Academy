/**
 * CORE-18 (ADR-002 / R-009) — Student Membership & History Share tables.
 *
 * Binding model: Global Student Identity → Tenant/School Membership →
 * Tenant-owned Student Record → Tenant-owned Evidence.
 *
 * Database-level tenant integrity (R-009-a, instruction 18-D): composite
 * foreign keys pin membership.studentId / schoolId / classId to rows in the
 * SAME tenant — a Student(Tenant A) → Class(Tenant B) edge is impossible for
 * ANY code path (API bug, worker bug), not just application validation.
 *
 * Membership history is append-only lifecycle state (active/transferred/
 * returned with activeFrom/activeTo) — expired memberships are never deleted.
 *
 * History sharing is an AUTHORIZATION layer ("permission to READ"), never a
 * transfer of Evidence ownership (18-J).
 *
 * Ownership: core-platform. No educational data lives on either table.
 */
import { sql } from "drizzle-orm";
import { foreignKey, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants.js";
import { classesTable, schoolsTable, studentsTable } from "./schools.js";
import { studentIdentitiesTable } from "./identity.js";

export const membershipStatuses = ["active", "transferred", "returned"] as const;
export type MembershipStatus = (typeof membershipStatuses)[number];

export const historyShareScopes = ["summary", "dimensions", "full"] as const;
export type HistoryShareScope = (typeof historyShareScopes)[number];

export const studentMembershipsTable = pgTable(
  "student_memberships",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    identityId: text("identity_id")
      .notNull()
      .references(() => studentIdentitiesTable.id, { onDelete: "restrict" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull(),
    schoolId: text("school_id").notNull(),
    classId: text("class_id").notNull(),
    status: text("status", { enum: [...membershipStatuses] }).notNull(),
    activeFrom: timestamp("active_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    activeTo: timestamp("active_to", { withTimezone: true }),
    // CORE-05 idempotency pattern: stable logical-operation identity, unique
    // per tenant — retries never create duplicate memberships (18-M).
    operationKey: text("operation_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    identityIdx: index("student_memberships_identity_idx").on(t.identityId),
    studentTenantFk: foreignKey({
      name: "student_memberships_student_tenant_fk",
      columns: [t.studentId, t.tenantId],
      foreignColumns: [studentsTable.id, studentsTable.tenantId],
    }),
    schoolTenantFk: foreignKey({
      name: "student_memberships_school_tenant_fk",
      columns: [t.schoolId, t.tenantId],
      foreignColumns: [schoolsTable.id, schoolsTable.tenantId],
    }),
    classTenantFk: foreignKey({
      name: "student_memberships_class_tenant_fk",
      columns: [t.classId, t.tenantId],
      foreignColumns: [classesTable.id, classesTable.tenantId],
    }),
    opUniq: uniqueIndex("student_memberships_operation_key_uniq").on(t.tenantId, t.operationKey),
    // One ACTIVE membership per global identity at any instant (DB-level).
    oneActiveUniq: uniqueIndex("student_memberships_identity_active_uniq")
      .on(t.identityId)
      .where(sql`status = 'active'`),
  }),
);

export const studentHistorySharesTable = pgTable(
  "student_history_shares",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    identityId: text("identity_id")
      .notNull()
      .references(() => studentIdentitiesTable.id, { onDelete: "restrict" }),
    sourceTenantId: text("source_tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    targetTenantId: text("target_tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    scope: text("scope", { enum: [...historyShareScopes] }).notNull(),
    grantedBy: text("granted_by").notNull(),
    consentRef: text("consent_ref"),
    operationKey: text("operation_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    identityTargetIdx: index("student_history_shares_identity_target_idx").on(t.identityId, t.targetTenantId),
    opUniq: uniqueIndex("student_history_shares_operation_key_uniq").on(t.sourceTenantId, t.operationKey),
  }),
);

export type StudentMembership = typeof studentMembershipsTable.$inferSelect;
export type StudentHistoryShare = typeof studentHistorySharesTable.$inferSelect;
