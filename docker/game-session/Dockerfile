# Game Session Container
# Contains: nginx (static client) + game server + optional bot
# Base: node:24-bookworm-slim (Debian-based)

FROM node:24-bookworm-slim AS base

# Install nginx
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    && rm -rf /var/lib/apt/lists/*

# Build stage - compile TypeScript
FROM base AS builder

WORKDIR /build

# Copy package files
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY packages/shared/ ./packages/shared/
COPY packages/server/ ./packages/server/
COPY packages/client/ ./packages/client/

# Build shared package first
RUN npm run build -w @block-game/shared

# Build server
RUN npm run build -w @block-game/server

# Build client
RUN npm run build -w @block-game/client

# Production stage
FROM base AS production

WORKDIR /app

# Copy package files for production install
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/

# Install production dependencies only
RUN npm ci --omit=dev --workspace=@block-game/shared --workspace=@block-game/server

# Copy built artifacts
COPY --from=builder /build/packages/shared/dist ./packages/shared/dist
COPY --from=builder /build/packages/server/dist ./packages/server/dist
COPY --from=builder /build/packages/server/config ./packages/server/config
COPY --from=builder /build/packages/client/dist ./client

# Copy nginx config
COPY docker/game-session/nginx.conf /etc/nginx/nginx.conf

# Copy entrypoint script
COPY docker/game-session/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Environment variables
ENV PORT=3001
ENV SESSION_ID=""
ENV WITH_BOT="false"
ENV BOT_DIFFICULTY="0.5"

# Expose port 80 (nginx)
EXPOSE 80

# Start services
CMD ["/entrypoint.sh"]

