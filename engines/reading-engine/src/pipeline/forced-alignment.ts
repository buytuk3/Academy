import { injectable } from "inversify";
import { callInferenceGateway } from "./inference-client.js";
import { G2PEngine } from "./g2p.js";
import { IPAMapper } from "./ipa-mapper.js";
import { AlignmentEngine } from "./alignment.js";
import { modelsConfig } from "../../config/models.config.js";
import { logger } from "../observability/logger.js";
import { metrics } from "../observability/metrics.js";
import type { WordAlignment, PhonemeAlignment, PhonemeError } from "@buytuk/contracts";

/**
 * Two-stage forced alignment:
 *   Stage 1: WhisperX (word-level)
 *   Stage 2: MMS-fa (phoneme-level)
 */
@injectable()
export class ForcedAlignment {
  private g2p: G2PEngine;
  private ipa: IPAMapper;
  private aligner: AlignmentEngine;

  constructor() {
    this.g2p = new G2PEngine();
    this.ipa = new IPAMapper();
    this.aligner = new AlignmentEngine();
  }

  async align(
    audio: Float32Array,
    sampleRate: number,
    transcript: string,
    correlationId?: string
  ): Promise<WordAlignment[]> {
    const log = logger.child({ component: "ForcedAlignment", correlationId });
    const startTime = Date.now();

    const wordAlignments = await this.alignWords(audio, sampleRate, transcript, correlationId);

    const results: WordAlignment[] = [];
    for (const w of wordAlignments) {
      const phonemeAlignment = await this.alignPhonemes(
        audio, sampleRate, w.word, w.start, w.end, correlationId
      );
      results.push({ ...w, phonemeAlignment });
    }

    const duration = (Date.now() - startTime) / 1000;
    metrics.pipelineDuration.labels("forced_alignment").observe(duration);

    log.info({ duration, words: results.length }, "Forced alignment completed");

    return results;
  }

  private async alignWords(
    audio: Float32Array,
    sampleRate: number,
    transcript: string,
    correlationId?: string
  ): Promise<WordAlignment[]> {
    const { forcedAlignment: cfg } = modelsConfig;

    const response = await callInferenceGateway<any>("AlignWord", {
      audio: Array.from(audio),
      sample_rate: sampleRate,
      transcript,
      batch_size: cfg.parameters.batch_size,
      align_model: cfg.parameters.align_model,
      correlation_id: correlationId,
    });

    return response.words.map((w: any) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      score: w.score,
      confidence: w.confidence,
    }));
  }

  private async alignPhonemes(
    audio: Float32Array,
    sampleRate: number,
    word: string,
    start: number,
    end: number,
    correlationId?: string
  ): Promise<PhonemeAlignment> {
    const diacritized = await this.g2p.diacritize(word, correlationId);
    const expected = this.ipa.toIPA(diacritized);

    const segment = audio.slice(
      Math.floor(start * sampleRate),
      Math.floor(end * sampleRate)
    );

    const { phonemeRecognizer: cfg } = modelsConfig;
    const response = await callInferenceGateway<any>("AlignPhoneme", {
      audio: Array.from(segment),
      sample_rate: sampleRate,
      language: cfg.parameters.language,
      return_timestamps: cfg.parameters.return_timestamps,
      correlation_id: correlationId,
    });

    const actual: string[] = response.phonemes;

    const dtw = this.aligner.align(expected, actual, correlationId);

    const errors: PhonemeError[] = [];
    let pos = 0;
    for (const op of dtw.ops) {
      if (op.type === "match") { pos++; continue; }
      errors.push({
        type: op.type as any,
        expected: (op as any).expected,
        actual: (op as any).actual,
        position: pos,
        phoneticDistance: op.cost,
        severity: this.severity(op.cost),
      });
      pos++;
    }

    const score = 1 - dtw.normalizedDistance;
    return { expected, actual, errors, score };
  }

  private severity(distance: number): "high" | "medium" | "low" {
    if (distance < 0.3) return "low";
    if (distance < 0.6) return "medium";
    return "high";
  }
}
