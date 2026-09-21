# ADR-047 — CI/CD-AND-LOAD-TESTING (the last pre-GPU phase)

- Status: ACCEPTED — 2026-09-21 (PHASE-26)
- Base: BuyTuk Academy 1.28 @ `333ea73` (PHASE-25 close)

## Context
The roadmap's final pre-GPU phase requires a CI/CD pipeline and load testing.
The reference stack suggests k6/Artillery (load) and third-party CI SaaS —
external dependencies and services.

## Decision (REUSE-FIRST — zero new dependencies, DEV-026)
1. **The pipeline is a FILE-BASED GitHub Actions workflow**
   (`.github/workflows/ci.yml`) — no third-party SaaS, no runners to rent.
   It structurally covers ALL the required gates: typecheck, build, the
   core-32 E2E suite on REAL service containers (PostgreSQL 16 + Redis 7 —
   the §3.3 infra triple), the migration chain, E1 + E4 + auth-security
   regressions, the pure-python secrets scanner, and the load smoke.
2. **The load engine is the repo's OWN zero-dependency Node script**
   (`scripts/load-test.mjs`) — no k6, no Artillery, no autocannon. It drives
   real HTTP against a real app instance with bounded concurrency, measures
   p50/p95/p99 latency and error counts, and writes a JSON report artifact.
3. **The secrets scanner is promoted into the repo** (`scripts/secret-scan.py`
   — the same pure-python regex set the phase finalizers use), so CI blocks
   merges on the SAME rule the gates enforce.
4. **NO schema change** — CI/CD and load testing are infrastructure and
   verification, not a data model concern. Zero DDL this phase (MIG: none by
   design); the additive migration chain stays 0000→0020.
5. **Load thresholds are generous CI budgets** (p95 < 1500 ms, zero errors,
   zero non-200s) asserted by the P26 gate against the REAL app + PG + Redis
   in this environment.

## Consequences
- The project has a complete, self-contained CI definition aligned with the
  exact gates used to close every phase (no drift between local gates and CI).
- Load evidence is reproducible in any environment with Node 20+ — the
  report artifacts are the audit trail.
- PHASE-13 (AI-RUNTIME-PROOF / DEP-001) remains the ONLY open phase — per
  the binding 2026-09-19 ruling it executes AFTER this phase with the
  management-approved GPU budget ($3–5, RunPod); it cannot start in this
  environment (no GPU) and stays open pending that provisioning.
