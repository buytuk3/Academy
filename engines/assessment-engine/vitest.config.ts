import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root,
  resolve: {
    alias: {
      "@workspace/db": `${root}packages/database/src/index.ts`,
      "@workspace/curriculum": `${root}packages/curriculum/src/index.ts`,
    },
  },
  test: {
    include: ["engines/assessment-engine/src/**/*.test.ts"],
    env: { DATABASE_URL: "postgres://postgres:postgres@localhost:5432/buytuk_test" },
  },
});
