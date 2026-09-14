/**
 * CORE-24 / Wave 2 (ACR-24/002, ADR-004) — Persistent Activity Assignment &
 * Attempt State capability (owner: core-platform).
 *
 * OPERATIONAL/ADMINISTRATIVE STATE ONLY — the separation invariant
 * (Content ≠ Exercise ≠ Activity ≠ Assignment ≠ Attempt ≠ Evidence ≠ Assessment)
 * is structural here:
 *   - NO measurement values, NO scores, NO response payloads are ever written.
 *   - The attempt's canonical learning fact lives ONLY in Evidence; the attempt
 *     row holds a POINTER (evidence_ref) set at EVIDENCE_RECORDED.
 *   - Attempt lifecycle reuses CORE-23's EXACT state values and the EXISTING
 *     attemptOperationKey — transitions are persisted with compare-and-set
 *     (UPDATE … WHERE state = expected); there is NO second state machine.
 *   - Assignment lifecycle: ACTIVE → CANCELLED | CLOSED (one-way, terminal).
 *   - Idempotency: (tenant_id, operation_key) unique — the EXISTING platform
 *     pattern; logical uniqueness (tenant, student, activity, attempt_number)
 *     makes parallel duplicate submissions converge on ONE row.
 *   - Tenant isolation is DB-level (composite tenant FKs); this layer only
 *     validates and never bypasses it.
 *   - Transfer safety (ADR-002): rows are never rewritten on student transfer.
 *
 * Deterministic, no AI, no UI, no new stores. Audit via EXISTING audit_logs —
 * reason codes only (assignment.created|cancelled|closed,
 * attempt.started|submitted|state_changed) — no PII, no content bodies.
 */
import { and, asc, count, desc, eq } from "drizzle-orm";
import { db } from "../client.js";
import {
  activityAssignmentsTable,
  activityAttemptsTable,
  type ActivityAssignmentRow,
  type ActivityAttemptRow,
} from "../schema/activity-state.js";
import { auditLogsTable } from "../schema/system.js";
import { evidenceTable } from "../schema/evidence.js";
import { attemptOperationKey, type AttemptState } from "../execution/contracts.js";
import { ASSIGNMENT_SOURCES } from "./contracts.js"; // REUSED CORE-21 contract vocabulary — no duplication

/**
 * Lifecycle events — SAME vocabulary/semantics as CORE-23's applyAttemptEvent
 * (no second state machine: the maps below mirror its transition table and
 * the Wave-2 tests walk the full chain + invalid transitions against the DB).
 */
type AttemptLifecycleEvent = "start" | "begin" | "submit" | "measure" | "record";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Closed contract vocabulary — mirrored by the DB CHECK (assignment_source_check). */
const ASSIGNMENT_TERMINAL = { CANCELLED: "CANCELLED", CLOSED: "CLOSED" } as const;

/** Strict chain (same semantics as CORE-23 applyAttemptEvent — no skipping). */
const EVENT_TARGET: Record<AttemptLifecycleEvent, AttemptState> = {
  start: "STARTED",
  begin: "IN_PROGRESS",
  submit: "SUBMITTED",
  measure: "MEASURED",
  record: "EVIDENCE_RECORDED",
};
const EVENT_SOURCE: Record<AttemptLifecycleEvent, AttemptState> = {
  start: "CREATED",
  begin: "STARTED",
  submit: "IN_PROGRESS",
  measure: "SUBMITTED",
  record: "MEASURED",
};

export class ActivityStateError extends Error {
  constructor(public reason: string, public detail: Record<string, unknown> = {}) {
    super(reason);
    this.name = "ActivityStateError";
  }
}

function assertUuid(value: string, what: string): void {
  if (!value || !UUID_RE.test(value)) throw new ActivityStateError(`INVALID_${what.toUpperCase()}_ID`);
}

async function audit(action: string, tenantId: string, actorId: string | undefined, entity: string, entityId: string, metadata?: Record<string, unknown>): Promise<void> {
  await db.insert(auditLogsTable).values({
    id: crypto.randomUUID(),
    tenantId,
    actorId,
    action,
    entity,
    entityId,
    metadata: metadata ? JSON.stringify(metadata) : undefined,
  });
}

// ===== Assignment: create (idempotent) + lifecycle (CAS) + reads =====

