/**
 * CORE-23 — Execution Orchestrator (23-B lifecycle, 23-C pre-checks,
 * 23-D canonical evidence, 23-E engine adapters, 23-H access chain,
 * 23-R religion policy reuse, 23-X idempotency).
 *
 * The orchestrator NEVER owns data: it RESOLVES references, ENFORCES the
 * deterministic gates, CALLS the injected engine adapter, and OBSERVES the
 * lifecycle. Persistence is ONLY via existing owners:
 *   - canonical Evidence Writer (recordEvidence) — one row per logical attempt
 *   - audit_logs (activity.started / activity.submitted — reason codes only)
 *   - packages/events outbox (caller-injected emit — no new event bus)
 * Engines keep measurement ownership. Teacher keeps the decision boundary
 * (packages/decisions). No AI, no UI, no new stores, no migrations.
 */
import { createLogger, safeLog, recordSecurityEvent, getMetrics } from "@workspace/observability";
import { recordEvidence, type RecordEvidenceInput } from "../evidence/evidence-writer.js";
import {
  assertActivityAccess,
  ActivityAccessError,
  type ActivityAccessSubject,
  resolveStudentContext,
  validateAttempt,
  attemptEvidenceInput,
  auditActivityEvent,
} from "../activity/delivery.js";
import type { ActivityDefinition, ActivityAttemptContext } from "../activity/contracts.js";
import {
  canAccessContent,
  type EducationalAccessContext,
} from "../oversight/access-policy.js";
import type { EducationalContentRef } from "../oversight/contracts.js";
import {
  ATTEMPT_STATES,
  attemptOperationKey,
  ExecutionError,
  type AttemptState,
  type ExecutionActor,
  type ExecutionTenantContext,
  type EngineAdapterRegistry,
  type EngineBinding,
  type EngineMeasureResult,
  type ExerciseResolution,
} from "./contracts.js";

const log = createLogger({ name: "execution" });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ===== 23-B: deterministic attempt lifecycle (pure state machine) =====

export type AttemptEvent = "start" | "begin" | "submit" | "measure" | "record";

const TRANSITIONS: Record<AttemptState, Partial<Record<AttemptEvent, AttemptState>>> = {
  CREATED: { start: "STARTED" },
  STARTED: { begin: "IN_PROGRESS" },
  IN_PROGRESS: { submit: "SUBMITTED" },
  SUBMITTED: { measure: "MEASURED" },
  MEASURED: { record: "EVIDENCE_RECORDED" },
  EVIDENCE_RECORDED: {}, // terminal — evidence is immutable
};

/** Pure transition; invalid event/state pair → INVALID_TRANSITION (23-B). */
export function applyAttemptEvent(current: AttemptState, event: AttemptEvent): AttemptState {
  const next = TRANSITIONS[current][event];
  if (!next) throw new ExecutionError("INVALID_TRANSITION", { current, event });
  return next;
}

/** Valid ordered walk of the whole lifecycle (used by executeAttempt). */
export function lifecycleStates(): readonly AttemptState[] {
  return ATTEMPT_STATES;
}

// ===== 23-A: execution context validation (pure, deterministic) =====

export function validateExecutionContext(context: ExecutionTenantContext): void {
  if (!context) throw new ExecutionError("EXECUTION_CONTEXT_REQUIRED", {});
  if (!context.tenantId || !UUID_RE.test(context.tenantId)) throw new ExecutionError("EXECUTION_CONTEXT_REQUIRED", { field: "tenantId" });
  if (!context.studentId || !UUID_RE.test(context.studentId)) throw new ExecutionError("EXECUTION_CONTEXT_REQUIRED", { field: "studentId" });
  if (!context.activityId) throw new ExecutionError("EXECUTION_CONTEXT_REQUIRED", { field: "activityId" });
  if (!context.curriculumVersion) throw new ExecutionError("CURRICULUM_VERSION_REQUIRED", {}); // 21-O carried into execution
  if (!context.stageKey || !context.gradeLevel || !context.subject) throw new ExecutionError("EXECUTION_CONTEXT_REQUIRED", { field: "curriculum-anchor" });
  if (!Number.isInteger(context.attemptNumber) || context.attemptNumber < 1) throw new ExecutionError("EXECUTION_CONTEXT_REQUIRED", { field: "attemptNumber" });
  if (Number.isNaN(Date.parse(context.startedAt))) throw new ExecutionError("EXECUTION_CONTEXT_REQUIRED", { field: "startedAt" });
  if (context.submittedAt !== undefined && Date.parse(context.submittedAt) < Date.parse(context.startedAt)) {
    throw new ExecutionError("INVALID_TRANSITION", { reason: "SUBMITTED_BEFORE_STARTED" });
  }
  if (context.identityId !== undefined && context.identityId !== null && !UUID_RE.test(context.identityId)) {
    throw new ExecutionError("EXECUTION_CONTEXT_REQUIRED", { field: "identityId" });
  }
}

