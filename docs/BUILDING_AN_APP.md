# Building an App

This guide walks you through creating a new application for the Gesture Apps framework. We'll use **hello-hands** (a minimal two-participant hand tracking demo) as a reference.

## Architecture Overview

The framework handles all the common concerns of a two-participant, WebSocket-networked application:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Framework                                │
│                                                                 │
│  ┌─────────────────────┐         ┌─────────────────────┐        │
│  │   SessionRuntime    │         │    SessionClient    │        │
│  │   (Server)          │ ◄─────► │    (Client)         │        │
│  │                     │   WS    │                     │        │
│  │ • 2-participant     │         │ • Connection mgmt   │        │
│  │   admission         │         │ • Lifecycle events  │        │
│  │ • Lifecycle gating  │         │ • Ready signaling   │        │
│  │ • Ready state       │         │ • Play-again voting │        │
│  │ • Message routing   │         │ • Reconnection      │        │
│  │ • Play-again flow   │         │                     │        │
│  └─────────────────────┘         └─────────────────────┘        │
│            │                               │                     │
│            │ AppHooks                      │ Event Handlers      │
│            ▼                               ▼                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Your Application                      │    │
│  │                                                          │    │
│  │  • Shared types & protocol                               │    │
│  │  • Server app logic (via AppHooks)                       │    │
│  │  • Client UI & rendering                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Key Concepts:**

| Concept | Description |
|---------|-------------|
| **SessionRuntime** | Server-side framework handling connection lifecycle, ready-state gating, and message routing |
| **SessionClient** | Client-side framework handling WebSocket connection, lifecycle events, and reconnection |
| **AppHooks** | Interface your server implements to handle app-specific logic |
| **AppRegistry** | Registry where apps self-register so the lobby can discover them |
| **AppManifest** | Metadata about your app (id, name, version, description, tags) |

## Quick Start

### 1. Create the Package Structure

```bash
mkdir -p packages/applications/my-app/{src/{shared,server},client,tests,docker}
```

Your package structure will look like:

```
packages/applications/my-app/
├── package.json
├── tsconfig.json
├── biome.json
├── vitest.config.ts
├── src/
│   ├── index.ts          # App manifest + registration
│   ├── shared/
│   │   ├── index.ts      # Shared exports
│   │   ├── types.ts      # Shared types
│   │   └── protocol.ts   # Message types + schemas
│   └── server/
│       ├── index.ts      # Server exports
│       ├── MyAppSession.ts    # AppHooks implementation
│       └── server.ts     # Standalone server
├── client/
│   ├── index.html
│   ├── main.ts
│   ├── styles.css
│   └── vite.config.ts
├── tests/
│   ├── app.test.ts
│   └── shared.test.ts
└── docker/
    ├── Dockerfile
    ├── entrypoint.sh
    └── nginx.conf
```

### 2. Create package.json

```json
{
  "name": "@gesture-app/my-app",
  "version": "1.0.0",
  "type": "module",
  "description": "My awesome two-participant app",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./shared": {
      "import": "./dist/shared/index.js",
      "types": "./dist/shared/index.d.ts"
    },
    "./server": {
      "import": "./dist/server/index.js",
      "types": "./dist/server/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts src/shared/index.ts src/server/index.ts --format esm --dts --clean",
    "build:client": "vite build --config client/vite.config.ts",
    "start": "node dist/server/server.js",
    "dev": "tsx src/server/server.ts",
    "check": "biome check --write .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:client": "vitest run --config client/vitest.config.ts"
  },
  "dependencies": {
    "@gesture-app/framework-protocol": "^1.0.0",
    "@gesture-app/framework-server": "^1.0.0",
    "ws": "^8.18.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.0.0",
    "@types/node": "^24.0.0",
    "@types/ws": "^8.5.0",
    "tsup": "^8.5.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.3",
    "vite": "^6.0.0",
    "vitest": "^4.0.0"
  }
}
```

## Step-by-Step Implementation

### Step 1: Define Shared Types

Create `src/shared/types.ts` with your app's core types:

