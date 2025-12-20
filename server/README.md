# Block Game Server

WebSocket game server for two-player block manipulation.

## Development

```bash
npm install
npm run dev        # Start with hot reload
```

## Quality Checks

```bash
npm run typecheck  # TypeScript type checking
npm run check      # Biome linting + formatting
npm run test       # Run tests in watch mode
npm run validate   # Run all checks (use before commits)
```

## Production

```bash
npm run build      # Compile to dist/
npm start          # Run production server
```

## Architecture

- `src/protocol/` - Zod message schemas for type-safe WebSocket communication
- `src/game/` - Game state management (immutable state pattern)
- `src/server.ts` - WebSocket server setup
- `tests/` - Vitest test files

