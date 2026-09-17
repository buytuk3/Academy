/**
 * PHASE-8 (PARENT-CAPABILITIES) — Parent visibility capability (core-platform).
 * Read-only: a parent sees ONLY children linked to them (parent_student_links,
 * migration 0008). Every query runs inside withTenant → RLS-enforced
 * (fail-closed: without a valid tenant GUC the queries see zero rows).
 * Assertion semantics mirror the staff gate (oversight/aggregation.ts):
 *  - cross-tenant student → STUDENT_NOT_FOUND_IN_TENANT (reads as 404 — no leak),
 *  - own-tenant but unlinked child → PARENT_ACCESS_DENIED (403 — no data).
 * Access is audited (same audit_logs channel as the staff detail gate).
 */
import { and, eq } from "drizzle-orm";
import { db } from "../client.js";
import { withTenant } from "../tenancy.js";
import { AuthorizationError } from "../org/organization.js";
import { parentStudentLinksTable, studentsTable, auditLogsTable } from "../schema/index.js";
import { createLogger } from "@workspace/observability";

const log = createLogger({ name: "buytuk-db:parent-visibility" });

/** Parent access gate: the student must exist in-tenant AND be linked to THIS parent. */
export async function assertParentStudentAccess(
  tenantId: string,
  parentUserId: string,
  studentId: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const [student] = await tx
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tenantId)))
      .limit(1);
    if (!student) throw new AuthorizationError("STUDENT_NOT_FOUND_IN_TENANT");
    const [link] = await tx
      .select({ id: parentStudentLinksTable.id })
      .from(parentStudentLinksTable)
      .where(
        and(
          eq(parentStudentLinksTable.tenantId, tenantId),
          eq(parentStudentLinksTable.parentUserId, parentUserId),
          eq(parentStudentLinksTable.studentId, studentId),
        ),
      )
      .limit(1);
    if (!link) {
      log.warn({ tenantId, parentUserId, studentId }, "parent access denied: no link");
      throw new AuthorizationError("PARENT_ACCESS_DENIED");
    }
    await tx.insert(auditLogsTable).values({
      id: crypto.randomUUID(),
      tenantId,
      actorId: parentUserId,
      action: "parent_child.accessed",
      entity: "student",
      entityId: studentId,
      metadata: null,
    });
  });
}

export type ParentChildSummary = {
  studentId: string;
  firstName: string;
  lastName: string;
  studentCode: string;
  classId: string;
};

/** Linked-children list for a parent (read-only projection over canonical rows). */
export async function listParentChildren(
  tenantId: string,
  parentUserId: string,
): Promise<ParentChildSummary[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        studentId: studentsTable.id,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
        studentCode: studentsTable.studentCode,
        classId: studentsTable.classId,
      })
      .from(parentStudentLinksTable)
      .innerJoin(studentsTable, eq(studentsTable.id, parentStudentLinksTable.studentId))
      .where(
        and(
          eq(parentStudentLinksTable.tenantId, tenantId),
          eq(parentStudentLinksTable.parentUserId, parentUserId),
        ),
      );
    return rows.map((r) => ({ ...r }));
  });
}
