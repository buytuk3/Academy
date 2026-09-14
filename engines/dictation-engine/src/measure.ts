/**
 * Measurement model (CORE-14J/V) — multidimensional; never collapses to
 * a single aggregate student score.
 */
import type {
  CompareResult,
  DictationMeasurements,
  DimensionMeasurement,
} from "./contracts.js";

export interface TimingEvidence {
  readonly listeningDurationMs?: number;
  readonly responseDurationMs?: number;
  readonly totalActivityDurationMs: number;
  readonly replayCount: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function computeMeasurements(comp: CompareResult, timing: TimingEvidence): DictationMeasurements {
  const count = (kind: string) => comp.diffs.filter((d) => d.kind === kind).length;
  const matches = count("MATCH");
  const misspellings = count("MISSPELLING");
  const omissions = count("OMISSION");
  const substitutions = count("SUBSTITUTION");
  const insertions = count("INSERTION");
  const wordOrders = count("WORD_ORDER");
  const punctErrors = count("PUNCTUATION");

  const expectedWords = comp.expectedWordCount;
  const actualWords = comp.actualWordCount;
  const hasText = expectedWords > 0;
  const accuracy = hasText ? clamp01(matches / expectedWords) : actualWords === 0 ? 1 : 0;
  const spellingAccuracy = hasText ? clamp01(1 - misspellings / expectedWords) : 1;
  const punctuationAccuracy =
    comp.expectedPunctuationCount === 0 ? 1 : clamp01(1 - punctErrors / comp.expectedPunctuationCount);
  const completion = hasText ? clamp01(actualWords / expectedWords) : actualWords === 0 ? 1 : 0;
  const responseTimeMs = timing.responseDurationMs ?? timing.totalActivityDurationMs;

  const dimensions: readonly DimensionMeasurement[] = [
    { dimension: "accuracy", skill: "dictation.accuracy", value: accuracy, higherIsBetter: true },
    { dimension: "spelling", skill: "writing.spelling", value: spellingAccuracy, higherIsBetter: true },
    { dimension: "response-speed", skill: "dictation.speed", value: responseTimeMs, higherIsBetter: false },
    { dimension: "comprehension", skill: "listening.comprehension", value: accuracy, higherIsBetter: true },
    { dimension: "punctuation", skill: "dictation.punctuation", value: punctuationAccuracy, higherIsBetter: true },
    { dimension: "transcription", skill: "dictation.transcription", value: accuracy, higherIsBetter: true },
    { dimension: "recall", skill: "dictation.recall", value: completion, higherIsBetter: true },
  ];

  return {
    accuracy,
    spellingAccuracy,
    punctuationAccuracy,
    completion,
    omissionCount: omissions,
    substitutionCount: substitutions,
    insertionCount: insertions,
    misspellingCount: misspellings,
    wordOrderCount: wordOrders,
    punctuationErrorCount: punctErrors,
    expectedWordCount: expectedWords,
    wordCount: actualWords,
    responseTimeMs,
    listeningDurationMs: timing.listeningDurationMs,
    responseDurationMs: timing.responseDurationMs,
    totalActivityDurationMs: timing.totalActivityDurationMs,
    replayCount: timing.replayCount,
    dimensions,
  };
}
