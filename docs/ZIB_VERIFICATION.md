# ZIB VERIFICATION — BuyTuk Academy / CORE-26C Recovery Handover
Verification type: **independent fresh-extract verification** (every gate below was executed against a freshly UNZIPPED copy in a new directory, with dependencies installed FROM SCRATCH — zero node_modules or dependency layers copied from any pre-existing environment).

## Identity
- **Original approved baseline (Original HEAD):** `d60ac04b4851b985930a342165ca5071382a0d84` — tag `core26c-zib-baseline` — archive preserved as `BuyTuk-Academy-ZIP-CORE26C-ORIGINAL-BASELINE.zip` (SHA-256 `0b1808bd361203849d383d653eda9106e0edc369f5d17402847f0fcc6e46a7f1`, 594 files, 979,720 bytes). Proven NON-rebuildable from source alone (defects R-026-07/08/09 → fixed by the documented Recovery Patch, see `CORE26C-RECOVERY-PATCH.md`).
- **Recovery chain:** fix1 `b7420b5` → fix2 `2ec4919` → fix3 `18f185f` → fix4 `579f2b5` → fix5 `d96b1bf` (tag `core26c-zib-recovery-fix5`) → fix6 `ccbae42` → fix7 `b84db49` → fix8 `3d1a59d` / fix8b `66c8f20` (tag `core26c-zib-fix8b`) → fix9 `4455fa0` (Runtime Bootstrap Patch) → fix10 `4951fbb` (lockfile re-sync) → docs commits.
- **ZIB Final HEAD:** the commit tagged `core26c-zib-final` (this file's commit; print with `git rev-parse core26c-zib-final`). `DIRTY=0` at packaging time.
- **Final package SHA-256 / file count / size:** necessarily NOT embeddable inside the package itself (self-reference) — printed in the closeout report delivered with the package.

## Install
- `pnpm install --frozen-lockfile` from scratch in a fresh-extracted directory: **EXIT 0** (pnpm 10.34.5, Node 22.23.2). The repository carries its first `pnpm-lock.yaml` (fix8/fix8b/fix10) — rebuilds are deterministic.
- Workspace membership proven: `pnpm -r list` shows `buytuk-api` (apps/api) and `buytuk-worker` (apps/worker) as members; internal `@workspace/*` links resolve into the pnpm store (express resolves: `node_modules/.pnpm/express@5.2.1/...`).
- No `node_modules` and no `.env` inside the package (git-archive honors `.gitignore`: `node_modules/`, `dist/`, `.env`, `*.log`, `*.tsbuildinfo`); the only env artifact is `engines/reading-engine/.env.example` (placeholder values).

## TSC
Full clean `tsc --noEmit` on the fresh install — **10/10 packages EXIT 0**: contracts, database, apps/api, apps/worker, queue, events, numeracy-engine, assessment-engine, dictation-engine, reading-engine.

## Database (REAL PostgreSQL)
- `db-migrate.mjs` (canonical migrations ONLY) against **11 fresh databases**: core-17..core-26 verification DBs + drift-migrate DB → **EXIT 0 × 11, 35 tables each**.
- **Schema Drift:** `db-push-verify.mjs` (verification-only, NO `--force`, verify-named DB enforced) + `schema-drift-check.mjs` → **PASS** (zero hard drift: tables 35 / columns 466 / PK 35 / FK 101 / unique 28 / indexes 121 / enums 2; the 16 CHECK constraints remain classified "expected representation difference" per ACR-24/001 §2.2/§2.3 + ACR-24/002 §2.2/§2.3).

## Redis (REAL)
- Real Redis used by queue factories (`Redis connected` in boot logs). **Hygiene requirement (documented):** BullMQ's queue is shared/distributed — verification runs must isolate or `FLUSHDB` between runs (a leaked job from an independent-boot check once poisoned a subsequent regression run; after cleanup the same tree passed).

## API / Worker (INDEPENDENT BOOTS — the owner-mandated gate, closed by fix9)
- **API boots independently** via the official path (`tsx src/index.ts` from `apps/api`, which carries the app's tsconfig paths): log `{"service":"buytuk-api","port":4778,"msg":"Server listening"}` and `GET /api/healthz` → `{"status":"ok"}`.
- **Worker boots independently** via `tsx src/index.ts` from `apps/worker`: log `{"service":"buytuk-worker","msg":"Analyze worker ready"}` + it pulled a REAL queued job from Redis.
- **Runtime module resolution of the four previously source-only capability packages** proven at runtime by a probe executed through tsx: `RESOLVE_OK: function×4` for `@workspace/curriculum`, `@workspace/decisions`, `@workspace/intelligence`, `@workspace/learning-loop`.
- Expected behavior of the pulled job: it reached the S3 seam and stopped with `S3 download failed — Missing credentials` — **external provider boundary** (AWS credentials are a production Environment Configuration Requirement, see Limitations), NOT a boot or resolution defect.

## Tests
- Engine units: numeracy **41/41**, assessment **37/37** (real `buytuk_test` DB, 35 tables).
- Full regression **CORE-17 → CORE-26**: 32+17+14+15+16+18+21+44+12+20 = **209 tests, EXIT 0 × 10**, on REAL PostgreSQL (fresh migrated DBs) + REAL Redis + REAL queue/worker (E2E suites core-25/core-26 include REAL HTTP, REAL BullMQ round-trip, idempotency/concurrency/recovery, Teacher Decision Gate).

## Secret scan
Pattern scan over a fresh extraction (DB URLs with credentials, AWS keys, `sk-` tokens, API keys, private key blocks, GitHub tokens): only placeholder/test values (`user:pass@host`, `your-access-key`, local dev URLs without passwords). No real secrets, no `.env`, no `node_modules` in the package.

## Exclusions
`node_modules/`, `dist/`, `.env`, `*.log`, `*.tsbuildinfo` (via `.gitignore` + git-archive). No tracked node_modules entries remain (fix4 removed the last one).

## Limitations & Environment Classification
- **Environment Configuration Requirement (by design, documented):** runtime env keys `DATABASE_URL`, `JWT_SECRET`, `AUDIO_KEK` (+ `REDIS_URL`, `PORT`) are REQUIRED by packages/config at boot; production reading pipeline additionally needs AWS credentials (S3) and the inference-gateway (STT/G2P/AI) endpoints.
- **Verification Infrastructure Limitation:** shared BullMQ/Redis needs isolation or `FLUSHDB` between verification runs; pnpm ≥ 10 required (`catalog:` protocol; pnpm 9 cannot parse it).
- **Product/Repository Defects:** NONE remaining open (fix1–fix10 closed R-026-07/08/09).
- PostgreSQL auth during verification: temporary `trust` on the isolated local test cluster ONLY — `pg_hba.conf` backed up before the change and restored after it (verified), nothing of it inside any package.
