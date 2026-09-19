/**
 * PHASE-17 (PROVISIONAL-ADVANCE-MASTERY-MODEL, governing doc v2.1 §3.4) —
 * /v1 surface: THIN ADAPTER over the canonical provisional-advance capability
 * (@workspace/db) — NO SQL, NO business rules here (Architecture Contract).
 *   POST /v1/provisional-advance/record-attempt   (staff: feed a stage attempt result)
 *   GET  /v1/provisional-advance/:studentId       (staff scope-checked)
 *   GET  /v1/provisional-advance/mine             (student: OWN progression)
 * Secondary §3.3 event logging (the promotion surfacing on the interaction
 * stream) is FIRE-AND-FORGET via logInteractionEvent — it NEVER breaks the
 * request. The 7-class event vocabulary of 0011 is REUSED (ADR-038: no new
 * event class needed).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ProvisionalAdvanceError,
  recordStageAttempt,
  listStageProgressions,
  getStageProgression,
} from "@workspace/db";
import { authenticate, authorize, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr, validateBody } from "./errors.js";
import { logInteractionEvent } from "./interaction-events.js";
import { z } from "zod";

const router: IRouter = Router();

const PA_STATUS: Record<string, number> = {
  STAGE_PROGRESSION_CLOSED: 409,
};

function paError(res: Response, e: unknown): boolean {
  if (e instanceof ProvisionalAdvanceError) {
    apiError(res, PA_STATUS[e.code] ?? 400, e.code, e.code);
    return true;
  }
  return false;
}

const RecordAttemptSchema = z.object({
  studentId: z.string().uuid(),
  stageKey: z.string().min(1).max(100),
  attemptId: z.string().min(1).max(200),
  passed: z.boolean(),
});

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : v);

// ===== GET /v1/provisional-advance/mine (student: OWN progression) =====
router.get("/provisional-advance/mine", authenticate, authorize("student"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.studentId) {
    apiError(res, 403, "STUDENT_CONTEXT_REQUIRED", "Student context missing");
    return;
  }
  try {
    const items = await listStageProgressions({ tenantId: user.tenantId, studentId: user.studentId });
    res.json({ items: items.map((r) => ({ ...r, updatedAt: iso(r.updatedAt) })) });
  } catch (e) {
    if (!paError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/provisional-advance/record-attempt (staff) =====
router.post("/provisional-advance/record-attempt", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  const body = validateBody<z.infer<typeof RecordAttemptSchema>>(RecordAttemptSchema, req, res);
  if (!body) return;
  try {
    const result = await recordStageAttempt({
      tenantId: user.tenantId,
      studentId: body.studentId,
      stageKey: body.stageKey,
      attemptId: body.attemptId,
      passed: body.passed,
      operationKey: `p17-attempt-${body.attemptId}`,
    });
    // §3.3 fire-and-forget: the promotion surfaces on the interaction stream —
    // a logging failure NEVER fails the advance.
    await logInteractionEvent({
      tenantId: user.tenantId,
      actorId: user.sub,
      actorRole: user.role,
      eventType: "ATTEMPT_SUBMIT",
      studentId: body.studentId,
      attemptId: body.attemptId,
      operationKey: `p17-promo-${body.attemptId}`,
      detail: { phase: "PHASE-17", advanced: result.advanced, mode: result.promotion?.mode ?? null, debtCarried: result.debtCarried },
    });
    res.status(result.advanced ? 201 : 200).json({
      progression: { ...result.progression, updatedAt: iso(result.progression.updatedAt) },
      advanced: result.advanced,
      debtCarried: result.debtCarried,
    });
  } catch (e) {
    if (!paError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/provisional-advance/:studentId (staff scope-checked) =====
router.get("/provisional-advance/:studentId", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const row = await getStageProgression({
      tenantId: user.tenantId,
      studentId: paramStr(req.params.studentId),
      stageKey: paramStr(req.query.stageKey as string | undefined) || "",
    });
    if (!row) {
      apiError(res, 404, "PROGRESSION_NOT_FOUND_IN_TENANT", "No progression for this student in the tenant");
      return;
    }
    res.json({ ...row, updatedAt: iso(row.updatedAt) });
  } catch (e) {
    if (!paError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

export default router;
