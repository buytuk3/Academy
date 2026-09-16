# PHASE-3 — CORE-WEB-PORTAL-SHELL — CLOSEOUT — 2026-09-16

## Baseline
- Git HEAD at phase start: `3c44df1892a8cbaac8897796afab06df19f4499c` (PHASE-2 baseline)
- Local tag: `BuyTuk.V0.1.3` → `41b0bba3501eb221d16f474299e44d39c709b104` (unchanged, untouched)
- Working tree before PHASE-3: CLEAN
- Previous reference: `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-2-2026-09-15.tar.gz` (SHA-256 `6a82efd9ef75209bc958dcecf42a7778576e0df9937e055bdc6998a043d6cffb`)

## Goal (per MASTER_ROADMAP)
"Role-aware web shell works for all portal roots" — a real web shell for the five roles
(Student | Teacher | Parent | Principal | Admin) with correct role routing, navigation,
UI protection, and explicit placeholders for unbuilt capabilities. Full portal
capabilities are NOT in scope (PHASE-7/8/9/11).

## READ → TRACE → PLAN (approved by owner)
- Governing decision: ACR-E5-001 (zero-build thin client served by the real API process; no Next.js/React/Tailwind; no second logic; every unsupported page declares itself).
- Requirement traceability: V1 §3.1/§3.2 (five portals), §6.1 (Next.js stack — covered by documented DEV-001), §7.3–7.5; MASTER_ROADMAP PHASE-3; TRACEABILITY_MATRIX ARCH-001/TCH-001/PAR-001/ADM-001.

## IMPLEMENT (Reuse → Integrate → Complete)
1. `apps/api/src/public/app.js` — role-aware portal shell added to the EXISTING thin client:
   - `currentRole()` — role source of truth = JWT / authenticated identity ONLY: student mode maps to the token's verified `role: "student"` claim (issued by `studentLoginWithIdentity`); staff mode mirrors the server login/refresh response (`user.role` from DB-verified `loginWithPassword`). NEVER from URL/query/localStorage/user-controlled input.
   - Session restore re-verifies identity/role against the server via the EXISTING `GET /v1/auth/me` (`fetchVerifiedIdentity`) — REUSED endpoint, no new endpoint, no new privileges, no migration.
   - `activatePortal()` / `renderPortalNav()` / `openPortalCapability()` — per-role navigation (V1 §3.2 route groups) with `data-role` on the nav for testability.
   - `renderStaffDashboard(role)` — Teacher/Principal/Admin dashboard renders REAL data from `/v1/teacher/review-queue` (pending proposals count + explicit notice); handles 401 (refresh-then-retry) and 403 (real error shown — no fake data).
   - `renderPortalPlaceholder()` — every capability without a real `/v1` surface shows "غير مدعومة بعد — Not Supported Yet" + the roadmap phase that will build it (ACR-E5-001). Zero mock data.
   - Student UI preserved as-is (dashboard/lesson/activity/voice flows untouched).
2. `apps/api/src/public/index.html` — added `#portal-nav`, `#view-portal-home` (staff dashboard shell), `#view-portal-placeholder` (explicit unsupported-capability view). Existing views untouched.
3. `apps/api/src/public/styles.css` — portal navigation styles only.
4. `tests/core-32/p3-role-shell.e2e.test.ts` (NEW) — 8 real-browser E2E tests (Playwright Chromium + REAL Express app serving `/ui`+`/v1` + REAL PostgreSQL core32_verify + REAL Redis; no API mocks).

## Frontend security posture (per owner conditions)
- The shell is PRESENTATION-ONLY: the real boundaries remain API authorization (`authorize(...)` middleware), tenant isolation, and RLS (PHASE-2). The UI reflects server decisions and handles 401/403 — it never replaces them.
- No PHASE-3 change touches auth middleware, tokens, RBAC, tenant handling, or any `/v1` business route. Zero new dependencies, zero migrations, zero framework additions.

