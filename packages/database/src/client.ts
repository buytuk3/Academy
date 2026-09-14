/**
 * packages/database — single DB client/pool. Source of truth: @workspace/config.
 * (P4.9: process.env reads for DB moved to config; no new pools anywhere.)
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "@workspace/config";
import { createLogger } from "@workspace/observability";
import * as schema from "./schema/index.js";

const logger = createLogger({ name: "@workspace/database" });
const DATABASE_URL = config.db.url;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required (packages/config)");
}

const client = postgres(DATABASE_URL, {
  min: config.db.poolMin,
  max: config.db.poolMax,
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: (notice: unknown) => {
    logger.debug({ notice }, "DB notice");
  },
} as any);

export const db = drizzle(client, {
  schema,
  logger: {
    logQuery(query, params) {
      logger.debug({ query, params: params.slice(0, 5) }, "DB query");
    },
  },
});

export * from "./schema/index.js";

export async function healthCheck(): Promise<boolean> {
  try {
    await client`SELECT 1`;
    logger.info("DB health check passed");
    return true;
  } catch (err) {
    logger.error({ err }, "DB health check failed");
    return false;
  }
}

export async function closeConnection(): Promise<void> {
  await client.end({ timeout: 5 });
}
