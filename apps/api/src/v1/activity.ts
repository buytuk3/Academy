/**
 * CORE-24 / Wave 3 — /v1 activity adapter (assignments + attempts).
 * THIN ADAPTER ONLY: Zod-validated requests → Activity STATE capability →
 * generated response types. NO SQL, NO business rules.
 * Attempt lifecycle follows the canonical CORE-23 chain (start → begin →
 * submit → measure → record); submit/record absorb the required prefix via
 * idempotent replays (transitionAttempt returns changed=false on replay) —
 * the adapter NEVER invents new states. record completes the lifecycle with a
 * POINTER to an already-recorded canonical Evidence row (the API NEVER writes
 * Evidence). Intelligence stays read-only (Teacher Decision Gate untouched).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  AssignmentCreateRequestSchema,
  AttemptCreateRequestSchema,
  AttemptSubmitRequestSchema,
  AttemptRecordRequestSchema,
  type AssignmentCreateRequest,
  type AttemptCreateRequest,
  type AttemptSubmitRequest,
  type AttemptRecordRequest,
} from "@workspace/api-zod";
import {
  createAssignment,
  cancelAssignment,
  closeAssignment,
  getAssignment,
  listAssignments,
  getAttempt,
  listStudentAttempts,
  assertStaffScope,
  assertStudentDetailAccess,
  startAttemptExecution,
  submitAttemptExecution,
  completeAsyncExecution,
  type AssignmentListFilters,
} from "@workspace/db";
import { engineAdapters } from "./engine-adapters.js";
import { enqueueAnalysis } from "../../../../engines/reading-engine/src/service/reading-service.js";
import { createLogger } from "@workspace/observability";
import { authenticate, type AuthUser } from "../middleware/auth.js";
import { apiError, mapCapabilityError, validateBody, requiredIdempotencyKey, paramStr } from "./errors.js";
import { toAssignmentResponse, toAttemptResponse, pagination } from "./mappers.js";

const router: IRouter = Router();
const loopLog = createLogger({ name: "buytuk-api:learning-loop" });

const ctx = (req: Request, res: Response): { tenantId: string; sub: string; role: string } | null => {
  const user = req.user as AuthUser;
  if (!user?.tenantId || !user.sub) {
    apiError(res, 403, "TENANT_CONTEXT_REQUIRED", "Authenticated tenant context missing");
    return null;
  }
  return { tenantId: user.tenantId, sub: user.sub, role: user.role };
};

// ===== GET /v1/assignments (listAssignments — scope-checked) =====
router.get("/assignments", authenticate, async (req: Request, res: Response) => {
  const c = ctx(req, res);
  if (!c) return;
  try {
    const q = req.query as Record<string, string | undefined>;
    await assertStaffScope(c.tenantId, c.sub, q.schoolId);
    const filters: AssignmentListFilters = {
      studentId: q.studentId, classId: q.classId, schoolId: q.schoolId,
      status: q.status as AssignmentListFilters["status"], activityId: q.activityId,
    };
    const page = pagination(req.query);
    const { total, rows } = await listAssignments(c.tenantId, filters, page);
    res.json({ total, limit: page.limit ?? 50, offset: page.offset ?? 0, items: rows.map(toAssignmentResponse) });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/assignments (createAssignment — Idempotency-Key required) =====
router.post("/assignments", authenticate, async (req: Request, res: Response) => {
  const c = ctx(req, res);
  if (!c) return;
  const opKey = requiredIdempotencyKey(req, res);
  if (!opKey) return;
  const body = validateBody<AssignmentCreateRequest>(AssignmentCreateRequestSchema, req, res);
  if (!body) return;
  try {
    await assertStaffScope(c.tenantId, c.sub, body.targetSchoolId);
    const { assignment, created } = await createAssignment({
      tenantId: c.tenantId,
      activityId: body.activityId,
      activityVersion: body.activityVersion,
      exerciseId: body.exerciseId,
      exerciseVersion: body.exerciseVersion,
      curriculumId: body.curriculum.curriculumId,
      curriculumVersion: body.curriculum.curriculumVersion,
      stageKey: body.curriculum.stageKey,
      gradeLevel: body.curriculum.gradeLevel,
      subject: body.curriculum.subject,
      targetSchoolId: body.targetSchoolId,
      targetStudentId: body.targetStudentId,
      targetClassId: body.targetClassId,
      targetGradeLevel: body.targetGradeLevel,
      targetStageKey: body.targetStageKey,
      assignedBy: c.sub,
      assignedByRole: c.role,
      source: body.source,
      dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
      operationKey: opKey,
    });
    res.status(created ? 201 : 200).json({ assignment: toAssignmentResponse(assignment), created });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/assignments/{assignmentId} (getAssignment — scope-checked) =====
router.get("/assignments/:assignmentId", authenticate, async (req: Request, res: Response) => {
  const c = ctx(req, res);
  if (!c) return;
  try {
    const row = await getAssignment(c.tenantId, paramStr(req.params.assignmentId));
    await assertStaffScope(c.tenantId, c.sub, row.targetSchoolId);
    res.json(toAssignmentResponse(row));
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/assignments/{assignmentId}/cancel (cancelAssignment) =====
router.post("/assignments/:assignmentId/cancel", authenticate, async (req: Request, res: Response) => {
  const c = ctx(req, res);
  if (!c) return;
  try {
    const row = await cancelAssignment(c.tenantId, paramStr(req.params.assignmentId), c.sub);
    res.json(toAssignmentResponse(row));
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/assignments/{assignmentId}/close (closeAssignment) =====
router.post("/assignments/:assignmentId/close", authenticate, async (req: Request, res: Response) => {
  const c = ctx(req, res);
  if (!c) return;
  try {
    const row = await closeAssignment(c.tenantId, paramStr(req.params.assignmentId), c.sub);
    res.json(toAssignmentResponse(row));
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/attempts (createAttempt → Execution capability: startAttemptExecution) =====
// CORE-25 WAVE-4A: the API never touches attempt state directly — ONE runtime
// capability resolves the exercise binding, enforces the curriculum gates and
// the 23-H access chain, then creates + starts the PERSISTENT attempt.
router.post("/attempts", authenticate, async (req: Request, res: Response) => {
  const c = ctx(req, res);
  if (!c) return;
  const opKeyRaw = req.headers["idempotency-key"];
  const opKey = typeof opKeyRaw === "string" && opKeyRaw.trim().length >= 8 ? opKeyRaw.trim().slice(0, 200) : undefined;
  const body = validateBody<AttemptCreateRequest>(AttemptCreateRequestSchema, req, res);
  if (!body) return;
  try {
    // Student self → the token's VERIFIED studentId wins (never a client fact).
    const studentId = c.role === "student" ? (req.user as AuthUser).studentId! : body.studentId!;
    if (!studentId) {
      apiError(res, 400, "STUDENT_CONTEXT_REQUIRED", "studentId is required for staff-created attempts");
      return;
    }
    if (!body.exerciseId) {
      // Execution REQUIRES a bound exercise (§6/§7): the exercise owns the
      // engine binding + curriculum anchor; unbound attempts cannot start.
      apiError(res, 400, "EXECUTION_CONTEXT_REQUIRED", "exerciseId is required to start an execution attempt");
      return;
    }
    const started = await startAttemptExecution({
      tenantId: c.tenantId,
      studentId,
      actor: { actorId: c.sub, actorRole: c.role },
      activityId: body.activityId,
      assignmentId: body.assignmentId,
      exerciseId: body.exerciseId,
      attemptNumber: body.attemptNumber,
      engineInput: body.engineInput,
      ...(opKey ? { operationKey: opKey } : {}),
    });
    // Contract: AttemptMutationResponse ({ attempt, created }) — 201 on create, 200 on retry.
    res.status(started.created ? 201 : 200).json({ attempt: toAttemptResponse(started.attempt), created: started.created });
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== GET /v1/attempts/{attemptId} (getAttempt) =====
router.get("/attempts/:attemptId", authenticate, async (req: Request, res: Response) => {
  const c = ctx(req, res);
  if (!c) return;
  try {
    const row = await getAttempt(c.tenantId, paramStr(req.params.attemptId));
    if (c.role === "student") {
      const self = (req.user as AuthUser).studentId;
      if (row.studentId !== self) {
        apiError(res, 403, "ATTEMPT_ACCESS_DENIED", "Student principals may only read their own attempts");
        return;
      }
    } else {
      await assertStudentDetailAccess(c.tenantId, c.sub, row.studentId, c.sub);
    }
    res.json(toAttemptResponse(row));
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/attempts/{attemptId}/submit (submitAttempt → Execution capability) =====
// CORE-25 WAVE-4A: sync engines measure through INJECTED adapters; READING
// leaves the request via the injected queue hand-off (engine service owns its
// rows + job); the worker completes MEASURED→EVIDENCE_RECORDED with the REAL
// evidence pointer. Retries converge (single enqueue, no duplicate evidence).
router.post("/attempts/:attemptId/submit", authenticate, async (req: Request, res: Response) => {
  const c = ctx(req, res);
  if (!c) return;
  const body = validateBody<AttemptSubmitRequest>(AttemptSubmitRequestSchema, req, res);
  if (!body) return;
  try {
    const studentId = c.role === "student" ? (req.user as AuthUser).studentId! : "";
    const engineInput = body.engineInput ?? {};
    const result = await submitAttemptExecution({
      tenantId: c.tenantId,
      studentId,
      actor: { actorId: c.sub, actorRole: c.role },
      executionAttemptId: paramStr(req.params.attemptId),
      submittedAt: body.submittedAt ? new Date(body.submittedAt) : undefined,
      durationMs: body.durationMs,
      time: body.time,
      adapters: engineAdapters,
      enqueueAsync: async (payload) => {
        // Engine service owns the reading attempt/session rows + the queue job.
        const ei = payload.engineInput as { passageId?: string; sessionId?: string; audioKey?: string; expectedText?: string };
        const enq = await enqueueAnalysis(
          { userId: c.sub, role: c.role, tenantId: c.tenantId, schoolId: (req.user as AuthUser).schoolId, organizationId: (req.user as AuthUser).organizationId },
          { studentId: payload.studentId, passageId: String(ei.passageId ?? ""), sessionId: String(ei.sessionId ?? ""), audioKey: String(ei.audioKey ?? ""), expectedText: ei.expectedText ? String(ei.expectedText) : undefined, executionAttemptId: payload.executionAttemptId },
        );
        return { jobId: enq.jobId };
      },
      engineInput,
    });
    if (result.mode === "async") {
      res.json(toAttemptResponse(result.attempt));
      return;
    }
    // ADR-027/V-3 — Learning Loop runtime call site #2 (sync engines:
    // NUMERACY / ASSESSMENT). Trigger: submitAttemptExecution RESOLVED —
    // canonical evidence is ALREADY persisted by the engine adapters
    // (numeracy:attempt:{id} / assessment:attempt:{id}). First pass runs
    // WITHOUT a teacher decision — the loop stops at the Teacher Decision
    // Gate by design (proposal stays PENDING). Loop failure NEVER fails the
    // request (evidence is canonical); the loop is idempotently resumable
    // with the same evidence rows (R-027-05 restored-identity semantics),
    // so replayed submits (mode sync, measurements null) re-invoke safely.
    try {
      const { tenantId, studentId } = result.trace;
      if (tenantId && studentId) {
        const { runLearningLoop } = await import("@workspace/learning-loop");
        const { listEvidenceForStudent } = await import("@workspace/db");
        const rows = await listEvidenceForStudent({ tenantId, studentId });
        await runLearningLoop({ tenantId, studentId, rows });
      }
    } catch (err) {
      // ADR-027/V-3 §9: loop failure never fails the submit — evidence is
      // canonical and the loop is idempotently resumable on the next trigger.
      loopLog.error({ err }, "Learning loop failed after sync submit — evidence unaffected, resumable");
    }
    const final = await getAttempt(c.tenantId, paramStr(req.params.attemptId));
    res.json(toAttemptResponse(final));
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

// ===== POST /v1/attempts/{attemptId}/record (recordAttempt — POINTER to canonical Evidence) =====
router.post("/attempts/:attemptId/record", authenticate, async (req: Request, res: Response) => {
  const c = ctx(req, res);
  if (!c) return;
  const body = validateBody<AttemptRecordRequest>(AttemptRecordRequestSchema, req, res);
  if (!body) return;
  try {
    // Student ownership first (capability re-verifies the chain).
    const attemptRow = await getAttempt(c.tenantId, paramStr(req.params.attemptId));
    if (c.role === "student" && attemptRow.studentId !== (req.user as AuthUser).studentId) {
      apiError(res, 403, "STUDENT_CONTEXT_MISMATCH", "Students may only record their own attempts");
      return;
    }
    // CORE-25 WAVE-4A: the capability closes the persistent lifecycle
    // (MEASURED → EVIDENCE_RECORDED) with the REAL canonical pointer.
    const attempt = await completeAsyncExecution({
      tenantId: c.tenantId,
      executionAttemptId: paramStr(req.params.attemptId),
      evidenceRef: body.evidenceRef,
      actorId: c.sub,
    });
    res.json(toAttemptResponse(attempt));
  } catch (e) {
    if (!mapCapabilityError(res, e)) throw e;
  }
});

export default router;