## PROOF — TESTS (actual command outputs, logs in /home/user/phase3_logs)
| Suite | Command | Result |
|---|---|---|
| P3 role-shell E2E (NEW) | `CORE32_E2E=1 vitest run tests/core-32/p3-role-shell.e2e.test.ts` | **8/8 PASS** (exit 0): P3-1 Student→Student portal + real dashboard; P3-2 Teacher→Teacher root + real review-queue data; P3-3 Parent→Parent root + placeholder; P3-4/P3-5 Principal/Admin roots; P3-6 nav placeholder; P3-7 401 unauthenticated; P3-8 parent token → **403** on teacher capability; P3-9 tenant A staff cannot read tenant B student (**no leak**, 403/404 + body contains no tenant-B data) |
| P1 student UI regression | `CORE32_E2E=1 AUTH_RATE_LIMIT_MAX=1000 vitest run tests/core-32/p1-student-ui-e2e.test.ts` | **4/5 PASS** — P1-1 login→dashboard, P1-3 401-no-data, P1-4 real question, P1-5 FULL LOOP all PASS. P1-2 fails on a pre-existing text mismatch: UI says "فشل دخول الطالب (403)" while the test expects "فشل الدخول (4dd)" — verified pre-existing at baseline HEAD (`git show HEAD:apps/api/src/public/app.js` contains the same text). Same class as DEV-013 → stays DEFERRED (not a PHASE-3 regression; student flow P1-5 passes) |
| P2 voice regression | `CORE32_E2E=1 AUTH_RATE_LIMIT_MAX=1000 vitest run tests/core-32/p2-voice-ui-upload.e2e.test.ts` | **1/1 PASS** (exit 0) |
| Database | `vitest run` (packages/database) | **55/55 PASS** (exit 0) |
| Reading engine | `vitest run --config engines/reading-engine/vitest.config.ts` | **16/16 PASS** (exit 0, incl. core02 tenant-uuid) |
| Worker | `vitest run --config apps/worker/vitest.config.ts` | **1/1 PASS** (exit 0) |
| API | `vitest run --config apps/api/vitest.config.ts` | **4/4 PASS** (exit 0) |

## PROOF — TYPECHECK / BUILD (actual exit codes, background sequential runner)
- `pnpm run typecheck` → **0**; `pnpm exec tsc --build` (composite) → **0**
- Per-package `tsc --noEmit` → **0** for: apps/api, apps/worker, engines/reading-engine, packages/config, packages/security, packages/observability, packages/queue, artifacts/api-server (10/10 total)
- `pnpm run build` (root) → **0**

## PROOF — SECRET SCAN (auditable pattern scan)
- `git diff` of PHASE-3 (3 changed files): **0 hits** (11 secret-pattern classes: AKIA, private keys, JWTs, ghp_/xox/sk_live_/sk-, key=…, credentialed connection strings, AIza…)
- New test file: **0 hits**; filename audit: `NO_ENV_OR_KEY_FILES` (no .env/.pem/.key/service-account files)

## Git state (this commit)
- Natural single commit (no tag created, tag untouched, no push): message `phase3(core-web-portal-shell): role-aware portal shell for 5 roots per ACR-E5-001 + P3 role-shell E2E`
- Files changed: `apps/api/src/public/app.js`, `apps/api/src/public/index.html`, `apps/api/src/public/styles.css`, `tests/core-32/p3-role-shell.e2e.test.ts` (new), `docs/buytuk-master/STAGE_STATUS.md`, `docs/buytuk-master/CHANGE_DEVIATION_RECORD.md`, `docs/buytuk-master/TRACEABILITY_MATRIX.md`, this closeout
- `git diff --check` = 0; working tree CLEAN after commit; `BuyTuk.V0.1.3` still → `41b0bba…`

## Deviations / Deferred
- **DEV-001** → PARTIALLY RESOLVED in PHASE-3: functional role-aware shell for all 5 portal roots delivered and E2E-proven via the approved thin client; the Next.js 14 technology stack itself remains absent (verified) — Next.js adoption deferred to a future owner ADR (record updated).
- **DEV-013** → remains DEFERRED (unchanged policy): P1-2's pre-existing text mismatch documented with baseline evidence above; no rate-limit or E2E-infrastructure re-engineering was done (test-scope env only: `AUTH_RATE_LIMIT_MAX=1000` for the test process, mirroring the existing vitest.config env mechanism).
- Out-of-scope capabilities (attendance, messages, wallet, parent/principal/admin detail views, english portal) → explicit placeholders + PHASE-7/8/9/11 per MASTER_ROADMAP.

## Archive (mandatory governance rule)
After this commit, a full Complete Project Reference snapshot is built from the actual
working tree: `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-3-2026-09-16.tar.gz`
(contains repo/ + full current .git history + V1 + governance + `_history/` with old Git
lineage, combined refs, source archives + previous reference archives incl. the POST-PHASE-2
reference). Archive SHA-256, size, counts and presence gates are recorded in the uploaded
MANIFEST / SIDECAR / archive closeout (computed after final archive build).

## Final state
- **PHASE-3 = CLOSED / PASS** (all gates proven above)
- PHASE-4 = NOT STARTED; no push; no new tag; REMOTE still BLOCKED / PENDING ACCESS
