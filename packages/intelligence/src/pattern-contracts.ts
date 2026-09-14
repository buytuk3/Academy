/**
 * CORE-12 - Student Pattern contracts (Core Platform, packages/intelligence).
 *
 * Multidimensional, evidence-backed pattern model over Learner Model +
 * Evidence. StudentPattern is an OBSERVATION derived by deterministic rules -
 * never a diagnosis (no medical/psychological claims; sensitive indicators
 * surface as teacher-review items only). Subject != Skill != Dimension !=
 * EvidenceType (CORE-09 rule). No overall score exists anywhere.
 *
 * Source abstraction is future-ready: RULE (used now) / STATISTICAL / ML / AI /
 * TEACHER. CORE-12 implements deterministic rules only.
 */
export type PatternSource = "RULE" | "STATISTICAL" | "ML" | "AI" | "TEACHER";

export type PatternType =
  | "PERFORMANCE_PATTERN"
  | "SPEED_PATTERN"
  | "PERSISTENCE_PATTERN"
  | "IMPROVEMENT_PATTERN"
  | "REGRESSION_PATTERN"
  | "INSUFFICIENT_EVIDENCE_PATTERN";

export type PatternPersistence = "PERSISTENT" | "TEMPORARY" | "N/A";

export type PatternStatus = "active" | "temporary" | "insufficient";

export interface CurriculumContext {
  country?: string | null;
  language?: string | null;
  educationStage?: string | null;
  grade?: string | null;
  curriculum?: string | null;
  book?: string | null;
  unit?: string | null;
  lesson?: string | null;
  objective?: string | null;
}

export interface StudentPattern {
  patternId: string;
  tenantId: string;
  studentId: string;
  subject: string;
  skill: string;
  dimension: string;
  patternType: PatternType;
  persistence: PatternPersistence;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  evidenceRefs: string[];
  evidenceCount: number;
  sessionCount: number;
  spanDays: number;
  confidence: number;
  detectionRule: string;
  explanation: string;
  source: PatternSource;
  status: PatternStatus;
  curriculumContext: CurriculumContext;
}

export interface PatternConfig {
  minConfidence: number;
  minSamples: number;
  trendSamples: number;
  slowSpanDays: number;
  minMistakeCount: number;
  minMistakeSessions: number;
}

export const DEFAULT_PATTERN_CONFIG: PatternConfig = {
  minConfidence: 0.55,
  minSamples: 3,
  trendSamples: 3,
  slowSpanDays: 21,
  minMistakeCount: 3,
  minMistakeSessions: 2,
};
