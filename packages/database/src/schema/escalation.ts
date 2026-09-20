import { index, integer, json, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * PHASE-19 — CROSS-STAGE-ESCALATION-ENGINE (governing doc v2.1 §3.6).
 * Migration: 0014_phase19_cross_stage_escalation_engine.sql (the DDL source
 * of truth — FKs + CHECKs live there). RLS: enabled+forced per the 0007
 * mechanism (fail-closed, tenant-scoped). Config style mirrors
 * provisional-advance.ts / spaced-review.ts. Additive-only per ADR-040.
 */

/** §3.6 escalation per (student, debt-stage, gap-stage); UNIQUE = the lock. */
export const stageEscalationsTable = pgTable(
  "stage_escalations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    studentId: text("student_id").notNull(),
    fromStage: text("from_stage").notNull(),
    toStage: text("to_stage").notNull(),
    severity: text("severity").notNull().default("HIGH"),
    debtStatusSnapshot: text("debt_status_snapshot").notNull(),
    failedAttemptsTotal: integer("failed_attempts_total").notNull().default(0),
    triggerSummary: json("trigger_summary").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("OPEN"),
    acknowledgedBy: text("acknowledged_by"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    ackOperationKey: text("ack_operation_key"),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    escalationLock: unique("stage_escalations_lock").on(t.tenantId, t.studentId, t.fromStage, t.toStage),
    opUniq: unique("stage_escalations_op_uniq").on(t.tenantId, t.operationKey),
    statusIdx: index("stage_escalations_status_idx").on(t.tenantId, t.status, t.createdAt),
    studentIdx: index("stage_escalations_student_idx").on(t.tenantId, t.studentId, t.createdAt),
  }),
);
