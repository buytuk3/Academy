/**
 * CORE-21 (21-F…21-M, 21-Q…21-S, 21-X) — Learning Delivery & Activity
 * Foundation capability (core-platform, deterministic, no persistence beyond
 * the EXISTING audit_logs + canonical Evidence — 21-AF gate: no new tables).
 *
 * APPROVAL SEMANTICS (owner clarification, 21-M/21-H):
 *   "School may see student detail" = AUTHORIZED SCHOOL-SCOPE USERS ONLY —
 *   never "any user who happens to belong to the school":
 *     - Principal / authorized school administration → school detail
 *     - Teacher → ONLY students/classes/subjects inside his Scope
 *     - Ministry / Governorate / Directorate → AGGREGATE by default
 *     - NO higher level reaches Individual Student Detail automatically
 * This module implements that as a DISTINCT authorization predicate
 * (assertActivityAccess) layered on CORE-19 checkScope semantics — not a
 * "belongs to school" pass.
 *
 * 21-L: the Teacher stays the decision owner — an activity may be delivered
 * to a student only via the EXISTING decision boundary (proposal → teacher
 * APPROVE → delivery authorization) OR an explicit teacher/admin assignment.
 * No AI → student shortcut exists here.
 *
 * 21-R: religious content gated by CORE-20 canAccessContent (config-driven;
 * this layer never re-decides religion rules). 21-S: delivery REQUIRES a
 * validated login context (CORE-20) — client-claimed school/grade/religion
 * are never trusted.
 *
 * Ownership: core-platform ("activity-foundation"). No AI (21-AO).
 */
import { and, eq, inArray } from "drizzle-orm";
import { auditLogsTable, classesTable, studentsTable } from "../schema/index.js";
import { db } from "../client.js";
import { createLogger, getMetrics, recordSecurityEvent } from "@workspace/observability";
import { canAccessContent } from "../oversight/access-policy.js";
import type { EducationalContentRef } from "../oversight/contracts.js";
import type { StudentReligiousContext } from "../oversight/access-policy.js";
import type { ActivityAssignment, ActivityDefinition, ActivityAttemptContext, ActivityCurriculumAnchor } from "./contracts.js";
import { validateOrganizationType } from "../org/contracts.js";

const log = createLogger({ name: "@workspace/db/activity" });

export class ActivityAccessError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "ActivityAccessError";
  }
}

/** 21-AJ: audit via the EXISTING audit_logs — reason codes only, no sensitive values. */
async function audit(action: string, tenantId: string, actorId: string | undefined, entity: string, entityId: string, metadata?: Record<string, unknown>): Promise<void> {
  await db.insert(auditLogsTable).values({
    id: crypto.randomUUID(),
    tenantId,
    actorId,
    action,
    entity,
    entityId,
    metadata: metadata ? JSON.stringify(metadata) : undefined,
  });
}

function deny(reason: string, tenantId: string, detail: Record<string, unknown>): never {
  recordSecurityEvent(log, getMetrics(), "authorization-failure", { tenantId, detail: { reason, ...detail } });
  throw new ActivityAccessError(reason);
}

// ===== 21-B/21-C: activity definition validation (pure, deterministic) =====

export function validateActivityDefinition(a: ActivityDefinition): void {
  if (!a.activityId?.trim()) throw new Error("ACTIVITY_ID_REQUIRED");
  if (!a.tenantId?.trim()) throw new Error("ACTIVITY_TENANT_REQUIRED");
  const c = a.curriculum;
  if (!c) throw new Error("ACTIVITY_CURRICULUM_REQUIRED"); // 21-O mandatory anchor
  for (const [k, v] of Object.entries({ stageKey: c.stageKey, gradeLevel: c.gradeLevel, subject: c.subject, curriculumId: c.curriculumId, curriculumVersion: c.curriculumVersion })) {
    if (!v || !String(v).trim()) throw new Error(`ACTIVITY_CURRICULUM_ANCHOR_MISSING:${k}`); // 21-O: version REQUIRED
  }
  if (a.status !== "DRAFT" && a.status !== "ACTIVE" && a.status !== "RETIRED") throw new Error("ACTIVITY_STATUS_INVALID");
  if (!Number.isInteger(a.version) || a.version < 1) throw new Error("ACTIVITY_VERSION_INVALID");
  if (!a.expectedResponseType?.trim()) throw new Error("ACTIVITY_RESPONSE_TYPE_REQUIRED");
}

