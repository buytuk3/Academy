/**
 * CORE-12 - Learning Path proposal builder (deterministic; owner
 * packages/intelligence). Pure function over StudentPatterns + intervention
 * history. Proposals are NEVER delivered autonomously: every one carries
 * requiresTeacherApproval=true and the canonical decision boundary
 * (@workspace/decisions, re-exported via teacher-boundary.js) is the only way
 * to authorize delivery. No writes, no new tables, no migrations.
 */
import {
  DEFAULT_PATTERN_CONFIG,
  type CurriculumContext,
  type StudentPattern,
} from "./pattern-contracts.js";
import type { InterventionHistoryEntry } from "./history.js";
import { patternPriority } from "./student-pattern.js";
import type { LearningPathProposal, OutcomeKind, PathUpdate } from "./path-contracts.js";

export interface BuildPathArgs {
  tenantId: string;
  studentId: string;
  history?: InterventionHistoryEntry[];
  curriculumContext?: CurriculumContext;
  maxProposals?: number;
}

function activityFor(pattern: StudentPattern, history: InterventionHistoryEntry[]): {
  type: LearningPathProposal["proposedActivityType"];
  expected: string;
  criteria: string;
  reason: string;
} {
  const skill = pattern.skill;
  const recent = history.filter((h) => h.skill === skill);
  const priorBad = recent.some((h) => h.outcome === "NO_CHANGE" || h.outcome === "DECLINED");
  if (pattern.patternType === "REGRESSION_PATTERN") {
    return {
      type: "teacher-review",
      expected: "stabilize " + pattern.dimension + " on " + skill,
      criteria: "post-review reassessment on " + skill + ":" + pattern.dimension,
      reason: "declining " + pattern.dimension + " on " + skill + " - teacher review required before any action",
    };
  }
  if (pattern.patternType === "PERSISTENCE_PATTERN") {
    if (pattern.persistence !== "PERSISTENT") {
      return {
        type: "teacher-review", expected: "monitor", criteria: "continue monitoring; reassess if pattern persists",
        reason: "temporary pattern - no action yet, teacher may monitor",
      };
    }
    if (priorBad) {
      return {
        type: "alternative-intervention",
        expected: "break the persistent mistake loop on " + skill,
        criteria: "reassessment on " + skill + ":" + pattern.dimension + " after alternative intervention",
        reason: "persistent mistakes on " + skill + " and a prior intervention did not improve the outcome - do not repeat it blindly",
      };
    }
    return {
      type: "targeted-practice",
      expected: "reduce persistent mistakes on " + skill,
      criteria: "reassessment on " + skill + ":" + pattern.dimension + " after targeted practice",
      reason: "persistent mistake pattern (" + pattern.evidenceCount + "x across " + pattern.sessionCount + " sessions) - targeted practice for teacher review",
    };
  }
  if (pattern.patternType === "PERFORMANCE_PATTERN") {
    if (pattern.explanation.includes("weak") || pattern.explanation.includes("declining")) {
      return {
        type: "targeted-practice",
        expected: "improve " + pattern.dimension + " on " + skill,
        criteria: "reassessment on " + skill + ":" + pattern.dimension + " after practice",
        reason: pattern.dimension + " (" + skill + ") is weak - targeted practice proposed for teacher review",
      };
    }
    return {
      type: "reinforcement",
      expected: "maintain " + pattern.dimension + " strength on " + skill,
      criteria: "periodic reassessment on " + skill + ":" + pattern.dimension,
      reason: pattern.dimension + " (" + skill + ") is a strength - reinforcement activity",
    };
  }
  if (pattern.patternType === "SPEED_PATTERN") {
    if (pattern.persistence !== "PERSISTENT") {
      return {
        type: "teacher-review", expected: "monitor", criteria: "reassess if slow responses persist",
        reason: "slow responses over a short window - temporary; teacher may monitor",
      };
    }
    return {
      type: "teacher-review",
      expected: "address persistent slow responses on " + skill,
      criteria: "reassessment on " + skill + ":response-speed after teacher-approved plan",
      reason: "response speed slow consistently over " + pattern.spanDays + " days - teacher review required",
    };
  }
  if (pattern.patternType === "INSUFFICIENT_EVIDENCE_PATTERN") {
    return {
      type: "baseline-assessment",
      expected: "establish baseline evidence for " + pattern.dimension + " on " + skill,
      criteria: "baseline assessment on " + skill + ":" + pattern.dimension,
      reason: "not enough evidence for " + pattern.dimension + " (" + skill + ") - collect baseline evidence before any judgment",
    };
  }
  return {
    type: "teacher-review", expected: "review", criteria: "teacher review on " + skill,
    reason: "pattern requires teacher attention",
  };
}

export function buildLearningPathProposals(patterns: StudentPattern[], args: BuildPathArgs): LearningPathProposal[] {
  const { tenantId, studentId } = args;
  if (!tenantId) throw new Error("TENANT_CONTEXT_MISSING");
  if (!studentId) throw new Error("STUDENT_CONTEXT_MISSING");
  const cc: CurriculumContext = args.curriculumContext ?? {};
  const history = args.history ?? [];
  const max = args.maxProposals ?? 8;
  const sorted = [...patterns].sort((a, b) => patternPriority(b) - patternPriority(a));
  const out: LearningPathProposal[] = [];
  const seen = new Set<string>();
  for (const p of sorted) {
    const key = p.skill + ":" + p.dimension;
    if (seen.has(key)) continue;
    if (p.patternType === "IMPROVEMENT_PATTERN") continue; // improving needs no proposal
    const a = activityFor(p, history);
    if (a.type === "teacher-review" && p.patternType === "PERSISTENCE_PATTERN" && p.persistence === "TEMPORARY") continue; // temporary: nothing actionable
    seen.add(key);
    out.push({
      proposalId: "path:" + tenantId + ":" + studentId + ":" + key,
      tenantId, studentId,
      reason: a.reason,
      evidenceRefs: p.evidenceRefs,
      currentSkill: p.skill,
      currentDimension: p.dimension,
      targetSkill: p.skill,
      targetDimension: p.dimension,
      proposedActivityType: a.type,
      expectedOutcome: a.expected,
      reassessmentCriteria: a.criteria,
      confidence: Math.min(p.confidence || 0.5, 0.95),
      source: "RULE",
      requiresTeacherApproval: true,
      curriculumContext: cc,
    });
    if (out.length >= max) break;
  }
  return out;
}

export function pathUpdateFromOutcome(proposal: LearningPathProposal, outcome: OutcomeKind): PathUpdate {
  const base = { proposalId: proposal.proposalId, outcome };
  if (outcome === "IMPROVED") return { ...base, nextAction: "proceed_to_reinforcement", note: "dimension improved after approved activity; move to reinforcement / next skill" };
  if (outcome === "NO_CHANGE") return { ...base, nextAction: "propose_alternative", note: "no improvement after approved activity; propose an ALTERNATIVE intervention (do not repeat blindly)" };
  if (outcome === "DECLINED") return { ...base, nextAction: "escalate_to_teacher_review", note: "dimension declined; escalate to teacher review before any further action" };
  return { ...base, nextAction: "collect_more_evidence", note: "insufficient evidence to judge; collect more evidence via reassessment" };
}

export function assertProposalRequiresApproval(p: Pick<LearningPathProposal, "requiresTeacherApproval">): void {
  if (p.requiresTeacherApproval !== true) throw new Error("TEACHER_APPROVAL_REQUIRED");
}
