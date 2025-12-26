# Lobby Container
# Contains: Express server serving static frontend + REST API
# Base: node:24-bookworm-slim (Debian-based)
#
# Build from repo root:
#   docker compose build lobby
# Or:
#   docker build -f docker/lobby/Dockerfile -t gestures-lobby .

FROM node:24-bookworm-slim AS base

# Build stage - compile TypeScript
FROM base AS builder

WORKDIR /build

# Copy package files for all workspace dependencies
COPY package.json package-lock.json ./
COPY packages/framework/protocol/package.json ./packages/framework/protocol/
COPY packages/applications/blocks-cannons/package.json ./packages/applications/blocks-cannons/
COPY packages/applications/hello-hands/package.json ./packages/applications/hello-hands/
COPY packages/lobby/package.json ./packages/lobby/

# Install all dependencies (including dev)
RUN npm ci

# Copy source code for all workspace dependencies
COPY packages/framework/protocol/ ./packages/framework/protocol/
COPY packages/applications/blocks-cannons/ ./packages/applications/blocks-cannons/
COPY packages/applications/hello-hands/ ./packages/applications/hello-hands/
COPY packages/lobby/ ./packages/lobby/

# Build framework packages first (lobby depends on these via app packages)
RUN npm run build -w @gesture-app/framework-protocol

# Build app packages (lobby imports these for registration)
RUN npm run build -w @gesture-app/blocks-cannons
RUN npm run build -w @gesture-app/hello-hands

# Build lobby (server + frontend)
RUN npm run build -w @gesture-app/lobby

# Production stage
FROM base AS production

WORKDIR /app

# Install Docker CLI to communicate with host Docker daemon
# We'll mount /var/run/docker.sock from the host
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker.io \
    && rm -rf /var/lib/apt/lists/*

# Copy package files for production install
COPY package.json package-lock.json ./
COPY packages/framework/protocol/package.json ./packages/framework/protocol/
COPY packages/applications/blocks-cannons/package.json ./packages/applications/blocks-cannons/
COPY packages/applications/hello-hands/package.json ./packages/applications/hello-hands/
COPY packages/lobby/package.json ./packages/lobby/

# Install production dependencies only
RUN npm ci --omit=dev \
    --workspace=@gesture-app/framework-protocol \
    --workspace=@gesture-app/blocks-cannons \
    --workspace=@gesture-app/hello-hands \
    --workspace=@gesture-app/lobby

# Copy built artifacts
COPY --from=builder /build/packages/framework/protocol/dist ./packages/framework/protocol/dist
COPY --from=builder /build/packages/applications/blocks-cannons/dist ./packages/applications/blocks-cannons/dist
COPY --from=builder /build/packages/applications/hello-hands/dist ./packages/applications/hello-hands/dist
COPY --from=builder /build/packages/lobby/dist ./packages/lobby/dist
COPY --from=builder /build/packages/lobby/public ./packages/lobby/public

# Environment variables
ENV PORT=80
ENV NODE_ENV=production
ENV DOCKER_WRAPPER_PATH=/app/bin/docker-cli-wrapper.sh

# Expose port 80
EXPOSE 80

# Start server from the lobby package directory
WORKDIR /app/packages/lobby
CMD ["node", "dist/index.js"]
