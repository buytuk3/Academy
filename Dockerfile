FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN npm install -g pnpm@9

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "apps/api/dist/index.mjs"]