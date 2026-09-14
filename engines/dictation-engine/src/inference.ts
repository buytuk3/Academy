/**
 * Inference Boundary (CORE-14R/S/T) — NOT invoked in CORE-14.
 * Future path: Dictation Engine -> Contract -> Inference Gateway ->
 * Provider/Model -> Measurement -> Evidence. The engine never calls a
 * provider directly. Foundation uses deterministic RULE comparison only.
 */
import type { LanguageCode } from "./contracts.js";

export type MeasurementSource = "RULE" | "STATISTICAL" | "ML" | "AI" | "TEACHER";

/** Replaceable STT provider — swap providers without touching domain logic. */
export interface SpeechRecognitionProvider {
  readonly providerName: string;
  transcribe(audioRef: string, language: LanguageCode): Promise<{
    readonly text: string;
    readonly confidence: number;
    readonly source: Exclude<MeasurementSource, "RULE">;
  }>;
}

/** Transport contract toward the Inference Gateway (unused in CORE-14). */
export interface InferenceGateway {
  readonly name: string;
  readonly provider: SpeechRecognitionProvider;
}

export const DICTATION_MEASUREMENT_SOURCE: MeasurementSource = "RULE";
