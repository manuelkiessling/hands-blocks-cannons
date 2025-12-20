import { type Server, createServer } from 'node:http';
import { type WebSocket, WebSocketServer } from 'ws';
import { GameManager } from './game/GameManager.js';
import { logger } from './utils/logger.js';

export interface ServerConfig {
  port: number;
  host?: string;
}

export class BlockGameServer {
  private readonly httpServer: Server;
  private readonly wss: WebSocketServer;
  private readonly gameManager: GameManager;

  constructor(config: ServerConfig) {
    this.httpServer = createServer();
    this.wss = new WebSocketServer({ server: this.httpServer });
    this.gameManager = new GameManager();

    this.setupWebSocketHandlers();
    this.startServer(config);
  }

  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('New WebSocket connection');

      this.gameManager.handleConnection(ws);

      ws.on('message', (data: Buffer) => {
        this.gameManager.handleMessage(ws, data.toString());
      });

      ws.on('close', () => {
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
    this.wss.close();
    this.httpServer.close();
    logger.info('Server closed');
  }
}
