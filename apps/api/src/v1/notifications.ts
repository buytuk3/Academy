/**
 * PHASE-24 (NOTIFICATIONS: مركز الإشعارات + التخصيص حسب الدور — §5.2.4) —
 * /v1 surface: THIN ADAPTER over the canonical notifications capability
 * (@workspace/db) — NO SQL, NO business rules here (Architecture Contract).
 *   POST /v1/notifications               (staff: create for a tenant user — Idempotency-Key)
 *   GET  /v1/notifications/mine          (any member: OWN center; ?unread=1)
 *   GET  /v1/notifications/unread-count  (any member: OWN unread count)
 *   GET  /v1/notifications               (staff: tenant-wide list; ?recipientId=)
 *   POST /v1/notifications/:id/read      (recipient self: atomic CAS — Idempotency-Key)
 *   PUT  /v1/notifications/prefs         (any member: per-user channel prefs §5.2.4)
 *   GET  /v1/notifications/prefs         (any member: OWN prefs)
 * Transports (WebSocket/email/FCM) are DEFERRED — DEV-024/ADR-045: the center
 * is the persistence + read model + atomic mark-read; ZERO new dependencies.
 * Secondary §3.3 event logging (ATTEMPT_SUBMIT class reused — ADR-045) is
 * FIRE-AND-FORGET and collapses on the same idempotency key.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  NotificationCenterError,
  createNotification,
  listNotifications,
  listTenantNotifications,
  getUnreadCount,
  markNotificationRead,
  upsertNotificationPrefs,
  getNotificationPrefs,
} from "@workspace/db";
import { authenticate, authorize, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr } from "./errors.js";
import { logInteractionEvent } from "./interaction-events.js";
import { z } from "zod";

const router: IRouter = Router();

const NC_STATUS: Record<string, number> = {
  NOTIFICATION_NOT_FOUND: 404,
  RECIPIENT_NOT_FOUND: 404,
};

function ncError(res: Response, e: unknown): boolean {
  if (e instanceof NotificationCenterError) {
    apiError(res, NC_STATUS[e.code] ?? 400, e.code, e.code);
    return true;
  }
  return false;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : v);
const isoOrNull = (v: Date | string | null): string | null => (v instanceof Date ? v.toISOString() : v);

function idemKey(req: Request, res: Response): string | null {
  const idem = req.headers["idempotency-key"];
  if (typeof idem !== "string" || idem.length < 8 || idem.length > 200) {
    apiError(res, 400, "IDEMPOTENCY_KEY_REQUIRED", "A unique Idempotency-Key header is required");
    return null;
  }
  return idem;
}

function memberContext(res: Response, req: Request): AuthUser | null {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return null;
  }
  return user;
}

// ===== POST /v1/notifications (staff: create for a tenant user) =====
router.post("/notifications", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  const idem = idemKey(req, res);
  if (!idem) return;
  const parsed = z.object({
    recipientId: z.string().uuid(),
    recipientRole: z.enum(["student", "teacher", "parent", "principal", "admin"]),
    type: z.enum(["GENERAL", "ACADEMIC", "BEHAVIORAL", "SUPPORT", "SYSTEM"]).default("GENERAL"),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(4000),
    ref: z.record(z.unknown()).optional(),
  }).safeParse(req.body ?? {});
  if (!parsed.success) {
    apiError(res, 400, "VALIDATION_FAILED", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return;
  }
  try {
    const result = await createNotification({
      tenantId: user.tenantId,
      recipientId: parsed.data.recipientId,
      recipientRole: parsed.data.recipientRole,
      type: parsed.data.type,
      title: parsed.data.title,
      body: parsed.data.body,
      ref: parsed.data.ref,
      operationKey: `p24-create-${idem}`,
    });
    // §3.3 fire-and-forget: ONE event per unique key (replays collapse).
    await logInteractionEvent({
      tenantId: user.tenantId,
      actorId: user.sub,
      actorRole: user.role,
      eventType: "ATTEMPT_SUBMIT",
      operationKey: `p24-evt-create-${idem}`,
      detail: { phase: "PHASE-24", notificationId: result.notification.id, recipientId: result.notification.recipientId },
    });
    res.status(result.existed ? 200 : 201).json({
      notification: { ...result.notification, readAt: isoOrNull(result.notification.readAt), createdAt: iso(result.notification.createdAt) },
      existed: result.existed,
    });
  } catch (e) {
    if (!ncError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/notifications/mine (any member: OWN center) =====
router.get("/notifications/mine", authenticate, async (req: Request, res: Response) => {
  const user = memberContext(res, req);
  if (!user) return;
  try {
    const unreadOnly = req.query.unread === "1";
    const items = await listNotifications({ tenantId: user.tenantId, recipientId: user.sub, unreadOnly });
    res.json({ items: items.map((n) => ({ ...n, readAt: isoOrNull(n.readAt), createdAt: iso(n.createdAt) })) });
  } catch (e) {
    if (!ncError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/notifications/unread-count (any member: OWN) =====
router.get("/notifications/unread-count", authenticate, async (req: Request, res: Response) => {
  const user = memberContext(res, req);
  if (!user) return;
  try {
    const count = await getUnreadCount({ tenantId: user.tenantId, recipientId: user.sub });
    res.json({ unread: count });
  } catch (e) {
    if (!ncError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== PUT /v1/notifications/prefs (any member: per-user channel prefs) =====
router.put("/notifications/prefs", authenticate, async (req: Request, res: Response) => {
  const user = memberContext(res, req);
  if (!user) return;
  const parsed = z.object({
    channels: z.array(z.enum(["IN_APP", "EMAIL", "PUSH"])).min(1),
    muted: z.boolean().default(false),
  }).safeParse(req.body ?? {});
  if (!parsed.success) {
    apiError(res, 400, "VALIDATION_FAILED", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return;
  }
  try {
    const prefs = await upsertNotificationPrefs({
      tenantId: user.tenantId,
      userId: user.sub,
      prefs: { channels: parsed.data.channels, muted: parsed.data.muted },
    });
    res.json({ prefs: { ...prefs, updatedAt: iso(prefs.updatedAt) } });
  } catch (e) {
    if (!ncError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/notifications/prefs (any member: OWN prefs) =====
router.get("/notifications/prefs", authenticate, async (req: Request, res: Response) => {
  const user = memberContext(res, req);
  if (!user) return;
  try {
    const prefs = await getNotificationPrefs({ tenantId: user.tenantId, userId: user.sub });
    res.json({ prefs: prefs ? { ...prefs, updatedAt: iso(prefs.updatedAt) } : null });
  } catch (e) {
    if (!ncError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/notifications (staff: tenant-wide list; ?recipientId=) =====
router.get("/notifications", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = memberContext(res, req);
  if (!user) return;
  try {
    const recipientId = paramStr(req.query.recipientId as string | undefined);
    const items = await listTenantNotifications({ tenantId: user.tenantId, recipientId: recipientId || undefined });
    res.json({ items: items.map((n) => ({ ...n, readAt: isoOrNull(n.readAt), createdAt: iso(n.createdAt) })) });
  } catch (e) {
    if (!ncError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/notifications/:notificationId/read (recipient self; atomic CAS) =====
router.post("/notifications/:notificationId/read", authenticate, async (req: Request, res: Response) => {
  const user = memberContext(res, req);
  if (!user) return;
  const idem = idemKey(req, res);
  if (!idem) return;
  try {
    const result = await markNotificationRead({
      tenantId: user.tenantId,
      notificationId: paramStr(req.params.notificationId),
      recipientId: user.sub,
      operationKey: `p24-read-${idem}`,
    });
    if (result.changed) {
      await logInteractionEvent({
        tenantId: user.tenantId,
        actorId: user.sub,
        actorRole: user.role,
        eventType: "ATTEMPT_SUBMIT",
        operationKey: `p24-evt-read-${idem}`,
        detail: { phase: "PHASE-24", notificationId: result.notification.id, read: true },
      });
    }
    res.json({ notification: { ...result.notification, readAt: isoOrNull(result.notification.readAt), createdAt: iso(result.notification.createdAt) }, changed: result.changed, existed: result.existed });
  } catch (e) {
    if (!ncError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

export default router;
