import {
  boolean, index, integer, pgTable, text, timestamp, unique,
} from "drizzle-orm/pg-core";

/**
 * PHASE-17 — PROVISIONAL-ADVANCE-MASTERY-MODEL (governing doc v2.1 §3.4).
 * Migration: 0012_phase17_provisional_advance_mastery_model.sql (the DDL
 * source of truth — FKs + CHECKs live there). RLS: enabled+forced per the
 * 0007 mechanism (fail-closed, tenant-scoped). Config style mirrors
 * onboarding.ts / interaction-events.ts. Additive-only per ADR-038.
 */

/** §3.4 progression state per (student, stage); UNIQUE = the atomic lock. */
export const stageProgressionsTable = pgTable(
  "stage_progressions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    studentId: text("student_id").notNull(),
    stageKey: text("stage_key").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    advancedFromStage: text("advanced_from_stage"),
    advanceSeq: integer("advance_seq").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    provisionalBudgetUsed: integer("provisional_budget_used").notNull().default(0),
    debtStatus: text("debt_status").notNull().default("NONE"),
    lastAttemptId: text("last_attempt_id"),
    chainHead: text("chain_head"),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    stageLock: unique("stage_progressions_lock").on(t.tenantId, t.studentId, t.stageKey),
    opUniq: unique("stage_progressions_op_uniq").on(t.tenantId, t.operationKey),
    studentIdx: index("stage_progressions_student_idx").on(t.tenantId, t.studentId, t.status),
  }),
);

/** §3.4 promotion ledger (append-only audit). */
export const stagePromotionsTable = pgTable(
  "stage_promotions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    studentId: text("student_id").notNull(),
    fromStage: text("from_stage").notNull(),
    toStage: text("to_stage").notNull(),
    mode: text("mode").notNull(),
    budgetUsed: integer("budget_used").notNull().default(0),
    debtCarried: boolean("debt_carried").notNull().default(false),
    sourceAttemptId: text("source_attempt_id"),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("stage_promotions_op_uniq").on(t.tenantId, t.operationKey),
    studentIdx: index("stage_promotions_student_idx").on(t.tenantId, t.studentId, t.createdAt),
  }),
);
