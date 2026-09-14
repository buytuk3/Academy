/**
 * CORE-25 / WAVE-4A — Execution Application Capability (Runtime Productization).
 * Owner-approved directive (2026-09-12): ONE runtime capability orchestrates
 *   API → Execution Capability → Activity → Assignment → Attempt → Exercise →
 *   Engine → Evidence.
 * The API NEVER calls engines directly; no engine owns an attempt.
 *
 * REUSE (nothing new is invented):
 *   - Attempt lifecycle = CORE-23/24 canonical ATTEMPT_STATES, persisted via
 *     activity/state.ts compare-and-set transitions (deterministic, idempotent,
 *     concurrency-safe, audited). NO second state machine, NO new states.
 *   - Gates = CORE-23 orchestrator pure pre-checks (validateExecutionContext,
 *     assertCurriculumAlignment, resolveExerciseBinding, assertExecutionAccess).
 *   - Evidence = canonical Evidence Writer (recordEvidence) via the canonical
 *     attemptEvidenceInput builder; dedup on (tenant_id, operation_key).
 *   - Engines are INJECTED adapters (EngineAdapterRegistry) — dependency
 *     inversion preserved; the platform never names engines (CORE-15).
 *   - Async (READING: audio/STT/analysis) leaves the HTTP request: the wiring
 *     layer injects an `enqueueAsync` callback (queue owner: @workspace/queue);
 *     the attempt rests at SUBMITTED until the worker completes it via
 *     completeAsyncExecution (measure → record with the REAL evidence pointer).
 *
 * Context rules (directive §5/§6): studentId is NEVER accepted as an
 * independent client fact — it must equal the verified session student
 * (ownStudentId) or be staff-authorized through CORE-19/21 scopes; the
 * curriculum binding (country/system/stage/grade/subject/curriculum+version)
 * is enforced BEFORE any attempt starts (mismatch → no attempt row).
 *
 * Separation invariant (§4/§8/§9): Content ≠ Exercise ≠ Activity ≠ Assignment
 * ≠ Attempt ≠ Evidence; SLR stays a PROJECTION over canonical Evidence
 * (buildStudentTimeline) — no SLR table, no student_results table.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../client.js";
import { staffMembershipsTable } from "../schema/staff.js";
import { getExerciseDefinition, ContentLibraryError } from "../content/library.js";
import type { ExerciseDefinitionRow } from "../schema/content-library.js";
import {
  createAttempt,
  transitionAttempt,
  getAttempt,
  getAssignment,
  ActivityStateError,
} from "../activity/state.js";
import type { ActivityAttemptRow } from "../schema/activity-state.js";
import {
  resolveStudentContext,
  attemptEvidenceInput,
  type ActivityAccessSubject,
} from "../activity/delivery.js";
import type { ActivityCurriculumAnchor } from "../activity/contracts.js";
import {
  validateExecutionContext,
  assertCurriculumAlignment,
  resolveExerciseBinding,
  assertExecutionAccess,
  type ExecutionTrace,
} from "./orchestrator.js";
import {
  ATTEMPT_STATES,
  attemptOperationKey,
  ExecutionError,
  type AttemptState,
  type ExecutionActor,
  type ExecutionTenantContext,
  type EngineAdapterRegistry,
  type EngineBinding,
} from "./contracts.js";
import { recordEvidence } from "../evidence/evidence-writer.js";
import type { RecordEvidenceInput } from "../evidence/evidence-writer.js";
import { assertStudentDetailAccess } from "../oversight/aggregation.js";
import { getActiveMembership } from "../identity/membership.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shape of the persistent CORE-24 attempt handed to/returned by the runtime. */
export type PersistentAttempt = ActivityAttemptRow;

/** Async hand-off (queue owner injected by the wiring layer — never imported here). */
export type AsyncExecutionEnqueuer = (payload: {
  tenantId: string;
  studentId: string;
  executionAttemptId: string;
  operationKey: string;
  engineBinding: EngineBinding;
  engineInput: unknown;
}) => Promise<{ jobId: string }>;

