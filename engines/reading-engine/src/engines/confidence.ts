import { injectable } from "inversify";
import { scoringConfig } from "../../config/scoring.config.js";
import { logger } from "../observability/logger.js";
import type { WordTimestamp, WordAlignment } from "@buytuk/contracts";

/**
 * Confidence Engine
 *
 * Aggregates confidence scores from multiple sources:
 *   - Whisper STT confidence
 *   - Forced alignment score
 *   - Phoneme alignment score
 */
@injectable()
export class ConfidenceEngine {
  calculateWordConfidence(
    sttWord: WordTimestamp,
    alignment?: WordAlignment
  ): number {
    const weights = {
      stt: 0.4,
      alignment: 0.3,
      phoneme: 0.3,
    };

    let confidence = sttWord.confidence * weights.stt;

    if (alignment) {
      confidence += alignment.score * weights.alignment;

      if (alignment.phonemeAlignment) {
        confidence += alignment.phonemeAlignment.score * weights.phoneme;
      }
    }

    return Math.min(1, Math.max(0, confidence));
  }

  calculateOverallConfidence(wordConfidences: number[]): number {
    if (wordConfidences.length === 0) return 0;

    let totalWeight = 0;
    let weightedSum = 0;

    for (let i = 0; i < wordConfidences.length; i++) {
      const weight = 1 + (i / wordConfidences.length) * 0.5;
      weightedSum += wordConfidences[i] * weight;
      totalWeight += weight;
    }

    return weightedSum / totalWeight;
  }

  isAcceptable(confidence: number): boolean {
    return confidence >= scoringConfig.confidence.minAcceptable;
  }

  getLevel(confidence: number): "high" | "medium" | "low" {
    if (confidence >= 0.8) return "high";
    if (confidence >= 0.6) return "medium";
    return "low";
  }

  flagLowConfidence(
    words: Array<{ word: string; confidence: number }>
  ): string[] {
    return words
      .filter(w => w.confidence < scoringConfig.confidence.lowConfidenceThreshold)
      .map(w => w.word);
  }
}
