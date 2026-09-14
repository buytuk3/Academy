/**
 * CORE-24 / Wave 3 — /v1 oversight adapter (privacy-suppressed aggregates).
 * THIN ADAPTER ONLY: NO SQL, NO business rules. CORE-20 privacy semantics
 * (20-E suppression, 20-AD windows, 20-AH stage narrowing) live ENTIRELY in
 * the aggregateEvidence capability — individual detail above school scope is
 * DENIED there, never here.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { aggregateEvidence, assertStaffScope, type AggregateRequest } from "@workspace/db";
import { authenticate, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError } from "./errors.js";

const router: IRouter = Router();

// ===== GET /v1/oversight/aggregates (getOversightAggregates) =====
router.get("/oversight/aggregates", authenticate, async (req: Request, res: Response) => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return;
  }
  const q = req.query as Record<string, string | undefined>;
  if (!q.from || !q.to) {
    apiError(res, 400, "VALIDATION_ERROR", "from and to (date-time) are required");
    return;
  }
  try {
    await assertStaffScope(user.tenantId, user.sub, q.schoolId);
    const reqPayload: AggregateRequest = {
      tenantId: user.tenantId,
      userId: user.sub,
      ...(q.organizationId ? { organizationId: q.organizationId } : {}),
      ...(q.schoolId ? { schoolId: q.schoolId } : {}),
      ...(q.classId ? { classId: q.classId } : {}),
      ...(q.stageKey ? { stageKey: q.stageKey } : {}),
      ...(q.gradeLevel ? { gradeLevel: q.gradeLevel } : {}),
      ...(q.subject ? { subject: q.subject } : {}),
      ...(q.evidenceType ? { evidenceType: q.evidenceType } : {}),
      timePeriod: { from: q.from, to: q.to },
      ...(q.minimumAggregationSize ? { minimumAggregationSize: parseInt(q.minimumAggregationSize, 10) } : {}),
    };
    const result = await aggregateEvidence(reqPayload);
    res.json({
      groups: result.groups.map((g) => ({
        schoolId: g.schoolId,
        stageKey: g.stageKey,
        gradeLevel: g.gradeLevel,
        subject: g.subject,
        evidenceType: g.evidenceType,
        mean: g.mean,
        sampleSize: g.sampleSize,
        assessedStudents: g.assessedStudents,
        studentsInScope: g.studentsInScope,
        assessmentCoverage: g.assessmentCoverage,
        confidence: g.confidence,
        status: g.status,
        trend: g.trend
          ? { current: g.trend.current, previous: g.trend.previous, direction: g.trend.direction }
          : null,
        timePeriod: g.timePeriod,
      })),
    });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

export default router;
