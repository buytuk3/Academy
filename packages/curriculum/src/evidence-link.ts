/**
 * Evidence / Learner Model / Pattern / Path binding contracts (CORE-13G/H).
 * Reference-only: these helpers produce the EXACT fields that attach to
 * Evidence and to CORE-12 path proposals WITHOUT duplicating curriculum
 * text, books, or skills. Evidence ownership stays "core platform";
 * the curriculum package only supplies references.
 */
import type { SkillKey, DimensionKey } from "./contracts.js";
import type { CurriculumContext } from "./contracts.js";

/** Reference payload attachable to an Evidence row (no migration required). */
export interface EvidenceCurriculumLink {
  /** `${curriculumId}@${version}` — binds evidence to the curriculum version in force */
  readonly curriculumRef: string;
  readonly country: string;
  readonly language: string;
  readonly educationStage: string;
  readonly grade: string;
  readonly gradeKey: string;
  readonly subject: string;
  readonly bookId?: string;
  readonly unitId?: string;
  readonly lessonId?: string;
  readonly objectiveId?: string;
  readonly skills: readonly SkillKey[];
  readonly dimensions: readonly DimensionKey[];
}

export function curriculumEvidenceLink(context: CurriculumContext): EvidenceCurriculumLink {
  return {
    curriculumRef: `${context.curriculum.curriculumId}@${context.curriculum.version}`,
    country: context.country,
    language: context.language,
    educationStage: context.educationStage,
    grade: context.grade,
    gradeKey: context.gradeKey,
    subject: context.subject,
    bookId: context.book?.bookId,
    unitId: context.unit?.unitId,
    lessonId: context.lesson?.lessonId,
    objectiveId: context.objective?.objectiveId,
    skills: context.skills,
    dimensions: context.dimensions,
  };
}

/** Stable linkage key — the fingerprint used to group evidence by curriculum location. */
export function linkageKey(link: EvidenceCurriculumLink): string {
  return `${link.country}|${link.gradeKey}|${link.subject}|${link.curriculumRef}`;
}

export interface PathCurrentAnchor {
  readonly grade: string;
  readonly gradeKey: string;
  readonly subject: string;
  readonly unitId?: string;
  readonly lessonId?: string;
  readonly objectiveId?: string;
}

export interface PathTargetAnchor {
  readonly skill: SkillKey;
  readonly dimension: DimensionKey;
  readonly proposedActivityType: string;
  readonly expectedOutcome?: string;
  readonly reassessmentCriteria?: string;
}

/**
 * The Curriculum-aware view of a CORE-12 Learning Path Proposal:
 * current = curriculum location, target = skill/dimension/activity.
 * Never auto-delivered — the consumer contract keeps requiresTeacherApproval.
 */
export interface LearningPathAnchors {
  readonly current: PathCurrentAnchor;
  readonly target: PathTargetAnchor;
  readonly evidenceLinkRef: string;
  readonly requiresTeacherApproval: true;
}

export function learningPathAnchors(
  context: CurriculumContext,
  target: PathTargetAnchor,
): LearningPathAnchors {
  return {
    current: {
      grade: context.grade,
      gradeKey: context.gradeKey,
      subject: context.subject,
      unitId: context.unit?.unitId,
      lessonId: context.lesson?.lessonId,
      objectiveId: context.objective?.objectiveId,
    },
    target,
    evidenceLinkRef: linkageKey(curriculumEvidenceLink(context)),
    requiresTeacherApproval: true,
  };
}
