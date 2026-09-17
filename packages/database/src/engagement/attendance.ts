/**
 * PHASE-11 — Attendance canonical capability (DEV-007). Staff-only writes with
 * a membership-scope gate (TENANT / SCHOOL-of-class / CLASS==classId — the
 * same scope posture as assertStudentDetailAccess); daily idempotency is
 * DATABASE-backed: UNIQUE (tenant_id, student_id, session_date) — a re-mark
 * returns the EXISTING row (created:false), never a duplicate.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../client.js";
import { withTenant } from "../tenancy.js";
import { attendanceRecordsTable, classesTable, staffMembershipsTable, studentsTable } from "../schema/index.js";
import { AuthCapabilityError } from "../auth/session.js";

const STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;
export type AttendanceStatus = (typeof STATUSES)[number];

export type AttendanceView = {
  id: string; studentId: string; classId: string; sessionDate: string;
  status: AttendanceStatus; recordedBy: string; note: string | null; createdAt: Date;
};

export async function markAttendance(input: {
  tenantId: string; actorId: string; studentId: string; sessionDate: string; status: string; note?: string;
}): Promise<AttendanceView & { created: boolean }> {
  const { tenantId, actorId, studentId, sessionDate, status } = input;
  if (!(STATUSES as readonly string[]).includes(status)) throw new AuthCapabilityError(400, "INVALID_ATTENDANCE_STATUS");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) throw new AuthCapabilityError(400, "INVALID_SESSION_DATE");
  return withTenant(tenantId, async (tx) => {
    const [student] = await tx
      .select({ classId: studentsTable.classId })
      .from(studentsTable)
      .where(and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tenantId)))
      .limit(1);
    if (!student) throw new AuthCapabilityError(404, "STUDENT_NOT_FOUND_IN_TENANT");
    // Re-verifiable scope proof (outside tx is fine: membership check is read-only),
    // but keep it INSIDE for one round-trip: use the same tx handle via db-level check below.
    const memberships = await tx
      .select({ scopeType: staffMembershipsTable.scopeType, scopeId: staffMembershipsTable.scopeId })
      .from(staffMembershipsTable)
      .where(and(eq(staffMembershipsTable.tenantId, tenantId), eq(staffMembershipsTable.userId, actorId), eq(staffMembershipsTable.status, "active")));
    const [cls] = await tx
      .select({ schoolId: classesTable.schoolId })
      .from(classesTable)
      .where(and(eq(classesTable.id, student.classId), eq(classesTable.tenantId, tenantId)))
      .limit(1);
    const covered = memberships.some(
      (m) => m.scopeType === "TENANT" || (m.scopeType === "SCHOOL" && m.scopeId === cls?.schoolId) || (m.scopeType === "CLASS" && m.scopeId === student.classId),
    );
    if (!covered) throw new AuthCapabilityError(403, "AUTHZ_NO_SCOPE");

    const operationKey = `att:${studentId}:${sessionDate}`;
    const [row] = await tx
      .insert(attendanceRecordsTable)
      .values({
        id: crypto.randomUUID(), tenantId, studentId, classId: student.classId,
        sessionDate, status: status as AttendanceStatus, recordedBy: actorId,
        note: input.note ?? null, operationKey,
      })
      .onConflictDoNothing({ target: [attendanceRecordsTable.tenantId, attendanceRecordsTable.studentId, attendanceRecordsTable.sessionDate] })
      .returning();
    if (row) {
      return { id: row.id, studentId: row.studentId, classId: row.classId, sessionDate: row.sessionDate, status: row.status as AttendanceStatus, recordedBy: row.recordedBy, note: row.note, createdAt: row.createdAt, created: true };
    }
    const [existing] = await tx
      .select()
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.tenantId, tenantId), eq(attendanceRecordsTable.studentId, studentId), eq(attendanceRecordsTable.sessionDate, sessionDate)))
      .limit(1);
    return { id: existing.id, studentId: existing.studentId, classId: existing.classId, sessionDate: existing.sessionDate, status: existing.status as AttendanceStatus, recordedBy: existing.recordedBy, note: existing.note, createdAt: existing.createdAt, created: false };
  });
}

export async function listAttendanceForStaff(tenantId: string, userId: string): Promise<AttendanceView[]> {
  return withTenant(tenantId, async (tx) => {
    const memberships = await tx
      .select({ scopeType: staffMembershipsTable.scopeType, scopeId: staffMembershipsTable.scopeId })
      .from(staffMembershipsTable)
      .where(and(eq(staffMembershipsTable.tenantId, tenantId), eq(staffMembershipsTable.userId, userId), eq(staffMembershipsTable.status, "active")));
    if (memberships.length === 0) throw new AuthCapabilityError(403, "AUTHZ_NO_MEMBERSHIP");
    if (memberships.some((m) => m.scopeType === "TENANT")) {
      return tx.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.tenantId, tenantId)).orderBy(desc(attendanceRecordsTable.createdAt)).limit(200) as unknown as AttendanceView[];
    }
    const schoolIds = memberships.filter((m) => m.scopeType === "SCHOOL").map((m) => m.scopeId) as string[];
    const classIds = memberships.filter((m) => m.scopeType === "CLASS").map((m) => m.scopeId) as string[];
    let scopeClassIds = [...classIds];
    if (schoolIds.length > 0) {
      const schoolClasses = await tx
        .select({ id: classesTable.id })
        .from(classesTable)
        .where(and(eq(classesTable.tenantId, tenantId), inArray(classesTable.schoolId, schoolIds)));
      scopeClassIds = [...scopeClassIds, ...schoolClasses.map((c) => c.id)];
    }
    if (scopeClassIds.length === 0) return [];
    const rows = await tx
      .select()
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.tenantId, tenantId), inArray(attendanceRecordsTable.classId, scopeClassIds)))
      .orderBy(desc(attendanceRecordsTable.createdAt))
      .limit(200);
    return rows as unknown as AttendanceView[];
  });
}
