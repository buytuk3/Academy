import { raiseStuckPointAlertFromEvent } from "@workspace/db";
/**
 * PHASE-16 (INTERACTION-EVENT-LOG, governing doc v2.1 §3.3) — /v1 surface:
 * THIN ADAPTER over the canonical interaction capability (@workspace/db) —
 * NO SQL, NO business rules here (Architecture Contract).
 * Exposes:
 *   - logInteractionEvent(): FIRE-AND-FORGET hook used by auth/activity
 *     adapters — an event-log failure NEVER fails the main request (§3.3:
 *     observability must not break the learning loop).
 *   - GET /v1/interaction-events        (staff: teacher/principal/admin, filters)
 *   - GET /v1/interaction-events/mine   (student: OWN events only)
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  InteractionCapabilityError,
  listInteractionEvents,
  recordInteractionEvent,
  type InteractionEventType,
  type RecordInteractionEventInput,
} from "@workspace/db";
import { authenticate, authorize, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr } from "./errors.js";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fire-and-forget event hook (§3.3): NEVER throws — a logging failure is
 * swallowed (and would surface via /metrics error counters, not the request).
 */
export async function logInteractionEvent(input: RecordInteractionEventInput): Promise<void> {
  try {
    const rec = await recordInteractionEvent(input);
    // PHASE-27 stuck-point hook (§3.10 / ADR-048): the REAL failure classes of
    // the 0011 vocabulary (LOGIN_FAILED / ERROR — CHECK untouched) raise the
    // manager alert IMMEDIATELY, derived FROM the real event row (zero
    // fabrication); the alert must never break the main request (the §3.3
    // fire-and-forget chain).
    if (rec && !rec.existed && (input.eventType === "LOGIN_FAILED" || input.eventType === "ERROR")) {
      try {
        await raiseStuckPointAlertFromEvent({ tenantId: input.tenantId, sourceEventId: rec.id });
      } catch {
        /* alert fan-out must never break the main request */
      }
    }
  } catch {
    /* event log must never break the main request */
  }
}

const STAFF_EVENTS: Record<string, number> = {
  INTERACTION_EVENT_NOT_FOUND: 404,
};

function interactionError(res: Response, e: unknown): boolean {
  if (e instanceof InteractionCapabilityError) {
    apiError(res, STAFF_EVENTS[e.code] ?? 400, e.code, e.code);
    return true;
  }
  return false;
}

const EVENT_TYPES = new Set<InteractionEventType>([
  "LOGIN", "LOGIN_FAILED", "LOGOUT", "ATTEMPT_START", "ATTEMPT_SUBMIT", "ATTEMPT_FAILED", "ERROR",
]);

// ===== staff listing (filters: studentId, eventType, limit) =====
router.get("/interaction-events", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  const studentId = paramStr(req.query.studentId as string | undefined);
  const eventType = paramStr(req.query.eventType as string | undefined);
  const limitRaw = Number(paramStr(req.query.limit as string | undefined) || "100");
  const limit = Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 100;
  if (studentId && !UUID_RE.test(studentId)) {
    apiError(res, 400, "INVALID_STUDENT_ID", "studentId must be a UUID");
    return;
  }
  if (eventType && !EVENT_TYPES.has(eventType as InteractionEventType)) {
    apiError(res, 400, "INVALID_EVENT_TYPE", "unknown eventType");
    return;
  }
  try {
    const items = await listInteractionEvents({
      tenantId: user.tenantId,
      studentId: studentId || undefined,
      eventType: (eventType || undefined) as InteractionEventType | undefined,
      limit,
    });
    res.json({
      items: items.map((e) => ({
        ...e,
        occurredAt: e.occurredAt instanceof Date ? e.occurredAt.toISOString() : e.occurredAt,
      })),
    });
  } catch (e) {
    if (!interactionError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== student: OWN events only =====
router.get("/interaction-events/mine", authenticate, authorize("student"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.studentId) {
    apiError(res, 403, "STUDENT_CONTEXT_REQUIRED", "Student context missing");
    return;
  }
  try {
    const items = await listInteractionEvents({ tenantId: user.tenantId, studentId: user.studentId, limit: 200 });
    res.json({
      items: items.map((e) => ({
        ...e,
        occurredAt: e.occurredAt instanceof Date ? e.occurredAt.toISOString() : e.occurredAt,
      })),
    });
  } catch (e) {
    if (!interactionError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

export default router;
