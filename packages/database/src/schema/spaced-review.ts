import { index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * PHASE-18 — SPACED-REVIEW-ENGINE (governing doc v2.1 §3.5).
 * Migration: 0013_phase18_spaced_review_engine.sql (the DDL source of truth —
 * FKs + CHECKs live there). RLS: enabled+forced per the 0007 mechanism
 * (fail-closed, tenant-scoped). Config style mirrors onboarding.ts /
 * provisional-advance.ts. Additive-only per ADR-039.
 */

/** §3.5 schedule per (student, stage, item); UNIQUE = the atomic lock. */
export const reviewItemsTable = pgTable(
  "review_items",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    studentId: text("student_id").notNull(),
    stageKey: text("stage_key").notNull(),
    itemKey: text("item_key").notNull(),
    box: integer("box").notNull().default(1),
    intervalDays: integer("interval_days").notNull().default(1),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("DUE"),
    lastOutcome: text("last_outcome").notNull().default("FAILED_ATTEMPTS"),
    lastAttemptId: text("last_attempt_id"),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    itemLock: unique("review_items_lock").on(t.tenantId, t.studentId, t.stageKey, t.itemKey),
    opUniq: unique("review_items_op_uniq").on(t.tenantId, t.operationKey),
    dueIdx: index("review_items_due_idx").on(t.tenantId, t.studentId, t.status, t.dueAt),
  }),
);

/** §3.5 completion ledger (append-only audit of box transitions). */
export const reviewCompletionsTable = pgTable(
  "review_completions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    studentId: text("student_id").notNull(),
    itemId: text("item_id").notNull(),
    passed: integer("passed").notNull(),
    boxFrom: integer("box_from").notNull(),
    boxTo: integer("box_to").notNull(),
    intervalDays: integer("interval_days").notNull(),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("review_completions_op_uniq").on(t.tenantId, t.operationKey),
    studentIdx: index("review_completions_student_idx").on(t.tenantId, t.studentId, t.createdAt),
  }),
);
