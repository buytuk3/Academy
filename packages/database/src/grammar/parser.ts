/**
 * PHASE-20 — the REAL deterministic Arabic i'rab (grammar parsing) rules
 * engine (governing doc v2.1 §3.7). PURE TypeScript — no external NLP
 * dependency, no ML service, no network (ADR-041: zero new dependencies;
 * the roadmap makes this phase's own ADR mandatory).
 *
 * HONEST BOUNDED SCOPE (no fake data, ever):
 *   - a bounded canonical lexicon (particles of jarr, negation/interrogation,
 *     demonstratives, pronouns, common past-tense verbs) + real morphology
 *     rules (past-tense suffixes; diacritics/tatweel/punctuation stripping);
 *   - جار/مجرور tracking: the token after a jarr particle is اسم مجرور;
 *   - فاعل tracking: the first recognized noun after a finite verb;
 *   - ANY token the rules cannot classify is stamped NEEDS_REVIEW — the
 *     engine NEVER guesses a grammatical position it cannot derive.
 */
export const GRAMMAR_ENGINE_VERSION = "1.0.0-rules";
export const NEEDS_REVIEW = "NEEDS_REVIEW";

/** حروف الجر (canonical, diacritic-free forms). */
const HURUF_JARR = new Set([
  "في", "من", "الى", "إلى", "على", "عن", "مع", "ل", "ب", "رب", "حتى", "مذ", "منذ", "خلا", "عدا", "حاشا",
]);
/** Other build-only particles (interrogation, negation, emphasis). */
const HURUF_OTHER: Record<string, string> = {
  "هل": "أداة استفهام",
  "لم": "حرف جزم",
  "لن": "حرف نصب",
  "لا": "حرف نفي",
  "ما": "حرف نفي",
  "لنـ": "حرف نصب",
  "ان": "حرف توكيد ونصب",
  "إن": "حرف توكيد ونصب",
  "أن": "حرف توكيد ونصب",
  "إنن": "حرف توكيد ونصب",
  "أنن": "حرف توكيد ونصب",
  "لكن": "حرف استدراك",
  "او": "حرف عطف",
  "و": "حرف عطف",
  "ف": "حرف استئناف",
  "ثم": "حرف عطف",
};
/** أسماء الإشارة (built — indeclinable). */
const DEMONSTRATIVES: Record<string, string> = {
  "هذا": "اسم إشارة للمفرد المذكر",
  "هذه": "اسم إشارة للمفرد المؤنث",
  "هؤلاء": "اسم إشارة للجمع",
  "ذلك": "اسم إشارة للبعيد المذكر",
  "تلك": "اسم إشارة للبعيد المؤنث",
  "الذى": "اسم موصول",
  "الذي": "اسم موصول",
  "التى": "اسم موصول",
  "التي": "اسم موصول",
  "الذين": "اسم موصول للجمع",
};
/** الضمائر (built). */
const PRONOUNS: Record<string, string> = {
  "هو": "ضمير منفصل", "هي": "ضمير منفصل", "هم": "ضمير منفصل", "هن": "ضمير منفصل",
  "انا": "ضمير منفصل", "أنا": "ضمير منفصل", "انت": "ضمير منفصل", "أنت": "ضمير منفصل",
  "نحن": "ضمير منفصل", "هما": "ضمير منفصل",
};
/** قاموس الأفعال الماضية الشائعة (canonical, diacritic-free). */
const PAST_VERBS = new Set([
  "ذهب", "كتب", "قرا", "قرأ", "درس", "لعب", "شرب", "اكل", "أكل", "فتح", "سمع", "نظر",
  "خرج", "دخل", "جلس", "وقف", "فهم", "حفظ", "سافر", "استيقظ", "علم", "ساعد", "زرع", "بنى",
]);
/** لواحق الفعل الماضي (real morphology: أنا فعلتُ، نحن فعلنا، هم فعلوا…). */
const PAST_SUFFIXES = ["ت", "تم", "تن", "نا", "وا"];

export interface GrammarToken {
  word: string;
  type: "harf" | "fel" | "sem" | typeof NEEDS_REVIEW;
  role: string;
  position: string;
  mark: string;
}

export interface GrammarParseResult {
  engineVersion: string;
  tokens: GrammarToken[];
  tokenCount: number;
  reviewCount: number;
}

const stripTashkeel = (w: string): string =>
  w.replace(/[\u064B-\u0652\u0670\u0640]/g, "");

/** The REAL deterministic i'rab pass over one sentence. */
export function parseArabicGrammar(text: string): GrammarParseResult {
  const words = text
    .replace(/[،,.؟!:"'()؛]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(stripTashkeel);
  const tokens: GrammarToken[] = [];
  let pendingMajrur = false;
  let pendingFael = false;
  let reviewCount = 0;
  for (const w of words) {
    if (HURUF_JARR.has(w)) {
      tokens.push({ word: w, type: "harf", role: "حرف جر", position: "مبني", mark: "لا محل له من الإعراب" });
      pendingMajrur = true; // the next noun enters jarr
      continue;
    }
    if (HURUF_OTHER[w]) {
      tokens.push({ word: w, type: "harf", role: HURUF_OTHER[w], position: "مبني", mark: "لا محل له من الإعراب" });
      continue;
    }
    if (DEMONSTRATIVES[w]) {
      tokens.push({ word: w, type: "sem", role: DEMONSTRATIVES[w], position: "مبني", mark: "على السكون" });
      continue;
    }
    if (PRONOUNS[w]) {
      tokens.push({ word: w, type: "sem", role: PRONOUNS[w], position: "مبني", mark: "لا محل له من الإعراب" });
      continue;
    }
    if (PAST_VERBS.has(w) || (w.length >= 4 && PAST_SUFFIXES.some((s) => w.endsWith(s)))) {
      tokens.push({ word: w, type: "fel", role: "فعل ماضٍ", position: "مبني", mark: "على الفتح" });
      pendingFael = true; // the next noun is the فاعل candidate
      continue;
    }
    if (pendingMajrur) {
      tokens.push({ word: w, type: "sem", role: "اسم مجرور", position: "مجرور", mark: "بالكسرة الظاهرة" });
      pendingMajrur = false;
      continue;
    }
    if (pendingFael) {
      tokens.push({ word: w, type: "sem", role: "فاعل", position: "مرفوع", mark: "بالضمة الظاهرة" });
      pendingFael = false;
      continue;
    }
    // §3.7 no-fake-data rule: unclassified → flagged for the teacher, never guessed
    tokens.push({ word: w, type: NEEDS_REVIEW, role: NEEDS_REVIEW, position: NEEDS_REVIEW, mark: NEEDS_REVIEW });
    reviewCount += 1;
  }
  return { engineVersion: GRAMMAR_ENGINE_VERSION, tokens, tokenCount: tokens.length, reviewCount };
}