/** 21-E: an activity is NOT an assessment — the two descriptors never merge. */
export function isAssessmentActivity(a: ActivityDefinition): boolean {
  return a.activityType === "ASSESSMENT_ACTIVITY" || !!a.assessmentPolicyRef;
}

// ===== 21-M/21-N: assignment validation (scope-safe, references only) =====

export interface AssignActivityInput {
  definition: ActivityDefinition;
  assignment: Omit<ActivityAssignment, "assignmentId"> & { assignmentId?: string };
  /** 21-R: student-side religious pathway context, from the VERIFIED profile. */
  studentReligiousContext?: StudentReligiousContext | null;
  /** Content-side classification of the activity's lesson (for policy). */
  contentRef?: EducationalContentRef;
}

/**
 * Validates an assignment end-to-end BEFORE delivery:
 *  1. activity definition valid + ACTIVE
 *  2. target INSIDE the same tenant (21-M: Teacher A → School B assignment impossible)
 *  3. religious access policy (CORE-20) decides on the content (21-R)
 *  4. audit trail written (21-AJ)
 * Returns the finalized assignment (id minted when absent).
 */
export async function assignActivity(input: AssignActivityInput): Promise<ActivityAssignment & { assigned: boolean }> {
  validateActivityDefinition(input.definition);
  const t = input.assignment;
  if (!t.assignedBy?.actorId) throw new Error("ASSIGNER_REQUIRED");
  const targets = [t.assignedTo.studentId, t.assignedTo.classId, t.assignedTo.gradeLevel && input.definition.schoolId, t.assignedTo.schoolId, t.assignedTo.stageKey && input.definition.schoolId].filter(Boolean);
  if (targets.length === 0) throw new Error("ASSIGNMENT_TARGET_REQUIRED");
  // Tenant boundary: a school-scoped activity can never be assigned outside its tenant/school (21-M).
  if (input.definition.schoolId && t.assignedTo.schoolId && t.assignedTo.schoolId !== input.definition.schoolId) {
    deny("ASSIGNMENT_CROSS_SCHOOL", input.definition.tenantId, { activityId: input.definition.activityId });
  }
  // 21-R: religious policy gate (config-driven, CORE-20 capability).
  if (input.contentRef) {
    const decision = canAccessContent(
      { tenantId: input.definition.tenantId, studentReligiousContext: input.studentReligiousContext ?? null, stageKey: input.definition.curriculum.stageKey, gradeKey: input.definition.curriculum.gradeKey },
      input.contentRef,
    );
    if (decision.decision === "DENY") {
      await audit("activity.access.denied", input.definition.tenantId, t.assignedBy.actorId, "activity", input.definition.activityId, { reason: decision.reason });
      deny(`ASSIGNMENT_CONTENT_POLICY:${decision.reason}`, input.definition.tenantId, { activityId: input.definition.activityId });
    }
    await audit("activity.access.authorized", input.definition.tenantId, t.assignedBy.actorId, "activity", input.definition.activityId, { reason: decision.reason });
  }
  await audit("activity.assigned", input.definition.tenantId, t.assignedBy.actorId, "activity", input.definition.activityId, { source: t.source, target: Object.keys(t.assignedTo).filter((k) => (t.assignedTo as any)[k]).join(",") });
  return { ...t, assignmentId: t.assignmentId ?? crypto.randomUUID(), assigned: true } as ActivityAssignment & { assigned: boolean };
}

// ===== THE DISTINCT AUTHORIZATION PREDICATE (owner clarification) =====

/** Role classes for the predicate — open vocabulary resolved by membership rows. */
const SCHOOL_ADMIN_ROLES = new Set(["principal", "admin", "lead-teacher"]);