```typescript
/**
 * @fileoverview Shared types for My App.
 */

/** Unique identifier for a participant */
export type ParticipantId = string;

/** Participant number (always 1 or 2) */
export type ParticipantNumber = 1 | 2;

/** Example: Position in 2D space */
export interface Position2D {
  readonly x: number;
  readonly y: number;
}

/** Example: State tracked for each participant */
export interface ParticipantState {
  readonly position: Position2D;
  readonly score: number;
}

/** Colors for participants */
export const PARTICIPANT_COLORS: Record<ParticipantNumber, number> = {
  1: 0x4ecdc4, // Teal
  2: 0xff6b6b, // Coral
};
```

### Step 2: Define Protocol Messages (app-only)

Create `src/shared/protocol.ts` with message types and Zod schemas:

```typescript
/**
 * @fileoverview Protocol messages for My App.
 */

import { z } from 'zod';
import type { ParticipantId, Position2D } from './types.js';

// Re-export types that consumers need
export type { Position2D } from './types.js';

// ============ Schemas ============

export const Position2DSchema = z.object({
  x: z.number(),
  y: z.number(),
});

// ============ Client → Server (app) Messages ============

/** Client sends position update */
export interface PositionUpdateMessage {
  type: 'position_update';
  position: Position2D;
}

export const PositionUpdateMessageSchema = z.object({
  type: z.literal('position_update'),
  position: Position2DSchema,
});

/** Union of all client messages */
export type ClientMessage = PositionUpdateMessage;
export const ClientMessageSchema = z.discriminatedUnion('type', [PositionUpdateMessageSchema]);

/** Parse and validate a client message */
export function parseClientMessage(data: unknown): ClientMessage | null {
  const result = ClientMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}

// ============ Server → Client (app) Messages ============

/** Server broadcasts position update */
export interface PositionBroadcastMessage {
  type: 'position_broadcast';
  participantId: ParticipantId;
  position: Position2D;
}

/** Server sends score update */
export interface ScoreUpdateMessage {
  type: 'score_update';
  scores: Record<ParticipantId, number>;
}

/** Union of all server messages */
export type ServerMessage = PositionBroadcastMessage | ScoreUpdateMessage;

// ============ Welcome/Reset Data ============

/** App-specific data included in the welcome message */
export interface MyAppWelcomeData {
  color: number;
  opponentColor?: number;
}

/** App-specific data included in the reset message */
export interface MyAppResetData {
  message: string;
}
```

### Step 3: Create the App Manifest

Create `src/index.ts` to define and register your app:

```typescript
/**
 * @fileoverview My App - A two-participant demo.
 */

import {
  type AppManifest,
  globalRegistry,
  validateManifest,
} from '@gesture-app/framework-protocol';

/** Application identifier (used in URLs, API calls) */
export const APP_ID = 'my-app';

/** Human-readable name */
export const APP_NAME = 'My App';

/** Version */
export const APP_VERSION = '1.0.0';

/** App manifest for framework registration */
export const APP_MANIFEST: AppManifest = {
  id: APP_ID,
  name: APP_NAME,
  version: APP_VERSION,
  description: 'A two-participant demo app',
  tags: ['demo'],
  supportsBot: false, // Set to true if your app has bot/AI opponent support
};

/**
 * Register this app with the global registry.
 * Safe to call multiple times (idempotent).
 */
export function registerApp(): void {
  if (!globalRegistry.has(APP_ID)) {
    validateManifest(APP_MANIFEST);
    globalRegistry.register(APP_MANIFEST);
  }
}

// Auto-register when this module is imported
registerApp();

// Re-export shared types
export * from './shared/index.js';
```

### Step 4: Implement Server AppHooks (SessionRuntime)

Create `src/server/MyAppSession.ts` implementing the `AppHooks` interface:

