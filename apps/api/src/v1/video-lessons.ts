/**
 * PHASE-22 (VIDEO-LESSON-CONTENT / الإعراب sibling for §3.8, governing doc
 * v2.1 §3.8) — /v1 surface: THIN ADAPTER over the canonical video-lesson
 * capability (@workspace/db) — NO SQL, NO business rules here (Architecture
 * Contract).
 *   POST /v1/video-lessons                          (staff: register — Idempotency-Key required)
 *   POST /v1/video-lessons/:videoLessonId/publish   (staff: atomic CAS publish — Idempotency-Key required)
 *   GET  /v1/video-lessons/:videoLessonId           (staff: any status; student: READY only — 404 otherwise)
 *   GET  /v1/video-lessons                          (staff: tenant list)
 * Secondary §3.3 event logging (ATTEMPT_SUBMIT class reused — ADR-043) is
 * FIRE-AND-FORGET and collapses on the same idempotency key.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  VideoLessonError,
  registerVideoLesson,
  publishVideoLesson,
  getVideoLesson,
  listVideoLessons,
} from "@workspace/db";
import { authenticate, authorize, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr } from "./errors.js";
import { logInteractionEvent } from "./interaction-events.js";
import { z } from "zod";

const router: IRouter = Router();

const VL_STATUS: Record<string, number> = {
  VIDEO_LESSON_NOT_FOUND: 404,
};

function vlError(res: Response, e: unknown): boolean {
  if (e instanceof VideoLessonError) {
    apiError(res, VL_STATUS[e.code] ?? 400, e.code, e.code);
    return true;
  }
  return false;
}

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  storageKey: z.string().min(3).max(300),
  durationSec: z.number().int().min(0).max(86_400).optional(),
  lessonContentId: z.string().uuid().optional(),
});

const isoOrNull = (v: Date | string | null): string | null =>
  v instanceof Date ? v.toISOString() : v;
const viewOut = (r: any) => ({ ...r, publishedAt: isoOrNull(r.publishedAt), createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt });

function idemKey(req: Request, res: Response): string | null {
  const idem = req.headers["idempotency-key"];
  if (typeof idem !== "string" || idem.length < 8 || idem.length > 200) {
    apiError(res, 400, "IDEMPOTENCY_KEY_REQUIRED", "A unique Idempotency-Key header is required");
    return null;
  }
  return idem;
}

// ===== POST /v1/video-lessons (staff: register; idempotent) =====
router.post("/video-lessons", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  const idem = idemKey(req, res);
  if (!idem) return;
  const parsed = CreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    apiError(res, 400, "VALIDATION_FAILED", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return;
  }
  try {
    const result = await registerVideoLesson({
      tenantId: user.tenantId,
      title: parsed.data.title,
      storageKey: parsed.data.storageKey,
      durationSec: parsed.data.durationSec,
      lessonContentId: parsed.data.lessonContentId,
      createdBy: user.sub,
      operationKey: `p22-create-${idem}`,
    });
    // §3.3 fire-and-forget: ONE event per unique key (replays collapse).
    await logInteractionEvent({
      tenantId: user.tenantId,
      actorId: user.sub,
      actorRole: user.role,
      eventType: "ATTEMPT_SUBMIT",
      operationKey: `p22-evt-create-${idem}`,
      detail: { phase: "PHASE-22", videoLessonId: result.lesson.id, action: "register" },
    });
    res.status(result.existed ? 200 : 201).json({ ...viewOut(result.lesson), existed: result.existed });
  } catch (e) {
    if (!vlError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/video-lessons/:id/publish (staff; atomic CAS) =====
router.post("/video-lessons/:videoLessonId/publish", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  const idem = idemKey(req, res);
  if (!idem) return;
  try {
    const result = await publishVideoLesson({
      tenantId: user.tenantId,
      videoLessonId: paramStr(req.params.videoLessonId),
      publisherId: user.sub,
      operationKey: `p22-pub-${idem}`,
    });
    if (result.changed) {
      // §3.3 fire-and-forget: the publish surfaces once (same key → collapse).
      await logInteractionEvent({
        tenantId: user.tenantId,
        actorId: user.sub,
        actorRole: user.role,
        eventType: "ATTEMPT_SUBMIT",
        operationKey: `p22-evt-pub-${idem}`,
        detail: { phase: "PHASE-22", videoLessonId: result.lesson.id, action: "publish" },
      });
    }
    res.json({ item: viewOut(result.lesson), changed: result.changed, existed: result.existed });
  } catch (e) {
    if (!vlError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/video-lessons/:id (staff: any status; student: READY only) =====
router.get("/video-lessons/:videoLessonId", authenticate, authorize("student", "teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const row = await getVideoLesson({ tenantId: user.tenantId, videoLessonId: paramStr(req.params.videoLessonId) });
    if (!row) {
      apiError(res, 404, "VIDEO_LESSON_NOT_FOUND", "No video lesson with this id in the tenant");
      return;
    }
    // students see ONLY published (READY) lessons — existence-hiding 404
    if (user.role === "student" && row.status !== "READY") {
      apiError(res, 404, "VIDEO_LESSON_NOT_FOUND", "No published video lesson with this id");
      return;
    }
    res.json(viewOut(row));
  } catch (e) {
    if (!vlError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/video-lessons (staff list) =====
router.get("/video-lessons", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  try {
    const items = await listVideoLessons({ tenantId: user.tenantId });
    res.json({ items: items.map(viewOut) });
  } catch (e) {
    if (!vlError(res, e) && !mapCapabilityError(res, e)) throw e;
  }
});

export default router;
