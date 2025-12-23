# Lobby Container
# Contains: Express server serving static frontend + REST API
# Base: node:24-bookworm-slim (Debian-based)

FROM node:24-bookworm-slim AS base

# Build stage - compile TypeScript
FROM base AS builder

WORKDIR /build

# Copy package files
COPY package.json package-lock.json ./
COPY packages/lobby/package.json ./packages/lobby/

# Install all dependencies (including dev)
RUN npm ci --workspace=@block-game/lobby

# Copy source code
COPY packages/lobby/ ./packages/lobby/

# Build lobby (server + frontend)
RUN npm run build -w @block-game/lobby

# Production stage
FROM base AS production

WORKDIR /app

# Copy package files for production install
COPY package.json package-lock.json ./
COPY packages/lobby/package.json ./packages/lobby/

# Install production dependencies only
RUN npm ci --omit=dev --workspace=@block-game/lobby

# Copy built artifacts
COPY --from=builder /build/packages/lobby/dist ./dist
COPY --from=builder /build/packages/lobby/public ./public

# Environment variables
ENV PORT=80
ENV NODE_ENV=production
ENV DOCKER_WRAPPER_PATH=/app/bin/docker-cli-wrapper.sh

# Expose port 80
EXPOSE 80

# Start server
CMD ["node", "dist/index.js"]

