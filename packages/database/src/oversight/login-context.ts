/**
 * CORE-20 (20-N/20-O/20-P) — Unified Student Login Context validation.
 *
 * ONE unified platform login (no per-school pages). The login CONTEXT the
 * student claims (school/governorate/stage/grade) is NEVER trusted (20-O):
 * it is verified against the authenticated Global Identity's real records —
 * Identity + Membership + School + Stage + Grade — then ALLOW/DENY.
 *
 * 20-P: the four-part name is a DISPLAY attribute only — this module never
 * looks students up by name; the only key is the platform-minted identityId
 * from the authenticated session.
 *
 * Deterministic + audited (reason codes only; no sensitive values in logs).
 */
import { and, eq } from "drizzle-orm";
import {
  studentsTable,
  classesTable,
  schoolsTable,
  auditLogsTable,
} from "../schema/index.js";
import { db } from "../client.js";
import { createLogger, getMetrics, recordSecurityEvent } from "@workspace/observability";
import type { StudentLoginContextInput, StudentLoginContextResult } from "./contracts.js";

const log = createLogger({ name: "@workspace/db/login-context" });

export class LoginContextError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "LoginContextError";
  }
}

async function audit(action: string, tenantId: string, entity: string, entityId: string, metadata?: Record<string, unknown>): Promise<void> {
  await db.insert(auditLogsTable).values({ id: crypto.randomUUID(), tenantId, actorId: undefined, action, entity, entityId, metadata: metadata ? JSON.stringify(metadata) : undefined });
}

function deny(reason: string, tenantId: string, identityId: string, detail: Record<string, unknown>): never {
  // 20-O: denial is a security event (structured, redacted) + audit row.
  recordSecurityEvent(log, getMetrics(), "authorization-failure", { tenantId, detail: { reason, ...detail } });
  throw new LoginContextError(reason);
}

export async function validateStudentLoginContext(input: StudentLoginContextInput): Promise<StudentLoginContextResult> {
  if (!input?.tenantId || !input?.identityId) throw new LoginContextError("LOGIN_CONTEXT_REQUIRED");
  // 20-O: identity → tenant-scoped student record (UUID key ONLY — 20-P).
  const [student] = await db
    .select()
    .from(studentsTable)
    .where(and(eq(studentsTable.identityId, input.identityId), eq(studentsTable.tenantId, input.tenantId)))
    .limit(1);
  if (!student) deny("LOGIN_CONTEXT_NO_MEMBERSHIP", input.tenantId, input.identityId, {});
  const [cls] = await db
    .select()
    .from(classesTable)
    .where(and(eq(classesTable.id, student.classId), eq(classesTable.tenantId, input.tenantId)))
    .limit(1);
  if (!cls) deny("LOGIN_CONTEXT_NO_CLASS", input.tenantId, input.identityId, { studentId: student.id });
  const [school] = await db
    .select()
    .from(schoolsTable)
    .where(and(eq(schoolsTable.id, cls.schoolId), eq(schoolsTable.tenantId, input.tenantId)))
    .limit(1);
  if (!school) deny("LOGIN_CONTEXT_NO_SCHOOL", input.tenantId, input.identityId, { studentId: student.id });

  // Claimed context must MATCH reality (20-O) — claiming a school/class does
  // not make it true; the system decides based on verified records.
  if (input.claimed?.schoolId && input.claimed.schoolId !== school.id) {
    deny("LOGIN_CONTEXT_CLAIM_MISMATCH", input.tenantId, input.identityId, { claimed: "schoolId", studentId: student.id });
  }
  if (input.claimed?.classId && input.claimed.classId !== cls.id) {
    deny("LOGIN_CONTEXT_CLAIM_MISMATCH", input.tenantId, input.identityId, { claimed: "classId", studentId: student.id });
  }
  if (input.claimed?.gradeLevel && input.claimed.gradeLevel !== cls.gradeLevel) {
    deny("LOGIN_CONTEXT_CLAIM_MISMATCH", input.tenantId, input.identityId, { claimed: "gradeLevel", studentId: student.id });
  }
  if (input.claimed?.stageKey && input.claimed.stageKey !== (cls.stageKey ?? null)) {
    deny("LOGIN_CONTEXT_CLAIM_MISMATCH", input.tenantId, input.identityId, { claimed: "stageKey", studentId: student.id });
  }

  await audit("student_login.context_validated", input.tenantId, "student", student.id, { schoolId: school.id });
  return {
    allowed: true,
    studentId: student.id,
    classId: cls.id,
    schoolId: school.id,
    stageKey: cls.stageKey ?? null,
    gradeLevel: cls.gradeLevel,
    organizationId: school.organizationId ?? null,
  };
}
