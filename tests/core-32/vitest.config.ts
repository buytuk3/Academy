import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * CORE-32 / P1 — Student Web UI E2E: REAL browser (Playwright Chromium) over
 * the REAL API process (Express app + static /ui thin client) + REAL
 * PostgreSQL (core32_verify) + REAL Redis. Nothing mocked except the
 * READING pipeline's EXTERNAL-provider seams (approved WAVE-4A list, not
 * exercised here — numeracy loop only). No API mocks: the browser talks to
 * the same /v1 surface proven in core-25..31.
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
    include: ["tests/core-32/**/*.test.ts"],
    env: {
      DATABASE_URL: process.env.CORE32_DB_URL ?? "postgres://core27:c27_vZ8pQ2wR@127.0.0.1:5432/core32_verify",
      REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      JWT_SECRET: process.env.JWT_SECRET ?? "dev-secret-change-me",
      AUDIO_KEK: process.env.AUDIO_KEK ?? "dev-kek-change-me",
      AUTH_RATE_LIMIT_WINDOW_MS: process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? "60000",
      AUTH_RATE_LIMIT_MAX: process.env.AUTH_RATE_LIMIT_MAX ?? "3",
      CORE32_E2E: "1",
    },
    fileParallelism: false,
    testTimeout: 90000,
    hookTimeout: 90000,
  },
});
