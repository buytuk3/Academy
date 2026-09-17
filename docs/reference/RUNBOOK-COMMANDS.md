# RUNBOOK — Unified Command Reference (BuyTuk Academy 1.12)

All commands are the REAL ones used across PHASE-0..8 (nothing guessed). Prereqs: pnpm (preinstall enforces it), PostgreSQL + Redis running locally.

## Install / Build / Typecheck
- `pnpm install`                                  # workspace install (preinstall enforces pnpm)
- `pnpm run typecheck`                            # libs (tsc --build) + artifacts/scripts typecheck
- `pnpm exec tsc --build`                         # composite build of libs
- `pnpm run build`                                # typecheck + recursive package builds
- `pnpm -r --if-present run build`
- per-package: `cd apps/api && npx tsc --noEmit` (same for apps/worker, engines/reading-engine, packages/{config,security,observability,queue}, artifacts/api-server)

## Run services
- API dev:   `cd apps/api && pnpm dev`            (tsx watch src/index.ts)
- API prod:  `cd apps/api && pnpm build && pnpm start`  (build.mjs → dist/index.mjs)
- Worker:    `cd apps/worker && pnpm dev`         (tsx watch; `pnpm start` for one-shot)
- UI: served by the API process at `/` (apps/api/src/public — no separate build, ACR-E5-001)
- bundle smoke: `pnpm run bundle:smoke` · api bundle: `pnpm run bundle:api`

## Database (PostgreSQL)
- Apply migrations IN ORDER 0000 → 0008:
  `for f in packages/database/migrations/0*.sql; do psql "$DATABASE_URL" -f "$f"; done`
- or schema push: `cd packages/database && DATABASE_URL=... npx drizzle-kit push` (drizzle-kit 0.22.8 — NO --force flag)
- test DBs used by suites (see each vitest.config.ts env block): core28_verify / core31_verify / core32_verify
- Redis: default local (redis-cli ping → PONG)

## Tests (real invocations; every suite prints its own summary + exit code)
- database:        `cd packages/database && npx vitest run`
- observability:   `cd packages/observability && npx vitest run`
- worker:          `npx vitest run --config apps/worker/vitest.config.ts`
- api (incl. gateway-contract): `npx vitest run --config apps/api/vitest.config.ts`
- engine:          `npx vitest run --config engines/reading-engine/vitest.config.ts`
- core-28 E1 remediation loop: `CORE28_E2E=1 CORE28_DB_URL=postgres://...core28_verify npx vitest run --config tests/core-28/vitest.config.ts`
- core-32 E2E (browser, per-file): `CORE32_E2E=1 AUTH_RATE_LIMIT_MAX=1000 npx vitest run --config tests/core-32/vitest.config.ts tests/core-32/<file>.test.ts`
  files: p1-student-ui-e2e · p2-voice-ui-upload.e2e · p3-role-shell.e2e · p7-teacher-capabilities.e2e · p8-parent-capabilities.e2e · auth-phase1-security · core34b-runtime-proof
  (AUTH_RATE_LIMIT_MAX=1000 is TEST-SCOPE ONLY — production defaults untouched, DEV-013 policy)

## Security / integrity
- secret scan (diff + new files): grep patterns (AKIA/ASIA, PRIVATE KEY, xox-, ghp_, sk-, db URLs) — expect exit 1 (no hits)
- `git diff --check` → 0
- archive verification: `sha256sum ARCHIVE` + `tar -tzf ARCHIVE >/dev/null` (exit 0) — D-12

## Delivery note (D-12)
Platform serving truncates large single files (>~16MiB) — proven in 1.10/1.11. The single archive is the canonical artifact (verify its SHA-256); the parts channel (+ parts.sha256, reassembly → identical SHA + cmp) is the verified transport.
