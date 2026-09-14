/**
 * P2-5 / ACR-E6-001 — LLM module configuration (env-only, no secrets logged).
 * Reads process.env directly (same pattern as inference-client.ts): the
 * reading engine owns its business config (P3.1 contract). Secrets stay in
 * env only (INFERENCE_API_KEY for the gateway path) — never in code/archive.
 */
import { pipelineConfig } from "../../../config/pipeline.config.js";

function num(v: string | undefined, def: number): number {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : def;
}

export const llmConfig = {
  /** Provider id — P2 ships exactly one real provider: "gateway" (Feedback RPC). */
  provider: process.env.LLM_PROVIDER ?? "gateway",
  /** Model routing hint forwarded in FeedbackRequest.model (may be empty). */
  model: process.env.LLM_MODEL ?? "",
  /** Sampling temperature (bounded — cost/quality guard). */
  temperature: Math.min(Math.max(num(process.env.LLM_TEMPERATURE, 0.3), 0), 2),
  /** Hard deadline per call — ENFORCED as a gRPC deadline (P2-6). */
  timeoutMs: num(process.env.LLM_TIMEOUT_MS, pipelineConfig.timeouts.aiFeedback),
} as const;