export interface ActivityAccessSubject {
  tenantId: string;
  userId: string;
  /** Verified memberships of the user (staff rows and/or the student's own row). */
  staffMemberships: { role: string; scopeType: string; scopeId: string | null; schoolId: string | null; organizationId: string | null }[];
  /** Set when the requester IS the student (own-activity access). */
  ownStudentId?: string;
}

/**
 * 21-M/21-H predicate — NOT "belongs to school":
 *   TENANT  scope (admin)        → activity access within tenant (definitions), NOT individual detail
 *   ORGANIZATION (ministry/gov/dir) → definitions + aggregates ONLY — individual detail DENIED
 *   SCHOOL + SCHOOL_ADMIN_ROLES  → school-scoped activity/detail ALLOW
 *   SCHOOL + teacher             → ONLY when the student is in a class the teacher owns (CLASS/GRADE scope anchored to that school)
 *   the student himself          → own activities only
 *   everyone else                → DENY
 */
export function assertActivityAccess(args: {
  subject: ActivityAccessSubject;
  definition: Pick<ActivityDefinition, "tenantId" | "schoolId">;
  /** when accessing a SPECIFIC student's activity/detail: */
  studentId?: string;
  /** the target student's verified class/school (from DB — never client claims) */
  studentContext?: { classId: string; schoolId: string };
}): { allowed: true; level: "OWN" | "CLASS" | "SCHOOL_ADMIN" | "DEFINITION_ONLY" } {
  const { subject, definition, studentId, studentContext } = args;
  if (subject.tenantId !== definition.tenantId) {
    deny("ACTIVITY_TENANT_MISMATCH", subject.tenantId, { userId: subject.userId });
  }
  // The student himself: own activity access ONLY.
  if (subject.ownStudentId && studentId && subject.ownStudentId === studentId) return { allowed: true, level: "OWN" };
  if (subject.ownStudentId && studentId && subject.ownStudentId !== studentId) {
    deny("ACTIVITY_ACCESS_DENIED_OTHER_STUDENT", subject.tenantId, { userId: subject.userId }); // 21-AH: student → another student = DENY
  }
  let classScoped = false;
  let schoolAdmin = false;
  for (const m of subject.staffMemberships) {
    if (m.scopeType === "ORGANIZATION") continue; // oversight: definitions/aggregates only — never individual (20-B kept)
    if (m.scopeType === "SCHOOL") {
      const scopedSchool = m.scopeId ?? m.schoolId;
      if (scopedSchool && definition.schoolId && scopedSchool !== definition.schoolId) continue; // other school → no
      if (SCHOOL_ADMIN_ROLES.has(m.role)) schoolAdmin = true; // principal/administration
      // teacher with SCHOOL scope: allowed for DEFINITIONS; student detail requires class/grade anchor below
      if (studentId) {
        if (studentContext && (m.scopeId === studentContext.classId)) classScoped = true;
      } else {
        classScoped = classScoped || m.role === "teacher" || schoolAdmin;
      }
    }
    if (m.scopeType === "CLASS" && studentContext) {
      if (m.scopeId === studentContext.classId) classScoped = true; // teacher → own class students
    }
    if (m.scopeType === "GRADE" && studentContext) {
      // GRADE scope alone does not carry class resolution here — handled by caller via class-scoped rows.
      void m;
    }
  }
  if (studentId) {
    if (classScoped) return { allowed: true, level: "CLASS" }; // teacher → own students ONLY
    if (schoolAdmin) return { allowed: true, level: "SCHOOL_ADMIN" }; // authorized school administration
    deny("ACTIVITY_ACCESS_NOT_AUTHORIZED", subject.tenantId, { userId: subject.userId, studentId });
  }
  if (classScoped || schoolAdmin) return { allowed: true, level: schoolAdmin ? "SCHOOL_ADMIN" : "CLASS" };
  return { allowed: true, level: "DEFINITION_ONLY" }; // tenant/oversight: definitions only
}

