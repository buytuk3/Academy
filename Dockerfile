FROM node:22-bookworm-slim

WORKDIR /app

RUN npm install -g pnpm@9

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm run build

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "apps/api/dist/index.mjs"]