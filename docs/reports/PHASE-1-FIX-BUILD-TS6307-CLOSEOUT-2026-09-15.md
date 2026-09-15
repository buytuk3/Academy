# PHASE-1 — FIX-BUILD-TS6307 — CLOSEOUT

- Date: 2026-09-15
- Baseline SHA: `41b0bba3501eb221d16f474299e44d39c709b104`
- Local tag at start: `BuyTuk.V0.1.3` (points to baseline; unchanged)
- Working tree at start: CLEAN

## Root cause (reproduced, not assumed)
1. `pnpm run build` failed at `typecheck:libs` (`tsc --build`) with **16 × TS6307**, all against project
   `packages/database/tsconfig.json`: `packages/database` is a `composite` project that resolves
   `@workspace/config`, `@workspace/observability`, `@workspace/security` into sibling package TS sources
   via `paths`, but its `include` only listed `src/**/*`. TS6307 = "file is not listed within the file
   list of project … Projects must list all files or use an 'include' pattern".
2. Direct build blocker in the same chain (surfaced after 1 was fixed): `apps/api build` failed with
   `Cannot find module 'thread-stream'`. `esbuild-plugin-pino` declares `thread-stream` as a
   **peerDependency**; `apps/api` had it neither installed nor linked. Project precedent:
   `artifacts/api-server` ships `thread-stream` in devDependencies for the same plugin.
   `apps/api` uses `pino@^10.3.1` whose dependency is `thread-stream: ^4.0.0` (store had 4.2.0).
3. Build output hygiene: the composite `emitDeclarationOnly` build newly emitted untracked
   `packages/database/dist-types/` which was not covered by `packages/database/.gitignore`.

## Files changed (exact)
1. `packages/database/tsconfig.json` — `include` extended:
   `["src/**/*", "../config/src/**/*", "../observability/src/**/*", "../security/src/**/*"]`
2. `apps/api/package.json` — `devDependencies` += `"thread-stream": "^4.0.0"` (proven peer requirement)
3. `packages/database/.gitignore` — += `dist-types/`
4. `pnpm-lock.yaml` — lockfile entry for the added devDependency (`pnpm install` exit 0)
5. `docs/buytuk-master/STAGE_STATUS.md` — PHASE-1 row → `CLOSED / PASS` with evidence
6. `docs/buytuk-master/CHANGE_DEVIATION_RECORD.md` — DEV-004 → CLOSED; DEV-013 (deferred) added
7. `docs/reports/PHASE-1-FIX-BUILD-TS6307-CLOSEOUT-2026-09-15.md` — this closeout

No source logic, no V1 doc, no `_history/`, no tags, no remote operations were touched.

## Evidence — build before
- `pnpm run build` → **exit 1**
- Verbatim first error: `packages/config/src/index.ts(5,15): error TS6307: File '.../packages/config/src/env.ts' is not listed within the file list of project '.../packages/database/tsconfig.json'.`
- Count: `grep -c 'error TS6307' build_before.log` → **16**

## Evidence — build after
- `pnpm run build` → **exit 0**
- `grep -c 'TS6307' build_after2.log` → **0**; no `error TS` lines at all
- Final steps succeeded: `engines/reading-engine build: Done`, `artifacts/api-server build: Done`, `apps/api build: Done`

## Evidence — tests (vitest, repo-rooted per each package's config)
- `packages/config`: exit 0 — **15 passed (15)**
- `packages/database`: exit 0 — **55 passed (55)**
- `engines/reading-engine`: exit 0 — **16 passed (16)**
- `apps/api`: exit 0 — **4 passed (4)**
- `apps/worker`: exit 0 — **1 passed (1)**
- `tests/core-32/p2-voice-ui-upload.e2e.test.ts` (regression of previously-verified affected path): exit 0 — **1 passed (1)**

## Evidence — typechecks (existing `typecheck` scripts)
`apps/api`, `apps/worker`, `engines/reading-engine`, `packages/config`, `packages/security`,
`packages/observability` → all **exit 0**.

## Regression notes / deferred (LOG → CLASSIFY → DEFER)
- Full `tests/core-32` run: `p1-student-ui-e2e.test.ts` 3/5 fail (auth rate-limit 429 across sequential
  logins; dashboard selector timeout) — pre-existing runtime/E2E environment issues, unrelated to the
  PHASE-1 diff (build wiring only). Recorded as **DEV-013**, deferred to PHASE-3/PHASE-6.
- pnpm peer warnings (`@opentelemetry/api` range, `react` peer for `@tanstack/react-query`) — informational, deferred.

## Git evidence
- `git diff --check` → clean (exit 0)
- `git status --short` after commit → CLEAN
- Commit: see closeout reply (PHASE-1-only commit on top of `41b0bba`)
- No new tag (per protocol: tag only after closeout review); no push (REMOTE CLOSEOUT remains
  `BLOCKED / PENDING ACCESS`).

## Final Gate
- TS6307 = 0 ✅
- Required build = PASS ✅
- Required tests = PASS ✅
- No proven regression introduced (affected-path E2E passes; failures classified + deferred) ✅
- Working tree known/explained ✅
- Every change documented ✅
- No scope creep ✅
- Baseline/history/V1 untouched ✅

**PHASE-1 = CLOSED / PASS**
