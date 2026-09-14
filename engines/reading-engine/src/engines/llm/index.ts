/**
 * P2 — LLM integration module (ACR-E6-001).
 * The ONLY place vendor/LLM-path code may live (core-15/16 guard: no provider
 * SDKs inside engines outside this module). Engines depend on LLMProvider.
 */
export { GatewayLLMAdapter } from "./gateway-adapter.js";
export { llmConfig } from "./config.js";
export { LLMProviderError, type LLMProvider, type LLMCompleteRequest, type LLMCompleteResult } from "./types.js";
