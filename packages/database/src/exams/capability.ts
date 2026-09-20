/**
 * PHASE-25 — canonical EXAMS-MODULE capability (governing doc §5.2.1).
 * ALL SQL lives here (Architecture Contract). Every write/read runs inside
 * withTenant (0007 RLS mechanism — fail-closed).
 *
 * EXAM LIFECYCLE — the P15-4-proven atomic patterns with idempotency:
 *   • CREATE: (tenant, operation_key) UNIQUE — a replay returns the
 *     EXISTING exam with NO duplicate row;
 *   • SUBMIT: fail-closed checks INSIDE the transaction (exam exists +
 *     status=PUBLISHED + window open), auto-grading against answer_key,
 *     then ONE INSERT with ON CONFLICT DO NOTHING on
 *     UNIQUE(tenant, exam, student) — the ATOMIC double-submit guard:
 *     a SAME-key replay returns the SAME submission; a DIFFERENT key is a
 *     genuine 409 ALREADY_SUBMITTED;
 *   • ANSWER-KEY CONFIDENTIALITY: student views NEVER expose answer_key —
 *     only the staff view carries it (capability-level view exclusion).
 * REUSE-FIRST (DEV-025): NO scheduler/proctoring dependencies — ZERO new
 * dependencies (ADR-046).
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { withTenant } from "../tenancy.js";
import { examsTable, examSubmissionsTable, studentsTable } from "../schema/index.js";

export class ExamModuleError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "ExamModuleError";
    this.code = code;
  }
}

export type ExamStatus = "DRAFT" | "PUBLISHED" | "CLOSED";

/** Student-safe exam view — NEVER carries answer_key. */
export interface ExamView {
  id: string;
  classId: string | null;
  title: string;
  subject: string;
  status: ExamStatus;
  opensAt: Date;
  closesAt: Date;
  createdAt: Date;
}

/** Staff view — adds the answer key. */
export interface ExamStaffView extends ExamView {
  answerKey: Record<string, string>;
}

export interface ExamSubmissionView {
  id: string;
  examId: string;
  studentId: string;
  score: number;
  maxScore: number;
  submittedAt: Date;
}

const examView = (r: typeof examsTable.$inferSelect): ExamView => ({
  id: r.id,
  classId: r.classId,
  title: r.title,
  subject: r.subject,
  status: r.status as ExamStatus,
  opensAt: r.opensAt,
  closesAt: r.closesAt,
  createdAt: r.createdAt,
});

const examStaffView = (r: typeof examsTable.$inferSelect): ExamStaffView => ({
  ...examView(r),
  answerKey: (r.answerKey ?? {}) as Record<string, string>,
});

const subView = (r: typeof examSubmissionsTable.$inferSelect): ExamSubmissionView => ({
  id: r.id,
  examId: r.examId,
  studentId: r.studentId,
  score: r.score,
  maxScore: r.maxScore,
  submittedAt: r.submittedAt,
});

/** §5.2.1: staff creates an exam (idempotent). */
export async function createExam(input: {
  tenantId: string;
  classId?: string | null;
  title: string;
  subject: string;
  answerKey: Record<string, string>;
  status: ExamStatus;
  opensAt: Date;
  closesAt: Date;
  operationKey: string;
}): Promise<{ exam: ExamStaffView; existed: boolean }> {
  return withTenant(input.tenantId, async (tx) => {
    const dup = await tx
      .select()
      .from(examsTable)
      .where(
        and(
          eq(examsTable.tenantId, input.tenantId),
          eq(examsTable.operationKey, input.operationKey),
        ),
      );
    if (dup[0]) {
      return { exam: examStaffView(dup[0]), existed: true };
    }
    const [row] = await tx
      .insert(examsTable)
      .values({
        id: randomUUID(),
        tenantId: input.tenantId,
        classId: input.classId ?? null,
        title: input.title,
        subject: input.subject,
        answerKey: input.answerKey,
        status: input.status,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        operationKey: input.operationKey,
      })
      .returning();
    return { exam: examStaffView(row), existed: false };
  });
}

/** Staff tenant-wide listing (RLS-scoped; optional class filter; ALL statuses). */
export async function listExams(input: {
  tenantId: string;
  classId?: string;
  limit?: number;
}): Promise<ExamStaffView[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(examsTable)
      .where(
        and(
          eq(examsTable.tenantId, input.tenantId),
          ...(input.classId ? [eq(examsTable.classId, input.classId)] : []),
        ),
      )
      .orderBy(desc(examsTable.createdAt))
      .limit(limit);
    return rows.map(examStaffView);
  });
}

/**
 * Student listing: PUBLISHED exams targeted at the student's class (or
 * class-null = tenant-wide). The student's class is resolved INSIDE the
 * transaction (fail-closed). Views NEVER carry answer_key.
 */
