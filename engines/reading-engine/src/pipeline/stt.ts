import { injectable } from "inversify";
import { callInferenceGateway } from "./inference-client.js";
import { modelsConfig } from "../../config/models.config.js";
import { logger } from "../observability/logger.js";
import { metrics } from "../observability/metrics.js";
import type { STTResult, WordTimestamp } from "@buytuk/contracts";

/**
 * Speech-to-Text using Whisper Large V3
 *
 * Returns word-level timestamps + real confidence scores from Whisper signals:
 *   - no_speech_prob
 *   - avg_logprob
 *   - compression_ratio
 */
@injectable()
export class WhisperSTT {
  async transcribe(
    audio: Float32Array,
    sampleRate: number,
    correlationId?: string
  ): Promise<STTResult> {
    const log = logger.child({ component: "WhisperSTT", correlationId });
    const startTime = Date.now();

    const { whisper: whisperCfg } = modelsConfig;

    try {
      const response = await callInferenceGateway<any>("Transcribe", {
        audio: Array.from(audio),
        sample_rate: sampleRate,
        language: whisperCfg.parameters.language,
        task: whisperCfg.parameters.task,
        word_timestamps: whisperCfg.parameters.word_timestamps,
        chunk_length_s: whisperCfg.parameters.chunk_length_s,
        stride_length_s: whisperCfg.parameters.stride_length_s,
        correlation_id: correlationId,
      });

      const words: WordTimestamp[] = (response.segments || []).flatMap((seg: any) =>
        (seg.words || []).map((w: any) => ({
          word: w.word.trim(),
          start: w.start,
          end: w.end,
          confidence: this.combineConfidence(
            w.no_speech_prob ?? seg.no_speech_prob ?? 0.5,
            w.avg_logprob ?? seg.avg_logprob ?? -0.5,
            seg.compression_ratio ?? 1.0
          ),
          noSpeechProb: w.no_speech_prob ?? seg.no_speech_prob ?? 0,
          avgLogprob: w.avg_logprob ?? seg.avg_logprob ?? 0,
        }))
      );

      const result: STTResult = {
        text: response.text.trim(),
        words,
        language: "ar",
        engine: "whisper-large-v3",
        modelVersion: whisperCfg.version,
      };

      const duration = (Date.now() - startTime) / 1000;
      metrics.pipelineDuration.labels("stt").observe(duration);

      log.info({ duration, words: words.length }, "STT completed");

      return result;
    } catch (err) {
      log.error({ err }, "STT failed");
      throw err;
    }
  }

  /**
   * Combine Whisper's 3 confidence signals into one 0..1 score
   */
  private combineConfidence(noSpeech: number, logprob: number, compression: number): number {
    const speechScore = 1 - noSpeech;
    const logprobScore = Math.max(0, Math.min(1, (logprob + 1)));
    const compressionScore = compression > 2.4 ? 0.3 : 1.0;

    return 0.5 * speechScore + 0.3 * logprobScore + 0.2 * compressionScore;
  }
}
