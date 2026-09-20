import { index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * PHASE-25 — EXAMS-MODULE (§5.2.1: الامتحانات). Migration:
 * 0020_phase25_exams_module.sql (the DDL source of truth — FKs + CHECKs live
 * there). RLS: enabled+forced per the 0007 mechanism (fail-closed,
 * tenant-scoped). Config style mirrors engagement-extras.ts /
 * notifications.ts. Additive-only per ADR-046 — NO scheduler/proctoring
 * dependencies (DEV-025, ZERO new dependencies); the lifecycle is
 * data-driven and grading happens inside the submission transaction.
 */

/** §5.2.1 — one exam per (tenant, operation_key); answer_key is STAFF-ONLY (never in student views). */
export const examsTable = pgTable(
  "exams",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    classId: text("class_id"),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    answerKey: jsonb("answer_key").notNull().default({}),
    status: text("status").notNull().default("DRAFT"),
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("exams_op_uniq").on(t.tenantId, t.operationKey),
    classIdx: index("exams_class_idx").on(t.tenantId, t.classId),
  }),
);

/** §5.2.1 — one submission per (tenant, exam, student) — the ATOMIC double-submit guard. */
export const examSubmissionsTable = pgTable(
  "exam_submissions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    examId: text("exam_id").notNull(),
    studentId: text("student_id").notNull(),
    answers: jsonb("answers").notNull().default({}),
    score: integer("score").notNull().default(0),
    maxScore: integer("max_score").notNull().default(0),
    operationKey: text("operation_key").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    studentUniq: unique("exam_submissions_student_uniq").on(t.tenantId, t.examId, t.studentId),
    opUniq: unique("exam_submissions_op_uniq").on(t.tenantId, t.operationKey),
    examIdx: index("exam_submissions_exam_idx").on(t.tenantId, t.examId, t.submittedAt),
  }),
);
