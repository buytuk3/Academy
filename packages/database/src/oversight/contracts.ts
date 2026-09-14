/**
 * CORE-20 — National Educational Oversight + Aggregation + Student Educational
 * Access Foundation. Contracts (20-C/20-G/20-H/20-U/20-AC/20-AD).
 *
 * Three INDEPENDENT authorization dimensions (20-H) — never mixed:
 *   Role        — open vocabulary (reuses existing auth roles)
 *   Scope       — composable: TENANT|ORGANIZATION(MINISTRY/GOVERNORATE/DIRECTORATE)|SCHOOL|STAGE|GRADE|CLASS|SUBJECT
 *   Sensitivity — AGGREGATE|SUMMARY|DIMENSIONS|INDIVIDUAL|AUDIO
 * Final authorization = Role + Scope + Data Sensitivity + Educational Policy.
 *
 * 20-B/20-I: individual student detail is SCHOOL-scope-only by default.
 * Ministry/Governorate/Directorate oversight = AGGREGATE by default —
 * NO student names, NO audio, NO individual profiles.
 * 20-T: religion data NEVER appears in logs/aggregates/audit rows.
 *
 * Ownership: core-platform ("educational-aggregation" / "educational-access-policy").
 * No AI (20-AU) — every decision is deterministic and config-driven.
 */

/** 20-H sensitivity ladder. AUDIO is deniable-only at this layer. */
export const SENSITIVITY_LEVELS = ["AGGREGATE", "SUMMARY", "DIMENSIONS", "INDIVIDUAL", "AUDIO"] as const;
export type SensitivityLevel = (typeof SENSITIVITY_LEVELS)[number];

/** 20-G: composable oversight scope types (superset view; CORE-19 anchors the staff row). */
export const OVERSIGHT_SCOPE_TYPES = ["TENANT", "ORGANIZATION", "SCHOOL", "STAGE", "GRADE", "CLASS", "SUBJECT"] as const;
export type OversightScopeType = (typeof OVERSIGHT_SCOPE_TYPES)[number];

/**
 * 20-AA: minimum group size below which an aggregate is suppressed
 * (INSUFFICIENT_EVIDENCE) so a small group can never expose an individual.
 * PLACEHOLDER default — configuration-driven per deployment; NOT a legal
 * standard until validated (risk R-011).
 */
export const DEFAULT_MIN_AGGREGATION_SIZE = 5;

/** Deterministic confidence banding — placeholder thresholds, config-driven (R-011). */
export const DEFAULT_MIN_SAMPLES_HIGH = 30;
export const DEFAULT_MIN_SAMPLES_MEDIUM = 10;

export type ConfidenceBand = "low" | "medium" | "high";
export type TrendDirection = "UP" | "DOWN" | "FLAT";

/** 20-I/20-J/20-K: the group being aggregated (never a single student). */
export interface AggregateGroupKey {
  schoolId?: string;
  stageKey?: string;
  gradeLevel?: string;
  subject?: string;
}

export interface AggregateRequest {
  tenantId: string;
  /** Requester (oversight or school staff) — resolved via staff memberships. */
  userId: string;
  actorId?: string;
  /** Request scope anchor. */
  organizationId?: string;
  schoolId?: string;
  classId?: string;
  /** 20-AH: stage/grade narrow the aggregation — reports never mix stages. */
  stageKey?: string;
  gradeLevel?: string;
  subject?: string;
  /** Optional dimension narrow (metadata->>'dimension' convention). */
  dimensionKey?: string;
  evidenceType?: string;
  /** 20-AD: current measurement window; previous = equal length before `from`. */
  timePeriod: { from: string; to: string };
  /** 20-AB: curriculum context carried on the request (CORE-13 references). */
  curriculumVersion?: string;
  curriculumId?: string;
  /** 20-AA: config-driven privacy threshold. */
  minimumAggregationSize?: number;
  minSamplesHigh?: number;
  minSamplesMedium?: number;
}

export interface AggregateMetric {
  schoolId: string | null;
  stageKey: string | null;
  gradeLevel: string | null;
  subject: string | null;
  evidenceType: string;
  /** Mean measurement (0..1 confidence convention; dimension value when narrowed). */
  mean: number | null;
  sampleSize: number; // attempts in window
  assessedStudents: number; // distinct students with evidence
  studentsInScope: number; // students inside the scope for this group
  assessmentCoverage: number; // assessedStudents / studentsInScope (0..1)
  confidence: ConfidenceBand;
  /** 20-E: suppressed small groups expose nothing. */
  status: "OK" | "INSUFFICIENT_EVIDENCE";
  /** 20-AD: current vs previous equal-length window. */
  trend: { current: number | null; previous: number | null; direction: TrendDirection } | null;
  timePeriod: { from: string; to: string };
}

export interface AggregateResult {
  scope: AggregateRequest;
  groups: AggregateMetric[]; // [] when requester scope covers nothing
}

/** 20-U: content descriptor (educational taxonomy — CORE-13 references). */
export interface EducationalContentRef {
  subject: string;
  contentType?: string; // e.g. "lesson" | "activity" | "reading" | "grammar"
  /** Content-side religious classification — content taxonomy, NOT student data. */
  religiousContext?: string | null; // "ISLAMIC" | "CHRISTIAN" | other | null
  country?: string;
  educationSystem?: string;
  stageKey?: string;
  gradeKey?: string;
  curriculumId?: string;
  language?: string;
}

/** Policy decision (deterministic; audited WITHOUT religion values — 20-T). */
export interface ContentAccessDecision {
  decision: "ALLOW" | "DENY";
  reason: string; // PATHWAY_ACCESS | NON_RELIGIOUS_CONTENT | CROSS_ACCESS_POLICY_ALLOW | CROSS_ACCESS_POLICY_DENY | CROSS_ACCESS_DEFAULT_DENY
}

/** 20-N/20-O: unified login context validation (claims verified vs membership). */
export interface StudentLoginContextInput {
  tenantId: string;
  identityId: string; // from the authenticated session — NEVER a name
  claimed?: {
    schoolId?: string;
    classId?: string;
    stageKey?: string;
    gradeLevel?: string;
  };
}

export interface StudentLoginContextResult {
  allowed: true;
  studentId: string;
  classId: string;
  schoolId: string;
  stageKey: string | null;
  gradeLevel: string | null;
  organizationId: string | null;
}
