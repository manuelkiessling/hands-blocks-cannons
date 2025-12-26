---
name: Framework-First Refactor v3 (Incremental Quality)
overview: Revise the refactor plan to enforce incremental changes with per-portion quality gates (tests/typecheck/lint) and incremental test-porting alongside code moves, avoiding a big-bang merge and late test run.
todos:
  - id: quality-gates-per-portion
    content: Make per-portion quality gates explicit and enforce that validate stays green after every portion; add narrow per-package gates where appropriate.
    status: pending
  - id: portion0-runtime-config
    content: Introduce runtime session config and remove domain hard-coding; add unit tests for config resolution.
    status: completed
    dependencies:
      - quality-gates-per-portion
  - id: portion1-scaffold-packages
    content: Scaffold packages/framework/* and packages/applications/* with smoke tests; update workspace globs.
    status: completed
    dependencies:
      - portion0-runtime-config
  - id: portion2-split-shared-with-tests
    content: Split shared into framework-level vs app-level and move corresponding tests incrementally with temporary compatibility re-exports.
    status: completed
    dependencies:
      - portion1-scaffold-packages
  - id: portion3-framework-server-with-conformance-tests
    content: Implement framework-server runtime and port server logic into blocks-cannons app; add framework-server conformance tests now.
    status: completed
    dependencies:
      - portion2-split-shared-with-tests
  - id: portion4-framework-client-with-tests
    content: Implement framework-client runtime and port client logic into blocks-cannons app; add framework-client lifecycle/dispatch tests now.
    status: completed
    dependencies:
      - portion2-split-shared-with-tests
  - id: portion5-app-registry
    content: Add application registry + bootstraps and tests ensuring new apps don't require framework edits.
    status: completed
    dependencies:
      - portion3-framework-server-with-conformance-tests
      - portion4-framework-client-with-tests
  - id: portion6-lobby-multiapp-with-tests
    content: Refactor lobby for multi-app session creation (appId) and update/port lobby tests accordingly.
    status: pending
    dependencies:
      - portion5-app-registry
  - id: portion7-container-app-selection
    content: Make session container app-selectable and add config/app-selection tests where feasible.
    status: pending
    dependencies:
      - portion6-lobby-multiapp-with-tests
  - id: portion8-port-blocks-cannons-complete
    content: Complete the blocks-cannons port into applications/blocks-cannons and ensure all tests moved and passing.
    status: pending
    dependencies:
      - portion7-container-app-selection
  - id: portion9-second-app-proof
    content: Add a minimal second app and tests to prove the framework abstraction is real.
    status: pending
    dependencies:
      - portion8-port-blocks-cannons-complete
---

# Framework-first refactor plan (v3: incremental refactoring + incremental tests)

## Goal

Transform the repo from “one specific game” into a **framework for browser-based, WebSocket-networked, two-participant, hand-gesture-driven applications**, with the current game as `applications/blocks-cannons`.This version of the plan explicitly adds **incremental test-porting** and **quality gates after every portion**.

## Non-negotiable process constraints (to avoid a late-stage mess)

### Quality gates (must stay green after every portion)

At the end of *each portion*, we require:

- **Build**: workspace build succeeds (new + old packages).
- **Typecheck**: all workspace typechecks succeed.
- **Lint/format**: Biome checks succeed (or run in CI mode without `--write`).
- **Tests**: Vitest suite(s) relevant to the portion succeed.

Concrete default gate command set (root-level):

- `npm run build:shared` (until `shared` is retired)
- `npm run check`
- `npm run typecheck`
- `npm run test`

If a portion touches only one package, we also add a **narrow gate** (run that package’s tests/typecheck) to keep feedback tight.

### Test-porting rule (strangler-fig approach)

- When code moves from an old location to framework/app packages, its **tests move in the same portion**.
- We keep temporary re-export shims only long enough to keep downstream imports/tests green.
- We add **new framework conformance tests early** (not “at the end”).

### Scope rule

Each portion should be shippable as a PR-sized unit that can be reviewed and reverted.

## Reality check: the most coupled areas we must defuse early

- **Hard-coded domain/session detection** in client runtime/UI:
- [`packages/client/src/main.ts`](packages/client/src/main.ts) (`getAutoConnectUrl()`)
- [`packages/client/src/ui/StatusDisplay.ts`](packages/client/src/ui/StatusDisplay.ts) (`getLobbyUrl()`)

These must become framework runtime config, or every app will inherit the block-game domain.

- **`@block-game/shared` is not actually “shared”**: it currently contains block-game constants/types/protocol.
- [`packages/shared/src/constants.ts`](packages/shared/src/constants.ts) is game-specific.
- **Client orchestrator is monolithic**:
- [`packages/client/src/main.ts`](packages/client/src/main.ts) mixes: lifecycle overlays, WebSocket plumbing, MediaPipe lifecycle, app logic, and rendering.
- **Session container image assumes one app**:
- [`docker/game-session/Dockerfile`](docker/game-session/Dockerfile) builds exactly one client+server.

## Work breakdown with explicit incremental gates and test moves

### Portion 0 — Introduce runtime session config and delete domain hard-coding (small, high leverage)

**Why now**: this is a cross-cutting coupling that will otherwise poison the framework.

- Add a runtime-injected session config (e.g. `window.__SESSION__` or `/session.json`) providing:
- `appId`, `wsUrl`, `lobbyUrl`, optional app config
- Replace:
- client auto-connect hostname regex in [`packages/client/src/main.ts`](packages/client/src/main.ts)
- lobby URL hostname regex in [`packages/client/src/ui/StatusDisplay.ts`](packages/client/src/ui/StatusDisplay.ts)

**Test work in this portion**:

- Add a small unit test suite around “config parsing/selection” logic (so future apps don’t reintroduce regexes).

**Quality gate**: full root validate.

### Portion 1 — Scaffold namespaces and keep CI green

- Add `packages/framework/*` and `packages/applications/*` folders and minimal packages.
- Update root workspaces globs to include nested workspaces.

**Test work**:

- Add “smoke tests” for new packages: they build, typecheck, and can import.

**Quality gate**: full root validate.

### Portion 2 — Split `shared` into framework-level vs app-level (incrementally, with compatibility)

- Create `applications/blocks-cannons/shared` (or equivalent) and begin moving:
- block/cannon/projectile types
- block-game constants now in [`packages/shared/src/constants.ts`](packages/shared/src/constants.ts)
- block-game protocol messages
- Create `framework-protocol` containing only generic lifecycle protocol pieces.
- Keep temporary re-exports (like [`packages/server/src/protocol/messages.ts`](packages/server/src/protocol/messages.ts)) until downstream code is ported.

**Test work**:

- Move tests that are truly block-game specific to the application package.
- Add framework-protocol tests: parsing/validation of lifecycle messages.

**Quality gate**: root validate + targeted tests for new protocol packages.

### Portion 3 — Framework server runtime (strangle `GameManager`)

Refactor [`packages/server/src/game/GameManager.ts`](packages/server/src/game/GameManager.ts) into:

- `framework-server` session runtime:
- 2-participant admission
- connection registry
- lifecycle gating (`waiting` → `playing` → `finished` → `reset`)
- sender/opponent/all routing
- generic inactivity integration (existing monitor stays but becomes framework-owned)
- `applications/blocks-cannons/server` hooks:
- state initialization
- message handlers
- tick + end-condition + reset

**Test work** (must happen here, not at the end):

- Introduce framework-server conformance tests:
- exactly-2 participants admission
- readiness gate (both participants ready before `session_started`)
- disconnect semantics
- Move server unit tests that belong to game logic into the app package alongside the moved code.

**Quality gate**: root validate + framework-server conformance tests.

### Portion 4 — Framework client runtime (strangle `main.ts`)

Extract from [`packages/client/src/main.ts`](packages/client/src/main.ts):

- `framework-client` owns:
- WS connection lifecycle (evolution of `GameClient`)
- lifecycle overlays and standardized UX flows
- `HandInputProvider` abstraction hiding MediaPipe
- `applications/blocks-cannons/client` owns:
- Three scene, renderer, effects
- interaction mapping (pinch → grab/move/release, etc.)

**Test work**:

- Add framework-client tests for:
- message dispatch and lifecycle transitions
- “ready overlay → started” flow
- Keep app client tests (if any) local to the app.

**Quality gate**: root validate + framework-client tests.

### Portion 5 — App registry + bootstraps (no framework edits to add a new app)

- Create `applications/registry` exporting an `AppRegistry` (appId → manifest).
- Create bootstraps so server/client load app by appId.

**Test work**:

- Registry tests: missing appId errors, manifest validation.

**Quality gate**: root validate.

### Portion 6 — Lobby framework + multi-app session API

Refactor [`packages/lobby/src/routes/sessions.ts`](packages/lobby/src/routes/sessions.ts) and lobby UI ([`packages/lobby/frontend/main.ts`](packages/lobby/frontend/main.ts)) to:

- accept `appId` in `POST /api/sessions`
- resolve spawn config via app registry
- pass `APP_ID` + session runtime config to containers

**Test work**:

- Port/update existing lobby tests to include `appId`.
- Add tests for registry-driven session creation.

**Quality gate**: root validate + lobby tests.

### Portion 7 — Session container becomes app-selectable

Update:

- [`docker/game-session/entrypoint.sh`](docker/game-session/entrypoint.sh) to start framework server with selected app
- [`docker/game-session/nginx.conf`](docker/game-session/nginx.conf) to serve:
- framework client shell
- runtime session config endpoint (or injected JS)

**Test work**:

- Add a lightweight “container wiring” test where possible (at minimum: unit tests around config generation and app selection logic).

**Quality gate**: root validate.

### Portion 8 — Finish porting blocks-cannons into `applications/blocks-cannons`

- Move remaining game code from `packages/server` and `packages/client` into the app.
- Remove or minimize compatibility shims.

**Test work**:

- Ensure all game-specific tests are now owned by the app.
- Confirm framework conformance tests still pass.

**Quality gate**: root validate.

### Portion 9 — Add a second minimal application to prove “frameworkness”

- Add `applications/hello-two-hands` (minimal) using the same session lifecycle.

**Test work**:

- Minimal app tests + ensures adding an app does not require framework edits.

**Quality gate**: root validate.

## Deliverables / definition of done

- Framework is app-agnostic; blocks-cannons is "just an app."

---

## Future Cleanup Tasks (Post-Refactor)

Once the refactor is complete and the framework is stable, these backwards-compatibility shims should be removed for a lean, clean codebase:

### Backwards-Compatible Field Names (Framework Protocol)

**Location**: `packages/framework/server/src/SessionRuntime.ts`
- Accepts both `player_ready` and `participant_ready` message types (line ~218)

**Location**: `packages/framework/client/src/SessionClient.ts`
- Welcome message: accepts `playerId`/`playerNumber`/`gamePhase` in addition to `participantId`/`participantNumber`/`sessionPhase` (lines ~323-326)
- Session started: accepts both `game_started` and `session_started` (line ~285-286)
- Session ended: accepts both `game_over` and `session_ended` (lines ~291-292)
- Play again status: accepts both `votedPlayerIds`/`totalPlayers` and `votedParticipantIds`/`totalParticipants` (lines ~301-305)
- Session reset: accepts both `game_reset` and `session_reset` (lines ~309-310)

### Compatibility Re-exports

**Location**: `packages/shared/src/index.ts` and `packages/shared/src/protocol/index.ts`
- Re-exports from `@gesture-app/blocks-cannons/shared` for backwards compatibility
- Deprecation notices added; should eventually be removed entirely

### Cleanup Actions

1. Update all consumer code to use new naming (`participant*`, `session*`)
2. Remove backwards-compat field checks from SessionClient and SessionRuntime
3. Remove re-exports from `@block-game/shared` once all imports migrated
4. Update protocol schemas to use only new field names

---

## Implementation Log

### Portion 0 — Runtime Session Config (COMPLETED ✓)

**Completed**: 2025-12-26

**Design decisions**:

- Session config injected via `window.__SESSION_CONFIG__` (set by nginx/entrypoint before app loads)
- Fallback: fetch from `/session.json` endpoint if window global not present
- For local development: auto-detect localhost and use manual connection UI (existing behavior)
- Config type: `{ appId: string; wsUrl: string; lobbyUrl: string; appConfig?: unknown }`

**Files created**:

- `packages/client/src/config/SessionConfig.ts` — types and resolution logic
- `packages/client/src/config/index.ts` — module exports
- `packages/client/tests/SessionConfig.test.ts` — 20 unit tests

**Files modified**:

- `packages/client/src/main.ts` — replaced `getAutoConnectUrl()` with `resolveSessionConfig()`, changed to async factory pattern `Game.create()`
- `packages/client/src/ui/StatusDisplay.ts` — replaced `getLobbyUrl()` with constructor-injected `lobbyUrl` parameter

**Key changes**:

- Removed hard-coded regex pattern `^[a-z0-9]+-hands-blocks-cannons\.dx-tooling\.org$`
- Client now receives session config from hosting environment, making it app-agnostic
- StatusDisplay receives lobbyUrl via constructor, no longer derives it from hostname

**Quality gate**: ✓ All 253 tests pass (20 new + 233 existing)

---

### Portion 1 — Scaffold Packages (COMPLETED ✓)

**Completed**: 2025-12-26

**New packages created**:

| Package | Purpose |
|---------|---------|
| `@gesture-app/framework-protocol` | Lifecycle protocol (participant_ready, session_started, session_ended) |
| `@gesture-app/framework-server` | Server runtime (2-participant admission, lifecycle gating) |
| `@gesture-app/framework-client` | Client runtime (WS lifecycle, overlays, hand input) |
| `@gesture-app/blocks-cannons` | Application placeholder (will receive migrated game code) |

**Files created per package**:

- `package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`
- `src/index.ts` — minimal exports (types, version constants)
- `tests/*.test.ts` — smoke tests

**Root changes**:

- Updated `package.json` workspaces to include `packages/framework/*` and `packages/applications/*`
- Added `build:deps` script to build `@block-game/shared` and `@gesture-app/framework-protocol` before other packages
- Updated `validate` script to use `build:deps`

**Quality gate**: ✓ All 268 tests pass (15 new + 253 existing)

---

### Portion 2 — Split Shared (COMPLETED ✓)

**Completed**: 2025-12-26

**What was split**:

| Content | Source | Destination |
|---------|--------|-------------|
| Types (Block, Projectile, Player, etc.) | `@block-game/shared/types` | `@gesture-app/blocks-cannons/shared` |
| Protocol (all Zod schemas + messages) | `@block-game/shared/protocol` | `@gesture-app/blocks-cannons/shared` |
| Constants (colors, thresholds, etc.) | `@block-game/shared/constants` | `@gesture-app/blocks-cannons/shared` |

**New files in `@gesture-app/blocks-cannons`**:

- `src/shared/types.ts` — App-specific type definitions
- `src/shared/constants.ts` — Game constants (colors, thresholds)
- `src/shared/protocol.ts` — Zod schemas and message types
- `src/shared/index.ts` — Re-exports all shared items
- `tests/shared.test.ts` — 19 tests for shared module

**Compatibility layer**:

- `@block-game/shared` now re-exports from `@gesture-app/blocks-cannons/shared`
- All existing code in `@block-game/server`, `@block-game/client` continues to work
- Deprecation notices added to encourage migration to new imports

**Build order updated**:

1. `@gesture-app/framework-protocol`
2. `@gesture-app/blocks-cannons`
3. `@block-game/shared` (now depends on blocks-cannons)
4. Everything else

**Quality gate**: ✓ All 287 tests pass (19 new + 268 existing)

---

### Portion 3 — Framework Server Runtime (COMPLETED)

**Started**: 2025-12-26
**Completed**: 2025-12-26

**Design decisions**:

- `SessionRuntime<TClientMessage, TServerMessage, TWelcomeData, TResetData>` handles all lifecycle concerns
- **Framework-level** (generic to all 2-participant apps):
- 2-participant admission (reject 3rd with error)
- Connection registry (`connections: Map<Connection, ParticipantId>`)
- Lifecycle phases: `waiting → playing → finished`
- Ready-state gating (both participants must be ready before session starts)
- Play-again voting (both must vote, then reset)
- Message routing targets: sender, opponent, all
- **App-level** (delegated via `AppHooks` interface):
- `generateParticipantId(number)`: Generate participant ID
- `onParticipantJoin(participant)`: Return welcome data
- `onParticipantLeave(id)`: Handle cleanup
- `onMessage(msg, senderId, phase)`: Handle app-specific messages
- `onSessionStart()`: Start game logic/tick loop
- `onReset()`: Reset state for new round, return reset data
- `onTick?(deltaTime)`: Optional tick-based updates
- `checkSessionEnd?()`: Optional win condition check
- Bots stay ready on reset; humans must re-ready
- Backwards-compatible: supports both `player_ready` and `participant_ready` messages

**Files created/modified**:

- `packages/framework/server/src/SessionRuntime.ts` — Core session runtime implementation
- `packages/framework/server/src/index.ts` — Updated exports
- `packages/framework/server/tests/SessionRuntime.test.ts` — 22 comprehensive tests covering:
- 2-participant admission (accept 1st, 2nd; reject 3rd)
- Ready-state gating (both must be ready)
- Bot auto-ready
- Disconnect semantics
- Play-again voting and reset flow
- Message routing (sender/opponent/all)
- Public API
- `packages/framework/server/tests/server.test.ts` — Updated smoke tests

**Progress**:

- [x] Analyze GameManager to identify framework vs app concerns
- [x] Design SessionRuntime with lifecycle phases including play-again
- [x] Implement SessionRuntime in framework-server
- [x] Define AppHooks interface for app integration
- [x] Add comprehensive framework-server conformance tests
- [x] Run quality gate (npm run validate)

**Quality gate**: ✓ All 305 tests pass (22 new SessionRuntime tests)

---

### Portion 4 — Framework Client Runtime (COMPLETED)

**Started**: 2025-12-26
**Completed**: 2025-12-26

**Design decisions**:

- `SessionClient<TClientMessage, TServerMessage, TWelcomeData>` handles all client-side lifecycle concerns
- **Framework-level** (generic to all 2-participant apps):
  - WebSocket connection management (connect, disconnect, reconnect)
  - Connection state tracking: `disconnected → connecting → connected → error`
  - Session lifecycle events: welcome, opponent join/leave, start, end, reset
  - Ready-state signaling (`sendReady()`)
  - Play-again voting (`sendPlayAgainVote()`)
  - Automatic reconnection (optional, configurable)
- **App-level** (delegated via event handlers):
  - `onAppMessage(message)`: Handle app-specific messages (block_grab, projectile_*, etc.)
  - App-specific welcome data passed through as `appData`
- Backwards-compatible: supports both old field names (`playerId`, `playerNumber`, `gamePhase`, `game_started`, `game_over`, `game_reset`) and new (`participantId`, `participantNumber`, `sessionPhase`, `session_started`, etc.)
- Framework message types are handled internally and routed to lifecycle handlers
- Non-framework message types are routed to `onAppMessage` for app handling

**Files created/modified**:

- `packages/framework/client/src/SessionClient.ts` — Core session client implementation
- `packages/framework/client/src/index.ts` — Updated exports
- `packages/framework/client/tests/SessionClient.test.ts` — 28 comprehensive tests covering:
  - Connection management (states, connect, disconnect)
  - Welcome handling (new and backwards-compat field names)
  - Session lifecycle (start, end, opponent events)
  - Play-again flow (status, reset)
  - Outgoing messages (ready, vote, app messages)
  - App message routing
  - Reconnection (auto, max attempts, cancel)
  - State reset on disconnect
- `packages/framework/client/tests/client.test.ts` — Updated smoke tests

**Progress**:

- [x] Analyze client code for framework vs app concerns
- [x] Design SessionClient with lifecycle phases including play-again
- [x] Implement SessionClient in framework-client
- [x] Add comprehensive framework-client tests
- [x] Run quality gate (npm run validate)

**Quality gate**: ✓ All 337 tests pass (28 new SessionClient tests)

---

### Portion 5 — App Registry (COMPLETED)

**Started**: 2025-12-26
**Completed**: 2025-12-26

**Design decisions**:

- **AppManifest interface**: Minimal contract apps implement
  - Required: `id`, `name`, `version`
  - Optional: `description`, `tags`
- **AppRegistry class**: Manages app registration and discovery
  - `register(manifest)`: Register an app (validates manifest, throws on duplicate)
  - `get(appId)`: Get manifest or throw `AppNotFoundError`
  - `tryGet(appId)`: Get manifest or undefined
  - `has(appId)`: Check if app exists
  - `listIds()`, `listAll()`: Enumerate registered apps
  - `clear()`: Reset registry (for testing)
- **globalRegistry**: Shared singleton instance for cross-module discovery
- **Error types**: `AppNotFoundError`, `DuplicateAppError`, `InvalidManifestError`
- **validateManifest()**: Runtime validation function with detailed error messages
- **Auto-registration**: Apps auto-register when their module is imported
  - `registerApp()` function is idempotent (safe to call multiple times)

**Files created/modified**:

- `packages/framework/protocol/src/registry.ts` — AppRegistry implementation
- `packages/framework/protocol/src/index.ts` — Export registry types
- `packages/framework/protocol/tests/registry.test.ts` — 28 comprehensive tests:
  - Registration (valid, duplicate, optional fields)
  - Get/tryGet/has queries
  - List operations
  - Manifest validation (all required/optional fields, error cases)
  - Global registry singleton behavior
- `packages/applications/blocks-cannons/src/index.ts` — Updated to use AppManifest type and auto-register
- `packages/applications/blocks-cannons/tests/app.test.ts` — Updated to verify registration

**Progress**:

- [x] Design AppRegistry and AppManifest interfaces
- [x] Implement AppRegistry in framework-protocol
- [x] Create blocks-cannons app manifest with proper typing
- [x] Add auto-registration on import
- [x] Add comprehensive registry tests
- [x] Run quality gate (npm run validate)

**Quality gate**: ✓ All 368 tests pass (31 new registry + app tests)

---

### Portion 6 — Lobby Multi-App (NEXT)