/**
 * Dictation run orchestrator (CORE-14) — deterministic, language-aware,
 * tenant-safe. Produces measurements + evidence via the canonical writer.
 * NEVER calls decisions/intelligence/events; NEVER delivers anything.
 */
import { randomUUID } from "node:crypto";
import type {
  ActivityPolicy,
  AttemptContext,
  CompareResult,
  ComparisonDiff,
  DictationMeasurements,
  DictationPrompt,
  Submission,
} from "./contracts.js";
import { submissionText } from "./contracts.js";
import { assertDictationContext } from "./context.js";
import { languagePackFor } from "./language.js";
import { compareDictation } from "./compare.js";
import { computeMeasurements } from "./measure.js";
import { recordDictationEvidence, type EvidenceWriterLike } from "./evidence.js";

export interface RunDictationInput {
  readonly attempt: AttemptContext & { readonly attemptId?: string };
  readonly prompt: DictationPrompt;
  readonly submission: Submission;
  readonly policy: ActivityPolicy;
  readonly evidenceWriter?: EvidenceWriterLike;
}

export interface DictationResult {
  readonly attemptId: string;
  readonly measurements: DictationMeasurements;
  readonly compare: CompareResult;
  readonly diffs: readonly ComparisonDiff[];
  readonly evidenceInput: import("@workspace/db").RecordEvidenceInput;
  readonly evidence: unknown;
}

export async function runDictationAttempt(input: RunDictationInput): Promise<DictationResult> {
  assertDictationContext(input.attempt.tenantId, input.attempt.studentId);
  const pack = languagePackFor(input.policy.language, {
    caseSensitive: input.policy.caseSensitive,
    comparePunctuation: input.policy.comparePunctuation,
  });
  const text = submissionText(input.submission);
  if (text === undefined || text.trim() === "") throw new Error("RESPONSE_TEXT_MISSING");
  const compare = compareDictation(input.prompt.text, text, pack);
  const measurements = computeMeasurements(compare, {
    listeningDurationMs: input.attempt.listeningDurationMs,
    responseDurationMs: input.attempt.responseDurationMs,
    totalActivityDurationMs: input.attempt.totalActivityDurationMs,
    replayCount: input.attempt.replayCount,
  });
  const attempt: AttemptContext = { ...input.attempt, attemptId: input.attempt.attemptId ?? randomUUID() };
  const recorded = await recordDictationEvidence({
    attempt,
    measurements,
    policy: input.policy,
    diffs: compare.diffs,
    evidenceWriter: input.evidenceWriter,
  });
  return {
    attemptId: attempt.attemptId ?? "",
    measurements,
    compare,
    diffs: compare.diffs,
    evidenceInput: recorded.evidenceInput,
    evidence: recorded.evidence,
  };
}
