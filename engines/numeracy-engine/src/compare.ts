/**
 * CORE-15 — deterministic comparison: Response -> Comparison.
 * Returns detailed, token/step-level error records ONLY (no teaching,
 * no diagnosis, no decisions). Rich, open error model.
 */
import { digitPolicyFor } from "./policies.js";
import type { DigitNormalizationPolicy } from "./policies.js";
import type {
  NumeracyErrorKind,
  NumeracyErrorRecord,
  NumeracyExpectedStep,
  NumeracyResponse,
  NumeracyStudentStep,
  NumeracyTask,
} from "./contracts.js";

import {
  fractionsEqual,
  isDigitTranslocation,
  isPowerOfTenDiff,
  isPowerOfTenRatio,
  normalizeExpression,
  numbersEqual,
  parseBinary,
  parseComparator,
  parseFraction,
  parseRemainder,
  toNumber,
} from "./number.js";

export interface NumeracyComparisonResult {
  readonly finalCorrect: boolean;
  readonly finalExpected: string;
  readonly finalActual: string;
  readonly stepCount: number;
  readonly errorRecords: readonly NumeracyErrorRecord[];
  readonly primaryError?: NumeracyErrorRecord;
}

interface NormalizedPair {
  readonly expected: string;
  readonly actual: string;
}

function normPair(policy: DigitNormalizationPolicy, e: string, a: string): NormalizedPair {
  return { expected: normalizeExpression(e, policy), actual: normalizeExpression(a, policy) };
}

/** deterministic equality: structured fraction OR exact numeric OR canonical string. */
function valuesEqual(e: string, a: string, policy: DigitNormalizationPolicy): boolean {
  const { expected, actual } = normPair(policy, e, a);
  if (fractionsEqual(expected, actual)) return true;
  if (numbersEqual(expected, actual)) return true;
  return expected === actual;
}

function error(
  type: NumeracyErrorKind,
  evidenceRef: string,
  extra: Partial<Omit<NumeracyErrorRecord, "type" | "confidence" | "evidenceRef">> = {},
): NumeracyErrorRecord {
  return { type, confidence: 0.95, evidenceRef, ...extra };
}

/** final-answer level analysis (expression/domain aware, deterministic). */
function finalError(task: NumeracyTask, expected: string, actual: string, policy: DigitNormalizationPolicy): NumeracyErrorRecord | undefined {
  if (valuesEqual(expected, actual, policy)) return undefined;

  const norm = normPair(policy, expected, actual);
  const expNum = toNumber(norm.expected);
  const actNum = toNumber(norm.actual);

  // SIGN
  if (expNum !== undefined && actNum !== undefined && expNum !== 0 && Math.abs(expNum) === Math.abs(actNum)) {
    return error("SIGN_ERROR", "final", { expected: norm.expected, actual: norm.actual });
  }
  // DIGIT TRANSLOCATION
  if (isDigitTranslocation(norm.expected, norm.actual)) {
    return error("DIGIT_TRANSLOCATION", "final", { expected: norm.expected, actual: norm.actual });
  }
  // PLACE VALUE (ratio 10/100/1000)
  if (expNum !== undefined && actNum !== undefined && isPowerOfTenRatio(expNum, actNum)) {
    return error("PLACE_VALUE_ERROR", "final", { expected: norm.expected, actual: norm.actual });
  }
  // COMPARISON
  if (task.domain === "comparison" || /[<>]/.test(task.expression)) {
    const ec = parseComparator(norm.expected);
    const ac = parseComparator(norm.actual);
    if (ec && ac && ec.left === ac.left && ec.right === ac.right) {
      return error("COMPARISON_ERROR", "final", { expected: ec.operator, actual: ac.operator });
    }
  }
  // DIVISION REMAINDER
  const er = parseRemainder(norm.expected);
  const ar = parseRemainder(norm.actual);
  if (er && ar) {
    if (er.quotient === ar.quotient && er.remainder !== ar.remainder) {
      return error("DIVISION_REMAINDER_ERROR", "final", { expected: norm.expected, actual: norm.actual });
    }
  }
  // CARRY / BORROW by operation on the task expression
  const bin = parseBinary(normalizeExpression(task.expression, policy));
  if (bin && expNum !== undefined && actNum !== undefined) {
    if ((bin.operator === "+" || bin.operator === "*") && isPowerOfTenDiff(expNum, actNum)) {
      return error("CARRY_ERROR", "final", { expected: norm.expected, actual: norm.actual });
    }
    if (bin.operator === "-" && isPowerOfTenDiff(expNum, actNum)) {
      return error("BORROW_ERROR", "final", { expected: norm.expected, actual: norm.actual });
    }
    if (bin.operator === "*" && Number(bin.left) <= 9 && Number(bin.right) <= 9 && Number.isInteger(Number(bin.left)) && Number.isInteger(Number(bin.right))) {
      return error("MULTIPLICATION_FACT_ERROR", "final", { expected: norm.expected, actual: norm.actual });
    }
  }
  // SEQUENCE RULE (patterns)
  if (task.domain === "patterns" || task.expression.includes("?")) {
    return error("SEQUENCE_RULE_ERROR", "final", { expected: norm.expected, actual: norm.actual });
  }
  // FRACTION components
  const fe = parseFraction(norm.expected);
  const fa = parseFraction(norm.actual);
  if (fe && fa) {
    if (fe.numerator === fa.numerator) return error("FRACTION_DENOMINATOR_ERROR", "final", { expected: norm.expected, actual: norm.actual });
    if (fe.denominator === fa.denominator) return error("FRACTION_NUMERATOR_ERROR", "final", { expected: norm.expected, actual: norm.actual });
  }
  return error("FINAL_ANSWER_ERROR", "final", { expected: norm.expected, actual: norm.actual });
}

