/**
 * CORE-23 — Learning Execution & Real Student Learning Flow Foundation.
 * Execution contracts (23-A) — REFERENCE-ONLY context carriers.
 *
 * Ownership (unchanged, 23-ARCH):
 *   Identity/Organization/Membership → core-platform (packages/database)
 *   Curriculum → packages/curriculum (NEVER copied here — structural refs only)
 *   Content/Exercise → core-platform content layer (CORE-22)
 *   Activity/Assignment → core-platform activity layer (CORE-21)
 *   Engines (Reading/Dictation/Numeracy/Assessment) → their own packages
 *   Evidence → canonical Evidence Writer ONLY (recordEvidence)
 *   Learner Model → core-platform projection (buildLearnerModel)
 *   Intelligence → packages/intelligence; Diagnosis/Intervention → learning-loop
 *   Teacher Decision → packages/decisions; Events/Outbox → packages/events
 *
 * Dependency direction: packages/database is a LOWER layer than
 * packages/curriculum and than all engines — curriculum types are NOT
 * imported here (structural compatibility enforced in tests, CORE-21
 * pattern), and engine functions are NEVER imported (they are INJECTED
 * as adapters by the caller layer). No cycles, no second stores.
 *
 * 23-Persistence-Gate: ZERO new tables — attempts/lifecycle ride on
 * canonical Evidence (evidence_type="attempt"/"time"), audit_logs and the
 * existing event outbox. Nothing here persists anywhere else.
 */

// ===== 23-B: Attempt lifecycle states =====

export const ATTEMPT_STATES = [
  "CREATED",
  "STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "MEASURED",
  "EVIDENCE_RECORDED",
] as const;
export type AttemptState = (typeof ATTEMPT_STATES)[number];

/** Terminal state — a recorded attempt is immutable longitudinal evidence. */
export const ATTEMPT_TERMINAL_STATE: AttemptState = "EVIDENCE_RECORDED";

// ===== 23-P: multidimensional time evidence (durationMs is NOT enough) =====

/** All fields optional — present only when the activity type produces them. */
export interface TimeEvidence {
  readonly activityDurationMs?: number;
  readonly responseDurationMs?: number;
  readonly thinkingDurationMs?: number;
  readonly listeningDurationMs?: number;
  readonly pauseDurationMs?: number;
  readonly replayDurationMs?: number;
}

// ===== Actor / tenant execution context (references only) =====

export interface ExecutionActor {
  /** Authenticated principal (user or the student himself). */
  readonly actorId: string;
  /** Verified role from the DB-backed session/lookup — never client claims. */
  readonly actorRole: string;
}

/**
 * 23-A: full execution context. Every field is a REFERENCE into a canonical
 * owner (curriculum ids → packages/curriculum; identityId → CORE-18;
 * assignmentId → CORE-21; exerciseId → CORE-22). No owned data is copied.
 */
export interface ExecutionTenantContext {
  readonly tenantId: string;
  readonly organizationId?: string;
  readonly schoolId?: string;
  readonly studentId: string;
  readonly identityId?: string;
  readonly activityId: string;
  readonly assignmentId?: string;
  readonly exerciseId?: string;
  /** MANDATORY immutable curriculum version (21-O carried into execution). */
  readonly curriculumVersion: string;
  readonly curriculumId?: string;
  readonly stageKey: string;
  readonly gradeLevel: string;
  readonly subject: string;
  readonly lessonId?: string;
  readonly objectiveId?: string;
  readonly skill?: string;
  readonly dimension?: string;
  readonly attemptNumber: number;
  readonly startedAt: string;  // ISO-8601
  readonly submittedAt?: string; // ISO-8601
  readonly durationMs?: number;
  /** Multidimensional time evidence (23-P) — rides into Evidence metadata. */
  readonly time?: TimeEvidence;
}

// ===== Exercise resolution (23-C pre-checks — pure) =====

import type { EngineBinding } from "../content/contracts.js";
export type { EngineBinding };