export interface StartAttemptExecutionInput {
  readonly tenantId: string;
  /** VERIFIED student id (session-bound) — rejected when it disagrees with rows. */
  readonly studentId: string;
  readonly actor: ExecutionActor;
  readonly activityId: string;
  readonly assignmentId?: string;
  /** REQUIRED: the CORE-24 persistent exercise owns the engine binding + curriculum anchor. */
  readonly exerciseId: string;
  readonly attemptNumber: number;
  /** Engine-native input (passage/task/definition reference) — opaque. */
  readonly engineInput?: unknown;
  /** Optional client idempotency key (contract Idempotency-Key). */
  readonly operationKey?: string;
}

export interface StartAttemptExecutionResult {
  readonly attempt: PersistentAttempt;
  readonly created: boolean;
  readonly engineBinding: EngineBinding;
  readonly exercise: ExerciseDefinitionRow | null;
  readonly assignmentId: string | null;
}

export interface SubmitAttemptExecutionInput {
  readonly tenantId: string;
  /** VERIFIED student id (session-bound). */
  readonly studentId: string;
  readonly actor: ExecutionActor;
  readonly executionAttemptId: string;
  readonly submittedAt?: Date;
  readonly durationMs?: number;
  /** 23-P multidimensional time evidence — rides into canonical Evidence. */
  readonly time?: {
    activityDurationMs?: number;
    responseDurationMs?: number;
    thinkingDurationMs?: number;
    listeningDurationMs?: number;
    pauseDurationMs?: number;
    replayDurationMs?: number;
  };
  /** Engine response payload (typed/selected/steps… — never audio bytes). */
  readonly response?: unknown;
  /** Injected sync engine adapters (DICTATION/NUMERACY/ASSESSMENT…). */
  readonly adapters?: EngineAdapterRegistry;
  /** Injected async hand-off (READING queue path) — provided by the wiring layer. */
  readonly enqueueAsync?: AsyncExecutionEnqueuer;
  readonly engineInput?: unknown;
}

export type SubmitAttemptExecutionResult =
  | { readonly mode: "sync"; readonly trace: ExecutionTrace }
  | { readonly mode: "async"; readonly attempt: PersistentAttempt; readonly jobId: string; readonly engineBinding: EngineBinding; readonly alreadyCompleted?: boolean; readonly inFlight?: boolean };

/** Builds the verified access subject from REAL rows (never client claims). */
async function subjectFor(tenantId: string, actor: ExecutionActor, verifiedStudentId: string): Promise<ActivityAccessSubject> {
  if (actor.actorRole === "student") {
    // Student principal: the token's verified studentId IS the subject — a
    // client-supplied different studentId is rejected by the caller gate below.
    return { tenantId, userId: actor.actorId, staffMemberships: [], ownStudentId: verifiedStudentId };
  }
  const memberships = await db
    .select({
      role: staffMembershipsTable.role,
      scopeType: staffMembershipsTable.scopeType,
      scopeId: staffMembershipsTable.scopeId,
      schoolId: staffMembershipsTable.schoolId,
      organizationId: staffMembershipsTable.organizationId,
    })
    .from(staffMembershipsTable)
    .where(
      and(
        eq(staffMembershipsTable.tenantId, tenantId),
        eq(staffMembershipsTable.userId, actor.actorId),
        eq(staffMembershipsTable.status, "active"),
      ),
    );
  return { tenantId, userId: actor.actorId, staffMemberships: memberships };
}

/** CORE-22 DB status → CORE-23 gate vocabulary (representation mapping, documented). */
function gateStatus(dbStatus: string): "DRAFT" | "ACTIVE" | "RETIRED" {
  if (dbStatus === "PUBLISHED") return "ACTIVE";
  if (dbStatus === "DRAFT") return "DRAFT";
  return "RETIRED"; // SUPERSEDED
}

