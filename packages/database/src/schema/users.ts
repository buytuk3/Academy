import { pgTable, text, boolean, timestamp, pgEnum, unique } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const roleEnum = pgEnum("user_role", [
  "admin",
  "principal",
  "teacher",
  "student",
  "parent",
]);

export const usersTable = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  username: text("username"), // merged from reading-engine users (C-01) — used by legacy auth until P4
  passwordHash: text("password_hash").notNull(),
  role: text("role", {
    enum: ["admin", "principal", "teacher", "student", "parent"],
  })
    .notNull()
    .default("teacher"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => ({
  // CORE-19 (19-J): FK target for tenant-safe composite keys (staff_memberships).
  // Non-destructive: id is already the PK, so this composite can never fail.
  idTenantUniq: unique("users_id_tenant_uniq").on(t.id, t.tenantId),
}));

export type User = typeof usersTable.$inferSelect;
export type SafeUser = Omit<User, "passwordHash">;
