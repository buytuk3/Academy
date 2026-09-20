/**
 * PHASE-21 (EXAM-BEHAVIORAL-ANALYTICS, governing doc v2.1 §3.9) — /v1
 * surface: THIN ADAPTER over the canonical analytics capability
 * (@workspace/db) — NO SQL, NO business rules here (Architecture Contract).
 *   POST /v1/exam-analytics/compute       (student: OWN snapshot; staff: may
 *        target studentId — Idempotency-Key required; replay → same id)
 *   GET  /v1/exam-analytics/mine          (student: OWN snapshots)
 *   GET  /v1/exam-analytics/school        (staff: class/school dashboard —
 *        built ONLY on existing RLS read paths; optional classId filter)
 * Secondary §3.3 event logging (ATTEMPT_SUBMIT class reused — ADR-042) is
 * FIRE-AND-FORGET and collapses on the same idempotency key.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ExamBehaviorError,
  recordExamBehaviorSnapshot,
  listExamBehaviorSnapshots,
  computeExamBehavior,
} from "@workspace/db";
import { authenticate, authorize, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError } from "./errors.js";
import { logInteractionEvent } from "./interaction-events.js";
import { z } from "zod";

const router: IRouter = Router();

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : v);
const viewOut = (r: any) => ({ ...r, createdAt: iso(r.createdAt) });

const ComputeSchema = z.object({
  studentId: z.string().uuid().optional(),
});

// ===== POST /v1/exam-analytics/compute (derive + snapshot; idempotent) =====
router.post("/exam-analytics/compute", authenticate, authorize("student", "teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  const idem = req.headers["idempotency-key"];
  if (typeof idem !== "string" || idem.length < 8 || idem.length > 200) {
    apiError(res, 400, "IDEMPOTENCY_KEY_REQUIRED", "A unique Idempotency-Key header is required");
    return;
  }
  const parsed = ComputeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    apiError(res, 400, "VALIDATION_FAILED", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return;
  }
  // students compute for THEMSELVES; staff may target a tenant student
  const studentId = user.role === "student" ? user.studentId : parsed.data.studentId ?? null;
  if (!studentId) {
    apiError(res, 400, "STUDENT_TARGET_REQUIRED", "staff must pass studentId");
    return;
  }
  try {
    const result = await recordExamBehaviorSnapshot({
      tenantId: user.tenantId,
      studentId,
      operationKey: `p21-snap-${idem}`,
    });
    // §3.3 fire-and-forget: ONE event per unique key (replays collapse).
    await logInteractionEvent({
      tenantId: user.tenantId,
      actorId: user.sub,
      actorRole: user.role,
      eventType: "ATTEMPT_SUBMIT",
      studentId,
      operationKey: `p21-evt-${idem}`,
      detail: { phase: "PHASE-21", snapshotId: result.snapshot.id, questionsStarted: result.snapshot.questionsStarted, answerChanges: result.snapshot.answerChanges },
    });
    res.status(result.existed ? 200 : 201).json({ ...viewOut(result.snapshot), existed: result.existed });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/exam-analytics/mine (student: OWN snapshots) =====
router.get("/exam-analytics/mine", authenticate, authorize("student"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.studentId) {
    apiError(res, 403, "STUDENT_CONTEXT_REQUIRED", "Student context missing");
    return;
  }
  try {
    const items = await listExamBehaviorSnapshots({ tenantId: user.tenantId, studentId: user.studentId });
    res.json({ items: items.map(viewOut) });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/exam-analytics/school (staff dashboard; optional classId) =====
router.get("/exam-analytics/school", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const classId = typeof req.query.classId === "string" ? req.query.classId : undefined;
    const items = await listExamBehaviorSnapshots({ tenantId: user.tenantId, classId });
    res.json({ items: items.map(viewOut) });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/exam-analytics/student/:studentId (staff: live metrics, no snapshot) =====
router.get("/exam-analytics/student/:studentId", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const metrics = await computeExamBehavior({ tenantId: user.tenantId, studentId: req.params.studentId as string });
    res.json({ ...metrics, engineVersion: undefined, studentId: req.params.studentId });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

export default router;
