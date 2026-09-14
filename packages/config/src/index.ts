/**
 * @workspace/config — canonical infrastructure/runtime configuration owner.
 * Direction: leaf. Must never import queue/observability/security or engines.
 */
export * from "./env.js";
export * from "./runtime.js";

import { loadConfig, type RuntimeConfig } from "./runtime.js";

const warnings: string[] = [];
/** Singleton config bound to process.env at load time. */
export const config: RuntimeConfig = loadConfig(process.env, {
  strict: process.env.NODE_ENV === "production",
  warnings,
});
/** Warnings collected during non-strict load (dev defaults applied). */
export const configWarnings: readonly string[] = warnings;

export type Config = RuntimeConfig;
