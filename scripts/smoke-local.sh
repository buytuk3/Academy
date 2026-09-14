#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PORT="${PORT:-4116}"
export JWT_SECRET="${JWT_SECRET:-dev-secret-change-me}"
export DATABASE_URL="${DATABASE_URL:-postgres://core27:c27_vZ8pQ2wR@127.0.0.1:5432/core32_verify}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
export INFERENCE_GATEWAY_URL="${INFERENCE_GATEWAY_URL:-http://127.0.0.1:8080}"
if [ ! -d node_modules ]; then
  pnpm install --frozen-lockfile
fi
pnpm --filter buytuk-api typecheck
pnpm exec tsx apps/api/src/index.ts > /tmp/buytuk_v016_api.log 2>&1 &
API_PID=$!
cleanup(){ kill "$API_PID" >/dev/null 2>&1 || true; wait "$API_PID" >/dev/null 2>&1 || true; }
trap cleanup EXIT
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/" >/tmp/buytuk_v016_root.html 2>/dev/null; then
    break
  fi
  sleep 1
done
curl -sS -D /tmp/buytuk_v016_root.headers -o /tmp/buytuk_v016_root.body "http://127.0.0.1:${PORT}/"
echo 'SMOKE_HTTP_HEADERS_BEGIN'
sed -n '1,8p' /tmp/buytuk_v016_root.headers
echo 'SMOKE_HTTP_HEADERS_END'
echo 'SMOKE_BODY_SNIPPET_BEGIN'
head -n 5 /tmp/buytuk_v016_root.body
echo 'SMOKE_BODY_SNIPPET_END'
echo 'SMOKE_API_LOG_BEGIN'
sed -n '1,20p' /tmp/buytuk_v016_api.log
echo 'SMOKE_API_LOG_END'
