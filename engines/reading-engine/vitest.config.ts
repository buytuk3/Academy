import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * P3: workspace alias map so vitest resolves all @workspace/* packages and
 * @buytuk/contracts directly to their TS sources (no full install needed).
 */
const root = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
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
      "@workspace/learning-loop": `${root}packages/learning-loop/src/index.ts`,
      "@workspace/intelligence": `${root}packages/intelligence/src/index.ts`,
      "@workspace/curriculum": `${root}packages/curriculum/src/index.ts`,
      "@dictation-engine": `${root}engines/dictation-engine/src/index.ts`,
      "@numeracy-engine": `${root}engines/numeracy-engine/src/index.ts`,
      "@assessment-engine": `${root}engines/assessment-engine/src/index.ts`,
    },
  },
  test: {
    include: ["engines/reading-engine/src/**/*.test.ts"],
    env: { DATABASE_URL: "postgres://postgres:postgres@localhost:5432/buytuk_test", INFERENCE_PROTO_PATH: `${root}engines/reading-engine/inference-gateway/proto/inference.proto` },
  },
});