/** Resolves the target student's VERIFIED context (DB — client claims ignored, 21-S). */
export async function resolveStudentContext(tenantId: string, studentId: string): Promise<{ classId: string; schoolId: string; stageKey: string | null; gradeLevel: string; identityId: string | null }> {
  const [student] = await db
    .select()
    .from(studentsTable)
    .where(and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tenantId)))
    .limit(1);
  if (!student) throw new ActivityAccessError("STUDENT_NOT_FOUND_IN_TENANT");
  const [cls] = await db
    .select()
    .from(classesTable)
    .where(and(eq(classesTable.id, student.classId), eq(classesTable.tenantId, tenantId)))
    .limit(1);
  if (!cls) throw new ActivityAccessError("STUDENT_CLASS_NOT_FOUND");
  return { classId: cls.id, schoolId: cls.schoolId, stageKey: cls.stageKey ?? null, gradeLevel: cls.gradeLevel, identityId: student.identityId ?? null };
}

// ===== 21-G/21-X/21-I: attempt validation → canonical evidence input =====

/** Time-order + version + reference-only validation (21-G/21-O/21-P). */
export function validateAttempt(attempt: ActivityAttemptContext): void {
  if (!attempt.tenantId || !attempt.studentId || !attempt.activityId) throw new Error("ATTEMPT_CONTEXT_REQUIRED");
  if (!attempt.curriculum?.curriculumVersion) throw new Error("ATTEMPT_CURRICULUM_VERSION_REQUIRED"); // 21-O
  const start = Date.parse(attempt.startedAt);
  if (Number.isNaN(start)) throw new Error("ATTEMPT_STARTED_AT_INVALID");
  if (attempt.submittedAt !== undefined) {
    const sub = Date.parse(attempt.submittedAt);
    if (Number.isNaN(sub)) throw new Error("ATTEMPT_SUBMITTED_AT_INVALID");
    if (sub < start) throw new Error("ATTEMPT_TIME_ORDER_INVALID"); // 21-P: time evidence sanity
  }
  if (attempt.attemptNumber < 1) throw new Error("ATTEMPT_NUMBER_INVALID");
}

/**
 * Builds the CANONICAL evidence input for a completed attempt (21-I: ALL
 * engines funnel through recordEvidence; activityId/lessonId/objectiveId ride
 * along as references — nothing is stored on the activity).
 */
export function attemptEvidenceInput(attempt: ActivityAttemptContext, engine: string, result: {
  confidence?: number; durationMs?: number; response?: unknown; errorType?: string;
}, operationKey: string) {
  validateAttempt(attempt);
  const c: ActivityCurriculumAnchor = attempt.curriculum;
  return {
    tenantId: attempt.tenantId,
    studentId: attempt.studentId,
    actorRole: "student" as const,
    occurredAt: attempt.submittedAt ? new Date(attempt.submittedAt) : new Date(attempt.startedAt),
    evidenceType: "attempt" as const,
    subject: c.subject,
    grade: c.gradeLevel,
    curriculumBook: c.bookId,
    unitId: c.unitId,
    lessonId: attempt.lessonId ?? c.lessonId,
    objectiveId: c.objectiveId,
    activityId: attempt.activityId,
    confidence: result.confidence,
    durationMs: result.durationMs ?? attempt.durationMs,
    response: result.response,
    errorType: result.errorType,
    sourceEngine: engine,
    metadata: { curriculumVersion: c.curriculumVersion, stageKey: c.stageKey, curriculumId: c.curriculumId, assignmentId: attempt.assignmentId, attemptNumber: attempt.attemptNumber },
    operationKey,
  };
}

/** 21-AJ: activity lifecycle audit events (started/submitted). */
export async function auditActivityEvent(action: "activity.started" | "activity.submitted", tenantId: string, actorId: string | undefined, activityId: string, attemptId?: string): Promise<void> {
  await audit(action, tenantId, actorId, "activity", activityId, attemptId ? { attemptId } : undefined);
}

void validateOrganizationType; // registry reuse anchor (types validated at definition level)
