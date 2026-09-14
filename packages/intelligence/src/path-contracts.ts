/**
 * CORE-12 - Learning Path contracts (Core Platform, packages/intelligence).
 *
 * A Learning Path is DYNAMIC and evidence-derived: Current Evidence + Learner
 * Model + Learning Intelligence + Student Patterns + Teacher Decisions +
 * Intervention Outcomes + Curriculum Context -> PATH PROPOSAL (never auto
 * delivery). Every proposal carries the fields needed to explain the decision
 * and requires teacher approval through the canonical @workspace/decisions
 * boundary. No overall score; curriculum-ready (country/language/grade/...)
 * but no curriculum engine (CORE-13 owns that).
 */
import type { CurriculumContext } from "./pattern-contracts.js";

export type PathSource = "RULE" | "STATISTICAL" | "ML" | "AI" | "TEACHER";

export type PathActivityType =
  | "targeted-practice"
  | "teacher-review"
  | "alternative-intervention"
  | "baseline-assessment"
  | "reinforcement";

export interface LearningPathProposal {
  proposalId: string;
  tenantId: string;
  studentId: string;
  reason: string;
  evidenceRefs: string[];
  currentSkill: string;
  currentDimension: string;
  targetSkill: string;
  targetDimension: string;
  proposedActivityType: PathActivityType;
  expectedOutcome: string;
  reassessmentCriteria: string;
  confidence: number;
  source: PathSource;
  requiresTeacherApproval: true;
  curriculumContext: CurriculumContext;
}

export type OutcomeKind = "IMPROVED" | "NO_CHANGE" | "DECLINED" | "INSUFFICIENT_EVIDENCE";

export interface PathUpdate {
  proposalId: string;
  outcome: OutcomeKind;
  nextAction: "proceed_to_reinforcement" | "propose_alternative" | "escalate_to_teacher_review" | "collect_more_evidence";
  note: string;
}
