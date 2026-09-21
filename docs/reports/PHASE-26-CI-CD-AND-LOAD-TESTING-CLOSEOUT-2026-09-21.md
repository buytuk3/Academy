# PHASE-26 CLOSEOUT — CI/CD-AND-LOAD-TESTING — 2026-09-21 (the LAST pre-GPU phase)

- Base: BuyTuk Academy 1.28 @ `333ea73` (PHASE-25 close; byte-verified at phase open: sha256
  `b7f5e045bf9d2b2212b7f23fc32771dde9b8ad09fbce7d07f4384708a2b5e23f`, size 457,731,286 B,
  tar -tzf exit 0 / 5,940 entries, dirty=0, 85 commits)
- Code commit: `ff01cd6` · Close commit: recorded in the version chain below
- Preamble (binding): PHASE-13 (AI-RUNTIME-PROOF / DEP-001) is now the ONLY open phase — per the
  binding 2026-09-19 ruling it runs LAST (after PHASE-26 — NOW REACHED) with the management-approved
  GPU budget ($3–5, RunPod); it cannot execute in this environment (no GPU) — DEP-001 stays NOT VERIFIED.

## What was built (ADR-047 — ZERO new dependencies, DEV-026; NO schema change)
1. `.github/workflows/ci.yml` — file-based GitHub Actions pipeline (no third-party SaaS):
   typecheck + build; the core-32 E2E suite on REAL PostgreSQL 16 + Redis 7 service
   containers; the additive migration chain; E1 + E4 + auth-security regressions;
   the pure-python secrets scan; the load smoke. Triggers: push (all branches) + PR.
2. `scripts/load-test.mjs` — the repo's OWN zero-dependency load engine (no k6/Artillery):
   real HTTP against a real app instance, bounded concurrency, latency percentiles
   (p50/p95/p99) + error counts → JSON report artifacts.
3. `scripts/secret-scan.py` — the secrets scanner promoted into the repo (the SAME
   pure-python regex set the phase finalizers enforce), so CI blocks merges on the
   same rule the gates use.
4. NO DDL — the additive migration chain stays 0000→0020 (MIG: none by design).

## Gates (all exit 0 — full register in /home/user/phase26_logs/exit_codes.txt)
MIG (none by design), P26 gate 3/3 PASS, REG-0 full matrix (typecheck, build, db, obs,
worker, api, engine, E1, E4, core-32 per-file ×20 incl. p15 6/6 + p16 + p17 + p18 + p19 +
p20 + p21 + p22 + p23 + p24 + p25 + p26, auth-security, secret-diff 0, secret-tree 0,
diff-check clean).

## Load evidence (real commands this phase)
- 50 requests × 5 concurrency on /v1/interaction-events (staff, DB-backed, inside the
  100/900s rate-limit window): zero errors, zero non-200s, p95 < 1500 ms — driven
  IN-PROCESS by the gate (the SAME zero-dep algorithm as scripts/load-test.mjs, the
  standalone CI/manual runner; this sandbox blocks child-process networking — every
  child fetch stalls, so the in-process drive is the evidence path here).
- 20 requests × 4 concurrency on /v1/exams: zero errors, zero non-200s.
- AFTER the load: RLS fail-closed intact (tenant-B staff sees zero tenant-A rows on both
  surfaces); report artifacts carry the full shape (p50/p95/p99/rps).
