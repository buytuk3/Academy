/**
 * CORE-19 (19-C) — Organization hierarchy table.
 *
 * 19-B: TENANT ≠ SCHOOL. The Tenant is the security/isolation boundary; the
 * Organization is the institutional/educational entity. A Tenant may be a
 * school, a school group, a directorate, an authority, a ministry or any
 * organization — the model does not assume any of them.
 *
 * Hierarchy: config-driven parent chain (parent_organization_id), NOT
 * hardcoded level columns. Levels are named by `type` against an OPEN
 * registry (contracts.ts) — a new country level needs zero core changes.
 *
 * 19-J DB-level invariants:
 *  - (id, tenant_id) unique → target of tenant-safe composite FKs.
 *  - parent MUST be in the same tenant: composite FK (parent, tenant).
 *  - self-parent impossible: DB CHECK + API guard.
 *  - orphan impossible: parent FK is NOT NULL-able only when set; roots have
 *    NULL parent by design (a forest per tenant).
 *
 * Ownership: core-platform. No educational data lives here (19-S is scope
 * resolution only; no analytics, no dashboards).
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

export const organizationsTable = pgTable(
  "organizations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    parentOrganizationId: text("parent_organization_id"),
    // OPEN registry value (validated in code) — deliberately NOT a pg enum.
    type: text("type").notNull(),
    name: text("name").notNull(),
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
  },
  (t) => ({
    // Tenant-safe FK target (children pin parents per tenant) — 19-J.
    idTenantUniq: unique("organizations_id_tenant_uniq").on(t.id, t.tenantId),
    codeUniq: unique("organizations_tenant_code_uniq").on(t.tenantId, t.code),
    opUniq: unique("organizations_operation_key_uniq").on(t.tenantId, t.operationKey),
    // 19-J: Organization(Tenant A) → Parent Organization(Tenant B) impossible.
    parentTenantFk: foreignKey({
      name: "organizations_parent_tenant_fk",
      columns: [t.parentOrganizationId, t.tenantId],
      foreignColumns: [t.id, t.tenantId],
    }),
    noSelfParent: check(
      "organizations_no_self_parent",
      sql`parent_organization_id is null or parent_organization_id <> id`,
    ),
    // 19-M: child listing + hierarchy walks.
    parentIdx: index("organizations_parent_idx").on(t.tenantId, t.parentOrganizationId),
  }),
);

export type Organization = typeof organizationsTable.$inferSelect;
