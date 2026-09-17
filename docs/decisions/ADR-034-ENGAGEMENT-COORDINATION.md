# ADR-034 — PHASE-11 Engagement/Coordination: Required Migration 0009, Scope Decisions, and Deferrals

Status: ADOPTED (2026-09-17, PHASE-11 closeout) · Relates to: ADR-028 (D-3), ADR-031 (0008 RLS/idempotency template), ADR-032 (admin gates), ADR-033 (ratings re-target), ARCHITECTURE_CONTRACT

## Context
PHASE-11 (GAMIFICATION-MESSAGING-ATTENDANCE, class A/D) closes DEV-005 (wallet/points), DEV-006 (messages), DEV-007 (attendance). Trace at phase open (pinned 1.14 tree @ `d4f7569`): **no canonical table existed** for wallet, messages, or attendance (schema inventory 18 files, zero matches), and the corresponding portal caps rendered «غير مدعومة بعد» placeholders (student messages/wallet/points-store/notes, teacher attendance/schedule/ratings/classes, parent communication). Unlike PHASE-9/10 (pure reuse), this stage's acceptance REQUIRES real feature surfaces — a schema addition is therefore functionally necessary.

## Decision
1. **Migration 0009 (the documented zero-migration exception).** Five tables — `wallet_accounts`, `wallet_ledger`, `messages`, `attendance_records`, `teacher_ratings` — all cloned from the 0008 template: tenant-scoped (single `tenant_id` → RLS policy per 0007 mechanism, fail-closed), `(tenant_id, operation_key) UNIQUE` database-backed idempotency (CORE-05/06/07 principles), additive-only (no existing table touched). `teacher_ratings` honors the ADR-033 §3 re-target (ratings cap becomes real here). The drift-check snapshot/journal mechanism stays at the canonical flow used since 0008 (manual apply to the verify DB, as PHASE-8 did).
2. **Canonical capabilities in `packages/database/src/engagement/`** (wallet.ts, messaging.ts, attendance.ts, ratings.ts): every query inside `withTenant` → RLS; wallet credit is staff-only + ledger-audited (balance moves ONLY with a ledger row — append-only accounting); messaging restricts recipients to same-tenant users (cross-tenant → 404 `RECIPIENT_NOT_IN_TENANT`, existence-hiding posture); attendance uses DAILY idempotency `UNIQUE (tenant_id, student_id, session_date)` (a re-mark returns the existing row, `created:false`, never a duplicate) with the membership-scope gate (TENANT / SCHOOL-of-class / CLASS==classId — the assertStudentDetailAccess posture); ratings gate identical.
3. **Thin adapter** `apps/api/src/v1/engagement.ts` mounted additively: `GET /v1/wallet` (student's OWN account), `POST /v1/wallet/:studentId/credit` (teacher/principal/admin + required Idempotency-Key), `GET|POST /v1/messages` (any authenticated member), `GET|POST /v1/attendance` (staff roles), `GET|POST /v1/ratings` (staff roles). Documented in `openapi.yaml` (gateway-contract intact); frozen `v1.yaml` untouched.
4. **Shell integration** (ACR-E5-001): student wallet/messages, teacher attendance/ratings, parent communication render REAL data; **deferred with explicit placeholders re-targeted PHASE-12**: student points-store (spend/purchase needs store tables + transaction semantics), student notes, student support, teacher schedule, teacher classes (class-management UX is not in this phase's gamification/messaging/attendance scope); badges/store purchases deferred with them.

## Alternatives rejected
- **Another zero-migration phase (reuse-only)** — impossible: the stage's features have no canonical storage; faking them with mocks violates the no-mock rule, and stuffing engagement rows into unrelated tables (audit_logs/evidence) would corrupt the Evidence single-writer invariant.
- **JSONB blob table (one generic `engagement_events` table)** — rejected: loses typed constraints (balance ≥ 0, status enum, daily-unique attendance), RLS policy granularity, and the 19-H membership/ownership modeling discipline.
- **Merging wallet balance into users/students rows** — rejected: unledgerized balances break auditability (append-only ledger is the accounting invariant) and would touch canonical auth tables.
- **Per-message tenant broadcast / notifications system** — out of scope (no notification infrastructure exists); 1:1 same-tenant messages only, deferred remainder documented.

## Consequences
- DEV-005/006/007 close at this phase's closeout; ratings cap real (ADR-033 re-target honored).
- First schema migration since 0008; drift-check/pipeline re-validated on core32_verify.
- PHASE-12 placeholder set is now explicit: student points-store/notes/support, teacher schedule/classes, admin models/settings (production/ops family).