/** per-step analysis (only when BOTH sides provide steps). */
function stepErrors(
  expectedSteps: readonly NumeracyExpectedStep[],
  studentSteps: readonly NumeracyStudentStep[],
  policy: DigitNormalizationPolicy,
): NumeracyErrorRecord[] {
  const records: NumeracyErrorRecord[] = [];
  const n = Math.min(expectedSteps.length, studentSteps.length);
  for (let i = 0; i < n; i++) {
    const exp = expectedSteps[i];
    const act = studentSteps[i];
    const ref = `step:${exp.position}`;
    const expNorm = normalizeExpression(exp.expression, policy);
    const actNorm = normalizeExpression(act.expression, policy);
    const ee = normalizeExpression(exp.result, policy);
    const aa = normalizeExpression(act.result, policy);
    if (valuesEqual(exp.result, act.result, policy) && expNorm === actNorm) continue;

    // WRONG OPERATION (same operands, different operator)
    const eb = parseBinary(expNorm);
    const ab = parseBinary(actNorm);
    if (eb && ab && eb.left === ab.left && eb.right === ab.right && eb.operator !== ab.operator) {
      records.push(error("WRONG_OPERATION", ref, { position: exp.position, expected: eb.operator, actual: ab.operator }));
      continue;
    }
    // PLACE VALUE inside a step result
    const en = toNumber(ee);
    const an = toNumber(aa);
    if (en !== undefined && an !== undefined && isPowerOfTenRatio(en, an)) {
      records.push(error("PLACE_VALUE_ERROR", ref, { position: exp.position, expected: ee, actual: aa }));
      continue;
    }
    if (isDigitTranslocation(ee, aa)) {
      records.push(error("DIGIT_TRANSLOCATION", ref, { position: exp.position, expected: ee, actual: aa }));
      continue;
    }
    records.push(error("FINAL_ANSWER_ERROR", ref, { position: exp.position, expected: ee, actual: aa }));
  }
  // STEP ORDER: same multiset, wrong order
  if (expectedSteps.length === studentSteps.length && expectedSteps.length > 1) {
    const key = (s: { expression: string; result: string }) => `${normalizeExpression(s.expression, policy)}=${normalizeExpression(s.result, policy)}`;
    const sort = (arr: readonly { expression: string; result: string }[]) => arr.map(key).sort();
    if (JSON.stringify(sort(expectedSteps)) === JSON.stringify(sort(studentSteps))) {
      let ordered = true;
      for (let i = 0; i < expectedSteps.length; i++) if (key(expectedSteps[i]) !== key(studentSteps[i])) { ordered = false; break; }
      if (!ordered) records.push(error("STEP_ORDER_ERROR", "step:order", { position: 1 }));
    }
  }
  return records;
}

