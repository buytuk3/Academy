import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

/**
 * PHASE-14 COV-1 — coverage measurement over the REAL core-32 E2E suite
 * (real browser/processes + real API + real PG/Redis). Coverage scope:
 * apps/api/src (the production gateway). Resolved from the REPO ROOT.
 * Same provider discipline as apps/api/vitest.coverage.config.ts (ADR-035).
 * Thresholds are injected below AFTER the measured floor.
 */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      coverage: {
        enabled: true,
        provider: "v8",
        reporter: ["text", "json-summary"],
        include: ["apps/api/src/**/*.ts"],
        exclude: ["apps/api/src/public/**", "**/*.d.ts", "**/dist/**", "**/*.config.*"],
        reportsDirectory: "coverage-p13",
        // PHASE-14 thresholds = the measured floor (rounded down to 5) of the
        // real run this phase — evidence: docs/evidence/PHASE-14/coverage-summary.json
        thresholds: {
          lines: 40,
          functions: 10,
          statements: 40,
          branches: 55,
        },
        // PHASE-14 thresholds = the measured floor (rounded down to 5) of the
        // real run this phase — evidence: docs/evidence/PHASE-14/coverage-summary.json
        // PHASE-14 thresholds = the measured floor (rounded down to 5) of the
        // real run this phase — evidence: docs/evidence/PHASE-14/coverage-summary.json
      },
    },
  }),
);