```typescript
/**
 * @fileoverview Server-side session logic for My App.
 */

import type {
  ParticipantId,
  ParticipantNumber,
  SessionPhase,
} from '@gesture-app/framework-protocol';
import type { AppHooks, MessageResponse, Participant, SessionRuntimeConfig } from '@gesture-app/framework-server';
import type {
  ClientMessage,
  ServerMessage,
  MyAppWelcomeData,
  MyAppResetData,
} from '../shared/protocol.js';
import { PARTICIPANT_COLORS } from '../shared/types.js';

/**
 * AppHooks implementation for My App.
 */
export class MyAppHooks
  implements AppHooks<ClientMessage, ServerMessage, MyAppWelcomeData, MyAppResetData>
{
  private participantColors = new Map<ParticipantId, number>();

  generateParticipantId(participantNumber: ParticipantNumber): ParticipantId {
    return `player-${participantNumber}`;
  }

  onParticipantJoin(participant: Participant): MyAppWelcomeData {
    const color = PARTICIPANT_COLORS[participant.number];
    this.participantColors.set(participant.id, color);

    // Find opponent's color if they exist
    let opponentColor: number | undefined;
    for (const [id, c] of this.participantColors) {
      if (id !== participant.id) {
        opponentColor = c;
        break;
      }
    }

    return { color, opponentColor };
  }

  onParticipantLeave(participantId: ParticipantId): void {
    this.participantColors.delete(participantId);
  }

  onMessage(
    message: ClientMessage,
    senderId: ParticipantId,
    _phase: SessionPhase
  ): MessageResponse<ServerMessage>[] {
    switch (message.type) {
      case 'position_update':
        // Broadcast position to opponent
        return [
          {
            target: 'opponent',
            message: {
              type: 'position_broadcast',
              participantId: senderId,
              position: message.position,
            },
          },
        ];

      default:
        return [];
    }
  }

  onSessionStart(): void {
    console.log('[MyApp] Session started!');
  }

  onReset(): MyAppResetData {
    return { message: 'Ready for another round!' };
  }
}

/** Runtime configuration */
export function createMyAppConfig(): SessionRuntimeConfig {
  return {
    maxParticipants: 2,
    tickEnabled: false,  // Set to true if you need a real-time update loop
    tickIntervalMs: 16,
  };
}

/** Simple JSON helpers for app messages */
export const serializeAppMessage = (message: ServerMessage) => JSON.stringify(message);
export const parseAppMessage = (data: string): ClientMessage | null => {
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.type === 'string') {
      return parsed as ClientMessage;
    }
    return null;
  } catch {
    return null;
  }
};
```

### Step 5: Create the Standalone Server

Create `src/server/server.ts` (uses the framework SessionRuntime and treats your app protocol as app-only; framework lifecycle messages are handled for you):

```typescript
/**
 * @fileoverview Standalone WebSocket server for My App.
 */

import { SessionRuntime } from '@gesture-app/framework-server';
import { type WebSocket, WebSocketServer } from 'ws';
import type {
  ClientMessage,
  ServerMessage,
  MyAppWelcomeData,
  MyAppResetData,
} from '../shared/protocol.js';
import {
  MyAppHooks,
  createMyAppConfig,
  serializeAppMessage,
  parseAppMessage,
} from './MyAppSession.js';

// biome-ignore lint/complexity/useLiteralKeys: Required for noPropertyAccessFromIndexSignature
const PORT = Number(process.env['PORT']) || 8080;

console.log('[MyApp] Starting server...');

const hooks = new MyAppHooks();
const config = createMyAppConfig();

const runtime = new SessionRuntime<
  ClientMessage,
  ServerMessage,
  MyAppWelcomeData,
  MyAppResetData
>(config, hooks, (msg) => JSON.stringify(msg), parseAppMessage);

const wss = new WebSocketServer({ port: PORT });

console.log(`[MyApp] WebSocket server listening on port ${PORT}`);

wss.on('connection', (ws: WebSocket) => {
  console.log('[MyApp] New connection');

  const participant = runtime.handleConnection(ws);
  if (participant) {
    console.log(`[MyApp] Participant ${participant.id} joined`);
  }

  ws.on('message', (data: Buffer) => {
  runtime.handleMessage(ws, data.toString());
  });

  ws.on('close', () => {
    console.log('[MyApp] Connection closed');
    runtime.handleDisconnection(ws);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  runtime.stop();
  wss.close(() => process.exit(0));
});
```

### Step 6: Build the Client

Create `client/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My App</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <div id="connection-overlay" class="overlay">
      <h1>My App</h1>
      <div id="status">Connecting...</div>
      <div id="manual-connect" style="display: none;">
        <input type="text" id="ws-url" value="ws://localhost:8080">
        <button id="connect-btn">Connect</button>
      </div>
    </div>
    
    <div id="waiting-overlay" class="overlay" style="display: none;">
      <h2>Waiting for opponent...</h2>
    </div>
    
    <div id="ready-overlay" class="overlay" style="display: none;">
      <h2>Opponent joined!</h2>
      <button id="ready-btn">I'm Ready!</button>
    </div>
    
    <canvas id="canvas"></canvas>
  </div>
  
  <script type="module" src="main.ts"></script>
</body>
</html>
```

