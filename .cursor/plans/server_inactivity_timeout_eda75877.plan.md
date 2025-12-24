---
name: Server Inactivity Timeout
overview: Add an inactivity monitor to the game server that automatically terminates the process after 5 minutes of inactivity (no players connected OR no messages received), or if no player connects within 5 minutes of server start. This will cause the Docker container to exit and be cleaned up.
todos:
  - id: create-monitor
    content: Create InactivityMonitor class with timeout tracking and periodic checks
    status: completed
  - id: integrate-server
    content: Wire InactivityMonitor into BlockGameServer for activity/connection events
    status: completed
  - id: shutdown-callback
    content: Add shutdown callback in index.ts that exits the process
    status: completed
---

# Server Inactivity Timeout

## Architecture

```mermaid
flowchart TB
    subgraph server [BlockGameServer]
        InactivityMonitor
        GameManager
    end
    
    InactivityMonitor -->|"checks every 30s"| TimeoutCheck{Timeout reached?}
    TimeoutCheck -->|Yes| ProcessExit["process.exit(0)"]
    ProcessExit -->|triggers| ContainerExit["Container exits"]
    
    GameManager -->|"recordActivity()"| InactivityMonitor
    GameManager -->|"recordConnection()"| InactivityMonitor
```



## Implementation

### 1. Create InactivityMonitor class

Create new file [`packages/server/src/utils/InactivityMonitor.ts`](packages/server/src/utils/InactivityMonitor.ts):

- Track `lastActivityTime` (updated on any message)
- Track `connectionCount` (incremented/decremented on connect/disconnect)
- Track `hasEverConnected` flag
- Run a check interval (every 30 seconds)
- Support configurable timeout via `INACTIVITY_TIMEOUT_MS` env var (default: 300000ms = 5 min)
- Call shutdown callback when either condition met:
- No player has ever connected AND startup timeout reached
- No players connected AND last activity timeout reached

### 2. Integrate with BlockGameServer

Modify [`packages/server/src/server.ts`](packages/server/src/server.ts):

- Instantiate `InactivityMonitor` with shutdown callback
- Call `monitor.recordActivity()` when messages are received
- Call `monitor.recordConnection(true)` on new connections
- Call `monitor.recordConnection(false)` on disconnections
- Stop monitor in `close()` method

### 3. Shutdown handling

Modify [`packages/server/src/index.ts`](packages/server/src/index.ts):

- Pass shutdown callback that logs reason and calls `process.exit(0)`
- Container will exit automatically (entrypoint uses `wait -n`)

### 4. Configuration

Add to [`packages/server/config/game.yaml`](packages/server/config/game.yaml) (optional):

- Add `inactivityTimeout` setting with default 300000ms
- Or simply use environment variable `INACTIVITY_TIMEOUT_MS`