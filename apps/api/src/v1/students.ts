/**
 * CORE-24 / Wave 3 — /v1 student adapter (evidence READ-ONLY + insights).
 * THIN ADAPTER ONLY: NO SQL, NO business rules.
 * Evidence: read through the canonical Evidence Reader (count via capability);
 * the API NEVER writes Evidence (record path = POINTER in /attempts/{id}/record).
 * Insights: built by the canonical intelligence facade (READ-ONLY — the Teacher
 * Decision Gate lives in @workspace/decisions and is NEVER bypassed; no
 * recommendation is ever auto-executed here).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  listEvidenceForStudent,
  countEvidenceForStudent,
  assertStudentDetailAccess,
  buildLearnerModel,
  buildStudentTimeline,
  listStudentAttempts,
  listMasteryRecords,
  type EvidenceQuery,
} from "@workspace/db";
import { buildIntelligenceReport, buildStudentPatterns, buildLearningPathProposals } from "@workspace/intelligence";
import { authenticate, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr } from "./errors.js";
import { toEvidenceResponse, toInsightItem, toLearnerModelResponse, toProgressResponse, toRecommendationItem, toAttemptResponse, pagination } from "./mappers.js";

const router: IRouter = Router();

const resolveStudent = (req: Request, res: Response): { tenantId: string; studentId: string; sub: string; role: string } | null => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return null;
  }
  if (user.role === "student") {
    // Student principal: self ONLY — the path parameter must match the token's
    // verified studentId (the token is never treated as an entitlement beyond
    // what the DB rows verify at login).
    const self = user.studentId;
    if (!self || self !== paramStr(req.params.studentId)) {
      apiError(res, 403, "STUDENT_DETAIL_ACCESS_DENIED", "Students may only access their own record");
      return null;
    }
    return { tenantId: user.tenantId, studentId: self, sub: user.sub, role: user.role };
  }
  return { tenantId: user.tenantId, studentId: paramStr(req.params.studentId), sub: user.sub, role: user.role };
};

// ===== GET /v1/students/{studentId}/attempts (listStudentAttempts) =====
router.get("/students/:studentId/attempts", authenticate, async (req: Request, res: Response) => {
  const c = resolveStudent(req, res);
  if (!c) return;
  try {
    if (c.role !== "student") await assertStudentDetailAccess(c.tenantId, c.sub, c.studentId, c.sub);
    const page = pagination(req.query);
    const { total, rows } = await listStudentAttempts(c.tenantId, c.studentId, page);
    const { toAttemptResponse } = await import("./mappers.js");
    res.json({ total, limit: page.limit ?? 50, offset: page.offset ?? 0, items: rows.map(toAttemptResponse) });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/students/{studentId}/evidence (listStudentEvidence — READ-ONLY) =====
router.get("/students/:studentId/evidence", authenticate, async (req: Request, res: Response) => {
  const c = resolveStudent(req, res);
  if (!c) return;
  try {
    if (c.role !== "student") await assertStudentDetailAccess(c.tenantId, c.sub, c.studentId, c.sub);
    const page = pagination(req.query);
    const evidenceType = (req.query as Record<string, string | undefined>).evidenceType;
    const q: EvidenceQuery = {
      tenantId: c.tenantId,
      studentId: c.studentId,
      ...(evidenceType ? { evidenceType: evidenceType as EvidenceQuery["evidenceType"] } : {}),
      limit: page.limit ?? 50,
      offset: page.offset ?? 0,
    };
    const [rows, total] = await Promise.all([
      listEvidenceForStudent(q),
      countEvidenceForStudent({ tenantId: q.tenantId, studentId: q.studentId, evidenceType: q.evidenceType }),
    ]);
    res.json({ total, limit: page.limit ?? 50, offset: page.offset ?? 0, items: rows.map(toEvidenceResponse) });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/students/{studentId}/insights (getStudentInsights — READ-ONLY) =====
router.get("/students/:studentId/insights", authenticate, async (req: Request, res: Response) => {
  const c = resolveStudent(req, res);
  if (!c) return;
  try {
    if (c.role !== "student") await assertStudentDetailAccess(c.tenantId, c.sub, c.studentId, c.sub);
    // Canonical intelligence facade — read-only over Evidence + Learner Model;
    // every proposal is flagged requiresTeacherApproval (Decision Gate intact).
    const report = await buildIntelligenceReport({ tenantId: c.tenantId, studentId: c.studentId });
    res.json({ items: report.insights.map(toInsightItem) });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/students/{studentId}/learner-model (E2 — READ-ONLY projection) =====
// Momentary, deterministic rebuild over canonical Evidence (no store, no cache):
// same evidence ⇒ same model. Student principal: SELF only; staff: scoped by
// assertStudentDetailAccess (TENANT/SCHOOL/GRADE/CLASS). NO overallScore and
// NO student_level can ever appear (CORE-09 invariant — tested in core-29).
const UUID_RE_E2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.get("/students/:studentId/learner-model", authenticate, async (req: Request, res: Response) => {
  const c = resolveStudent(req, res);
  if (!c) return;
  // Adapter-level input guard: the projection throws plain Error(INVALID_*) —
  // shape-check HERE so a malformed path param is a 400, never a 500.
  if (!UUID_RE_E2.test(c.studentId)) {
    apiError(res, 400, "INVALID_STUDENT_ID", "studentId path parameter must be a UUID");
    return;
  }
  try {
    if (c.role !== "student") await assertStudentDetailAccess(c.tenantId, c.sub, c.studentId, c.sub);
    const model = await buildLearnerModel({ tenantId: c.tenantId, studentId: c.studentId });
    res.json(toLearnerModelResponse(model));
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/students/{studentId}/progress (E3/P0 — SLR timeline, READ-ONLY) =====
// Momentary longitudinal projection over canonical Evidence (no store): strands
// per skill with multidimensional indicators — NEVER an overall score.
router.get("/students/:studentId/progress", authenticate, async (req: Request, res: Response) => {
  const c = resolveStudent(req, res);
  if (!c) return;
  if (!UUID_RE_E2.test(c.studentId)) {
    apiError(res, 400, "INVALID_STUDENT_ID", "studentId path parameter must be a UUID");
    return;
  }
  try {
    if (c.role !== "student") await assertStudentDetailAccess(c.tenantId, c.sub, c.studentId, c.sub);
    const timeline = await buildStudentTimeline({ tenantId: c.tenantId, studentId: c.studentId });
    res.json(toProgressResponse(timeline));
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/students/{studentId}/recommendations (E3/P0 — evidence-derived path) =====
// Canonical intelligence: buildStudentPatterns + buildLearningPathProposals —
// every proposal is derived from the student's ACTUAL evidence and is flagged
// requiresTeacherApproval (Decision Gate intact — never auto-executed).
router.get("/students/:studentId/recommendations", authenticate, async (req: Request, res: Response) => {
  const c = resolveStudent(req, res);
  if (!c) return;
  if (!UUID_RE_E2.test(c.studentId)) {
    apiError(res, 400, "INVALID_STUDENT_ID", "studentId path parameter must be a UUID");
    return;
  }
  try {
    if (c.role !== "student") await assertStudentDetailAccess(c.tenantId, c.sub, c.studentId, c.sub);
    const patterns = await buildStudentPatterns({ tenantId: c.tenantId, studentId: c.studentId });
    const proposals = buildLearningPathProposals(patterns, { tenantId: c.tenantId, studentId: c.studentId, maxProposals: 10 });
    res.json({ items: proposals.map(toRecommendationItem) });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/students/{studentId}/dashboard (E4/P0 — one-call learning view) =====
// Pure READ composition over the CANONICAL capabilities already proven in
// core-28/29/30 — NO new store, NO second model:
//   skills/strengths/weaknesses/gaps ← buildLearnerModel (rule projection)
//   progress                         ← buildStudentTimeline (SLR strands)
//   mastery                          ← listMasteryRecords (existing rows; single
//                                       writer stays the reading processor)
//   recommendations/nextActivity     ← buildStudentPatterns → buildLearningPathProposals
//   recentActivities                 ← listStudentAttempts
// NO overallScore / NO student_level anywhere (CORE-09 invariant).
router.get("/students/:studentId/dashboard", authenticate, async (req: Request, res: Response) => {
  const c = resolveStudent(req, res);
  if (!c) return;
  if (!UUID_RE_E2.test(c.studentId)) {
    apiError(res, 400, "INVALID_STUDENT_ID", "studentId path parameter must be a UUID");
    return;
  }
  try {
    if (c.role !== "student") await assertStudentDetailAccess(c.tenantId, c.sub, c.studentId, c.sub);
    const [model, timeline, mastery, patterns, attempts] = await Promise.all([
      buildLearnerModel({ tenantId: c.tenantId, studentId: c.studentId }),
      buildStudentTimeline({ tenantId: c.tenantId, studentId: c.studentId }),
      listMasteryRecords(c.tenantId, c.studentId, 20),
      buildStudentPatterns({ tenantId: c.tenantId, studentId: c.studentId }),
      listStudentAttempts(c.tenantId, c.studentId, { limit: 10, offset: 0 }),
    ]);
    const proposals = buildLearningPathProposals(patterns, { tenantId: c.tenantId, studentId: c.studentId, maxProposals: 5 });
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
      student: { studentId: c.studentId, tenantId: c.tenantId },
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