Create `client/main.ts`:

```typescript
/**
 * @fileoverview Client for My App.
 */

import type { ServerMessage, ClientMessage } from '../src/shared/protocol.js';

// DOM elements
const connectionOverlay = document.getElementById('connection-overlay')!;
const waitingOverlay = document.getElementById('waiting-overlay')!;
const readyOverlay = document.getElementById('ready-overlay')!;
const status = document.getElementById('status')!;
const manualConnect = document.getElementById('manual-connect')!;
const wsUrlInput = document.getElementById('ws-url') as HTMLInputElement;
const connectBtn = document.getElementById('connect-btn')!;
const readyBtn = document.getElementById('ready-btn')!;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('No 2D context');

// State
let ws: WebSocket | null = null;
let myColor = 0x4ecdc4;
let phase: 'connecting' | 'waiting' | 'ready' | 'playing' = 'connecting';

// Initialize
function init() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  connectBtn.addEventListener('click', () => connect(wsUrlInput.value));
  readyBtn.addEventListener('click', sendReady);
  canvas.addEventListener('mousemove', handleMouseMove);
  
  tryAutoConnect();
  requestAnimationFrame(render);
}

async function tryAutoConnect() {
  try {
    const res = await fetch('/session.json');
    if (res.ok) {
      const config = await res.json();
      if (config.wsUrl) {
        connect(config.wsUrl);
        return;
      }
    }
  } catch {}
  
  // Show manual connect for local dev
  if (location.hostname === 'localhost') {
    status.textContent = 'Local development';
    manualConnect.style.display = 'block';
  }
}

function connect(url: string) {
  status.textContent = 'Connecting...';
  ws = new WebSocket(url);
  
  ws.onopen = () => status.textContent = 'Connected!';
  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
  ws.onclose = () => {
    status.textContent = 'Disconnected';
    manualConnect.style.display = 'block';
  };
}

function send(msg: ClientMessage) {
  ws?.send(JSON.stringify(msg));
}

function handleMessage(msg: ServerMessage & { type: string }) {
  switch (msg.type) {
    case 'welcome':
      myColor = (msg as any).color;
      phase = 'waiting';
      showOverlay('waiting');
      break;
      
    case 'opponent_joined':
      phase = 'ready';
      showOverlay('ready');
      break;
      
    case 'session_started':
      phase = 'playing';
      showOverlay(null);
      break;
      
    case 'position_broadcast':
      // Handle opponent's position update
      break;
  }
}

function showOverlay(name: string | null) {
  connectionOverlay.style.display = name === 'connection' ? 'flex' : 'none';
  waitingOverlay.style.display = name === 'waiting' ? 'flex' : 'none';
  readyOverlay.style.display = name === 'ready' ? 'flex' : 'none';
}

function sendReady() {
  send({ type: 'participant_ready' } as any);
  readyBtn.textContent = 'Waiting...';
  readyBtn.disabled = true;
}

function handleMouseMove(e: MouseEvent) {
  if (phase === 'playing') {
    send({
      type: 'position_update',
      position: {
        x: e.clientX / canvas.width,
        y: e.clientY / canvas.height,
      },
    });
  }
}

function render() {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Your rendering logic here
  
  requestAnimationFrame(render);
}

init();
```

### Step 7: Register in the Lobby

The lobby is app-agnostic and dynamically discovers registered apps. To make your app appear in the lobby:

1. **Add the import** to `packages/lobby/src/index.ts`:

```typescript
// Import apps to register them with the global registry
// Each app auto-registers when imported
import '@gesture-app/blocks-cannons';
import '@gesture-app/hello-hands';
import '@gesture-app/my-app';  // Add this line
```

2. **Add the dependency** to `packages/lobby/package.json`:

```json
{
  "dependencies": {
    "@gesture-app/my-app": "*"
  }
}
```

**How it works:**

