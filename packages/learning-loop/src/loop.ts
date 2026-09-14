/**
 * CORE-07 — Learning Loop orchestration (Core Platform transitional home).
 *
 * Evidence → Detect → Diagnose → Intervene (proposal) → Teacher Decision
 *            → Reassess → Compare → Outcome → Learn/Adapt.
 *
 * Rules:
 *  - NO LLM anywhere; every decision derives from Evidence + deterministic rules.
 *  - Evidence is ALWAYS written through recordEvidence() (CORE-05 contract) —
 *    never direct table access. Loop tables store REFERENCES only.
 *  - Idempotency via stable operation keys + database unique constraints
 *    (tenant_id, operation_key) — never in-memory dedupe.
 *  - Tenant isolation enforced at every referenced entity; cross-tenant attempts
 *    raise ClassifiedError("authorization") and emit a security event.
 *  - Teacher Decision Boundary: a proposal is NEVER delivered automatically —
 *    it must pass PENDING → APPROVED/MODIFIED (or REJECTED).
 *  - Domain events are published only for real transitions (DiagnosisCreated,
 *    InterventionAssigned, InterventionOutcomeMeasured).
 */
import {
  db,
  recordEvidence,
  LEARNER_DIMENSION_REGISTRY,
  learningDiagnosesTable,
  interventionProposalsTable,
  learningReassessmentsTable,
  learningOutcomesTable,
  type EvidenceType,
} from "@workspace/db";
import type { LearningDiagnosis, InterventionProposal, LearningReassessment, LearningOutcome } from "@workspace/db";
import { publishEvent } from "@workspace/events";
import { ClassifiedError, recordSecurityEvent, createLogger, safeLog, getMetrics } from "@workspace/observability";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { LearningEvent, LearningEventType } from "@buytuk/contracts";
import { detectSignals, skillOf, type DetectionSignal, type DetectionRuleConfig, DEFAULT_DETECTION_RULES } from "./detection.js";
import { applyTeacherDecision, type TeacherDecision } from "@workspace/decisions";

const log = createLogger({ name: "learning-loop" });

type EmitFn = (ev: LearningEvent) => Promise<unknown>;
type DbRow = { id: string };

/** evidenceType used when the loop itself must write an evidence row (decision/outcome). */
const loopEvidence: { type: EvidenceType; action: string; sourceEngine: string; tool: string } = {
  type: "decision",
  action: "learning-loop.stage",
  sourceEngine: "learning-loop",
  tool: "learning-loop-core",
};

// ============================================================ helpers

function assertContext(tenantId?: string, studentId?: string): void {
  if (!tenantId) throw new ClassifiedError("validation", "TENANT_CONTEXT_MISSING");
  if (!studentId) throw new ClassifiedError("validation", "STUDENT_CONTEXT_MISSING");
}

function assertSameTenant(expected: string | undefined, actual: string, what: string): void {
  if (expected !== undefined && expected !== actual) {
    recordSecurityEvent(log, getMetrics(), "cross-tenant-attempt", { tenantId: actual, detail: { what, expectedTenant: expected } });
    throw new ClassifiedError("authorization", `CROSS_TENANT_${what.toUpperCase()}`);
  }
}

async function insertIdempotent<T extends DbRow>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  row: T,
  kind: string,
): Promise<T & { existed?: boolean }> {
  const rows = await db
    .insert(table)
    .values(row)
    .onConflictDoNothing({ target: [table.tenantId, table.operationKey] })
    .returning({ id: table.id });
  if (rows.length === 0) {
    // R-027-05 FIX — Loop-Resumption Idempotency: ON CONFLICT means a previous
    // logical operation ALREADY COMMITTED this (tenant_id, operation_key).
    // Restore the STORED row in full (canonical pattern — see decisions.ts,
    // which re-reads stored state on retry). NEVER return the caller-built
    // row: it carries no database identity, and passing it downstream corrupts
    // child operation keys (loop:intervention:undefined) and violates NOT NULL
    // FK columns (23502).
    const ctx = row as T & { tenantId: string; operationKey: string }; // callers always provide both (typed inputs below)
    const stored = await db
      .select()
      .from(table)
      .where(and(eq(table.tenantId, ctx.tenantId), eq(table.operationKey, ctx.operationKey)))
      .limit(1);
    if (stored.length > 0) return { ...(stored[0] as T), existed: true }; // full restored identity
    // Stored row vanished between the failed insert and this re-read (aborted
    // race winner). Fail LOUDLY — returning an identity-less object is forbidden.
    throw new ClassifiedError("database", "IDEMPOTENT_ROW_VANISHED");
  }
  return { ...row, id: rows[0].id as string };
}

