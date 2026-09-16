import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
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
      // PHASE-4: subpath imports (@dictation-engine/compare|language|measure)
      // require the trailing-slash form ONLY (same proven shape as
      // tests/core-32/vitest.config.ts). A bare key alongside rewrites
      // subpaths to a broken <index.ts>/subpath (observed empirically).
      "@dictation-engine/": `${root}engines/dictation-engine/src/`,
      "@numeracy-engine": `${root}engines/numeracy-engine/src/index.ts`,
      "@assessment-engine": `${root}engines/assessment-engine/src/index.ts`,
      "@workspace/api-zod": `${root}lib/api-zod/src/index.ts`,
      "@reading-engine": `${root}engines/reading-engine/src`,
    },
  },
  test: {
    include: ["apps/api/test/**/*.test.ts"],
    // PHASE-4: test-scope env only — no production change, NO new credential
    // literals (SECRET SCAN: NO NEW SECRET). Contract probes perform no DB
    // queries: DATABASE_URL is required only at import time (pool is lazy)
    // and /api/health catches connection failures — so the fallback is a
    // credential-less local dev URL. The core-32 E2E suite (which does query
    // the DB) keeps its own committed default untouched.
    env: {
      DATABASE_URL: process.env.CORE32_DB_URL ?? "postgres://127.0.0.1:5432/core32_verify",
      REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      JWT_SECRET: process.env.JWT_SECRET ?? "dev-secret-change-me",
      AUDIO_KEK: process.env.AUDIO_KEK ?? "dev-kek-change-me",
      RATE_LIMIT_WINDOW_MS: "60000",
      RATE_LIMIT_MAX: "10000",
      AUTH_RATE_LIMIT_WINDOW_MS: "60000",
      AUTH_RATE_LIMIT_MAX: "10000",
    },
  },
});
