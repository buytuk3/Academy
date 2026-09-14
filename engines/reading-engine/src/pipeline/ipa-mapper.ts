import { injectable } from "inversify";

/**
 * Arabic IPA Mapper
 *
 * Converts diacritized Arabic text → IPA phoneme sequence
 *
 * Based on Modern Standard Arabic phonology
 */

interface DiacritizedChar {
  base: string;
  fatha?: boolean;
  kasra?: boolean;
  damma?: boolean;
  sukun?: boolean;
  shadda?: boolean;
  fathatan?: boolean;
  kasratan?: boolean;
  dammatan?: boolean;
}

const CONSONANT_IPA: Record<string, string> = {
  "ء": "ʔ", "ب": "b", "ت": "t", "ث": "θ", "ج": "dʒ",
  "ح": "ħ", "خ": "x", "د": "d", "ذ": "ð", "ر": "r",
  "ز": "z", "س": "s", "ش": "ʃ", "ص": "sˤ", "ض": "dˤ",
  "ط": "tˤ", "ظ": "zˤ", "ع": "ʕ", "غ": "ɣ", "ف": "f",
  "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
  "ه": "h", "و": "w", "ي": "j",
};

@injectable()
export class IPAMapper {
  toIPA(diacritizedWord: string): string[] {
    const phonemes: string[] = [];
    const chars = this.parseDiacritics(diacritizedWord);

    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      const base = c.base;

      if (base === "ا" || base === "ى") {
        phonemes.push("aː");
        continue;
      }

      if (base === "ة") {
        phonemes.push(i === chars.length - 1 ? "h" : "t");
        continue;
      }

      const consonant = CONSONANT_IPA[base];
      if (!consonant) continue;

      if (c.shadda) {
        phonemes.push(consonant);
        phonemes.push(consonant);
      } else {
        phonemes.push(consonant);
      }

      if (c.fatha) phonemes.push("a");
      else if (c.kasra) phonemes.push("i");
      else if (c.damma) phonemes.push("u");
      else if (c.fathatan) phonemes.push("aː");
      else if (c.kasratan) phonemes.push("iː");
      else if (c.dammatan) phonemes.push("uː");
    }

    return phonemes;
  }

  private parseDiacritics(word: string): DiacritizedChar[] {
    const result: DiacritizedChar[] = [];
    let current: DiacritizedChar | null = null;

    for (const ch of word) {
      if (this.isDiacritic(ch)) {
        if (!current) continue;
        switch (ch) {
          case "َ": current.fatha = true; break;
          case "ِ": current.kasra = true; break;
          case "ُ": current.damma = true; break;
          case "ْ": current.sukun = true; break;
          case "ّ": current.shadda = true; break;
          case "ً": current.fathatan = true; break;
          case "ٍ": current.kasratan = true; break;
          case "ٌ": current.dammatan = true; break;
        }
      } else {
        if (current) result.push(current);
        current = { base: ch };
      }
    }
    if (current) result.push(current);
    return result;
  }

  private isDiacritic(ch: string): boolean {
    return /[\u064B-\u0652]/.test(ch);
  }
}
