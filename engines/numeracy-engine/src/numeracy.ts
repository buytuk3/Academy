/**
 * CORE-15 — Numeracy Capability Engine orchestrator.
 * Response -> Comparison -> Measurement. Evidence emission is a SEPARATE
 * step (evidence.ts). The engine never teaches, never diagnoses, never
 * decides, never delivers.
 */
import type { DigitSetId, NumeracyAttemptContext, NumeracyResponse, NumeracyTask } from "./contracts.js";
import { digitPolicyFor } from "./policies.js";
import type { NumeracyActivityPolicy } from "./policies.js";
import { compareNumeracy } from "./compare.js";
import type { NumeracyComparisonResult } from "./compare.js";
import { buildNumeracyMeasurements } from "./measure.js";
import type { NumeracyMeasurements } from "./measure.js";

export interface AnalyzeNumeracyArgs {
  readonly attempt: NumeracyAttemptContext;
  readonly task: NumeracyTask;
  readonly response: NumeracyResponse;
  readonly policy: NumeracyActivityPolicy;
}

export interface NumeracyAnalysis {
  readonly comparison: NumeracyComparisonResult;
  readonly measurements: NumeracyMeasurements;
}

export function analyzeNumeracy(args: AnalyzeNumeracyArgs): NumeracyAnalysis {
  const digitSet: DigitSetId = args.task.digitSet ?? args.policy.digitSet;
  const policy = digitPolicyFor(digitSet);
  const effTol = args.task.estimationTolerance ?? args.policy.estimationTolerance;
  const t = effTol !== undefined ? { ...args.task, estimationTolerance: effTol } : args.task;
  const comparison = compareNumeracy(t, args.response, policy);
  const measurements = buildNumeracyMeasurements(comparison, args.attempt, args.task.domain);
  return { comparison, measurements };
}
