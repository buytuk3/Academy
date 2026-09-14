/**
 * CORE-11 - Teacher Intelligence (read-only projections; owner packages/intelligence).
 *
 * TI-01 Teacher Student Summary / TI-02 Priority Insights / TI-03 Evidence-backed
 * Recommendations / TI-04 Intervention History / TI-05 Teacher Review Queue /
 * TI-06 Teacher Feedback recorded as canonical Evidence.
 *
 * Reads CANONICAL sources only (Evidence reader + Learner Model + Learning Loop
 * history). NEVER owns/duplicates Evidence, SLR, Mastery, Diagnosis or
 * Intervention data, and writes NOTHING except teacher feedback through the one
 * canonical recordEvidence() writer. No new tables, no engine directory, no
 * decision boundary (canonical @workspace/decisions is re-exported from
 * teacher-boundary.ts). Deterministic rules + statistics only (no ML/LLM).
 */
import { buildLearnerModel, listEvidenceForStudent, recordEvidence, type Evidence, type LearnerModel } from "@workspace/db";
import { buildInsights } from "./insights.js";
import { DEFAULT_INTELLIGENCE_CONFIG, type IntelligenceConfig, type IntelligenceInsight } from "./contracts.js";
import { evidenceDerivedHistory, type HistoryReader, type InterventionHistoryEntry } from "./history.js";
import type { EvidenceReader } from "./intelligence.js";
import type {
  InterventionChain,
  PriorityInsight,
  TeacherDimensionSummary,
  TeacherFeedbackDecision,
  TeacherFeedbackInput,
  TeacherOutcomeBrief,
  TeacherRecommendation,
  TeacherReviewItem,
  TeacherReviewKind,
  TeacherStudentSummary,
} from "./teacher-contracts.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_CONFIDENCE = 0.55;
const FEEDBACK_DECISIONS: TeacherFeedbackDecision[] = ["APPROVED", "MODIFIED", "REJECTED", "CONFIRMED"];

export interface BuildTeacherArgs {
  tenantId: string;
  studentId: string;
  evidenceReader?: EvidenceReader;
  learnerBuilder?: (q: { tenantId: string; studentId: string }) => Promise<LearnerModel | null>;
  historyReader?: HistoryReader;
  config?: Partial<IntelligenceConfig>;
  now?: Date;
}

interface Collected {
  rows: Evidence[];
  learner: LearnerModel | null;
  history: InterventionHistoryEntry[];
  insights: IntelligenceInsight[];
  config: IntelligenceConfig;
  now: Date;
}

async function collect(args: BuildTeacherArgs): Promise<Collected> {
  const { tenantId, studentId } = args;
  if (!tenantId) throw new Error("TENANT_CONTEXT_MISSING");
  if (!studentId) throw new Error("STUDENT_CONTEXT_MISSING");
  if (!UUID_RE.test(tenantId)) throw new Error("INVALID_TENANT_ID");
  if (!UUID_RE.test(studentId)) throw new Error("INVALID_STUDENT_ID");
  const config: IntelligenceConfig = { ...DEFAULT_INTELLIGENCE_CONFIG, ...(args.config ?? {}) };
  const now = args.now ?? new Date();
  const reader = args.evidenceReader ?? (listEvidenceForStudent as unknown as EvidenceReader);
  const rows = (await reader({ tenantId, studentId, limit: config.maxEvidenceRows })) as unknown as Evidence[];
  const learnerBuilder = args.learnerBuilder ?? buildLearnerModel;
  const learner = await learnerBuilder({ tenantId, studentId }).catch(() => null);
  const historyReader = args.historyReader ?? evidenceDerivedHistory;
  const history = await historyReader({ tenantId, studentId, rows });
  const insights = buildInsights({ tenantId, studentId, evidenceRows: rows, learnerModel: learner, history, config, now });
  return { rows, learner, history, insights, config, now };
}

