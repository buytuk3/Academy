/**
 * PHASE-18 (SPACED-REVIEW-ENGINE, governing doc v2.1 §3.5) — /v1 surface:
 * THIN ADAPTER over the canonical spaced-review capability (@workspace/db) —
 * NO SQL, NO business rules here (Architecture Contract).
 *   POST /v1/spaced-review/refresh/:studentId  (staff: derive items from REAL §3.4 progressions)
 *   GET  /v1/spaced-review/:studentId/due      (staff scope-checked due queue)
 *   GET  /v1/spaced-review/mine/due            (student: OWN due queue)
 *   POST /v1/spaced-review/mine/complete       (student: complete OWN review — Idempotency-Key required)
 * Secondary §3.3 event logging (completions on the interaction stream) is
 * FIRE-AND-FORGET — it NEVER breaks the request. The 0011 event vocabulary
 * is REUSED (ADR-039: no new event class).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  SpacedReviewError,
  refreshReviewSchedule,
  completeReview,
  listDueReviews,
} from "@workspace/db";
import { authenticate, authorize, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr, validateBody } from "./errors.js";
import { logInteractionEvent } from "./interaction-events.js";
import { z } from "zod";

const router: IRouter = Router();

const SR_STATUS: Record<string, number> = {
  REVIEW_ITEM_NOT_FOUND: 404,
  STUDENT_CONTEXT_MISMATCH: 403,
  REVIEW_ALREADY_MASTERED: 409,
};

function srError(res: Response, e: unknown): boolean {
  if (e instanceof SpacedReviewError) {
    apiError(res, SR_STATUS[e.code] ?? 400, e.code, e.code);
    return true;
  }
  return false;
}

const CompleteSchema = z.object({
  itemId: z.string().uuid(),
  passed: z.boolean(),
});

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : v);
const itemView = (r: any) => ({
  ...r,
  dueAt: iso(r.dueAt),
  updatedAt: iso(r.updatedAt),
});

// ===== POST /v1/spaced-review/refresh/:studentId (staff) =====
router.post("/spaced-review/refresh/:studentId", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const result = await refreshReviewSchedule({
      tenantId: user.tenantId,
      studentId: paramStr(req.params.studentId),
      operationKey: `p18-refresh-${paramStr(req.params.studentId)}`,
    });
    res.json({
      created: result.created,
      promoted: result.promoted,
      items: result.items.map(itemView),
    });
  } catch (e) {
    if (!srError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/spaced-review/mine/due (student: OWN due queue) =====
router.get("/spaced-review/mine/due", authenticate, authorize("student"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.studentId) {
    apiError(res, 403, "STUDENT_CONTEXT_REQUIRED", "Student context missing");
    return;
  }
  try {
    const items = await listDueReviews({ tenantId: user.tenantId, studentId: user.studentId });
    res.json({ items: items.map(itemView) });
  } catch (e) {
    if (!srError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/spaced-review/:studentId/due (staff scope-checked) =====
router.get("/spaced-review/:studentId/due", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const items = await listDueReviews({ tenantId: user.tenantId, studentId: paramStr(req.params.studentId) });
    res.json({ items: items.map(itemView) });
  } catch (e) {
    if (!srError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/spaced-review/mine/complete (student: OWN review) =====
router.post("/spaced-review/mine/complete", authenticate, authorize("student"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.studentId) {
    apiError(res, 403, "STUDENT_CONTEXT_REQUIRED", "Student context missing");
    return;
  }
  const idem = req.headers["idempotency-key"];
  if (typeof idem !== "string" || idem.length < 8 || idem.length > 200) {
    apiError(res, 400, "IDEMPOTENCY_KEY_REQUIRED", "A unique Idempotency-Key header is required");
    return;
  }
  const body = validateBody<z.infer<typeof CompleteSchema>>(CompleteSchema, req, res);
  if (!body) return;
  try {
    const result = await completeReview({
      tenantId: user.tenantId,
      studentId: user.studentId,
      itemId: body.itemId,
      passed: body.passed,
      operationKey: `p18-complete-${body.itemId}-${idem}`,
    });
    // §3.3 fire-and-forget: the completion surfaces on the interaction stream —
    // a logging failure NEVER fails the completion. The operation key is
    // derived from the SAME idempotency key → replays collapse to one event.
    await logInteractionEvent({
      tenantId: user.tenantId,
      actorId: user.sub,
      actorRole: user.role,
      eventType: "ATTEMPT_SUBMIT",
      studentId: user.studentId,
      operationKey: `p18-ledger-${body.itemId}-${idem}`,
      detail: { phase: "PHASE-18", itemId: result.item.id, passed: body.passed, boxTo: result.ledger.boxTo, intervalDays: result.ledger.intervalDays },
    });
    res.json({ item: itemView(result.item), ledger: result.ledger });
  } catch (e) {
    if (!srError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

export default router;
