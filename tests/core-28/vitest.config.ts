import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * CORE-28 / E1 — Teacher Runtime E2E: FULL educational cycle over REAL HTTP.
 * Real PostgreSQL (core28_verify) + real Redis + real API app. Nothing mocked.
 * Dedicated DB so the E1 proof never reuses core27 verification state.
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
      "@workspace/db": `${root}packages/database/src/index.ts`,
      "@workspace/events": `${root}packages/events/src/index.ts`,
      "@workspace/decisions": `${root}packages/decisions/src/index.ts`,
      "@workspace/curriculum": `${root}packages/curriculum/src/index.ts`,
      "@workspace/intelligence": `${root}packages/intelligence/src/index.ts`,
      "@workspace/learning-loop": `${root}packages/learning-loop/src/index.ts`,
      "@reading-engine/": `${root}engines/reading-engine/src/`,
      "@dictation-engine/": `${root}engines/dictation-engine/src/`,
      "@numeracy-engine": `${root}engines/numeracy-engine/src/index.ts`,
      "@assessment-engine": `${root}engines/assessment-engine/src/index.ts`,
    },
  },
  test: {
    include: ["tests/core-28/**/*.test.ts"],
    env: {
      DATABASE_URL: process.env.CORE28_DB_URL ?? "postgres://core27:c27_vZ8pQ2wR@127.0.0.1:5432/core28_verify",
      REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      JWT_SECRET: process.env.JWT_SECRET ?? "dev-secret-change-me",
      CORE28_E2E: "1",
    },
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