function anchorFromExercise(row: ExerciseDefinitionRow): ActivityCurriculumAnchor {
  return {
    curriculumId: row.curriculumId,
    curriculumVersion: row.curriculumVersion,
    country: row.country ?? undefined,
    educationSystem: row.educationSystem ?? undefined,
    stageKey: row.stageKey,
    gradeKey: row.gradeKey ?? undefined,
    gradeLevel: row.gradeLevel,
    subject: row.subject,
    bookId: row.bookId ?? undefined,
    unitId: row.unitId ?? undefined,
    lessonId: row.lessonId ?? undefined,
    objectiveId: row.objectiveId ?? undefined,
    skill: row.skill ?? undefined,
    dimension: row.dimension ?? undefined,
  };
}

/**
 * START: verified context → assignment (optional, same tenant) → exercise
 * (CORE-24 persistent definition) → curriculum/binding gates → persistent
 * attempt (idempotent create) → STARTED (persistent CAS transition).
 * Invalid binding → ExecutionError BEFORE any attempt row exists (directive §6).
 */
export async function startAttemptExecution(input: StartAttemptExecutionInput): Promise<StartAttemptExecutionResult> {
  if (!input.tenantId || !UUID_RE.test(input.tenantId)) throw new ExecutionError("EXECUTION_CONTEXT_REQUIRED", { field: "tenantId" });
  if (!input.studentId || !UUID_RE.test(input.studentId)) throw new ExecutionError("EXECUTION_CONTEXT_REQUIRED", { field: "studentId" });
  if (!input.activityId?.trim()) throw new ExecutionError("EXECUTION_CONTEXT_REQUIRED", { field: "activityId" });
  if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1) {
    throw new ExecutionError("EXECUTION_CONTEXT_REQUIRED", { field: "attemptNumber" });
  }

  // 1) Verified student context (DB rows — the client studentId must BE the
  //    verified one; a mismatched claim never reaches an attempt).
  const studentCtx = await resolveStudentContext(input.tenantId, input.studentId);
  // §5 — Identity→Membership→Tenant liveness (execution context is TRUSTED
  // only while the identity's ACTIVE membership is in THIS tenant; transfer
  // ends the old membership → new executions in the old tenant are DENIED).
  if (studentCtx.identityId) {
    const membership = await getActiveMembership(studentCtx.identityId);
    if (!membership || membership.tenantId !== input.tenantId) {
      throw new ExecutionError("EXECUTION_DENIED", { reason: "MEMBERSHIP_NOT_ACTIVE_IN_TENANT" });
    }
  }
  // §5 — anti-spoofing at the capability level: a STUDENT actor's principal
  // (sub = the platform identity minted at unified login) must BE the
  // student's own identity — no client can execute as another student.
  if (input.actor.actorRole === "student" && studentCtx.identityId !== input.actor.actorId) {
    throw new ExecutionError("STUDENT_CONTEXT_MISMATCH", { identity: studentCtx.identityId, actor: input.actor.actorId });
  }

  // 2) Assignment (optional origin) — must exist in the SAME tenant; its
  //    targetSchoolId is the school anchor for access scoping (CORE-24
  //    exercise definitions are TENANT-scoped library items — no school column).
  let assignmentId: string | null = null;
  let assignmentSchoolId: string | undefined;
  if (input.assignmentId) {
    const assignment = await getAssignment(input.tenantId, input.assignmentId); // 404 semantics in-tenant
    // §18 — School isolation + Student ownership: an assignment is executable
    // ONLY by/for its OWN target school, and only by its target student when
    // it names one (the student context comes from DB rows, never claims).
    if (studentCtx.schoolId && assignment.targetSchoolId !== studentCtx.schoolId) {
      throw new ExecutionError("EXECUTION_DENIED", { reason: "ASSIGNMENT_SCHOOL_MISMATCH", assignment: assignment.targetSchoolId, student: studentCtx.schoolId });
    }
    if (assignment.targetStudentId && assignment.targetStudentId !== input.studentId) {
      throw new ExecutionError("STUDENT_CONTEXT_MISMATCH", { assignment: assignment.targetStudentId, claimed: input.studentId });
    }
    // §14 — Class isolation: a class-targeted assignment is executable ONLY by
    // students of THAT class (school already verified above).
    if (assignment.targetClassId && assignment.targetClassId !== studentCtx.classId) {
      throw new ExecutionError("EXECUTION_DENIED", { reason: "ASSIGNMENT_CLASS_MISMATCH", assignment: assignment.targetClassId, student: studentCtx.classId });
    }
    assignmentId = assignment.id;
    assignmentSchoolId = assignment.targetSchoolId;
  }

  // 3) Exercise (CORE-24 persistent definition) + engine resolution gates.
  const exercise = await getExerciseDefinition(input.tenantId, input.exerciseId); // tenant-scoped
  const context: ExecutionTenantContext = {
    tenantId: input.tenantId,
    schoolId: assignmentSchoolId ?? studentCtx.schoolId,
    studentId: input.studentId,
    identityId: studentCtx.identityId ?? undefined,
    activityId: input.activityId,
    assignmentId: assignmentId ?? undefined,
    exerciseId: exercise.id,
    curriculumVersion: exercise.curriculumVersion,
    curriculumId: exercise.curriculumId,
    stageKey: exercise.stageKey,
    gradeLevel: exercise.gradeLevel,
    subject: exercise.subject,
    attemptNumber: input.attemptNumber,
    startedAt: new Date().toISOString(),
  };
  validateExecutionContext(context); // 23-A (also fixes curriculumVersion required)
  // §6 — REAL student↔curriculum binding: a student may only execute an
  // exercise anchored INSIDE their verified class stage/grade (the exercise
  // anchor is canonical 21-O; the student context comes from DB rows).
  if (studentCtx.stageKey && exercise.stageKey !== studentCtx.stageKey) {
    throw new ExecutionError("STAGE_GRADE_MISMATCH", { exercise: exercise.stageKey, student: studentCtx.stageKey });
  }
  if (exercise.gradeLevel !== studentCtx.gradeLevel) {
    throw new ExecutionError("STAGE_GRADE_MISMATCH", { exercise: exercise.gradeLevel, student: studentCtx.gradeLevel });
  }
  assertCurriculumAlignment(
    { curriculum: anchorFromExercise(exercise) },
    context,
  ); // stage/grade/subject/version must MATCH — mismatch → no attempt
  const engineBinding = resolveExerciseBinding(
    {
      expectedResponseType: exercise.expectedResponseType,
      curriculum: anchorFromExercise(exercise),
      status: "ACTIVE" as const,
    },
    {
      exerciseId: exercise.id,
      engineBinding: exercise.engineBinding as EngineBinding,
      expectedResponseType: exercise.expectedResponseType,
      status: gateStatus(exercise.status),
    },
  ); // superseded/draft → EXECUTION_DENIED; engine = the EXERCISE's binding

  // 4) Access chain (23-H): staff scopes / own-student — BEFORE any write.
  const subject = await subjectFor(input.tenantId, input.actor, input.studentId);
  await assertExecutionAccess({
    subject,
    definition: { tenantId: input.tenantId, schoolId: assignmentSchoolId },
    studentId: input.studentId,
  });

  // 5) Persistent attempt (CORE-24): idempotent create — retries/parallel
  //    starts converge on ONE logical row (tenant, student, activity, n).
  const { attempt, created } = await createAttempt({
    tenantId: input.tenantId,
    studentId: input.studentId,
    activityId: input.activityId,
    assignmentId: assignmentId ?? undefined,
    exerciseId: exercise.id,
    curriculumId: exercise.curriculumId,
    curriculumVersion: exercise.curriculumVersion,
    stageKey: exercise.stageKey,
    gradeLevel: exercise.gradeLevel,
    subject: exercise.subject,
    attemptNumber: input.attemptNumber,
    startedAt: new Date(),
    ...(input.operationKey ? { operationKey: input.operationKey } : {}),
  });

  // 6) STARTED (persistent CAS; replay = idempotent no-change) — the returned
  //    row reflects the REAL post-transition state (re-read after CAS).
  await transitionAttempt(input.tenantId, attempt.id, "start", { actorId: input.actor.actorId });
  const started = await getAttempt(input.tenantId, attempt.id);

  return { attempt: started, created, engineBinding, exercise, assignmentId };
}

