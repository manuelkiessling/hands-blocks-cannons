---
name: Blocks-Cannons Migration
overview: Migrate legacy packages (@block-game/client, @block-game/server, @block-game/shared) into @gesture-app/blocks-cannons and the framework, then remove the backwards-compatibility shims.
todos:
  - id: phase1-sessionconfig
    content: Move SessionConfig to @gesture-app/framework-client
    status: pending
  - id: phase2-client-structure
    content: Create blocks-cannons/client/ directory structure
    status: pending
  - id: phase2-client-migrate
    content: Migrate client source files (scene, game, input, ui)
    status: pending
    dependencies:
      - phase2-client-structure
  - id: phase2-client-tests
    content: Migrate client tests
    status: pending
    dependencies:
      - phase2-client-migrate
  - id: phase2-client-imports
    content: Update client imports to use framework
    status: pending
    dependencies:
      - phase1-sessionconfig
      - phase2-client-migrate
  - id: phase3-bot
    content: Migrate bot system to blocks-cannons/server/bot/
    status: pending
  - id: phase3-utils
    content: Migrate server utilities (logger, InactivityMonitor)
    status: pending
  - id: phase3-gamemanager
    content: Refactor GameManager to AppHooks pattern
    status: pending
    dependencies:
      - phase3-bot
      - phase3-utils
  - id: phase3-server-tests
    content: Migrate server tests
    status: pending
    dependencies:
      - phase3-gamemanager
  - id: phase4-package
    content: Update blocks-cannons package.json with new scripts/deps
    status: pending
    dependencies:
      - phase2-client-imports
      - phase3-gamemanager
  - id: phase4-docker
    content: Update Docker configuration
    status: pending
    dependencies:
      - phase4-package
  - id: phase5-delete-legacy
    content: Delete packages/shared, packages/server, packages/client
    status: pending
    dependencies:
      - phase4-docker
  - id: phase5-rename-lobby
    content: Rename @block-game/lobby to @gesture-app/lobby
    status: pending
    dependencies:
      - phase5-delete-legacy
  - id: phase5-root-config
    content: Update root package.json workspaces and scripts
    status: pending
    dependencies:
      - phase5-rename-lobby
  - id: final-validation
    content: Run full validation and fix any issues
    status: pending
    dependencies:
      - phase5-root-config
---

# Blocks-Cannons Migration Plan

## Current State

The codebase has legacy packages that need to be consolidated:

```mermaid
graph TB
    subgraph legacy [Legacy Packages - To Migrate]
        BGClient["@block-game/client<br/>Three.js game client"]
        BGServer["@block-game/server<br/>WS server + bot AI"]
        BGShared["@block-game/shared<br/>Re-export shim"]
    end
    
    subgraph framework [Framework - Mostly Complete]
        FWProtocol["@gesture-app/framework-protocol"]
        FWServer["@gesture-app/framework-server"]
        FWClient["@gesture-app/framework-client"]
    end
    
    subgraph apps [Applications]
        BC["@gesture-app/blocks-cannons<br/>Partial: shared + game logic"]
        HH["@gesture-app/hello-hands<br/>Complete reference app"]
    end
    
    BGClient --> BGShared
    BGServer --> BGShared
    BGShared --> BC
    BC --> FWProtocol
    HH --> FWProtocol
    HH --> FWServer
```



## Target State

```mermaid
graph TB
    subgraph framework [Framework]
        FWProtocol["@gesture-app/framework-protocol"]
        FWServer["@gesture-app/framework-server"]
        FWClient["@gesture-app/framework-client<br/>+ SessionConfig"]
    end
    
    subgraph apps [Applications]
        BC["@gesture-app/blocks-cannons<br/>Complete: client + server + shared"]
        HH["@gesture-app/hello-hands"]
    end
    
    BC --> FWProtocol
    BC --> FWServer
    BC --> FWClient
    HH --> FWProtocol
    HH --> FWServer
    HH --> FWClient
```

---

## Phase 1: Extract Framework Code

Move generic session configuration to the framework.**Move to `@gesture-app/framework-client`:**

- [packages/client/src/config/SessionConfig.ts](packages/client/src/config/SessionConfig.ts) - Generic session config resolution

