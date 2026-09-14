import { injectable } from "inversify";
import { scoringConfig } from "../../config/scoring.config.js";
import { logger } from "../observability/logger.js";
import type {
  AlignmentResult,
  ReadingScore,
  AudioFeatures,
  WordAlignment
} from "@buytuk/contracts";

/**
 * Reading Score Engine
 *
 * Calculates comprehensive reading score based on:
 *   - Accuracy (word-level)
 *   - Pronunciation (phoneme-level)
 *   - Fluency (speed + rhythm)
 *   - Prosody (intonation + stress)
 */
@injectable()
export class ReadingScoreEngine {
  compute(
    alignment: AlignmentResult,
    wordAlignments: WordAlignment[],
    features: AudioFeatures,
    durationSec: number,
    expectedWordCount: number
  ): ReadingScore {
    const { weights } = scoringConfig;

    const accuracy = this.calculateAccuracy(alignment);
    const pronunciation = this.calculatePronunciation(wordAlignments);
    const fluency = this.calculateFluency(features, durationSec, expectedWordCount);
    const prosody = this.calculateProsody(features);
    const wpm = (expectedWordCount / Math.max(durationSec, 1)) * 60;

    const overall =
      weights.accuracy * accuracy +
      weights.pronunciation * pronunciation +
      weights.fluency * fluency +
      weights.prosody * prosody;

    return {
      overall: this.round(overall),
      accuracy: this.round(accuracy),
      pronunciation: this.round(pronunciation),
      fluency: this.round(fluency),
      prosody: this.round(prosody),
      wpm: this.round(wpm),
      durationSec: this.round(durationSec),
    };
  }

  private calculateAccuracy(alignment: AlignmentResult): number {
    return (1 - alignment.wordErrorRate) * 100;
  }

  private calculatePronunciation(wordAlignments: WordAlignment[]): number {
    if (wordAlignments.length === 0) return 0;

    let totalScore = 0;
    let count = 0;

    for (const w of wordAlignments) {
      if (w.phonemeAlignment) {
        totalScore += w.phonemeAlignment.score;
        count++;
      }
    }

    return count > 0 ? (totalScore / count) * 100 : 0;
  }

  private calculateFluency(
    features: AudioFeatures,
    durationSec: number,
    expectedWordCount: number
  ): number {
    const { idealWpm, minWpm, maxWpm } = scoringConfig;

    const wpm = (expectedWordCount / Math.max(durationSec, 1)) * 60;
    let speedScore = 0;

    if (wpm >= idealWpm * 0.8 && wpm <= idealWpm * 1.2) {
      speedScore = 100;
    } else if (wpm < minWpm) {
      speedScore = (wpm / minWpm) * 60;
    } else if (wpm > maxWpm) {
      speedScore = Math.max(0, 100 - (wpm - maxWpm) * 2);
    } else {
      speedScore = 80;
    }

    const pauseScore = (1 - features.pauseRatio) * 100;
    const rateScore = Math.min(100, features.speechRate * 10);

    return speedScore * 0.5 + pauseScore * 0.3 + rateScore * 0.2;
  }

  private calculateProsody(features: AudioFeatures): number {
    const pitchScore = Math.min(100, features.prosodyVariance * 2);
    const hnrScore = Math.min(100, features.hnr * 5);

    const energyVariance = this.stdDev(features.energy);
    const energyScore = Math.min(100, energyVariance * 100);

    return pitchScore * 0.4 + hnrScore * 0.3 + energyScore * 0.3;
  }

  private stdDev(arr: number[]): number {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  }

  private round(n: number, decimals: number = 1): number {
    return Math.round(n * 10 ** decimals) / 10 ** decimals;
  }
}