/**
 * SUBMIT: ownership gate → SUBMITTED (persistent, time evidence rides the row)
 * → engine:
 *   - sync adapter present  → MEASURED → canonical Evidence (operationKey =
 *     attemptOperationKey — HTTP retry / parallel submit converge on ONE row)
 *     → EVIDENCE_RECORDED → ExecutionTrace.
 *   - async hand-off (READING) → the attempt RESTS at SUBMITTED; the queue/worker
 *     completes it via completeAsyncExecution (no synchronous heavy work).
 * RETRY SEMANTICS (deterministic, directive §12/§13):
 *   - the enqueue happens ONLY when THIS call's CAS submit actually advanced
 *     the row (changed=true) — a parallel/duplicate submit never re-enqueues;
 *   - a retry after completion converges: EVIDENCE_RECORDED returns the final
 *     state (sync: trace rebuilt from the canonical evidence row) without any
 *     second evidence write; MEASURED (worker mid-completion) reports in-flight.
 */
export async function submitAttemptExecution(input: SubmitAttemptExecutionInput): Promise<SubmitAttemptExecutionResult> {
  const attempt = await getAttempt(input.tenantId, input.executionAttemptId); // in-tenant or 404
  if (input.actor.actorRole === "student" && attempt.studentId !== input.studentId) {
    throw new ExecutionError("STUDENT_CONTEXT_MISMATCH", { attemptStudent: attempt.studentId, claimed: input.studentId });
  }
  if (input.actor.actorRole !== "student") {
    // Staff actor → canonical individual-detail gate (20-B via 23-H chain):
    // only a class/school-authorized teacher may submit on behalf of a student.
    await assertStudentDetailAccess(input.tenantId, input.actor.actorId, attempt.studentId, input.actor.actorId);
  }
  if (!attempt.exerciseId) {
    throw new ExecutionError("EXECUTION_CONTEXT_REQUIRED", { field: "exerciseId" });
  }
  const exercise = await getExerciseDefinition(input.tenantId, attempt.exerciseId);
  const binding = exercise.engineBinding as EngineBinding;

  // RETRY AFTER COMPLETION: terminal state — converge, never write again.
  if (attempt.state === "EVIDENCE_RECORDED") {
    if (binding === "READING") {
      return { mode: "async", attempt, jobId: "", engineBinding: binding, alreadyCompleted: true };
    }
    const trace: ExecutionTrace = {
      tenantId: attempt.tenantId,
      studentId: attempt.studentId,
      activityId: attempt.activityId,
      engine: binding,
      operationKey: attemptOperationKey({
        tenantId: attempt.tenantId,
        studentId: attempt.studentId,
        activityId: attempt.activityId,
        attemptNumber: attempt.attemptNumber,
        startedAt: (attempt.startedAt ?? attempt.createdAt).toISOString(),
      }),
      lifecycle: ["CREATED", "STARTED", "IN_PROGRESS", "SUBMITTED", "MEASURED", "EVIDENCE_RECORDED"],
      evidenceRef: attempt.evidenceRef,
      measurements: null, // canonical values live ON the evidence row (single source)
    };
    return { mode: "sync", trace };
  }

  // ASYNC IN-FLIGHT (worker measured, recording imminent): report, never re-enqueue.
  if (attempt.state === "MEASURED" && binding === "READING") {
    return { mode: "async", attempt, jobId: "", engineBinding: binding, inFlight: true };
  }

  // RETRY SEMANTICS: prefix absorption is TOLERANT to concurrent advancement —
  // when a prefix CAS loses a race (a parallel submit already advanced the
  // chain), the loss is absorbed iff the row has ALREADY reached that event's
  // target in the canonical chain; anything else is rethrown (deterministic).
  const absorb = async (event: "start" | "begin"): Promise<void> => {
    try {
      await transitionAttempt(input.tenantId, attempt.id, event, { actorId: input.actor.actorId });
    } catch (e) {
      if (!(e instanceof Error && e.name === "ExecutionError")) throw e;
      const current = await getAttempt(input.tenantId, attempt.id);
      const target = event === "start" ? "STARTED" : "IN_PROGRESS";
      if (ATTEMPT_STATES.indexOf(current.state as AttemptState) >= ATTEMPT_STATES.indexOf(target)) return; // already advanced
      throw e;
    }
  };
  if (attempt.state === "CREATED") await absorb("start");
  if (ATTEMPT_STATES.indexOf(attempt.state as AttemptState) <= ATTEMPT_STATES.indexOf("STARTED")) await absorb("begin");

  // SUBMITTED (persistent CAS + 23-P time evidence on the row).
  const { attempt: submitted, changed } = await transitionAttempt(input.tenantId, attempt.id, "submit", {
    actorId: input.actor.actorId,
    submittedAt: input.submittedAt,
    durationMs: input.durationMs,
    time: input.time,
  });

  const context: ExecutionTenantContext = {
    tenantId: submitted.tenantId,
    studentId: submitted.studentId,
    activityId: submitted.activityId,
    assignmentId: submitted.assignmentId ?? undefined,
    exerciseId: submitted.exerciseId ?? undefined,
    curriculumVersion: submitted.curriculumVersion,
    curriculumId: submitted.curriculumId,
    stageKey: submitted.stageKey,
    gradeLevel: submitted.gradeLevel,
    subject: submitted.subject,
    attemptNumber: submitted.attemptNumber,
    startedAt: (submitted.startedAt ?? submitted.createdAt).toISOString(),
    submittedAt: (submitted.submittedAt ?? new Date()).toISOString(),
    durationMs: submitted.durationMs ?? input.durationMs,
    time: input.time,
  };

  // Async path (READING): hand off to the injected queue callback — ONLY on
  // the winning CAS transition (changed=true). Parallel/duplicate submits and
  // retries after completion never enqueue twice (deterministic single job).
  if (binding === "READING") {
    if (!input.enqueueAsync) {
      throw new ExecutionError("ENGINE_NOT_BOUND", { engine: "READING", reason: "ASYNC_ENQUEUER_NOT_WIRED" });
    }
    if (!changed) {
      // Lost the submit race (another request already enqueued) OR a replay —
      // converge without a second job.
      return { mode: "async", attempt: submitted, jobId: "", engineBinding: binding };
    }
    const { jobId } = await input.enqueueAsync({
      tenantId: submitted.tenantId,
      studentId: submitted.studentId,
      executionAttemptId: submitted.id,
      operationKey: attemptOperationKey({
        tenantId: submitted.tenantId,
        studentId: submitted.studentId,
        activityId: submitted.activityId,
        attemptNumber: submitted.attemptNumber,
        startedAt: context.startedAt,
      }),
      engineBinding: "READING",
      engineInput: input.engineInput,
    });
    return { mode: "async", attempt: submitted, jobId, engineBinding: binding };
  }

  // Sync path: injected adapter measures (engine keeps measurement ownership).
  const adapter = input.adapters?.[binding];
  if (!adapter) {
    throw new ExecutionError("ENGINE_NOT_BOUND", { engine: exercise.engineBinding });
  }
  const actor: ExecutionActor = input.actor;
  const result = await adapter({
    context,
    actor,
    engineInput: input.engineInput,
    recordEvidence: (record: Record<string, unknown>) => recordEvidence(record as unknown as RecordEvidenceInput),
  });

  // MEASURED (persistent CAS).
  await transitionAttempt(input.tenantId, submitted.id, "measure", { actorId: actor.actorId });

  // Canonical Evidence — ONE row per logical attempt (operationKey dedup);
  // the adapter may have recorded its own engine-owned row (evidenceRef set):
  // the orchestrator only writes the canonical attempt row as fallback (23-D).
  let evidenceRef = result.evidenceRef ?? null;
  if (!evidenceRef) {
    const measurementSource = result.measurementSource ?? `execution:${exercise.engineBinding.toLowerCase()}`;
    const base = attemptEvidenceInput(
      {
        tenantId: submitted.tenantId,
        studentId: submitted.studentId,
        activityId: submitted.activityId,
        assignmentId: submitted.assignmentId ?? undefined,
        curriculum: anchorFromExercise(exercise),
        startedAt: context.startedAt,
        submittedAt: context.submittedAt,
        durationMs: result.durationMs ?? submitted.durationMs ?? input.durationMs,
        responseType: exercise.expectedResponseType,
        attemptNumber: submitted.attemptNumber,
      },
      measurementSource,
      { confidence: result.confidence, durationMs: result.durationMs ?? input.durationMs, response: result.response, errorType: result.errorType },
      attemptOperationKey({
        tenantId: submitted.tenantId,
        studentId: submitted.studentId,
        activityId: submitted.activityId,
        attemptNumber: submitted.attemptNumber,
        startedAt: context.startedAt,
      }),
    );
    const written = await recordEvidence({
      ...base,
      metadata: { ...(base.metadata ?? {}), time: input.time ?? null, measurements: result.measurements },
    } as RecordEvidenceInput);
    evidenceRef = (written as { id: string }).id;
  }

  // EVIDENCE_RECORDED (persistent CAS with the REAL canonical pointer).
  await transitionAttempt(input.tenantId, submitted.id, "record", {
    actorId: actor.actorId,
    evidenceRef,
  });

  return {
    mode: "sync",
    trace: {
      tenantId: submitted.tenantId,
      studentId: submitted.studentId,
      activityId: submitted.activityId,
      engine: result.engine,
      operationKey: attemptOperationKey({
        tenantId: submitted.tenantId,
        studentId: submitted.studentId,
        activityId: submitted.activityId,
        attemptNumber: submitted.attemptNumber,
        startedAt: context.startedAt,
      }),
      lifecycle: ["CREATED", "STARTED", "IN_PROGRESS", "SUBMITTED", "MEASURED", "EVIDENCE_RECORDED"],
      evidenceRef,
      measurements: result.measurements,
    },
  };
}