// ===== 23-H: Student Access chain (DB-verified — client claims ignored) =====

/**
 * Authenticated Identity → Student Identity → Membership → Class → School →
 * Organization → Tenant. The student's class/school/stage/grade come from
 * the DATABASE (resolveStudentContext), never from the request. Mismatch →
 * DENY + security event (assertActivityAccess records it).
 */
export async function assertExecutionAccess(args: {
  subject: ActivityAccessSubject;
  definition: Pick<ActivityDefinition, "tenantId" | "schoolId">;
  studentId: string;
}): Promise<{ classId: string; schoolId: string; stageKey: string | null; gradeLevel: string; identityId: string | null }> {
  const studentContext = await resolveStudentContext(args.definition.tenantId, args.studentId);
  assertActivityAccess({
    subject: args.subject,
    definition: args.definition,
    studentId: args.studentId,
    studentContext: { classId: studentContext.classId, schoolId: studentContext.schoolId },
  });
  return studentContext;
}

// ===== 23-C: exercise → engine pre-checks (pure) =====

/** ONE engine, ONE measurement; definition and resolution must agree. */
export function resolveExerciseBinding(definition: Pick<ActivityDefinition, "expectedResponseType" | "curriculum" | "status">, resolution: ExerciseResolution): EngineBinding {
  if (resolution.status !== "ACTIVE") throw new ExecutionError("EXECUTION_DENIED", { reason: "EXERCISE_NOT_ACTIVE", status: resolution.status });
  if (resolution.expectedResponseType !== definition.expectedResponseType) {
    throw new ExecutionError("ENGINE_BINDING_CONFLICT", {
      definition: definition.expectedResponseType,
      resolution: resolution.expectedResponseType,
    });
  }
  return resolution.engineBinding;
}

/** Stage/grade/subject/curriculum-version isolation (23-K/23-L). */
export function assertCurriculumAlignment(definition: Pick<ActivityDefinition, "curriculum">, context: ExecutionTenantContext): void {
  const c = definition.curriculum;
  if (c.curriculumVersion !== context.curriculumVersion) throw new ExecutionError("CURRICULUM_MISMATCH", { definition: c.curriculumVersion, context: context.curriculumVersion });
  if (c.stageKey !== context.stageKey || c.gradeLevel !== context.gradeLevel) throw new ExecutionError("STAGE_GRADE_MISMATCH", { definition: { stageKey: c.stageKey, gradeLevel: c.gradeLevel }, context: { stageKey: context.stageKey, gradeLevel: context.gradeLevel } });
  if (c.subject !== context.subject) throw new ExecutionError("CURRICULUM_MISMATCH", { subjectDefinition: c.subject, subjectContext: context.subject });
}

// ===== 23-R: religion policy hook (CORE-20 configuration — no hard-coding) =====

/** Optional content gate — reuses canAccessContent; DENY → EXECUTION_DENIED. */
export function assertContentPolicyAllowed(ctx: EducationalAccessContext, content: EducationalContentRef): void {
  const decision = canAccessContent(ctx, content);
  if (decision.decision === "DENY") {
    throw new ExecutionError("EXECUTION_DENIED", { reason: "CONTENT_POLICY_DENY", policyReason: decision.reason });
  }
}

// ===== 23-D/23-E: the orchestration itself =====

export interface ExecuteAttemptArgs {
  readonly actor: ExecutionActor;
  readonly context: ExecutionTenantContext;
  /** DB-owned activity definition (reference — never copied). */
  readonly definition: Pick<ActivityDefinition, "tenantId" | "schoolId" | "expectedResponseType" | "curriculum" | "status">;
  /** Resolved exercise → engine binding (23-C). */
  readonly resolution: ExerciseResolution;
  /** Injected engine adapters (never imported here — dependency inversion). */
  readonly adapters: EngineAdapterRegistry;
  /** Engine-native input (prompt/policy/task/definition) — opaque reference. */
  readonly engineInput: unknown;
  /** Verified requester (staff memberships and/or own-student). */
  readonly subject: ActivityAccessSubject;
  /** Optional CORE-20 religion/content policy hook. */
  readonly contentRef?: EducationalContentRef;
}

export interface ExecutionTrace {
  readonly tenantId: string;
  readonly studentId: string;
  readonly activityId: string;
  readonly engine: EngineBinding;
  readonly operationKey: string;
  readonly lifecycle: AttemptState[];
  readonly evidenceRef: string | null;
  readonly measurements: Record<string, unknown> | null;
}

/**
 * Full deterministic attempt execution:
 * CREATED→STARTED→IN_PROGRESS→SUBMITTED→MEASURED→EVIDENCE_RECORDED.
 * ONE canonical evidence row per logical attempt (operationKey dedup);
 * adapter-recorded evidence (engine-owned operation key) is respected —
 * the orchestrator only writes the canonical attempt row when the adapter
 * did NOT record (fallback path). Retries/concurrency converge on one row.
 */
