/**
 * PHASE-27 (STUCK-POINT-DETECTION-AND-MANAGER-ALERT-ENGINE — §3.10) — /v1
 * surface: THIN ADAPTER over the canonical stuck-point capability
 * (@workspace/db) — NO SQL, NO business rules here (Architecture Contract).
 *   GET  /v1/stuck-points            (staff: tenant-wide alert listing — RLS-scoped)
 *   POST /v1/stuck-points/evaluate   (staff: idempotent re-evaluation of a REAL
 *                                     source event — dedup replay converges)
 * Delivery itself rides the PHASE-24 notification centers (the principal/admin
 * read theirs via /v1/notifications/mine) — no new channel (ADR-048).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { StuckPointError, listStuckPointAlerts, raiseStuckPointAlertFromEvent } from "@workspace/db";
import { authenticate, authorize, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr } from "./errors.js";
import { z } from "zod";

const router: IRouter = Router();

const STUCK_STATUS: Record<string, number> = {
  STUCK_EVENT_NOT_FOUND: 404,
};

function stuckError(res: Response, e: unknown): boolean {
  if (e instanceof StuckPointError) {
    apiError(res, STUCK_STATUS[e.code] ?? 400, e.code, e.code);
    return true;
  }
  return false;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : v);

function staffContext(res: Response, req: Request): AuthUser | null {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return null;
  }
  return user;
}

const alertJson = (a: any) => ({
  ...a,
  occurredAt: iso(a.occurredAt),
  createdAt: iso(a.createdAt),
});

// ===== POST /v1/stuck-points/evaluate (staff: idempotent re-evaluation) =====
router.post("/stuck-points/evaluate", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = staffContext(res, req);
  if (!user) return;
  const parsed = z.object({ sourceEventId: z.string().uuid() }).safeParse(req.body ?? {});
  if (!parsed.success) {
    apiError(res, 400, "VALIDATION_FAILED", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return;
  }
  try {
    const result = await raiseStuckPointAlertFromEvent({
      tenantId: user.tenantId,
      sourceEventId: parsed.data.sourceEventId,
    });
    res.status(result.existed ? 200 : 201).json({
      alert: alertJson(result.alert),
      existed: result.existed,
      notified: result.notified,
    });
  } catch (e) {
    if (!stuckError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/stuck-points (staff: tenant-wide listing) =====
router.get("/stuck-points", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = staffContext(res, req);
  if (!user) return;
  try {
    const operationType = paramStr(req.query.operationType as string | undefined);
    const studentId = paramStr(req.query.studentId as string | undefined);
    const items = await listStuckPointAlerts({
      tenantId: user.tenantId,
      operationType: operationType || undefined,
      studentId: studentId || undefined,
    });
    res.json({ items: items.map(alertJson) });
  } catch (e) {
    if (!stuckError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

export default router;
