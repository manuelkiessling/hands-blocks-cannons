import { createServer, type Server } from 'node:http';
import { type WebSocket, WebSocketServer } from 'ws';
import { GameManager } from './game/GameManager.js';
import { InactivityMonitor } from './utils/InactivityMonitor.js';
import { logger } from './utils/logger.js';

export interface ServerConfig {
  port: number;
  host?: string;
  /** Callback invoked when the server should shut down due to inactivity */
  onInactivityShutdown?: (reason: string) => void;
}

export class BlockGameServer {
  private readonly httpServer: Server;
  private readonly wss: WebSocketServer;
  private readonly gameManager: GameManager;
  private readonly inactivityMonitor: InactivityMonitor | null;

  constructor(config: ServerConfig) {
    this.httpServer = createServer();
    this.wss = new WebSocketServer({ server: this.httpServer });
    this.gameManager = new GameManager();

    // Initialize inactivity monitor if shutdown callback is provided
    if (config.onInactivityShutdown) {
      this.inactivityMonitor = new InactivityMonitor({
        onShutdown: config.onInactivityShutdown,
      });
    } else {
      this.inactivityMonitor = null;
    }

    this.setupWebSocketHandlers();
    this.startServer(config);
  }

  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('New WebSocket connection');

      // Record connection for inactivity tracking
      this.inactivityMonitor?.recordConnection(true);

      this.gameManager.handleConnection(ws);

      ws.on('message', (data: Buffer) => {
        // Record activity for inactivity tracking
        this.inactivityMonitor?.recordActivity();
        this.gameManager.handleMessage(ws, data.toString());
      });

      ws.on('close', () => {
        // Record disconnection for inactivity tracking
        this.inactivityMonitor?.recordConnection(false);
        this.gameManager.handleDisconnection(ws);
      });

      ws.on('error', (error: Error) => {
        logger.error('WebSocket error', { error: error.message });
      });
    });
  }

  private startServer(config: ServerConfig): void {
    const host = config.host ?? '0.0.0.0';
    this.httpServer.listen(config.port, host, () => {
      logger.info('Server started', { port: config.port, host });
    });
  }

  close(): void {
    this.inactivityMonitor?.stop();
    this.wss.close();
    this.httpServer.close();
    logger.info('Server closed');
  }
}
