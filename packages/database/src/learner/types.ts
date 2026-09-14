/**
 * CORE-09 - Multidimensional Learner Model: public types (Core Platform).
 *
 * The learner is NEVER a single score. It is a set of evidence-backed
 * dimensions, each with a current interpretation, a historical trend and a
 * deterministic confidence. Subject, Skill, Dimension and EvidenceType are
 * DISTINCT concepts and stay distinct types:
 *   Subject  - e.g. "reading", "mathematics"   (curriculum area)
 *   Skill    - e.g. "reading.accuracy"         (skill inside a subject)
 *   Dimension- e.g. "accuracy", "fluency"      (measured axis)
 *   EvidenceType - one of the 8 canonical kinds (schema/evidence.ts)
 *
 * Insufficient evidence is a first-class value, never a default score.
 * No overall score exists anywhere in this model.
 */
export type SubjectKey = string;
export type SkillKey = string;
export type DimensionKey = string;

export type DimensionLevel =
  | "strong"
  | "improving"
  | "developing"
  | "weak"
  | "declining"
  | "insufficient"
  | "fast"
  | "slow";

export type Trend = "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_EVIDENCE";

export type InterpretationSource = "RULE" | "STATISTICAL" | "MODEL" | "AI" | "TEACHER";

export interface DimensionSample {
  evidenceId: string;
  occurredAt: Date;
  value: number;
  normalized: number;
}

export interface DimensionInterpretation {
  subject: string;
  skill: string;
  dimension: string;
  level: DimensionLevel;
  trend: Trend;
  interpretationSource: InterpretationSource;
  confidence: number;
  evidenceRefs: string[];
  sampleCount: number;
  recentMean: number | null;
  olderMean: number | null;
  from: Date | null;
  to: Date | null;
  reason: string;
}

export interface ExternalInterpretation {
  subject: string | null;
  skill: string | null;
  dimension: string | null;
  source: InterpretationSource;
  evidenceId: string;
  occurredAt: Date;
  claimedLevel: string | null;
  value: number | null;
  confidence: number | null;
  note: string | null;
}

export interface LearnerSubject {
  subject: string;
  skills: string[];
  dimensions: DimensionInterpretation[];
}

export interface LearnerContextSegment {
  grade: string | null;
  curriculumBook: string | null;
  from: Date;
  to: Date;
  evidenceCount: number;
}

export interface LearnerModel {
  tenantId: string;
  studentId: string;
  builtAt: Date;
  interpretationSource: "RULE";
  contexts: LearnerContextSegment[];
  subjects: LearnerSubject[];
  dimensions: DimensionInterpretation[];
  teacherInterpretations: ExternalInterpretation[];
  aiInterpretations: ExternalInterpretation[];
}
