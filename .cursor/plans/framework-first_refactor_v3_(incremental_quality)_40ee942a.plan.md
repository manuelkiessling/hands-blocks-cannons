---
name: Framework-First Refactor v3 (Incremental Quality)
overview: Revise the refactor plan to enforce incremental changes with per-portion quality gates (tests/typecheck/lint) and incremental test-porting alongside code moves, avoiding a big-bang merge and late test run.
todos:
  - id: quality-gates-per-portion
    content: Make per-portion quality gates explicit and enforce that validate stays green after every portion; add narrow per-package gates where appropriate.
    status: pending
  - id: portion0-runtime-config
    content: Introduce runtime session config and remove domain hard-coding; add unit tests for config resolution.
    status: pending
    dependencies:
      - quality-gates-per-portion
  - id: portion1-scaffold-packages
    content: Scaffold packages/framework/* and packages/applications/* with smoke tests; update workspace globs.
    status: pending
    dependencies:
      - portion0-runtime-config
  - id: portion2-split-shared-with-tests
    content: Split shared into framework-level vs app-level and move corresponding tests incrementally with temporary compatibility re-exports.
    status: pending
    dependencies:
      - portion1-scaffold-packages
  - id: portion3-framework-server-with-conformance-tests
    content: Implement framework-server runtime and port server logic into blocks-cannons app; add framework-server conformance tests now.
    status: pending
    dependencies:
      - portion2-split-shared-with-tests
  - id: portion4-framework-client-with-tests
    content: Implement framework-client runtime and port client logic into blocks-cannons app; add framework-client lifecycle/dispatch tests now.
    status: pending
    dependencies:
      - portion2-split-shared-with-tests
  - id: portion5-app-registry
    content: Add application registry + bootstraps and tests ensuring new apps don’t require framework edits.
    status: pending
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

- Framework is app-agnostic; blocks-cannons is “just an app.”