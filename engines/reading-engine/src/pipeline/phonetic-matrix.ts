/**
 * Phonetic Distance Matrix for Arabic phonemes
 *
 * Based on distinctive features (place, manner, voicing, emphasis)
 * Distance: 0.0 (identical) → 1.0 (completely different)
 */

export const PHONETIC_MATRIX: Record<string, Record<string, number>> = {
  "θ": { "s": 0.25, "z": 0.45, "ð": 0.30, "t": 0.55, "d": 0.65 },
  "s": { "θ": 0.25, "z": 0.20, "sˤ": 0.35, "ʃ": 0.40 },
  "z": { "s": 0.20, "ð": 0.35, "zˤ": 0.35 },
  "ð": { "θ": 0.30, "z": 0.35, "d": 0.40 },
  "q": { "k": 0.30, "g": 0.40, "ʔ": 0.55, "ɣ": 0.45 },
  "k": { "q": 0.30, "g": 0.35, "ʔ": 0.50 },
  "sˤ": { "s": 0.35, "zˤ": 0.30, "dˤ": 0.40 },
  "dˤ": { "zˤ": 0.30, "sˤ": 0.40, "tˤ": 0.35 },
  "tˤ": { "dˤ": 0.35, "t": 0.40 },
  "zˤ": { "z": 0.35, "dˤ": 0.30, "sˤ": 0.30 },
  "ħ": { "h": 0.40, "ʕ": 0.35, "x": 0.45 },
  "h": { "ħ": 0.40, "ʔ": 0.50 },
  "ʕ": { "ħ": 0.35, "ʔ": 0.55, "ɣ": 0.40 },
  "ʔ": { "h": 0.50, "ʕ": 0.55, "q": 0.55 },
  "b": { "p": 0.20, "m": 0.40, "f": 0.55 },
  "m": { "b": 0.40, "n": 0.30, "w": 0.55 },
  "f": { "b": 0.55, "v": 0.20 },
  "t": { "d": 0.20, "θ": 0.55, "tˤ": 0.40 },
  "d": { "t": 0.20, "ð": 0.40, "dˤ": 0.40 },
  "n": { "l": 0.35, "m": 0.30, "r": 0.45 },
  "l": { "n": 0.35, "r": 0.40 },
  "r": { "l": 0.40, "n": 0.45 },
  "a": { "aː": 0.15, "i": 0.40, "u": 0.45 },
  "aː": { "a": 0.15, "iː": 0.40, "uː": 0.45 },
  "i": { "iː": 0.15, "a": 0.40, "u": 0.45 },
  "iː": { "i": 0.15, "aː": 0.40, "uː": 0.45 },
  "u": { "uː": 0.15, "a": 0.45, "i": 0.45 },
  "uː": { "u": 0.15, "aː": 0.45, "iː": 0.45 },
};

const DEFAULT_DISTANCE = 0.85;

export class PhoneticMatrix {
  distance(a: string, b: string): number {
    if (a === b) return 0.0;
    const row = PHONETIC_MATRIX[a];
    if (row && row[b] !== undefined) return row[b];
    const col = PHONETIC_MATRIX[b];
    if (col && col[a] !== undefined) return col[a];
    return DEFAULT_DISTANCE;
  }

  similarity(a: string, b: string): number {
    return 1 - this.distance(a, b);
  }
}
