# PHASE-4 — API-GATEWAY-ALIGNMENT — CLOSEOUT — 2026-09-16

## Baseline (per D-7 — started from the adopted reference, not memory)
- Reference: **BuyTuk Academy 1.7** (Last Known Good) — verified at phase start: HEAD `ebc97d93e5d0e065fdeeecad13bbf445323bb57d`, tag `BuyTuk.V0.1.3` → `41b0bba3501eb221d16f474299e44d39c709b104`, working tree CLEAN, PHASE-3 CLOSED/PASS.
- **Gate (MASTER_ROADMAP.md:35, verbatim):** `| PHASE-4 | API-GATEWAY-ALIGNMENT | A/B | Align runtime architecture with documented gateway direction without breaking working domains | PHASE-1 | chosen gateway architecture documented + contract tests green |`
- Related: DEV-002 (NestJS 10 expected / Express actual), ARCH-002 (NOT VERIFIED).

## READ → TRACE (actual gaps, file:line evidence)
- Chosen architecture is ALREADY documented in the binding contract: `ARCHITECTURE_CONTRACT.md` AC-1.0 («إطار الـ API حالياً: Express 5 (D-01)», «أي تعارض... هذه الوثيقة هي المرجع») + `P4D-01` («apps/api = Express 5 Application Composition Layer»).
- No `@nestjs`/`NestFactory` anywhere in the repo (verified).
- Contract ↔ runtime gaps vs `lib/api-spec/openapi.yaml`: **G2** root `/healthz` documented but not served; **G3** `/api/auth/forgot-password` + `/api/auth/reset-password` served (`routes/auth.ts:100,114`) but undocumented; **G1b** `/api/healthz` served but undocumented. (`/api/health`, `/api/metrics` proven served via the reading router — not gaps.)
- Canonical `/v1` surface (`v1.yaml`, 25 paths): fully aligned already (every documented path served — verified path-by-path).

## PLAN (scope)
Editable: `apps/api/src/app.ts`, `apps/api/src/routes/health.ts` (untouched in the end — no change needed), `lib/api-spec/openapi.yaml`, new contract test, governance docs. **Frozen:** V1, `_history/`, tag `BuyTuk.V0.1.3`, `lib/api-spec/v1.yaml` (api-zod source — no drift), migrations, auth/RBAC/tenant/RLS code (PHASE-2 boundary), **zero new dependencies** (no NestJS, no supertest — textual YAML probing).

## IMPLEMENT (minimal, additive)
1. `apps/api/src/app.ts` — root `/healthz` alias via mounting the EXISTING health router (same single handler, no duplication).
2. `lib/api-spec/openapi.yaml` — documented `/api/healthz`, `/api/auth/forgot-password`, `/api/auth/reset-password` (additive blocks, house style).
3. `apps/api/test/gateway-contract.test.ts` (NEW, 4 tests) — real app, no mocks, zero new deps.
4. `apps/api/vitest.config.ts` — test-infra fix: `@dictation-engine/` subpath alias (trailing-slash-only shape proven in core-32; a bare key alongside rewrote subpaths to a broken `<index.ts>/subpath`) + test-scope env block (same approved core-32 pattern; DB fallback credential-less — contract probes perform no DB queries; `/api/health` catches failures by design).
5. **ADR-029** (`docs/decisions/ADR-029-EXPRESS5-CANONICAL-GATEWAY.md`) — the chosen gateway architecture documented: **Express 5 is the canonical gateway** per the binding AC-1.0/P4D-01; NestJS 10 stack adoption deferred to a future owner ADR (ACR-E5-001/DEV-001 pattern).

## PROOF — TESTS (actual exit codes this phase; logs in /home/user/phase3_logs)
| Suite | Result |
|---|---|
| **Contract tests (NEW `gateway-contract.test.ts` + `auth.test.ts`)** | **8/8 PASS — exit 0** (`Test Files 2 passed (2) · Tests 8 passed (8)`): every openapi `/api/*` path served (no documented-but-missing), every mounted route (20, incl. root `/healthz` = 200 `{status:"ok"}`) documented, canonical `/v1` 25/25 served |
| Typecheck (background sequential runner) | `root-typecheck:0` · `tsc-composite-build:0` · 8 packages `tsc --noEmit:0` → **10/10** |
| Build | `root-build:0` (`pnpm run build`) |
| Database | **55/55 PASS** (exit 0) |
| Reading engine | **16/16 PASS** (exit 0) |
| Worker | **1/1 PASS** (exit 0) |
| P3 role-shell E2E (regression) | **8/8 PASS** (exit 0) |
| P2 voice E2E (regression) | **1/1 PASS** (exit 0) |
| P1 student UI (regression) | **4/5** — single failure P1-2 = the pre-existing text mismatch classified **DEV-013** (unchanged by PHASE-4; owner ruling: stays DEFERRED/OPEN, PHASE-6) |

## PROOF — SECURITY / INTEGRITY
- **SECRET SCAN:** PHASE-4 diff grep (11 pattern classes) = **0 hits** (exit 1) · new test file = **0 hits** · `NO_ENV_OR_KEY_FILES` (no credential literals added; test DB fallback is credential-less).
- **DIFF CHECK:** `git diff --check` = exit 0.
- **No production behavior change:** additive alias + additive docs + test-infra only; auth/RBAC/tenant/RLS untouched; `/v1` untouched; no new dependencies.

## Gate Checklist (all proven above)
READ PASS · TRACE PASS · PLAN PASS · IMPLEMENT PASS · TYPECHECK PASS · BUILD PASS · TESTS PASS · REGRESSION PASS (P1-2 = DEV-013 historical exception) · DIFF CHECK PASS · SECRET SCAN PASS · SECURITY/ISOLATION PASS (no boundary touched; contract surface enforced by tests) · DOCUMENTATION PASS (ADR-029 + STAGE_STATUS + TRACEABILITY + CHANGE_DEVIATION + this closeout) · WORKING TREE CLEAN (post-commit).

## Git
- Natural single phase commit (no new tag, tag untouched, no push): `phase4(api-gateway-alignment): Express5 canonical gateway ADR-029 + openapi contract completion + gateway contract tests`
- Final state + archive metadata recorded in the governance registry (PROJECT_VERSION / ADR-028 Version Chain Registry) right after the archive build, per ADR-028/D-12.

## Archive (mandatory, per ADR-028 + D-12)
A full Complete Project Reference snapshot of the post-PHASE-4 state is built from the actual working tree and delivered with a working download link, verified (`tar -tzf` exit 0) and hashed (SHA-256 recorded in MANIFEST + SIDECAR + the registry). **BuyTuk Academy 1.8** is adopted as the official version at this closeout (first issuance under ADR-028).

## Final state
- **PHASE-4 = CLOSED / PASS** · PHASE-5 = NOT STARTED · no push · REMOTE = BLOCKED / PENDING ACCESS
