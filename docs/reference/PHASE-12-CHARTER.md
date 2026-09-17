# PHASE-12 Charter — PRODUCTION-PERFORMANCE-OBSERVABILITY

Status: **OPEN** (opened 2026-09-17 on the frozen 1.15 reference `d4c2815fff78233843284ece8c5cfa84cf9416f6`) · Class C per MASTER_ROADMAP · Acceptance: «perf/security/deploy gates pass»

## Immutable entry point (verified live this session, 2026-09-17)
- HEAD `d4c2815fff78233843284ece8c5cfa84cf9416f6` — total history **27** commits / **5** above the 1.12 base `01d3ce6` (two metrics labeled per the management erratum discipline)
- Tag `BuyTuk.V0.1.3` → `41b0bba…` untouched; working tree clean (dirty=0)
- Real services: PostgreSQL accepting connections; Redis PONG
- Baseline pin: db suite 55/55 PASS

## Scope
Performance and observability production-readiness proofs, runnable in THIS sandbox against the REAL stack (built API + PG + Redis + real browser). Live deployment to an external host is out of sandbox reach and is disclosed as an OPEN gate — never claimed.

## Measurable gates (thresholds fixed in advance; values recorded only from real tool output)
| Gate | Definition | Threshold | Method |
|---|---|---|---|
| OBS-1 | `GET /metrics` exposes the canonical Prometheus registry (reuse `createMetrics` — the existing prom-client owner; zero new libraries) | HTTP 200 + Prometheus text format + `buytuk_http_requests_total` reflecting REAL traffic | real requests → parse exposition |
| OBS-2 | Security/error events surface: real denial flows increment the canonical `buytuk_security_events_total` via `recordSecurityEvent` | ≥1 sample after a real capability denial | real 404/403 flow → parse exposition |
| PERF-1 | Static UI asset budget (zero-build thin client) | total ≤ 102,400 bytes (100 KiB) | `wc -c` on public assets |
| PERF-2 | Cold boot of the BUILT api (`node dist/index.mjs`) → first 200 on `/healthz` | ≤ 5,000 ms | process start → poll healthz, ms clock |
| PERF-3 | Route latency under sequential load | p95(30) `/healthz` ≤ 50 ms; p95(30) `/ui/app.js` ≤ 100 ms | curl `time_total` × 30, sorted |
| DEPL-1 | Deployable artifact: built dist + start command + env contract + boot/health proof | artifact exists + PERF-2 PASS | build outputs + boot log |
| DEPL-2 | Live deployment to an external production host | — | **OPEN — not runnable in this sandbox (no external host/target)**; disclosed, never claimed |
| REG-0 | Zero regressions PHASE-0→11 | full matrix exit 0: typecheck, build, db/obs/worker/api/engine, core-32 official files per-file (with the matrix test-scoped conditions), E1, E4, secret scans, diff-check | same commands as PHASE-8..11 |
| COV-1 | Test coverage provider | — | **OPEN — coverage provider is not installed; installing a new dev dependency is barred by reuse-first unless documented** (deferred with reason) |

## Discipline
- Small linear commits on the same branch; every claim in the ledger traces to a command output produced in the phase session.
- Unmeasured gates stay **OPEN** — never marked PASS.
- Version 1.16 is assigned ONLY at CLOSE + ARCHIVE (ADR-028 D-3), with the D-12 single-file protocol (external host + server-reported hashes + full browser round-trip re-hash) before any link is sent.
