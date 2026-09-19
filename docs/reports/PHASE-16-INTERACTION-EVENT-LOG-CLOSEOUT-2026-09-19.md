# PHASE-16 CLOSEOUT — INTERACTION-EVENT-LOG (§3.3) — 2026-09-19

> **Binding preamble (DEV-014 + DEV-016):** *PHASE-13 (AI-RUNTIME-PROOF) remains open — moved to LAST (after PHASE-26) by the binding 2026-09-19 ruling; this closure does not include audio-AI proof (DEP-001 stays NOT VERIFIED in TRACEABILITY_MATRIX.md until a real GPU proof exists).*

**Base:** verified BuyTuk Academy 1.18 @ `baf4247` — byte-verified at phase open (archive sha256 `8f4255ee…56a99`, 456,683,607 B, extract exit 0, carried `.git` @ `baf4247` dirty=0) and re-proven this phase with a fresh `sha256sum` + `git log -1`. PHASE-16 built strictly on the extracted archive tree (no parallel branches, no memory-based adoption). Close commit `24b8eb1`.

## Delivered (§3.3, reuse-first)
- **Migration 0011** (additive-only; **ADR-037** documents essentiality + rejected alternatives): `interaction_events` — 7-class event vocabulary (CHECK), `(tenant_id, operation_key)` idempotency, DB-clock `occurred_at`, behavioral indexes, RLS enabled+forced (0007 mechanism).
- **Canonical capability** `packages/database/src/interaction/capability.ts` — ALL SQL (withTenant everywhere): `recordInteractionEvent` (idempotent) + `listInteractionEvents` (tenant-scoped, desc by occurred_at).
- **Fire-and-forget hooks** (`logInteractionEvent` — never throws) wired into the REAL adapters: student-login success → LOGIN, student-login failure → LOGIN_FAILED (with reason), staff /auth/login → LOGIN, attempts start → ATTEMPT_START (replay-collapsed via operation_key), attempts submit → ATTEMPT_SUBMIT (mode + duration).
- **Thin /v1 surface**: staff listing (role-gated teacher/principal/admin, studentId/eventType/limit filters) + student `/mine` (own rows only).

## Gates (all values from real commands; register `/home/user/phase16_logs/exit_codes.txt`)
| Gate | Result |
|---|---|
| MIG-1 | psql apply 0011 exit 0 (table + 2 indexes + RLS policy); ADR-037 |
| P16 E2E gate | `tests/core-32/p16-interaction-event-log.e2e.test.ts` — real app+PG+Redis: **4/4 PASS, exit 0** — real logins → LOGIN with REAL in-window DB timestamps; a login creates ZERO evidence rows (separation proven); attempt start/replay → exactly ONE ATTEMPT_START; submit → ATTEMPT_SUBMIT with START ≤ SUBMIT; real 4xx login → LOGIN_FAILED with reason; staff listing role-gated (student 403), student /mine own-only, tenant-B sees ONLY its own events (RLS fail-closed) |
| REG-0 | full matrix **exit 0**: typecheck · build · db 55/55 · obs 6/6 · worker 1/1 · api 8/8 · engine 24/24 · E1 11/11 · E4 7/7 · core-32 per-file: p1 5/5, p2 1/1, p3 8/8, p7 5/5, p8 5/5, p9 5/5, p10 5/5, p11 5/5, p15 6/6, auth-sec 5/5 · secret-diff 0 · secret-tree 0 · diff-check clean |

## Deviations honored
- **DEV-014** (binding preamble): PHASE-13/DEP-001 open — out of scope.
- **DEV-016**: final sequencing ruling — PHASE-13 moved to LAST (after PHASE-26); one consolidated GPU proof (RunPod, 3-5 USD initial budget) after everything GPU-free closes.

## Reference
New single-file reference **BuyTuk Academy 1.19** = `buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-16-2026-09-19.tar.gz` (D-3/D-12: sha256 + exact size + `tar -tzf` verified before link delivery; gofile channel; **archive itself uploaded in-conversation** per ruling §4). See MANIFEST-PHASE16-COMPLETE-REFERENCE.md. Commit counts (labeled): TOTAL=57 · ABOVE 1.12 base `01d3ce6`=35 · ABOVE 1.18 `baf4247`=9.