- When the lobby server starts, it imports your app package
- Your app's `src/index.ts` auto-registers with `globalRegistry` on import
- The lobby's `/api/sessions/apps` endpoint returns all registered apps
- The lobby frontend fetches this list and displays app cards for users to select
- No frontend code changes are needed in the lobby - it's fully dynamic

Your app will appear in the lobby with its `name`, `description`, and `tags` from the `AppManifest`.

### Step 8: Create Docker Configuration

Create `docker/Dockerfile`:

```dockerfile
FROM node:24-bookworm-slim AS builder
WORKDIR /build
COPY package*.json ./
COPY packages/framework/protocol/package.json packages/framework/protocol/
COPY packages/framework/server/package.json packages/framework/server/
COPY packages/applications/my-app/package.json packages/applications/my-app/

RUN npm install --workspace=@gesture-app/framework-protocol \
    --workspace=@gesture-app/framework-server \
    --workspace=@gesture-app/my-app

COPY packages/framework/protocol packages/framework/protocol
COPY packages/framework/server packages/framework/server
COPY packages/applications/my-app packages/applications/my-app
COPY tsconfig.base.json ./

RUN npm run build --workspace=@gesture-app/framework-protocol
RUN npm run build --workspace=@gesture-app/framework-server
RUN npm run build --workspace=@gesture-app/my-app
RUN npm run build:client --workspace=@gesture-app/my-app

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends nginx \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=builder /build/packages/framework/protocol/dist ./packages/framework/protocol/dist
COPY --from=builder /build/packages/framework/protocol/package.json ./packages/framework/protocol/
COPY --from=builder /build/packages/framework/server/dist ./packages/framework/server/dist
COPY --from=builder /build/packages/framework/server/package.json ./packages/framework/server/
COPY --from=builder /build/packages/applications/my-app/dist ./packages/applications/my-app/dist
COPY --from=builder /build/packages/applications/my-app/package.json ./packages/applications/my-app/
COPY --from=builder /build/packages/applications/my-app/dist/client /usr/share/nginx/html

COPY packages/applications/my-app/docker/nginx.conf /etc/nginx/nginx.conf
COPY packages/applications/my-app/docker/entrypoint.sh /app/entrypoint.sh

COPY package*.json ./
RUN npm install --workspace=@gesture-app/framework-protocol \
    --workspace=@gesture-app/framework-server \
    --workspace=@gesture-app/my-app \
    --omit=dev

RUN chmod +x /app/entrypoint.sh

ENV PORT=8080
ENV SESSION_ID=""
ENV APP_ID="my-app"
ENV LOBBY_URL="https://gestures-apps.dx-tooling.org"

EXPOSE 80
CMD ["/app/entrypoint.sh"]
```

Create `docker/entrypoint.sh`:

```bash
#!/bin/sh
set -e

echo "=== My App Session Container ==="
echo "SESSION_ID: ${SESSION_ID:-not set}"
echo "APP_ID: ${APP_ID:-my-app}"

LOBBY_URL="${LOBBY_URL:-https://gestures-apps.dx-tooling.org}"
WS_URL="wss://${SESSION_ID}-${APP_ID}-gestures.dx-tooling.org/ws"

cat > /usr/share/nginx/html/session.json << EOF
{
  "appId": "${APP_ID}",
  "sessionId": "${SESSION_ID}",
  "wsUrl": "${WS_URL}",
  "lobbyUrl": "${LOBBY_URL}"
}
EOF

nginx
cd /app/packages/applications/my-app
exec node dist/server/server.js
```

Create `docker/nginx.conf`:

```nginx
worker_processes auto;
events { worker_connections 1024; }

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
    }

    server {
        listen 80;

        root /usr/share/nginx/html;
        index index.html;

        location = /session.json {
            add_header Cache-Control "no-cache";
        }

        location /ws {
            proxy_pass http://127.0.0.1:8080;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_read_timeout 86400;
        }

        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
```

## Testing Your App

### Run Tests

```bash
cd packages/applications/my-app
npm test
```

### Local Development

**Terminal 1 - Server:**
```bash
npm run dev
```

**Terminal 2 - Client:**
```bash
cd client && npx vite
```

Open two browser windows to test the two-participant flow.

### Via Lobby

```bash
# Start lobby
cd packages/lobby && npm run dev

# Create a session
curl -X POST http://localhost:3002/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"appId": "my-app", "opponentType": "human"}'
```

