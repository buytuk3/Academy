/**
 * Reading Domain tables — unified schema (packages/database).
 * Transferred from engines/reading-engine/src/db/schema.ts with identity unification:
 * serial ids → uuid (tenant-scoped), references aligned to unified identity tables.
 * (ARCHITECTURE_CONTRACT §6 Data Ownership; MOD-001_INTEGRATION_PLAN §7 — ADR-008.)
 */
import {
  pgTable, text, timestamp, real, integer, boolean, varchar, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { classesTable, studentsTable } from "./schools";
import { readingSessionsTable } from "./sessions";

// ===== Passages (Reading owner) =====
export const passagesTable = pgTable(
  "passages",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    teacherId: text("teacher_id").references(() => usersTable.id, { onDelete: "set null" }),
    classroomId: text("classroom_id").references(() => classesTable.id, { onDelete: "set null" }),
    title: varchar("title", { length: 500 }).notNull(),
    text: text("text").notNull(),
    difficulty: integer("difficulty").default(1).notNull(),
    grade: varchar("grade", { length: 20 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ teacherIdx: index("passages_teacher_idx").on(t.teacherId), classIdx: index("passages_class_idx").on(t.classroomId) }),
);

// ===== Attempts (Reading owner) =====
export const attemptsTable = pgTable(
  "attempts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull().references(() => readingSessionsTable.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull().references(() => studentsTable.id, { onDelete: "restrict" }),
    passageId: text("passage_id").notNull().references(() => passagesTable.id, { onDelete: "restrict" }),
    audioKey: text("audio_key"),
    encryptedKey: text("encrypted_key"),
    transcript: text("transcript"),
    durationSec: real("duration_sec"),
    jobId: text("job_id"),
    jobStatus: varchar("job_status", { length: 20 }).default("pending"),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ studentIdx: index("attempts_student_idx").on(t.studentId), sessionIdx: index("attempts_session_idx").on(t.sessionId) }),
);

// ===== Reports (Reading owner) =====
export const reportsTable = pgTable(
  "reports",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    attemptId: text("attempt_id").notNull().references(() => attemptsTable.id, { onDelete: "cascade" }),
    overallScore: real("overall_score").notNull(),
    accuracyScore: real("accuracy_score").notNull(),
    pronunciationScore: real("pronunciation_score").notNull(),
    fluencyScore: real("fluency_score").notNull(),
    prosodyScore: real("prosody_score").notNull(),
    wpm: real("wpm").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ attemptIdx: uniqueIndex("reports_attempt_idx").on(t.attemptId) }),
);

// ===== Phoneme Stats (Reading owner — exclusive) =====
export const phonemeStatsTable = pgTable(
  "phoneme_stats",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull().references(() => studentsTable.id, { onDelete: "restrict" }),
    phoneme: varchar("phoneme", { length: 20 }).notNull(),
    totalOccurrences: integer("total_occurrences").default(0).notNull(),
    errors: integer("errors").default(0).notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ studentPhoneme: uniqueIndex("phoneme_stats_unique").on(t.studentId, t.phoneme) }),
);

// ===== Mastery Records (Mastery owner — single source) =====
export const masteryRecordsTable = pgTable(
  "mastery_records",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull().references(() => studentsTable.id, { onDelete: "restrict" }),
    passageId: text("passage_id").notNull().references(() => passagesTable.id, { onDelete: "restrict" }),
    level: varchar("level", { length: 30 }).notNull(),
    score: real("score").notNull(),
    attempts: integer("attempts").default(1).notNull(),
    trend: varchar("trend", { length: 10 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ unique: uniqueIndex("mastery_records_unique").on(t.studentId, t.passageId) }),
);

// ===== Exercise Assignments =====
export const exerciseAssignmentsTable = pgTable("exercise_assignments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  studentId: text("student_id").notNull().references(() => studentsTable.id, { onDelete: "restrict" }),
  attemptId: text("attempt_id").references(() => attemptsTable.id, { onDelete: "set null" }),
  exerciseId: varchar("exercise_id", { length: 100 }).notNull(),
  reason: text("reason"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===== API Keys =====
export const apiKeysTable = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    keyHash: text("key_hash").notNull(),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ keyIdx: uniqueIndex("api_keys_hash_idx").on(t.keyHash) }),
);
