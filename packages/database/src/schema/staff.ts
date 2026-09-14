/**
 * CORE-19 (19-G/19-H) — Staff (Teacher/Employee) Membership & Scope table.
 *
 * A teacher is not "a user role": User → Membership → Role → Scope.
 * One user, many memberships (schools, stages, classes, or an
 * administrative scope like a directorate) — WITHOUT copying the user.
 * Existing auth is reused, not rebuilt (users table stays the credential
 * owner; this table adds the institutional placement layer).
 *
 * 19-H: Role ≠ Scope. Role lives on the membership (open vocabulary reusing
 * the auth roles); Scope (scopeType + scopeId) defines WHAT the membership
 * can touch. Authorization = Role gate AND Scope gate.
 *
 * 19-J DB-level tenant integrity (composite FKs):
 *  - user must be in the SAME tenant (users_id_tenant_uniq target)
 *  - school must be in the SAME tenant (schools_id_tenant_uniq target)
 *  - organization must be in the SAME tenant (organizations_id_tenant_uniq)
 *  → Teacher(Tenant A) → School(Tenant B) is impossible for ANY code path.
 *
 * Ownership: core-platform. Engines never own membership tables (19-AI).
 */
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants.js";
import { usersTable } from "./users.js";
import { schoolsTable } from "./schools.js";
import { organizationsTable } from "./organization.js";

export const staffMembershipsTable = pgTable(
  "staff_memberships",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    schoolId: text("school_id"),
    organizationId: text("organization_id"),
    // Open vocabulary (reuses existing auth roles, extensible: supervisor…).
    role: text("role").notNull(),
    // 19-H scope anchor: TENANT | ORGANIZATION | SCHOOL | GRADE | CLASS (+ext).
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id"),
    status: text("status").notNull().default("active"),
    activeFrom: timestamp("active_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    activeTo: timestamp("active_to", { withTimezone: true }),
    operationKey: text("operation_key"), // 19-X idempotency
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // 19-J composite tenant-safe FKs.
    userTenantFk: foreignKey({
      name: "staff_memberships_user_tenant_fk",
      columns: [t.userId, t.tenantId],
      foreignColumns: [usersTable.id, usersTable.tenantId],
    }),
    schoolTenantFk: foreignKey({
      name: "staff_memberships_school_tenant_fk",
      columns: [t.schoolId, t.tenantId],
      foreignColumns: [schoolsTable.id, schoolsTable.tenantId],
    }),
    orgTenantFk: foreignKey({
      name: "staff_memberships_organization_tenant_fk",
      columns: [t.organizationId, t.tenantId],
      foreignColumns: [organizationsTable.id, organizationsTable.tenantId],
    }),
    opUniq: unique("staff_memberships_operation_key_uniq").on(t.tenantId, t.operationKey),
    // Every membership anchored to an institutional node (no floating scope).
    hasAnchor: check(
      "staff_memberships_has_anchor",
      sql`school_id is not null or organization_id is not null`,
    ),
    // 19-M: user membership lookups + school staffing lookups.
    userIdx: index("staff_memberships_user_idx").on(t.tenantId, t.userId),
    schoolIdx: index("staff_memberships_school_idx").on(t.tenantId, t.schoolId),
  }),
);

export type StaffMembership = typeof staffMembershipsTable.$inferSelect;
