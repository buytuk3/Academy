/**
 * CORE-15 — Inference Boundary. NOT invoked in CORE-15.
 * Future path: Numeracy Engine -> Inference Contract -> Inference Gateway
 * -> Provider/Model -> Measurement -> Evidence. The engine never calls a
 * provider directly. Foundation uses deterministic RULE comparison only.
 * Handwriting/OCR/voice recognition stay behind replaceable interfaces.
 */
export type MeasurementSource = "RULE" | "STATISTICAL" | "ML" | "AI" | "TEACHER";

/** Replaceable handwriting/OCR provider for handwritten math responses. */
export interface HandwritingRecognitionProvider {
  readonly providerName: string;
  recognize(imageRef: string, language: string): Promise<{ readonly text: string; readonly confidence: number }>;
}

/** Replaceable voice-answer provider (dictation STT reuse allowed later). */
export interface VoiceAnswerRecognitionProvider {
  readonly providerName: string;
  transcribe(audioRef: string, language: string): Promise<{ readonly text: string; readonly confidence: number }>;
}

/** Transport contract toward the Inference Gateway (unused in CORE-15). */
export interface InferenceGateway {
  readonly name: string;
  readonly handwriting?: HandwritingRecognitionProvider;
  readonly voice?: VoiceAnswerRecognitionProvider;
}

export const NUMERACY_MEASUREMENT_SOURCE: MeasurementSource = "RULE";
