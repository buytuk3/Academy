import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url)); // repo root
export default defineConfig({
  root,
  resolve: {
    alias: {
      "@buytuk/contracts": `${root}packages/contracts/src/index.ts`,
      "@workspace/db": `${root}packages/database/src/index.ts`,
      "@workspace/events": `${root}packages/events/src/index.ts`,
      "@workspace/config": `${root}packages/config/src/index.ts`,
      "@workspace/observability": `${root}packages/observability/src/index.ts`,
      "@workspace/decisions": `${root}packages/decisions/src/index.ts`,
    },
  },
  test: { include: ["packages/learning-loop/src/**/*.test.ts"] },
});