async function emit(type: LearningEventType, ev: Omit<LearningEvent, "type">, emitFn?: EmitFn): Promise<void> {
  const fn = emitFn ?? publishEvent;
  try {
    await fn({ ...ev, type } as unknown as LearningEvent);
  } catch (err) {
    // Publication failure must not fail the stage (outbox retries later); keep it observable.
    log.error(safeLog({ eventType: type, error: err instanceof Error ? err.message : String(err) }), "Event publish failed");
  }
}

// ============================================================ Detect

export interface StageDetectArgs {
  tenantId: string;
  studentId: string;
  rows: Parameters<typeof detectSignals>[0];
  rules?: DetectionRuleConfig;
}
export async function stageDetect(args: StageDetectArgs): Promise<DetectionSignal[]> {
  assertContext(args.tenantId, args.studentId);
  for (const r of args.rows) assertSameTenant(r.tenantId, args.tenantId, "evidence");
  return detectSignals(args.rows, args.rules ?? DEFAULT_DETECTION_RULES);
}

// ============================================================ Diagnose

export interface DiagnosisInput {
  tenantId: string;
  studentId: string;
  signal: DetectionSignal;
  objectiveId?: string;
  previousDiagnosisId?: string;
}
export async function createDiagnosis(input: DiagnosisInput, emitFn?: EmitFn): Promise<LearningDiagnosis & { existed?: boolean }> {
  assertContext(input.tenantId, input.studentId);
  if (input.signal.tenantId !== input.tenantId || input.signal.studentId !== input.studentId) {
    recordSecurityEvent(log, getMetrics(), "cross-tenant-attempt", { tenantId: input.tenantId, studentId: input.studentId, detail: { signal: input.signal.signalKey } });
    throw new ClassifiedError("authorization", "CROSS_TENANT_SIGNAL");
  }
  if (input.signal.evidenceRefs.length === 0 && input.signal.kind !== "insufficient-evidence") {
    throw new ClassifiedError("validation", "DIAGNOSIS_REQUIRES_EVIDENCE");
  }
  if (input.signal.kind === "insufficient-evidence" && input.signal.evidenceRefs.length === 0) {
    throw new ClassifiedError("validation", "DIAGNOSIS_REQUIRES_EVIDENCE");
  }
  const operationKey = `loop:diagnosis:${input.signal.signalKey}`;
  const row = await insertIdempotent(
    learningDiagnosesTable,
    {
      tenantId: input.tenantId,
      studentId: input.studentId,
      skill: input.signal.skill,
      objectiveId: input.objectiveId,
      signalKey: input.signal.signalKey,
      detectedAt: new Date(),
      evidenceRefs: input.signal.evidenceRefs,
      confidence: input.signal.confidence,
      reason: input.signal.reason,
      status: "candidate",
      source: `detection:${input.signal.kind}`,
      previousDiagnosisId: input.previousDiagnosisId,
      operationKey,
    } as never,
    "diagnosis",
  );
  const d = row as LearningDiagnosis & { existed?: boolean };
  if (!d.existed) {
    await emit("DiagnosisCreated", {
      id: randomUUID(),
      version: 1,
      occurredAt: new Date().toISOString(),
      actor: { id: "system", role: "system" },
      tenantId: input.tenantId,
      studentId: input.studentId,
      payload: { diagnosisId: d.id, gaps: [d.skill], evidenceRefs: d.evidenceRefs as string[] },
    }, emitFn);
  }
  return d;
}

// ============================================================ Intervene (proposal only — Teacher boundary)

