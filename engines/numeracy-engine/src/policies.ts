/**
 * CORE-15 — injectable policies. Teacher controls are ACTIVITY CONFIG
 * (passed in), never hard-coded engine logic. Digit normalization is a
 * replaceable policy; the comparison core stays language-agnostic.
 */
import type { CurriculumContext } from "@workspace/curriculum";
import type { DigitSetId } from "./contracts.js";

export type FeedbackMode = "none" | "delayed" | "immediate" | "teacher-controlled";
export type HintPolicy = "none" | "teacher" | "adaptive-later";

export interface NumeracyActivityPolicy {
  readonly language: string; // "ar" | "en" | ... (metadata only in CORE-15)
  readonly digitSet: DigitSetId; // display authority for the activity
  readonly stepAware: boolean; // activity MAY provide intermediate steps
  readonly allowFractionInput?: boolean;
  readonly maxAttempts?: number;
  readonly estimationTolerance?: number; // number-sense default
  readonly curriculum?: CurriculumContext; // reference only — never copied
  readonly feedbackMode?: FeedbackMode; // NOT decided by the engine (Evidence-first)
  readonly hintPolicy?: HintPolicy; // NOT decided by the engine
}

export interface DigitNormalizationPolicy {
  readonly id: DigitSetId;
  /** unify any digit script to ASCII digits + canonical operators */
  normalize(value: string): string;
}

const ARABIC_INDIC = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
const PERSIAN_EXT = { "۴": "4", "۵": "5", "۶": "6" };

function foldDigits(value: string): string {
  let out = "";
  for (const ch of value) {
    if (ch in ARABIC_INDIC) out += ARABIC_INDIC[ch as keyof typeof ARABIC_INDIC];
    else if (ch in PERSIAN_EXT) out += PERSIAN_EXT[ch as keyof typeof PERSIAN_EXT];
    else out += ch;
  }
  return out;
}

/** Western authority — still folds Arabic-Indic defensively (deterministic). */
export const westernDigitPolicy: DigitNormalizationPolicy = {
  id: "western",
  normalize: (v) => foldDigits(v.normalize("NFC")),
};

/** Arabic-Indic authority — folds everything to ASCII for comparison. */
export const arabicIndicDigitPolicy: DigitNormalizationPolicy = {
  id: "arabic-indic",
  normalize: (v) => foldDigits(v.normalize("NFC")),
};

export const DIGIT_POLICIES: readonly DigitNormalizationPolicy[] = [westernDigitPolicy, arabicIndicDigitPolicy];

export function digitPolicyFor(id: DigitSetId): DigitNormalizationPolicy {
  const p = DIGIT_POLICIES.find((d) => d.id === id);
  if (!p) throw new Error(`UNKNOWN_DIGIT_SET:${id}`);
  return p;
}
