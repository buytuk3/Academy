/**
 * PHASE-8 (PARENT-CAPABILITIES) — /v1 parents surface: THIN ADAPTER over the
 * canonical parent-visibility capability (@workspace/db parents/visibility) +
 * the canonical learner builders (@workspace/intelligence + @workspace/db) —
 * NO SQL, NO business rules here (Architecture Contract). Reuses exactly the
 * student-dashboard composition proven in PHASE-6/7 (single source of truth —
 * no parallel logic layer). RBAC: parent role only (authorize("parent")).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  listParentChildren,
  assertParentStudentAccess,
  listMasteryRecords,
  listStudentAttempts,
  buildLearnerModel,
  buildStudentTimeline,
} from "@workspace/db";
import {
  buildStudentPatterns,
  buildLearningPathProposals,
} from "@workspace/intelligence";
import { authenticate, authorize, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr } from "./errors.js";
import { toAttemptResponse, toRecommendationItem } from "./mappers.js";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pctx = (req: Request, res: Response): { tenantId: string; sub: string } | null => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return null;
  }
  return { tenantId: user.tenantId, sub: user.sub };
};

// ===== GET /v1/parents/children (PHASE-8: linked children — read-only) =====
router.get("/parents/children", authenticate, authorize("parent"), async (req: Request, res: Response) => {
  const c = pctx(req, res);
  if (!c) return;
  try {
    const children = await listParentChildren(c.tenantId, c.sub);
    res.json({ children });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/parents/children/:studentId/dashboard (PHASE-8: child visibility) =====
router.get("/parents/children/:studentId/dashboard", authenticate, authorize("parent"), async (req: Request, res: Response) => {
  const c = pctx(req, res);
  if (!c) return;
  const studentId = paramStr(req.params.studentId);
  if (!UUID_RE.test(studentId)) {
    apiError(res, 400, "INVALID_STUDENT_ID", "studentId path parameter must be a UUID");
    return;
  }
  try {
    await assertParentStudentAccess(c.tenantId, c.sub, studentId);
    const [model, timeline, mastery, patterns, attempts] = await Promise.all([
      buildLearnerModel({ tenantId: c.tenantId, studentId }),
      buildStudentTimeline({ tenantId: c.tenantId, studentId }),
      listMasteryRecords(c.tenantId, studentId, 20),
      buildStudentPatterns({ tenantId: c.tenantId, studentId }),
      listStudentAttempts(c.tenantId, studentId, { limit: 10, offset: 0 }),
    ]);
    const proposals = buildLearningPathProposals(patterns, { tenantId: c.tenantId, studentId, maxProposals: 5 });
    const dims = model.dimensions;
    const strengths = dims.filter((x) => x.level === "strong" || x.level === "improving" || x.level === "fast");
    const weaknesses = dims.filter((x) => x.level === "weak" || x.level === "declining" || x.level === "slow");
    const gaps = dims.filter((x) => x.level === "insufficient" || x.trend === "DECLINING");
    const evidenceCount = timeline.strands.reduce((sum, s) => sum + s.progress.evidenceCount, 0);
    const lastActivityAt = timeline.strands
      .map((s) => s.progress.lastOccurredAt)
      .filter((x): x is Date => x !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    res.json({
      student: { studentId, tenantId: c.tenantId },
      builtAt: new Date().toISOString(),
      skills: dims.map((x) => ({ subject: x.subject, skill: x.skill, dimension: x.dimension, level: x.level, trend: x.trend, confidence: x.confidence, sampleCount: x.sampleCount })),
      progress: {
        evidenceCount,
        lastActivityAt: lastActivityAt ? new Date(lastActivityAt).toISOString() : null,
        strands: timeline.strands.map((s) => ({ subject: s.subject, label: s.label, evidenceCount: s.progress.evidenceCount, trend: s.progress.trend })),
      },
      mastery,
      strengths: strengths.map((x) => ({ subject: x.subject, skill: x.skill, dimension: x.dimension, level: x.level })),
      weaknesses: weaknesses.map((x) => ({ subject: x.subject, skill: x.skill, dimension: x.dimension, level: x.level, trend: x.trend })),
      gaps: gaps.map((x) => ({ subject: x.subject, skill: x.skill, dimension: x.dimension, reason: x.reason })),
      recentActivities: attempts.rows.map(toAttemptResponse),
      recommendations: proposals.map(toRecommendationItem),
      nextActivity: proposals.length > 0 ? toRecommendationItem(proposals[0]) : null,
    });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

export default router;