/** counting domains: sequence gap / repetition detection (deterministic). */
function countingErrors(expectedSeq: string, actualSeq: string, policy: DigitNormalizationPolicy): NumeracyErrorRecord[] {
  const toks = (s: string) => s.split(/,|;/).map((t) => normalizeExpression(t, policy)).filter(Boolean);
  const e = toks(expectedSeq);
  const a = toks(actualSeq);
  const records: NumeracyErrorRecord[] = [];
  let i = 0;
  let j = 0;
  while (i < e.length && j < a.length) {
    if (e[i] === a[j]) {
      i++;
      j++;
    } else if (j > 0 && a[j] === a[j - 1]) {
      records.push(error("COUNTING_REPETITION", `token:${j + 1}`, { position: j + 1, expected: e[i], actual: a[j] }));
      j++;
    } else if (i + 1 < e.length && a[j] === e[i + 1]) {
      records.push(error("COUNTING_GAP", `token:${i + 1}`, { position: i + 1, expected: e[i], actual: a[j] }));
      i++;
    } else {
      records.push(error("COUNTING_GAP", `token:${i + 1}`, { position: i + 1, expected: e[i], actual: a[j] }));
      i++;
      j++;
    }
  }
  while (i < e.length) {
    records.push(error("COUNTING_GAP", `token:${i + 1}`, { position: i + 1, expected: e[i], actual: undefined }));
    i++;
  }
  while (j < a.length) {
    records.push(error(a[j] === a[j - 1] ? "COUNTING_REPETITION" : "COUNTING_GAP", `token:${j + 1}`, { position: j + 1, expected: undefined, actual: a[j] }));
    j++;
  }
  return records;
}

const PRIMARY_PRIORITY: readonly NumeracyErrorKind[] = [
  "SIGN_ERROR",
  "DIGIT_TRANSLOCATION",
  "PLACE_VALUE_ERROR",
  "COUNTING_GAP",
  "COUNTING_REPETITION",
  "COMPARISON_ERROR",
  "WRONG_OPERATION",
  "STEP_ORDER_ERROR",
  "FRACTION_NUMERATOR_ERROR",
  "FRACTION_DENOMINATOR_ERROR",
  "DIVISION_REMAINDER_ERROR",
  "MULTIPLICATION_FACT_ERROR",
  "CARRY_ERROR",
  "BORROW_ERROR",
  "SEQUENCE_RULE_ERROR",
  "FINAL_ANSWER_ERROR",
];

export function compareNumeracy(task: NumeracyTask, response: NumeracyResponse, policy: DigitNormalizationPolicy): NumeracyComparisonResult {
  const expectedFinal = normalizeExpression(task.expectedAnswer, policy);
  const actualFinal = normalizeExpression(response.finalAnswer, policy);
  let finalCorrect = valuesEqual(task.expectedAnswer, response.finalAnswer, policy);
  let estimationAccepted = false;
  const expNumE = toNumber(normalizeExpression(task.expectedAnswer, policy));
  const actNumE = toNumber(normalizeExpression(response.finalAnswer, policy));
  const estTol = task.estimationTolerance;
  if (task.domain === "number-sense" && estTol !== undefined && expNumE !== undefined && actNumE !== undefined) {
    estimationAccepted = Math.abs(actNumE - expNumE) <= estTol * Math.abs(expNumE);
    if (estimationAccepted) finalCorrect = true;
  }

  const records: NumeracyErrorRecord[] = [];

  if (task.domain === "counting") {
    records.push(...countingErrors(task.expectedAnswer, response.finalAnswer, policy));
  }

  const expectedSteps = task.expectedSteps ?? [];
  const studentSteps = response.steps ?? [];
  const stepCount = studentSteps.length;
  if (expectedSteps.length > 0 && studentSteps.length > 0) {
    records.push(...stepErrors(expectedSteps, studentSteps, policy));
  }
  if (!finalCorrect && !estimationAccepted) {
    const fe = finalError(task, task.expectedAnswer, response.finalAnswer, policy);
    if (fe) records.push(fe);
  }

  const primaryError =
    PRIMARY_PRIORITY.map((kind) => records.find((r) => r.type === kind)).find((r) => r !== undefined) ?? records[0];

  return {
    finalCorrect,
    finalExpected: expectedFinal,
    finalActual: actualFinal,
    stepCount,
    errorRecords: records,
    primaryError,
  };
}

export function policyForDigitSet(id: import("./contracts.js").DigitSetId): DigitNormalizationPolicy {
  return digitPolicyFor(id);
}
