# PHASE-13 CHARTER — DEPLOYMENT-TARGET-AND-COVERAGE (DEPL-2 + COV-1 closure phase)

Base: verified 1.16 reference (archive sha256 38660ec5…cca41d, HEAD f249e63, dirty=0).
Protocol: PHASE-7..12 discipline (charter first, measurable gates fixed in advance, OPEN gates never PASS).

## Gates (fixed in advance)
- **COV-1 (coverage provider)** — add `@vitest/coverage-v8@1.6.1` (the EXACT version already in the offline store; matches vitest 1.6.1) as a **devDependency of apps/api only**. Measure real coverage of `apps/api/src` on the real suite, set thresholds at the measured floor (rounded down to the nearest 5), commit `coverage-summary.json` as evidence, and document the zero-new-dependencies exception in **ADR-035**. PASS only if a real run this phase reports numbers ≥ thresholds.
- **DEPL-2 (deployment target)** — deliver a REAL single-container production target: pinned multi-stage `deploy/Dockerfile` (+ `.dockerignore` + HEALTHCHECK + non-root USER + env contract + `deploy/DEPLOYMENT-RUNBOOK.md`). If no docker daemon / no external host exists in the sandbox, the container target is delivered and the LIVE-deployment sub-gate stays **OPEN, disclosed** — a deployment is claimed ONLY if actually performed against a real host.
- **P13-E2E** — new gate `tests/core-32/p13-production-deployment-coverage.e2e.test.ts` (5 tests, real processes/files): P13-1 cold boot of the BUILT artifact + health; P13-2 /metrics exposition continuity; P13-3 container-target contract; P13-4 coverage evidence ≥ thresholds; P13-5 governance alignment.
- **REG-0** — zero regressions: typecheck, build, db/obs/worker/api/engine suites, ALL core-32 official files per-file (now incl. p13), E1, E4, secret scan, diff-check — all exit 0.
- **Closeout** — STAGE_STATUS (PHASE-13 row), CHANGE_DEVIATION_RECORD (coverage gap row + DEPL-2 status honestly stated), PROJECT_VERSION (1.17), closeout report, new single-file reference **BuyTuk Academy 1.17** via D-3/D-12.
