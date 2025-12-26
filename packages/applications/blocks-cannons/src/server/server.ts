/**
 * @fileoverview Blocks & Cannons standalone WebSocket server.
 *
 * A game server that manages the game state and broadcasts updates to connected clients.
 * Supports 2 players (human or bot) and handles the full game lifecycle.
 */

import { randomUUID } from 'node:crypto';
import { type WebSocket, WebSocketServer } from 'ws';
import type { Block, ClientMessage, Position, ServerMessage } from '../shared/index.js';
import { parseClientMessage, serializeServerMessage } from '../shared/protocol.js';
import { GameState } from './game/GameState.js';
import {
  CAMERA_DISTANCE,
  CANNON_AUTO_FIRE_INTERVAL_MS,
  DEFAULT_ROOM,
  PROJECTILE_SIZE,
  TICK_RATE_MS,
  WALL_GRID_CONFIG,
} from './game/types.js';
import { InactivityMonitor } from './utils/InactivityMonitor.js';
import { logger } from './utils/logger.js';

// biome-ignore lint/complexity/useLiteralKeys: Required for noPropertyAccessFromIndexSignature
const PORT = Number(process.env['PORT']) || 3001;

// ============ Types ============

interface ConnectedClient {
  ws: WebSocket;
  playerId: string;
  playerNumber: 1 | 2;
  isBot: boolean;
}

// ============ Server State ============

let gameState = GameState.create();
const clients = new Map<WebSocket, ConnectedClient>();
let gameLoopInterval: ReturnType<typeof setInterval> | null = null;
let autoFireInterval: ReturnType<typeof setInterval> | null = null;
let lastTickTime = Date.now();

// Inactivity monitor for auto-shutdown
const inactivityMonitor = new InactivityMonitor({
  onShutdown: () => {
    logger.info('Inactivity timeout reached, shutting down server...');
    stopGameLoop();
    wss.close(() => {
      process.exit(0);
    });
  },
});

// ============ Broadcast Helpers ============

