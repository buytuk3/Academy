import { injectable } from "inversify";
import { modelsConfig } from "../../config/models.config.js";
import type {
  AlignmentOp,
  AlignmentResult,
  ReadingScore,
  MasteryResult,
  GapResult,
  Recommendation,
  AIFeedback,
  FullReport,
  WordReportItem,
  PhonemeReportItem,
  WordAlignment,
} from "@buytuk/contracts";

/**
 * Report Generator
 *
 * Builds comprehensive word-level + phoneme-level report
 */
@injectable()
export class ReportGenerator {
  build(
    expected: string,
    actual: string,
    alignment: AlignmentResult,
    wordAlignments: WordAlignment[],
    reading: ReadingScore,
    mastery: MasteryResult,
    gaps: GapResult,
    recommendations: Recommendation[],
    aiFeedback: AIFeedback[],
    attemptId: string,
    passageId: string,
    studentId: string,
    tenantId: string
  ): FullReport {
    const wordReport = this.buildWordReport(wordAlignments, alignment.wordOps);

    return {
      attemptId,
      passageId,
      studentId,
      tenantId,
      expected,
      actual,
      wordReport,
      reading,
      mastery,
      gaps,
      recommendations,
      aiFeedback,
      createdAt: new Date().toISOString(),
      modelVersions: {
        whisper: modelsConfig.whisper.version,
        alignment: modelsConfig.forcedAlignment.version,
        g2p: modelsConfig.g2p.version,
      },
    };
  }

  buildWordReport(
    wordAlignments: WordAlignment[],
    wordOps: AlignmentOp[]
  ): WordReportItem[] {
    const report: WordReportItem[] = [];

    for (let i = 0; i < wordOps.length; i++) {
      const op = wordOps[i];
      const alignment = wordAlignments[i];

      const item: WordReportItem = {
        word: (op as any).expected || (op as any).actual || "",
        status: this.mapOpToStatus(op.type),
      };

      if (op.type === "substitution") {
        item.actual = (op as any).actual;
      }

      if (alignment) {
        item.confidence = alignment.confidence;
        item.durationMs = Math.round((alignment.end - alignment.start) * 1000);

        if (alignment.phonemeAlignment) {
          item.phonemeReport = this.buildPhonemeReport(alignment.phonemeAlignment);
        }
      }

      report.push(item);
    }

    return report;
  }

  private buildPhonemeReport(phonemeAlignment: any): PhonemeReportItem[] {
    const report: PhonemeReportItem[] = [];

    for (let i = 0; i < phonemeAlignment.expected.length; i++) {
      const expected = phonemeAlignment.expected[i];
      const actual = phonemeAlignment.actual[i];

      const item: PhonemeReportItem = {
        phoneme: expected,
        status: expected === actual ? "correct" : "wrong",
        actual,
      };

      const error = phonemeAlignment.errors.find((e: any) => e.position === i);
      if (error) {
        item.status = error.type === "deletion" ? "missing" : "wrong";
        item.phoneticDistance = error.phoneticDistance;
        item.articulationNote = this.getArticulationNote(error);
      }

      report.push(item);
    }

    return report;
  }

  private mapOpToStatus(
    type: string
  ): "correct" | "wrong" | "missing" | "extra" | "repeated" | "skipped" {
    switch (type) {
      case "match": return "correct";
      case "substitution": return "wrong";
      case "deletion": return "missing";
      case "insertion": return "extra";
      default: return "wrong";
    }
  }

  private getArticulationNote(error: any): string {
    if (!error.expected || !error.actual) return "";

    const notes: Record<string, string> = {
      "θ→s": "الثاء تُنطق بوضع طرف اللسان بين الثنايا",
      "q→k": "القاف تُنطق من أقصى اللسان",
      "dˤ→zˤ": "الضاد مفخّمة أكثر من الظاء",
      "ħ→h": "الحاء تُنطق من الحلق",
    };

    const key = `${error.expected}→${error.actual}`;
    return notes[key] || "";
  }
}
