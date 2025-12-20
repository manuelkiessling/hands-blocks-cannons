import type { WebSocket } from 'ws';
import {
  type ConnectionContext,
  handleMessage,
  parseIncomingMessage,
  sendMessage,
} from '../protocol/handlers.js';
import type { ServerMessage } from '../protocol/messages.js';
import { logger } from '../utils/logger.js';
import { GameState } from './GameState.js';
import type { PlayerId } from './types.js';

interface PlayerConnection {
  ws: WebSocket;
  playerId: PlayerId;
}

/**
 * Manages the game room, player connections, and state synchronization.
 * Currently supports a single game room with two players.
 */
export class GameManager {
  private state: GameState;
  private readonly connections: Map<WebSocket, PlayerConnection>;
  private nextPlayerId: number;

  constructor() {
    this.state = GameState.create();
    this.connections = new Map();
    this.nextPlayerId = 1;
  }

  handleConnection(ws: WebSocket): void {
    const playerNumber = this.state.getNextPlayerNumber();

    if (playerNumber === null) {
      // Game is full
      sendMessage(ws, {
        type: 'error',
        message: 'Game is full. Only 2 players allowed.',
      });
      ws.close();
      return;
    }

    const playerId = `player-${this.nextPlayerId++}`;

    // Add player to state
    this.state = this.state.addPlayer(playerId, playerNumber);

    // Track connection
    this.connections.set(ws, { ws, playerId });

    logger.info('Player joined', { playerId, playerNumber });

    // Send welcome message with initial state and room bounds
    sendMessage(ws, {
      type: 'welcome',
      playerId,
      playerNumber,
      blocks: this.state.getBlocksArray(),
      room: this.state.config.room,
    });

    // Notify other player if exists
    this.broadcastToOthers(ws, { type: 'opponent_joined' });
  }

  handleDisconnection(ws: WebSocket): void {
    const connection = this.connections.get(ws);

    if (!connection) {
      return;
    }

    const { playerId } = connection;

    logger.info('Player disconnected', { playerId });

    // Remove player from state
    this.state = this.state.removePlayer(playerId);

    // Remove connection tracking
    this.connections.delete(ws);

    // Notify other player
    this.broadcastToOthers(ws, { type: 'opponent_left' });
  }

  handleMessage(ws: WebSocket, rawData: string): void {
    const connection = this.connections.get(ws);

    if (!connection) {
      logger.warn('Message from unknown connection');
      return;
    }

    const message = parseIncomingMessage(rawData);

    if (!message) {
      sendMessage(ws, {
        type: 'error',
        message: 'Invalid message format',
      });
      return;
    }

    // Handle join_game separately (already handled in handleConnection)
    if (message.type === 'join_game') {
      return;
    }

    const context: ConnectionContext = {
      ws,
      playerId: connection.playerId,
    };

    const result = handleMessage(message, context, this.state);

    // Update state
    this.state = result.newState;

    // Send responses
    for (const response of result.responses) {
      switch (response.target) {
        case 'sender':
          sendMessage(ws, response.message);
          break;
        case 'opponent':
          this.broadcastToOthers(ws, response.message);
          break;
        case 'all':
          this.broadcastToAll(response.message);
          break;
      }
    }
  }

  private broadcastToOthers(senderWs: WebSocket, message: ServerMessage): void {
    for (const [ws] of this.connections) {
      if (ws !== senderWs) {
        sendMessage(ws, message);
      }
    }
  }

  private broadcastToAll(message: ServerMessage): void {
    for (const [ws] of this.connections) {
      sendMessage(ws, message);
    }
  }

  // For testing
  getState(): GameState {
    return this.state;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}