export interface CreateAssignmentInput {
  readonly tenantId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly exerciseId?: string;
  readonly exerciseVersion?: number;
  readonly curriculumId: string;
  readonly curriculumVersion: string; // MANDATORY (21-O)
  readonly stageKey: string;
  readonly gradeLevel: string;
  readonly subject: string;
  readonly targetSchoolId: string; // isolation anchor
  readonly targetStudentId?: string;
  readonly targetClassId?: string;
  readonly targetGradeLevel?: string;
  readonly targetStageKey?: string;
  readonly assignedBy: string;
  readonly assignedByRole: string;
  readonly source: (typeof ASSIGNMENT_SOURCES)[number];
  readonly dueAt?: Date;
  readonly operationKey: string;
}

export async function createAssignment(input: CreateAssignmentInput): Promise<{ assignment: ActivityAssignmentRow; created: boolean }> {
  assertUuid(input.tenantId, "tenant");
  assertUuid(input.assignedBy, "assigned_by");
  assertUuid(input.targetSchoolId, "target_school");
  if (!input.activityId?.trim()) throw new ActivityStateError("ACTIVITY_ID_REQUIRED");
  if (!input.activityVersion || input.activityVersion < 1) throw new ActivityStateError("ACTIVITY_VERSION_INVALID");
  if (!input.curriculumVersion?.trim()) throw new ActivityStateError("CURRICULUM_VERSION_REQUIRED"); // 21-O
  if (!input.curriculumId?.trim() || !input.stageKey?.trim() || !input.gradeLevel?.trim() || !input.subject?.trim()) {
    throw new ActivityStateError("CURRICULUM_ANCHOR_REQUIRED");
  }
  if (!ASSIGNMENT_SOURCES.includes(input.source)) throw new ActivityStateError("ASSIGNMENT_SOURCE_INVALID");
  if (!input.operationKey?.trim()) throw new ActivityStateError("OPERATION_KEY_REQUIRED");
  const [row] = await db
    .insert(activityAssignmentsTable)
    .values({
      tenantId: input.tenantId,
      activityId: input.activityId,
      activityVersion: input.activityVersion,
      exerciseId: input.exerciseId ?? null,
      exerciseVersion: input.exerciseVersion ?? null,
      curriculumId: input.curriculumId,
      curriculumVersion: input.curriculumVersion,
      stageKey: input.stageKey,
      gradeLevel: input.gradeLevel,
      subject: input.subject,
      targetSchoolId: input.targetSchoolId,
      targetStudentId: input.targetStudentId ?? null,
      targetClassId: input.targetClassId ?? null,
      targetGradeLevel: input.targetGradeLevel ?? null,
      targetStageKey: input.targetStageKey ?? null,
      assignedBy: input.assignedBy,
      assignedByRole: input.assignedByRole,
      source: input.source,
      status: "ACTIVE",
      dueAt: input.dueAt ?? null,
      operationKey: input.operationKey,
    })
    .onConflictDoNothing() // covers (tenant_id, operation_key)
    .returning();
  if (row) {
    await audit("assignment.created", input.tenantId, input.assignedBy, "activity_assignment", row.id, { source: input.source, activityId: input.activityId });
    return { assignment: row, created: true };
  }
  const [existing] = await db.select().from(activityAssignmentsTable)
    .where(and(eq(activityAssignmentsTable.tenantId, input.tenantId), eq(activityAssignmentsTable.operationKey, input.operationKey)))
    .limit(1);
  if (!existing) throw new ActivityStateError("ASSIGNMENT_IDEMPOTENCY_UNRESOLVED");
  return { assignment: existing, created: false };
}

/** CAS terminal transition. Cancel/close is one-way; retries converge (never duplicate/flip). */
async function applyAssignmentClose(input: { tenantId: string; assignmentId: string; actorId: string; target: "CANCELLED" | "CLOSED" }): Promise<ActivityAssignmentRow> {
  assertUuid(input.tenantId, "tenant");
  assertUuid(input.assignmentId, "assignment");
  const [updated] = await db
    .update(activityAssignmentsTable)
    .set({ status: input.target, updatedAt: new Date() })
    .where(and(
      eq(activityAssignmentsTable.id, input.assignmentId),
      eq(activityAssignmentsTable.tenantId, input.tenantId),
      eq(activityAssignmentsTable.status, "ACTIVE"), // CAS: only ACTIVE is mutable
    ))
    .returning();
  if (updated) {
    await audit(input.target === "CANCELLED" ? "assignment.cancelled" : "assignment.closed", input.tenantId, input.actorId, "activity_assignment", input.assignmentId, {});
    return updated;
  }
  const [current] = await db.select().from(activityAssignmentsTable)
    .where(and(eq(activityAssignmentsTable.id, input.assignmentId), eq(activityAssignmentsTable.tenantId, input.tenantId)))
    .limit(1);
  if (!current) throw new ActivityStateError("ASSIGNMENT_NOT_FOUND_IN_TENANT");
  if (current.status === input.target) return current; // idempotent retry
  throw new ActivityStateError("ASSIGNMENT_STATUS_CONFLICT", { current: current.status, target: input.target });
}

