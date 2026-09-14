/**
 * Central configuration export
 */
export { audioConfig } from "./audio.config.js";
export { scoringConfig } from "./scoring.config.js";
export { pipelineConfig } from "./pipeline.config.js";
export { securityConfig } from "./security.config.js";
export { modelsConfig } from "./models.config.js";

import { audioConfig } from "./audio.config.js";
import { scoringConfig } from "./scoring.config.js";
import { pipelineConfig } from "./pipeline.config.js";
import { securityConfig } from "./security.config.js";
import { modelsConfig } from "./models.config.js";

export const config = {
  audio: audioConfig,
  scoring: scoringConfig,
  pipeline: pipelineConfig,
  security: securityConfig,
  models: modelsConfig,
} as const;

export type Config = typeof config;
