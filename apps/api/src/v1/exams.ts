/**
 * PHASE-25 (EXAMS-MODULE: الامتحانات — §5.2.1) — /v1 surface: THIN ADAPTER
 * over the canonical exams capability (@workspace/db) — NO SQL, NO business
 * rules here (Architecture Contract).
 *   POST /v1/exams                        (staff: create — Idempotency-Key)
 *   GET  /v1/exams/mine                   (student: PUBLISHED for own class — NO answerKey)
 *   GET  /v1/exams/submissions/mine       (student: OWN submissions with scores)
 *   GET  /v1/exams/:examId/submissions    (staff: submissions for one exam)
 *   GET  /v1/exams                        (staff: tenant-wide list)
 *   POST /v1/exams/:examId/submit         (student: atomic submit — Idempotency-Key)
 * Literal routes are declared BEFORE the :examId parameterized routes (the
 * P17/P18 route-ordering precedent). NO scheduler/proctoring dependencies —
 * DEV-025/ADR-046 (ZERO new dependencies). §3.3 event logging is
 * FIRE-AND-FORGET and collapses on the same idempotency key.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ExamModuleError,
  createExam,
  listExams,
  listStudentExams,
  submitExam,
  listExamSubmissions,
  listMyExamSubmissions,
} from "@workspace/db";
import { authenticate, authorize, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr } from "./errors.js";
import { logInteractionEvent } from "./interaction-events.js";
import { z } from "zod";

const router: IRouter = Router();

const EXAM_STATUS: Record<string, number> = {
  EXAM_NOT_FOUND: 404,
  ALREADY_SUBMITTED: 409,
  WINDOW_CLOSED: 409,
  EXAM_NOT_PUBLISHED: 409,
};

function examError(res: Response, e: unknown): boolean {
  if (e instanceof ExamModuleError) {
    apiError(res, EXAM_STATUS[e.code] ?? 400, e.code, e.code);
    return true;
  }
  return false;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : v);

function idemKey(req: Request, res: Response): string | null {
  const idem = req.headers["idempotency-key"];
  if (typeof idem !== "string" || idem.length < 8 || idem.length > 200) {
    apiError(res, 400, "IDEMPOTENCY_KEY_REQUIRED", "A unique Idempotency-Key header is required");
    return null;
  }
  return idem;
}

function staffContext(res: Response, req: Request): AuthUser | null {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return null;
  }
  return user;
}

const dateStr = z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), "invalid ISO date");

// ===== POST /v1/exams (staff: create) =====
router.post("/exams", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  const idem = idemKey(req, res);
  if (!idem) return;
  const parsed = z.object({
    classId: z.string().uuid().optional(),
    title: z.string().min(1).max(200),
    subject: z.string().min(1).max(100),
    answerKey: z.record(z.string()).default({}),
    status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).default("DRAFT"),
    opensAt: dateStr,
    closesAt: dateStr,
  }).safeParse(req.body ?? {});
  if (!parsed.success) {
    apiError(res, 400, "VALIDATION_FAILED", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return;
  }
  try {
    const result = await createExam({
      tenantId: user.tenantId,
      classId: parsed.data.classId ?? null,
      title: parsed.data.title,
      subject: parsed.data.subject,
      answerKey: parsed.data.answerKey,
      status: parsed.data.status,
      opensAt: new Date(parsed.data.opensAt),
      closesAt: new Date(parsed.data.closesAt),
      operationKey: `p25-create-${idem}`,
    });
    // §3.3 fire-and-forget: ONE event per unique key (replays collapse).
    await logInteractionEvent({
      tenantId: user.tenantId,
      actorId: user.sub,
      actorRole: user.role,
      eventType: "ATTEMPT_SUBMIT",
      operationKey: `p25-evt-create-${idem}`,
      detail: { phase: "PHASE-25", examId: result.exam.id, created: !result.existed },
    });
    res.status(result.existed ? 200 : 201).json({
      exam: { ...result.exam, opensAt: iso(result.exam.opensAt), closesAt: iso(result.exam.closesAt), createdAt: iso(result.exam.createdAt) },
      existed: result.existed,
    });
  } catch (e) {
    if (!examError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/exams/mine (student: PUBLISHED for own class — NO answerKey) =====
router.get("/exams/mine", authenticate, authorize("student"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const studentId = (user as AuthUser & { studentId?: string }).studentId ?? user.sub;
    const items = await listStudentExams({ tenantId: user.tenantId, studentId });
    res.json({ items: items.map((n) => ({ ...n, opensAt: iso(n.opensAt), closesAt: iso(n.closesAt), createdAt: iso(n.createdAt) })) });
  } catch (e) {
    if (!examError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/exams/submissions/mine (student: OWN submissions) =====
router.get("/exams/submissions/mine", authenticate, authorize("student"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const studentId = (user as AuthUser & { studentId?: string }).studentId ?? user.sub;
    const items = await listMyExamSubmissions({ tenantId: user.tenantId, studentId });
    res.json({ items: items.map((s) => ({ ...s, submittedAt: iso(s.submittedAt) })) });
  } catch (e) {
    if (!examError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/exams/:examId/submissions (staff) =====
router.get("/exams/:examId/submissions", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = staffContext(res, req);
  if (!user) return;
  try {
    const items = await listExamSubmissions({ tenantId: user.tenantId, examId: paramStr(req.params.examId) });
    res.json({ items: items.map((s) => ({ ...s, submittedAt: iso(s.submittedAt) })) });
  } catch (e) {
    if (!examError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/exams (staff: tenant-wide list) =====
router.get("/exams", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = staffContext(res, req);
  if (!user) return;
  try {
    const classId = paramStr(req.query.classId as string | undefined);
    const items = await listExams({ tenantId: user.tenantId, classId: classId || undefined });
    res.json({ items: items.map((n) => ({ ...n, opensAt: iso(n.opensAt), closesAt: iso(n.closesAt), createdAt: iso(n.createdAt) })) });
  } catch (e) {
    if (!examError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/exams/:examId/submit (student: atomic submit) =====
router.post("/exams/:examId/submit", authenticate, authorize("student"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  const idem = idemKey(req, res);
  if (!idem) return;
  const parsed = z.object({
    answers: z.record(z.string()).refine((o) => Object.keys(o).length > 0, "at least one answer"),
  }).safeParse(req.body ?? {});
  if (!parsed.success) {
    apiError(res, 400, "VALIDATION_FAILED", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return;
  }
  try {
    const studentId = (user as AuthUser & { studentId?: string }).studentId ?? user.sub;
    const result = await submitExam({
      tenantId: user.tenantId,
      examId: paramStr(req.params.examId),
      studentId,
      answers: parsed.data.answers,
      operationKey: `p25-submit-${idem}`,
    });
    if (!result.existed) {
      await logInteractionEvent({
        tenantId: user.tenantId,
        actorId: user.sub,
        actorRole: user.role,
        eventType: "ATTEMPT_SUBMIT",
        operationKey: `p25-evt-submit-${idem}`,
        detail: { phase: "PHASE-25", examId: result.submission.examId, score: result.submission.score },
      });
    }
    res.status(result.existed ? 200 : 201).json({
      submission: { ...result.submission, submittedAt: iso(result.submission.submittedAt) },
      existed: result.existed,
    });
  } catch (e) {
    if (!examError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

export default router;
