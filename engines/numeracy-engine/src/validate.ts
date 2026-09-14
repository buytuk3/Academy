/**
 * CORE-26 / WAVE-4B — STRICT NUMERACY engine-input validation (owner
 * directive §1, 2026-09-12): the flexible /v1 `engineInput` envelope is a
 * TRANSPORT wrapper only. The engine OWNS a typed, validated contract at
 * its boundary — input type checks, required-field checks, rejection of
 * invalid input, and REJECTION of unknown fields (no unvalidated data may
 * reach the measurement core). Additive-only: existing exported contracts
 * and function signatures are untouched.
 *
 * Error style: deterministic reason codes (NUM_*), same convention as the
 * canonical platform error strings (CORE-05/14/15).
 */
import type {
  DigitSetId,
  NumeracyExpectedStep,
  NumeracyResponse,
  NumeracyStudentStep,
  NumeracyTask,
} from "./contracts.js";
import type { NumeracyArea } from "./contracts.js";

/** Mirrors the `NumeracyArea` union (contracts.ts) — single source of truth for runtime checks. */
const NUMERACY_AREAS: readonly NumeracyArea[] = [
  "number-sense",
  "counting",
  "comparison",
  "place-value",
  "arithmetic",
  "patterns",
  "fractions",
  "problem-solving",
  "accuracy",
  "response-time",
  "error-patterns",
];

const DIGIT_SETS: readonly DigitSetId[] = ["western", "arabic-indic"];

export class NumeracyEngineInputError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`INVALID_ENGINE_INPUT:${reason}`);
    this.name = "NumeracyEngineInputError";
    this.reason = reason;
  }
}

export interface NumeracyTimingInput {
  readonly startedAt?: string;
  readonly submittedAt?: string;
  readonly durationMs?: number;
  readonly thinkingTimeMs?: number;
  readonly responseDurationMs?: number;
  readonly attemptCount?: number;
  readonly hintCount?: number;
  readonly feedbackCount?: number;
  readonly retryCount?: number;
}

export interface NumeracyPolicyInput {
  readonly language?: string;
  readonly digitSet?: DigitSetId;
  readonly stepAware?: boolean;
  readonly estimationTolerance?: number;
}

/** Fully validated NUMERACY engine input — the ONLY shape analyzeNumeracy accepts from /v1. */
export interface NumeracyEngineInput {
  readonly task: NumeracyTask;
  readonly response: NumeracyResponse;
  readonly timing?: NumeracyTimingInput;
  readonly policy?: NumeracyPolicyInput;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function reqString(obj: Record<string, unknown>, key: string, prefix: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.trim() === "") throw new NumeracyEngineInputError(`${prefix}_${key.toUpperCase()}_REQUIRED`);
  return v;
}

function optString(obj: Record<string, unknown>, key: string, prefix: string): string | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new NumeracyEngineInputError(`${prefix}_${key.toUpperCase()}_NOT_STRING`);
  return v;
}

function optNonNegNumber(obj: Record<string, unknown>, key: string, prefix: string): number | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new NumeracyEngineInputError(`${prefix}_${key.toUpperCase()}_NOT_NON_NEGATIVE_NUMBER`);
  return v;
}

function optIsoDate(obj: Record<string, unknown>, key: string, prefix: string): string | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string" || v.trim() === "" || !Number.isFinite(Date.parse(v))) throw new NumeracyEngineInputError(`${prefix}_${key.toUpperCase()}_NOT_ISO_DATE`);
  return v;
}

