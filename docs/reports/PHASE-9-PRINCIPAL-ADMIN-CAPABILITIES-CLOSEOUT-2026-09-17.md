# PHASE-9 Closeout — PRINCIPAL-ADMIN-CAPABILITIES (DEV-009 closure) — 2026-09-17

Status: **CLOSED / PASS** · Phase commit: `6afd0174014713ef3cc0d6259c5495325354bb14` · Base (verified 1.12 reference): `01d3ce6` · Version adopted: **BuyTuk Academy 1.13** (per ADR-028: assigned at CLOSE + ARCHIVE)

## Scope executed (reuse-first — zero migrations, zero new dependencies)
- **Canonical READ capabilities** `packages/database/src/principal/admin.ts`: `listTenantStaff` / `listTenantClasses` / `listTenantUsers` / `listAuditEvents` — SELECT-only, inside `withTenant` → RLS (0007), sensitive listings audited to `audit_logs`, SafeUser projection (never `password_hash`).
- **Thin adapter** `apps/api/src/v1/principal.ts`: `GET /v1/admin/staff` + `GET /v1/admin/classes` → `authorize("principal","admin")`; `GET /v1/admin/users` + `GET /v1/admin/audit` → `authorize("admin")`. Mounted additively in `v1/index.ts`; documented in `openapi.yaml` (gateway-contract intact); `v1.yaml` frozen 25 paths untouched.
- **Reuse-first surfaces**: principal students/reports reuse `/v1/teacher/review-queue` (already authorizes principal/admin — teacher.ts:77) + `GET /v1/students/:id/dashboard` (`assertStudentDetailAccess` scope gate, PHASE-7-proven); principal analytics reuses `/v1/oversight/aggregates` (k-anonymity suppression intact); admin queue reuses the review-queue.
- **Shell integration** (ACR-E5-001, zero-build): principal dashboard/teachers/students/classes/analytics/reports + admin dashboard/users/queue/audit render REAL data; admin models/settings explicit «غير مدعومة بعد» placeholders re-targeted PHASE-12; teacher classes → PHASE-11, settings → PHASE-12.
- **ADR-032** documents the decision (scope-gate reuse + SELECT-only reads; alternatives rejected).

## Gate evidence (raw exit codes in `/home/user/phase9_logs/exit_codes.txt` equivalents)
| Gate | Result |
|---|---|
| typecheck (root) + per-package (api, db) | exit 0 / 0 / 0 |
| build (root, composite) | exit 0 |
| Library suites: db 55/55, obs 6/6, worker 1/1, api 8/8, engine 24/24 | all exit 0 |
| **P9 E2E (new gate)** — real browser + real API + real PG/Redis | **5/5 PASS, exit 0** |
| core-32 official seven files (p1,p2,p3,p7,p8,p9,auth-sec) under the matrix test-scoped env | 34/34 PASS (p9 file 5/5; p1 file verified 5/5 under the official matrix condition) |
| Regression E1 (core-28) | 11/11, exit 0 |
| Regression E4 (core-31) | 7/7, exit 0 |
| Secret scan (diff + tree) | 0 hits, exit 0 |
| diff-check | exit 0 |

**Known flake (pre-existing, NOT a PHASE-9 break — proven by cross-execution):** `p1` P1-5 intermittently times out on `#view-dashboard` when run WITHOUT the matrix test-scoped `AUTH_RATE_LIMIT_MAX` env (a 429 appears mid-suite). The identical failure reproduces on **clean `01d3ce6`** (stash → run → pop verified: exit 1 both ways), and the file passes 5/5 under the official matrix condition (exit 0, `p1_official_env.log`). P2..P9 fixtures set the env in-file per DEV-013 "Test-scoped env ONLY"; p1 relies on the matrix condition.

## DEV-009 status
**CLOSED** — CHANGE_DEVIATION_RECORD row updated (history preserved); STAGE_STATUS PHASE-9 row → CLOSED / PASS; PROJECT_VERSION 1.13 registered.

## Delivery (D-3/D-12)
`buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-9-2026-09-17.tar.gz` — single file, sha256 + exact byte size + `tar -tzf` exit 0 documented in `MANIFEST-PHASE9-COMPLETE-REFERENCE.md` BEFORE upload; upload round-trip re-hash verified. Payload: `repo/` @ close commit (full .git history, tag `BuyTuk.V0.1.3` untouched) + `_history/` (2,760 entries / 2,424 regular files) carried from the verified 1.12 reference.
