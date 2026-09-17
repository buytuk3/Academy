# BuyTuk Academy — PHASE-13 DEPL-2 production container target (single container).
# Pinned base; multi-stage; non-root; canonical env contract (PHASE-12 DEPL-1).
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm run build \
 && pnpm deploy --filter=api --prod /out

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /app/apps/api/dist ./dist
RUN chown -R node:node /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Env contract (required at runtime): DATABASE_URL, JWT_SECRET, AUDIO_KEK,
# REDIS_URL, INFERENCE_GATEWAY_URL — see deploy/DEPLOYMENT-RUNBOOK.md
CMD ["node", "dist/index.mjs"]
