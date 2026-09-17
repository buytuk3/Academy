import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

/**
 * PHASE-13 COV-1 — coverage profile for the apps/api contract suite
 * (opt-in; the default `pnpm test` behavior of every package is UNCHANGED —
 * zero regression by construction). Invoked from the REPO ROOT:
 *   vitest run --config apps/api/vitest.coverage.config.ts
 * Provider: @vitest/coverage-v8@1.6.1 — the EXACT version already present in
 * the offline store, matching vitest 1.6.1 and co-located with the runner at
 * the workspace root (ADR-035: dev-dependency exception; zero production
 * dependency changes). Thresholds are injected below AFTER the measured
 * floor (PHASE-13 discipline: thresholds follow measurement, never precede it).
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
        reportsDirectory: "coverage-api",
        // PHASE-13 thresholds = the measured floor (rounded down to 5) of the
        // real run this phase — evidence: docs/evidence/PHASE-13/coverage-summary.json
        thresholds: {
          lines: 40,
          functions: 10,
          statements: 40,
          branches: 55,
        },
        // PHASE-13 thresholds = the measured floor (rounded down to 5) of the
        // real run this phase — evidence: docs/evidence/PHASE-13/coverage-summary.json
        // PHASE-13 thresholds = the measured floor (rounded down to 5) of the
        // real run this phase — evidence: docs/evidence/PHASE-13/coverage-summary.json
      },
    },
  }),
);
