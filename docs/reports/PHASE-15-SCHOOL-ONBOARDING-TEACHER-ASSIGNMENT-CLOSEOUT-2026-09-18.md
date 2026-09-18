# PHASE-15 CLOSEOUT — SCHOOL-ONBOARDING-AND-TEACHER-ASSIGNMENT — 2026-09-18

> **Binding preamble (DEV-014):** *PHASE-13 remains open awaiting a GPU environment — this closure does not include audio-AI proof (DEP-001 stays NOT VERIFIED in TRACEABILITY_MATRIX.md until real GPU evidence exists).*

**Base:** verified BuyTuk Academy 1.17 @ `9425131` (byte-verified at phase open: HEAD/TOTAL=43/dirty=0, tag intact, PG+Redis up) → close commit `36e5eb1`. Governing doc **v2.1** adopted (numbering final per DEV-015). No parallel branches; Express 5 gateway (ADR-029) and `app.js` untouched.

## Delivered (§3.1 + §3.2, reuse-first)
- **Migration 0010** (additive-only; **ADR-036** documents why it is essential and the rejected alternatives): `school_requests` · `teaching_slots` · `teaching_slot_overrides` — all tenant-scoped, RLS enabled+forced (0007 mechanism), `(tenant_id, operation_key)` idempotency (0008/0009 template).
- **Canonical capability** `packages/database/src/onboarding/capability.ts` — ALL SQL lives here: §3.1 pending-by-default requests with CAS approval (the ONLY activation path; APPROVED creates+links the school in-transaction); §3.2 subject×school slots where the DB UNIQUE constraint + single-statement conditional UPDATE (`claim_status='OPEN'→'CLAIMED'`) form the real atomic lock; audited principal override; multi-school teachers by design.
- **Thin /v1 adapter** `apps/api/src/v1/onboarding.ts` (7 endpoints, zod-validated, Idempotency-Key contract) — zero SQL, zero business rules (Architecture Contract).

## Gates (all values from real commands; register `/home/user/phase15_logs/exit_codes.txt`)
| Gate | Result |
|---|---|
| MIG-1 | psql apply 0010 exit 0 (3 tables + indexes + 3 RLS policies created); ADR-036 |
| P15 E2E gate | `tests/core-32/p15-school-onboarding-teacher-assignment.e2e.test.ts` — **6/6 PASS, exit 0** on the REAL app+PG+Redis: P15-1 pending-default/idempotent/no-auto-activation · P15-2 approval flow (201→linked school; dup 200; conflict 409) · P15-3 exclusivity (201 → 409 `SLOT_ALREADY_CLAIMED`) · **P15-4 REAL concurrency: two simultaneous claims on one slot → exactly one 201 + one 409** · P15-5 multi-school (Math@S1→Math@S2 201) + audited override (dup 200; OPEN-slot 409) · P15-6 RLS fail-closed (tenant-B zero rows; cross-tenant claim 404) |
| REG-0 | full matrix **exit 0**: typecheck · build · db 55/55 · obs 6/6 · worker 1/1 · api 8/8 · engine 24/24 · E1 11/11 · E4 7/7 · core-32 per-file: p1 5/5, p2 1/1, p3 8/8, p7 5/5, p8 5/5, p9 5/5, p10 5/5, p11 5/5, auth-sec 5/5 (429 path intact) · secret-diff 0 · secret-tree 0 real · diff-check clean |

## Deviations honored
- **DEV-014** (binding preamble): PHASE-13/DEP-001 open pending GPU — out of this closure's scope.
- **DEV-015**: v2.1 governing-doc renumbering recorded; STAGE_STATUS/MASTER_ROADMAP now carry the v2.1 map (engagement-extras → PHASE-23).

## Reference
New single-file reference **BuyTuk Academy 1.18** = `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-15-2026-09-18.tar.gz` (D-3/D-12: sha256 + exact size + `tar -tzf` verified before link delivery; gofile channel). See MANIFEST-PHASE15-COMPLETE-REFERENCE.md. Commit counts (labeled): TOTAL=47 · ABOVE 1.12 base `01d3ce6`=25 · ABOVE 1.17 `9425131`=4.
