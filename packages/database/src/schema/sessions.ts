import {
  pgTable,
  text,
  integer,
  timestamp,
  real,
  boolean,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { studentsTable } from "./schools";

export const readingSessionsTable = pgTable("reading_sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  studentId: text("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "restrict" }),
  // CORE-02D (session lifecycle): teacher is OPTIONAL on a reading session.
  // Student self-practice is a first-class flow (no teacher present); the
  // teacher is attached when a teacher/admin/principal conducts the session.
  teacherId: text("teacher_id").references(() => usersTable.id, { onDelete: "set null" }),
  sessionType: text("session_type", {
    enum: [
      "reading",
      "dictation",
      "writing",
      "pronunciation",
      "fluency",
      "thinking",
    ],
  })
    .notNull()
    .default("reading"),
  rawScore: integer("raw_score"),
  fluencyScore: real("fluency_score"),
  comprehensionScore: real("comprehension_score"),
  pronunciationScore: real("pronunciation_score"),
  durationSeconds: integer("duration_seconds"),
  status: text("status", {
    enum: ["draft", "completed", "reviewed"],
  })
    .notNull()
    .default("completed"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const evidenceItemsTable = pgTable("evidence_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  sessionId: text("session_id")
    .notNull()
    .references(() => readingSessionsTable.id, { onDelete: "cascade" }),
  evidenceType: text("evidence_type", {
    enum: [
      "word_error",
      "hesitation",
      "self_correction",
      "fluency_break",
      "comprehension_answer",
      "pronunciation_error",
    ],
  }).notNull(),
  value: text("value"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ReadingSession = typeof readingSessionsTable.$inferSelect;
export type EvidenceItem = typeof evidenceItemsTable.$inferSelect;
