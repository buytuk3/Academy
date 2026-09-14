/**
 * CORE-03A — Canonical Evidence model (Core Platform).
 *
 * Single longitudinal Evidence log owned by the platform (packages/database),
 * not by any engine. Engines (Reading first) RECORD evidence here; they keep
 * ownership of their specialized measurements — this table stores references
 * and summary measurements only.
 *
 * Fields follow the canonical evidence contract: every listed dimension is a
 * REAL typed column (metadata is strictly supplementary — never a substitute
 * for the canonical schema; enforced by test).
 */
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { studentsTable } from "./schools";
import { readingSessionsTable } from "./sessions";
import { attemptsTable, passagesTable } from "./reading";

/** The eight canonical evidence kinds (CORE-03). */
export const evidenceTypeEnum = [
  "attempt",
  "response",
  "assessment",
  "mistake",
  "time",
  "intervention",
  "decision",
  "outcome",
] as const;
export type EvidenceType = (typeof evidenceTypeEnum)[number];

export const evidenceTable = pgTable(
  "evidence",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    // ===== Context (mandatory backbone) =====
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull().references(() => studentsTable.id, { onDelete: "restrict" }),
    actorId: text("actor_id"),
    actorRole: text("actor_role"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    // ===== Curriculum / activity placement =====
    subject: text("subject"),
    grade: text("grade"),
    curriculumBook: text("curriculum_book"),
    unitId: text("unit_id"),
    lessonId: text("lesson_id"),
    objectiveId: text("objective_id"),
    activityId: text("activity_id"),
    // ===== Structural references to the reading flow =====
    sessionId: text("session_id").references(() => readingSessionsTable.id, { onDelete: "set null" }),
    attemptId: text("attempt_id").references(() => attemptsTable.id, { onDelete: "set null" }),
    passageId: text("passage_id").references(() => passagesTable.id, { onDelete: "set null" }),
    // ===== Longitudinal chain (SLR flow: diagnosis → intervention → reassessment → outcome) =====
    // Self-referential FK is enforced in migration SQL (003_evidence.sql) to avoid
    // the TS circular-initializer error (TS7022/TS7024) on the table's own init.
    inResponseToId: text("in_response_to_id"),
    // ===== Event details =====
    evidenceType: text("evidence_type", { enum: [...evidenceTypeEnum] }).notNull(),
    action: text("action"),
    response: jsonb("response"),
    result: text("result"),
    durationMs: integer("duration_ms"),
    errorType: text("error_type"),
    confidence: real("confidence"),
    sourceEngine: text("source_engine").notNull(),
    tool: text("tool"),
    teacherDecision: jsonb("teacher_decision"),
    followUp: jsonb("follow_up"),
    // Strictly supplementary — canonical fields must NEVER live here alone.
    metadata: jsonb("metadata"),
    // Idempotency (CORE-05): stable identity of the logical event; unique per tenant.
    operationKey: text("operation_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    studentIdx: index("evidence_student_idx").on(t.tenantId, t.studentId),
    timeIdx: index("evidence_time_idx").on(t.studentId, t.occurredAt),
    // CORE-20 (20-Y): serves the SCOPED+TIME-BOUNDED oversight aggregation
    // (tenantId + occurredAt window) and partitioning readiness (19-L).
    tenantTimeIdx: index("evidence_tenant_time_idx").on(t.tenantId, t.occurredAt),
    attemptIdx: index("evidence_attempt_idx").on(t.attemptId),
    typeIdx: index("evidence_type_idx").on(t.studentId, t.evidenceType, t.occurredAt),
    operationUniq: uniqueIndex("evidence_operation_key_uniq").on(t.tenantId, t.operationKey),
  }),
);

export type Evidence = typeof evidenceTable.$inferSelect;
export type EvidenceRow = typeof evidenceTable.$inferInsert;
