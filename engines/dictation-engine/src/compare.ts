/**
 * Deterministic diff comparison (CORE-14G) — expected vs student response,
 * producing analyzable diffs: OMISSION / SUBSTITUTION / INSERTION /
 * MISSPELLING / WORD_ORDER / PUNCTUATION with expectedToken/actualToken/
 * position/confidence. Alignment is a full Needleman-Wunsch-style dynamic
 * program over normalized tokens (deterministic; no ML/LLM).
 */
import type { CompareResult, ComparisonDiff, DiffKind, LanguageCode } from "./contracts.js";
import type { DictationLanguagePack } from "./policies.js";

const LETTER = /\p{L}|\p{N}|\p{M}/u; // marks (Arabic harakat) stay attached to their word
const PUNCT = /\p{P}|\p{S}/u;

export interface Tokenized {
  readonly words: string[];
  readonly punct: string[];
}

export function tokenize(text: string): Tokenized {
  const words: string[] = [];
  const punct: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (LETTER.test(ch)) {
      cur += ch;
    } else if (PUNCT.test(ch)) {
      if (cur) { words.push(cur); cur = ""; }
      punct.push(ch);
    } else {
      if (cur) { words.push(cur); cur = ""; }
    }
  }
  if (cur) words.push(cur);
  return { words, punct };
}

const CONFIDENCE: Record<DiffKind, number> = {
  MATCH: 1,
  MISSPELLING: 0.7,
  WORD_ORDER: 0.6,
  SUBSTITUTION: 0.5,
  OMISSION: 0.4,
  INSERTION: 0.4,
  PUNCTUATION: 0.8,
};

export function compareDictation(expected: string, actual: string, pack: DictationLanguagePack): CompareResult {
  const exp = tokenize(expected);
  const act = tokenize(actual);
  const normE = exp.words.map((w) => pack.normalization.normalizeToken(w));
  const normA = act.words.map((w) => pack.normalization.normalizeToken(w));
  const m = normE.length, n = normA.length;

  // DP over suffixes: dp[i][j] = min edit cost aligning normE[i..] vs normA[j..]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m; i >= 0; i--) dp[i][n] = m - i;
  for (let j = n; j >= 0; j--) dp[m][j] = n - j;
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (normE[i] === normA[j]) dp[i][j] = dp[i + 1][j + 1];
      else dp[i][j] = 1 + Math.min(dp[i + 1][j + 1], dp[i + 1][j], dp[i][j + 1]);
    }
  }

  type Aligned = { readonly ei: number; readonly aj: number; readonly equal: boolean };
  const aligned: Aligned[] = [];
  const deletions: number[] = [];
  const insertions: number[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (normE[i] === normA[j]) { aligned.push({ ei: i, aj: j, equal: true }); i++; j++; continue; }
    const sub = dp[i + 1][j + 1], del = dp[i + 1][j], ins = dp[i][j + 1];
    if (sub <= del && sub <= ins) { aligned.push({ ei: i, aj: j, equal: false }); i++; j++; }
    else if (del <= ins) { deletions.push(i); i++; }
    else { insertions.push(j); j++; }
  }
  while (i < m) { deletions.push(i); i++; }
  while (j < n) { insertions.push(j); j++; }

  const sortedE = [...normE].sort();
  const sortedA = [...normA].sort();
  const sameMultiset =
    sortedE.length === sortedA.length && sortedE.every((v, k) => v === sortedA[k]);

  const diffs: ComparisonDiff[] = [];
  const th = (len: number) => pack.scoring.misspellingThresholdFor(len);

  for (const a of aligned) {
    if (a.equal) {
      diffs.push({ kind: "MATCH", expectedToken: exp.words[a.ei], position: a.ei, confidence: CONFIDENCE.MATCH });
    } else if (pack.comparison.isMisspelling(normE[a.ei], normA[a.aj], th)) {
      diffs.push({ kind: "MISSPELLING", expectedToken: exp.words[a.ei], actualToken: act.words[a.aj], position: a.ei, confidence: CONFIDENCE.MISSPELLING });
    } else if (sameMultiset) {
      diffs.push({ kind: "WORD_ORDER", expectedToken: exp.words[a.ei], actualToken: act.words[a.aj], position: a.ei, confidence: CONFIDENCE.WORD_ORDER });
    } else {
      diffs.push({ kind: "SUBSTITUTION", expectedToken: exp.words[a.ei], actualToken: act.words[a.aj], position: a.ei, confidence: CONFIDENCE.SUBSTITUTION });
    }
  }
  if (sameMultiset) {
    // a pure permutation: pair each unmatched expected token with an unmatched
    // actual token as WORD_ORDER (NOT omission+insertion)
    const pairCount = Math.min(deletions.length, insertions.length);
    for (let k = 0; k < pairCount; k++) {
      diffs.push({ kind: "WORD_ORDER", expectedToken: exp.words[deletions[k]], actualToken: act.words[insertions[k]], position: deletions[k], confidence: CONFIDENCE.WORD_ORDER });
    }
    for (let k = pairCount; k < deletions.length; k++) diffs.push({ kind: "OMISSION", expectedToken: exp.words[deletions[k]], position: deletions[k], confidence: CONFIDENCE.OMISSION });
    for (let k = pairCount; k < insertions.length; k++) diffs.push({ kind: "INSERTION", actualToken: act.words[insertions[k]], position: insertions[k], confidence: CONFIDENCE.INSERTION });
  } else {
    for (const d of deletions) diffs.push({ kind: "OMISSION", expectedToken: exp.words[d], position: d, confidence: CONFIDENCE.OMISSION });
    for (const ins of insertions) diffs.push({ kind: "INSERTION", actualToken: act.words[ins], position: ins, confidence: CONFIDENCE.INSERTION });
  }

  if (pack.comparison.comparePunctuation) {
    const maxP = Math.max(exp.punct.length, act.punct.length);
    for (let k = 0; k < maxP; k++) {
      const e = exp.punct[k] ?? "";
      const a = act.punct[k] ?? "";
      if (e !== a) diffs.push({ kind: "PUNCTUATION", expectedToken: e || undefined, actualToken: a || undefined, position: k, confidence: CONFIDENCE.PUNCTUATION });
    }
  }

  diffs.sort((x, y) => x.position - y.position);

  return {
    diffs,
    normalizedExpected: normE,
    normalizedActual: normA,
    expectedWordCount: normE.length,
    actualWordCount: normA.length,
    expectedPunctuationCount: exp.punct.length,
    actualPunctuationCount: act.punct.length,
  };
}

export type { LanguageCode };
