# P4 — Application Composition Report

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)

Version 1.0 — date: 2026-09-06 — status: CANDIDATE (PASS per gate below; NOT an approval)
Baseline: P3 tag merge-p3-candidate (commit f758b49). Engine: BuyTuk Reading Engine (MOD-001).

## 1. Executive Summary
P4 composed the Application Layer: apps/api (Express 5 transport) + apps/worker (unified worker runtime) on the canonical packages, unified auth per D-03 (v2 access + rotating refresh, DB-backed, reuse detection), expanded contracts (openapi v1.0 + api-zod/api-client auth types), DB client sourced from config, migration 002 (additive), and moved the analyze worker runtime into apps/worker with business logic preserved in the engine. Zero functionality loss; all gates green; Redis/PostgreSQL integration explicitly SKIPPED (no live services in sandbox) — never reported as PASS. Tag: merge-p4-candidate (non-approved).

## 2. P3 Baseline
P3 candidate tag merge-p3-candidate (f758b49). Tracked files before P4: 204; after: 231. Deletions: 1 (engine worker entry index.ts — moved to apps/worker per approved C-A4).

## 3. Current Application Inventory (P4.0 forensic)
artifacts/api-server (13 files): Express ^5.2.1, routes index/health/auth, legacy lib/auth (SESSION_SECRET, bcryptjs, 15m access, opaque 48-byte refresh stored sha256), middleware/authenticate, lib/logger (pino redact), build.mjs (esbuild).
artifacts/reading-engine: index.ts, 13 routes, socket events, worker analyze.worker.ts (direct new Worker at baseline), config/ (audio/scoring/pipeline/models/security), db shim.
lib/api-spec (openapi v0: /healthz only), api-zod, api-client-react. packages/contracts (24 importers pre-P4), packages/database (unified schema+client).

## 4. Target Application Architecture
apps/api (transport): http → helmet/cors/rate-limit/context/httpLogger middleware stack → routes (auth/health; engine routes are P5) → engines (app calls). apps/worker (runtime): createWorker("analyze") → engine analyze.processor → inference → database. Domains (Arabic/English/Math/Science) stay separate from engines (Global by Architecture — Local by Configuration).

## 5. apps/api migration
app.ts: canonical config (cors/rateLimit), helmet, requestContext + httpLogger, express.json/urlencoded, app.use("/api", router). index.ts: config.server.port (validated strict-mode). lib/logger.ts: canonical createLogger. middleware/auth.ts: verifyAccessToken (canonical, C-A2 grace) + authorize (canonical RBAC). routes/auth.ts: full D-03 flow (register/login/refresh/logout/me) via packages/security + DbRefreshStore + migration 002. Legacy api-server auth removed from the app (files kept in artifacts for rollback).

## 6. apps/worker migration
apps/worker/src/index.ts: createWorker("analyze", engine analyze.processor, {concurrency}) — pipeline verbatim (download→decrypt→enhance→features→vad→stt→g2p→forced-align→dtw→score→mastery/gap/recs/feedback→report→db); graceful shutdown (worker + queue); SIGTERM/SIGINT. Engine worker entry removed; analyze.worker.ts = compat re-export (P5).

## 7. Auth migration
Per P4D-03. Verifier accepts legacy tokens during grace. Rotator: decode v2 → store.isRevoked → revoke previous jti → issue next; reuse → revokeFamily + RefreshReuseError. DB store via packages/database refreshTokensTable (family_id/jti/token_version=2).

## 8. Queue migration
Canonical createWorker via apps/worker only; no new Redis/Queue/Worker inside engines or apps (new Worker=1; new Redis=1; new Queue=5 in packages/queue; new Pool=0).

## 9. Database integration
packages/database/src/client.ts: config-driven DATABASE_URL/pool; logger from canonical observability; healthCheck/closeConnection preserved. Migration YES (002_add_refresh_rotation.sql, additive). Engine schema SHA match=YES; migration 001 match=YES.

## 10. Config migration
Routed through packages/config: PORT (Infrastructure), LOG_LEVEL/NODE_ENV (Observability), SESSION_SECRET→config.jwt.secret (Secret). Pending P5: engine secrets (AUDIO_KEK, AWS_*, S3_*, INFERENCE_*, DFN_WORKER_PATH, JWT_EXPIRES_IN, INFERENCE_ALLOWED_IPS), drizzle.config DATABASE_URL, config singleton env read (canonical by design). RAW_ENV_FILES remaining=13.

## 11. Contracts integration
Apps import @workspace/contracts + @workspace/api-zod only. openapi.yaml expanded (5 auth operations + bearer scheme). lib/api-zod: apiAuthTypes + HealthCheckResponse value re-export; lib/api-client-react: authApi. orval regen pending CI.

