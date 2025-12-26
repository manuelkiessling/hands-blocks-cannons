# Deployment Guide

This guide explains how to deploy the Gesture Apps framework on an Ubuntu 24.04 server with Docker and Traefik.

## Prerequisites

### Server Requirements

- Ubuntu 24.04 LTS server with root access
- Docker Engine installed
- Traefik reverse proxy running with:
  - External network named `outermost_router`
  - HTTPS entrypoint named `websecure`
  - TLS certificates configured (ACME/Let's Encrypt recommended)

### DNS Configuration

All hostnames are at the same subdomain level under `dx-tooling.org` (single-level, hyphen-separated namespacing):
- Lobby: `gestures-apps.dx-tooling.org`
- Game sessions: `{sessionId}-{appId}-gestures.dx-tooling.org` (e.g., `xf46zra-blocks-cannons-gestures.dx-tooling.org`)

If you already have a wildcard A record for `*.dx-tooling.org` pointing to your server, no additional DNS configuration is needed.

Otherwise, you'll need to configure DNS records pointing to your server's IP address. A wildcard record is recommended:

| Record Type | Name | Value |
|-------------|------|-------|
| A | `*.dx-tooling.org` | `<server-ip>` |

> **Note:** DNS propagation can take up to 48 hours. Verify with `dig +short gestures-apps.dx-tooling.org`

## Deployment Steps

### 1. Clone the Repository

```bash
# As root or with sudo
mkdir -p /var/www
cd /var/www
git clone https://github.com/your-org/cam-gesture-experiment.git gestures-apps
cd gestures-apps
```

### 2. Make Wrapper Script Executable

The lobby container uses a restricted wrapper script to spawn Docker containers. The script is mounted into the container and executed directly (no sudo needed, as the container has access to the Docker socket).

```bash
chmod +x bin/docker-cli-wrapper.sh
```

> **Note:** The code explicitly calls the script with `bash`, so it will work even if permissions aren't set correctly, but it's still good practice to make it executable.

### 3. Verify Traefik Network

Ensure the `outermost_router` network exists:

```bash
docker network ls | grep outermost_router

# If it doesn't exist, create it:
docker network create outermost_router
```

### 4. Build the Game Session Images

These images are used by the lobby to spawn game containers:

```bash
# Build from repo root:
docker build -t blocks-cannons-game-session -f packages/applications/blocks-cannons/docker/Dockerfile .
docker build -t hello-hands-game-session    -f packages/applications/hello-hands/docker/Dockerfile .
```

> **Note:** The lobby container also includes these app packages (for app registry/manifest data), but the game session images are separate containers spawned at runtime.

### 5. Start the Lobby

```bash
docker compose up --build -d
```

### 6. Verify Deployment

Check that the lobby container is running:

```bash
docker compose ps
docker compose logs -f lobby
```

Visit `https://gestures-apps.dx-tooling.org` in your browser.

## Manual Testing: Launching Game Session Containers

For testing purposes, you can manually launch a game session container. This is useful for debugging or testing without going through the lobby UI.

### Example: Launch a test session at `test-blocks-cannons-gestures.dx-tooling.org`

**From the Docker host (using `docker run` directly):**

```bash
docker run -d \
  --name session-blocks-cannons-test \
  --network outermost_router \
  -e SESSION_ID=test \
  -e APP_ID=blocks-cannons \
  -e WITH_BOT=true \
  -e BOT_DIFFICULTY=0.5 \
  -l traefik.enable=true \
  -l outermost_router.enable=true \
  -l traefik.docker.network=outermost_router \
  -l 'traefik.http.routers.session-blocks-cannons-test.rule=Host(`test-blocks-cannons-gestures.dx-tooling.org`)' \
  -l traefik.http.routers.session-blocks-cannons-test.entrypoints=websecure \
  -l traefik.http.routers.session-blocks-cannons-test.tls=true \
  -l traefik.http.services.session-blocks-cannons-test.loadbalancer.server.port=80 \
  blocks-cannons-game-session
```

**From inside the lobby container (using the wrapper script):**

```bash
# First, exec into the lobby container
docker exec -it gestures-lobby bash

# Then run the wrapper script
bash /app/bin/docker-cli-wrapper.sh run \
  -d \
  --name session-blocks-cannons-test \
  --network outermost_router \
  -e SESSION_ID=test \
  -e APP_ID=blocks-cannons \
  -e WITH_BOT=true \
  -e BOT_DIFFICULTY=0.5 \
  -l traefik.enable=true \
  -l outermost_router.enable=true \
  -l traefik.docker.network=outermost_router \
  -l 'traefik.http.routers.session-blocks-cannons-test.rule=Host(`test-blocks-cannons-gestures.dx-tooling.org`)' \
  -l traefik.http.routers.session-blocks-cannons-test.entrypoints=websecure \
  -l traefik.http.routers.session-blocks-cannons-test.tls=true \
  -l traefik.http.services.session-blocks-cannons-test.loadbalancer.server.port=80 \
  blocks-cannons-game-session
```

**Cleanup:**

To stop and remove the test container:

```bash
# From host
docker stop session-blocks-cannons-test
docker rm session-blocks-cannons-test

# Or from inside lobby container using wrapper
docker exec gestures-lobby bash /app/bin/docker-cli-wrapper.sh stop session-blocks-cannons-test
docker exec gestures-lobby bash /app/bin/docker-cli-wrapper.sh rm session-blocks-cannons-test
```

> **Note:** Replace `test` with your desired session ID. The hostname pattern is `{sessionId}-{appId}-gestures.dx-tooling.org`, and the container name is `session-{appId}-{sessionId}`.

## Updating

To update to a new version:

```bash
cd /var/www/gestures-apps

# Pull latest code
git pull

# Rebuild game session images
docker build -t blocks-cannons-game-session -f packages/applications/blocks-cannons/docker/Dockerfile .
docker build -t hello-hands-game-session   -f packages/applications/hello-hands/docker/Dockerfile .

# Rebuild and restart lobby (this also rebuilds all workspace dependencies)
docker compose up --build -d
```

> **Note:** The lobby container build includes `@gesture-app/framework-protocol` and all app packages (`@gesture-app/blocks-cannons`, `@gesture-app/hello-hands`) as workspace dependencies. The Dockerfile builds these from source during the Docker build process.

## Verification Checklist

After deployment, verify everything works:

- [ ] Lobby accessible at `https://gestures-apps.dx-tooling.org`
- [ ] Can create a game session (Play vs Bot)
- [ ] Game session container starts (`docker ps | grep session-blocks-cannons`)
- [ ] Game URL is accessible (`https://xf46zra-blocks-cannons-gestures.dx-tooling.org`)
- [ ] WebSocket connection works (game loads without errors)
- [ ] Bot opponent moves and fires

## Troubleshooting

### Lobby Not Accessible

1. Check Traefik is routing correctly:
   ```bash
   docker compose logs lobby
   curl -I https://gestures-apps.dx-tooling.org
   ```

2. Verify container is on the right network:
   ```bash
   docker network inspect outermost_router
   ```

3. Check Traefik logs for routing issues.

### Game Session Container Fails to Start

1. Check the Docker socket is accessible from the lobby container:
   ```bash
   # From inside the lobby container
   docker exec gestures-lobby ls -la /var/run/docker.sock
   # Should show the socket file is readable
   ```

2. Test Docker access from inside the container:
   ```bash
   docker exec gestures-lobby bash /app/bin/docker-cli-wrapper.sh ps
   # Should list running game session containers
   ```

3. Check the game session image exists:
   ```bash
   docker images | grep blocks-cannons-game-session
   ```

4. Verify the config file is in the correct location (if game server fails to start):
   ```bash
   docker exec session-blocks-cannons-<sessionid> ls -la /app/config/game.yaml
   # Should show the config file exists
   ```

### Game Session Not Accessible

1. Check the container is running:
   ```bash
   docker ps | grep session-blocks-cannons
   ```

2. Check container logs:
   ```bash
   docker logs session-blocks-cannons-<sessionid>
   ```

3. Verify Traefik picked up the container (check Traefik dashboard or logs).

4. DNS propagation: The wildcard DNS record must be configured and propagated.

### WebSocket Connection Failed

1. Check nginx is running inside the game container:
   ```bash
   docker exec session-blocks-cannons-<sessionid> ps aux | grep nginx
   ```

2. Check the game server is running:
   ```bash
   docker exec session-blocks-cannons-<sessionid> ps aux | grep node
   ```

3. Check nginx logs:
   ```bash
   docker exec session-blocks-cannons-<sessionid> cat /var/log/nginx/error.log
   ```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Ubuntu Server                            │
│                                                                 │
│  ┌─────────────┐                                                │
│  │   Traefik   │ ◄── HTTPS/WSS from Internet                    │
│  └──────┬──────┘                                                │
│         │                                                       │
│         ├─────────────────┐                                     │
│         │                 │                                     │
│         ▼                 ▼                                     │
│  ┌─────────────┐   ┌─────────────┐                              │
│  │   Lobby     │   │Game Session │ (dynamically spawned)        │
│  │  Container  │   │  Container  │                              │
│  │             │   │             │                              │
│  │  Express +  │   │  nginx +    │                              │
│  │  Static UI  │   │  WS Server  │                              │
│  └──────┬──────┘   │  + Bot      │                              │
│         │          └─────────────┘                              │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐                                                │
│  │ docker-cli- │                                                │
│  │ wrapper.sh  │ ◄── via Docker socket (restricted commands)    │
│  └─────────────┘                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Security Notes

- The `docker-cli-wrapper.sh` script restricts Docker access to only the commands needed
- Container names must match `session-*` pattern
- Only app-specific game session images can be run (e.g., `blocks-cannons-game-session`)
- The wrapper script validates all commands before execution (this is the primary security mechanism)
- Game sessions are isolated in their own containers
- The lobby container runs as root to access the Docker socket, but the wrapper script provides command restrictions
- The Docker socket requires write access to create/stop/remove containers, so it's mounted without `:ro` flag
