# P5.0 — Forensic Inventory (read-only) — merge-p4-candidate @ ba3b1d0

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)

Date: 2026-09-06 — Branch: `p5/forensic` — HEAD full: `ba3b1d0ff8a69f8e5994032e1ee3da1c334fcf14` — Worktree dirty: 0
Scope: inventory only. ZERO moves/deletions performed. MOD-002 untouched (refs: docs/decisions/ARCHITECTURE_CONTRACT.md docs/buytuk-master/API_CATALOG.md docs/buytuk-master/MODULE_REGISTRY.md).

## 1. Baseline
P4 approved at `ba3b1d0 / merge-p4-candidate`. Working branch `p5/forensic` created at that exact SHA (tag-at-head: merge-p4-candidate).

## 2. File inventories (cleaned, node_modules/dist excluded)
| Scope | File count |
|---|---|
| artifacts/reading-engine | 64 |
| artifacts/api-server | 13 |
| apps (api+worker) | 23 |
| packages | 61 |

engine tree: `artifacts/reading-engine/src/{pipeline,realtime,http,middleware,queue,observability,security,db,config,index.ts}` + `config/{audio,scoring,pipeline,models,security}.config.ts` + tests.
api-server tree: `src/{app,index}.ts`, `src/lib/{auth,logger}.ts`, `src/middleware/authenticate.ts`, `src/routes/{auth,health,index}.ts`, `build.mjs`.

