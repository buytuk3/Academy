# PHASE-19 CLOSEOUT — CROSS-STAGE-ESCALATION-ENGINE (governing doc v2.1 §3.6) — 2026-09-20

- Base: BuyTuk Academy 1.21 @ `2e74584` (PHASE-18 close; byte-verified at phase open: sha256
  `f872da5018b18937f324478988ccf3a9d68436ea73f5f355daefc893fbccede9`, size 457,011,129 B,
  tar -tzf exit 0 / 5,447 entries, dirty=0, 63 commits)
- Code commit: `02d632e` · Close commit: recorded in the version chain below
- Preamble (binding): PHASE-13 (AI-RUNTIME-PROOF / DEP-001) remains OPEN — LAST after PHASE-26 (2026-09-19 ruling).

## What was built (additive-only; ADR-040 — ZERO new dependencies, no scheduler/queue DEV-019)
1. Migration `0014_phase19_cross_stage_escalation_engine.sql`: `stage_escalations`
   (§3.6 record; UNIQUE(tenant,student,from,to) = the atomic lock; severity HIGH/CRITICAL;
   debt snapshot + trigger_summary). RLS enabled+forced (0007 mechanism, fail-closed).
2. Canonical capability `packages/database/src/escalation/capability.ts` — ALL SQL inside
   withTenant; the §3.6 trigger derives ONLY from the real §3.4 stage_progressions stream:
   OPEN debt (PROVISIONAL_PENDING) on stage X + persistent failure (≥2 failed attempts,
   not ADVANCED/CLOSED) on another stage Y → exactly ONE escalation per (X,Y)
   (HIGH; CRITICAL at ≥3). Idempotent re-evaluation (UNIQUE + onConflictDoNothing).
3. Acknowledgement: single conditional UPDATE (OPEN → ACKNOWLEDGED, acknowledged_by/at)
   — the P15-4 pattern; Idempotency-Key replays converge (no second write).
4. Thin `/v1/escalations` adapter — NO SQL; staff surfaces role-gated (evaluate/list/get/
   acknowledge); fire-and-forget §3.3 events reusing the 0011 ERROR class (no new class).

## Gates (all exit 0 — full register in /home/user/phase19_logs/exit_codes.txt)
MIG-1 (migrate+RLS+policy checks), P19 gate 4/4 PASS, REG-0 full matrix
(typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file ×13
incl. p15 6/6 + p16 + p17 + p18 + p19, auth-security, secret-diff 0, secret-tree 0,
diff-check clean).
