/**
 * CORE-16 Assessment / Student Readiness Foundation — contracts.
 * Owner: assessment-engine.
 * Assessment != Readiness != Mastery != Diagnosis != Intelligence != Intervention.
 * Assessment-scoped rubric totals ARE allowed (this assessment, this rubric);
 * GLOBAL student scores are FORBIDDEN (no overall scores, no student levels, no global scores).
 * Zero persistence; measurements flow to Evidence via the canonical writer.
 */
import type { CurriculumContext } from "@workspace/curriculum";

export type AssessmentKind =
  | "diagnostic"
  | "formative"
  | "summative"
  | "baseline"
  | "readiness"
  | "progress"
  | "reassessment";

export const ASSESSMENT_KINDS: readonly AssessmentKind[] = [
  "diagnostic",
  "formative",
  "summative",
  "baseline",
  "readiness",
  "progress",
  "reassessment",
];

export type ScoringMode = "exact" | "numeric";

export interface AssessmentItemRef {
  readonly itemRef: string;
  readonly promptRef?: string;
  readonly expectedAnswer: string;
  readonly scoring: ScoringMode;
  readonly weight: number;
  readonly dimension?: string;
}

export interface AssessmentTargets {
  readonly objectiveIds?: readonly string[];
  readonly skills?: readonly string[];
  readonly dimensions?: readonly string[];
}

/** Assessment DEFINITION: what the assessment IS (not what a student did). */
export interface AssessmentDefinition {
  readonly definitionId: string;
  readonly title: string;
  readonly kind: AssessmentKind;
  readonly subject: string;
  readonly targets: AssessmentTargets;
  readonly items: readonly AssessmentItemRef[];
  readonly dimensions: readonly string[];
  readonly passThreshold: number;
  readonly timeLimitMs?: number;
  readonly maxAttempts?: number;
  readonly curriculum?: CurriculumContext; // reference only
}

/** Longitudinal continuity: references to a prior grade/curriculum/school context. */
export interface PriorContextRef {
  readonly tenantId?: string;
  readonly gradeKey?: string;
  readonly curriculumId?: string;
  readonly schoolId?: string;
}

/** Assessment ATTEMPT: what the student did in THIS attempt (time evidence included). */
export interface AssessmentAttemptContext {
  readonly attemptId: string;
  readonly tenantId: string;
  readonly studentId: string;
  readonly activityId?: string;
  readonly sessionId?: string;
  readonly actorId?: string;
  readonly actorRole?: string;
  readonly occurredAt: string;
  readonly startedAt: string;
  readonly submittedAt: string;
  readonly durationMs?: number;
  readonly thinkingTimeMs?: number;
  readonly responseDurationMs?: number;
  readonly attemptCount?: number;
  readonly curriculum?: CurriculumContext; // reference only
  readonly previousEvidenceRefs?: readonly string[]; // references ONLY — history is never cleared
  readonly priorContext?: PriorContextRef;
}

export interface AssessmentItemResponse {
  readonly itemRef: string;
  readonly response: string;
}

/** Assessment RESPONSE: raw student answers. */
export interface AssessmentResponse {
  readonly items: readonly AssessmentItemResponse[];
}

export interface DimensionMeasurement {
  readonly dimension: string;
  readonly score: number;
  readonly itemCount: number;
  readonly correctCount: number;
}

export interface ItemResult {
  readonly itemRef: string;
  readonly correct: boolean;
  readonly score: number;
  readonly dimension: string;
}

/** Assessment MEASUREMENT: what was measured (multidimensional, no global score). */
export interface AssessmentMeasurements {
  readonly definitionId: string;
  readonly attemptId: string;
  readonly rubricScore: number; // assessment-scoped ONLY — this assessment, this rubric
  readonly scoreScope: "assessment";
  readonly itemResults: readonly ItemResult[];
  readonly dimensionMeasurements: readonly DimensionMeasurement[];
  readonly totalItems: number;
  readonly correctItems: number;
  readonly completionRate: number;
  readonly consistency: number;
  readonly responseTimeMs?: number;
  readonly thinkingTimeMs?: number;
  readonly durationMs?: number;
  readonly attemptCount: number;
}

export type ReadinessState = "READY" | "NOT_READY" | "INSUFFICIENT_EVIDENCE" | "REQUIRES_TEACHER_REVIEW";

export interface ReadinessPrerequisiteRef {
  readonly skill: string;
  readonly evidenceRef: string;
}

export interface RequiredEvidencePolicy {
  readonly minEvidenceCount: number;
  readonly minConsistency?: number;
  readonly recentWindowDays?: number;
  readonly maxResponseTimeMs?: number;
}

export interface ReadinessInputs {
  readonly assessment: AssessmentMeasurements;
  readonly prerequisites: readonly ReadinessPrerequisiteRef[];
  readonly requiredEvidence: RequiredEvidencePolicy;
  readonly availableEvidenceRefs: readonly string[];
  readonly passThreshold?: number;
  readonly teacherReviewBuffer?: number;
  readonly priorContext?: PriorContextRef;
}

/** READINESS is advisory only — it never forces a path, never delivers. */
export interface ReadinessResult {
  readonly state: ReadinessState;
  readonly reasoning: readonly string[];
  readonly evidenceRefs: readonly string[]; // references only
  readonly priorContext?: PriorContextRef;
}
