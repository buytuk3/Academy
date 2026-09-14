# P5 — Canonicalization Report (incremental — P5.2 slice) — FINAL

> **Official Reference / Source of Execution:** [`docs/reference/BUY-TUK-ACADEMY-V1.0.0.md`](../reference/BUY-TUK-ACADEMY-V1.0.0.md)  
> **Execution Protocol:** [`docs/reference/EXECUTION-REFERENCE.md`](../reference/EXECUTION-REFERENCE.md)  
> **Compliance Baseline:** [`docs/reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md`](../reference/DOCUMENT-V1-COMPLIANCE-AUDIT.md)

Status: P5.2 COMPLETE — awaiting approval before P5.1 (engine extraction)
Date: 2026-09-06 — Branch: p5/forensic — Base: ba3b1d0 / merge-p4-candidate — no tag
Scope: Express 5 canonicalization ONLY. ZERO deletions / redesign / new engines / domains. MOD-002 untouched.

## P5.2 — Express 5 Canonicalization (each figure = real command output of this phase)
### 1) The triple: declared / installed / actually-loaded
| Fact | Value | Proof (tool output) |
|---|---|---|
| Declared | ^5.2.1 | apps/api/package.json:dependencies.express |
| Installed | 5.2.1 | node -p require('./apps/api/node_modules/express/package.json').version |
| Actually loaded (resolve) | /home/user/audit/v2.7.1/apps/api/node_modules/express/index.js | require.resolve('express',{paths:['./apps/api']}) — HOISTS_ENGINE4=NO |
| require() context inside app | 5.2.1 | (cd apps/api && node -p "require('express/package.json').version") → 5.2.1 |
| @types/express installed | 5.0.6 | node -p require('./apps/api/node_modules/@types/express/package.json').version (12 type packages) |
| Engine express (legacy) | 4.22.2 (legacy, unchanged) | artifacts/reading-engine/node_modules — unchanged; removed in P5.1 |

Root cause fixed: apps/api/node_modules/express was a SYMLINK -> artifacts/reading-engine/node_modules/express (4.22.2);
npm ls: express@4.22.2 invalid ^5.2.1. Replaced by a REAL flat install of express@5.2.1 + @types/express@5.0.6
(+transitive @types: express-serve-static-core, mime, range-parser, body-parser, qs, serve-static, send, http-errors).
readlink apps/api/node_modules/express = NO (real directory). Declared range unchanged (^5.2.1).

### 2) HTTP boot inventory (who calls express()/listen() — grep of this phase)
| Location | express() | listen() | Class |
|---|---|---|---|
| apps/api/src/app.ts:9, index.ts:5 | Express 5 app | app.listen(config.server.port) | CANONICAL production path |
| artifacts/reading-engine/src/index.ts:18,52 | legacy | server.listen(PORT,HOST) | LEGACY — removed inside P5.1 (zero-loss evidenced) |
| artifacts/api-server/src/app.ts:7, index.ts:18 | legacy | app.listen | LEGACY rollback copy — deletion after consumers=0 (P5.3+) |
| apps/worker | none | none | WORKER_HAS_NO_EXPRESS (verified) |

### 3) Express 5 breaking-change review (recorded — NOT silently patched)
| v5 change | apps/api sweep |
|---|---|
| res.send(status) removed | NONE_FOUND |
| req.param removed | NONE_FOUND |
| path-to-regexp v8 ('*', ':x?') | NONE_FOUND |
Route set is static (/healthz, /api/auth/*) — no rewrite, nothing redesigned. Only adaptation: TYPE-ONLY casts (P5D-05)
for middleware typed against @types/express@4 (requestContext, httpLogger, express-rate-limit) under @types/express@5
overloads — runtime behavior identical (casts erased at compile). app.ts SHA before=f253718ee28baf0ea93cb98909fae05139ba9702ae6612d2919508f1af29db92 AFTER=083aae42566d9382f17e58ab3f7384ca8c1b7c3fcd7e948cd758063652008f8f after=?.
git diff HEAD -- apps/api/src/app.ts (captured in log) = the three cast lines + comments only.

### 4) Gate under the real Express 5 runtime (post-cast, this phase)
TSC_API_EXIT=0 (against @types/express@5.0.6) — VITEST_API_EXIT=0 (1 passed) — in-app runtime 5.2.1.

### 5) Zero-loss for this slice
Deletions=0. Source change: apps/api/src/app.ts ONLY (type-only casts, P5D-05). tag=none. Engine/api-server/worker untouched.

### 6) Decisions
docs/decisions/P5_DECISIONS.md — P5D-01..05. SHA: docs/reports/P5_2_EXPRESS5_SHA.sha256.