import { index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * PHASE-27 — STUCK-POINT-DETECTION-AND-MANAGER-ALERT-ENGINE (§3.10).
 * Migration: 0021_phase27_stuck_point_alerts.sql (the DDL source of truth —
 * FKs + CHECKs live there). RLS: enabled+forced per the 0007 mechanism
 * (fail-closed, tenant-scoped). Config style mirrors notifications.ts /
 * exams.ts. Additive-only per ADR-048 — NO new delivery channel: the
 * fan-out rides the PHASE-24 notifications table (0019) inside the same
 * transaction; the atomic double-delivery guard is
 * UNIQUE(tenant, source_event_id).
 */

/** ONE alert per (tenant, source_event) — the atomic dedup (no double alert for the same event). */
export const stuckPointAlertsTable = pgTable(
  "stuck_point_alerts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    sourceEventId: text("source_event_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    actorId: text("actor_id").notNull(),
    actorRole: text("actor_role").notNull(),
    studentId: text("student_id"),
    schoolId: text("school_id"),
    operationType: text("operation_type").notNull(),
    failureReason: text("failure_reason").notNull(),
    notifiedPrincipals: jsonb("notified_principals").notNull().default([]),
    notifiedAdmins: jsonb("notified_admins").notNull().default([]),
    alertOperationKey: text("alert_operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceUniq: unique("stuck_point_alerts_source_uniq").on(t.tenantId, t.sourceEventId),
    opUniq: unique("stuck_point_alerts_op_uniq").on(t.tenantId, t.alertOperationKey),
    timeIdx: index("stuck_point_alerts_time_idx").on(t.tenantId, t.occurredAt),
  }),
);