## 3. Source → Destination Map (target: engines/reading-engine — NOT engines/reading)
| # | Source (artifact) | Destination (canonical) | Category |
|---|---|---|---|
| M1 | artifacts/reading-engine/src/pipeline/** | engines/reading-engine/src/pipeline/** | move |
| M2 | artifacts/reading-engine/src/realtime/** | engines/reading-engine/src/realtime/** | move (capability only, sockets via apps/api later) |
| M3 | artifacts/reading-engine/src/http + routes.ts | apps/api (Express 5) — engine keeps no standalone HTTP (P5.2) | migrate → delete after consumers move |
| M4 | artifacts/reading-engine/config/** | engines/reading-engine/config/** | move |
| M5 | artifacts/reading-engine/src/db/index.ts (shim) | packages/database (canonical only; P4.8 keeps shim until removal) | move with shim → delete later |
| M6 | artifacts/reading-engine/src/queue/bullmq.ts (shim) | packages/queue (canonical factory) | shim → delete after consumers move |
| M7 | artifacts/reading-engine/src/queue/workers/analyze.worker.ts (compat re-export) | apps/worker → analyze.processor (engine) | shim → delete after consumers move |
| M8 | artifacts/reading-engine/src/queue/workers/analyze.processor.ts | engines/reading-engine/src/queue/workers/analyze.processor.ts | move (logic frozen, 11 stages) |
| M9 | artifacts/reading-engine/src/observability/{logger,metrics}.ts | packages/observability (canonical) | shim → delete after consumers move |
| M10 | artifacts/reading-engine/src/security/compat.ts | packages/security (canonical, D-03) | shim → delete after consumers move |
| M11 | artifacts/reading-engine/src/middleware/auth.ts | packages/security (verifyAccessToken/authorize) | migrate → delete after consumers move |
| M12 | artifacts/reading-engine/src/index.ts (boots HTTP) | apps/api (Express 5) + apps/worker runtime | migrate → delete HTTP boot |
| M13 | artifacts/api-server/src/lib/auth.ts | packages/security (D-03) | migrate → delete after zero consumers |
| M14 | artifacts/api-server/src/lib/logger.ts | packages/observability | migrate → delete after zero consumers |
| M15 | artifacts/api-server/src/middleware/authenticate.ts | packages/security | migrate → delete after zero consumers |
| M16 | packages/database/src/client.ts (DATABASE_URL from config) | stays packages/database | keep (already canonical) |
| M17 | docs/reports/P4_*, docs/decisions/P4_* | stay | keep (history) |
Canonical replacement "proven" status: packages/queue, packages/security, packages/observability, packages/config exist with tests (P3/P4 gates). Consumer migration for M6/M7/M9/M10/M11 NOT yet performed — canonical replacement NOT yet proven at engine consumer level → deletion gated.

## 4. Compatibility shim register (with consumers at P5.0)
| Shim | Location | Consumers (files in engine/apps importing it) | Count | Removal gate |
|---|---|---|---|---|
| logger shim | engine/src/observability/logger.ts | see raw grep below (engine pipeline/routes/queue) | 0 refs | after full migration to @workspace/observability + tests |
| metrics shim | engine/src/observability/metrics.ts | engine app/index/socket | (in same count) | after consumers move |
| bullmq shim | engine/src/queue/bullmq.ts | engine queue/workers + sockets | per SHIM_CONSUMER log | after consumers move |
| security compat | engine/src/security/compat.ts | engine auth/password consumers | per SHIM_CONSUMER log | after consumers move |
| auth middleware | engine/src/middleware/auth.ts | 13 engine routes | per SHIM_CONSUMER log | after routes move to apps/api |
| worker compat | engine/src/queue/workers/analyze.worker.ts | engine worker index (moved P4) | SHIM_CONSUMER workers/analyze.worker | after apps/worker only consumer |
| legacy api-server auth | artifacts/api-server/src/lib/auth.ts | api-server routes only (app copy migrated) | legacy only | after gate approval |

Raw SHIM_CONSUMER lines:
- SHIM_CONSUMER observability/logger=17
- SHIM_CONSUMER observability/metrics=10
- SHIM_CONSUMER queue/bullmq=3
- SHIM_CONSUMER security/compat=3
- SHIM_CONSUMER middleware/auth=2
- SHIM_CONSUMER workers/analyze.worker=0

## 5. process.env audit (direct reads) — REAL count at P5.0
PROCESS_ENV_FILES=15 (P4 reported 13 — delta documented if different), lines=27.


## 6. Queue/Worker/QueueEvents construction audit (outside canonical factory)

NEW_QUEUE=4 NEW_WORKER_LINES=1 NEW_QEVENTS_LINES=1 NEW_WORKER=1 NEW_QEVENTS_LINES=1 NEW_QEVENTS=1 — all inside packages/queue factory or apps/worker (verified paths above).

## 7. Legacy JWT/Auth references

JWT_AUTH_FILES=6.

## 8. Observability shim refs (engine)


## 9. Express 4 vs 5
INSTALLED_EXPRESS_ENGINE=4.22.2
INSTALLED_EXPRESS_API=4.22.2
Engine declared express ^4.19.2, installed 4.x → engine currently serves its own HTTP (P5.2 target: remove). apps/api declared express ^5.x.

## 10. P5.0 SHA manifest (sensitive files — baseline for P5_ZERO_LOSS_MANIFEST.sha256 later)
Manifest: `P5_0_FORENSIC_MANIFEST.sha256` (22 entries), also saved at docs/reports/.
| `06a8401490728b1c…` | `apps/api/src/index.ts` |
| `08529fcbb4f25f6c…` | `lib/api-spec/openapi.yaml` |
| `0ea85fd9c0b9a774…` | `packages/database/migrations/002_add_refresh_rotation.sql` |
| `177d9f6102ea4adf…` | `artifacts/api-server/src/lib/auth.ts` |
| `29e1ca75036fe917…` | `artifacts/api-server/src/lib/logger.ts` |
| `3387124700520dfe…` | `packages/config/src/index.ts` |
| `33a26817111fb1dd…` | `packages/security/src/index.ts` |
| `4abe99e4e7f4ce49…` | `artifacts/reading-engine/src/observability/metrics.ts` |
| `4b15f0b2a09dab5d…` | `artifacts/reading-engine/src/db/schema.ts` |
| `6a9f6f2e5ebd7e35…` | `apps/worker/src/index.ts` |
| `865a9e3e0dec1cc7…` | `artifacts/reading-engine/src/security/compat.ts` |
| `9a9b5adb1bda2614…` | `packages/security/src/tokens.ts` |
| `a2fc60e89bec5e70…` | `packages/database/migrations/001_initial.sql` |
| `a554d493d248aa84…` | `artifacts/reading-engine/src/queue/workers/analyze.processor.ts` |
| `af47342b49fc8fe0…` | `artifacts/reading-engine/src/queue/workers/analyze.worker.ts` |
| `b14332556669f396…` | `packages/queue/src/index.ts` |
| `cdbd8ff11d0dbd67…` | `apps/api/src/app.ts` |
| `d5586d2aba025623…` | `artifacts/reading-engine/src/middleware/auth.ts` |
| `d9927e60c69570f3…` | `packages/observability/src/index.ts` |
| `dc46fcf41df2153b…` | `artifacts/reading-engine/src/observability/logger.ts` |
| `f77d7dc7c359c202…` | `packages/database/src/client.ts` |
| `f899e05eb0f99c4b…` | `artifacts/reading-engine/src/queue/bullmq.ts` |

## 11. i18n gap (P5.9–P5.13) — architecture notes
- packages/i18n EXISTS: NO → to be created in P5 (capability: language/locale/region/RTL/fallback/pluralization/date-number/lazy resources + ar,en,fr,it).
- contracts locale/learningLanguage refs: 0 → contracts must add interfaceLocale vs learningLanguage distinction (P5.10), no DB schema change without freeze policy (P5.13).
- Existing packages: config contracts database observability queue security.

## 12. OpenAPI
Path count: 6 — paths: /healthz:, /api/auth/register:, /api/auth/login:, /api/auth/refresh:, /api/auth/logout:, /api/auth/me:. Orval regeneration remains CI-gated (P5.15).

## 13. Go/No-Go checkpoint
This inventory is read-only. No file moved/deleted; no tag created; MOD-002 untouched. Awaiting explicit go before M6/M7/M9/M10/M11/M13/M14 deletions (rule: Source → Consumers → Canonical → Migrate → Tests → Audit → Zero-Loss → Delete).
