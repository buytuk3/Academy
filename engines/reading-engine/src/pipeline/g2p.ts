import { injectable } from "inversify";
import { callInferenceGateway } from "./inference-client.js";
import { modelsConfig } from "../../config/models.config.js";
import { logger } from "../observability/logger.js";
import { metrics } from "../observability/metrics.js";

/**
 * Grapheme-to-Phoneme using CAMeL Tools
 *
 * Pipeline:
 *   word → CAMeL (diacritize + morph analysis) → diacritized text
 *
 * Note: CAMeL does NOT output IPA directly.
 * Use IPAMapper to convert diacritized text → IPA.
 */
@injectable()
export class G2PEngine {
  private cache = new Map<string, string>();

  async diacritize(word: string, correlationId?: string): Promise<string> {
    const log = logger.child({ component: "G2P", correlationId });
    const startTime = Date.now();

    if (this.cache.has(word)) {
      return this.cache.get(word)!;
    }

    try {
      const response = await callInferenceGateway<any>("G2P", {
        word,
        diacritize: true,
        morph_analysis: true,
        correlation_id: correlationId,
      });

      const diacritized = response.diacritized;
      this.cache.set(word, diacritized);

      const duration = (Date.now() - startTime) / 1000;
      metrics.pipelineDuration.labels("g2p").observe(duration);

      log.info({ word, diacritized, duration }, "G2P completed");

      return diacritized;
    } catch (err) {
      log.error({ err, word }, "G2P failed");
      throw err;
    }
  }

  async diacritizeSentence(text: string, correlationId?: string): Promise<string> {
    const words = text.split(/\s+/).filter(Boolean);
    const diacritized: string[] = [];

    for (const word of words) {
      const d = await this.diacritize(word, correlationId);
      diacritized.push(d);
    }

    return diacritized.join(" ");
  }

  async morphAnalysis(word: string, correlationId?: string): Promise<any> {
    const response = await callInferenceGateway<any>("G2P", {
      word,
      diacritize: false,
      morph_analysis: true,
      correlation_id: correlationId,
    });

    return response.morphology;
  }
}
