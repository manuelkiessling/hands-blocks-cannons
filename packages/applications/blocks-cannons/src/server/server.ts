/**
 * @fileoverview Blocks & Cannons server powered by framework createAppServer.
 *
 * Uses the framework's built-in inactivity monitoring for automatic
 * container cleanup when idle.
 */

import { randomUUID } from 'node:crypto';
import type {
  ParticipantId,
  ParticipantNumber,
  SessionEndedReason,
} from '@gesture-app/framework-protocol';
import {
  type AppHooks,
  createAppServer,
  DEFAULT_RUNTIME_CONFIG,
  type MessageResponse,
  type SessionRuntimeConfig,
} from '@gesture-app/framework-server';
import { WebSocketServer } from 'ws';
import {
  type ServerMessage as AppServerMessage,
  type BlocksOpponentJoinedData,
  type BlocksResetData,
  type BlocksSessionEndedData,
  type BlocksWelcomeData,
  type ClientMessage,
  parseClientMessage,
} from '../shared/protocol.js';
import { GameState } from './game/GameState.js';
import {
  CAMERA_DISTANCE,
  DEFAULT_ROOM,
  INACTIVITY_CHECK_INTERVAL_MS,
  INACTIVITY_TIMEOUT_MS,
  PROJECTILE_SIZE,
  TICK_RATE_MS,
  WALL_GRID_CONFIG,
} from './game/types.js';
import { logger } from './utils/logger.js';

interface RuntimeConfig extends SessionRuntimeConfig {
  /** Enable cannon auto fire loop */
  tickIntervalMs: number;
}

const RUNTIME_CONFIG: RuntimeConfig = {
  ...DEFAULT_RUNTIME_CONFIG,
  tickEnabled: true,
  tickIntervalMs: TICK_RATE_MS,
};

/**
 * Application hooks implementation for Blocks & Cannons.
 */