export function cancelAssignment(tenantId: string, assignmentId: string, actorId: string): Promise<ActivityAssignmentRow> {
  return applyAssignmentClose({ tenantId, assignmentId, actorId, target: ASSIGNMENT_TERMINAL.CANCELLED });
}

export function closeAssignment(tenantId: string, assignmentId: string, actorId: string): Promise<ActivityAssignmentRow> {
  return applyAssignmentClose({ tenantId, assignmentId, actorId, target: ASSIGNMENT_TERMINAL.CLOSED });
}

export async function getAssignment(tenantId: string, assignmentId: string): Promise<ActivityAssignmentRow> {
  assertUuid(tenantId, "tenant");
  assertUuid(assignmentId, "assignment");
  const [row] = await db.select().from(activityAssignmentsTable)
    .where(and(eq(activityAssignmentsTable.id, assignmentId), eq(activityAssignmentsTable.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new ActivityStateError("ASSIGNMENT_NOT_FOUND_IN_TENANT");
  return row;
}

export interface AssignmentListFilters {
  readonly studentId?: string;
  readonly classId?: string;
  readonly schoolId?: string;
  readonly status?: "ACTIVE" | "CANCELLED" | "CLOSED";
  readonly activityId?: string;
}

export async function listAssignments(tenantId: string, filters: AssignmentListFilters = {}, pagination: { limit?: number; offset?: number } = {}): Promise<{ total: number; rows: ActivityAssignmentRow[] }> {
  assertUuid(tenantId, "tenant");
  const conditions = [eq(activityAssignmentsTable.tenantId, tenantId)]; // tenant isolation on EVERY read
  if (filters.studentId) conditions.push(eq(activityAssignmentsTable.targetStudentId, filters.studentId));
  if (filters.classId) conditions.push(eq(activityAssignmentsTable.targetClassId, filters.classId));
  if (filters.schoolId) conditions.push(eq(activityAssignmentsTable.targetSchoolId, filters.schoolId));
  if (filters.status) conditions.push(eq(activityAssignmentsTable.status, filters.status));
  if (filters.activityId) conditions.push(eq(activityAssignmentsTable.activityId, filters.activityId));
  const where = and(...conditions);
  const [{ value: total }] = await db.select({ value: count() }).from(activityAssignmentsTable).where(where);
  const rows = await db.select().from(activityAssignmentsTable).where(where)
    .orderBy(desc(activityAssignmentsTable.createdAt))
    .limit(Math.min(pagination.limit ?? 50, 200))
    .offset(pagination.offset ?? 0);
  return { total, rows };
}

// ===== Attempt: create (idempotent, concurrency-converging) + CAS lifecycle =====

export interface CreateAttemptInput {
  readonly tenantId: string;
  readonly studentId: string;
  readonly activityId: string;
  readonly assignmentId?: string;
  readonly exerciseId?: string;
  readonly curriculumId: string;
  readonly curriculumVersion: string; // 21-O
  readonly stageKey: string;
  readonly gradeLevel: string;
  readonly subject: string;
  readonly attemptNumber: number;
  readonly startedAt: Date;
  readonly operationKey?: string; // default: CORE-23 attemptOperationKey
}

export async function createAttempt(input: CreateAttemptInput): Promise<{ attempt: ActivityAttemptRow; created: boolean }> {
  assertUuid(input.tenantId, "tenant");
  assertUuid(input.studentId, "student");
  if (!input.activityId?.trim()) throw new ActivityStateError("ACTIVITY_ID_REQUIRED");
  if (!input.curriculumVersion?.trim()) throw new ActivityStateError("CURRICULUM_VERSION_REQUIRED"); // 21-O
  if (!input.curriculumId?.trim() || !input.stageKey?.trim() || !input.gradeLevel?.trim() || !input.subject?.trim()) {
    throw new ActivityStateError("CURRICULUM_ANCHOR_REQUIRED");
  }
  if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1) throw new ActivityStateError("ATTEMPT_NUMBER_INVALID");
  const operationKey = input.operationKey ?? attemptOperationKey({
    tenantId: input.tenantId,
    studentId: input.studentId,
    activityId: input.activityId,
    attemptNumber: input.attemptNumber,
    startedAt: input.startedAt.toISOString(),
  });
  const [row] = await db
    .insert(activityAttemptsTable)
    .values({
      tenantId: input.tenantId,
      studentId: input.studentId,
      assignmentId: input.assignmentId ?? null,
      activityId: input.activityId,
      exerciseId: input.exerciseId ?? null,
      curriculumId: input.curriculumId,
      curriculumVersion: input.curriculumVersion,
      stageKey: input.stageKey,
      gradeLevel: input.gradeLevel,
      subject: input.subject,
      attemptNumber: input.attemptNumber,
      state: "CREATED",
      startedAt: null,
      operationKey,
    })
    .onConflictDoNothing() // covers (tenant_id, operation_key) AND the logical uniqueness
    .returning();
  if (row) return { attempt: row, created: true };
  // Convergence: same operation key OR same logical attempt (parallel duplicate
  // submission / retry) → the EXISTING row. Never a duplicate.
  const [byOp] = await db.select().from(activityAttemptsTable)
    .where(and(eq(activityAttemptsTable.tenantId, input.tenantId), eq(activityAttemptsTable.operationKey, operationKey)))
    .limit(1);
  if (byOp) return { attempt: byOp, created: false };
  const [byLogical] = await db.select().from(activityAttemptsTable)
    .where(and(
      eq(activityAttemptsTable.tenantId, input.tenantId),
      eq(activityAttemptsTable.studentId, input.studentId),
      eq(activityAttemptsTable.activityId, input.activityId),
      eq(activityAttemptsTable.attemptNumber, input.attemptNumber),
    ))
    .limit(1);
  if (byLogical) return { attempt: byLogical, created: false };
  throw new ActivityStateError("ATTEMPT_IDEMPOTENCY_UNRESOLVED");
}

export interface AttemptTransitionOpts {
  readonly actorId?: string;
  /** start */ readonly startedAt?: Date;
  /** submit */ readonly submittedAt?: Date;
  readonly durationMs?: number;
  /** operational time segments (state — never measurements) */
  readonly time?: {
    activityDurationMs?: number;
    responseDurationMs?: number;
    thinkingDurationMs?: number;
    listeningDurationMs?: number;
    pauseDurationMs?: number;
    replayDurationMs?: number;
  };
  /** record — POINTER to the canonical Evidence row (required, validated) */
  readonly evidenceRef?: string;
}

/**
 * Persist ONE lifecycle transition with compare-and-set. The state vocabulary
 * and ordering are CORE-23's (applyAttemptEvent semantics); this only records
 * them durably. Idempotent: replaying an already-applied event returns the row
 * unchanged (changed=false). Invalid order → INVALID_TRANSITION.
 */
export async function transitionAttempt(tenantId: string, attemptId: string, event: AttemptLifecycleEvent, opts: AttemptTransitionOpts = {}): Promise<{ attempt: ActivityAttemptRow; changed: boolean }> {
  assertUuid(tenantId, "tenant");
  assertUuid(attemptId, "attempt");
  const target = EVENT_TARGET[event];
  const expected = EVENT_SOURCE[event];

  // 1) CURRENT STATE FIRST — transition validity is judged BEFORE any pointer
  //    validation, so error ordering matches CORE-23 semantics (an out-of-order
  //    event is INVALID_TRANSITION, never a pointer error).
  const [current] = await db.select().from(activityAttemptsTable)
    .where(and(eq(activityAttemptsTable.id, attemptId), eq(activityAttemptsTable.tenantId, tenantId)))
    .limit(1);
  if (!current) throw new ActivityStateError("ATTEMPT_NOT_FOUND_IN_TENANT");
  if (current.state === target) return { attempt: current, changed: false }; // idempotent replay
  if (current.state !== expected) throw new ActivityStateError("INVALID_TRANSITION", { current: current.state, event, expected });

  const patch: Partial<typeof activityAttemptsTable.$inferInsert> = { state: target, updatedAt: new Date() };
  if (event === "start") patch.startedAt = opts.startedAt ?? new Date();
  if (event === "submit") {
    patch.submittedAt = opts.submittedAt ?? new Date();
    if (opts.durationMs !== undefined) patch.durationMs = opts.durationMs;
    if (opts.time) {
      if (opts.time.activityDurationMs !== undefined) patch.activityDurationMs = opts.time.activityDurationMs;
      if (opts.time.responseDurationMs !== undefined) patch.responseDurationMs = opts.time.responseDurationMs;
      if (opts.time.thinkingDurationMs !== undefined) patch.thinkingDurationMs = opts.time.thinkingDurationMs;
      if (opts.time.listeningDurationMs !== undefined) patch.listeningDurationMs = opts.time.listeningDurationMs;
      if (opts.time.pauseDurationMs !== undefined) patch.pauseDurationMs = opts.time.pauseDurationMs;
      if (opts.time.replayDurationMs !== undefined) patch.replayDurationMs = opts.time.replayDurationMs;
    }
  }
  if (event === "record") {
    if (!opts.evidenceRef || !UUID_RE.test(opts.evidenceRef)) throw new ActivityStateError("EVIDENCE_REF_REQUIRED"); // POINTER to canonical Evidence
    // ACR-24/002 §2.3: the pointer must reference a REAL canonical Evidence row
    // in the SAME tenant — existence verified through the Evidence store
    // (read-only; the state layer NEVER writes Evidence — writer stays sole owner).
    const [ev] = await db.select({ id: evidenceTable.id }).from(evidenceTable)
      .where(and(eq(evidenceTable.id, opts.evidenceRef), eq(evidenceTable.tenantId, tenantId)))
      .limit(1);
    if (!ev) throw new ActivityStateError("EVIDENCE_REF_NOT_FOUND_IN_TENANT");
    patch.evidenceRef = opts.evidenceRef;
  }
  const [updated] = await db
    .update(activityAttemptsTable)
    .set(patch)
    .where(and(
      eq(activityAttemptsTable.id, attemptId),
      eq(activityAttemptsTable.tenantId, tenantId),
      eq(activityAttemptsTable.state, expected), // CAS — races cannot skip states
    ))
    .returning();
  if (!updated) {
    // Race convergence: another transaction applied this same event between
    // (1) and (2) → converge on the winner; anything else is a lost CAS race.
    const [winner] = await db.select().from(activityAttemptsTable)
      .where(and(eq(activityAttemptsTable.id, attemptId), eq(activityAttemptsTable.tenantId, tenantId)))
      .limit(1);
    if (winner && winner.state === target) return { attempt: winner, changed: false };
    throw new ActivityStateError("INVALID_TRANSITION", { current: winner?.state ?? "UNKNOWN", event, expected });
  }
  const action = event === "start" ? "attempt.started" : event === "submit" ? "attempt.submitted" : "attempt.state_changed";
  await audit(action, tenantId, opts.actorId, "activity_attempt", attemptId, { to: target, ...(event === "record" ? { evidenceRef: opts.evidenceRef } : {}) });
  return { attempt: updated, changed: true };
}

export async function getAttempt(tenantId: string, attemptId: string): Promise<ActivityAttemptRow> {
  assertUuid(tenantId, "tenant");
  assertUuid(attemptId, "attempt");
  const [row] = await db.select().from(activityAttemptsTable)
    .where(and(eq(activityAttemptsTable.id, attemptId), eq(activityAttemptsTable.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new ActivityStateError("ATTEMPT_NOT_FOUND_IN_TENANT");
  return row;
}

export async function listStudentAttempts(tenantId: string, studentId: string, pagination: { limit?: number; offset?: number } = {}): Promise<{ total: number; rows: ActivityAttemptRow[] }> {
  assertUuid(tenantId, "tenant");
  assertUuid(studentId, "student");
  const where = and(eq(activityAttemptsTable.tenantId, tenantId), eq(activityAttemptsTable.studentId, studentId));
  const [{ value: total }] = await db.select({ value: count() }).from(activityAttemptsTable).where(where);
  const rows = await db.select().from(activityAttemptsTable).where(where)
    .orderBy(desc(activityAttemptsTable.createdAt))
    .limit(Math.min(pagination.limit ?? 50, 200))
    .offset(pagination.offset ?? 0);
  return { total, rows };
}
