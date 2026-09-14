/**
 * TEMPORARY COMPATIBILITY LAYER — canonical owner: packages/observability.
 * Removal target: P5. Consumers import { logger } from here until P5.
 */
import { config } from "@workspace/config";
import { createLogger } from "@workspace/observability";

export const logger = createLogger({
  level: config.observability.logLevel,
  name: "reading-engine",
});