function spanDays(from: Date | null, to: Date | null): number {
  if (!from || !to) return 0;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

function toDim(d: LearnerModel["dimensions"][number]): TeacherDimensionSummary {
  return {
    subject: d.subject, skill: d.skill, dimension: d.dimension,
    level: d.level, trend: d.trend, confidence: d.confidence,
    evidenceRefs: d.evidenceRefs, sampleCount: d.sampleCount,
    firstSeenAt: d.from, lastSeenAt: d.to,
  };
}

function toBrief(e: InterventionHistoryEntry): TeacherOutcomeBrief {
  return {
    outcome: e.outcome, interventionId: e.interventionId, diagnosisId: e.diagnosisId,
    reassessmentId: e.reassessmentId, skill: e.skill, occurredAt: e.occurredAt,
    evidenceRefs: e.evidenceRefs,
  };
}

const SIGNAL_BASE: Record<string, number> = {
  NO_IMPROVEMENT_AFTER_INTERVENTION: 5,
  DECLINE: 4,
  PERSISTENT_PATTERN: 3.5,
  SLOW_RESPONSE_PERSISTENT: 3,
  SLOW_RESPONSE_TEMPORARY: 0.6,
  TEMPORARY_EVENT: 0.5,
  IMPROVEMENT: -1,
};

export function priorityScoreFor(insight: IntelligenceInsight): number {
  const base = SIGNAL_BASE[insight.signal] ?? 1;
  const conf = Math.min(insight.confidence, 1) * 1.5;
  const dur = Math.min(spanDays(insight.firstSeenAt, insight.lastSeenAt) / 30, 1.5);
  const sess = Math.min(insight.sessionCount, 5) * 0.1;
  return Math.round((base + conf + dur + sess) * 100) / 100;
}

export function prioritizeInsights(insights: IntelligenceInsight[]): PriorityInsight[] {
  return insights
    .map((insight) => ({ insight, priorityScore: priorityScoreFor(insight) }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .map((x, idx) => ({
      insight: x.insight,
      priorityScore: x.priorityScore,
      priorityRank: idx + 1,
      priorityRationale:
        "priority = base(" + x.insight.signal + ") + confidence*1.5 + duration/30 + sessions*0.1; score=" + x.priorityScore,
    }));
}

function proposedActionPhrase(kind: string): string {
  if (kind === "TARGETED_PRACTICE") return "targeted practice on the affected skill";
  if (kind === "ALTERNATIVE_INTERVENTION") return "alternative intervention (prior one did not improve the outcome)";
  return "teacher review required before any action";
}

function reviewKindOf(insight: IntelligenceInsight): TeacherReviewKind | null {
  if (!insight.recommendation) return null;
  if (insight.recommendation.kind === "TEACHER_REVIEW" && insight.priorIntervention?.outcome === "IMPROVED") {
    return "RECURRING_AFTER_IMPROVEMENT";
  }
  if (insight.signal === "NO_IMPROVEMENT_AFTER_INTERVENTION") {
    if (insight.priorIntervention?.outcome === "INSUFFICIENT_EVIDENCE") return "INSUFFICIENT_EVIDENCE_JUDGEMENT";
    return "NO_IMPROVEMENT";
  }
  if (insight.signal === "DECLINE") return "DECLINE";
  if (insight.signal === "PERSISTENT_PATTERN") return "PERSISTENT_PATTERN";
  if (insight.recommendation.kind === "TEACHER_REVIEW") {
    if (insight.priorIntervention?.outcome === "IMPROVED") return "RECURRING_AFTER_IMPROVEMENT";
    return "DECLINE";
  }
  if (insight.signal === "SLOW_RESPONSE_PERSISTENT") return "PERSISTENT_PATTERN";
  return "NEW_ISSUE";
}

export function buildTeacherReviewQueue(insights: IntelligenceInsight[]): TeacherReviewItem[] {
  const prioritized = prioritizeInsights(insights);
  const items: TeacherReviewItem[] = [];
  for (const p of prioritized) {
    const kind = reviewKindOf(p.insight);
    if (!kind || !p.insight.recommendation) continue;
    items.push({
      kind,
      insightId: p.insight.id,
      issue: [p.insight.dimension.skill, p.insight.dimension.dimension].filter(Boolean).join(" / ") || "learner",
      rationale: p.insight.recommendation.rationale,
      evidenceRefs: p.insight.evidenceRefs,
      priorityScore: p.priorityScore,
      suggestedAction: proposedActionPhrase(p.insight.recommendation.kind),
      requiresTeacherApproval: true,
    });
  }
  return items;
}

export async function buildTeacherStudentSummary(args: BuildTeacherArgs): Promise<TeacherStudentSummary> {
  const c = await collect(args);
  const dimensions = c.learner?.dimensions ?? [];
  const strengths = dimensions
    .filter((d) => d.confidence >= MIN_CONFIDENCE && (d.level === "strong" || d.level === "improving" || d.level === "fast"))
    .map(toDim);
  const attentionAreas = dimensions
    .filter((d) => d.level === "weak" || d.level === "declining" || d.level === "slow" || d.trend === "DECLINING")
    .map(toDim);
  const times = c.rows.map((r) => r.occurredAt.getTime());
  const first = times.length ? new Date(Math.min(...times)) : null;
  const last = times.length ? new Date(Math.max(...times)) : null;
  const queue = buildTeacherReviewQueue(c.insights);
  const lastHistory = c.history.length ? c.history[c.history.length - 1] : null;
  return {
    tenantId: args.tenantId,
    studentId: args.studentId,
    generatedAt: c.now,
    strengths,
    attentionAreas,
    timeWindow: { firstSeenAt: first, lastSeenAt: last, spanDays: spanDays(first, last) },
    evidenceCount: c.rows.length,
    dimensionCount: dimensions.length,
    lastIntervention: lastHistory && lastHistory.interventionId ? toBrief(lastHistory) : null,
    lastOutcome: lastHistory && lastHistory.outcome ? toBrief(lastHistory) : null,
    needsTeacherDecisionCount: queue.length,
  };
}

export function buildTeacherRecommendations(insights: IntelligenceInsight[]): TeacherRecommendation[] {
  const out: TeacherRecommendation[] = [];
  for (const insight of insights) {
    if (!insight.recommendation) continue;
    out.push({
      reason: insight.recommendation.rationale + " | " + insight.explanation,
      evidenceRefs: insight.evidenceRefs,
      confidence: Math.round(Math.min(insight.confidence, 0.95) * 100) / 100,
      affectedDimension: insight.dimension,
      proposedAction: proposedActionPhrase(insight.recommendation.kind),
      requiresTeacherApproval: true,
    });
  }
  return out;
}

export async function buildInterventionHistory(args: BuildTeacherArgs): Promise<InterventionChain[]> {
  const c = await collect(args);
  const decisionsByProposal = new Map<string, string>();
  for (const row of c.rows) {
    if (row.evidenceType !== "decision") continue;
    const resp = (row.response ?? {}) as Record<string, unknown>;
    const proposalId = typeof resp.proposalId === "string" ? resp.proposalId : null;
    const decision = typeof resp.decision === "string" ? resp.decision : null;
    if (proposalId && decision) decisionsByProposal.set(proposalId, decision);
  }
  return c.history.map((e) => ({
    problem: e.skill,
    diagnosisId: e.diagnosisId,
    interventionId: e.interventionId,
    teacherDecision: e.interventionId ? (decisionsByProposal.get(e.interventionId) ?? null) : null,
    reassessmentId: e.reassessmentId,
    outcome: e.outcome,
    skill: e.skill,
    occurredAt: e.occurredAt,
    evidenceRefs: e.evidenceRefs,
  }));
}

export async function recordTeacherFeedback(
  input: TeacherFeedbackInput,
  opts?: { record?: typeof recordEvidence; now?: Date },
): Promise<{ recorded: true; operationKey: string; evidence: unknown }> {
  if (!input.tenantId) throw new Error("TENANT_CONTEXT_MISSING");
  if (!input.studentId) throw new Error("STUDENT_CONTEXT_MISSING");
  if (!input.actorId) throw new Error("ACTOR_REQUIRED");
  if (!input.actorRole) throw new Error("ACTOR_ROLE_REQUIRED");
  if (!input.proposalId) throw new Error("PROPOSAL_REQUIRED");
  if (!UUID_RE.test(input.tenantId)) throw new Error("INVALID_TENANT_ID");
  if (!UUID_RE.test(input.studentId)) throw new Error("INVALID_STUDENT_ID");
  if (!UUID_RE.test(input.actorId)) throw new Error("INVALID_ACTOR_ID");
  if (!FEEDBACK_DECISIONS.includes(input.decision)) throw new Error("INVALID_DECISION");
  const operationKey = "teacher:feedback:" + input.proposalId + ":" + input.actorId + ":" + input.decision;
  const writer = opts?.record ?? recordEvidence;
  const evidence = await writer({
    tenantId: input.tenantId,
    studentId: input.studentId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    occurredAt: opts?.now ?? new Date(),
    evidenceType: "decision",
    response: {
      proposalId: input.proposalId,
      decision: input.decision,
      note: input.note ?? null,
      modifications: input.modifications ?? {},
    },
    operationKey,
    sourceEngine: "teacher-intelligence",
  });
  return { recorded: true as const, operationKey, evidence };
}
