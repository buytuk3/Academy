/**
 * CORE-16 — Deterministic Student Readiness evaluation.
 * READY / NOT_READY / INSUFFICIENT_EVIDENCE / REQUIRES_TEACHER_REVIEW.
 * Advisory ONLY: it never forces a path, never changes curriculum,
 * never delivers. Learning Intelligence / Teacher interpret it later.
 */
import type { ReadinessInputs, ReadinessResult } from "./contracts.js";

export function evaluateReadiness(inputs: ReadinessInputs): ReadinessResult {
  const refs = inputs.availableEvidenceRefs;
  const reasoning: string[] = [];

  if (refs.length < inputs.requiredEvidence.minEvidenceCount) {
    return {
      state: "INSUFFICIENT_EVIDENCE",
      reasoning: [`evidence-count:${refs.length}<${inputs.requiredEvidence.minEvidenceCount}`],
      evidenceRefs: refs,
      priorContext: inputs.priorContext,
    };
  }
  const missing = inputs.prerequisites.filter((p) => !refs.includes(p.evidenceRef));
  if (missing.length > 0) {
    return {
      state: "INSUFFICIENT_EVIDENCE",
      reasoning: [`missing-prerequisite-evidence:${missing.map((m) => m.skill).join(",")}`],
      evidenceRefs: refs,
      priorContext: inputs.priorContext,
    };
  }
  const maxTime = inputs.requiredEvidence.maxResponseTimeMs;
  if (maxTime !== undefined && inputs.assessment.responseTimeMs !== undefined && inputs.assessment.responseTimeMs > maxTime) {
    return {
      state: "NOT_READY",
      reasoning: [`response-time:${inputs.assessment.responseTimeMs}>${maxTime}`],
      evidenceRefs: refs,
      priorContext: inputs.priorContext,
    };
  }

  const threshold = inputs.passThreshold ?? 0.8;
  const buffer = inputs.teacherReviewBuffer ?? 0.1;
  const minConsistency = inputs.requiredEvidence.minConsistency ?? 0.6;
  const score = inputs.assessment.rubricScore;

  if (score >= threshold && inputs.assessment.consistency >= minConsistency) {
    return {
      state: "READY",
      reasoning: [`rubric-score:${score}>=${threshold}`, `consistency:${inputs.assessment.consistency}>=${minConsistency}`],
      evidenceRefs: refs,
      priorContext: inputs.priorContext,
    };
  }
  if (score >= threshold - buffer) {
    return {
      state: "REQUIRES_TEACHER_REVIEW",
      reasoning: [`rubric-score:${score} within buffer ${buffer} of ${threshold}`],
      evidenceRefs: refs,
      priorContext: inputs.priorContext,
    };
  }
  return {
    state: "NOT_READY",
    reasoning: [`rubric-score:${score}<${threshold}`],
    evidenceRefs: refs,
    priorContext: inputs.priorContext,
  };
}
