/**
 * CORE-10 - evidence-backed insight builder (Layer 2 Statistics on top of
 * Layer 1 Rules). Combines mistake patterns, learner-model trends/speed and
 * intervention outcomes into explainable IntelligenceInsight objects.
 * Every insight carries evidence REFERENCES only; nothing is written here.
 */
import type { DimensionInterpretation, LearnerModel } from "@workspace/db";
import type {
  DimensionRef,
  InsightRecommendation,
  IntelligenceConfig,
  IntelligenceInsight,
  IntelligenceSignalKind,
  IntelligenceSource,
  PriorInterventionRef,
} from "./contracts.js";
import type { InterventionHistoryEntry } from "./history.js";
import { bucketMistakes, mistakePattern, spanDays } from "./signals.js";

export interface BuildInsightsArgs {
  tenantId: string;
  studentId: string;
  evidenceRows: { id: string; occurredAt: Date; sessionId: string | null; evidenceType: string; subject: string | null; response: unknown }[];
  learnerModel: LearnerModel | null;
  history: InterventionHistoryEntry[];
  config: IntelligenceConfig;
  now?: Date;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function latestOutcomeFor(history: InterventionHistoryEntry[], skill: string | null): InterventionHistoryEntry | null {
  if (!skill) return null;
  const match = history.filter((h) => h.skill === skill || h.skill === null);
  return match.length > 0 ? match[match.length - 1] : null;
}

function evidencePredates(outcome: InterventionHistoryEntry, ids: string[]): boolean {
  return ids.every((id) => outcome.evidenceRefs.includes(id) === false) && ids.length > 0;
}

export function buildInsights(args: BuildInsightsArgs): IntelligenceInsight[] {
  const { tenantId, studentId, learnerModel, history, config } = args;
  const now = args.now ?? new Date();
  const insights: IntelligenceInsight[] = [];

  const rows = args.evidenceRows as unknown as { id: string; occurredAt: Date; sessionId: string | null; evidenceType: string; subject: string | null; response: unknown }[];

  // ---- mistake patterns (Layer 1 rules, time/session aware) ----
  const buckets = bucketMistakes(rows as never);
  for (const bucket of buckets) {
    const pattern = mistakePattern(bucket, config);
    const outcome = latestOutcomeFor(history, bucket.skill);
    let recommendation: InsightRecommendation | null = null;
    let priorIntervention: PriorInterventionRef | null = null;
    let signal: IntelligenceSignalKind = pattern.signal;
    if (outcome) {
      priorIntervention = {
        diagnosisId: outcome.diagnosisId,
        interventionId: outcome.interventionId,
        outcome: outcome.outcome,
        reassessmentId: outcome.reassessmentId,
        occurredAt: outcome.occurredAt,
        evidenceRefs: outcome.evidenceRefs,
      };
      const bad = outcome.outcome === "NO_CHANGE" || outcome.outcome === "DECLINED" || outcome.outcome === "INSUFFICIENT_EVIDENCE";
      const oldEvidence = evidencePredates(outcome, bucket.evidenceIds);
      if (bad) {
        signal = "NO_IMPROVEMENT_AFTER_INTERVENTION";
        recommendation = {
          kind: "ALTERNATIVE_INTERVENTION",
          rationale: "prior intervention on this skill did not improve the outcome (" + outcome.outcome + "); do not repeat it blindly",
          requiresTeacherApproval: true,
        };
      } else if (outcome.outcome === "IMPROVED" && !oldEvidence) {
        recommendation = {
          kind: "TEACHER_REVIEW",
          rationale: "pattern appears to RESURFACE after an IMPROVED outcome; do not blindly repeat the prior intervention - teacher review required",
          requiresTeacherApproval: true,
        };
        signal = pattern.signal;
      } else if (outcome.outcome === "IMPROVED" && oldEvidence) {
        recommendation = null; // resolved by the prior intervention; no blind re-proposal
      } else {
        recommendation = {
          kind: "TARGETED_PRACTICE",
          rationale: "persistent mistake pattern with no effective prior outcome",
          requiresTeacherApproval: true,
        };
      }
    } else if (pattern.signal === "PERSISTENT_PATTERN") {
      recommendation = { kind: "TARGETED_PRACTICE", rationale: "persistent mistake pattern; targeted practice proposal for teacher review", requiresTeacherApproval: true };
    }
    insights.push({
      id: "intelligence:" + tenantId + ":" + studentId + ":" + signal + ":" + bucket.key,
      tenantId, studentId,
      dimension: { subject: bucket.skill ? bucket.skill.split(".")[0] : null, skill: bucket.skill, dimension: bucket.errorType ?? "accuracy" },
      signal,
      evidenceRefs: bucket.evidenceIds,
      confidence: pattern.confidence,
      source: pattern.source,
      occurredAt: now,
      firstSeenAt: bucket.firstSeenAt,
      lastSeenAt: bucket.lastSeenAt,
      evidenceCount: bucket.evidenceIds.length,
      sessionCount: bucket.sessions.size,
      explanation: pattern.explanation + (priorIntervention ? " prior outcome: " + priorIntervention.outcome : ""),
      priorIntervention,
      recommendation,
    });
  }

  if (!learnerModel) return insights;

  // ---- learner-model trends + speed (Layer 2 statistics) ----
  for (const dim of learnerModel.dimensions) {
    const withTrend = interpretTrend(dim, config);
    if (withTrend) {
      const i = withTrend(tenantId, studentId, now);
      if (i) insights.push(i);
    }
    const speed = interpretSpeed(dim, config);
    if (speed) {
      const i = speed(tenantId, studentId, now);
      if (i) insights.push(i);
    }
  }
  return insights;
}

function baseDim(dim: DimensionInterpretation, tenantId: string, studentId: string, now: Date, signal: IntelligenceSignalKind, source: IntelligenceSource): IntelligenceInsight {
  return {
    id: "intelligence:" + tenantId + ":" + studentId + ":" + signal + ":" + (dim.subject + ":" + dim.dimension),
    tenantId, studentId,
    dimension: { subject: dim.subject, skill: dim.skill, dimension: dim.dimension },
    signal,
    evidenceRefs: dim.evidenceRefs,
    confidence: Math.min(dim.confidence, 0.9),
    source,
    occurredAt: now,
    firstSeenAt: dim.from,
    lastSeenAt: dim.to,
    evidenceCount: dim.sampleCount,
    sessionCount: 0,
    explanation: "",
    priorIntervention: null,
    recommendation: null,
  };
}

function interpretTrend(dim: DimensionInterpretation, config: IntelligenceConfig) {
  if (dim.sampleCount < config.minTrendSamples) return null;
  const base = (tenantId: string, studentId: string, now: Date): IntelligenceInsight | null => {
    const i = baseDim(dim, tenantId, studentId, now, "DECLINE", "STATISTICAL");
    i.explanation = "STATISTICAL: learner model trend " + dim.trend + " on " + dim.dimension + " (" + dim.sampleCount +
      " samples, recent " + (dim.recentMean ?? 0).toFixed(3) + " vs older " + (dim.olderMean ?? 0).toFixed(3) + "); " + dim.reason;
    i.recommendation = { kind: "TEACHER_REVIEW", rationale: "declining dimension; propose teacher review before any action", requiresTeacherApproval: true };
    return i;
  };
  if (dim.trend === "DECLINING") return base;
  if (dim.trend === "IMPROVING") {
    return (tenantId: string, studentId: string, now: Date): IntelligenceInsight | null => {
      const i = baseDim(dim, tenantId, studentId, now, "IMPROVEMENT", "STATISTICAL");
      i.explanation = "STATISTICAL: learner model trend " + dim.trend + " on " + dim.dimension + " (" + dim.sampleCount + " samples); " + dim.reason;
      return i;
    };
  }
  return null;
}

function interpretSpeed(dim: DimensionInterpretation, config: IntelligenceConfig) {
  if (dim.dimension !== "response-speed" || dim.sampleCount < config.minSlowSamples) return null;
  if (dim.level !== "slow") return null;
  const span = spanDays(dim.from, dim.to);
  if (span >= config.slowResponseSpanDays) {
    return (tenantId: string, studentId: string, now: Date): IntelligenceInsight => {
      const i = baseDim(dim, tenantId, studentId, now, "SLOW_RESPONSE_PERSISTENT", "STATISTICAL");
      i.explanation = "STATISTICAL: response speed slow consistently over " + Math.round(span) + " days (" + dim.sampleCount + " samples) - not a one-off";
      i.recommendation = { kind: "TEACHER_REVIEW", rationale: "persistently slow responses; teacher review required", requiresTeacherApproval: true };
      return i;
    };
  }
  return (tenantId: string, studentId: string, now: Date): IntelligenceInsight | null => {
    const i = baseDim(dim, tenantId, studentId, now, "SLOW_RESPONSE_TEMPORARY", "STATISTICAL");
    i.explanation = "STATISTICAL: slow responses observed over " + Math.round(span) + " day(s) only - temporary, no action yet";
    return i;
  };
}
