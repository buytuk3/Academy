/**
 * CORE-15 — multidimensional measurements. NO overall score, NO student
 * level, NO aggregate numeracy grade. Each area maps via the dimension
 * registry (config-driven, extensible). Learner Model interprets later,
 * never this engine.
 */
import type { NumeracyArea, NumeracyAttemptContext } from "./contracts.js";
import { dimensionForArea } from "./contracts.js";
import type { NumeracyComparisonResult } from "./compare.js";

export interface DimensionMeasurement {
  readonly dimension: string;
  readonly area: NumeracyArea;
  readonly metric: string;
  readonly value: number;
  readonly higherIsBetter: boolean;
  readonly label: string;
}

export interface NumeracyMeasurements {
  readonly accuracy: number; // measurement dimension, NOT an aggregate score
  readonly stepAccuracy: number; // 1 when no steps provided
  readonly correctSteps: number;
  readonly totalSteps: number;
  readonly errorCount: number;
  readonly errorPatterns: readonly string[]; // unique kinds observed — not a diagnosis
  readonly attemptCount: number;
  readonly durationMs: number;
  readonly thinkingTimeMs?: number;
  readonly responseDurationMs?: number;
  readonly hintCount?: number;
  readonly feedbackCount?: number;
  readonly retryCount?: number;
  readonly dimensionMeasurements: readonly DimensionMeasurement[];
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function buildNumeracyMeasurements(
  comparison: NumeracyComparisonResult,
  attempt: NumeracyAttemptContext,
  area: NumeracyArea,
): NumeracyMeasurements {
  const totalSteps = comparison.stepCount;
  const correctSteps = Math.max(0, totalSteps - comparison.errorRecords.filter((r) => r.evidenceRef.startsWith("step:")).length);
  const stepAccuracy = totalSteps > 0 ? correctSteps / totalSteps : 1;

  const finalPart = comparison.finalCorrect ? 0.5 : 0;
  const stepPart = totalSteps > 0 ? stepAccuracy * 0.5 : comparison.finalCorrect ? 0.5 : 0;
  const accuracy = round4(finalPart + stepPart);

  const start = Date.parse(attempt.startedAt);
  const submitted = Date.parse(attempt.submittedAt);
  const durationMs = attempt.durationMs ?? (Number.isFinite(start) && Number.isFinite(submitted) ? submitted - start : 0);

  const dimension = dimensionForArea(area);
  const errorPatterns = uniqueSorted(comparison.errorRecords.map((r) => r.type));

  const dimensionMeasurements: DimensionMeasurement[] = [
    { dimension: dimension.dimension, area, metric: dimension.metric, value: accuracy, higherIsBetter: dimension.higherIsBetter, label: dimension.label },
    { dimension: "accuracy", area: "accuracy", metric: "accuracy", value: accuracy, higherIsBetter: true, label: "Numeracy Accuracy" },
    { dimension: "response-speed", area: "response-time", metric: "durationMs", value: durationMs, higherIsBetter: false, label: "Math Response Speed" },
    { dimension: "problem-solving", area: area, metric: "problem-solving", value: totalSteps > 0 ? stepAccuracy : comparison.finalCorrect ? 1 : 0, higherIsBetter: true, label: "Problem Solving" },
  ];

  return {
    accuracy,
    stepAccuracy: round4(stepAccuracy),
    correctSteps,
    totalSteps,
    errorCount: comparison.errorRecords.length,
    errorPatterns,
    attemptCount: attempt.attemptCount ?? 1,
    durationMs,
    thinkingTimeMs: attempt.thinkingTimeMs,
    responseDurationMs: attempt.responseDurationMs,
    hintCount: attempt.hintCount,
    feedbackCount: attempt.feedbackCount,
    retryCount: attempt.retryCount,
    dimensionMeasurements,
  };
}
