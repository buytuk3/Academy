import { bigint, index, integer, json, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * PHASE-21 — EXAM-BEHAVIORAL-ANALYTICS (governing doc v2.1 §3.9).
 * Migration: 0016_phase21_exam_behavioral_analytics.sql (the DDL source of
 * truth — FKs + CHECKs live there). RLS: enabled+forced per the 0007
 * mechanism (fail-closed, tenant-scoped). Config style mirrors
 * escalation.ts / grammar.ts. Additive-only per ADR-042. Every metric is
 * derived ONLY from the real interaction_events stream (0011) + the
 * canonical attempt→evidence chain — no synthetic data.
 */
export const examBehaviorSnapshotsTable = pgTable(
  "exam_behavior_snapshots",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    studentId: text("student_id").notNull(),
    classId: text("class_id"),
    schoolId: text("school_id"),
    questionsStarted: integer("questions_started").notNull().default(0),
    submissions: integer("submissions").notNull().default(0),
    answerChanges: integer("answer_changes").notNull().default(0),
    avgTimeMs: bigint("avg_time_ms", { mode: "number" }).notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    wrongCount: integer("wrong_count").notNull().default(0),
    failedEvents: integer("failed_events").notNull().default(0),
    sequence: json("sequence").$type<Record<string, unknown>[]>().notNull().default([]),
    metrics: json("metrics").$type<Record<string, unknown>>().notNull().default({}),
    engineVersion: text("engine_version").notNull(),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("exam_behavior_op_uniq").on(t.tenantId, t.operationKey),
    classIdx: index("exam_behavior_class_idx").on(t.tenantId, t.classId, t.createdAt),
    studentIdx: index("exam_behavior_student_idx").on(t.tenantId, t.studentId, t.createdAt),
  }),
);
