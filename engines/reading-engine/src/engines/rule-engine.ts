import { injectable } from "inversify";
import { ExerciseLibrary } from "../exercises/library.js";
import type { GapResult, RuleMatch } from "@buytuk/contracts";

/**
 * Rule Engine
 *
 * Selects exercises based on pedagogical rules.
 * LLM is NOT involved in selection — only in reformulation.
 */
@injectable()
export class RuleEngine {
  private library: ExerciseLibrary;

  constructor() {
    this.library = new ExerciseLibrary();
  }

  select(gaps: GapResult): RuleMatch[] {
    const matches: RuleMatch[] = [];

    // Rule 1: Phoneme confusion → minimal pairs
    for (const [key, count] of Object.entries(gaps.phonemeGaps)) {
      if (count < 2) continue;

      const [expected, actual] = key.split("→");
      const exercises = this.library.findByFocus([expected, actual]);

      for (const ex of exercises) {
        if ((ex as any).focus.includes("all")) continue;
        if (ex.type !== "minimal_pairs") continue;

        matches.push({
          exerciseId: ex.id,
          reason: `الخلط بين ${expected} و ${actual} (${count} مرات)`,
          priority: count * 10,
        });
      }
    }

    // Rule 2: Many emphatic errors → syllable drills
    const emphaticErrors = Object.entries(gaps.phonemeGaps)
      .filter(([k]) => /[ˤ]/.test(k))
      .reduce((s, [, c]) => s + c, 0);

    if (emphaticErrors >= 3) {
      matches.push({
        exerciseId: "sd-emphatics",
        reason: `أخطاء متعددة في الحروف المفخّمة (${emphaticErrors})`,
        priority: emphaticErrors * 5,
      });
    }

    // Rule 3: Interdental errors → syllable drills
    const interdentalErrors = Object.entries(gaps.phonemeGaps)
      .filter(([k]) => /[θð]/.test(k))
      .reduce((s, [, c]) => s + c, 0);

    if (interdentalErrors >= 2) {
      matches.push({
        exerciseId: "sd-interdentals",
        reason: `أخطاء في الحروف المثلثية (${interdentalErrors})`,
        priority: interdentalErrors * 7,
      });
    }

    // Rule 4: Problem words → contextual reading
    if (gaps.problemWords.length >= 3) {
      matches.push({
        exerciseId: "cr-short-stories",
        reason: `${gaps.problemWords.length} كلمات مشكلّة تحتاج سياق`,
        priority: 20,
      });
    }

    // Rule 5: High severity errors → tongue twisters
    if (gaps.severityBreakdown.high >= 3) {
      matches.push({
        exerciseId: "tt-sibilants",
        reason: `أخطاء عالية الخطورة (${gaps.severityBreakdown.high})`,
        priority: 25,
      });
    }

    return matches
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3);
  }

  recommendForPhoneme(phoneme: string): RuleMatch | null {
    const exercises = this.library.findByFocus([phoneme]);
    if (exercises.length === 0) return null;

    const ex = exercises[0];
    return {
      exerciseId: ex.id,
      reason: `تمرين على حرف ${phoneme}`,
      priority: 10,
    };
  }
}
