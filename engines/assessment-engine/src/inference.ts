/**
 * CORE-16 — Inference Boundary. NOT invoked in CORE-16.
 * Future path: Assessment Engine -> Inference Contract -> Inference Gateway
 * -> Provider/Model -> Measurement -> Evidence. The engine never calls a
 * provider directly. Handwriting/OCR/voice recognition (future) stay
 * behind replaceable interfaces. Foundation uses deterministic RULE only.
 */
export type MeasurementSource = "RULE" | "STATISTICAL" | "ML" | "AI" | "TEACHER";

export interface RecognitionProvider {
  readonly providerName: string;
  recognize(mediaRef: string, language: string): Promise<{ readonly text: string; readonly confidence: number }>;
}

export interface InferenceGateway {
  readonly name: string;
  readonly provider?: RecognitionProvider;
}

export const ASSESSMENT_MEASUREMENT_SOURCE: MeasurementSource = "RULE";
