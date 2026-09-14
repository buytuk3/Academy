/**
 * CORE-16 — Assessment evaluation orchestration:
 * Response -> Measurement (deterministic, rubric-policy driven).
 * No teaching, no diagnosis, no decisions, no delivery.
 */
import { scoreAssessment } from "./rubric.js";
import { assertAssessmentContext } from "./context.js";
import type {
  AssessmentAttemptContext,
  AssessmentDefinition,
  AssessmentMeasurements,
  AssessmentResponse,
} from "./contracts.js";

export function evaluateAssessment(
  definition: AssessmentDefinition,
  response: AssessmentResponse,
  attempt: AssessmentAttemptContext,
): AssessmentMeasurements {
  assertAssessmentContext(attempt.tenantId, attempt.studentId);
  const base = scoreAssessment(definition, response.items);
  return {
    ...base,
    definitionId: definition.definitionId,
    attemptId: attempt.attemptId,
    responseTimeMs: attempt.responseDurationMs,
    thinkingTimeMs: attempt.thinkingTimeMs,
    durationMs: attempt.durationMs,
    attemptCount: attempt.attemptCount ?? 1,
  };
}
