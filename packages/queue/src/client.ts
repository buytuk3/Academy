/**
 * @workspace/queue — client.ts
 * Canonical Redis/BullMQ client. Single owner of the Redis connection.
 */
import { Redis } from "ioredis";
import { config } from "@workspace/config";
import { createLogger } from "@workspace/observability";

const log = createLogger({ level: config.observability.logLevel, name: "queue" });

const rawPrefix = config.redis.prefix || "buytuk";
// BullMQ rejects ioredis-level keyPrefix ("ioredis does not support ioredis
// prefixes"): namespacing MUST go through BullMQ's own `prefix` option.
export const queuePrefix = rawPrefix.endsWith(":") ? rawPrefix : rawPrefix + ":";

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => (times > 10 ? null : Math.min(times * 100, 3000)),
});

redis.on("connect", () => log.info("Redis connected"));
redis.on("error", (err) => log.error({ err }, "Redis error"));
