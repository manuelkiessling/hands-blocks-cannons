# Deployment Guide

This guide explains how to deploy Hands, Blocks & Cannons on an Ubuntu 24.04 server with Docker and Traefik.

## Prerequisites

### Server Requirements

- Ubuntu 24.04 LTS server with root access
- Docker Engine installed
- Traefik reverse proxy running with:
  - External network named `outermost_router`
  - HTTPS entrypoint named `websecure`
  - TLS certificates configured (ACME/Let's Encrypt recommended)

### DNS Configuration

All hostnames are at the same subdomain level under `dx-tooling.org`:
- Lobby: `hands-blocks-cannons.dx-tooling.org`
- Game sessions: `{sessionId}-hands-blocks-cannons.dx-tooling.org` (e.g., `abc123-hands-blocks-cannons.dx-tooling.org`)

If you already have a wildcard A record for `*.dx-tooling.org` pointing to your server, no additional DNS configuration is needed.

Otherwise, you'll need to configure DNS records pointing to your server's IP address. A wildcard record is recommended:

| Record Type | Name | Value |
|-------------|------|-------|
| A | `*.dx-tooling.org` | `<server-ip>` |

> **Note:** DNS propagation can take up to 48 hours. Verify with `dig +short hands-blocks-cannons.dx-tooling.org`

## Deployment Steps

### 1. Clone the Repository

```bash
# As root or with sudo
mkdir -p /var/www
cd /var/www
git clone https://github.com/your-org/cam-gesture-experiment.git hands-blocks-cannons
cd hands-blocks-cannons
```

### 2. Configure Sudoers

The lobby application needs to spawn Docker containers. This is done through a restricted wrapper script that requires sudo privileges.

```bash
# Install the sudoers entry
sudo install -o root -g root -m 0440 \
  docs/infrastructure/etc/sudoers.d/hbc-docker-wrapper \
  /etc/sudoers.d/hbc-docker-wrapper

# Verify the sudoers syntax
sudo visudo -c
```

The default sudoers entry assumes the project is at `/var/www/hands-blocks-cannons`. If you installed elsewhere, edit the file:

```bash
sudo visudo -f /etc/sudoers.d/hbc-docker-wrapper
# Change the path to match your installation
```

### 3. Make Wrapper Script Executable

```bash
chmod +x bin/docker-cli-wrapper.sh
```

### 4. Verify Traefik Network

Ensure the `outermost_router` network exists:

```bash
docker network ls | grep outermost_router

# If it doesn't exist, create it:
docker network create outermost_router
```

### 5. Build the Game Session Image

This image is used by the lobby to spawn game containers:

```bash
docker build -t hbc-game-session ./docker/game-session
```

### 6. Start the Lobby

```bash
docker compose up --build -d
```

### 7. Verify Deployment

Check that the lobby container is running:

```bash
docker compose ps
docker compose logs -f lobby
```

Visit `https://hands-blocks-cannons.dx-tooling.org` in your browser.

## Updating

To update to a new version:

```bash
cd /var/www/hands-blocks-cannons

# Pull latest code
git pull

# Rebuild game session image
docker build -t hbc-game-session ./docker/game-session

# Rebuild and restart lobby
docker compose up --build -d
```

## Verification Checklist

After deployment, verify everything works:

- [ ] Lobby accessible at `https://hands-blocks-cannons.dx-tooling.org`
- [ ] Can create a game session (Play vs Bot)
- [ ] Game session container starts (`docker ps | grep hbc-session`)
- [ ] Game URL is accessible (`https://abc123-hands-blocks-cannons.dx-tooling.org`)
- [ ] WebSocket connection works (game loads without errors)
- [ ] Bot opponent moves and fires

## Troubleshooting

### Lobby Not Accessible

1. Check Traefik is routing correctly:
   ```bash
   docker compose logs lobby
   curl -I https://hands-blocks-cannons.dx-tooling.org
   ```

2. Verify container is on the right network:
   ```bash
   docker network inspect outermost_router
   ```

3. Check Traefik logs for routing issues.

### Game Session Container Fails to Start

1. Check the Docker wrapper permissions:
   ```bash
   # From inside the lobby container or as root
   sudo -n /var/www/hands-blocks-cannons/bin/docker-cli-wrapper.sh ps
   ```

2. If "sudo: a password is required", the sudoers entry is not configured correctly.

3. Check the game session image exists:
   ```bash
   docker images | grep hbc-game-session
   ```

### Game Session Not Accessible

1. Check the container is running:
   ```bash
   docker ps | grep hbc-session
   ```

2. Check container logs:
   ```bash
   docker logs hbc-session-<sessionid>
   ```

3. Verify Traefik picked up the container (check Traefik dashboard or logs).

4. DNS propagation: The wildcard DNS record must be configured and propagated.

### WebSocket Connection Failed

1. Check nginx is running inside the game container:
   ```bash
   docker exec hbc-session-<sessionid> ps aux | grep nginx
   ```

2. Check the game server is running:
   ```bash
   docker exec hbc-session-<sessionid> ps aux | grep node
   ```

3. Check nginx logs:
   ```bash
   docker exec hbc-session-<sessionid> cat /var/log/nginx/error.log
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
│  │ wrapper.sh  │ ◄── sudo (restricted commands only)            │
│  └─────────────┘                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Security Notes

- The `docker-cli-wrapper.sh` script restricts Docker access to only the commands needed
- Container names must match `hbc-session-*` pattern
- Only the `hbc-game-session` image can be run
- The sudoers entry only allows the wrapper script, not direct Docker access
- Game sessions are isolated in their own containers
