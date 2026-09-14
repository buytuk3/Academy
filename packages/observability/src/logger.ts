/**
 * @workspace/observability — logger.ts
 * Canonical structured logger (pino). Single owner of logger instances.
 */
import { pino, type Logger, type LoggerOptions } from "pino";

export type { Logger };

export interface LoggerConfig {
  level?: string;
  name?: string;
  base?: Record<string, unknown>;
}

export function createLogger(opts: LoggerConfig = {}): Logger {
  const options: LoggerOptions = {
    level: opts.level ?? "info",
    base: opts.base ?? { service: opts.name ?? "buytuk" },
  };
  return pino(options);
}
