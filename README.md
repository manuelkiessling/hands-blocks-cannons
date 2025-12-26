# Gesture Apps Framework

[![Validate](https://github.com/manuelkiessling/hands-blocks-cannons/actions/workflows/validate.yml/badge.svg)](https://github.com/manuelkiessling/hands-blocks-cannons/actions/workflows/validate.yml)

A TypeScript framework for building two-participant, browser-based applications controlled by hand gestures via webcam. The framework handles session management, WebSocket communication, participant lifecycle, and provides MediaPipe-based hand tracking out of the box.

**Live demo:** [gestures-apps.dx-tooling.org](https://gestures-apps.dx-tooling.org/)

## Overview

The framework solves the common infrastructure problems of real-time two-player web applications:

- **Session management**: Participant admission, ready-state synchronization, reconnection handling
- **Message routing**: Type-safe client-server communication with Zod validation
- **Hand tracking**: MediaPipe integration with gesture detection (pinch, raised hand)
- **Deployment**: Docker containers with Traefik integration for dynamic session routing

You write the application logic (game rules, rendering, custom gestures); the framework handles the networking and lifecycle.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Framework                                │
│                                                                  │
│  ┌─────────────────────┐         ┌─────────────────────┐         │
│  │   SessionRuntime    │         │    SessionClient    │         │
│  │   (Server)          │ ◄─────► │    (Client)         │         │
│  │                     │   WS    │                     │         │
│  │ • 2-participant     │         │ • Connection mgmt   │         │
│  │   admission         │         │ • Lifecycle events  │         │
│  │ • Lifecycle gating  │         │ • Ready signaling   │         │
│  │ • Ready state       │         │ • Play-again voting │         │
│  │ • Message routing   │         │ • Reconnection      │         │
│  │ • Play-again flow   │         │                     │         │
│  └─────────────────────┘         └─────────────────────┘         │
│            │                               │                     │
│            │ AppHooks                      │ Event Handlers      │
│            ▼                               ▼                     │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    Your Application                         │ │
│  │                                                             │ │
│  │  • Shared types & protocol                                  │ │
│  │  • Server app logic (via AppHooks)                          │ │
│  │  • Client UI & rendering                                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
hands-blocks-cannons/
├── packages/
│   ├── framework/
│   │   ├── protocol/     # Shared types, schemas, message definitions
│   │   ├── server/       # SessionRuntime, WebSocket server utilities
│   │   ├── client/       # SessionClient, connection management
│   │   ├── input/        # HandTracker, gesture detection (MediaPipe)
│   │   ├── build/        # Vite configuration, Docker templates
│   │   └── testing/      # Test utilities, mock connections
│   ├── applications/
│   │   ├── blocks-cannons/   # Competitive game with 3D rendering
│   │   └── hello-hands/      # Minimal hand-tracking demo
│   └── lobby/            # Session creation, app discovery, Docker spawning
├── docs/
│   ├── BUILDING_AN_APP.md
│   └── DEPLOYMENT.md
└── docker-compose.yml
```

### Framework Packages

| Package | Description |
|---------|-------------|
| `@gesture-app/framework-protocol` | Type definitions, Zod schemas, message contracts |
| `@gesture-app/framework-server` | `SessionRuntime` class, `createAppServer` factory |
| `@gesture-app/framework-client` | `SessionClient` class, session configuration resolver |
| `@gesture-app/framework-input` | `HandTracker` class, `isPinching`/`isHandRaised` utilities |
| `@gesture-app/framework-build` | Vite configuration helpers, Docker file generators |
| `@gesture-app/framework-testing` | Mock connections, test harness utilities |

### Example Applications

| App | Description |
|-----|-------------|
| `@gesture-app/blocks-cannons` | Two-player competitive game with 3D volumetric hands, pinch-to-grab mechanics, and bot opponent |
| `@gesture-app/hello-hands` | Minimal reference implementation showing hand skeleton visualization and gesture detection |

## Requirements

- **Node.js 24+** (see `.nvmrc`)
- npm 10+

```bash
# Using nvm
nvm use

# Or using mise
mise use
```

## Getting Started

### Installation

```bash
git clone https://github.com/manuelkiessling/hands-blocks-cannons.git
cd hands-blocks-cannons
npm install
```

### Validation

Run the full validation suite (build, lint, typecheck, tests):

```bash
npm run validate
```

### Development

Start an individual application:

```bash
# Server (in one terminal)
npm run dev:server -w @gesture-app/blocks-cannons

# Client (in another terminal)
npm run dev:client -w @gesture-app/blocks-cannons
```

Start the lobby for full session management:

```bash
npm run dev -w @gesture-app/lobby
```

## Building an Application

Applications implement the `AppHooks` interface on the server and use `SessionClient` on the client. The framework handles all lifecycle events.

### Server: Implement AppHooks

```typescript
import type { AppHooks, MessageResponse, Participant } from '@gesture-app/framework-server';

export class MyAppHooks implements AppHooks<ClientMessage, ServerMessage, WelcomeData, ResetData> {
  generateParticipantId(participantNumber: 1 | 2): string {
    return `player-${participantNumber}`;
  }

  onParticipantJoin(participant: Participant): WelcomeData {
    return { color: getColor(participant.number) };
  }

  onMessage(message: ClientMessage, senderId: string, phase: SessionPhase): MessageResponse<ServerMessage>[] {
    switch (message.type) {
      case 'hand_update':
        return [{ target: 'opponent', message: { type: 'hand_broadcast', ... } }];
    }
    return [];
  }

  onSessionStart(): void {
    // Both participants ready
  }

  onReset(): ResetData {
    // Both voted to play again
    return { message: 'New round!' };
  }
}
```

### Client: Use SessionClient

```typescript
import { SessionClient, resolveSessionConfig } from '@gesture-app/framework-client';

const client = new SessionClient<ClientMessage, ServerMessage, WelcomeData>({
  onSessionJoin: ({ appData }) => initGame(appData),
  onSessionStart: () => startGame(),
  onSessionEnd: (winnerId) => showResults(winnerId),
  onAppMessage: (msg) => handleGameMessage(msg),
});

const config = await resolveSessionConfig();
if (config.mode === 'session') {
  client.connect(config.config.wsUrl);
}
```

### Hand Tracking

```typescript
import { HandTracker, isPinching, isHandRaised } from '@gesture-app/framework-input';

const tracker = new HandTracker(videoElement);
await tracker.initialize((hand) => {
  if (hand && isPinching(hand)) {
    // Pinch gesture detected
  }
  if (hand && isHandRaised(hand)) {
    // Hand raised above threshold
  }
});
tracker.start();
```

See [docs/BUILDING_AN_APP.md](docs/BUILDING_AN_APP.md) for the complete guide.

## Session Lifecycle

```
WAITING ─────────────────────────────────────────────────────────
  │
  │  Participant 1 joins → onParticipantJoin() → welcome message
  │  Participant 2 joins → opponent_joined sent to both
  │
  │  Both send participant_ready
  ▼
PLAYING ─────────────────────────────────────────────────────────
  │
  │  → onSessionStart() called
  │  → session_started sent to both
  │
  │  App messages: Client → onMessage() → responses → Clients
  │
  │  Winner determined (via checkSessionEnd or explicit call)
  ▼
FINISHED ────────────────────────────────────────────────────────
  │
  │  → session_ended sent with winner info
  │
  │  Both send play_again_vote
  │  → onReset() called
  │  → Back to WAITING
```

## Deployment

The framework includes Docker support with Traefik integration for dynamic session routing:

- **Lobby**: Static deployment at `gestures-apps.dx-tooling.org`
- **Sessions**: Dynamic containers at `{sessionId}-{appId}-gestures.dx-tooling.org`

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for server setup instructions.

## Testing

```bash
# Run all tests
npm test

# Run tests for a specific package
npm test -w @gesture-app/framework-server

# Run client-side tests (browser environment)
npm run test:clients
```

## Privacy

Camera feeds are processed locally in the browser. Only extracted hand positions (normalized x/y coordinates) are transmitted to the server. Video data never leaves the client device.

## License

MIT
