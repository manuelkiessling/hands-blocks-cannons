#!/bin/bash
set -e

echo "Starting Blocks & Cannons game session container..."
echo "SESSION_ID: ${SESSION_ID:-unknown}"
echo "APP_ID: ${APP_ID:-blocks-cannons}"
echo "WITH_BOT: ${WITH_BOT:-false}"
echo "BOT_DIFFICULTY: ${BOT_DIFFICULTY:-0.5}"

# Default APP_ID to blocks-cannons for backwards compatibility
APP_ID="${APP_ID:-blocks-cannons}"

# Generate session config JSON for the client
# This will be served by nginx at /session.json
# Format: {sessionId}-{appId}-gestures.dx-tooling.org (single-level subdomain)
LOBBY_URL="${LOBBY_URL:-https://gestures-apps.dx-tooling.org}"
WS_URL="wss://${SESSION_ID}-${APP_ID}-gestures.dx-tooling.org/ws"

cat > /app/client/session.json <<EOF
{
  "appId": "${APP_ID}",
  "sessionId": "${SESSION_ID}",
  "wsUrl": "${WS_URL}",
  "lobbyUrl": "${LOBBY_URL}",
  "withBot": ${WITH_BOT:-false},
  "botDifficulty": ${BOT_DIFFICULTY:-0.5}
}
EOF

echo "Generated session.json:"
cat /app/client/session.json

# Start the game server in the background
echo "Starting game server for app: ${APP_ID}..."
cd /app && node packages/server/dist/index.js &
GAME_SERVER_PID=$!

# If WITH_BOT is true, start the bot after a short delay
if [ "${WITH_BOT}" = "true" ]; then
    echo "Starting bot player..."
    sleep 2
    cd /app && BOT_DIFFICULTY="${BOT_DIFFICULTY:-0.5}" node packages/server/dist/bot/index.js ws://localhost:3001 &
    BOT_PID=$!
fi

# Start nginx in foreground
echo "Starting nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Trap signals for graceful shutdown
trap 'echo "Shutting down..."; kill $NGINX_PID $GAME_SERVER_PID ${BOT_PID:-} 2>/dev/null; exit 0' SIGTERM SIGINT

# Wait for any process to exit
wait -n

# If any process exits, shut down all
echo "A process exited, shutting down..."
kill $NGINX_PID $GAME_SERVER_PID ${BOT_PID:-} 2>/dev/null || true
exit 1