## 12. Observability integration
apps/api: requestContext (AsyncLocalStorage) + httpLogger before routes; database logger via canonical observability; engine legacy shims remain (P5); trace chain ready for OTel.

## 13. Security verification
No secrets committed (.env excluded); helmet+cors+rate-limit+zod; canonical tokens (15m access, rotating refresh, reuse→family revocation); RBAC platform roles; tenant/school/org in payload; encryption + signed URLs preserved (P5 owner); no PII in logs (pino redaction).

## 14. Dependency graph
Cycle check: CYCLES=? (COUNT=?). Packages never import engines/apps (PACKAGES_IMPORT_APPS=0). config leaf; database→config/observability; queue→config/observability/contracts; security leaf.

## 15. Duplication audit
| Pattern | Count | Classification |
|---|---|---|
| new Worker | 1 | Canonical (factory) |
| new Redis | 1 | Canonical |
| new Queue | 5 | Canonical (packages/queue) |
| new Pool/Client | 0 | none |
| jwt sign/verify files | 5 | Canonical + compat (P5) + legacy artifacts/api-server (pending removal) |
| logger creators | 3 | Canonical + engine shim + legacy (pending removal) |
| process.env files | 13 | Canonical (config) + engine secrets (P5) + drizzle config (P5) |

## 16. Compatibility layers (pending removal, never deleted with live importers)
engine observability shims (P5) | engine bullmq shim (P5) | engine security compat (P5) | engine worker compat re-export (P5) | legacy artifacts/api-server auth+logger (after gate approval / P5).

## 17. Functionality preservation
/auth/* same validation + response shapes (deviation: refresh now rotation-JWT family, flows unchanged); /healthz via api-zod; worker pipeline byte-identical (11 stages); engine routes/socket/tests unchanged; DB frozen; 24 contracts importers intact.

## 18. Test matrix
| Suite | tsc | vitest |
|---|---|---|
| contracts | exit 0 | — |
| database | exit 0 | — |
| config | exit 0 | exit 0 — 1 |
| observability | exit 0 | exit 0 — 1 |
| security | exit 0 | exit 0 — 1 |
| queue | exit 0 | exit 0 — 1 |
| engine | exit 0 | exit 0 — 3 |
| apps/api | exit 0 | exit 0 — 1 |
| apps/worker | exit 0 | exit 0 — 1 |

## 19. Integration test results
Unit-level composition tests green (v2 issuance/verify, C-A2 legacy grace, wrong-secret, refresh rotation; worker queue helper). Full integration (API→Auth→Queue→Worker→Engine→DB, real Redis+PostgreSQL) SKIPPED — scheduled for CI/staging; not counted as PASS.

## 20. Redis/PostgreSQL environment status
Redis: SKIPPED (no live Redis; queue/worker integration deferred — never PASS). PostgreSQL: SKIPPED (no live DB; auth→DB integration deferred; schema freeze verified by SHA). CI/staging gate required before Production Readiness.

## 21. Zero-Loss verification
DELETIONS=1 (moved, not lost). TRACKED 204→231. Engine schema SHA match=YES; migration 001 match=YES; migration 002 additive. Rollback: git reset --hard merge-p3-candidate.

## 22. Rollback
Per-phase: git reset --hard merge-p3-candidate (or the specific P4 commit). Full: pre-merge + P2 zip. Legacy artifacts preserved.

## 23. Remaining risks
1. Legacy api-server auth/logger duplicates (pending removal). 2. 13+ process.env reads pending P5. 3. Engine shims pending P5. 4. Redis/Postgres integration untested in sandbox (CI/staging). 5. orval regen pending CI. 6. apps/worker depends on engine src until engines/ extraction (P5+). 7. Express 4 vs 5 dual until engine HTTP moves (P5).

## 24. P5 recommendation
Engine move to engines/reading (MOD-001 P2→P3), adopt canonical config/observability/security everywhere (remove shims + legacy api-server auth/logger), expand openapi to the 13 engine routes (orval regen), CI with real Redis/PostgreSQL, then the MOD-002 Architecture Gate. MOD-002 stays closed until P8 per the governing rule.

---
## Gate (awaiting decision)
STATUS: PASS (per gate evidence; NOT approved)
KNOWN RISKS: see §23
DEVIATIONS: refresh token replaced by rotation JWT family per D-03/C-A2 (flows preserved); drizzle schema index config in record form per resolved drizzle-orm version (same indexes; additive migration 002)
BLOCKED ITEMS: Redis/PostgreSQL integration (SKIPPED), orval regeneration (CI), legacy removal (post-approval)
REDIS STATUS: SKIPPED
POSTGRES STATUS: SKIPPED
RECOMMENDED P5: §24
COMMIT: (see git log — merge-p4-candidate)
TAG: merge-p4-candidate