export async function listStudentExams(input: {
  tenantId: string;
  studentId: string;
  limit?: number;
}): Promise<ExamView[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  return withTenant(input.tenantId, async (tx) => {
    const [student] = await tx
      .select({ classId: studentsTable.classId })
      .from(studentsTable)
      .where(and(eq(studentsTable.tenantId, input.tenantId), eq(studentsTable.id, input.studentId)));
    if (!student) {
      throw new ExamModuleError("EXAM_NOT_FOUND");
    }
    const rows = await tx
      .select()
      .from(examsTable)
      .where(
        and(
          eq(examsTable.tenantId, input.tenantId),
          eq(examsTable.status, "PUBLISHED"),
        ),
      )
      .orderBy(desc(examsTable.createdAt))
      .limit(limit);
    return rows
      .filter((r) => r.classId === null || r.classId === student.classId)
      .map(examView);
  });
}

/**
 * THE atomic submission (P15-4 pattern): fail-closed status/window checks
 * INSIDE the transaction, in-transaction auto-grading against answer_key,
 * then ONE INSERT with ON CONFLICT DO NOTHING on UNIQUE(tenant, exam,
 * student). No row inserted → SAME-key replay (return the SAME submission,
 * existed=true) or a genuine double-submit (409 ALREADY_SUBMITTED).
 */
export async function submitExam(input: {
  tenantId: string;
  examId: string;
  studentId: string;
  answers: Record<string, string>;
  operationKey: string;
}): Promise<{ submission: ExamSubmissionView; existed: boolean }> {
  return withTenant(input.tenantId, async (tx) => {
    const [exam] = await tx
      .select()
      .from(examsTable)
      .where(and(eq(examsTable.tenantId, input.tenantId), eq(examsTable.id, input.examId)));
    if (!exam) {
      throw new ExamModuleError("EXAM_NOT_FOUND");
    }
    if (exam.status !== "PUBLISHED") {
      throw new ExamModuleError("EXAM_NOT_PUBLISHED");
    }
    const now = new Date();
    if (now < exam.opensAt || now > exam.closesAt) {
      throw new ExamModuleError("WINDOW_CLOSED");
    }
    // in-transaction auto-grading (§5.2.1): exact key matches
    const key = (exam.answerKey ?? {}) as Record<string, string>;
    let score = 0;
    for (const k of Object.keys(key)) {
      if (input.answers[k] === key[k]) score += 1;
    }
    const maxScore = Object.keys(key).length;
    const [ins] = await tx
      .insert(examSubmissionsTable)
      .values({
        id: randomUUID(),
        tenantId: input.tenantId,
        examId: input.examId,
        studentId: input.studentId,
        answers: input.answers,
        score,
        maxScore,
        operationKey: input.operationKey,
      })
      .onConflictDoNothing({
        target: [
          examSubmissionsTable.tenantId,
          examSubmissionsTable.examId,
          examSubmissionsTable.studentId,
        ],
      })
      .returning();
    if (ins) {
      return { submission: subView(ins), existed: false };
    }
    const [existing] = await tx
      .select()
      .from(examSubmissionsTable)
      .where(
        and(
          eq(examSubmissionsTable.tenantId, input.tenantId),
          eq(examSubmissionsTable.examId, input.examId),
          eq(examSubmissionsTable.studentId, input.studentId),
        ),
      );
    if (existing && existing.operationKey === input.operationKey) {
      return { submission: subView(existing), existed: true };
    }
    throw new ExamModuleError("ALREADY_SUBMITTED");
  });
}

/** Staff: submissions for one exam (tenant-scoped, most recent first). */
export async function listExamSubmissions(input: {
  tenantId: string;
  examId: string;
  limit?: number;
}): Promise<ExamSubmissionView[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(examSubmissionsTable)
      .where(
        and(
          eq(examSubmissionsTable.tenantId, input.tenantId),
          eq(examSubmissionsTable.examId, input.examId),
        ),
      )
      .orderBy(desc(examSubmissionsTable.submittedAt))
      .limit(limit);
    return rows.map(subView);
  });
}

/** Student: OWN submissions (tenant-scoped, most recent first). */
export async function listMyExamSubmissions(input: {
  tenantId: string;
  studentId: string;
  limit?: number;
}): Promise<ExamSubmissionView[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(examSubmissionsTable)
      .where(
        and(
          eq(examSubmissionsTable.tenantId, input.tenantId),
          eq(examSubmissionsTable.studentId, input.studentId),
        ),
      )
      .orderBy(desc(examSubmissionsTable.submittedAt))
      .limit(limit);
    return rows.map(subView);
  });
}
