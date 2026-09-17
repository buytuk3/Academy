# Deployment runbook — single production container (DEPL-2 target)

1. `docker build -t buytuk-academy:1.17 -f deploy/Dockerfile .` (build host needs network + corepack).
2. Required runtime env: `PORT` (default 8080), `DATABASE_URL`, `JWT_SECRET`, `AUDIO_KEK`, `REDIS_URL`, `INFERENCE_GATEWAY_URL`.
3. `docker run -p 8080:8080 --env-file .env buytuk-academy:1.17`.
4. Health: `GET /healthz` (container HEALTHCHECK polls it every 15s). Metrics: `GET /metrics` and `GET /api/metrics` (canonical Prometheus registry, PHASE-12).
5. Database: apply migrations 0001..0009 before first boot (packages/database/migrations) against the target PostgreSQL.
6. Status note (2026-09-17): the container target above is delivered and its boot/health behavior is proven on the same artifact locally (PHASE-12 PERF-2, PHASE-13 P13-1). The LIVE deployment itself was NOT performed from this sandbox: no docker daemon and no external host exist here — run steps 1–3 on a real host to complete the live sub-gate.
