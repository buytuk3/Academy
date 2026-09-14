/**
 * CORE-10 - Learning Intelligence Foundation: public contracts (Core Platform).
 *
 * Purpose: turn Evidence + Learner Model + Learning Loop into an explainable,
 * auditable intelligence layer. Every insight carries its evidence REFERENCES
 * (never duplicated evidence), a deterministic confidence, a source
 * (RULE = deterministic rules; STATISTICAL = means/trends from history) and an
 * explanation. No overall score exists anywhere. Insights NEVER deliver
 * anything autonomously: any intervention proposal requires teacher approval
 * through the canonical @workspace/decisions boundary.
 *
 * Design limits (CORE-10): only Layer 1 (Rules) + Layer 2 (Statistics) are
 * implemented; ML/LLM layers are future, not built here. Readers are injected
 * so a materialized projection / cache / read-model can be added later without
 * changing domain ownership.
 */
export type IntelligenceSignalKind =
  | "PERSISTENT_PATTERN"
  | "TEMPORARY_EVENT"
  | "DECLINE"
  | "IMPROVEMENT"
  | "SLOW_RESPONSE_PERSISTENT"
  | "SLOW_RESPONSE_TEMPORARY"
  | "NO_IMPROVEMENT_AFTER_INTERVENTION";

export type IntelligenceSource = "RULE" | "STATISTICAL";

export type ProposalKind = "TARGETED_PRACTICE" | "ALTERNATIVE_INTERVENTION" | "TEACHER_REVIEW";

export interface DimensionRef {
  subject: string | null;
  skill: string | null;
  dimension: string | null;
}

export interface PriorInterventionRef {
  diagnosisId: string | null;
  interventionId: string | null;
  outcome: string | null;
  reassessmentId: string | null;
  occurredAt: Date | null;
  evidenceRefs: string[];
}

export interface InsightRecommendation {
  kind: ProposalKind;
  rationale: string;
  requiresTeacherApproval: true;
}

export interface IntelligenceInsight {
  id: string; // deterministic: intelligence:{tenant}:{student}:{signal}:{key}
  tenantId: string;
  studentId: string;
  dimension: DimensionRef;
  signal: IntelligenceSignalKind;
  evidenceRefs: string[];
  confidence: number;
  source: IntelligenceSource;
  occurredAt: Date;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  evidenceCount: number;
  sessionCount: number;
  explanation: string;
  priorIntervention: PriorInterventionRef | null;
  recommendation: InsightRecommendation | null;
}

export interface IntelligenceReport {
  tenantId: string;
  studentId: string;
  generatedAt: Date;
  source: "RULE" | "STATISTICAL";
  insights: IntelligenceInsight[];
}

export interface IntelligenceConfig {
  minMistakeCount: number;
  minSessionsForPattern: number;
  slowResponseSpanDays: number;
  minSlowSamples: number;
  maxEvidenceRows: number;
  minTrendSamples: number;
}

export const DEFAULT_INTELLIGENCE_CONFIG: IntelligenceConfig = {
  minMistakeCount: 3,
  minSessionsForPattern: 2,
  slowResponseSpanDays: 21,
  minSlowSamples: 3,
  maxEvidenceRows: 1000,
  minTrendSamples: 3,
};

export interface ProposalDraft {
  kind: ProposalKind;
  tenantId: string;
  studentId: string;
  skill: string | null;
  rationale: string;
  evidenceRefs: string[];
  suggestedBy: "learning-intelligence";
  requiresTeacherApproval: true;
}