export interface ProposalInput {
  tenantId: string;
  studentId: string;
  diagnosis: LearningDiagnosis;
  activityType: string;
  config?: Record<string, unknown>;
}
const ACTIVITY_TEMPLATES: Record<string, { activityType: string; config: Record<string, unknown> }> = {
  fluency: { activityType: "targeted-reading-practice", config: { sessionMinutes: 10, repetition: 2 } },
  "repeated-mistake": { activityType: "targeted-dictation-exercise", config: { items: 8 } },
};
export async function proposeIntervention(input: ProposalInput, emitFn?: EmitFn): Promise<InterventionProposal & { existed?: boolean }> {
  assertContext(input.tenantId, input.studentId);
  assertSameTenant(input.diagnosis.tenantId, input.tenantId, "diagnosis");
  if (input.diagnosis.studentId !== input.studentId) throw new ClassifiedError("authorization", "STUDENT_MISMATCH");
  const kind = input.diagnosis.signalKey.split(":")[1];
  const tpl = ACTIVITY_TEMPLATES[kind] ?? { activityType: input.activityType ?? "targeted-practice", config: input.config ?? {} };
  // R-027-05 stage barrier — a lost parent identity must NEVER compose this
  // stage's operationKey or its diagnosis_id column.
  if (!input.diagnosis.id) throw new ClassifiedError("validation", "DIAGNOSIS_IDENTITY_MISSING");
  const operationKey = `loop:intervention:${input.diagnosis.id}`;
  const row = await insertIdempotent(
    interventionProposalsTable,
    {
      tenantId: input.tenantId,
      studentId: input.studentId,
      diagnosisId: input.diagnosis.id,
      skill: input.diagnosis.skill,
      activityType: tpl.activityType,
      config: tpl.config,
      suggestedBy: "learning-loop",
      status: "PENDING",
      originalProposal: { activityType: tpl.activityType, config: tpl.config },
      operationKey,
    } as never,
    "intervention",
  );
  return row as InterventionProposal & { existed?: boolean };
}

// ============================================================ Reassess

export interface ReassessmentInput {
  tenantId: string;
  studentId: string;
  diagnosis: LearningDiagnosis;
  intervention: InterventionProposal;
  skill: string;
  activityUsed?: string;
  baselineEvidenceRef: string;
  reassessmentEvidenceRef: string;
  occurredAt: Date;
}
export async function recordReassessment(input: ReassessmentInput, emitFn?: EmitFn): Promise<LearningReassessment & { existed?: boolean }> {
  assertContext(input.tenantId, input.studentId);
  assertSameTenant(input.diagnosis.tenantId, input.tenantId, "diagnosis");
  assertSameTenant(input.intervention.tenantId, input.tenantId, "intervention");
  if (input.diagnosis.studentId !== input.studentId || input.intervention.studentId !== input.studentId) {
    throw new ClassifiedError("authorization", "STUDENT_MISMATCH");
  }
  if (input.intervention.status === "PENDING" || input.intervention.status === "REJECTED") {
    throw new ClassifiedError("validation", "INTERVENTION_NOT_AUTHORIZED");
  }
  if (!input.diagnosis.id || !input.intervention.id) throw new ClassifiedError("validation", "INTERVENTION_IDENTITY_MISSING"); // R-027-05 barrier
  const operationKey = `loop:reassessment:${input.intervention.id}:${input.occurredAt.toISOString()}`;
  return insertIdempotent(
    learningReassessmentsTable,
    {
      tenantId: input.tenantId,
      studentId: input.studentId,
      diagnosisId: input.diagnosis.id,
      interventionId: input.intervention.id,
      skill: input.skill,
      activityUsed: input.activityUsed,
      occurredAt: input.occurredAt,
      baselineEvidenceRef: input.baselineEvidenceRef,
      reassessmentEvidenceRef: input.reassessmentEvidenceRef,
      operationKey,
    } as never,
    "reassessment",
  ) as Promise<LearningReassessment & { existed?: boolean }>;
}

// ============================================================ Compare (multidimensional, NO overall score)