## Framework Lifecycle

Understanding the session lifecycle helps you build the right UX:

```
┌─────────────────────────────────────────────────────────────┐
│                    Session Lifecycle                         │
│                                                              │
│   WAITING ──────────────────────────────────────────────────│
│     │                                                        │
│     │  Participant 1 joins                                   │
│     │  → onParticipantJoin() called                          │
│     │  → Welcome message sent                                │
│     │                                                        │
│     │  Participant 2 joins                                   │
│     │  → onParticipantJoin() called                          │
│     │  → opponent_joined sent to both                        │
│     │                                                        │
│     │  Both send participant_ready                           │
│     ▼                                                        │
│   PLAYING ──────────────────────────────────────────────────│
│     │                                                        │
│     │  → onSessionStart() called                             │
│     │  → session_started sent to both                        │
│     │                                                        │
│     │  App messages flow:                                    │
│     │  Client → onMessage() → responses → Clients            │
│     │                                                        │
│     │  If tickEnabled: onTick() called at tickIntervalMs     │
│     │  If checkSessionEnd() returns winner:                  │
│     ▼                                                        │
│   FINISHED ─────────────────────────────────────────────────│
│     │                                                        │
│     │  → session_ended sent with winner info                 │
│     │                                                        │
│     │  Both send play_again_vote                             │
│     │  → play_again_status updates sent                      │
│     │  → onReset() called                                    │
│     │  → session_reset sent                                  │
│     │                                                        │
│     └──────────────────────► Back to WAITING                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## AppHooks Reference

| Method | When Called | Return |
|--------|------------|--------|
| `generateParticipantId(number)` | New connection | Unique participant ID |
| `onParticipantJoin(participant)` | After connection accepted | Welcome data for client |
| `onParticipantLeave(id)` | Connection closed | void |
| `onMessage(msg, senderId, phase)` | Client message received | Array of responses to route |
| `onSessionStart()` | Both participants ready | void |
| `onReset()` | All voted to play again | Reset data for clients |
| `onTick?(deltaTime)` | Each tick (if enabled) | Messages to broadcast |
| `checkSessionEnd?()` | Each tick (if enabled) | Winner info or null |

## SessionClient (Framework Client)

Use `SessionClient` from `@gesture-app/framework-client` plus `resolveSessionConfig` to resolve the WebSocket URL and lobby return URL at runtime. The framework handles lifecycle messages; your app only handles app messages.

```typescript
import {
  resolveSessionConfig,
  SessionClient,
  type SessionClientEvents,
} from '@gesture-app/framework-client';
import type { ClientMessage, ServerMessage, MyAppWelcomeData } from '../src/shared/protocol.js';

const client = new SessionClient<ClientMessage, ServerMessage, MyAppWelcomeData>({
  onSessionJoin: ({ appData }) => console.log('Welcome data', appData),
  onSessionStart: () => console.log('Started'),
  onSessionEnd: (winnerId, winnerNumber, reason, appData) =>
    console.log('Ended', winnerId, winnerNumber, reason, appData),
  onSessionReset: (appData) => console.log('Reset', appData),
  onAppMessage: (msg) => console.log('App message', msg),
});

const config = await resolveSessionConfig();
if (config.mode === 'session') {
  client.connect(config.config.wsUrl);
} else {
  // local dev: show manual connect UI
}
```

## Message Routing

The `onMessage` handler returns an array of `MessageResponse` objects:

```typescript
interface MessageResponse<T> {
  target: 'sender' | 'opponent' | 'all';
  message: T;
}
```

| Target | Description |
|--------|-------------|
| `sender` | Only the participant who sent the message |
| `opponent` | Only the other participant |
| `all` | Both participants |

## Tips

1. **Keep shared types minimal** - Only include what both client and server need
2. **Use Zod for validation** - Parse incoming messages before trusting them
3. **Handle all phases** - Your client should gracefully handle waiting, ready, playing, and finished states
4. **Test with two windows** - Always test the two-participant flow locally
5. **Log on the server** - Console logs help debug session lifecycle issues
6. **Set phase before starting hand tracking** - Avoid race conditions by setting your phase state before starting the hand tracker callback loop
7. **Handle late joins** - If someone raises their hand while waiting, check again when the opponent joins

---

## Adding Hand Tracking (MediaPipe)

The framework is designed for hand-gesture-driven apps. Here's how to add camera-based hand tracking.

### 1. Add Dependencies

```json
{
  "dependencies": {
    "@mediapipe/camera_utils": "^0.3.1675466862",
    "@mediapipe/hands": "^0.4.1675469240"
  },
  "devDependencies": {
    "vite-plugin-static-copy": "^2.3.0"
  }
}
```

### 2. Configure Vite to Copy MediaPipe Assets

```typescript
// client/vite.config.ts
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: resolve(__dirname, '../../../../node_modules/@mediapipe/hands/*'),
          dest: 'mediapipe/hands',
        },
      ],
    }),
  ],
});
```

### 3. Create HandTracker Module

```typescript
// client/input/HandTracker.ts
import { Camera } from '@mediapipe/camera_utils';
import { Hands } from '@mediapipe/hands';

