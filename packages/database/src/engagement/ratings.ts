/**
 * PHASE-11 — Teacher ratings canonical capability (ADR-033 §3 re-target
 * honored: the ratings cap becomes real in PHASE-11). Staff-only writes with
 * the membership-scope gate (TENANT / SCHOOL-of-class / CLASS==classId — same
 * posture as attendance). Idempotent on (tenant_id, operation_key).
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../client.js";
import { withTenant } from "../tenancy.js";
import { classesTable, staffMembershipsTable, studentsTable, teacherRatingsTable } from "../schema/index.js";
import { AuthCapabilityError } from "../auth/session.js";

export type RatingView = {
  id: string; studentId: string; classId: string; ratedBy: string;
  score: number; note: string | null; createdAt: Date;
};

export async function rateStudent(input: {
  tenantId: string; actorId: string; studentId: string; score: number; note?: string; operationKey: string;
}): Promise<RatingView> {
  const { tenantId, actorId, studentId, score, note, operationKey } = input;
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new AuthCapabilityError(400, "INVALID_RATING_SCORE");
  return withTenant(tenantId, async (tx) => {
    const [student] = await tx
      .select({ classId: studentsTable.classId })
      .from(studentsTable)
      .where(and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tenantId)))
      .limit(1);
    if (!student) throw new AuthCapabilityError(404, "STUDENT_NOT_FOUND_IN_TENANT");
    const [cls] = await tx
      .select({ schoolId: classesTable.schoolId })
      .from(classesTable)
      .where(and(eq(classesTable.id, student.classId), eq(classesTable.tenantId, tenantId)))
      .limit(1);
    const memberships = await tx
      .select({ scopeType: staffMembershipsTable.scopeType, scopeId: staffMembershipsTable.scopeId })
      .from(staffMembershipsTable)
      .where(and(eq(staffMembershipsTable.tenantId, tenantId), eq(staffMembershipsTable.userId, actorId), eq(staffMembershipsTable.status, "active")));
    const covered = memberships.some(
      (m) => m.scopeType === "TENANT" || (m.scopeType === "SCHOOL" && m.scopeId === cls?.schoolId) || (m.scopeType === "CLASS" && m.scopeId === student.classId),
    );
    if (!covered) throw new AuthCapabilityError(403, "AUTHZ_NO_SCOPE");
    const [row] = await tx
      .insert(teacherRatingsTable)
      .values({
        id: crypto.randomUUID(), tenantId, studentId, classId: student.classId,
        ratedBy: actorId, score, note: note ?? null, operationKey,
      })
      .onConflictDoNothing({ target: [teacherRatingsTable.tenantId, teacherRatingsTable.operationKey] })
      .returning();
    if (row) return { id: row.id, studentId: row.studentId, classId: row.classId, ratedBy: row.ratedBy, score: row.score, note: row.note, createdAt: row.createdAt };
    const [existing] = await tx
      .select()
      .from(teacherRatingsTable)
      .where(and(eq(teacherRatingsTable.tenantId, tenantId), eq(teacherRatingsTable.operationKey, operationKey)))
      .limit(1);
    return { id: existing.id, studentId: existing.studentId, classId: existing.classId, ratedBy: existing.ratedBy, score: existing.score, note: existing.note, createdAt: existing.createdAt };
  });
}

export async function listRatingsForStaff(tenantId: string, userId: string): Promise<RatingView[]> {
  return withTenant(tenantId, async (tx) => {
    const memberships = await tx
      .select({ scopeType: staffMembershipsTable.scopeType, scopeId: staffMembershipsTable.scopeId })
      .from(staffMembershipsTable)
      .where(and(eq(staffMembershipsTable.tenantId, tenantId), eq(staffMembershipsTable.userId, userId), eq(staffMembershipsTable.status, "active")));
    if (memberships.length === 0) throw new AuthCapabilityError(403, "AUTHZ_NO_MEMBERSHIP");
    if (memberships.some((m) => m.scopeType === "TENANT")) {
      return tx
        .select()
        .from(teacherRatingsTable)
        .where(eq(teacherRatingsTable.tenantId, tenantId))
        .orderBy(desc(teacherRatingsTable.createdAt))
        .limit(200) as unknown as RatingView[];
    }
    const schoolIds = memberships.filter((m) => m.scopeType === "SCHOOL").map((m) => m.scopeId) as string[];
    const classScopeIds = memberships.filter((m) => m.scopeType === "CLASS").map((m) => m.scopeId) as string[];
    const schoolClassIds = schoolIds.length > 0
      ? (await tx
          .select({ id: classesTable.id })
          .from(classesTable)
          .where(and(eq(classesTable.tenantId, tenantId), inArray(classesTable.schoolId, schoolIds)))).map((c) => c.id)
      : [];
    const scopeClassIds = [...new Set([...classScopeIds, ...schoolClassIds])];
    if (scopeClassIds.length === 0) return [];
    const rows = await tx
      .select()
      .from(teacherRatingsTable)
      .where(and(eq(teacherRatingsTable.tenantId, tenantId), inArray(teacherRatingsTable.classId, scopeClassIds)))
      .orderBy(desc(teacherRatingsTable.createdAt))
      .limit(200);
    return rows as unknown as RatingView[];
  });
}
