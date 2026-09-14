/**
 * E1 — Teacher Runtime adapter (THIN, pattern-matched to students.ts).
 * Wraps the CANONICAL capabilities in HTTP — no new decision system:
 *   GET  /v1/teacher/review-queue          → listPendingProposals (loop state) +
 *                                            buildTeacherReviewQueue (insights, read-only)
 *   POST /v1/interventions/:id/decision    → applyTeacherDecision (@workspace/decisions,
 *                                            PENDING→FINAL state machine preserved) then —
 *                                            ACR-E1-001 (V-3 extension, owner-approved):
 *                                            loop RESUME inside the decision path via the
 *                                            official runLearningLoop (teacherDecision passed;
 *                                            REJECTED stops cleanly at the gate). Loop failure
 *                                            NEVER fails the decision — evidence is canonical
 *                                            and the loop is idempotently resumable (R-027-05).
 *   POST /v1/interventions/:id/feedback    → recordTeacherFeedback (writes ONLY via the
 *                                            canonical recordEvidence writer)
 *   POST /v1/interventions/:id/delivery    → assertDeliveryAuthorized (proposal+student+
 *                                            tenant+activity binding) THEN startAttemptExecution.
 *                                            No path bypasses the Teacher Gate: delivery without
 *                                            a FINAL decision is impossible (no stored
 *                                            authorization → DELIVERY_NOT_AUTHORIZED).
 * RBAC: staff deciders only (teacher/principal/admin — platform ROLES; the decision
 * capability re-verifies with DECISION_ROLES internally). Tenant isolation: every
 * capability call is tenant-scoped; cross-tenant proposal ids read as NOT_FOUND.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  getTeacherProposal,
  listPendingProposals,
  assertStudentDetailAccess,
  startAttemptExecution,
} from "@workspace/db";
import {
  buildIntelligenceReport,
  buildTeacherReviewQueue,
  recordTeacherFeedback,
} from "@workspace/intelligence";
import { authenticate, authorize, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, paramStr } from "./errors.js";
import { createLogger } from "@workspace/observability";

const router: IRouter = Router();
const log = createLogger({ name: "buytuk-api:teacher-runtime" });

const ctx = (req: Request, res: Response): { tenantId: string; sub: string; role: string } | null => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return null;
  }
  return { tenantId: user.tenantId, sub: user.sub, role: user.role };
};

const DECISION_ACTIONS = ["APPROVED", "MODIFIED", "REJECTED"] as const;
const FEEDBACK_ACTIONS = ["APPROVED", "MODIFIED", "REJECTED", "CONFIRMED"] as const;

const DecisionBody = z.object({
  action: z.enum(DECISION_ACTIONS),
  reason: z.string().max(2000).optional(),
  modifications: z.record(z.unknown()).optional(),
  rejectionReason: z.string().max(2000).optional(),
});

const FeedbackBody = z.object({
  decision: z.enum(FEEDBACK_ACTIONS),
  note: z.string().max(4000).optional(),
  modifications: z.record(z.unknown()).optional(),
});

const DeliveryBody = z.object({
  exerciseId: z.string().uuid(),
  activityId: z.string().min(1).max(200).optional(),
  attemptNumber: z.number().int().min(1).optional(),
});

// ===== GET /v1/teacher/review-queue (E1: pending loop proposals + read-only insights) =====
router.get("/teacher/review-queue", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const c = ctx(req, res);
  if (!c) return;
  try {
    const q = req.query as Record<string, string | undefined>;
    const pending = await listPendingProposals(c.tenantId, {
      ...(q.studentId ? { studentId: q.studentId } : {}),
      ...(q.skill ? { skill: q.skill } : {}),
      ...(q.limit ? { limit: parseInt(q.limit, 10) } : {}),
    });
    // Read-only intelligence queue for ONE student — staff scope verified by the
    // canonical 21-M/23-H access predicate (same guard as GET /students/:id/*).
    let reviewItems: unknown[] = [];
    if (q.studentId) {
      await assertStudentDetailAccess(c.tenantId, c.sub, q.studentId, c.sub);
      const report = await buildIntelligenceReport({ tenantId: c.tenantId, studentId: q.studentId });
      reviewItems = buildTeacherReviewQueue(report.insights);
    }
    res.json({
      pendingProposals: pending.map((p) => ({
        id: p.id, tenantId: p.tenantId, studentId: p.studentId, diagnosisId: p.diagnosisId,
        skill: p.skill, activityType: p.activityType, status: p.status,
        createdAt: p.createdAt, operationKey: p.operationKey,
      })),
      reviewItems,
    });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/interventions/:proposalId/decision (E1: applyTeacherDecision + V-3 resume) =====
router.post("/interventions/:proposalId/decision", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const c = ctx(req, res);
  if (!c) return;
  const body = DecisionBody.safeParse(req.body);
  if (!body.success) {
    apiError(res, 400, "VALIDATION_ERROR", "Request body failed contract validation");
    return;
  }
  try {
    const proposal = await getTeacherProposal(c.tenantId, paramStr(req.params.proposalId));
    if (!proposal) {
      apiError(res, 404, "INTERVENTION_NOT_FOUND", "Proposal not found in tenant");
      return;
    }
    const { applyTeacherDecision } = await import("@workspace/decisions");
    const result = await applyTeacherDecision({
      tenantId: c.tenantId,
      proposal,
      decision: {
        action: body.data.action,
        actorId: c.sub,
        actorRole: c.role,
        decidedAt: new Date().toISOString(),
        ...(body.data.reason ? { reason: body.data.reason } : {}),
        ...(body.data.modifications ? { modifications: body.data.modifications } : {}),
        ...(body.data.rejectionReason ? { rejectionReason: body.data.rejectionReason } : {}),
      },
    });
    // ACR-E1-001 — V-3 EXTENSION (owner-approved): loop resume INSIDE the decision
    // path. Official entry only (runLearningLoop); REJECTED stops at the gate;
    // failure never fails the decision (canonical evidence + idempotent resume).
    let loop: Record<string, unknown> | null = null;
    try {
      const { runLearningLoop } = await import("@workspace/learning-loop");
      const { listEvidenceForStudent } = await import("@workspace/db");
      const rows = await listEvidenceForStudent({ tenantId: c.tenantId, studentId: proposal.studentId });
      const trace = await runLearningLoop({
        tenantId: c.tenantId,
        studentId: proposal.studentId,
        rows,
        teacherDecision: {
          action: body.data.action,
          actorId: c.sub,
          actorRole: c.role,
          decidedAt: new Date().toISOString(),
          ...(body.data.reason ? { reason: body.data.reason } : {}),
          ...(body.data.modifications ? { modifications: body.data.modifications } : {}),
          ...(body.data.rejectionReason ? { rejectionReason: body.data.rejectionReason } : {}),
        },
      });
      loop = {
        stoppedAt: trace.stoppedAt ?? null,
        stopReason: trace.stopReason ?? null,
        ...(trace.outcome ? { outcome: { result: trace.outcome.result, confidence: trace.outcome.confidence } } : {}),
        ...(trace.comparison ? { trend: trace.comparison.trend, sufficientEvidence: trace.comparison.sufficientEvidence } : {}),
      };
    } catch (loopErr) {
      log.error({ err: loopErr }, "Learning loop resume after teacher decision failed — decision stands, loop resumable");
    }
    res.status(result.existed ? 200 : 201).json({
      decisionId: result.decisionId,
      existed: result.existed,
      proposalStatus: result.proposal.status,
      authorization: result.authorization,
      loop,
    });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/interventions/:proposalId/feedback (E1: recordTeacherFeedback — Evidence writer only) =====
router.post("/interventions/:proposalId/feedback", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const c = ctx(req, res);
  if (!c) return;
  const body = FeedbackBody.safeParse(req.body);
  if (!body.success) {
    apiError(res, 400, "VALIDATION_ERROR", "Request body failed contract validation");
    return;
  }
  try {
    // Tenant binding first: the proposal must exist in THIS tenant; the student
    // identity rides from the CANONICAL proposal row (never a client fact).
    const proposal = await getTeacherProposal(c.tenantId, paramStr(req.params.proposalId));
    if (!proposal) {
      apiError(res, 404, "INTERVENTION_NOT_FOUND", "Proposal not found in tenant");
      return;
    }
    const out = await recordTeacherFeedback({
      tenantId: c.tenantId,
      studentId: proposal.studentId,
      actorId: c.sub,
      actorRole: c.role,
      proposalId: paramStr(req.params.proposalId),
      decision: body.data.decision,
      ...(body.data.note ? { note: body.data.note } : {}),
      ...(body.data.modifications ? { modifications: body.data.modifications } : {}),
    });
    res.status(201).json({ recorded: out.recorded, operationKey: out.operationKey });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/interventions/:proposalId/delivery (E1: gate THEN startAttemptExecution) =====
router.post("/interventions/:proposalId/delivery", authenticate, authorize("teacher", "principal", "admin"), async (req: Request, res: Response) => {
  const c = ctx(req, res);
  if (!c) return;
  const body = DeliveryBody.safeParse(req.body);
  if (!body.success) {
    apiError(res, 400, "VALIDATION_ERROR", "Request body failed contract validation");
    return;
  }
  try {
    const proposal = await getTeacherProposal(c.tenantId, paramStr(req.params.proposalId));
    if (!proposal) {
      apiError(res, 404, "INTERVENTION_NOT_FOUND", "Proposal not found in tenant");
      return;
    }
    // Teacher Gate — delivery is authorized ONLY by the BOUND authorization issued
    // with the FINAL decision (proposal+student+tenant+activityType all match).
    const { assertDeliveryAuthorized } = await import("@workspace/decisions");
    assertDeliveryAuthorized(
      {
        tenantId: c.tenantId,
        studentId: proposal.studentId,
        proposalId: proposal.id,
        activityType: proposal.activityType,
      },
      proposal.deliveryAuthorization as never,
    );
    const started = await startAttemptExecution({
      tenantId: c.tenantId,
      studentId: proposal.studentId,
      actor: { actorId: c.sub, actorRole: c.role },
      activityId: body.data.activityId ?? `intervention-${proposal.id}`,
      exerciseId: body.data.exerciseId,
      attemptNumber: body.data.attemptNumber ?? 1,
    });
    res.status(started.created ? 201 : 200).json({
      authorizationId: (proposal.deliveryAuthorization as { authorizationId?: string } | null)?.authorizationId ?? null,
      attempt: { id: started.attempt.id, state: started.attempt.state, exerciseId: started.exercise?.id ?? body.data.exerciseId },
      created: started.created,
    });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

export default router;
