#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ ! -d node_modules ]; then
  pnpm install --frozen-lockfile
fi
export PORT="${PORT:-4100}"
export JWT_SECRET="${JWT_SECRET:-dev-secret-change-me}"
export DATABASE_URL="${DATABASE_URL:-postgres://core27:c27_vZ8pQ2wR@127.0.0.1:5432/core32_verify}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
export INFERENCE_GATEWAY_URL="${INFERENCE_GATEWAY_URL:-http://127.0.0.1:8080}"
pnpm exec tsx apps/api/src/index.ts
