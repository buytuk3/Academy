/**
 * Language policies (CORE-14H/I) — Normalization / Comparison / Scoring
 * are swappable per Language, Activity, Grade, Curriculum, Assessment Type.
 * Engine core never branches on language; it consumes the resolved pack.
 */
import type { LanguageCode } from "./contracts.js";

export interface NormalizationPolicy {
  readonly language: LanguageCode;
  /** canonical form of a single word token (language-specific) */
  normalizeToken(token: string): string;
}

export interface ComparisonPolicy {
  readonly language: LanguageCode;
  readonly caseSensitive: boolean;
  readonly comparePunctuation: boolean;
  /** two normalized tokens count as the same word */
  equivalent(a: string, b: string): boolean;
  /** two different tokens count as a MISSPELLING (close) vs SUBSTITUTION */
  isMisspelling(a: string, b: string, thresholdFor: (len: number) => number): boolean;
}

export interface ScoringPolicy {
  readonly language: LanguageCode;
  misspellingThresholdFor(tokenLength: number): number;
}

export interface DictationLanguagePack {
  readonly language: LanguageCode;
  readonly normalization: NormalizationPolicy;
  readonly comparison: ComparisonPolicy;
  readonly scoring: ScoringPolicy;
}

export interface ArNormalizationOptions {
  /** fold alef maqsura ى -> ي (default false: spelling-sensitive) */
  readonly foldAlefMaqsura?: boolean;
  /** fold taa marbuta ة -> ه (default false: spelling-sensitive) */
  readonly foldTaaMarbuta?: boolean;
}

function normalizeArToken(token: string, opts: Required<ArNormalizationOptions>): string {
  let t = token
    .replace(/\u0640/g, "") // tatweel
    .replace(/[\u064B-\u0652\u0670]/g, ""); // harakat + superscript alef
  t = t.replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627"); // alef forms -> ا
  if (opts.foldAlefMaqsura) t = t.replace(/\u0649/g, "\u064A"); // ى -> ي
  if (opts.foldTaaMarbuta) t = t.replace(/\u0629/g, "\u0647"); // ة -> ه
  return t;
}

export function arabicPack(opts?: ArNormalizationOptions): DictationLanguagePack {
  const o: Required<ArNormalizationOptions> = {
    foldAlefMaqsura: opts?.foldAlefMaqsura ?? false,
    foldTaaMarbuta: opts?.foldTaaMarbuta ?? false,
  };
  return {
    language: "ar",
    normalization: {
      language: "ar",
      normalizeToken: (t) => normalizeArToken(t, o),
    },
    comparison: {
      language: "ar",
      caseSensitive: true, // Arabic is case-less; kept for symmetry
      comparePunctuation: true,
      equivalent: (a, b) => a === b,
      isMisspelling: (a, b, th) => {
        if (a === b) return false;
        const lev = levenshteinIn(a, b);
        const thresh = th(Math.max(a.length, b.length));
        return lev > 0 && lev <= thresh;
      },
    },
    scoring: {
      language: "ar",
      misspellingThresholdFor: (len) => (len >= 5 ? 2 : 1),
    },
  };
}

export function englishPack(opts?: { readonly caseSensitive?: boolean }): DictationLanguagePack {
  const cs = opts?.caseSensitive ?? false;
  return {
    language: "en",
    normalization: {
      language: "en",
      normalizeToken: (t) => (cs ? t : t.toLowerCase()),
    },
    comparison: {
      language: "en",
      caseSensitive: cs,
      comparePunctuation: true,
      equivalent: (a, b) => a === b,
      isMisspelling: (a, b, th) => {
        if (a === b) return false;
        const lev = levenshteinIn(a, b);
        const thresh = th(Math.max(a.length, b.length));
        return lev > 0 && lev <= thresh;
      },
    },
    scoring: {
      language: "en",
      misspellingThresholdFor: (len) => (len >= 5 ? 2 : 1),
    },
  };
}

/** shared Levenshtein (kept in policies to avoid an extra module) */
export function levenshteinIn(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
