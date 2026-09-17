# PHASE-12 Closeout — PRODUCTION-PERFORMANCE-OBSERVABILITY — 2026-09-17

Status: **CLOSED / PASS — performance+observability gates; live-hosting sub-gate OPEN (disclosed)** · Base (verified 1.15 reference): `d4c2815` · Version adopted: **BuyTuk Academy 1.16** (per ADR-028: assigned at CLOSE + ARCHIVE)

## Scope executed (reuse-only observability exposure; zero new libraries, zero migrations)
- **Charter first** (`docs/reference/PHASE-12-CHARTER.md`, commit `bc59f8b`): measurable thresholds fixed in advance; OPEN gates never PASS.
- **OBS-1**: `/metrics` (root) + `/api/metrics` serve the CANONICAL `getMetrics()` prom-client registry. Two real defects found by the gate and fixed: (1) `registry.contentType` is a getter (calling it as a function 500'd the route); (2) the PHASE-4-spec `/api/metrics` path had been documented-but-served-by-nothing (my first mount landed AFTER the reading facade) → canonical router now mounted first. Zero new counters, zero new libraries.
- **OBS-1b/OBS-2**: real per-request traffic counted into `buytuk_http_requests_total{route,status}` (res.on finish) + real 403-class capability denials surface on `buytuk_security_events_total` (wired in `mapCapabilityError`). Proven live: 3× AUTHZ_NO_MEMBERSHIP 403s → `{type="authorization-failure"} 3`.
- **PERF**: assets 72,891 B ≤ 102,400 B; COLD boot of the BUILT artifact → first 200 /healthz ≈ 552 ms ≤ 5,000 ms; p95(n=30, live): /healthz 1.8 ms ≤ 50, /ui/app.js 3.2 ms ≤ 100.
- **DEPL-1**: the built artifact is now actually BOOTABLE (it was not, before this phase — undeclared runtime externals): declared aws-sdk (s3-client), @opentelemetry/api 1.9.1 (prom-client runtime), @grpc/grpc-js 1.14.4 + @grpc/proto-loader 0.7.15 (store-exact versions, pre-scanned from the dist import graph in ONE pass) in `apps/api/package.json`; `build.mjs` now packages the static UI into `dist/public`. Start command: `node apps/api/dist/index.mjs`; env contract: PORT, DATABASE_URL, JWT_SECRET, AUDIO_KEK, REDIS_URL, INFERENCE_GATEWAY_URL.
- **OPEN gates (disclosed, never claimed)**: DEPL-2 live external deployment (no host in sandbox); COV-1 coverage provider (none installed; new dev dep barred by reuse-first without functional necessity).

## Gate evidence (raw exit codes: /home/user/phase12_logs/exit_codes.txt — all produced this session)
| Gate | Result | Exit |
|---|---|---|
| typecheck + build (final code) | clean | 0 / 0 |
| Library suites | db 55/55, obs 6/6, worker 1/1, api 8/8, engine 24/24 | all 0 |
| core-32 official per-file | 44/44 (p1 5, p2 1, p3 8, p7 5, p8 5, p9 5, p10 5, p11 5, auth-sec 5) | 9×0 |
| Regression E1 / E4 | 11/11 · 7/7 | 0 / 0 |
| Secret scans (diff+tree) / diff-check | 0 hits / clean | 0·0 / 0 |
| OBS-1 · OBS-2 · PERF-1 · PERF-2 · PERF-3 · DEPL-1 | see the ledger (docs/reports/PHASE-12-GATES-LEDGER.md) | PASS |

## Commit-count discipline (per the management erratum — two metrics, always labeled)
- TOTAL history (`git rev-list --count HEAD`) at this closeout: **32**
- ABOVE the 1.12 base `01d3ce6` (`git rev-list --count 01d3ce6..HEAD`): **10**
- Linear chain, no side branches; tag `BuyTuk.V0.1.3` → `41b0bba…` untouched.

## Delivery (D-3/D-12)
`buytuk-academy-COMPLETE-PROJECT-REFERENCE-POST-PHASE-12-2026-09-17.tar.gz` — single file via the external host (gofile.io): sha256 + exact byte size + `tar -tzf` exit 0 in `MANIFEST-PHASE12-COMPLETE-REFERENCE.md` BEFORE the link; server-reported size+MD5 and a FULL browser round-trip re-download verified to match. Payload: `repo/` @ the close commit (full .git history) + `_history/` (2,760 entries) carried from the verified 1.15 reference.