/**
 * ASYNC COMPLETION (worker side): the engine finished the REAL analysis and
 * wrote canonical Evidence through the canonical writer; this closes the
 * persistent attempt lifecycle: MEASURED → EVIDENCE_RECORDED (pointer).
 * Idempotent: replays converge (transitionAttempt returns changed=false).
 */
export async function completeAsyncExecution(input: {
  tenantId: string;
  executionAttemptId: string;
  evidenceRef: string;
  actorId?: string;
}): Promise<PersistentAttempt> {
  if (!input.evidenceRef || !UUID_RE.test(input.evidenceRef)) {
    throw new ExecutionError("EVIDENCE_WITHOUT_MEASUREMENT", { evidenceRef: input.evidenceRef });
  }
  const current = await getAttempt(input.tenantId, input.executionAttemptId);
  if (current.state === "EVIDENCE_RECORDED") return current; // idempotent replay — converged
  if (current.state === "SUBMITTED") {
    await transitionAttempt(input.tenantId, input.executionAttemptId, "measure", { actorId: input.actorId });
  } else if (current.state !== "MEASURED") {
    throw new ExecutionError("INVALID_TRANSITION", { current: current.state, expected: "SUBMITTED|MEASURED" });
  }
  const { attempt } = await transitionAttempt(input.tenantId, input.executionAttemptId, "record", {
    actorId: input.actorId,
    evidenceRef: input.evidenceRef,
  });
  return attempt;
}

export { ActivityStateError, ContentLibraryError };
