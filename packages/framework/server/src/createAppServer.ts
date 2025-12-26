/**
 * @fileoverview Factory function to create a gesture app WebSocket server.
 *
 * Reduces boilerplate for creating app servers by encapsulating:
 * - WebSocketServer setup
 * - Connection handling
 * - Message routing
 * - Graceful shutdown
 */

import type { AppHooks, Connection, SessionRuntimeConfig } from './SessionRuntime.js';
import { SessionRuntime } from './SessionRuntime.js';

/**
 * Configuration for creating an app server.
 */
export interface AppServerConfig<
  TAppClientMessage extends { type: string },
  TAppServerMessage extends { type: string },
  TWelcomeData,
  TResetData = undefined,
  TOpponentJoinedData = undefined,
  TSessionEndedData = undefined,
> {
  /** Port to listen on (default: 3001, or PORT env var) */
  readonly port?: number;

  /** Runtime configuration (tick settings, etc.) */
  readonly runtimeConfig: SessionRuntimeConfig;

  /** Application hooks implementation */
  readonly hooks: AppHooks<
    TAppClientMessage,
    TAppServerMessage,
    TWelcomeData,
    TResetData,
    TOpponentJoinedData,
    TSessionEndedData
  >;

  /** Serialize server messages to string (default: JSON.stringify) */
  readonly serializer?: (message: TAppServerMessage | object) => string;

  /** Parse client messages from string (default: JSON.parse with type check) */
  readonly parser: (data: string) => TAppClientMessage | null;

  /** Optional logger */
  readonly logger?: {
    info: (message: string, data?: object) => void;
    error: (message: string, data?: object) => void;
  };
}

/**
 * Running app server instance.
 */
export interface AppServer<
  TAppClientMessage extends { type: string } = { type: string },
  TAppServerMessage extends { type: string } = { type: string },
  TWelcomeData = unknown,
  TResetData = unknown,
  TOpponentJoinedData = unknown,
  TSessionEndedData = unknown,
> {
  /** The underlying SessionRuntime */
  readonly runtime: SessionRuntime<
    TAppClientMessage,
    TAppServerMessage,
    TWelcomeData,
    TResetData,
    TOpponentJoinedData,
    TSessionEndedData
  >;

  /** Stop the server gracefully */
  stop(): Promise<void>;

  /** Port the server is listening on */
  readonly port: number;
}

/**
 * WebSocket interface for type compatibility.
 * Apps can pass ws.WebSocket instances directly.
 */
interface WebSocketLike extends Connection {
  on(event: 'message', callback: (data: Buffer | string) => void): void;
  on(event: 'close', callback: () => void): void;
  on(event: 'error', callback: (error: unknown) => void): void;
}

interface WebSocketServerLike {
  on(event: 'connection', callback: (ws: WebSocketLike) => void): void;
  close(callback?: () => void): void;
  emit?(event: string): void;
}

interface WebSocketServerConstructor {
  new (options: { port: number }): WebSocketServerLike;
}

/**
 * Create and start an app server with minimal boilerplate.
 *
 * @example
 * ```typescript
 * import { createAppServer } from '@gesture-app/framework-server';
 * import { WebSocketServer } from 'ws';
 *
 * const server = await createAppServer({
 *   port: 3001,
 *   runtimeConfig: { maxParticipants: 2, tickEnabled: false, tickIntervalMs: 16 },
 *   hooks: new MyAppHooks(),
 *   parser: (data) => parseClientMessage(JSON.parse(data)),
 *   WebSocketServer,
 * });
 *
 * // Later: graceful shutdown
 * await server.stop();
 * ```
 */
export function createAppServer<
  TAppClientMessage extends { type: string },
  TAppServerMessage extends { type: string },
  TWelcomeData,
  TResetData = undefined,
  TOpponentJoinedData = undefined,
  TSessionEndedData = undefined,
>(
  config: AppServerConfig<
    TAppClientMessage,
    TAppServerMessage,
    TWelcomeData,
    TResetData,
    TOpponentJoinedData,
    TSessionEndedData
  >,
  WebSocketServerClass: WebSocketServerConstructor
): AppServer<
  TAppClientMessage,
  TAppServerMessage,
  TWelcomeData,
  TResetData,
  TOpponentJoinedData,
  TSessionEndedData
> {
  // biome-ignore lint/complexity/useLiteralKeys: Required for noPropertyAccessFromIndexSignature
  const port = config.port ?? (Number(process.env['PORT']) || 3001);
  const logger = config.logger ?? {
    info: (msg: string, data?: object) => console.log(`[AppServer] ${msg}`, data ?? ''),
    error: (msg: string, data?: object) => console.error(`[AppServer] ${msg}`, data ?? ''),
  };
  const serializer = config.serializer ?? ((msg: object) => JSON.stringify(msg));

  logger.info(`Starting server on port ${port}...`);

  // Create runtime
  const runtime = new SessionRuntime<
    TAppClientMessage,
    TAppServerMessage,
    TWelcomeData,
    TResetData,
    TOpponentJoinedData,
    TSessionEndedData
  >(config.runtimeConfig, config.hooks, serializer as (message: unknown) => string, config.parser);

  // Create WebSocket server
  const wss = new WebSocketServerClass({ port });

  logger.info(`WebSocket server listening on port ${port}`);

  // Handle connections
  wss.on('connection', (ws: WebSocketLike) => {
    const participant = runtime.handleConnection(ws as unknown as Connection);
    if (!participant) return;

    // Emit event for testing
    wss.emit?.('connection_handled');

    ws.on('message', (data: Buffer | string) => {
      const message = typeof data === 'string' ? data : data.toString();
      runtime.handleMessage(ws as unknown as Connection, message);
    });

    ws.on('close', () => {
      runtime.handleDisconnection(ws as unknown as Connection);
    });

    ws.on('error', (error: unknown) => {
      logger.error('WebSocket error', { error });
    });
  });

  // Setup graceful shutdown handlers
  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down...');
    runtime.stop();

    return new Promise((resolve) => {
      wss.close(() => {
        logger.info('Server stopped');
        resolve();
      });
    });
  };

  // Register signal handlers
  const handleSignal = (signal: string) => {
    logger.info(`${signal} received`);
    shutdown().then(() => process.exit(0));
  };

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));

  return {
    runtime,
    port,
    stop: shutdown,
  };
}
