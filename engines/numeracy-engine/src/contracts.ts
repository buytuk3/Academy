/**
 * CORE-15 Numeracy Engine Foundation — contracts.
 * Owner: numeracy-engine. Deterministic, config/registry-driven, extensible.
 * Numeracy != Assessment != Mastery != Diagnosis != Intelligence.
 * No overall scores, no student levels, no medical diagnosis, no auto-delivery.
 * Persistence: zero (measurements flow to Evidence via the canonical writer).
 */
import type { CurriculumContext } from "@workspace/curriculum";

/* ------------------------------------------------------------------ */
/* Dimensions & measurement areas (registry-driven, extensible)        */
/* ------------------------------------------------------------------ */
export type NumeracyArea =
  | "number-sense"
  | "counting"
  | "comparison"
  | "place-value"
  | "arithmetic"
  | "patterns"
  | "fractions"
  | "problem-solving"
  | "accuracy"
  | "response-time"
  | "error-patterns";

export interface NumeracyDimension {
  readonly dimension: string;
  readonly area: NumeracyArea;
  readonly metric: string;
  readonly higherIsBetter: boolean;
  readonly label: string;
}

/** Core registry — learner-model aligned (see packages/database learner rules for mathematics). */
export const NUMERACY_DIMENSION_REGISTRY: readonly NumeracyDimension[] = [
  { dimension: "numeracy", area: "number-sense", metric: "numeracy", higherIsBetter: true, label: "Number Sense" },
  { dimension: "numeracy", area: "counting", metric: "numeracy", higherIsBetter: true, label: "Counting" },
  { dimension: "numeracy", area: "comparison", metric: "numeracy", higherIsBetter: true, label: "Comparison" },
  { dimension: "numeracy", area: "place-value", metric: "numeracy", higherIsBetter: true, label: "Place Value" },
  { dimension: "numeracy", area: "arithmetic", metric: "numeracy", higherIsBetter: true, label: "Arithmetic" },
  { dimension: "numeracy", area: "fractions", metric: "numeracy", higherIsBetter: true, label: "Fractions" },
  { dimension: "problem-solving", area: "patterns", metric: "problem-solving", higherIsBetter: true, label: "Patterns" },
  { dimension: "problem-solving", area: "problem-solving", metric: "problem-solving", higherIsBetter: true, label: "Problem Solving" },
  { dimension: "accuracy", area: "accuracy", metric: "accuracy", higherIsBetter: true, label: "Numeracy Accuracy" },
  { dimension: "response-speed", area: "response-time", metric: "durationMs", higherIsBetter: false, label: "Math Response Speed" },
  { dimension: "error-patterns", area: "error-patterns", metric: "errorPatternCount", higherIsBetter: false, label: "Error Patterns" },
];

export function dimensionForArea(area: NumeracyArea): NumeracyDimension {
  const found = NUMERACY_DIMENSION_REGISTRY.find((d) => d.area === area);
  return found ?? { dimension: "numeracy", area, metric: "numeracy", higherIsBetter: true, label: area };
}

/* ------------------------------------------------------------------ */
/* Error model — open, contract/config-driven (extension without       */
/* closing the list: NumeracyErrorKind | (string & {})).               */
/* ------------------------------------------------------------------ */
export const NUMERACY_ERROR_KINDS = [
  "WRONG_OPERATION",
  "PLACE_VALUE_ERROR",
  "CARRY_ERROR",
  "BORROW_ERROR",
  "DIGIT_TRANSLOCATION",
  "COUNTING_GAP",
  "COUNTING_REPETITION",
  "COMPARISON_ERROR",
  "SIGN_ERROR",
  "MULTIPLICATION_FACT_ERROR",
  "DIVISION_REMAINDER_ERROR",
  "FRACTION_NUMERATOR_ERROR",
  "FRACTION_DENOMINATOR_ERROR",
  "SEQUENCE_RULE_ERROR",
  "STEP_ORDER_ERROR",
  "FINAL_ANSWER_ERROR",
] as const;

export type NumeracyErrorKind = (typeof NUMERACY_ERROR_KINDS)[number] | (string & {});

export interface NumeracyErrorRecord {
  /** type + position + expected + actual + confidence + evidenceRef — nothing more */
  readonly type: NumeracyErrorKind;
  readonly position?: number;
  readonly expected?: string;
  readonly actual?: string;
  readonly confidence: number;
  readonly evidenceRef: string;
}

/* ------------------------------------------------------------------ */
/* Task (expected) + Response (student) — step-aware optional steps    */
/* ------------------------------------------------------------------ */
export type DigitSetId = "western" | "arabic-indic";

export interface NumeracyExpectedStep {
  readonly position: number;
  readonly expression: string;
  readonly result: string;
}

export interface NumeracyTask {
  readonly expression: string; // e.g. "23*4", "14>9", "2,4,8,?"
  readonly domain: NumeracyArea;
  readonly expectedAnswer: string; // e.g. "92", "14>9", "1/2", "3 r 2"
  readonly expectedSteps?: readonly NumeracyExpectedStep[];
  readonly digitSet?: DigitSetId;
  /** used by number-sense estimation: |actual-expected| <= tolerance*|expected| */
  readonly estimationTolerance?: number;
}

export interface NumeracyStudentStep {
  readonly position: number;
  readonly expression: string;
  readonly result: string;
}

export interface NumeracyResponse {
  readonly finalAnswer: string;
  readonly steps?: readonly NumeracyStudentStep[];
}

/* ------------------------------------------------------------------ */
/* Attempt context (teacher/activity config lives in policies)         */
/* ------------------------------------------------------------------ */
export interface NumeracyAttemptContext {
  readonly attemptId: string;
  readonly tenantId: string;
  readonly studentId: string;
  readonly activityId: string;
  readonly sessionId?: string;
  readonly actorId?: string;
  readonly actorRole?: string;
  readonly occurredAt: string;
  readonly startedAt: string;
  readonly submittedAt: string;
  readonly durationMs?: number;
  readonly thinkingTimeMs?: number;
  readonly responseDurationMs?: number;
  readonly attemptCount?: number;
  readonly hintCount?: number;
  readonly feedbackCount?: number;
  readonly retryCount?: number;
}