function parseExpectedStep(raw: unknown, i: number): NumeracyExpectedStep {
  if (!isPlainObject(raw)) throw new NumeracyEngineInputError(`TASK_EXPECTED_STEPS_${i}_NOT_OBJECT`);
  const position = (raw as Record<string, unknown>).position;
  const expression = (raw as Record<string, unknown>).expression;
  const result = (raw as Record<string, unknown>).result;
  if (typeof position !== "number" || !Number.isFinite(position)) throw new NumeracyEngineInputError(`TASK_EXPECTED_STEPS_${i}_POSITION_NOT_NUMBER`);
  if (typeof expression !== "string" || expression.trim() === "") throw new NumeracyEngineInputError(`TASK_EXPECTED_STEPS_${i}_EXPRESSION_REQUIRED`);
  if (typeof result !== "string" || result.trim() === "") throw new NumeracyEngineInputError(`TASK_EXPECTED_STEPS_${i}_RESULT_REQUIRED`);
  return { position, expression, result };
}

function parseStudentStep(raw: unknown, i: number): NumeracyStudentStep {
  if (!isPlainObject(raw)) throw new NumeracyEngineInputError(`RESPONSE_STEPS_${i}_NOT_OBJECT`);
  const position = (raw as Record<string, unknown>).position;
  const expression = (raw as Record<string, unknown>).expression;
  const result = (raw as Record<string, unknown>).result;
  if (typeof position !== "number" || !Number.isFinite(position)) throw new NumeracyEngineInputError(`RESPONSE_STEPS_${i}_POSITION_NOT_NUMBER`);
  if (typeof expression !== "string" || expression.trim() === "") throw new NumeracyEngineInputError(`RESPONSE_STEPS_${i}_EXPRESSION_REQUIRED`);
  if (typeof result !== "string" || result.trim() === "") throw new NumeracyEngineInputError(`RESPONSE_STEPS_${i}_RESULT_REQUIRED`);
  return { position, expression, result };
}

function parseTask(raw: unknown): NumeracyTask {
  if (!isPlainObject(raw)) throw new NumeracyEngineInputError("TASK_NOT_OBJECT");
  const t = raw as Record<string, unknown>;
  const expression = reqString(t, "expression", "TASK");
  const domain = t.domain;
  if (typeof domain !== "string" || !NUMERACY_AREAS.includes(domain as NumeracyArea)) {
    throw new NumeracyEngineInputError("TASK_DOMAIN_INVALID");
  }
  const expectedAnswer = reqString(t, "expectedAnswer", "TASK");
  const digitSetV = t.digitSet;
  if (digitSetV !== undefined && (typeof digitSetV !== "string" || !DIGIT_SETS.includes(digitSetV as DigitSetId))) {
    throw new NumeracyEngineInputError("TASK_DIGIT_SET_INVALID");
  }
  const estimationTolerance = optNonNegNumber(t, "estimationTolerance", "TASK");
  let expectedSteps: readonly NumeracyExpectedStep[] | undefined;
  if (t.expectedSteps !== undefined) {
    if (!Array.isArray(t.expectedSteps)) throw new NumeracyEngineInputError("TASK_EXPECTED_STEPS_NOT_ARRAY");
    expectedSteps = t.expectedSteps.map(parseExpectedStep);
  }
  return {
    expression,
    domain: domain as NumeracyArea,
    expectedAnswer,
    ...(expectedSteps !== undefined ? { expectedSteps } : {}),
    ...(digitSetV !== undefined ? { digitSet: digitSetV as DigitSetId } : {}),
    ...(estimationTolerance !== undefined ? { estimationTolerance } : {}),
  };
}

function parseResponse(raw: unknown): NumeracyResponse {
  if (!isPlainObject(raw)) throw new NumeracyEngineInputError("RESPONSE_NOT_OBJECT");
  const r = raw as Record<string, unknown>;
  const finalAnswer = reqString(r, "finalAnswer", "RESPONSE");
  let steps: readonly NumeracyStudentStep[] | undefined;
  if (r.steps !== undefined) {
    if (!Array.isArray(r.steps)) throw new NumeracyEngineInputError("RESPONSE_STEPS_NOT_ARRAY");
    steps = r.steps.map(parseStudentStep);
  }
  return { finalAnswer, ...(steps !== undefined ? { steps } : {}) };
}

