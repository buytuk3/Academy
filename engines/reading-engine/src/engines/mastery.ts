import { injectable } from "inversify";
import { scoringConfig } from "../../config/scoring.config.js";
import type { MasteryResult, MasteryLevel } from "@buytuk/contracts";

/**
 * Mastery Engine
 *
 * Tracks student progress over time:
 *   - Compares current score with historical average
 *   - Determines mastery level
 *   - Identifies trend (improving/declining/stable)
 */
@injectable()
export class MasteryEngine {
  compute(currentScore: number, history: number[]): MasteryResult {
    const { mastery } = scoringConfig;

    const avg = history.length > 0
      ? history.reduce((a, b) => a + b, 0) / history.length
      : currentScore;

    const delta = currentScore - avg;
    const level = this.determineLevel(currentScore, mastery);
    const trend = this.determineTrend(delta);
    const attempts = history.length + 1;

    return {
      level,
      delta: this.round(delta),
      attempts,
      trend,
    };
  }

  private determineLevel(
    score: number,
    thresholds: typeof scoringConfig.mastery
  ): MasteryLevel {
    if (score >= thresholds.mastered) return "MASTERED";
    if (score >= thresholds.progressing) return "PROGRESSING";
    if (score >= thresholds.developing) return "DEVELOPING";
    return "NEEDS_SUPPORT";
  }

  private determineTrend(delta: number): "up" | "down" | "stable" {
    if (delta > 3) return "up";
    if (delta < -3) return "down";
    return "stable";
  }

  predictNextScore(currentScore: number, trend: "up" | "down" | "stable"): number {
    const adjustments = {
      up: 5,
      stable: 0,
      down: -3,
    };
    return Math.max(0, Math.min(100, currentScore + adjustments[trend]));
  }

  isReadyForNextLevel(
    currentLevel: MasteryLevel,
    recentScores: number[]
  ): boolean {
    if (currentLevel !== "MASTERED") return false;
    if (recentScores.length < 3) return false;
    return recentScores.slice(-3).every(s => s >= 85);
  }

  private round(n: number): number {
    return Math.round(n * 10) / 10;
  }
}
