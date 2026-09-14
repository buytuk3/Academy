/**
 * P2-2 / ACR-E6-001 — GatewayLLMAdapter: the FIRST real LLMProvider.
 *
 * Reuses the EXISTING gRPC client (pipeline/inference-client.ts) and the
 * EXISTING `Feedback` RPC declared in inference-gateway/proto/inference.proto
 * (FeedbackRequest{prompt, model, temperature, correlation_id} →
 *  FeedbackResponse{text, model_used, tokens_used}) — zero client rewrite;
 * only additive options (deadline + x-tenant-id metadata) were added there.
 *
 * P2-6: timeout is ENFORCED (gRPC deadline from llmConfig/pipelineConfig) and
 * retry is BOUNDED (pipelineConfig.retry.maxRetries) and ONLY for retryable
 * codes (DEADLINE_EXCEEDED→TIMEOUT, UNAVAILABLE→INFERENCE_UNAVAILABLE — the
 * same retryable names declared in pipelineConfig.retry.retryableErrors).
 * Observability: duration + model_used + tokens_used logged; NEVER the prompt.
 */
import { callInferenceGateway } from "../../pipeline/inference-client.js";
import { pipelineConfig } from "../../../config/pipeline.config.js";
import { logger } from "../../observability/logger.js";
import { llmConfig } from "./config.js";
import { LLMProviderError, type LLMCompleteRequest, type LLMCompleteResult, type LLMProvider } from "./types.js";

/** gRPC status codes mapped to the retry policy declared in pipelineConfig.retry. */
const GRPC_RETRYABLE_CODES = new Set([4, 14]); // DEADLINE_EXCEEDED, UNAVAILABLE

function mapGrpcError(err: any): LLMProviderError {
  const code = typeof err?.code === "number" ? err.code : -1;
  if (code === 4) return new LLMProviderError("TIMEOUT", "LLM gateway deadline exceeded", true, err);
  if (code === 14) return new LLMProviderError("INFERENCE_UNAVAILABLE", "LLM gateway unavailable", true, err);
  if (code === 16) return new LLMProviderError("AUTH_REJECTED", "LLM gateway rejected credentials", false, err);
  if (code === 3 || code === 8)
    return new LLMProviderError("LLM_REQUEST_INVALID", "LLM gateway rejected the request", false, err);
  return new LLMProviderError("INFERENCE_ERROR", "LLM gateway call failed", false, err);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GatewayLLMAdapter implements LLMProvider {
  readonly name = "gateway";

  async complete(request: LLMCompleteRequest): Promise<LLMCompleteResult> {
    const startedAt = Date.now();
    const log = logger.child({ component: "GatewayLLMAdapter", correlationId: request.correlationId });

    let lastError: LLMProviderError | null = null;
    for (let attempt = 0; attempt <= pipelineConfig.retry.maxRetries; attempt++) {
      try {
        const res = await callInferenceGateway<any>("Feedback", {
          prompt: request.prompt,
          model: request.model ?? llmConfig.model,
          temperature: request.temperature ?? llmConfig.temperature,
          correlation_id: request.correlationId ?? "",
        }, { deadlineMs: request.timeoutMs ?? llmConfig.timeoutMs, tenantId: request.tenantId });

        if (typeof res?.text !== "string" || res.text.length === 0) {
          throw new LLMProviderError("LLM_BAD_RESPONSE", "Feedback RPC returned no text");
        }
        const result: LLMCompleteResult = {
          text: res.text,
          modelUsed: String(res.model_used ?? request.model ?? llmConfig.model ?? "gateway"),
          tokensUsed: Number(res.tokens_used ?? 0),
        };
        log.info({ durationMs: Date.now() - startedAt, modelUsed: result.modelUsed, tokensUsed: result.tokensUsed, attempts: attempt + 1 }, "LLM call succeeded");
        return result;
      } catch (err) {
        lastError = err instanceof LLMProviderError ? err : mapGrpcError(err);
        // Bounded retry — ONLY retryable codes; never an unbounded LLM spend.
        if (!lastError.retryable || attempt === pipelineConfig.retry.maxRetries) break;
        log.warn({ attempt: attempt + 1, code: lastError.code }, "LLM call retryable failure — retrying with backoff");
        await delay(Math.min(200 * 2 ** attempt, 1000));
      }
    }
    throw lastError ?? new LLMProviderError("INFERENCE_ERROR", "LLM gateway call failed");
  }
}
