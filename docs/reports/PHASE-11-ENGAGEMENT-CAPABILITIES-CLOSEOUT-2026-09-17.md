# PHASE-11 Closeout — GAMIFICATION-MESSAGING-ATTENDANCE (DEV-005/006/007 closure) — 2026-09-17

Status: **CLOSED / PASS** · Base (verified 1.14 reference): `d4f7569` · Version adopted: **BuyTuk Academy 1.15** (per ADR-028: assigned at CLOSE + ARCHIVE)

Commits: **phase/governance commit `a5dc8ca`** (implementation + migration 0009 + P11 gate + ADR-034 + STAGE_STATUS/CDR/PROJECT_VERSION rows) and **close commit = the commit introducing this report** (closeout record only). Working tree clean at archive time; tag `BuyTuk.V0.1.3` → `41b0bba…` untouched.

## Scope executed (ADR-034 — the DOCUMENTED zero-migration exception)
- **Migration 0009** (`0009_phase11_engagement_coordination.sql`): five tenant-scoped tables — `wallet_accounts`, `wallet_ledger`, `messages`, `attendance_records`, `teacher_ratings` — cloned from the 0008 template (RLS per the 0007 fail-closed mechanism + `(tenant_id, operation_key)` UNIQUE database-backed idempotency), applied to `core32_verify` this session. No existing table touched (additive only). `teacher_ratings` honors the ADR-033 §3 re-target.
- **Canonical capabilities** `packages/database/src/engagement/{wallet,messaging,attendance,ratings}.ts`: everything inside `withTenant` → RLS; append-only ledger (balance moves ONLY with a ledger row); same-tenant recipients only (cross-tenant → 404 `RECIPIENT_NOT_IN_TENANT`, existence-hiding); attendance DAILY idempotency `UNIQUE (tenant_id, student_id, session_date)` (re-mark returns the existing row, `created:false`); membership-scope gates (TENANT / SCHOOL-of-class / CLASS==classId).
- **Thin adapter** `apps/api/src/v1/engagement.ts`: `GET /v1/wallet` (student's OWN), `POST /v1/wallet/:studentId/credit` (teacher/principal/admin + required Idempotency-Key), `GET|POST /v1/messages`, `GET|POST /v1/attendance`, `GET|POST /v1/ratings` — mounted additively, documented in `openapi.yaml` (gateway-contract intact), frozen `v1.yaml` untouched.
- **Shell integration** (ACR-E5-001): student wallet/messages, teacher attendance/ratings, parent communication render REAL data; deferred caps keep explicit placeholders re-targeted **PHASE-12** (student points-store/notes/support, teacher schedule/classes — ADR-034 §4).
- **ADR-034** documents the decision and the rejected alternatives (incl. why a migration was functionally necessary here, unlike PHASE-9/10).

## Gate evidence (raw exit codes: /home/user/phase11_logs/exit_codes.txt — all produced this session)
| Gate | Result | Exit |
|---|---|---|
| typecheck (root, incl. tests) | clean | 0 |
| build (composite) | clean | 0 |
| Library suites | db 55/55, obs 6/6, worker 1/1, api 8/8, engine 24/24 | all 0 |
| **P11 E2E (new gate)** — real browser + real API + real PG/Redis | **5/5 PASS** | 0 |
| core-32 official files, per-file run | **44/44 PASS**: p1 5, p2 1, p3 8, p7 5, p8 5, p9 5, p10 5, p11 5, auth-sec 5 | 9×0 |
| Regression E1 (core-28) | 11/11 | 0 |
| Regression E4 (core-31) | 7/7 | 0 |
| Secret scan (diff + tree) | 0 hits | 0 / 0 |
| diff-check | clean | 0 |

Alignment-assertion evolutions this phase (approved roadmap, same pattern as P3-3 in PHASE-8): P3-6 attendance→settings placeholder; P7-5 attendance real + schedule PHASE-12; P8-5 communication real; P10-5 ratings real.
One real defect was caught and fixed BY the new gate before closeout: `creditWallet` initially missed a tenant-membership check (P11-5 cross-tenant credit returned 201) — fixed to 404 `STUDENT_NOT_FOUND_IN_TENANT` and re-proven 5/5.

## Commit-count erratum (correction requested by management, 2026-09-17)
Earlier closeout reports quoted "24 commits at HEAD=6590522" and "25 commits at HEAD=d4f7569" ABOVE `01d3ce6`. Those numbers were the TOTAL history counts (`git rev-list --count HEAD`), not the counts above the base — a conflation of two different metrics. The correct counts ABOVE `01d3ce6` are `git rev-list --count 01d3ce6..HEAD`: **2** at `6590522` and **3** at `d4f7569` (verified live this session). Corrected generator logic from now on: "commits above base" = `git rev-list --count 01d3ce6..HEAD`; "total history" = `git rev-list --count HEAD`, always labeled separately. At THIS closeout (HEAD `a5dc8ca`): **total = 26, above base = 4**.

## Delivery (D-3/D-12)
`buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-11-2026-09-17.tar.gz` — single file via the external host (gofile.io): sha256 + exact byte size + `tar -tzf` exit 0 documented in `MANIFEST-PHASE11-COMPLETE-REFERENCE.md` BEFORE the link is sent; server-reported size+MD5 and a FULL browser round-trip re-download verified to match. Payload: `repo/` @ this close commit (full .git history, tag `BuyTuk.V0.1.3` → `41b0bba…` untouched) + `_history/` (2,760 entries = 2,424 files + 336 dirs) carried from the verified reference chain.
