# PHASE-22 CLOSEOUT — VIDEO-LESSON-CONTENT (governing doc v2.1 §3.8) — 2026-09-20

- Base: BuyTuk Academy 1.24 @ `28f98a5` (PHASE-21 close; byte-verified at phase open: sha256
  `418fc2c04e3a7d01fb5e3cf9a4dadc7be6604bd8408b0ec9bd15ec69566b3191`, size 457,327,608 B,
  tar -tzf exit 0 / 5,669 entries, dirty=0, 73 commits)
- Code commit: `441f7b8` · Close commit: recorded in the version chain below
- Preamble (binding): PHASE-13 (AI-RUNTIME-PROOF / DEP-001) remains OPEN — LAST after PHASE-26 (2026-09-19 ruling).

## What was built (additive-only; ADR-043 — the roadmap-mandated own ADR; ZERO new dependencies, DEV-022)
1. Migration `0017_phase22_video_lesson_content.sql`: `video_lessons` (title,
   storage_key loose pointer, duration_sec, lifecycle status PROCESSING/READY/BLOCKED,
   publish metadata + publish_operation_key for replay convergence;
   UNIQUE(tenant, operation_key) idempotency). RLS enabled+forced (0007 mechanism,
   fail-closed).
2. The video rides the EXISTING content registry: a loose lesson_content_id reference
   to a REAL content_definitions row (the proven create/publish recipe) — the tenant
   scoping, audit and library semantics are inherited, no new content vocabulary.
3. Canonical capability `video/capability.ts` — ALL SQL inside withTenant;
   registerVideoLesson (idempotent), publishVideoLesson (THE atomic CAS publish —
   single conditional UPDATE with the publish key persisted inside the same statement;
   parallel + replay publishes converge), getVideoLesson, listVideoLessons.
4. Thin `/v1/video-lessons` adapter — NO SQL; zod-validated; Idempotency-Key required
   at both surfaces (row keys AND §3.3 event keys derive from them); students read
   ONLY READY rows (existence-hiding 404); staff read any status + tenant list;
   fire-and-forget ATTEMPT_SUBMIT-class events (0011 vocabulary reuse).

## Deferred (documented, not hidden)
Presigned-upload byte transport + playback URLs = deployment hardening (DEPL-2/PHASE-26
territory); the registry, lifecycle and access semantics here are complete and
testable without them — the storage_key stays opaque.

## Gates (all exit 0 — full register in /home/user/phase22_logs/exit_codes.txt)
MIG-1 (migrate+RLS+policy checks), P22 gate 3/3 PASS, REG-0 full matrix
(typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file ×16
incl. p15 6/6 + p16 + p17 + p18 + p19 + p20 + p21 + p22, auth-security,
secret-diff 0, secret-tree 0, diff-check clean).
