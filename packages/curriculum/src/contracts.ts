/**
 * packages/curriculum — Curriculum Foundation (CORE-13).
 * OWNER: Curriculum Foundation. Persistence: NONE in CORE-13.
 * This package defines the canonical hierarchy, identity, versioning and
 * context contracts. It is fully self-contained (no workspace runtime imports)
 * and is never imported by engines. Country/locale/curriculum data is CONFIGURATION
 * (config-fixtures.ts), never business logic.
 */
/* ------------------------------------------------------------------ */
/* Identity                                                           */
/* Subject ≠ Skill ≠ Dimension ≠ Objective (CORE-13E)                 */
/* ------------------------------------------------------------------ */

/** Structural string aliases owned by core — same convention as packages/database learner types. */
export type SubjectKey = string; // e.g. "mathematics"
export type SkillKey = string; // e.g. "fraction-comparison"
export type DimensionKey = string; // e.g. "conceptual-understanding"

export type EducationStageKey = string; // config data: "primary", "elementary", "key-stage-2", ...
export type GradeKey = string; // stable grade key, e.g. "EG-PR-04"

/* ------------------------------------------------------------------ */
/* Hierarchy (CORE-13B) — global by architecture, local by config     */
/* ------------------------------------------------------------------ */

export const HIERARCHY_LEVELS = [
  "country",
  "educationSystem",
  "educationStage",
  "grade",
  "subject",
  "curriculum",
  "book",
  "unit",
  "lesson",
  "objective",
  "skill",
  "activity",
] as const;

export type HierarchyLevel = (typeof HIERARCHY_LEVELS)[number];

export interface HierarchyState {
  readonly level: HierarchyLevel;
  readonly id: string;
}

export type HierarchyIssueCode =
  | "UNKNOWN_LEVEL"
  | "EMPTY_ID"
  | "ORDER_VIOLATION"
  | "REQUIRED_LEVEL_MISSING";

export interface HierarchyIssue {
  readonly code: HierarchyIssueCode;
  readonly message: string;
}

export type HierarchyNormalization =
  | { readonly ok: true; readonly levels: readonly HierarchyLevel[] }
  | { readonly ok: false; readonly issues: readonly HierarchyIssue[] };

/* ------------------------------------------------------------------ */
/* Versioning (CORE-13K) — curricula may coexist across years          */
/* ------------------------------------------------------------------ */

export type CurriculumStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED";

export interface CurriculumVersionRef {
  /** stable identity across years, e.g. "eg-math-primary" */
  readonly curriculumId: string;
  readonly curriculumName: string;
  /** e.g. "2026" */
  readonly version: string;
  /** ISO date, inclusive start */
  readonly effectiveFrom: string;
  /** ISO date, exclusive end; undefined = current */
  readonly effectiveTo?: string;
  readonly status: CurriculumStatus;
}

/* ------------------------------------------------------------------ */
/* Node refs — reference-only, NO content duplication (CORE-13G)       */
/* ------------------------------------------------------------------ */

export interface CurriculumBookRef {
  readonly bookId: string;
  readonly bookTitle: string;
}

export interface CurriculumUnitRef {
  readonly unitId: string;
  readonly unitTitle: string;
}

export interface CurriculumLessonRef {
  readonly lessonId: string;
  readonly lessonTitle: string;
}

export interface CurriculumObjectiveRef {
  readonly objectiveId: string;
  readonly objectiveText: string;
  /** many-to-many: an objective trains ≥1 skill */
  readonly skills: readonly SkillKey[];
  /** many-to-many: a skill may exercise ≥1 dimension */
  readonly dimensions: readonly DimensionKey[];
}

/* ------------------------------------------------------------------ */
/* CurriculumContext (CORE-13F) — the unified platform contract        */
/* ------------------------------------------------------------------ */

export interface CurriculumContext {
  /** tenant isolation anchor (CORE-13T) */
  readonly tenantId: string;
  /** configuration data, never business logic */
  readonly country: string;
  readonly language: string;
  readonly educationSystem: string;
  readonly educationStage: string;
  readonly grade: string; // pedagogical label, e.g. "4"
  readonly gradeKey: string; // stable key, e.g. "EG-PR-04"
  readonly subject: SubjectKey;
  readonly curriculum: CurriculumVersionRef;
  readonly book?: CurriculumBookRef;
  readonly unit?: CurriculumUnitRef;
  readonly lesson?: CurriculumLessonRef;
  readonly objective?: CurriculumObjectiveRef;
  /** flattened anchor skills/dimensions resolved from the objective */
  readonly skills: readonly SkillKey[];
  readonly dimensions: readonly DimensionKey[];
}

/* ------------------------------------------------------------------ */
/* Separation (CORE-13A) — Curriculum ≠ Content ≠ Activity ≠          */
/* Assessment. Distinct owner contracts, cross-referenced by id only.  */
/* ------------------------------------------------------------------ */

/** Curriculum: WHAT must the student learn (owned by Curriculum Foundation). */
export interface CurriculumDescriptor {
  readonly kind: "CURRICULUM";
  readonly context: CurriculumContext;
  /** objective ids only — never a copy of lesson text */
  readonly objectiveIds: readonly string[];
}

/** Content: text/audio/image/question material (owned by Content Engine). */
export interface ContentDescriptor {
  readonly kind: "CONTENT";
  readonly contentRef: string;
  readonly mediaTypes: readonly string[];
  /** optional binding back into the curriculum, by ref only */
  readonly curriculumRef?: string;
}

/** Activity: WHAT the student does now (owned by Activity layer). */
export interface ActivityDescriptor {
  readonly kind: "ACTIVITY";
  readonly activityType: string;
  readonly contentRef?: string;
  readonly skill?: SkillKey;
  readonly dimension?: DimensionKey;
  readonly objectiveId?: string;
}

/** Assessment: HOW we measure what was learned (owned by Assessment Engine). */
export interface AssessmentDescriptor {
  readonly kind: "ASSESSMENT";
  readonly assessmentRef: string;
  readonly objectiveRefs: readonly string[];
  readonly skill?: SkillKey;
  readonly dimension?: DimensionKey;
}

/* ------------------------------------------------------------------ */
/* Errors (CORE-13T tenant + context guards)                           */
/* ------------------------------------------------------------------ */

export type CurriculumErrorCode =
  | "TENANT_CONTEXT_MISSING"
  | "INVALID_TENANT_ID"
  | "STUDENT_CONTEXT_MISSING"
  | "CURRICULUM_NOT_FOUND"
  | "VERSION_NOT_FOUND"
  | "VERSION_NOT_ACTIVE"
  | "BOOK_NOT_FOUND"
  | "UNIT_NOT_FOUND"
  | "LESSON_NOT_FOUND"
  | "OBJECTIVE_NOT_FOUND";

export class CurriculumError extends Error {
  readonly code: CurriculumErrorCode;
  constructor(code: CurriculumErrorCode, message: string) {
    super(message);
    this.name = "CurriculumError";
    this.code = code;
  }
}
