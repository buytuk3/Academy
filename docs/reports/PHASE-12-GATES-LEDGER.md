# PHASE-12 Gates Ledger — (gate → measured → verdict → commit)

Every value below was produced by a real command in the PHASE-12 session (raw logs: /home/user/phase12_logs/). Unmeasurable-in-sandbox gates stay OPEN — never PASS.

| Gate | Measured (this session) | Verdict | Commit |
|---|---|---|---|
| OBS-1 /metrics exposition | root + /api/metrics → 200 text/plain; canonical registry samples present: 4 http_requests series (real traffic: /healthz, /ui/app.js, /v1/attendance, /metrics) | PASS | (fix commit — see closeout) |
| OBS-2 security events surfaced | 3× real 403 AUTHZ_NO_MEMBERSHIP denials → `buytuk_security_events_total{type="authorization-failure"}` exposed (1 series) | PASS | (fix commit) |
| PERF-1 asset budget | 72891 B ≤ 102,400 B (index.html+app.js+styles.css) | PASS | 06fb77d-era (no asset change) |
| PERF-2 cold boot of built artifact | 471 ms ≤ 5,000 ms (`node apps/api/dist/index.mjs` → first 200 /healthz) | PASS | c3c1372+fix |
| PERF-3 latency p95 (n=30 each, live server) | /healthz 1.8 ms ≤ 50 · /ui/app.js 3.4 ms ≤ 100 | PASS+PASS | c3c1372+fix |
| DEPL-1 deployable artifact | apps/api/dist bootable (4.3MB bundle + dist/public) + start cmd `node apps/api/dist/index.mjs` + env contract (PORT, DATABASE_URL, JWT_SECRET, AUDIO_KEK, REDIS_URL, INFERENCE_GATEWAY_URL) + boot/health proof above | PASS | bfe1224/006b5f2/c3c1372/fix |
| DEPL-2 live external deployment | NOT RUNNABLE in this sandbox (no external host/target) | OPEN (disclosed) | — |
| COV-1 coverage provider | provider not installed; adding a new dev dependency barred by reuse-first without functional necessity | OPEN (deferred with reason) | — |
| REG-0 zero regressions | full matrix exit 0 (typecheck, build, db/obs/worker/api/engine, core-32 official per-file ×9, E1, E4, secret ×2, diff-check) | PASS | final matrix logs |