function broadcast(message: ServerMessage, excludeWs?: WebSocket): void {
  const data = serializeServerMessage(message);
  for (const [ws, _client] of clients) {
    if (ws !== excludeWs && ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

function sendTo(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(serializeServerMessage(message));
  }
}

function getBlocksArray(): Block[] {
  return Array.from(gameState.blocks.values()).map((block) => ({
    id: block.id,
    position: block.position,
    color: block.color,
    ownerId: block.ownerId,
    blockType: block.blockType,
  }));
}

function getPlayerBlocksArray(playerId: string): Block[] {
  return getBlocksArray().filter((b) => b.ownerId === playerId);
}

// ============ Game Loop ============

function startGameLoop(): void {
  if (gameLoopInterval) return;

  lastTickTime = Date.now();

  // Main game tick - update projectiles
  gameLoopInterval = setInterval(() => {
    if (gameState.gamePhase !== 'playing') return;

    const now = Date.now();
    const deltaTime = (now - lastTickTime) / 1000; // Convert to seconds
    lastTickTime = now;

    // Update projectiles
    const result = gameState.updateProjectiles(deltaTime);
    gameState = result.state;

    // Broadcast projectile positions
    if (gameState.projectiles.size > 0) {
      const projectiles = Array.from(gameState.projectiles.values()).map((p) => ({
        id: p.id,
        position: p.position,
        velocity: p.velocity,
        ownerId: p.ownerId,
        color: p.color,
      }));
      broadcast({ type: 'projectiles_update', projectiles });
    }

    // Broadcast destroyed projectiles
    for (const projectileId of result.destroyedProjectileIds) {
      broadcast({ type: 'projectile_destroyed', projectileId });
    }

    // Broadcast destroyed blocks and check for game over
    for (const destroyed of result.destroyedBlocks) {
      broadcast({
        type: 'block_destroyed',
        blockId: destroyed.blockId,
        position: destroyed.position,
        color: destroyed.color,
      });
    }

    // Broadcast wall hits
    for (const hit of result.wallHits) {
      broadcast({
        type: 'wall_hit',
        position: hit.position,
        wallSide: hit.wallSide,
      });
    }

    // Check for game over
    checkGameOver();

    // Record activity
    inactivityMonitor.recordActivity();
  }, TICK_RATE_MS);

  // Auto-fire cannons
  if (CANNON_AUTO_FIRE_INTERVAL_MS > 0) {
    autoFireInterval = setInterval(() => {
      if (gameState.gamePhase !== 'playing') return;

      // Fire all cannons
      for (const block of gameState.blocks.values()) {
        if (block.blockType === 'cannon') {
          const result = gameState.fireCannonAuto(block.id);
          gameState = result.state;

          if (result.projectile) {
            broadcast({
              type: 'projectile_spawned',
              projectile: {
                id: result.projectile.id,
                position: result.projectile.position,
                velocity: result.projectile.velocity,
                ownerId: result.projectile.ownerId,
                color: result.projectile.color,
              },
            });
          }
        }
      }
    }, CANNON_AUTO_FIRE_INTERVAL_MS);
  }

  logger.info('Game loop started');
}

function stopGameLoop(): void {
  if (gameLoopInterval) {
    clearInterval(gameLoopInterval);
    gameLoopInterval = null;
  }
  if (autoFireInterval) {
    clearInterval(autoFireInterval);
    autoFireInterval = null;
  }
  logger.info('Game loop stopped');
}

function checkGameOver(): void {
  if (gameState.gamePhase !== 'playing') return;

  // Check if any player has lost all non-cannon blocks
  for (const player of gameState.players.values()) {
    const playerBlocks = Array.from(gameState.blocks.values()).filter(
      (b) => b.ownerId === player.id && b.blockType !== 'cannon'
    );

    if (playerBlocks.length === 0) {
      // This player lost - find the winner
      const winner = Array.from(gameState.players.values()).find((p) => p.id !== player.id);
      if (winner) {
        gameState = gameState.setGamePhase('finished');
        broadcast({
          type: 'game_over',
          winnerId: winner.id,
          winnerNumber: winner.number,
          reason: 'blocks_destroyed',
        });
        logger.info(`Game over! Player ${winner.number} wins`);
      }
      break;
    }
  }
}

function checkAllPlayersReady(): void {
  if (gameState.gamePhase !== 'waiting') return;
  if (gameState.players.size < 2) return;

  // Check if all human players are ready
  const allReady = Array.from(gameState.players.values()).every((p) => p.isBot || p.isReady);

  if (allReady) {
    gameState = gameState.startGame();
    broadcast({ type: 'game_started' });
    logger.info('All players ready - game started!');
  }
}

function checkPlayAgainVotes(): void {
  if (gameState.gamePhase !== 'finished') return;

  const players = Array.from(gameState.players.values());
  const votedCount = players.filter((p) => p.wantsPlayAgain).length;

  // Broadcast status
  broadcast({
    type: 'play_again_status',
    votedPlayerIds: players.filter((p) => p.wantsPlayAgain).map((p) => p.id),
    totalPlayers: players.length,
  });

  // If all voted, reset the game
  if (votedCount === players.length && players.length >= 2) {
    gameState = gameState.resetForNewRound();
    broadcast({
      type: 'game_reset',
      blocks: getBlocksArray(),
    });
    logger.info('All players voted to play again - game reset!');
  }
}

// ============ Message Handlers ============

function handleMessage(ws: WebSocket, message: ClientMessage): void {
  const client = clients.get(ws);
  if (!client) return;

  inactivityMonitor.recordActivity();

  switch (message.type) {
    case 'join_game':
      // Already handled on connection
      break;

    case 'block_grab': {
      const result = gameState.grabBlock(client.playerId, message.blockId);
      gameState = result.state;

      if (result.releasedBlockId) {
        broadcast({
          type: 'block_released',
          playerId: client.playerId,
          blockId: result.releasedBlockId,
        });
      }

      broadcast({
        type: 'block_grabbed',
        playerId: client.playerId,
        blockId: message.blockId,
      });
      break;
    }

    case 'block_move': {
      const result = gameState.moveBlock(message.blockId, message.position);
      gameState = result.state;

      broadcast({
        type: 'block_moved',
        playerId: client.playerId,
        blockId: message.blockId,
        position: message.position,
      });

      // Broadcast pushed blocks
      for (const pushed of result.pushedBlocks) {
        broadcast({
          type: 'block_moved',
          playerId: client.playerId,
          blockId: pushed.id,
          position: pushed.position,
        });
      }
      break;
    }

    case 'block_release': {
      gameState = gameState.releaseBlock(client.playerId, message.blockId);
      broadcast({
        type: 'block_released',
        playerId: client.playerId,
        blockId: message.blockId,
      });
      break;
    }

    case 'cannon_fire': {
      const result = gameState.fireCannon(client.playerId, message.cannonId);
      gameState = result.state;

      if (result.projectile) {
        broadcast({
          type: 'projectile_spawned',
          projectile: {
            id: result.projectile.id,
            position: result.projectile.position,
            velocity: result.projectile.velocity,
            ownerId: result.projectile.ownerId,
            color: result.projectile.color,
          },
        });
      }
      break;
    }

    case 'bot_identify': {
      client.isBot = true;
      gameState = gameState.markPlayerAsBot(client.playerId);
      logger.info(`Player ${client.playerNumber} identified as bot`);
      // Bots are always ready
      gameState = gameState.markPlayerReady(client.playerId);
      checkAllPlayersReady();
      break;
    }

    case 'player_ready': {
      gameState = gameState.markPlayerReady(client.playerId);
      logger.info(`Player ${client.playerNumber} is ready`);
      checkAllPlayersReady();
      break;
    }

    case 'play_again_vote': {
      gameState = gameState.markPlayerWantsPlayAgain(client.playerId);
      logger.info(`Player ${client.playerNumber} voted to play again`);
      checkPlayAgainVotes();
      break;
    }
  }
}

// ============ Connection Handlers ============

function handleConnection(ws: WebSocket): void {
  // Check if we have room for another player
  if (clients.size >= 2) {
    sendTo(ws, { type: 'error', message: 'Game is full' });
    ws.close();
    return;
  }

  // Assign player number
  const existingNumbers = new Set(Array.from(clients.values()).map((c) => c.playerNumber));
  const playerNumber: 1 | 2 = existingNumbers.has(1) ? 2 : 1;
  const playerId = randomUUID();

  // Add player to game state
  gameState = gameState.addPlayer(playerId, playerNumber);

  // Store client
  const client: ConnectedClient = {
    ws,
    playerId,
    playerNumber,
    isBot: false,
  };
  clients.set(ws, client);

  logger.info(`Player ${playerNumber} connected (${playerId})`);

  // Send welcome message
  sendTo(ws, {
    type: 'welcome',
    playerId,
    playerNumber,
    blocks: getBlocksArray(),
    projectiles: Array.from(gameState.projectiles.values()).map((p) => ({
      id: p.id,
      position: p.position,
      velocity: p.velocity,
      ownerId: p.ownerId,
      color: p.color,
    })),
    room: DEFAULT_ROOM,
    cameraDistance: CAMERA_DISTANCE,
    wallGrid: WALL_GRID_CONFIG,
    projectileSize: PROJECTILE_SIZE,
    gamePhase: gameState.gamePhase,
  });

  // Notify other players
  broadcast(
    {
      type: 'opponent_joined',
      blocks: getPlayerBlocksArray(playerId),
    },
    ws
  );

  // Start game loop if we have 2 players
  if (clients.size === 2) {
    startGameLoop();
  }

  inactivityMonitor.recordConnection(true);
}

function handleDisconnection(ws: WebSocket): void {
  const client = clients.get(ws);
  if (!client) return;

  logger.info(`Player ${client.playerNumber} disconnected`);

  // Remove player from game state
  gameState = gameState.removePlayer(client.playerId);
  clients.delete(ws);

  // Track disconnection for inactivity monitor
  inactivityMonitor.recordConnection(false);

  // Notify other players
  broadcast({ type: 'opponent_left' });

  // Stop game loop if not enough players
  if (clients.size < 2) {
    stopGameLoop();
    // Reset game phase to waiting
    if (gameState.gamePhase === 'playing') {
      gameState = gameState.setGamePhase('waiting');
    }
  }
}

// ============ Server Setup ============

logger.info('Starting Blocks & Cannons server...');

const wss = new WebSocketServer({ port: PORT });

logger.info(`WebSocket server listening on port ${PORT}`);

wss.on('connection', (ws: WebSocket) => {
  handleConnection(ws);

  ws.on('message', (data: Buffer) => {
    try {
      const parsed = JSON.parse(data.toString()) as unknown;
      const message = parseClientMessage(parsed);
      if (message) {
        handleMessage(ws, message);
      } else {
        logger.warn('Invalid message received', { raw: data.toString().slice(0, 100) });
      }
    } catch (error) {
      logger.error('Failed to parse message', { error });
    }
  });

  ws.on('close', () => {
    handleDisconnection(ws);
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error', { error });
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  inactivityMonitor.stop();
  stopGameLoop();
  wss.close(() => {
    logger.info('Server stopped');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down...');
  inactivityMonitor.stop();
  stopGameLoop();
  wss.close(() => {
    process.exit(0);
  });
});