/** All 21 hand landmark indices */
export const LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
} as const;

/** Connections between landmarks for drawing skeleton */
export const HAND_CONNECTIONS: [number, number][] = [
  // Palm
  [0, 1], [0, 5], [0, 17], [5, 9], [9, 13], [13, 17],
  // Fingers
  [1, 2], [2, 3], [3, 4],       // Thumb
  [5, 6], [6, 7], [7, 8],       // Index
  [9, 10], [10, 11], [11, 12],  // Middle
  [13, 14], [14, 15], [15, 16], // Ring
  [17, 18], [18, 19], [19, 20], // Pinky
];

export interface Point2D {
  x: number;
  y: number;
}

export interface HandState {
  position: Point2D;           // Palm center (normalized 0-1)
  landmarks: Point2D[];        // All 21 landmarks for skeleton visualization
  isPinching: boolean;
  isRaised: boolean;
}

export type HandCallback = (hand: HandState | null) => void;

export class HandTracker {
  private hands: Hands | null = null;
  private camera: Camera | null = null;
  private readonly video: HTMLVideoElement;
  private callback: HandCallback | null = null;
  private isRunning = false;

  constructor(videoElement: HTMLVideoElement) {
    this.video = videoElement;
  }

  async initialize(onHand: HandCallback): Promise<void> {
    this.callback = onHand;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
    });
    this.video.srcObject = stream;
    await this.video.play();

    this.hands = new Hands({
      locateFile: (file) => `./mediapipe/hands/${file}`,
    });

    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    this.hands.onResults((results) => {
      if (results.multiHandLandmarks?.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        this.callback?.(this.extractHandState(landmarks));
      } else {
        this.callback?.(null);
      }
    });

    this.camera = new Camera(this.video, {
      onFrame: async () => {
        if (this.hands && this.isRunning) {
          await this.hands.send({ image: this.video });
        }
      },
      width: 640,
      height: 480,
    });
  }

  private extractHandState(raw: { x: number; y: number; z: number }[]): HandState {
    const wrist = raw[LANDMARKS.WRIST];
    const thumbTip = raw[LANDMARKS.THUMB_TIP];
    const indexTip = raw[LANDMARKS.INDEX_TIP];
    const middleTip = raw[LANDMARKS.MIDDLE_TIP];

    // Palm center (average of key points)
    const palmX = (wrist.x + indexTip.x + middleTip.x) / 3;
    const palmY = (wrist.y + indexTip.y + middleTip.y) / 3;

    // Pinch detection
    const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    const isPinching = pinchDist < 0.08;

    // Raised hand detection
    const isRaised = wrist.y < 0.4;

    // Extract all landmarks as 2D points
    const landmarks: Point2D[] = raw.map((lm) => ({ x: lm.x, y: lm.y }));

    return { position: { x: palmX, y: palmY }, landmarks, isPinching, isRaised };
  }

  start(): void {
    if (this.camera && !this.isRunning) {
      this.isRunning = true;
      this.camera.start();
    }
  }

  stop(): void {
    this.isRunning = false;
  }
}
```

### 4. Add Video Element to HTML

```html
<!-- Hidden video for camera feed -->
<video id="camera-feed" autoplay playsinline style="display: none;"></video>
```

### 5. Integrate in Your Client

```typescript
import { HandTracker, type HandState } from './input/HandTracker.js';

