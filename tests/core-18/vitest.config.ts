import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * CORE-18 — Student Identity & Tenant Membership Foundation.
 * Runs against REAL PostgreSQL built by the CANONICAL migration path
 * (db-migrate.mjs from 0000 + 0001). Skipped unless CORE18_RUNTIME=1.
 */
const root = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@buytuk/contracts": `${root}packages/contracts/src/index.ts`,
      "@workspace/config": `${root}packages/config/src/index.ts`,
      "@workspace/observability": `${root}packages/observability/src/index.ts`,
      "@workspace/security": `${root}packages/security/src/index.ts`,
      "@workspace/queue": `${root}packages/queue/src/index.ts`,
      "@workspace/db/identity-membership": `${root}packages/database/src/identity/membership.ts`,
      "@workspace/db": `${root}packages/database/src/index.ts`,
      "@workspace/events": `${root}packages/events/src/index.ts`,
      "@workspace/decisions": `${root}packages/decisions/src/index.ts`,
      "@workspace/learning-loop": `${root}packages/learning-loop/src/index.ts`,
      "@workspace/intelligence": `${root}packages/intelligence/src/index.ts`,
      "@workspace/curriculum": `${root}packages/curriculum/src/index.ts`,
      "@dictation-engine": `${root}engines/dictation-engine/src/index.ts`,
      "@numeracy-engine": `${root}engines/numeracy-engine/src/index.ts`,
      "@assessment-engine": `${root}engines/assessment-engine/src/index.ts`,
    },
  },
  test: {
    include: ["tests/core-18/**/*.test.ts"],
    env: {
      DATABASE_URL: process.env.CORE18_DB_URL ?? "postgres://postgres@127.0.0.1:5432/core18_verify",
      REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      CORE18_RUNTIME: "1",
    },
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