export interface MetricIndicator { before: number; after: number; delta: number; direction: "up" | "down" | "flat"; }
export interface ComparisonResult {
  indicators: Record<string, MetricIndicator>;
  trend: "improved" | "declined" | "unchanged" | "unknown";
  sufficientEvidence: boolean;
  noOverallScore: true; // contract: learner profile stays multidimensional
}
export function compareBeforeAfter(baseline: Record<string, number>, current: Record<string, number>): ComparisonResult {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  const indicators: Record<string, MetricIndicator> = {};
  for (const k of keys) {
    const before = baseline[k];
    const after = current[k];
    if (before === undefined || after === undefined) continue;
    const delta = after - before;
    indicators[k] = {
      before,
      after,
      delta: Math.round(delta * 100) / 100,
      direction: delta > 0.005 ? "up" : delta < -0.005 ? "down" : "flat",
    };
  }
  const metricKeys = Object.keys(indicators);
  const sufficient = metricKeys.length >= 2;
  const up = metricKeys.filter((k) => indicators[k].direction === "up").length;
  const down = metricKeys.filter((k) => indicators[k].direction === "down").length;
  let trend: ComparisonResult["trend"] = "unknown";
  if (sufficient && up > down) trend = "improved";
  else if (sufficient && down > up) trend = "declined";
  else if (sufficient) trend = "unchanged";
  return { indicators, trend, sufficientEvidence: sufficient, noOverallScore: true };
}

// ============================================================ Outcome

export interface OutcomeInput {
  tenantId: string;
  studentId: string;
  diagnosis: LearningDiagnosis;
  intervention: InterventionProposal;
  reassessment: LearningReassessment;
  comparison: ComparisonResult;
  result?: "IMPROVED" | "NO_CHANGE" | "DECLINED" | "INSUFFICIENT_EVIDENCE";
  confidence?: number;
}
export async function recordOutcome(input: OutcomeInput, emitFn?: EmitFn): Promise<LearningOutcome & { existed?: boolean }> {
  assertContext(input.tenantId, input.studentId);
  assertSameTenant(input.diagnosis.tenantId, input.tenantId, "diagnosis");
  assertSameTenant(input.reassessment.tenantId, input.tenantId, "reassessment");
  if (input.reassessment.baselineEvidenceRef === null || input.reassessment.reassessmentEvidenceRef === null) {
    throw new ClassifiedError("validation", "OUTCOME_REQUIRES_EVIDENCE_REFS");
  }
  const result = (input.result ?? (!input.comparison.sufficientEvidence ? "INSUFFICIENT_EVIDENCE"
    : input.comparison.trend === "improved" ? "IMPROVED"
    : input.comparison.trend === "declined" ? "DECLINED" : "NO_CHANGE")) as "IMPROVED" | "NO_CHANGE" | "DECLINED" | "INSUFFICIENT_EVIDENCE";
  const confidence = input.confidence ?? (result === "INSUFFICIENT_EVIDENCE" ? 0.3 : Math.min(0.95, 0.5 + Object.keys(input.comparison.indicators).length * 0.1));
  if (!input.diagnosis.id || !input.intervention.id || !input.reassessment.id) throw new ClassifiedError("validation", "REASSESSMENT_IDENTITY_MISSING"); // R-027-05 barrier
  const operationKey = `loop:outcome:${input.reassessment.id}`;
  const row = await insertIdempotent(
    learningOutcomesTable,
    {
      tenantId: input.tenantId,
      studentId: input.studentId,
      diagnosisId: input.diagnosis.id,
      interventionId: input.intervention.id,
      reassessmentId: input.reassessment.id,
      result,
      evidenceRefs: [input.reassessment.baselineEvidenceRef, input.reassessment.reassessmentEvidenceRef],
      comparison: input.comparison,
      occurredAt: new Date(),
      confidence,
      source: "learning-loop:compare",
      operationKey,
    } as never,
    "outcome",
  ) as unknown as Promise<LearningOutcome & { existed?: boolean }>;
  const o = row as unknown as LearningOutcome & { existed?: boolean };
  if (!o.existed) {
    // Outcome is stored as canonical evidence (type outcome) via the ONLY legal writer.
    await recordEvidence({
      tenantId: input.tenantId,
      studentId: input.studentId,
      actorRole: "system",
      occurredAt: new Date(),
      evidenceType: "outcome",
      subject: input.diagnosis.skill,
      inResponseToId: input.reassessment.reassessmentEvidenceRef ?? undefined,
      action: "learning-loop.outcome",
      response: { result, trend: input.comparison.trend },
      result: "completed",
      sourceEngine: "learning-loop",
      tool: "learning-loop-core",
      operationKey: `loop:outcome-ev:${input.reassessment.id}`,
    });
    await emit("InterventionOutcomeMeasured", {
      id: randomUUID(),
      version: 1,
      occurredAt: new Date().toISOString(),
      actor: { id: "system", role: "system" },
      tenantId: input.tenantId,
      studentId: input.studentId,
      payload: { interventionId: input.intervention.id, beforeScore: 0, afterScore: 0, delta: 0 },
    }, emitFn);
  }
  return o;
}