class BlocksCannonsHooks
  implements
    AppHooks<
      ClientMessage,
      AppServerMessage,
      BlocksWelcomeData,
      BlocksResetData,
      BlocksOpponentJoinedData,
      BlocksSessionEndedData
    >
{
  constructor(private gameState: GameState) {}

  generateParticipantId(participantNumber: ParticipantNumber): ParticipantId {
    return `player-${participantNumber}-${randomUUID()}`;
  }

  onParticipantJoin(participant: {
    id: ParticipantId;
    number: ParticipantNumber;
  }): BlocksWelcomeData {
    this.gameState = this.gameState.addPlayer(participant.id, participant.number);

    return {
      blocks: this.getBlocksArray(),
      projectiles: this.getProjectilesArray(),
      room: DEFAULT_ROOM,
      cameraDistance: CAMERA_DISTANCE,
      wallGrid: WALL_GRID_CONFIG,
      projectileSize: PROJECTILE_SIZE,
      gamePhase: this.gameState.gamePhase,
    };
  }

  onParticipantLeave(participantId: ParticipantId): void {
    this.gameState = this.gameState.removePlayer(participantId);
  }

  onOpponentJoined(joiningParticipant: {
    id: ParticipantId;
    number: ParticipantNumber;
  }): BlocksOpponentJoinedData {
    return {
      blocks: this.getPlayerBlocksArray(joiningParticipant.id),
    };
  }

  onMessage(
    message: ClientMessage,
    senderId: ParticipantId,
    _phase: 'waiting' | 'playing' | 'finished'
  ): MessageResponse<AppServerMessage>[] {
    switch (message.type) {
      case 'block_grab': {
        const result = this.gameState.grabBlock(senderId, message.blockId);
        this.gameState = result.state;

        const responses: MessageResponse<AppServerMessage>[] = [
          {
            target: 'all',
            message: {
              type: 'block_grabbed',
              playerId: senderId,
              blockId: message.blockId,
            },
          },
        ];

        if (result.releasedBlockId) {
          responses.push({
            target: 'all',
            message: {
              type: 'block_released',
              playerId: senderId,
              blockId: result.releasedBlockId,
            },
          });
        }

        return responses;
      }

      case 'block_move': {
        const result = this.gameState.moveBlock(message.blockId, message.position);
        this.gameState = result.state;

        const responses: MessageResponse<AppServerMessage>[] = [
          {
            target: 'all',
            message: {
              type: 'block_moved',
              playerId: senderId,
              blockId: message.blockId,
              position: message.position,
            },
          },
        ];

        for (const pushed of result.pushedBlocks) {
          responses.push({
            target: 'all',
            message: {
              type: 'block_moved',
              playerId: senderId,
              blockId: pushed.id,
              position: pushed.position,
            },
          });
        }
        return responses;
      }

      case 'block_release': {
        this.gameState = this.gameState.releaseBlock(senderId, message.blockId);
        return [
          {
            target: 'all',
            message: {
              type: 'block_released',
              playerId: senderId,
              blockId: message.blockId,
            },
          },
        ];
      }

      case 'cannon_fire': {
        const result = this.gameState.fireCannon(senderId, message.cannonId);
        this.gameState = result.state;

        const responses: MessageResponse<AppServerMessage>[] = [];
        if (result.projectile) {
          responses.push({
            target: 'all',
            message: {
              type: 'projectile_spawned',
              projectile: {
                id: result.projectile.id,
                position: result.projectile.position,
                velocity: result.projectile.velocity,
                ownerId: result.projectile.ownerId,
                color: result.projectile.color,
              },
            },
          });
        }
        return responses;
      }
    }

    return [];
  }

  onSessionStart(): void {
    // Transition game state to playing phase
    this.gameState = this.gameState.setGamePhase('playing');
  }

  onReset(): BlocksResetData {
    this.gameState = this.gameState.resetForNewRound();
    return {
      blocks: this.getBlocksArray(),
    };
  }

  onSessionEnd(info: {
    winnerId: ParticipantId;
    winnerNumber: ParticipantNumber;
    reason: SessionEndedReason;
  }): BlocksSessionEndedData | undefined {
    if (info.reason === 'app_condition') {
      return { appReason: 'blocks_destroyed' };
    }
  }

  onTick(deltaTime: number): AppServerMessage[] {
    const messages: AppServerMessage[] = [];

    // Auto-fire all cannons that are off cooldown
    for (const block of this.gameState.blocks.values()) {
      if (block.blockType === 'cannon') {
        const fireResult = this.gameState.fireCannonAuto(block.id);
        if (fireResult.projectile) {
          this.gameState = fireResult.state;
          messages.push({
            type: 'projectile_spawned',
            projectile: {
              id: fireResult.projectile.id,
              position: fireResult.projectile.position,
              velocity: fireResult.projectile.velocity,
              ownerId: fireResult.projectile.ownerId,
              color: fireResult.projectile.color,
            },
          });
        }
      }
    }

    // Update projectiles
    const result = this.gameState.updateProjectiles(deltaTime);
    this.gameState = result.state;

    if (this.gameState.projectiles.size > 0) {
      const projectiles = Array.from(this.gameState.projectiles.values()).map((p) => ({
        id: p.id,
        position: p.position,
        velocity: p.velocity,
        ownerId: p.ownerId,
        color: p.color,
      }));
      messages.push({ type: 'projectiles_update', projectiles });
    }

    for (const projectileId of result.destroyedProjectileIds) {
      messages.push({ type: 'projectile_destroyed', projectileId });
    }

    for (const destroyed of result.destroyedBlocks) {
      messages.push({
        type: 'block_destroyed',
        blockId: destroyed.blockId,
        position: destroyed.position,
        color: destroyed.color,
      });
    }

    for (const hit of result.wallHits) {
      messages.push({
        type: 'wall_hit',
        position: hit.position,
        wallSide: hit.wallSide,
      });
    }

    return messages;
  }

  checkSessionEnd(): {
    winnerId: ParticipantId;
    winnerNumber: ParticipantNumber;
    appData?: BlocksSessionEndedData;
  } | null {
    if (this.gameState.gamePhase !== 'playing') return null;

    for (const player of this.gameState.players.values()) {
      const playerBlocks = Array.from(this.gameState.blocks.values()).filter(
        (b) => b.ownerId === player.id && b.blockType !== 'cannon'
      );

      if (playerBlocks.length === 0) {
        const winner = Array.from(this.gameState.players.values()).find((p) => p.id !== player.id);
        if (winner) {
          this.gameState = this.gameState.setGamePhase('finished');
          return {
            winnerId: winner.id,
            winnerNumber: winner.number,
            appData: { appReason: 'blocks_destroyed' },
          };
        }
      }
    }

    return null;
  }

  private getBlocksArray() {
    return Array.from(this.gameState.blocks.values()).map((block) => ({
      id: block.id,
      position: block.position,
      color: block.color,
      ownerId: block.ownerId,
      blockType: block.blockType,
    }));
  }

  private getProjectilesArray() {
    return Array.from(this.gameState.projectiles.values()).map((p) => ({
      id: p.id,
      position: p.position,
      velocity: p.velocity,
      ownerId: p.ownerId,
      color: p.color,
    }));
  }

  private getPlayerBlocksArray(playerId: string) {
    return this.getBlocksArray().filter((b) => b.ownerId === playerId);
  }
}

// ============ Server Setup ============

logger.info('Starting Blocks & Cannons server...');

const hooks = new BlocksCannonsHooks(GameState.create());

// Create server with built-in inactivity monitoring
createAppServer<
  ClientMessage,
  AppServerMessage,
  BlocksWelcomeData,
  BlocksResetData,
  BlocksOpponentJoinedData,
  BlocksSessionEndedData
>(
  {
    runtimeConfig: RUNTIME_CONFIG,
    hooks,
    parser: (data: string) => parseClientMessage(JSON.parse(data) as unknown),
    logger: {
      info: (msg: string, data?: object) => logger.info(msg, data as Record<string, unknown>),
      error: (msg: string, data?: object) => logger.error(msg, data as Record<string, unknown>),
      debug: (msg: string, data?: object) => logger.debug(msg, data as Record<string, unknown>),
    },
    // Use app-specific inactivity settings from game.yaml
    inactivity: {
      enabled: true,
      timeoutMs: INACTIVITY_TIMEOUT_MS,
      checkIntervalMs: INACTIVITY_CHECK_INTERVAL_MS,
    },
  },
  WebSocketServer
);
