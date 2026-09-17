# ADR-035 — COV-1 coverage provider: measured dev-only exception (@vitest/coverage-v8@1.6.1)

- Date: 2026-09-17 · Phase: PHASE-13 (DEPLOYMENT-TARGET-AND-COVERAGE) · Status: ACCEPTED
- Base: BuyTuk Academy 1.16 @ `f249e63` (archive sha256 `38660ec5…cca41d`)

## Context
COV-1 ("quality gate requires broad coverage and test matrix") has been OPEN since the
PHASE-12 closeout: no coverage provider was installed, and the zero-new-dependencies
principle barred adding one. The manager's PHASE-13 decision grants exactly ONE
exception: a coverage-provider dev-dependency, because Vitest (v1.6.1) is already the
canonical test runner and a coverage provider is a measurement tool, not application code.

## Decision
1. Add **`@vitest/coverage-v8@1.6.1`** — the version ALREADY present in the offline
   store, exactly matching the pinned vitest 1.6.1 — as a **devDependency at the
   workspace root** (co-located with the runner that loads it; provider must resolve
   from the vitest process).
2. Wire it as **opt-in coverage profiles** (`apps/api/vitest.coverage.config.ts`,
   `tests/core-32/vitest.coverage.config.ts`). The default `pnpm test` behavior of
   every package is unchanged — zero regression by construction.
3. Measure FIRST, then enforce: thresholds = the measured floor of the real run
   (rounded down to 5), committed with the raw evidence
   (`docs/evidence/PHASE-13/coverage-summary.json`, `coverage-thresholds.json`).
   The official COV-1 gate runs with thresholds enforced (exit 0 required).

## Why this does not violate zero-new-dependencies
- **Production surface unchanged**: zero changes to `dependencies` of any package; no
  new runtime code is imported by the app; the provider executes only inside test runs.
- **Measurement, not framework**: it instruments V8's built-in coverage (no transpiler,
  no new runtime, no new build step) — the same class of tooling as the existing
  devDependencies (typescript, vitest, playwright).
- **Store-exact, offline-safe**: `1.6.1` already resolved in `node_modules/.pnpm/`
  before this phase; `pnpm install --offline` succeeds — no network, no lockfile drift
  beyond the one declared devDependency.
- **Alternatives rejected**: `c8`/istanbul providers (equivalent capability but a second
  tool + larger dep graph for no gain); leaving COV-1 open (the manager explicitly
  mandated closure this phase).

## Consequences
- Coverage of `apps/api/src` is now measured and enforced on every official run.
- Honest scope note: the committed basis is the apps/api contract suite (real app
  object, 8 tests) — thresholds are enforced at ITS measured floor, not aspirational
  numbers. Raising the floor is future work (PHASE-14+), never a silent threshold edit.
