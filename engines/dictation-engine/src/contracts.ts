/**
 * CORE-14 — Dictation Engine Foundation contracts.
 * Owner: engines/dictation-engine (measurement/comparison ONLY).
 * The engine owns NO evidence store, NO learner model, NO intelligence,
 * NO decisions, NO interventions, NO mastery, NO curriculum. It measures.
 */
import type { CurriculumContext } from "@workspace/curriculum";

/* ------------------------------------------------------------------ */
/* Language & input (CORE-14C/H)                                       */
/* ------------------------------------------------------------------ */

export type LanguageCode = "ar" | "en";
export type InputType = "AUDIO" | "TEXT" | "AUDIO_AND_TEXT";
export type ResponseType = "TYPED" | "HANDWRITTEN" | "TRANSCRIBED";
export type ResponseSource = "keyboard" | "handwriting" | "voice";

export interface DictationPrompt {
  /** canonical expected text (the dictated passage) */
  readonly text: string;
  readonly language: LanguageCode;
  readonly source: "TEACHER_TEXT" | "AUDIO_SOURCE" | "SYSTEM";
}

/* ------------------------------------------------------------------ */
/* Activity policy (CORE-14D/N) — CONFIGURATION, not engine logic.     */
/* Teacher-controllable knobs live here; no hard-coded behavior.       */
/* ------------------------------------------------------------------ */

export type Difficulty = "easy" | "medium" | "hard";
export type HintPolicy = "none" | "on-request";
export type RepetitionPolicy = "none" | "targeted";

export interface ActivityPolicy {
  readonly activityId: string;
  readonly language: LanguageCode;
  readonly inputType: InputType;
  readonly responseType: ResponseType;
  readonly responseSource: ResponseSource;
  readonly pauseAllowed: boolean;
  readonly replayAllowed: boolean;
  readonly maxReplayCount: number;
  readonly speedControlAllowed: boolean;
  readonly volumeControlAllowed: boolean;
  readonly sentenceReplayAllowed: boolean;
  readonly wordReplayAllowed: boolean;
  readonly timeLimitMs?: number;
  readonly difficulty?: Difficulty;
  readonly hintPolicy?: HintPolicy;
  readonly repetitionPolicy?: RepetitionPolicy;
  /** spelling policy knobs */
  readonly caseSensitive: boolean; // en
  readonly comparePunctuation: boolean;
  /** curriculum anchoring (CORE-14U) — reference only, never copied */
  readonly curriculum?: CurriculumContext;
}

/* ------------------------------------------------------------------ */
/* Attempt (CORE-14E) — ID references only, no Student/Activity copy   */
/* ------------------------------------------------------------------ */

export interface AttemptContext {
  readonly tenantId: string;
  readonly studentId: string;
  readonly actorId?: string;
  readonly actorRole?: string;
  readonly activityId: string;
  readonly sessionId?: string;
  readonly attemptId?: string;
  readonly startedAt: string; // ISO-8601
  readonly submittedAt: string; // ISO-8601
  readonly replayCount: number;
  /** TIME EVIDENCE (CORE-14P) — three distinct durations, never conflated */
  readonly listeningDurationMs?: number;
  readonly responseDurationMs?: number;
  readonly totalActivityDurationMs: number;
  /** audio object-storage REFERENCE (CORE-14Q) — never the file, never inline */
  readonly audioRef?: string;
}

/* ------------------------------------------------------------------ */
/* Submission (CORE-14F) — UI-agnostic response sources                 */
/* ------------------------------------------------------------------ */

export interface Submission {
  readonly typedText?: string;
  readonly handwrittenText?: string;
  readonly transcribedText?: string;
  readonly source: ResponseSource;
  readonly audioRef?: string; // reference only
}

export function submissionText(s: Submission): string | undefined {
  if (s.source === "voice") return s.transcribedText;
  if (s.source === "handwriting") return s.handwrittenText;
  return s.typedText;
}

/* ------------------------------------------------------------------ */
/* Comparison (CORE-14G) — analyzable diffs, not just correct/false     */
/* ------------------------------------------------------------------ */

export type DiffKind =
  | "MATCH"
  | "OMISSION"
  | "SUBSTITUTION"
  | "INSERTION"
  | "MISSPELLING"
  | "WORD_ORDER"
  | "PUNCTUATION";

export interface ComparisonDiff {
  readonly kind: DiffKind;
  readonly expectedToken?: string;
  readonly actualToken?: string;
  readonly position: number;
  readonly confidence: number;
}

export interface CompareResult {
  readonly diffs: readonly ComparisonDiff[];
  readonly normalizedExpected: readonly string[];
  readonly normalizedActual: readonly string[];
  readonly expectedWordCount: number;
  readonly actualWordCount: number;
  readonly expectedPunctuationCount: number;
  readonly actualPunctuationCount: number;
}

/* ------------------------------------------------------------------ */
/* Measurement (CORE-14J/V) — multidimensional, NO single aggregate score       */
/* ------------------------------------------------------------------ */

export interface DimensionMeasurement {
  readonly dimension: string;
  readonly skill: string;
  readonly value: number;
  readonly higherIsBetter: boolean;
}

export interface DictationMeasurements {
  readonly accuracy: number;
  readonly spellingAccuracy: number;
  readonly punctuationAccuracy: number;
  readonly completion: number;
  readonly omissionCount: number;
  readonly substitutionCount: number;
  readonly insertionCount: number;
  readonly misspellingCount: number;
  readonly wordOrderCount: number;
  readonly punctuationErrorCount: number;
  readonly expectedWordCount: number;
  readonly wordCount: number;
  readonly responseTimeMs: number;
  readonly listeningDurationMs?: number;
  readonly responseDurationMs?: number;
  readonly totalActivityDurationMs: number;
  readonly replayCount: number;
  /** independent activity-dimension values (CORE-14V), learner-registry aligned */
  readonly dimensions: readonly DimensionMeasurement[];
}

/* ------------------------------------------------------------------ */
/* Errors (CORE-14W)                                                   */
/* ------------------------------------------------------------------ */

export type DictationErrorCode =
  | "TENANT_CONTEXT_MISSING"
  | "INVALID_TENANT_ID"
  | "STUDENT_CONTEXT_MISSING"
  | "INVALID_STUDENT_ID"
  | "RESPONSE_TEXT_MISSING"
  | "UNSUPPORTED_LANGUAGE";
