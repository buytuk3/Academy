import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * CORE-25 / WAVE-4A — Execution runtime tests (REAL PostgreSQL + REAL Redis +
 * REAL HTTP through the canonical /v1 surface). Skipped unless CORE25_RUNTIME=1.
 * Engine seams that require EXTERNAL infrastructure (S3 bytes, inference-gateway
 * STT, AI feedback) are stubbed at module level; the full deterministic scoring
 * pipeline + canonical Evidence writing + persistent lifecycle are REAL.
 */
const root = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@buytuk/contracts": `${root}packages/contracts/src/index.ts`,
      "@workspace/config": `${root}packages/config/src/index.ts`,
      "@workspace/observability": `${root}packages/observability/src/index.ts`,
      "@workspace/decisions": `${root}packages/decisions/src/index.ts`,
      "@workspace/security": `${root}packages/security/src/index.ts`,
      "@workspace/queue": `${root}packages/queue/src/index.ts`,
      "@workspace/db": `${root}packages/database/src/index.ts`,
      "@workspace/events": `${root}packages/events/src/index.ts`,
      "@workspace/curriculum": `${root}packages/curriculum/src/index.ts`,
      "@workspace/intelligence": `${root}packages/intelligence/src/index.ts`,
      "@workspace/learning-loop": `${root}packages/learning-loop/src/index.ts`,
      "@reading-engine/": `${root}engines/reading-engine/src/`,
      "@dictation-engine/": `${root}engines/dictation-engine/src/`,
      "@numeracy-engine": `${root}engines/numeracy-engine/src/index.ts`,
      "@assessment-engine": `${root}engines/assessment-engine/src/index.ts`,
      "@api-zod": `${root}lib/api-zod/src/index.ts`,
      "@workspace/api-zod": `${root}lib/api-zod/src/index.ts`,
    },
  },
  test: {
    include: ["tests/core-25/**/*.test.ts"],
    env: {
      DATABASE_URL: process.env.CORE25_DB_URL ?? "postgres://postgres@127.0.0.1:5432/core25_verify",
      REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      JWT_SECRET: process.env.JWT_SECRET ?? "dev-secret-change-me",
      CORE25_RUNTIME: "1",
    },
    fileParallelism: false,
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
