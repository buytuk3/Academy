# PHASE-26 CHARTER — CI/CD-AND-LOAD-TESTING (the last pre-GPU phase)

- Date: 2026-09-21 · Base: BuyTuk Academy 1.28 @ `333ea73` (byte-verified this phase: sha256 `b7f5e045…e23f`, 457,731,286 B, tar -tzf exit 0 / 5,940 entries, dirty=0, 85 commits)
- Constraints honored: NO schema change (MIG: none by design — the additive
  chain stays 0000→0020); ZERO new dependencies — a file-based GitHub Actions
  pipeline + the repo's own zero-dep load script (ADR-047, DEV-026); the
  secrets scanner promoted into the repo; real app + real PG + real Redis for
  the load gate.
- After this phase: ONLY PHASE-13 (AI-RUNTIME-PROOF / DEP-001) remains OPEN —
  per the binding 2026-09-19 ruling it runs LAST with the management-approved
  GPU budget ($3–5, RunPod); it cannot execute in this environment (no GPU).

## Gates (fixed in advance — OPEN gates never PASS)
| Gate | Definition of PASS |
|---|---|
| MIG | NONE BY DESIGN (ADR-047) — zero DDL; rls/policy checks not applicable this phase |
| P26-1 | `.github/workflows/ci.yml` structurally covers the required gates (typecheck, build, core-32 E2E on Postgres 16 + Redis 7 services, secret-scan.py, load smoke; push+PR triggers); the in-repo scanner exits 0 |
| P26-2 | load test against the REAL app (authed staff endpoint, DB-backed): 50 requests × 5 concurrent (inside the 100/900s rate-limit window) — zero errors, zero non-200s, p95 < 1500 ms |
| P26-3 | after load: second run (20 × 4) on the exams surface — zero errors; RLS fail-closed INTACT (tenant-B staff sees zero tenant-A rows); report artifacts carry the full shape (p50/p95/p99/rps) |
| REG-0 | typecheck, build, db, obs, worker, api, engine, E1, E4, core-32 per-file (20 files through p25 + p26), secret scans 0+0, diff-check clean — all exit 0 |
| CLOSURE | STAGE_STATUS/CDR/PROJECT_VERSION (1.29 adoption) + MASTER_ROADMAP updated + independent closeout report + single-file archive uploaded in-conversation (sha256/size/tar -tzf proof) + uploaded to the OWNER'S gofile account via the saved token with the RAW server-response md5 compared character-by-character |
