# ADR-031 — Parent Visibility (PHASE-8): Link-Table Gate + Canonical Builder Reuse

Status: ADOPTED (2026-09-17, PHASE-8 closeout) · Supersedes: none · Relates to: ADR-028 (D-12), ADR-029 (Express 5 canonical gateway), ACR-E5-001 (thin-client shell), ARCHITECTURE_CONTRACT (Modular Monolith, thin adapters)

## Context
PHASE-8 (PARENT-CAPABILITIES, class A) acceptance: «parent access and visibility gates pass» (MASTER_ROADMAP). V1 §5.1.4: متابعة تقدم الأبناء · تقارير دورية · تواصل مع المعلمين · إشعارات فورية. Code evidence at phase open: the `parent` role exists in `users.role`, the PHASE-3 shell routes the parent root and DENIES parent JWTs on staff surfaces (P3-8/P7-3 — 403), but NO parent→child link exists in the schema and `assertStudentDetailAccess` verifies staff memberships only → a parent can see nothing (PAR-001 PARTIAL, DEV-008 GAP).

## Decision
1. **Additive link table** `parent_student_links` (migration `0008_phase8_parent_links.sql` — non-destructive): tenant-scoped, `(tenant_id, operation_key)` UNIQUE (database-backed idempotency, CORE-05/07 style), RLS policy `tenant_isolation_parent_student_links` (same mechanism as 0007 — fail-closed without the tenant GUC).
2. **Canonical capability** in `packages/database` (`parents/visibility.ts`): `listParentChildren` + `assertParentStudentAccess` — both inside `withTenant` (transaction-local `app.tenant_id`); semantics mirror the staff gate: cross-tenant student → `STUDENT_NOT_FOUND_IN_TENANT` (404 — no existence leak), own-tenant unlinked child → `PARENT_ACCESS_DENIED` (403); access audited to `audit_logs` (same channel as the staff detail gate).
3. **Thin adapter** `apps/api/src/v1/parents.ts` mounted under `/v1`: `GET /parents/children`, `GET /parents/children/:studentId/dashboard` — `authorize("parent")` + the EXACT dashboard composition proven in PHASE-6/7 (`buildLearnerModel`/`buildStudentTimeline`/`listMasteryRecords`/`buildStudentPatterns`/`listStudentAttempts`/`buildLearningPathProposals`). NO SQL, NO business rules in the router (Architecture Contract).
4. **Shell integration** (ACR-E5-001, zero-build): parent portal dashboard/children/progress/reports render the REAL children list + REAL child report; `communication` stays an explicit «غير مدعومة بعد» placeholder (PHASE-11 — DEV-006 messaging family). Zero mock data.

## Alternatives rejected
- **Extend `assertStudentDetailAccess` to accept parents** — blurs staff-scope semantics (TENANT/SCHOOL/GRADE/CLASS) with a family relation; risks the proven teacher gate (PHASE-7). A separate parent gate keeps both honest.
- **Reuse `staff_memberships` with a PARENT scope type** — overloads the staff concept; parents are not staff; membership lifecycle differs.
- **No-link parent access to any child** — violates the AC (access gate) and tenant-isolation posture.

## Consequences
- New surface: 2 documented parent endpoints (additive to `openapi.yaml`; `v1.yaml` canonical 25 paths untouched/frozen per PHASE-4).
- New migration 0008 (additive; no existing table/row modified). RLS-protected from birth.
- Zero new dependencies; zero new frameworks; Express 5 gateway unchanged (ADR-029).
- Deferred (unchanged): communication/notifications → PHASE-11 (DEV-006); link management UX/APIs for admins → future need (rows are created administratively; out of PHASE-8 AC).
