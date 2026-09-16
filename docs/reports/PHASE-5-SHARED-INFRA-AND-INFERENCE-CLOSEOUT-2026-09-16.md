# PHASE-5 — SHARED-INFRA-AND-INFERENCE — CLOSEOUT — 2026-09-16

## Baseline (per D-7 — started from the adopted reference, verified not assumed)
- Reference: **BuyTuk Academy 1.8** (Last Known Good) — verified at phase start: archive `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-4-2026-09-16.tar.gz` SHA-256 `3adc5c04d6e48afeeed5cebd6d60e2508d9fbca8b3bb156e17971277d8e5f20d` (**matched byte-for-byte**, `tar -tzf` exit 0); live HEAD `194ba98c16417e4c5f94273d9fa791eddd904751`, tag `BuyTuk.V0.1.3` → `41b0bba3501eb221d16f474299e44d39c709b104`, working tree CLEAN, PHASE-4 CLOSED/PASS.
- **No version conflict:** `PROJECT_VERSION.md:13` + `ADR-028:74` both state verbatim «expected: PHASE-5 → BuyTuk Academy 1.9» → proceeded per the owner's instruction.
- **Gate (MASTER_ROADMAP.md:36, verbatim):** `| PHASE-5 | SHARED-INFRA-AND-INFERENCE | B/C | Shared infra and inference gateway proof are needed before broad portal and engine rollout | PHASE-1 | gateway smoke / observability / storage contracts green |`

## READ → TRACE (classification, from repo evidence)
| Item | Classification | Evidence |
|---|---|---|
| Inference gateway materials (gateway.py + 4 workers + Dockerfile CUDA + proto 6 RPCs) | Current implementation (partial) | `engines/reading-engine/inference-gateway/*` |
| Production client contract (deadline + tenant metadata) | Current implementation | `inference-client.ts` (ACR-E6-001) |
| Integrated gateway runtime proof | **Gap** → closed at transport level (ADR-030) | no GPU/CUDA in this environment |
| Observability package contracts | **Gap** (no tests) → closed | `packages/observability` (9 modules, 0 tests) |
| Storage client startup/presign contracts | **Gap** (no tests) → closed | `s3-client.ts` |
| AI-001 PARTIAL | In-scope (PHASE-5) | TRACEABILITY row 32 |
| DEP-001 Docker/K8s/deploy proof | **Out-of-scope** (PHASE-12) — deferred | TRACEABILITY row 34 |
| Whisper/GPU runtime proof | **Deferred** (deploy/production gate) per ADR-030 D-1 | — |
| DEV-013 (P1-2) | Historical deferred — NOT a PHASE-5 item | owner ruling 2026-09-16 |

## PLAN (Reuse → Integrate → Complete)
- **Reused:** production client `inference-client.ts` (unmodified), canonical proto (unmodified), aws-sdk client (unmodified), observability package (unmodified), vitest patterns (core-32 env mechanism).
- **Modified:** `packages/observability/vitest.config.ts` (test include moved to `src/**` + full alias set — tests co-located with source).
- **Created:** 3 contract test files + ADR-030.
- **Untouched:** V1, `_history/`, tag, `v1.yaml`, migrations, auth/RBAC/tenant/RLS, proto/clients/workers (consumption not construction), previous archives.

## IMPLEMENT (5 files — tracked in the phase commit)
1. `docs/decisions/ADR-030-SHARED-INFRA-PROOF-SCOPE.md` — proof scope: transport-level smoke (in-process real gRPC server over the CANONICAL proto) + observability/storage contracts; GPU runtime deferred to deploy gate.
2. `engines/reading-engine/src/pipeline/__tests__/inference-smoke.test.ts` (4 tests) — real gRPC server in-process serving `inference-gateway/proto/inference.proto`; the REAL `inference-client.ts` drives it: Health/Feedback round-trips; metadata captured (`authorization: Bearer`, `x-correlation-id`, **`x-tenant-id`** via options.tenantId — ACR-E6-001); enforced deadline → DEADLINE_EXCEEDED (code 4).
3. `engines/reading-engine/src/security/__tests__/s3-contracts.test.ts` (4 tests) — no-creds → ready=false + assertS3Ready throws (fail-closed); local endpoint fallback → ready=true; partial creds → **rejected at config validation** (actual contract: packages/config throws before client construction); presign put/get → local v4 URLs with bucket/key/X-Amz-Signature.
4. `packages/observability/src/__tests__/observability-contracts.test.ts` (6 tests) — redact/safeLog (secrets + bearer removed), correlation AsyncLocalStorage chain, trace spans, 8-class error classification (actual hint precedence incl. ECONNREFUSED→database), prom-client registry, security events.
5. `packages/observability/vitest.config.ts` — minimal diff (include `src/**` tests, full alias set restored).

## PROOF — TESTS (actual exit codes this phase; logs in /home/user/phase3_logs)
| Suite | Result |
|---|---|
| Observability contracts (NEW) | **6/6 PASS — exit 0** |
| Engine suite incl. gateway-smoke + s3-contracts (NEW) | **24/24 PASS — exit 0** (7 files: 16 legacy + 8 new) |
| Typecheck (sequential runner) | `root-typecheck:0` · `tsc-composite-build:0` · 8 packages `:0` → **10/10** — after fixing the new test's tsc error (TS2345 → explicit `grpc.UntypedServiceImplementation` cast); **BUILD `root-build:0`** |
| Database | **55/55 — exit 0** |
| Worker | **1/1 — exit 0** |
| API + gateway contracts | **8/8 — exit 0** |
| P3 role-shell E2E | **8/8 — exit 0** |
| P2 voice E2E | **1/1 — exit 0** |
| P1 student UI | **4/5** — single failure P1-2 = **DEV-013 historical** (verified: same test, same assertion as before PHASE-5; no new regression) |

## PROOF — SECURITY / INTEGRITY
- **SECRET SCAN:** PHASE-5 diff grep (11 pattern classes) = **0 hits** (exit 1) · 3 new test files = **0 hits** · `NO_ENV_OR_KEY_FILES` (no credential literals — S3 scenarios drive env vars, not secrets).
- **DIFF CHECK:** `git diff --check` = exit 0.
- **Scope inventory (5 paths):** `packages/observability/vitest.config.ts` (M), `docs/decisions/ADR-030…` (new), 3 test directories (new). No V1/_history/tag/code-boundary changes.

## CLOSE — Git
- Phase commit: `phase5(shared-infra-inference): ADR-030 gateway smoke/observability/storage contracts + in-process gRPC proof` (SHA recorded in the final report; tag untouched; no push).
- Post-commit working tree: CLEAN.

## ARCHIVE — BuyTuk Academy 1.9 (per ADR-028 + D-12)
Built after CLOSE from the actual working tree; delivered with a working download link; `tar -tzf` exit 0; SHA-256 recorded in MANIFEST + SIDECAR + Version Chain Registry. **1.8 archive untouched** (`3adc5c04…` verified pre-phase). **BuyTuk Academy 1.9 = official version** adopted at this closeout.

## Final state
- **PHASE-5 = CLOSED / PASS** · PHASE-6 = NOT STARTED · no push · REMOTE = BLOCKED / PENDING ACCESS
