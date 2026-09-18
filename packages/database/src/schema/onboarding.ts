import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * PHASE-15 — SCHOOL-ONBOARDING-AND-TEACHER-ASSIGNMENT (governing doc v2.1 §3.1+§3.2).
 * Migration: 0010_phase15_school_onboarding_teacher_assignment.sql (the DDL
 * source of truth — FKs + CHECKs live there). RLS: enabled+forced per the 0007
 * mechanism (fail-closed, tenant-scoped). Config style mirrors engagement.ts.
 */

/** §3.1 — pending-by-default school requests; approval = explicit decision. */
export const schoolRequestsTable = pgTable(
  "school_requests",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    requestedBy: text("requested_by").notNull(),
    schoolName: text("school_name").notNull(),
    governorate: text("governorate"),
    stageKey: text("stage_key").notNull(),
    status: text("status").notNull().default("PENDING"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    schoolId: text("school_id"),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("school_requests_op_uniq").on(t.tenantId, t.operationKey),
    statusIdx: index("school_requests_status_idx").on(t.tenantId, t.status),
  }),
);

/** §3.2 — canonical subject×school slot; UNIQUE = the atomic lock. */
export const teachingSlotsTable = pgTable(
  "teaching_slots",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    schoolId: text("school_id").notNull(),
    subject: text("subject").notNull(),
    claimedBy: text("claimed_by"),
    claimStatus: text("claim_status").notNull().default("OPEN"),
    openedByRequestId: text("opened_by_request_id"),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (t) => ({
    slotLock: unique("teaching_slots_lock").on(t.tenantId, t.schoolId, t.subject),
    teacherIdx: index("teaching_slots_teacher_idx").on(t.tenantId, t.claimedBy),
  }),
);

/** §3.2 — principal-authorized second-teacher exception (audited). */
export const teachingSlotOverridesTable = pgTable(
  "teaching_slot_overrides",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    slotId: text("slot_id").notNull(),
    grantedTo: text("granted_to").notNull(),
    grantedBy: text("granted_by").notNull(),
    roleLabel: text("role_label").notNull(),
    reason: text("reason").notNull(),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("teaching_slot_overrides_op_uniq").on(t.tenantId, t.operationKey),
  }),
);
