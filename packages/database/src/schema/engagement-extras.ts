import { index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * PHASE-23 — STUDENT-ENGAGEMENT-EXTRAS (points-spend / notes / support).
 * Migration: 0018_phase23_engagement_extras.sql (the DDL source of truth —
 * FKs + CHECKs live there). RLS: enabled+forced per the 0007 mechanism
 * (fail-closed, tenant-scoped). Config style mirrors video.ts /
 * escalation.ts. Additive-only per ADR-044. The point balance itself lives
 * in the EXISTING wallet_accounts (0009) — redemption debits it ATOMICALLY.
 */

/** §5.2.3 صرف النقاط — one redemption ledger row per (tenant, operation_key). */
export const pointRedemptionsTable = pgTable(
  "point_redemptions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    studentId: text("student_id").notNull(),
    item: text("item").notNull(),
    cost: integer("cost").notNull(),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("point_redemptions_op_uniq").on(t.tenantId, t.operationKey),
    studentIdx: index("point_redemptions_student_idx").on(t.tenantId, t.studentId, t.createdAt),
  }),
);

/** Staff notes about a student (teacher/principal authorship preserved). */
export const studentNotesTable = pgTable(
  "student_notes",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    studentId: text("student_id").notNull(),
    authorId: text("author_id").notNull(),
    category: text("category").notNull().default("GENERAL"),
    body: text("body").notNull(),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("student_notes_op_uniq").on(t.tenantId, t.operationKey),
    studentIdx: index("student_notes_student_idx").on(t.tenantId, t.studentId, t.createdAt),
  }),
);

/** Support tickets (any authenticated member creates; staff resolve). */
export const supportTicketsTable = pgTable(
  "support_tickets",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    createdBy: text("created_by").notNull(),
    creatorRole: text("creator_role").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("OPEN"),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolveOperationKey: text("resolve_operation_key"),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("support_tickets_op_uniq").on(t.tenantId, t.operationKey),
    statusIdx: index("support_tickets_status_idx").on(t.tenantId, t.status, t.createdAt),
  }),
);
