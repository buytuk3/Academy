/**
 * PHASE-11 (GAMIFICATION-MESSAGING-ATTENDANCE) — canonical engagement tables.
 * Created by migration 0009 (the documented zero-migration exception: no
 * canonical table existed for wallet/messages/attendance/ratings — ADR-034).
 * All tables are tenant-scoped → RLS (0007 mechanism), idempotent via
 * (tenant_id, operation_key) UNIQUE — same template as 0008. Timestamps use
 * the project-canonical timestamp(..., { withTimezone: true }). Extra-config
 * uses the OBJECT form (this drizzle-orm version), like the existing schemas.
 */
import { check, date, index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const ts = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const walletAccountsTable = pgTable(
  "wallet_accounts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    studentId: text("student_id").notNull(),
    balance: integer("balance").notNull().default(0),
    createdAt: ts(),
  },
  (t) => ({
    studentUniq: unique("wallet_accounts_student_uniq").on(t.tenantId, t.studentId),
  }),
);

export const walletLedgerTable = pgTable(
  "wallet_ledger",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    walletId: text("wallet_id").notNull(),
    studentId: text("student_id").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id").notNull(),
    operationKey: text("operation_key").notNull(),
    createdAt: ts(),
  },
  (t) => ({
    opUniq: unique("wallet_ledger_op_uniq").on(t.tenantId, t.operationKey),
    studentIdx: index("wallet_ledger_student_idx").on(t.tenantId, t.studentId),
  }),
);

export const messagesTable = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    senderId: text("sender_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    body: text("body").notNull(),
    operationKey: text("operation_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => ({
    opUniq: unique("messages_op_uniq").on(t.tenantId, t.operationKey),
    recipientIdx: index("messages_recipient_idx").on(t.tenantId, t.recipientId),
    senderIdx: index("messages_sender_idx").on(t.tenantId, t.senderId),
    bodyLen: check("messages_body_len", sql`length(${t.body}) BETWEEN 1 AND 2000`),
  }),
);

export const attendanceRecordsTable = pgTable(
  "attendance_records",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    studentId: text("student_id").notNull(),
    classId: text("class_id").notNull(),
    sessionDate: date("session_date").notNull(),
    status: text("status").notNull(),
    recordedBy: text("recorded_by").notNull(),
    note: text("note"),
    operationKey: text("operation_key").notNull(),
    createdAt: ts(),
  },
  (t) => ({
    dayUniq: unique("attendance_records_day_uniq").on(t.tenantId, t.studentId, t.sessionDate),
    opUniq: unique("attendance_records_op_uniq").on(t.tenantId, t.operationKey),
    classIdx: index("attendance_records_class_idx").on(t.tenantId, t.classId, t.sessionDate),
    statusCheck: check("attendance_status_check", sql`${t.status} IN ('PRESENT','ABSENT','LATE','EXCUSED')`),
  }),
);

export const teacherRatingsTable = pgTable(
  "teacher_ratings",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    studentId: text("student_id").notNull(),
    classId: text("class_id").notNull(),
    ratedBy: text("rated_by").notNull(),
    score: integer("score").notNull(),
    note: text("note"),
    operationKey: text("operation_key").notNull(),
    createdAt: ts(),
  },
  (t) => ({
    opUniq: unique("teacher_ratings_op_uniq").on(t.tenantId, t.operationKey),
    studentIdx: index("teacher_ratings_student_idx").on(t.tenantId, t.studentId),
    scoreCheck: check("teacher_ratings_score_check", sql`${t.score} BETWEEN 1 AND 5`),
  }),
);
