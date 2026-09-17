# ADR-032 — Principal/Admin Oversight (PHASE-9): Scope-Gate Reuse + SELECT-Only Admin Reads

Status: ADOPTED (2026-09-17, PHASE-9 closeout) · Supersedes: none · Relates to: ADR-028 (D-3/D-12), ADR-029 (Express 5 canonical gateway), ADR-031 (parent visibility), ACR-E5-001 (thin-client shell), ARCHITECTURE_CONTRACT (Modular Monolith, thin adapters)

## Context
PHASE-9 (PRINCIPAL-ADMIN-CAPABILITIES, class A) acceptance: «oversight/admin gates pass» (MASTER_ROADMAP) — closes DEV-009. Code evidence at phase open: the `principal`/`admin` roles exist in `users.role` and route to their portal roots (P3-4/P3-5), `/v1/teacher/review-queue` already authorizes `("teacher","principal","admin")` (teacher.ts:77), `assertStudentDetailAccess` is a SCOPE gate (TENANT/SCHOOL/GRADE/CLASS over `staff_memberships` — role-agnostic), and `/v1/oversight/aggregates` exposes privacy-suppressed aggregates through `assertStaffScope`. What was missing: no portal proof for principal/admin views (teachers/students/classes/analytics/reports + users/queue/audit rendered «غير مدعومة بعد» placeholders) and no read surface for staff roster / classes / user accounts / audit trail.

## Decision
1. **No new migration, no schema change.** Principal/admin consume EXISTING tenant-scoped tables (`staff_memberships`, `users`, `classes`, `students`, `audit_logs`) already RLS-protected by migration 0007. Institutional placement reuses the proven membership model (User → Membership → Role → Scope) — a principal/admin is a user with an ACTIVE staff membership (SCHOOL/TENANT scope), not a new concept.
2. **Canonical READ capabilities** in `packages/database/src/principal/admin.ts`: `listTenantStaff`, `listTenantClasses`, `listTenantUsers`, `listAuditEvents` — SELECT-only, inside `withTenant` (transaction-local `app.tenant_id` → RLS fail-closed), sensitive listings audited to `audit_logs` (same channel as the detail gates). Never expose `password_hash` (SafeUser projection).
3. **Thin adapter** `apps/api/src/v1/principal.ts` mounted additively in `v1/index.ts`: `GET /admin/staff` + `GET /admin/classes` → `authorize("principal","admin")`; `GET /admin/users` + `GET /admin/audit` → `authorize("admin")` (account/audit administration is an admin duty, not a school-ops duty). Documented in `openapi.yaml` (gateway-contract: every mounted /v1 route documented); `v1.yaml` canonical 25 paths untouched/frozen per PHASE-4.
4. **Reuse-first surfaces (zero new endpoints for them):** principal students/reports reuse the review-queue + `GET /v1/students/:id/dashboard` (scope gate — PHASE-7 proven); principal analytics reuses `GET /v1/oversight/aggregates` (k-anonymity suppression intact); admin queue reuses the review-queue.
5. **Shell integration** (ACR-E5-001, zero-build): principal dashboard/teachers/students/classes/analytics/reports and admin dashboard/users/queue/audit render REAL data; admin models/settings stay explicit «غير مدعومة بعد» placeholders re-targeted PHASE-12 (production/ops surfaces — no real backend exists today); teacher classes → PHASE-11 (coordination family), teacher settings → PHASE-12. Zero mock data.

## Alternatives rejected
- **New `admin_*` tables / migration 0009** — duplicates canonical rows; violates single-source-of-truth and additive-only posture. Reads over canonical tables are the oversight contract (aggregates, not copies).
- **One privileged endpoint serving all admin views** — collapses the role boundary proven in D-03 RBAC; principal (school ops) must not read user credentials or the raw audit trail.
- **Extending `assertStudentDetailAccess` with role special-cases** — the gate is scope-based by design (20-B); role selection happens at the router (`authorize(...)`) layer. Mixing both would blur the proven PHASE-2/7 boundary.
- **Mock/demo data in principal/admin dashboards** — violates the project-wide no-mock rule (P7-5/P8-5 pattern); unbuilt caps keep explicit placeholders.

## Consequences
- New surface: 4 documented admin endpoints (additive; `v1.yaml` frozen 25 paths untouched).
- Zero new dependencies, zero new frameworks, zero migrations; Express 5 gateway unchanged (ADR-029).
- DEV-009 closes at PHASE-9 closeout; deferred (unchanged): admin link-management UX → future need; models/settings surfaces → PHASE-12 (DEV-010 quality/production family).
