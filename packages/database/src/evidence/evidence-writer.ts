/**
 * CORE-05 — Canonical Evidence Writer (Core Platform ownership — packages/database).
 *
 * THE single legal path for engines to record Evidence. No engine owns an
 * evidence table or its own writer: Engine → recordEvidence → canonical
 * evidence table → SLR projection. Reading measurements stay with Reading;
 * this writer records EVENT/REFERENCE evidence only.
 *
 * Hard validation contract (enforced BEFORE any write):
 *  - tenantId  REQUIRED canonical uuid  → TENANT_CONTEXT_MISSING / INVALID_TENANT_ID
 *  - studentId REQUIRED canonical uuid  → STUDENT_CONTEXT_MISSING / INVALID_STUDENT_ID
 *  - actor     REQUIRED (actorId and/or actorRole) → ACTOR_REQUIRED / INVALID_ACTOR_ID / INVALID_ACTOR_ROLE
 *  - occurredAt validated when provided  → INVALID_OCCURRED_AT
 *  - evidenceType ∈ the eight canonical types → INVALID_EVIDENCE_TYPE
 *  - sourceEngine REQUIRED              → SOURCE_ENGINE_REQUIRED
 *  - references validated (format + ownership) — attemptId/sessionId/passageId/
 *    inResponseToId → INVALID_ATTEMPT_REFERENCE / INVALID_SESSION_REFERENCE /
 *    INVALID_PASSAGE_REFERENCE / INVALID_EVIDENCE_REFERENCE, plus
 *    TENANT_MISMATCH / STUDENT_MISMATCH when a referenced attempt belongs to
 *    another tenant/student.
 *
 * Idempotency (CORE-05): every row carries operation_key = stable identity of
 * the LOGICAL event, enforced by a DB unique index (tenant_id, operation_key).
 * A queue retry of the same event (same key) collides and resolves to the
 * existing row (no duplicate); two DISTINCT real events (distinct keys) are
 * both recorded. Producers SHOULD pass an explicit stable key
 * (e.g. `reading:analyze:{attemptId}`); a deterministic default is derived
 * otherwise.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../client.js";
import { evidenceTable, evidenceTypeEnum, type Evidence, type EvidenceType } from "../schema/evidence.js";
import { attemptsTable } from "../schema/reading.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RecordEvidenceInput {
  tenantId: string;
  studentId: string;
  actorId?: string;
  actorRole?: string;
  occurredAt?: Date;
  evidenceType: EvidenceType;
  subject?: string;
  grade?: string;
  curriculumBook?: string;
  unitId?: string;
  lessonId?: string;
  objectiveId?: string;
  activityId?: string;
  sessionId?: string;
  attemptId?: string;
  passageId?: string;
  inResponseToId?: string;
  action?: string;
  response?: unknown;
  result?: string;
  durationMs?: number;
  errorType?: string;
  confidence?: number;
  sourceEngine: string;
  tool?: string;
  teacherDecision?: unknown;
  followUp?: unknown;
  metadata?: Record<string, unknown>;
  /** Stable identity of the logical event (idempotency). Recommended explicit. */
  operationKey?: string;
}

function assertUuid(value: string, label: string, missingError: string, invalidError: string): void {
  if (!value) throw new Error(missingError);
  if (!UUID_RE.test(value)) throw new Error(invalidError);
}

