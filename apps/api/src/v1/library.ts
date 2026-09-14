/**
 * CORE-24 / Wave 3 — /v1 content & exercise library adapter.
 * THIN ADAPTER ONLY: Zod-validated requests → Content Library capability →
 * generated response types. NO SQL, NO business rules, NO media handling
 * (body_ref stays an Object Storage POINTER per ADR-004).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ContentCreateRequestSchema,
  ContentSupersedeRequestSchema,
  ExerciseCreateRequestSchema,
  type ContentCreateRequest,
  type ContentSupersedeRequest,
  type ExerciseCreateRequest,
} from "@workspace/api-zod";
import {
  createContentDefinition,
  createExerciseDefinition,
  publishContent,
  publishExercise,
  supersedeContent,
  supersedeExercise,
  getContentDefinition,
  getExerciseDefinition,
  getPublishedExerciseContract,
  listContentVersions,
  searchContent,
  searchExercises,
  ContentLibraryError,
  type ContentSearchFilters,
  type ExerciseSearchFilters,
} from "@workspace/db";
import { authenticate, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, validateBody, requiredIdempotencyKey, paramStr } from "./errors.js";
import { toContentResponse, toExerciseResponse, pagination } from "./mappers.js";

const router: IRouter = Router();

const staffTenant = (req: Request, res: Response): string | null => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated staff tenant context missing");
    return null;
  }
  return user.tenantId;
};

const studentTenant = (req: Request, res: Response): string | null => {
  const user = req.user as AuthUser;
  if (!user?.tenantId) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Tenant context missing");
    return null;
  }
  return user.tenantId;
};

// ===== GET /v1/content (searchContent) =====
router.get("/content", authenticate, async (req: Request, res: Response) => {
  const tenantId = studentTenant(req, res);
  if (!tenantId) return;
  try {
    const q = req.query as Record<string, string | undefined>;
    const filters: ContentSearchFilters = {
      kind: q.kind, source: q.source, status: q.status as ContentSearchFilters["status"],
      subject: q.subject, stageKey: q.stageKey, gradeLevel: q.gradeLevel,
      curriculumId: q.curriculumId, curriculumVersion: q.curriculumVersion,
      lessonId: q.lessonId, titlePrefix: q.titlePrefix,
    };
    const { total, rows } = await searchContent(tenantId, filters, pagination(req.query));
    const page = pagination(req.query);
    res.json({
      total,
      limit: page.limit ?? 50,
      offset: page.offset ?? 0,
      items: rows.map(toContentResponse),
    });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/content (createContent — Idempotency-Key required) =====
router.post("/content", authenticate, async (req: Request, res: Response) => {
  const tenantId = staffTenant(req, res);
  if (!tenantId) return;
  const opKey = requiredIdempotencyKey(req, res);
  if (!opKey) return;
  const body = validateBody<ContentCreateRequest>(ContentCreateRequestSchema, req, res);
  if (!body) return;
  try {
    const user = req.user as AuthUser;
    const { content, created } = await createContentDefinition({
      tenantId,
      title: body.title,
      kind: body.kind,
      source: body.source,
      bodyRef: body.bodyRef,
      language: body.language,
      curriculum: body.curriculum,
      createdBy: user.sub,
      operationKey: opKey,
      metadata: body.metadata,
    });
    res.status(created ? 201 : 200).json({ content: toContentResponse(content), created });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/content/{contentId} (getContent) =====
router.get("/content/:contentId", authenticate, async (req: Request, res: Response) => {
  const tenantId = studentTenant(req, res);
  if (!tenantId) return;
  try {
    const row = await getContentDefinition(tenantId, paramStr(req.params.contentId));
    res.json(toContentResponse(row));
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/content/{contentId}/publish (publishContent) =====
router.post("/content/:contentId/publish", authenticate, async (req: Request, res: Response) => {
  const tenantId = staffTenant(req, res);
  if (!tenantId) return;
  try {
    const user = req.user as AuthUser;
    const row = await publishContent(tenantId, paramStr(req.params.contentId), user.sub);
    res.json(toContentResponse(row));
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/content/{contentId}/versions (listContentVersions) =====
router.get("/content/:contentId/versions", authenticate, async (req: Request, res: Response) => {
  const tenantId = studentTenant(req, res);
  if (!tenantId) return;
  try {
    const rows = await listContentVersions(tenantId, paramStr(req.params.contentId));
    res.json({ items: rows.map(toContentResponse) });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/content/{contentId}/supersede (supersedeContent) =====
router.post("/content/:contentId/supersede", authenticate, async (req: Request, res: Response) => {
  const tenantId = staffTenant(req, res);
  if (!tenantId) return;
  const opKey = requiredIdempotencyKey(req, res);
  if (!opKey) return;
  const body = validateBody<ContentSupersedeRequest>(ContentSupersedeRequestSchema, req, res);
  if (!body) return;
  try {
    const user = req.user as AuthUser;
    const row = await supersedeContent({
      tenantId,
      contentId: paramStr(req.params.contentId),
      actorId: user.sub,
      operationKey: opKey,
      title: body.title,
      bodyRef: body.bodyRef,
      kind: body.kind,
      metadata: body.metadata,
    });
    res.json(toContentResponse(row));
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/exercises (searchExercises) =====
router.get("/exercises", authenticate, async (req: Request, res: Response) => {
  const tenantId = studentTenant(req, res);
  if (!tenantId) return;
  try {
    const q = req.query as Record<string, string | undefined>;
    const filters: ExerciseSearchFilters = {
      engineBinding: q.engineBinding as ExerciseSearchFilters["engineBinding"],
      activityType: q.activityType,
      status: q.status as ExerciseSearchFilters["status"],
      subject: q.subject,
      curriculumVersion: q.curriculumVersion,
      contentId: q.contentId,
    };
    const page = pagination(req.query);
    const { total, rows } = await searchExercises(tenantId, filters, page);
    res.json({ total, limit: page.limit ?? 50, offset: page.offset ?? 0, items: rows.map(toExerciseResponse) });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/exercises (createExercise — Idempotency-Key required) =====
router.post("/exercises", authenticate, async (req: Request, res: Response) => {
  const tenantId = staffTenant(req, res);
  if (!tenantId) return;
  const opKey = requiredIdempotencyKey(req, res);
  if (!opKey) return;
  const body = validateBody<ExerciseCreateRequest>(ExerciseCreateRequestSchema, req, res);
  if (!body) return;
  try {
    const user = req.user as AuthUser;
    const { exercise, created } = await createExerciseDefinition({
      tenantId,
      activityType: body.activityType,
      engineBinding: body.engineBinding,
      expectedResponseType: body.expectedResponseType,
      expectedResponseConfig: body.expectedResponseConfig,
      contentId: body.contentId,
      assessmentRef: body.assessmentRef,
      maxAttempts: body.maxAttempts,
      timeLimitMs: body.timeLimitMs,
      source: body.source,
      curriculum: body.curriculum,
      createdBy: user.sub,
      operationKey: opKey,
      metadata: body.metadata,
    });
    res.status(created ? 201 : 200).json({ exercise: toExerciseResponse(exercise), created });
  } catch (e) {
    if (e instanceof ContentLibraryError) {
      // Contract NOT_FOUND shape for a DRAFT-only binding gate (read path uses
      // the canonical published contract reader below).
      if (e.reason === "EXERCISE_NOT_FOUND_IN_TENANT") {
        apiError(res, 404, e.reason, e.reason);
        return;
      }
    }
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/exercises/{exerciseId} (getPublishedExercise — published-only contract) =====
router.get("/exercises/:exerciseId", authenticate, async (req: Request, res: Response) => {
  const tenantId = studentTenant(req, res);
  if (!tenantId) return;
  try {
    const contract = await getPublishedExerciseContract(tenantId, paramStr(req.params.exerciseId));
    // Published contract status is delivered under the DB vocabulary (DRAFT/PUBLISHED/SUPERSEDED).
    res.json({
      exerciseId: contract.exerciseId,
      tenantId: contract.tenantId,
      engineBinding: contract.engineBinding,
      contentRefs: [...contract.contentRefs],
      expectedResponse: {
        type: contract.expectedResponse.type,
        maxAttempts: contract.expectedResponse.maxAttempts,
        timeLimitMs: contract.expectedResponse.timeLimitMs,
      },
      curriculum: contract.curriculum,
      assessmentPolicyRef: contract.assessmentPolicyRef,
      status: "PUBLISHED",
      version: contract.version,
    });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/exercises/{exerciseId}/publish (publishExercise) =====
router.post("/exercises/:exerciseId/publish", authenticate, async (req: Request, res: Response) => {
  const tenantId = staffTenant(req, res);
  if (!tenantId) return;
  try {
    const user = req.user as AuthUser;
    const row = await publishExercise(tenantId, paramStr(req.params.exerciseId), user.sub);
    res.json(toExerciseResponse(row));
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

export default router;
