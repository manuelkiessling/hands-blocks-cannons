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
import {
  CAMERA_DISTANCE,
  CANNON_AUTO_FIRE_INTERVAL_MS,
  type PlayerId,
  PROJECTILE_SIZE,
  TICK_RATE_MS,
  WALL_GRID_CONFIG,
} from './types.js';

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
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private lastTickTime: number = Date.now();
  private lastAutoFireTime: number = Date.now();

  constructor() {
    this.state = GameState.create();
    this.connections = new Map();
    this.nextPlayerId = 1;
    this.startGameLoop();
  }

  private startGameLoop(): void {
    this.lastTickTime = Date.now();
    this.lastAutoFireTime = Date.now();
    this.tickInterval = setInterval(() => this.tick(), TICK_RATE_MS);
    logger.info('Game loop started', {
      tickRateMs: TICK_RATE_MS,
      autoFireIntervalMs: CANNON_AUTO_FIRE_INTERVAL_MS,
    });
  }

  private tick(): void {
    const now = Date.now();
    const deltaTime = (now - this.lastTickTime) / 1000; // Convert to seconds
    this.lastTickTime = now;

    // Skip game logic if game hasn't started yet or game is finished
    if (this.state.gamePhase === 'waiting' || this.state.gamePhase === 'finished') {
      return;
    }

    // Auto-fire cannons if enabled
    if (CANNON_AUTO_FIRE_INTERVAL_MS > 0) {
      if (now - this.lastAutoFireTime >= CANNON_AUTO_FIRE_INTERVAL_MS) {
        this.autoFireAllCannons();
        this.lastAutoFireTime = now;
      }
    }

    // Update projectiles and check for collisions
    if (this.state.projectiles.size > 0) {
      const {
        state: newState,
        destroyedProjectileIds,
        destroyedBlocks,
        wallHits,
      } = this.state.updateProjectiles(deltaTime);
      this.state = newState;

      // Notify clients of destroyed projectiles
      for (const projectileId of destroyedProjectileIds) {
        this.broadcastToAll({
          type: 'projectile_destroyed',
          projectileId,
        });
      }

      // Notify clients of destroyed blocks (for explosion effects)
      for (const blockInfo of destroyedBlocks) {
        logger.info('Block destroyed by projectile', { blockId: blockInfo.blockId });
        this.broadcastToAll({
          type: 'block_destroyed',
          blockId: blockInfo.blockId,
          position: blockInfo.position,
          color: blockInfo.color,
        });
      }

      // Check for winner after block destruction
      if (destroyedBlocks.length > 0) {
        this.checkAndHandleWinner();
      }

      // Notify clients of wall hits (for grid visualization)
      if (WALL_GRID_CONFIG.enabled) {
        for (const wallHit of wallHits) {
          this.broadcastToAll({
            type: 'wall_hit',
            position: wallHit.position,
            wallSide: wallHit.wallSide,
          });
        }
      }

      // Periodically send projectile positions (every tick is fine for smooth movement)
      if (this.state.projectiles.size > 0) {
        this.broadcastToAll({
          type: 'projectiles_update',
          projectiles: this.state.getProjectilesArray(),
        });
      }
    }
  }

  /**
   * Auto-fire all cannons for all connected players
   */
  private autoFireAllCannons(): void {
    // Find all cannon blocks and fire them
    for (const block of this.state.blocks.values()) {
      if (block.blockType === 'cannon') {
        const { state: newState, projectile } = this.state.fireCannonAuto(block.id);
        if (projectile) {
          this.state = newState;
          // Notify all clients of the new projectile
          this.broadcastToAll({
            type: 'projectile_spawned',
            projectile,
          });
        }
      }
    }
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
      logger.info('Game loop stopped');
    }
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
      projectiles: this.state.getProjectilesArray(),
      room: this.state.config.room,
      cameraDistance: CAMERA_DISTANCE,
      wallGrid: WALL_GRID_CONFIG,
      projectileSize: PROJECTILE_SIZE,
      gamePhase: this.state.gamePhase,
    });

    // Get the new player's blocks to send to existing players
    const newPlayerBlocks = this.state
      .getBlocksArray()
      .filter((block) => block.ownerId === playerId);

    // Notify other player if exists, including new player's blocks
    this.broadcastToOthers(ws, { type: 'opponent_joined', blocks: newPlayerBlocks });
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
      logger.warn('Message from unknown connection', { rawData: rawData.substring(0, 100) });
      return;
    }

    const message = parseIncomingMessage(rawData);

    if (!message) {
      logger.warn('Failed to parse message', {
        rawData: rawData.substring(0, 100),
        playerId: connection.playerId,
      });
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

    // Handle play_again_vote separately
    if (message.type === 'play_again_vote') {
      logger.info('Routing play_again_vote to handler', { playerId: connection.playerId });
      this.handlePlayAgainVote(connection.playerId);
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

    // Check if game should start after processing the message
    this.checkAndStartGame();
  }

  /**
   * Check if all human players are ready and start the game if so.
   * Only starts the game if we're in the 'waiting' phase.
   */
  private checkAndStartGame(): void {
    if (this.state.gamePhase !== 'waiting') {
      return; // Only start from waiting phase
    }

    if (this.state.areAllHumansReady()) {
      logger.info('All humans ready, starting game!');
      this.state = this.state.startGame();
      this.broadcastToAll({ type: 'game_started' });
    }
  }

  /**
   * Check if there's a winner and handle game over.
   */
  private checkAndHandleWinner(): void {
    const winner = this.state.checkForWinner();
    if (!winner) return;

    logger.info('Game over!', { winnerId: winner.winnerId, winnerNumber: winner.winnerNumber });

    // Transition to finished phase
    this.state = this.state.setGamePhase('finished');

    // Broadcast game over to all players
    this.broadcastToAll({
      type: 'game_over',
      winnerId: winner.winnerId,
      winnerNumber: winner.winnerNumber,
      reason: 'blocks_destroyed',
    });
  }

  /**
   * Handle a play again vote from a player.
   * @param playerId - ID of the player voting
   */
  handlePlayAgainVote(playerId: PlayerId): void {
    // Log all connected players for debugging
    const connectedPlayerIds = Array.from(this.connections.values()).map((c) => c.playerId);
    const statePlayers = Array.from(this.state.players.values()).map((p) => ({
      id: p.id,
      wantsPlayAgain: p.wantsPlayAgain,
    }));

    logger.info('Received play again vote', {
      playerId,
      currentPhase: this.state.gamePhase,
      currentVoters: this.state.getPlayAgainVoters(),
      playerCount: this.state.getPlayerCount(),
      connectedPlayerIds,
      statePlayers,
    });

    // Check if player exists in state
    const player = this.state.getPlayer(playerId);
    if (!player) {
      logger.error('Play again vote from unknown player!', {
        playerId,
        connectedPlayerIds,
        statePlayers,
      });
      return;
    }

    if (this.state.gamePhase !== 'finished') {
      logger.warn('Play again vote ignored - game not finished', {
        playerId,
        phase: this.state.gamePhase,
      });
      return;
    }

    // Record the vote
    const previousVoters = this.state.getPlayAgainVoters();
    this.state = this.state.markPlayerWantsPlayAgain(playerId);
    const newVoters = this.state.getPlayAgainVoters();

    // Check if vote was actually recorded
    const voteRecorded = newVoters.length > previousVoters.length;

    logger.info('Player voted to play again', {
      playerId,
      previousVoters,
      newVoters,
      voteRecorded,
      totalPlayers: this.state.getPlayerCount(),
      allWantPlayAgain: this.state.allPlayersWantPlayAgain(),
    });

    // Broadcast vote status to all players
    this.broadcastToAll({
      type: 'play_again_status',
      votedPlayerIds: this.state.getPlayAgainVoters(),
      totalPlayers: this.state.getPlayerCount(),
    });

    // Check if all players want to play again
    if (this.state.allPlayersWantPlayAgain()) {
      logger.info('All players want to play again - triggering reset');
      this.resetGame();
    } else {
      logger.info('Not all players voted yet', {
        voters: this.state.getPlayAgainVoters(),
        totalPlayers: this.state.getPlayerCount(),
      });
    }
  }

  /**
   * Reset the game for a new round.
   */
  private resetGame(): void {
    logger.info('All players voted to play again - resetting game');

    // Reset game state
    this.state = this.state.resetForNewRound();

    // Broadcast reset with fresh block positions
    this.broadcastToAll({
      type: 'game_reset',
      blocks: this.state.getBlocksArray(),
    });
  }

  /**
   * Send a message to a specific player by their ID.
   */
  sendToPlayer(playerId: PlayerId, message: ServerMessage): void {
    for (const [ws, connection] of this.connections) {
      if (connection.playerId === playerId) {
        sendMessage(ws, message);
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
