import { injectable } from "inversify";
import type {
  AlignmentOp,
  GapResult,
  WordAlignment
} from "@buytuk/contracts";

/**
 * Gap Detection Engine
 *
 * Identifies:
 *   - Error distribution by type
 *   - Phoneme-level gaps
 *   - Problem words
 *   - Skipped segments
 *   - Severity breakdown
 */
@injectable()
export class GapEngine {
  compute(
    wordOps: AlignmentOp[],
    wordAlignments: WordAlignment[],
    expectedWords: string[]
  ): GapResult {
    const errorDistribution: Record<string, number> = {};
    const phonemeGaps: Record<string, number> = {};
    const wordFreq: Record<string, number> = {};
    const skipped: string[] = [];
    const severityBreakdown = { high: 0, medium: 0, low: 0 };

    for (const op of wordOps) {
      errorDistribution[op.type] = (errorDistribution[op.type] || 0) + 1;

      if ((op.type === "substitution" || op.type === "deletion") && (op as any).expected) {
        const exp = (op as any).expected;
        wordFreq[exp] = (wordFreq[exp] || 0) + 1;
      }

      if (op.type === "deletion") {
        skipped.push((op as any).expected);
      }
    }

    for (const w of wordAlignments) {
      if (!w.phonemeAlignment) continue;

      for (const err of w.phonemeAlignment.errors) {
        const key = `${err.expected || "?"}→${err.actual || "?"}`;
        phonemeGaps[key] = (phonemeGaps[key] || 0) + 1;

        severityBreakdown[err.severity]++;
      }
    }

    const problemWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => w);

    return {
      errorDistribution,
      phonemeGaps,
      problemWords,
      skippedSegments: skipped,
      severityBreakdown,
    };
  }

  getTopConfusions(phonemeGaps: Record<string, number>, limit: number = 5): string[] {
    return Object.entries(phonemeGaps)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([pair]) => pair);
  }

  isPhonemeProblematic(
    phoneme: string,
    phonemeGaps: Record<string, number>,
    threshold: number = 3
  ): boolean {
    let count = 0;
    for (const [pair, c] of Object.entries(phonemeGaps)) {
      if (pair.includes(phoneme)) count += c;
    }
    return count >= threshold;
  }

  getSeverityRate(gaps: GapResult, totalWords: number): Record<string, number> {
    return {
      high: (gaps.severityBreakdown.high / totalWords) * 100,
      medium: (gaps.severityBreakdown.medium / totalWords) * 100,
      low: (gaps.severityBreakdown.low / totalWords) * 100,
    };
  }
}