export async function recordEvidence(input: RecordEvidenceInput): Promise<Evidence> {
  // ===== Mandatory context =====
  assertUuid(input.tenantId, "tenantId", "TENANT_CONTEXT_MISSING", "INVALID_TENANT_ID");
  assertUuid(input.studentId, "studentId", "STUDENT_CONTEXT_MISSING", "INVALID_STUDENT_ID");

  // ===== Actor (required: actorId and/or actorRole) =====
  if (!input.actorId && !input.actorRole) throw new Error("ACTOR_REQUIRED");
  if (input.actorId && !UUID_RE.test(input.actorId)) throw new Error("INVALID_ACTOR_ID");
  if (input.actorRole !== undefined && String(input.actorRole).trim() === "") throw new Error("INVALID_ACTOR_ROLE");

  // ===== occurredAt (validated when provided) =====
  if (input.occurredAt !== undefined && (!(input.occurredAt instanceof Date) || Number.isNaN(input.occurredAt.getTime()))) {
    throw new Error("INVALID_OCCURRED_AT");
  }

  // ===== Evidence type (closed enum) =====
  if (!evidenceTypeEnum.includes(input.evidenceType as EvidenceType)) throw new Error("INVALID_EVIDENCE_TYPE");

  // ===== Source engine =====
  if (!input.sourceEngine) throw new Error("SOURCE_ENGINE_REQUIRED");

  // ===== Reference formats =====
  if (input.attemptId && !UUID_RE.test(input.attemptId)) throw new Error("INVALID_ATTEMPT_REFERENCE");
  if (input.sessionId && !UUID_RE.test(input.sessionId)) throw new Error("INVALID_SESSION_REFERENCE");
  if (input.passageId && !UUID_RE.test(input.passageId)) throw new Error("INVALID_PASSAGE_REFERENCE");
  if (input.inResponseToId && !UUID_RE.test(input.inResponseToId)) throw new Error("INVALID_EVIDENCE_REFERENCE");

  // ===== Reference ownership (attempt: exists + belongs to same tenant/student) =====
  if (input.attemptId) {
    const [attempt] = await db
      .select({ id: attemptsTable.id, tenantId: attemptsTable.tenantId, studentId: attemptsTable.studentId })
      .from(attemptsTable)
      .where(and(eq(attemptsTable.id, input.attemptId)))
      .limit(1);
    if (!attempt) throw new Error("INVALID_ATTEMPT_REFERENCE");
    if (attempt.tenantId !== input.tenantId) throw new Error("TENANT_MISMATCH");
    if (attempt.studentId !== input.studentId) throw new Error("STUDENT_MISMATCH");
  }

  // ===== Longitudinal reference (in_response_to_id must exist in the same tenant) =====
  if (input.inResponseToId) {
    const [prior] = await db
      .select({ id: evidenceTable.id })
      .from(evidenceTable)
      .where(and(eq(evidenceTable.id, input.inResponseToId), eq(evidenceTable.tenantId, input.tenantId)))
      .limit(1);
    if (!prior) throw new Error("INVALID_EVIDENCE_REFERENCE");
  }

  // ===== Idempotency key =====
  const operationKey =
    input.operationKey ??
    `${input.sourceEngine}:${input.evidenceType}:${input.studentId}:${input.attemptId ?? input.sessionId ?? "no-ref"}`;

  // ===== Write (dedup on tenant_id + operation_key via unique index) =====
  const [row] = await db
    .insert(evidenceTable)
    .values({
      tenantId: input.tenantId,
      studentId: input.studentId,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      evidenceType: input.evidenceType,
      subject: input.subject ?? null,
      grade: input.grade ?? null,
      curriculumBook: input.curriculumBook ?? null,
      unitId: input.unitId ?? null,
      lessonId: input.lessonId ?? null,
      objectiveId: input.objectiveId ?? null,
      activityId: input.activityId ?? null,
      sessionId: input.sessionId ?? null,
      attemptId: input.attemptId ?? null,
      passageId: input.passageId ?? null,
      inResponseToId: input.inResponseToId ?? null,
      action: input.action ?? null,
      response: input.response === undefined ? null : input.response,
      result: input.result ?? null,
      durationMs: input.durationMs ?? null,
      errorType: input.errorType ?? null,
      confidence: input.confidence ?? null,
      sourceEngine: input.sourceEngine,
      tool: input.tool ?? null,
      teacherDecision: input.teacherDecision === undefined ? null : input.teacherDecision,
      followUp: input.followUp === undefined ? null : input.followUp,
      metadata: input.metadata === undefined ? null : input.metadata,
      operationKey,
    })
    .onConflictDoNothing({ target: [evidenceTable.tenantId, evidenceTable.operationKey] })
    .returning();
  if (row) return row;

  // Duplicate operation key (queue retry): return the existing row — never a second copy.
  const [existing] = await db
    .select()
    .from(evidenceTable)
    .where(and(eq(evidenceTable.tenantId, input.tenantId), eq(evidenceTable.operationKey, operationKey)))
    .limit(1);
  if (!existing) throw new Error("EVIDENCE_IDEMPOTENCY_UNRESOLVED");
  return existing;
}
