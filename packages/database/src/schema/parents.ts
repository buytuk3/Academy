/**
 * PHASE-8 (PARENT-CAPABILITIES) — Parent↔Student link (visibility backbone).
 * Additive, non-destructive (mirrors migration 0008):
 *  - tenant-scoped (RLS policy tenant_isolation_parent_student_links),
 *  - (tenant_id, operation_key) UNIQUE — database-backed idempotency
 *    (same principles as CORE-05/06/07 — no in-memory dedupe),
 *  - links a parent USER to a student for read-only visibility; no copied data.
 */
import { pgTable, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { studentsTable } from "./schools";

export const parentStudentLinksTable = pgTable(
  "parent_student_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    parentUserId: text("parent_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "restrict" }),
    operationKey: text("operation_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opUniq: unique("parent_student_links_op_uniq").on(t.tenantId, t.operationKey),
    parentIdx: index("parent_student_links_parent_idx").on(t.tenantId, t.parentUserId),
    studentIdx: index("parent_student_links_student_idx").on(t.tenantId, t.studentId),
  }),
);

export type ParentStudentLink = typeof parentStudentLinksTable.$inferSelect;
