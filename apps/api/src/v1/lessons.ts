/**
 * E4/P0 — Lesson Runtime adapter (THIN, pattern-matched to library.ts).
 * A Lesson = a content_definitions row (open registry kind, e.g. "LESSON");
 * its activities = exercises linked via the CORE-24 content_id column.
 * READ-ONLY composition over canonical library capabilities — NO lesson
 * store, NO new tables. The learning loop itself (attempt → evidence →
 * assessment → learner model) flows exclusively through the canonical
 * /v1/attempts surface (startAttemptExecution / submitAttemptExecution).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { getContentDefinition, searchContent, searchExercises } from "@workspace/db";
import { authenticate, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr } from "./errors.js";
import { toContentResponse, toExerciseResponse, pagination } from "./mappers.js";

const router: IRouter = Router();

const ctx = (req: Request, res: Response): { tenantId: string } | null => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return null;
  }
  return { tenantId: user.tenantId };
};

// ===== GET /v1/lessons (discover published lessons; open registry kind, default LESSON) =====
router.get("/lessons", authenticate, async (req: Request, res: Response) => {
  const c = ctx(req, res);
  if (!c) return;
  const q = req.query as Record<string, string | undefined>;
  // Status is a CLOSED DB CHECK (DRAFT/PUBLISHED/SUPERSEDED) — whitelist the query param
  // so an arbitrary string is a 400-free fallback to the default (published lessons only).
  const STATUSES = ["DRAFT", "PUBLISHED", "SUPERSEDED"] as const;
  const statusFilter = (STATUSES as readonly string[]).includes(q.status ?? "") ? (q.status as (typeof STATUSES)[number]) : "PUBLISHED";
  try {
    const page = pagination(req.query);
    const { total, rows } = await searchContent(
      c.tenantId,
      {
        kind: q.kind ?? "LESSON",
        status: statusFilter,
        ...(q.subject ? { subject: q.subject } : {}),
        ...(q.gradeLevel ? { gradeLevel: q.gradeLevel } : {}),
        ...(q.lessonId ? { lessonId: q.lessonId } : {}),
      },
      page,
    );
    res.json({ total, limit: page.limit ?? 50, offset: page.offset ?? 0, items: rows.map(toContentResponse) });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/lessons/:lessonId (open lesson → definition + its PUBLISHED exercises) =====
router.get("/lessons/:lessonId", authenticate, async (req: Request, res: Response) => {
  const c = ctx(req, res);
  if (!c) return;
  try {
    const lesson = await getContentDefinition(c.tenantId, paramStr(req.params.lessonId));
    const acts = await searchExercises(c.tenantId, { contentId: lesson.id, status: "PUBLISHED" }, { limit: 50 });
    res.json({ lesson: toContentResponse(lesson), exercises: acts.rows.map(toExerciseResponse), total: acts.total });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

export default router;