function parseTiming(raw: unknown): NumeracyTimingInput {
  if (!isPlainObject(raw)) throw new NumeracyEngineInputError("TIMING_NOT_OBJECT");
  const t = raw as Record<string, unknown>;
  return {
    ...(optIsoDate(t, "startedAt", "TIMING") !== undefined ? { startedAt: t.startedAt as string } : {}),
    ...(optIsoDate(t, "submittedAt", "TIMING") !== undefined ? { submittedAt: t.submittedAt as string } : {}),
    ...(optNonNegNumber(t, "durationMs", "TIMING") !== undefined ? { durationMs: t.durationMs as number } : {}),
    ...(optNonNegNumber(t, "thinkingTimeMs", "TIMING") !== undefined ? { thinkingTimeMs: t.thinkingTimeMs as number } : {}),
    ...(optNonNegNumber(t, "responseDurationMs", "TIMING") !== undefined ? { responseDurationMs: t.responseDurationMs as number } : {}),
    ...(optNonNegNumber(t, "attemptCount", "TIMING") !== undefined ? { attemptCount: t.attemptCount as number } : {}),
    ...(optNonNegNumber(t, "hintCount", "TIMING") !== undefined ? { hintCount: t.hintCount as number } : {}),
    ...(optNonNegNumber(t, "feedbackCount", "TIMING") !== undefined ? { feedbackCount: t.feedbackCount as number } : {}),
    ...(optNonNegNumber(t, "retryCount", "TIMING") !== undefined ? { retryCount: t.retryCount as number } : {}),
  };
}

function parsePolicy(raw: unknown): NumeracyPolicyInput {
  if (!isPlainObject(raw)) throw new NumeracyEngineInputError("POLICY_NOT_OBJECT");
  const p = raw as Record<string, unknown>;
  const language = optString(p, "language", "POLICY");
  const digitSetV = p.digitSet;
  if (digitSetV !== undefined && (typeof digitSetV !== "string" || !DIGIT_SETS.includes(digitSetV as DigitSetId))) {
    throw new NumeracyEngineInputError("POLICY_DIGIT_SET_INVALID");
  }
  const stepAware = p.stepAware;
  if (stepAware !== undefined && typeof stepAware !== "boolean") throw new NumeracyEngineInputError("POLICY_STEP_AWARE_NOT_BOOLEAN");
  const estimationTolerance = optNonNegNumber(p, "estimationTolerance", "POLICY");
  return {
    ...(language !== undefined ? { language } : {}),
    ...(digitSetV !== undefined ? { digitSet: digitSetV as DigitSetId } : {}),
    ...(stepAware !== undefined ? { stepAware } : {}),
    ...(estimationTolerance !== undefined ? { estimationTolerance } : {}),
  };
}

/** The ONLY gate between the /v1 transport envelope and the NUMERACY measurement core. */
export function parseNumeracyEngineInput(raw: unknown): NumeracyEngineInput {
  if (!isPlainObject(raw)) throw new NumeracyEngineInputError("INPUT_NOT_OBJECT");
  const input = raw as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!["task", "response", "timing", "policy"].includes(key)) {
      throw new NumeracyEngineInputError(`NUM_UNKNOWN_FIELD:${key}`);
    }
  }
  if (input.task === undefined) throw new NumeracyEngineInputError("TASK_REQUIRED");
  if (input.response === undefined) throw new NumeracyEngineInputError("RESPONSE_REQUIRED");
  const task = parseTask(input.task);
  const response = parseResponse(input.response);
  const timing = input.timing !== undefined ? parseTiming(input.timing) : undefined;
  const policy = input.policy !== undefined ? parsePolicy(input.policy) : undefined;
  return {
    task,
    response,
    ...(timing !== undefined ? { timing } : {}),
    ...(policy !== undefined ? { policy } : {}),
  };
}