// ============================================================ Adapt (evidence-based next action abstraction)

export interface AdaptRules { escalationsBeforeTeacher: number; }
export const DEFAULT_ADAPT_RULES: AdaptRules = { escalationsBeforeTeacher: 2 };
export interface AdaptDecision {
  action: "continue-progression" | "repeat" | "simplify" | "increase-support" | "change-activity" | "increase-practice" | "escalate-to-teacher" | "gather-more-evidence";
  reason: string;
}
export function adaptNextAction(outcome: Pick<LearningOutcome, "result" | "confidence">, previousSameOutcomes: number, rules: AdaptRules = DEFAULT_ADAPT_RULES): AdaptDecision {
  if (outcome.result === "INSUFFICIENT_EVIDENCE") return { action: "gather-more-evidence", reason: "أدلة غير كافية لمقارنة موثوقة" };
  if (outcome.result === "IMPROVED" && outcome.confidence >= 0.6) return { action: "continue-progression", reason: "التدخل فعّال — تقدّم" };
  if (outcome.result === "IMPROVED") return { action: "gather-more-evidence", reason: "تحسن لكن بثقة منخفضة" };
  if (outcome.result === "NO_CHANGE") return { action: "increase-practice", reason: "لا تغيّر — زيادة التدريب" };
  if (previousSameOutcomes >= rules.escalationsBeforeTeacher) return { action: "escalate-to-teacher", reason: "تكرار عدم التحسن — رفع للمعلم" };
  return { action: "repeat", reason: "تراجع — تكرار النشاط مع دعم إضافي" };
}

// ============================================================ Full loop (traceable; failure at any stage is explicit)

