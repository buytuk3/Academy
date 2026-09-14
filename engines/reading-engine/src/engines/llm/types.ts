/**
 * P2-1 / ACR-E6-001 — LLM Provider Contract (provider-agnostic abstraction).
 *
 * The Reading Engine depends on THIS interface, never on a vendor SDK
 * (architectural guard: core-15/core-16 forbid provider SDKs inside engines;
 * integrations live exclusively in this llm/ module).
 *
 * Scope guard (P2-GATE-1 approved): LLM is used ONLY for reformulation of
 * already-selected exercises — NEVER for exercise selection (rule-engine.ts)
 * and NEVER for scoring/diagnosis (deterministic engines own those).
 */

/** Request to any LLM provider. PII guard: prompt carries pseudonymous IDs and phonemic errors only. */
export interface LLMCompleteRequest {
  /** Fully-built prompt (Arabic reformulation prompt today). NEVER logged. */
  prompt: string;
  /** Provider/model routing hint (env LLM_MODEL by default). */
  model?: string;
  /** Sampling temperature (env LLM_TEMPERATURE by default). */
  temperature?: number;
  /** Correlation id propagated to logs/metrics (never the prompt body). */
  correlationId?: string;
  /** Tenant context propagated as x-tenant-id metadata (isolation at the Gateway). */
  tenantId?: string;
  /** Hard deadline for THIS call (defaults to pipelineConfig.timeouts.aiFeedback). */
  timeoutMs?: number;
}

/** Normalized provider response (mirrors inference.proto FeedbackResponse). */
export interface LLMCompleteResult {
  text: string;
  modelUsed: string;
  tokensUsed: number;
}

/** The only surface the Reading Engine knows about LLMs. */
export interface LLMProvider {
  /** Stable provider id (e.g. "gateway") — used in logs/metrics labels. */
  readonly name: string;
  complete(request: LLMCompleteRequest): Promise<LLMCompleteResult>;
}

/** Normalized provider error. `retryable` gates the bounded retry policy. */
export class LLMProviderError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
    public readonly retryable = false,
    public readonly cause?: unknown,
  ) {
    super(message ?? code);
    this.name = "LLMProviderError";
  }
}
