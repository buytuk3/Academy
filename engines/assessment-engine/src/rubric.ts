/**
 * CORE-16 — deterministic rubric/scoring policy.
 * Exact or numeric equality per item; weighted rubric score is scoped to
 * THIS assessment only (scoreScope: "assessment"). Never a global score.
 */
import type {
  AssessmentDefinition,
  AssessmentItemResponse,
  AssessmentMeasurements,
  DimensionMeasurement,
  ItemResult,
} from "./contracts.js";

export function valueEquals(expected: string, actual: string, mode: "exact" | "numeric"): boolean {
  if (mode === "numeric") {
    const e = parseFloat(expected);
    const a = parseFloat(actual);
    if (!Number.isFinite(e) || !Number.isFinite(a)) return expected.trim() === actual.trim();
    return Math.abs(e - a) < 1e-9;
  }
  return expected.trim() === actual.trim();
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function scoreAssessment(
  definition: AssessmentDefinition,
  response: readonly AssessmentItemResponse[],
): AssessmentMeasurements {
  const totalWeight = definition.items.reduce((s, it) => s + it.weight, 0);
  const itemResults: ItemResult[] = definition.items.map((it) => {
    const r = response.find((x) => x.itemRef === it.itemRef);
    const correct = valueEquals(it.expectedAnswer, r !== undefined ? r.response : "", it.scoring);
    return {
      itemRef: it.itemRef,
      correct,
      score: correct ? it.weight : 0,
      dimension: it.dimension ?? "accuracy",
    };
  });
  const earned = itemResults.reduce((s, x) => s + x.score, 0);
  const rubricScore = totalWeight > 0 ? round4(earned / totalWeight) : 0;

  const dims: string[] = [...new Set(itemResults.map((x) => x.dimension))];
  const dimensionMeasurements: DimensionMeasurement[] = dims.map((d) => {
    const items = itemResults.filter((x) => x.dimension === d);
    const correct = items.filter((x) => x.correct).length;
    return {
      dimension: d,
      score: round4(items.length > 0 ? correct / items.length : 0),
      itemCount: items.length,
      correctCount: correct,
    };
  });

  const completionRate = round4(definition.items.length > 0 ? response.length / definition.items.length : 0);
  const multi = dimensionMeasurements.filter((d) => d.itemCount >= 2);
  const consistent = multi.filter((d) => d.correctCount === 0 || d.correctCount === d.itemCount).length;
  const consistency = round4(multi.length > 0 ? consistent / multi.length : 1);

  return {
    definitionId: definition.definitionId,
    attemptId: "",
    rubricScore,
    scoreScope: "assessment",
    itemResults,
    dimensionMeasurements,
    totalItems: definition.items.length,
    correctItems: itemResults.filter((x) => x.correct).length,
    completionRate,
    consistency,
    attemptCount: 1,
  };
}