---

## Phase 2: Migrate Client to blocks-cannons

Create `packages/applications/blocks-cannons/client/` with the game client.**Files to migrate from [packages/client/](packages/client/):**| Source | Destination ||--------|-------------|| `src/main.ts` | `client/main.ts` || `src/constants.ts` | `client/constants.ts` || `src/types.ts` | `client/types.ts` || `src/styles.css` | `client/styles.css` || `index.html` | `client/index.html` || `vite.config.ts` | `client/vite.config.ts` || `src/scene/*` | `client/scene/` (BlockRenderer, EffectsManager, RoomRenderer, SceneManager) || `src/game/*` | `client/game/` (InteractionManager) || `src/input/*` | `client/input/` (HandTracker, GestureDetector, HandVisualizer) || `src/ui/*` | `client/ui/` (StatusDisplay) || `src/network/GameClient.ts` | Remove (replaced by framework SessionClient) || `tests/*` | `client/tests/` |**Update imports** to use:

- `@gesture-app/framework-client` for SessionClient, SessionConfig
- `@gesture-app/blocks-cannons/shared` for types/protocol

---

## Phase 3: Migrate Server to blocks-cannons

Move remaining server code into the application.**Files to migrate from [packages/server/](packages/server/):**| Source | Destination ||--------|-------------|| `src/server.ts` | `src/server/server.ts` (standalone entry) || `src/bot/*` | `src/server/bot/` (BotAI, BotBehavior, BotClient, BotMovement) || `src/game/GameManager.ts` | `src/server/BlocksCannonSession.ts` (refactor to AppHooks) || `src/protocol/*` | Merge into `src/shared/protocol.ts` || `src/utils/*` | `src/server/utils/` (InactivityMonitor, logger) || `tests/*` | `tests/server/` |**Refactor GameManager:**

- Extract session lifecycle → Already in `SessionRuntime`
- Keep game-specific tick logic as `AppHooks.onTick()`
- Keep bot integration

---

## Phase 4: Update Package Configuration

**[packages/applications/blocks-cannons/package.json](packages/applications/blocks-cannons/package.json):**

```json
{
  "scripts": {
    "build": "tsup src/index.ts src/shared/index.ts src/server/index.ts --format esm --dts --clean",
    "build:client": "vite build --config client/vite.config.ts",
    "dev": "tsx src/server/server.ts",
    "dev:client": "vite --config client/vite.config.ts",
    "start": "node dist/server/server.js",
    "check": "biome check --write .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@gesture-app/framework-protocol": "^1.0.0",
    "@gesture-app/framework-server": "^1.0.0",
    "@gesture-app/framework-client": "^1.0.0",
    "@mediapipe/camera_utils": "^0.3.x",
    "@mediapipe/hands": "^0.4.x",
    "three": "^0.182.0",
    "ws": "^8.18.0",
    "yaml": "^2.8.0",
    "zod": "^4.0.0"
  }
}
```

---

## Phase 5: Cleanup

**Delete legacy packages:**

- `packages/shared/` - Re-export shim, no longer needed
- `packages/server/` - Fully migrated to blocks-cannons
- `packages/client/` - Fully migrated to blocks-cannons

**Update root [package.json](package.json):**

- Remove legacy workspace entries
- Update `build:deps` to include all apps

**Rename lobby:**

- `@block-game/lobby` → `@gesture-app/lobby` for consistency

---

## Migration Checklist

1. [ ] Move SessionConfig to framework-client
2. [ ] Create blocks-cannons/client/ structure
3. [ ] Migrate client source files
4. [ ] Migrate client tests
5. [ ] Update client imports to use framework
6. [ ] Migrate server bot system
7. [ ] Migrate server utilities
8. [ ] Refactor GameManager to AppHooks pattern
9. [ ] Migrate server tests
10. [ ] Update blocks-cannons package.json
11. [ ] Update Docker configuration
12. [ ] Delete packages/shared
13. [ ] Delete packages/server
14. [ ] Delete packages/client
15. [ ] Rename lobby package
16. [ ] Update root package.json
17. [ ] Run full validation

---

## Risk Mitigation

- **Incremental migration**: Each phase is independently testable