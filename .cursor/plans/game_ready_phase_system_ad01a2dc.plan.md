---
name: Game Ready Phase System
overview: Implement a game phase system where the game waits in a "waiting" phase until all human players have raised their hands at least once, then transitions to "playing" phase. Bots identify themselves on connect and wait for the game to start.
todos:
  - id: protocol-messages
    content: Add bot_identify, player_ready, and game_started protocol messages to shared package
    status: completed
  - id: game-state-phase
    content: Add game phase tracking, isBot/isReady player flags, and phase transition methods to GameState
    status: completed
  - id: game-manager-phase
    content: Update GameManager to respect game phase in tick() and handle new messages
    status: completed
  - id: protocol-handlers
    content: Add handleBotIdentify and handlePlayerReady handlers
    status: completed
  - id: client-ready
    content: Update human client to send player_ready on first hand tracking and handle game_started
    status: completed
  - id: bot-wait
    content: Update BotClient to send bot_identify and wait for game_started before acting
    status: completed
---

# Game Ready Phase System

## Overview

Add a readiness/phase system so the game doesn't start until all human players have performed their first hand tracking. Bots self-identify on connect and wait for the `game_started` signal before acting.

## Architecture

```mermaid
sequenceDiagram
    participant Human as Human Client
    participant Server as Game Server
    participant Bot as Bot Client

    Note over Server: Game Phase: WAITING
    
    Human->>Server: WebSocket Connect
    Server->>Human: welcome (phase: waiting)
    
    Bot->>Server: WebSocket Connect
    Server->>Bot: welcome (phase: waiting)
    Bot->>Server: bot_identify
    Note over Server: Mark player as bot
    
    Human->>Server: player_ready (first hand raise)
    Note over Server: All humans ready!
    Note over Server: Phase: WAITING → PLAYING
    
    Server->>Human: game_started
    Server->>Bot: game_started
    
    Note over Bot: Now start AI behavior
    Note over Human: Game is now active
```



## Changes

### 1. Protocol Messages ([packages/shared/src/protocol/index.ts](packages/shared/src/protocol/index.ts))

Add new message types:

- **Client → Server**: `bot_identify` - Bot sends this after welcome to identify itself
- **Client → Server**: `player_ready` - Human sends this after first hand tracking
- **Server → Client**: `game_started` - Broadcast when all humans are ready
- Extend `welcome` message with `gamePhase` field

### 2. Game State ([packages/server/src/game/types.ts](packages/server/src/game/types.ts), [packages/server/src/game/GameState.ts](packages/server/src/game/GameState.ts))

- Add `GamePhase` type: `'waiting' | 'playing'`
- Add `isBot` flag to `Player` type
- Add `isReady` flag to `Player` type
- Add methods: `markPlayerAsBot()`, `markPlayerReady()`, `areAllHumansReady()`, `getGamePhase()`

### 3. Game Manager ([packages/server/src/game/GameManager.ts](packages/server/src/game/GameManager.ts))

- Track game phase in state
- In `tick()`: skip all game logic (auto-fire, projectile updates) when phase is `waiting`
- Add handlers for `bot_identify` and `player_ready` messages
- When all humans ready: transition to `playing` phase and broadcast `game_started`

### 4. Protocol Handlers ([packages/server/src/protocol/handlers.ts](packages/server/src/protocol/handlers.ts))

- Add `handleBotIdentify`: mark player as bot in state
- Add `handlePlayerReady`: mark player as ready, check if game should start

### 5. Human Client ([packages/client/src/main.ts](packages/client/src/main.ts), [packages/client/src/network/GameClient.ts](packages/client/src/network/GameClient.ts))

- Track if `player_ready` was already sent
- On first hand tracking callback: send `player_ready` message once
- Handle `game_started` event (update UI status)
- Disable interactions until game starts

### 6. Bot Client ([packages/server/src/bot/BotClient.ts](packages/server/src/bot/BotClient.ts))

- Send `bot_identify` message after receiving welcome
- Add `gameStarted` flag, initially `false`
- Handle `game_started` message: set flag to `true`, then call `scheduleNextAction()`
- In `handleWelcome()`: do NOT call `scheduleNextAction()` - wait for `game_started`

## Key Implementation Details

- **Human detection**: Server counts players where `isBot === false` and `isReady === false`
- **Ready condition**: Game starts when all non-bot players have `isReady === true`