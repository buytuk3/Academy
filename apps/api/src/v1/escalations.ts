/**
 * PHASE-19 (CROSS-STAGE-ESCALATION-ENGINE, governing doc v2.1 §3.6) —
 * /v1 surface: THIN ADAPTER over the canonical escalation capability
 * (@workspace/db) — NO SQL, NO business rules here (Architecture Contract).
 *   POST /v1/escalations/evaluate/:studentId        (staff: run the §3.6 engine on REAL §3.4 data)
 *   GET  /v1/escalations                            (staff: tenant escalation list)
 *   GET  /v1/escalations/:escalationId              (staff: single escalation)
 *   POST /v1/escalations/:escalationId/acknowledge  (staff: atomic ack — Idempotency-Key required)
 * Secondary §3.3 event logging is FIRE-AND-FORGET via logInteractionEvent —
 * it NEVER breaks the request. The 0011 event vocabulary is REUSED
 * (ADR-040: ERROR class fits the significant-gap alert; no new event class).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  EscalationError,
  evaluateEscalation,
  listEscalations,
  acknowledgeEscalation,
} from "@workspace/db";
import { authenticate, authorize, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr } from "./errors.js";
import { logInteractionEvent } from "./interaction-events.js";

const router: IRouter = Router();

const ESC_STATUS: Record<string, number> = {
  ESCALATION_NOT_FOUND: 404,
};

function escError(res: Response, e: unknown): boolean {
  if (e instanceof EscalationError) {
    apiError(res, ESC_STATUS[e.code] ?? 400, e.code, e.code);
    return true;
  }
  return false;
}

const isoOrNull = (v: Date | string | null): string | null =>
  v instanceof Date ? v.toISOString() : v;
const itemView = (r: any) => ({
  ...r,
  acknowledgedAt: isoOrNull(r.acknowledgedAt),
  createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
});

// ===== POST /v1/escalations/evaluate/:studentId (staff) =====
router.post("/escalations/evaluate/:studentId", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const result = await evaluateEscalation({
      tenantId: user.tenantId,
      studentId: paramStr(req.params.studentId),
      operationKey: `p19-eval-${paramStr(req.params.studentId)}`,
    });
    // §3.3 fire-and-forget: one alert event per NEW escalation — a logging
    // failure NEVER fails the evaluation.
    const fresh = result.items.filter((e) => e.status === "OPEN");
    for (const esc of fresh.slice(0, result.created)) {
      await logInteractionEvent({
        tenantId: user.tenantId,
        actorId: user.sub,
        actorRole: user.role,
        eventType: "ERROR",
        studentId: esc.studentId,
        operationKey: `p19-evt-${esc.id}`,
        detail: { phase: "PHASE-19", escalationId: esc.id, severity: esc.severity, fromStage: esc.fromStage, toStage: esc.toStage },
      });
    }
    res.json({ created: result.created, items: result.items.map(itemView) });
  } catch (e) {
    if (!escError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/escalations (staff list) =====
router.get("/escalations", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const studentId = typeof req.query.studentId === "string" ? req.query.studentId : undefined;
    const items = await listEscalations({ tenantId: user.tenantId, studentId });
    res.json({ items: items.map(itemView) });
  } catch (e) {
    if (!escError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/escalations/:escalationId (staff single) =====
router.get("/escalations/:escalationId", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const all = await listEscalations({ tenantId: user.tenantId });
    const row = all.find((e) => e.id === paramStr(req.params.escalationId));
    if (!row) {
      apiError(res, 404, "ESCALATION_NOT_FOUND", "No escalation with this id in the tenant");
      return;
    }
    res.json(itemView(row));
  } catch (e) {
    if (!escError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/escalations/:escalationId/acknowledge (staff; atomic) =====
router.post("/escalations/:escalationId/acknowledge", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
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
  try {
    const result = await acknowledgeEscalation({
      tenantId: user.tenantId,
      escalationId: paramStr(req.params.escalationId),
      teacherId: user.sub,
      operationKey: `p19-ack-${paramStr(req.params.escalationId)}-${idem}`,
    });
    // §3.3 fire-and-forget: the ack surfaces once (op key derived from the
    // SAME idempotency key — replays collapse to one event).
    if (result.changed) {
      await logInteractionEvent({
        tenantId: user.tenantId,
        actorId: user.sub,
        actorRole: user.role,
        eventType: "ERROR",
        studentId: result.item.studentId,
        operationKey: `p19-evt-ack-${result.item.id}-${idem}`,
        detail: { phase: "PHASE-19", escalationId: result.item.id, acknowledged: true },
      });
    }
    res.json({ item: itemView(result.item), changed: result.changed, existed: result.existed });
  } catch (e) {
    if (!escError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

export default router;
