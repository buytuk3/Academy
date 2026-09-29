FROM node:22-bookworm-slim

WORKDIR /app

# Install bash
RUN apt-get update && apt-get install -y bash && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install pnpm
RUN npm install -g pnpm@9

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Expose the port
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Start the application
CMD ["node", "apps/api/dist/index.mjs"]