export async function executeAttempt(args: ExecuteAttemptArgs): Promise<ExecutionTrace> {
  const { context, definition, resolution, adapters, actor, subject } = args;

  // 1) context + alignment + binding (pure gates first — cheapest failures)
  validateExecutionContext(context);
  assertCurriculumAlignment(definition, context);
  const engine = resolveExerciseBinding(definition, resolution);
  if (!adapters[engine]) throw new ExecutionError("ENGINE_NOT_BOUND", { engine });

  // 2) 23-H access chain (DB-verified student context)
  await assertExecutionAccess({ subject, definition, studentId: context.studentId });

  // 3) 23-R religion/content policy (CORE-20 configuration)
  if (args.contentRef) {
    assertContentPolicyAllowed(
      {
        tenantId: context.tenantId,
        studentId: context.studentId,
        stageKey: context.stageKey,
        curriculumId: context.curriculumId,
      },
      args.contentRef,
    );
  }

  // 4) attempt context (21-G validation — time order, version, references)
  const attempt: ActivityAttemptContext = {
    tenantId: context.tenantId,
    studentId: context.studentId,
    identityId: context.identityId ?? undefined,
    activityId: context.activityId,
    assignmentId: context.assignmentId,
    lessonId: context.lessonId,
    curriculum: definition.curriculum,
    startedAt: context.startedAt,
    submittedAt: context.submittedAt,
    durationMs: context.durationMs,
    responseType: resolution.expectedResponseType,
    attemptNumber: context.attemptNumber,
  };
  validateAttempt(attempt);

  // 5) lifecycle walk (deterministic — no skipping)
  const lifecycle: AttemptState[] = [];
  let state: AttemptState = "CREATED";
  lifecycle.push(state);
  for (const event of ["start", "begin", "submit", "measure", "record"] as const) {
    state = applyAttemptEvent(state, event);
    lifecycle.push(state);
  }

  // 6) audit: activity.started (reason codes only — no PII). Lifecycle
  //    observability rides the EXISTING audit_logs; the outbox stays on its
  //    CLOSED event registry (EVENT_TO_EVIDENCE_TYPE) — no invented types.
  await auditActivityEvent("activity.started", context.tenantId, actor.actorId === context.studentId ? undefined : actor.actorId, context.activityId);

  // 7) engine measurement (engines OWN measurement — adapter injected)
  const canonical = (input: Record<string, unknown>) => recordEvidence(input as unknown as RecordEvidenceInput);
  let result: EngineMeasureResult;
  try {
    result = await adapters[engine]!({
      context,
      actor,
      engineInput: args.engineInput,
      recordEvidence: canonical,
    });
  } catch (err) {
    recordSecurityEvent(log, getMetrics(), "suspicious-access", {
      tenantId: context.tenantId,
      studentId: context.studentId,
      detail: { reason: "ENGINE_MEASUREMENT_FAILED", engine },
    });
    throw err;
  }

  // 8) canonical evidence (23-D): adapter-provided ref wins; otherwise the
  //    orchestrator records the canonical attempt row (fallback path).
  const operationKey = attemptOperationKey({
    tenantId: context.tenantId,
    studentId: context.studentId,
    activityId: context.activityId,
    attemptNumber: context.attemptNumber,
    startedAt: context.startedAt,
  });
  let evidenceRef: string | null = result.evidenceRef ?? null;
  let row: { id: string } | undefined;
  if (!evidenceRef) {
    // CORE-15 guard: the platform layer never names engines — the adapter
    // (upper layer) owns the measurement-source naming; neutral fallback.
    const measurementSource = result.measurementSource ?? `execution:${engine.toLowerCase()}`;
    const base = attemptEvidenceInput(
      attempt,
      measurementSource,
      { confidence: result.confidence, durationMs: result.durationMs ?? context.durationMs, response: result.response, errorType: result.errorType },
      operationKey,
    );
    const input = {
      ...base,
      metadata: { ...(base.metadata ?? {}), time: context.time ?? null, measurements: result.measurements },
    } as RecordEvidenceInput;
    const written = await recordEvidence(input);
    row = written as { id: string };
    evidenceRef = row.id;
  }

  // 9) audit: activity.submitted (reason codes only — no PII)
  await auditActivityEvent("activity.submitted", context.tenantId, actor.actorId === context.studentId ? undefined : actor.actorId, context.activityId);

  log.info(safeLog({ tenantId: context.tenantId, studentId: context.studentId, activityId: context.activityId, engine, operationKey, evidenceRef }), "Attempt executed");

  return {
    tenantId: context.tenantId,
    studentId: context.studentId,
    activityId: context.activityId,
    engine,
    operationKey,
    lifecycle,
    evidenceRef,
    measurements: result.measurements,
  };
}
