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
      "@dictation-engine": `${root}engines/dictation-engine/src/index.ts`,
      "@numeracy-engine": `${root}engines/numeracy-engine/src/index.ts`,
      "@assessment-engine": `${root}engines/assessment-engine/src/index.ts`,
      "@": `${root}engines/reading-engine/src`,
      "@config": `${root}engines/reading-engine/config`,
      "@pipeline": `${root}engines/reading-engine/src/pipeline`,
      "@engines": `${root}engines/reading-engine/src/engines`,      "@queue": `${root}engines/reading-engine/src/queue`,
      "@middleware": `${root}engines/reading-engine/src/middleware`,
      "@security": `${root}engines/reading-engine/src/security`,
      "@observability": `${root}engines/reading-engine/src/observability`,
      "@realtime": `${root}engines/reading-engine/src/realtime`,
      "@exercises": `${root}engines/reading-engine/src/exercises`,
      "@report": `${root}engines/reading-engine/src/report`,
      "@types": `${root}engines/reading-engine/src/types`,
    },
  },
  test: { include: ["apps/worker/test/**/*.test.ts"] },
});
