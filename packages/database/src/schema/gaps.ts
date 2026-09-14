import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { studentsTable } from "./schools";
import { usersTable } from "./users";

export const gapsTable = pgTable("gaps", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  studentId: text("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "restrict" }),
  domain: text("domain", {
    enum: [
      "decoding",
      "fluency",
      "comprehension",
      "vocabulary",
      "phonological",
      "writing",
      "pronunciation",
    ],
  }).notNull(),
  severity: text("severity", {
    enum: ["critical", "moderate", "minor"],
  }).notNull(),
  evidenceScore: real("evidence_score"),
  detectedAt: timestamp("detected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  status: text("status", {
    enum: ["open", "in_progress", "resolved", "monitoring"],
  })
    .notNull()
    .default("open"),
});

export const remediationPlansTable = pgTable("remediation_plans", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  studentId: text("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "restrict" }),
  gapId: text("gap_id")
    .notNull()
    .references(() => gapsTable.id, { onDelete: "restrict" }),
  planType: text("plan_type", {
    enum: ["individual", "group", "peer_assisted"],
  })
    .notNull()
    .default("individual"),
  assignedTo: text("assigned_to").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  status: text("status", {
    enum: ["draft", "active", "completed", "cancelled"],
  })
    .notNull()
    .default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const remediationActivitiesTable = pgTable("remediation_activities", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  planId: text("plan_id")
    .notNull()
    .references(() => remediationPlansTable.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  activityType: text("activity_type").notNull(),
  description: text("description"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  outcome: text("outcome", {
    enum: ["improved", "no_change", "declined", "pending"],
  })
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const impactMeasurementsTable = pgTable("impact_measurements", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  studentId: text("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "restrict" }),
  gapId: text("gap_id")
    .notNull()
    .references(() => gapsTable.id, { onDelete: "restrict" }),
  measurementType: text("measurement_type").notNull(),
  scoreBefore: real("score_before"),
  scoreAfter: real("score_after"),
  measuredAt: timestamp("measured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Gap = typeof gapsTable.$inferSelect;
export type RemediationPlan = typeof remediationPlansTable.$inferSelect;
export type ImpactMeasurement = typeof impactMeasurementsTable.$inferSelect;
