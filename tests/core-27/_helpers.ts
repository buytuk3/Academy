/**
 * CORE-27 / Batch 2 — shared fixtures (EVIDENCE-ONLY batch; no product changes).
 * Real PostgreSQL via the canonical @workspace/db client. All rows land in the
 * isolated core27_verify database created from the REAL migration chain.
 */
import { randomUUID } from "node:crypto";
import { db, tenantsTable, schoolsTable, classesTable, studentsTable, recordEvidence } from "@workspace/db";

let counter = 0;

export interface StudentFixture { tenantId: string; studentId: string; }

/** tenant → school → class → student (real FK chain, real tables — no mocks). */
export async function makeStudent(label: string): Promise<StudentFixture> {
  const tenantId = randomUUID();
  const schoolId = randomUUID();
  const classId = randomUUID();
  const studentId = randomUUID();
  counter += 1;
  await db.insert(tenantsTable).values({ id: tenantId, name: `C27-T-${label}-${counter}`, slug: `c27-${label}-${counter}-${randomUUID()}` });
  await db.insert(schoolsTable).values({ id: schoolId, tenantId, name: `C27-school-${label}-${counter}` });
  await db.insert(classesTable).values({ id: classId, tenantId, schoolId, name: "7/أ", gradeLevel: "7", academicYear: "2026" });
  await db.insert(studentsTable).values({ id: studentId, tenantId, classId, firstName: "طالب", lastName: label, studentCode: `C27-${randomUUID()}` });
  return { tenantId, studentId };
}

/** Canonical evidence row through the ONLY legal writer (recordEvidence). */
export async function evidenceRow(
  tenantId: string,
  studentId: string,
  evidenceType: "attempt" | "response" | "assessment" | "mistake" | "time" | "intervention" | "decision" | "outcome",
  subject: string,
  response: unknown,
  occurredAt: Date,
  extra: Record<string, unknown> = {},
) {
  return recordEvidence({
    tenantId,
    studentId,
    actorRole: "system",
    evidenceType,
    subject,
    response,
    occurredAt,
    sourceEngine: "c27-proof",
    tool: "core-27-batch2",
    operationKey: `c27:${randomUUID()}`,
    ...extra,
  } as never);
}
