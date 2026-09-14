import { pgTable, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan_type", [
  "starter",
  "growth",
  "school",
  "district",
]);

export const tenantsTable = pgTable("tenants", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  planId: text("plan_id", { enum: ["starter", "growth", "school", "district"] })
    .notNull()
    .default("starter"),
  isActive: boolean("is_active").notNull().default(true),
  region: text("region"),
  city: text("city"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Tenant = typeof tenantsTable.$inferSelect;