/**
 * Single binding vocabulary — REUSED from CORE-22 (ENGINE_BINDINGS:
 * READING|DICTATION|NUMERACY|ASSESSMENT). No second vocabulary is created.
 * ARCHITECTURE GUARD (CORE-15): the platform layer NEVER names engines —
 * the binding→measurement-source mapping lives in the INJECTED adapter
 * (upper layer), carried on EngineMeasureResult.measurementSource.
 */

export interface ExerciseResolution {
  readonly exerciseId?: string;
  readonly engineBinding: EngineBinding;
  readonly expectedResponseType: string;
  readonly status: "DRAFT" | "ACTIVE" | "RETIRED";
}

// ===== Engine adapter (dependency inversion — engines are INJECTED) =====

/** What the orchestrator hands to an engine adapter (references + responses). */
export interface EngineMeasureRequest {
  readonly context: ExecutionTenantContext;
  readonly actor: ExecutionActor;
  /** Engine-native input (prompt/policy/task/definition…) — opaque here. */
  readonly engineInput: unknown;
  /** Canonical Evidence Writer (the ONLY evidence path — 23-D). */
  readonly recordEvidence: (input: Record<string, unknown>) => Promise<unknown>;
}

/** Deterministic measurement outcome from an engine adapter. */
export interface EngineMeasureResult {
  /** Engine that measured this attempt (binding vocabulary, CORE-22). */
  readonly engine: EngineBinding;
  /** Canonical Evidence sourceEngine for the fallback row (adapter-owned naming). */
  readonly measurementSource?: string;
  /** Measurement payload stored on canonical Evidence (references only). */
  readonly measurements: Record<string, unknown>;
  readonly confidence?: number;
  readonly errorType?: string;
  readonly durationMs?: number;
  readonly response?: unknown;
  /** Evidence id returned by the canonical writer (when the adapter wrote it). */
  readonly evidenceRef?: string;
}

/**
 * Engines keep ownership of measurement (23-C). The orchestrator never
 * duplicates measurement, never writes a second store — it RESOLVES context,
 * ENFORCES policy, CALLS the adapter, and OBSERVES the lifecycle.
 */
export type EngineMeasureAdapter = (req: EngineMeasureRequest) => Promise<EngineMeasureResult>;

/** Adapter registry keyed by engine binding (wired in apps/tests, not here). */
export type EngineAdapterRegistry = Partial<Record<EngineBinding, EngineMeasureAdapter>>;

// ===== Deterministic idempotency (23-X — reuses EXISTING structures) =====

/**
 * Stable logical identity of an attempt execution. Same key ⇒ same logical
 * attempt ⇒ recordEvidence dedups via (tenant_id, operation_key) — HTTP
 * retry / worker retry / outbox retry / concurrent submission all converge
 * to ONE evidence row. No second idempotency system is created.
 */
export function attemptOperationKey(input: {
  tenantId: string;
  studentId: string;
  activityId: string;
  attemptNumber: number;
  startedAt: string;
}): string {
  return `execution:attempt:${input.tenantId}:${input.studentId}:${input.activityId}:${input.attemptNumber}:${input.startedAt}`;
}

// ===== Deterministic errors (23-B: reason codes, never messages-only) =====

export type ExecutionErrorCode =
  | "INVALID_TRANSITION"
  | "SUBMITTED_BEFORE_STARTED"
  | "MEASURED_BEFORE_SUBMITTED"
  | "EVIDENCE_WITHOUT_MEASUREMENT"
  | "EXECUTION_CONTEXT_REQUIRED"
  | "CURRICULUM_VERSION_REQUIRED"
  | "STAGE_GRADE_MISMATCH"
  | "CURRICULUM_MISMATCH"
  | "ENGINE_NOT_BOUND"
  | "ENGINE_BINDING_CONFLICT"
  | "STUDENT_CONTEXT_MISMATCH"
  | "EXECUTION_DENIED";

export class ExecutionError extends Error {
  readonly reason: ExecutionErrorCode;
  readonly detail: Record<string, unknown>;
  constructor(reason: ExecutionErrorCode, detail: Record<string, unknown> = {}) {
    super(reason);
    this.name = "ExecutionError";
    this.reason = reason;
    this.detail = detail;
  }
}
