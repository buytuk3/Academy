import { config } from "@workspace/config";
import { createLogger } from "@workspace/observability";

/** Canonical logger for the API composition layer (owner: packages/observability). */
export const logger = createLogger({
  level: config.observability.logLevel,
  name: "buytuk-api",
});