export interface LoopTrace {
  tenantId: string;
  studentId: string;
  signals: DetectionSignal[];
  diagnosis?: LearningDiagnosis & { existed?: boolean };
  proposal?: InterventionProposal & { existed?: boolean };
  decision?: TeacherDecision;
  reassessment?: LearningReassessment & { existed?: boolean };
  comparison?: ComparisonResult;
  outcome?: LearningOutcome & { existed?: boolean };
  adapt?: AdaptDecision;
  stoppedAt?: "diagnosis" | "teacher-decision" | "reassessment" | "outcome";
  stopReason?: string;
}
export async function runLearningLoop(args: {
  tenantId: string;
  studentId: string;
  rows: Parameters<typeof detectSignals>[0];
  teacherDecision?: TeacherDecision;
  emitEvent?: EmitFn;
  rules?: DetectionRuleConfig;
}): Promise<LoopTrace> {
  const trace: LoopTrace = { tenantId: args.tenantId, studentId: args.studentId, signals: [] };
  trace.signals = await stageDetect({ tenantId: args.tenantId, studentId: args.studentId, rows: args.rows, rules: args.rules });
  const actionable = trace.signals.filter((s) => s.kind !== "insufficient-evidence");
  if (actionable.length === 0) {
    trace.stoppedAt = "diagnosis";
    trace.stopReason = trace.signals.length > 0 ? "insufficient-evidence" : "no-signal";
    return trace;
  }
  const signal = actionable[0];
  trace.diagnosis = await createDiagnosis({ tenantId: args.tenantId, studentId: args.studentId, signal }, args.emitEvent);
  trace.proposal = await proposeIntervention({ tenantId: args.tenantId, studentId: args.studentId, diagnosis: trace.diagnosis as LearningDiagnosis, activityType: "targeted-practice" }, args.emitEvent);
  if (!args.teacherDecision) {
    trace.stoppedAt = "teacher-decision";
    trace.stopReason = "awaiting-teacher-review";
    return trace;
  }
  trace.decision = args.teacherDecision;
  const { proposal: merged } = await applyTeacherDecision({ tenantId: args.tenantId, proposal: trace.proposal as InterventionProposal, decision: args.teacherDecision }, args.emitEvent);
  trace.proposal = merged; // reflect the approved/modified proposal in the trace
  if (merged.status === "REJECTED") {
    trace.stoppedAt = "teacher-decision";
    trace.stopReason = "rejected-by-teacher";
    return trace;
  }
  // R-027-02 FIX — skill isolation: compare ONLY rows of the diagnosed skill
  // (derived via skillOf — the evidence table has no skill column), never a
  // mix of two skills. Previously filtered on evidenceType ONLY.
  // R-027-01 FIX — evidence-type + metric scope come from the canonical
  // Learner Dimension registry (@workspace/db, exported since CORE-09):
  // numeracy measurements written as evidenceType "attempt" with
  // dimensionMeasurements now reach the comparison. Unregistered skills keep
  // the historical assessment-only behavior (no silent widening).
  const registryEntry = LEARNER_DIMENSION_REGISTRY.find((e: { skill: string }) => e.skill === signal.skill);
  const allowedTypes: readonly string[] = registryEntry?.evidenceTypes ?? (["assessment"] as const);
  const skillRows = args.rows.filter((r) => skillOf(r) === signal.skill && allowedTypes.includes(r.evidenceType));
  if (skillRows.length < 2) {
    trace.stoppedAt = "reassessment";
    trace.stopReason = "insufficient-evidence-for-comparison";
    return trace;
  }
  const sorted = [...skillRows].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  const baselineEvidenceRef = sorted[0].id;
  const currentEvidenceRef = sorted[sorted.length - 1].id;
  const skillMetrics = [...new Set(LEARNER_DIMENSION_REGISTRY.filter((e: { skill: string }) => e.skill === signal.skill).map((e: { metric: string }) => e.metric))] as string[];
  const toMetrics = (r: (typeof skillRows)[number]): Record<string, number> => {
    const resp = (r.response ?? {}) as Record<string, unknown>;
    const m: Record<string, number> = {};
    for (const k of ["accuracy", "fluency", "prosody", "wpm", "comprehension"]) if (typeof resp[k] === "number") m[k] = resp[k];
    // R-027-01 FIX — registry-declared metrics for THIS skill (e.g. numeracy:
    // accuracy, problem-solving, durationMs) + the engine's dimensionMeasurements.
    for (const k of skillMetrics) if (typeof resp[k] === "number" && m[k] === undefined) m[k] = resp[k];
    const dims = Array.isArray(resp.dimensionMeasurements) ? (resp.dimensionMeasurements as Array<{ metric?: unknown; value?: unknown }>) : [];
    for (const d of dims) if (typeof d?.metric === "string" && typeof d.value === "number" && m[d.metric] === undefined) m[d.metric] = d.value;
    return m;
  };
  const comparison = compareBeforeAfter(toMetrics(sorted[0]), toMetrics(sorted[sorted.length - 1]));
  trace.reassessment = await recordReassessment({
    tenantId: args.tenantId,
    studentId: args.studentId,
    diagnosis: trace.diagnosis as LearningDiagnosis,
    intervention: merged,
    skill: signal.skill,
    activityUsed: merged.activityType,
    baselineEvidenceRef,
    reassessmentEvidenceRef: currentEvidenceRef,
    occurredAt: new Date(sorted[sorted.length - 1].occurredAt),
  }, args.emitEvent);
  trace.comparison = comparison;
  trace.outcome = await recordOutcome({
    tenantId: args.tenantId,
    studentId: args.studentId,
    diagnosis: trace.diagnosis as LearningDiagnosis,
    intervention: merged,
    reassessment: trace.reassessment as LearningReassessment,
    comparison,
  }, args.emitEvent);
  trace.adapt = adaptNextAction(trace.outcome as LearningOutcome, 0);
  return trace;
}
