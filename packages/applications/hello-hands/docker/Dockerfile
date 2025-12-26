# Hello Hands - Game Session Container
#
# This container runs:
# 1. The Hello Hands WebSocket server (Node.js)
# 2. An nginx server to serve the client and proxy WebSocket connections
#
# Build from repo root:
#   docker build -t hello-hands-game-session -f packages/applications/hello-hands/docker/Dockerfile .

FROM node:24-bookworm-slim AS builder

WORKDIR /build

# Install dependencies
COPY package*.json ./
COPY packages/framework/protocol/package.json packages/framework/protocol/
COPY packages/framework/server/package.json packages/framework/server/
COPY packages/applications/hello-hands/package.json packages/applications/hello-hands/

RUN npm install --workspace=@gesture-app/framework-protocol \
    --workspace=@gesture-app/framework-server \
    --workspace=@gesture-app/framework-client \
    --workspace=@gesture-app/hello-hands

# Copy source and build
COPY packages/framework/protocol packages/framework/protocol
COPY packages/framework/server packages/framework/server
COPY packages/applications/hello-hands packages/applications/hello-hands
COPY tsconfig.base.json ./

# Build packages in order
RUN npm run build --workspace=@gesture-app/framework-protocol
RUN npm run build --workspace=@gesture-app/framework-server
RUN npm run build --workspace=@gesture-app/framework-client
RUN npm run build --workspace=@gesture-app/hello-hands

# Build client
RUN npm run build:client --workspace=@gesture-app/hello-hands

# Production image
FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends nginx \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built packages
COPY --from=builder /build/packages/framework/protocol/dist ./packages/framework/protocol/dist
COPY --from=builder /build/packages/framework/protocol/package.json ./packages/framework/protocol/
COPY --from=builder /build/packages/framework/server/dist ./packages/framework/server/dist
COPY --from=builder /build/packages/framework/server/package.json ./packages/framework/server/
COPY --from=builder /build/packages/framework/client/dist ./packages/framework/client/dist
COPY --from=builder /build/packages/framework/client/package.json ./packages/framework/client/
COPY --from=builder /build/packages/applications/hello-hands/dist ./packages/applications/hello-hands/dist
COPY --from=builder /build/packages/applications/hello-hands/package.json ./packages/applications/hello-hands/

# Copy client build
COPY --from=builder /build/packages/applications/hello-hands/dist/client /usr/share/nginx/html

# Copy config files
COPY packages/applications/hello-hands/docker/nginx.conf /etc/nginx/nginx.conf
COPY packages/applications/hello-hands/docker/entrypoint.sh /app/entrypoint.sh

# Install production dependencies only
COPY package*.json ./
RUN npm install --workspace=@gesture-app/framework-protocol \
    --workspace=@gesture-app/framework-server \
    --workspace=@gesture-app/framework-client \
    --workspace=@gesture-app/hello-hands \
    --omit=dev

RUN chmod +x /app/entrypoint.sh

# Environment variables
ENV PORT=8080
ENV SESSION_ID=""
ENV APP_ID="hello-hands"
ENV LOBBY_URL="https://gestures-apps.dx-tooling.org"

EXPOSE 80

CMD ["/app/entrypoint.sh"]

