import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * CORE-33 / P2 — Real LLM path proofs.
 * Unit + Integration + Behavioral: REAL in-process gRPC server built from the
 * REAL inference-gateway proto (Feedback RPC) — the adapter talks to it over
 * a real socket. No DB writes, no API mocks. Gated by CORE33_E2E=1.
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
      "@workspace/db": `${root}packages/database/src/index.ts`,
      "@numeracy-engine": `${root}engines/numeracy-engine/src/index.ts`,
      "@assessment-engine": `${root}engines/assessment-engine/src/index.ts`,
      "@dictation-engine/": `${root}engines/dictation-engine/src/`,
    },
  },
  test: {
    include: ["tests/core-33/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgres://core27:c27_vZ8pQ2wR@127.0.0.1:5432/core33_verify",
      JWT_SECRET: "dev-secret-change-me",
      INFERENCE_PROTO_PATH: `${root}engines/reading-engine/inference-gateway/proto/inference.proto`,
      CORE33_E2E: "1",
    },
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
