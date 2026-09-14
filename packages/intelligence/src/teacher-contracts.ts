/**
 * CORE-11 - Teacher Intelligence contracts (Core Platform, packages/intelligence).
 *
 * Read-only layer over Evidence + Learner Model + Learning Loop + Outcomes +
 * Teacher Decisions. Explicit separation of shapes: StudentSummary vs Insight
 * vs Recommendation vs InterventionHistory vs ReviewItem (TI-01..TI-06).
 * Subject / Skill / Dimension stay distinct (CORE-09 rule). No overall student
 * score exists anywhere; priority is PER-INSIGHT, never per-student.
 */
import type { IntelligenceInsight } from "./contracts.js";

export interface TeacherDimensionSummary {
  subject: string;
  skill: string;
  dimension: string;
  level: string;
  trend: string;
  confidence: number;
  evidenceRefs: string[];
  sampleCount: number;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
}

export interface TeacherOutcomeBrief {
  outcome: string | null;
  interventionId: string | null;
  diagnosisId: string | null;
  reassessmentId: string | null;
  skill: string | null;
  occurredAt: Date | null;
  evidenceRefs: string[];
}

export interface TeacherStudentSummary {
  tenantId: string;
  studentId: string;
  generatedAt: Date;
  strengths: TeacherDimensionSummary[];
  attentionAreas: TeacherDimensionSummary[];
  timeWindow: { firstSeenAt: Date | null; lastSeenAt: Date | null; spanDays: number };
  evidenceCount: number;
  dimensionCount: number;
  lastIntervention: TeacherOutcomeBrief | null;
  lastOutcome: TeacherOutcomeBrief | null;
  needsTeacherDecisionCount: number;
}

export interface PriorityInsight {
  insight: IntelligenceInsight;
  priorityScore: number;
  priorityRank: number;
  priorityRationale: string;
}

export interface TeacherRecommendation {
  reason: string;
  evidenceRefs: string[];
  confidence: number;
  affectedDimension: { subject: string | null; skill: string | null; dimension: string | null };
  proposedAction: string;
  requiresTeacherApproval: true;
}

export interface InterventionChain {
  problem: string | null;
  diagnosisId: string | null;
  interventionId: string | null;
  teacherDecision: string | null;
  reassessmentId: string | null;
  outcome: string | null;
  skill: string | null;
  occurredAt: Date | null;
  evidenceRefs: string[];
}

export type TeacherReviewKind =
  | "PERSISTENT_PATTERN"
  | "NO_IMPROVEMENT"
  | "DECLINE"
  | "INSUFFICIENT_EVIDENCE_JUDGEMENT"
  | "RECURRING_AFTER_IMPROVEMENT"
  | "NEW_ISSUE";

export interface TeacherReviewItem {
  kind: TeacherReviewKind;
  insightId: string;
  issue: string;
  rationale: string;
  evidenceRefs: string[];
  priorityScore: number;
  suggestedAction: string;
  requiresTeacherApproval: true;
}

export type TeacherFeedbackDecision = "APPROVED" | "MODIFIED" | "REJECTED" | "CONFIRMED";

export interface TeacherFeedbackInput {
  tenantId: string;
  studentId: string;
  actorId: string;
  actorRole: string;
  proposalId: string;
  decision: TeacherFeedbackDecision;
  note?: string;
  modifications?: Record<string, unknown>;
}
