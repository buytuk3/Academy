import { index, json, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * PHASE-16 — INTERACTION-EVENT-LOG (governing doc v2.1 §3.3).
 * Migration: 0011_phase16_interaction_event_log.sql (DDL source of truth —
 * FKs + CHECKs live there). Deliberately SEPARATE from the canonical `evidence`
 * table (ADR-037). RLS: enabled+forced per the 0007 mechanism (fail-closed).
 * Config style mirrors the 0009/0010 template (object extra-config).
 */
export const interactionEventsTable = pgTable(
  "interaction_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    studentId: text("student_id"),
    actorId: text("actor_id").notNull(),
    actorRole: text("actor_role").notNull(),
    eventType: text("event_type").notNull(),
    schoolId: text("school_id"),
    classId: text("class_id"),
    attemptId: text("attempt_id"),
    detail: json("detail").$type<Record<string, unknown>>().notNull().default({}),
    operationKey: text("operation_key").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("interaction_events_op_uniq").on(t.tenantId, t.operationKey),
    studentIdx: index("interaction_events_student_idx").on(t.tenantId, t.studentId, t.occurredAt),
    typeIdx: index("interaction_events_type_idx").on(t.tenantId, t.eventType, t.occurredAt),
  }),
);