// State for hand-based ready detection
let isHandRaised = false;

const video = document.getElementById('camera-feed') as HTMLVideoElement;
const tracker = new HandTracker(video);

await tracker.initialize((hand: HandState | null) => {
  if (hand) {
    // Send position to server
    send({
      type: 'hand_update',
      handState: hand,
    });

    // Auto-ready when hand is raised (gesture-based ready)
    if (hand.isRaised && !isHandRaised && phase === 'ready') {
      isHandRaised = true;
      sendReady();
    }
  } else {
    isHandRaised = false; // Reset when hand lost
  }
});

tracker.start();
```

### 6. Handle the Ready Flow with Hand Tracking

The framework requires both participants to send `participant_ready` before starting. With hand tracking, you can use a "raise your hand" gesture:

```typescript
// When opponent joins while hand is already raised, send ready immediately
function handleOpponentJoined() {
  phase = 'ready';
  showOverlay('ready');
  
  // If hand is already raised, auto-ready
  if (currentHandState?.isRaised && !isHandRaised) {
    isHandRaised = true;
    sendReady();
  }
}
```

**Important:** Set the phase to `'ready'` *before* starting the hand tracker callback loop to avoid race conditions where the raised hand check fails because the phase isn't set yet.

### 7. Draw Hand Skeleton (Optional)

For visual feedback, draw the hand skeleton using the landmarks:

```typescript
import { HAND_CONNECTIONS, LANDMARKS, type HandState } from './input/HandTracker.js';

function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  hand: HandState,
  width: number,
  height: number,
  color: string
): void {
  const { landmarks } = hand;
  if (!landmarks || landmarks.length < 21) return;

  // Draw bones (connections)
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (pa && pb) {
      ctx.beginPath();
      ctx.moveTo(pa.x * width, pa.y * height);
      ctx.lineTo(pb.x * width, pb.y * height);
      ctx.stroke();
    }
  }

  // Draw joints (larger circles for fingertips)
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!lm) continue;

    const isTip = [
      LANDMARKS.THUMB_TIP,
      LANDMARKS.INDEX_TIP,
      LANDMARKS.MIDDLE_TIP,
      LANDMARKS.RING_TIP,
      LANDMARKS.PINKY_TIP,
    ].includes(i);

    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, isTip ? 4 : 2, 0, Math.PI * 2);
    ctx.fillStyle = isTip ? '#fff' : color;
    ctx.fill();
  }

  // Highlight pinch point
  if (hand.isPinching) {
    const thumb = landmarks[LANDMARKS.THUMB_TIP];
    const index = landmarks[LANDMARKS.INDEX_TIP];
    if (thumb && index) {
      const mx = ((thumb.x + index.x) / 2) * width;
      const my = ((thumb.y + index.y) / 2) * height;
      ctx.beginPath();
      ctx.arc(mx, my, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
```

**Mirroring tip:** If your canvas is CSS-mirrored (`transform: scaleX(-1)`), draw landmarks using raw coordinates. If not mirrored in CSS, use `(1 - x) * width` for a mirror effect.

### Key Concepts

| Gesture | Detection | Use Case |
|---------|-----------|----------|
| **Pinch** | Thumb tip and index tip distance < 0.08 | Grab/select objects |
| **Raised hand** | Wrist Y position < 0.4 (top of frame) | Signal ready, wave |
| **Position** | Normalized 0-1 coordinates from camera | Cursor/pointer control |

### Privacy Note

The camera feed stays local - only extracted hand positions (x, y coordinates) are sent to the server. Add a privacy notice in your UI:

```html
<p class="privacy-note">Your video stays on your device - only hand positions are shared.</p>
```

---

## Example Apps

| App | Description | Key Features |
|-----|-------------|--------------|
| **hello-hands** | Wave hello demo | 2D skeleton visualization, raise-to-ready gesture, position sharing |
| **blocks-cannons** | Competitive app | 3D volumetric hands, app state, bot AI, pinch-to-grab |

Refer to `packages/applications/hello-hands/` for a complete hand-tracking reference implementation, including:
- Camera permission flow with overlay UI
- Raise-hand gesture to auto-ready
- 2D hand skeleton visualization (21 landmarks + connections)
- Camera preview with skeleton overlay
- Pinch gesture highlighting
- Tracking status indicator

